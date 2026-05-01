/**
 * Layer-4 user feedback rule store. Lives separately from /transactions/:id
 * because users sometimes want to manage their personal merchant rules in
 * Settings without going through a single transaction.
 */
import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const Body = z.object({
  merchantPattern: z.string().min(2).max(120),
  patternType: z.enum(['substring', 'regex']).default('substring'),
  categorySlug: z.string(),
  classification: z.enum(['fixed', 'discretionary', 'internal', 'income', 'refund']),
});

export async function handleUserRuleUpsert(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => Body.parse(raw));

    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', body.categorySlug)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .maybeSingle();
    if (!cat) return errorResponse(400, `Unknown category: ${body.categorySlug}`);

    const { data, error } = await supabase
      .from('categorisation_rules')
      .insert({
        user_id: userId,
        merchant_pattern: body.merchantPattern,
        pattern_type: body.patternType,
        category_id: cat.id,
        classification: body.classification,
        source: 'user_correction',
        priority: 200,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    return jsonResponse({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'user-rule:upsert' });
    return errorResponse(500, 'rule upsert failed');
  }
}

export async function handleUserRuleDelete(req: Request, id: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { error } = await supabase
      .from('categorisation_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'user-rule:delete', id });
    return errorResponse(500, 'rule delete failed');
  }
}
