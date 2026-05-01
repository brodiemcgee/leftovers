import { REQUIRES_USER_CONFIRMATION } from '@leftovers/shared';
import type { ClassificationOutput, SystemRule, TransactionInput, UserRule } from '../types.js';

/**
 * Layer 1 + Layer 4 (rule lookup).
 * User-correction rules sit at higher priority than system rules and are matched first.
 * Within each tier, the highest-priority active rule whose pattern matches wins.
 */
export function classifyByRules(
  tx: TransactionInput,
  rules: readonly (SystemRule | UserRule)[],
): ClassificationOutput | null {
  if (!tx.merchantNormalised || tx.merchantNormalised.length === 0) return null;
  const merchant = tx.merchantNormalised.toUpperCase();

  // Priority desc — user corrections (priority 200+) come first by virtue of priority.
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    if (matches(merchant, r)) {
      return {
        categorySlug: r.categorySlug,
        classification: r.classification,
        confidence: 'userId' in r ? 0.99 : 0.92,
        classifiedBy: 'userId' in r ? 'user' : 'rule',
        reasoning: `Matched ${'userId' in r ? 'user' : 'system'} rule "${r.pattern}".`,
        requiresConfirmation: REQUIRES_USER_CONFIRMATION.includes(r.categorySlug),
      };
    }
  }
  return null;
}

function matches(merchant: string, rule: SystemRule | UserRule): boolean {
  const p = rule.pattern.toUpperCase();
  if (rule.patternType === 'regex') {
    try {
      return new RegExp(rule.pattern, 'i').test(merchant);
    } catch {
      return false;
    }
  }
  return merchant.includes(p);
}
