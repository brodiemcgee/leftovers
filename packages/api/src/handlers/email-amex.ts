import { createHmac, timingSafeEqual } from 'node:crypto';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createServiceClient } from '@leftovers/shared';
import { parseAmexAlert } from '../lib/amex-email.js';

/**
 * Resend Inbound webhook receiver. Resend posts a Svix-signed JSON payload
 * for each inbound email to a configured address. We:
 *
 *   1. Verify the Svix signature against RESEND_WEBHOOK_SECRET.
 *   2. Extract the local-part alias from the recipient address
 *      (amex+<alias>@digitalattitudes.com.au) so we know which user this
 *      mail belongs to.
 *   3. Run the Amex AU email through our parser. If it isn't an Amex alert
 *      (or doesn't parse cleanly), respond 200 — silently dropping unknown
 *      mail is better than crashing the inbound queue.
 *   4. Look up or lazily create a synthetic Amex `accounts` row owned by
 *      that user, plus a `connections` stub so the row has the right FK.
 *   5. Upsert the parsed transaction.
 *
 * The endpoint always returns 200 once the signature passes, so Resend
 * doesn't keep retrying for legitimate non-Amex mail.
 */
export async function handleEmailAmexWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();

  if (!verifySvixSignature(req, rawBody)) {
    return errorResponse(401, 'invalid signature');
  }

  let event: ResendInboundEvent;
  try {
    event = JSON.parse(rawBody) as ResendInboundEvent;
  } catch {
    return errorResponse(400, 'bad json');
  }

  if (event.type !== 'email.received' && event.type !== 'email.inbound.received') {
    return jsonResponse({ ok: true, ignored: `non-inbound event: ${event.type}` });
  }

  const data = event.data;
  if (!data) return jsonResponse({ ok: true, ignored: 'no data' });

  // Find which alias this mail was sent to. Resend may include multiple
  // recipients; we pick the first one matching our amex+<alias>@ pattern.
  const recipients = (data.to ?? []).map((r) => (typeof r === 'string' ? r : r.email));
  let alias: string | null = null;
  for (const to of recipients) {
    const m = to.toLowerCase().match(/^amex\+([a-z0-9]+)@/);
    if (m && m[1]) {
      alias = m[1];
      break;
    }
  }
  if (!alias) return jsonResponse({ ok: true, ignored: 'no alias matched' });

  try {
    const supabase = createServiceClient();
    const userRes = await supabase
      .from('users')
      .select('id')
      .eq('email_alias', alias)
      .maybeSingle();
    if (!userRes.data) return jsonResponse({ ok: true, ignored: 'unknown alias' });
    const userId = userRes.data.id;

    const fromEmail = typeof data.from === 'object' ? data.from.email : data.from;
    const parsed = parseAmexAlert({
      from: fromEmail ?? '',
      subject: data.subject ?? '',
      html: data.html ?? '',
      text: data.text ?? '',
    });
    if (!parsed) return jsonResponse({ ok: true, ignored: 'not parsable as amex' });

    const accountId = await ensureAmexAccount(supabase, userId);

    const { error } = await supabase.from('transactions').upsert(
      {
        user_id: userId,
        account_id: accountId,
        source_transaction_id: parsed.syntheticId,
        posted_at: parsed.postedAt,
        amount_cents: -parsed.amountCents, // outflow
        currency: 'AUD',
        merchant_raw: parsed.merchantRaw,
        merchant_normalised: null,
        description: 'Amex alert',
        location: null,
        raw_payload: { source: 'resend-inbound', subject: data.subject ?? null },
      },
      { onConflict: 'account_id,source_transaction_id', ignoreDuplicates: false },
    );
    if (error) throw error;
    return jsonResponse({ ok: true, syntheticId: parsed.syntheticId });
  } catch (e) {
    captureError(e, { handler: 'email-amex' });
    return errorResponse(500, 'email ingest failed');
  }
}

async function ensureAmexAccount(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string> {
  // Find or create the synthetic connection (so `connections.id` exists for FK).
  const conn = await supabase
    .from('connections')
    .upsert(
      {
        user_id: userId,
        source: 'basiq', // closest enum value; we fake source_connection_id so it doesn't collide
        source_connection_id: 'email-amex',
        display_name: 'Amex (email alerts)',
        status: 'active',
      },
      { onConflict: 'user_id,source,source_connection_id' },
    )
    .select('id')
    .single();
  if (conn.error) throw conn.error;
  const connectionId = conn.data.id;

  const acc = await supabase
    .from('accounts')
    .upsert(
      {
        user_id: userId,
        connection_id: connectionId,
        source: 'basiq',
        source_account_id: 'email-amex-card',
        display_name: 'American Express',
        account_type: 'credit',
        currency: 'AUD',
        balance_cents: 0,
        is_active: true,
      },
      { onConflict: 'source,source_account_id' },
    )
    .select('id')
    .single();
  if (acc.error) throw acc.error;
  return acc.data.id;
}

function verifySvixSignature(req: Request, rawBody: string): boolean {
  // Resend uses Svix-style webhook signing. Headers:
  //   svix-id, svix-timestamp, svix-signature
  // (or webhook-id/webhook-timestamp/webhook-signature in newer SDKs)
  const id = req.headers.get('svix-id') ?? req.headers.get('webhook-id');
  const ts = req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp');
  const sig = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature');
  const secret = process.env['RESEND_WEBHOOK_SECRET'];
  if (!secret) {
    // Operator hasn't configured a secret yet. Reject all so we don't ingest
    // unauthenticated mail.
    return false;
  }
  if (!id || !ts || !sig) return false;
  // Reject anything older than 5 minutes to limit replay window.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedPayload = `${id}.${ts}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedPayload).digest('base64');

  // Header looks like "v1,abc... v1,def..." — any version with a matching
  // signature passes.
  for (const part of sig.split(' ')) {
    const [, value] = part.split(',', 2);
    if (!value) continue;
    if (timingSafeEqualString(value, expected)) return true;
  }
  return false;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface ResendInboundEvent {
  type: string;
  data?: {
    from?: string | { email: string; name?: string };
    to?: (string | { email: string; name?: string })[];
    subject?: string;
    text?: string;
    html?: string;
  };
}
