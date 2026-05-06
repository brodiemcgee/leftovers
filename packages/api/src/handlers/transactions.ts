import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const ListQuery = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  classification: z.enum(['fixed', 'discretionary', 'internal', 'income', 'refund']).optional(),
});

export async function handleTransactionsList(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const url = new URL(req.url);
    const q = ListQuery.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      classification: url.searchParams.get('classification') ?? undefined,
    });

    let query = supabase
      .from('transactions')
      .select(
        'id, posted_at, amount_cents, currency, merchant_raw, merchant_normalised, description, classification, category_id, classified_by, confidence_score, paired_transaction_id, account_id, accounts(display_name, account_type)',
      )
      .eq('user_id', userId)
      .order('posted_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(q.limit);

    if (q.cursor) query = query.lt('posted_at', q.cursor);
    if (q.classification) query = query.eq('classification', q.classification);

    const { data, error } = await query;
    if (error) throw error;

    const next = data.length === q.limit ? data[data.length - 1]?.posted_at ?? null : null;
    return jsonResponse({ transactions: data, nextCursor: next });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'transactions:list' });
    return errorResponse(500, 'failed to list transactions');
  }
}

export async function handleTransactionDetail(req: Request, transactionId: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, posted_at, amount_cents, currency, merchant_raw, merchant_normalised, description, location, classification, classified_by, confidence_score, classification_reasoning, category_id, paired_transaction_id, account_id, accounts(display_name, account_type), categories(slug, name)',
      )
      .eq('user_id', userId)
      .eq('id', transactionId)
      .single();
    if (error) throw error;
    return jsonResponse({ transaction: data });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'transactions:detail', transactionId });
    return errorResponse(404, 'not found');
  }
}

const PatchBody = z.object({
  categorySlug: z.string().optional(),
  classification: z.enum(['fixed', 'discretionary', 'internal', 'income', 'refund']).optional(),
  applyToFutureFromMerchant: z.boolean().default(false),
  /** Spread the transaction's daily-allowance impact across N days. */
  amortiseDays: z.number().int().min(1).max(366).optional(),
});

export async function handleTransactionUpdate(req: Request, transactionId: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => PatchBody.parse(raw));

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, merchant_normalised, category_id')
      .eq('id', transactionId)
      .eq('user_id', userId)
      .single();
    if (txErr) throw txErr;

    let categoryId: string | null | undefined = undefined;
    if (body.categorySlug) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id, default_classification')
        .eq('slug', body.categorySlug)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .maybeSingle();
      if (!cat) return errorResponse(400, `Unknown category: ${body.categorySlug}`);
      categoryId = cat.id;
    }

    const update: Record<string, unknown> = { user_overridden: true, classified_by: 'user' };
    if (categoryId !== undefined) update['category_id'] = categoryId;
    if (body.classification) update['classification'] = body.classification;
    if (body.amortiseDays !== undefined) update['amortise_days'] = body.amortiseDays;

    const { error: updErr } = await supabase.from('transactions').update(update).eq('id', transactionId);
    if (updErr) throw updErr;

    if (body.applyToFutureFromMerchant && tx.merchant_normalised && categoryId !== undefined && body.classification) {
      // Layer-4 user-feedback rule write
      await supabase.from('categorisation_rules').insert({
        user_id: userId,
        merchant_pattern: tx.merchant_normalised,
        pattern_type: 'substring',
        category_id: categoryId,
        classification: body.classification,
        source: 'user_correction',
        priority: 200,
        is_active: true,
      });
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'transactions:update', transactionId });
    return errorResponse(500, 'failed to update transaction');
  }
}
