# Production Readiness Audit — End-to-End

- **Date:** 2026-09-13
- **Auditor:** Arena Agent Mode (automated end-to-end audit)
- **Commit audited:** `arena/01a09904-hazardnet` @ hourly-refresh series (base `fe47515`, main)
- **Scope:** Data pipeline (Kaggle → GitHub Actions → forecast store → website), CI/CD, backend API, frontend, security, infrastructure/deployment, testing & quality, monitoring, repository hygiene & governance.
- **Method:** executed checks only — full jest suite with coverage, production frontend build, backend runtime smoke tests, dependency audit, workflow schema validation, secrets scanning, live-production probing of hazardnet.live, config review. No claims beyond verifiable evidence; every finding carries its evidence trail (§10).

---

## 1. Executive Summary

**Verdict: CONDITIONALLY PRODUCTION-READY (overall score 71/100).**
HazardNet is an unusually well-architected codebase — ADR-governed, layered security middleware, dual-store forecast abstraction, monitoring stack, and comprehensive docs. However, five issues gate a clean production sign-off:

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | 🔴 **P0** | **Live credentials committed to the repo** (Gemini/OpenRouter/Groq/HF keys, Supabase JWT secret + DB URL, Kaggle API token, GitHub PAT, VAPID private key in `.env.example` & `.github/secrets.env`) | **Sanitized in this audit; ROTATION still mandatory** (values persist in git history) |
| 2 | 🔴 **P0** | **Production site serves mock data** — hazardnet.live renders the hardcoded `ALL_64_DISTRICTS` baseline (verified live), because no real forecast rows have ever been ingested and the Vercel deployment has **no GET handler for `/api/v1/forecasts/bulk`** | Hourly pipeline built (this branch); enablement pending workflow-file push permission |
| 3 | 🟠 **P1** | **CI is red on `main`** — 22 tests in 3 suites fail (`rag_pipeline/index.js` uses `import.meta.url` under Jest's CJS transform, cascading through `backend/server.js`) | Root cause identified (§5.3) |
| 4 | 🟠 **P1** | **`main` branch unprotected** (no protection rules, 0 rulesets) while bots push data commits directly to it | Recommend ruleset (§9) |
| 5 | 🟠 **P1** | **CORS reflects arbitrary origins when `FRONTEND_ORIGIN` is unset** (verified live in runtime test); CSP remains Report-Only | Verify/set env in prod (§6.2–6.3) |

Everything else is solid: fail-closed ingest auth (503 without key), model-artifact routes blocked (404), layered rate limiting, forecast-age gauge with honest absence semantics, dual-store parity, passing coverage gates, passing bundle budget, working Playwright harness, and 7 ADRs of governance.

### Scorecard

| Domain | Score | Notes |
|---|---|---|
| Data pipeline | 4.5 / 5 | New hourly Kaggle-output pipeline complete & tested; needs enablement on GitHub to move real data |
| CI/CD | 3.5 / 5 | Strong design; red tests on main + workflow-file permission friction + three divergent lockfiles |
| Backend API | 4.0 / 5 | Good security posture; `/api/v1/forecasts/bulk` missing from serverless tier; VERSION.json absent |
| Frontend | 4.0 / 5 | Clean build; snapshot fallback added; main bundle 1,064 kB (313 kB gzip) |
| Security | 2.5 / 5 | Committed secrets history, permissive CORS default, CSP report-only |
| Infrastructure | 3.5 / 5 | Vercel config sane; API parity gap; branch unprotected |
| Testing & quality | 3.5 / 5 | 317/339 green, 45% coverage (gate 32%); 3 broken suites; api/forecasts.js 0% covered |
| Monitoring & observability | 4.0 / 5 | Prometheus/Grafana/alerts present; freshness gauge implemented |
| Governance & docs | 4.5 / 5 | 7 ADRs, runbooks, prior audits, ops docs |
| **Overall** | **71 / 100** | **Conditional pass** |

---

## 2. Data Pipeline Audit (Kaggle → GitHub Actions → Store → Website)

### 2.1 Architecture as audited

```
Kaggle notebook (ashifahmedshuvo/hazardnet-auto-forecast-pipeline)
  └─ runs on Kaggle schedule; writes /kaggle/working/hazardnet_forecasts_latest.csv
        │
        ├─ daily forecast-pipeline.yml  → pushes new notebook version (GEE + Open-Meteo + TFLite), polls, downloads output
        ├─ weekly_forecast.yml          → same + patch release + GitHub Release artifacts
        └─ hourly_forecast.yml (NEW)    → `kaggle kernels output <kernel> -p dest` → validate → ingest → snapshot → commit
                                              │
              ┌───────────────────────────────┼──────────────────────────────┐
   POST /api/v1/forecasts/update     backend/data/forecasts/*        frontend/public/data/forecasts-latest.json
   (forecast store: Firestore|Supabase)   (committed, archived)          (bundled into website; offline fallback)
```

### 2.2 Findings

- ✅ **Hourly refresh implemented & verified** (`hourly_forecast.yml` + `scripts/fetch_kaggle_forecast.py`): retried `kaggle kernels output` download, ingest-contract sanity check (hazard/horizon/severity ranges, required columns), JSON regeneration when the notebook emits CSV-only, sha256 manifest change detection (no-op runs skip commit/ingest), staleness warning >72 h, concurrency guard, artifacts + diagnostics on failure. End-to-end exercised against a mocked Kaggle CLI with a 1,024-row dual-track fixture: `CHANGED=true` → `CHANGED=false` transitions correct; both validator schemas pass; snapshot builder emits API-shaped rows (parseable by the frontend's `parseForecastRow`).
- ✅ **Validation repaired**: `validate_forecasts.py` previously hard-required an ADM3 `location_*` schema the committed notebook never produces — the daily pipeline's validation step could never have passed. Now schema-adaptive (`location_*` **or** `district_*`), tested against both shapes + a negative case.
- ✅ **Daily trigger repaired**: `scripts/kaggle_trigger.py` now prefers the notebook's own kernel output as CSV source (dataset download demoted to fallback) — single source of truth across all three cadences.
- ✅ **Website refresh guarantee**: the hourly workflow commits `backend/data/forecasts/*` **and** the bundled `frontend/public/data/forecasts-latest.json`; pushing to the branch triggers `ci.yml`'s `deploy-production` (Vercel), so the deployed codebase carries data ≤ 1 h old after each notebook run. Frontend `useForecasts()` now falls back to that snapshot when the API is unreachable (see §4.2).
- 🟠 **Real-data enablement blocked (process)**: the Arena GitHub App lacks `workflows` permission, so `.github/workflows/*` cannot be pushed from this environment; additionally the sandbox's egress allowlist blocks Kaggle/Open-Meteo/GCS/Supabase, so no real CSV can be fetched locally. **Real data can only enter via GitHub Actions runners** — the workflow file must be added to GitHub (owner paste or permission grant). Verified: no forecast data exists anywhere in the repo today, and the live store is unreachable from this environment.
- 🟡 **Cadence semantics**: "hourly" means *pickup latency* ≤ 1 h after each notebook completion; the notebook itself runs on its Kaggle schedule (GEE + inference is too heavy for hourly re-execution within Kaggle quotas). Documented in `docs/ops/hourly_forecast.md`.
- 🟡 **Supabase store untested end-to-end from this environment** (connection blocked by sandbox egress). Cutover runbook exists (ADR 0002, `docs/ops/supabase-cutover-verify.workflow.yml`); store-parity unit coverage is strong (forecastStore.js 88.7 %).

---

## 3. CI/CD Audit

### 3.1 Workflow inventory & static validation

| Workflow | Trigger | YAML parse | Schema (`check-jsonschema`, GitHub schema) |
|---|---|---|---|
| `hourly_forecast.yml` (new) | cron `5 * * * *` + dispatch | ✅ | ✅ (after audit fix: boolean input `default` was string `'false'`) |
| `forecast-pipeline.yml` | cron daily 00:00 | ✅ | ✅ |
| `weekly_forecast.yml` | cron Sun 02:00 | 🔴→✅ | ✅ |
| `ci.yml` | push/PR main,develop | ✅ | ✅ |
| `Supabase-cutover-verify.yml` | manual | ✅ | ✅ |

- 🔴 **Fixed:** `weekly_forecast.yml` contained a column-0 shell continuation inside a `run: |` block — the literal scalar terminated early and the file was **unparseable YAML**; GitHub could not load the workflow at all. Repaired (`$'\n'` concatenation).
- ✅ Concurrency groups added to hourly + daily pipelines (no overlapping runs).
- ✅ Secrets preflight with actionable error messages; fail-closed ingest; rebase-before-push on the hourly commit step.

### 3.2 CI behavior (executed locally, mirrored)

- 🔴 **`test-backend` is red on main**: `npx jest --ci` → 37 suites, **3 failed / 22 tests failed**. Root cause: `rag_pipeline/index.js:35` uses `import.meta.url`; babel-jest transpiles it to CJS where `import.meta` is illegal → `SyntaxError` cascades through `backend/routes/advisory.js` → `backend/server.js`, breaking `__tests__/api/{forecasts,predict,security}.test.js`. Verified pre-existing at base commit `fe47515` via a clean worktree (not introduced by this branch).
- ✅ `npm audit --omit=dev --audit-level=high` **passes** (CI's gate): all 12 advisories (1 critical `tar`, 4 high incl. `gaxios`) live in dev-dependency chains only.
- ✅ `check:bundle` passes (1,104 kB gzip total, within budget); `check:rag-freshness` passes.
- ✅ `npm run lint` (tsc) clean; ESLint clean on changed files.
- 🟡 **Three lockfiles coexist** (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`); CI installs with bun, weekly pipeline with pnpm, Vercel builds with npm. Drift risk between resolved trees — pick one.

### 3.3 Release path

`ci.yml → deploy-production` deploys to Vercel on push to `main` when `VERCEL_TOKEN` is set; PR previews likewise. Since the hourly workflow commits to the branch and opens no new flows, **data commits auto-deploy** — the intended "website refreshes hourly" mechanic. ⚠️ Data commits also trigger the full CI matrix every hour when data changes (acceptable; no `[skip ci]` — deliberately, since deploy depends on it).

---

## 4. Backend Audit

### 4.1 Runtime smoke test (executed)

| Probe | Result |
|---|---|
| `GET /health` | ✅ 200 — reports model version (⚠️ "legacy literal — VERSION.json missing") |
| `GET /metrics` | ✅ Prometheus exposition; forecast-age gauge correctly **absent** when store unreachable (honest-failure design) |
| `POST /api/v1/forecasts/update` without key | ✅ **503 fail-closed** |
| `GET /Models/hazardnet_fp32.tflite`, `/hazardnet_fp32.tflite`, `/normalization_stats.json`, `/labels.json` | ✅ all 404 (artifact exfiltration blocked) |
| Security headers | ✅ HSTS (1 yr, includeSubDomains), nosniff, X-Frame-Options SAMEORIGIN, CSP present (**Report-Only**) |
| SPA fallback + static `dist/` serving | ✅ configured |

### 4.2 Findings

- ✅ **Ingest contract robust**: shared parser (`backend/utils/forecastRow.js`) accepts legacy single-track and notebook dual-track CSVs; integration-tested (`__tests__/forecastsUpdate.test.js`); replace-all-per-prediction-date semantics; advisory generation fail-soft.
- ✅ **Dual-store abstraction** (Firestore ↔ Supabase) with documented cutover runbook and shape-parity tests.
- 🟡 `api/forecasts.js` 0 % test coverage; `backend/inference.js` 0 % (edge inference path untested).
- 🟡 `scripts/gen-model-version.mjs` exists but `VERSION.json` is absent → `/health` degrades to legacy literal.

---

## 5. Frontend Audit

### 5.1 Build (executed)

- ✅ Production build succeeds (3.02 s). ⚠️ Warnings: `index-*.js` **1,064 kB** (313 kB gzip) and `PdfExportButton` 734 kB exceed the 1,000 kB advisory; both within the repo's own bundle budget. Recommend dynamic-importing the PDF stack and splitting the root chunk.
- ✅ TypeScript (`tsc --noEmit`) clean.

### 5.2 Live-data plumbing

- ✅ `useForecasts()` polls every 5 min with `cache: 'no-store'` + `fresh=` cache-busting; live rows overlay the static baseline additively; ADM3→ADM2 rollup restores 64-district coverage; rename-alias table handles GAUL↔local spellings (all unit-tested; 27 tests green).
- ✅ **Static hourly snapshot fallback added** (`/data/forecasts-latest.json`): parsed by the same row validator; resolves to `[]` on any failure so the UI degrades to the baseline instead of erroring.
- 🔴 **Production currently displays mock data** (verified live, §6.4). With no GET `/bulk` on Vercel and an empty store, the baseline's hand-authored severities ("Panchagarh: Cold Wave 55 %") are what visitors see. The hourly pipeline + snapshot fallback is the designed exit from this state.

### 5.3 Vercel routing

- ✅ SPA rewrite excludes `api/|assets/|serviceWorker.js`; immutable caching on `/assets/*`; `no-cache` on `serviceWorker.js`; **audit added** `max-age=0, must-revalidate` for `/data/*` so the hourly snapshot can never be served stale.
- 🔴 **API parity gap**: `api/forecasts.js` is POST-only (405 otherwise); **no serverless GET handler for `/api/v1/forecasts/bulk`** exists on Vercel. Consequences: metadata cards fall back to bulk→error→baseline; the snapshot is the only Vercel-native data path until either (a) a GET serverless handler is added, or (b) an external backend deployment fronts `/api`. **Recommendation: add a thin GET handler reusing `getForecastStore()`** (small, high value).

---

## 6. Security Audit

### 6.1 🔴 Committed credentials (CRITICAL)

Scan (`ghp_/sk-/KGAT_/AIza/BEGIN/xox/AKIA` patterns) hit four tracked files:

| File | Leaked material | Action |
|---|---|---|
| `.env.example` | Gemini ×2, OpenRouter, Groq, HuggingFace, VAPID private key, Supabase JWT secret, **Supabase DB URL with password**, Kaggle API token, GitHub PAT | **Sanitized to placeholders in this audit** |
| `.github/secrets.env` | GitHub PAT (`ghp_…`) | **Sanitized in this audit** |
| `firebase-applet-config.json`, `frontend/src/lib/config.ts` | Firebase **web app** config only | ✅ Public-by-design; risk controlled by Security Rules (default-deny verified in `firestore.rules`) |

⚠️ **Sanitization does not un-leak these values — they persist in git history. All listed keys/tokens must be rotated** (Gemini, OpenRouter, Groq, HF, VAPID pair, Supabase JWT + DB password, Kaggle token, GitHub PAT), then optionally history-scrubbed (`git filter-repo`) with a force-push window.

### 6.2 CORS (runtime-verified)

- With `FRONTEND_ORIGIN` set: evil origin rejected, configured origin allowed ✅.
- **Without it (default)**: `Access-Control-Allow-Origin` **reflects any origin** (legacy permissive mode). The API is mostly public-read, but advisory/chat/predict endpoints ride the same CORS surface. **Action:** assert `FRONTEND_ORIGIN` in every runtime (Vercel env + any backend host); consider failing closed in production mode.

### 6.3 Other controls (verified present)

- ✅ Fail-closed Bearer auth (timing-safe) on ingest/push endpoints; ✅ layered rate limits (AI 20/min, inference 60/min, API 120/min per IP, draft-7 headers); ✅ helmet + custom middleware; ✅ model/asset exfiltration routes 404; ✅ trust-proxy=1 behind one hop; 🟡 CSP Report-Only (flip `CSP_ENFORCE=true` after the monitoring window — ADR 0003).

### 6.4 Live production probe (hazardnet.live)

- ✅ Site reachable, SPA renders.
- 🔴 Renders **static baseline data** (district severities match `ALL_64_DISTRICTS` literals exactly) — confirms no live rows in production today.

---

## 7. Testing & Quality

| Metric | Value | Gate | Status |
|---|---|---|---|
| Suites | 34/37 pass | — | 🟠 3 broken (pre-existing, §3.2) |
| Tests | 317/339 pass | — | 🟠 |
| Statements coverage | 45.27 % | ≥ 32 % | ✅ |
| Branches | 46.98 % | ≥ 35 % | ✅ |
| E2E | Playwright smoke + critical-paths specs; CI runs headless Chromium against `vite preview` | — | ✅ harness present (static path) |
| Load tests | `load-tests/forecasts.yml`, `predict.js` (k6-style) | — | ✅ present, not executed here |

Zero-coverage hotspots to target next: `api/forecasts.js` (0 %), `backend/inference.js` (0 %), `backend/routes/predict.js` paths.

---

## 8. Monitoring & Observability

- ✅ `monitoring/` ships `prometheus.yml`, `grafana-dashboard.json`, `alerts.yml`; README documents scrape config.
- ✅ `hazardnet_forecast_age_hours` gauge with scrape-driven refresh (60 s cache) and **absent-series-on-failure** semantics (a flat zero can't mask outages) — good SRE practice.
- ✅ Hourly workflow emits `::warning::` on stale `prediction_date` (>72 h) and writes a GitHub step summary per run.
- 🟡 No uptime/external probe for hazardnet.live itself; no CI notification channel (Slack/email) wired — failures are visible only in Actions.

---

## 9. Repository Hygiene & Governance

- ✅ 7 ADRs, deployment-verification audit trail (3 prior audit docs), ops runbooks — excellent governance.
- 🟡 Stray root files: `test_perm.txt`, `test_pdf_export.cjs`, `fix-dash.cjs`, `patch.cjs`, `update_print_css.cjs`, `.npmrc.bak`, `audit_temp/` — candidates for removal.
- 🟡 `Models/hazardnet_fp32.tflite` (790 kB) tracked in git — intentional (served to edge via separate channel, never publicly); acceptable but watch repo growth; consider Git LFS.
- 🔴 **`main` unprotected**: `protected: false`, 0 rulesets — while automation pushes directly to it. Recommend: require PR reviews + status checks (at minimum jest backend/frontend + lint) via rulesets; allow the bot bypass for data commits.
- 🟡 `.github/secrets.env` should be deleted entirely post-rotation (template retained for now).

---

## 10. Evidence Log (commands executed during this audit)

```text
check-jsonschema --builtin-schema vendor.github-workflows .github/workflows/*.yml   # schema validation (1 finding fixed)
python3 -c "import yaml; yaml.safe_load(...)" ×5                                     # parse check (weekly.yml FAIL → fixed)
npx jest --ci --coverage                                                             # 37 suites, 317 pass / 22 fail (pre-existing)
git worktree add /tmp/hzbase fe47515 && npx jest …                                   # proves the 22 failures exist on base commit
npm audit / npm audit --omit=dev --audit-level=high                                  # 12 vulns dev-only; prod gate PASS
npm --prefix frontend run build                                                      # build OK, 3.02 s, chunk warnings
npm run lint (tsc) / npx eslint <changed files>                                      # clean
npm run check:bundle / check:rag-freshness                                           # PASS / PASS
PORT=3999 node backend/server.js + curl probes                                       # health/metrics/404s/headers/503/CORS
curl -H "Origin: https://evil.example.com" … (with & without FRONTEND_ORIGIN)        # CORS behavior verified both ways
pip: fetch_kaggle_forecast.py e2e w/ mocked kaggle CLI + 1024-row fixture            # CHANGED true→false, both schemas, negative case
node scripts/build_forecast_snapshot.mjs <fixture>                                   # snapshot shape == API row shape
curl https://hazardnet.live (via fetch tool)                                         # live site renders static baseline
gh api repos/myself-aas/HazardNet/branches/main                                      # protected:false; rulesets:0
egress probes: pypi/github 200; kaggle/GCS/open-meteo/supabase 000                    # sandbox network constraint documented
```

---

## 11. Prioritized Remediation Roadmap

### P0 — do now
1. **Rotate every credential listed in §6.1** (they are in git history), then optionally `git filter-repo`.
2. **Enable the hourly pipeline**: add `.github/workflows/hourly_forecast.yml` to GitHub (owner paste — patch provided — or grant the Arena app Actions permission), confirm `KAGGLE_USERNAME`/`KAGGLE_KEY`/`BACKEND_API_KEY` secrets, run it once manually, then merge to `main` for the cron.
3. **Fix the 22 red tests**: add an `import.meta`-safe transform for `rag_pipeline/` (babel plugin `babel-plugin-transform-import-meta`, or a jest `moduleNameMapper` shim, or load via dynamic `import()`), unblocking `test-backend`.

### P1 — this week
4. Add a **Vercel GET handler** for `/api/v1/forecasts/bulk` (+ `/metadata`) reusing `getForecastStore()` — closes the API parity gap so production isn't snapshot-only.
5. **Protect `main`** with a ruleset (require PR + green jest/lint checks; bot bypass for `chore(data):` commits).
6. Assert `FRONTEND_ORIGIN` in every production runtime; remove the permissive CORS fallback behind a `NODE_ENV !== 'production'` guard.
7. Consolidate to **one lockfile** (CI uses bun; weekly uses pnpm; Vercel uses npm) and align all workflows.

### P2 — next sprint
8. Flip CSP to enforcing (`CSP_ENFORCE=true`) once the violation report window is clean.
9. Code-split the frontend root chunk & lazy-load the PDF stack (−~700 kB initial).
10. Cover `api/forecasts.js` and `backend/inference.js` with tests; generate `VERSION.json` in CI.
11. Remove stray root files; consider Git LFS for model artifacts.
12. Add an external uptime probe + failure notifications for the hourly pipeline.

---

## 12. Production Readiness Checklist

| Requirement | Status |
|---|---|
| Real forecast data reaches the deployed website automatically | 🟡 built & tested; **pending enablement on GitHub** |
| Hourly pickup latency of Kaggle notebook output | ✅ workflow implemented (cron `5 * * * *`) |
| No mock data in committed pipeline path | ✅ pipeline carries only fetched CSVs; site baseline remains as offline fallback until first real ingestion |
| Secrets out of the repo | 🟡 sanitized now; **rotation outstanding** |
| CI green on main | 🔴 22 pre-existing failures to fix |
| Deployment automation | ✅ Vercel prod deploy on push (secrets-dependent) |
| Security controls (auth/CORS/rate-limits/headers) | ✅ with §6.2/§6.3 caveats |
| Observability | ✅ metrics + dashboards + alerts + freshness gauge |
| Rollback story | ✅ releases, archived forecasts, history endpoint |
| Documentation & governance | ✅ ADRs, runbooks, audits |

**Bottom line:** the platform is production-grade in design and largely in implementation. Clearing the P0 list — credential rotation, pipeline enablement, and the red test fix — converts the conditional pass into an unconditional one.
