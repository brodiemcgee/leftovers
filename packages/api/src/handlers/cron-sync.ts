import { createServiceClient, env } from '@leftovers/shared';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { runConnectionSync } from '../lib/run-sync.js';

/**
 * Vercel Cron handler — fires every 6h (configured in vercel.json).
 * Authenticated via the `x-vercel-cron` header that Vercel attaches; we also
 * accept a CRON_SECRET fallback for local invocation.
 */
export async function handleCronSync(req: Request): Promise<Response> {
  const cronHeader = req.headers.get('x-vercel-cron');
  const auth = req.headers.get('authorization');
  const expectedSecret = process.env['CRON_SECRET'];
  if (!cronHeader && !(expectedSecret && auth === `Bearer ${expectedSecret}`)) {
    return errorResponse(401, 'cron auth required');
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('connections')
      .select('id, user_id, source')
      .eq('status', 'active');
    if (error) throw error;

    const results = [];
    for (const c of data) {
      try {
        const r = await runConnectionSync({ userId: c.user_id, connectionId: c.id, source: c.source });
        results.push({ status: 'ok', ...r });
      } catch (e) {
        captureError(e, { connectionId: c.id });
        results.push({
          connectionId: c.id,
          status: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return jsonResponse({ ok: true, ranAt: new Date().toISOString(), results, env: env.supabaseUrl ? 'configured' : 'unconfigured' });
  } catch (e) {
    captureError(e, { handler: 'cron-sync' });
    return errorResponse(500, 'cron failed');
  }
}
