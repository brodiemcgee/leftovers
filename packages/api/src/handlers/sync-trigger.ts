import { authenticate, errorResponse, jsonResponse, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { runConnectionSync } from '../lib/run-sync.js';

/**
 * User-triggered manual sync ("pull to refresh" from iOS).
 * Spawns sync for every active connection on the user.
 */
export async function handleSyncTrigger(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { data, error } = await supabase
      .from('connections')
      .select('id, source')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw error;
    const results = await Promise.all(
      data.map((c) => runConnectionSync({ userId, connectionId: c.id, source: c.source })),
    );
    return jsonResponse({ ok: true, results });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'sync-trigger' });
    return errorResponse(500, 'sync failed');
  }
}
