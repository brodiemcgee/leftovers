import { createHmac, timingSafeEqual } from 'node:crypto';
import { errorResponse, jsonResponse } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { createServiceClient, normaliseMerchant } from '@leftovers/shared';
import { classifyByRules, type SystemRule, type UserRule } from '@leftovers/categoriser';
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

    // Resend's webhook payload only carries email metadata, not the body —
    // we have to fetch the full email by id to get the html/text content.
    const fullEmail = await fetchResendEmail(data.email_id ?? '');
    if (!fullEmail) return jsonResponse({ ok: true, ignored: 'fetch full email failed' });

    const fromEmail = typeof fullEmail.from === 'object' ? fullEmail.from.email : fullEmail.from;
    const parsed = parseAmexAlert({
      from: fromEmail ?? '',
      subject: fullEmail.subject ?? '',
      html: fullEmail.html ?? '',
      text: fullEmail.text ?? '',
    });
    if (!parsed) return jsonResponse({ ok: true, ignored: 'not parsable as amex' });

    const accountId = await ensureAmexAccount(supabase, userId);

    // Run the new transaction through our rule engine right now so the
    // headroom forecast picks it up immediately. Default to discretionary
    // for unmatched merchants (credit-card spend without a more specific
    // signal is treated as discretionary).
    const merchantNorm = normaliseMerchant(parsed.merchantRaw);
    const classified = await classifyAmexLine(supabase, userId, parsed.merchantRaw, merchantNorm);

    const { error } = await supabase.from('transactions').upsert(
      {
        user_id: userId,
        account_id: accountId,
        source_transaction_id: parsed.syntheticId,
        posted_at: parsed.postedAt,
        amount_cents: -parsed.amountCents, // outflow
        currency: 'AUD',
        merchant_raw: parsed.merchantRaw,
        merchant_normalised: merchantNorm,
        description: 'Amex alert',
        location: null,
        classification: classified.classification,
        category_id: classified.categoryId,
        confidence_score: classified.confidence,
        classified_by: classified.classifiedBy,
        classification_reasoning: classified.reasoning,
        raw_payload: { source: 'resend-inbound', subject: data.subject ?? null },
      },
      { onConflict: 'account_id,source_transaction_id', ignoreDuplicates: false },
    );
    if (error) throw error;

    // Credit-card balance reflects amounts owed: spending pushes balance more
    // negative. We sum all Amex outflows so re-running the same alert (which
    // upserts on syntheticId) doesn't double-count.
    await refreshAmexAccountBalance(supabase, userId, accountId);

    return jsonResponse({ ok: true, syntheticId: parsed.syntheticId, classification: classified.classification });
  } catch (e) {
    captureError(e, { handler: 'email-amex' });
    return errorResponse(500, 'email ingest failed');
  }
}

interface ClassifiedAmex {
  classification: string;
  categoryId: string | null;
  confidence: number;
  classifiedBy: 'rule' | 'system' | 'user';
  reasoning: string | null;
}

/** Apply the same rule engine the sync orchestrator uses, defaulting to
 *  discretionary when no rule matches (credit-card spend with no other
 *  signal is treated as discretionary). */
async function classifyAmexLine(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  merchantRaw: string,
  merchantNorm: string,
): Promise<ClassifiedAmex> {
  const { data: rules } = await supabase
    .from('categorisation_rules')
    .select('user_id, merchant_pattern, pattern_type, classification, priority, category_id, categories(slug)')
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq('is_active', true);
  type Row = { user_id: string | null; merchant_pattern: string; pattern_type: 'substring' | 'regex'; classification: string; priority: number; categories: { slug: string } | null };
  const ruleList: (SystemRule | UserRule)[] = ((rules ?? []) as Row[])
    .filter((r): r is Row & { categories: { slug: string } } => r.categories !== null)
    .map((r) => {
      const base = {
        pattern: r.merchant_pattern,
        patternType: r.pattern_type,
        categorySlug: r.categories.slug as SystemRule['categorySlug'],
        classification: r.classification as SystemRule['classification'],
        priority: r.priority,
      };
      return r.user_id ? { ...base, userId: r.user_id } : base;
    });

  const matched = classifyByRules(
    {
      id: '00000000-0000-0000-0000-000000000000',
      userId,
      merchantRaw,
      merchantNormalised: merchantNorm,
      amountCents: 0,
      accountType: 'credit',
      postedAt: new Date().toISOString(),
    },
    ruleList,
  );

  if (matched) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', matched.categorySlug)
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .maybeSingle();
    return {
      classification: matched.classification,
      categoryId: cat?.id ?? null,
      confidence: matched.confidence,
      classifiedBy: matched.classifiedBy === 'user' ? 'user' : 'rule',
      reasoning: matched.reasoning ?? null,
    };
  }

  // Default for unmatched Amex spend.
  return {
    classification: 'discretionary',
    categoryId: null,
    confidence: 0.5,
    classifiedBy: 'system',
    reasoning: 'Default for Amex email alert with no rule match',
  };
}

/** Recompute the Amex account balance as the sum of every transaction on
 *  it (negative for spend). Idempotent — re-runs converge on the same value. */
async function refreshAmexAccountBalance(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  accountId: string,
): Promise<void> {
  const { data } = await supabase
    .from('transactions')
    .select('amount_cents')
    .eq('user_id', userId)
    .eq('account_id', accountId);
  const total = (data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  await supabase
    .from('accounts')
    .update({ balance_cents: total, balance_updated_at: new Date().toISOString() })
    .eq('id', accountId);
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
      { onConflict: 'user_id,source,source_account_id' },
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
    email_id?: string;
    from?: string | { email: string; name?: string };
    to?: (string | { email: string; name?: string })[];
    subject?: string;
    text?: string;
    html?: string;
  };
}

interface ResendFullEmail {
  from?: string | { email: string; name?: string };
  subject?: string;
  text?: string;
  html?: string;
}

/**
 * Webhook payload only carries metadata (subject, from, to, email_id) — the
 * actual body is on the inbound email object. Fetch by id from Resend's
 * receiving API. (`/emails/receiving/{id}`, distinct from `/emails/{id}`
 * which only exposes outbound.)
 */
async function fetchResendEmail(emailId: string): Promise<ResendFullEmail | null> {
  if (!emailId) return null;
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ResendFullEmail;
  } catch {
    return null;
  }
}
