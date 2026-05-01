import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createUpClient, encryptToken } from '@leftovers/sync';
import { runConnectionSync } from '../lib/run-sync.js';

const ConnectBody = z.object({
  personalAccessToken: z.string().min(20).max(2000),
  webhookUrl: z.string().url().optional(),
});

/**
 * Onboarding step for Up users: paste a personal access token from
 * https://api.up.com.au/getting_started, optionally register a webhook.
 * The PAT is encrypted at rest in `connections.access_token_encrypted`.
 */
export async function handleConnectUp(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => ConnectBody.parse(raw));
    const client = createUpClient(body.personalAccessToken);

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

    const result = await runConnectionSync({ userId, connectionId: conn.id, source: 'up' });
    return jsonResponse({ ok: true, connectionId: conn.id, firstSync: result });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'connect-up' });
    return errorResponse(500, 'up connect failed');
  }
}
