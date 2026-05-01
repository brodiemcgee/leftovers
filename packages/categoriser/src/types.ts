import type {
  AccountTypeEnum,
  ClassificationEnum,
  ClassifiedByEnum,
} from '@leftovers/shared/database';
import type { SystemCategorySlug } from '@leftovers/shared';

export interface TransactionInput {
  /** UUID of the transaction (used to attach LLM call records) */
  id: string;
  userId: string;
  merchantRaw: string | null;
  merchantNormalised: string | null;
  amountCents: number;
  accountType: AccountTypeEnum;
  postedAt: string;
}

export interface ClassificationOutput {
  categorySlug: SystemCategorySlug;
  classification: ClassificationEnum;
  confidence: number;
  classifiedBy: ClassifiedByEnum;
  reasoning?: string;
  /** True if the result is provisional and the user should confirm. Used for mortgage / rent. */
  requiresConfirmation: boolean;
}

export interface SystemRule {
  pattern: string;
  patternType: 'substring' | 'regex';
  categorySlug: SystemCategorySlug;
  classification: ClassificationEnum;
  priority: number;
}

export interface UserRule extends SystemRule {
  userId: string;
}

export interface RecurringGroupCandidate {
  merchantNormalised: string;
  amountMinCents: number;
  amountMaxCents: number;
  cadenceDays: number;
  confidence: number;
}
