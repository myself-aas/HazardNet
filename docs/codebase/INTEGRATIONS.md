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
# Integrations

**Evidence:** `package.json` dependencies, `backend/server.js`, `backend/utils/openMeteo.js`, `backend/middleware/firebaseAuth.js`, `scripts/fetch_kaggle_forecast.py`, `.env.example`, `firebase.json`, `firestore.rules`, `vercel.json`, `backend/alerts/channels/{sms,telegram}.js`, `scripts/etl/sources.py`, `rag_pipeline/search.js`, `HazardNet.md`.

## External APIs & Data Sources

| Integration | Purpose | Credentials | Code entry point |
|-------------|---------|-------------|------------------|
| **Google Earth Engine** (Sentinel-1 GRD, Sentinel-2 SR Harmonized, Landsat 5/7/8, ERA5-Land Daily Aggregates) | Historical raster tensors (15 channels × 10 timesteps × 64×64 @ 10m) | GEE service account `hazardnet-ee-service-kaggle@hazardnet-aas48424.iam.gserviceaccount.com`; JSON key via Kaggle dataset | `HazardNet.md` Phases 1/7 (GEE pipeline runs inside Kaggle kernels, NOT in this repo) |
| **Open-Meteo** `api.open-meteo.com/v1/forecast`, `archive-api.open-meteo.com/v1/archive` | Deterministic forecast drivers injected into T-0 climate bands; archive for fallback physics scores; weather proxy route | None (public API, rate-limited 0.5s/request in training code) | `backend/utils/openMeteo.js` (Express), `HazardNet.md` Phase 2/7 `om_calc_*` functions |
| **Kaggle API** (`kaggle kernels output`) | Pull daily forecast CSV from the scheduled producer notebook | `KAGGLE_USERNAME` + `KAGGLE_KEY` in GitHub Actions secrets | `scripts/fetch_kaggle_forecast.py` |
| **Google Gemini 2.0** (`@google/genai`) | Chat/advisory agent natural-language answers | `GEMINI_API_KEY` (backup: `GEMINI_API_KEY_BACKUP`, fallbacks: OpenRouter, Groq, HuggingFace) | `backend/utils/chatService.js`, `backend/services/advisoryAgent.js`; fallback: `backend/utils/ai_fallback_engine.js` |
| **Firebase Auth** (`firebase`, `firebase-admin`) | Email/password (+ verify), Google, GitHub sign-in; ID-token verification for protected routes | `VITE_FIREBASE_*` (public) + `FIREBASE_SERVICE_ACCOUNT_JSON` (server) | `backend/middleware/firebaseAuth.js`, `frontend/src/context/AuthContext` (inferred) |
| **Cloud Firestore** (`@google-cloud/firestore`) | Forecast rows, user dashboards (~40 profile fields), alerts, blog articles; transactional writes | Application Default Credentials / service account JSON | `backend/db.js`, `backend/forecastStore.js`, `backend/forecastPersistence.js`, `backend/alerts/store.js` |
| **Firebase Realtime Database** (legacy) | Referenced from `.env.example` `DATABASE_URL` but Firestore is current per ADR 0014 | `VITE_FIREBASE_DATABASE_URL` | Legacy; no active reader observed in sampled code |
| **Firebase Storage** | Avatar uploads (client-side resize/replace) | `VITE_FIREBASE_STORAGE_BUCKET` | User dashboard (frontend) |
| **VAPID Web Push** (`web-push`) | Browser push for alerts/updates | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (server-only) | `backend/routes/push.js`, `backend/utils/vapid.js` |
| **BulkSMS BD / GreenWeb** | SMS delivery for Bengali/English alerts (UCS-2 for Bengali) | `BULKSMSBD_API_KEY` / `GREENWEB_API_KEY`, `SMS_SENDER_ID`; dry-run mode | `backend/alerts/channels/sms.js` |
| **Telegram Bot API** | Telegram alert channel | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` | `backend/alerts/channels/telegram.js` |
| **Mapbox GL** | [TODO] README mentions Mapbox GL but `frontend/package.json` lists `leaflet` with no `mapbox-gl` dependency — the live map uses Leaflet. Confirm whether Mapbox tiles are still used as a raster source. | `VITE_MAPBOX_TOKEN` mentioned in README (does not appear in `.env.example` or frontend code sampled) | [TODO] see CONCERNS.md |
| **Vercel Analytics** | Privacy-friendly analytics | `VITE_VERCEL_ANALYTICS` (public) | `frontend` (imported in app root) |
| **Google AdSense** | Monetization (blog/article pages) | `VITE_ADSENSE_CLIENT`, slot IDs | Rendered ad slots; CSP in `vercel.json` explicitly allows AdSense script sources |
| **Prometheus** | Metrics scraping (internal ops, not third-party) | Scraped at `/metrics` | `backend/metrics.js` |
| **GitHub** (OAuth sign-in + Releases + Actions) | OAuth login; weekly artifact release attachment; CI/CD | `GITHUB_TOKEN` provided by Actions; OAuth via Firebase GitHub provider | `.github/workflows/*.yml`, Releases |

## Internal Services / Subsystems

- **RAG pipeline** (`rag_pipeline/`) — a small JavaScript retrieval system (`search.js`, `skill_router.js`) over Markdown knowledge packs (hazard protocols, agricultural institutions, agronomy, humanitarian partners, skills, hazard archives). The chat service consults it before calling Gemini, and the agent/skill router selects domain-appropriate guidance. Source references live in `references/` and `rag_pipeline/references/`.
- **Alert engine** (`backend/alerts/`) — see `docs/alerts/ALERT_ENGINE.md`. Ladder: NO_ALERT → WATCH → WARNING → SEVERE (PRODUCT_SPEC §1.3). Auto-publish capped at WATCH (configurable via `ALERT_MAX_AUTO_PUBLISH_LEVEL`). Duty-officer allowlist (`ALERT_DUTY_OFFICERS`) gates WARNING/SEVERE publication. Digest schedule and SMS/Telegram delivery are configured via env.
- **Content engine** (`scripts/build_content_engine.mjs`) — at build time, composes `/hazards/<hazard>` and `/districts/<district>` static pages from `frontend/src/content/hazard-methodology.json` and the latest forecast snapshot, with JSON-LD, breadcrumbs, canonical URLs, and sitemap.
- **Design token pipeline** — `data/design/nasa-hds/tokens.json` (vendored from nasa/hds-core, CC0-1.0) → `scripts/import_nasa_tokens.mjs` → `frontend/src/styles/nasa-hds.css` (generated, `--hds-*` names) → `frontend/src/index.css` maps to semantic `--hn-hds-*` and shadcn-compatible layer.
- **ETL** (`scripts/etl/`) — `adapters/bgd_climatic_hazards.py`, `bulletins.py` (BMD), `cog.py` (Cloud-Optimized GeoTIFF STAC), `hydrology.py` (FFWC), `sources.py`, `scene_manifest.py` (Sentinel-2 scenes), `events.py`, `districts.py` (canonical 64-district resolver with GAUL 2015 aliases).
- **MLOps** (`scripts/mlops/`) — `calibration.py`, `drift.py`, `evaluate.py`, `metrics.py`, `registry.py`, `retrain_state.py`, exposed through `cli.py`.
- **Hindcast** (`scripts/hindcast/`) — `episodes.py`, `fetch.py`, `score.py` for historical event re-forecasts; drivers in `data/hindcast/drivers/` (e.g. Cyclone Amphan 2020).

## Databases & Persistence

1. **Cloud Firestore** (primary) — forecasts, alerts, users, blog articles, subscriptions. RLS in `firestore.rules`.
2. **Committed files** in `backend/data/forecasts/*.{csv,json,manifest}` — shipped with every deploy for offline/recovery reads.
3. **GitHub Releases** — weekly forecast CSV + ADM3 matrices attached as artifacts (queryable via `/api/v1/forecasts/history`).
4. **PostgreSQL** — SQL migrations exist in `scripts/db/` (001–008) but ADR 0014 ("Kaggle is the forecast producer, Firestore is the durable store") supersedes the PostgreSQL cutover (ADR 0002). The migrations are retained for blog/RLS and historical context.
5. **HDF5 master tensor store** — `master_tensors.h5` (gzip) used during training/ablation; NOT deployed to production.

## Auth Model

- **Client ↔ API:** Firebase ID tokens sent as `Authorization: Bearer <token>` and verified by `backend/middleware/firebaseAuth.js` (attaching a `req.user`). Public endpoints (forecast reads, published alerts) don't require auth; chat/agent attach the user for rate-limit accounting and per-user quotas; alert review and dashboard endpoints require a verified token with an allowlisted uid/email for duty-officer actions.
- **Service-to-service (ingest):** `X-API-Key: <BACKEND_API_KEY>` validated by `backend/utils/apiKeyAuth.js`. 503 when unset.
- **Signed-out / offline users:** Public forecast surface works fully; personalisation (dashboard, push subscriptions, saved districts) requires sign-in.

## Deployment Targets (from `.github/workflow-templates/`)

- `hazardnet-daemon-cli-linux.yml` — Linux CLI packaging.
- `hazardnet-field-agent-android.yml` — Android field-agent app.
- `hazardnet-gis-workstation-windows.yml` — Windows GIS workstation packaging.
- `hazardnet-npm-package.yml` / `hazardnet-python-package.yml` — Client library publishing.

[TODO] `backend/services/eventsService.js` details and event-store integration were not inspected deeply. `backend/routes/agent.js` exact agent prompt/routing strategy also warrants closer review.
[ASK USER] Confirm whether Mapbox is still used for any tile source in the Leaflet build or whether the README's Mapbox reference is stale.
