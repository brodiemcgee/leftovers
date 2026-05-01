-- Leftovers — RLS isolation test
-- Proves that user A cannot see user B's data through the API role.
-- Run with: psql -f supabase/tests/rls_isolation.test.sql against a local Supabase instance.

begin;

-- Create two synthetic auth users
do $$
declare
  v_uid_a uuid := '00000000-0000-0000-0000-000000000a01';
  v_uid_b uuid := '00000000-0000-0000-0000-000000000b01';
begin
  insert into auth.users (id, email)
    values (v_uid_a, 'a@example.test'), (v_uid_b, 'b@example.test')
    on conflict (id) do nothing;

  -- public.users rows are normally created by the on_auth_user_created trigger; ensure they exist
  insert into public.users (id, email) values (v_uid_a, 'a@example.test'), (v_uid_b, 'b@example.test')
    on conflict (id) do nothing;

  -- A's data
  insert into public.connections (user_id, source, source_connection_id, display_name)
    values (v_uid_a, 'up', 'A-CONN-1', 'A''s Up');
  insert into public.accounts (user_id, source, source_account_id, display_name, account_type)
    values (v_uid_a, 'up', 'A-ACC-1', 'A Spending', 'transaction');

  -- B's data
  insert into public.connections (user_id, source, source_connection_id, display_name)
    values (v_uid_b, 'up', 'B-CONN-1', 'B''s Up');
  insert into public.accounts (user_id, source, source_account_id, display_name, account_type)
    values (v_uid_b, 'up', 'B-ACC-1', 'B Spending', 'transaction');
end $$;

-- =====================================================================
-- Switch to authenticated role as user A
-- =====================================================================
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000a01';

do $$
declare
  v_a_count int;
  v_b_count int;
begin
  -- A should see exactly their own connections
  select count(*) into v_a_count from public.connections where source_connection_id = 'A-CONN-1';
  if v_a_count <> 1 then raise exception 'A should see own connection (got %)', v_a_count; end if;

  -- A must NOT see B's connections
  select count(*) into v_b_count from public.connections where source_connection_id = 'B-CONN-1';
  if v_b_count <> 0 then raise exception 'A leaked B''s connection (got %)', v_b_count; end if;

  -- Same for accounts
  select count(*) into v_a_count from public.accounts where source_account_id = 'A-ACC-1';
  if v_a_count <> 1 then raise exception 'A should see own account (got %)', v_a_count; end if;

  select count(*) into v_b_count from public.accounts where source_account_id = 'B-ACC-1';
  if v_b_count <> 0 then raise exception 'A leaked B''s account (got %)', v_b_count; end if;

  -- A should not be able to insert with B's user_id
  begin
    insert into public.accounts (user_id, source, source_account_id, display_name, account_type)
      values ('00000000-0000-0000-0000-000000000b01', 'up', 'A-FAKE', 'spoof', 'transaction');
    raise exception 'A inserted a row owned by B — RLS violation';
  exception when others then
    -- expected
    null;
  end;
end $$;

-- =====================================================================
-- Switch to user B and verify the same boundary the other way
-- =====================================================================
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000b01';

do $$
declare
  v_b_count int;
  v_a_count int;
begin
  select count(*) into v_b_count from public.accounts where source_account_id = 'B-ACC-1';
  if v_b_count <> 1 then raise exception 'B should see own account (got %)', v_b_count; end if;

  select count(*) into v_a_count from public.accounts where source_account_id = 'A-ACC-1';
  if v_a_count <> 0 then raise exception 'B leaked A''s account (got %)', v_a_count; end if;
end $$;

reset role;

rollback;
