# Architecture

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

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
