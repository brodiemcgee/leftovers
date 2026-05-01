import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

/**
 * Refund pairing (PRD §F6) — runs on demand from the iOS app's "review refund"
 * surface, plus inline as part of sync. Suggests the most likely original charge
 * for a recent inbound transaction.
 *
 * Confidence threshold to surface: 0.7. Action surfaced is informational —
 * the app does not move money (PRD §regulatory).
 */

const SuggestQuery = z.object({
  refundTransactionId: z.string().uuid(),
});

interface Suggestion {
  candidateId: string;
  amountCents: number;
  postedAt: string;
  merchantNormalised: string | null;
  similarity: number;
  confidence: number;
  rationale: string;
}

export async function handleRefundSuggest(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const url = new URL(req.url);
    const q = SuggestQuery.parse({ refundTransactionId: url.searchParams.get('id') ?? '' });

    const { data: refund, error } = await supabase
      .from('transactions')
      .select('id, amount_cents, posted_at, merchant_normalised, classification')
      .eq('id', q.refundTransactionId)
      .eq('user_id', userId)
      .single();
    if (error || !refund) throw error ?? new Error('not found');
    if (refund.amount_cents <= 0) return jsonResponse({ suggestions: [] });

    // Look back 60 days for outbound charges within ±$50 of the refund and merchant overlap
    const since = new Date(Date.parse(refund.posted_at) - 60 * 86_400_000).toISOString();
    const { data: candidates, error: candErr } = await supabase
      .from('transactions')
      .select('id, amount_cents, posted_at, merchant_normalised')
      .eq('user_id', userId)
      .lt('amount_cents', 0)
      .gt('amount_cents', -(refund.amount_cents + 5000))
      .lt('amount_cents', -(refund.amount_cents - 5000))
      .gte('posted_at', since)
      .lt('posted_at', refund.posted_at)
      .order('posted_at', { ascending: false })
      .limit(20);
    if (candErr) throw candErr;

    const refundMerchant = (refund.merchant_normalised ?? '').toUpperCase();
    const suggestions: Suggestion[] = candidates
      .map((c) => scoreCandidate(refund.amount_cents, refundMerchant, c))
      .filter((s) => s.confidence >= 0.7)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    return jsonResponse({ refund, suggestions });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'refund:suggest' });
    return errorResponse(500, 'refund suggest failed');
  }
}

function scoreCandidate(
  refundCents: number,
  refundMerchant: string,
  c: { id: string; amount_cents: number; posted_at: string; merchant_normalised: string | null },
): Suggestion {
  const charge = -c.amount_cents; // make positive for comparison
  const amountDelta = Math.abs(charge - refundCents);
  const amountScore = Math.max(0, 1 - amountDelta / Math.max(refundCents, 1));
  const m = (c.merchant_normalised ?? '').toUpperCase();
  let merchantScore = 0;
  if (refundMerchant.length > 0 && m.length > 0) {
    if (m.includes(refundMerchant) || refundMerchant.includes(m)) merchantScore = 1;
    else {
      const refundTokens = new Set(refundMerchant.split(/\s+/).filter((w) => w.length >= 3));
      const cTokens = new Set(m.split(/\s+/).filter((w) => w.length >= 3));
      let inter = 0;
      for (const t of refundTokens) if (cTokens.has(t)) inter += 1;
      merchantScore = inter / Math.max(refundTokens.size, 1);
    }
  }
  const confidence = amountScore * 0.6 + merchantScore * 0.4;
  return {
    candidateId: c.id,
    amountCents: c.amount_cents,
    postedAt: c.posted_at,
    merchantNormalised: c.merchant_normalised,
    similarity: merchantScore,
    confidence,
    rationale:
      amountDelta === 0
        ? 'Exact amount match on a recent outbound charge.'
        : `Amount within $${(amountDelta / 100).toFixed(2)} of the refund.`,
  };
}

const PairBody = z.object({
  refundTransactionId: z.string().uuid(),
  originalTransactionId: z.string().uuid(),
});

export async function handleRefundPair(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => PairBody.parse(raw));

    const { error: e1 } = await supabase
      .from('transactions')
      .update({ paired_transaction_id: body.originalTransactionId, classification: 'refund' })
      .eq('id', body.refundTransactionId)
      .eq('user_id', userId);
    if (e1) throw e1;

    const { error: e2 } = await supabase
      .from('transactions')
      .update({ paired_transaction_id: body.refundTransactionId })
      .eq('id', body.originalTransactionId)
      .eq('user_id', userId);
    if (e2) throw e2;

    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'refund:pair' });
    return errorResponse(500, 'refund pair failed');
  }
}
