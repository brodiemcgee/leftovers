-- Leftovers — Derived views and functions
-- Headroom calculation lives in Postgres per PRD §F4 — never reimplemented in API or client.

-- =====================================================================
-- forecast_period_for_user — given a user + an "as of" timestamp,
-- return the (period_start, period_end) for "this month" using their
-- configured period mode. Default = calendar month.
-- =====================================================================

create or replace function public.forecast_period_for_user(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
stable
as $$
declare
  v_tz text;
  v_mode text;
  v_local_now timestamptz;
begin
  select coalesce(timezone, 'Australia/Melbourne'),
         coalesce(preferences ->> 'period_mode', 'calendar_month')
    into v_tz, v_mode
    from public.users
    where id = p_user_id;

  v_local_now := p_as_of at time zone v_tz;

  if v_mode = 'pay_cycle' then
    -- Pay-cycle period support is implemented in the API layer where pay
    -- forecast logic lives. For Postgres-side aggregation we still return
    -- the calendar month; the API overrides this where needed.
    period_start := date_trunc('month', v_local_now) at time zone v_tz;
    period_end   := (date_trunc('month', v_local_now) + interval '1 month') at time zone v_tz;
  else
    period_start := date_trunc('month', v_local_now) at time zone v_tz;
    period_end   := (date_trunc('month', v_local_now) + interval '1 month') at time zone v_tz;
  end if;
  return next;
end;
$$;

-- =====================================================================
-- forecast_income_for_period — sum of expected pays whose anchor falls
-- in [period_start, period_end). Forward-projects from anchor_date.
-- =====================================================================

create or replace function public.forecast_income_for_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns bigint
language plpgsql
stable
as $$
declare
  v_total bigint := 0;
  v_cycle record;
  v_local_start date;
  v_local_end date;
  v_tz text;
  v_dt date;
begin
  select coalesce(timezone, 'Australia/Melbourne') into v_tz from public.users where id = p_user_id;
  v_local_start := (p_period_start at time zone v_tz)::date;
  v_local_end   := (p_period_end at time zone v_tz)::date;

  for v_cycle in
    select cadence, anchor_date, amount_estimate_cents
      from public.pay_cycles
      where user_id = p_user_id and is_active
  loop
    -- Walk forward (and back) from anchor_date in cadence steps and count occurrences in window
    -- For tractability we walk a 90-day window either side; pay cycles never need more.
    v_dt := v_cycle.anchor_date;
    -- Rewind to before window
    while v_dt > v_local_start - interval '90 days' loop
      v_dt := v_dt - case v_cycle.cadence
        when 'weekly' then interval '7 days'
        when 'fortnightly' then interval '14 days'
        when 'four_weekly' then interval '28 days'
        when 'monthly' then interval '1 month'
        else interval '14 days'
      end;
    end loop;
    -- Walk forward, accumulate hits inside window
    while v_dt < v_local_end + interval '90 days' loop
      if v_dt >= v_local_start and v_dt < v_local_end then
        v_total := v_total + v_cycle.amount_estimate_cents;
      end if;
      v_dt := v_dt + case v_cycle.cadence
        when 'weekly' then interval '7 days'
        when 'fortnightly' then interval '14 days'
        when 'four_weekly' then interval '28 days'
        when 'monthly' then interval '1 month'
        else interval '14 days'
      end;
    end loop;
  end loop;

  return v_total;
end;
$$;

-- =====================================================================
-- forecast_fixed_for_period — sum of active fixed obligations whose
-- next_expected_date falls within the period.
-- =====================================================================

create or replace function public.forecast_fixed_for_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns bigint
language sql
stable
as $$
  select coalesce(sum(amount_cents), 0)::bigint
    from public.fixed_obligations fo
    where fo.user_id = p_user_id
      and fo.is_active
      and fo.next_expected_date is not null
      and (fo.next_expected_date >= (p_period_start at time zone (
        coalesce((select timezone from public.users where id = p_user_id), 'Australia/Melbourne')
      ))::date
        and fo.next_expected_date < (p_period_end at time zone (
        coalesce((select timezone from public.users where id = p_user_id), 'Australia/Melbourne')
      ))::date);
$$;

-- =====================================================================
-- spent_discretionary_for_period — already-spent discretionary in period,
-- excluding internal transfers. Refunds reduce spend (don't count as income).
-- =====================================================================

create or replace function public.spent_discretionary_for_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns bigint
language sql
stable
as $$
  -- Outflows (negative amounts) classified as discretionary, summed as positive cents.
  -- Refunds (positive amounts) classified as 'refund' reduce spend.
  with discretionary_spend as (
    select coalesce(sum(case when amount_cents < 0 then -amount_cents else 0 end), 0) as total
      from public.transactions
      where user_id = p_user_id
        and posted_at >= p_period_start
        and posted_at <  p_period_end
        and classification = 'discretionary'
  ),
  refunds as (
    select coalesce(sum(case when amount_cents > 0 then amount_cents else 0 end), 0) as total
      from public.transactions
      where user_id = p_user_id
        and posted_at >= p_period_start
        and posted_at <  p_period_end
        and classification = 'refund'
  )
  select greatest(0, (select total from discretionary_spend) - (select total from refunds))::bigint;
$$;

-- =====================================================================
-- headroom_for_user — the hero number (PRD §F4)
-- =====================================================================

create or replace function public.headroom_for_user(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns table (
  period_start timestamptz,
  period_end timestamptz,
  forecast_income_cents bigint,
  forecast_fixed_cents bigint,
  spent_discretionary_cents bigint,
  headroom_cents bigint,
  days_remaining integer,
  daily_burn_cents bigint
)
language plpgsql
stable
as $$
declare
  v_period record;
  v_income bigint;
  v_fixed bigint;
  v_spent bigint;
  v_headroom bigint;
  v_days_remaining integer;
begin
  select * into v_period from public.forecast_period_for_user(p_user_id, p_as_of);
  v_income := public.forecast_income_for_period(p_user_id, v_period.period_start, v_period.period_end);
  v_fixed  := public.forecast_fixed_for_period(p_user_id, v_period.period_start, v_period.period_end);
  v_spent  := public.spent_discretionary_for_period(p_user_id, v_period.period_start, v_period.period_end);
  v_headroom := v_income - v_fixed - v_spent;

  v_days_remaining := greatest(0, ceil(extract(epoch from (v_period.period_end - p_as_of)) / 86400)::integer);

  period_start := v_period.period_start;
  period_end   := v_period.period_end;
  forecast_income_cents := v_income;
  forecast_fixed_cents := v_fixed;
  spent_discretionary_cents := v_spent;
  headroom_cents := v_headroom;
  days_remaining := v_days_remaining;
  daily_burn_cents := case when v_days_remaining > 0 then (v_headroom / v_days_remaining)::bigint else 0::bigint end;
  return next;
end;
$$;

grant execute on function public.headroom_for_user(uuid, timestamptz) to authenticated;
grant execute on function public.forecast_period_for_user(uuid, timestamptz) to authenticated;
grant execute on function public.forecast_income_for_period(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.forecast_fixed_for_period(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.spent_discretionary_for_period(uuid, timestamptz, timestamptz) to authenticated;

-- =====================================================================
-- current_month_burn_rate — running daily average of discretionary spend
-- =====================================================================

create or replace function public.current_month_burn_rate(p_user_id uuid)
returns bigint
language plpgsql
stable
as $$
declare
  v_period record;
  v_spent bigint;
  v_days_elapsed integer;
begin
  select * into v_period from public.forecast_period_for_user(p_user_id, now());
  v_spent := public.spent_discretionary_for_period(p_user_id, v_period.period_start, now());
  v_days_elapsed := greatest(1, ceil(extract(epoch from (now() - v_period.period_start)) / 86400)::integer);
  return (v_spent / v_days_elapsed)::bigint;
end;
$$;

grant execute on function public.current_month_burn_rate(uuid) to authenticated;

-- =====================================================================
-- sub_budget_progress — current spend against each sub-budget
-- =====================================================================

create or replace view public.sub_budget_progress
with (security_invoker = true)
as
select
  sb.id,
  sb.user_id,
  sb.name,
  sb.target_cents,
  sb.is_catchall,
  sb.display_order,
  coalesce(spend.spent_cents, 0)::bigint as spent_cents
from public.sub_budgets sb
left join lateral (
  select sum(case when t.amount_cents < 0 then -t.amount_cents else 0 end)::bigint as spent_cents
    from public.transactions t
    cross join public.forecast_period_for_user(sb.user_id, now()) p
   where t.user_id = sb.user_id
     and t.posted_at >= p.period_start
     and t.posted_at <  p.period_end
     and t.classification = 'discretionary'
     and (sb.category_id is null or t.category_id = sb.category_id)
) spend on true;

grant select on public.sub_budget_progress to authenticated;

-- =====================================================================
-- internal_transfer_pair — RPC to mark two transactions as paired
-- internal transfers. Service role only (called from sync worker).
-- =====================================================================

create or replace function public.internal_transfer_pair(
  p_user_id uuid,
  p_outbound_id uuid,
  p_inbound_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions
     set classification = 'internal',
         paired_transaction_id = p_inbound_id,
         classified_by = 'system',
         updated_at = now()
   where id = p_outbound_id and user_id = p_user_id;

  update public.transactions
     set classification = 'internal',
         paired_transaction_id = p_outbound_id,
         classified_by = 'system',
         updated_at = now()
   where id = p_inbound_id and user_id = p_user_id;
end;
$$;
