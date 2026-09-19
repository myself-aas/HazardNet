# 🌐 HazardNet: Multi-Hazard AI Forecasting for Bangladesh Agriculture

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![TensorFlow Lite](https://img.shields.io/badge/TFLite-FP32-orange.svg)](https://www.tensorflow.org/lite)
[![Mapbox GL](https://img.shields.io/badge/Mapbox-GL-green.svg)](https://docs.mapbox.com/mapbox-gl-js)
[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/myself-aas/HazardNet/blob/main/ml/train_and_convert.ipynb)
[![Daily forecast](https://github.com/myself-aas/HazardNet/actions/workflows/daily_forecast.yml/badge.svg)](https://github.com/myself-aas/HazardNet/actions/workflows/daily_forecast.yml)
[![Model validation](https://github.com/myself-aas/HazardNet/actions/workflows/model-validation.yml/badge.svg)](https://github.com/myself-aas/HazardNet/actions/workflows/model-validation.yml)

**HazardNet** is a production-ready, edge-first web application for real-time multi-hazard classification and severity quantification across Bangladesh's 64 agricultural districts. Built for operational deployment and aligned with IEEE TGRS submission standards, it leverages a 3D Depthwise-Separable CNN, deterministic climate forecasting, and TensorFlow Lite WASM to deliver sub-100ms, offline-capable hazard predictions.

🔗 **Live Platform**: [hazardnet.live](https://hazardnet.live) *(Replace with actual URL)*  
🗄️ **Forecast Archive**: weekly artifacts are attached to this repo's [GitHub Releases](https://github.com/myself-aas/HazardNet/releases) (one set per Sunday pipeline run, tag `vX.Y.Z`): the ingest-compatible forecasts CSV (64 ADM2 districts × 7- and 15-day horizons, dual-track severity), plus — when computed — the ADM3 location matrix, the OSM exposure overlay, and the ADM3 hazard+exposure GeoJSON (ADR 0006). Queryable history: 
`GET /api/v1/forecasts/history?from=YYYY-MM-DD&to=YYYY-MM-DD` (optional `&horizon=7_days|15_days`, `&district_id=N`, `&format=csv` for an archive-format export).

---

## 📑 Table of Contents

- [Overview](#overview)
- [Supported Hazards & Horizons](#supported-hazards--horizons)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Installation & Local Development](#installation--local-development)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [Scientific Reproducibility (IEEE TGRS)](#scientific-reproducibility-ieee-tgrs)
- [Contributing](#contributing)
- [License](#license)

---

## 🌍 Overview

Agricultural disaster risk in Bangladesh requires high-resolution, temporally aware forecasting. HazardNet aggregates 15-channel spatio-temporal tensors (SAR, Optical, ERA5-Land) with deterministic Open-Meteo climate projections to generate **7- and 15-day** hazard forecasts across Bangladesh's **64 districts** (ADM2). The 507-unit ADM3 expansion and the 10/20/30-day horizons were accepted in [ADR 0005](docs/adr/0005-adm3-hdx-horizons.md) but are **not implemented yet** — the ingest contract, the store, the API and the website all run the 64-district, 7/15-day product, and `scripts/tests/test_model_claims.py` fails the build when copy advertises anything else. 

Unlike traditional black-box models, HazardNet employs a **Dual-Track Severity Indexing** system: it cross-validates the CNN's probabilistic severity output against robust, physics-based cognitive formulas (e.g., Vegetation Health Index for Drought, Excess Heat Factor for Heat Waves), ensuring scientifically grounded and transparent decision support for farmers and extension officers.

---

## 🌪️ Supported Hazards & Horizons

The model classifies **8 distinct climatic hazards** across two actionable lead-time windows:

| Hazard Type | Primary Drivers (15-Channel Input) |
|-------------|------------------------------------|
| **Cold Wave** | Min_Temp, Dewpoint, Soil_T1, Wind |
| **Drought** | NIR, Red, Temp_2m, Soil_W1, Soil_W3 |
| **Fire** | Temp_2m, Solar_Rad, Soil_W1, Wind |
| **Flash Flood** | SAR_VV, SAR_VH, Precip, Soil_W1 |
| **Flood** | SAR_VV, SAR_VH, Precip, Soil_W1, Soil_W3 |
| **Heat Wave** | Max_Temp, Temp_2m, Solar_Rad, Soil_W1 |
| **Severe Local Storm** | Precip, Wind_Max, SAR_VH variability |
| **Tropical Cyclone** | Wind_Max, Precip, SAR_VV/VH gradients |

**Forecasting Horizons** (7 and 15 days — the horizons the pipeline actually runs):
- **7 Days**: Driven by short-term deterministic weather forecasts (Open-Meteo Daily).
- **15 Days**: The medium-term outlook. Open-Meteo's deterministic API serves at most 16 days, so this window stays inside the deterministic range.
- **10/20/30-day horizons are *not* live.** [ADR 0005](docs/adr/0005-adm3-hdx-horizons.md) accepted them (2026-09-12), but the implementation still runs 7/15: `FORECAST_HORIZONS` in `frontend/src/lib/forecasts.ts`, the ingest contract in `backend/utils/forecastRow.js`, and every published page advertise 7 and 15 days, and `scripts/tests/test_model_claims.py` fails the build if any of them start advertising a horizon the code cannot produce. Treat ADR 0005's horizon change as pending, not shipped.

---

## ⚡ Key Features

1. **Hierarchical Geospatial Drill-Down**: Interactive Mapbox GL interface utilizing official FAO GAUL boundaries. Users can view Division-level (ADM1) aggregates and drill down to District-level (ADM2) severity heatmaps.
2. **Dual-Track Severity Quantification**: Displays both *Model Severity* (CNN output) and *Physics Severity* (Open-Meteo formula proxy) side-by-side, so the two independent lines of evidence can be compared and their divergence measured. The model score itself is **not** calibrated and is labelled as such everywhere it is shown ([`docs/mlops/CALIBRATION.md`](docs/mlops/CALIBRATION.md)).
3. **Edge-First TFLite WASM Inference**: The FP32 model (~0.75 MB) runs directly in the browser via `@tensorflow/tfjs-backend-wasm` for low-latency, offline-capable viewing. There is no INT8 bundle — the file named `hazardnet_int8.tflite` is a byte-identical copy of the FP32 artifact and is retired in the registry ([ADR 0007](docs/adr/0007-browser-model-assets.md)).
4. **Automated MLOps Pipeline (Kaggle produces, GitHub Actions publishes)**: four Kaggle notebooks run daily on Kaggle's own schedule — hazards → severity → dataset builder → advisory forecast — and [`.github/workflows/daily_forecast.yml`](.github/workflows/daily_forecast.yml) pulls the result at 00:00 UTC: [`scripts/fetch_kaggle_forecast.py`](scripts/fetch_kaggle_forecast.py) bridges the notebook's advisory table onto the committed canonical row schema (district identity and pcodes from real published records, `prediction_date` derived as `target_date − horizon`, a coverage tally that names any district the producer skipped), [`scripts/validate_forecasts.py`](scripts/validate_forecasts.py) gates freshness and coverage, and the run commits `backend/data/forecasts/` plus the website snapshot (`frontend/public/data/forecasts-latest.json`) so every deployment carries the freshest forecast even when the API is unreachable. The same run pulls the dataset builder's `normalization_stats.json` and `dataset_config.json` into `data/kaggle/dataset-meta/` and reports how far they have drifted from the normalization the shipped model was trained with. Monthly retraining is a human run of [`ml/HazardNet_auto_train.ipynb`](ml/HazardNet_auto_train.ipynb) on a Colab T4, whose last cell opens a pull request that `model_intake.yml` gates and a person merges. See [docs/mlops/ARCHITECTURE.md](docs/mlops/ARCHITECTURE.md) and [ADR 0013](docs/adr/0013-kaggle-is-the-forecast-producer.md).
5. **Score Binning (relative, not calibrated)**: Predictions are labelled `Certain` (≥0.85), `Probable` (0.70–0.85), or `Uncertain` (<0.70) as a *relative* band for scanning a list. These bands describe the model's own uncalibrated score, not a measured probability of an event — see the model card ([`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) §6) before quoting any number.
6. **Alert engine with a human gate (Phase 4)**: The backend turns forecast rows into alerts on the PRODUCT_SPEC §1.3 ladder (`NO_ALERT` → `WATCH` → `WARNING` → `SEVERE`), auto-publishes nothing above `WATCH`, requires a named duty officer to approve or reject anything higher (rejections are stored as evaluation labels), and delivers to SMS/Telegram subscribers in English and Bengali — every message carrying the §1.7 disclaimer. See [`docs/alerts/ALERT_ENGINE.md`](docs/alerts/ALERT_ENGINE.md).
8. **Alert surface with a Bengali/English UI and a working offline path (Phase 5)**: `/alerts` lists every published alert with its level, hazard, horizon, evidence trail and the policy in force; `/alerts/:id` is a printable evidence card (PDF via the shared exporter) that carries the §1.7 disclaimer; `/district/:id` shows that district's alert next to its forecast. The whole surface is bilingual (Bengali numerals and dates included, `lang` set per element), renders from the live API **or** the committed `alerts-latest.json` snapshot **or** a service-worker-labelled offline copy — and always says which one you are looking at. Low-bandwidth mode (Data Saver, 2G, ≤2 GB RAM, ≤4 cores, or the user's own toggle) swaps satellite raster tiles for the vector map, drops the animations, and lands on the text table that also serves as the map's screen-reader alternative. See [`docs/frontend/ALERT_UI.md`](docs/frontend/ALERT_UI.md) and [`docs/frontend/ACCESSIBILITY.md`](docs/frontend/ACCESSIBILITY.md).
9. **User Dashboards & Unique Profile URLs**: Every signed-in user gets a dedicated dashboard at `/dashboard` with a unique username that becomes their public profile URL (`/u/<username>`), ~40 Supabase-backed profile fields, avatar upload (client-side resize/compress with replace-on-update), connector integrations (Open-Meteo, WhatsApp, SMS, Slack, webhooks, …), and passwordless email-verification sign-up — see [docs/user-dashboard.md](docs/user-dashboard.md).
10. **Public content surface built from the model's own output (Phase 8)**: [`/hazards`](frontend/src/content/hazard-methodology.json) carries one methodology page per hazard class — what the model labels, the formula its independent physics cross-check computes, the confidence semantics and the class's stated limits — and a page per district under `/districts` shows the current run's hazard class, severity, confidence and physics divergence for that district, or says plainly that the run did not cover it. Every page is composed at build time by [`scripts/build_content_engine.mjs`](scripts/build_content_engine.mjs) from the committed snapshot, is prerendered to static HTML with its own canonical on `www.hazardnet.live`, breadcrumbs and JSON-LD, and appears in a sitemap generated from the build (so it can never list a URL the site does not serve). Season retrospectives and district history sections appear only when a historical event archive is loaded — the pages state that rather than quoting the model card's 2,931-event claim as if it had been read. Where the archive is absent, the copy says so; the test that enforces this is [`scripts/tests/test_content_engine.py`](scripts/tests/test_content_engine.py).

11. **An editorial front door at `/`, and the console at `/live`**: the root is an editorial page — what the platform is for, what the last run produced, a dated ledger of the knowledge products, the authority boundary against BMD/FFWC/DDM, and the attribution block — while the map keeps every behaviour it had and moved to `/live` (with `/home*` and `/forecast/overview` kept as deep links, and `/?district=<id>` forwarded). Every figure on the front door is read from a committed artifact and printed with the run that produced it; a missing value renders as the sentence that says it is missing, never as a zero. Copy lives in [`frontend/src/content/site-routes.json`](frontend/src/content/site-routes.json) so the static HTML, the app and the `<head>` stay one text. See [docs/PUBLIC_SURFACE.md](docs/PUBLIC_SURFACE.md).

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. DATA PIPELINE (Weekly Kaggle Automation)                         │
│  - GEE: Sentinel-1/2 + ERA5-Land (Historical T-9 to T-1)            │
│  - API: Open-Meteo Deterministic Forecast (T-0 Injection)           │
│  - Inference: TFLite FP32 (NDHWC format) → CSV Output               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ (GitHub Actions Webhook)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. BACKEND API (Node.js + Express + PostgreSQL)                     │
│  - POST /api/v1/forecasts/update: Ingests weekly CSV, upserts to DB │
│  - GET  /api/v1/forecasts: Serves district/division forecasts       │
│  - GET  /api/v1/forecasts/bulk: Serves heatmap data for Mapbox      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ (REST / RTK Query)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. FRONTEND WEB APP (React 18 + TypeScript + Vite)                  │
│  - Mapbox GL: ADM0/ADM1/ADM2 GeoJSON layers with severity fills     │
│  - Prediction Panel: Hazard cards, Dual-Severity Gauges, Top-K bars │
│  - Edge Mode: TFLite WASM loader + Service Worker (Offline Cache)   │
└─────────────────────────────────────────────────────────────────────┘
```


---

## 🚀 Installation & Local Development

The easiest way to run the full stack locally is via Docker Compose.

### Prerequisites
- Docker & Docker Compose
- Node.js **20+** (enforced via `engines` in `package.json`)
- A valid Mapbox GL Access Token

### Quick Start (Docker)
```bash
# 1. Clone the repository
git clone https://github.com/your-org/hazardnet-deployment.git
cd hazardnet-deployment

# 2. Copy environment variables
cp .env.example .env
# Edit .env and add your VITE_MAPBOX_TOKEN and BACKEND_API_KEY

# 3. Start the full stack (Backend, Frontend, PostgreSQL)
docker-compose up -d --build

# 4. View logs
docker-compose logs -f frontend
```

### Manual Full-Stack Setup (two terminals)
```bash
# Terminal 1 — API server (Express + TFJS inference)
npm install
npm start            # backend on http://localhost:3001 (PORT env to override)

# Terminal 2 — frontend dev server (proxies /api → 3001)
cd frontend
npm install
npm run dev          # app on http://localhost:3000
```

### Manual Frontend-only Setup
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## ⚙️ Configuration

Create a `.env` file in the `frontend` directory with the following variables:

```env
# Mapbox GL Token (Required for rendering ADM boundaries)
VITE_MAPBOX_TOKEN=your_mapbox_public_token_here

# Backend API Base URL
VITE_API_BASE_URL=http://localhost:3001/api/v1

# Feature Flags
VITE_ENABLE_EDGE_INFERENCE=true
VITE_ENABLE_OFFLINE_MODE=true
```

---

## 💻 Usage Guide

1. **Navigate to the Dashboard**: Open `http://localhost:3000` (or your deployed URL).
2. **Select a Region**: Click on any of the 8 Divisions (ADM1) on the map to zoom in and reveal the 64 Districts (ADM2).
3. **Choose a Horizon**: Use the forecast dashboard toggle to switch between the **7-day** and **15-day** horizons (`7_days` and `15_days`; `backend/utils/forecastRow.js::VALID_HORIZONS` is the authority).
4. **Interpret the Prediction Panel**:
   - **Hazard Type & Confidence**: Look for the `Certain` / `Probable` / `Uncertain` badge.
   - **Severity Gauges**: Compare the AI Model Severity (0-100%) with the Physics-Based Severity. High alignment indicates high reliability.
   - **Mitigation Tips**: Scroll down for hazard-specific, actionable agricultural advice (e.g., "Raise field embankments" for Flood).
5. **Offline Mode**: Disconnect your internet. The Service Worker will serve cached GeoJSON and run predictions locally via TFLite WASM.

---

## 🔬 Scientific Reproducibility (IEEE TGRS)

This repository is designed to support the reproducibility requirements of top-tier remote sensing journals (e.g., *IEEE Transactions on Geoscience and Remote Sensing*).

- **Model Weights**: The exact FP32 TFLite model (`hazardnet_fp32.tflite`) and normalization statistics (`normalization_stats.json`) are included in the `/public/models` directory.
- **Validation Strategies**: The training pipeline implements four rigorous evaluation strategies:
  1. Event-Based 5-Fold Stratified CV (Baseline)
  2. Spatial Leave-One-Division-Out (LODO) (8 folds)
  3. Season-Adaptive Temporal Split (Kharif-I, Kharif-II, Rabi)
  4. Combined Spatio-Temporal (Division × Season × Era)
- **Boundary Data**: Administrative boundaries are sourced directly from the official [FAO GAUL 2015](https://data.humdata.org/dataset/cod-ab-bgd) dataset, ensuring geospatial integrity.
- **Citation**: [`CITATION.cff`](CITATION.cff) describes the work (Master's thesis, Department of Agrometeorology, Bangladesh Agricultural University) so the repository's *Cite this repository* button produces a correct reference; the same attribution is published in the site's JSON-LD from [`frontend/src/content/attribution.json`](frontend/src/content/attribution.json).

---

## 🤝 Contributing

We welcome contributions from the geospatial AI and agricultural informatics community!

1. **Fork** the repository.
2. **Create a feature branch**: `git checkout -b feat/add-new-hazard-metric`
3. **Commit your changes**: `git commit -m 'feat: add VHI drought metric'`
4. **Push to your fork**: `git push origin feat/add-new-hazard-metric`
5. **Open a Pull Request**: Ensure all E2E tests (`npm run test:e2e`) pass.

*Please open an issue first to discuss major architectural changes.*

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details. The underlying FAO GAUL boundary data is subject to its respective open-data usage policies.