import { authenticate, errorResponse, jsonResponse, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

/**
 * Categories the user can attach a sub-budget (or a manual classification)
 * to: every system category plus any user-scoped categories they've created.
 * Read-only; categories are seeded server-side.
 */
export async function handleCategoriesList(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { data, error } = await supabase
      .from('categories')
      .select('id, slug, name, default_classification, icon, color, is_system')
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('name');
    if (error) throw error;
    return jsonResponse({ categories: data });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'categories:list' });
    return errorResponse(500, 'failed to list categories');
  }
}
