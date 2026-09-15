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
| `node scripts/build_forecast_snapshot.mjs` with the fixture CSV | snapshot OK, 128 rows, 7/15-day horizons |
| `npm run lint` / `lint:eslint` / `check:env` / `check:rag-freshness` | clean (0 errors; 283 pre-existing warnings) |
| `npm run build` | exit 0, `frontend/dist` → `dist` |
| `node scripts/gen-model-version.mjs` twice | second run: "unchanged" — deterministic, so the gate is stable |
| `__tests__/modelInfo.test.js` with `Models/VERSION.json` removed | 4 failures (guard proven red) |

## Owner actions that remain

1. **Kaggle token** — confirm `KAGGLE_USERNAME` / `KAGGLE_KEY` in repo secrets
   are the *current* values (Kaggle → Settings → API → Create New Token), then
   re-run the `Verify GitHub Actions Secrets` workflow, then re-run
   `HazardNet Automated Forecast Pipeline` / `Hourly Forecast Refresh`.
2. **Kernel slug** — if those still fail with `404`, set the `KAGGLE_KERNEL`
   repository variable to the notebook's current slug.
3. **Supabase** — re-dispatch `Supabase cutover verify` once `SUPABASE_DB_URL`
   is configured; that job has not had a green run.
4. **Site probe** — the next 30-minute schedule is the live verification of the
   `-L` fix; if it fails with anything other than HTTP 200, the site (not the
   probe) needs attention.
