-- Leftovers — Initial schema (PRD §10)
-- All money is stored as integer cents. All timestamps are timestamptz.
-- RLS is enforced on every user-owned table; policies live in 20260501000001_rls.sql.

set check_function_bodies = off;

create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "pg_trgm" with schema "extensions";

-- =====================================================================
-- Enumerated types
-- =====================================================================

create type public.account_type as enum (
  'transaction',
  'savings',
  'credit',
  'offset',
  'saver_bucket'
);

create type public.account_source as enum (
  'up',
  'basiq'
);

create type public.transaction_classification as enum (
  'fixed',
  'discretionary',
  'internal',
  'income',
  'refund'
);

create type public.classified_by as enum (
  'rule',
  'recurrence',
  'llm',
  'user',
  'system'
);

create type public.pay_cadence as enum (
  'weekly',
  'fortnightly',
  'monthly',
  'four_weekly',
  'irregular'
);

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete'
);

create type public.rule_source as enum (
  'system',
  'user_correction'
);

-- =====================================================================
-- Users
-- =====================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  apple_user_id text unique,
  email text,
  display_name text,
  timezone text not null default 'Australia/Melbourne',
  pay_cycle_type public.pay_cadence,
  pay_cycle_anchor_date date,
  pay_amount_estimate_cents bigint check (pay_amount_estimate_cents is null or pay_amount_estimate_cents >= 0),
  preferences jsonb not null default '{}'::jsonb,
  subscription_status public.subscription_status not null default 'trialing',
  subscription_current_period_end timestamptz,
  llm_categorisation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_apple_user_id_idx on public.users (apple_user_id);

-- =====================================================================
-- Connections (an OAuth link to a bank source — Up or Basiq institution)
-- =====================================================================

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source public.account_source not null,
  source_connection_id text not null,
  display_name text not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  webhook_secret_encrypted text,
  status text not null default 'active',
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_connection_id)
);

create index connections_user_id_idx on public.connections (user_id);

-- =====================================================================
-- Accounts (bank accounts, credit cards, savers, offsets)
-- =====================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  source public.account_source not null,
  source_account_id text not null,
  parent_account_id uuid references public.accounts(id) on delete set null,
  display_name text not null,
  account_type public.account_type not null,
  currency text not null default 'AUD',
  balance_cents bigint not null default 0,
  balance_updated_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_account_id)
);

create index accounts_user_id_idx on public.accounts (user_id);
create index accounts_connection_id_idx on public.accounts (connection_id);
create index accounts_parent_account_id_idx on public.accounts (parent_account_id);

-- =====================================================================
-- Categories (system + user-scoped)
-- =====================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  slug text not null,
  name text not null,
  parent_category_id uuid references public.categories(id) on delete set null,
  default_classification public.transaction_classification not null,
  icon text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index categories_user_id_idx on public.categories (user_id);

-- =====================================================================
-- Recurring groups (clusters of transactions detected as recurring)
-- =====================================================================

create table public.recurring_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  merchant_normalised text not null,
  amount_min_cents bigint not null,
  amount_max_cents bigint not null,
  cadence_days integer not null,
  next_expected_date date,
  confidence_score numeric(3, 2) not null check (confidence_score >= 0 and confidence_score <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_normalised, cadence_days)
);

create index recurring_groups_user_id_idx on public.recurring_groups (user_id);

-- =====================================================================
-- Transactions
-- =====================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  source_transaction_id text not null,
  posted_at timestamptz not null,
  amount_cents bigint not null,
  currency text not null default 'AUD',
  merchant_raw text,
  merchant_normalised text,
  description text,
  location text,
  category_id uuid references public.categories(id) on delete set null,
  classification public.transaction_classification,
  is_recurring boolean not null default false,
  recurring_group_id uuid references public.recurring_groups(id) on delete set null,
  paired_transaction_id uuid references public.transactions(id) on delete set null,
  confidence_score numeric(3, 2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  classified_by public.classified_by,
  user_overridden boolean not null default false,
  classification_reasoning text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_transaction_id)
);

create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_user_posted_idx on public.transactions (user_id, posted_at desc);
create index transactions_account_posted_idx on public.transactions (account_id, posted_at desc);
create index transactions_recurring_group_idx on public.transactions (recurring_group_id);
create index transactions_classification_idx on public.transactions (user_id, classification, posted_at);
create index transactions_paired_idx on public.transactions (paired_transaction_id);
create index transactions_merchant_trgm_idx on public.transactions using gin (merchant_normalised extensions.gin_trgm_ops);

-- =====================================================================
-- Categorisation rules (system + user-correction)
-- =====================================================================

create table public.categorisation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  merchant_pattern text not null,
  pattern_type text not null default 'substring' check (pattern_type in ('substring', 'regex')),
  category_id uuid references public.categories(id) on delete set null,
  classification public.transaction_classification not null,
  source public.rule_source not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categorisation_rules_user_id_idx on public.categorisation_rules (user_id);
create index categorisation_rules_priority_idx on public.categorisation_rules (user_id, priority desc, is_active);

-- =====================================================================
-- Fixed obligations (user-confirmed bills/subscriptions/mortgage)
-- =====================================================================

create table public.fixed_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  recurring_group_id uuid references public.recurring_groups(id) on delete set null,
  name text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  cadence public.pay_cadence not null,
  expected_day_of_month integer check (expected_day_of_month between 1 and 31),
  next_expected_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fixed_obligations_user_id_idx on public.fixed_obligations (user_id);
create index fixed_obligations_active_idx on public.fixed_obligations (user_id, is_active);

-- =====================================================================
-- Pay cycles (one user can have multiple active jobs)
-- =====================================================================

create table public.pay_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_account_id uuid references public.accounts(id) on delete set null,
  payer_name text not null,
  cadence public.pay_cadence not null,
  anchor_date date not null,
  amount_estimate_cents bigint not null check (amount_estimate_cents >= 0),
  amount_variance_cents bigint not null default 0 check (amount_variance_cents >= 0),
  is_primary boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pay_cycles_user_id_idx on public.pay_cycles (user_id);

-- =====================================================================
-- Sub-budgets (4–6 per user, configurable)
-- =====================================================================

create table public.sub_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  target_cents bigint not null check (target_cents >= 0),
  is_catchall boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sub_budgets_user_id_idx on public.sub_budgets (user_id);
create unique index sub_budgets_one_catchall_per_user on public.sub_budgets (user_id) where is_catchall;

-- =====================================================================
-- Sync events (audit trail of bank sync runs)
-- =====================================================================

create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  source public.account_source not null,
  status text not null,
  transactions_added integer not null default 0,
  transactions_updated integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index sync_events_user_started_idx on public.sync_events (user_id, started_at desc);

-- =====================================================================
-- LLM calls (cost + audit trail)
-- =====================================================================

create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  model text not null,
  prompt_tokens integer not null,
  completion_tokens integer not null,
  cost_micros_aud bigint not null default 0,
  response_json jsonb,
  created_at timestamptz not null default now()
);

create index llm_calls_user_created_idx on public.llm_calls (user_id, created_at desc);

-- =====================================================================
-- Notification deliveries
-- =====================================================================

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  sent_at timestamptz not null default now()
);

create index notification_deliveries_user_idx on public.notification_deliveries (user_id, sent_at desc);

-- =====================================================================
-- Updated-at triggers
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger connections_updated_at before update on public.connections
  for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger categorisation_rules_updated_at before update on public.categorisation_rules
  for each row execute function public.set_updated_at();
create trigger fixed_obligations_updated_at before update on public.fixed_obligations
  for each row execute function public.set_updated_at();
create trigger pay_cycles_updated_at before update on public.pay_cycles
  for each row execute function public.set_updated_at();
create trigger sub_budgets_updated_at before update on public.sub_budgets
  for each row execute function public.set_updated_at();
create trigger recurring_groups_updated_at before update on public.recurring_groups
  for each row execute function public.set_updated_at();
