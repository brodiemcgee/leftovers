import { createServiceClient, env } from '@leftovers/shared';
import { assertBasiqWebhook } from '@leftovers/sync';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { runConnectionSync } from '../lib/run-sync.js';

interface BasiqWebhookEvent {
  type: string;
  data: { userId?: string; connectionId?: string };
}

export async function handleBasiqWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const sig = req.headers.get('x-basiq-signature');
  try {
    assertBasiqWebhook(rawBody, sig, env.basiqWebhookSecret);
  } catch (e) {
    captureError(e, { handler: 'basiq-webhook' });
    return errorResponse(401, 'bad signature');
  }

  let payload: BasiqWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as BasiqWebhookEvent;
  } catch {
    return errorResponse(400, 'invalid json');
  }

  const supabase = createServiceClient();
  const basiqUserId = payload.data.userId;
  if (!basiqUserId) return jsonResponse({ ok: true, ignored: true });

  const { data: conn } = await supabase
    .from('connections')
    .select('id, user_id, source')
    .eq('source', 'basiq')
    .eq('source_connection_id', basiqUserId)
    .single();
  if (!conn) return jsonResponse({ ok: true, ignored: true });

  void (async () => {
    try {
      await runConnectionSync({ userId: conn.user_id, connectionId: conn.id, source: 'basiq' });
    } catch (e) {
      captureError(e, { handler: 'basiq-webhook:sync', connectionId: conn.id });
    }
  })();
  return jsonResponse({ ok: true });
}
