# Coding Conventions

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

### 1) Naming Rules

Observed patterns, not a universal style mandate:

| Item | Rule / observation | Example | Evidence |
|---|---|---|---|
| Components/pages | PascalCase `.tsx` | `LiveMapView`, `DistrictDetailPage` | `frontend/src/components/LiveMapView.tsx`, `frontend/src/pages/DistrictDetailPage.tsx` |
| Hooks | camelCase with `use` prefix | `useForecasts`, `usePrediction` | `frontend/src/hooks/useForecasts.ts`, `usePrediction.ts` in the same directory |
| Backend modules/functions | Usually camelCase | `getForecastStore`, `parseBulkQuery` | `backend/forecastStore.js`, `backend/utils/forecastServe.js` |
| Python scripts | Mostly snake_case | `fetch_kaggle_forecast.py`, `validate_forecasts.py` | `scripts/` |
| Types/interfaces | PascalCase | `ForecastRow`, `ForecastMetadata` | `frontend/src/lib/forecasts.ts` |
| Constants/env vars | UPPER_SNAKE_CASE | `HISTORY_MAX_WINDOW_DAYS`, `BACKEND_API_KEY` | `backend/utils/forecastServe.js`, `.env.example` |
| Data contracts | Predominantly snake_case; UI types may differ | `district_id`, `prediction_date`, `predictionDate` | `backend/utils/forecastRow.js`, `frontend/src/lib/forecasts.ts` |
| Internal helpers | Some underscore prefixes, not universal | `_fetchUpstream`, `__getFetch` | `backend/utils/openMeteo.js` |

Sampling also included `AuthContext.tsx`, `ForecastDashboard.tsx`, `useAlertsData.ts`, `weather.ts`, `forecastFreshness.js`, `csvIngestion.js`, `alertAuth.js`, `notify.js`, and `scripts/physics_severity.py`. No repository-wide private-field naming rule was found.

### 2) Formatting and Linting

- `.prettierrc`: 120 columns, single quotes, semicolons, trailing commas, two spaces, always-parenthesized arrows, LF.
- `eslint.config.js`: recommended JS/TypeScript rules and React hooks rules; explicit `any` and unused variables warn; `_`-prefixed unused arguments/variables are exempt. Console policy varies by glob; backend and tooling allow console.
- TypeScript is `strict: true`, ESNext/bundler resolution, `react-jsx`, `skipLibCheck: true` (`frontend/tsconfig.json`). ESLint uses recommended configs, not a configured type-aware project service despite its introductory comment.
- Commands: `npm run lint` (typecheck), `npm run lint:eslint`, `npm run format` (writes changes). Existing source formatting is mixed; do not mass-reformat unrelated files.

### 3) Import and Module Conventions

- Root/frontend packages use ESM; Node relative imports generally include `.js`; configuration requiring CommonJS uses `.cjs` (`package.json`, `jest.config.cjs`).
- Frontend relative imports coexist with `@/*` → `src/*`; Vite and TS both define the alias.
- `App.tsx` lazy-loads many page modules, sometimes adapting named exports into a default export for React.lazy.
- [TODO] No enforced import sorting/grouping or general barrel-export policy was found in the inspected configs. Follow neighboring source rather than inventing one.

### 4) Error and Logging Conventions

- HTTP validation commonly produces `{error: ...}` with explicit status; prediction catches return a generic 500 message (`backend/routes/predict.js`). Shared query helpers return parsed objects or an `error` field (`forecastServe.js`).
- Forecast reads retain snapshot fallback; writes now propagate a safe persistence failure and do not update memory before commit. Frontend forecast fetches fall through to other sources. These are significant behavior contracts, not uniform exception policy.
- `backend/middleware/requestId.js` creates a UUID, echoes `X-Request-Id`, and logs JSON containing `ts`, `level`, `msg`, `requestId`, `method`, `path`, `status`, `durationMs`.
- Other modules use plain console messages; `utils/logger.js` supplies only simple INFO/ERROR wrappers. There is no universal structured logger enforcement.
- Notification destinations are masked in `backend/alerts/notify.js`, SMS transport has redaction helpers, and `backend/utils/clientError.js` centralizes some safe client errors. [TODO] Global redaction coverage is not established; request logging includes `req.originalUrl`, including its query string.

### 5) Testing Conventions

- Root Jest: `__tests__/*.test.js`; frontend colocated `__tests__/*.test.ts(x)`; Python `scripts/tests/test_*.py`, `training/tests/test_*.py`; Playwright `e2e/*.spec.ts`.
- Backend suites may override the default jsdom environment using `@jest-environment node`; Firestore is module-mocked, and singleton stores reset in `beforeEach` (`__tests__/forecastStore.test.js`).
- Coverage floors are 32% statements, 35% branches, 30% functions, 31% lines for configured Jest scope; not a promise of current measured coverage. See `TESTING.md`.

### 6) Evidence

- `.prettierrc`, `eslint.config.js`, `frontend/tsconfig.json`, `frontend/vite.config.ts`
- `backend/utils/forecastServe.js`, `backend/middleware/requestId.js`, `backend/alerts/notify.js`
- `frontend/src/App.tsx`, `frontend/src/lib/forecasts.ts`, `jest.config.cjs`, `__tests__/forecastStore.test.js`
