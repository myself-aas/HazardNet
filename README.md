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
🗄️ **Forecast Archive**: weekly artifacts are attached to this repo's [GitHub Releases](https://github.com/myself-aas/HazardNet/releases) (one set per Sunday pipeline run, tag `vX.Y.Z`): the ingest-compatible forecasts CSV (507 ADM3 units × 10/20/30-day horizons, dual-track severity), plus — when computed — the ADM3 location matrix, the OSM exposure overlay, and the ADM3 hazard+exposure GeoJSON (ADR 0006). Queryable history: 
`GET /api/v1/forecasts/history?from=YYYY-MM-DD&to=YYYY-MM-DD` (optional `&horizon=10_days|20_days|30_days`, `&district_id=N`, `&format=csv` for an archive-format export).

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

Agricultural disaster risk in Bangladesh requires high-resolution, temporally aware forecasting. HazardNet aggregates 15-channel spatio-temporal tensors (SAR, Optical, ERA5-Land) with deterministic Open-Meteo climate projections to generate **10/20/30-day** hazard forecasts across Bangladesh's **507 sub-district ADM3 units** (495 Upazilas + 12 City Corporations, HDX COD-AB). 

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

**Forecasting Horizons** (10/20/30 days — ADR 0005):
- **10 Days**: Driven by short-term deterministic weather forecasts (Open-Meteo Daily).
- **20/30 Days**: Medium-term outlooks; Open-Meteo serves at most 16 deterministic days, so these horizons aggregate the available ≤16-day window (ADR 0005).

---

## ⚡ Key Features

1. **Hierarchical Geospatial Drill-Down**: Interactive Mapbox GL interface utilizing official FAO GAUL boundaries. Users can view Division-level (ADM1) aggregates and drill down to District-level (ADM2) severity heatmaps.
2. **Dual-Track Severity Quantification**: Displays both *Model Severity* (CNN Sigmoid output) and *Physics Severity* (Open-Meteo formula proxy) side-by-side for transparent uncertainty calibration.
3. **Edge-First TFLite WASM Inference**: The FP32 quantized model (~0.75 MB) runs directly in the browser via `@tensorflow/tfjs-backend-wasm`, enabling <100ms latency and 100% offline capability for field workers.
4. **Automated MLOps Pipeline (runs entirely on GitHub — no Kaggle)**: A daily GitHub Actions run ([`.github/workflows/daily_forecast.yml`](.github/workflows/daily_forecast.yml)) executes [`scripts/auto_forecast.py`](scripts/auto_forecast.py) on the runner: GEE satellite imagery + Open-Meteo forecasts in, TFLite inference out, for all 64 districts across the 7-day and 15-day horizons. The generated CSV is validated, promoted into `backend/data/forecasts/`, and baked into the committed website snapshot (`frontend/public/data/forecasts-latest.json`) so every deployment carries the freshest forecast even when the API is unreachable. Set the repository variable `PUSH_TO_API=true` to additionally POST the CSV into the forecast store. See [docs/mlops/ARCHITECTURE.md](docs/mlops/ARCHITECTURE.md).
5. **Confidence Binning**: Predictions are explicitly labeled as `Certain` (≥0.85), `Probable` (0.70–0.85), or `Uncertain` (<0.70) to prevent overconfidence in long-term probabilistic outlooks.
6. **User Dashboards & Unique Profile URLs**: Every signed-in user gets a dedicated dashboard at `/dashboard` with a unique username that becomes their public profile URL (`/u/<username>`), ~40 Supabase-backed profile fields, avatar upload (client-side resize/compress with replace-on-update), connector integrations (Open-Meteo, WhatsApp, SMS, Slack, webhooks, …), and passwordless email-verification sign-up — see [docs/user-dashboard.md](docs/user-dashboard.md).

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
3. **Choose a Horizon**: Use the top toggle to switch between the **10/20/30-day** horizons (ADR 0005).
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