/**
 * Basiq integration. Spec: https://api.basiq.io/reference/
 *
 * Basiq is the CDR-accredited intermediary for Big 4 + ING + Macquarie + Amex etc.
 * Auth model: server-side API key + per-user `userId` + per-connection `connectionId`.
 * We never store the user's bank credentials — Basiq's hosted consent UI does.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { UpstreamApiError, WebhookSignatureError, dollarsToCents } from '@leftovers/shared';
import type { NormalisedAccount, NormalisedTransaction } from './types.js';
import type { AccountTypeEnum } from '@leftovers/shared/database';

const BASIQ_API_BASE = 'https://au-api.basiq.io';

export interface BasiqClient {
  serverToken(): Promise<string>;
  listAccounts(basiqUserId: string): Promise<NormalisedAccount[]>;
  listTransactionsSince(basiqUserId: string, sinceIso: string): Promise<NormalisedTransaction[]>;
  createConsentSession(basiqUserId: string): Promise<{ url: string; sessionId: string }>;
}

export function createBasiqClient(apiKey: string): BasiqClient {
  let cachedToken: { value: string; expiresAt: number } | null = null;
  async function token(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
    const res = await fetch(`${BASIQ_API_BASE}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${apiKey}`,
        'basiq-version': '3.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'scope=SERVER_ACCESS',
    });
    if (!res.ok) throw new UpstreamApiError('basiq', res.status, await res.text());
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cachedToken.value;
  }
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const t = await token();
    const res = await fetch(`${BASIQ_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        'basiq-version': '3.0',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) throw new UpstreamApiError('basiq', res.status, (await res.text()).slice(0, 500));
    return res.json() as Promise<T>;
  }

  return {
    serverToken: token,
    async listAccounts(basiqUserId) {
      const res = await api<BasiqAccountList>(`/users/${basiqUserId}/accounts`);
      return res.data.map(toAccount);
    },
    async listTransactionsSince(basiqUserId, sinceIso) {
      const out: NormalisedTransaction[] = [];
      let next: string | null = `/users/${basiqUserId}/transactions?filter=transaction.postDate.gt('${sinceIso}')&limit=500`;
      while (next) {
        const page: BasiqTransactionList = await api(next);
        for (const t of page.data) out.push(toTransaction(t));
        next = page.links?.next ? page.links.next.replace(BASIQ_API_BASE, '') : null;
      }
      return out;
    },
    async createConsentSession(basiqUserId) {
      const res = await api<{ id: string; data?: { url?: string } }>(
        `/users/${basiqUserId}/consents`,
        { method: 'POST', body: JSON.stringify({ source: 'leftovers-app' }) },
      );
      return { url: res.data?.url ?? '', sessionId: res.id };
    },
  };
}

interface BasiqAccountResource {
  id: string;
  accountNo: string;
  name: string;
  currency: string;
  balance: string;
  availableFunds: string | null;
  class: { type: string; product?: string };
  status: string;
  institution: string;
}

interface BasiqAccountList {
  data: BasiqAccountResource[];
}

interface BasiqTransactionResource {
  id: string;
  account: string;
  amount: string;
  currency: string;
  description: string;
  postDate: string;
  transactionDate: string;
  status: string;
  direction: 'credit' | 'debit';
  class?: string;
  enrich?: {
    merchant?: { name?: string };
    location?: { city?: string; state?: string };
  };
  subClass?: { title?: string };
}

interface BasiqTransactionList {
  data: BasiqTransactionResource[];
  links?: { next?: string };
}

function toAccount(a: BasiqAccountResource): NormalisedAccount {
  return {
    source: 'basiq',
    sourceAccountId: a.id,
    parentSourceAccountId: null,
    displayName: a.name,
    accountType: mapBasiqClass(a.class.type),
    currency: a.currency,
    balanceCents: dollarsToCents(Number.parseFloat(a.balance)),
    balanceUpdatedAt: new Date().toISOString(),
  };
}

function toTransaction(t: BasiqTransactionResource): NormalisedTransaction {
  const amount = dollarsToCents(Number.parseFloat(t.amount));
  // Basiq returns positive credit, negative debit — already signed correctly when parsed.
  const merchant = t.enrich?.merchant?.name ?? t.description;
  const loc = t.enrich?.location
    ? [t.enrich.location.city, t.enrich.location.state].filter(Boolean).join(', ')
    : null;
  return {
    source: 'basiq',
    sourceTransactionId: t.id,
    sourceAccountId: t.account,
    postedAt: t.postDate ?? t.transactionDate,
    amountCents: amount,
    currency: t.currency,
    merchantRaw: merchant,
    description: t.description,
    location: loc,
    rawPayload: t,
  };
}

function mapBasiqClass(c: string): AccountTypeEnum {
  switch (c) {
    case 'transaction':
    case 'mortgage':
      return c === 'mortgage' ? 'offset' : 'transaction';
    case 'savings':
      return 'savings';
    case 'credit-card':
    case 'credit':
      return 'credit';
    case 'offset':
      return 'offset';
    default:
      return 'transaction';
  }
}

export function verifyBasiqWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function assertBasiqWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): void {
  if (!signatureHeader || !verifyBasiqWebhook(rawBody, signatureHeader, secret)) {
    throw new WebhookSignatureError('basiq');
  }
}
