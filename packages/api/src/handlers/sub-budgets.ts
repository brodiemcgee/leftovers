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
