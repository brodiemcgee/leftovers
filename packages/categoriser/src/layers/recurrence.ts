import { merchantSimilarity } from '@leftovers/shared';
import type { ClassificationOutput, RecurringGroupCandidate, TransactionInput } from '../types.js';

export interface PriorTransaction {
  merchantNormalised: string | null;
  amountCents: number;
  postedAt: string;
}

const ACCEPTED_CADENCES_DAYS = [7, 14, 28, 30] as const;

/**
 * Layer 2 — recurrence detection.
 * Looks at the user's prior transactions for the same merchant. If the cluster
 * shows a stable cadence and amount, classify as fixed (recurring).
 */
export function classifyByRecurrence(
  tx: TransactionInput,
  priorByMerchant: readonly PriorTransaction[],
): { result: ClassificationOutput | null; group: RecurringGroupCandidate | null } {
  if (!tx.merchantNormalised) return { result: null, group: null };

  const cluster = priorByMerchant
    .filter((p) => p.merchantNormalised && merchantSimilarity(p.merchantNormalised, tx.merchantNormalised!) >= 0.6)
    .sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));

  if (cluster.length < 2) return { result: null, group: null };

  // Check amount stability (within ±5%)
  const amounts = cluster.map((c) => Math.abs(c.amountCents));
  const minA = Math.min(...amounts);
  const maxA = Math.max(...amounts);
  if (minA === 0 || maxA / minA > 1.05) return { result: null, group: null };

  // Compute pairwise gaps
  const gaps: number[] = [];
  for (let i = 1; i < cluster.length; i++) {
    const a = Date.parse(cluster[i - 1]!.postedAt);
    const b = Date.parse(cluster[i]!.postedAt);
    gaps.push(Math.round((b - a) / 86_400_000));
  }
  const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const cadenceMatch = ACCEPTED_CADENCES_DAYS.find((c) => Math.abs(meanGap - c) <= 3);
  if (!cadenceMatch) return { result: null, group: null };

  const variance = gaps.reduce((s, g) => s + Math.abs(g - meanGap), 0) / gaps.length;
  const confidence = Math.max(0.6, Math.min(0.95, 1 - variance / cadenceMatch));

  return {
    result: {
      categorySlug: 'subscriptions_tech',
      classification: 'fixed',
      confidence,
      classifiedBy: 'recurrence',
      reasoning: `${cluster.length}+ prior charges from same merchant on ~${cadenceMatch}-day cadence.`,
      requiresConfirmation: false,
    },
    group: {
      merchantNormalised: tx.merchantNormalised,
      amountMinCents: minA,
      amountMaxCents: maxA,
      cadenceDays: cadenceMatch,
      confidence,
    },
  };
}
