/**
 * Eval harness — runs all fixtures through Layer 1 (rules) only.
 * Why rules-only: the build prompt's 95% target is "after the user-feedback layer is simulated"
 * which is exactly Layer 1 (system rules + accumulated user corrections). LLM calls in CI
 * would require live Anthropic credits and would slow the suite.
 *
 * Exit code: 0 if accuracy ≥ 95%, 1 otherwise. Wired into the GitHub Actions PR check.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normaliseMerchant } from '@leftovers/shared';
import type { ClassificationEnum } from '@leftovers/shared/database';
import type { SystemCategorySlug } from '@leftovers/shared';
import { classifyByRules } from '../src/layers/rules.js';
import { SYSTEM_RULES } from './system-rules.js';
import type { TransactionInput } from '../src/types.js';

interface Fixture {
  merchantRaw: string;
  amountCents: number;
  accountType: 'transaction' | 'savings' | 'credit' | 'offset';
  expectedCategory: SystemCategorySlug;
  expectedClassification: ClassificationEnum;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, 'fixtures.json');
const { fixtures } = JSON.parse(readFileSync(fixturesPath, 'utf-8')) as { fixtures: Fixture[] };

const ACCURACY_THRESHOLD = 0.95;

interface Failure {
  merchant: string;
  expected: { category: SystemCategorySlug; classification: ClassificationEnum };
  actual: { category: SystemCategorySlug | 'unmatched'; classification: ClassificationEnum | 'unmatched' };
}

let correct = 0;
const failures: Failure[] = [];

for (const f of fixtures) {
  const tx: TransactionInput = {
    id: '00000000-0000-0000-0000-000000000000',
    userId: '00000000-0000-0000-0000-000000000001',
    merchantRaw: f.merchantRaw,
    merchantNormalised: normaliseMerchant(f.merchantRaw),
    amountCents: f.amountCents,
    accountType: f.accountType,
    postedAt: '2026-04-15T10:00:00Z',
  };
  const result = classifyByRules(tx, SYSTEM_RULES);
  if (
    result &&
    result.categorySlug === f.expectedCategory &&
    result.classification === f.expectedClassification
  ) {
    correct += 1;
  } else {
    failures.push({
      merchant: f.merchantRaw,
      expected: { category: f.expectedCategory, classification: f.expectedClassification },
      actual: result
        ? { category: result.categorySlug, classification: result.classification }
        : { category: 'unmatched', classification: 'unmatched' },
    });
  }
}

const accuracy = correct / fixtures.length;
console.error(`\nLeftovers categoriser eval`);
console.error(`==========================`);
console.error(`Total fixtures:  ${fixtures.length}`);
console.error(`Correct:         ${correct}`);
console.error(`Accuracy:        ${(accuracy * 100).toFixed(1)}%`);
console.error(`Threshold:       ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%`);

if (failures.length > 0) {
  console.error(`\nMisclassifications (${failures.length}):`);
  for (const f of failures) {
    console.error(
      `  ${f.merchant.padEnd(40)} expected ${f.expected.category}/${f.expected.classification} → got ${f.actual.category}/${f.actual.classification}`,
    );
  }
}

if (accuracy < ACCURACY_THRESHOLD) {
  console.error(`\nFAIL: accuracy ${(accuracy * 100).toFixed(1)}% < threshold ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%`);
  process.exit(1);
}

console.error(`\nPASS`);
