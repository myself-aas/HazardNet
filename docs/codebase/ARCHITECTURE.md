# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: Layered Monorepo with Dual-Track Deployment (Vercel Serverless + Self-Hosted Express) and Offline-First Fallbacks.
- Why this classification:
  - The repository maintains clear separation between presentation (`frontend/`), serverless edge endpoints (`api/`), stateful self-hosted backend (`backend/`), and shared cross-platform packages (`packages/core`, `packages/design-system`, `packages/api`).
  - Read traffic operates on a dual-track strategy: live requests query Firestore via API routes, with graceful degradation to committed static JSON snapshots if the backend or Firestore is unavailable.
- Primary constraints:
  1. Publication Boundary Policy (`docs/PUBLICATION_POLICY.md`): Research models, internal dataset builders, and raw neural weights remain research-private. Only forecast outputs, advisory classifications, confidence metrics, and verification scorecards may be published on public surfaces.
  2. Human-In-The-Loop (HITL) Alerting (`docs/PRD.md §3.1 REQ-002`, `docs/SECURITY.md §4.4`): Daily batch forecasts generate automated advisory tiers, but official public alert records require manual human review and state machine authorization (`DRAFT → PENDING_REVIEW → PUBLISHED`).
  3. Graceful Offline Degradation (ADR 0008, `TRD.md §2`, `ci.yml:343`): Public frontends must continue to render historical and forecast outlooks from bundled static snapshots (`forecasts-latest.json`) even if API connectivity is severed.

### 2) System Flow

```text
[Daily Kaggle Output / External Weather] 
  -> [Schema Validation & Column Mapping] 
  -> [Atomic Firestore Ingestion & Snapshot Generation] 
  -> [Express / Vercel API Read Layer with Rate Limiting] 
  -> [React Frontend Hydration & Leaflet Map / Alert Rendering]
```

Step-by-step description with file-backed evidence:
1. Pipeline Trigger & Data Fetch: Scheduled Kaggle notebook `8-hazardnet-advisory` outputs `hazardnet_advisories_latest.csv` (128 records: 64 districts × 2 forecast horizons). GitHub Actions fetches the output (`docs/PRD.md §4.1`, `.github/workflows/daily_advisory_ingest.yml`).
2. Schema & Staleness Verification: Ingestion script validates that exactly 22 columns are present, row count equals 128, and data timestamp is within 36 hours (`scripts/validate_advisory_csv.mjs`, `docs/TRD.md §4.1`).
3. Mapping & Persistence: Advisory CSV columns are mapped to the backend `ForecastRow` schema (`backend/utils/advisoryMapper.js`). The records are written atomically to Google Cloud Firestore (`backend/forecastStore.js`) and compiled into a static JSON artifact (`scripts/build_forecast_snapshot.mjs` -> `frontend/public/data/forecasts-latest.json`).
4. API Layer & Security Controls: Backend (`backend/routes/forecasts.js`) and serverless edge functions (`api/v1/forecasts/bulk.js`) serve forecast data with strict CSP, CORS fail-closed checks, and IP rate limiters (`backend/middleware/rateLimit.js`, `backend/security/csp.js`).
5. Client Hydration & Display: React frontend fetches forecasts via TanStack Query (`frontend/src/services/forecastApi.ts`). If the API request times out or returns an error, the client falls back to the committed snapshot. The data is rendered through the interactive Leaflet choropleth map (`frontend/src/components/LiveMapView.tsx`) and district cards (`frontend/src/components/DistrictDetailPanel.tsx`).

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `frontend/src/` | Client-side routing, user interaction, Leaflet geospatial visualization, Recharts graphs, and theme state. | Direct database operations, server environment secrets, or arbitrary alert state modifications. | `frontend/src/App.tsx`, `frontend/src/components/LiveMapView.tsx` |
| `backend/routes/` | HTTP request handling, input sanitization, rate-limit assignment, and calling persistence stores. | Direct UI rendering or exposing internal filesystem paths. | `backend/routes/forecasts.js`, `backend/routes/alerts.js` |
| `backend/forecastStore.js` | Reading/writing forecast records to Firestore, cache invalidation, and freshness gauge calculation. | Business advisory policy rules or HTTP response status formatting. | `backend/forecastStore.js:1-200` |
| `packages/core/` | Zod schemas, data contracts (`ForecastRow`, `AlertRecord`), error definitions, and validation helpers. | React hooks, DOM manipulation, or Node.js filesystem I/O. | `packages/core/src/forecasts.ts` |
| `scripts/` | Build-time prerendering, static snapshot generation, secret scanning, and pipeline validation. | Serving runtime client traffic. | `scripts/build_forecast_snapshot.mjs`, `scripts/build_content_engine.mjs` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Static Snapshot Fallback (ADR 0008) | `frontend/src/services/forecastApi.ts`, `frontend/src/hooks/useForecastData.ts` | Guarantees public availability and offline capability if Firestore or API is down or degraded. |
| Multi-Tier Rate Limiting | `backend/middleware/rateLimit.js`, `backend/server.js:120-132` | Prevents denial-of-service on public endpoints while applying stricter limits on compute-heavy AI/inference routes. |
| Correlated Request Logging | `backend/middleware/requestId.js` | Attaches a unique UUID `X-Request-Id` to every inbound request for traceability across middleware and route handlers. |
| Strict Security Header Enforcement | `backend/security/csp.js`, `backend/middleware/securityHeaders.js` | Prevents cross-site scripting (XSS) and clickjacking by disallowing inline scripts and frame embeddings. |
| Code-Splitting with Lazy Boundaries | `frontend/src/App.tsx:26-61` | Minimizes initial bundle load time for mobile and low-bandwidth users by deferring heavy visual modules. |

### 5) Known Architectural Risks

- Split API Architectures (Drift Risk): API endpoints exist both as serverless handlers in `api/` and as Express routes in `backend/routes/`. A change to business logic or schema in one may not automatically reflect in the other unless covered by shared tests.
- High Git Churn on Machine-Generated Files: Automated workflows commit probe results (`data/site-health/latest.json`) and data snapshots directly to the repository branch, creating high commit churn (`docs/codebase/.codebase-scan.txt:421-424`).
- Memory Constraints on Model Directories: The inclusion of heavy binary assets (e.g. `master_tensors.h5` ~2.4GB in `manuscript/`) poses cloning and storage overhead if not kept separate from core web production pipelines.

### 6) Evidence

- `backend/server.js` (Express application architecture and routing)
- `backend/forecastStore.js` (Firestore data store adapter)
- `backend/security/csp.js` (Centralized CSP policy)
- `frontend/src/services/forecastApi.ts` (Client-side API and fallback strategy)
- `frontend/src/App.tsx` (Lazy-loaded client architecture)
- `docs/PRD.md §4` (Daily pipeline architectural specification)
- `docs/TRD.md §2` (Technical ingestion and data schema contracts)
