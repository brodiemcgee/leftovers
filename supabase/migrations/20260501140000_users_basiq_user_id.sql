-- Per-user Basiq user id. Created lazily the first time the user starts
-- the Basiq consent flow. One Basiq user per Leftovers user; multiple
-- bank connections can hang off it via the Basiq /users/{id}/connections
-- API, surfaced to us in our connections table by source='basiq' rows.

alter table public.users
  add column if not exists basiq_user_id text unique;
