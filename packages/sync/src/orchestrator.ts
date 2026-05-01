/**
 * Sync orchestrator — pulls accounts and transactions from a connection, upserts
 * them into Supabase, runs the categoriser pipeline against new transactions,
 * detects internal transfers, and updates derived state.
 *
 * Called from:
 *   - Vercel Cron (every 6h, polls all active connections)
 *   - Webhook receivers (for the affected connection only)
 *   - Manual /sync triggers from the iOS app
 */

import { classify, type SystemRule, type UserRule } from '@leftovers/categoriser';
import { normaliseMerchant } from '@leftovers/shared';
import type { LeftoversSupabaseClient } from '@leftovers/shared';
import type { Database } from '@leftovers/shared/database';
import type { ClassificationOutput } from '@leftovers/categoriser';
import { findInternalPairs } from './internal-transfer.js';
import type { NormalisedAccount, NormalisedTransaction, SyncResult } from './types.js';

export interface SyncContext {
  supabase: LeftoversSupabaseClient;
  userId: string;
  connectionId: string;
  source: 'up' | 'basiq';
  llmEnabled: boolean;
}

export interface SyncSourceFns {
  fetchAccounts(): Promise<NormalisedAccount[]>;
  fetchTransactionsSince(sinceIso: string): Promise<NormalisedTransaction[]>;
}

export async function runSync(ctx: SyncContext, source: SyncSourceFns): Promise<SyncResult> {
  const { supabase, userId, connectionId } = ctx;

  const eventInsert = await supabase
    .from('sync_events')
    .insert({ user_id: userId, connection_id: connectionId, source: ctx.source, status: 'running' })
    .select('id')
    .single();
  if (eventInsert.error) throw eventInsert.error;
  const eventId = eventInsert.data.id;

  try {
    // ------- Accounts -------
    const accounts = await source.fetchAccounts();
    const accountIdMap = await upsertAccounts(supabase, userId, connectionId, accounts);

    // ------- Transactions -------
    const lastSync = await getLastSyncIso(supabase, connectionId);
    const transactions = await source.fetchTransactionsSince(lastSync);

    const { added, updated } = await upsertTransactions(supabase, userId, accountIdMap, transactions);

    // ------- Internal-transfer matching -------
    const pairs = await detectAndPersistPairs(supabase, userId);

    // ------- Categorisation -------
    await categoriseUnclassified(ctx);

    // ------- Refresh fixed-obligation next_expected_date hints -------
    await refreshFixedObligationDates(supabase, userId);

    await supabase
      .from('connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', connectionId);

    await supabase
      .from('sync_events')
      .update({
        status: 'success',
        transactions_added: added,
        transactions_updated: updated,
        finished_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    return {
      accountsUpserted: accounts.length,
      transactionsAdded: added,
      transactionsUpdated: updated,
      internalPairsCreated: pairs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from('connections')
      .update({ last_sync_error: message })
      .eq('id', connectionId);
    await supabase
      .from('sync_events')
      .update({ status: 'error', error_message: message, finished_at: new Date().toISOString() })
      .eq('id', eventId);
    throw e;
  }
}

async function getLastSyncIso(supabase: LeftoversSupabaseClient, connectionId: string): Promise<string> {
  const { data } = await supabase.from('connections').select('last_synced_at').eq('id', connectionId).single();
  if (!data?.last_synced_at) {
    // 90 days of history per PRD §F1
    return new Date(Date.now() - 90 * 86_400_000).toISOString();
  }
  return data.last_synced_at;
}

async function upsertAccounts(
  supabase: LeftoversSupabaseClient,
  userId: string,
  connectionId: string,
  accounts: NormalisedAccount[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const a of accounts) {
    const { data, error } = await supabase
      .from('accounts')
      .upsert(
        {
          user_id: userId,
          connection_id: connectionId,
          source: a.source,
          source_account_id: a.sourceAccountId,
          display_name: a.displayName,
          account_type: a.accountType,
          currency: a.currency,
          balance_cents: a.balanceCents,
          balance_updated_at: a.balanceUpdatedAt,
        },
        { onConflict: 'user_id,source,source_account_id' },
      )
      .select('id, source_account_id')
      .single();
    if (error) throw error;
    out.set(data.source_account_id, data.id);
  }

  // Second pass — wire parent_account_id now that all accounts exist
  for (const a of accounts) {
    if (!a.parentSourceAccountId) continue;
    const childId = out.get(a.sourceAccountId);
    const parentId = out.get(a.parentSourceAccountId);
    if (childId && parentId) {
      await supabase.from('accounts').update({ parent_account_id: parentId }).eq('id', childId);
    }
  }

  return out;
}

async function upsertTransactions(
  supabase: LeftoversSupabaseClient,
  userId: string,
  accountIdMap: Map<string, string>,
  transactions: NormalisedTransaction[],
): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;
  type TxInsert = Database['public']['Tables']['transactions']['Insert'];
  for (const t of transactions) {
    const accountId = accountIdMap.get(t.sourceAccountId);
    if (!accountId) continue;
    const row: TxInsert = {
      user_id: userId,
      account_id: accountId,
      source_transaction_id: t.sourceTransactionId,
      posted_at: t.postedAt,
      amount_cents: t.amountCents,
      currency: t.currency,
      merchant_raw: t.merchantRaw,
      merchant_normalised: normaliseMerchant(t.merchantRaw),
      description: t.description,
      location: t.location,
      ...(t.rawPayload !== undefined && {
        raw_payload: t.rawPayload as Database['public']['Tables']['transactions']['Row']['raw_payload'],
      }),
    };
    const { data, error } = await supabase
      .from('transactions')
      .upsert(row, { onConflict: 'account_id,source_transaction_id', ignoreDuplicates: false })
      .select('id, created_at, updated_at');
    if (error) throw error;
    for (const r of data) {
      if (r.created_at === r.updated_at) added += 1;
      else updated += 1;
    }
  }
  return { added, updated };
}

async function detectAndPersistPairs(
  supabase: LeftoversSupabaseClient,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, account_id, posted_at, amount_cents, currency')
    .eq('user_id', userId)
    .is('paired_transaction_id', null)
    .gte('posted_at', since);
  if (error) throw error;
  const pairs = findInternalPairs(
    rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      postedAt: r.posted_at,
      amountCents: r.amount_cents,
      currency: r.currency,
    })),
  );
  for (const p of pairs) {
    const { error: rpcError } = await supabase.rpc('internal_transfer_pair', {
      p_user_id: userId,
      p_outbound_id: p.outboundId,
      p_inbound_id: p.inboundId,
    });
    if (rpcError) throw rpcError;
  }
  return pairs.length;
}

async function categoriseUnclassified(ctx: SyncContext): Promise<void> {
  const { supabase, userId, llmEnabled } = ctx;

  const { data: rules, error: ruleErr } = await supabase
    .from('categorisation_rules')
    .select('user_id, merchant_pattern, pattern_type, classification, priority, category_id, categories(slug)')
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .eq('is_active', true);
  if (ruleErr) throw ruleErr;

  type RuleRow = (typeof rules)[number];
  const ruleList: (SystemRule | UserRule)[] = (rules as RuleRow[])
    .filter((r): r is RuleRow & { categories: { slug: string } } => r.categories !== null)
    .map((r) => {
      const base = {
        pattern: r.merchant_pattern,
        patternType: r.pattern_type,
        // The categoriser types use SystemCategorySlug; cast guarded by DB constraint
        categorySlug: r.categories.slug as SystemRule['categorySlug'],
        classification: r.classification,
        priority: r.priority,
      };
      return r.user_id ? { ...base, userId: r.user_id } : base;
    });

  const { data: pending, error } = await supabase
    .from('transactions')
    .select('id, user_id, merchant_raw, merchant_normalised, amount_cents, posted_at, account_id, accounts(account_type)')
    .eq('user_id', userId)
    .is('classification', null)
    .order('posted_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const { data: history } = await supabase
    .from('transactions')
    .select('merchant_normalised, amount_cents, posted_at')
    .eq('user_id', userId)
    .not('classification', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(500);

  type PendingRow = (typeof pending)[number];
  for (const t of pending as PendingRow[]) {
    const merchant = t.merchant_normalised ?? '';
    const priorByMerchant = (history ?? [])
      .filter(
        (h) => h.merchant_normalised && merchant.length > 0 && h.merchant_normalised.includes(merchant.slice(0, 8)),
      )
      .map((h) => ({
        merchantNormalised: h.merchant_normalised,
        amountCents: h.amount_cents,
        postedAt: h.posted_at,
      }));
    const accountTypeRow = (t as PendingRow & { accounts: { account_type: string } | null }).accounts;
    const result: ClassificationOutput = await classify(
      {
        id: t.id,
        userId,
        merchantRaw: t.merchant_raw,
        merchantNormalised: t.merchant_normalised,
        amountCents: t.amount_cents,
        accountType: (accountTypeRow?.account_type ?? 'transaction') as 'transaction',
        postedAt: t.posted_at,
      },
      {
        rules: ruleList,
        priorByMerchant,
        pastExamples: [],
        llmEnabled,
      },
    );

    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', result.categorySlug)
      .is('user_id', null)
      .maybeSingle();

    await supabase
      .from('transactions')
      .update({
        category_id: cat?.id ?? null,
        classification: result.classification,
        confidence_score: result.confidence,
        classified_by: result.classifiedBy,
        classification_reasoning: result.reasoning ?? null,
      })
      .eq('id', t.id);
  }
}

async function refreshFixedObligationDates(
  supabase: LeftoversSupabaseClient,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from('fixed_obligations')
    .select('id, expected_day_of_month, cadence, next_expected_date')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (!data) return;

  const today = new Date();
  for (const f of data) {
    if (f.cadence === 'monthly' && f.expected_day_of_month) {
      const next = nextMonthDay(today, f.expected_day_of_month);
      await supabase.from('fixed_obligations').update({ next_expected_date: next }).eq('id', f.id);
    }
  }
}

function nextMonthDay(today: Date, day: number): string {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate <= today) candidate.setUTCMonth(month + 1);
  return candidate.toISOString().slice(0, 10);
}
