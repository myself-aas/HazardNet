# External Integrations

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

### 1) Integration Inventory

Criticality below means dependency of that code path, not a verified operational SLA.

| System | Type | Purpose | Auth model | Criticality | Evidence |
|---|---|---|---|---|---|
| Firebase / Firestore | DB + identity | Forecasts, profiles, assessments, alerts, browser identity | Client app config + Firebase user tokens; Admin SDK verifies ID tokens | High for mutable/user features; snapshots support forecast browsing | `backend/db.js`, `backend/middleware/firebaseAuth.js`, `frontend/src/context/AuthContext.tsx`, `firestore.rules` |
| Kaggle | Artifact/notebook API | Scheduled forecast output retrieval and dataset metadata | Workflow secrets / Kaggle credentials | High for freshness | `.github/workflows/daily_forecast.yml`, `scripts/fetch_kaggle_forecast.py`, `scripts/fetch_kaggle_dataset_meta.py` |
| GitHub Actions / Releases | Automation/artifact hosting | Publish forecasts, intake models, health checks, downloadable releases | Workflow permissions/secrets | High for publication | `.github/workflows/`, `frontend/src/lib/downloadChannels.ts` |
| Open-Meteo | HTTP weather API | Point and batch weather, forecast drivers | Public endpoint in weather proxy | High for live weather; separate forecast snapshot remains readable | `backend/utils/openMeteo.js`, `backend/routes/weather.js` |
| Google Earth Engine | Scientific acquisition | Satellite/climate tensor data in legacy inference workflow/code | External EE credentials/config | Batch-path specific, not browser prerequisite | `scripts/auto_forecast.py`, `scripts/requirements-inference.txt` |
| Gemini → OpenRouter → Groq → HuggingFace | LLM APIs | RAG-grounded advisory cascade | Server-side provider API keys | Optional; deterministic fallback exists | `backend/utils/ai_fallback_engine.js`, `.env.example` |
| BulkSMSBD / GreenWeb | SMS gateways | Alert digests | Provider keys, sender ID | Optional delivery channels | `backend/alerts/channels/sms.js` |
| Telegram | Bot API | Alert digests | Bot token/chat destination | Optional delivery channel | `backend/alerts/channels/telegram.js` |
| Web Push | Browser push | Subscriptions and broadcasts | VAPID keys, protected broadcast API | Optional | `backend/routes/push.js`, `backend/utils/vapid.js` |
| Map tile services | Raster HTTP | Leaflet map backgrounds | Provider-dependent; inspect map layer URLs | Optional to text/table access | `frontend/src/hooks/useLeafletMap.ts`, `frontend/src/components/LiveMapView.tsx` |
| Vercel | Hosting / analytics | Static build, serverless functions, optional analytics loader | Platform settings; frontend analytics gate | Primary declared hosting | `vercel.json`, `frontend/src/lib/vercelAnalytics.ts`, `frontend/vite.config.ts` |
| Prometheus / Grafana | Monitoring | Request/inference/freshness metrics and dashboards | Deployment-specific [TODO] | Operational | `backend/metrics.js`, `api/metrics.js`, `monitoring/` |

No queue service dependency or general message broker was found in the manifests. GitHub workflows, service-worker background work and notification orchestration should not be described as a durable queue service.

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|---|---|---|---|---|
| Firestore | Application persistence | Dedicated Admin SDK forecast writer; client SDK for other backend operations and UI | Forecast writer requires server credentials; owner-restricted alert rules remain a separate issue | `backend/db.js`, `backend/forecastStore.js`, `backend/alerts/store.js`, `firestore.rules` |
| Committed JSON/CSV snapshots | Forecast fallback and reproducible public artifacts | Filesystem/server memory + browser fetch | Can remain stale until republished; history fallback contains only loaded rows | `backend/forecastStore.js`, `frontend/src/lib/forecasts.ts` |
| Process Maps/caches | Weather, predictions, AI response/circuit state | Module-local maps | Not shared across instances or durable through restarts | `backend/utils/openMeteo.js`, `ai_fallback_engine.js` |
| Browser offline storage | Cached app/data and tiles | Service worker and tile cache service | Offline data must remain labelled and aged | `frontend/public/serviceWorker.js`, `frontend/src/serviceWorker.ts`, `frontend/src/services/tileCacheService.ts` |
| Optional PostgreSQL/PostGIS | Self-host spatial/analytics modules and SQL reference schemas | ETL modules / SQL scripts | Not the active runtime forecast backend | `scripts/db/README.md`, `scripts/etl/db.py`, `scripts/db/008_hazard_events_postgis.sql` |

### 3) Secrets and Credentials Handling

- Use ignored local `.env`, configured platform variables and GitHub Actions secrets; document names/placeholders only. `VITE_*` values are browser-exposed, not a safe place for private provider keys (`.env.example`, `frontend/vite.config.ts`).
- Forecast persistence uses Application Default Credentials or server-only `FIREBASE_SERVICE_ACCOUNT_JSON`; project/database selection matches the existing applet config (`backend/forecastPersistence.js`).
- `BACKEND_API_KEY` protects pipeline actions. Firebase identity is verified separately; duty-officer privileges are enforced in alert auth (`backend/utils/apiKeyAuth.js`, `backend/utils/alertAuth.js`).
- Secret scanning exists (`scripts/check-secrets.sh`, CI). `.env.example` explicitly records previous credential exposure and a required rotation; no credential values were copied into these docs.
- [TODO] Rotation completion, actual secret configuration, deployed Firestore rules, and service-account permissions were not verified. This review did not run live credential/provider probes.

### 4) Reliability and Failure Behavior

- Forecast store uses 120-second cloud-failure cooldown and committed-memory fallback; forecast write failures are propagated; Admin transactions commit before memory changes (`backend/forecastStore.js`). Cloud reads now have a 2.5-second application deadline before snapshot fallback.
- AI engine has 10-minute response cache, circuit-breaker state, 12-second provider timeout and sequential fallbacks (`ai_fallback_engine.js`). A per-provider bound is not a total request deadline.
- Open-Meteo proxy has a 15-minute cache and batch support. `_fetchUpstream` supplies no abort signal or application timeout (`openMeteo.js`); provider errors become 502-style errors.
- SMS/Telegram transports use configurable timeout defaults of 8 seconds, and SMS supports dry run and per-run budget. Notification orchestration catches individual send errors (`backend/alerts/channels/`, `notify.js`).
- Browser forecasts use live/snapshot/baseline fallback. Firebase token verification has a default 2.5-second bound (`firebaseAuth.js`).

### 5) Observability for Integrations

Express `/metrics` exports prom-client metrics; Vercel `/api/metrics` exposes forecast freshness. Request-ID middleware logs request latency/status. `monitoring/prometheus.yml`, `alerts.yml` and `grafana-dashboard.json` provide monitoring configuration, not proof of a running monitoring deployment.

[TODO] Live dashboards, alert delivery success, provider quotas, and end-to-end trace coverage. The Prometheus self-host target is port 3001 while Express binds 3000; operators must reconcile this before relying on scraping.

### 6) Evidence

- `.env.example`, `.github/workflows/daily_forecast.yml`, `vercel.json`
- `backend/db.js`, `backend/forecastStore.js`, `firestore.rules`, `scripts/db/README.md`
- `backend/utils/ai_fallback_engine.js`, `backend/utils/openMeteo.js`, `backend/alerts/channels/sms.js`
- `backend/metrics.js`, `api/metrics.js`, `monitoring/prometheus.yml`
