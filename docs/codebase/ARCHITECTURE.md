# Architecture

> **Mapping pass:** 2026-09-30 (second pass, commit `deff0d9`). Claims in this document
> were verified against the working tree; the commands used are listed in the Evidence
> section, and the full run list is summarised in `CONCERNS.md`.

## Core Sections (Required)

### 1) Architectural Style

- **Primary style:** **Layered, multi-surface monorepo** — three independently deployable surfaces (Vite SPA, Express backend, Vercel serverless functions) that share domain logic through workspace packages, with a batch ingestion pipeline feeding a single Firestore store.
- **Why this classification:** the directory structure shows explicit layers in `backend/` (`routes` → `middleware` → `services`/`alerts` → `utils` → stores) and a shared-library boundary in `packages/` consumed by both `frontend/` and `apps/mobile/`; `api/` + `serverless/` re-implement only the HTTP edge, delegating to the same `backend/` modules (`serverless/v1/alerts/index.js` imports `backend/alerts/*`).
- **Primary constraints:**
  1. **Publication policy** — the repository ships results only; model code, datasets and severity derivation are research-private (`docs/PUBLICATION_POLICY.md`, `README.md`). This is why `Models/` exists but is 404'd and why every public number is gated by `CLAIMS.md`.
  2. **Free-tier hosting** — Vercel Hobby's 12-serverless-function cap shaped the entire `api/`/`serverless/` split (`serverless/dispatch.js` header, `scripts/check-vercel-functions.mjs`).
  3. **Zero-human-intervention daily publishing with human review above WATCH** — the alert state machine is the enforcement point (`backend/alerts/lifecycle.js`).
- **Deployment targets:** two, both supported (confirmed 2026-09-30) — Vercel (static `frontend/dist` + the 6 serverless functions) and the self-host Express backend (`backend/server.js`, port 3000) which serves the same API plus the static build. The CSP has one source (`backend/security/csp.js`) consumed by both, so the two targets cannot drift.

### 2) System Flow

```text
Kaggle notebook (8-hazardnet-advisory)
  → GitHub Actions daily_advisory_ingest.yml (fetch, retry once, validate, staleness-guard)
  → scripts/validate_advisory_csv.mjs + scripts/process_advisory_ingest.mjs (column map → ForecastRow)
  → stores: backend/data/forecasts/*.json|csv + manifest.json  AND  Firestore (forecast store)
  → static snapshot frontend/public/data/forecasts-latest.json
  → API edge: Vercel api/* (createDispatcher → serverless/*)  OR  Express backend/server.js
  → frontend React Query hooks (useForecasts) → components → Leaflet/Recharts
  → degradation: API unreachable → committed snapshot → static ALL_64_DISTRICTS baseline
```

Traced end-to-end for one forecast read:

1. `frontend/src/hooks/useForecasts.ts` issues `GET /api/v1/forecasts/bulk?horizon=…&fresh=<ts>` with `cache: 'no-store'`, polled every 5 minutes by TanStack Query.
2. On Vercel the URL matches `api/v1/forecasts/[action].js`, which calls `createDispatcher({ param: 'action', … })` from `serverless/dispatch.js`; the dispatcher resolves the segment from the path, strips the routing artefact, lazy-imports `serverless/v1/forecasts/bulk.js`, and runs `guardRequest` first.
3. The handler reads the forecast store via `backend/forecastStore.js` → `getForecastStore()` (singleton) → Firestore through `backend/db.js`, with an automatic in-memory/committed-snapshot fallback when Firestore is unprovisioned, offline, or returns 0 records.
4. `backend/utils/forecastServe.js` normalises query params/paging and `backend/forecastStore.js` `ensureAdvisoryFields()` back-fills advisory fields for older snapshots.
5. If the API is unreachable the hook falls back to `fetchStaticForecastSnapshot()`, which fetches the URL `/data/forecasts-latest.json` (`FORECAST_SNAPSHOT_URL` in `frontend/src/lib/forecasts.ts`) — i.e. the committed file `frontend/public/data/forecasts-latest.json`. If that is also unavailable, callers degrade to the static `ALL_64_DISTRICTS` baseline (`frontend/src/data/bangladeshDistricts.ts`).
6. Alert publication follows a separate flow: `backend/alerts/assess.js` → `backend/alerts/lifecycle.js` (pure transition evaluation) → `backend/alerts/service.js` → `backend/alerts/notify.js` fan-out through `channels/sms.js` and `channels/telegram.js`.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `frontend/src/pages`, `components` | Rendering, user interaction, client routing | Server-side secrets, business rules that must be identical on mobile | `frontend/src/App.tsx`, `frontend/src/components/` |
| `frontend/src/hooks`, `lib` | Data fetching, fallback chain, view models, i18n | Direct Firestore writes for shared domain state | `frontend/src/hooks/useForecasts.ts`, `frontend/src/lib/forecasts.ts` |
| `packages/core` | Contracts (Zod), forecast mapping, alert policy/levels, freshness, geo, dedupe, notification matching | React/DOM/React-Native imports | `packages/core/src/index.ts`, `packages/core/src/contracts.ts`, `packages/core/src/alertPolicy.ts` |
| `packages/api` | Typed client, endpoint wrappers, retry, error types | UI concerns | `packages/api/src/client.ts`, `packages/api/src/endpoints.ts` |
| `backend/routes` | HTTP parsing, auth checks, status codes | Domain rules | `backend/routes/forecasts.js`, `backend/routes/alerts.js` |
| `backend/alerts` | Alert lifecycle, policy, assessment, digest, fan-out, reporting | Forecast storage | `backend/alerts/lifecycle.js`, `backend/alerts/policy.js`, `backend/alerts/notify.js` |
| `backend/services` | Advisory generation, alert engine orchestration, local knowledge | HTTP concerns | `backend/services/advisoryAgent.js`, `backend/services/alertEngine.js` |
| `backend/utils` | Reusable helpers: CSV, freshness, glide resolver, client-safe errors, open-meteo, prediction lookup | Route registration | `backend/utils/clientError.js`, `backend/utils/glideResolver.js` |
| `backend/forecastStore.js`, `backend/forecastPersistence.js` | Forecast persistence + the single read/write access layer | Presentation | `backend/forecastStore.js` |
| `api/` + `serverless/` | Vercel edge routing and per-endpoint handlers | Duplicate domain logic (they delegate to `backend/`) | `serverless/dispatch.js`, `serverless/v1/forecasts/bulk.js` |
| `scripts/` | Ingestion, snapshot building, QA harnesses, CI gates | Runtime request handling | `scripts/process_advisory_ingest.mjs`, `scripts/check-vercel-functions.mjs` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| **Singleton store with reset hook** | `backend/forecastStore.js` (`getForecastStore` / `resetForecastStore`), `backend/alerts/store.js` (`resetAlertStore`) | One access layer per aggregate; the reset hook keeps suites isolated |
| **Pure state machine returning a result object** | `backend/alerts/lifecycle.js` (`evaluateTransition` → `{ok, code, status, body}`) | Keeps HTTP layer "boring" and the transition rules unit-testable |
| **Dispatcher factory with lazy handler table** | `serverless/dispatch.js` `createDispatcher(...)`; used by all 6 `api/*` entry points | Fault isolation between endpoints + smaller cold-start import graph, under the 12-function cap |
| **Barrel exports** | `packages/core/src/index.ts`, `packages/design-system/src/index.ts`, `frontend/src/design-system/index.ts` | Stable public surface per package |
| **Graceful-degradation fallback chain** | `frontend/src/hooks/useForecasts.ts`, `backend/forecastStore.js` | Site must never blank when Firestore quota/outage or the API is unreachable |
| **Defensive enrichment / back-fill** | `backend/forecastStore.js` `ensureAdvisoryFields()` | Older snapshots and un-enriched records still render with correct tiers and coordinates |
| **Client-safe error boundary** | `backend/utils/clientError.js` (4xx pass through, 5xx generic + server-side log) | Information-disclosure fix (SEC-13) recorded in the file header |
| **Single source of truth for a cross-cutting policy** | `backend/security/csp.js` consumed by `backend/server.js` | Prevents the self-host and Vercel CSP definitions drifting apart |
| **Schema-first validation with Zod `.passthrough()`** | `packages/api/src/endpoints.ts`, `packages/core/src/contracts.ts` | Tolerates server fields the client does not yet know without rejecting real responses |
| **Config assertions at boot, non-fatal in dev** | `backend/server.js` `assertEnvironment()` | Loud early misconfiguration signals instead of silent runtime failures |
| **Conditional port binding** | `backend/server.js` `invokedAsScript` check | Lets supertest import the app without `EADDRINUSE` |

### 5) Known Architectural Risks

- **Two API implementations must stay in lockstep.** The Express app and the Vercel dispatcher both serve the same URLs; nothing structurally prevents drift between them beyond tests (`__tests__/api/serverlessRouting.test.js`, `__tests__/cors.test.js`, `__tests__/api/serverlessGuard.test.js`).
- **The 12-function Vercel budget is a hard platform limit** that fails at *deploy* time, not build time. Adding a 7th file under `api/` without the dispatcher pattern would be rejected by Vercel; the gate `scripts/check-vercel-functions.mjs` is the only guard.
- **Fallback chain can mask total data loss.** API → snapshot → static baseline means a stale or empty Firestore can still render a plausible-looking site; the freshness badge and the 36-hour staleness guard are the compensating controls.
- **Model artifacts live in the repository** while the publication policy declares them out of scope for the published surface. Correctness depends on the explicit 404 routes in `backend/server.js` and on `firebase.json`/`vercel.json` never exposing `Models/`.
- **`packages/core/package.json` declares export subpaths that do not exist.** The package `exports` map advertises `./alerts` → `./src/alertLayer.ts`, `./i18n` → `./src/i18n.ts` and `./bandwidth` → `./src/bandwidth.ts`; none of those three files exists in `packages/core/src/` (the same-named modules live in `frontend/src/lib/`). Conversely, `apps/mobile/src/lib/notifications/notifyAlert.ts` imports `@hazardnet/core/notificationMatcher`, which the export map does not declare. Today nothing breaks only because every consumer resolves the package through a bundler/Jest/TS alias that points at `packages/core/src/*` and bypasses Node's `exports` resolution (`frontend/tsconfig.json`, `frontend/vite.config.ts`, `jest.config.cjs`, `apps/mobile/jest.config.cjs`); a strict ESM consumer (Node, Metro with exports enabled) would fail to resolve these specifiers.
- **Two documents the workflow depends on are stale or missing.** `docs/ENVIRONMENT_SECRETS.md` §0 tells the reader to `cp .env.example .env`, but no `.env.example` is tracked or present, and `.gitignore` line 47 (`.env.*`) still matches it while the line-2 `!.env.example` negation does not — so a restored file would be silently un-addable. Also, the ESLint ignore list no longer carries `app/**` (the `app/` directory itself is gone — verified absent from the working tree), yet older prose in this file previously described it as a live scaffold.
- **The daily pipeline's research-private stage is external** (Kaggle notebook). The repository can validate and publish, but cannot reproduce the numbers it publishes — an intentional constraint that also means ingestion is only as correct as the external CSV contract in `docs/TRD.md` §2.1.

### 6) Evidence

- `backend/server.js` (Express composition, middleware order, port binding, model-artifact guards)
- `frontend/src/hooks/useForecasts.ts`, `frontend/src/lib/forecasts.ts` (client fetch + fallback chain)
- `backend/forecastStore.js`, `backend/db.js`, `backend/forecastPersistence.js` (store layer)
- `backend/alerts/lifecycle.js`, `backend/alerts/service.js`, `backend/alerts/notify.js` (alert flow)
- `serverless/dispatch.js`, `api/[endpoint].js`, `serverless/v1/forecasts/bulk.js` (serverless edge)
- `packages/core/src/index.ts`, `packages/api/src/endpoints.ts` (shared domain + client)
- `scripts/process_advisory_ingest.mjs`, `scripts/validate_advisory_csv.mjs` (ingestion)
- `.github/workflows/daily_advisory_ingest.yml` (pipeline orchestration)
- `docs/TRD.md` §2 (pipeline architecture and CSV contract), `docs/PUBLICATION_POLICY.md`
- `backend/security/csp.js`, `Models/VERSION.json` (cross-deployment CSP parity; model-version handshake)
- `packages/core/package.json` (`exports` map) vs `packages/core/src/` (files) — the three unresolved subpaths; `apps/mobile/src/lib/notifications/notifyAlert.ts` (undeclared subpath import)
