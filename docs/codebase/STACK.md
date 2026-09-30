# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | TypeScript (frontend, `packages/*`, `apps/mobile`) and JavaScript ESM (`backend/`, `api/`, `serverless/`, `scripts/`); Python 3.11 (pipeline test scripts); C++/C (React Native Windows shell) | `frontend/package.json`, `backend/server.js`, `scripts/tests/*.py`, `apps/windows/windows/HazardNet/App.cpp` |
| Runtime + version | Node.js `>=20` (CI pins `20.x`); Python `3.11` in CI | `package.json` (`engines.node`), `.github/workflows/ci.yml` |
| Package manager | npm — `lockfileVersion: 3`, npm workspaces (`frontend`, `packages/*`, `apps/*`) | `package.json` (`workspaces`), `package-lock.json` |
| Module/build system | Node ESM (`"type": "module"` at root, `frontend/`, `packages/*`, `apps/mobile`); Vite 8.3.0 builds the frontend SPA; CJS config files use the `.cjs` extension | `package.json`, `frontend/package.json`, `frontend/vite.config.ts`, `jest.config.cjs`, `babel.config.cjs` |

### 2) Production Frameworks and Dependencies

**Root / backend + serverless (runtime `dependencies`)** — `package.json`:

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `express` | `^4.18.2` | Self-host HTTP API server (all `/api` and `/v1` routes) | `package.json`, `backend/server.js` |
| `firebase` / `firebase-admin` | `^12.17.0` / `^13.10.0` | Firestore client SDK, auth token verification | `package.json`, `backend/db.js`, `backend/middleware/firebaseAuth.js` |
| `@google-cloud/firestore` | `^7.11.6` | Firestore driver used by the forecast store | `package.json`, `backend/forecastStore.js` |
| `@google/genai` | `^2.15.0` | Gemini generative-AI client (advisories, chat, live voice) | `package.json`, `backend/services/advisoryAgent.js`, `backend/routes/chat.js` |
| `helmet` | `^8.1.0` | Security headers / CSP / frameguard on the Express app | `package.json`, `backend/server.js`, `backend/security/csp.js` |
| `cors` | `^2.8.5` | CORS allowlist (fails closed in production) | `package.json`, `backend/middleware/cors.js` |
| `jsonwebtoken` | `^9.0.0` | JWT verification for authenticated endpoints | `package.json`, `backend/middleware/firebaseAuth.js` |
| `express-rate-limit` | `^7.5.0` | Layered rate limiting (`/api` baseline + AI/alert buckets) | `package.json`, `backend/middleware/rateLimit.js` |
| `multer` | `^2.2.0` | Multipart CSV upload for forecast ingestion | `package.json`, `backend/routes/forecasts.js` |
| `busboy` | `^1.6.0` | Streaming multipart parsing in the serverless ingest path | `package.json`, `serverless/ingest.js` |
| `csv-parser` | `^3.2.1` | Streaming CSV row parsing | `package.json`, `backend/routes/forecasts.js` |
| `zod` | `^3.23.0` | Response/request schema validation (also in `packages/*`) | `package.json`, `packages/core/src/contracts.ts`, `packages/api/src/endpoints.ts` |
| `dompurify` | `^3.4.15` | HTML sanitisation before rendering untrusted content | `package.json` |
| `web-push` | `^3.6.7` | Web push notifications (VAPID) | `package.json`, `backend/utils/vapid.js`, `backend/routes/push.js` |
| `ws` | `^8.21.3` | WebSocket server for the Gemini live-voice channel | `package.json`, `backend/routes/liveVoice.js` |
| `prom-client` | `^15.1.3` | Prometheus metrics registry (`/metrics`) | `package.json`, `backend/metrics.js`, `backend/server.js` |
| `dotenv` | `^17.4.2` | `.env` loading for local/dev runs | `package.json`, `backend/server.js` |

**Frontend (production `dependencies`)** — `frontend/package.json`:

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `react` / `react-dom` | `18.3.1` | UI library | `frontend/package.json`, `frontend/src/main.tsx` |
| `react-router-dom` | `^6.24.0` | Client-side routing (30+ pages) | `frontend/package.json`, `frontend/src/App.tsx` |
| `@tanstack/react-query` | `^5.0.0` | Server-state fetching/caching/polling | `frontend/package.json`, `frontend/src/hooks/useForecasts.ts` |
| `tailwindcss` + `@tailwindcss/vite` | `^4.3.3` | Utility-first CSS engine (Vite plugin, no PostCSS config) | `frontend/package.json`, `frontend/vite.config.ts` |
| `@mui/material` + `@emotion/*` | `^6.0.0` / `^11.11.0` | Material UI component layer | `frontend/package.json` |
| `leaflet`, `leaflet.heat`, `leaflet.markercluster` | `^1.9.4` / `^0.2.0` / `^1.5.3` | District choropleth, heat and cluster maps | `frontend/package.json`, `frontend/src/components/DistrictRiskMap.tsx` |
| `recharts` | `^2.9.0` | Trend / distribution charts | `frontend/package.json`, `frontend/src/components/TemporalTrendChart.tsx` |
| `framer-motion` | `^13.0.0` | Animation | `frontend/package.json` |
| `three`, `@react-three/fiber`, `@react-three/drei` | `^0.180.0` / `^8.18.0` / `^9.122.0` | 3D hero scene | `frontend/package.json`, `frontend/src/components/HeroCinematicBackground.tsx` |
| `firebase` | `^12.17.0` | Auth + Firestore realtime listeners in the browser | `frontend/package.json`, `frontend/src/lib/firebase.ts` |
| `@vercel/analytics` | `^2.0.1` | Web analytics loader (env-gated) | `frontend/package.json`, `frontend/src/lib/vercelAnalytics.ts` |
| `vite-plugin-pwa` + `workbox-*` | `^1.3.0` / `^7.4.1` | Service worker / offline shell (devDependency) | `frontend/package.json`, `frontend/src/serviceWorker.ts` |
| `remotion` | `^4.0.527` | Programmatic video hero | `frontend/package.json` |
| `jspdf`, `html2canvas-pro`, `qrcode.react`, `react-markdown`, `lucide-react`, `react-hot-toast`, `@base-ui/react`, `shadcn`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css` | see manifest | PDF export, QR, markdown articles, icons, toasts, primitives | `frontend/package.json` |

**Mobile (`apps/mobile`)** — `apps/mobile/package.json`: `expo ~51.0.28`, `react-native 0.74.5`, `react` `18.2.0`, `@react-navigation/*` `~6.x`, `@tanstack/react-query` `^5.103.2`, `zustand` `^4.5.7`, `@shopify/flash-list`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `expo-notifications`, `expo-location`, `expo-file-system`, `expo-haptics`, `expo-image-picker`, `expo-linking`, `expo-screen-orientation`, `expo-system-ui`, `expo-constants`, `expo-device`, `expo-status-bar`.

**Shared workspace packages** — `packages/*/package.json`:

| Package | Depends on | Role |
|---------|-----------|------|
| `@hazardnet/core` | `zod` | Platform-agnostic domain logic: contracts, forecast mapping, alert policy, freshness, geo, dedupe, query keys, notifications |
| `@hazardnet/api` | `@hazardnet/core`, `zod` | Typed API client + endpoint wrappers + retry |
| `@hazardnet/analytics` | `@hazardnet/core` | Analytics event helpers |
| `@hazardnet/design-system` | peer `react` | Design tokens, Material 3 expressive descriptors, `useTokens` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| `jest` `^29.7.0` + `babel-jest` `^30.4.1` + `ts-jest` | Unit/component test runner (root config, jsdom) | `package.json`, `jest.config.cjs` |
| `@playwright/test` `^1.62.1` | E2E / QA browser suite | `package.json`, `playwright.config.ts`, `e2e/` |
| `pytest` (Python, installed in CI) | Pipeline-script tests | `.github/workflows/ci.yml`, `scripts/tests/*.py` |
| `node --test` | Phase gate tests (`npm run test:phases`) | `package.json` (`scripts.test:phases`) |
| `eslint` `^9.39.0` (flat config) + `typescript-eslint` `^8.46.0` + `eslint-plugin-react-hooks` | Lint — type-aware correctness rules, no stylistic rules | `eslint.config.js` |
| `prettier` `^3.6.2` | Formatting (printWidth 120, single quotes) | `.prettierrc` |
| `typescript` `^5.4.5` | Type-check only (`npm run lint` = `tsc --noEmit`) | `package.json`, `frontend/tsconfig.json` |
| `vite` `^8.3.0` | Frontend dev server + bundler | `frontend/package.json`, `frontend/vite.config.ts` |
| `impeccable` `^4.1.0` | Design-quality detector used by `check:design`; waivers recorded in the committed baseline | `package.json` (`scripts.design:detect`), `docs/design/impeccable-baseline.json`, `scripts/check-design-quality.mjs` |
| `jest-expo`, `@testing-library/react-native` | Mobile component tests | `apps/mobile/package.json`, `apps/mobile/jest.config.cjs` |
| `@testing-library/react`, `jest-axe`, `supertest`, `node-mocks-http` | Component/a11y/API testing | `package.json`, `__tests__/api/*.test.js` |
| Repo QA scripts (`scripts/qa/*.mjs`) | Browser-driven layout/a11y/overflow review harnesses | `scripts/qa/`, `.github/workflows/ci.yml` |

### 4) Key Commands

```bash
# Install (npm workspaces, hoisted to root)
npm ci --legacy-peer-deps --no-audit --no-fund

# Develop (Express backend on :3000, serves frontend/dist when built)
npm run dev
npm start

# Build (frontend Vite build + prerender, then copy dist)
npm run build
npm run build:frontend

# Test
npm test                                   # jest --passWithNoTests (root config)
npx jest --config jest.config.cjs          # explicit root config
npx jest --config apps/mobile/jest.config.cjs   # React Native component suites
npm run test:phases                        # node --test phase gates
npx playwright test                        # e2e (default testMatch subset)
npx playwright test -c playwright.qa.config.ts  # QA sweep, single worker
python -m pytest scripts/tests -q          # pipeline script tests

# Lint / format
npm run lint                               # tsc -p frontend/tsconfig.json --noEmit
npm run lint:eslint                        # eslint .
npm run format                             # prettier --write (frontend/src, backend, api)

# Repo gates (all wired into .github/workflows/ci.yml)
npm run check:functions   # Vercel Hobby 12-function budget
npm run check:claims      # CLAIMS.md registry verification
npm run check:bundle      # bundle budget
npm run check:design      # impeccable design-quality gate
npm run check:paths       # no repository path in any shipped document
npm run check:env         # validate_env.mjs
npm run check:fonts       # font payload budget
npm run alerts:rehearse / npm run alerts:snapshot
```

### 5) Environment and Config

- **Config sources:** `package.json`, `frontend/package.json`, `apps/mobile/package.json`, `packages/*/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `eslint.config.js`, `.prettierrc`, `jest.config.cjs`, `jest.setup.ts`, `babel.config.cjs`, `apps/mobile/{babel.config.cjs,metro.config.cjs,jest.config.cjs,app.json,eas.json}`, `playwright.config.ts`, `playwright.qa.config.ts`, `vercel.json`, `frontend/vercel.json`, `firebase.json`, `firestore.rules`, `.firebaserc`, `firebase-applet-config.json`, `monitoring/prometheus.yml`, `monitoring/alerts.yml`.
- **Required env vars:** `FIREBASE_SERVICE_ACCOUNT_JSON` (server boot), `BACKEND_API_KEY` (ingest/broadcast), `FRONTEND_ORIGIN` (CORS allowlist; production fails closed without it), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (push), `GEMINI_API_KEY` (AI routes; deterministic fallback when unset). Frontend build: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (+ optional `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_FIRESTORE_DATABASE_ID`). A placeholder-only **`.env.example`** is committed and `docs/ENVIRONMENT_SECRETS.md` §2 is the authoritative reference. Optional/tuning: `GEMINI_API_KEY_BACKUP`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `WEB_PUSH_CONTACT`, `CSP_ENFORCE`, `FIREBASE_VERIFY_TIMEOUT_MS`, `CONVERSION_PERSIST_TIMEOUT_MS`, `FORECAST_STORE`, `FORECAST_DATASET`, `ALERT_AUTO_PUBLISH`, `ALERT_AUTO_PUBLISH_MINUTES`, `ALERT_DUTY_OFFICERS`, `SLACK_WEBHOOK_URL`, `QA_CHROMIUM_PATH` / `PLAYWRIGHT_CHROMIUM_PATH`.
- **Deployment/runtime constraints:**
  - Vercel **Hobby** plan allows at most **12 Serverless Functions** per deployment; every file under `api/` is one function and **6 are used**. The one-entry-point-per-URL-family dispatcher design exists purely for this budget (`api/[endpoint].js`, `serverless/dispatch.js`, `scripts/check-vercel-functions.mjs`, `docs/codebase/VERCEL_FUNCTIONS.md`).
  - Node `>=20`; CI uses Node `20.x` and Python `3.11`.
  - Firestore: named applet database `ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843` is the default when no env override is set (`backend/db.js`).
  - The self-host backend hardcodes port `3000` and binds `0.0.0.0` (`backend/server.js`).
  - Model artifacts under `Models/` are deliberately never served (explicit 404 routes in `backend/server.js`); the model-version handshake in `Models/VERSION.json` must stay committed and clean, enforced by a CI gate in the `verify` job.
  - **Two supported deployment targets** (confirmed 2026-09-30): Vercel (static + serverless) and the self-host Express backend on port 3000. The Express target is live, not legacy — its in-memory rate limiting and in-memory store fallbacks are real concerns if it is ever run with more than one instance.
  - The CSP allows no ad-network script origin; `style-src` still permits `'unsafe-inline'` (see `backend/security/csp.js` for the recorded reason).

### 6) Evidence

- `package.json` (root manifest: engines, workspaces, scripts, dependencies)
- `frontend/package.json` (frontend production/dev dependencies)
- `apps/mobile/package.json` (Expo/React Native dependency set)
- `packages/core/package.json`, `packages/api/package.json`, `packages/analytics/package.json`, `packages/design-system/package.json`
- `frontend/vite.config.ts`, `frontend/tsconfig.json` (build + TS strictness + path aliases)
- `eslint.config.js`, `.prettierrc`, `jest.config.cjs`, `babel.config.cjs`, `playwright.config.ts`
- `vercel.json`, `firebase.json`, `.firebaserc`
- `backend/server.js` (runtime bootstrap and port)
- `.github/workflows/ci.yml` (Node/Python versions, gate commands)
- `docs/ENVIRONMENT_SECRETS.md` (environment-variable reference), `.env.example` (committed template)
- `docs/design/impeccable-baseline.json`, `backend/security/csp.js` (design gate baseline; CSP source)
