// One-off: run the new rule engine against the user's null-classification
// transactions and write back via the service-role key. Used after a
// rule-engine upgrade where the live sync endpoint can't fit a full
// re-categorisation inside Vercel's 60s function ceiling.
//
// Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... \
//      pnpm exec tsx scripts/recategorise.mts

import { createClient } from '@supabase/supabase-js';
import { classifyByRules } from '../packages/categoriser/src/layers/rules.js';
import { normaliseMerchant } from '../packages/shared/src/merchant.js';
import type { SystemRule, TransactionInput } from '../packages/categoriser/src/types.js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = process.env.USER_ID!;
if (!URL || !KEY || !USER_ID) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID are required');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

interface RuleRow {
  user_id: string | null;
  merchant_pattern: string;
  pattern_type: 'substring' | 'regex';
  classification: string;
  priority: number;
  category_id: string | null;
  categories: { slug: string } | null;
}

interface TxRow {
  id: string;
  merchant_raw: string | null;
  merchant_normalised: string | null;
  amount_cents: number;
  posted_at: string;
  account_id: string | null;
  accounts: { account_type: string } | null;
}

async function main() {
  const { data: rules, error: ruleErr } = await sb
    .from('categorisation_rules')
    .select(
      'user_id, merchant_pattern, pattern_type, classification, priority, category_id, categories(slug)',
    )
    .or(`user_id.is.null,user_id.eq.${USER_ID}`)
    .eq('is_active', true);
  if (ruleErr) throw ruleErr;

  const ruleList: SystemRule[] = (rules as RuleRow[])
    .filter((r): r is RuleRow & { categories: { slug: string } } => r.categories !== null)
    .map((r) => ({
      pattern: r.merchant_pattern,
      patternType: r.pattern_type,
      categorySlug: r.categories.slug as SystemRule['categorySlug'],
      classification: r.classification as SystemRule['classification'],
      priority: r.priority,
    }));
  console.log(`Loaded ${ruleList.length} rules`);

  const categorySlugToId = new Map<string, string>();
  const { data: cats } = await sb
    .from('categories')
    .select('id, slug, user_id')
    .or(`user_id.is.null,user_id.eq.${USER_ID}`);
  for (const c of (cats ?? []) as { id: string; slug: string }[]) {
    if (!categorySlugToId.has(c.slug)) categorySlugToId.set(c.slug, c.id);
  }

  let cursor: string | null = null;
  let total = 0;
  let updated = 0;
  while (true) {
    let q = sb
      .from('transactions')
      .select(
        'id, merchant_raw, merchant_normalised, amount_cents, posted_at, account_id, accounts(account_type)',
      )
      .eq('user_id', USER_ID)
      .is('classification', null)
      .order('posted_at', { ascending: false })
      .limit(500);
    if (cursor) q = q.lt('posted_at', cursor);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const t of rows as TxRow[]) {
      total++;
      const merchant = t.merchant_normalised ?? normaliseMerchant(t.merchant_raw);
      const tx: TransactionInput = {
        id: t.id,
        userId: USER_ID,
        merchantRaw: t.merchant_raw,
        merchantNormalised: merchant,
        amountCents: t.amount_cents,
        accountType: (t.accounts?.account_type ?? 'transaction') as 'transaction',
        postedAt: t.posted_at,
      };
      const result = classifyByRules(tx, ruleList);
      if (!result) continue;
      await sb.from('transactions').update({
        category_id: categorySlugToId.get(result.categorySlug) ?? null,
        classification: result.classification,
        confidence_score: result.confidence,
        classified_by: result.classifiedBy,
        classification_reasoning: result.reasoning,
      }).eq('id', t.id);
      updated++;
    }
    cursor = rows[rows.length - 1]!.posted_at;
    if (rows.length < 500) break;
  }
  console.log(`Reviewed ${total}, updated ${updated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
