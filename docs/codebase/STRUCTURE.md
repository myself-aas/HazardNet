# Codebase Structure

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence / useful starting file |
|---|---|---|
| `frontend/` | Sole npm workspace: browser UI, public assets, prerender scripts | `frontend/package.json`, `frontend/src/App.tsx`, `frontend/scripts/prerender.mjs` |
| `backend/` | Express runtime; routes, middleware, shared services, alert domain, store | `backend/server.js`, `backend/forecastStore.js`, `backend/alerts/service.js` |
| `api/` | Vercel function entries, not an automatic mount of all Express routes | `api/v1/forecasts/bulk.js`, `api/chat/query.js` |
| `scripts/` | Artifact builders, quality gates, ingestion, ETL, hindcast, MLOps, SQL | `scripts/fetch_kaggle_forecast.py`, `scripts/etl/README.md`, `scripts/db/README.md` |
| `ml/`, root notebooks | Forecast/training research and producer notebooks | `ml/HazardNet_auto_train.ipynb`, `ml/hazardnet-auto-forecast-pipeline.ipynb`, `HazardNet_BGD_climatic_hazards.ipynb` |
| `training/` | Scientific training/evaluation code and severity proofs | `training/hazardnet_scientific_pipeline.py`, `training/run_bd_proofs.py` |
| `Models/` | Model artifacts, preprocessing, labels, registry and version metadata | `Models/README.md`, `Models/REGISTRY.json`, `Models/VERSION.json` |
| `data/`, `backend/data/` | Committed datasets, pipeline/evaluation artifacts and forecast snapshots | `data/README.md`, `backend/data/forecasts/` |
| `rag_pipeline/` | Retrieval code, knowledge-base builder and local reference corpus | `rag_pipeline/index.js`, `rag_pipeline/build_agent_knowledge_base.js` |
| `references/`, `skills/` | Agricultural/institutional retrieval source material and task instructions; skills also includes tool-pack links | `references/06_agent_skills/`, `skills/01_tensor_interpretation/` |
| `agent/`, `.claude/`, `memory/` | Additional agent skill entry points/links and session notes | `agent/skills/`, `.claude/skills/`, `memory/log/` |
| `.agents/` | Vendored agent tooling; not application architecture | `.agents/skills/impeccable/SKILL.md`, `eslint.config.js` exclusions |
| `docs/` | Intent, ADRs, audits, operations, science, UI and onboarding docs | `docs/PRODUCT_SPEC.md`, `docs/adr/`, `docs/codebase/` |
| `assets/`, `plugins/` | Additional checked-in docs/assets and plugin manifest | `assets/docs/MODEL_CARD.md`, `plugins/plugin_manifest.json` |
| `__tests__/`, `e2e/`, `load-tests/` | Root Jest, Playwright, and load harnesses | `__tests__/forecastStore.test.js`, `e2e/full-app-qa.spec.ts`, `load-tests/predict.js` |
| `monitoring/`, `results/` | Prometheus/Grafana config and recorded proof output | `monitoring/prometheus.yml`, `results/bd_thresholds_validation.log` |
| `.github/` | CI, forecast publication, model intake, health and secret checks | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| `utils/` | Small shared logging wrapper | `utils/logger.js` |
| `venv/` | Three tracked copies of a Python executable binary; not a portable dependency setup | `git ls-files venv`; use requirement files instead |

### 2) Entry Points

- Browser: `frontend/index.html` → `frontend/src/main.tsx` → `frontend/src/App.tsx`; React lazy route imports and service-worker registration.
- Local/self-host: root `npm start` selects `backend/server.js`. The manifest's `main: index.js` is not the start script and no root `index.js` exists in the tracked inventory.
- Production function examples: `api/predict.js`, `api/forecasts.js`, `api/ingest.js`, `api/metrics.js`, `api/chat/{query,sample-questions}.js`, `api/v1/forecasts/{bulk,history,metadata}.js`, `api/v1/weather.js`, `api/v1/weather/batch.js`, `api/v1/alerts/{index,policy,run,review,evidence-card}.js`.
- Build: `frontend/package.json` chains model-performance/content artifact generation, Vite and prerendering; root build copies output using `scripts/copy-dist.mjs`.
- Jobs: `.github/workflows/daily_forecast.yml` invokes Kaggle retrieval/validation/publication. Other workflow files separately define weekly, manual, MLOps, hindcast and model-intake paths; their existence does not prove successful production runs.

### 3) Module Boundaries

These are observed responsibilities, not invented enforcement rules.

| Boundary | What belongs here | Separation to preserve |
|---|---|---|
| `frontend/src/pages`, `components`, `hooks`, `lib` | Routing/rendering, reusable UI, state/data hooks, browser contracts | Do not treat browser baselines or snapshots as new model computation (`lib/forecasts.ts`) |
| `api/`, `backend/routes/` | Transport-specific input/auth/response adaptation | Shared forecast/chat behavior lives in `backend/utils/forecastServe.js` / `chatService.js` |
| `backend/alerts/` | Assessment, lifecycle, orchestration, storage and notification | Lifecycle validity is separate from persistence (`lifecycle.js`, `store.js`) |
| `backend/forecastStore.js`, `backend/forecastPersistence.js` | Snapshot-backed reads and durable Admin transaction writes | Row/query validation lives in `backend/utils/forecastRow.js` and `forecastServe.js` |
| Python producer / publishing scripts | Data production, validation and publication | Website consumes artifacts; it does not reproduce satellite acquisition in a browser request (`daily_forecast.yml`) |

### 4) Naming and Organization Rules

Frontend uses layer-oriented folders with feature subfolders; backend mixes layers (`routes`, `middleware`, `utils`) and a cohesive `alerts` feature. Components/pages are usually PascalCase; hooks use `useX`; backend utilities camelCase; pipeline scripts mostly snake_case. See `CONVENTIONS.md` for examples.

`@/*` resolves to `frontend/src/*` in both TS and Vite. API source and backend share relative `.js` imports. Generated files such as `frontend/src/content/generated-routes.json`, `rag_pipeline/agent_knowledge_base.json`, and public data snapshots have builder scripts; update sources and regenerate rather than treating output as a coding pattern. `dist/` and `frontend/dist/` are build products, not source.

### 5) Evidence

- `git ls-files`, repository scan run on 2026-09-20
- `package.json`, `frontend/package.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`
- `backend/server.js`, `api/v1/forecasts/bulk.js`, `frontend/vite.config.ts`
- `.github/workflows/daily_forecast.yml`, `scripts/db/README.md`, `.gitignore`

## Historical Discovery Material

The prior standalone map and scan are preserved under `docs/audits/codebase-2026-09-18/`. They are historical evidence, not current architecture guidance. The seven files here replace the prior seven-document discovery set; their required section ordering is retained for existing references (including `CONCERNS.md` §3).
# Structure

**Evidence:** directory tree from `find`, `package.json` `workspaces`, `vercel.json`, `backend/server.js`, `frontend/src/`.

## Top-Level Layout

```
HazardNet/
├── api/                      # Vercel serverless function entry points (mirrors backend/routes for serverless deploy)
│   ├── chat/{query,sample-questions}.js
│   ├── forecasts.js
│   ├── ingest.js
│   ├── metrics.js
│   ├── predict.js
│   └── v1/{alerts,forecasts,weather,batch,history,metadata}.js
├── backend/                  # Express server and server-side logic (also runs as Vercel functions via vercel.json rewrites)
│   ├── server.js             # Express app, Helmet/CSP/rate limit mount, static fallback
│   ├── db.js                 # Firestore client init
│   ├── forecastStore.js      # Firestore-backed forecast CRUD (upsert, fetch latest/history/bulk)
│   ├── forecastPersistence.js# Higher-level persistence with transactional writes
│   ├── modelInfo.js          # Returns model version from Models/VERSION.json
│   ├── metrics.js            # Prom-client registry (forecast-age gauge, request counters)
│   ├── middleware/
│   │   ├── cors.js           # FRONTEND_ORIGIN-scoped CORS (fail-closed in prod)
│   │   ├── firebaseAuth.js   # Firebase ID token verification + dynamic AI rate limiter
│   │   ├── rateLimit.js      # apiLimiter / predictLimiter / alertLimiter
│   │   ├── requestId.js      # Correlated request IDs (X-Request-Id)
│   │   ├── securityHeaders.js# Extra hardening headers
│   │   └── serverlessGuard.js# Vercel serverless runtime guards (payload/time)
│   ├── routes/               # Express Routers mounted under /api/*
│   │   ├── forecasts.js      # GET /api/v1/forecasts, /bulk, /metadata, /history
│   │   ├── predict.js        # POST /api/predict → storedPrediction
│   │   ├── alerts.js         # /api/v1/alerts CRUD, evidence, review, policy
│   │   ├── chat.js           # /api/chat (Gemini-powered Q&A with RAG)
│   │   ├── agent.js          # /api/agent advisory agent
│   │   ├── advisory.js       # /api/advisory (deterministic heuristic fallback)
│   │   ├── events.js         # /api/v1/events historical archive
│   │   ├── push.js           # Web push subscription management
│   │   ├── conversions.js    # Unit conversions endpoint
│   │   └── weather.js        # Open-Meteo proxy
│   ├── security/csp.js       # CSP directive builder
│   ├── services/
│   │   ├── advisoryAgent.js
│   │   └── eventsService.js
│   ├── alerts/               # Alert engine (Phase 4)
│   │   ├── assess.js         # Ladder: NO_ALERT→WATCH→WARNING→SEVERE
│   │   ├── channels/{sms,telegram}.js
│   │   ├── digest.js
│   │   ├── lifecycle.js
│   │   ├── notify.js
│   │   ├── policy.js         # Configurable thresholds, duty-officer gating
│   │   ├── report.js
│   │   ├── service.js
│   │   └── store.js
│   └── utils/
│       ├── forecastRow.js            # CANONICAL ROW PARSER (dual-track severity, meteorological unit conversion, calibrated confidence)
│       ├── forecastServe.js          # Row → API response shaping
│       ├── forecastFreshness.js      # 60s-cached Firestore age probe
│       ├── storedPrediction.js       # POST /api/predict handler (reads latest stored row, ADR 0009)
│       ├── predictFromStore.js       # Shared prediction-from-store path
│       ├── csvIngestion.js, csvSafety.js
│       ├── chatService.js            # Gemini + RAG orchestration
│       ├── ai_fallback_engine.js     # Deterministic heuristic when Gemini unavailable
│       ├── openMeteo.js
│       ├── vapid.js
│       ├── apiKeyAuth.js, alertAuth.js, clientError.js, conversionTracker.js
│       └── logger.js (root utils/logger.js)
├── frontend/                 # React 18 + TypeScript + Vite client (npm workspace)
│   ├── index.html
│   ├── vite.config.ts        # Proxy `/api` to :3001 in dev, build config
│   ├── public/               # Static assets, committed forecast snapshot (data/forecasts-latest.json), sw.js
│   ├── src/
│   │   ├── main.tsx          # React root
│   │   ├── App.tsx           # Router shell
│   │   ├── components/       # UI primitives (cards, gauges, chips, map popups, alert list, severity chart, …)
│   │   ├── pages/            # Route-level components (/, /live, /alerts, /alerts/:id, /district/:id, /dashboard, /u/:username, /hazards, /districts, …)
│   │   ├── hooks/            # React hooks (useForecast, useAlerts, useAuth, useOfflineStatus, useLowBandwidth, …)
│   │   ├── context/          # AuthContext, ThemeContext, AlertContext
│   │   ├── services/         # API client wrappers (fetch with RTK Query under services/api.ts or bespoke fetch)
│   │   ├── lib/              # Domain logic (forecasts.ts with FORECAST_HORIZONS, severity binning, i18n helpers)
│   │   ├── content/          # Static/curated content (site-routes.json, hazard-methodology.json, attribution.json, …)
│   │   ├── data/             # Static GeoJSON (ADM0/ADM1/ADM2 boundaries), district metadata
│   │   ├── styles/           # NASA HDS CSS (generated nasa-hds.css + shadcn layer in index.css)
│   │   ├── types/            # TS type definitions
│   │   ├── utils/            # Helpers (formatting, bengali numerals, colour, confidence bins)
│   │   └── serviceWorker.ts  # Offline cache, snapshot fallback
│   ├── scripts/prerender.mjs # Static prerender for SEO/SSG pages
│   └── vercel.json           # Frontend Vercel config (separate from root)
├── Models/                   # Shipped ML artifacts
│   ├── hazardnet_fp32.tflite
│   ├── hazardnet_int8.tflite (misnamed FP32 — ADR 0007)
│   ├── labels.json, normalization_stats.json, preprocessing_config.json
│   ├── REGISTRY.json, VERSION.json (model registry with SHA-256)
│   ├── calibration/confidence_map.template.json
│   ├── inference_example.py  # Standalone TF Lite inference
│   └── README.md
├── scripts/                  # Build, QA, ETL, MLOps, DB migrations
│   ├── fetch_kaggle_forecast.py   # DAILY BRIDGE: Kaggle output → canonical CSV/JSON/manifest
│   ├── validate_forecasts.py      # Freshness + coverage gate
│   ├── ingest_forecast_csv.mjs    # CSV → Firestore ingest
│   ├── publish_forecast_csv.py    # GitHub Release attachment
│   ├── build_forecast_snapshot.mjs, build_alert_snapshot.mjs, build_freshness_artifact.mjs
│   ├── build_content_engine.mjs   # Static /hazards and /districts pages from snapshot
│   ├── build_model_performance.mjs
│   ├── build_hazard_archive.mjs, build_archive_rag_docs.mjs
│   ├── build_climatic_data_artifacts.mjs
│   ├── check-{bundle,claims,design,phase7,public-paths,rag-freshness,severity-embargo,ux-release}.mjs
│   ├── validate_env.mjs, validate_model_bundle.py
│   ├── auto_forecast.py, physics_severity.py, kaggle_trigger.py
│   ├── gen-model-version.mjs, generate-icons.mjs, copy-dist.mjs, import_nasa_tokens.mjs, npm-audit-ci.mjs
│   ├── check-secrets.sh, security_audit.sh, setup_monitoring.sh, verify-actions-secrets.sh
│   ├── db/                  # SQL migrations (historical; Firestore is current per ADR 0014)
│   ├── etl/                 # Python ETL (GEE, COG, bulletins, districts, hydrology, events, sources, scene_manifest, db)
│   ├── mlops/               # Python MLOps (calibration, drift, evaluate, metrics, registry, retrain_state, cli)
│   ├── hindcast/            # Hindcast episodes/fetch/score for historical validation
│   ├── qa/                  # Browser/layout/design/accessibility audits
│   ├── tiles/build-adm3-tiles.sh
│   └── tests/               # Python + JS tests for scripts and fixtures
├── __tests__/                # Jest tests (Jest config at root) — API, alerts, forecasting, security, design tokens, SEO, SW
├── ml/                       # Training notebooks (train_and_convert.ipynb, HazardNet_auto_train.ipynb, hazardnet-auto-forecast-pipeline output)
├── training/                 # Python training pipeline (hazardnet_scientific_pipeline.py, hazardnet_bd_thresholds.py, run_bd_proofs.py)
├── data/                     # Data at rest
│   ├── hazardnet_forecasts_latest.csv
│   ├── events/{BGD_climatic_hazards_dataset_2000_2026.csv, hazardnet-events.json}
│   ├── design/nasa-hds/{tokens.json, PROVENANCE.md}
│   ├── hindcast/, rag/
│   └── icons/hazard_profiles.json
├── backend/data/forecasts/   # Committed latest forecast CSV/JSON/manifest (auto-updated by daily workflow)
├── docs/                     # Project documentation (ADRs, DESIGN-SYSTEM, MLOPS, ALERTS, RUNBOOKS)
│   └── codebase/             # The seven Acquire-Codebase-Knowledge docs
├── skills/                   # Markdown knowledge modules for agent skills (tensor interpretation, severity quantification, hazard protocols, agricultural/meteorological institutions, etc.)
├── references/               # Source reference material (fisheries, livestock, variety database, spatial context, agent skills)
├── rag_pipeline/             # RAG retrieval components for the chat agent
│   ├── search.js, skill_router.js
│   └── references/           # Markdown KB files (hazard archives)
├── assets/docs/MODEL_CARD.md
├── utils/logger.js            # Root-level Winston/Pino-style lightweight logger used by scripts
├── .github/workflows/        # 12 CI/CD workflows (daily_forecast, forecast-pipeline, hindcast, model-validation, mlops, ci, v3-ml-contracts, etc.)
├── vercel.json               # Vercel project config (build command, headers, redirects, rewrites, functions includeFiles)
├── firebase.json, firestore.rules, firebase-applet-config.json, firebase-blueprint.json, .firebaserc
├── DESIGN.md                 # Design-system YAML tokens and spec
├── HazardNet.md              # Full 7-phase scientific pipeline code (Phases 1–7, Colab/Kaggle source)
├── README.md, LICENSE, CITATION.cff, SECURITY.md, ARTIFACTS.yaml
├── babel.config.cjs, jest.config.cjs, jest.setup.ts, eslint.config.js, .prettierrc, playwright.config.ts
├── .env.example              # All env vars documented
├── audit-exceptions.json     # Accepted audit exceptions
└── e2e/, load-tests/, memory/, monitoring/, plugins/
```

## Entry Points

- **Production serverless entry points (Vercel):** files under `api/*` (e.g. `api/predict.js`, `api/forecasts.js`, `api/v1/alerts/index.js`).
- **Self-hosted Express server:** `backend/server.js` (serves API + static frontend from `frontend/dist`).
- **Frontend dev/build:** `frontend/src/main.tsx` (Vite).
- **CLI scripts:** invoked through `npm run …` (see `package.json` scripts) or `python3 -m scripts.etl.cli`, `python3 -m scripts.mlops.cli`, `python3 -m scripts.hindcast.cli`.
- **Training:** Jupyter notebooks in `ml/` and Python modules in `training/`.
- **Daily forecast pipeline:** GitHub Actions → `.github/workflows/daily_forecast.yml` → `scripts/fetch_kaggle_forecast.py` → `scripts/validate_forecasts.py` → `scripts/build_forecast_snapshot.mjs` → commit.

## TypeScript Path Aliases
[TODO] `frontend/tsconfig.json` baseUrl/paths mapping was not loaded during this pass; imports in `frontend/src` appear to use relative paths throughout (no `@/` alias usage observed in sampled files). [ASK USER] Confirm whether any `@/` or `~/` path aliases exist in `frontend/tsconfig.json` that should be documented.
