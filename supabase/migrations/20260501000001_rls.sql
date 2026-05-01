-- Leftovers — Row-level security policies
-- Every user-owned table allows SELECT/INSERT/UPDATE/DELETE only when row.user_id = auth.uid().
-- Service role bypasses RLS automatically (used by Vercel Edge Functions).

-- Enable RLS on every user-owned table
alter table public.users                     enable row level security;
alter table public.connections               enable row level security;
alter table public.accounts                  enable row level security;
alter table public.categories                enable row level security;
alter table public.transactions              enable row level security;
alter table public.categorisation_rules      enable row level security;
alter table public.fixed_obligations         enable row level security;
alter table public.pay_cycles                enable row level security;
alter table public.sub_budgets               enable row level security;
alter table public.recurring_groups          enable row level security;
alter table public.sync_events               enable row level security;
alter table public.llm_calls                 enable row level security;
alter table public.notification_deliveries   enable row level security;

-- =====================================================================
-- users — a user can only read/update their own row; insert is via trigger
-- =====================================================================

create policy users_self_select on public.users
  for select using (id = auth.uid());

create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =====================================================================
-- Generic owner-only policies (one block per table)
-- =====================================================================

-- connections
create policy connections_owner_select on public.connections
  for select using (user_id = auth.uid());
create policy connections_owner_insert on public.connections
  for insert with check (user_id = auth.uid());
create policy connections_owner_update on public.connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy connections_owner_delete on public.connections
  for delete using (user_id = auth.uid());

-- accounts
create policy accounts_owner_select on public.accounts
  for select using (user_id = auth.uid());
create policy accounts_owner_insert on public.accounts
  for insert with check (user_id = auth.uid());
create policy accounts_owner_update on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_owner_delete on public.accounts
  for delete using (user_id = auth.uid());

-- categories — system rows (user_id is null) readable by everyone, owner rows by owner
create policy categories_system_or_owner_select on public.categories
  for select using (user_id is null or user_id = auth.uid());
create policy categories_owner_insert on public.categories
  for insert with check (user_id = auth.uid());
create policy categories_owner_update on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_owner_delete on public.categories
  for delete using (user_id = auth.uid());

-- transactions
create policy transactions_owner_select on public.transactions
  for select using (user_id = auth.uid());
create policy transactions_owner_insert on public.transactions
  for insert with check (user_id = auth.uid());
create policy transactions_owner_update on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_owner_delete on public.transactions
  for delete using (user_id = auth.uid());

-- categorisation_rules — system rules (user_id null) readable by everyone, owner rows by owner
create policy rules_system_or_owner_select on public.categorisation_rules
  for select using (user_id is null or user_id = auth.uid());
create policy rules_owner_insert on public.categorisation_rules
  for insert with check (user_id = auth.uid());
create policy rules_owner_update on public.categorisation_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rules_owner_delete on public.categorisation_rules
  for delete using (user_id = auth.uid());

-- fixed_obligations
create policy fixed_obligations_owner_select on public.fixed_obligations
  for select using (user_id = auth.uid());
create policy fixed_obligations_owner_insert on public.fixed_obligations
  for insert with check (user_id = auth.uid());
create policy fixed_obligations_owner_update on public.fixed_obligations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fixed_obligations_owner_delete on public.fixed_obligations
  for delete using (user_id = auth.uid());

-- pay_cycles
create policy pay_cycles_owner_select on public.pay_cycles
  for select using (user_id = auth.uid());
create policy pay_cycles_owner_insert on public.pay_cycles
  for insert with check (user_id = auth.uid());
create policy pay_cycles_owner_update on public.pay_cycles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pay_cycles_owner_delete on public.pay_cycles
  for delete using (user_id = auth.uid());

-- sub_budgets
create policy sub_budgets_owner_select on public.sub_budgets
  for select using (user_id = auth.uid());
create policy sub_budgets_owner_insert on public.sub_budgets
  for insert with check (user_id = auth.uid());
create policy sub_budgets_owner_update on public.sub_budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sub_budgets_owner_delete on public.sub_budgets
  for delete using (user_id = auth.uid());

-- recurring_groups
create policy recurring_groups_owner_select on public.recurring_groups
  for select using (user_id = auth.uid());
create policy recurring_groups_owner_insert on public.recurring_groups
  for insert with check (user_id = auth.uid());
create policy recurring_groups_owner_update on public.recurring_groups
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recurring_groups_owner_delete on public.recurring_groups
  for delete using (user_id = auth.uid());

-- sync_events — read-only for owner; service role does inserts
create policy sync_events_owner_select on public.sync_events
  for select using (user_id = auth.uid());

-- llm_calls — read-only for owner; service role does inserts
create policy llm_calls_owner_select on public.llm_calls
  for select using (user_id = auth.uid());

-- notification_deliveries — read-only for owner; service role does inserts
create policy notification_deliveries_owner_select on public.notification_deliveries
  for select using (user_id = auth.uid());

-- =====================================================================
-- Auth trigger — create a public.users row on signup
-- =====================================================================

create or replace function public.handle_new_auth_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into public.users (id, email, apple_user_id)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'sub',
      new.raw_user_meta_data ->> 'apple_user_id'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
