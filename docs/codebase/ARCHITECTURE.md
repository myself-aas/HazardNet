# Architecture

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.
**Evidence:** `README.md`, `backend/server.js`, `backend/routes/*.js`, `backend/utils/*.js`, `scripts/fetch_kaggle_forecast.py`, `HazardNet.md`, `vercel.json`, `.github/workflows/daily_forecast.yml`, `frontend/src/App.tsx` (structure inferred from directory layout and routing), `docs/adr/`.

## Core Sections (Required)
## System Diagram (as-built)

### 1) Architectural Style

A batch-produced data application with a React SPA/prerendered public site and two HTTP runtimes: Vercel functions and Express. It combines layer-based frontend/backend code with a feature-oriented alert domain. There is no evidence of a general microservice bus or broker in the inspected manifests/runtime code.

Constraints with file-backed evidence:
- Decision support, not an official warning service (`docs/PRODUCT_SPEC.md` §1).
- Canonical forecast horizons are `7_days` and `15_days` (`backend/utils/forecastRow.js`, `frontend/src/lib/forecasts.ts`); ADM3/new horizons in ADR 0005 are not evidence of live expanded coverage.
- Alerts above WATCH require human review; uncalibrated evidence is constrained by policy (`backend/alerts/assess.js`, `policy.js`, `lifecycle.js`).
- Public copy must respect claims/provenance and research embargo controls (`docs/PUBLIC_SURFACE.md`, `scripts/check-claims.mjs`, `scripts/check-severity-embargo.mjs`).

### 2) System Flow

```text
Kaggle notebook outputs
  -> daily GitHub Actions fetch / canonicalize / validate
  -> committed forecast CSV + website JSON snapshots
  -> deployment

Browser forecast hook -> relative /api/v1/forecasts/bulk
  -> Vercel handler OR Express forecast router
  -> shared query/response helpers -> singleton forecast store
  -> Firestore query OR snapshot-backed memory -> JSON -> district UI
Browser request failure -> committed website snapshot / labelled baseline fallback
```
┌────────────────────────────────────────────────────────────────────────┐
│ 0. DATA & MODEL PRODUCTION (Kaggle, scheduled daily at 00:00 UTC)     │
│   ml/hazardnet-auto-forecast-pipeline.ipynb                           │
│   ┌─────────────────────────────────────────────────────────────┐     │
│   │ GEE: Sentinel-1 (VV/VH) + Sentinel-2/Landsat (4 optical)    │     │
│   │   + ERA5-Land Daily Aggregates (9 meteo bands)              │     │
│   │   → 15-channel × 10-timestep × 64×64 tensor per district    │     │
│   │ Open-Meteo deterministic forecast injected into T-0 bands   │     │
│   │ TFLite FP32 (hazardnet_fp32.tflite copy in Kaggle dataset)  │     │
│   │   → 8-class hazard logits + severity regression             │     │
│   │ Physics cross-check (NDVI/VHI/EHF/SAR ratio/… Open-Meteo)   │     │
│   │ → dual-track hazardnet_advisories_latest.csv                │     │
│   └─────────────────────────────────────────────────────────────┘     │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ kaggle kernels output (CLI)
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. DAILY BRIDGE (GitHub Actions, daily_forecast.yml @ 00:00 UTC)       │
│   scripts/fetch_kaggle_forecast.py (Python)                            │
│   • Downloads kernel output, chooses CSV by name (not glob order)     │
│   • Detects schema (canonical vs advisory)                            │
│   • Translates advisory → canonical rows (district_id/pcode/division  │
│     from last-committed artifact + scripts/etl/districts.py resolver, │
│     prediction_date = target_date − horizon cross-checked)            │
│   • Converts Open-Meteo units (C → K, mm → m, km/h → m/s)            │
│   • Computes SHA-256, writes CSV + typed JSON + manifest.json        │
│   scripts/validate_forecasts.py → freshness + coverage gate           │
│ scripts/build_forecast_snapshot.mjs → frontend/public/data/…          │
│ scripts/build_content_engine.mjs → static /hazards, /districts       │
│ Commits backend/data/forecasts/ and frontend/public/data/            │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ (commit) or Firestore (via POST /api/ingest)
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. STORAGE LAYER                                                       │
│   Primary (ADR 0014): Google Firestore (firebase-admin, @google-cloud/│
│     firestore). Transactional writes, RLS via firestore.rules.        │
│   Committed fallback: backend/data/forecasts/*.{csv,json,manifest}    │
│     shipped in the repo so every deploy carries the latest forecast   │
│     even if the API is unreachable.                                    │
│   Historical: Firestore history collection + GitHub Release artifacts │
│     (weekly CSV attached to vX.Y.Z tags).                             │
│   (PostgreSQL migrations exist in scripts/db/ but are superseded.)   │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ REST / serverless
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. BACKEND / API (Express on Node 20 or Vercel Serverless Functions)   │
│   Middleware stack:                                                    │
│     Helmet (CSP enforce/report-only by env) → requestId → cors →      │
│     express.json → apiLimiter → route → error handler                 │
│   Tiered rate limits: apiLimiter (global /api), predictLimiter        │
│     (/api/predict), alertLimiter (/api/v1/alerts), dynamicAiLimiter   │
│     (/api/chat, /api/agent).                                           │
│   Key routes (see STRUCTURE.md for full list):                        │
│     GET  /api/v1/forecasts            — latest per district/horizon   │
│     GET  /api/v1/forecasts/bulk       — heatmap matrix                │
│     GET  /api/v1/forecasts/history    — date-range query + CSV export │
│     POST /api/predict                 — serves LATEST STORED result   │
│                                         (ADR 0009 single inference    │
│                                          path — does NOT run CNN)     │
│     POST /api/ingest                  — authenticated CSV upsert      │
│     GET  /api/v1/alerts, POST …/run   — Alert engine + human gate     │
│     POST /api/chat, /api/agent        — Gemini 2.0 + RAG; falls back │
│                                         to deterministic advisory     │
│     GET  /metrics                     — Prometheus (forecast-age …)   │
│   Static: serves frontend/dist with SPA fallback; blocks /Models/*    │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ REST + RTK Query / fetch
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. FRONTEND (React 18 + TypeScript + Vite, static build)              │
│   • /                 editorial front door (read from artifacts)      │
│   • /live (legacy /home*, /forecast/overview) interactive map console │
│   • /alerts, /alerts/:id  alert surface (English/Bengali, printable)  │
│   • /district/:id         per-district forecast + alert               │
│   • /hazards/*, /districts/*  build-time prerendered content pages    │
│   • /dashboard, /u/:username  Firebase Auth user dashboards           │
│   • Offline: service worker caches assets + forecast snapshot         │
│   • Low-bandwidth mode: swaps raster tiles → vector, drops animations│
│   • Auth: Firebase Auth (email+password w/ verify, Google, GitHub)   │
│   • Data source precedence: live API → committed snapshot → SW cache │
│     (each surface states which it is rendering)                      │
└────────────────────────────────────────────────────────────────────────┘
```

1. `.github/workflows/daily_forecast.yml` retrieves notebook outputs via `scripts/fetch_kaggle_forecast.py`; `scripts/validate_forecasts.py` checks data contracts and freshness. The daily workflow is a publisher, not proof that GitHub currently computes the CNN (`docs/adr/0013-kaggle-is-the-forecast-producer.md`).
2. `scripts/build_forecast_snapshot.mjs` produces the browser snapshot. Retraining/model intake has separate notebook/workflow entry points, notably `ml/HazardNet_auto_train.ipynb` and `.github/workflows/model_intake.yml`.
3. `frontend/src/hooks/useForecasts.ts` and `frontend/src/lib/forecasts.ts` request live data and support degraded sources. Metadata fallback tries metadata, bulk, then snapshot; it aims to retain producer dates instead of client timestamps.
4. `api/v1/forecasts/bulk.js` or `backend/routes/forecasts.js` validates supported horizons and uses `backend/utils/forecastServe.js` / `backend/forecastStore.js`.
5. The store queries Firestore, deduplicates newest rows per district in memory, and falls back to a snapshot when cloud data is unavailable/empty. Errors trigger a 120-second cooldown. Forecast writes now use a dedicated Admin SDK transaction and update memory only after commit. Cloud failure rejects ingestion (ADR 0014).
6. UI merges forecast data with district identity/baselines (`frontend/src/lib/forecasts.ts`). Offline support registers `/serviceWorker.js` in `frontend/src/main.tsx`; offline access is not browser CNN execution.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not be mistaken for | Evidence |
|---|---|---|---|
| SPA + prerender | Pages, routing, auth UI, maps, data-source labels | Pipeline/science runtime | `frontend/src/App.tsx`, `frontend/scripts/prerender.mjs` |
| HTTP adapters | Parsing, middleware, HTTP status/headers | A guarantee of endpoint parity across all runtimes | `backend/server.js`, `api/` |
| Forecast store | Firestore and snapshot reads, forecast writes | Memory-only write acknowledgement (no longer supported) | `backend/forecastStore.js` |
| Alert domain | Assess → lifecycle/review → store → delivery orchestration | Official government warnings | `backend/alerts/service.js`, `assess.js`, `lifecycle.js`, `notify.js` |
| RAG + AI cascade | Local retrieval, bounded prompt construction, provider selection/fallback | Measured scientific forecast skill | `rag_pipeline/index.js`, `backend/utils/chatService.js`, `ai_fallback_engine.js` |
| Scientific pipeline | Notebook/batch processing and evaluation artifacts | Inline HTTP inference (retired) | `ml/`, `training/hazardnet_scientific_pipeline.py`, `backend/utils/storedPrediction.js` |

### 4) Reused Patterns

| Pattern | Where found | Observable purpose |
|---|---|---|
| Shared service + thin transport adapters | `forecastServe.js`, `chatService.js`, `api/chat/query.js` | Reuse behavior between Express and Vercel |
| Lazy singleton store / module caches | `backend/forecastStore.js`, `backend/alerts/store.js` | Reuse resources within one process; reset hooks enable testing |
| Fallback chain / circuit breaker | `forecastStore.js`, `ai_fallback_engine.js` | Degrade after upstream failure; not distributed coordination |
| Event-log reconstruction | `backend/alerts/store.js`, `lifecycle.js` | Preserve review history and reconstruct alert state; not proof of transactional append safety |
| Dependency injection for tests | `backend/alerts/notify.js` (`fetchImpl`, `env`, `now`) | Exercise transports without sending messages |
| Build-time artifacts | `scripts/build_content_engine.mjs`, `frontend/scripts/prerender.mjs` | Publish static, provenance-bearing pages and data |

Startup: Express loads dotenv, configuration checks, security/request-ID/CORS/JSON middleware, then API routes, metrics, static files and non-API SPA fallback. It listens only on direct invocation, allowing Supertest imports without a port. Firebase initialization occurs in imported modules (`backend/db.js`, `backend/middleware/firebaseAuth.js`); server configuration warnings are nonfatal.

### 5) Known Architectural Risks

- `POST /api/predict` now reads stored rows in Express and Vercel. No request-time inference executes; missing fields stay null (`storedPrediction.js`, `predictFromStore.js`).
- Forecast writes use a dedicated Admin SDK writer; credentials must be provisioned and staging-tested. Alert engine records still use the client SDK and encounter owner-scoped rules; this separate risk remains.

- Read fallback, caches and rate-limit state are process-local. Write acknowledgements now require a cloud commit; live cloud behavior still needs staging verification.
- Independent deployment/config entry points can drift; the Vite/Express port mismatch is a concrete example.

### 6) Evidence

- `backend/server.js`, `backend/routes/forecasts.js`, `api/v1/forecasts/bulk.js`
- `backend/forecastStore.js`, `backend/db.js`, `firestore.rules`
- `backend/routes/predict.js`, `backend/forecastPersistence.js`, `backend/utils/predictFromStore.js`
- `frontend/src/lib/forecasts.ts`, `backend/alerts/service.js`, `.github/workflows/daily_forecast.yml`
## Data Flow — Forecast Read Path (happy path)
1. Client issues `POST /api/predict` with `{district_id, horizon}`.
2. `backend/routes/predict.js` → `serveStoredPrediction` (in `utils/storedPrediction.js`).
3. `predictFromStore.js` looks up the latest committed or Firestore row for that district/horizon.
4. `forecastServe.js` shapes the canonical row into the API response: hazard class, model severity, physics severity, confidence (raw or calibrated), confidence bin (Certain/Probable/Uncertain), meteorological drivers, divergence, provenance fields.
5. Client renders severity gauges, hazard card, dual-track bars, and (optionally) advisory text — labels scores as uncalibrated per MODEL_CARD §6.

## Data Flow — Daily Production
1. `daily_forecast.yml` runs at 00:00 UTC:
   1. `pip install kaggle`, `kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline`
   2. `python3 scripts/fetch_kaggle_forecast.py` — writes canonical CSV/JSON/manifest, prints CHANGED={true|false}.
   3. `python3 scripts/validate_forecasts.py` — gate on freshness (prediction_date within 26h) and coverage (64 districts × horizons).
   4. If CHANGED: `node scripts/build_forecast_snapshot.mjs`, `node scripts/build_content_engine.mjs`, commit and push back to the branch (via `GITHUB_TOKEN`).
2. Vercel auto-deploys on push; serverless functions see the new snapshot committed to `backend/data/forecasts/`.
3. For Firestore-backed installs, the weekly workflow additionally runs `node scripts/ingest_forecast_csv.mjs` against the deployed `/api/ingest` (BACKEND_API_KEY header).

## Architectural Patterns

- **Stored-forecast, not runtime inference.** The CNN never runs in the web app or Vercel function. `POST /api/predict` is a lookup keyed by (district_id, horizon), not a forward pass (ADR 0009). This is the single most important architectural fact about the running system.
- **Dual-track severity.** Every row carries `model_severity` (CNN output) and `physics_severity` (Open-Meteo formula proxy), plus optional per-class physics scores. Divergence is exposed to users as a reliability cue.
- **Canonical row contract.** `backend/utils/forecastRow.js::parseCsvForecastRow` is the single ingress parser; all forecast data (CSV ingest, snapshot, API responses) flows through it or its Python mirror in `fetch_kaggle_forecast.py`.
- **Fail-closed security.** Missing BACKEND_API_KEY returns 503 on ingest; missing FRONTEND_ORIGIN in production rejects CORS; CSP is enforcing in production; `/Models/*` always returns 404.
- **Graceful degradation.** If GEMINI_API_KEY is unset, the chat/agent routes fall back to `backend/utils/ai_fallback_engine.js` (deterministic heuristics). If Firestore is unreachable, the API reads the committed JSON snapshot. If the network drops, the service worker serves the last snapshot and surfaces the "offline" badge.
- **Human-in-the-loop alerts.** The alert engine (`backend/alerts/`) will auto-publish nothing above WATCH; WARNING/SEVERE require a named duty officer to approve/reject via `/api/v1/alerts/review`. Rejections are stored as evaluation labels.
- **Design system as code.** NASA Horizon Design System tokens are vendored (`data/design/nasa-hds/tokens.json`), imported via `scripts/import_nasa_tokens.mjs` into generated CSS, and mapped to HDS-consistent semantic tokens; design audits (`scripts/check-design-quality.mjs`, `impeccable`) enforce the rules.
- **Content engine at build time.** `/hazards` and `/districts` pages are composed at build by `scripts/build_content_engine.mjs` from the committed snapshot, prerendered to static HTML with canonical URLs, breadcrumbs, and JSON-LD.
- **MLOps registry.** `scripts/mlops/registry.py` versions model bundles; `drift.py` compares the notebook-pulled `normalization_stats.json` against the shipped model's; `calibration.py` produces probability maps (Platt/isotonic) when ground-truth labels exist; `retrain_state.py` gates monthly retraining.

## Layers & Module Boundaries
- **API layer (`api/`, `backend/routes/`)** — HTTP concerns only; calls into utils/services.
- **Service / domain layer (`backend/services/`, `backend/alerts/`, `backend/utils/`)** — Business logic (severity binning, physics formulae, alert policy, chat orchestration).
- **Persistence layer (`backend/forecastStore.js`, `backend/forecastPersistence.js`, `backend/db.js`)** — Firestore access; transactional writes; committed-JSON fallback reader.
- **Middleware (`backend/middleware/`)** — Cross-cutting: auth, CORS, rate limits, request IDs, security headers, serverless guards.
- **Frontend layers:** `pages/` (routes) → `components/` (UI) → `hooks/` + `services/` (data) → `lib/` + `utils/` (domain/formatting) → `data/` (static GIS, content).

## Key Cross-Cutting Concerns
- **Correlation IDs** (`requestId.js`) propagate via `X-Request-Id`.
- **Prometheus metrics** (`metrics.js`) — forecast age gauge (scrape-driven, 60s cache), request counters.
- **Structured logging** (root `utils/logger.js`, `scripts/etl` Python logger).
- **Rate limits** tiered by cost class.
- **CSP** centrally defined in `backend/security/csp.js` and mirrored in `vercel.json` (Phase 6 parity fix).
