# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

List only meaningful top-level directories and files.

| Path | Purpose | Evidence |
|------|---------|----------|
| `frontend/` | Web application client built with Vite, React 18, React Router, Tailwind CSS, Leaflet, and Recharts. Includes prerendered static editorial pages and interactive dashboards. | `frontend/package.json`, `frontend/src/App.tsx` |
| `backend/` | Self-hosted Node.js Express server providing REST endpoints for forecasts, alerts, chat, push notifications, and live Prometheus metrics. | `backend/server.js`, `backend/routes/` |
| `api/` | Serverless API functions designed for Vercel edge deployment (`/api/forecasts`, `/api/ingest`, `/api/metrics`, `/api/v1/*`). | `api/forecasts.js`, `api/v1/forecasts/bulk.js` |
| `packages/core/` | Shared domain contracts, Zod data validation schemas, forecast row definitions, alert state machines, and i18n utilities. | `packages/core/package.json`, `packages/core/src/index.ts` |
| `packages/design-system/` | Shared UI tokens, Material 3 Expressive theming, and React custom styling hooks. | `packages/design-system/package.json`, `packages/design-system/src/tokens.ts` |
| `packages/api/` | Typed API client wrapper with standardized error handling and retry policies. | `packages/api/package.json`, `packages/api/src/client.ts` |
| `packages/analytics/` | Cross-platform event tracking and telemetry interfaces. | `packages/analytics/package.json`, `packages/analytics/src/index.ts` |
| `apps/mobile/` | Expo SDK 51 and React Native cross-platform mobile client for Android and iOS. | `apps/mobile/package.json`, `apps/mobile/App.tsx` |
| `apps/windows/` | React Native for Windows desktop application shell. | `apps/windows/package.json`, `apps/windows/App.windows.tsx` |
| `data/` | Site health probe history (`data/site-health/latest.json`) and design quality token baseline datasets. | `data/site-health/latest.json`, `data/design/` |
| `docs/` | System specifications, architecture documentation (`PRD.md`, `TRD.md`, `TASKS.md`, `SECURITY.md`, `PUBLICATION_POLICY.md`). | `docs/PRD.md`, `docs/SECURITY.md` |
| `scripts/` | Tooling for forecast snapshot generation, content engine building, secret auditing, and CI pipeline checks. | `scripts/build_forecast_snapshot.mjs`, `scripts/check-secrets.sh` |
| `Models/` | Research model binaries (strictly private; protected from HTTP serving via backend route guards). | `backend/server.js:116`, `docs/PUBLICATION_POLICY.md` |
| `manuscript/` | Master's thesis manuscript materials, LaTeX sources, and Kaggle research notebooks (1 through 8). | `manuscript/`, `README.md:64-67` |
| `__tests__/` | Root test suite covering backend controllers, security headers, Firestore security rules, and alert lifecycle. | `jest.config.cjs:79-85`, `__tests__/` |
| `e2e/` | Playwright end-to-end browser test suites testing live UI flows and fallback chains. | `playwright.config.ts`, `e2e/` |
| `.github/` | GitHub Actions workflow definitions (`ci.yml`, `site-health.yml`, `app-releases.yml`) and Dependabot configurations. | `.github/workflows/ci.yml` |

### 2) Entry Points

- Main runtime entry:
  - Frontend SPA: `frontend/index.html` mounts `frontend/src/main.tsx`, which renders `frontend/src/App.tsx`.
  - Self-hosted Backend API: `backend/server.js` (`node backend/server.js`).
  - Serverless API: Exported handler functions in `api/forecasts.js`, `api/ingest.js`, and `api/v1/**/*.js`.
- Secondary entry points (worker/cli/jobs):
  - Mobile App: `apps/mobile/App.tsx` loaded via `expo/AppEntry.js`.
  - Windows Desktop App: `apps/windows/App.windows.tsx` loaded via `apps/windows/index.windows.js`.
  - Content Engine Builder CLI: `scripts/build_content_engine.mjs`.
  - Forecast Snapshot Generator CLI: `scripts/build_forecast_snapshot.mjs`.
  - Alert Engine Rehearsal CLI: `scripts/rehearse_alert_engine.mjs`.
- How entry is selected (script/config):
  - Root `package.json` scripts define `npm run dev` to start both the static check and Express server (`node scripts/ensure-frontend.mjs && node backend/server.js`).
  - Frontend `package.json` defines `npm run dev` running `vite` and `npm run build` executing `vite build && node scripts/prerender.mjs`.

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `frontend/src/` | UI components, pages, routing, hooks, presentation state, and client-side formatting. | Raw database driver connections, secret keys, or research model training code. |
| `backend/` | Express routing, Firestore database read/write queries, rate limiting, security headers, and WebSocket connections. | Direct frontend DOM manipulation, client styling, or public access to `Models/`. |
| `packages/core/` | Canonical Zod schemas (`ForecastRow`, `AlertRecord`), domain constants, shared enums, and pure business validation logic. | Framework-specific UI code (DOM/React) or server-specific network drivers. |
| `packages/design-system/` | Design tokens, color ramps, typography constants, and theme providers. | Business validation logic, API endpoints, or database queries. |
| `api/` | Stateless Vercel serverless request handlers that read from Firestore or static cached JSON fallbacks. | Long-running background processes, persistent in-memory singletons, or WebSockets. |
| `Models/` & `manuscript/` | Academic research files, trained neural weights, thesis writing, and Kaggle experiment notebooks. | Publicly downloadable routes, production runtime dependencies, or hardcoded API keys. |

### 4) Naming and Organization Rules

- File naming pattern:
  - React Components: PascalCase (e.g., `DistrictDetailPanel.tsx`, `HeroVideoPlayer.tsx`, `StatusStrip.tsx`).
  - Route handlers & services: camelCase (e.g., `forecastStore.js`, `advisoryMapper.js`, `alertEngine.js`).
  - Scripts: kebab-case or snake_case with `.mjs` or `.py` (e.g., `build_forecast_snapshot.mjs`, `check-secrets.sh`, `validate_forecasts.py`).
  - Unit tests: `*.test.js` or `*.test.tsx` located in `__tests__/` or adjacent `__tests__/` directories.
- Directory organization pattern:
  - `frontend/src/` is organized by role/layer: `components/`, `pages/`, `hooks/`, `context/`, `services/`, `utils/`, `types/`, `styles/`.
  - `backend/` is organized by responsibility: `routes/`, `middleware/`, `services/`, `security/`, `utils/`, `data/`.
  - Monorepo packages follow the workspace pattern: `packages/<package-name>/src/` and `apps/<app-name>/src/`.
- Import aliasing or path conventions:
  - `@/*` maps to `<rootDir>/frontend/src/*` (configured in `frontend/tsconfig.json` and `jest.config.cjs`).
  - Workspace package aliases `@hazardnet/core`, `@hazardnet/design-system`, `@hazardnet/api`, `@hazardnet/analytics` map directly to internal packages without publishing to npm.

### 5) Evidence

- `package.json` (workspaces definition)
- `frontend/src/App.tsx` (client route layout)
- `backend/server.js` (server route tree and module mounts)
- `packages/core/src/index.ts` (shared domain interface)
- `packages/design-system/src/index.ts` (design system tokens)
- `frontend/tsconfig.json` (TypeScript path mappings)
- `jest.config.cjs` (Jest module mappings)
