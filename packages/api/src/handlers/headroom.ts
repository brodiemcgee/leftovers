import { authenticate, errorResponse, jsonResponse, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

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

    // Already-spent discretionary today, in the user's local-day window. We
    // approximate Australia/Melbourne for now (matches the SQL functions);
    // a per-user tz lookup would be cleaner once we expose one. The widget's
    // "left today" mode subtracts this from the daily allowance.
    const todayStart = new Date(asOf);
    todayStart.setUTCHours(0, 0, 0, 0);
    // Midnight Melbourne is 14:00 UTC the previous day (AEST UTC+10).
    todayStart.setUTCHours(14);
    todayStart.setUTCDate(todayStart.getUTCDate() - 1);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
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
      .select('id, name, target_cents, spent_cents, is_catchall, display_order')
      .eq('user_id', userId)
      .order('display_order');
    if (subBudgets.error) throw subBudgets.error;

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

    return jsonResponse({
      asOf,
      headroom: data,
      burnRateCents: burn.data ?? 0,
      spentTodayCents,
      subBudgets: subBudgets.data,
      upcoming: upcoming.data,
      pace: derivePace(data, burn.data ?? 0),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'headroom' });
    return errorResponse(500, 'headroom failed');
  }
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
