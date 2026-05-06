-- Spread a single transaction's spending impact across N days. The user
-- buys $96 of petrol on a Tuesday but plans to use that fuel over a
-- fortnight; from the daily-allowance widget's perspective that's
-- $96 ÷ 14 ≈ $6.86 per day for two weeks, not a $96 spike on Tuesday.
--
-- Default is 1 (= no amortisation, behaves exactly as before). Monthly
-- spent_cents calculations still use the full amount in the period the
-- transaction was posted; amortisation only changes the per-day display.

alter table public.transactions
  add column if not exists amortise_days int not null default 1
    check (amortise_days >= 1 and amortise_days <= 366);

create index if not exists transactions_amortise_window_idx
  on public.transactions (user_id, classification, posted_at)
  where amortise_days > 1;
