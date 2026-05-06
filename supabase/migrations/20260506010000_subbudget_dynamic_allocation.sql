-- Sub-budgets become dynamic: instead of (or in addition to) a fixed
-- target_cents, an envelope can request a percentage of the user's
-- monthly headroom (income − fixed) capped at a maximum amount. When
-- a capped envelope leaves money on the table, the surplus flows into
-- envelopes flagged `receives_overflow` proportional to their pct.
--
-- The compute happens in the API layer (we already query headroom there);
-- this migration just adds the columns. Existing rows default to the
-- legacy "fixed target_cents" behaviour.

alter table public.sub_budgets
  add column if not exists percentage numeric(5,2)
    check (percentage is null or (percentage >= 0 and percentage <= 100)),
  add column if not exists cap_cents bigint
    check (cap_cents is null or cap_cents >= 0),
  add column if not exists receives_overflow boolean not null default false;

-- Surface the new columns in the existing progress view so the API can
-- compute a dynamic target without an extra round-trip. The column list
-- changes (we're adding categories + alloc fields), and Postgres won't
-- let CREATE OR REPLACE VIEW reorder existing columns, so drop first.
drop view if exists public.sub_budget_progress;

create view public.sub_budget_progress
with (security_invoker = true)
as

select
  sb.id,
  sb.user_id,
  sb.name,
  sb.target_cents,
  sb.is_catchall,
  sb.display_order,
  sb.category_id,
  sb.percentage,
  sb.cap_cents,
  sb.receives_overflow,
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
     and (
       (sb.is_catchall = false and sb.category_id is not null and t.category_id = sb.category_id)
       or
       (sb.is_catchall = true and (
         t.category_id is null
         or t.category_id not in (
           select sb2.category_id
             from public.sub_budgets sb2
            where sb2.user_id = sb.user_id
              and sb2.is_catchall = false
              and sb2.category_id is not null
         )
       ))
     )
) spend on true;

grant select on public.sub_budget_progress to authenticated;
