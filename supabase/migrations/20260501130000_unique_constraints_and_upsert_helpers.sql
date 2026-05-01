-- Add unique constraints so concurrent confirm-pay/confirm-fixed calls can't
-- create duplicate rows. Onboarding's iOS view fires the request multiple
-- times under some navigation patterns; the prior application-level
-- "select-then-insert" dedup wasn't atomic.

create unique index if not exists pay_cycles_user_payer_cadence_uidx
  on public.pay_cycles (user_id, payer_name, cadence);

create unique index if not exists fixed_obligations_user_name_cadence_uidx
  on public.fixed_obligations (user_id, name, cadence);
