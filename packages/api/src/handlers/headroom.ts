import { authenticate, errorResponse, jsonResponse, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { applyDynamicAllocation } from './sub-budgets.js';

export async function handleHeadroom(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const url = new URL(req.url);
    const asOfStr = url.searchParams.get('asOf');
    const asOf = asOfStr ? new Date(asOfStr).toISOString() : new Date().toISOString();

    const { data, error } = await supabase
      .rpc('headroom_for_user', { p_user_id: userId, p_as_of: asOf })
      .single();
    if (error) throw error;

    const burn = await supabase.rpc('current_month_burn_rate', { p_user_id: userId }).single();

    // Already-spent discretionary today, in the user's local-day window.
    // Computed from the user's stored timezone (defaults to Australia/Melbourne)
    // via Intl.DateTimeFormat so daylight-saving boundaries are handled
    // correctly — the previous hand-rolled UTC-offset math was off by a day
    // when the local clock had ticked past midnight but UTC hadn't.
    const userPrefs = await supabase
      .from('users')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const userTz = userPrefs.data?.timezone ?? 'Australia/Melbourne';
    const { startUtc: todayStart, endUtc: todayEnd } = localDayBounds(new Date(asOf), userTz);
    const today = await supabase
      .from('transactions')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('classification', 'discretionary')
      .lt('amount_cents', 0)
      .gte('posted_at', todayStart.toISOString())
      .lt('posted_at', todayEnd.toISOString());
    const spentTodayCents = (today.data ?? []).reduce(
      (sum, r) => sum + Math.max(0, -(r.amount_cents ?? 0)),
      0,
    );

    const subBudgets = await supabase
      .from('sub_budget_progress')
      .select(
        'id, name, target_cents, spent_cents, is_catchall, display_order, category_id, percentage, cap_cents, receives_overflow',
      )
      .eq('user_id', userId)
      .order('display_order');
    if (subBudgets.error) throw subBudgets.error;
    // Reuse the same dynamic allocator the /api/sub-budgets list uses so
    // the home-screen card and the management list always agree.
    const discretionaryCents = data.forecast_income_cents - data.forecast_fixed_cents;
    const subBudgetRows = applyDynamicAllocation(
      (subBudgets.data ?? []) as never,
      discretionaryCents,
    );

    const upcoming = await supabase
      .from('fixed_obligations')
      .select('id, name, amount_cents, next_expected_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('next_expected_date', 'is', null)
      .gte('next_expected_date', asOf.slice(0, 10))
      .order('next_expected_date')
      .limit(3);
    if (upcoming.error) throw upcoming.error;

    // Daily envelope: the user's "fair share" of the period's discretionary
    // budget per day, computed once per period (NOT redistributed when they
    // overspend). Lets the Today widget show a per-day bucket the user can
    // empty, with overspend flowing into negative space rather than
    // silently shrinking tomorrow's allowance.
    const periodStartMs = new Date(data.period_start).getTime();
    const periodEndMs = new Date(data.period_end).getTime();
    const totalDays = Math.max(1, Math.round((periodEndMs - periodStartMs) / (24 * 60 * 60 * 1000)));
    const dailyAllowanceCents = Math.floor(
      (data.forecast_income_cents - data.forecast_fixed_cents) / totalDays,
    );

    return jsonResponse({
      asOf,
      headroom: data,
      burnRateCents: burn.data ?? 0,
      spentTodayCents,
      dailyAllowanceCents,
      subBudgets: subBudgetRows,
      upcoming: upcoming.data,
      pace: derivePace(data, burn.data ?? 0),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'headroom' });
    return errorResponse(500, 'headroom failed');
  }
}

/**
 * Returns the UTC-anchored start/end of the calendar day that contains `at`
 * in the given IANA time zone. Handles daylight-saving by querying the zone
 * offset for the candidate moment instead of assuming a fixed +10 hours.
 */
function localDayBounds(at: Date, timeZone: string): { startUtc: Date; endUtc: Date } {
  // Step 1: get the local Y/M/D the moment falls in.
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

  // Step 2: figure out the zone's UTC offset at midnight of that local date.
  // We pick a candidate moment (UTC midnight on dateStr) and ask Intl what
  // local clock it shows — the difference is the offset.
  const candidate = new Date(`${dateStr}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(candidate);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const localAsUtc = Date.UTC(
    Number(lookup['year']),
    Number(lookup['month']) - 1,
    Number(lookup['day']),
    // Intl returns "24" instead of "00" when the moment lands on midnight in
    // some implementations — guard against that by treating 24 as 0.
    Number(lookup['hour']) % 24,
    Number(lookup['minute']),
    Number(lookup['second']),
  );
  const offsetMs = localAsUtc - candidate.getTime();
  const startUtc = new Date(candidate.getTime() - offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

function derivePace(
  headroom: {
    headroom_cents: number;
    days_remaining: number;
    daily_burn_cents: number;
    spent_discretionary_cents: number;
    forecast_income_cents: number;
    forecast_fixed_cents: number;
  },
  burnRateCents: number,
): { state: 'ahead' | 'on_track' | 'behind'; reason: string } {
  // Pace pill (PRD §S1) — informational, never punishing.
  const projected = burnRateCents * headroom.days_remaining;
  if (projected <= headroom.headroom_cents * 0.9) {
    return { state: 'ahead', reason: 'Spending under your daily allowance.' };
  }
  if (projected > headroom.headroom_cents * 1.1) {
    return { state: 'behind', reason: 'On pace to exceed this period — slow down a touch.' };
  }
  return { state: 'on_track', reason: 'Tracking close to your daily allowance.' };
}
