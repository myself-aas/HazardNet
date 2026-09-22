# HazardNet — Codebase Knowledge Map

> **Acquired:** 2026-09-22 (UTC) — branch `arena/01a0c7db-hazardnet` from `e82780f`  
> **Method:** repository scan + reading `docs/codebase/{ARCHITECTURE,STRUCTURE,STACK,CONVENTIONS,INTEGRATIONS,TESTING,CONCERNS}.md`, `docs/PRODUCT_SPEC.md`, `docs/PUBLIC_SURFACE.md`, ADRs 0001–0014, `package.json`/`frontend/package.json`, `backend/server.js`, `backend/forecastStore.js`, `frontend/src/lib/forecasts.ts`, `frontend/src/App.tsx`, `api/` handlers, `ml/` and `scripts/`, and the daily-pipeline workflow.  
> **Goal:** one navigable file that lets a new engineer (or agent) answer *“where is X, how does Y flow, what is safe to change?”* without re-scanning the whole tree. It does **not** replace `ARCHITECTURE.md`/`STRUCTURE.md` — it links to them and adds the cross-links discovered on 2026-09-22.

---

## 0) One-paragraph elevator pitch

**HazardNet** is a decision-support (not official-warning) web app that publishes a **7-day and 15-day multi-hazard outlook** for Bangladesh's **64 districts** (ADM2; 507 ADM3 units indexed for the future) across **8 hazard classes** — Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone.  

A **Kaggle notebook** does the heavy science daily (Sentinel-1/2 + ERA5-Land historical window T-9…T-1, Open-Meteo deterministic forecast injected at T-0, TFLite FP32 CNN → CSV). A **GitHub Actions workflow** (`daily_forecast.yml`) *publishes* that CSV: fetch → canonicalize → validate → rebuild snapshots → commit → redeploy. The **Node.js serving layer** (Express locally, Vercel functions in prod) stores/serves forecasts from **Firestore** with a **committed snapshot fallback**; the **React SPA** renders a map, district pages, advisories, alerts, and status/forecast-history surfaces. An **alert engine** (assess → lifecycle → store → notify) and a **RAG + AI cascade** (retrieval → bounded prompt → Gemini → fallbacks) sit beside it.

> Product rule: until a metric has an artifact (calibration curve, POD/FAR/CSI, lead-time proof) the UI must call it a *relative prioritisation signal*, not a probability — enforced by `scripts/check-claims.mjs` + `scripts/check-severity-embargo.mjs`.

---

## 1) System flow — end to end

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. BATCH PRODUCER (Kaggle — not GitHub)                                 │
│    ml/hazardnet-auto-forecast-pipeline.ipynb                            │
│      GEE Sentinel-1/2 + ERA5-Land (T-9..T-1)                             │
│      + Open-Meteo deterministic (T-0 injection)                          │
│      + hazardnet_fp32.tflite (NDHWC) → CSV                               │
│      → /kaggle/working/hazardnet_advisories_latest.csv                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ daily 00:00 UTC (06:00 BST)  .github/workflows/daily_forecast.yml
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. PUBLISHER (GitHub Actions — daily_forecast.yml)                      │
│    scripts/fetch_kaggle_forecast.py   kernel output → canonical CSV/JSON + manifest.json │
│    scripts/validate_forecasts.py      schema / bounds / ≤3-day freshness gate           │
│    scripts/fetch_kaggle_dataset_meta.py  normalization + config drift                   │
│    scripts/build_forecast_snapshot.mjs → frontend/public/data/forecasts-latest.json     │
│    scripts/build_freshness_artifact.mjs → frontend/public/data/freshness.json          │
│    frontend/scripts/prerender.mjs + scripts/build_content_engine.mjs  → static HTML / sitemap│
│    git commit → Vercel redeploys carrying the new snapshot              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ Firestore upsert (when BACKEND_API_KEY set)
                               │ + committed CSV/JSON
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. SERVING LAYER (two runtimes, one shared core)                        │
│    Express:  backend/server.js + backend/routes/*                       │
│    Vercel:   api/**/*.js (thin wrappers)                                │
│    Shared:   backend/forecastStore.js, backend/utils/forecastServe.js,  │
│              backend/utils/forecastRow.js, backend/forecastPersistence.js│
│    Data:     Firestore `forecasts` collection ──fallback──▶ committed snapshot │
│              stale/error → 120s cooldown → snapshot                     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ REST  /api/v1/forecasts/bulk?horizon=7_days
                               │       /api/v1/forecasts/history, /metadata
                               │       /api/predict (stored-forecast read, no live inference)
                               │       /api/v1/alerts/*, /api/chat/query, /api/v1/weather/*
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. FRONTEND (React 18 + Vite + TypeScript + Tailwind + Leaflet)        │
│    frontend/src/hooks/useForecasts.ts  (TanStack Query, 5-min poll)     │
│    frontend/src/lib/forecasts.ts  (parse / merge / ADM3 rollup / bins) │
│    frontend/src/components/*  (LiveMapView, Dashboard, StoredForecastPanel…)│
│    frontend/public/serviceWorker.js  (offline; /serviceWorker.js at root)│
│    Fallback chain: live API → snapshot → static ALL_64_DISTRICTS baseline│
└─────────────────────────────────────────────────────────────────────────┘
```

**Key invariants to keep in mind:**

- **Kaggle produces, Actions publishes** (ADR 0013). `scripts/auto_forecast.py` still runs by hand (~19 min, needs GEE key) but is **off-schedule**; don't add a second scheduled producer.
- Forecast horizons are **authoritatively** `['7_days','15_days']` — see `backend/utils/forecastRow.js::VALID_HORIZONS` and `frontend/src/lib/forecasts.ts::FORECAST_HORIZONS`. ADRs 0005/0006 describe a 507-unit ADM3 future; the current shipped API still serves 64 districts (ADM3 rows are rolled up via `rollupAdm3ToDistricts()` when present).
- `POST /api/predict` is **stored-forecast serving**, not inference (ADR 0009). Missing fields stay `null`; `Models/hazardnet_fp32.tflite` is bundled for reference/offline, not for request-time inference.
- Reads are resilient, writes are durable: reads fall back to snapshot; **writes require an Admin SDK Firestore transaction** (`backend/forecastPersistence.js`) and only update memory **after** commit (ADR 0014). Cloud failure → `503`, not silent success.

---

## 2) Top-level repository map

| Path | What lives there | Start with |
|---|---|---|
| `frontend/` | Sole npm workspace — SPA, prerender, public assets | `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/vite.config.ts` |
| `backend/` | Express runtime — routes, middleware, alert domain, store | `backend/server.js`, `backend/forecastStore.js`, `backend/alerts/service.js` |
| `api/` | Vercel function adapters (thin, call backend/shared) | `api/v1/forecasts/bulk.js`, `api/chat/query.js`, `api/predict.js` |
| `scripts/` | Builders, gates, ingest, ETL, hindcast, MLOps, SQL refs | `scripts/fetch_kaggle_forecast.py`, `scripts/build_forecast_snapshot.mjs`, `scripts/check-claims.mjs` |
| `ml/`, `training/` | Producer + scientific training/eval code | `ml/HazardNet_auto_train.ipynb`, `training/hazardnet_scientific_pipeline.py` |
| `Models/` | Model artifacts + registry + version handshake | `Models/README.md`, `Models/REGISTRY.json`, `Models/VERSION.json`, `Models/hazardnet_fp32.tflite` |
| `data/`, `backend/data/` | Committed datasets + forecast snapshots + site-health | `data/README.md`, `backend/data/forecasts/`, `data/site-health/latest.json` |
| `rag_pipeline/` | Retrieval + knowledge-base builder | `rag_pipeline/index.js`, `rag_pipeline/build_agent_knowledge_base.js`, `rag_pipeline/agent_knowledge_base.json` |
| `docs/` | Product spec, ADRs, audits, ops, science, design, frontend docs | `docs/PRODUCT_SPEC.md`, `docs/codebase/*.md`, `docs/adr/` |
| `__tests__/`, `e2e/`, `load-tests/` | Jest suites, Playwright, k6/bench harnesses | `__tests__/forecastStore.test.js`, `e2e/full-app-qa.spec.ts`, `load-tests/predict.js` |
| `.github/` | CI, daily-forecast publisher, model intake, health, secret scan | `.github/workflows/ci.yml`, `.github/workflows/daily_forecast.yml` |
| `monitoring/` | Prometheus + Grafana config (not proof of deployment) | `monitoring/prometheus.yml`, `docs/monitoring/grafana-dashboard.json` |
| `venv/` | Three tracked interpreter binaries (5.9 MB each) — infra debt, not a portable env | `git ls-files venv` — use `scripts/requirements-*.txt` instead |

> See `docs/codebase/STRUCTURE.md` §1 for the full table and §2 for entry-point enumeration.

---

## 3) Entrypoints — where execution starts

| Concern | Command / file | Notes |
|---|---|---|
| Browser | `frontend/index.html` → `frontend/src/main.tsx` → `frontend/src/App.tsx` | `main.tsx` registers `serviceWorker.js`; `App.tsx` is the route table |
| Local self-host (single process) | `npm start` → `backend/server.js` | Serves `frontend/dist` if built, else SPA fallback; listens on `0.0.0.0:3000` when invoked directly, importable for Supertest |
| Frontend-only dev | `npm --prefix frontend run dev` | Vite on `3000`, proxies `/api`, `/health`, `/metrics` → `3001` — **port mismatch** with Express's `3000` default; prefer `npm run build && npm start` |
| Build | `npm run build` = `npm --prefix frontend run build` + `node scripts/copy-dist.mjs` | Frontend build runs `vite build && node scripts/prerender.mjs`; root copy puts `frontend/dist` → `dist/` |
| Vercel functions | `api/predict.js`, `api/ingest.js`, `api/metrics.js`, `api/v1/forecasts/bulk.js`, `api/v1/forecasts/history.js`, `api/v1/forecasts/metadata.js`, `api/v1/weather/batch.js`, `api/v1/alerts/*`, `api/chat/query.js` | Each is a thin adapter calling shared logic in `backend/` |
| Publisher cron | `.github/workflows/daily_forecast.yml` `schedule: 0 0 * * *` | The only scheduled producer→publisher path |
| Retraining (manual, Colab T4) | `ml/HazardNet_auto_train.ipynb` → `ml/hazardnet-auto-forecast-pipeline.ipynb` | Human-driven, Drive + GitHub token prompt; no workflow auto-triggers it |

---

## 4) Routing — what you can navigate to

### 4.1 SPA route table (`frontend/src/App.tsx`)

Every page except auth is `React.lazy` (code-split). Auth screens are eager.

| Path | Component | Purpose |
|---|---|---|
| `/` | `FrontDoor` | Editorial front door — who, what run, provenance, links to console |
| `/live` (canonical) + `/home`, `/home/overview`, `/forecast/overview` (deep links) | `Dashboard gis fullScreen` | Full-bleed GIS console (Leaflet map) |
| `/forecast/dashboard` → `/analytics/forecast-dashboard` | redirect | Legacy link compat |
| `/forecast/district/:id` | `DistrictDetailPage` | Per-district hazard + severity + confidence + divergence |
| `/forecast/my-districts`, `/forecast/compare`, `/forecast/settings`, `/settings` | `Dashboard` tabs | Saved districts, compare, offline/cache settings |
| `/alerts` | `AlertsPage` | Filterable alert table (level/hazard/horizon/evidence/policy) |
| `/alerts/:id` | `AlertDetailPage` | Evidence card, printable, PDF/CSV export |
| `/advisories`, `/advisories/:subCategory` | `AdvisoriesPage` | Sector advisories |
| `/analytics`, `/analytics/:subCategory` | `AnalyticsPage` | Forecast analytics |
| `/divisions`, `/divisions/:id` | `DivisionsPage`, `DivisionDetailPage` | Division-level browse |
| `/hazards`, `/hazards/:slug` | `HazardsPage`, `HazardDetailPage` | Per-hazard methodology |
| `/districts`, `/districts/:id`, `/retrospectives`, `/model-performance` | `GeneratedContentPage` | Content-engine generated, prerendered |
| `/status` | `StatusPage` (`FreshnessPanel`) | Ingest freshness artifact rendering |
| `/blogs`, `/blogs/:slug`, `/blogs/studio`, `/blogs/editor` | `Blogs*` | Blog + super-admin studio (guarded) |
| `/upload` | `UploadPage` | Data upload (when enabled) |
| `/about`, `/methodology`, `/model`, `/data-sources`, `/faq`, `/docs`, `/use-cases`, `/download`, `/contact`, `/terms`, `/privacy` | static/article pages | `ArticlePage` / generated |
| `/login`, `/signup`, `/forgot-password`, `/update-password`, `/set-password`, `/auth/*` | auth pages | Own layout, no navbar/footer |
| `/*` | `NotFoundPage` | 404 |

Public-surface discipline is in `docs/PUBLIC_SURFACE.md`: `/` vs `/live` split, copy lives in `frontend/src/content/site-routes.json` (prerenderer + app + `<head>` stay one copy), no repo paths ever leak (`scripts/check-public-paths.mjs`), `frontDoor` ↔ `console` responsibilities are distinct.

### 4.2 API surface (Express and Vercel — shared contracts)

| Method & Path | Handler(s) | Core logic |
|---|---|---|
| `GET /api/v1/forecasts/bulk?horizon=7_days|15_days` | `api/v1/forecasts/bulk.js`, `backend/routes/forecasts.js` | `parseBulkQuery` → `getForecastStore().getLatestForecastsByHorizon()` → `{horizon,count,generated_at,data_source,forecasts[]}` |
| `GET /api/v1/forecasts?district_id&horizon` | `backend/routes/forecasts.js` | Single-district latest + severity/confidence binning |
| `GET /api/v1/forecasts/history?from&to&horizon&district_id&format` | `api/v1/forecasts/history.js`, `backend/routes/forecasts.js` | `parseHistoryQuery` (≤90-day window, default 30) → `historyRowsToCsv` or JSON |
| `GET /api/v1/forecasts/metadata` | `api/v1/forecasts/metadata.js`, `backend/routes/forecasts.js` | `{prediction_date,ingestion_timestamp,data_source,datasets[],generated_at}` |
| `GET /api/v1/forecasts/history.csv` (CSV variant) | same | CSV with BOM via `csvSafety.csvEscape` |
| `POST /api/v1/forecasts/update` | `backend/routes/forecasts.js` | `multer` CSV upload, `verifyApiKey`, `parseCsvForecastRow`, `ingestForecastCsv` |
| `POST /api/ingest` / `POST /api/v1/forecasts/ingest-csv` | `api/ingest.js`, `backend/routes/forecasts.js` | CSV string/body ingest, `mode=replace|append`, `strict` |
| `POST /api/predict` | `api/predict.js`, `backend/routes/predict.js` | **Stored** forecast read via `storedPrediction.js`/`predictFromStore.js` — no inference |
| `GET /api/v1/weather?*`, `GET /api/v1/weather/batch` | `api/v1/weather*.js`, `backend/routes/weather.js` | Open-Meteo proxy (`backend/utils/openMeteo.js`) |
| `GET /api/v1/alerts`, `POST /api/v1/alerts/run`, `GET /api/v1/alerts/policy`, `GET /api/v1/alerts/evidence-card`, `POST /api/v1/alerts/review` | `api/v1/alerts/*.js`, `backend/routes/alerts.js` | Alert engine orchestration |
| `POST /api/chat/query`, `GET /api/chat/sample-questions` | `api/chat/*.js`, `backend/routes/chat.js` | `chatService.js` + `ai_fallback_engine.js` + `rag_pipeline/` |
| `POST /api/advisory`, `POST /api/agent/*` | `backend/routes/advisory.js`, `agent.js` | `advisoryAgent.js`, `gemini_grounding.js` |
| `GET /api/metrics`, `/metrics` | `api/metrics.js`, `backend/metrics.js` | prom-client + `hazardnet_forecast_age_hours` freshness gauge |
| `POST /api/track`, `/dispatch`, `/reconciliation`, `/debug` | `backend/routes/conversions.js` | Conversion analytics — **unauthenticated by owner decision** (ADR 0014) |
| `GET /api/events`, `POST /api/events` | `backend/routes/events.js` | Historical event archive |
| `GET /.well-known/security.txt` | static + `SECURITY.md` | RFC 9116 |

Contracts live in `backend/utils/forecastServe.js` + `backend/utils/forecastRow.js` — both runtimes import them, so parity is by construction (the pre-00014 Vercel missing-bulk bug is closed).

---

## 5) Data contracts — forecasts, hazards, horizons

### 5.1 Canonical row shape (what Firestore and CSV store)

Defined in `backend/utils/forecastRow.js` and mirrored in `frontend/src/lib/forecasts.ts`:

```ts
ForecastRow {
  district_id: number|string
  district_name: string
  horizon: '7_days'|'15_days'        // VALID_HORIZONS — authority
  hazard_type: 8 values (VALID_HAZARDS)
  severity_score: 0..1               // primary severity (single-track legacy)
  confidence: 0..1                   // softmax; calibrated_probability only if map fitted
  target_date: 'YYYY-MM-DD'
  prediction_date: 'YYYY-MM-DD'
  // human-readable forecast weather
  temperature_mean/max/min, precipitation_mm, wind_max_kmh,
  dewpoint_mean, solar_radiation_mj_m2, evapotranspiration_mm
  created_at?: ISO string
  model_severity?, physics_severity? // dual-track when CSV carries both
  division?, pcode?
  dataset_version?: 'ds1.<16hex>'    // content hash — ignored if malformed
  admin_level?, adm2_name?, adm2_pcode? // ADM3 → ADM2 rollup (ADR 0006)
}
```

**CSV ingest** (`parseCsvForecastRow`) accepts both single-track `severity_score` and dual-track `model_severity`/`physics_severity`; legacy horizon names are migrated; every row gets `dataset_version` lineage when the manifest supplies one. **API parsing** (`parseForecastRow` in `frontend/src/lib/forecasts.ts`) defensively validates bounds, drops malformed rows, and only propagates `dataset_version` when it matches `/^ds1\.[0-9a-f]{16}$/`.

### 5.2 Hazards & horizons

```js
// backend/utils/forecastRow.js
VALID_HAZARDS = ['Cold Wave','Drought','Fire','Flash Flood','Flood','Heat Wave','Severe Local Storm','Tropical Cyclone'] // label order is deployment contract
VALID_HORIZONS = ['7_days','15_days']
```

`frontend/src/lib/forecasts.ts` mirrors these and adds `severityBin` (`Low <0.34, Moderate 0.34–0.67, High ≥0.67`) and `confidenceBin` (`Uncertain <0.70, Probable 0.70–0.85, Certain ≥0.85`) — same thresholds as backend's single-district response.

### 5.3 Snapshot shape (`frontend/public/data/forecasts-latest.json`)

Produced by `scripts/build_forecast_snapshot.mjs`, consumed by the frontend fallback and the store:

```json
{
  "schema": "hazardnet-forecasts/v2",
  "generated_at": "ISO",
  "source": "kaggle: hazardnet-auto-forecast-pipeline (Earth Engine + Open-Meteo + TFLite)",
  "prediction_date": "YYYY-MM-DD",
  "provenance": { "model_version": "...", "tensor_build_id": "...", "pipeline_version": "...", "run_id": "..." },
  "coverage": { "requested_units": 128, "produced_units": 74, "per_horizon": {"7_days":37,"15_days":37}, "districts_covered": 37, "missing_district_ids": [...], "status": "partial|complete" },
  "dataset_version": "ds1.<16hex>",
  "lineage": { "dataset_version": "...", "scene_manifest_path": "...", "units_in_manifest": 128, "rows_with_version": 74, "rows_total": 74, "scenes_enumerated": true, "status": "complete|partial" },
  "soil_channels_fabricated": null,
  "horizons": { "7_days": [ForecastRow,...], "15_days": [ForecastRow,...] }
}
```

`coverage` exists precisely to answer §5.1 “partial coverage, nothing says so” — UI and `/status` surface it. `lineage.status` tells whether every row can name its inputs (§5.8).

### 5.4 Version registry

`Models/REGISTRY.json` + `Models/VERSION.json` + `ARTIFACTS.yaml` — model_ver / fusion_ver / thresholds_ver / dataset_ver / git_sha. Backend reports `model_version` in `/health` and the `POST /api/predict` envelope via `backend/modelInfo.js`; frontend `frontend/public/data/model-performance.json` (built by `scripts/build_model_performance.mjs`) carries the same stamp for the content engine.

---

## 6) Core subsystems — how each works and where to change it

### 6.1 Forecast store — the persistence brain

**File:** `backend/forecastStore.js` + `backend/forecastPersistence.js` + `backend/db.js`

```
Firestore `forecasts` collection
  ↑ read with 2.5s deadline (Promise.race)
  │  success → newest-per-district dedup (in-memory Map, by prediction_date desc)
  │  failure → 120s circuit-breaker → in-memory snapshot fallback
  │  empty   → snapshot fallback
  │
  └── write: persistForecasts() — Admin SDK transaction (atomic replace)
               memory updated ONLY after commit
               failure → 503 propagate, no memory pollution
```

- `getForecastStoreMode()` unconditionally returns `'firestore'`. Env `FORECAST_STORE` / `DATABASE_URL` from `.env.example` do **not** select a different store.
- Snapshot loader tries `frontend/public/data/forecasts-latest.json` (and `dist/` variants), normalises `horizons → rows[]` with `prediction_date`/`created_at` defaults (`2026-09-16` fallback literal exists — audit-marked debt).
- Public API: `getLatestForecastByDistrict(districtId,horizon)`, `getLatestForecastsByHorizon(horizon)`, `getLatestPredictionDate()`, `getLatestIngestionTimestamp()`, `getForecastHistory({from,to,horizon,districtId})`, `storeForecasts(rows,predictionDate)` (calls `persistForecasts`). Test seam: `resetForecastStore()`.

**If you need to change persistence:** touch `forecastPersistence.js` (Admin transaction, `FIREBASE_SERVICE_ACCOUNT_JSON`) not `forecastStore.js` alone; add a staging verification per `docs/ops/2026-09-20-stored-forecasts.md`.

### 6.2 Shared serving logic

**File:** `backend/utils/forecastServe.js` + `backend/utils/forecastRow.js` + `backend/utils/csvSafety.js` + `backend/utils/csvIngestion.js`

- `parseBulkQuery({horizon})` / `parseHistoryQuery({from,to,horizon,district_id,format})` — validated once, used by both runtimes.
- `historyRowsToCsv(rows)` → `CSV_COLUMNS` (14 columns) with `csvEscape` (RFC 4180 + Excel formula-injection neutralisation: leading `= + - @ \t \r` → prefixed `'`).
- `metadataDataSource()` / `metadataDatasets()` — Kaggle dataset/kernel provenance block.
- `parseCsvForecastRow(row,rowNumber)` — bounds, horizon/hazard validation, dual-track severity, calibrated confidence promotion (`confidence_raw` → `confidence` when `confidence_calibrated` present), meteorological fields passthrough, `dataset_version` pass-through.

### 6.3 Alert engine — §1.3 levels with §1.6 human gate

**Files:** `backend/alerts/{assess,policy,lifecycle,store,service,notify,digest,report}.js` + `backend/routes/alerts.js` + `frontend/src/{lib/alerts,components/alerts,hooks/useAlertsData}`

**Policy** (`policy.js`): thresholds are *placeholders* (conservative, owner must set real ones pre-launch — `docs/ops/owner-actions.md` Action 5). `REQUIRED_DISCLAIMER` is the PRODUCT_SPEC §1.7 text; tests compare it byte-wise after stripping markdown.

```js
POLICY_DEFAULTS = {
  watch_probability: 0.40, warning_probability: 0.65,
  watch_severity: 0.55,       // severity-band → WATCH (not §1.3's probability table)
  divergence_watch: 0.30, agreement_epsilon: 0.10,
  calibrated_probability_required_for_warning: true, // ← keeps WARNING honest today
  max_auto_publish_level: 'WATCH',                   // ← §1.6 gate, enforced in lifecycle
  max_prediction_age_hours: 48
}
```

**Ladder:**

| Level | Meaning | Condition (policy.js/assess.js) |
|---|---|---|
| `NO_ALERT` | nothing to publish | below every threshold |
| `WATCH` | monitor | `calibrated_prob ≥ watch` **or** `severity_band ≥ watch_severity` **or** `track divergence > 0.30` |
| `WARNING` | prepare (plausible) | `calibrated_prob ≥ warning` **and** both evidence tracks agree (|model−physics|≤ε) — unreachable today because `confidence_kind` is still `uncalibrated_model_softmax` |
| `SEVERE` | act (imminent) | `WARNING` + duty-officer review, or BMD/FFWC max-bulletin severity |

> On the committed 74-row snapshot every row lands `WATCH` via the severity band — the batch reports `saturated` (MODEL_CARD §6.1 degeneracy). `WARNING` records a blocker, not an alert.

**Assess** (`assess.js`): per-row evidence (model/physics severity, driver variables), freshness, provenance → level + blockers + `requires_human_review` + `auto_publishable` (≤WATCH). `assessBatch` maps an entire horizon.

**Lifecycle** (`lifecycle.js`): state machine `DRAFT → PENDING_REVIEW → PUBLISHED (+ REJECTED, SUPERSEDED)`, `canAutoPublish(maxLevel)` guard, `toPublishRecord` requiring reviewer identity + timestamp + model_version + data_cutoff + evidence snapshot; `escalate` pulls a published row back to `PENDING_REVIEW` if re-scored above ceiling; rejections stored with reason as future training labels.

**Store** (`store.js`): Firestore `alerts` collection, event log (`created` + subsequent `events[]`), doc versioning, `alertKeyFor`/`alertIdFor` idempotency, `alertFromDocument` reconstruction. **Risk:** still uses client SDK against owner-scoped `firestore.rules` — `backend/alerts/store.js × db.js × firestore.rules` is a High concern (see §9).

**Service** (`service.js`): orchestration — `HORIZONS = ['7_days','15_days']`, `buildAlertDocument`, `persistAssessment` (unchanged/same-level-superseded/escalated paths), auto-publish windowing (`ALERT_AUTO_PUBLISH_MINUTES`, default 720), async notify leg with 10s timeout (`withNotifyTimeout` — slow Firestore/notify never blocks `run`).

**Notify** (`notify.js`, `channels/sms.js`, `channels/telegram.js`): per-subscriber filtering, DB SMS dry-run + per-run budget, 8s transport timeout, redaction helpers, masked destination logging. `digest.js` builds SMS/Telegram copy in EN+BN, always attaching `REQUIRED_DISCLAIMER`.

### 6.4 Prediction — stored, not inferred

**Files:** `backend/utils/storedPrediction.js`, `backend/utils/predictFromStore.js`, `backend/routes/predict.js`, `api/predict.js`, `frontend/src/components/StoredForecastPanel.tsx`, `frontend/src/lib/storedPrediction.ts`

`POST /api/predict {district_id, horizon}` → reads the latest stored forecast for that district/horizon, returns `{district_name, hazard_type, severity_score, confidence, prediction_date, provenance, model_version}`; **missing fields are `null`**, never fabricated. The TFLite `Models/hazardnet_fp32.tflite` (1.2M params, 790 KB FP32) is *not* executed during a request; `Models/hazardnet_int8.tflite` is a misnamed optimized-FP32 duplicate (ADR 0007). The `VERSION.json` handshake (`package.version + model.<12hex>`) is boot-checked; absence once downgraded to `1.0-FP32 (legacy literal)`.

### 6.5 Weather proxy

**File:** `backend/utils/openMeteo.js`, `backend/routes/weather.js`, `api/v1/weather/*.js`, `frontend/src/hooks/useWeather.ts`, `frontend/src/lib/weather.ts`

Thin authenticated proxy with 15-min cache, batch support, district→lat/lon via `districtCoordinates.js`. Note: `_fetchUpstream` has no abort signal — hung upstream extends response (recorded concern).

### 6.6 RAG + AI cascade

**Files:** `rag_pipeline/{index,search,skill_router,agent_knowledge_base}.js`, `backend/utils/chatService.js`, `backend/utils/ai_fallback_engine.js`, `backend/utils/gemini_grounding.js`, `backend/services/advisoryAgent.js`, `frontend/src/components/{ChatBot,AdvisoryPanel,GroundingIntelligencePanel}`

- Retrieval: `routeSkills` + `searchRAG` over `agent_knowledge_base.json` (built by `build_agent_knowledge_base.js`) + `GOVT_OFFICE_DIRECTORY`.
- Plumbing: `chatService.js` builds a *bounded* prompt (per-field caps **and** whole-prompt cap — pre-Phase 6 the per-field caps were computed but the raw body reached the model). `ai_fallback_engine.js` sequences providers with 10-min answer cache, circuit-breaker, 12s per-provider timeout (no total deadline).
- Frontend: `ChatBot` → `/api/chat/query`, `AdvisoryPanel` → `/api/advisory`, markdown rendering + grounding citations.

### 6.7 Frontend architecture

| Layer | Files | Notes |
|---|---|---|
| Shell | `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/context/AuthContext.tsx` | Router, query client, a11y skip link, Vercel Analytics, PWA `serviceWorker.js` registration |
| Pages | `frontend/src/pages/*` (28 routes) | FrontDoor, Dashboard (gis/analytics/saved/compare/settings), DistrictDetailPage, DivisionDetailPage, Hazards/HazardDetail, Alerts/AlertDetail, Advisories, Analytics, Divisions, Blogs, Documentation, Status, etc. |
| Map | `frontend/src/components/{LiveMapView,Map,DistrictForecastCard,MapLegend,MapToolbar}` + `hooks/useLeafletMap.ts` | Leaflet (not Mapbox GL despite README badge); clustering, heat layer, vector↔raster fallback for Data Saver/2G/≤2GB/≤4 cores |
| Forecast UI | `frontend/src/components/{StoredForecastPanel,ForecastDashboard,NationalOverview,RegionSelector,ThirtyDayTrendChart,RiskAnalytics,WeatherPanel}` + `hooks/{useForecasts,useWeather}` + `lib/forecasts.ts` | Merge live onto `data/bangladeshDistricts.ts` `ALL_64_DISTRICTS` via `canonicalKey()` + alias table; `buildForecastIndex` dedups by newest `prediction_date`; `rollupAdm3ToDistricts` when ADM3-shaped |
| Alerts UI | `frontend/src/components/alerts/*` | `AlertCard`, `EvidenceCard`, `DistrictAlertStrip/Table`, `PolicyPanel`, `Disclaimer` — always renders `ALERT_DISCLAIMER` from `lib/legal.ts` (= `policy.js`) |
| Design system | `frontend/src/components/ui/*`, `components/unlumen-ui/primitives/*`, `frontend/src/index.css` | Tailwind 4 + class-variance-authority + Radix Base UI + Framer Motion; `docs/design-system/MASTER.md` |
| Content | `frontend/src/content/{site-routes,attribution,hazard-methodology,generated-routes}.json` + `scripts/build_content_engine.mjs` + `frontend/scripts/prerender.mjs` | Single copy → SPA + static HTML + `<head>` + JSON-LD + sitemap/robots |
| Config | `frontend/src/lib/{config,firebase,seoHead,structuredData}` | Vite `envDir: ".."` reads root `.env`; `firebase.ts` initializes from `firebase-applet-config.json` |
| Offline | `frontend/public/serviceWorker.js` (built via `vite-plugin-pwa: injectManifest`), `frontend/src/services/*`, `Dashboard` cache controls | Caches tiles + app shell; respects `no-store` on auth'd responses after Phase 6 fix |

**Critical alias:** `@/*` → `frontend/src/*` (both `tsconfig.json:paths` and `vite.config.ts:resolve.alias`). **Formatting:** Prettier 120 cols, single quotes, semicolons, trailing commas, 2-space; ESLint flat config ( TS + React hooks; `_`-prefixed unused vars allowed).

---

## 7) Tech stack — what you'd `grep` for

### 7.1 Root (`package.json` `v2.1.9`, `type: module`, Node ≥20)

| Dep | Version | Use |
|---|---|---|
| `express` | ^4.18.2 | Self-host HTTP server |
| `firebase-admin` | ^13.10 | Durable forecast writes |
| `firebase` | ^12.17 | Client SDK (alerts + auth + forecast reads fallback) |
| `@google-cloud/firestore` | ^7.11 | Firestore client |
| `@google/genai` | ^2.15 | Gemini AI cascade |
| `helmet` | ^8.1 | Security headers (CSP, HSTS, etc.) |
| `cors` | ^2.8 | CORS |
| `express-rate-limit` | ^7.5 | API rate limiting |
| `multer`/`busboy`/`csv-parser` | ^2/1/3 | CSV ingest |
| `prom-client` | ^15.1 | `/metrics` |
| `web-push`/`ws` | ^3/8 | Push + Live Voice WS |
| `zod` | ^3.23 | Validation |

Dev: `jest ^29` + `babel-jest ^30` + `@babel/preset-*` + `eslint ^9` + `@typescript-eslint`, `playwright ^1.62`, `prettier ^3`, `typescript ^5.4`, `impeccable ^4` (design lint).

### 7.2 Frontend workspace (`frontend/package.json` `0.1.0`)

| Dep | Version | Use |
|---|---|---|
| `react`/`react-dom` | 18.3.1 | UI |
| `react-router-dom` | ^6.24 | Routing |
| `@tanstack/react-query` | ^5.0 | Server-state + forecast polling |
| `@mui/material` + `@emotion/*` | ^6 / ^11 | Component library |
| `@fontsource-variable/*` | ^5.3 | Inter / Public Sans / DM Mono |
| `framer-motion` | ^13 | Animation (respects `prefers-reduced-motion`) |
| `leaflet` + `leaflet.heat`/`markercluster` | ^1.9 / ^0.2 / ^1.5 | Map (Mapbox token not required) |
| `recharts` | ^2.9 | Trend chart |
| `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss ^4`, `@tailwindcss/vite`, `tw-animate-css` | — | Styling |
| `firebase` | ^12.17 | Auth |
| `jspdf`/`html2canvas*`/`qrcode.react` | ^4 / ^1-2 / ^4 | PDF export / print / QR |
| `vite ^8` + `@vitejs/plugin-react ^6` + `vite-plugin-pwa ^1` + `workbox-* ^7` | — | Build / PWA |

### 7.3 Python (three distinct envs — do not merge)

- `scripts/requirements-pipeline.txt`: `kaggle==1.8.4`, `pandas==3.0.5`, `numpy==2.4.6`, `pytest==9.1.1`, `pyyaml==6.0.3` — the **daily publisher** env.
- `scripts/requirements-inference.txt`: legacy edge inference (`earthengine-api==0.1.412`, `tflite-runtime==2.14.0`, `opencv-python-headless`, …) — **not** used on CI.
- `training/requirements.txt`: `torch`, `numpy`, `pandas`, `scikit-learn>=1.1`, `tqdm`, `h5py`, `matplotlib`, `seaborn`, `joblib` — scientific pipeline, unpinned.

---

## 8) Environment & config

| Variable | Where / required for | Behaviour if missing |
|---|---|---|
| `BACKEND_API_KEY` | Ingest (`POST /update`, `/ingest-csv`) + push broadcast | `503` on protected routes, app still boots |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin forecast writes | Writes fail with `503`; reads may still use client SDK / snapshot |
| `VITE_FIREBASE_*` / `firebase-applet-config.json` | Browser auth + Firestore reads | Auth/store degrades to snapshot |
| `GEMINI_API_KEY` | Advisory/chat AI | Falls back to heuristic |
| `VAPID_PUBLIC/PRIVATE_KEY` | Web push | Subscriptions fail |
| `FRONTEND_ORIGIN` | CORS allowlist | In prod, CORS fails closed; dev allows any origin |
| `VITE_MAPBOX_TOKEN` | Map tiles | Leaflet works without it (vector fallback); Mapbox not actually required |
| `ALERT_*` (e.g. `ALERT_AUTO_PUBLISH_MINUTES`, `ALERT_ALLOW_UNCALIBRATED_WARNING`, `ALERT_NOTIFY_TIMEOUT_MS`) | Alert thresholds/gates | Defaults in `policy.js` / `service.js` |
| `VITE_VERCEL_ANALYTICS` / `VERCEL` | Vercel analytics loader | Auto on when `VERCEL=1` (preview + prod) |
| `KAGGLE_USERNAME`/`KAGGLE_KEY` | Daily publisher (CI) | Workflow preflight fails at 45-min timeout guard |

Read path: `backend/server.js` + `backend/db.js` load `dotenv`; Vite reads `envDir: ".."` so `frontend/.env` and root `.env` both work; `firebase.json`/`.firebaserc` pin the Firebase project.

---

## 9) Known risks, debt, and where *not* to improvise

From `docs/codebase/CONCERNS.md` and `docs/adr/0014`:

| Severity | Concern | Files | What to do |
|---|---|---|---|
| **High** | Alert engine writes via **client SDK** into owner-scoped `alerts` collection | `backend/alerts/store.js`, `backend/db.js`, `firestore.rules` | Add collection separation / service-role write path; live rule verification still TODO |
| **High** | Conversion routes **unauthenticated** (`/track`, `/dispatch`, `/reconciliation`, `/debug`) return buffered attribution without owner check | `backend/routes/conversions.js` | ADR 0014 deliberatley leaves it — accepted risk, do not “fix” without owner |
| **High** | Historical credential exposure (remediated from file, rotation unverified) | `.env.example`, `docs/audits/2026-09-18-secret-scan-false-negative.md` | Owner Action 1 — rotation must be confirmed out-of-band |
| Medium | **Port mismatch** — Express `3000` vs Vite proxy + `monitoring/prometheus.yml` expecting `3001` | `backend/server.js`, `frontend/vite.config.ts`, `monitoring/prometheus.yml` | Centralise port config |
| Medium | Firestore reads have per-call 2.5s deadline, but Open-Meteo gateway has **no abort** | `forecastStore.js` vs `openMeteo.js` | Add abort deadline |
| Debt | `venv/` tracks three identical 5.9 MB binaries | `venv/bin/python*` | Separate approved cleanup only |
| Debt | `Models/hazardnet_int8.tflite` is FP32 duplicate | `Models/REGISTRY.json` | Don't rely on INT8 path |
| Debt | Hardcoded `2026-09-16` snapshot fallback dates | `backend/forecastStore.js` | Replace with explicit stale-metadata signal |
| Debt | Multiple intent-doc generations in repo | `README.md`, `docs/PRD.md`, `HAZARDNET_WEBAPP_DEPLOYMENT_GUIDE.md` | Check ADR / `docs/codebase/` as truth |

---

## 10) Testing — how confidence is built

### 10.1 Runners & gate

```bash
npm ci && npm test -- --runInBand                 # Jest 29 root suite (jsdom default; @jest-environment node for backend)
npm test -- --runInBand --coverage                # coverage scope: backend/**/*.js, api/**/*.js, frontend/src/utils/**/*.ts — floors 32/35/30/31
python3 -m pytest scripts/tests -q                # pipeline / ETL / MLOps / freshness
python3 -m pytest training/tests -q               # scientific thresholds
npm --prefix frontend run test                    # frontend Jest subset
npm run build && npx playwright test              # e2e — default config runs ONLY e2e/full-app-qa.spec.ts
npm run lint        # tsc --noEmit (frontend)
npm run lint:eslint # eslint .  (CI 0-error gate, 311 warnings permitted in 1.8-draft)
```

Quality gates (CI + local `scripts/`): `check-claims.mjs` (83 sources vs 20 registered values), `check-severity-embargo.mjs` (blocks vulnerability formula reintroduction), `check-rag-freshness.mjs` (mtime-only), `check-public-paths.mjs`, `check-bundle.mjs`, `check-design-quality.mjs`/`impeccable`, `check-phase7.mjs`, `validate_env.mjs`. `firestore.rules` tests are source-shape only; emulator/deployment verification is explicitly TODO.

### 10.2 Where tests live

| Location | What it covers |
|---|---|
| `__tests__/*.test.js` | Forecast store, predict parity, embargo, public surface, palette/tokens, metrics, CORS, push, ingest… |
| `__tests__/alerts/*.test.js` | assess/channels/digest/lifecycle/notify/policy/report/service |
| `__tests__/api/*.test.js` | forecasts/predict/alerts Vercel-handler parity via `node-mocks-http` |
| `frontend/src/**/__tests__/*.test.tsx` | StoredForecastPanel, AdvisoryPanel, map primitives, hooks, a11y, freshnes… |
| `scripts/tests/test_*.py` | ETL, hindcast, MLOps, claims, workflow schema, frontend alert surface |
| `training/tests/test_*.py` | Severity normalization scientific invariants |
| `e2e/{full-app-qa,critical-paths,forecast-ux}.spec.ts` | Desktop Chromium + Pixel 7, 60s timeout, 4 workers |
| `__tests__/snapshot` parity | `loadForecasts` live→snapshot fallback, `forecastServe` query helpers, snapshot schema |

At 2026-09-20 verification: **98 suites / 1,074 tests green** (no skips) after ADR 0014; frontend-only coverage set `--coverageThreshold='{}'`. Treat that as a point-in-time fact, not a guarantee of HEAD.

### 10.3 Mocking & seams

- `__tests__/forecastStore.test.js`: mocks `backend/db.js`, resets singleton per test via `resetForecastStore()`.
- Alert channels: injected `fetchImpl`/`env`/`now` so SMS/Telegram never send in tests.
- `loadForecasts`: deterministic snapshot path; HTTP failures are exercised without a network.
- Python fixtures explicitly synthetic — must not be quoted as field validation.

---

## 11) Deployment — the two modes that actually exist

| Mode | How it runs | Serves | Notes |
|---|---|---|---|
| **Vercel** (primary) | `vercel.json` (+ `frontend/vercel.json`) → static `frontend/dist` + `api/` functions | SPA + all `/api/**` | Production canonical host `www.hazardnet.live` (apex redirect), CSP via `backend/security/csp.js` shared with `helmet`, hardening via `backend/middleware/serverlessGuard.js` (rate limit + security headers per-instance) |
| **Node self-host** | `npm start` → `backend/server.js` (reads `frontend/dist` or pivots to Vite) | SPA + `/api/**` + `/health` + `/metrics` | Used locally and in Docker `docker run` examples in `monitoring/README.md`; Docker Compose is superseded |

Owner actions still open (from multiple audits): enable real Search Console / Bing indexing, add citation workflow, load the 2,931-event archive (`python -m etl.cli events … --claimed-total 2931`), rotate exposed provider credentials, reconcile production Vercel project root (`frontend/` vs repo root).

---

## 12) ADRs — the decisions you must not reverse without a new ADR

| ADR | Title | One-line stance |
|---|---|---|
| 0001 | Backend identity | Express + Firestore, ESM |
| 0002 | Forecast consolidation | **Superseded** by 0014 — Firestore remains; no Postgres migration |
| 0003 | Deploy topology | Vercel primary + Node self-host; no Docker Compose |
| 0004 | Retire legacy weekly pipeline | Weekly pipeline retired in favour of daily Kaggle fetch |
| 0005 | ADM3 / HDX horizons | 507 ADM3 units + 7/15 horizons are the coded horizon, not yet live coverage |
| 0006 | OSM exposure spatial stack | OSM-based exposure join design |
| 0007 | No INT8 bundle | INT8 quant crashes on CONV_3D — ship FP32 only |
| 0008 | Hourly refresh / snapshot fallback | Snapshot fallback + freshness SLO |
| 0009 | Single inference path | **HTTP reads stored forecasts**; request-time inference retired (ADR 0014 accepts) |
| 0010 | Alert engine persistence | Event-logged alert docs, no deletions, HITL gate |
| 0011 | Distribution without package registries | Produce via Kaggle, distribute without pushing to registries |
| 0012 | Composite index classification | Embargo vulnerability formula; two labelled aggregations remain approved |
| 0013 | Kaggle is the forecast producer | GitHub does not generate; it fetches kernel output |
| 0014 | Codebase owner decisions (2026-09-20) | Accept 0009, require durable writes, embargo formula, supersede 0002, leave conversion auth as-is |

Each file lives in `docs/adr/000N-*.md` with status + consequences.

---

## 13) Navigation recipes — “I need to …”

| Task | Start here |
|---|---|
| **Change how forecasts reach the browser** | `frontend/src/lib/forecasts.ts` (parse/merge/rollup/bins) → `frontend/src/hooks/useForecasts.ts` → `frontend/src/data/bangladeshDistricts.ts` |
| **Alter an API contract** | `backend/utils/forecastServe.js` + `backend/utils/forecastRow.js` — change both runtimes at once |
| **Fix ingestion** | `backend/routes/forecasts.js` POST → `backend/utils/csvIngestion.js` → `backend/forecastStore.js` `storeForecasts` → `backend/forecastPersistence.js` (transaction) |
| **Debug “map blanks on offline”** | `frontend/public/serviceWorker.js` + `frontend/src/main.tsx` registration + `loadForecasts` fallback → `fetchSnapshotMetadata` |
| **Adjust alert levels** | `backend/alerts/policy.js` (numbers) + `assess.js` (logic) — must pair with `firestore.rules` and owner sign-off ≥ WARNING |
| **Add a new hazard class** | `backend/utils/forecastRow.js` VALID_HAZARDS + `Models/labels.json` + `frontend/src/content/hazard-methodology.json` + prerender + tests — **not** a one-line label add |
| **Wire a new AI provider** | `backend/utils/ai_fallback_engine.js` (add to cascade) + `backend/utils/chatService.js` prompt bounds + env var + tests |
| **Publish a new content page** | `frontend/src/content/site-routes.json` → `scripts/build_content_engine.mjs` → `frontend/scripts/prerender.mjs` (titles/canonicals/JSON-LD/sitemap) |
| **Change security headers / CSP** | `backend/security/csp.js` (single source) — consumed by both `vercel.json` and `helmet`; do not edit either in isolation |
| **Work on the map** | `frontend/src/components/LiveMapView.tsx` (2.6k loc) + `frontend/src/hooks/useLeafletMap.ts` + `frontend/src/lib/alertLayer.ts` — extract small, test behind axe + `MapLegend.test.tsx` |
| **Handle Bangladesh districts / renames** | `frontend/src/data/bangladeshDistricts.ts` + `frontend/src/lib/forecasts.ts` `DISTRICT_NAME_ALIASES` + `scripts/etl/districts.py` ALIASES — keep the three in sync |
| **Run the pipeline locally** | `scripts/fetch_kaggle_forecast.py` (needs `KAGGLE_*`) or `python scripts/auto_forecast.py` (needs GEE key) → `scripts/validate_forecasts.py` → `node scripts/build_forecast_snapshot.mjs` |

---

## 14) Glossary — terms the code actually uses

- **ADM2 / ADM3**: Administrative boundaries — 64 districts (forecast unit) / 507 upazilas+city corps (archive unit).
- **Horizon**: forecast lead window — `7_days` or `15_days`. The only spellings the API accepts.
- **Severity / physics_severity / model_severity**: single-track vs dual-track severity scores (`0..1`). Physics is an independent check; divergence drives `WATCH`.
- **Confidence / confidence_kind**: `uncalibrated_model_softmax` by default; becomes `calibrated_probability` only after a fitted `confidence_map` is deployed (none shipped).
- **Dataset version**: content hash `ds1.<16hex>` over the inputs behind a row — same inputs → same version; used for reproducibility (PRODUCT_SPEC §5.8).
- **Provenance**: `{model_version, tensor_build_id, pipeline_version, run_id}` stamped per snapshot/run — surfaced on detail pages and in the freshness artifact.
- **Freshness SLO**: `prediction_date ≤ 48h old` — checked by `/api/metrics` and visible on `/status` via `freshness.json` (`hazardnet-freshness/v1`).
- **Coverage / lineage**: `coverage` = how many of 128 district×horizon units were produced; `lineage` = can every row name the scenes/inputs behind it?
- **Alert lifecycle**: `DRAFT → PENDING_REVIEW → PUBLISHED` (plus `REJECTED`, `SUPERSEDED`), gated by `max_auto_publish_level = WATCH`.

---

## 15) Where this file sits relative to the docs

| Doc | Read it when |
|---|---|
| `docs/codebase/ARCHITECTURE.md` | You need the audited, evidence-anchored architecture narrative (6 canonical sections) |
| `docs/codebase/STRUCTURE.md` | You need the exhaustive file-tree + entry-point catalogue |
| `docs/codebase/STACK.md` | You need pinned dependency versions + toolchain + commands |
| `docs/codebase/CONVENTIONS.md` | You need naming/formatting/import/error patterns |
| `docs/codebase/INTEGRATIONS.md` | You need auth, secrets, outbound dependencies, and deployment contracts |
| `docs/codebase/TESTING.md` | You need coverage scope, harness shapes, and what is *not* yet tested |
| `docs/codebase/CONCERNS.md` | You need risks/debt sorted by severity + suggested fixes |
| `docs/PRODUCT_SPEC.md` (+ `docs/TRD.md`, `docs/adr/`) | You need product intent vs shipped-system §5 defects |
| `docs/PUBLIC_SURFACE.md` | You need `/` vs `/live` editorial discipline |
| `ARTIFACTS.yaml`, `Models/REGISTRY.json`, `Models/VERSION.json` | You need the four-way version handshake |
| `HAZARDNET_WEBAPP_DEPLOYMENT_GUIDE.md` | You need the August-2026 design record (with 2026-09-12 reconciliations left inline) |
| **This file** | You need a one-stop orienting walk-through on 2026-09-22 before you touch anything |

---

## 16) How this knowledge was acquired

1. **Scanned** the top-level tree, then `git ls-files` inventory; identified the single npm workspace (`frontend/`), the dual runtimes (`backend/` + `api/`), the three Python envs, and the monitoring/ML/data layers.
2. **Read** all seven `docs/codebase/*.md` discovery documents (baseline `df67e52`, inspected 2026-09-20) to inherit audited evidence and constraints rather than reverse-engineering them.
3. **Traced** the Kaggle→Actions→Firestore→browser pipeline through `daily_forecast.yml`, `scripts/fetch_kaggle_forecast.py`, `forecastStore.js`, `forecastServe.js`, `forecasts.ts`, `useForecasts.ts`, and the Leaflet map layer.
4. **Pivoted** into the alert domain (`policy → assess → lifecycle → store → service → notify`) and the RAG/AI cascade (`rag_pipeline/ → chatService → ai_fallback_engine`) by reading headers, tests, and the small `__tests__/alerts/` suite.
5. **Sampled** representative “hot” modules (`LiveMapView.tsx` 2.6k, `DistrictDetailPage.tsx` 2.6k, `Dashboard.tsx` 1.4k, `hazardnet_scientific_pipeline.py` 1.2k, `auto_forecast.py` 1.1k) and the route table in `App.tsx` to confirm layer boundaries and the `@/*` alias.
6. **Captured** integrations via `vercel.json`/`frontend/vercel.json`, `backend/security/csp.js`, `backend/middleware/serverlessGuard.js`, `backend/db.js`, `firestore.rules`, `backend/utils/openMeteo.js`, `backend/alerts/channels/*`, and `.env.example`.
7. **Recorded** debt/risk directly from `CONCERNS.md` and ADR 0014 rather than inventing new findings; no live Firestore or network probe was run.

> Re-run `scripts/scan.py` on a non-shallow clone if you need a fresh 90-day churn ranking — the 2026-09-20 scan noted its shallow-clone limitation.

---

## 17) Immediate next steps for a new contributor

- [ ] `npm ci && npm run lint && npm test -- --runInBand --coverage` — see whether HEAD still meets the 98-suites/1,074-tests baseline before you touch layout.
- [ ] `npm run build && npm start` → open `http://localhost:3000/` (front door) and `http://localhost:3000/live` (console); verify `GET /api/v1/forecasts/bulk?horizon=7_days` returns `forecasts[]` or that the snapshot fallback populates the map.
- [ ] Pick one recipe from §13 and trace it in your editor with “Find in files” pinned to the **Start here** column.
- [ ] Before any user-facing copy change, run `node scripts/check-claims.mjs` and `node scripts/check-severity-embargo.mjs` — they block the same mistakes auditors found in Phases 3–8.
- [ ] Before any deploy change, read `docs/ops/2026-09-20-stored-forecasts.md` (credential setup + transaction limits) and ADR 0014.

---

*Maintained by: Arena Agent Mode — 2026-09-22. This map is a derived view at a point in time; when the code moves, update this file or note its staleness at the top. Canonical evidence remains in `docs/codebase/*.md` + `docs/adr/*.md`.*
