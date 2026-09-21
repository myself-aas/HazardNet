# Testing Patterns
# Testing

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.
**Evidence:** `jest.config.cjs`, `jest.setup.ts`, `babel.config.cjs`, `playwright.config.ts`, `playwright.qa.config.ts`, `package.json` scripts, `__tests__/*.test.js`, `scripts/tests/test_*.py`, `scripts/tests/test_*.mjs`, `scripts/tests/fixtures/`, `e2e/`.

## Core Sections (Required)
## Test Frameworks

### 1) Test Stack and Commands
- **Jest 29** (`babel-jest@^30.4.1`) — primary unit/integration test runner.
- **@testing-library/react** + **@testing-library/jest-dom** — React component tests.
- **supertest** (@types/supertest) — HTTP integration tests against the Express app loaded without binding a port (`invokedAsScript` guard in `backend/server.js`).
- **Playwright** (`@playwright/test@^1.62.1`) — E2E/browser tests. Two configs: `playwright.config.ts` (full) and `playwright.qa.config.ts` (QA/design audit).
- **pytest** (implicit) for Python tests in `scripts/tests/` — discovered as `test_*.py`.
- **Custom Node test scripts** (`*.mjs` under `scripts/tests/`) — these look hand-rolled/test-runner agnostic (they appear to use Node's built-in `assert` in some cases; [TODO] confirm runner).

Jest `^29.7.0` is the root runner with Babel transformation, jsdom default environment, Testing Library, jest-axe and Supertest. pytest tests pipeline/scientific code; Playwright `^1.62.1` drives browser QA (`package.json`, `jest.config.cjs`, requirement files).
## Test Layout

```bash
# After npm ci, from root:
npm test -- --runInBand
npm test -- --runInBand --coverage
npx jest --runInBand __tests__/forecastStore.test.js
npm --prefix frontend test
npm run lint
npm run lint:eslint

# Separate Python environment: use scripts/requirements-pipeline.txt
python3 -m pytest scripts/tests -q
# Scientific tests require training/requirements.txt, preferably a separate environment
python3 -m pytest training/tests -q

# Build, then serve frontend/dist (separate process), then test:
npm run build
npm --prefix frontend run preview -- --host 0.0.0.0 --port 4173
# In another terminal:
npx playwright test
```
__tests__/                             # Jest tests (root-level, matching jest.config.cjs roots)
├── alerts/*.test.js                   # Alert engine, channels, digest, lifecycle, policy, notify, report, service, assess
├── api/*.test.js                      # API endpoint tests (alerts, forecasts, predict, chatPromptBounds, security, serverlessGuard)
├── *.test.js                          # Cross-cutting: predict, ingest, cors, csvSafety, firebaseAuth, firestoreRules, forecastFreshness, forecastPersistence, forecastRow, forecastServe, forecastStore, metricsApi, modelInfo, modelPerformance, nasaTokens, paletteTokens, publicSurface, publicText, push, runtimeDependencies, security, securityHeadersParity, securityTxt, seoFoundations, serviceWorker, severityEmbargo, staticShellContrast, statusPagePrerender, structuredData, vercelForecasts, calibratedConfidence, chatService, claimsGate, contentEngine, conversions, designTypography, forecastSnapshot, forecastsHistory, forecastsUpdate, freshnessArtifact, modelInfo, noRepoPaths, alertReplay, alertSnapshot
scripts/tests/                         # Tests for build/ETL/MLOps scripts
├── test_etl_*.py                      # ETL adapters, events, hydrology, lineage, sources
├── test_mlops_*.py                    # Artifacts, calibration, evaluate/drift, metrics, registry
├── test_*.py                          # Other: blog_authz_parity, content_engine, district_name_parity, fetch_kaggle_forecast, hindcast, kaggle_dataset_meta, kaggle_forecast_fetch, kaggle_trigger, model_claims, model_handshake, model_intake_smoke, physics_severity, publish_forecast_csv, retrain_notebook, secret_scan, security_disclosure, status_surface, validate_forecasts, workflows, frontend_alert_surface
├── test_csv_ingestion.mjs
└── fixtures/
    ├── alerts/{alert-run,empty-run}.sample.json
    ├── etl/{bmd_bulletins,cog_jobs,era5_days,events_empty,events_mixed,events_sample,ffwc_stations,modis_composites,open_meteo,s2_scenes,scene_units}.json
    ├── hindcast/{drivers_amphan_fixture,episode_amphan_fixture}.json
    ├── mlops/{current_run,reference_run,synthetic_outcomes,synthetic_predictions}
e2e/                                  # Playwright specs [TODO enumerate]
load-tests/                            # Load testing scripts [TODO]
training/tests/test_severity_normalizer.py
```

Default Playwright config matches **only** `full-app-qa.spec.ts`, despite other `.spec.ts` files existing. It runs desktop Chromium and Pixel 7 Chromium with four workers, 60-second test timeout and two CI retries. No automatic `webServer` is configured; start a server or supply `E2E_BASE_URL` (`playwright.config.ts`).

### 2) Test Layout

- Root `__tests__/`: HTTP/security/data/store/artifact contracts. Node suites declare environment overrides.
- `frontend/src/**/__tests__/`: browser components, hooks and utility tests.
- `scripts/tests/`: pytest scripts and fixtures covering ETL, publication, MLOps, hindcast, model claims and workflow structure. `scripts/tests/test_csv_ingestion.mjs` is a separate Node script, not collected by pytest.
- `training/tests/`: scientific severity normalization tests.
- `e2e/`: browser scenarios, helpers, and extra suites not selected by default configuration.
- `load-tests/predict.js`, `load-tests/forecasts.yml`, `scripts/bench-predict.mjs`: load/benchmark harnesses. The bundled scan missed these; its “no performance configs” output is not authoritative.
- Global Jest setup: `jest.setup.ts`; transforms: `babel.config.cjs`; QA environment override: `playwright.qa.config.ts`.

### 3) Test Scope Matrix

| Scope | Present? | Typical target | Limits |
|---|---|---|---|
| Unit | Yes | Row parsing, confidence, cache, alert logic, scientific metrics | Presence is not proof of current passing status |
| API integration | Yes | Supertest HTTP validation, auth, forecast routes; node-mocks-http serverless handlers | Many external services mocked |
| Data/workflow contracts | Yes | ETL fixtures, notebook/workflow schema, generated content consistency | Does not demonstrate a successful live Kaggle run |
| Frontend | Yes | Rendering, hooks, offline/auth behavior, accessibility assertions | Default Jest coverage excludes most components |
| E2E | Yes | Full-app desktop/mobile QA | Only one spec selected by default config |
| Live Firestore rules | Not established | Source-shape tests in `__tests__/firestoreRules.test.js` | [TODO] Emulator/deployed-rule verification; comments in `firestore.rules` explicitly defer it |
| Load/performance | Harnesses exist | Prediction and forecast traffic | [TODO] Current measured latency/load results; no benchmark run in this review |
## Running Tests

### 4) Mocking and Isolation Strategy
- `npm test` → `jest --passWithNoTests` (root, with Babel transforms for JS/TS).
- `npm --prefix frontend test` → `jest --config ../jest.config.cjs --rootDir .. frontend/src` (runs frontend component tests using the root config).
- Playwright: `npx playwright test` (uses `playwright.config.ts`); QA config uses `--config playwright.qa.config.ts`.
- Python tests: `pytest scripts/tests` (or `python -m pytest`).
- Specific checks are exposed as npm scripts:
  - `npm run check:bundle`, `check:design`, `check:paths`, `check:rag-freshness`, `check:embargo`, `check:ux-release`, `check:phase7`, `check:claims`.
  - `npm run alerts:rehearse` runs the alert engine offline and writes a JSON run for snapshot/review.

`__tests__/forecastStore.test.js` mocks `backend/db.js`, clears Jest mocks and resets the store singleton before each test. `__tests__/predict.test.js` guards removal of the old scorer; `__tests__/api/predict.test.js` exercises both stored-result HTTP adapters. Alert transports accept injected fetch/env/time. Fixtures under `scripts/tests/fixtures/` include explicit synthetic MLOps inputs, which must not be cited as field validation.
## Mocking Strategy

Jest caps workers at 50%; its comment attributes this to heavy ESM transforms/API app imports. `transformIgnorePatterns: []` transforms ESM dependencies broadly. [TODO] Current flaky-test inventory; no full suite was executed here.
- **Firebase / Firestore:** Tests mock Firestore using `jest.mock('@google-cloud/firestore', …)` patterns observed in `__tests__/forecastStore.test.js`, `__tests__/firestoreRules.test.js`, and test fixtures in `scripts/tests/fixtures/`. Firebase Auth token verification is mocked in `__tests__/firebaseAuth.test.js`.
- **External HTTP calls:** Open-Meteo and Gemini calls are stubbed via `jest.mock` of the wrapper modules; fixtures in `scripts/tests/fixtures/etl/*.json` supply canned responses (e.g. `open_meteo.json`, `bmd_bulletins.json`).
- **Filesystem / build outputs:** Script tests write to tmpdirs (`os.mkdtemp`) in Python; Node script tests use `/tmp` and fixtures.
- **Model/TFLite:** The TFLite model is not loaded in Jest tests; model-info is tested via `__tests__/modelInfo.test.js` against the static `Models/VERSION.json`. The Python model-handshake and model-intake-smoke tests (`test_model_handshake.py`, `test_model_intake_smoke.py`) load the TFLite via TensorFlow Lite interpreter.
- **Time:** Tests that exercise embargo/freshness use fixed prediction dates via fixtures or Jest fake timers [TODO] confirm.

### 5) Coverage and Quality Signals
## Coverage Targets & Enforced Gates

- Jest global floors: statements 32%, branches 35%, functions 30%, lines 31%.
- Coverage scope: `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts`, not the complete UI.
- CI has backend/frontend Jest, Python tests, build/typecheck/lint, browser QA, claims/design/embargo/artifact and security gates (`.github/workflows/ci.yml`). Frontend-only coverage invocation explicitly sets `--coverageThreshold='{}'`.
- Full Jest suite, build, TypeScript and ESLint were run after implementing ADR 0014. See the implementation verification below. [TODO] Live Firestore/emulator verification, current coverage percentages, browser E2E and load benchmarks.
- There is no numerical coverage threshold configured in `package.json` or Jest config. [TODO] confirm.
- Several behaviours are contractually enforced by tests and WILL FAIL THE BUILD if copy/code diverges:
  - `test_model_claims.py` fails if public copy advertises 10/20/30-day horizons or the misnamed INT8 bundle (ADR 0005, ADR 0007).
  - `test_content_engine.py` fails if a district page renders a metric from an absent historical archive (no zero-fill).
  - `test_district_name_parity.py` fails if the ETL district table drifts from the frontend alias list.
  - `test_secret_scan.py` + `scripts/check-secrets.sh` enforce no real credentials in tracked files.
  - `securityHeadersParity.test.js` enforces that `backend/security/csp.js` and `vercel.json` headers are identical (Phase 6 drift fix).
  - `test_validate_forecasts.py` enforces 64-district coverage and freshness bounds.
  - `test_physics_severity.py` guards the physical-index formula implementations.

Checks actually run on 2026-09-20:
## CI Test Execution

| Command | Result |
|---|---|
| Skill `scripts/scan.py` from repository root | Completed; scratch output kept outside repo/docs |
| `node scripts/check-severity-embargo.mjs` | Exit 0; two classified composite references; **one review warning** at discovery time (subsequently classified and removed, ADR 0014) in `NationalOverview.tsx` |
| `node scripts/check-claims.mjs` | Exit 0; 83 public-copy sources, 20 registered values |
| `node scripts/check-rag-freshness.mjs` | Exit 0; mtime freshness check only, not retrieval accuracy |
| `sha256sum Models/*.tflite` | Both artifact hashes identical; see `CONCERNS.md` |
- `.github/workflows/ci.yml` runs lint + typecheck + Jest tests on every PR.
- `.github/workflows/model-validation.yml` runs `test_model_intake_smoke`, `test_model_handshake`, `test_validate_forecasts`, parity tests.
- `.github/workflows/v3-ml-contracts.yml` gates ML contract changes (model bundle schema).
- `.github/workflows/mlops.yml` runs `test_mlops_*` (calibration, drift, evaluate, metrics, registry).
- `.github/workflows/hindcast.yml` runs `test_hindcast.py` and episode evaluation.

### 6) Evidence
## Test Data & Fixtures

- `package.json`, `jest.config.cjs`, `jest.setup.ts`, `babel.config.cjs`
- `playwright.config.ts`, `.github/workflows/ci.yml`
- `__tests__/forecastStore.test.js`, `__tests__/predict.test.js`, `__tests__/firestoreRules.test.js`
- `scripts/tests/fixtures/mlops/README.md`, `load-tests/predict.js`, `scripts/requirements-pipeline.txt`
- Terminal checks recorded above (2026-09-20)
- ETL fixtures cover empty/mixed/sample CSVs and station/scene JSON.
- Hindcast fixtures include Cyclone Amphan 2020 drivers (a known historical event).
- MLOps fixtures include synthetic predictions/outcomes and two comparable runs (current vs reference) for drift tests.
- Alert fixtures include a sample run and an empty-run sample.
- No real credentials appear in fixtures; all placeholders are validated by `test_secret_scan.py`.

## ADR 0014 implementation verification
## Load / Performance Tests

- `npm ci --ignore-scripts --no-audit --no-fund` installed test/build dependencies; removed TFJS packages no longer require native inference installation.
- New tests cover Express/Vercel prediction parity, retired tensor rejection, unsupported horizon and missing row behavior, safe store failures, transaction write bounds, commit-before-acknowledgement, no fallback pollution on failure, and store recreation using a durable-store double.
- Frontend tests cover stored provenance, missing values and HTTP failure without synthetic prediction fallback.
- Embargo tests cover known research reintroduction patterns while preserving the two approved labelled aggregations.
- Live Firebase credentials, deployed rules and cloud writes were not exercised. Test doubles are not evidence of production durability; staging verification is documented in `docs/ops/2026-09-20-stored-forecasts.md`.
- `load-tests/` contains k6 or similar load test scripts [TODO] confirm contents.
- `scripts/bench-predict.mjs` benchmarks the stored-prediction path.
- `scripts/check-bundle.mjs` enforces bundle-size budgets.

Final local verification (2026-09-20, after build): **98 Jest suites / 1,074 tests
passed**, with no skipped suites in that run. `npm run build`, `npm run lint`,
`npm run lint:eslint` (0 errors, 311 warnings), bundle budget, environment checks,
claims gate, embargo gate, public-path gate and `git diff --check` passed. Browser
E2E, Python suites and live Firestore/emulator writes were not run for this change.
[TODO] Inspect `__tests__/runtimeDependencies.test.js`, `e2e/`, and `load-tests/` for additional detail.
