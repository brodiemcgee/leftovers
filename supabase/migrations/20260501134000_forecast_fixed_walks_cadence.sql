-- forecast_fixed_for_period was only counting ONE occurrence per obligation
-- per period — fine for monthly/four_weekly bills but wrong for fortnightly
-- and weekly, where May has 2-4 occurrences. Now we walk the cadence the
-- same way forecast_income_for_period does, counting every projected
-- payment in [period_start, period_end).

create or replace function public.forecast_fixed_for_period(
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
  v_obl record;
  v_local_start date;
  v_local_end date;
  v_tz text;
  v_dt date;
  v_step interval;
begin
  select coalesce(timezone, 'Australia/Melbourne') into v_tz from public.users where id = p_user_id;
  v_local_start := (p_period_start at time zone v_tz)::date;
  v_local_end   := (p_period_end at time zone v_tz)::date;

  for v_obl in
    select cadence, expected_day_of_month, next_expected_date, amount_cents
      from public.fixed_obligations
      where user_id = p_user_id
        and is_active
        and next_expected_date is not null
  loop
    v_step := case v_obl.cadence
      when 'weekly'      then interval '7 days'
      when 'fortnightly' then interval '14 days'
      when 'four_weekly' then interval '28 days'
      when 'monthly'     then interval '1 month'
      else interval '1 month'
    end;

    -- Anchor at the recorded next_expected_date and walk forward + back so
    -- that all occurrences inside [period_start, period_end) are counted.
    v_dt := v_obl.next_expected_date;
    -- Rewind until BEFORE the period
    while v_dt >= v_local_start loop
      v_dt := (v_dt - v_step)::date;
    end loop;
    -- Walk forward, counting hits in window
    loop
      v_dt := (v_dt + v_step)::date;
      exit when v_dt >= v_local_end;
      if v_dt >= v_local_start then
        v_total := v_total + v_obl.amount_cents;
      end if;
    end loop;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.forecast_fixed_for_period(uuid, timestamptz, timestamptz) to authenticated;
