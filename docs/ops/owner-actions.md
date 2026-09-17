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
- **Updated 2026-09-18 (Phase 6):** `.env.example` no longer contains the values (it is
  placeholder-only now), and the scan can finally see them — the allowlist was matching
  the *path* `.env.example`, so every hit inside it was discarded and CI reported success.
  See `docs/audits/2026-09-18-secret-scan-false-negative.md`. The values below are still
  live until rotated; cleaning the file does not revoke anything.

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

---

## Action 4 — Phase 3 follow-ups (MLOps)

These are the two decisions and one data load that unblock the phase's headline
deliverables. None of them can be done from inside the repository.

### 4a. Load the event archive so calibration and verification can run

The model registry, the calibration fitter and the evaluation harness are built and
tested; what they cannot do without is observed outcomes. `hazard_events` ships empty
by design (`scripts/db/008_hazard_events_postgis.sql`), and the sandbox has no
Postgres binary, so:

1. load the 2,931-event archive into the store
   (`python -m etl.cli events --input <extract> --apply`, see `scripts/etl/README.md`),
   and note the ingested count against the claim — the CLI reports the drift;
2. export the outcomes joined to districts and dates and hand the file to the
   nightly job (`mlops.cli evaluate --outcomes <file>`);
3. once the join produces ≥200 labelled predictions, fit the calibration map
   (`mlops.cli calibrate … --out Models/calibration/confidence_map.json`) — its
   `validate()` refuses an under-sampled or undocumented fit, and
   `apply-calibration` refuses the unfitted template that ships today.

Until step 3 happens, `confidence` stays the model's softmax and the site says so.

### 4b. Decide what to do about the INT8 artifact 🔴 (recommended: leave retired)

`Models/hazardnet_int8.tflite` is a byte-identical copy of the FP32 file; ADR 0007
records that TFLite's converter crashes on `CONV_3D` under INT8. The registry now
records this (`stage: retired`, `duplicate_of`, refused promotion). Two acceptable
outcomes: either delete the file and the ADR 0007 pointer to it, or keep it retired
with the registry note. What must not happen is a third artifact that *looks* like a
quantized model without being one.

### 4c. Approve the promotion policy

`Models/REGISTRY.json` → `policy` gates promotions on a passing challenger
comparison **and** a named approver, with absolute bars for a first champion
(CSI ≥ 0.20, POD ≥ 0.30, FAR ≤ 0.80, ECE ≤ 0.20). Those bars are placeholders chosen
to be conservative for a model whose output is documented as degenerate
(MODEL_CARD §6.1) — the owner should set the real thresholds before the first
challenger is evaluated, and record who may act as the approver.

**Verify:**
`cd scripts && python -m mlops.cli audit` → `ok`; `python -m mlops.cli registry --write`
→ `unchanged`; `python -m mlops.cli evaluate --predictions ../backend/data/forecasts/hazardnet_forecasts_latest.csv --outcomes <archive export>`
→ `insufficient_truth` today, `ok` with POD/FAR/CSI once the archive is loaded.

---

## Action 5 — Turn the alert engine on (Phase 4) 🟠 (~1 hour, owner + duty desk)

The engine is implemented and safe by construction: nothing above `WATCH` can be
published without a named human (`docs/alerts/ALERT_ENGINE.md`). What it cannot do is
decide *how sensitive* it should be, *who* may approve, or *how* it reaches people.
Those are four decisions and five settings.

### 5a. Set the §1.3 thresholds (or accept the defaults in writing)

Today's defaults are conservative round numbers: watch probability 0.40, watch severity
band 0.55, warning probability 0.65, divergence 0.30. Against the shipped model they put
**every row in `WATCH`** — the level is not yet discriminating, because the underlying
score is degenerate (MODEL_CARD §6.1) and uncalibrated. Two honest options: leave them
until Phase 9's hindcast produces calibrated thresholds, or raise the watch band now so
the public map shows fewer, more meaningful alerts. Either way, record the decision:
`GET /api/v1/alerts/policy` publishes the values in force, their source
(`defaults`/`environment`) and any override.

### 5b. Name the duty officers

`ALERT_DUTY_OFFICERS=uid1,uid2,email@…` (comma-separated Firebase uids or emails), or
give the reviewers an `admin`/`duty_officer` claim. A signed-in stranger can read the
public alerts but cannot approve or reject anything — §1.6 asks for a *named* officer,
and the record stores `verified_via` (firebase claim or pipeline key attestation).

### 5c. Decide the channel mix and create the credentials

* SMS: choose `SMS_PROVIDER=bulksmsbd|greenweb`, set the gateway key and `SMS_SENDER_ID`
  (a registered mask). **Rehearse with `SMS_DRY_RUN=true` first** — the dry run returns
  the exact request with credentials redacted and reports `sent: false`.
* Telegram: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALERT_CHAT_ID`.
* Budget: `SMS_MAX_PER_RUN` (default 25) caps attempts per run; overflow is counted as
  `over_budget`. A Bengali message is UCS-2 and costs ~3× the segments of English
  (the digest reports the count), so decide which channel gets which language.

### 5d. Create the subscriber list

Firestore collection `alertSubscriptions`, one document per subscriber:

```json
{ "channel": "sms", "destination": "8801XXXXXXXXX", "district_name": "Kurigram",
  "hazards": ["Flood", "Flash Flood"], "min_level": "WATCH", "language": "bn",
  "active": true }
```

A subscriber is matched on district **and** hazard **and** minimum level; only published
alerts are dispatched. Beta-test with one number and your own district before opening it.

### 5e. Let the daily pipeline run it

Set the repository variable `BACKEND_API_URL` and the secret `HAZARDNET_API_KEY`. The
`daily_forecast.yml` step then calls `POST /api/v1/alerts/run` after each publish,
uploads `alert-run.json` and prints the level counts into the job summary. Without those
two settings the step logs a notice and skips, so the workflow stays green.

**Also consider:** `ALERT_AUTO_PUBLISH=false` keeps everything in DRAFT — sensible during
a soft launch while thresholds are still placeholders and no subscriber has been
briefed. And note that `WARNING`/`SEVERE` cannot be issued at all from model evidence
until a calibration map is fitted (Phase 3's open item); today the only paths above
`WATCH` are an official bulletin at maximum severity or a duty officer's review.

**Verify:**
```bash
curl -s "$BACKEND_API_URL/api/v1/alerts/policy" | jq '{thresholds, human_in_the_loop, calibration, transports}'
curl -s -X POST "$BACKEND_API_URL/api/v1/alerts/preview" -H "Authorization: Bearer $HAZARDNET_API_KEY" \
  -H 'Content-Type: application/json' -d '{}' | jq '.batch.counts, .batch.saturation'
# a dry-run dispatch of the highest alert (no gateway call, no cost):
curl -s "$BACKEND_API_URL/api/v1/alerts?state=PUBLISHED&limit=1" | jq -r '.alerts[0].id' \
  | xargs -I{} curl -s "$BACKEND_API_URL/api/v1/alerts/{}/evidence-card?format=markdown"
```

---

## Action 6 — Own the alert surface after Phase 5 🟠 (~45 min, owner + one field reviewer)

The web surface now exists (`/alerts`, `/alerts/:id`, the district strip, bilingual UI,
low-bandwidth mode, PDF/CSV export). Four things about it are the owner's call, not the
code's.

### 6a. A model version, or nothing can be published 🔴

The committed snapshot is **empty on purpose**: `scripts/rehearse_alert_engine.mjs`
replays the real engine over the committed forecast snapshot, assesses all 74 rows to
`WATCH`, and every one of them is `publication_blocked` with the same reason —
*"§1.6 requires model version before an alert is published"* — because the forecast
snapshot's `provenance.model_version` is `null`.

So the honest state of the site today is **"no alerts are published, 74 district rows
assessed and held"**, which the page says in words. Nothing will publish until the
pipeline stamps a model version. Nothing was stamped to make the page look better.

**Do:** confirm that `Models/VERSION.json` (or `MODEL_VERSION` in the workflow env) is
wired into the forecast run so rows arrive with `model_version`, then re-run
`daily_forecast.yml` and check that `alert-run.json` reports `persisted.published > 0`.

**Why it is not hypothetical — measured 2026-09-18 on the committed data:**

```bash
# rows carry no provenance at all (28 columns, none of them model/pipeline/run/confidence_kind)
head -1 backend/data/forecasts/hazardnet_forecasts_latest.csv | tr ',' '\n' | grep -c '^model_version$'   # → 0
node -e "const r=require('./backend/data/forecasts/hazardnet_forecasts_latest.json');console.log(Object.keys(r[0]).filter(k=>/version|run_id|confidence_kind/.test(k)))"  # → []
jq '{model_version, coverage_status}' backend/data/forecasts/manifest.json                                 # → both null/absent
# and the engine consequently blocks every row:
npm run alerts:rehearse | tail -3   # → blocked=74, "74× §1.6 requires model version before an alert is published"
```

The committed ingest file predates the Phase 2 publish gate, which now refuses a run whose
report has no coverage/provenance (`scripts/publish_forecast_csv.py`) and a manifest with
no model provenance (`scripts/validate_forecasts.py`). So the first pipeline run that
passes the gate should also be the first run that can publish an alert. Do not "fix" this
by stamping a version anywhere else — the block is the product telling the truth.

**Verify:**
```bash
npm run alerts:rehearse        # expect published=0 and the §1.6 reason, until 6a is done
jq '.persisted' /tmp/alert-run.json
curl -s "$BACKEND_API_URL/api/v1/alerts" | jq '{counts, assessed}'
```

### 6b. Decide whether the site should show an empty alert list or a "not yet publishing" banner

If the pipeline will not stamp provenance before the soft launch, the page's current
wording is correct but blunt. The alternative — hiding `/alerts` from the nav until the
first alert exists — is a product decision; the route is live and prerendered either way.

### 6c. Review the Bengali copy with a native-speaker field reviewer

The Bengali strings were written for this phase (alert levels, confidence caveat,
low-bandwidth explanations, emergency numbers, hazard-class names). They have not been
reviewed by a native speaker working in the districts. This is a soft-launch blocker for
a product whose audience reads Bengali first. Files: `frontend/src/lib/i18n.ts`,
`frontend/src/hooks/useHazardLabel.ts`, `frontend/src/lib/legal.ts`.

### 6d. Accessibility walk-through on real devices

`jest-axe` is clean on the new components in both languages, but no screen reader has been
driven against a running build, and satellite-free low-bandwidth mode has not been tried
on a real 2G handset. Suggested pass: NVDA (Windows/Chrome) or TalkBack (Android) on
`/alerts` in Bengali and English, plus one throttled mobile run with Data Saver on. What
the automated pass cannot cover is listed in `docs/frontend/ACCESSIBILITY.md` §4.

---

## Action 7 — Fix the deployment root, then confirm the headers are live 🔴 (P0, ~30 min)

**The repository and the live site disagree, and the evidence points at the deployment
root rather than a missing redeploy.** Probes of `www.hazardnet.live` on 2026-09-18:

| Probe | Live | What the repo says |
| ----- | ---- | ------------------ |
| `/` | 200, **no** CSP/XCTO/XFO/Referrer-Policy/Permissions-Policy/COOP; HSTS without `includeSubDomains`; `Access-Control-Allow-Origin: *` | `vercel.json` (on `main` too) declares all of them |
| `/api/metrics` | **404** `X-Vercel-Error: NOT_FOUND` | `api/metrics.js` exists on `main` |
| `/api/forecasts` | **404** (same) | `api/forecasts.js` exists on `main` |
| `/serviceWorker.js` | 200 | `frontend/public/serviceWorker.js` |
| `/data/forecasts-latest.json` | 200 | `frontend/public/data/forecasts-latest.json` |
| `/.well-known/security.txt` | **404** | `frontend/public/.well-known/security.txt` (on this branch) |
| `/data/alerts-latest.json` | **404** | `frontend/public/data/alerts-latest.json` (on this branch) |

Static files that live under `frontend/public/` are served; everything that lives at the
**repository root** (`api/**`, the root `vercel.json`) is not — which is what the Vercel
project's **Root Directory** being `frontend/` produces, and what
`docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md` warned about. A second,
independent fact: this branch is 14 commits ahead of `main`, and production tracks `main`.

So there are two things to fix, in this order:

1. **Root Directory** (Vercel → Settings → Build & Development → Root Directory). Either:
   - set it to the repository root, and then fix the root `vercel.json` for that layout
     (its `buildCommand: "npm run build"` and `outputDirectory: "dist"` are only correct
     when the root is `frontend/` — at the repo root the build is
     `cd frontend && npm install && npm run build` with output `frontend/dist`), **or**
   - keep it as `frontend/` and accept that `api/**` is not deployed from there: the
     frontend's headers then come from the new `frontend/vercel.json` (added on this
     branch), and the serverless endpoints need either their own project or a root-directory
     change. `docs/adr/0003-deploy-topology.md` is the place that decision is recorded.
2. **Merge the branch** (owner Action 2 already covers the merge + env vars) so the deployed
   commit contains the Phase 0–6 work at all.

**Verify (all four must hold after the deploy):**
```bash
curl -sI https://www.hazardnet.live/ | grep -iE 'content-security-policy|x-content-type|x-frame|referrer-policy|permissions-policy|cross-origin-opener|strict-transport'
curl -s  https://www.hazardnet.live/.well-known/security.txt | head -3          # RFC 9116 fields
curl -sI https://www.hazardnet.live/api/v1/alerts/policy | head -1              # 200, not 404
curl -sI https://www.hazardnet.live/ | grep -ci 'access-control-allow-origin: \*'  # → 0
```
A CDN cache is involved (`X-Vercel-Cache: HIT`), so re-probe with a cache-buster query
string before concluding anything.

## Action 8 — Validate the corrected Firestore rules, and consider a shared rate-limit store 🟠

The Phase 6 audit found the rules reading camelCase ownership (`userId`) while the client
writes snake_case (`user_id`), which denied owners their own assessment/alert/connector
rows and left the profile validator inert. `firestore.rules` now accepts both spellings and
applies the validators (`__tests__/firestoreRules.test.js` pins the shape, 13 checks), but
**the corrected file has not been deployed or exercised against the emulator** — the audit
sandbox has no Java, no emulator and no project credentials.

1. Run the emulator suite locally before deploying:
   ```bash
   npm i -D @firebase/rules-unit-testing
   firebase emulators:exec --only firestore "npm test -- firestore"
   firebase deploy --only firestore:rules --dry-run   # compile check
   ```
   Cases worth writing first: an owner reading their own assessment; a stranger reading it;
   a profile update with a 5 MB `display_name`; a `role: 'admin'` self-write; a connector
   read by another signed-in account (the SEC-01/SEC-09 regression).
2. Deploy with `firebase deploy --only firestore:rules`, then re-run the same cases against
   the real project with two test accounts.
3. **Rate limiting is per-instance.** `backend/middleware/serverlessGuard.js` caps each
   Vercel instance (60–120/min depending on the bucket), which stops a single client from
   hammering one instance but multiplies by the number of warm instances. A global
   guarantee needs a shared counter (Upstash Redis/Vercel KV) — worth it only if the AI
   routes see real abuse; the honest current guarantee is documented in `SECURITY.md`.

## Action 9 — Let the probe publish its result 🟡 (~5 min, after the merge)

The Phase 7 status page renders `data/site-health/latest.json`, which
`.github/workflows/site-health.yml` commits on every scheduled run. The workflow now declares
`permissions: contents: write` for exactly that step.

**GitHub caps that request at the repository setting.** If
*Settings → Actions → General → Workflow permissions* is **"Read repository contents and
packages permissions"**, the token is read-only, the `git push` fails — and the workflow is
written to report that as a **warning**, not a failure, so the probe still tells you what it
found (the result is in the run summary and the uploaded artifact). You will see:

```
::warning::could not publish the probe result to the branch — this repository's workflow
permissions are read-only (docs/ops/owner-actions.md, Action 9). The result is still in the
run summary and the uploaded artifact.
```

**Fix:** *Settings → Actions → General → Workflow permissions* → **"Read and write
permissions"**, then dispatch the probe once (`Actions → Site Health Probe → Run workflow`) and
confirm `data/site-health/latest.json` gained a commit. Nothing else in the repository needs
write access from this workflow, and every other workflow keeps its own least-privilege
`permissions:` block.

**Until Action 7 is done, expect the probe to be red** — and expect the status page to say so.
That is the page working: the live deployment serves none of the declared security headers, its
API routes 404, and its sitemap predates Phase 0. A green probe before Action 7 would mean the
probe is broken.

---

## Action 10 — Put the site in front of search engines 🔴 (P0 for discoverability, ~30 min)

**What is missing:** nobody has ever told Google or Bing the site exists. There is no Search
Console property, no Bing Webmaster property, and therefore no sitemap submission, no coverage
report and no way to see whether the 87 URLs the build now publishes are being indexed. Phase 8
made the *surface* crawlable (static HTML for every route, one canonical host, a sitemap generated
from the build); this action is what makes it *discovered*.

**Steps**

1. **Verify the domain in Google Search Console.** Use the **Domain** property for
   `hazardnet.live` (not a URL-prefix property): DNS verification covers the apex, `www` and every
   future subdomain in one record. The TXT record goes in the DNS zone that serves
   `hazardnet.live`; the Vercel project's *Domains* tab shows which nameserver/host is authoritative
   if it is not obvious.
2. **Verify in Bing Webmaster Tools.** Bing offers "import from Google Search Console" once step 1
   is done — use it, and keep the same account.
3. **Submit the sitemap:** `https://www.hazardnet.live/sitemap.xml`. Do not submit the apex URL; it
   redirects, and a sitemap that redirects is reported as an error.
4. **Confirm the canonical host is being chosen.** In Search Console → *Pages*, after a few days,
   the reported canonical URL for `/districts/bhola` must be `https://www.hazardnet.live/districts/bhola`.
   If the apex appears instead, check the redirects in `vercel.json` are live (`curl -sI
   https://hazardnet.live/districts/bhola` must answer `308` with a `location:` on www).
5. **Watch coverage for 28 days.** Expect three states: indexed, "Discovered – currently not
   indexed" (normal for a young site), and the four districts the current run did not cover — those
   are `noindex,follow` **by design** and must appear in the report as *Excluded by 'noindex'*. If
   they show as *Duplicate*, the district pages are being compared to each other and the place
   metadata in their JSON-LD needs looking at (`__tests__/structuredData.test.js` covers the graph).

**Evidence to record here when done:** which account owns each property, the date of verification,
the date the sitemap was accepted, and the first coverage numbers.

**Do not** buy links, submit to link farms, or add the site to directories that do not have a
disaster/agriculture remit — the domain's credibility with the audiences in Action 11 is worth more
than any ranking a paid link would produce.

---

## Action 11 — Request the listings and citations the project is defensible enough to ask for 🟠 (ongoing, ~2 h)

The 2026-09 deployment is honest enough to be cited — it publishes its provenance, its freshness,
its coverage gaps and its model's limits — and a citation from an authoritative portal is worth
more than any on-site SEO change. Each item below is an outbound request from the thesis author;
none can be performed by a workflow.

| Target | Route in | What to send |
| --- | --- | --- |
| **Department of Agrometeorology, BAU** (supervisor: `https://bau.edu.bd/profile/AGRON1013`) | supervisor | request a project/student-work page linking to the site and the repository |
| **DDM** (Department of Disaster Management) | `ddm.gov.bd` contact form / the district office | one-page summary: what the tool does, what it does not claim, and the `/status` page |
| **BMD**, **FFWC** | the offices the pipeline already reads data from | note that their bulletins are cited as inputs on `/data-sources`; ask whether a reciprocal tools/partners listing exists |
| **ReliefWeb** (OCHA) | submission form for "apps/tools" | the repository + a description that states the hindcast is not yet run |
| **HDX / OCHA Centre for Humanitarian Data** | HDX dataset discussion | the forecast snapshot and its schema; note the historical archive is not redistributed |
| **EM-DAT (CRED, UCLouvain)** | their data-use contact | the event store cites EM-DAT-style records; ask whether the loader's mapping is acceptable before publishing counts |
| **FAO (agrometeorology / GIEWS)** | country office | the advisories surface and the district export |
| **Google Earth Engine** (developer/community showcase) | community forum / developer program | the Sentinel-2, Landsat 8 and ERA5-Land collections the pipeline consumes |
| **GitHub** | repository page (`github.com/myself-aas/HazardNet`) | topics, description, `CITATION.cff` (already committed — the "Cite this repository" button now works), and a release tag |
| **Data providers**: Vercel, Firebase, Open-Meteo, Leaflet, OpenStreetMap, Copernicus (Sentinel-2), USGS/NASA (Landsat 5/7/8), ECMWF (ERA5-Land), Copernicus EMS, SAR (Sentinel-1) | their community/showcase or "who uses this" pages | a short note naming exactly which product is used and where it is credited |
| **University disaster-research centres** (BUET, DU IWFM, BAU, KUET and international groups working on Bangladesh) | direct email | the methodology pages, so a reviewer can check the physics without reading the code |

**Rule:** send the site's own state, not a pitch. The current state includes: the pipeline stamps no
model version, no calibration map exists, nothing above `WATCH` can be published automatically,
coverage is partial (60 of 64 districts in the committed run), and the historical archive is not
published. Any listing that requires an accuracy claim cannot be honestly filled in yet — that is
what Phase 9's hindcast is for. Record who replied, when, and what they asked for.

---

## Action 12 — Decide the event archive's fate 🟡 (owner decision, then ~1 h)

`docs/MODEL_CARD.md` §4 quotes **2,931 events (2000–2025)**, and Phase 8 built the pages that would
publish what it contains — but the archive itself is not in the repository, so every district page
currently says "no archive loaded" and `/retrospectives` does not exist. Three coherent options:

1. **Load it privately (fastest, smallest claim).** Run the three commands in
   `docs/ops/SEO_AND_CONTENT.md` §4 on the machine that has the export, rebuild, and the district
   history sections and the retrospectives appear with the archive's own counts and the drift
   against 2,931 printed beside them. The file stays untracked; the *pages* are committed. Note
   that the committed pages would then quote counts derived from third-party data — acceptable for
   a summary, and each page names its source.
2. **Publish it with a DOI.** Deposit the normalised export on Zenodo (or Kaggle, where the working
   copy already lives), then load it as in option 1 and add the DOI to `/data-sources` and the
   JSON-LD `Dataset` node. This is the option that makes the archive *citable*, which is what the
   Phase 8 structured data was written to support — but it needs a redistribution-rights decision
   from the author, because the rows are assembled from sources with their own terms.
3. **Leave it out.** The honest fallback the site already implements. Nothing breaks; the district
   pages keep saying why the section is empty, and the model card keeps owning the 2,931 figure.

Whichever is chosen, record it here. Until one is, the pages must keep saying "no archive loaded" —
and `scripts/tests/test_content_engine.py` will fail any build that fills that space with a number
nobody read.
