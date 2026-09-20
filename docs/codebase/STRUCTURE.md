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
