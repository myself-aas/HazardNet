# Technology Stack

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|---|---|---|
| Application languages | JavaScript ESM backend; TypeScript/TSX frontend; Python pipelines/training | `package.json`, `frontend/tsconfig.json`, `scripts/auto_forecast.py`, `training/hazardnet_scientific_pipeline.py` |
| Runtime versions | Node `>=20` declared; main CI uses Node 20 and Python 3.11; inspection shell Node 22.22.3, npm 10.9.8, Python 3.11.2 | `package.json`, `.github/workflows/ci.yml`; terminal version commands |
| Package manager | npm workspaces, sole declared workspace `frontend`; pip requirement files for separate Python environments | `package.json`, `package-lock.json`, `scripts/requirements-pipeline.txt`, `training/requirements.txt` |
| Build | Vite 8 / React plugin / Tailwind Vite plugin; content generation → Vite → prerender → root dist copy | `frontend/package.json`, `frontend/vite.config.ts`, `scripts/copy-dist.mjs` |
| Deployment | Vercel static site + serverless handlers; Express for self-host/local use | `vercel.json`, `docs/adr/0003-deploy-topology.md`, `backend/server.js` |

No tracked Docker/container manifest was found by the scan. `.gitignore` explicitly ignores several Docker filenames, so this is not proof that operators have none externally. [TODO] Actual production Node/Python versions and installed external tooling.

### 2) Production Frameworks and Dependencies

React 18.3.1, React Router, TanStack Query, Leaflet, Firebase, Express, Firebase Admin, Google GenAI, and prom-client are declared application dependencies. Leaflet is used in `frontend/src/hooks/useLeafletMap.ts`; Mapbox is not a declared frontend dependency despite README badges/copy. The TFJS request runtime and npm dependencies were removed under ADR 0009; the batch model remains separate. Stored forecast serving does not imply request-time inference: see `ARCHITECTURE.md` and `CONCERNS.md`.

The complete direct dependency inventory below is copied from the manifests. Versions are **declared ranges**, not a statement that the minimum version is installed; exact npm resolutions live in `package-lock.json`. `firebase-admin` is now a root runtime dependency for authentication and the dedicated forecast writer.

#### `package.json` — `dependencies`

| Dependency | Declared version |
|---|---|
| `@google/genai` | `^2.15.0` |
| `busboy` | `^1.6.0` |
| `cors` | `^2.8.5` |
| `csv-parser` | `^3.2.1` |
| `dompurify` | `^3.4.15` |
| `dotenv` | `^17.4.2` |
| `express` | `^4.18.2` |
| `express-rate-limit` | `^7.5.0` |
| `firebase` | `^12.17.0` |
| `firebase-admin` | `^14.4.0` |
| `helmet` | `^8.1.0` |
| `jsonwebtoken` | `^9.0.0` |
| `multer` | `^2.2.0` |
| `prom-client` | `^15.1.3` |
| `web-push` | `^3.6.7` |
| `zod` | `^3.23.0` |

#### `package.json` — `devDependencies`

| Dependency | Declared version |
|---|---|
| `@babel/core` | `^7.22.11` |
| `@babel/preset-env` | `^7.22.11` |
| `@babel/preset-react` | `^7.22.6` |
| `@babel/preset-typescript` | `^7.22.5` |
| `@eslint/js` | `^9.39.5` |
| `@playwright/test` | `^1.62.1` |
| `@testing-library/jest-dom` | `^6.9.1` |
| `@testing-library/react` | `^14.3.1` |
| `@types/jest` | `^29.5.14` |
| `@types/jest-axe` | `^3.5.9` |
| `@types/supertest` | `^7.2.1` |
| `@vitejs/plugin-react` | `^6.1.1` |
| `babel-jest` | `^30.4.1` |
| `babel-plugin-transform-import-meta` | `^2.3.3` |
| `eslint` | `^9.39.0` |
| `eslint-plugin-react-hooks` | `^5.2.0` |
| `globals` | `^17.11.0` |
| `impeccable` | `^4.1.0` |
| `jest` | `^29.7.0` |
| `jest-axe` | `^9.0.0` |
| `jest-environment-jsdom` | `^30.4.1` |
| `node-mocks-http` | `^1.11.0` |
| `prettier` | `^3.6.2` |
| `supertest` | `^7.2.2` |
| `ts-jest` | `^29.4.12` |
| `typescript` | `^5.4.5` |
| `typescript-eslint` | `^8.46.0` |

#### `frontend/package.json` — `dependencies`

| Dependency | Declared version |
|---|---|
| `@base-ui/react` | `^1.6.0` |
| `@emotion/react` | `^11.11.0` |
| `@emotion/styled` | `^11.11.0` |
| `@fontsource-variable/inter` | `^5.3.0` |
| `@fontsource-variable/public-sans` | `^5.3.0` |
| `@fontsource/dm-mono` | `^5.3.0` |
| `@mui/material` | `^6.0.0` |
| `@tailwindcss/vite` | `^4.3.3` |
| `@tanstack/react-query` | `^5.0.0` |
| `@vercel/analytics` | `^2.0.1` |
| `class-variance-authority` | `^0.7.1` |
| `clsx` | `^2.1.1` |
| `firebase` | `^12.17.0` |
| `framer-motion` | `^13.0.0` |
| `html2canvas` | `^1.4.1` |
| `html2canvas-pro` | `^2.4.0` |
| `jspdf` | `^4.2.1` |
| `leaflet` | `^1.9.4` |
| `leaflet.heat` | `^0.2.0` |
| `leaflet.markercluster` | `^1.5.3` |
| `lucide-react` | `^1.28.0` |
| `qrcode.react` | `^4.2.0` |
| `react` | `18.3.1` |
| `react-dom` | `18.3.1` |
| `react-hot-toast` | `^2.6.0` |
| `react-markdown` | `^10.1.0` |
| `react-router-dom` | `^6.24.0` |
| `recharts` | `^2.9.0` |
| `shadcn` | `^4.16.1` |
| `tailwind-merge` | `^3.6.0` |
| `tailwindcss` | `^4.3.3` |
| `tw-animate-css` | `^1.4.0` |

#### `frontend/package.json` — `devDependencies`

| Dependency | Declared version |
|---|---|
| `@testing-library/jest-dom` | `^6.9.1` |
| `@testing-library/react` | `^14.3.1` |
| `@types/jest` | `^29.5.14` |
| `@types/leaflet` | `^1.9.21` |
| `@types/leaflet.heat` | `^0.2.5` |
| `@types/leaflet.markercluster` | `^1.5.6` |
| `@types/node` | `^20.0.0` |
| `@types/react` | `^18.3.3` |
| `@types/react-dom` | `^18.3.0` |
| `@vitejs/plugin-react` | `^6.1.1` |
| `ts-jest` | `^29.4.12` |
| `typescript` | `^5.4.5` |
| `vite` | `^8.3.0` |

#### `scripts/requirements-pipeline.txt`

```text
kaggle==1.8.4
pandas==3.0.5
numpy==2.4.6
pytest==9.1.1
pyyaml==6.0.3
```

#### `scripts/requirements-inference.txt`

```text
earthengine-api==0.1.412
requests==2.32.3
tqdm==4.66.4
pandas==2.2.2
numpy==1.26.4
opencv-python-headless==4.10.0.84
tflite-runtime==2.14.0
```

#### `training/requirements.txt`

```text
torch
numpy
pandas
scikit-learn>=1.1
tqdm
h5py
matplotlib
seaborn
joblib
pytest
```

### 3) Development Toolchain

- ESLint 9 flat config with TypeScript and React hooks rules: `eslint.config.js`.
- Prettier 3 configuration: `.prettierrc`; strict TypeScript checking: `frontend/tsconfig.json`.
- Jest 29, Babel transform, jsdom, Testing Library, Supertest, jest-axe: `jest.config.cjs`, `babel.config.cjs`, `jest.setup.ts`.
- Playwright browser testing: `playwright.config.ts`; pytest pipeline/science testing: Python requirements and `.github/workflows/ci.yml`.
- Python pipeline pins: `scripts/requirements-pipeline.txt`; separate legacy inference pins: `scripts/requirements-inference.txt`; scientific dependencies (including unpinned torch/numpy/pandas) in `training/requirements.txt`. Do not combine these into one assumed reproducible environment.

### 4) Key Commands

Run from the repository root unless noted:

```bash
npm ci
npm run build                 # frontend build/prerender, then copy to root dist
npm start                     # Express + existing frontend/dist, 0.0.0.0:3000
npm run dev                   # builds first, then starts Express; not a Vite watcher
npm --prefix frontend run dev # Vite; separate API process needed (port mismatch noted below)
npm run lint                  # tsc --noEmit
npm run lint:eslint
npm test -- --runInBand
npm run check:embargo
node scripts/check-claims.mjs
```

Build requires dependencies and may regenerate committed content artifacts. Vite binds port 3000 and proxies API/health/metrics to 3001, while direct Express startup is hardcoded to 3000 (`frontend/vite.config.ts`, `backend/server.js`). Until corrected, prefer the built single-process Express path rather than assuming the two dev commands work together.

### 5) Environment and Config

- `.env.example` documents variable names; local `.env` is ignored. `backend/server.js`/`backend/db.js` load dotenv; Vite reads env from the parent directory.
- `BACKEND_API_KEY` gates ingest/broadcast; `FRONTEND_ORIGIN` controls production CORS. Missing API key fails protected operations closed, not the entire app startup (`backend/utils/apiKeyAuth.js`, `backend/server.js`).
- AI provider keys and VAPID keys are feature-specific, not prerequisites for static browsing. Firebase app configuration is in `firebase-applet-config.json` plus frontend env/config modules.
- `ALERT_*`, SMS gateway keys, and Telegram variables configure alert review/delivery; exact consumers are listed in `INTEGRATIONS.md`.
- `DATABASE_URL`/`FORECAST_STORE` in the env template do not select a PostgreSQL forecast backend: `getForecastStoreMode()` returns `firestore` unconditionally.

### 6) Evidence

- `package.json`, `package-lock.json`, `frontend/package.json`
- `frontend/vite.config.ts`, `frontend/tsconfig.json`, `vercel.json`
- `.github/workflows/ci.yml`, `.env.example`, `backend/forecastStore.js`
- `scripts/requirements-pipeline.txt`, `scripts/requirements-inference.txt`, `training/requirements.txt`
# Stack

**Evidence:** `package.json`, `frontend/package.json`, `scripts/requirements-pipeline.txt`, `training/requirements.txt`, `vercel.json`, `.env.example`, `Models/hazardnet_fp32.tflite`.

## Language & Runtime

| Layer | Language | Runtime | Source |
|-------|----------|---------|--------|
| Backend / API | JavaScript (ES modules) | Node.js 20+ | `package.json` `"engines"` enforcement, `backend/server.js` |
| Frontend | TypeScript 5.4+ / TSX | Vite 8.3 dev/build | `frontend/package.json`, `frontend/vite.config.ts` |
| Data / MLOps / ETL | Python 3.8+ | CPython (venv) | `scripts/etl/`, `scripts/mlops/`, `scripts/hindcast/`, `training/`, `scripts/fetch_kaggle_forecast.py` |
| ML Inference (production edge) | TFLite FP32 | TensorFlow Lite runtime | `Models/hazardnet_fp32.tflite`, `Models/inference_example.py` |
| ML Training | PyTorch | CUDA/CPU (Kaggle/Colab) | `training/hazardnet_scientific_pipeline.py`, `HazardNet.md` Phases 3–6 |
| CI/CD | YAML workflows | GitHub Actions | `.github/workflows/*.yml` |

## Core Frameworks & Libraries

### Production Runtime (backend `dependencies`)
- **`express@^4.18.2`** — HTTP server and API routing.
- **`@google-cloud/firestore@^7.11.6`** + **`firebase-admin@^13.10.0`** — Firestore transactional store for forecasts and alerts (ADR 0014 supersedes PostgreSQL).
- **`firebase@^12.17.0`** — Client SDK used server-side for token verification (mirrors client).
- **`helmet@^8.1.0`** — Security headers (CSP, HSTS, X-Frame-Options, etc.).
- **`cors@^2.8.5`** — CORS allowlist with production fail-closed.
- **`express-rate-limit@^7.5.0`** — Tiered rate limiting (global, AI, predict, alerts).
- **`jsonwebtoken@^9.0.0`** — API key / custom JWT auth helpers.
- **`zod@^3.23.0`** — Runtime schema validation.
- **`@google/genai@^2.15.0`** — Gemini 2.0 for advisory agent (chat/agent routes, falls back to deterministic heuristic engine if unset).
- **`dompurify@^3.4.15`**, **`busboy@^1.6.0`**, **`multer@^2.2.0`** — Input sanitisation and multipart handling.
- **`csv-parser@^3.2.1`** — CSV ingestion for `POST /api/ingest`.
- **`prom-client@^15.1.3`** — Prometheus `/metrics` endpoint.
- **`web-push@^3.6.7`** — VAPID web push notifications.
- **`dotenv@^17.4.2`** — Environment variable loading.

### Frontend (`frontend/package.json`)
- **`react@18.3.1`** / **`react-dom@18.3.1`** — UI framework.
- **`react-router-dom@^6.24.0`** — SPA routing.
- **`@tanstack/react-query@^5`** — Server-state caching for forecast/alert API calls.
- **`vite@^8.3.0`** / **`@vitejs/plugin-react@^6.1.1`** — Dev server and bundler.
- **`tailwindcss@^4.3.3`** + **`@tailwindcss/vite`** — Styling (with NASA HDS tokens layered on top in `frontend/src/index.css`).
- **`leaflet@^1.9.4`** + `leaflet.heat`, `leaflet.markercluster` — Interactive slippy map (Mapbox GL was removed in favour of Leaflet + free tiles; README references Mapbox but code uses Leaflet — an intent-vs-reality divergence flagged in CONCERNS.md).
- **`recharts@^2.9.0`** — Severity gauges and time-series charts.
- **`framer-motion@^13`** — Motion (NASA rules: no bounce/pulse/loop).
- **`@mui/material@^6`** / **`@emotion/*`** — Some base primitives alongside shadcn-style components.
- **`lucide-react`, `qrcode.react`, `react-markdown`, `react-hot-toast`, `jspdf`, `html2canvas-pro`** — Icons, QR codes, markdown rendering, toasts, evidence-card PDF export.
- **`@fontsource-variable/inter`, `@fontsource-variable/public-sans`, `@fontsource/dm-mono`** — Self-hosted typography (no external font requests).
- **`@vercel/analytics@^2.0.1`** — Privacy-friendly analytics.

### Python (ETL / MLOps / training)
From `scripts/requirements-pipeline.txt` and `training/requirements.txt`:
- `torch`, `torchvision` — Model architecture, training, tensor manipulation.
- `tensorflow`, `tensorflow-lite` (implicit via `tf.lite`) — TFLite conversion and inference verification.
- `onnx`, `onnx2tf` — PyTorch → ONNX → TFLite bridge.
- `numpy`, `pandas`, `scikit-learn` — Data processing and evaluation metrics.
- `rasterio`, `h5py` — GeoTIFF and HDF5 (master tensor store).
- `geopandas` — Spatial join for district/division boundaries.
- `earthengine-api` (Kaggle kernel) — Sentinel-1/2, ERA5-Land retrieval.
- `requests` — Open-Meteo API fetcher.
- `kaggle` — Kaggle CLI for kernel output retrieval.
- `matplotlib`, `seaborn` — Publication figures (confusion matrix, scatter, heatmaps).
- `tqdm`, `wandb` (optional) — Progress bars and experiment tracking.
- `psycopg2-binary` referenced in SQL migrations but ADR 0014 moves forecast persistence to Firestore.

### ML Model Artifacts
- `Models/hazardnet_fp32.tflite` — The deployed inference model (FP32 3D-CNN, ~137k parameters). The `hazardnet_int8.tflite` file is a misnamed FP32 copy (ADR 0007 — TFLite CONV_3D kernel requires FP32; INT8 quantisation crashes at runtime).
- `Models/normalization_stats.json` — Per-band z-score mean/std (15 bands).
- `Models/labels.json` — 8 class labels index → hazard name.
- `Models/preprocessing_config.json` — Input shape `[1, 15, 10, 64, 64]`, NCDHW→NDHWC transpose requirement, band order.

## Hosting & Deployment Target
- **Vercel** primary production host (serverless functions in `api/`, `vercel.json` rewrites/headers).
- **Docker / docker-compose** (per README) for self-hosted full-stack (Express + Vite build + PostgreSQL), though PostgreSQL is superseded by Firestore.
- **Firebase** project `hazardnet-aas48424` (Auth, Firestore, Storage, Realtime DB for legacy).
- **GitHub Actions** orchestrates daily/weekly forecast pipelines, model validation, hindcast, MLOps drift checks.
- **Kaggle Notebooks** produce the daily forecast (the CNN does **not** run in Vercel or the browser).

## Dev Tooling
- **Jest** + **Babel** + **Testing Library** — Unit/integration tests (`__tests__/`, `scripts/tests/`).
- **Playwright** (`@playwright/test`) — E2E tests (`e2e/`, `playwright.config.ts`).
- **ESLint 9**, **Prettier**, **TypeScript** — Code quality.
- **`impeccable`** — Design/QA audit CLI (`scripts/qa/`).
- **Scripts**: 60+ Node and Python build/check scripts in `scripts/` for content builds, model validation, secret scanning, tile generation, QA audits.

[TODO] Exact Node engine floor is not declared in `package.json`; README states "Node 20+" but `engines` field is absent.
