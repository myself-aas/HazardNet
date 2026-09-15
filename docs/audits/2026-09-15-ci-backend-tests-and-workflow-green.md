# 2026-09-15 — Backend Tests red on `main`, and the rest of the board

Scope: make the repository's Actions board green. Three independent failures
were on it, only one of which was a code problem in the usual sense. Each is
described below with the evidence, the fix, and the regression guard that keeps
it from coming back silently.

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `CI/CD Pipeline → Backend Tests` red on every push to `main` (runs [35020074976][r1], [35018953386][r2], [35018154672][r3]) — 1 test of 188 | `Models/VERSION.json` was generated but never committed; `/api/predict` reported the legacy literal, which the API-contract test rejects | Commit the generated handshake + a test that pins it + make the CI gate able to see a *missing* file |
| 2 | `Site Health Probe` red on every 30-minute schedule (all runs since 2026-09-13) | `curl` without `-L` reported the apex→`www` **308** as the probe result while the site served 200 | Follow redirects (`-L`) and assert the final URL stays on the production domain |
| 3 | `HazardNet Automated Forecast Pipeline` / `Hourly Forecast Refresh` red at their first Kaggle call | External: Kaggle credentials or the kernel slug. Both jobs died with a bare `exit code 1` and no explanation | Make the slug a repository variable and make the failure self-describing |

[r1]: https://github.com/myself-aas/HazardNet/actions/runs/35020074976
[r2]: https://github.com/myself-aas/HazardNet/actions/runs/35018953386
[r3]: https://github.com/myself-aas/HazardNet/actions/runs/35018154672

## 1. Backend Tests — the one-line reason for a red pipeline

```
● POST /api/predict › accepts a correctly shaped tensor and returns the prediction envelope
    expect(received).toMatchObject(expected)
    -     "model_version": StringMatching /\d+\.\d+\.\d+/,
    +     "model_version": "1.0-FP32 (legacy literal — VERSION.json missing)",
```

`backend/routes/predict.js` stamps `getModelInfo().version` into every response,
and `backend/modelInfo.js` falls back to a literal with no `x.y.z` in it when
`Models/VERSION.json` is absent. `scripts/gen-model-version.mjs` had been run by
hand — the file existed in no working tree but the author's, and it was never
`git add`ed. Reproduced locally from the failing commit (`37aa7e8`) with the
exact CI command:

```bash
npx jest --ci --coverage --coverageDirectory=./coverage/backend \
  --testPathIgnorePatterns='/node_modules/' '/e2e/' '/frontend/'
# 1 failed, 20 passed, 188 total  ← same shape as CI
```

### Why CI could not have caught it earlier

The `verify` job's gate was `git diff --exit-code -- Models/VERSION.json`.
`git diff` says nothing about an **untracked** file (and nothing about a deleted
one once it is untracked), so the step reported the handshake "current" on `main`
while the file did not exist at all — and, because `verify` `needs: [test-backend, …]`,
it never even ran while Backend Tests was red. The failure had to come out in the
one place that actually reads the version string.

### Fix

1. **`Models/VERSION.json` is committed** — `2.1.9+model.d7b1a5b48aa6`, covering
   `hazardnet_fp32.tflite`, `labels.json`, `normalization_stats.json`,
   `preprocessing_config.json` (bytes + sha256 each). Generation is
   deterministic (unchanged artifacts ⇒ byte-identical file), so the existing
   "regenerate and compare" gate stays meaningful.
2. **`__tests__/modelInfo.test.js` (new)** pins the handshake from both ends:
   the file parses, its `version` carries the `<package.json version>+model.<hash>`
   shape the API contract asserts on, every listed artifact's `bytes`/`sha256`
   match the file on disk, and `getModelInfo()` returns *it* rather than
   `LEGACY_VERSION`. Verified red when the file is renamed away (4 failures).
   This is the guard the predict test was accidentally providing.
3. **`backend/modelInfo.js` stops memoising the fallback.** A missing file is
   now warned about explicitly (`[modelInfo] Models/VERSION.json is missing …`)
   and re-probed on the next call instead of being cached for the life of the
   process — a long-running server used to keep reporting the legacy literal
   even after the file appeared on disk.
4. **The CI gate sees missing files**: `git status --porcelain -- Models/VERSION.json`
   (untracked `??` and modified ` M` both count) replaces the `git diff` check,
   guarded by `scripts/tests/test_workflows.py::test_model_version_gate_detects_missing_file`.
5. `Models/README.md` documents the file as tracked and part of any artifact change.

## 2. Site Health Probe — a redirect reported as an outage

```
X Homepage returned HTTP 308
```

Every scheduled run back to 2026-09-13 failed the same way, in 2–4 seconds,
before the metadata step could run. The deployment is canonical on
`https://www.hazardnet.live` (see `docs/ops/owner-actions.md`, which uses the
`www` host for every API check), the apex answers **308**, and the probe's
`curl -sS` recorded the redirect itself as the result. Fixed by following
redirects and keeping the probe honest about where it landed:

```bash
RESPONSE=$(curl -sSL --max-redirs 5 -o /tmp/home.html -w "%{http_code} %{url_effective}" …)
# … then: HTTP must be 200 AND the final URL must still be
#          $SITE_URL* or https://www.hazardnet.live*
```

A redirect that leaves the production domain still fails the job, so the probe
cannot be satisfied by a hijacked or parked redirect. The metadata probe
follows redirects too (same apex→www hop). Guarded by
`test_site_health_probe_follows_redirects`, which fails any `curl` in the file
that lacks `-L`.

**Cannot be verified from here:** the CI sandbox has no outbound HTTPS to
`hazardnet.live` (TLS handshake reset; only `api.github.com` is reachable), so
the first scheduled run after this merge is the verification.

### What the redirect was hiding (verified against production, 2026-09-15)

Following the redirect exposes a **separate, still-open production defect** —
the one the 2026-09-13 audit filed as P0-2 ("the Vercel deployment has no GET
handler for `/api/v1/forecasts/bulk`"). Probed from outside the sandbox:

| URL | Result |
|---|---|
| `https://www.hazardnet.live/` | **200** — the SPA renders (TFLite/severity UI) |
| `https://www.hazardnet.live/api/metrics` | **404** `NOT_FOUND` (Vercel's platform 404 page, not the app's JSON) |
| `https://www.hazardnet.live/api/v1/forecasts/metadata` | **404** (same Vercel platform page) |
| `https://www.hazardnet.live/dashboard` | **404** (same) |

The SPA answers on `/` only, no `/api/*` function is reachable, and client-side
deep links 404 as well — the shape of a Vercel project whose **Root Directory**
is the frontend (`frontend/`) rather than the repository root, so neither the
root `vercel.json` rewrites nor the root `api/` serverless functions are part of
the deployment (the Vercel commit status reported the newest commit,
`37aa7e8`, as a successful deployment, so this is not a stale deploy).

That is why the probe's second half is still red — and it is a **true finding**,
not a flake: the frontend's `useForecasts()` falls back to the committed static
snapshot, which is exactly the "site serves mock/baseline data" symptom the
2026-09-13 audit measured. Two changes keep the probe useful instead of merely
red:

* a 404 now prints **why** (`this deployment serves no /api/v1/forecasts/* route
  … check the Vercel Root Directory`), and
* the probe can be pointed at wherever the API actually runs with the
  `API_METADATA_URL` repository variable (default unchanged:
  `$SITE_URL/api/v1/forecasts/metadata`) — the Kaggle pipeline already pushes to
  a `HAZARDNET_API_URL` that need not be the website host.

**Owner fix for the deployment:** Vercel → project `hazardnet` → Settings →
Build & Development Settings → **Root Directory** = repository root (or deploy a
second project rooted at the repo root and point `www` at it). Until then the
site is static-only: deep links 404, and every `useForecasts()` call falls back
to the bundled snapshot.

## 3. Kaggle-backed pipelines — the failure is external, the silence was ours

| Workflow | Failed step | Run |
|---|---|---|
| HazardNet Automated Forecast Pipeline | `Trigger Kaggle Notebook Run` (`scripts/kaggle_trigger.py`) | [34995653465][k1] (every 3-h run since 2026-09-12) |
| Hourly Forecast Refresh | `Fetch latest Kaggle notebook output` (`scripts/fetch_kaggle_forecast.py`) | [35010218205][k2] (every hourly run) |

[k1]: https://github.com/myself-aas/HazardNet/actions/runs/34995653465
[k2]: https://github.com/myself-aas/HazardNet/actions/runs/35010218205

The forecast pipeline's job lasted 1 m 12 s in total, so the Kaggle call failed
within seconds of being made — the signature of a rejected token (401/403) or a
kernel that no longer exists (404), not of a notebook that ran and failed (that
would poll for minutes). The secrets preflight **passed**, so the credentials
are *present*; `docs/ops/owner-actions.md` had the owner rotate the Kaggle API
token, and a rotation that does not reach the repository secret leaves exactly
this state. The other candidate is the slug itself: the notebook lives only on
Kaggle, and renaming or re-uploading it changes
`ashifahmedshuvo/hazardnet-auto-forecast-pipeline`.

Neither cause is fixable from the repository, but three things are, and are done:

1. **`KAGGLE_KERNEL` is a repository variable** (`${{ vars.KAGGLE_KERNEL || 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline' }}`)
   in all three Kaggle workflows (`forecast-pipeline`, `hourly`, `weekly`'s
   `KERNEL_SLUG`). A renamed notebook can now be repointed from Settings →
   Secrets and variables → Actions → Variables without a code change. The
   step-level overrides that shadowed it with the old hardcoded slug are gone.
2. **`scripts/kaggle_trigger.py` says why it failed.** Status lines are
   classified (`complete` / `failed` / `pending`, `complete` first so a
   "complete (0 errors)" summary cannot be misread), credentials and 404s map to
   actionable `::error::` annotations naming the secret or the variable to fix,
   an un-run kernel gets a pointer instead of silence, and a failing status
   dumps `kaggle kernels list --mine` so the log shows which kernels the token
   can actually see. Timeout/poll arithmetic in the help text is corrected
   (45 polls × 30 s = 22.5 min, not "45 minutes").
   Covered by `scripts/tests/test_kaggle_trigger.py` (20 tests, including
   end-to-end runs against a fake `kaggle` CLI for the 401/404/timeout/never-run
   paths).
3. **A triage runbook for the owner**: [`docs/ops/kaggle-pipeline-triage.md`](../ops/kaggle-pipeline-triage.md).

Untouched and still red until an owner acts: the two Kaggle schedules above, the
`Supabase cutover verify` dispatch run (2026-09-12, needs `SUPABASE_DB_URL`),
and `weekly_forecast.yml` (last run 2026-09-13, same Kaggle trigger).
`daily_forecast.yml` and `manual_forecast_ingest.yml` have never run — they are
schedule/path-triggered and have nothing to report.

## 3b. Kaggle removed from the forecast path (owner decision, 2026-09-16)

After §3 was written the owner stated the intent plainly: *"I need to run auto
forecast pipeline script on GitHub. Don't need Kaggle to run it."* That is
already the repository's documented architecture — `docs/mlops/ARCHITECTURE.md`
("Profile 1 — Daily Auto-Forecast", *"Why this is better than the all-Kaggle
setup"*) — but the schedulers said otherwise: **every** timer-driven forecast job
went through Kaggle, while `scripts/auto_forecast.py` (GEE + Open-Meteo +
tflite-runtime, ~19 min, no Kaggle) was the only generator that could actually
run, and it never committed its output.

What changed:

| Before | After |
|---|---|
| `forecast-pipeline.yml` (every 3 h), `hourly_forecast.yml` (hourly), `weekly_forecast.yml` (weekly) drove Kaggle | All three are **dispatch-only legacy** (schedules removed, retired banner + triage doc); the files stay for the heavy ADM3/OSM/release work |
| `daily_forecast.yml` ran the script, then pushed to an ingest API that does not exist and exited 1 | It is now **the** scheduled producer with the full chain: generate → promote → validate → snapshot → commit |
| Nothing committed the generated data; the site could only be refreshed by the Kaggle hourly job | `scripts/publish_forecast_csv.py` (new) writes `backend/data/forecasts/*.csv|json` + manifest; `build_forecast_snapshot.mjs` stamps `SNAPSHOT_SOURCE`; the run commits both |
| API push was mandatory → the 404 in §2 turned every run red | `PUSH_TO_API` repository variable (default `false`): artifact-only by default, hard-gated once an API exists |
| Secrets catalog demanded Kaggle + API credentials | Kaggle → optional/legacy, `HAZARDNET_API_*` → optional, `EE_SERVICE_ACCOUNT_JSON` → the one required credential (it is the satellite data source) |

New guard: `scripts/tests/test_workflows.py::test_forecast_generation_runs_on_the_runner_not_kaggle`
(the scheduled producer runs `auto_forecast.py` + `publish_forecast_csv.py` +
`build_forecast_snapshot.mjs`, must not call the `kaggle` CLI or read
`secrets.KAGGLE_*`, and the three Kaggle workflows must stay dispatch-only).
New tests: `scripts/tests/test_publish_forecast_csv.py` (7 cases incl. the
promote → validate → snapshot chain end-to-end against a fixture CSV).

## 4. Actions runtime — the last Node 20 straggler

Every CI job carried
`Node.js 20 is deprecated… actions/cache@v4`. The 2026-09-14 runtime sweep
(`docs/audits/2026-09-14-actions-runtime-and-vercel-deploy.md`) moved every
other JavaScript action to a `node24` release but missed `actions/cache`, which
was still on `@v4`. Bumped to `@v5` (`runs.using: node24`, requires runner
≥ 2.327.1 — hosted runners are far past it) in all 12 call sites, and added to
`REQUIRED_ACTION_VERSIONS` so the next drift fails `Pipeline Scripts Tests`.

## Verification (local, from this branch)

| Check | Result |
|---|---|
| `npx jest --ci --coverage …` (backend job, exact CI argv) | 22 suites / 192 tests pass, coverage gates met |
| `npx jest … frontend/src` (frontend job) | 21 suites / 225 tests pass |
| `python -m pytest scripts/tests -q` (pipeline job) | 56 pass (incl. 3 new workflow guards, 20 new trigger tests) |
| `node scripts/build_forecast_snapshot.mjs` with the fixture CSV | snapshot OK, 128 rows, 7/15-day horizons; `SNAPSHOT_SOURCE` honoured |
| `scripts/tests/test_publish_forecast_csv.py` | 7 pass — including promote → `validate_forecasts.py` → snapshot as one chain |
| `npm run lint` / `lint:eslint` / `check:env` / `check:rag-freshness` | clean (0 errors; 283 pre-existing warnings) |
| `npm run build` | exit 0, `frontend/dist` → `dist` |
| CI on PR #26 (`gh run view 35021720224`) | **all 6 jobs green** — Backend, Frontend, Pipeline Scripts, E2E (46 passed), Security Audit, Code Quality & Build; the Node 20 deprecation annotation is gone |
| `node scripts/gen-model-version.mjs` twice | second run: "unchanged" — deterministic, so the gate is stable |
| `__tests__/modelInfo.test.js` with `Models/VERSION.json` removed | 4 failures (guard proven red) |

## Owner actions that remain

1. **Vercel Root Directory** (new, §2) — production serves the frontend only:
   every `/api/*` route and every client-side deep link 404s. Set the project's
   Root Directory to the repository root (Settings → Build & Development
   Settings), or point `www` at a project rooted there. This is the same P0-2
   the 2026-09-13 audit opened; until it is done the site-health probe's API
   half and `useForecasts()` (which falls back to the bundled snapshot) cannot
   be right.
2. **Forecast data** — dispatch `HazardNet Daily Forecast Pipeline` once
   (Actions → Run workflow) and confirm it commits `backend/data/forecasts/` +
   `frontend/public/data/forecasts-latest.json`; that is the delivery path while
   the deployment serves no API. `EE_SERVICE_ACCOUNT_JSON` must be configured —
   it is the only credential this path needs (no Kaggle). Once the API is live
   (§2a-bis), set the `PUSH_TO_API` repository variable to also write the store.
3. **Codecov `codecov/patch`** — the check fails on this PR for an account
   reason, not a coverage one: *"The author of this PR,
   arena-ai-coding-agent[bot], is not an activated member of this organization
   on Codecov."* Activate the bot under Codecov → Members, or ignore the check
   (it does not block the merge; every bot-authored PR shows it).
4. **Kaggle token** (legacy only) — confirm `KAGGLE_USERNAME` / `KAGGLE_KEY` in repo secrets
   are the *current* values (Kaggle → Settings → API → Create New Token), then
   re-run the `Verify GitHub Actions Secrets` workflow, then re-run
   `HazardNet Automated Forecast Pipeline` / `Hourly Forecast Refresh`.
5. **Kernel slug** (legacy only) — if those still fail with `404`, set the `KAGGLE_KERNEL`
   repository variable to the notebook's current slug.
6. **Supabase** — re-dispatch `Supabase cutover verify` once `SUPABASE_DB_URL`
   is configured; that job has not had a green run.
7. **Site probe** — the next 30-minute schedule after the merge is the live
   verification of the `-L` fix. The homepage probe should pass; the metadata
   step will keep failing with the §2 diagnosis until the deployment serves the
   API (or `API_METADATA_URL` is pointed at it).
