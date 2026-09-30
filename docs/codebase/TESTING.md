# Testing Patterns

> **Mapping pass:** 2026-09-30 (second pass, commit `deff0d9`). Claims in this document
> were verified against the working tree; the commands used are listed in the Evidence
> section, and the full run list is summarised in `CONCERNS.md`.

## Core Sections (Required)

### 1) Test Stack and Commands

- **Primary test framework:** Jest `^29.7.0` with `babel-jest` `^30.4.1` (Babel transforms TS/TSX/JS/MJS) and `ts-jest` `^29.4.12` available; test environment `jsdom` (`jest-environment-jsdom`).
- **Secondary runners:** Playwright `^1.62.1` (E2E/QA), Node's built-in test runner (`node --test`, used by `npm run test:phases`), `pytest` (Python pipeline-script tests), and `jest-expo` for React Native component suites.
- **Assertion / mocking tools:** Jest `expect` + `@testing-library/jest-dom` matchers, `@testing-library/react` `^14.3.1`, `@testing-library/react-native` `^12.4.0`, `jest-axe` `^9.0.0` (accessibility assertions), `supertest` `^7.2.2` (HTTP API), `node-mocks-http` `^1.11.0`, `react-test-renderer`.

```bash
# Run all tests (root Jest config, jsdom)
npm test
npx jest --ci --coverage --coverageDirectory=./coverage/backend

# Unit / backend suites only (mirrors the CI backend job — directory scopes only,
# so no suite is excluded by name)
npx jest --ci --coverage --coverageDirectory=./coverage/backend \
  --testPathIgnorePatterns='/node_modules/' '/e2e/' '/frontend/' '/apps/' '/__mocks__/'

# Frontend suites (root config, frontend rootDir)
cd frontend && npx jest --ci --config ../jest.config.cjs --rootDir .. frontend/src

# React Native component suites
npx jest --config apps/mobile/jest.config.cjs

# Phase gate tests (Node built-in runner)
npm run test:phases

# E2E / QA (default testMatch discovers ALL six specs in e2e/)
npx playwright test                                  # every spec in e2e/
npx playwright test -c playwright.qa.config.ts        # QA sweep (single worker, sandbox Chromium)

# Pipeline script tests (Python) — includes the workflow guards
python -m pytest scripts/tests -q                    # 119 tests, ~5 s
```

**Measured in this checkout on 2026-09-30** (`node_modules` installed with the CI command
`npm ci --legacy-peer-deps --no-audit --no-fund` → 2513 packages):

| Run (verbatim CI command) | Result |
| --- | --- |
| Backend job: `npx jest --ci --coverage --coverageDirectory=./coverage/backend --testPathIgnorePatterns='/node_modules/' '/e2e/' '/frontend/' '/apps/' '/__mocks__/'` | **79 suites passed / 2 skipped (81 total); 819 tests passed / 23 skipped (842 total)**; coverage gate satisfied — statements 61.48%, branches 58.86%, functions 60.06%, lines 62.75% |
| Frontend job: `cd frontend && npx jest --ci --config ../jest.config.cjs --rootDir .. --coverage --coverageDirectory=./frontend/coverage --coverageThreshold='{}' frontend/src` | **54 suites passed; 498 tests passed**; "All files" for the frontend scope: 21.01% statements |
| Pipeline job: `python3 -m pytest scripts/tests -q` | **119 passed** in 5.10 s |
| `npx jest --listTests` (root config, no ignores) | 135 test files — 71 under `__tests__/`, 54 under `frontend/src/`, 10 under `packages/` |

The previous revision of this document quoted 77 suites / 808 tests from an earlier
checkout; the two suites added since (`__tests__/primaryActionContrast.test.js`,
`__tests__/tokenCompliance.test.js`) account for the difference.

### 2) Test Layout

- **Placement pattern:** co-located `__tests__/` directories. The root `__tests__/` holds 71 test files (53 top-level `*.test.js` plus `api/`, `alerts/` and `mobile/` sub-suites) covering `backend/`, `api/`, and cross-cutting concerns; `frontend/src/components/__tests__/`, `frontend/src/hooks/__tests__/`, `frontend/src/lib/__tests__/`, `frontend/src/pages/__tests__/` and `frontend/src/utils/__tests__/` hold 54 frontend suites; `packages/core/__tests__/` and `packages/api/__tests__/` hold 10 package suites; `apps/mobile/__tests__/` holds 9 React Native suites that the root run deliberately ignores. Python tests live in `scripts/tests/` (9 files).
- **Naming convention:** `*.test.js` / `*.test.tsx` / `*.test.ts` for Jest; `*.spec.ts` for Playwright (`e2e/`); `test_*.py` / `test_*.mjs` for pipeline scripts.
- **Setup files and where they run:**
  - `jest.setup.ts` — `setupFilesAfterEnv` for the root config: loads `@testing-library/jest-dom`, polyfills `TextEncoder`/`TextDecoder`/`ReadableStream`/`WritableStream`/`TransformStream`, stubs `IntersectionObserver`, sets `__DEV__` and a `performance.now` fallback (`jest.config.cjs`, `jest.setup.ts`).
  - `__tests__/__mocks__/` — hand-written module mocks mapped through `moduleNameMapper`.
  - `apps/mobile/jest.setup.cjs` + `@testing-library/react-native/extend-expect` — mobile-only setup (`apps/mobile/jest.config.cjs`).
- **Config resolution gotcha:** running bare `jest` inside `frontend/` has no config and cannot parse `.tsx`; the frontend `test` script therefore passes `--config ../jest.config.cjs --rootDir ..` explicitly (`frontend/package.json`, `.github/workflows/ci.yml`).

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | **yes** | `backend/alerts/*`, `backend/utils/*`, `backend/forecastStore.js`, `packages/core`, `packages/api`, frontend hooks and view models | 71 root files + 10 package suites; coverage thresholds enforced for the backend scope |
| Component | **yes** | `frontend/src/components/**`, `frontend/src/pages/**`, `apps/mobile/src/**` | jsdom + Testing Library; mobile uses `jest-expo` preset |
| Integration | **yes** | Express app via `supertest` (`__tests__/api/*.test.js`), serverless routing/guard, Firestore rules shape, CORS, auth | `__tests__/api/serverlessRouting.test.js`, `__tests__/firestoreRules.test.js`, `__tests__/cors.test.js` |
| Pipeline | **yes** | Advisory CSV validation, column mapping, staleness guard, manifest integrity, snapshot builders | `__tests__/advisoryPipeline.test.js`, `scripts/tests/*.py`, plus builder smoke tests in CI |
| E2E | **yes** | All six specs in `e2e/`: `full-app-qa`, `forecast-ux`, `navigation-a11y`, `smoke`, `critical-paths`, `mobile-responsive` | The default `testMatch` in `playwright.config.ts` discovers every spec. `smoke`, `critical-paths` and `mobile-responsive` used to sit outside it and never ran anywhere; they were added on 2026-09-30 |
| Accessibility | **yes** | `jest-axe` in component suites; `e2e/navigation-a11y.spec.ts`; `scripts/qa/a11y-detail.mjs` | PRD target ≥ 95 Lighthouse a11y |
| Performance | **partial** | `npm run check:bundle` budget, `check-font-payload.mjs`, `.maestro/perf-scenario.yaml` on mobile | No k6/locust/JMeter config in-tree |

### 4) Mocking and Isolation Strategy

- **Main mocking approach:** module-level mocks via `moduleNameMapper` for anything that cannot execute under jsdom/Node — React Native core and Expo/native modules (`react-native`, `expo-location`, `expo-notifications`, `expo-haptics`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `react-navigation`, `react-native-svg`, `@shopify/flash-list`, …) mapped to `__tests__/__mocks__/*.js`. Markdown imports are stubbed to an empty string.
- **Store isolation:** singleton stores expose reset hooks (`resetForecastStore`, `resetAlertStore`) so suites do not leak cached state; `FORECAST_STORE_MEMORY` / `ALERT_STORE_MEMORY` env flags select in-memory stores for tests.
- **Environment isolation:** `transformIgnorePatterns: []` so ESM-only dependencies are transformed rather than except-listed; `maxWorkers: '50%'` to avoid OOM on small CI runners because the API suites import the full Express app; `modulePathIgnorePatterns`/`testPathIgnorePatterns` keep Playwright specs, mobile suites, mocks and `node_modules` out of the root run.
- **Common failure mode:** heavy babel transforms of the ESM dependency graph make the API suites slow and memory-hungry (the reason for the worker cap); a second recurring failure mode is native-module imports in mobile-only code paths reaching the jsdom run — which is exactly what the `__mocks__` mapping exists to prevent.

### 5) Coverage and Quality Signals

- **Coverage tool + threshold:** Jest `--coverage` with `coverageThreshold.global` = statements `32`, branches `35`, functions `30`, lines `31` (`jest.config.cjs`, labelled "QA-01"). The floor was set from a measured 2026-08-28 baseline (~32% statements) minus a margin, intended to ratchet upward. The gate is comfortably met today (61.48% / 58.86% / 60.06% / 62.75%), so the stated floor understates actual coverage — ratcheting it is the open action.
- **Scope of the gate:** `collectCoverageFrom` in `jest.config.cjs` = `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts`, plus the `packages/core/src/`, `packages/api/src/` and `packages/analytics/src/` trees. The frontend CI job disables the threshold (`--coverageThreshold='{}'`) because it executes no backend suites; its measured "All files" figure for the lib/utils scope is **21.01% statements** (was ~17% when the comment in `ci.yml` was written).
- **Current reported coverage:** backend scope **61.48%** statements / 58.86% branches / 60.06% functions / 62.75% lines (measured 2026-09-30 with the verbatim CI command; output `61.48% ( 2588/4209 )` etc.); frontend scope **21.01%** statements. Coverage is uploaded to Codecov in CI (`codecov/codecov-action`, flags `backend` / `frontend`, `fail_ci_if_error: false`).
- **Known gaps / flaky areas:**
  - **All closed on 2026-09-30** — see `docs/codebase/CONCERNS.md` §6: the three unrun Playwright specs are now in the default `testMatch`; the CI post-build step no longer names the deleted `__tests__/modelPerformance.test.js`; the backend `--testPathIgnorePatterns` list is directory scopes only; and `scripts/tests/test_workflows.py` exists (7 tests, mutation-verified).
  - **Verified, not assumed:** with `node_modules` installed (`npm ci --legacy-peer-deps --no-audit --no-fund`, 2513 packages) the CI backend command ran verbatim on 2026-09-30 → **79 suites passed / 2 skipped (81 total), 819 tests passed / 23 skipped (842 total)**, and the coverage thresholds were satisfied. The frontend CI command → **54 suites, 498 tests**. The 7 suites re-enabled by the previous pass (`securityHeadersParity`, `securityTxt`, `nasaTokens`, `freshnessArtifact`, `contentEngine`, `alertSnapshot`, `alertReplay`) all pass within that run.
  - **Ordering trap worth knowing:** passing test paths *after* `--testPathIgnorePatterns` silently excludes them, because the flag is array-valued and swallows every following argument. Selecting the 7 suites that way ran 70 suites instead of 77. Put selectors first, or pass them before the flag.
  - Firestore rule verification requires the Firestore emulator (Java) or a live project; neither runs in CI — the rule shape is pinned only by `__tests__/firestoreRules.test.js`.
  - Playwright browsers must be installed (`npx playwright install chromium`); the QA config exists because a sandbox cannot reach `cdn.playwright.dev` (`playwright.qa.config.ts`).

### 6) Evidence

- `jest.config.cjs` (root config: environment, mappers, coverage thresholds, worker cap)
- `jest.setup.ts` (polyfills and matchers)
- `apps/mobile/jest.config.cjs`, `apps/mobile/jest.setup.cjs` (React Native config)
- `playwright.config.ts`, `playwright.qa.config.ts` (E2E configs and testMatch)
- `.github/workflows/ci.yml` (`test-backend`, `test-frontend`, `test-pipeline-scripts`, `test-e2e`, `verify`, `security-audit`)
- `__tests__/` (71 test files), `__tests__/__mocks__/`, `packages/core/__tests__/`
- `e2e/` (6 specs + `helpers.ts`), `scripts/tests/` (9 Python files + one `.mjs` suite)
- `docs/TRD.md` §3–§7 (four-tier test strategy), `docs/TRD.md` §10 (CI/CD test gates)
- `scripts/tests/test_workflows.py` (workflow guards: bare selector, missing-file gate, claims gate)
- `scripts/tests/test_secret_scan.py` (secret-scan regression suite; its `.env.example` half is conditional — the file is absent)
- Terminal evidence: jest/pytest runs of 2026-09-30 as tabulated in §1, plus `npx jest --listTests` → 135 files
