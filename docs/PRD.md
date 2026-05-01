# Leftovers — Product Requirements Document

**Working name:** Leftovers (renamed from Headroom — see `docs/DECISIONS.md`)
**Owner:** Brodie McGee
**Status:** Draft v1.0
**Date:** 30 April 2026
**Platform:** iOS (Swift / SwiftUI)
**Market:** Australia (initial)

---

## 1. Executive summary

Headroom is a personal-finance app for salaried individuals with multiple accounts (transaction, savings buckets, offset, credit card) who want a single, honest answer to one question: **"How much can I spend this month without going backwards?"**

Existing budgeting apps fail this test. They show dozens of metrics and graphs but rarely surface the one number that drives behaviour. They also break in three specific ways that this PRD addresses:

1. They assume calendar-month income, ignoring fortnightly pay cycles where some months catch three pays and most catch two.
2. They can't distinguish internal transfers from external spending, so net worth changes look messy.
3. They categorise transactions poorly, especially in Australian markets where merchant strings are inconsistent and one-off purchases (annual gear, dentist, gifts) get conflated with monthly habits.

Headroom solves these by combining bank/card sync with a layered categorisation pipeline (rules → recurrence detection → LLM fallback → user feedback), pay-cycle-aware income forecasting, and a deliberately spartan UI built around one hero metric.

---

## 2. Problem & opportunity

### The user problem

Even financially literate users with bucketing systems (Up Savers, offset accounts, etc.) experience two recurring confusions:

- **The "I have savings but no money" paradox.** Salary lands, gets allocated to savers, then mortgage and bills consume most of it. The spending account stays empty even though "savings" technically grew. Users can't tell if they're ahead or behind.
- **The "splurge then catch up" cycle.** A single large purchase (flights, holiday accommodation, annual gear) blows through a month's budget and silently parks on a credit card. The card balance grows for months while the user believes they're managing fine because day-to-day spending feels normal.

### Why now

- **Open Banking (CDR) maturity in Australia.** Bank data aggregation is now reliable via Basiq and direct APIs (Up). Five years ago this would have required screen-scraping.
- **LLM-based categorisation is cheap.** Claude Haiku and similar models can classify a transaction for fractions of a cent, eliminating the historical "build and maintain a giant rules engine" problem.
- **Existing players (Pocketbook, MoneyBrilliant, WeMoney) optimise for retention via dashboards and insights, not for behaviour change via a single number.** There's a gap for a deliberately minimal product.

### Opportunity

A subscription iOS app, AUD $5–8/month, targeting Australian salaried professionals with at least one credit card and one savings/offset structure. The category isn't huge (~2–3M addressable users) but the willingness to pay is high among users who currently use spreadsheets.

---

## 3. Goals & non-goals

### Goals

- Surface a single, accurate "discretionary remaining this month" number that adjusts in real time as transactions sync.
- Forecast that number forward to month-end based on current pace and known upcoming bills.
- Auto-classify transactions into Fixed / Discretionary / Internal-Transfer with ≥95% accuracy after the first month of usage.
- Detect pay cadence (weekly, fortnightly, monthly, irregular) automatically from synced transactions.
- Pair refunds and reimbursements with their original charges and prompt the user to redirect them to credit-card paydown.
- Make the cost of a contemplated purchase immediately visible before it happens (e.g. quick-add: "if I spend $400 today, I'll have $X left").

### Non-goals (explicitly out of scope)

- Investment portfolio tracking, share trading, crypto.
- Bill negotiation, switching utilities, broking products.
- Joint / household budgeting (deferred to v2).
- Goals-based saving (e.g. "save for a house deposit"). The bucketing already exists in user banks (Up Savers); duplicating it adds friction.
- Receipt scanning / OCR.
- Tax preparation.
- Coaching or human advice (regulatory exposure too high).

---

## 4. Target user

### Primary persona — "Bucketed Brodie"

- 28–45, salaried, fortnightly pay
- Owns property with offset account; has one or two credit cards
- Uses Up, Macquarie, ING, or similar app-first bank with sub-account structures
- Already uses bucketing or virtual savings categories
- Comfortable with finance concepts but wants to spend less time tracking
- Has occasionally been surprised by credit-card balance growth despite "good months"

### Jobs to be done

- *"Tell me, before this purchase, whether I can afford it this month."*
- *"Tell me whether last month was actually a good month or whether I'm just confused."*
- *"Make sure money I get back from insurance / refunds / Uber Eats / family doesn't quietly disappear."*
- *"Don't make me think about the calendar — work out from my pay schedule what 'this month' actually means."*

### Anti-persona

- Cash-only users with no bank app integration
- Users with highly irregular income (freelancers, gig workers) — handled poorly by the current model and deferred
- Users seeking financial advice, coaching, or product recommendations

---

## 5. Product principles

1. **One number, defended fiercely.** The home screen has exactly one hero number. Everything else is secondary.
2. **The app should disappear after onboarding.** Daily engagement isn't a goal; pre-purchase glances are.
3. **Be honest about the trade-offs.** Show what was excluded from the headline (e.g. internal transfers) with one tap, never bury it.
4. **Default to the user's bank's structure, don't replace it.** If the user has a Holiday saver in Up, the app should read it, not ask them to recreate it.
5. **No streaks, no badges, no gamification.** This is a money app, not a habit tracker.

---

## 6. User experience

### Information architecture

```
Home (hero number)
├── This month
│   ├── Sub-budgets (drill down per category)
│   ├── Upcoming bills
│   └── Daily timeline
├── Transactions (chronological feed)
│   └── Transaction detail (recategorise, pair, ignore)
├── Accounts (read-only summary)
└── Settings
    ├── Connected accounts
    ├── Pay cycle
    ├── Fixed obligations
    ├── Categorisation rules
    └── Subscription / billing
```

### Key flows

#### Flow A — First-time setup (≤3 minutes target)

1. Sign in with Apple
2. Connect first bank via Basiq / Up OAuth (~30 seconds)
3. Background sync pulls 90 days of history
4. App auto-detects salary cadence and shows: *"You're paid fortnightly, ~$3,778. Looks like 2 pays in May."* Confirm/edit
5. App auto-detects recurring fixed bills from history: *"Mortgage $3,666/mo. Health Insurance $28/fortnight. Optus $94/mo. These look like fixed bills — confirm?"*
6. Land on home screen with the hero number populated

#### Flow B — Daily glance (≤5 seconds target)

1. Open app
2. See "$X discretionary remaining this month" + daily burn rate
3. Optional: glance at pace pill (on track / slow down / ahead)
4. Close

#### Flow C — Pre-purchase check (≤10 seconds target)

1. Open app, tap quick-add
2. Type or voice: "$400"
3. See "Would leave you with $X for the rest of May ($Y/day)"
4. Decide and close (no commitment, nothing recorded)

#### Flow D — Refund pairing prompt (push notification, opt-in)

1. Refund detected hitting bank account
2. Push: *"AHM refund of $465 just landed. Looks like the dentist on 17 Apr. Move it to Amex?"*
3. Tap → app opens to a confirm screen showing the original charge + the refund + the recommended Amex paydown
4. One tap to copy the amount + open the user's bank app at the transfer screen (we don't actually move money — see §7)

#### Flow E — Categorisation correction

1. Open transaction detail
2. Tap current category → category picker
3. App asks: *"Apply to all future transactions from this merchant?"* → Yes / Just this one
4. Save; the rule is added to the user's personal model

### Screen-by-screen specs

#### S1. Home

- **Top bar**: month name, day-of-month progress
- **Hero**: "$X,XXX discretionary remaining" + subtitle "$Y/day for Z days"
- **Pace pill**: green/grey/red, with single-line reason
- **Progress bar**: spent vs budget for the month
- **Sub-budgets list**: 4–6 top categories, each with a horizontal progress bar (red overflow if exceeded)
- **Coming up card**: next 3 scheduled events (salary, mortgage, recurring bills) with dates

#### S2. Transaction detail

- Date, time, merchant, location, account, amount
- Category chips (tap to change) + Discretionary/Fixed/Internal toggle
- LLM confidence + 1-line rationale ("Looks like a small bar tab — 92% confidence")
- "Looks right / Recategorise" buttons
- Impact section: how this transaction changed the discretionary remaining + sub-budget

#### S3. Sub-budget detail

- Budget vs actual (current month)
- Last 6 months trend (small bar chart)
- Transactions in this category, newest first

#### S4. Accounts

- One row per connected account
- Balance + last sync time
- Tap → list of recent transactions for that account only

#### S5. Settings

- Connected accounts (add/remove)
- Pay cycle (auto-detected, editable)
- Fixed bills list (add/remove/edit amounts)
- Categorisation rules (view personal merchant rules)
- Privacy & data
- Subscription

---

## 7. Functional requirements

### F1. Account sync

- Support Up (direct API), Amex (via Basiq), Big 4 banks + ING + Macquarie + Bendigo (via Basiq)
- Sync cadence: webhook-driven where supported, otherwise polling every 6 hours
- 90 days of history pulled on connect; thereafter incremental
- User can manually trigger sync from any screen via pull-to-refresh
- Saver / sub-account balances exposed where the bank supports them (Up only at MVP)
- **Critical:** internal transfers between the user's own accounts must not double-count. Detect by matching amount + date ±1 day across two of the user's connected accounts.

### F2. Income & pay-cycle detection

- Detect recurring credits >$1,000 with same payee within ±10% amount and ±2 days cadence
- Classify as Salary if cadence is weekly / fortnightly / monthly / four-weekly
- Forecast next pay date(s) from detected cadence
- Surface to the user with a confirm prompt; user can override
- Recompute monthly headroom every time a new pay date falls in or out of the current period boundary

### F3. Fixed obligations

Sources of "Fixed" classification:

- Auto-detected via recurrence rules (same merchant, ±5% amount, monthly cadence)
- User-confirmed at onboarding
- Manually added by user (e.g. mortgage that comes from offset, not the spending account)

Each fixed obligation has: name, amount, expected date(s), source account, optional category. The total is subtracted from forecast income to compute discretionary headroom.

### F4. Discretionary calculation

```
Headroom (this month) = Forecast income (this month)
                      - Sum of fixed obligations falling in this month
                      - Already-spent discretionary (this month)
```

Where:

- Forecast income = sum of all expected pays falling in the period (inclusive of any already-received)
- Period = "this month" defaults to calendar month but is configurable to "this pay cycle" (next pay date to next pay date)
- Already-spent discretionary = all transactions in the current period classified as Discretionary, summed across all accounts, excluding internal transfers

Refunds reduce already-spent (they don't count as income).

### F5. Sub-budgets

- 4–6 sub-budgets per user, configurable
- Suggested defaults derived from past 3 months of spending (groceries, food & drink, fuel & transport, etc.)
- Each sub-budget has a target $ for the period; over-budget shows red
- A catch-all "Everything else" bucket exists by default and can't be deleted

### F6. Refund pairing

- Detect inbound transactions ≤ $5,000 that aren't classified as salary
- Match against recent outbound transactions (last 60 days) by:
  - Amount within ±$50 (refunds often round)
  - Merchant similarity (e.g. AHM → dentist payment)
  - Category context (medical refund → recent medical charge)
- Confidence threshold: 70% to prompt
- Prompt presents: original charge, refund, suggested action ("move $X to Amex")
- Action: deep-link to user's bank app's transfer screen with amount pre-copied to clipboard. App does NOT initiate transfers itself (see §8 — security/regulatory).

### F7. Forecasting

- "End-of-month projection" computed continuously: extrapolate current discretionary spend rate over remaining days, subtract from headroom
- If projection < $0, surface as a soft warning ("On current pace, you'll be over by $X by 31 May")
- Recompute on every transaction sync

### F8. Quick-add (pre-purchase check)

- Floating button on home screen
- Number-pad input for amount
- Optional category dropdown
- Live recompute: "Would leave you with $X for Y days"
- Nothing is saved or recorded — purely a what-if

### F9. Notifications (all opt-in)

- New transaction synced (digest, not per-item)
- Refund detected, pairing suggested
- Pace warning (only if projected over by >$200)
- Bill due in 2 days
- Pay landed
- Weekly summary (Sunday morning)

---

## 8. Non-functional requirements

### Security

- All bank credentials handled exclusively by Basiq/Up OAuth — never stored by Headroom
- Transaction data encrypted at rest (AES-256) and in transit (TLS 1.3)
- Per-user encryption keys derived from device passkey + server-side KMS
- No bank credential, password, or auth token ever logged
- Face ID / Touch ID required to open app (configurable)

### Privacy

- Zero data sold to third parties; no advertising
- Transaction merchant strings never sent to LLM with PII context (account numbers stripped)
- All LLM calls go through Headroom's server (not direct from device) so the user can opt out of LLM categorisation entirely (falls back to rules + recurrence only)
- Full data export available at any time (JSON + CSV)
- Account deletion wipes all data within 30 days

### Performance

- Cold app open to home screen rendered: <1.5s
- Pull-to-refresh sync: <3s for incremental update
- Transaction detail open: <300ms
- Quick-add response: <100ms

### Reliability

- 99.5% uptime target for sync infrastructure
- Graceful offline mode: app shows last-known state with "stale" indicator
- Failed syncs auto-retry with exponential backoff; user notified after 24h continuous failure

### Regulatory

- Headroom does NOT execute payments, transfers, or modify any user account state. It is read-only by design. This avoids AFSL requirements.
- Privacy Act 1988 compliance (Australian Privacy Principles)
- Notifiable Data Breach scheme participation
- CDR data must be handled in accordance with Treasury rules (Basiq is the accredited intermediary)

---

## 9. Technical architecture

### Stack rationale

Choosing **Vercel + Supabase** over Firebase. Justification:

- The data model is fundamentally relational (transactions ↔ accounts ↔ categories ↔ rules ↔ recurring groups). Postgres is the right fit; Firestore would force denormalisation and punish per-read pricing on the cross-collection aggregations this app does constantly.
- The core headroom calculation and sub-budget rollups are SQL window functions — one query in Postgres, multiple round trips in Firestore.
- Per-user categorisation rules are a priority-ordered key-value store; trivial in Postgres, awkward in Firestore.
- Postgres is portable — vendor migration is straightforward if needed later.
- Both Vercel and Supabase have generous free tiers that comfortably cover MVP and early beta.

Firebase remains a viable backup plan and would beat the Supabase stack on raw speed-to-MVP for a developer fluent in it, but the data-shape friction would surface within the first month of real usage.

### Client (iOS)

- SwiftUI, iOS 17+
- Local SQLite cache of all transactions for offline reads
- Background fetch for periodic sync notifications
- Lock-screen widget showing the headroom number
- Apple Watch companion app showing the headroom number only

### Backend

- **Hosting & compute**: Vercel
  - Next.js API routes / Edge Functions for client API surface
  - Vercel Cron for scheduled sync polling (MVP); migrate to **Inngest** if/when retry/backoff complexity grows
- **Database**: Supabase (managed Postgres)
  - All transactional data, user records, rules, recurring groups
  - Row-level security policies enforce per-user data isolation
  - `pg_cron` available as a fallback for in-database scheduled jobs
- **Auth**: Supabase Auth
  - Sign in with Apple (primary)
  - Apple passkeys via WebAuthn (secondary)
  - Session JWTs verified at the Edge
- **Storage**: Supabase Storage (S3-compatible) for encrypted raw bank data dumps and exports
- **Realtime**: Supabase Realtime channels — optional, used only for "transaction just synced" client refresh
- **Cache**: Vercel KV (Redis-compatible) for hot reads — current-month headroom and category aggregates per user; invalidated on each sync

### External services

- **Basiq**: bank aggregation across AU institutions (CDR-accredited intermediary)
- **Up Bank API**: direct integration for Up users (richer data — Savers, Round-Ups, Cover-from-Savings semantics — than Basiq exposes)
- **Anthropic API**: Claude Haiku for LLM-based categorisation (Layer 3 of the pipeline)
- **APNS** (direct): push notifications. APNS p8 key handled in a Vercel Edge Function. (Avoid OneSignal/Pusher to keep PII surface minimal.)
- **Stripe**: subscription billing, with Supabase webhook syncing subscription state to the user record
- **Sentry**: error tracking, PII-stripped
- **Resend** (or Postmark): transactional email (auth flows, receipts, account deletion confirmations)

### Sync flow

```
Bank → Basiq webhook → Vercel Edge Function (/api/webhooks/basiq)
  → Validates webhook signature
  → Enqueues sync job (Vercel Cron tick or Inngest event)

Sync worker (scheduled or event-driven)
  → Fetches new transactions from Basiq / Up API
  → Inserts into Supabase (raw_transactions table)
  → Runs categorisation pipeline (rules → recurrence → LLM)
  → Updates internal-transfer pairings
  → Recomputes monthly headroom + sub-budget aggregates
  → Writes derived results to Supabase + invalidates Vercel KV cache
  → Sends silent APNS push to user device

iOS app
  → Receives silent push
  → Pulls latest headroom from API
  → Refreshes home view
```

### Environment & deployment

- **Branches**: `main` → production (Vercel + Supabase prod project), `develop` → staging
- **Secrets**: Vercel env vars; Supabase service role key never leaves the server
- **Migrations**: Supabase CLI with versioned SQL files in repo
- **Observability**: Vercel Analytics for API performance, Sentry for errors, Supabase logs for query performance

### Rough cost model (per user / month at 1k users)

| Item | Cost |
|---|---|
| Vercel Pro (shared across users) | ~$0.02 |
| Supabase Pro (shared across users) | ~$0.03 |
| Basiq | ~$0.50 (depending on account count + tier) |
| Anthropic API (Haiku, ~50 LLM-needed transactions/month after warm-up) | ~$0.05 |
| APNS / Stripe | ~$0.01 |
| **Total infra cost / user / month** | **~$0.60** |

At a $5–7/month subscription price, gross margin is 85–90% before customer support and dev cost. Healthy.

---

## 10. Data model

### Core entities

```
User
  id, apple_user_id, email, created_at, subscription_status
  pay_cycle_type, pay_cycle_anchor_date, pay_amount_estimate
  preferences (jsonb)

Account
  id, user_id, source (up | basiq), source_account_id
  display_name, account_type (transaction | savings | credit | offset | saver_bucket)
  parent_account_id (nullable, for Up Savers etc.)
  balance, balance_updated_at

Transaction
  id, account_id, source_transaction_id, posted_at
  amount (negative = outflow), currency
  merchant_raw, merchant_normalised, location
  category_id, classification (fixed | discretionary | internal | income | refund)
  is_recurring (bool), recurring_group_id (nullable)
  paired_transaction_id (nullable, for refund pairing)
  confidence_score (0–1), classified_by (rule | recurrence | llm | user)
  user_overridden (bool)

Category
  id, user_id (nullable for global), name, parent_category_id
  default_classification (fixed | discretionary)
  icon, color

CategorisationRule
  id, user_id, merchant_pattern, category_id, classification
  source (system | user_correction), priority

FixedObligation
  id, user_id, name, amount, account_id (where it's paid from)
  expected_day_of_month (or cadence), category_id
  is_active

RecurringGroup
  id, user_id, merchant_normalised
  amount_min, amount_max, cadence_days
  next_expected_date, confidence_score

PayCycle
  id, user_id, source_account_id, payer_name
  cadence (weekly | fortnightly | monthly | four-weekly | irregular)
  anchor_date, amount_estimate, amount_variance
```

### Derived views

- `monthly_headroom(user_id, period_start, period_end)` — computed and cached per period
- `current_month_burn_rate(user_id)` — running daily average

---

## 11. Categorisation pipeline

### Layer 1 — Rules (deterministic)

Hard-coded merchant pattern dictionary, ~500 entries seeded for AU market:

```
WOOLWORTHS, COLES, ALDI, IGA → Groceries (Discretionary)
OPTUS, TELSTRA, VODAFONE → Telco (Fixed)
NETFLIX, SPOTIFY, AUDIBLE → Subscriptions (Fixed)
BP, AMPOL, SHELL, 7-ELEVEN → Fuel (Discretionary)
...
```

### Layer 2 — Recurrence detection

For any transaction not matched by rules, check if a similar transaction (same merchant_normalised, amount within ±5%) has occurred at consistent intervals. If yes, classify as Recurring + Fixed.

### Layer 3 — LLM classification

For transactions still unclassified, send to Claude Haiku with prompt:

```
Classify this Australian financial transaction.

Merchant: {merchant_raw}
Amount: ${amount}
Account: {account_type}
Past user categories for similar merchants: {list of 3–5 examples}

Respond with JSON:
{
  "category": "...",
  "classification": "fixed | discretionary | internal | refund",
  "confidence": 0.0–1.0,
  "reasoning": "one sentence"
}
```

### Layer 4 — User feedback loop

Every user correction creates a `CategorisationRule` with priority above system rules but below explicit user overrides. Future transactions matching that pattern apply the rule first.

### Performance targets

- Layer 1 hits: 50–60% of transactions
- Layer 2 hits: additional 20–25%
- Layer 3 hits: remaining 15–25%
- After 30 days of usage with corrections: >95% of transactions classified without user input

---

## 12. MVP scope & phasing

### Phase 1 — MVP (8–10 weeks)

Goal: usable for one user (the founder + ~5 testers) end-to-end.

**In:**
- Up + Amex connection (Basiq)
- Auto-detect pay cycle and fixed bills from 90 days of history
- Layered categorisation (all 4 layers)
- Home screen with hero number, sub-budgets, upcoming bills
- Transaction list and detail
- Quick-add pre-purchase check
- Settings: account management, pay cycle, fixed bills

**Out:**
- Refund pairing prompts (manual only)
- Notifications
- Apple Watch / lock-screen widget
- Other AU banks (only Up + Amex supported)

### Phase 2 — Public beta (4–6 weeks after MVP)

- Add Big 4 banks + ING + Macquarie via Basiq
- Refund pairing with notifications
- Lock-screen widget
- Stripe subscription billing
- TestFlight beta with 100 users

### Phase 3 — General launch (6–8 weeks after beta)

- Apple Watch companion
- Weekly summary notifications
- Onboarding polish, App Store launch
- Customer support tooling

### Phase 4 — Future (6+ months)

- Joint / household budgets
- iPad layout
- Annual planning view (e.g. "$1,397 of hockey gear in April → schedule into Annual Bills")
- Macro / shortcut integrations (e.g. ask Siri "how much can I spend?")
- Open Banking for direct payment initiation (avoids Basiq fees, requires AFSL)

---

## 13. Success metrics

### Activation

- % of new users who connect at least one account: target 80%
- % who confirm pay cycle: target 95% (of those who connect)
- % who reach the home screen with a populated headroom number: target 75%

### Engagement (intentionally low expectations)

- Daily active users / monthly active: target 20–30% (NOT 60%+ — the app should not require daily use)
- Average open duration: target <30 seconds (long sessions = bad UX, not good)

### Behaviour change (the actual goal)

- % of users whose credit-card balance trends downward over 90 days post-onboarding: target 50%+
- % who use refund pairing when prompted: target 60%
- Self-reported "I feel more in control of my money" via in-app NPS: target +30

### Business

- Free trial → paid conversion: target 25%
- Monthly churn: target <5%
- LTV/CAC: target 3:1

---

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Basiq pricing changes or API instability | M | H | Build Up direct integration first (free); negotiate volume Basiq pricing before scale |
| LLM categorisation gets a high-stakes call wrong (e.g. classifies a mortgage as discretionary) | M | H | Mortgage and known fixed bills always go through user confirmation at onboarding; LLM only handles the long tail |
| User connects but doesn't trust the headroom number | H | H | Tap on headroom shows full math: income − fixed − spent = remaining. No black box. |
| App becomes another source of money anxiety | M | H | Pace pill is informational, not punishing. No streaks, no "you're failing" language. |
| Australian Open Banking regulatory changes | L | M | Read-only positioning avoids most of the regulatory load |
| Competitor (e.g. Up itself) builds this feature in-house | H | H | Speed to market; positioning around multi-account (Up alone can't see Amex) |
| LLM API cost escalates with scale | L | M | Per-user rules cache reduces LLM calls to ~0 after month 1; switch to fine-tuned local model if needed at scale |
| User has irregular income (gig worker) | H | M | Detect irregularity, fall back to rolling-90-day-average mode with explicit "your income is variable" disclaimer |

---

## 15. Open questions

1. **Pricing model.** $5/month, $7/month, or freemium with a paywalled refund-pairing feature?
2. **Multi-currency.** Defer to v2, or build into MVP for users with overseas charges (e.g. travel)?
3. **Couples / shared accounts.** Punted to Phase 4. Is this a critical objection from early users?
4. **Should the app integrate with Up's saver-cover-from-savings semantics deeply, or treat them as opaque?** Up users will benefit massively from the former; users on other banks will need the same logic re-implemented.
5. **Push notification strategy.** What's the minimum set that's useful without being noisy?
6. **App Store category positioning.** Finance vs Productivity?
7. **Onboarding bills wizard.** How aggressive should we be at confirming detected bills vs trusting auto-detection?
8. **Negative-headroom handling.** When a user has overspent (headroom < $0), what does the home screen say? "Over by $X" feels punitive; alternatives needed.

---

## Appendix A — Worked example

Brodie's actual data, end of April 2026:

| Account | Balance |
|---|---|
| Up Spending | $250 |
| Up Savers | $1,169 |
| Blossom | $0 |
| Offset | $1,713 |
| Amex | −$568 |

**Detected pay cycle:** Fortnightly, $3,778, anchor 29 Apr 2026 → next pays 13 May, 27 May.

**May income forecast:** $7,556 (2 pays).

**Detected fixed obligations for May:**
- Mortgage (offset → bank) on 14 May: $3,666
- Health Insurance (2 fortnights): $56
- Pet Insurance: $53
- Subscriptions (auto-detected from 90d history): Optus $94, Apple $50, Microsoft $19, Audible $16, Resend $29, put.io $17, Amazon Prime $10, Meshy $16, Google PayPal $51 → total $302

**May headroom:**
- $7,556 − $3,666 − $56 − $53 − $302 = **$3,479**

**Sub-budget split (suggested from past 3 months):**
- Groceries: $800
- Food & drink: $500
- Hockey: $300
- Fuel & transport: $173
- Everything else: $1,706 (catch-all)

**Hero screen on 1 May 2026:**
> "$3,479 discretionary remaining — $112/day for 31 days"

**Hero screen on 17 May 2026 (after $1,336 of normal consumption, post-mortgage):**
> "$2,143 remaining — $153/day for 14 days"
> "On pace · $14 ahead of average"

This is the experience the entire PRD is in service of.

---

*End of document.*
