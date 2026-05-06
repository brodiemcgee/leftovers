import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const UpsertBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  targetCents: z.number().int().nonnegative(),
  categorySlug: z.string().optional(),
  displayOrder: z.number().int().default(0),
});

export async function handleSubBudgetsList(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { data, error } = await supabase
      .from('sub_budget_progress')
      .select('id, name, target_cents, spent_cents, is_catchall, display_order')
      .eq('user_id', userId)
      .order('display_order');
    if (error) throw error;
    return jsonResponse({ subBudgets: data });
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

    if (body.id) {
      const { error } = await supabase
        .from('sub_budgets')
        .update({
          name: body.name,
          target_cents: body.targetCents,
          category_id: categoryId,
          display_order: body.displayOrder,
        })
        .eq('id', body.id)
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, id: body.id });
    }

    const { data, error } = await supabase
      .from('sub_budgets')
      .insert({
        user_id: userId,
        name: body.name,
        target_cents: body.targetCents,
        category_id: categoryId,
        display_order: body.displayOrder,
      })
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
