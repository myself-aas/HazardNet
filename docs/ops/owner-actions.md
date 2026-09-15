# Owner Actions Runbook — Post-Reaudit (2026-09-13)

Three actions from the [production-readiness reaudit](../audits/2026-09-13-production-readiness-reaudit.md)
need a human owner (secrets, merge button, admin settings). Do them **in this order**:

1. **Rotate** leaked credentials (do first — every hour of delay is exposure).
2. **Merge** this branch + set Vercel env (production heals).
3. **Lock down** branch protection (do last — avoids blocking the merge).

## Step 0 — Get the branch merged (prerequisite for everything below)

The work lives on `arena/01a099a1-hazardnet` (staged, uncommitted). Either ask the
agent to commit + push + open the PR, or run:

```bash
git commit -m "Production-readiness reaudit: green CI, API parity, hourly refresh (see docs/audits/2026-09-13-production-readiness-reaudit.md)"
git push origin arena/01a099a1-hazardnet
gh pr create --base main --head arena/01a099a1-hazardnet \
  --title "Production readiness: green CI, API parity, hourly Kaggle refresh" \
  --body-file docs/audits/2026-09-13-production-readiness-reaudit.md
```

Then on GitHub: review the PR → wait for CI green → **Merge pull request**.
(E2E is quarantined non-blocking per reaudit N9 — pre-existing 20-min timeouts,
no green baseline — so merge when the other five jobs are green; E2E still runs
and reports signal on every PR.)

## Action 1 — Rotate the leaked credentials 🔴 (P0, ~30 min)

**Why:** `.env.example` and `.github/secrets.env` once held live values
(`git log --all -- .github/secrets.env` shows 2 commits). The working tree is
sanitized, but git history is forever — every listed value must be treated as
public. **Rotation (revoke → replace) is the fix; nothing in code can do it.**

### 1a. Revoke + regenerate at each provider

| # | Credential | Where to rotate (exact path) |
|---|---|---|
| 1 | Supabase DB password (+ pooled URL) | Supabase Dashboard → project → **Settings → Database → Connection string → Reset password**. Copy the new pooler URL (`aws-0-…pooler.supabase.com:6543`) |
| 2 | Supabase API keys (if the JWT/anon/service values were committed) | Supabase Dashboard → **Settings → API → API Keys → Regenerate** (legacy `service_role` / `anon`) |
| 3 | Kaggle API token | kaggle.com → avatar → **Settings → API → Revoke** old token → **Create New Token** (gives `username` + `key`) |
| 4 | Gemini API key (+ backup) | Google AI Studio → **API keys → Delete** old → **Create API key** |
| 5 | OpenRouter key | openrouter.ai → **Keys → Delete → New key** (set a spend limit) |
| 6 | Groq key | console.groq.com → **API Keys → Revoke → Create** |
| 7 | HuggingFace token | huggingface.co → **Settings → Access Tokens → Revoke → New token** (fine-grained, minimal scopes) |
| 8 | GitHub PAT (was stored as `GITHUB_TOKEN=` in `.env.example`) | github.com → **Settings → Developer settings → Personal access tokens → Revoke**. Prefer a fine-grained PAT (repo-scoped, 90-day expiry) or just use the automatic `GITHUB_TOKEN` in Actions |
| 9 | VAPID keypair (push notifications) | Run `npx web-push generate-vapid-keys` locally → new public + private key |
| 10 | Codecov upload token | codecov.io → repo **Settings → General → Regenerate upload token** |
| 11 | Vercel token | vercel.com → **Account Settings → Tokens → Revoke → Create** (only needed if CI should deploy previews; CI skips deploy steps without it. The committed `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` are IDs, not secrets — no action) |
| 12 | `BACKEND_API_KEY` (self-chosen API password) | Generate fresh: `openssl rand -hex 32`. Must match in GitHub secrets **and** Vercel env (below) |

### 1b. Update GitHub Actions secrets + variables

Repo → **Settings → Secrets and variables → Actions** → update each (never commit values):

Secrets (9): `BACKEND_API_KEY`, `CODECOV_TOKEN`, `GEMINI_API_KEY`,
`KAGGLE_KEY`, `KAGGLE_USERNAME`, `SUPABASE_DB_URL` (= new pooler URL from 1a-1),
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
(`GITHUB_TOKEN` there is automatic — nothing to set.)

Additionally required by the GitHub-native forecast pipeline (2026-09-16):
`EE_SERVICE_ACCOUNT_JSON` (GEE — the data source) and, only when
`PUSH_TO_API=true`, `HAZARDNET_API_URL` + `HAZARDNET_API_KEY`.

Variables: `FORECAST_STORE` = `supabase`; `PUSH_TO_API` = `true` **only** once an
ingest API is deployed and reachable (`/api/v1/forecasts/update` returning 200,
see §2a-bis); `KAGGLE_KERNEL` only for the legacy Kaggle dispatches.

Also refresh your own local `.env` from `.env.example` (gitignored — verify with
`git check-ignore .env`).

### 1c. Verify the rotation

- Old values are dead: e.g. `curl -H "Authorization: Bearer <OLD>" …` fails;
  old Kaggle `key` in `~/.kaggle/kaggle.json` returns 401.
- New values are live: `kaggle datasets list` works; Supabase pooler URL connects
  (`psql "<new-url>" -c 'select 1'`); Codecov upload succeeds on the next CI run.
- **Not required for deploying: no Vercel secret is read by any workflow.**
  Vercel's Git integration builds every preview and the production site on its
  own (`Vercel` commit status), so `VERCEL_TOKEN` / `VERCEL_ORG_ID` /
  `VERCEL_PROJECT_ID` can be deleted from the repository's Actions secrets —
  rotating them is optional and no longer unblocks anything. They were removed
  from CI on 2026-09-14 after the stale ids made every run fail; see
  `docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md`.
- Re-run the leak scan any time: `bash scripts/check-secrets.sh`.

> Optional hygiene (NOT a substitute for rotation): purge the values from git
> history with `git filter-repo --strip-blobs-bigger-than …` / `--replace-text`.
> This rewrites every commit hash, invalidates forks/clones, and still leaves any
> copies already scraped. Rotate first; rewrite history only if you accept the cost.

## Action 2 — Merge + set Vercel env 🟠 (~20 min + 1 deploy)

### 2a. Merge the PR (from Step 0)

Merge only when CI is green, especially: **Backend Tests, Frontend Tests,
Pipeline Scripts Tests, Code Quality & Build, Security Audit.**
(`E2E Tests` is quarantined non-blocking — reaudit N9 — but keep an eye on it:
red is tolerated, a *timeout/cancel* would still need attention.)

### 2a-bis. Check the Vercel **Root Directory** (verified broken 2026-09-15)

Probed live on 2026-09-15: `https://www.hazardnet.live/` renders the SPA, but
`/api/metrics`, `/api/v1/forecasts/metadata` **and `/dashboard`** all return
Vercel's platform `404: NOT_FOUND`. That is the signature of a project built
from `frontend/` rather than the repository root — the root `vercel.json`
rewrites (SPA deep links) and the root `api/**` serverless functions are then
never part of the deployment, so the site is static-only and
`useForecasts()` silently falls back to the bundled snapshot (audit P0-2).

**Fix:** Vercel → project `HazardNet` → **Settings → Build & Development
Settings → Root Directory** = repository root (leave the field empty / `./`),
then redeploy. Same class of finding, with the evidence table, in
[`docs/audits/2026-09-15-ci-backend-tests-and-workflow-green.md`](../audits/2026-09-15-ci-backend-tests-and-workflow-green.md).
If the API is intentionally hosted elsewhere, point the probe at it with the
`API_METADATA_URL` repository variable instead of leaving the site-health
probe red.

### 2b. Set Vercel environment variables

Vercel Dashboard → project `HazardNet` → **Settings → Environment Variables**.
Set each for **Production** (and Preview, except where noted):

| Variable | Value | Why |
|---|---|---|
| `FORECAST_STORE` | `supabase` | Serverless functions read the Supabase store |
| `DATABASE_URL` | `<new Supabase pooler URL>` (same value as the `SUPABASE_DB_URL` GitHub secret — the runtime reads `DATABASE_URL`) | Postgres connection for `api/v1/forecasts/*` |
| `SUPABASE_SSL` | `true` | TLS to the pooler |
| `BACKEND_API_KEY` | `<same openssl value as GitHub secret>` | Authenticates `api/ingest.js` |
| `FRONTEND_ORIGIN` | `https://www.hazardnet.live,https://hazardnet.live` | CORS allowlist (comma-separated; production fails closed without it — include apex **and** `www`; add preview domains as needed) |
| `GEMINI_API_KEY` | `<new key>` | Serverless advisory/chat routes (recommended) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Frontend Supabase client — **not** `VITE_SUPABASE_URL`, see below |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `<publishable key>` | Frontend Supabase client (public-by-design) — not `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | `https://www.hazardnet.live` | Auth redirects — not `VITE_SUPABASE_REDIRECT_URL` |
| `VITE_VAPID_PUBLIC_KEY` | `<new public key>` | Push subscriptions (only the public key goes here) |

> ⚠️ **The three Supabase names above are the `NEXT_PUBLIC_` forms on purpose.**
> `frontend/vite.config.ts` injects the client's `VITE_SUPABASE_*` values with an
> explicit `define` block that reads the **repository root** env, and a `define`
> substitution wins over anything Vite loads. Setting `VITE_SUPABASE_URL` (in the
> dashboard *or* in `frontend/.env`) has no effect at all — verified by build: the
> value never reaches the bundle, while the `NEXT_PUBLIC_`/`SUPABASE_` forms do.
> Prefix aliases `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` also work.
> Full list: `.env.example` §7.

(Firebase `VITE_*` have committed defaults — skip unless you use Firebase.
AdSense/download `VITE_*` are optional features.)

Then **redeploy**: Deployments → latest → **⋯ → Redeploy** (env changes don't
apply retroactively). The merge to `main` also triggers a fresh production build.

### 2c. Put the first live data in (one manual run)

Since 2026-09-16 the forecasts are generated **on the GitHub runner** — no
Kaggle token, no notebook, no kernel slug. Dispatch the producer once so you
don't wait for the 00:00 UTC clock:

1. GitHub → **Actions → HazardNet Daily Forecast Pipeline → Run workflow**.
   (~19 minutes; needs the `EE_SERVICE_ACCOUNT_JSON` secret and nothing else.)
2. Confirm it committed data: the run's summary card shows `prediction_date` +
   `rows`, and a `chore(data): daily forecast refresh <date>` commit appears on
   `main` touching `backend/data/forecasts/` and
   `frontend/public/data/forecasts-latest.json`.
3. Verify locally / from any host that can reach production:
   - `curl -s https://www.hazardnet.live/data/forecasts-latest.json | jq .prediction_date`
     → today's date (the snapshot the site bundles).
   - With the API deployed (§2a-bis) **and** `PUSH_TO_API=true`:
     `curl -s https://www.hazardnet.live/api/v1/forecasts/metadata` → real
     `prediction_date` + `ingestion_timestamp`;
     `curl -s "https://www.hazardnet.live/api/v1/forecasts/bulk?horizon=7_days" | head -c 300` → `count` > 0.
   - Open the site: Peak Hazard Window / Incident Ingestion cards show live dates
     instead of the *"live data unavailable"* fallback.

> Kaggle is now optional everywhere. The three Kaggle workflows
> (`forecast-pipeline`, `hourly_forecast`, `weekly_forecast`) are
> `workflow_dispatch`-only legacy — see
> [`docs/ops/kaggle-pipeline-triage.md`](kaggle-pipeline-triage.md). Rotating the
> Kaggle token (§1a-3) is therefore **no longer needed to keep the site fresh**;
> it only matters if you dispatch one of those legacy jobs.

## Action 3 — Confirm branch protection 🟡 (~10 min, after the merge)

**Why after:** enabling "required status checks" before anything has ever passed
them on `main` creates a chicken-and-egg; merge first, then lock.

Repo → **Settings → Branches → Add classic branch protection rule**:

- **Branch name pattern:** `main`
- ✅ **Require a pull request before merging** (required approvals: 1; ✅ dismiss
  stale approvals on new pushes)
- ✅ **Require status checks to pass** + ✅ **Require branches to be up to date before merging** →
  add: `Backend Tests`, `Frontend Tests`, `Pipeline Scripts Tests`, `E2E Tests`,
  `Code Quality & Build`, `Security Audit`
  (`E2E Tests` stays required even while quarantined: the job is time-bounded to
  always complete, and quarantine converts red → success; it becomes a real gate
  again automatically when the quarantine is lifted per N9.)
- ⚠️ **Bypass list (critical):** under *"Allow specified actors to bypass required
  pull requests"* add **`github-actions[bot]`** — the hourly forecast bot commits
  data + snapshots directly to `main`; without this bypass its pushes get rejected.
- ✅ **Do not allow bypassing the above settings** (applies to everyone *except*
  the bypass list) — or leave off if you want admins to keep an escape hatch.
- ✅ **Block force pushes** (default) and consider ✅ **Require linear history**.

(Repo → **Settings → Rules → Rulesets** is the newer equivalent — either is fine.)

**Verify:** `git push origin main` directly with a trivial commit → must be
rejected; next hourly run pushes its data commit successfully.

## Done checklist

- [ ] All 12 credentials rotated; old values confirmed dead
- [ ] 9 GitHub secrets + `FORECAST_STORE=supabase` variable updated
- [ ] PR merged with fully green CI
- [ ] 10 Vercel env vars set (Production + Preview) and redeployed
- [ ] Manual hourly run green; `/metadata` shows a real `prediction_date`; site cards live
- [ ] `main` protected (PR + 6 status checks + bot bypass); direct push rejected
- [ ] Calendar note: `audit-exceptions.json` expires **2026-12-12** (CI fails to force re-review)
