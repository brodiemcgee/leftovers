import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createBasiqClient } from '@leftovers/sync';
import { env, UpstreamApiError } from '@leftovers/shared';

const StartBody = z.object({}).passthrough();

/**
 * Start the Basiq Open Banking flow. This is the iOS-driven path:
 *   1. Look up (or lazily create) the user's Basiq user record. The Basiq
 *      user is a long-lived record on Basiq's side; we cache its id on
 *      `users.basiq_user_id` so subsequent connects/syncs reuse it.
 *   2. Issue a CLIENT_ACCESS token scoped to that Basiq user.
 *   3. Hand the iOS app the hosted-consent URL. The user opens that in
 *      ASWebAuthenticationSession (or Safari), picks an institution,
 *      enters credentials directly with Basiq, and is redirected back.
 *   4. iOS POSTs /api/connect/basiq/finalise on return, which polls
 *      Basiq's connections endpoint and inserts our local connections rows.
 */
export async function handleConnectBasiqStart(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    await readJsonBody(req, (raw) => StartBody.parse(raw));

    const userRow = await supabase
      .from('users')
      .select('id, email, display_name, basiq_user_id')
      .eq('id', userId)
      .single();
    if (userRow.error) throw userRow.error;

    const basiq = createBasiqClient(env.basiqApiKey);

    let basiqUserId = userRow.data.basiq_user_id;
    if (!basiqUserId) {
      // First-ever Basiq link for this user — create their Basiq user.
      // Basiq requires at least one of email/mobile. We lean on the email
      // we got from Sign in with Apple. If Apple gave us the private relay
      // address that's still fine — Basiq just needs uniqueness.
      const created = await basiq.createUser({
        email: userRow.data.email,
        firstName: userRow.data.display_name ?? null,
      });
      basiqUserId = created;
      const upd = await supabase
        .from('users')
        .update({ basiq_user_id: created })
        .eq('id', userId);
      if (upd.error) throw upd.error;
    }

    const { url, token } = await basiq.buildConsentUrl(basiqUserId);
    return jsonResponse({ url, sessionId: token, basiqUserId });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    if (e instanceof UpstreamApiError && e.status === 422) {
      return errorResponse(400, 'Basiq rejected your account details. Try again.');
    }
    captureError(e, { handler: 'connect-basiq:start' });
    return errorResponse(500, 'basiq start failed');
  }
}

const FinaliseBody = z.object({
  // Optional — defaults to walking all connections on the Basiq user.
  basiqConnectionId: z.string().min(1).max(120).optional(),
});

/**
 * iOS calls this once the user finishes the hosted consent and returns to
 * the app. We poll Basiq's /users/{id}/connections, upsert each as a
 * `connections` row, and kick off a sync for the new ones.
 */
export async function handleConnectBasiqFinalise(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    await readJsonBody(req, (raw) => FinaliseBody.parse(raw));

    const userRow = await supabase
      .from('users')
      .select('basiq_user_id')
      .eq('id', userId)
      .single();
    if (userRow.error) throw userRow.error;
    const basiqUserId = userRow.data.basiq_user_id;
    if (!basiqUserId) {
      return errorResponse(400, 'Start the Basiq flow first.');
    }

    const basiq = createBasiqClient(env.basiqApiKey);
    const connections = await basiq.listConnections(basiqUserId);

    const inserted: { connectionId: string; institution: string }[] = [];
    for (const c of connections) {
      const { data: row, error } = await supabase
        .from('connections')
        .upsert(
          {
            user_id: userId,
            source: 'basiq',
            source_connection_id: c.id,
            display_name: c.institutionName,
            status: c.status === 'active' ? 'active' : c.status,
          },
          { onConflict: 'user_id,source,source_connection_id' },
        )
        .select('id')
        .single();
      if (error) throw error;
      inserted.push({ connectionId: row.id, institution: c.institutionName });
    }

    return jsonResponse({ ok: true, connections: inserted });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'connect-basiq:finalise' });
    return errorResponse(500, 'basiq finalise failed');
  }
}
