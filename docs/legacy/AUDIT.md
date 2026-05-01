# Legacy code audit

**Date:** 2026-05-01
**Auditor:** Claude (Sprint 1, Step 1)

## Summary

**There is no legacy code in this repository.** The directory `C:\Users\conta\Documents\repos\leftovers` was created fresh on 2026-05-01.

The build prompt anticipated a "half-built attempt at the same idea" living at the repo root that needed wiping (preserving `.git/`) and auditing. That assumption was based on Brodie's earlier exploration: when asked to find the "Leftovers" app in his GitHub and local filesystem, no repo by that name existed. Several sibling budgeting projects exist locally (`repos/meanmoney`, `repos/budget`, `repos/financedashboard`, `repos/codingprojects/plutus`, `repos/finance/property-analyzer`) but none of them are this app — they are unrelated efforts on different stacks (React Native / Flutter / Next.js dashboard / Vite React) and against different product specs. None match the locked stack (SwiftUI iOS + Vercel + Supabase) and none should be salvaged into this repo.

## Sibling projects (for context, not for salvage)

| Path | Stack | Product |
|---|---|---|
| `repos/meanmoney` | React Native / Expo | "Mean Money" — humour-driven manual finance tracker |
| `repos/budget` | Next.js + Flutter (`budget_app/`) | Internal "Mean Money" budget dashboard |
| `repos/financedashboard` | Next.js | Personal finance dashboard with CSV imports |
| `repos/codingprojects/plutus` | Vite React + Supabase | "Plutus" — AI-categorised budgeting with Up Bank integration |
| `repos/finance/property-analyzer` | Vite React + Firebase | Real estate analyser (out of scope) |

**Plutus** is the closest in concept (Up Bank + AI categorisation + Supabase) and may be useful as a *reference* for things like Up API auth flow or Supabase migration patterns. However, per the build prompt's "I'm abandoning that work entirely and starting over with a clean architecture" directive, no code is being copied into Leftovers. If specific patterns from Plutus prove useful later, they should be re-implemented from first principles to fit the locked stack and the PRD's data model — not copy-pasted.

## Wipe plan

N/A — nothing to wipe.

## Recommendations forward

- Sprint 1 proceeds at Step 2 (initialise monorepo tooling: pnpm workspaces, tsconfig, ESLint, Prettier).
- If at any point Brodie wants to mine Plutus (or any sibling) for a specific implementation idea (e.g. Up API webhook signature verification), spawn a focused exploration task — do not bulk-import.
