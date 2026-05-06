import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const UpsertBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  targetCents: z.number().int().nonnegative(),
  categorySlug: z.string().optional(),
  displayOrder: z.number().int().default(0),
  /** % of headroom to allocate. Mutually exclusive with a fixed target. */
  percentage: z.number().min(0).max(100).optional(),
  /** Maximum the envelope can reach regardless of percentage. */
  capCents: z.number().int().nonnegative().optional(),
  /** Receive overflow from capped envelopes proportional to percentage. */
  receivesOverflow: z.boolean().default(false),
});

interface SubBudgetRow {
  id: string;
  name: string;
  target_cents: number;
  spent_cents: number;
  is_catchall: boolean;
  display_order: number | null;
  category_id: string | null;
  percentage: number | null;
  cap_cents: number | null;
  receives_overflow: boolean | null;
}

/**
 * Compute the live target for each envelope given the current month's
 * discretionary headroom (income − fixed). For percentage envelopes the
 * target = min(headroom × pct, cap). Surplus from capped envelopes flows
 * proportionally into envelopes flagged receives_overflow. The catch-all
 * picks up whatever's left so the total always sums to headroom exactly.
 */
export function applyDynamicAllocation(
  rows: SubBudgetRow[],
  headroomDiscretionaryCents: number,
): SubBudgetRow[] {
  const out = rows.map((r) => ({ ...r }));
  const nonCatchall = out.filter((r) => !r.is_catchall);

  // Step 1: each envelope's pre-overflow allocation.
  let surplusCents = 0;
  const cappedTargets = new Map<string, number>();
  for (const r of nonCatchall) {
    if (r.percentage != null) {
      const raw = Math.round(headroomDiscretionaryCents * (r.percentage / 100));
      const capped = r.cap_cents != null ? Math.min(raw, r.cap_cents) : raw;
      cappedTargets.set(r.id, Math.max(0, capped));
      const overflowed = r.cap_cents != null ? Math.max(0, raw - r.cap_cents) : 0;
      surplusCents += overflowed;
    } else {
      cappedTargets.set(r.id, r.target_cents);
    }
  }

  // Step 2: distribute surplus proportional to percentage among recipients.
  const recipients = nonCatchall.filter((r) => r.receives_overflow);
  const totalRecipientPct = recipients.reduce(
    (s, r) => s + (r.percentage ?? 0),
    0,
  );
  if (surplusCents > 0 && totalRecipientPct > 0) {
    let remaining = surplusCents;
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]!;
      const isLast = i === recipients.length - 1;
      const share = isLast
        ? remaining
        : Math.round(surplusCents * ((r.percentage ?? 0) / totalRecipientPct));
      const current = cappedTargets.get(r.id) ?? 0;
      cappedTargets.set(r.id, current + share);
      remaining -= share;
    }
  }

  // Step 3: catch-all soaks up the rest.
  const allocatedNonCatchall = nonCatchall.reduce(
    (s, r) => s + (cappedTargets.get(r.id) ?? 0),
    0,
  );
  const catchallTarget = Math.max(0, headroomDiscretionaryCents - allocatedNonCatchall);

  // Apply.
  for (const r of out) {
    if (r.is_catchall) {
      r.target_cents = catchallTarget;
    } else {
      r.target_cents = cappedTargets.get(r.id) ?? r.target_cents;
    }
  }
  return out;
}

export async function handleSubBudgetsList(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { data, error } = await supabase
      .from('sub_budget_progress')
      .select(
        'id, name, target_cents, spent_cents, is_catchall, display_order, category_id, percentage, cap_cents, receives_overflow',
      )
      .eq('user_id', userId)
      .order('display_order');
    if (error) throw error;

    // Compute today's discretionary headroom (income − fixed obligations,
    // ignoring spent-so-far) so envelopes that scale with headroom adjust
    // dynamically. Falls back to the static target_cents if the RPC fails.
    const headroom = await supabase
      .rpc('headroom_for_user', { p_user_id: userId })
      .single();
    type HRow = { forecast_income_cents: number; forecast_fixed_cents: number };
    const hr = (headroom.data as HRow | null);
    const discretionaryCents = hr ? hr.forecast_income_cents - hr.forecast_fixed_cents : 0;
    const computed = applyDynamicAllocation((data ?? []) as SubBudgetRow[], discretionaryCents);

    // Annotate per-envelope today metrics — see headroom.ts for the
    // amortisation logic. Re-implementing here lightly so this endpoint
    // stays self-contained.
    const period = await supabase
      .rpc('forecast_period_for_user', { p_user_id: userId })
      .single() as { data: { period_start: string; period_end: string } | null };
    const totalDays = period.data
      ? Math.max(
          1,
          Math.round(
            (new Date(period.data.period_end).getTime() -
              new Date(period.data.period_start).getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 30;

    type WithToday = (typeof computed)[number] & {
      target_today_cents: number;
      spent_today_cents: number;
    };
    const annotated: WithToday[] = computed.map((b) => ({
      ...b,
      target_today_cents: Math.floor(b.target_cents / totalDays),
      // Per-envelope spent_today not computed in this endpoint to keep it
      // light — the home page uses /api/headroom which has it. Surface 0
      // here; iOS treats absent as zero on the management list.
      spent_today_cents: 0,
    }));

    return jsonResponse({ subBudgets: annotated });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'sub-budgets:list' });
    return errorResponse(500, 'failed to list sub-budgets');
  }
}

export async function handleSubBudgetsUpsert(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => UpsertBody.parse(raw));

    let categoryId: string | null = null;
    if (body.categorySlug) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', body.categorySlug)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .maybeSingle();
      if (!cat) return errorResponse(400, `Unknown category: ${body.categorySlug}`);
      categoryId = cat.id;
    }

    const baseRow = {
      name: body.name,
      target_cents: body.targetCents,
      category_id: categoryId,
      display_order: body.displayOrder,
      percentage: body.percentage ?? null,
      cap_cents: body.capCents ?? null,
      receives_overflow: body.receivesOverflow,
    };

    if (body.id) {
      const { error } = await supabase
        .from('sub_budgets')
        .update(baseRow)
        .eq('id', body.id)
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, id: body.id });
    }

    const { data, error } = await supabase
      .from('sub_budgets')
      .insert({ user_id: userId, ...baseRow })
      .select('id')
      .single();
    if (error) throw error;
    return jsonResponse({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'sub-budgets:upsert' });
    return errorResponse(500, 'failed to upsert sub-budget');
  }
}

/**
 * List transactions that count toward a single sub-budget envelope, scoped
 * to the current month period. For an envelope tied to a category we filter
 * by that category. For the catch-all envelope we return transactions that
 * are NOT covered by any other envelope's category — same logic the
 * sub_budget_progress view uses to compute spent_cents.
 */
export async function handleSubBudgetTransactions(req: Request, subBudgetId: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);

    const { data: budget, error: bErr } = await supabase
      .from('sub_budgets')
      .select('id, name, category_id, is_catchall')
      .eq('id', subBudgetId)
      .eq('user_id', userId)
      .single();
    if (bErr || !budget) return errorResponse(404, 'sub-budget not found');

    // Period bounds — match the SQL view: calendar month in the user's tz.
    const period = await supabase
      .rpc('forecast_period_for_user', { p_user_id: userId })
      .single() as { data: { period_start: string; period_end: string } | null; error: unknown };
    if (!period.data) return errorResponse(500, 'period lookup failed');

    let query = supabase
      .from('transactions')
      .select(
        'id, posted_at, amount_cents, currency, merchant_raw, merchant_normalised, description, classification, category_id, classified_by, accounts(display_name, account_type), categories(slug, name)',
      )
      .eq('user_id', userId)
      .eq('classification', 'discretionary')
      .gte('posted_at', period.data.period_start)
      .lt('posted_at', period.data.period_end)
      .order('posted_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (budget.is_catchall) {
      // Catch-all: anything NOT in another envelope's category.
      const { data: covered } = await supabase
        .from('sub_budgets')
        .select('category_id')
        .eq('user_id', userId)
        .eq('is_catchall', false)
        .not('category_id', 'is', null);
      const coveredIds = (covered ?? []).map((r) => r.category_id).filter((v): v is string => !!v);
      if (coveredIds.length > 0) {
        // Postgrest "not in" — pass values comma-joined.
        query = query.not('category_id', 'in', `(${coveredIds.map((id) => `"${id}"`).join(',')})`);
      }
    } else if (budget.category_id) {
      query = query.eq('category_id', budget.category_id);
    } else {
      // No category — empty list.
      return jsonResponse({ subBudget: budget, transactions: [] });
    }

    const { data: tx, error: tErr } = await query;
    if (tErr) throw tErr;
    return jsonResponse({ subBudget: budget, transactions: tx });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'sub-budgets:transactions', subBudgetId });
    return errorResponse(500, 'failed to list sub-budget transactions');
  }
}

export async function handleSubBudgetDelete(req: Request, id: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { error } = await supabase
      .from('sub_budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_catchall', false);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'sub-budgets:delete', id });
    return errorResponse(500, 'failed to delete sub-budget');
  }
}
