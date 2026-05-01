import { REQUIRES_USER_CONFIRMATION, normaliseMerchant } from '@leftovers/shared';
import type { ClassificationOutput, SystemRule, TransactionInput, UserRule } from '../types.js';

/**
 * Layers 1 + 4 — pattern matching against system + user rules.
 *
 * Match algorithm:
 *   1. Normalise BOTH the merchant string and each pattern the same way:
 *      uppercase, drop everything except A-Z, 0-9, and single spaces.
 *   2. Test each rule with a word-boundary regex (`\bPATTERN\b`). This stops
 *      short patterns like "MOBIL" (fuel) from matching inside "OPTUS
 *      MOBILE" (telco) or "DISNEY" inside "DISNEYLAND".
 *   3. From every rule that matches, pick the winner by:
 *        a. priority (highest first — user rules at 200 always beat system
 *           rules at 100)
 *        b. then by pattern length (longer = more specific, e.g. "HOME LOAN"
 *           beats "LOAN", "ENERGY AUSTRALIA" beats "ENERGY")
 *        c. then by classification specificity (a category that requires
 *           user confirmation — mortgage, rent — wins over a generic
 *           internal/discretionary catch-all).
 *
 * The substring + first-sort-wins logic that this replaces produced
 * non-deterministic results when patterns overlapped (e.g. SHELL COLES
 * EXPRESS had both COLES → groceries and SHELL → fuel).
 */
export function classifyByRules(
  tx: TransactionInput,
  rules: readonly (SystemRule | UserRule)[],
): ClassificationOutput | null {
  if (!tx.merchantNormalised || tx.merchantNormalised.length === 0) return null;
  const merchant = canonicaliseForMatching(tx.merchantNormalised);

  type Hit = { rule: SystemRule | UserRule; canonicalLength: number };
  const hits: Hit[] = [];
  for (const r of rules) {
    if (r.patternType === 'regex') {
      try {
        if (new RegExp(r.pattern, 'i').test(tx.merchantNormalised)) {
          hits.push({ rule: r, canonicalLength: r.pattern.length });
        }
      } catch {
        continue;
      }
      continue;
    }
    const canonical = canonicaliseForMatching(r.pattern);
    if (canonical.length === 0) continue;
    if (matchesWordBoundary(merchant, canonical)) {
      hits.push({ rule: r, canonicalLength: canonical.length });
    }
  }
  if (hits.length === 0) return null;

  hits.sort((a, b) => {
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
    if (b.canonicalLength !== a.canonicalLength) return b.canonicalLength - a.canonicalLength;
    const aSpecific = REQUIRES_USER_CONFIRMATION.includes(a.rule.categorySlug) ? 1 : 0;
    const bSpecific = REQUIRES_USER_CONFIRMATION.includes(b.rule.categorySlug) ? 1 : 0;
    return bSpecific - aSpecific;
  });

  const winner = hits[0]!.rule;
  return {
    categorySlug: winner.categorySlug,
    classification: winner.classification,
    confidence: 'userId' in winner ? 0.99 : 0.92,
    classifiedBy: 'userId' in winner ? 'user' : 'rule',
    reasoning: `Matched ${'userId' in winner ? 'user' : 'system'} rule "${winner.pattern}".`,
    requiresConfirmation: REQUIRES_USER_CONFIRMATION.includes(winner.categorySlug),
  };
}

/**
 * Apply the same canonical form to merchants and patterns so they compare
 * symmetrically. Reuses `normaliseMerchant` (drops state codes, the literal
 * "AUSTRALIA"/"AUS", trailing card-number digits, etc.) so a rule pattern
 * like "ENERGY AUSTRALIA" reduces to the same "ENERGY" the merchant string
 * does. After that, drops any remaining punctuation and collapses spaces.
 */
function canonicaliseForMatching(s: string): string {
  const normalised = normaliseMerchant(s);
  return normalised.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesWordBoundary(canonicalMerchant: string, canonicalPattern: string): boolean {
  // Both inputs are alnum + single spaces only, so word boundaries are just
  // " " or string edge. Pad both sides of the merchant with a sentinel space
  // and require the pattern to be surrounded by spaces or string edges.
  const padded = ` ${canonicalMerchant} `;
  const target = ` ${canonicalPattern} `;
  return padded.includes(target);
}
