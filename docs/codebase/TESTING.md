# Testing Patterns

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

### 1) Test Stack and Commands

Jest `^29.7.0` is the root runner with Babel transformation, jsdom default environment, Testing Library, jest-axe and Supertest. pytest tests pipeline/scientific code; Playwright `^1.62.1` drives browser QA (`package.json`, `jest.config.cjs`, requirement files).

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

### 4) Mocking and Isolation Strategy

`__tests__/forecastStore.test.js` mocks `backend/db.js`, clears Jest mocks and resets the store singleton before each test. `__tests__/predict.test.js` guards removal of the old scorer; `__tests__/api/predict.test.js` exercises both stored-result HTTP adapters. Alert transports accept injected fetch/env/time. Fixtures under `scripts/tests/fixtures/` include explicit synthetic MLOps inputs, which must not be cited as field validation.

Jest caps workers at 50%; its comment attributes this to heavy ESM transforms/API app imports. `transformIgnorePatterns: []` transforms ESM dependencies broadly. [TODO] Current flaky-test inventory; no full suite was executed here.

### 5) Coverage and Quality Signals

- Jest global floors: statements 32%, branches 35%, functions 30%, lines 31%.
- Coverage scope: `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts`, not the complete UI.
- CI has backend/frontend Jest, Python tests, build/typecheck/lint, browser QA, claims/design/embargo/artifact and security gates (`.github/workflows/ci.yml`). Frontend-only coverage invocation explicitly sets `--coverageThreshold='{}'`.
- Full Jest suite, build, TypeScript and ESLint were run after implementing ADR 0014. See the implementation verification below. [TODO] Live Firestore/emulator verification, current coverage percentages, browser E2E and load benchmarks.

Checks actually run on 2026-09-20:

| Command | Result |
|---|---|
| Skill `scripts/scan.py` from repository root | Completed; scratch output kept outside repo/docs |
| `node scripts/check-severity-embargo.mjs` | Exit 0; two classified composite references; **one review warning** at discovery time (subsequently classified and removed, ADR 0014) in `NationalOverview.tsx` |
| `node scripts/check-claims.mjs` | Exit 0; 83 public-copy sources, 20 registered values |
| `node scripts/check-rag-freshness.mjs` | Exit 0; mtime freshness check only, not retrieval accuracy |
| `sha256sum Models/*.tflite` | Both artifact hashes identical; see `CONCERNS.md` |

### 6) Evidence

- `package.json`, `jest.config.cjs`, `jest.setup.ts`, `babel.config.cjs`
- `playwright.config.ts`, `.github/workflows/ci.yml`
- `__tests__/forecastStore.test.js`, `__tests__/predict.test.js`, `__tests__/firestoreRules.test.js`
- `scripts/tests/fixtures/mlops/README.md`, `load-tests/predict.js`, `scripts/requirements-pipeline.txt`
- Terminal checks recorded above (2026-09-20)

## ADR 0014 implementation verification

- `npm ci --ignore-scripts --no-audit --no-fund` installed test/build dependencies; removed TFJS packages no longer require native inference installation.
- New tests cover Express/Vercel prediction parity, retired tensor rejection, unsupported horizon and missing row behavior, safe store failures, transaction write bounds, commit-before-acknowledgement, no fallback pollution on failure, and store recreation using a durable-store double.
- Frontend tests cover stored provenance, missing values and HTTP failure without synthetic prediction fallback.
- Embargo tests cover known research reintroduction patterns while preserving the two approved labelled aggregations.
- Live Firebase credentials, deployed rules and cloud writes were not exercised. Test doubles are not evidence of production durability; staging verification is documented in `docs/ops/2026-09-20-stored-forecasts.md`.

Final local verification (2026-09-20, after build): **98 Jest suites / 1,074 tests
passed**, with no skipped suites in that run. `npm run build`, `npm run lint`,
`npm run lint:eslint` (0 errors, 311 warnings), bundle budget, environment checks,
claims gate, embargo gate, public-path gate and `git diff --check` passed. Browser
E2E, Python suites and live Firestore/emulator writes were not run for this change.
