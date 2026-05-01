# Mac handoff — read this first

You're picking this up on a Mac after starting on Windows. Here's the short list of what's already done, what's waiting for you, and what to do *now* in order.

## Where things stand

- ✅ Code complete (Sprints 1–5 from the build prompt). Repo at https://github.com/brodie-mcgee/leftovers.
- ✅ Supabase project `yohzkldhcitfbxwrlieu` provisioned, schema applied, seed loaded, RLS active.
- ✅ Sign in with Apple wired up in Supabase (Service ID `com.brodiemcgee.leftovers.signin`, JWT valid until ~2026-10-30).
- ⏳ Vercel deploy — **next step**.
- ⏳ Xcode project file — needs creating once on Mac.
- ⏳ End-to-end test on your phone.

## On the Windows machine, before you walk away

Find this file:
```
C:\Users\conta\Documents\repos\leftovers\.env.local
```
This holds every secret currently in use (Supabase keys, Anthropic, Basiq, Apple JWT, APNS .p8, encryption key). It is **gitignored** — it's not on GitHub.

You also need:
```
C:\Users\conta\Downloads\AuthKey_5YB8D2KP64.p8     (Sign in with Apple key)
C:\Users\conta\Downloads\AuthKey_999LW5Y9JW.p8     (APNS key)
```

Get all three across to the Mac via the easiest method available:
- If `Documents` is in OneDrive, the repo is already syncing — just clone fresh on Mac and copy `.env.local` over once.
- USB stick or AirDrop-equivalent works too.
- **Don't** paste the contents into chat or commit them.

## On the Mac — first 30 minutes

```bash
# Tools (skip what's already installed)
brew install node@20 pnpm gh
brew install supabase/tap/supabase

# Repo
mkdir -p ~/Documents/repos
cd ~/Documents/repos
gh auth login   # use brodiemcgee account, token from your password manager
git clone https://github.com/brodie-mcgee/leftovers.git
cd leftovers
pnpm install

# Drop .env.local in the repo root (copied from Windows)
# Drop both AuthKey_*.p8 files into ~/Downloads (or wherever — paths only matter if you re-mint the JWT)

# Verify everything builds
pnpm typecheck
pnpm test
pnpm categoriser:eval
```

If `pnpm categoriser:eval` reports ≥95% accuracy, the toolchain is good.

## The remaining work, in order

Each of these is documented in detail in [`docs/SETUP.md`](SETUP.md). Sections are linked.

1. **Deploy to Vercel** — [SETUP.md §5](SETUP.md#5-deploying-to-vercel). ~10 min. Get a URL like `leftovers-xxx.vercel.app` working, with `/api/health` returning OK.

2. **Update `apps/ios/Leftovers.xcconfig`** with the Vercel URL as `API_BASE_URL`.

3. **Create the Xcode project** — [SETUP.md §6](SETUP.md#6-creating-the-xcode-project). ~15 min. Xcode → New Project → drag in the existing `Leftovers/` folder + `LeftoversCore` package. Make sure Sign in with Apple + Push Notifications capabilities are enabled.

4. **Build & run on your iPhone** — USB-tether or wifi-pair. Sign in with Apple lands you on the onboarding screen.

5. **Onboarding test** — [SETUP.md §7](SETUP.md#7-end-to-end-test-on-your-phone). Paste your Up PAT, confirm pay cycle, confirm fixed bills, see your real headroom number.

6. **Register the Up webhook** — [SETUP.md §8](SETUP.md#8-registering-the-up-webhook). Optional but switches sync from 6h cron to near-real-time.

7. **(Optional) Custom domain, Sentry, TestFlight** — [SETUP.md §9](SETUP.md#9-optional-polish).

## If something breaks

Check [SETUP.md §10 — Common gotchas](SETUP.md#10-common-gotchas) first. Common ones:

- **Missing env var** → `.env.local` didn't make it across, or a key is misnamed.
- **Apple sign-in 401** → JWT might be expired or Service ID mismatched. Re-mint with `node scripts/gen-apple-jwt.mjs 5YB8D2KP64 W25KJK652Y com.brodiemcgee.leftovers.signin ~/Downloads/AuthKey_5YB8D2KP64.p8`.
- **Supabase 401 on RLS-protected tables** → using anon client without a user token. Server code uses `createUserClient(token)` (RLS) or `createServiceClient()` (bypass).
- **Categoriser eval drops below 95%** → a system rule was renamed or a fixture was added. Sync `supabase/seed.sql` and `packages/categoriser/eval/system-rules.ts`.

## Key references

| What | Where |
|---|---|
| Full setup guide | [`docs/SETUP.md`](SETUP.md) |
| Product spec | [`docs/PRD.md`](PRD.md) |
| Architecture overview | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decision log | [`docs/DECISIONS.md`](DECISIONS.md) |
| Project memory (read me at session start) | [`CLAUDE.md`](../CLAUDE.md) |
| Supabase dashboard | https://supabase.com/dashboard/project/yohzkldhcitfbxwrlieu |
| GitHub | https://github.com/brodie-mcgee/leftovers |

## Sanity check before you sign off the day

```bash
# In repo root
pnpm test                  # unit tests pass
pnpm categoriser:eval      # ≥95% accuracy
curl https://<vercel-url>/api/health   # {"status":"ok"} once Vercel is live
```

If those three pass, you're in a state where any future Claude Code session (or any future you) can pick up cleanly with just the repo + `.env.local`.
