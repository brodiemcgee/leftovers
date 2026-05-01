# Leftovers — Architecture

Source-of-truth: PRD §9. This document expands that into concrete system boundaries and data flows. When in doubt, the PRD wins.

## Stack

| Layer | Tech |
|---|---|
| iOS client | SwiftUI 17+, strict concurrency, Swift 5.9 |
| Auth | Supabase Auth + Sign in with Apple (idToken flow) |
| API | Vercel Edge / Node Functions (Next.js App Router) |
| Database | Supabase Postgres (`ap-southeast-2`), RLS on every user-owned table |
| Categoriser LLM | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Bank sync | Up Bank API direct + Basiq |
| Push | APNS direct (no wrapper services) |
| Billing | Stripe |
| Errors | Sentry (PII-stripped) |

## Workspace layout

`apps/ios/` is a Swift Package + iOS app. `apps/web/` is the Next.js project. `packages/{api,categoriser,shared,sync}` are internal TS workspaces consumed by `apps/web`. `supabase/` holds versioned migrations, the seed, the views/functions migration, and the RLS isolation test fixture.

## Data model

See PRD §10 + the migration `supabase/migrations/20260501000000_initial_schema.sql`. Notes:

- All money is stored as `bigint` cents.
- All time is stored as `timestamptz` (UTC). Display TZ is per-user.
- Internal transfers are detected post-sync and tagged via the `internal_transfer_pair` RPC (`security definer`).
- The headroom calculation lives in Postgres (`headroom_for_user`). It is never reimplemented in the API or client.

## Sync flow

```
Bank → Up direct API or Basiq webhook
     → /api/webhooks/{up,basiq} verifies signature + enqueues
     → runConnectionSync():
         fetch accounts → upsert
         fetch transactions since last_synced_at → upsert
         findInternalPairs → mark `classification = 'internal'`
         categoriser pipeline (rules → recurrence → LLM → fallback)
         refresh fixed-obligation next_expected_date
     → invalidate per-user cache (future)
     → silent APNS push (future Sprint 2 polish)
```

A Vercel Cron at `/api/cron/sync` polls every 6h as a safety net.

## Categorisation pipeline

1. **Rules** — system rules (~500 AU patterns) + user-correction rules. Priority desc; user rules sit at 200, system rules at 100. Pattern types: substring (default) and regex.
2. **Recurrence** — clusters by normalised merchant + ±5% amount + cadence stability across 7/14/28/30-day periods.
3. **LLM** — Claude Haiku via `@anthropic-ai/sdk`, prompt verbatim from build prompt §"Categorisation prompt". Mortgage/rent are confidence-capped at 0.7 to force user confirmation.
4. **Fallback** — `other` / discretionary / confidence 0.3, marked `requiresConfirmation`.

The eval harness (`packages/categoriser/eval/run.ts`) exercises Layer 1 only against 100 hand-tagged AU fixtures, and CI blocks merge below 95% accuracy.

## Auth flow

iOS calls `ASAuthorizationAppleIDProvider`, hands the idToken to `supabase.auth.signInWithIdToken({ provider: .apple, idToken })`. The auth trigger `handle_new_auth_user` creates a `public.users` row on first sign-in. All subsequent API calls use the bearer access token; `lib/auth.ts` validates it via service-role and constructs an RLS-scoped client per request.

## Read-only by design

The app never initiates payments. The closest it gets is the refund-pairing screen, which deep-links the user to their bank app's transfer screen with an amount on the clipboard — this is intentional, regulatory-driven, and documented in PRD §regulatory.

## Encryption at rest

Bank tokens (Up PAT, future Basiq tokens, webhook secrets) are stored as AES-256-GCM ciphertext, key derived from `ENCRYPTION_KEY` env var via scrypt. See `packages/sync/src/encryption.ts`.

## Privacy in LLM calls

Per PRD §Privacy: account numbers and PII are stripped (`stripPii()` in `layers/llm.ts`) before any merchant string is sent to Claude. Each LLM invocation is recorded in `llm_calls` with token usage for cost tracking; the entire LLM layer can be disabled per-user via `users.llm_categorisation_enabled` and the Settings → Categorisation toggle.

## CI gates

- `pnpm lint` (zero warnings)
- `pnpm typecheck` (TypeScript strict)
- `pnpm test` (Vitest across all packages)
- `pnpm categoriser:eval` (≥95% Layer-1 accuracy)
- Supabase `rls_isolation.test.sql` (cross-user invisibility)
- iOS `swift test` (LeftoversCore tests)
- `next build` (apps/web)

## What gets bumped per phase

- **MVP (Phase 1)** — Up + Amex, manual refund pairing, no notifications, no widget.
- **Beta (Phase 2)** — Big 4 + ING + Macquarie via Basiq, refund-pairing notifications, lock-screen widget, Stripe billing.
- **Launch (Phase 3)** — Apple Watch companion, weekly summary, App Store launch, customer support tooling.
- **Phase 4+** — joint budgets, iPad layout, annual planning, Siri shortcuts, AFSL-gated payment initiation.
