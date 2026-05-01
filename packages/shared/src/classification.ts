import { z } from 'zod';

export const TransactionClassification = z.enum([
  'fixed',
  'discretionary',
  'internal',
  'income',
  'refund',
]);
export type TransactionClassification = z.infer<typeof TransactionClassification>;

export const ClassifiedBy = z.enum(['rule', 'recurrence', 'llm', 'user', 'system']);
export type ClassifiedBy = z.infer<typeof ClassifiedBy>;

export const SystemCategorySlug = z.enum([
  'groceries',
  'food_drink',
  'fuel',
  'transport',
  'subscriptions_tech',
  'telco',
  'utilities',
  'mortgage',
  'rent',
  'insurance',
  'medical',
  'health_beauty',
  'fitness_recreation',
  'entertainment',
  'shopping',
  'travel',
  'education',
  'gifts_donations',
  'alcohol',
  'home_maintenance',
  'financial_fees',
  'cash_withdrawal',
  'internal_transfer',
  'income_salary',
  'income_refund',
  'income_other',
  'other',
]);
export type SystemCategorySlug = z.infer<typeof SystemCategorySlug>;

export const PayCadence = z.enum(['weekly', 'fortnightly', 'monthly', 'four_weekly', 'irregular']);
export type PayCadence = z.infer<typeof PayCadence>;

export const ClassificationResult = z.object({
  category: SystemCategorySlug,
  classification: TransactionClassification,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500).optional(),
});
export type ClassificationResult = z.infer<typeof ClassificationResult>;

/**
 * Slugs whose default classification must be confirmed by the user, never auto-classified
 * with high confidence by the LLM. Per PRD §F3 + build prompt §Sprint 3 step 20.
 */
export const REQUIRES_USER_CONFIRMATION: readonly SystemCategorySlug[] = [
  'mortgage',
  'rent',
];
