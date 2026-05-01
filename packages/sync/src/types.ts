import type { AccountTypeEnum } from '@leftovers/shared/database';

export interface NormalisedAccount {
  source: 'up' | 'basiq';
  sourceAccountId: string;
  parentSourceAccountId: string | null;
  displayName: string;
  accountType: AccountTypeEnum;
  currency: string;
  balanceCents: number;
  balanceUpdatedAt: string;
}

export interface NormalisedTransaction {
  source: 'up' | 'basiq';
  sourceTransactionId: string;
  sourceAccountId: string;
  postedAt: string;
  amountCents: number;
  currency: string;
  merchantRaw: string | null;
  description: string | null;
  location: string | null;
  rawPayload: unknown;
}

export interface SyncResult {
  accountsUpserted: number;
  transactionsAdded: number;
  transactionsUpdated: number;
  internalPairsCreated: number;
}
