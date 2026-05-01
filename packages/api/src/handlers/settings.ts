import { z } from 'zod';
import { authenticate, errorResponse, jsonResponse, readJsonBody, UnauthorizedError } from '../lib/auth.js';
import { captureError } from '../lib/sentry.js';

const PreferencesBody = z.object({
  timezone: z.string().optional(),
  llmCategorisationEnabled: z.boolean().optional(),
  periodMode: z.enum(['calendar_month', 'pay_cycle']).optional(),
});

export async function handleSettingsGet(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const user = await supabase
      .from('users')
      .select('id, email, display_name, timezone, llm_categorisation_enabled, preferences, subscription_status, subscription_current_period_end, email_alias')
      .eq('id', userId)
      .single();
    if (user.error) throw user.error;

    const cycles = await supabase
      .from('pay_cycles')
      .select('id, payer_name, cadence, anchor_date, amount_estimate_cents, is_primary, is_active')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false });
    if (cycles.error) throw cycles.error;

    const obligations = await supabase
      .from('fixed_obligations')
      .select('id, name, amount_cents, cadence, expected_day_of_month, next_expected_date, is_active, account_id, category_id')
      .eq('user_id', userId)
      .order('amount_cents', { ascending: false });
    if (obligations.error) throw obligations.error;

    const conns = await supabase
      .from('connections')
      .select('id, source, display_name, status, last_synced_at, last_sync_error')
      .eq('user_id', userId);
    if (conns.error) throw conns.error;

    const userRules = await supabase
      .from('categorisation_rules')
      .select('id, merchant_pattern, classification, category_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (userRules.error) throw userRules.error;

    return jsonResponse({
      user: user.data,
      payCycles: cycles.data,
      fixedObligations: obligations.data,
      connections: conns.data,
      userRules: userRules.data,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'settings:get' });
    return errorResponse(500, 'settings load failed');
  }
}

export async function handleSettingsPatch(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => PreferencesBody.parse(raw));

    const update: Record<string, unknown> = {};
    if (body.timezone) update['timezone'] = body.timezone;
    if (typeof body.llmCategorisationEnabled === 'boolean') {
      update['llm_categorisation_enabled'] = body.llmCategorisationEnabled;
    }
    if (body.periodMode) {
      const { data: existing } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .single();
      const prefs =
        existing?.preferences && typeof existing.preferences === 'object' && !Array.isArray(existing.preferences)
          ? (existing.preferences as Record<string, unknown>)
          : {};
      prefs['period_mode'] = body.periodMode;
      update['preferences'] = prefs;
    }
    if (Object.keys(update).length === 0) return jsonResponse({ ok: true });

    const { error } = await supabase.from('users').update(update).eq('id', userId);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'settings:patch' });
    return errorResponse(500, 'settings update failed');
  }
}

const PayCycleBody = z.object({
  id: z.string().uuid().optional(),
  payerName: z.string().min(1).max(120),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly', 'four_weekly', 'irregular']),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountEstimateCents: z.number().int().nonnegative(),
  isPrimary: z.boolean().default(true),
});

export async function handlePayCycleUpsert(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => PayCycleBody.parse(raw));

    if (body.isPrimary) {
      // Demote any other primary
      await supabase.from('pay_cycles').update({ is_primary: false }).eq('user_id', userId);
    }

    const row = {
      user_id: userId,
      payer_name: body.payerName,
      cadence: body.cadence,
      anchor_date: body.anchorDate,
      amount_estimate_cents: body.amountEstimateCents,
      is_primary: body.isPrimary,
      is_active: true,
    };

    if (body.id) {
      const { error } = await supabase.from('pay_cycles').update(row).eq('id', body.id).eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, id: body.id });
    }

    // Atomic upsert keyed on the migration-installed unique index
    // (user_id, payer_name, cadence). Concurrent confirm-pay calls all
    // collapse to a single row.
    const { data, error } = await supabase
      .from('pay_cycles')
      .upsert(row, { onConflict: 'user_id,payer_name,cadence' })
      .select('id')
      .single();
    if (error) throw error;

    // Sync user-level pay cycle hint for fast home-screen render
    await supabase
      .from('users')
      .update({
        pay_cycle_type: body.cadence,
        pay_cycle_anchor_date: body.anchorDate,
        pay_amount_estimate_cents: body.amountEstimateCents,
      })
      .eq('id', userId);

    return jsonResponse({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'pay-cycle:upsert' });
    return errorResponse(500, 'pay cycle update failed');
  }
}

const FixedObligationBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  amountCents: z.number().int().nonnegative(),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly', 'four_weekly', 'irregular']),
  expectedDayOfMonth: z.number().int().min(1).max(31).optional(),
  isActive: z.boolean().default(true),
  accountId: z.string().uuid().optional(),
  categorySlug: z.string().optional(),
});

export async function handleFixedObligationUpsert(req: Request): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const body = await readJsonBody(req, (raw) => FixedObligationBody.parse(raw));

    let categoryId: string | null = null;
    if (body.categorySlug) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', body.categorySlug)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    const row = {
      user_id: userId,
      name: body.name,
      amount_cents: body.amountCents,
      cadence: body.cadence,
      expected_day_of_month: body.expectedDayOfMonth ?? null,
      is_active: body.isActive,
      account_id: body.accountId ?? null,
      category_id: categoryId,
    };

    if (body.id) {
      const { error } = await supabase
        .from('fixed_obligations')
        .update(row)
        .eq('id', body.id)
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, id: body.id });
    }

    // Atomic upsert keyed on the migration-installed unique index
    // (user_id, name, cadence). Concurrent confirm-fixed calls collapse.
    const { data, error } = await supabase
      .from('fixed_obligations')
      .upsert(row, { onConflict: 'user_id,name,cadence' })
      .select('id')
      .single();
    if (error) throw error;
    return jsonResponse({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'fixed-obligation:upsert' });
    return errorResponse(500, 'fixed obligation update failed');
  }
}

export async function handleFixedObligationDelete(req: Request, id: string): Promise<Response> {
  try {
    const { userId, supabase } = await authenticate(req);
    const { error } = await supabase.from('fixed_obligations').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return errorResponse(401, e.message);
    captureError(e, { handler: 'fixed-obligation:delete', id });
    return errorResponse(500, 'fixed obligation delete failed');
  }
}
