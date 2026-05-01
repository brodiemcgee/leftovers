import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createBasiqClient } from '@leftovers/sync';
import { env } from '@leftovers/shared';

const StartBody = z.object({
  basiqUserId: z.string().min(1).max(120),
});

/**
 * Returns Basiq's hosted consent URL. The iOS app opens this in an in-app
 * Safari view; on success the user returns and we register the connection
 * via /connect/basiq/finalise (below).
 */
export async function handleConnectBasiqStart(req: Request): Promise<Response> {
  try {
    const { userId } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => StartBody.parse(raw));
    const basiq = createBasiqClient(env.basiqApiKey);
    const session = await basiq.createConsentSession(body.basiqUserId);
    return jsonResponse({ url: session.url, sessionId: session.sessionId, userIdEcho: userId });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'connect-basiq:start' });
    return errorResponse(500, 'basiq start failed');
  }
}

const FinaliseBody = z.object({
  basiqUserId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
});

export async function handleConnectBasiqFinalise(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => FinaliseBody.parse(raw));

    const { data: conn, error } = await supabase
      .from('connections')
      .upsert(
        {
          user_id: userId,
          source: 'basiq',
          source_connection_id: body.basiqUserId,
          display_name: body.displayName,
          status: 'active',
        },
        { onConflict: 'user_id,source,source_connection_id' },
      )
      .select('id')
      .single();
    if (error) throw error;
    return jsonResponse({ ok: true, connectionId: conn.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'connect-basiq:finalise' });
    return errorResponse(500, 'basiq finalise failed');
  }
}
