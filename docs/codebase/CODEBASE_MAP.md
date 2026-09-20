# HazardNet — Codebase Map

*Generated 2026-09-18 from a read-only walk of the repo at `add4a1f`. Complements the older `docs/codebase/STRUCTURE.md` (2026-09-11), which is partly stale — see "Drift" at the bottom.*

---

## 1. What this repo is

A multi-hazard AI forecasting platform for Bangladesh agriculture: 8 hazard classes × 64 ADM2 districts × 7- and 15-day horizons. A 3D depthwise-separable CNN (TFLite FP32, ~0.77 MB) produces a *model severity*; an independent physics formula produces a *physics severity*; the two are shown side by side ("dual-track"). Output flows daily from a GitHub Actions pipeline into a forecast store, a REST API, a React SPA, a bilingual alert surface, and prerendered static content pages.

npm-workspace monorepo. Root manifest owns backend + tooling; `frontend/` is the only workspace.

---

## 2. Size at a glance

| Area | Files | LOC |
|---|---|---|
| `frontend/src` | 230 (dir) | ~51,900 |
| `scripts/` | 116 | ~23,600 |
| `__tests__/` + `scripts/tests/` | 50 + 30 | ~8,600 (JS) |
| `backend/` | 53 | ~8,500 |
| `api/` | 13 | ~800 |
| `rag_pipeline/` | 7 | ~430 |
| `docs/` | 70 | — |

---

## 3. Top-level map

| Path | Role |
|---|---|
| `backend/` | Express server (`server.js`) — routes, middleware, alert engine, TFLite inference, forecast store |
| `api/` | Vercel serverless handlers; thin wrappers importing `backend/` modules |
| `frontend/` | React 18 + TS + Vite SPA (+ a prerender step producing static HTML) |
| `Models/` | TFLite artifacts, `labels.json`, `normalization_stats.json`, `VERSION.json`, `REGISTRY.json`, calibration template |
| `scripts/` | Pipeline (`auto_forecast.py`), build/snapshot generators (`.mjs`), ETL / MLOps / hindcast Python packages, SQL migrations, tests |
| `rag_pipeline/` | Retrieval over `references/` for the chat/advisory agent |
| `references/` | Domain knowledge base (agronomy, hazard protocols, institutions) feeding RAG |
| `data/` | Committed forecast CSV, hindcast episodes/drivers/reports, design tokens, site-health |
| `docs/` | ADRs 0001–0010, audits, product spec, model card, MLOps + frontend docs |
| `__tests__/`, `e2e/`, `scripts/tests/` | Jest (backend/serverless/frontend), Playwright smoke, Python contract tests |
| `monitoring/` | Prometheus scrape config, alert rules, Grafana dashboard |
| `skills/`, `agent/`, `.agents/`, `.claude/` | Four near-duplicate copies of agent skill packs + domain packs 01–07 |
| `plugins/` | Agent plugin manifest (BWDB gauge, SMS gateway, Open-Meteo) |
| `.github/workflows/` | 12 workflows — CI, daily/hourly/weekly forecast, MLOps, hindcast, model validation, site health, secret verify |

---

## 4. Entry points

- **Server**: `backend/server.js` (`npm start` / `npm run dev`). Boot: dotenv → helmet/CSP (`backend/security/csp.js`) → `requestId` → CORS → static SPA (`dist/`) → `/api` rate limiter → route mounts → `/metrics`.
- **Serverless**: `api/forecasts.js`, `api/ingest.js`, `api/metrics.js`, `api/v1/{forecasts,alerts,weather}/*`.
- **Frontend**: `frontend/src/main.tsx` → `App.tsx` (lazy route table) + `frontend/public/serviceWorker.js`.
- **Build**: `npm run build` → `frontend`'s build = `build_model_performance.mjs` → `build_content_engine.mjs` → `vite build` → `scripts/prerender.mjs`; then root `scripts/copy-dist.mjs`.
- **Pipeline**: `scripts/auto_forecast.py`, driven by `.github/workflows/daily_forecast.yml` (Kaggle is retired — ADR 0004; `kaggle_notebooks/` no longer exists).
- Stale: root `package.json` `"main": "index.js"` — no such file.

---

## 5. Backend

```
backend/
  server.js            mount table
  forecastStore.js     switchable Firestore/Postgres persistence (ADR 0002)
  inference.js, tfjs.js, modelInfo.js    TFLite/TFJS single inference path (ADR 0009)
  db.js, metrics.js    Postgres pool, prom-client registry
  routes/              advisory agent chat alerts conversions forecasts predict push weather
  middleware/          cors firebaseAuth rateLimit requestId securityHeaders validation serverlessGuard
  utils/               csvIngestion forecastRow forecastServe forecastFreshness normalization
                       openMeteo predictionCache predictFromStore apiKeyAuth alertAuth csvSafety vapid
  services/            advisoryAgent.js
  alerts/              assess policy lifecycle service store notify digest report
                       channels/{sms,telegram}
  security/csp.js
```

**Route surface** (mounted in `server.js`):

| Mount | Endpoints |
|---|---|
| `/api/v1/forecasts` | `POST /update` (multipart CSV), `POST /ingest-csv`, `GET /`, `GET /bulk`, `GET /metadata`, `GET /history` |
| `/api/v1/alerts` | `GET /`, `GET /:id`, `GET /:id/evidence-card`, `GET /policy`, `GET /transports`, `GET /export.csv`, `GET /id/for`, `POST /preview`, `POST /run`, `POST /:id/review` |
| `/api/predict` | `POST /` (tensor-validated, rate-limited) |
| `/api/advisory`, `/api/agent` | `POST /`, `POST /advisory`, `GET /status` |
| `/api/chat` | `POST /query`, `GET /directory`, `GET /sample-questions` |
| `/api/push` | `GET /vapid-key`, `GET /status`, `POST /{subscribe,unsubscribe,send}` |
| `/api/conversions` | `POST /track`, `POST /dispatch`, `GET /reconciliation`, `GET /debug` |
| `/api/v1/weather` | `GET /`, `GET|POST /batch` |
| `/metrics` | Prometheus exposition incl. forecast-age gauge |

**Alert engine** (Phase 4, ADR 0010): `assess.js` scores rows onto the `NO_ALERT → WATCH → WARNING → SEVERE` ladder from `policy.js`; anything above WATCH needs a named duty officer via `POST /:id/review` (`lifecycle.js`); `notify.js` + `channels/` deliver bilingual SMS/Telegram; `report.js` builds evidence cards; `store.js` persists.

---

## 6. Frontend

```
frontend/src/
  App.tsx        route table (~45 routes, all lazy)
  pages/         28 pages — FrontDoor, Dashboard(live map), Alerts{,Detail}, DistrictDetail,
                 Analytics, Advisories, Status, Blogs/BlogArticle, DownloadCenter, Upload,
                 auth pages (Login/SignUp/Forgot/Set/Update/Callback), UserDashboard, PublicProfile,
                 About/UseCases/Docs/Contact/Terms/Privacy/NotFound, dashboard/Blog{Studio,Editor}
  components/    44 top-level + alerts/ auth/ blog/ map/ status/ ui/ unlumen-ui/ user/
  hooks/         19 — useForecasts useAlertsData useWeather usePrediction useLeafletMap
                 useBandwidthMode useI18n usePushNotifications useTileCache usePageSeo …
  lib/           25 — forecasts alerts alertLayer alertsCsv i18n seoHead structuredData
                 firebase config bandwidth freshness legal avatar connectors blogSeo …
  services/      firebase, pushNotification, tileCache, geolocation, conversionTracking
  content/       site-routes.json, hazard-methodology.json, generated-routes.json, attribution.json
  context/AuthContext.tsx, data/, types/, utils/, styles/
```

Key route split: `/` is the editorial **front door**; the interactive map console lives at `/live` (with `/home*`, `/forecast/overview` as deep links). `/hazards/*`, `/districts/*`, `/retrospectives/*`, `/model-performance` are **build-time generated** pages (`scripts/build_content_engine.mjs` → `generated-routes.json` → prerendered static HTML + sitemap).

Stack: Vite 8, React 18.3, react-router 6, TanStack Query, MUI 6 + Tailwind 4 + shadcn, Leaflet (not Mapbox, despite README), Recharts, framer-motion, jsPDF/html2canvas for evidence-card export, Postgres + Firebase SDKs.

---

## 7. Data & ML pipeline

1. Kaggle produces, GitHub pulls (ADR 0013): four notebooks run daily on Kaggle and `.github/workflows/daily_forecast.yml` (00:00 UTC) pulls the forecast CSV via `scripts/fetch_kaggle_forecast.py` — advisory shape → canonical row, district identity from the published artifact ∪ `git HEAD` ∪ `scripts/etl/districts.py`, `prediction_date` derived as `target_date − horizon`, coverage tally + model provenance in the manifest — plus the dataset builder's `normalization_stats.json`/`dataset_config.json` via `scripts/fetch_kaggle_dataset_meta.py` into `data/kaggle/dataset-meta/` with a drift report against `Models/`. `forecast-pipeline.yml` (trigger + pull) and `weekly_forecast.yml` (heavy ADM3 run + patch release) are dispatch-only. `scripts/auto_forecast.py` (GEE + Open-Meteo + TFLite on the runner) remains as the unscheduled offline fallback.
2. `scripts/validate_forecasts.py` + `scripts/validate_model_bundle.py` gate the CSV and the model bundle.
3. Promoted into `backend/data/forecasts/` and `data/hazardnet_forecasts_latest.csv`; `scripts/build_forecast_snapshot.mjs` / `build_alert_snapshot.mjs` / `build_freshness_artifact.mjs` bake committed JSON snapshots under `frontend/public/data/` so the site works with the API down (ADR 0008).
4. Optional `POST` into the store when repo var `PUSH_TO_API=true`; ingest contract in `backend/utils/forecastRow.js`.
5. Supporting Python packages: `scripts/mlops/` (registry, calibration, drift, evaluate, metrics), `scripts/etl/` (events, bulletins, hydrology, COG, districts, scene manifest), `scripts/hindcast/` (episode replay + scoring against `data/hindcast/`).
6. Persistence schema: `scripts/db/001–008` (forecasts, horizons, user dashboard, blog RLS, meteorological fields, PostGIS ADM3 + hazard events).

---

## 8. Testing

- **Jest** (`jest.config.cjs`): `__tests__/` — 38 root suites (forecast store/row/serve/history/update, ingest, predict, inference, normalization, security + header parity, CORS, push, conversions, SEO/structured data, service worker, prerender, content engine) plus `__tests__/alerts/` (8) and `__tests__/api/` (6). Frontend suites live beside sources in `**/__tests__/`.
- **Python contract tests** (`scripts/tests/`, 30 files): `test_model_claims.py` fails the build if copy advertises horizons/districts the code can't produce; plus ETL, MLOps, hindcast, content engine, workflows, secret-scan, status/alert surface parity.
- **Playwright** (`e2e/`, `playwright.config.ts`): smoke.
- Extra gates: `scripts/check-bundle.mjs`, `check-rag-freshness.mjs`, `validate_env.mjs`, `audit_frontend_design.mjs`, `security_audit.sh`.

---

## 9. Deploy & config

- **Vercel** is primary (`vercel.json`): build `npm run build` → `dist`, SPA rewrite to `404.html`, apex→www redirect, full security-header + CSP block, cache policy per asset class.
- **Firebase** (`firebase.json`, `.firebaserc`, `firestore.rules` default-deny) is legacy applet hosting + one forecast-store backend option.
- Env contract: `.env.example` (4.8 KB), `VERCEL_ENV_TEMPLATE.md`, validated by `scripts/validate_env.mjs`.
- Topology rationale: ADR 0003.

---

## 10. Where to look first

| Task | Start at |
|---|---|
| Add/adjust an API endpoint | `backend/routes/` + mirror in `api/` if it must run serverless |
| Change forecast schema | `backend/utils/forecastRow.js` → `csvIngestion.js` → `scripts/db/*.sql` → `frontend/src/lib/forecasts.ts` |
| Change alert thresholds | `backend/alerts/policy.js` + `__tests__/alerts/policy.test.js` |
| Add a page | `frontend/src/App.tsx` + `frontend/src/pages/` (static pages: `content/site-routes.json` + content engine) |
| Change model | `Models/` + `scripts/gen-model-version.mjs` + `validate_model_bundle.py` + `Models/REGISTRY.json` |
| Change the pipeline | `scripts/auto_forecast.py` + `.github/workflows/daily_forecast.yml` |

---

## 11. Drift / hazards for a newcomer

- `docs/codebase/STRUCTURE.md` still describes `kaggle_notebooks/` and a weekly Kaggle pipeline — **deleted**; the pipeline runs on GitHub Actions (ADR 0004).
- README says **Mapbox GL**; the code uses **Leaflet** (`useLeafletMap.ts`, `leaflet.heat`, `leaflet.markercluster`).
- `Models/hazardnet_int8.tflite` is byte-identical to the FP32 file — retired, not a real INT8 bundle (ADR 0007).
- ADR 0005 (507 ADM3 units, 10/20/30-day horizons) is **accepted but unimplemented**; `scripts/tests/test_model_claims.py` enforces that copy stays at 64 districts / 7+15 days.
- Model scores are **uncalibrated**; `Certain/Probable/Uncertain` are relative bands only (`docs/mlops/CALIBRATION.md`, `docs/MODEL_CARD.md` §6).
- Four duplicated skill-pack trees (`skills/`, `agent/`, `.agents/`, `.claude/`) drift independently.
- The one-off Firebase migration codemods that once lived at the repo root (`fix.cjs`, `replace_auth.js`, `rewrite_*.cjs`) were deleted after the cutover completed; they are not part of any build.
- Only `package-lock.json` is committed (npm — the CI installer). `bun.lock` was deleted on 2026-09-20 (see CONCERNS.md "Two lockfiles").
- `docs/codebase/CONCERNS.md` (486 lines) is the maintained list of known issues — read it before large changes.
