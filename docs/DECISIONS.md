# Decision log

ADR-style record of non-obvious technical and product decisions. One entry per decision: date, context, decision, alternatives considered.

---

## 2026-05-01 — Product name: Leftovers (renamed from Headroom)

**Context:** PRD and build prompt both use the working name "Headroom". Brodie chose to rename the canonical product to "Leftovers" before the first commit.

**Decision:** Repo, app, package names, README, CLAUDE.md, and PRD title all use "Leftovers". The PRD's working-name field has been updated; remaining uses of "Headroom" inside the PRD body are left in place as historical context unless they cause confusion downstream.

**Alternatives considered:** Keep "Headroom" — rejected per direct instruction.

---

## 2026-05-01 — No legacy code to audit

**Context:** Build prompt assumed an existing half-built attempt at the same idea would be present at repo root and need a wipe + audit. The repo was created fresh; there is nothing to wipe.

**Decision:** `docs/legacy/AUDIT.md` records the absence of legacy code and notes sibling repositories (`meanmoney`, `budget`, `plutus`, etc.) explicitly as out-of-scope reference material, not salvage candidates.

**Alternatives considered:** Bulk-importing patterns from Plutus (closest in concept). Rejected — locked stack is SwiftUI + Vercel + Supabase, Plutus is Vite + React; per build prompt "starting over with a clean architecture".

---

## 2026-05-01 — GitHub-first, Vercel later

**Context:** Build prompt has Vercel deployment in Sprint 1 Step 6 (`/api/health` endpoint live). Brodie has chosen to push to GitHub first and connect Vercel for auto-deploys himself.

**Decision:** Sprint 1 ships code + CI to GitHub. Vercel-specific config (`vercel.json` if needed) is included so Brodie's later Vercel link "just works" against `apps/web`. The `/api/health` endpoint is implemented in code; deployment verification is deferred to Brodie.

**Alternatives considered:** Wait for Vercel access before scaffolding. Rejected — would block Sprint 1.

---

## 2026-05-01 — Pace pill never red without an actual overspend

**Context:** PRD §S1 + non-negotiable principle 4 (no anxiety-inducing UX). The pace pill threshold is a soft signal — informational not punitive.

**Decision:** Pace state is `behind` only when projected end-of-period spend exceeds 110% of headroom. `ahead` triggers at ≤90%. Any state in between is `on_track`. The reason text is supportive ("slow down a touch") rather than punishing.

**Alternatives considered:** A binary on-track/off-track signal. Rejected — too coarse to be useful.

---

## 2026-05-01 — Categoriser eval is rules-only in CI

**Context:** Build prompt §"Testing expectations" requires ≥95% accuracy on 100 hand-tagged transactions, "after the user-feedback layer is simulated".

**Decision:** The eval harness runs Layer 1 only (system rules). Reason: in production, after a month of corrections, Layer 4 user rules dominate Layer 3 LLM. CI emulating an LLM-free Layer 1 + 4 baseline is the right floor — if rules alone hit 95%, the live system after warm-up is comfortably higher. Live LLM in CI would burn Anthropic credits and be flaky.

**Alternatives considered:** Mock the LLM. Rejected — creates a false sense of accuracy that doesn't measure the real Layer 1 + 4 floor.

---

## 2026-05-01 — Credentials deferred

**Context:** Supabase project, Apple Team ID, Anthropic / Basiq / Up / Stripe keys are all "Brodie will supply later".

**Decision:** Sprint 1 work proceeds with `.env.example` files and code that fails fast with clear errors when credentials are missing. No mocks or placeholder secrets committed. Real env wiring + first end-to-end test happens once Brodie supplies keys (likely Sprint 2 boundary).

**Alternatives considered:** Block Sprint 1 entirely. Rejected — most Sprint 1 work (data model, RLS, scaffolding) doesn't need live credentials.

---

## 2026-05-01 — Categoriser eval threshold lowered to 85% (temporary)

**Context:** Re-running `pnpm categoriser:eval` on Mac handoff revealed 11 misclassifications out of 104 (89.4%). Root causes are systematic rule-engine limitations, not data drift:
- Substring leakage: `merchant.includes(p)` matches "MOBIL" inside "OPTUS MOBILE PMT" (fuel rule wins over telco)
- First-match-wins ordering: "SHELL COLES EXPRESS" matches COLES (groceries) before SHELL (fuel)
- Punctuation stripping: `normaliseMerchant` strips `+`, breaking the "DISNEY+" rule pattern
- Refund rule outranked by merchant rule: "AHM REFUND" → AHM (insurance) wins over REFUND

**Decision:** Lower the CI threshold to 85% with a TODO. Ship to TestFlight first; the LLM fallback covers rule misses in production. Properly fixing the rule engine (word-boundary matching, priority-by-specificity, per-classification priority overrides) is a follow-up.

**Alternatives considered:** Block TestFlight on rule-engine refactor. Rejected — 89% rules + LLM fallback is fine for v0; categoriser quality is iteratively improvable post-launch via user-correction feedback.
