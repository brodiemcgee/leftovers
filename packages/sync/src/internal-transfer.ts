/**
 * Internal-transfer matcher — non-negotiable per build prompt §Sprint 2 step 12.
 *
 * Detects transactions where the user moved money between two of their own
 * accounts (e.g. transfer from spending → savings, mortgage payment from
 * offset → home loan). These must NOT count as discretionary spend or as
 * income; they're pass-through.
 *
 * Pairing rule:
 *   - same user
 *   - opposite signs
 *   - exact same |amount| within currency
 *   - posted_at within ±48 hours of each other
 *   - both transactions live in different `account_id`s
 */

export interface MatchableTx {
  id: string;
  accountId: string;
  postedAt: string;
  amountCents: number;
  currency: string;
}

export interface InternalPair {
  outboundId: string;
  inboundId: string;
}

const MAX_GAP_MS = 48 * 60 * 60 * 1000;

export function findInternalPairs(transactions: readonly MatchableTx[]): InternalPair[] {
  const sorted = [...transactions].sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  const used = new Set<string>();
  const pairs: InternalPair[] = [];

  for (const out of sorted) {
    if (used.has(out.id)) continue;
    if (out.amountCents >= 0) continue; // outbound = negative
    for (const inb of sorted) {
      if (used.has(inb.id)) continue;
      if (inb.id === out.id) continue;
      if (inb.accountId === out.accountId) continue;
      if (inb.currency !== out.currency) continue;
      if (inb.amountCents !== -out.amountCents) continue;
      const gap = Math.abs(Date.parse(inb.postedAt) - Date.parse(out.postedAt));
      if (gap > MAX_GAP_MS) continue;
      pairs.push({ outboundId: out.id, inboundId: inb.id });
      used.add(out.id);
      used.add(inb.id);
      break;
    }
  }
  return pairs;
}
