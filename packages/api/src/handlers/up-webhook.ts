import { createServiceClient } from '@leftovers/shared';
import { assertUpWebhook, decryptToken } from '@leftovers/sync';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { runConnectionSync } from '../lib/run-sync.js';

interface UpWebhookEvent {
  data: {
    type: 'webhook-events';
    attributes: {
      eventType:
        | 'TRANSACTION_CREATED'
        | 'TRANSACTION_SETTLED'
        | 'TRANSACTION_DELETED'
        | 'PING';
      createdAt: string;
    };
    relationships: {
      webhook: { data: { type: 'webhooks'; id: string } };
      transaction?: { data: { type: 'transactions'; id: string } | null } | null;
    };
  };
}

/**
 * Up webhook receiver. Verifies signature, looks up the connection by webhook id,
 * and enqueues a sync. We do NOT process transactions inline — the webhook only
 * tells us "go fetch the latest", which keeps the receiver fast and idempotent.
 */
export async function handleUpWebhook(req: Request): Promise<Response> {
  const signature = req.headers.get('x-up-authenticity-signature');
  const rawBody = await req.text();
  let payload: UpWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as UpWebhookEvent;
  } catch {
    return errorResponse(400, 'invalid json');
  }

  const supabase = createServiceClient();

  const webhookId = payload.data.relationships.webhook.data.id;
  const { data: conn } = await supabase
    .from('connections')
    .select('id, user_id, source, source_connection_id, webhook_secret_encrypted')
    .eq('source', 'up')
    .eq('source_connection_id', webhookId)
    .single();

  if (!conn || !conn.webhook_secret_encrypted) return errorResponse(404, 'webhook not registered');

  try {
    assertUpWebhook(rawBody, signature, decryptToken(conn.webhook_secret_encrypted));
  } catch (e) {
    captureError(e, { handler: 'up-webhook' });
    return errorResponse(401, 'bad signature');
  }

  if (payload.data.attributes.eventType === 'PING') {
    return jsonResponse({ ok: true, ping: true });
  }

  // Fire-and-forget the sync; webhook receiver returns 200 quickly.
  void (async () => {
    try {
      await runConnectionSync({ userId: conn.user_id, connectionId: conn.id, source: 'up' });
    } catch (e) {
      captureError(e, { handler: 'up-webhook:sync', connectionId: conn.id });
    }
  })();

  return jsonResponse({ ok: true });
}
