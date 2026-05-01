# Leftovers

Personal-finance app for salaried Australians with multiple accounts (transaction, savings buckets, offset, credit card) that answers one question:

> **"How much can I spend this month without going backwards?"**

iOS-first. SwiftUI + Vercel (Next.js Edge Functions) + Supabase Postgres. Bank sync via Up Bank API direct + Basiq. LLM-assisted transaction categorisation (Anthropic Claude Haiku).

Full product spec: [`docs/PRD.md`](docs/PRD.md).
Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Decisions log: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Repo layout

```
apps/
  ios/              SwiftUI app (iOS 17+)
  web/              Next.js — marketing landing + future admin
packages/
  api/              Vercel Edge Functions (TypeScript)
  shared/           Shared types (generated from Supabase schema)
  categoriser/      4-layer transaction classification pipeline
  sync/             Bank sync workers (Basiq + Up)
supabase/
  migrations/       Versioned SQL
  functions/        Postgres functions / views
  seed.sql          AU merchant rule seed (~500 entries)
docs/               PRD, ARCHITECTURE, DECISIONS, legacy audit
```

Monorepo is managed with `pnpm` workspaces.

## Status

Sprint 1 — Foundations (in progress).

See `CLAUDE.md` for current sprint state and what's blocked.

## Working with this repo

- All money is integer cents — `bigint` in Postgres, `Int64` in Swift. Never `Double`.
- All dates are `timestamptz` (ISO 8601). Display TZ defaults to `Australia/Melbourne`.
- Postgres migrations are append-only — never edit a previously-applied migration.
- Every non-obvious technical choice gets a one-liner in `docs/DECISIONS.md`.
- TypeScript strict everywhere; no `any`. Swift 5.9+ with strict concurrency.

If you (a future Claude session, or a contributor) find yourself wanting to violate a non-negotiable principle from `CLAUDE.md`, stop and ask Brodie.
