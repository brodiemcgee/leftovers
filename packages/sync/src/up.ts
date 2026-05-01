/**
 * Up Bank API integration.
 * Spec: https://developer.up.com.au/
 *
 * Up issues a personal access token (no OAuth dance for the user's own account).
 * For Sprint 2 we accept a personal access token via `accessToken` and use it directly.
 * Webhooks are signed with HMAC-SHA256 using the shared `webhookSecret`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { UpstreamApiError, WebhookSignatureError, dollarsToCents } from '@leftovers/shared';
import type { NormalisedAccount, NormalisedTransaction } from './types.js';
import type { AccountTypeEnum } from '@leftovers/shared/database';

const UP_API_BASE = 'https://api.up.com.au/api/v1';

export interface UpClient {
  listAccounts(): Promise<NormalisedAccount[]>;
  listTransactionsSince(sinceIso: string): Promise<NormalisedTransaction[]>;
  registerWebhook(url: string): Promise<{ id: string; secret: string }>;
}

export function createUpClient(accessToken: string): UpClient {
  return {
    listAccounts: () => listAccounts(accessToken),
    listTransactionsSince: (sinceIso) => listTransactionsSince(accessToken, sinceIso),
    registerWebhook: (url) => registerWebhook(accessToken, url),
  };
}

interface UpAccountResource {
  id: string;
  type: 'accounts';
  attributes: {
    displayName: string;
    accountType: 'SAVER' | 'TRANSACTIONAL' | 'HOME_LOAN';
    ownershipType: 'INDIVIDUAL' | 'JOINT';
    balance: { currencyCode: string; value: string; valueInBaseUnits: number };
    createdAt: string;
  };
  relationships: {
    parent?: { data: { type: 'accounts'; id: string } | null } | null;
  };
}

interface UpTransactionResource {
  id: string;
  type: 'transactions';
  attributes: {
    status: 'HELD' | 'SETTLED';
    rawText: string | null;
    description: string;
    message: string | null;
    isCategorizable: boolean;
    holdInfo: unknown | null;
    roundUp: unknown | null;
    cashback: unknown | null;
    amount: { currencyCode: string; value: string; valueInBaseUnits: number };
    foreignAmount: unknown | null;
    settledAt: string | null;
    createdAt: string;
    transactionType: string | null;
  };
  relationships: {
    account: { data: { type: 'accounts'; id: string } };
    transferAccount: { data: { type: 'accounts'; id: string } | null } | null;
    category: { data: { type: 'categories'; id: string } | null } | null;
  };
}

async function upFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${UP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new UpstreamApiError('up', res.status, body.slice(0, 500));
  }
  return res.json() as Promise<T>;
}

export async function listAccounts(accessToken: string): Promise<NormalisedAccount[]> {
  const out: NormalisedAccount[] = [];
  let nextPath: string | null = '/accounts?page[size]=100';
  while (nextPath) {
    const page: { data: UpAccountResource[]; links: { next: string | null } } = await upFetch(
      accessToken,
      nextPath,
    );
    for (const a of page.data) {
      out.push({
        source: 'up',
        sourceAccountId: a.id,
        parentSourceAccountId: a.relationships.parent?.data?.id ?? null,
        displayName: a.attributes.displayName,
        accountType: mapUpAccountType(a),
        currency: a.attributes.balance.currencyCode,
        balanceCents: a.attributes.balance.valueInBaseUnits,
        balanceUpdatedAt: new Date().toISOString(),
      });
    }
    nextPath = page.links.next ? page.links.next.replace(UP_API_BASE, '') : null;
  }
  return out;
}

export async function listTransactionsSince(
  accessToken: string,
  sinceIso: string,
): Promise<NormalisedTransaction[]> {
  const params = new URLSearchParams({
    'page[size]': '100',
    'filter[since]': sinceIso,
  });
  const out: NormalisedTransaction[] = [];
  let nextPath: string | null = `/transactions?${params.toString()}`;
  while (nextPath) {
    const page: { data: UpTransactionResource[]; links: { next: string | null } } = await upFetch(
      accessToken,
      nextPath,
    );
    for (const t of page.data) {
      out.push({
        source: 'up',
        sourceTransactionId: t.id,
        sourceAccountId: t.relationships.account.data.id,
        postedAt: t.attributes.settledAt ?? t.attributes.createdAt,
        amountCents: t.attributes.amount.valueInBaseUnits,
        currency: t.attributes.amount.currencyCode,
        merchantRaw: t.attributes.rawText ?? t.attributes.description,
        description: t.attributes.description,
        location: null,
        rawPayload: t,
      });
    }
    nextPath = page.links.next ? page.links.next.replace(UP_API_BASE, '') : null;
  }
  return out;
}

export async function registerWebhook(
  accessToken: string,
  url: string,
): Promise<{ id: string; secret: string }> {
  const res = await upFetch<{
    data: { id: string; attributes: { secretKey: string } };
  }>(accessToken, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: { url, description: 'Leftovers sync webhook' },
      },
    }),
  });
  return { id: res.data.id, secret: res.data.attributes.secretKey };
}

/**
 * Verify the X-Up-Authenticity-Signature header on an incoming webhook.
 * Compares HMAC-SHA256(rawBody, secretKey) hex-encoded.
 */
export function verifyUpWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function assertUpWebhook(rawBody: string, signatureHeader: string | null, secret: string): void {
  if (!signatureHeader || !verifyUpWebhook(rawBody, signatureHeader, secret)) {
    throw new WebhookSignatureError('up');
  }
}

function mapUpAccountType(a: UpAccountResource): AccountTypeEnum {
  // Up exposes TRANSACTIONAL, SAVER, HOME_LOAN. SAVERS with a parent are sub-buckets.
  if (a.attributes.accountType === 'HOME_LOAN') return 'offset';
  if (a.attributes.accountType === 'SAVER') {
    return a.relationships.parent?.data ? 'saver_bucket' : 'savings';
  }
  return 'transaction';
}

// Re-export for tests
export { dollarsToCents };
