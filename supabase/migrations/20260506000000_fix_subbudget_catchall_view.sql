-- Fix sub_budget_progress.spent_cents for the catch-all envelope.
--
-- The previous version used:
--     and (sb.category_id is null or t.category_id = sb.category_id)
-- so when sb.category_id IS NULL (the catch-all), the predicate collapsed to
-- TRUE and the view summed every discretionary transaction in the period —
-- including ones already covered by other envelopes. That double-counted
-- spending and made the catch-all balance look much worse than it really
-- was.
--
-- Correct semantics: catch-all = "what isn't covered by any other envelope's
-- category". Walk the user's other envelopes and exclude their categories.

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
     and (
       -- Bound envelope: match its category exactly.
       (sb.is_catchall = false and sb.category_id is not null and t.category_id = sb.category_id)
       or
       -- Catch-all: anything not in another envelope's category.
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
