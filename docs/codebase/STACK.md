# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | TypeScript / JavaScript (ESM) + Python | `package.json:314`, `frontend/package.json:6`, `scripts/validate_forecasts.py:1` |
| Runtime + version | Node.js `>=20` (CI uses Node 20.x, Python 3.11) | `package.json:279`, `.github/workflows/ci.yml:32,146` |
| Package manager | npm (lockfileVersion 3, npm workspaces) | `package.json:319-323`, `package-lock.json:210,217-221` |
| Module/build system | Vite 8.3.0 (frontend SPA), Node ESM native (`"type": "module"`) | `package.json:314`, `frontend/package.json:6,64`, `frontend/vite.config.ts` |

### 2) Production Frameworks and Dependencies

List only high-impact production dependencies (frameworks, data, transport, auth).

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `express` | `^4.18.2` | Core HTTP web server framework for self-hosted backend API | `package.json:230`, `backend/server.js:2` |
| `react` / `react-dom` | `18.3.1` | UI library for web application client | `frontend/package.json:37-38`, `frontend/src/main.tsx:1-2` |
| `react-router-dom` | `^6.24.0` | Client-side routing and page management | `frontend/package.json:41`, `frontend/src/App.tsx:3` |
| `@tanstack/react-query` | `^5.0.0` | Server state management, data caching and synchronization | `frontend/package.json:23`, `frontend/src/App.tsx:2` |
| `leaflet` / `leaflet.markercluster` | `^1.9.4` / `^1.5.3` | Geospatial choropleth and cluster map rendering | `frontend/package.json:32,34`, `frontend/src/components/LiveMapView.tsx` |
| `recharts` | `^2.9.0` | Data visualization charts for trends and risk distributions | `frontend/package.json:42`, `frontend/src/components/HistoricalTemporalChart.tsx` |
| `framer-motion` | `^13.0.0` | Declarative UI animations and transitions | `frontend/package.json:28`, `frontend/src/App.tsx:4` |
| `@google-cloud/firestore` | `^7.11.6` | Google Cloud Firestore database driver for forecast persistence | `package.json:223`, `backend/forecastStore.js:1` |
| `firebase` / `firebase-admin` | `^12.17.0` / `^13.10.0` | Firebase client SDK and Admin SDK (auth, listeners, store verification) | `package.json:232-233`, `backend/db.js:1` |
| `@google/genai` | `^2.15.0` | Google Gemini generative AI client for natural language advisories | `package.json:224`, `backend/routes/chat.js:1` |
| `helmet` | `^8.1.0` | HTTP security headers, CSP and frameguard protection | `package.json:234`, `backend/server.js:23,79-87` |
| `cors` | `^2.8.5` | Cross-Origin Resource Sharing middleware | `package.json:226`, `backend/middleware/cors.js:1` |
| `express-rate-limit` | `^7.5.0` | IP-based request throttling and abuse mitigation | `package.json:231`, `backend/middleware/rateLimit.js:1` |
| `prom-client` | `^15.1.3` | Prometheus metrics instrumentation for Node.js API | `package.json:237`, `backend/metrics.js:1` |
| `web-push` | `^3.6.7` | Web push notification protocol implementation (RFC 8292 / VAPID) | `package.json:238`, `backend/routes/push.js:1` |
| `ws` | `^8.21.3` | WebSocket server for real-time live voice and telemetry | `package.json:239`, `backend/routes/liveVoice.js:1` |
| `zod` | `^3.23.0` | Runtime schema validation and TypeScript type inference | `package.json:240`, `packages/core/src/forecasts.ts:1` |
| `react-native` / `expo` | `0.74.5` / `~51.0.28` | Mobile cross-platform application framework | `apps/mobile/package.json:29,42` |
| `react-native-windows` | `0.74.17` | Windows desktop application shell | `apps/windows/package.json:18` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| `typescript` | Static type checking (`tsc`) across workspaces | `package.json:274`, `frontend/tsconfig.json`, `packages/core/tsconfig.json` |
| `eslint` / `typescript-eslint` | Linter enforcing correctness rules, React Hooks, and global safety | `package.json:259,275`, `eslint.config.js:1-105` |
| `prettier` | Opinionated code formatting (120 print width, single quotes) | `package.json:267`, `.prettierrc:1-10` |
| `jest` / `ts-jest` / `babel-jest` | Unit and integration test runner for backend, shared packages, and utilities | `package.json:263,273`, `jest.config.cjs:1-86` |
| `@playwright/test` | End-to-end browser testing against built frontend | `package.json:248`, `playwright.config.ts:1-45`, `e2e/` |
| `impeccable` | Automated visual design quality and design token verification | `package.json:262`, `scripts/check-design-quality.mjs:1` |
| `pytest` | Python test runner validating CI workflows and pipeline scripts | `.github/workflows/ci.yml:171`, `scripts/tests/` |

### 4) Key Commands

```bash
# Install dependencies across all workspaces
npm ci --legacy-peer-deps --no-audit --no-fund

# Run full development environment (frontend asset check + backend server on :3000)
npm run dev

# Run frontend alone in development mode (Vite dev server)
cd frontend && npm run dev

# Build production bundle (Vite build + prerender + copy dist)
npm run build

# Run unit and integration tests with Jest
npm test

# Run Playwright E2E tests against preview server
npx playwright test

# Type-check TypeScript sources
npm run lint

# Lint all codebases with ESLint (zero-error policy)
npm run lint:eslint

# Format code with Prettier
npm run format

# Run security and secret verification
npm run check:env
bash scripts/check-secrets.sh
node scripts/npm-audit-ci.mjs
```

### 5) Environment and Config

- Config sources: `.env`, `docs/ENVIRONMENT_SECRETS.md`, `.firebaserc`, `firebase.json`, `firestore.rules`, `vercel.json`.
- Required env vars:
  - `BACKEND_API_KEY`: Required for privileged endpoints (CSV ingestion, push notification broadcasts). Fails with 503 if missing (`backend/server.js:38-40`).
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (or `GOOGLE_APPLICATION_CREDENTIALS`): Firestore connection credentials (`backend/db.js`, `backend/forecastStore.js`).
  - `FRONTEND_ORIGIN`: Allowed browser origin for CORS. Fails closed in production if unset (`backend/server.js:47-54`).
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Web push notification dispatch (`backend/server.js:44-46`).
  - `GEMINI_API_KEY`: API key for Gemini chat assistant (falls back to deterministic agrometeorological engine if unset; `backend/server.js:41-43`).
  - `CSP_ENFORCE`: Boolean flag to enforce CSP (default true in production, false in development; `backend/server.js:74-76`).
  - `PORT`: Server bind port (defaults to 3000; `backend/server.js:178`).
- Deployment/runtime constraints:
  - Production deployments run on Node.js 20+ runtime.
  - Model weights and internal experiment assets in `Models/` or `manuscript/` must NEVER be served or exposed over HTTP (`backend/server.js:116-118,154`).

### 6) Evidence

- `package.json`
- `package-lock.json`
- `frontend/package.json`
- `apps/mobile/package.json`
- `apps/windows/package.json`
- `packages/core/package.json`
- `backend/server.js`
- `eslint.config.js`
- `.prettierrc`
- `jest.config.cjs`
- `.github/workflows/ci.yml`
