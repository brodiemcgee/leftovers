/**
 * Onboarding helpers — auto-detection of pay cadence and recurring fixed bills
 * from 90 days of synced transaction history (PRD §F2 + §F3, Sprint 4 steps 21–22).
 *
 * Both endpoints return *suggestions only* — they never persist without the
 * user explicitly confirming via the corresponding settings endpoints.
 */

import { authenticate, errorResponse, jsonResponse, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';
import { merchantSimilarity } from '@leftovers/shared';

interface PayCandidate {
  payerName: string;
  cadence: 'weekly' | 'fortnightly' | 'monthly' | 'four_weekly' | 'irregular';
  anchorDate: string;
  amountEstimateCents: number;
  amountVarianceCents: number;
  occurrences: number;
  confidence: number;
}

export async function handleDetectPay(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);

    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('transactions')
      .select('amount_cents, posted_at, merchant_normalised, merchant_raw')
      .eq('user_id', userId)
      .gte('posted_at', since)
      .gt('amount_cents', 100_000) // > $1000 inbound only
      .order('posted_at', { ascending: true });
    if (error) throw error;

    type Group = { merchant: string; rows: typeof data };
    const groups: Group[] = [];
    for (const row of data) {
      const m = row.merchant_normalised ?? '';
      const existing = groups.find((g) => merchantSimilarity(g.merchant, m) >= 0.6);
      if (existing) existing.rows.push(row);
      else groups.push({ merchant: m, rows: [row] });
    }

    const candidates: PayCandidate[] = [];
    for (const g of groups) {
      if (g.rows.length < 2) continue;
      const sorted = g.rows.sort((a, b) => Date.parse(a.posted_at) - Date.parse(b.posted_at));
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const a = Date.parse(sorted[i - 1]!.posted_at);
        const b = Date.parse(sorted[i]!.posted_at);
        gaps.push(Math.round((b - a) / 86_400_000));
      }
      const meanGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
      const cadence = classifyGap(meanGap);
      const variance = gaps.reduce((s, x) => s + Math.abs(x - meanGap), 0) / gaps.length;
      const amounts = sorted.map((r) => r.amount_cents);
      const meanAmount = Math.round(amounts.reduce((s, x) => s + x, 0) / amounts.length);
      const amtVar = Math.round(
        amounts.reduce((s, x) => s + Math.abs(x - meanAmount), 0) / amounts.length,
      );
      const confidence = Math.max(0, 1 - variance / Math.max(meanGap, 1));
      const anchorRow = sorted[sorted.length - 1]!;
      candidates.push({
        payerName: anchorRow.merchant_raw ?? g.merchant,
        cadence,
        anchorDate: anchorRow.posted_at.slice(0, 10),
        amountEstimateCents: meanAmount,
        amountVarianceCents: amtVar,
        occurrences: sorted.length,
        confidence,
      });
    }

    candidates.sort((a, b) => b.amountEstimateCents - a.amountEstimateCents);
    return jsonResponse({ candidates });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'detect-pay' });
    return errorResponse(500, 'detect pay failed');
  }
}

interface FixedCandidate {
  merchantRaw: string;
  merchantNormalised: string;
  amountCents: number;
  cadence: 'weekly' | 'fortnightly' | 'monthly' | 'four_weekly' | 'irregular';
  expectedDayOfMonth: number | null;
  occurrences: number;
  isLikelyMortgageOrRent: boolean;
}

export async function handleDetectFixedObligations(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('transactions')
      .select('amount_cents, posted_at, merchant_normalised, merchant_raw, classification, categories(slug)')
      .eq('user_id', userId)
      .lt('amount_cents', 0)
      .gte('posted_at', since);
    if (error) throw error;

    type Row = (typeof data)[number];
    const groups = new Map<string, Row[]>();
    for (const r of data) {
      const m = r.merchant_normalised ?? '';
      if (m.length === 0) continue;
      const arr = groups.get(m) ?? [];
      arr.push(r);
      groups.set(m, arr);
    }

    const candidates: FixedCandidate[] = [];
    for (const [merchant, rows] of groups) {
      if (rows.length < 2) continue;
      const sorted = rows.sort((a, b) => Date.parse(a.posted_at) - Date.parse(b.posted_at));
      const amounts = sorted.map((r) => Math.abs(r.amount_cents));
      const minA = Math.min(...amounts);
      const maxA = Math.max(...amounts);
      if (minA === 0 || maxA / minA > 1.05) continue;

      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const a = Date.parse(sorted[i - 1]!.posted_at);
        const b = Date.parse(sorted[i]!.posted_at);
        gaps.push(Math.round((b - a) / 86_400_000));
      }
      const meanGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
      const cadence = classifyGap(meanGap);
      if (cadence === 'irregular') continue;
      const day = sorted[sorted.length - 1]!.posted_at
        ? new Date(sorted[sorted.length - 1]!.posted_at).getUTCDate()
        : null;

      const slugRow = (sorted[0] as Row & { categories: { slug: string } | null }).categories;
      const isMortgageOrRent =
        slugRow?.slug === 'mortgage' ||
        slugRow?.slug === 'rent' ||
        /MORTGAGE|HOME LOAN|RENT/i.test(merchant);

      candidates.push({
        merchantRaw: sorted[0]!.merchant_raw ?? merchant,
        merchantNormalised: merchant,
        amountCents: Math.round(amounts.reduce((s, x) => s + x, 0) / amounts.length),
        cadence,
        expectedDayOfMonth: day,
        occurrences: sorted.length,
        isLikelyMortgageOrRent: isMortgageOrRent,
      });
    }

    candidates.sort((a, b) => b.amountCents - a.amountCents);
    return jsonResponse({ candidates });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'detect-fixed' });
    return errorResponse(500, 'detect fixed failed');
  }
}

function classifyGap(meanGap: number): PayCandidate['cadence'] {
  if (Math.abs(meanGap - 7) <= 2) return 'weekly';
  if (Math.abs(meanGap - 14) <= 3) return 'fortnightly';
  if (Math.abs(meanGap - 28) <= 3) return 'four_weekly';
  if (Math.abs(meanGap - 30) <= 4 || Math.abs(meanGap - 31) <= 4) return 'monthly';
  return 'irregular';
}
