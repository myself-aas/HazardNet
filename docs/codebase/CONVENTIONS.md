# Coding Conventions
# Conventions

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.
**Evidence:** `package.json` (`"type": "module"`), `.prettierrc`, `eslint.config.js`, `babel.config.cjs`, `jest.config.cjs`, `frontend/tsconfig.json` (inferred from presence of TS), `backend/server.js` imports, `DESIGN.md`, `firestore.rules`, file samples across `backend/`, `scripts/`, `frontend/src/`.

## Core Sections (Required)
## Language & Module System

### 1) Naming Rules
- **Backend & scripts:** JavaScript ES Modules (`.js` with `import`/`export`, `"type": "module"` in root `package.json`). Some Node scripts use `.mjs` to force ESM under any circumstance (e.g. `scripts/*.mjs`). There is **no** TypeScript in the backend.
- **Frontend:** TypeScript (`.tsx`, `.ts`). Strict mode [TODO] needs confirming from `frontend/tsconfig.json`.
- **Python scripts:** Python 3.8+, standard package layout under `scripts/etl/`, `scripts/mlops/`, `scripts/hindcast/` (each with `__init__.py` and a `cli.py` entry point exposing `python -m scripts.xxx.cli`). PEP 8, type hints in newer modules.

Observed patterns, not a universal style mandate:
## Naming Conventions

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
- **Files:**
  - JavaScript/TS modules use `camelCase.js` (e.g. `forecastRow.js`, `chatService.js`) except class files which use `PascalCase.mjs`? [TODO] — no classes are in PascalCase files in the samples reviewed; confirm.
  - React components in `frontend/src/components/` are `PascalCase.tsx` (observed convention for React).
  - Pages in `frontend/src/pages/` are `kebab-case.tsx` or directory-based with `index.tsx`? [TODO]
  - Python modules and packages are `snake_case.py` (consistent across `scripts/etl/*.py`, `scripts/mlops/*.py`).
  - Test files are `*.test.js` (Jest, `__tests__/`) and `test_*.py` (pytest-style, `scripts/tests/`). Fixtures live under `scripts/tests/fixtures/`.
- **Identifiers:**
  - JS: `camelCase` for variables/functions, `PascalCase` for classes and React components, `SCREAMING_SNAKE_CASE` for constants (`VALID_HORIZONS`, `HAZARD_TYPES`, `CONFIG`).
  - Python: `snake_case` functions/variables, `PascalCase` classes, `UPPER_SNAKE` module constants.
- **Env vars:** `SCREAMING_SNAKE_CASE`. Public (bundled) vars are prefixed `VITE_`. Server-only secrets must NOT be prefixed `VITE_` (called out explicitly in `.env.example`).
- **Database keys (Firestore):** `snake_case` matching the canonical CSV columns (`district_id`, `model_severity`, `physics_severity`, `prediction_date`, …).

Sampling also included `AuthContext.tsx`, `ForecastDashboard.tsx`, `useAlertsData.ts`, `weather.ts`, `forecastFreshness.js`, `csvIngestion.js`, `alertAuth.js`, `notify.js`, and `scripts/physics_severity.py`. No repository-wide private-field naming rule was found.
## Code Formatting & Linting

### 2) Formatting and Linting
- **Prettier** (`.prettierrc`) — root; `npm run format` applies to `frontend/src/**/*.{ts,tsx}`, `backend/**/*.js`, `api/**/*.js`. [TODO] read `.prettierrc` for specific settings.
- **ESLint 9** flat config (`eslint.config.js`) with `eslint-plugin-react-hooks`, `@eslint/js`, `globals`.
- **TypeScript** type checking run as `npm run lint` (`tsc -p frontend/tsconfig.json --noEmit`).
- **Python** linting is not formally configured (no `pyproject.toml` `[tool.ruff]` or similar observed); adherence is by convention.

- `.prettierrc`: 120 columns, single quotes, semicolons, trailing commas, two spaces, always-parenthesized arrows, LF.
- `eslint.config.js`: recommended JS/TypeScript rules and React hooks rules; explicit `any` and unused variables warn; `_`-prefixed unused arguments/variables are exempt. Console policy varies by glob; backend and tooling allow console.
- TypeScript is `strict: true`, ESNext/bundler resolution, `react-jsx`, `skipLibCheck: true` (`frontend/tsconfig.json`). ESLint uses recommended configs, not a configured type-aware project service despite its introductory comment.
- Commands: `npm run lint` (typecheck), `npm run lint:eslint`, `npm run format` (writes changes). Existing source formatting is mixed; do not mass-reformat unrelated files.
## Error Handling

### 3) Import and Module Conventions
- **JS backend:**
  - API route handlers catch and forward to Express `next(err)` for centralized handling where applicable; many routes return explicit `res.status(4xx).json({ error: '…' })` instead.
  - Client-facing errors use `backend/utils/clientError.js` (small custom error with status code).
  - Configuration errors at boot are logged via the `assertEnvironment()` IIFE in `server.js` (warnings vs fatal problems), non-fatal so local dev boots.
  - Ingest parsing uses a **Result-type return**: `{ ok: true, value } | { ok: false, error }` (see `parseCsvForecastRow` in `forecastRow.js`). This pattern is used for validation throughout the ingest pipeline.
- **Python scripts:**
  - Functions return structured success/failure rather than raising at the top level where they participate in CI gating.
  - Logging uses a per-module `logging.getLogger(…)` with `[%(asctime)s] %(levelname)s: %(message)s` format (see training pipeline, ETL).

- Root/frontend packages use ESM; Node relative imports generally include `.js`; configuration requiring CommonJS uses `.cjs` (`package.json`, `jest.config.cjs`).
- Frontend relative imports coexist with `@/*` → `src/*`; Vite and TS both define the alias.
- `App.tsx` lazy-loads many page modules, sometimes adapting named exports into a default export for React.lazy.
- [TODO] No enforced import sorting/grouping or general barrel-export policy was found in the inspected configs. Follow neighboring source rather than inventing one.
## Import Patterns

### 4) Error and Logging Conventions
- Backend uses **relative** ESM imports with `.js` extension (required for ESM) e.g. `import { corsMiddleware } from './middleware/cors.js';`.
- The shared forecast-row parser, the stored-prediction reader, and model-info are imported into both `backend/routes/*` and Vercel `api/*` functions via relative paths that cross the boundary — care is taken not to import server-only modules (like `firebase-admin`) from the serverless bundle that is sent to Vercel Edge.
- Frontend uses relative imports and (likely) bare-package specifiers for node_modules. [TODO] confirm path aliases from `tsconfig.json`.

- HTTP validation commonly produces `{error: ...}` with explicit status; prediction catches return a generic 500 message (`backend/routes/predict.js`). Shared query helpers return parsed objects or an `error` field (`forecastServe.js`).
- Forecast reads retain snapshot fallback; writes now propagate a safe persistence failure and do not update memory before commit. Frontend forecast fetches fall through to other sources. These are significant behavior contracts, not uniform exception policy.
- `backend/middleware/requestId.js` creates a UUID, echoes `X-Request-Id`, and logs JSON containing `ts`, `level`, `msg`, `requestId`, `method`, `path`, `status`, `durationMs`.
- Other modules use plain console messages; `utils/logger.js` supplies only simple INFO/ERROR wrappers. There is no universal structured logger enforcement.
- Notification destinations are masked in `backend/alerts/notify.js`, SMS transport has redaction helpers, and `backend/utils/clientError.js` centralizes some safe client errors. [TODO] Global redaction coverage is not established; request logging includes `req.originalUrl`, including its query string.
## Async Patterns

### 5) Testing Conventions
- **JS:** `async/await` throughout; no raw promise chains in new code. `Promise.all` for parallel fan-out. No `util.promisify` style.
- **Python:** `asyncio` is not used; HTTP calls use synchronous `requests` / `subprocess.run` (scripts are batch/offline).

- Root Jest: `__tests__/*.test.js`; frontend colocated `__tests__/*.test.ts(x)`; Python `scripts/tests/test_*.py`, `training/tests/test_*.py`; Playwright `e2e/*.spec.ts`.
- Backend suites may override the default jsdom environment using `@jest-environment node`; Firestore is module-mocked, and singleton stores reset in `beforeEach` (`__tests__/forecastStore.test.js`).
- Coverage floors are 32% statements, 35% branches, 30% functions, 31% lines for configured Jest scope; not a promise of current measured coverage. See `TESTING.md`.
## Validation & Schema

### 6) Evidence
- **JS:** `zod` is a dependency for runtime schema validation (used in alert routes and chat input validation). `parseCsvForecastRow` performs bespoke range/whitelist validation (severity ∈ [0,1], confidence ∈ [0,1], hazard ∈ VALID_HAZARDS, horizon ∈ VALID_HORIZONS).
- **HTML sanitization:** `dompurify` is used before rendering any user- or AI-generated HTML.
- **CSV safety:** `backend/utils/csvSafety.js` and `scripts/tests/test_csv_safety.mjs` defend against CSV injection.

- `.prettierrc`, `eslint.config.js`, `frontend/tsconfig.json`, `frontend/vite.config.ts`
- `backend/utils/forecastServe.js`, `backend/middleware/requestId.js`, `backend/alerts/notify.js`
- `frontend/src/App.tsx`, `frontend/src/lib/forecasts.ts`, `jest.config.cjs`, `__tests__/forecastStore.test.js`
## Security Conventions

- Never log secrets; `scripts/check-secrets.sh` runs in CI.
- All `/api` routes have rate limits; expensive routes (predict, chat, agent, alerts) have tighter buckets.
- CSP is centrally authored (no inline nonces except the Vercel Analytics script accounted for in `vercel.json`).
- Fail-closed defaults: CORS, auth-gated ingest, model artifacts never served (route guard in `server.js`).
- Firestore RLS via `firestore.rules` (11KB — covers user dashboards, blog articles, and forecast reads).

## Git / Branching Conventions

- Work is done on `arena/01a0c54a-hazardnet` in this session; main branch is `main`.
- Commits use conventional-changelog style? [TODO] Conventional-commits prefixes (`feat:`, `fix:`, `chore:`) are used in README examples but not formally enforced by hook.
- ADRs live in `docs/adr/` and are numbered `NNNN-title.md`.
- Workflow templates are in `.github/workflow-templates/` for reuse across deploy targets (daemon CLI, field agent Android, GIS workstation, npm/python packages).

## Commit / Release Discipline

- Daily forecasts are committed by `daily_forecast.yml` using the GITHUB_TOKEN, bumping `backend/data/forecasts/` and `frontend/public/data/`.
- Weekly artifacts are attached as GitHub Releases with tag `vX.Y.Z` (see README).
- Model version is tracked in `Models/VERSION.json` with SHA-256 hashes for each artifact.

## Design / CSS Conventions (NASA HDS)

Fully specified in `DESIGN.md` and `docs/design-system/MASTER.md`:
- Square corners (0px) on cards/buttons/modals; 2px only on small controls.
- 1px hairlines, no shadows except map popups/panels.
- Red (NASA red) for navigation/CTAs/errors; Blue for on-page actions; Orange for status/caution; Green for fresh/active.
- Only one neutral ramp (`carbon-*`); no slate/zinc.
- Tinted surfaces use a darker shade of their own hue for text (never grey on colour).
- Numbers set in DM Mono, right-aligned in tables; units in column headers.
- Motion uses `cubic-bezier(0.2, 0, 0, 1)` at 150/300ms, no bounce/pulse/loop.
- Design QA scripts (`scripts/check-design-quality.mjs`, `npm run design:detect`) enforce these rules.
