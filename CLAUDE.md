# Leftovers — Project Memory

## What this is
Leftovers is an iOS personal-finance app that answers one question: "How much can I spend this month without going backwards?" Australian market. Founder = Brodie McGee = primary user.

The product was previously called Headroom in the PRD. The canonical name is now Leftovers — see `docs/DECISIONS.md` for context.

## Source of truth
- `docs/PRD.md` — full product spec
- `docs/ARCHITECTURE.md` — technical decisions
- `docs/DECISIONS.md` — ADR-style decision log

If anything in code conflicts with the PRD, the PRD wins. If you need to deviate, document it in DECISIONS.md and flag to Brodie.

## Stack
- iOS (SwiftUI, iOS 17+)
- Vercel (Next.js + Edge Functions + Cron)
- Supabase (Postgres in ap-southeast-2, RLS on every table)
- Auth: Supabase + Sign in with Apple
- Bank sync: Up direct API + Basiq
- LLM: Anthropic Claude Haiku
- Push: APNS direct
- Billing: Stripe
- Errors: Sentry (PII-stripped)

## Non-negotiable principles
1. One hero number on home. Never compete with it.
2. Read-only by design. App never moves money. Avoids AFSL.
3. No streaks, badges, gamification.
4. Default to the user's bank structure (e.g. Up Savers).
5. App should disappear after onboarding. Engagement is NOT a goal.
6. LLM never auto-classifies a mortgage. Always defers to user confirmation.

## Money handling
- Integer cents everywhere. bigint in Postgres, Int64 in Swift.
- Never float / Double for amounts.

## Date handling
- ISO 8601 / timestamptz in storage.
- Display in Australia/Melbourne by default; respect user setting.

## Build status

### Current sprint
**Sprints 1–5 — Foundations through Polish**: code-complete. Awaiting credentials + first deploy.

### Done
- Monorepo scaffolded (`apps/{ios,web}`, `packages/{api,categoriser,shared,sync}`, `supabase/`).
- Supabase migrations: schema (PRD §10), RLS policies on every user-owned table, headroom + sub-budget views/functions, AU merchant rule seed (~500), RLS isolation test fixture.
- Categoriser pipeline: rules, recurrence, LLM (Anthropic Haiku), feedback loop, eval harness (100 fixtures, 95% gate).
- Sync: Up direct API, Basiq, internal-transfer matcher, orchestrator (cron + webhook + manual triggers), AES-256-GCM token encryption.
- API handlers: health, headroom, transactions list/detail/update, quick-add, sub-budgets, settings + pay cycle + fixed obligation, sync trigger, refund pairing (suggest + pair), Up + Basiq webhooks, Stripe webhook, onboarding detection (pay + fixed), user rule store, cron sync.
- Next.js routes mounted for every handler. Marketing landing page at `/`. Vercel cron + function timeouts configured in `vercel.json`.
- iOS app: Sign in with Apple → Supabase, onboarding flow (connect → detect pay → confirm pay → detect fixed → confirm fixed), home (hero number + pace pill + sub-budgets + upcoming), transactions list + detail, quick-add sheet, accounts, settings (connections, pay cycle, fixed bills, categorisation toggle, user rules, privacy, subscription, sign out).
- CI: GitHub Actions for TS lint/typecheck/test/eval, Supabase RLS test, iOS swift test.
- Docs: PRD, ARCHITECTURE, DECISIONS, legacy audit, README.

### Blocked / waiting on Brodie
- Vercel project setup + env-var paste-in (Brodie wires after first GitHub push).
- Confirm which `.p8` is SiwA vs APNS in Apple Developer Console (assumed `5YB8D2KP64` = SiwA, `999LW5Y9JW` = APNS).
- Stripe credentials (deferred — testers free during beta).
- Sentry DSN (deferred).
- Up Bank webhook URL once Vercel is live (registers webhook from Settings → Connect Up).

### Live infrastructure
- GitHub: https://github.com/brodie-mcgee/leftovers (private).
- Supabase project: `yohzkldhcitfbxwrlieu` (`ap-southeast-2`) — schema applied, RLS active, 14 tables, 41 policies, 27 system categories, 569 system merchant rules, `headroom_for_user` + `internal_transfer_pair` functions live.
- Sign in with Apple: enabled in Supabase (Service ID `com.brodiemcgee.leftovers.signin` + bundle ID `com.brodiemcgee.leftovers`; JWT signed with key `5YB8D2KP64`, valid ~6 months from 2026-05-01).
- APNS: key `999LW5Y9JW` recorded in `.env.local` for when push is wired.

## Test data
The user's real Up + Amex transaction history is the canonical fixture. End-of-April 2026 balances are documented in PRD §appendix and serve as the integration test target.

## What NOT to add without asking
- Any home-screen metric that competes with the hero number
- Goal-setting / "save for X" features (the user's Up Savers do this)
- Receipt scanning, OCR
- Investment / portfolio tracking
- Joint / household budgeting (planned for Phase 4 only)
- Coaching, advice, product recommendations (regulatory)
- Streaks, badges, achievements
