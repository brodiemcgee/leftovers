import { describe, expect, it } from 'vitest';
import { normaliseMerchant } from '@leftovers/shared';
import { classify } from './pipeline.js';
import type { SystemRule, TransactionInput } from './types.js';

const RULES: SystemRule[] = [
  { pattern: 'NETFLIX', patternType: 'substring', categorySlug: 'subscriptions_tech', classification: 'fixed', priority: 100 },
  { pattern: 'WOOLWORTHS', patternType: 'substring', categorySlug: 'groceries', classification: 'discretionary', priority: 100 },
  { pattern: 'MORTGAGE', patternType: 'substring', categorySlug: 'mortgage', classification: 'fixed', priority: 100 },
];

function tx(merchantRaw: string, amountCents: number): TransactionInput {
  return {
    id: '00000000-0000-0000-0000-0000000000aa',
    userId: '00000000-0000-0000-0000-000000000001',
    merchantRaw,
    merchantNormalised: normaliseMerchant(merchantRaw),
    amountCents,
    accountType: 'transaction',
    postedAt: '2026-04-15T10:00:00Z',
  };
}

describe('classify pipeline', () => {
  it('layer-1 rule wins for known merchant', async () => {
    const r = await classify(tx('NETFLIX.COM', -2299), {
      rules: RULES,
      priorByMerchant: [],
      pastExamples: [],
      llmEnabled: false,
    });
    expect(r.layer).toBe(1);
    expect(r.categorySlug).toBe('subscriptions_tech');
    expect(r.classification).toBe('fixed');
  });

  it('mortgage requires user confirmation flag', async () => {
    const r = await classify(tx('MORTGAGE PAYMENT WBC 12345', -300000), {
      rules: RULES,
      priorByMerchant: [],
      pastExamples: [],
      llmEnabled: false,
    });
    expect(r.categorySlug).toBe('mortgage');
    expect(r.requiresConfirmation).toBe(true);
  });

  it('falls through to layer-3 default when nothing matches and LLM disabled', async () => {
    const r = await classify(tx('OBSCURE MERCHANT XYZ', -5000), {
      rules: RULES,
      priorByMerchant: [],
      pastExamples: [],
      llmEnabled: false,
    });
    expect(r.categorySlug).toBe('other');
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.requiresConfirmation).toBe(true);
  });

  it('layer-2 detects fortnightly recurrence', async () => {
    const r = await classify(tx('SOMEPROVIDER WEEKLY DEBIT', -2999), {
      rules: [],
      priorByMerchant: [
        { merchantNormalised: 'SOMEPROVIDER WEEKLY DEBIT', amountCents: -2999, postedAt: '2026-02-01T00:00:00Z' },
        { merchantNormalised: 'SOMEPROVIDER WEEKLY DEBIT', amountCents: -2999, postedAt: '2026-02-15T00:00:00Z' },
        { merchantNormalised: 'SOMEPROVIDER WEEKLY DEBIT', amountCents: -2999, postedAt: '2026-03-01T00:00:00Z' },
        { merchantNormalised: 'SOMEPROVIDER WEEKLY DEBIT', amountCents: -2999, postedAt: '2026-03-15T00:00:00Z' },
      ],
      pastExamples: [],
      llmEnabled: false,
    });
    expect(r.layer).toBe(2);
    expect(r.classification).toBe('fixed');
    expect(r.recurringGroup?.cadenceDays).toBe(14);
  });
});
