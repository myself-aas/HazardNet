# Coding Conventions

> **Mapping pass:** 2026-09-30 (second pass, commit `deff0d9`). Claims in this document
> were verified against the working tree; the commands used are listed in the Evidence
> section, and the full run list is summarised in `CONCERNS.md`.

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files — React components/pages | `PascalCase.tsx` | `frontend/src/components/ForecastDashboard.tsx`, `frontend/src/pages/AlertsPage.tsx` | `frontend/src/components/`, `frontend/src/pages/` |
| Files — hooks | `useCamelCase.ts` | `frontend/src/hooks/useForecasts.ts`, `frontend/src/hooks/useI18n.ts` | `frontend/src/hooks/` |
| Files — libs/utils (TS) | `camelCase.ts` | `frontend/src/lib/forecasts.ts`, `frontend/src/lib/glide.ts` | `frontend/src/lib/` |
| Files — backend/serverless (JS) | `camelCase.js`, ESM with explicit `.js` extension in imports | `backend/forecastStore.js`, `serverless/dispatch.js` | `backend/`, `serverless/` |
| Files — pipeline scripts | `snake_case.mjs` (older) and `kebab-case.mjs` (newer) — both in active use | `scripts/validate_env.mjs`, `scripts/check-bundle.mjs` | `scripts/` |
| Files — tests | `*.test.js` / `*.test.tsx` / `*.test.ts`; E2E `*.spec.ts`; Python `test_*.py` | `__tests__/forecastStore.test.js`, `e2e/forecast-ux.spec.ts`, `scripts/tests/test_csv_ingestion.mjs` | `__tests__/`, `e2e/`, `scripts/tests/` |
| Functions/methods | `camelCase`; async handlers named `handler` in serverless modules | `parseBulkQuery`, `getForecastStore`, `evaluateTransition` | `backend/utils/forecastServe.js`, `backend/alerts/lifecycle.js` |
| Types/interfaces | `PascalCase`; Zod schemas suffixed `Schema` with a matching inferred `type` | `ForecastRowSchema` / `ForecastRow`, `BulkForecastsResponseSchema` | `packages/core/src/contracts.ts`, `packages/api/src/endpoints.ts` |
| Constants / frozen enumerations | `UPPER_SNAKE_CASE`, often `Object.freeze([...])` | `ALERT_STATES`, `TERMINAL_STATES`, `ALERT_LEVELS`, `ALL_64_DISTRICTS`, `ADVISORY_TIERS` | `backend/alerts/lifecycle.js`, `backend/alerts/policy.js`, `frontend/src/data/bangladeshDistricts.ts` |
| Env vars | `UPPER_SNAKE_CASE`; `VITE_` prefix = public-by-design client config | `FIREBASE_SERVICE_ACCOUNT_JSON`, `VITE_FIREBASE_API_KEY` | `docs/ENVIRONMENT_SECRETS.md` §2 |
| Private/test hooks | `reset*` prefix for store teardown helpers | `resetForecastStore`, `resetAlertStore` | `backend/forecastStore.js`, `backend/alerts/store.js` |

### 2) Formatting and Linting

- **Formatter:** Prettier — `.prettierrc`: `printWidth: 120`, `singleQuote: true`, `trailingComma: "all"`, `semi: true`, `tabWidth: 2`, `arrowParens: "always"`, `endOfLine: "lf"`.
- **Linter:** ESLint 9 flat config — `eslint.config.js`. Baseline is `eslint.configs.recommended` + `tseslint.configs.recommended`; **no stylistic rules** ("Formatting is Prettier's job").
- **Most relevant enforced rules:**
  - `@typescript-eslint/no-explicit-any`: `warn`
  - `@typescript-eslint/no-unused-vars`: `warn` with `argsIgnorePattern`/`varsIgnorePattern` `^_`
  - `no-console`: `warn`, allowing only `warn`/`error`/`info` (so `console.log` in production code is a lint warning; 16 occurrences exist in `backend/`, `api/`, `serverless/`, `utils/`)
  - `no-empty`: `error` (with `allowEmptyCatch: true`)
  - `react-hooks` recommended rules for `frontend/src/**/*.{ts,tsx}`
  - Per-area `languageOptions.globals` blocks: browser for `frontend/src`, serviceworker for `frontend/public/**` + `frontend/src/serviceWorker.ts`, node for `*.mjs` / `backend` / `api` / `serverless` / `utils` / `scripts` / `*.config.js`, jest globals for test files
  - Ignored: `dist/**`, `frontend/dist/**`, `node_modules/**`, `frontend/node_modules/**`, `**/*.cjs`, `references/**`, `skills/**`, `.agents/**`, `docs/**`, `Models/**`, `audit_temp/**`, `load-tests/**` (verified in `eslint.config.js`; the former `app/**` entry is gone along with the deleted `app/` directory)
- **Run commands:** `npm run lint` (`tsc -p frontend/tsconfig.json --noEmit`), `npm run lint:eslint` (`eslint .`), `npm run format` (Prettier over `frontend/src/**/*.{ts,tsx}`, `backend/**/*.js`, `api/**/*.js`).
- **TypeScript strictness:** `strict: true` in `frontend/tsconfig.json`, plus `useDefineForClassFields`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `esModuleInterop`, `resolveJsonModule`, `forceConsistentCasingInFileNames`, `skipLibCheck`. The CI step is named "ESLint (0-error policy)" while most rules are configured at `warn` — the file header states the intent is to tighten to `--max-warnings 0` once the legacy count is burned down.

### 3) Import and Module Conventions

- **Module system:** ESM everywhere (`"type": "module"` at the root, `frontend/`, `packages/*`, `apps/mobile`). Backend and serverless imports **always include the `.js` extension** (`import { db } from './db.js'`) because Node ESM resolution requires it.
- **Import grouping/order:** no enforced grouping rule in the linter; observed convention is Node built-ins → external packages → relative imports (e.g. `backend/server.js`, `serverless/dispatch.js`).
- **Alias vs relative:** relative imports inside a package; path aliases only at package boundaries — `@/*` → `frontend/src/*`, `@hazardnet/core`, `@hazardnet/core/*`, `@hazardnet/design-system`, `@hazardnet/design-system/*` (declared in `frontend/tsconfig.json` `paths`, mirrored in `jest.config.cjs` `moduleNameMapper` and `apps/mobile/jest.config.cjs`).
- **Public exports/barrel policy:** each workspace package exports through `src/index.ts` and additionally declares explicit `exports` subpaths (`packages/core/package.json`: `.`, `./forecasts`, `./alerts`, `./i18n`, `./bandwidth`; `packages/api/package.json`: `./client`, `./endpoints`, `./errors`, `./retry`).
  - **Known violation (verified 2026-09-30):** three of those `@hazardnet/core` subpaths do not resolve — `./alerts`, `./i18n` and `./bandwidth` point at `src/alertLayer.ts`, `src/i18n.ts` and `src/bandwidth.ts`, none of which exists in `packages/core/src/` (the same-named files live in `frontend/src/lib/`). Conversely `@hazardnet/core/notificationMatcher` is imported without being declared. The rule to keep: **every declared subpath must resolve, and every subpath import must be declared** — the aliases in `frontend/tsconfig.json`, `frontend/vite.config.ts`, `jest.config.cjs` and `apps/mobile/jest.config.cjs` currently hide the mismatch.
- **Platform boundary rule:** `packages/core` must contain **no** React, React Native, or DOM imports — stated in `packages/core/src/index.ts`.
- **Lazy imports for fault isolation:** serverless entry points use literal specifiers inside the route table (`() => import('../../../serverless/v1/forecasts/bulk.js')`) so the bundler can trace them and each request only pays for its own import graph.

### 4) Error and Logging Conventions

- **Error strategy by layer:**
  - **Serverless/Express boundary:** `clientError(res, err, { scope, fallback })` from `backend/utils/clientError.js` — 4xx messages pass through (they were written for the caller), 5xx always return a generic message while the full error is logged server-side with a `[scope]` tag. This is a documented SEC-13 information-disclosure fix.
  - **Domain logic:** pure result objects instead of throws — `backend/alerts/lifecycle.js` `evaluateTransition` returns `{ ok, code, status, body }` and the route decides the HTTP mapping; the module header states this keeps the state machine testable and the HTTP layer boring.
  - **Validation:** Zod schemas in `packages/core` / `packages/api` with `.passthrough()` so unknown server fields do not reject a real response.
  - **Fail-closed on config:** `backend/server.js` `assertEnvironment()` reports problems (missing `BACKEND_API_KEY`, missing `FRONTEND_ORIGIN` in production) and warnings (missing Gemini/VAPID keys) at boot; CORS fails closed in production when `FRONTEND_ORIGIN` is unset.
- **Logging style and required context:** minimal structured-ish logger in `utils/logger.js` with `[info]` / `[warn]` / `[error]` / `[debug]` prefixes (debug gated on `process.env.DEBUG`); server-side errors are logged with a bracketed scope tag (`[${scope}] ${detail}`). Express requests carry a correlated request id via `backend/middleware/requestId.js`.
- **Sensitive-data redaction rules:** destinations are masked before logging/reporting in the alert fan-out (`maskNumber`, `maskDestination` in `backend/alerts/notify.js`); push subscription endpoints are truncated when logged (`backend/routes/push.js`); `scripts/check-secrets.sh` blocks new high-confidence secret patterns from being committed.

### 5) Testing Conventions

- **Test file naming/location rule:** co-located `__tests__/` directories (`__tests__/`, `frontend/src/components/__tests__/`, `frontend/src/hooks/__tests__/`, `packages/*/__tests__/`, `apps/mobile/__tests__/`) plus root-level suites in `__tests__/` for backend/api; E2E specs in `e2e/`; Python tests in `scripts/tests/`.
- **Mocking strategy norm:** module-level mocks under `__tests__/__mocks__/` for React Native / Expo / native modules that cannot load under jsdom, wired through `jest.config.cjs` `moduleNameMapper` (e.g. `react-native`, `expo-location`, `@react-navigation/*`, `async-storage`, `netinfo`); environment polyfills in `jest.setup.ts` (TextEncoder/TextDecoder, ReadableStream, IntersectionObserver, `__DEV__`); Firestore-dependent behaviour is exercised through store reset hooks (`resetForecastStore`).
- **Coverage expectation:** global thresholds enforced in `jest.config.cjs` — statements `32`, branches `35`, functions `30`, lines `31` — scoped by `collectCoverageFrom` to `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts` and the `packages/core/src/`, `packages/api/src/`, `packages/analytics/src/` trees. The frontend CI job runs with `--coverageThreshold='{}'` because the backend-calibrated gates cannot pass on a frontend-only run.

### 6) Evidence

- `.prettierrc` (formatter settings)
- `eslint.config.js` (flat config, rule severities, per-area globals, ignore list — verified by direct read: `no-console` warn allowing `warn|error|info`, `no-console: 'off'` for the backend/api/serverless/utils/scripts/config/e2e block; `grep -rc 'console\.log' backend api serverless utils` → 16)
- `frontend/tsconfig.json` (`strict: true`, `paths`, `moduleResolution: "bundler"`)
- `packages/core/package.json` (`exports` map) vs `packages/core/src/` (`ls`) — the unresolved subpath violation
- `backend/utils/clientError.js` (error policy), `backend/alerts/lifecycle.js` (pure result objects)
- `utils/logger.js`, `backend/middleware/requestId.js` (logging)
- `backend/alerts/notify.js` (destination masking)
- `packages/core/src/index.ts` (platform-agnostic constraint + barrel)
- `jest.config.cjs`, `jest.setup.ts`, `__tests__/__mocks__/` (test conventions)
- `backend/server.js` (boot assertions, port binding)
