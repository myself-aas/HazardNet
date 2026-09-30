# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `frontend/` | Public web application (Vite + React SPA, PWA, prerendered pages) | `frontend/package.json`, `frontend/vite.config.ts`, `frontend/scripts/prerender.mjs` |
| `backend/` | Self-host Express API — the same result-serving surfaces as the serverless tier | `backend/server.js`, `README.md` |
| `api/` | Vercel Serverless Function entry points (6 files = 6 functions; Hobby budget 12) | `api/[endpoint].js`, `scripts/check-vercel-functions.mjs` |
| `serverless/` | Per-endpoint Vercel handlers (not scanned for functions by Vercel) | `serverless/dispatch.js`, `serverless/v1/` |
| `packages/` | Shared workspace libraries (`core`, `api`, `analytics`, `design-system`) | `packages/*/package.json` |
| `apps/` | Native clients: `apps/mobile` (Expo/React Native), `apps/windows` (React Native for Windows + C++ shell) | `apps/mobile/package.json`, `apps/windows/package.json` |
| `Models/` | Trained model artifacts + registry/version handshake — unadvertised, never served | `Models/REGISTRY.json`, `Models/VERSION.json`, `backend/server.js` |
| `scripts/` | Pipeline, snapshot-building, QA and gate tooling (`.mjs` + `db/`, `lib/`, `qa/`, `tests/`) | `scripts/`, `.github/workflows/ci.yml` |
| `__tests__/` | Root Jest suites (69 `*.test.js` files) + `__mocks__/` for React Native modules | `__tests__/`, `jest.config.cjs` |
| `e2e/` | Playwright specs | `e2e/*.spec.ts`, `playwright.config.ts` |
| `docs/` | PRD, TRD, publication policy, ops runbooks, secrets guide, audits, `codebase/` | `docs/PRD.md`, `docs/TRD.md` |
| `monitoring/` | Prometheus scrape config, alert rules, Grafana dashboard | `monitoring/prometheus.yml`, `monitoring/alerts.yml`, `monitoring/grafana-dashboard.json` |
| `data/` | Generated/committed runtime data: `site-health/latest.json`, NASA HDS tokens | `data/site-health/latest.json`, `data/design/nasa-hds/tokens.json` |
| `store/` | App-store listing metadata and privacy labels | `store/play-store-data-safety.md`, `store/app-store-metadata.md` |
| `plugins/` | Optional frontend widget plugins with a manifest | `plugins/plugin_manifest.json`, `plugins/03_frontend_widgets/ShelterCapacity.tsx` |
| `skills/` | In-repo domain knowledge packs (hazard protocols, institutions, agronomy…) | `skills/01_tensor_interpretation/`, `skills/03_hazard_protocols/` |
| `assets/` | Bundled docs (`MODEL_CARD.md`) and icon metadata | `assets/docs/MODEL_CARD.md`, `assets/icons/hazard_profiles.json` |
| `utils/` | Single file: the minimal serverless logger | `utils/logger.js` |
| `.env.example` | Placeholder-only environment template for all three injection surfaces (Vercel, GitHub Actions, local `.env`) | `.env.example`, `docs/ENVIRONMENT_SECRETS.md` §0/§2 |
| `.github/` | CI workflows + release workflow templates + Dependabot | `.github/workflows/ci.yml`, `.github/workflow-templates/` |
| `.vs/` | Visual Studio solution state for the Windows app (editor artefact, not source) | `.vs/HazardNet.slnx` |

### 2) Entry Points

- **Main runtime entry (self-host):** `backend/server.js` — builds the Express app, exports it as default, and binds port `3000` only when invoked directly (`npm start` / `npm run dev`). Importing it does not bind a port, so supertest suites can load the app (`backend/server.js`).
- **Web client entry:** `frontend/src/main.tsx` — referenced by `frontend/index.html` (`<script type="module" src="./src/main.tsx">`), mounting `App.tsx` (`frontend/src/App.tsx`).
- **Serverless entries (Vercel):** the 6 files under `api/` — `api/[endpoint].js`, `api/chat/[action].js`, `api/v1/[resource].js`, `api/v1/alerts/[action].js`, `api/v1/forecasts/[action].js`, `api/v1/weather/batch.js`. Each is a `createDispatcher(...)` table over lazy-imported handlers in `serverless/`.
- **Mobile entry:** `apps/mobile/App.tsx` (Expo entry `expo/AppEntry.js`), plus `apps/windows/index.windows.js` for the Windows target.
- **Build-time entry:** `frontend/scripts/prerender.mjs` — run by `frontend` `build` after `vite build` to emit one HTML document per route.
- **How entry is selected:** by deploy target — Vercel routes URLs to `api/*` functions and serves `frontend/dist`; the self-host path uses `backend/server.js` for both API and static assets; native builds use the Expo/RN Windows entry points.

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `frontend/src` | Presentation: pages, components, hooks, view-models, i18n, browser-only integrations | Server secrets, Node-only APIs, direct model-inference logic |
| `packages/core`, `packages/api`, `packages/analytics`, `packages/design-system` | Platform-agnostic pure TypeScript shared by web + mobile (no React Native/DOM imports in `core`) | React/React-Native/DOM imports (`packages/core/src/index.ts` states this explicitly) |
| `backend/routes` | HTTP surface: parse, authorise, delegate, respond | Business rules that belong in `backend/alerts`, `backend/services`, `backend/utils` |
| `backend/alerts` | Alert state machine, policy, assessment, fan-out, reports | Forecast storage concerns |
| `backend/utils` | Reusable pure/shared helpers (CSV, freshness, glide resolver, client-safe errors) | Route wiring / middleware registration |
| `backend/middleware` | Cross-cutting request concerns (CORS, rate limit, auth, request id, serverless guard, security headers) | Domain logic |
| `backend/security/csp.js` | The single CSP policy definition shared by the self-host deployment | Duplicated CSP literals (the file comment records the drift this fixed) |
| `api/` + `serverless/` | Vercel entry points and their handlers; handlers must stay import-safe (no module-level credential reads) | Anything that must be counted against the 12-function budget but is not a URL family |
| `scripts/` | Pipeline ingestion, snapshot builders, QA harnesses, CI gates | Application runtime code |
| `Models/` | Trained artifacts and the version/registry handshake | Anything served to the public (`backend/server.js` 404s these paths) |
| `__tests__/` | Jest suites and React Native module mocks | Production code |

### 4) Naming and Organization Rules

- **File naming (mixed but consistent per area):**
  - `frontend/src/components/**` — `PascalCase.tsx` (`ForecastDashboard.tsx`, `DistrictRiskMap.tsx`)
  - `frontend/src/pages/**` — `PascalCase.tsx` (`AlertsPage.tsx`, `DistrictDetailPage.tsx`)
  - `frontend/src/hooks/**` — `useCamelCase.ts` (`useForecasts.ts`, `useI18n.ts`)
  - `frontend/src/lib/**` — `camelCase.ts` (`forecasts.ts`, `glide.ts`, `publicText.ts`)
  - `backend/**`, `api/**`, `serverless/**`, `utils/**` — `camelCase.js` (`forecastStore.js`, `clientError.js`, `dispatch.js`)
  - `scripts/**` — two coexisting conventions: `snake_case.mjs` for the older pipeline scripts (`validate_env.mjs`, `ingest_forecast_csv.mjs`, `build_alert_snapshot.mjs`) and `kebab-case.mjs` for newer gate/QA scripts (`check-bundle.mjs`, `copy-dist.mjs`, `check-vercel-functions.mjs`)
  - Tests — `*.test.js` / `*.test.tsx` / `*.test.ts`; E2E — `*.spec.ts`; Python — `test_*.py`
- **Directory organization:** hybrid. `frontend/src` is feature-first (`components/alerts`, `components/map`, `pages/dashboard`, `components/user/dashboard`); `backend` is layer-first (`routes`, `middleware`, `services`, `alerts`, `utils`, `security`); `packages/*` are per-domain libraries with a barrel `src/index.ts`.
- **Import aliasing / path conventions:**
  - TypeScript aliases (`frontend/tsconfig.json`): `@/*` → `frontend/src/*`, `@hazardnet/core` → `packages/core/src/index.ts`, `@hazardnet/core/*`, `@hazardnet/design-system`, `@hazardnet/design-system/*`
  - Mirrored in Jest (`jest.config.cjs` `moduleNameMapper`) and in the mobile Jest config (`apps/mobile/jest.config.cjs`), which maps the same packages to `../../packages/*/src`
  - Backend/serverless ESM imports always carry the explicit `.js` extension (`./routes/forecasts.js`) — required by Node ESM resolution
  - Relative imports dominate in `frontend/src`; aliases are used for cross-package boundaries

### 5) Evidence

- `package.json` (`workspaces`), `README.md` (repository-layout table)
- `backend/server.js` (self-host entry + static/SPA serving)
- `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx` (web entry)
- `api/[endpoint].js`, `api/v1/[resource].js`, `serverless/dispatch.js` (serverless entries + dispatcher contract)
- `apps/mobile/App.tsx`, `apps/mobile/package.json` (`main`), `apps/windows/index.windows.js`
- `frontend/tsconfig.json` (`paths`), `jest.config.cjs` (`moduleNameMapper`), `apps/mobile/jest.config.cjs`
- `packages/core/src/index.ts` (barrel + platform-agnostic constraint)
- `frontend/scripts/prerender.mjs`, `frontend/package.json` (`build`)
- `docs/codebase/VERCEL_FUNCTIONS.md` (function-budget arithmetic)
- `.env.example` (committed env template), `backend/security/csp.js` (cross-deployment CSP source)
