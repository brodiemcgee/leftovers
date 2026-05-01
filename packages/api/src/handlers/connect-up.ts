import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createUpClient, encryptToken } from '@leftovers/sync';
import { UpstreamApiError } from '@leftovers/shared';

const ConnectBody = z.object({
  personalAccessToken: z.string().min(20).max(2000),
  webhookUrl: z.string().url().optional(),
});

/**
 * Onboarding step for Up users: paste a personal access token from
 * https://api.up.com.au/getting_started, optionally register a webhook.
 *
 * Flow:
 *   1. Validate the PAT by calling Up's /accounts (fast, 1 round-trip).
 *   2. Encrypt + persist the connection.
 *   3. Return ok. The actual transaction backfill is too large to fit in
 *      Vercel's 60s function ceiling, so it runs out-of-band: iOS POSTs
 *      to /api/sync immediately after connect, and the daily cron tops up.
 */
export async function handleConnectUp(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => ConnectBody.parse(raw));
    const client = createUpClient(body.personalAccessToken);

    // Token check — one fast Up API call so we can return a clear "bad token"
    // error to the user before persisting anything.
    try {
      await client.listAccounts();
    } catch (e) {
      if (e instanceof UpstreamApiError && (e.status === 401 || e.status === 403)) {
        return errorResponse(400, 'That Up token didn\'t work. Double-check it and try again.');
      }
      throw e;
    }

    let webhookId: string | null = null;
    let webhookSecretEncrypted: string | null = null;
    if (body.webhookUrl) {
      const wh = await client.registerWebhook(body.webhookUrl);
      webhookId = wh.id;
      webhookSecretEncrypted = encryptToken(wh.secret);
    }

    const { data: conn, error } = await supabase
      .from('connections')
      .upsert(
        {
          user_id: userId,
          source: 'up',
          source_connection_id: webhookId ?? `up-pat-${userId}`,
          display_name: 'Up Bank',
          access_token_encrypted: encryptToken(body.personalAccessToken),
          webhook_secret_encrypted: webhookSecretEncrypted,
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
    captureError(e, { handler: 'connect-up' });
    return errorResponse(500, 'up connect failed');
  }
}
