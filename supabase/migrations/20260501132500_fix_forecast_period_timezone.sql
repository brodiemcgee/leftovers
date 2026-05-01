-- Fix the timezone arithmetic in forecast_period_for_user.
--
-- The previous version declared `v_local_now timestamptz` and assigned
-- `p_as_of at time zone v_tz` to it. That expression evaluates to
-- `timestamp without time zone` (a naive local-time stamp). Implicit
-- assignment to a timestamptz variable then re-interprets the bare
-- timestamp as UTC, double-converting and shifting the result by
-- the timezone offset (10 hours for Australia/Melbourne).
--
-- The visible symptom: spent_discretionary_for_period returned 0 because
-- the period's UTC start was 10 hours after the real local-midnight start,
-- so all of "today"'s morning transactions fell BEFORE the period.
--
-- Fix: drop the intermediate variable and inline the truncation. Also
-- add an explicit local::timestamp cast where helpful.

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
  v_local_now timestamp;  -- naive local time, NOT timestamptz
begin
  select coalesce(timezone, 'Australia/Melbourne'),
         coalesce(preferences ->> 'period_mode', 'calendar_month')
    into v_tz, v_mode
    from public.users
    where id = p_user_id;

  v_local_now := (p_as_of at time zone v_tz);

  -- Pay-cycle period support is implemented in the API layer where pay
  -- forecast logic lives. Postgres-side aggregation always uses calendar month.
  period_start := (date_trunc('month', v_local_now)::timestamp) at time zone v_tz;
  period_end   := ((date_trunc('month', v_local_now) + interval '1 month')::timestamp) at time zone v_tz;
  return next;
end;
$$;
