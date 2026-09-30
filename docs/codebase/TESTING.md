# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- **Primary test framework:** Jest `^29.7.0` with `babel-jest` `^30.4.1` (Babel transforms TS/TSX/JS/MJS) and `ts-jest` `^29.4.12` available; test environment `jsdom` (`jest-environment-jsdom`).
- **Secondary runners:** Playwright `^1.62.1` (E2E/QA), Node's built-in test runner (`node --test`, used by `npm run test:phases`), `pytest` (Python pipeline-script tests), and `jest-expo` for React Native component suites.
- **Assertion / mocking tools:** Jest `expect` + `@testing-library/jest-dom` matchers, `@testing-library/react` `^14.3.1`, `@testing-library/react-native` `^12.4.0`, `jest-axe` `^9.0.0` (accessibility assertions), `supertest` `^7.2.2` (HTTP API), `node-mocks-http` `^1.11.0`, `react-test-renderer`.

```bash
# Run all tests (root Jest config, jsdom)
npm test
npx jest --ci --coverage --coverageDirectory=./coverage/backend

# Unit / backend suites only (mirrors the CI backend job)
npx jest --ci --coverage --coverageDirectory=./coverage/backend \
  --testPathIgnorePatterns='/node_modules/' '/e2e/' '/frontend/' '/apps/' '/__mocks__/' \
  'severityEmbargo' 'securityTxt' 'securityHeadersParity' 'nasaTokens' \
  'freshnessArtifact' 'contentEngine' 'claimsGate' 'alertSnapshot' 'alertReplay'

# Frontend suites (root config, frontend rootDir)
cd frontend && npx jest --ci --config ../jest.config.cjs --rootDir .. frontend/src

# React Native component suites
npx jest --config apps/mobile/jest.config.cjs

# Phase gate tests (Node built-in runner)
npm run test:phases

# E2E / QA
npx playwright test                                  # default testMatch subset
npx playwright test -c playwright.qa.config.ts        # QA sweep (single worker, sandbox Chromium)

# Pipeline script tests (Python)
python -m pytest scripts/tests -q
```

### 2) Test Layout

- **Placement pattern:** co-located `__tests__/` directories. The root `__tests__/` holds 69 `*.test.js` suites covering `backend/`, `api/`, and cross-cutting concerns; `frontend/src/components/__tests__/` and `frontend/src/hooks/__tests__/` hold component/hook suites; `packages/core/__tests__/` and `packages/api/__tests__/` hold package suites; `apps/mobile/__tests__/` holds React Native component suites. Python tests live in `scripts/tests/`.
- **Naming convention:** `*.test.js` / `*.test.tsx` / `*.test.ts` for Jest; `*.spec.ts` for Playwright (`e2e/`); `test_*.py` / `test_*.mjs` for pipeline scripts.
- **Setup files and where they run:**
  - `jest.setup.ts` — `setupFilesAfterEnv` for the root config: loads `@testing-library/jest-dom`, polyfills `TextEncoder`/`TextDecoder`/`ReadableStream`/`WritableStream`/`TransformStream`, stubs `IntersectionObserver`, sets `__DEV__` and a `performance.now` fallback (`jest.config.cjs`, `jest.setup.ts`).
  - `__tests__/__mocks__/` — hand-written module mocks mapped through `moduleNameMapper`.
  - `apps/mobile/jest.setup.cjs` + `@testing-library/react-native/extend-expect` — mobile-only setup (`apps/mobile/jest.config.cjs`).
- **Config resolution gotcha:** running bare `jest` inside `frontend/` has no config and cannot parse `.tsx`; the frontend `test` script therefore passes `--config ../jest.config.cjs --rootDir ..` explicitly (`frontend/package.json`, `.github/workflows/ci.yml`).

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | **yes** | `backend/alerts/*`, `backend/utils/*`, `backend/forecastStore.js`, `packages/core`, `packages/api`, frontend hooks and view models | 69 root suites; coverage thresholds enforced for the backend scope |
| Component | **yes** | `frontend/src/components/**`, `frontend/src/pages/**`, `apps/mobile/src/**` | jsdom + Testing Library; mobile uses `jest-expo` preset |
| Integration | **yes** | Express app via `supertest` (`__tests__/api/*.test.js`), serverless routing/guard, Firestore rules shape, CORS, auth | `__tests__/api/serverlessRouting.test.js`, `__tests__/firestoreRules.test.js`, `__tests__/cors.test.js` |
| Pipeline | **yes** | Advisory CSV validation, column mapping, staleness guard, manifest integrity, snapshot builders | `__tests__/advisoryPipeline.test.js`, `scripts/tests/*.py`, plus builder smoke tests in CI |
| E2E | **partial** | `e2e/full-app-qa.spec.ts`, `e2e/forecast-ux.spec.ts`, `e2e/navigation-a11y.spec.ts` | Default `testMatch` only discovers these three; `critical-paths.spec.ts`, `smoke.spec.ts` and `mobile-responsive.spec.ts` exist but are **not** run by `playwright.config.ts` |
| Accessibility | **yes** | `jest-axe` in component suites; `e2e/navigation-a11y.spec.ts`; `scripts/qa/a11y-detail.mjs` | PRD target ≥ 95 Lighthouse a11y |
| Performance | **partial** | `npm run check:bundle` budget, `check-font-payload.mjs`, `.maestro/perf-scenario.yaml` on mobile | No k6/locust/JMeter config in-tree |

### 4) Mocking and Isolation Strategy

- **Main mocking approach:** module-level mocks via `moduleNameMapper` for anything that cannot execute under jsdom/Node — React Native core and Expo/native modules (`react-native`, `expo-location`, `expo-notifications`, `expo-haptics`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `react-navigation`, `react-native-svg`, `@shopify/flash-list`, …) mapped to `__tests__/__mocks__/*.js`. Markdown imports are stubbed to an empty string.
- **Store isolation:** singleton stores expose reset hooks (`resetForecastStore`, `resetAlertStore`) so suites do not leak cached state; `FORECAST_STORE_MEMORY` / `ALERT_STORE_MEMORY` env flags select in-memory stores for tests.
- **Environment isolation:** `transformIgnorePatterns: []` so ESM-only dependencies are transformed rather than except-listed; `maxWorkers: '50%'` to avoid OOM on small CI runners because the API suites import the full Express app; `modulePathIgnorePatterns`/`testPathIgnorePatterns` keep Playwright specs, mobile suites, mocks and `node_modules` out of the root run.
- **Common failure mode:** heavy babel transforms of the ESM dependency graph make the API suites slow and memory-hungry (the reason for the worker cap); a second recurring failure mode is native-module imports in mobile-only code paths reaching the jsdom run — which is exactly what the `__mocks__` mapping exists to prevent.

### 5) Coverage and Quality Signals

- **Coverage tool + threshold:** Jest `--coverage` with `coverageThreshold.global` = statements `32`, branches `35`, functions `30`, lines `31` (`jest.config.cjs`, labelled "QA-01"). The floor was set from a measured 2026-08-28 baseline (~32% statements) minus a margin, intended to ratchet upward.
- **Scope of the gate:** `collectCoverageFrom` in `jest.config.cjs` = `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts`, plus the `packages/core/src/`, `packages/api/src/` and `packages/analytics/src/` trees. The frontend CI job disables the threshold (`--coverageThreshold='{}'`) because it executes no backend suites; baseline noted as ~17% statements for lib/utils only.
- **Current reported coverage:** `[TODO]` — not measurable in this checkout (`node_modules` is not installed). Coverage is uploaded to Codecov in CI (`codecov/codecov-action`, flags `backend` / `frontend`, `fail_ci_if_error: false`).
- **Known gaps / flaky areas:**
  - Three Playwright specs (`critical-paths`, `smoke`, `mobile-responsive`) are not matched by the default `testMatch`, so they never run in CI.
  - `__tests__/modelPerformance.test.js` is invoked by the CI "Post-build surface checks" step but the file does not exist in this checkout. (The `/model-performance` page and its `frontend/public/data/model-performance.json` artifact do exist and are partly covered by `__tests__/contentEngine.test.js`; the missing file is the dedicated suite.)
  - The CI backend job's `--testPathIgnorePatterns` list still names suites whose scripts "are absent on main" (`alertSnapshot`, `alertReplay`, `freshnessArtifact`, `nasaTokens`, `securityTxt`, `securityHeadersParity`, `contentEngine`) although those suites are present — so they are silently excluded from the backend run.
  - `scripts/tests/test_workflows.py` is cited by several CI comments as the guard for workflow-file properties (bare Jest selectors, missing-file gates, claims-gate presence) but the file is not present.
  - Firestore rule verification requires the Firestore emulator (Java) or a live project; neither runs in CI — the rule shape is pinned only by `__tests__/firestoreRules.test.js`.

### 6) Evidence

- `jest.config.cjs` (root config: environment, mappers, coverage thresholds, worker cap)
- `jest.setup.ts` (polyfills and matchers)
- `apps/mobile/jest.config.cjs`, `apps/mobile/jest.setup.cjs` (React Native config)
- `playwright.config.ts`, `playwright.qa.config.ts` (E2E configs and testMatch)
- `.github/workflows/ci.yml` (`test-backend`, `test-frontend`, `test-pipeline-scripts`, post-build surface checks)
- `__tests__/` (69 suites), `__tests__/__mocks__/`, `packages/core/__tests__/`
- `e2e/` (6 specs), `scripts/tests/` (Python + one `.mjs` suite)
- `docs/TRD.md` §3–§7 (four-tier test strategy), `docs/TRD.md` §10 (CI/CD test gates)
