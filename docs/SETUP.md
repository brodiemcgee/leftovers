# Leftovers — Setup & Operations Guide

This is the single source of truth for going from a fresh checkout to a running app on a phone. Read top-to-bottom the first time, then jump back to relevant sections.

> **State as of 2026-05-01:** Code is complete (Sprints 1–5). Supabase project `yohzkldhcitfbxwrlieu` is provisioned with schema applied. Sign in with Apple is enabled in Supabase. GitHub repo is at https://github.com/brodie-mcgee/leftovers. Next blockers: Vercel deploy + Xcode project file + first iOS build.

---

## Table of contents

1. [Live infrastructure](#1-live-infrastructure)
2. [Local prerequisites](#2-local-prerequisites)
3. [Get the repo running locally](#3-get-the-repo-running-locally)
4. [Environment variables](#4-environment-variables)
5. [Deploying to Vercel](#5-deploying-to-vercel)
6. [Creating the Xcode project](#6-creating-the-xcode-project)
7. [End-to-end test on your phone](#7-end-to-end-test-on-your-phone)
8. [Registering the Up webhook](#8-registering-the-up-webhook)
9. [Optional polish (custom domain, Sentry, TestFlight)](#9-optional-polish)
10. [Common gotchas](#10-common-gotchas)
11. [Repo map](#11-repo-map)
12. [How to do common operations later](#12-how-to-do-common-operations-later)

---

## 1. Live infrastructure

| Resource | Value |
|---|---|
| GitHub | https://github.com/brodie-mcgee/leftovers (private) |
| Supabase project | `yohzkldhcitfbxwrlieu` (region `ap-southeast-2`) |
| Supabase dashboard | https://supabase.com/dashboard/project/yohzkldhcitfbxwrlieu |
| Bundle ID (iOS) | `com.brodiemcgee.leftovers` |
| SiwA Service ID | `com.brodiemcgee.leftovers.signin` |
| Apple Team ID | `W25KJK652Y` |
| SiwA key | `5YB8D2KP64` (.p8 stored locally; JWT in env) |
| APNS key | `999LW5Y9JW` (.p8 stored locally) |
| Vercel | not deployed yet |

What's already applied to Supabase:

- 14 tables, 41 RLS policies (all user-owned tables enforce `user_id = auth.uid()`).
- 27 system categories, 569 system merchant rules.
- `headroom_for_user`, `current_month_burn_rate`, `internal_transfer_pair`, `forecast_*` Postgres functions.
- `sub_budget_progress` view.
- Auth → Apple provider enabled with Service ID `com.brodiemcgee.leftovers.signin` + bundle ID `com.brodiemcgee.leftovers`. Client secret JWT signed with key `5YB8D2KP64`, valid until ~2026-10-30.

To re-apply the schema (e.g. against a fresh project):

```bash
SUPABASE_ACCESS_TOKEN=<sbp_...> \
SUPABASE_PROJECT_REF=<project-ref> \
node scripts/apply-migrations.mjs
```

---

## 2. Local prerequisites

### Mac
```bash
# Homebrew (one-liner if you don't have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Tools
brew install node@20 pnpm git gh
brew install supabase/tap/supabase

# Xcode 15+ from the Mac App Store, then once-off:
sudo xcode-select --install
sudo xcodebuild -license accept
```

### Windows
```powershell
winget install OpenJS.NodeJS.LTS
winget install pnpm.pnpm
winget install GitHub.cli
winget install Supabase.cli
```
Note: iOS development requires a Mac. Windows can do everything except the Xcode steps.

---

## 3. Get the repo running locally

```bash
git clone https://github.com/brodie-mcgee/leftovers.git
cd leftovers
pnpm install
```

Run the test suite to confirm everything's wired:

```bash
pnpm typecheck
pnpm test
pnpm categoriser:eval        # must pass ≥95% accuracy
```

Run the web app locally (the iOS app talks to it once `API_BASE_URL` is set):

```bash
pnpm --filter @leftovers/web dev
# → http://localhost:3000
# /api/health should return {"status":"ok",...}
```

You'll get errors on any endpoint that requires Supabase / Anthropic / etc. until you create `.env.local` (next section).

---

## 4. Environment variables

The full set lives in `.env.example`. Copy it to `.env.local` (gitignored) and fill in the values below. **The `.env.local` on the Windows machine has all current values** — copy the file across via OneDrive / USB / `scp` rather than re-deriving them.

If you need to recreate from scratch, here's where each value lives:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | `https://yohzkldhcitfbxwrlieu.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → "anon public" |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → "service_role" (server-only — never client) |
| `BASIQ_API_KEY` | https://dashboard.basiq.io/applications |
| `BASIQ_WEBHOOK_SECRET` | Basiq dashboard → Webhooks (set once webhook URL is live) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `ANTHROPIC_MODEL` | Default `claude-haiku-4-5-20251001` |
| `APPLE_CLIENT_ID` | `com.brodiemcgee.leftovers.signin` |
| `APPLE_CLIENT_SECRET` | Generate via `node scripts/gen-apple-jwt.mjs <KEY_ID> W25KJK652Y com.brodiemcgee.leftovers.signin <PATH_TO_P8>` |
| `APNS_KEY_ID` | `999LW5Y9JW` |
| `APNS_TEAM_ID` | `W25KJK652Y` |
| `APNS_BUNDLE_ID` | `com.brodiemcgee.leftovers` |
| `APNS_P8_KEY` | Contents of `AuthKey_999LW5Y9JW.p8` (preserve newlines) |
| `STRIPE_SECRET_KEY` | Deferred — beta is free |
| `STRIPE_WEBHOOK_SECRET` | Deferred |
| `SENTRY_DSN` | Deferred — sign up at sentry.io if/when you want it |
| `ENCRYPTION_KEY` | **DO NOT REGENERATE** — losing it makes stored Up tokens undecryptable. Currently: see `.env.local` on Windows machine. To generate fresh on a new project: `openssl rand -hex 32`. |
| `CRON_SECRET` | Generate with `openssl rand -hex 32` (low stakes — fallback for cron auth) |

The current values on Windows live at `C:\Users\conta\Documents\repos\leftovers\.env.local`. Copy that file across via OneDrive (it's already in `OneDrive` if you sync `Documents`), USB stick, or `scp`. **Don't paste secrets into chat or commit them.**

If you genuinely lose `.env.local` and the Windows machine is gone:

- Supabase keys: rotate via dashboard → Settings → API → roll keys
- Apple JWT: re-run the JWT generator
- APNS key: re-download the .p8 (one-time download — if lost, generate a new key and update `APNS_KEY_ID`)
- `ENCRYPTION_KEY`: if lost, all stored Up tokens become useless and users must re-connect Up. Acceptable cost early on; tragic later.

---

## 5. Deploying to Vercel

1. Go to https://vercel.com/new
2. Import `brodie-mcgee/leftovers`
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: leave blank — `vercel.json` at repo root handles the monorepo config
5. Build command: leave default — `vercel.json` overrides it
6. Environment variables: paste each `KEY=VALUE` from `.env.local` into Settings → Environment Variables. Set them for **Production** and **Preview** (and **Development** if you want `vercel dev` to work).
7. Deploy.

After first deploy:

```bash
# Verify health endpoint
curl https://<your-vercel-url>/api/health
# → {"status":"ok","commit":"<sha>","env":"production"}
```

Then update `apps/ios/Leftovers.xcconfig`:

```
API_BASE_URL = https://<your-vercel-url>
```

(Or set up a custom domain — see §9.)

The Vercel cron at `/api/cron/sync` runs every 6h automatically (configured in `vercel.json`).

---

## 6. Creating the Xcode project

The Swift sources, `Package.swift`, `Info.plist`, `.entitlements`, and `.xcconfig` exist. The binary `.xcodeproj` does not — Xcode has to create it.

1. Open Xcode → **File → New → Project → iOS → App**.
2. Product Name: `Leftovers`. Team: select Brodie McGee (W25KJK652Y). Organisation Identifier: `com.brodiemcgee`. Interface: **SwiftUI**. Language: **Swift**. Storage: **None**. Include Tests: optional.
3. Save inside `apps/ios/` so the structure is `apps/ios/Leftovers.xcodeproj/`. **Important:** when prompted, do NOT create a new folder — use the existing `apps/ios/` directly.
4. Delete the auto-generated `ContentView.swift` and `LeftoversApp.swift` that Xcode created.
5. Drag the existing `apps/ios/Leftovers/` folder into the project navigator. Choose "Create groups" (not folder references). Target: the Leftovers app.
6. Add the local Swift package: File → Add Package Dependencies → "Add Local…" → select `apps/ios/Package.swift`. Then in target → General → Frameworks, Libraries → add `LeftoversCore`.
7. Target → Signing & Capabilities:
   - Team: Brodie McGee (W25KJK652Y)
   - Bundle Identifier: `com.brodiemcgee.leftovers`
   - `+ Capability` → **Sign in with Apple**
   - `+ Capability` → **Push Notifications**
   - The entitlements file is already at `apps/ios/Leftovers/Leftovers.entitlements` — point Code Signing Entitlements at it
8. Target → Build Settings → search "Configuration File":
   - Debug → `Leftovers.xcconfig`
   - Release → `Leftovers.xcconfig`
9. Optional: create a `Local.xcconfig` next to `Leftovers.xcconfig` (gitignored) with your real `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `API_BASE_URL` / `SENTRY_DSN`. The base config has `#include? "Local.xcconfig"` so it gets layered on automatically.
10. Build & run on your iPhone (USB-tethered or wifi-paired with developer mode on).

If the build complains about missing Supabase Swift SDK: Xcode → File → Packages → Reset Package Caches.

---

## 7. End-to-end test on your phone

1. Open the app. You'll land on Sign in with Apple.
2. Sign in. The Supabase auth trigger creates a `public.users` row. The app drops you into onboarding (no connection yet).
3. Onboarding step 1: paste your Up personal access token (currently `up:yeah:...` — see `.env.local` on Windows for the exact value, or grab a new one from https://api.up.com.au/getting_started). Hit Connect.
4. The first sync pulls 90 days of Up history. Wait ~30s.
5. Onboarding step 2: confirm your detected pay cycle.
6. Onboarding step 3: confirm fixed bills.
7. Land on home screen. You should see your real headroom number, computed from real Up data.

Verify in Supabase dashboard → Table Editor:

- `connections` has one row for your user
- `accounts` has rows for each Up account/saver
- `transactions` has 90 days of rows
- `pay_cycles` has the confirmed cycle
- `fixed_obligations` has the confirmed bills

If the home screen shows `$0.00`, check:

- Did you confirm a pay cycle? Headroom = forecast income − fixed − spent. No income → headroom is negative.
- Did the categoriser run? Check `transactions.classification` — should be populated. If not: check `sync_events` for errors.

---

## 8. Registering the Up webhook

Once Vercel is live with a stable URL:

1. In the iOS app: Settings → Connect Up Bank → re-enter your PAT but this time tick "Register webhook" (or hit it via API: POST `/api/connect/up` with `{ "personalAccessToken": "...", "webhookUrl": "https://YOUR-URL/api/webhooks/up" }`).
2. The handler calls Up's webhook registration API, gets back a signing secret, encrypts it with `ENCRYPTION_KEY`, and stores it on the connection row.
3. From now on, transactions sync in near-real-time via the webhook (instead of waiting up to 6h for the cron).

Verify with:

```bash
# Tail the sync_events table
curl -X POST https://api.supabase.com/v1/projects/yohzkldhcitfbxwrlieu/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select status, source, transactions_added, started_at from public.sync_events order by started_at desc limit 10"}'
```

---

## 9. Optional polish

### Custom domain

1. Buy `leftovers.app` (or whichever domain) — Cloudflare Registrar is cheap and reliable.
2. Vercel → Project → Settings → Domains → Add → enter the domain → follow DNS instructions.
3. Update:
   - `apps/web/next.config.ts` — `experimental.serverActions.allowedOrigins`
   - Supabase dashboard → Auth → URL Configuration → Site URL & Redirect URLs
   - `UP_REDIRECT_URI` env var
   - Apple Developer Console → Service ID → Configure → Domains and Subdomains: add the new domain

### Sentry

1. Sign up at sentry.io, create an iOS project + a Node.js project.
2. Paste DSN into `SENTRY_DSN` in Vercel + your local `.env.local` + `Local.xcconfig`.

### TestFlight

1. Xcode → Product → Archive (must be a Generic iOS Device target).
2. Distribute App → App Store Connect → Upload.
3. App Store Connect → TestFlight → invite testers via email.
4. First archive triggers App Store review (~24h) for TestFlight; subsequent builds are instant.

---

## 10. Common gotchas

- **"Missing required environment variable"**: env access in `packages/shared/src/env.ts` is lazy — every call to `env.foo` throws if unset. If a handler dies on first request, check what env it's reading.
- **Categoriser eval below 95%**: a fixture probably grew or a system rule was renamed. Run `pnpm categoriser:eval` locally and inspect the failure list — usually one merchant pattern needs adding to `packages/categoriser/eval/system-rules.ts` AND `supabase/seed.sql` (keep them in sync).
- **iOS 401 on every API call**: the access token is expiring or the user signed out and back in. Check `SessionStore.bootstrap()` is being called.
- **Supabase RLS blocking your own queries during dev**: you're probably querying with the anon client without a token. Use the user-scoped client in handlers.
- **"insufficient_authorization" from Up**: the PAT has expired or been revoked. Generate a new one from https://api.up.com.au/getting_started.
- **Apple sign-in fails with "invalid_client"**: the JWT in Supabase is for the wrong Service ID, or it's expired (max 6 months). Regenerate via `scripts/gen-apple-jwt.mjs` and PATCH it in via the Supabase Management API:
  ```bash
  curl -X PATCH https://api.supabase.com/v1/projects/yohzkldhcitfbxwrlieu/config/auth \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"external_apple_secret":"<NEW_JWT>"}'
  ```
- **Mortgage classified as discretionary**: the LLM's confidence cap (0.7 for mortgage/rent) plus the seed rule should prevent this. If it slips through, the rule pattern in `seed.sql` and `eval/system-rules.ts` needs updating.

---

## 11. Repo map

```
apps/
  ios/              SwiftUI app + LeftoversCore Swift package
    Leftovers/      View files (your app target's source)
    Sources/LeftoversCore/  Models, view models, API client, Supabase wrapper
    Tests/LeftoversCoreTests/
    Package.swift   Swift package manifest (Supabase + Sentry deps)
    Leftovers.xcconfig  Xcode build settings (DEVELOPMENT_TEAM, SUPABASE_URL, etc.)
  web/              Next.js — marketing landing + every API route
    src/app/api/    Next.js route files; each delegates to @leftovers/api
packages/
  api/              Vercel Edge / Node handlers (one file per concern)
  categoriser/      4-layer classification pipeline + eval harness
  shared/           Cross-package types, money/date helpers, Supabase client factory
  sync/             Up + Basiq clients, internal-transfer matcher, orchestrator, encryption
supabase/
  migrations/       Versioned SQL — applied via scripts/apply-migrations.mjs
  seed.sql          27 categories + 569 AU merchant rules
  tests/            RLS isolation test fixture
scripts/
  apply-migrations.mjs   Push SQL to a Supabase project via Management API
  gen-apple-jwt.mjs      Mint Sign-in-with-Apple client_secret JWT
docs/
  PRD.md            Product spec (canonical)
  ARCHITECTURE.md   System diagrams + stack rationale
  DECISIONS.md      ADR log
  SETUP.md          ← this file
  MAC_HANDOFF.md    What you need on first sit-down at the Mac
  legacy/AUDIT.md   Note: no legacy code (fresh start)
```

---

## 12. How to do common operations later

### Add a new merchant rule

Edit two files (keep them in sync):

1. `supabase/seed.sql` — add to the relevant `select public._seed_rule(p, ...)` block.
2. `packages/categoriser/eval/system-rules.ts` — add the same pattern to the matching `rules([...])` call.
3. Apply the rule to the live DB:
   ```bash
   curl -X POST https://api.supabase.com/v1/projects/yohzkldhcitfbxwrlieu/database/query \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query":"insert into public.categorisation_rules (user_id, merchant_pattern, pattern_type, category_id, classification, source, priority, is_active) values (null, '\''SOMENEWMERCHANT'\'', '\''substring'\'', (select id from public.categories where slug = '\''shopping'\''), '\''discretionary'\'', '\''system'\'', 100, true)"}'
   ```
4. Run `pnpm categoriser:eval` to confirm accuracy holds.

### Roll the SiwA JWT (every ~6 months)

```bash
node scripts/gen-apple-jwt.mjs 5YB8D2KP64 W25KJK652Y com.brodiemcgee.leftovers.signin /path/to/AuthKey_5YB8D2KP64.p8
# Take the output JWT, then:
curl -X PATCH https://api.supabase.com/v1/projects/yohzkldhcitfbxwrlieu/config/auth \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"external_apple_secret\":\"$NEW_JWT\"}"
```

### Reset everything (dev-only; nukes user data)

```bash
# Nuke and re-apply migrations
SUPABASE_ACCESS_TOKEN=$T SUPABASE_PROJECT_REF=yohzkldhcitfbxwrlieu node scripts/apply-migrations.mjs
# (Migrations use idempotent `create extension if not exists` etc, but tables are not idempotent.
#  For full reset, drop all tables in public schema first via SQL Editor.)
```

### Force a sync for a user

```bash
# As that user (with their bearer token):
curl -X POST https://YOUR-URL/api/sync \
  -H "Authorization: Bearer $USER_JWT"
```

Or trigger the cron handler with the cron secret:

```bash
curl https://YOUR-URL/api/cron/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Check what the cron last did

Supabase SQL Editor:

```sql
select status, source, transactions_added, transactions_updated, error_message, started_at, finished_at
from public.sync_events
order by started_at desc
limit 50;
```

### See what the LLM has been called for

```sql
select user_id, model, prompt_tokens, completion_tokens, cost_micros_aud, created_at
from public.llm_calls
order by created_at desc
limit 50;
```

### Retire a tester (Phase 1 close-out)

```sql
-- Disable their access without deleting data
update public.users set subscription_status = 'canceled' where email = 'tester@example.com';
-- Or full delete (cascades through everything)
delete from auth.users where email = 'tester@example.com';
```
