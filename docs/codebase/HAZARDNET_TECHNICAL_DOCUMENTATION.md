# HazardNet — Comprehensive Advanced Technical Documentation

> Version: 2.1.9 (per `package.json`)  •  Branch: `arena/01a0c54a-hazardnet`  •  Date: 2026-09-21
> Scope: all source files, data pipeline, model, training, deployment, API, frontend, alert engine, RAG, MLOps, ETL, evaluation, validation, and known limitations.
> Audience: ML engineers, geospatial/remote-sensing scientists, full-stack engineers, DevOps/MLOps, and agrometeorological researchers targeting IEEE TGRS reproducibility.

---

## Table of Contents

1. [Project Intent & Citation](#1-project-intent--citation)
2. [Repository Map (Top-level to Leaf)](#2-repository-map-top-level-to-leaf)
3. [System Architecture End-to-End](#3-system-architecture-end-to-end)
4. [The 15-Channel Spatio-Temporal Tensor](#4-the-15-channel-spatio-temporal-tensor)
5. [Data Acquisition (Phase 1, GEE)](#5-data-acquisition-phase-1-gee)
6. [Dual-Track Severity (Phase 2) — Equations and Methods](#6-dual-track-severity-phase-2--equations-and-methods)
7. [Tensor Normalisation & the Master HDF5 (Phase 3A)](#7-tensor-normalisation--the-master-hdf5-phase-3a)
8. [Experimental Dataset Builder (Phase 3B) — Four Validation Strategies](#8-experimental-dataset-builder-phase-3b--four-validation-strategies)
9. [The HazardNetCNN Architecture (Phase 5)](#9-the-hazardnetcnn-architecture-phase-5)
10. [Loss Function, Training Recipe, and Metrics Tracker](#10-loss-function-training-recipe-and-metrics-tracker)
11. [Ablation Study (Phase 4, A1–A4)](#11-ablation-study-phase-4-a1a4)
12. [Edge Deployment (Phase 6, ONNX → TFLite)](#12-edge-deployment-phase-6-onnx--tflite)
13. [Operational Forecast Pipeline (Phase 7 / Daily Kaggle Production)](#13-operational-forecast-pipeline-phase-7--daily-kaggle-production)
14. [Kaggle → Repository Bridge (`scripts/fetch_kaggle_forecast.py`)](#14-kaggle--repository-bridge-scriptsfetch_kaggle_forecastpy)
15. [Backend: Express API, Firestore Persistence, Security](#15-backend-express-api-firestore-persistence-security)
16. [The Stored-Prediction Path (ADR 0009)](#16-the-stored-prediction-path-adr-0009)
17. [Alert Engine (Phase 4) — Ladder Policy, Human Gate, Channels](#17-alert-engine-phase-4--ladder-policy-human-gate-channels)
18. [Chat/Advisory Agent with RAG and Skill Routing](#18-chatadvisory-agent-with-rag-and-skill-routing)
19. [Frontend — React/TypeScript/Vite, NASA HDS, Offline & Low-Bandwidth](#19-frontend--reacttypescriptvite-nasa-hds-offline--low-bandwidth)
20. [Content Engine and Public Surface (Phase 8)](#20-content-engine-and-public-surface-phase-8)
21. [ETL Subsystem (`scripts/etl/`)](#21-etl-subsystem-scriptsetl)
22. [MLOps Subsystem (`scripts/mlops/`)](#22-mlops-subsystem-scriptsmlops)
23. [Hindcast Subsystem (`scripts/hindcast/`)](#23-hindcast-subsystem-scriptshindcast)
24. [CI/CD Workflows (12 workflows)](#24-cicd-workflows-12-workflows)
25. [Vercel Deployment Configuration](#25-vercel-deployment-configuration)
26. [Results & Reported Performance (IEEE TGRS Tables II–VI)](#26-results--reported-performance-ieee-tgrs-tables-iivi)
27. [Evaluation & Validation Regime](#27-evaluation--validation-regime)
28. [Confidence Semantics, Calibration, and Score Binning](#28-confidence-semantics-calibration-and-score-binning)
29. [Security Hardening](#29-security-hardening)
30. [Running Locally](#30-running-locally)
31. [Discussion: Limitations, Future Work, and Known Divergences](#31-discussion-limitations-future-work-and-known-divergences)
32. [Evidence Index (File Paths)](#32-evidence-index-file-paths)

---

## 1. Project Intent & Citation

HazardNet is an operational, multi-hazard AI forecasting platform for Bangladesh agriculture. It classifies eight climatic hazards (Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone) and produces a dual-track severity index — a CNN softmax/regression output *and* an independent physics-based proxy — on 7-day and 15-day horizons across Bangladesh's 64 FAO GAUL ADM2 districts. The platform is described in the author's Master's thesis, Department of Agrometeorology, Bangladesh Agricultural University; citation metadata is in `CITATION.cff` and embedded as JSON-LD on the site from `frontend/src/content/attribution.json`.

The explicit, stated architectural constraints (enforced by tests that fail the build) are:

1. **Stored forecasts, not runtime inference** — `POST /api/predict` reads the latest pre-computed district/horizon result (ADR 0009, `docs/adr/0009-single-inference-path.md`). The web app does not run a CNN and does not perform inline inference.
2. **Dual-track severity is always shown** so the CNN and physics proxy can be visually compared and divergence measured (PRODUCT_SPEC §5.4).
3. **Score bins are relative, not calibrated** — Certain ≥ 0.85, Probable 0.70–0.85, Uncertain < 0.70 describe the model's uncalibrated softmax, not measured event probabilities (MODEL_CARD §6).
4. **10/20/30-day horizons and 507-unit ADM3 expansion are NOT live** — accepted in ADR 0005 but `scripts/tests/test_model_claims.py` fails the build if any UI copy or config advertises them.
5. **The misnamed INT8 file is retired** — `Models/hazardnet_int8.tflite` is a duplicate FP32 bundle (TFLite CONV_3D requires FP32; ADR 0007).
6. **Alerts above WATCH require a human duty officer** (PRODUCT_SPEC §1.3/§1.6, Alert Engine).

---

## 2. Repository Map (Top-level to Leaf)

The tree is documented exhaustively in `docs/codebase/STRUCTURE.md`; the essential functional areas are:

| Path | Role | Primary language |
|------|------|------------------|
| `api/` | Vercel serverless function entry points (mirrors `backend/routes`) | JS ESM |
| `backend/` | Express server: routes, middleware, services, utils, alerts, security | JS ESM |
| `frontend/` | React 18 + TypeScript + Vite client (npm workspace) | TS/TSX |
| `Models/` | Shipped ML artifacts (FP32 TFLite, labels, normalisation stats, version/registry JSON) | Binary + JSON |
| `scripts/` | All build/QA/ETL/MLOps/Hindcast automation; `db/` SQL migrations (superseded); `tests/` Python & JS tests; `tiles/` ADM3 tile builder; `qa/` design-audit scripts | JS/MJS + Python |
| `__tests__/` | Jest unit/integration tests (60+ files) | JS |
| `ml/` | Colab/Kaggle Jupyter notebooks (train_and_convert, auto_train, forecast pipeline outputs) | Python notebooks |
| `training/` | Python training pipeline and threshold proofs, with its own `tests/` | Python |
| `data/` | At-rest datasets (events CSV, design tokens, hindcast drivers, icons, forecast CSV) | CSV/JSON |
| `backend/data/forecasts/` | Committed canonical forecast CSV/JSON/manifest (auto-updated daily) | CSV/JSON |
| `docs/` | Markdown documentation (ADRs, PRD, TRD, PRODUCT_SPEC, RUNBOOKS, MLOPS, ALERTS, design-system, audits, ops, `codebase/`) | Markdown |
| `rag_pipeline/` | Retrieval-augmented generation index and skill router for the chat agent | JS + Markdown |
| `references/` | Source reference documents (hazard protocols, institutional SOPs, agronomy, humanitarian partners, AEZ profiles) | Markdown/JSON |
| `skills/` | Agent knowledge modules grouped by domain (tensor interpretation, severity quantification, hazard protocols, agricultural/meteorological/humanitarian institutions, agronomy crop stages) | Markdown |
| `.github/workflows/` | 12 CI/CD YAML workflows (daily_forecast, forecast-pipeline, hindcast, model-validation, mlops, ci, daily/weekly_forecast, model_intake, v3-ml-contracts, site-health, Firebase-Store-Verify, verify-secrets, manual_forecast_ingest) | YAML |

---

## 3. System Architecture End-to-End

The platform is a **batch-produced, served-by-lookup** system with four tiers:

```
 (0) DATA & MODEL PRODUCTION (Kaggle, daily schedule)
     GEE (S1+S2/Landsat+ERA5-Land) → 15ch×10t×64×64 tensor/district
     + Open-Meteo forecast injected into T-0
     → TFLite FP32 HazardNetCNN → 8-class hazard logits + severity
     → Physics cross-check (Open-Meteo) → dual-track CSV
                │
                ▼ (kaggle kernels output CLI, GitHub Actions 00:00 UTC)
 (1) DAILY BRIDGE (scripts/fetch_kaggle_forecast.py)
     Advisory CSV → canonical CSV/JSON/manifest, SHA-256, coverage tally
     → validate_forecasts.py (freshness+coverage gate)
     → build_forecast_snapshot.mjs, build_content_engine.mjs
     → commit back to repo
                │
                ▼
 (2) STORAGE
     Primary: Firestore (transactional, RLS per firestore.rules, ADR 0014)
     Fallback: committed backend/data/forecasts/*.{csv,json} shipped in deploy
     Archive: weekly GitHub Release artifact (vX.Y.Z tags)
                │
                ▼ (REST/serverless)
 (3) BACKEND (Express or Vercel functions)
     Helmet/CSP → requestId → CORS → rate limits → routes → services → store
     /api/v1/forecasts, /api/predict, /api/v1/alerts, /api/chat, /api/agent ...
                │
                ▼ (REST/RTK Query/fetch)
 (4) FRONTEND (React/TS/Vite static build, Leaflet map)
     / (editorial front door), /live (map console), /alerts, /district/:id,
     /hazards/*, /districts/* (static prerender), /dashboard (/u/:username)
     Offline: service-worker snapshot fallback; Low-bandwidth: vector tiles
```

The single most important architectural property is: **the TFLite model runs on Kaggle only**. The Vercel/Express backend and browser never execute the CNN. `POST /api/predict` is a lookup of the latest stored district/horizon record (§16).

---

## 4. The 15-Channel Spatio-Temporal Tensor

Every event/district is represented as a tensor of shape `(C, T, H, W) = (15, 10, 64, 64)` (NCDHW in PyTorch; transposed to NDHWC for TFLite). The 10 temporal steps cover 100 days leading up to (and including) the target at 10-day compositing windows, resulting in a 640 m × 640 m spatial patch (320 m radius centroid buffer, 10 m pixels, resampled to 64×64 bilinear).

Band definitions and z-score statistics (from `Models/normalization_stats.json` and `DataConfig.BAND_INFO` in Phase 3A):

| # | Name | Source | Native unit | μ | σ |
|---|------|--------|-------------|--------------|--------------|
| 0 | SAR_VV | Sentinel-1 GRD IW VV | dB | −1.546 | 3.458 |
| 1 | SAR_VH | Sentinel-1 GRD IW VH | dB | −3.332 | 6.364 |
| 2 | Blue | S2/Landsat harmonised | DN (0–10000) | 2645.96 | 5652.94 |
| 3 | Red | S2/Landsat harmonised | DN | 2798.75 | 5824.46 |
| 4 | NIR | S2/Landsat harmonised | DN | 3825.86 | 7093.84 |
| 5 | SWIR | S2/Landsat harmonised | DN | 3319.70 | 6173.52 |
| 6 | Temp_2m | ERA5-Land Daily Aggregate | K | 298.76 | 12.44 |
| 7 | Precip | ERA5-Land daily total | m (water equivalent) | 0.00614 | 0.00697 |
| 8 | Max_Temp | ERA5-Land daily max | K | 302.89 | 12.51 |
| 9 | Min_Temp | ERA5-Land daily min | K | 295.28 | 12.61 |
| 10 | Soil_W1 | ERA5-Land volumetric soil water layer 1 | m³/m³ | 0.324 | 0.105 |
| 11 | Soil_W3 | ERA5-Land layer 3 | m³/m³ | 0.326 | 0.087 |
| 12 | Soil_T1 | ERA5-Land soil temp level 1 | K | 299.86 | 12.48 |
| 13 | Dewpoint | ERA5-Land dewpoint | K | 294.64 | 12.67 |
| 14 | Solar_Rad | ERA5-Land SSRD sum | J/m² | 16,548,893 | 3,921,022 |

For the **operational T-0 forecast**, channels 6–14 of the T-0 timestep are *surgically overwritten* with Open-Meteo deterministic forecast values (converted to the same SI units), and two soil-moisture channels are filled with a conservative 0.3 m³/m³ prior with `Soil_T1 = 290K` — explicitly flagged per-row via `soil_channels_fabricated: true` so consumers know those two numbers are an estimate, not a measurement.

---

## 5. Data Acquisition (Phase 1, GEE)

Implements the 15-channel temporal stack on Google Earth Engine. Source: `HazardNet.md` Phase 1, replicated in `HazardNet.md` Phase 7 and the Kaggle forecast notebook.

Key functions (Phase 1):
- `harmonize_and_rename(image, mission_type)` — maps SR bands across L5/L7/L8/S2 onto `{Blue, Red, NIR, SWIR}`, with a zero-fill fallback if band count < 4 (masked as invalid via `updateMask(0)`).
- `get_hybrid_optical(region, start, end)` — tries S2 SR Harmonized (post-2015, median composite, cloud < 30%), falls back to L8 (2013–2015, bicubic resample), then L7/L5 (2000–2013), and finally returns a zero-tensor on total failure.
- `get_temporal_15ch_stack(region, start, end)` — builds the full 15-channel stack: S1 VV/VH median (IW mode, robust zero-fill), hybrid optical, and ERA5-Land 9-band median, bilinear resampled, clipped to region, unmasked(0).
- `check_queue_capacity()` enforces a 2,800-task cap against GEE's 3,000-task limit, polling every 5 minutes.
- `run_300_event_batch(csv_path, start_idx)` processes 300 events at a time, submitting 10 export tasks per event (T = 0…9, 10-day windows at 10 m resolution) as GeoTIFFs to Google Drive.

The spatial ground is a 640 m × 640 m square (320 m buffer around the event centroid), producing a 64 × 64 pixel patch after resampling (10 m native).

---

## 6. Dual-Track Severity (Phase 2) — Equations and Methods

Phase 2 reads per-event GeoTIFFs and computes an independent, physics-based severity for every event, then normalises per hazard class, and falls back to Open-Meteo API values where the TIF is empty/missing/zero. Source: `HazardNet.md` Phase 2; the operational equivalent is `scripts/physics_severity.py` and the Open-Meteo formulas in the forecast notebooks.

### 6.1 TIF-based (native) formulas

Let `B[i]` denote the 2-D array for band index `i` in `BANDS`; arithmetic is elementwise, with `ε = 1e-6` for numerical stability.

**NDVI**
```
NDVI = (NIR − Red) / (NIR + Red + ε)
```

**Vegetation Health Index (Drought severity proxy)**
```
VCI = (NDVI − min(NDVI)) / (max(NDVI) − min(NDVI) + ε)
TCI = (max(Temp) − Temp_2m) / (max(Temp) − min(Temp) + ε)
VHI = 0.5 · VCI + 0.5 · TCI
Drought severity = clip(1 − mean(VHI), 0, 1)
```
(VHI inverted so higher values = worse drought.)

**Excess Heat Factor (Heat Wave)**
```
threshold = percentile90(Temp_2m)
EHF = max(0, Temp_2m − threshold) · max(0, Max_Temp − Temp_2m)
Heat severity = clip(mean(EHF), 0, 1)
```

**SAR Flood (Flood / Flash Flood)**
```
sar_ratio = (VV − VH) / (VV + VH + ε)
Flood severity = clip( (1 − mean(sar_ratio)) · (mean(Precip) / (max(Precip) + ε)), 0, 1 )
```
Lower VV−VH ratio indicates specular (calm water) backscatter; multiplied by normalised precipitation.

**Fire Severity**
```
thermal   = clip((T − mean(T)) / (max(T) − mean(T) + ε), 0, 1)
solar     = clip(Solar_Rad / (max(Solar_Rad) + ε), 0, 1)
dryness   = clip(1 − Soil_W1 / (max(Soil_W1) + ε), 0, 1)
Fire severity = clip(mean(0.4·thermal + 0.3·solar + 0.3·dryness), 0, 1)
```

**Cold Wave (BMD threshold: ≤ 16 °C)**
```
anomaly = clip((16 − Min_Temp_celsius) / 10, 0, 1)
Cold severity = clip(mean(anomaly), 0, 1)
```

**Tropical Cyclone / Severe Local Storm (TIF proxy)**
```
proxy = clip(mean(Precip) · std(VV), 0, 1)       # confidence 0.85
```

### 6.2 Open-Meteo fallback formulas

Used when the GeoTIFF is empty/missing/suspicious-zero. Units: temperatures in °C, precipitation in mm, wind in km/h (or m/s internally in the forecast pipeline), ET in mm.

```
SevereLocalStorm(p_max, w_max)  = 0.6·max(w_max−50,0)/100 + 0.4·min(p_max/100,1)
ColdWave(t_min, D_days)         = 0.7·clip((16−t_min)/10,0,1)  + 0.3·clip(D/5,0,1)
Fire(t_max, w_max, et)          = 0.4·clip((t_max−25)/15,0,1)  + 0.3·clip((w_max−5)/20,0,1) + 0.3·clip(et/6,0,1)
TropicalCyclone(w_max, p_sum)   = 0.7·min(max(w_max−50,0)/150,1) + 0.3·min(p_sum/300,1)
Drought(t_max, p_sum)           = 0.6·clip((t_max−25)/20,0,1)  + 0.4·clip((200−p_sum)/200,0,1)
Flood(p_sum, p_max)             = 0.5·clip(p_sum/300,0,1) + 0.5·clip(p_max/100,0,1)
HeatWave(t_max, D_days)         = 0.7·clip((t_max−30)/15,0,1)  + 0.3·clip(D/5,0,1)
```

Confidence for TIF-computed scores is 1.0 (0.85 for Cyclone/Storm proxy); for API fallback it is 0.85; for hard failures it is 0.50 (binned "Uncertain").

### 6.3 Group-wise normalisation

```
Severity_Index[group] = (RawScore − min(group)) / (max(group) − min(group))
```
per `Hazard_Type` (variance-preserving min-max). NaNs and residuals are filled with 0.0 and flagged. Confidence is binned to {Certain, Probable, Uncertain} at ≥0.85 / ≥0.70 / <0.70.

---

## 7. Tensor Normalisation & the Master HDF5 (Phase 3A)

Source: `HazardNet.md` Phase 3A; class `GeoTIFFTensorPipeline` orchestrates:

1. **Inventory** (`GeoTIFFInventory`) — globs `*_T*_15B.tif`, groups by event_id, requires exactly 10 timesteps per event.
2. **Validation & Resampling** (`TensorValidator`):
   - Asserts 15 bands.
   - Asserts NaN fraction ≤ 10%.
   - Builds an explicit `valid_mask` (not-NaN AND ≠ nodata −9999).
   - Resamples data to 64×64 with **bilinear** interpolation after zero-filling NaNs, and resamples the mask with **nearest** to preserve strict boundaries (no mask-bleeding).
3. **Dynamic z-score normalisation** (`TensorNormalizer`):
   - Computes *per-channel* μ, σ strictly over valid pixels: `z = (x − μ) / σ`.
   - Pins invalid regions to absolute 0.0 (neutral), not to NaN or to a fill value that the network could interpret as signal.
   - Final permutation `(T, C, H, W) → (C, T, H, W)` for PyTorch 3D CNN.
4. **Global statistics** aggregated across all valid events are written to `normalization_stats.json` (these match what ships in `Models/normalization_stats.json`).
5. **Serialisation** saves each event as a `.pt` tensor plus a `tensor_manifest.csv` (event_id, date, district, lat/lon, shape, hazard_type, severity_index, confidence, status).

---

## 8. Experimental Dataset Builder (Phase 3B) — Four Validation Strategies

Source: `HazardNet.md` Phase 3B, module `ExperimentalDatasetBuilder`. A single `master_tensors.h5` (gzip, ~2.5 GB) stores all event tensors under groups `tensors/<event_id>`, `labels/<event_id>`, `severity/<event_id>`, `confidence/<event_id>`; lightweight CSV manifests reference event_ids for each fold.

### 8.1 Strategy 0 — Event-based 5-Fold Stratified CV (Baseline, IEEE TGRS Table II)
- `StratifiedKFold(n_splits=5, shuffle=True, seed=42)` stratified by `hazard_idx`.
- Train/(Val 15% of train+val)/Test split; 70/15/15 ratio.

### 8.2 Strategy 1 — Spatial Leave-One-Division-Out (LODO, 8 folds, Table III)
- One Bangladesh division held out as test, remaining 7 divisions train/val. Divisions: Dhaka, Chittagong, Rajshahi, Khulna, Barisal, Sylhet, Rangpur, Mymensingh (64 districts total; DISTRICT_TO_DIVISION mapping in source).

### 8.3 Strategy 2 — Season-Adaptive Temporal Split (Table IV)
Three cropping seasons per Islam et al. (2020):
- **Kharif-I** (Mar–May): Train 2000–2017 | Val 2018–2021 | Test 2022–2025
- **Kharif-II** (Jun–Oct): Train 2000–2017 | Val 2018–2021 | Test 2022–2025
- **Rabi** (Nov–Feb): Train 2000–2020 | Val 2021–2023 | Test 2024–2025 (extended train because low event density)

### 8.4 Strategy 3 — Combined Spatio-Temporal (up to 24 folds, Table V)
- Cartesian product (Division × Season × Era). Test set = held-out division × held-out season × post-val era; discarded folds with < 5 test events.

### 8.5 MasterHDF5Dataset (PyTorch worker-safe)
- Opens the HDF5 file per worker (via `get_worker_info()`), 10 MB read cache.
- `_resize_spatial` uses **nearest-neighbour** to avoid mask-bleeding when resizing.
- Augmentation (train only):
  - Brightness ±0.1 additive.
  - Contrast ±0.1 scaling around the channel mean.
  - Temporal shift ±1 step (repeats boundary to preserve length).

---

## 9. The HazardNetCNN Architecture (Phase 5)

Source: `HazardNet.md` Phase 5 (class `HazardNetCNN`), also reproduced in Phase 4 (`HazardNetAblatable`) and Phase 6 (deployment converter). It is a lightweight multi-task 3D CNN with depthwise-separable convolutions and squeeze-excitation attention.

```
Input (N, 15, 10, 64, 64)
  Block1: DepthSepConv3d(15→32, k=3, p=1) → ReLU → SE(32, r=4) → MaxPool3d((1,2,2))
           → (N, 32, 10, 32, 32)
  Block2: DepthSepConv3d(32→64) → ReLU → SE(64) → MaxPool3d((2,2,2))
           → (N, 64, 5, 16, 16)
  Block3: DepthSepConv3d(64→128) → ReLU → SE(128) → MaxPool3d((1,2,2))
           → (N, 128, 5, 8, 8)
  Block4: DepthSepConv3d(128→256) → ReLU → SE(256) → MaxPool3d((1,2,2))
           → (N, 256, 5, 4, 4)
  AdaptiveAvgPool3d(1) → (N, 256)
  Shared FC: Linear(256,128) → ReLU → Dropout(0.3)
  Heads:
    hazard_head:   Linear(128, 8) → logits
    severity_head: Linear(128,64) → ReLU → Linear(64,1) → Sigmoid → [0,1]
```
Total trainable parameters: **136,670** (~0.53 MB FP32).

### DepthwiseSeparableConv3d
```
depthwise = Conv3d(in_ch, in_ch, k, groups=in_ch, bias=False)
pointwise = Conv3d(in_ch, out_ch, 1, bias=False)
bn        = BatchNorm3d(out_ch)
forward(x): bn(pointwise(depthwise(x)))
```

### SEBlock3D (Squeeze-Excitation, reduction=4)
```
w = Sigmoid(Linear(Linear(AdaptiveAvgPool3d(1), C//r), C))
out = x · w.view(N, C, 1, 1, 1)
```

### Ablatable switches (A1–A4, see §11):
- `use_se` replaces SE with identity.
- `use_depthwise` replaces DepthSep with standard Conv3d.
- `preserve_temporal` changes Block1's pool kernel from (1,2,2) to (2,2,2), collapsing time immediately.
- `use_severity` disables the severity head (classification-only).

---

## 10. Loss Function, Training Recipe, and Metrics Tracker

### Homoscedastic Multi-Task Loss (Kendall et al., 2018)
```
L_total = exp(−σ_cls) · L_cls_w + σ_cls
        + exp(−σ_reg) · L_reg_w + σ_reg
```
Where `σ_cls, σ_reg` are learnable log-variances (stored as `self.log_vars = nn.Parameter(torch.zeros(2))`), `L_cls` is CrossEntropyLoss (reduction none), `L_reg` is SmoothL1 (Huber) loss on severity, and both are weighted by sample `confidence` before averaging:
```
L_cls_w = mean(CE(logits, c_true) · confidence)
L_reg_w = mean(Huber(s_pred, s_true) · confidence) · severity_weight (default 1.0)
```
Confidence weighting down-weights uncertain samples in both losses.

### Optimiser & schedule
- **AdamW** with `lr = 1e-3`, `weight_decay = 1e-4`, separate param group for `log_vars`.
- **CosineAnnealingLR** over `NUM_EPOCHS`, `eta_min = 1e-6`.
- **Gradient clipping** to max norm 1.0.
- **Early stopping** with patience 10 epochs on validation loss.
- **Batch size** 16, **2 workers**, pin_memory on CUDA.
- **Device** CUDA if available else CPU (Kaggle T4 for monthly retraining).

### EnhancedMetricsTracker (Q1-journal-grade)
Collects predictions across an epoch and exposes:
- Overall: `loss_total, hazard_accuracy, hazard_f1 (weighted), severity_rmse, severity_mae, severity_r2`.
- Per-class: Precision / Recall / F1 / Support (length-8 + macro + weighted).
- Severity error by quartile (Q1 Low → Q4 Severe) — MAE, RMSE, mean predicted vs actual.
- Normalised confusion matrix (8×8).

Publication figures (via `PublicationFigureGenerator` at 300 DPI):
- Confusion matrix heatmap (Seaborn `Blues`).
- Severity scatter (predicted vs actual with R² annotation and perfect-prediction line).
- Spatial heatmap of accuracy across division × season.

W&B integration via Kaggle Secrets is optional; the trainer falls back gracefully.

---

## 11. Ablation Study (Phase 4, A1–A4)

Source: `HazardNet.md` Phase 4 (`HazardNetAblatable`). Uses augmentation=True across all variants to isolate architectural effects. 5-fold event-based CV; reports Acc, F1, RMSE, R², param count, and deltas against A0 (baseline):

| ID | Component Removed | Effect |
|----|-------------------|--------|
| A1 | SE attention blocks | → `IdentitySE` no-op |
| A2 | Depthwise-Separable conv → standard Conv3d | ~higher param count, different accuracy |
| A3 | Temporal preservation (pool time in Block 1) | MaxPool3d (2,2,2) in Block 1 |
| A4 | Severity head + severity loss | Classification only, `severity_weight=0` |

Expected outcomes (per the architecture design): removing SE (A1) should reduce channel-wise recalibration; removing depthwise-sep (A2) increases params and risks overfitting; collapsing time early (A3) loses the temporal signal that distinguishes e.g. developing floods from standing water; removing the severity head (A4) deprives the shared representation of the continuous supervision signal.

---

## 12. Edge Deployment (Phase 6, ONNX → TFLite)

Source: `HazardNet.md` Phase 6, class `DeployConfig` and helpers; the inference script is mirrored in `Models/inference_example.py`.

Steps:
1. **Load model & normalisation stats.** `NormalizationStats` is a robust parser that accepts four JSON schema variants (per-band list/dict/nested/records) and reshapes means/stds to `(1, C, 1, 1, 1)` for 5D broadcast; stds < 1e-8 are clamped to 1.0.
2. **Export ONNX** via `torch.onnx.export` with a `torch.jit.trace` wrapper to bypass onnxscript registry bugs; opset 17, dynamic batch axis, named I/O (`input`, `hazard_logits`, `severity_pred`).
3. **Representative dataset** — 100 normalised samples drawn across training folds.
4. **Convert to TFLite** via `onnx2tf` CLI (sys.executable, robust path handling). *Critical limitation discovered: TFLite's CONV_3D kernel requires FP32; INT8 quantisation crashes in `conv3d.cc` at runtime.* The pipeline therefore ships **pure FP32** (both file copies `hazardnet_fp32.tflite` and `hazardnet_optimized_fp32.tflite`; INT8 quantisation is bypassed deliberately (ADR 0007)).
5. **Golden parity test** (n=50 test samples): runs TFLite interpreter with automatic NCDHW→NDHWC transpose detection (input shape inspection: if channel dim is last, transpose to NDHWC), extracts hazard/severity outputs by shape-matching (not fixed index) for resilience, and reports hazard agreement % and severity MAE. Threshold for pass: ≥ 95% agreement.
6. **Deployment bundle** contains both tflite files, `labels.json`, `preprocessing_config.json` (means/stds, input_shape, output index map), and a standalone `inference_example.py` that performs z-score normalisation and transpose.

Final FP32 model size is **under 150 MB edge target**.

### TFLite inference contract
- Input: `(1, 15, 10, 64, 64)` FP32 z-scored, NCDHW in PyTorch, but TFLite expects **NDHWC** `(1, 10, 64, 64, 15)` after `onnx2tf` conversion. The inference script handles transpose automatically.
- Outputs: `hazard_logits[8]` → softmax to class probabilities; `severity_pred` scalar ∈ [0,1].

---

## 13. Operational Forecast Pipeline (Phase 7 / Daily Kaggle Production)

The live daily forecast pipeline is a Kaggle notebook (`ml/hazardnet-auto-forecast-pipeline.ipynb`, mirrored in `HazardNet.md` Phase 7), executed on Kaggle's schedule, that:

1. **Loads FAO GAUL ADM2 boundaries natively via GEE** (`load_fao_gaul_boundaries()`) — sorts by ADM2_NAME, assigns district_id 1..64 alphabetically.
2. **Builds 9 historical timesteps per district** (T-9 … T-1 at 10-day windows) using the same `get_temporal_15ch_stack` as training.
3. **Builds T-0** with Open-Meteo forecast injected:
   - Fetches `forecast_days = horizon_days + 1` (capped at 16 by Open-Meteo's deterministic window) from `api.open-meteo.com/v1/forecast`.
   - Aggregates: `Temp_2m = mean`, `Precip = sum/1000 (→m)`, `Max_Temp = max`, `Min_Temp = min`, `Dewpoint = mean`, `Solar_Rad = sum * 1000 (kJ→J)`, plus Wind_Max and ET_Sum.
   - Surgical overwrite of channels 6..14; soil channels filled with conservative priors (0.3, 0.3, 290K) with `soil_channels_fabricated = True`.
4. **Normalises** per global stats, transposes to NDHWC, invokes TFLite interpreter.
5. **Computes physics severity** via the Open-Meteo formulas (§6.2) in Celsius/mm/kmh.
6. **Writes CSV** `hazardnet_advisories_latest.csv` (or `hazardnet_forecasts_latest.csv`) with columns: district, division, horizon, hazard, confidence, cnn_severity, physics_severity, final_severity, advisory_tier, target_date, plus OM driver columns.

**Optimisation** in Phase 7: historical steps for a district are fetched ONCE and reused across horizons (≈40% faster).

> ⚠️ The shipped product uses 7-day and 15-day horizons (`VALID_HORIZONS`); the Phase 7 code declares 10/20/30-day horizons but those outputs are rejected by the canonical parser and never reach production.

---

## 14. Kaggle → Repository Bridge (`scripts/fetch_kaggle_forecast.py`)

This is the single most important ops script. It does NOT generate forecasts; it fetches them, validates, translates, and commits. The docstring is an exceptionally detailed contract (~150 lines). Key behaviour:

1. **Download** via `kaggle kernels output <kernel>` with 3 retries (401 = bad token, 403 = token doesn't own kernel, 404 = slug moved, "never been run" needs a manual run).
2. **Choose CSV by name**, not glob order: prefers `hazardnet_forecasts_latest.csv` then `hazardnet_advisories_latest.csv`; if multiple CSVs exist and neither is a recognised name, refuses to guess.
3. **Detect schema**:
   - `canonical` if columns include `{district_id, hazard_type, prediction_date}`.
   - `advisory` if columns include `{district, hazard, target_date}`.
   - Otherwise fail loudly.
4. **Load district identity** from:
   - The last canonical CSV on disk (`--csv-out`).
   - Augmented with `git show HEAD:<path>` (the last *committed* artifact, to prevent erosion).
   - Extended via `scripts/etl/districts.py` 64-district resolver, with GAUL id derivation CHECKED against existing ids before use (refuses to derive if conflicts found).
5. **Translate advisory → canonical** using `ADVISORY_MAP` and SI unit conversions:
   - Celsius → Kelvin (+273.15), mm → metres (÷1000), km/h → m/s (÷3.6).
   - Missing drivers (dewpoint, solar radiation, ET in the advisory shape) are left empty (null), never synthesised.
   - `data_source = 'Kaggle_Advisory_Pipeline'`.
6. **Derive prediction_date = target_date − horizon_days**, cross-checked across all rows; disagreement fails the pull rather than choosing one date.
7. **Coverage tally** (`coverage_tally`): expected units = 64 districts × horizons; reports `complete` or `partial` with explicit missing district list. This prevents 25/64 runs from looking identical to complete runs (historical bug, audit 2026-09-17).
8. **Provenance** reads `Models/VERSION.json` and explicitly records `model_bytes_verified: false` (because the Kaggle notebook loads TFLite from its own dataset, not from the repo).
9. **Write outputs** only if SHA-256 changed: CSV (LF line endings, DictWriter with CANONICAL_COLUMNS order), typed JSON sidecar (bools/numbers/nulls correctly), and a `manifest.json` with sha256, coverage, provenance, and advisory summary.
10. Prints `CHANGED=true|false` on its last line (grepped by the workflow to decide whether to commit).

GitHub Actions step outputs set: `changed`, `shape`, `rows`, `districts`, `prediction_date`, `unmatched`.

---

## 15. Backend: Express API, Firestore Persistence, Security

`backend/server.js` is ~184 lines and assembles the full stack:

1. **Boot assertions** (`assertEnvironment()` IIFE): logs warnings for missing GEMINI/VAPID keys; logs errors and fails closed for missing BACKEND_API_KEY (503 on ingest) and missing FRONTEND_ORIGIN in production.
2. **Disables `x-powered-by`** for fingerprinting reduction.
3. **`trust proxy = 1`** so rate-limiters see real client IPs.
4. **CSP via Helmet**, enforcing by default in production, Report-Only in development. `cspDirectivesFromString()` centralises the directive set so `vercel.json` headers can be parity-checked (`securityHeadersParity.test.js`).
5. **`requestId` middleware** attaches `X-Request-Id` (correlated logging).
6. **CORS allowlist** via `corsMiddleware()` — production fails closed (missing `FRONTEND_ORIGIN` rejects all cross-origin requests).
7. **JSON body parser** at 10 MB limit.
8. **Basic security headers**: `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
9. **`/health`** → `{status:'healthy', service, timestamp, model:version}`.
10. **Hard block** on `/Models/*`, `*.tflite`, `normalization_stats.json`, `labels.json` (returns 404). Model artifacts are never served.
11. **Rate limits**: `apiLimiter` on all `/api`; `predictLimiter` on `/api/predict`; `alertLimiter` on `/api/v1/alerts`; `dynamicAiLimiter` on `/api/chat` and `/api/agent`.
12. **Mounted routers**: `/api/v1/forecasts`, `/api/advisory`, `/api/chat` (with Firebase auth + AI limiter), `/api/agent` (same), `/api/predict` (predictLimiter), `/api/push`, `/api/conversions`, `/api/v1/weather`, `/api/v1/alerts` (auth + alertLimiter), `/api/v1/events`.
13. **`/metrics`** (Prometheus): refreshes forecast-age gauge (60s cached probe) then serves `prom-client` registry metrics.
14. **Static frontend** from `frontend/dist`; SPA fallback for non-API GETs with a regex guard against serving model-artifact paths; returns 503 during builds.
15. **Conditional port binding**: only binds to port 3000 on `0.0.0.0` when invoked directly as a script; when imported (supertest) it does not, so parallel test suites don't collide.

### Firestore Persistence (ADR 0014)
- `backend/db.js` initialises the Firestore client using Firebase Admin credentials from `FIREBASE_SERVICE_ACCOUNT_JSON` (or Application Default Credentials). Missing credentials fail writes; snapshot-backed reads remain available.
- `backend/forecastStore.js` exposes CRUD: `upsertForecastRow`, `getLatestForecast`, `getLatestBulk`, `getForecastHistory`, etc. Reads fall back to the committed JSON snapshot at `backend/data/forecasts/hazardnet_forecasts_latest.json` when Firestore is unavailable.
- `backend/forecastPersistence.js` wraps writes in Admin transactions for durability and consistency.
- Forecast history is queryable at `GET /api/v1/forecasts/history?from=&to=&horizon=&district_id=&format=csv`.

---

## 16. The Stored-Prediction Path (ADR 0009)

`POST /api/predict` is a one-line router that calls `serveStoredPrediction` from `backend/utils/storedPrediction.js`. It:

1. Validates the body (district_id, horizon).
2. Calls `predictFromStore` which looks up the latest row for that (district_id, horizon) from Firestore, falling back to the committed snapshot.
3. Returns a structured JSON response via `forecastServe.js`:
   - `hazard_type`, `model_severity`, `physics_severity`, `severity_score` (model_severity ?? severity_score), `confidence`, `confidence_bin` (Certain/Probable/Uncertain), `confidence_kind` (`softmax` vs `calibrated_probability`), `confidence_raw` (if calibrated).
   - Meteorological drivers in documented human-readable units (°C, mm, km/h, MJ/m²/day, mm/day), converted from SI at the ingest boundary (see `forecastRow.js`).
   - Dual-track metadata: `physics_top_hazard`, `physics_top_severity`, `physics_agreement`, `track_divergence`, optional per-class `physics_scores`.
   - Provenance: `model_version`, `tensor_build_id`, `pipeline_version`, `run_id`, `data_source`, `prediction_date`, `target_date`.
   - Admin context: `district_name`, `division`, `pcode`, optional ADM3 identity.
4. Missing per-class probabilities, driver values, and model versions are left null/unknown rather than synthesised.

The response **does not include raw CNN logits** (calibration is not claimed); clients must present the score as an uncalibrated relative indicator per MODEL_CARD §6.

---

## 17. Alert Engine (Phase 4) — Ladder Policy, Human Gate, Channels

Source: `backend/alerts/`, documented in `docs/alerts/ALERT_ENGINE.md`.

**Severity ladder** (PRODUCT_SPEC §1.3):
```
NO_ALERT → WATCH → WARNING → SEVERE
```

**`backend/alerts/assess.js`** maps a forecast row to an alert level by combining model probability, model severity, physics severity, and track divergence. Default thresholds are overridable via env vars (see `.env.example`):
- `ALERT_WATCH_PROBABILITY`, `ALERT_WARNING_PROBABILITY`
- `ALERT_WATCH_SEVERITY`
- `ALERT_DIVERGENCE_WATCH` (high divergence forces WATCH regardless of score)
- `ALERT_ALLOW_UNCALIBRATED_WARNING` (off by default — uncalibrated scores cannot trigger WARNING)
- `ALERT_MAX_AUTO_PUBLISH_LEVEL` (default: WATCH)
- `ALERT_MAX_PREDICTION_AGE_HOURS`

**Policy** (`backend/alerts/policy.js`) enforces that WARNING and SEVERE alerts are NOT auto-published; they are queued for review.

**Lifecycle** (`backend/alerts/lifecycle.js`) creates alerts in Firestore with statuses: `proposed → pending_review → approved|rejected → published → expired|cancelled`. Rejections are stored with the duty officer's uid/email and a reason, and they serve as **evaluation labels** for future calibration.

**Channels** (`backend/alerts/channels/`):
- `sms.js` — BulkSMS BD or GreenWeb; Bengali messages are UCS-2 and cost ~3× English segments; `SMS_MAX_PER_RUN` caps the bill; `SMS_DRY_RUN=true` previews redacted payloads without sending.
- `telegram.js` — Bot API delivery to `TELEGRAM_ALERT_CHAT_ID`.
- Web push (see `/api/push`).

Every message carries the PRODUCT_SPEC §1.7 disclaimer (authority boundary vs BMD/FFWC/DDM; not a substitute for official warnings).

**Review surface** at `/api/v1/alerts/review` (Firebase-auth-gated, duty-officer allowlist `ALERT_DUTY_OFFICERS`). The UI at `/alerts` shows every published alert with evidence trail; `/alerts/:id` is a printable evidence card (PDF via `jspdf` + `html2canvas-pro`).

**Digest** (`backend/alerts/digest.js`) compiles scheduled summaries.

**Rehearsal & snapshot**: `npm run alerts:rehearse` runs the engine against the latest snapshot and writes `/tmp/alert-run.json`; `npm run alerts:snapshot` additionally builds the `alerts-latest.json` committed snapshot for offline/CDN reads.

---

## 18. Chat/Advisory Agent with RAG and Skill Routing

Source: `backend/utils/chatService.js`, `backend/services/advisoryAgent.js`, `backend/utils/ai_fallback_engine.js`, `rag_pipeline/search.js`, `rag_pipeline/skill_router.js`.

- **Primary LLM:** Gemini 2.0 via `@google/genai` with optional backup keys and fallback chain (OpenRouter, Groq, HuggingFace). If all are unset, the deterministic **AI fallback engine** (`ai_fallback_engine.js`) provides rule-based advisory text keyed by hazard/severity/horizon.
- **Retrieval-Augmented Generation:** `rag_pipeline/search.js` performs BM25-style keyword retrieval over Markdown knowledge packs in `rag_pipeline/references/08_hazard_archive/` and `references/` covering hazard protocols, agricultural SOPs (BARC/BARI/BRRI/DAE), meteorological institution protocols (BMD warning signals, WMO seasonal outlook), humanitarian partners (ReliefWeb, UNDP, UNICEF, WB, WHO), agronomy (rice stages, rabi vegetables), livestock/fisheries profiles, seasonal calendar, and AEZ context.
- **Skill router** (`rag_pipeline/skill_router.js`) classifies the user's question against the agent skills declared in `references/06_agent_skills/` and `skills/` (pipeline interpretation, meteo/satellite literacy, BMD early warning, DAE agricultural SOP, BRRI variety matching, international frameworks) to inject task-specific system prompts.
- **Input sanitisation:** `dompurify` for any rendered HTML, zod schema validation, prompt-bounds tests (`__tests__/api/chatPromptBounds.test.js`) to limit injection risk.
- **Identity-gated rate limit** via `dynamicAiLimiter` (higher quota for signed-in users).

---

## 19. Frontend — React/TypeScript/Vite, NASA HDS, Offline & Low-Bandwidth

### Stack summary
- React 18.3, React Router 6, TanStack Query 5 for server state.
- Vite 8 + `@vitejs/plugin-react`, Tailwind 4 layered beneath NASA HDS tokens.
- Leaflet 1.9 + `leaflet.heat` + `leaflet.markercluster` for the map; Mapbox is NOT in the dependency tree (divergence from README).
- Recharts for gauges/trends, Framer Motion for motion (capped by NASA rules), react-markdown for content, jspdf + html2canvas-pro for PDF evidence cards, lucide-react icons, qrcode.react for QR codes, react-hot-toast for toasts.
- Self-hosted fonts: Inter (display/headings), Public Sans (body), DM Mono (numbers/code) via @fontsource — no external font requests.

### Pages (from `frontend/src/pages/`)
| Route | Page |
|-------|------|
| `/` | `FrontDoor.tsx` — editorial front door (what HazardNet is, last run, knowledge ledger, authority boundary, attribution block) |
| `/live` | `LiveMapView.tsx` via `Map.tsx` (interactive map console); `/home*` and `/forecast/overview` deep-link here; `/?district=<id>` forwards |
| `/alerts` | `AlertsPage.tsx` — list of all published alerts |
| `/alerts/:id` | `AlertDetailPage.tsx` — printable evidence card with §1.7 disclaimer |
| `/district/:id` | `DistrictDetailPage.tsx` — per-district forecast + alert |
| `/division/:id` | `DivisionDetailPage.tsx` (and `DivisionsPage.tsx`, `NationalOverview.tsx`) |
| `/hazards`, `/hazards/:hazard` | `HazardsPage.tsx`, `HazardDetailPage.tsx` — build-time prerendered methodology pages |
| `/districts/:district` | Build-time prerendered per-district pages |
| `/dashboard` | `UserDashboardPage.tsx` / `Dashboard.tsx` — signed-in user dashboard (~40 profile fields, avatar upload, integrations) |
| `/u/:username` | `PublicProfilePage.tsx` — public profile URL |
| `/advisories` | `AdvisoriesPage.tsx` |
| `/archive`, `/hazards/archive` | `HazardArchivePage.tsx` |
| `/blog`, `/blog/:slug`, `/blogs` | Blog article surface (monetisation with AdSense) |
| `/download`, `/status`, `/docs`, `/about`, `/contact`, `/privacy`, `/terms`, `/use-cases`, `/analytics` | Static/info pages |
| `/login`, `/signup`, `/forgot-password`, `/set-password`, `/update-password`, `/auth/callback`, `/upload` | Auth + utility pages |

### Cross-cutting behaviours
- **Bilingual UI**: English + Bengali (including Bengali numerals and dates; `lang` attribute per element).
- **Offline path** (`serviceWorker.ts`): serves previously cached assets + forecast snapshot; every surface states which data source it's rendering (live API / committed snapshot / offline SW cache).
- **Low-bandwidth mode** (auto-detected via Data Saver, 2G connection, ≤2 GB RAM, ≤4 cores, or user toggle): swaps raster tiles for vector map, drops animations, lands on the text table that doubles as screen-reader alternative.
- **Data source precedence** (in `frontend/src/lib/forecasts.ts`): live API → committed `ALL_64_DISTRICTS` baseline → SW cache; merging is additive so the map never blanks out. District matching runs on normalised names with an alias table covering post-2015 renames (Chattogram/Chittagong, Jashore/Jessore, Cumilla/Comilla, Barishal/Barisal) — parity tested in `test_district_name_parity.py`.
- **Accessibility**: square focus rings (1px dashed carbon-black at 1px offset), screen-reader alternatives for the map, WCAG AA contrast enforced by `staticShellContrast.test.js` and `scripts/qa/a11y-detail.mjs`.

### Design tokens (NASA HDS)
The pipeline is `data/design/nasa-hds/tokens.json` (vendored CC0) → `scripts/import_nasa_tokens.mjs` → `frontend/src/styles/nasa-hds.css` (generated `--hds-*`) → `frontend/src/index.css` maps to semantic `--hn-hds-*`. Rules (from `DESIGN.md`): square corners; hairlines not shadows; red = navigate, blue = in-page action, orange = status, green = fresh/active; only one neutral ramp (carbon-05 … carbon-black); figures in DM Mono right-aligned.

---

## 20. Content Engine and Public Surface (Phase 8)

`scripts/build_content_engine.mjs` runs at build time and:

1. Reads `frontend/src/content/hazard-methodology.json` and the latest forecast snapshot.
2. Composes one static page per hazard class (`/hazards/<hazard>`): what the model labels, the physics cross-check formula, confidence semantics, stated limits.
3. Composes one page per district (`/districts/<slug>`): current run's hazard, severity, confidence, physics divergence; states plainly if the run did not cover the district.
4. Season retrospectives and historical archive sections render only when a historical event archive is loaded; they say so explicitly rather than quoting the 2,931-event dataset claim as if loaded (enforced by `scripts/tests/test_content_engine.py`).
5. prerender.mjs prerenders every page to static HTML with canonical URLs on `www.hazardnet.live`, breadcrumbs, and JSON-LD.
6. Generates a sitemap from the build (so it never lists URLs the site doesn't serve).

`/` front-door copy is in `frontend/src/content/site-routes.json` so the static HTML, the React app, and `<head>` meta stay consistent. Every figure is read from committed artifacts; a missing value renders as "missing" text, never as zero.

`scripts/build_model_performance.mjs` produces the model-performance JSON consumed by the status/public surfaces.

`scripts/build_forecast_snapshot.mjs` writes the `frontend/public/data/forecasts-latest.json` used by the offline snapshot path.

`scripts/build_hazard_archive.mjs` + `scripts/build_archive_rag_docs.mjs` construct the historical archive and its RAG-ready markdown.

---

## 21. ETL Subsystem (`scripts/etl/`)

Python package for bulk data construction, invoked via `python3 -m scripts.etl.cli <command>`:

| Module | Purpose |
|--------|---------|
| `cli.py` | Typer/argparse CLI entry point |
| `sources.py` | Data source registry (GEE, COG, BMD, FFWC, MODIS, ERA5, Open-Meteo, Sentinel-2) |
| `cog.py` | Cloud-Optimized GeoTIFF handling (STAC scene discovery) |
| `scene_manifest.py` | Content-hash manifest of input scenes for dataset versioning (PRODUCT_SPEC §5.8, `dataset_version`) |
| `bulletins.py` | BMD (Bangladesh Meteorological Department) weather bulletin parsing |
| `hydrology.py` | FFWC (Flood Forecasting and Warning Centre) station/water-level parsing |
| `events.py` | Historical hazard event record loading and validation (drives hindcast) |
| `districts.py` | **Canonical 64-district resolver** — maps FAO GAUL 2015 spellings (Chittagong, Comilla, Jessore, Barisal) to current names (Chattogram, Cumilla, Jashore, Barishal), exposes `resolve()`, `pcode_of()`, `division_of()`, and the full `NAMES` tuple. This is the authority referenced by the Kaggle bridge and the frontend alias table; parity is enforced by `test_district_name_parity.py`. |
| `db.py` | Firestore writing helpers (PostgreSQL helpers retained for history) |
| `adapters/bgd_climatic_hazards.py` | Adapter for the `BGD_climatic_hazards_dataset_2000_2026.csv` dataset |

`npm run archive:load` demonstrates ingesting the 2,931-event historical dataset through this adapter into the event archive.

---

## 22. MLOps Subsystem (`scripts/mlops/`)

Python package (`python3 -m scripts.mlops.cli`) for ongoing model operations:

| Module | Purpose |
|--------|---------|
| `registry.py` | Model registry — tracks promoted FP32 TFLite bundle with SHA-256, version (SemVer), artifacts written to `Models/VERSION.json`, `Models/REGISTRY.json` |
| `metrics.py` | Computation of accuracy, weighted/macro F1, per-class P/R/F1, RMSE, MAE, R², ECE (Expected Calibration Error) |
| `calibration.py` | Platt scaling and isotonic regression when ground-truth labels accumulate; writes `Models/calibration/confidence_map.json` and emits `confidence_calibrated` column for ingest |
| `drift.py` | Compares the daily-pulled `normalization_stats.json` from Kaggle against `Models/normalization_stats.json`; PSI/KS per-band; reports drift severity |
| `evaluate.py` | Evaluates a model bundle against a fold manifest |
| `retrain_state.py` | State machine gating monthly retraining (drift threshold / scheduled / manual) |
| `cli.py` | Commands: `register`, `evaluate`, `apply-calibration`, `check-drift`, `set-retrain-state` |

Monthly retraining is **human-initiated** via `ml/HazardNet_auto_train.ipynb` on Colab T4; the notebook's last cell opens a pull request that `.github/workflows/model_intake.yml` gates (bundle structure, parity test, SHA-256) before a person merges, promoting the new model through the registry.

---

## 23. Hindcast Subsystem (`scripts/hindcast/`)

Hindcasts re-run the model against historical events with known outcomes for back-testing:

- `episodes.py` defines historical episode drivers (e.g. Cyclone Amphan 2020 at `data/hindcast/drivers/amphan-2020.json`).
- `fetch.py` reconstructs the tensors for the episode dates using the same GEE/Open-Meteo pipeline.
- `score.py` evaluates hindcast predictions against observed outcomes (BMD/FFWC/ReliefWeb records).
- Fixtures under `scripts/tests/fixtures/hindcast/` are used by `test_hindcast.py`.

Hindcasts are invoked via `.github/workflows/hindcast.yml`.

---

## 24. CI/CD Workflows (12 workflows)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR/push | Lint, typecheck, Jest |
| `daily_forecast.yml` | Schedule 00:00 UTC | Fetch Kaggle forecast, validate, commit snapshot/content |
| `weekly_forecast.yml` | Schedule weekly | Build archive + GitHub Release artifact |
| `forecast-pipeline.yml` | Manual / workflow_dispatch | End-to-end re-run of pipeline |
| `manual_forecast_ingest.yml` | workflow_dispatch | Firestore ingest of the latest committed CSV against a deploy |
| `model-validation.yml` | PR/push to model paths | Bundle smoke, parity, claim checks |
| `v3-ml-contracts.yml` | PRs affecting model schema | Contract enforcement |
| `model_intake.yml` | PRs from retraining | Gating checks before merge (bundle structure, parity, SHA) |
| `mlops.yml` | Schedule/PR | MLOps unit tests, drift, calibration, evaluate |
| `hindcast.yml` | Schedule/PR | Hindcast episodes and scoring |
| `site-health.yml` | Schedule | Production site health/ping |
| `Firebase-Store-Verify.yml` / `verify-secrets.yml` | Schedule/PR | Verify Firestore rules; secret-scan |

Templates in `.github/workflow-templates/` are skeleton workflows for additional deploy targets (Linux daemon CLI, Android field agent, Windows GIS workstation, npm package, Python package).

---

## 25. Vercel Deployment Configuration

`vercel.json` (root):
- **Build command** `npm run build` (which builds frontend and copies static files via `copy-dist.mjs`).
- **Output directory** `dist`.
- **Functions**: `api/chat/query.js` and `api/chat/sample-questions.js` include `../rag_pipeline/**` in their serverless bundle.
- **Redirects**: `/documentation → /docs` (permanent); apex `hazardnet.live → www.hazardnet.live`.
- **Rewrites**: any non-asset, non-API path to `/404.html` (lets the SPA handle its own 404s).
- **Headers** (global `/(.*)`):
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS `max-age=63072000; includeSubDomains; preload`, `Permissions-Policy` (camera=(), mic=(), geolocation=(self), payment=(), usb=()), `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
  - **CSP** (mirrors `backend/security/csp.js`): `default-src 'self'`; `script-src` includes Google/GStatic/gTag/AdSense partners; `style-src 'self' 'unsafe-inline'` + Google Fonts; `img-src 'self' data: blob: https:`; `font-src 'self' data: fonts.gstatic.com`; `connect-src 'self' https: wss:` plus googleapis/firebase/google/gstatic/github endpoints; `frame-src` for Firebase auth, Google Accounts, GitHub; `worker-src 'self' blob:`; `media-src 'self' blob:`; `object-src 'none'`; `frame-ancestors 'none'`; `form-action` allows Firebase/Google/GitHub auth.
- **Cache-Control**: `/assets/*` immutable 1 year; `/serviceWorker.js` no-cache; `/data/*` must-revalidate; `/.well-known/*` 1 day.

`frontend/vercel.json` handles prerendered route headers for the built client.

---

## 26. Results & Reported Performance (IEEE TGRS Tables II–VI)

The training pipeline is configured to produce five publication tables (HazardNet.md Phase 5), driven by four validation strategies and one ablation. The actual numbers in the paper depend on the latest full training run; the code computes them as:

- **Table II — Event-based 5-fold CV (Strategy 0):** per-fold and mean±std of Accuracy, Weighted F1, Severity RMSE, Severity R² over 5 folds.
- **Table III — Spatial LODO (Strategy 1):** per-division metrics (8 rows) plus macro-average; `plot_spatial_heatmap` renders division×season.
- **Table IV — Temporal split (Strategy 2):** season-specific train/val/test metrics.
- **Table V — Spatio-temporal (Strategy 3):** up to 24 folds with min 5 test events per fold.
- **Table VI — Ablation (A1–A4 vs A0 baseline):** Accuracy, F1, RMSE, R², param count, and **deltas** against the A0 baseline CSV (loaded from `A0_RESULTS_CSV`; deltas marked N/A if the baseline file is unavailable).

The model is intentionally small (~137k parameters) — designed for edge/TFLite deployment, not for absolute SOTA on big-GPU benchmarks. The dual-track system deliberately prioritises **transparency and calibration over headline accuracy**: a farmer/extension officer can see when the CNN and physics proxy disagree.

The `results/bd_thresholds_validation.log` contains the Bangladesh-specific threshold validation (BMD Cold Wave ≤16°C, etc.) outputs from `training/run_bd_proofs.py`.

---

## 27. Evaluation & Validation Regime

Four classes of validation run continuously:

### 27.1 Model-level validation (`.github/workflows/model-validation.yml`)
- **Bundle structure test** (`test_model_intake_smoke.py`): asserts the TFLite loads, input shape is `(1, 15, 10, 64, 64)` (or NDHWC), output count and sizes match, labels/normalisation JSON parse.
- **Handshake test** (`test_model_handshake.py`): feeds a known synthetic tensor and asserts shape/stability.
- **Golden parity** (in Phase 6 deployment converter) between PyTorch and TFLite.
- **Claims test** (`test_model_claims.py`): fails the build if public copy advertises unsupported horizons, INT8, or browser inference.

### 27.2 Forecast-level validation (`scripts/validate_forecasts.py`)
- **Freshness gate:** `prediction_date` must be within 26 hours of the run.
- **Coverage gate:** must produce records for all 64 canonical districts × all horizons the row declares; partial runs are warned but allowed with explicit missing-district list in the manifest.
- **Schema validation** through `parseCsvForecastRow` (value ranges, whitelists, mandatory columns).

### 27.3 Drift monitoring (`scripts/mlops/drift.py`, mlops workflow)
- Per-band PSI/KS between Kaggle-pulled stats and training stats.
- Fires a retrain recommendation when drift exceeds thresholds (gated by `retrain_state.py`).

### 27.4 Security & design validation (CI)
- `scripts/check-secrets.sh` + `test_secret_scan.py` block credential commits.
- `securityHeadersParity.test.js` ensures Helmet CSP matches `vercel.json`.
- `test_district_name_parity.py` ensures ETL, frontend alias table, and snapshot agree on district names.
- `test_content_engine.py` prevents zero-fill on missing metrics and false claims about loaded archives.
- `scripts/check-design-quality.mjs`, `scripts/qa/*` enforce NASA HDS rules (no slate/zinc, colour contrast, square corners, text-on-tinted-surface, no bounce/pulse/loop animations).
- `scripts/check-bundle.mjs` enforces bundle budgets.
- `scripts/check-rag-freshness.mjs` ensures RAG reference docs carry currency metadata.

---

## 28. Confidence Semantics, Calibration, and Score Binning

- **Raw confidence:** the softmax probability of the predicted class (`np.max(softmax(logits))`). This is **uncalibrated** and must NOT be quoted as a probability of the hazard occurring (MODEL_CARD §6).
- **Binning (relative scanning bands):**
  - **Certain** ≥ 0.85
  - **Probable** 0.70 – 0.85
  - **Uncertain** < 0.70
- **Calibrated confidence (opt-in):** when `scripts/mlops/calibration.py apply-calibration` has been run and the CSV carries `confidence_calibrated`, the ingest parser publishes that as `confidence`, stores the raw in `confidence_raw`, and sets `confidence_kind = 'calibrated_probability'`. By default no calibration is applied; the UI labels confidence as uncalibrated.
- **Track divergence** = `|model_severity − physics_severity|`; high divergence can independently trigger a WATCH (see `ALERT_DIVERGENCE_WATCH`).
- **Physics agreement** boolean = whether the physics track independently selected the same class.
- **Expected Calibration Error (ECE) target** ≤ 0.05 when calibrated. The training code prints the confidence-bin distribution.

---

## 29. Security Hardening

Security considerations are codified in `SECURITY.md`, `backend/security/csp.js`, `firestore.rules`, and the audit trail under `docs/audits/`. Highlights:

- **Helmet** with strict CSP enforcing in production; Report-Only in dev; CSP replicated in `vercel.json` with parity test.
- **Fail-closed** configuration: missing `BACKEND_API_KEY` returns 503 on ingest; missing `FRONTEND_ORIGIN` rejects CORS in production.
- **Frameguard DENY**; HSTS preloaded; Referrer-Policy strict-origin-when-cross-origin; Permissions-Policy locks down camera/mic/payment/usb.
- **Tiered rate limiting** on all API routes.
- **Serverless guards** (`backend/middleware/serverlessGuard.js`) bound payload size and execution time on Vercel.
- **API key auth** for ingest pipeline (`backend/utils/apiKeyAuth.js`); Firebase ID tokens for user-facing privileged routes.
- **Duty-officer allowlist** (`ALERT_DUTY_OFFICERS`) for WARNING/SEVERE alert review.
- **No model artifacts served**: explicit route block for `/Models/*`, `*.tflite`, `*.onnx`, `*.h5`, `*.pt` etc.
- **CSV injection protection** (`backend/utils/csvSafety.js`) and JSON number typing in the bridge.
- **HTML sanitisation** via `dompurify` before rendering any AI- or user-generated HTML.
- **Firestore RLS** (`firestore.rules`, 11 KB): granular read/write rules for forecasts (public read, service-write), user profiles (owner write), blog articles (admin write), alert review (duty-officer only).
- **Secret scanning** (`scripts/check-secrets.sh`, `test_secret_scan.py`) — known historical leakage flagged in `.env.example` comment with rotation required.
- **Dependency audit:** `scripts/npm-audit-ci.mjs` runs in CI.
- **Audit exceptions** are enumerated in `audit-exceptions.json` with rationales.

---

## 30. Running Locally

### Prerequisites
- Node.js 20+
- Python 3.8+ (with `pip install -r scripts/requirements-pipeline.txt` for ETL/MLOps scripts)
- A `.env` based on `.env.example` (fill in `BACKEND_API_KEY` for ingest; other keys are optional).

### Full stack (manual)
```bash
npm install
# terminal 1
npm start                      # backend on http://localhost:3000 (PORT can override; server.js binds 3000)
# terminal 2
cd frontend && npm install && npm run dev   # Vite dev server on http://localhost:3000, proxies /api → :3001? (see vite.config.ts)
```
(Note: `npm run dev` at root runs `npm run build:frontend && node backend/server.js`, serving the built client from Express.)

### Frontend-only
```bash
cd frontend && npm install && npm run dev
```

### Lint / typecheck / test
```bash
npm run lint            # tsc --noEmit
npm run lint:eslint
npm test                # jest
npx playwright test     # E2E
python3 -m pytest scripts/tests  # Python script tests
```

### Scripts of interest
```bash
npm run alerts:rehearse          # Dry-run alert engine, output to /tmp
npm run check:design             # NASA HDS design-quality audit
npm run check:bundle             # Bundle-size budget
npm run archive:build            # Build historical hazard archive
python3 scripts/fetch_kaggle_forecast.py --help
python3 -m scripts.mlops.cli --help
python3 -m scripts.etl.cli --help
```

---

## 31. Discussion: Limitations, Future Work, and Known Divergences

1. **Stored forecasts are the only production path.** The architecture deliberately does not offer real-time inference, which means latency between a new observation and a published forecast is bounded by the daily Kaggle schedule (≤24h). This is acceptable for agricultural advisories on 7/15-day horizons but not for short-impact events like flash floods on sub-daily scales.
2. **Physics proxies are approximations, not calibrated hydromet models.** The VHI/EHF/SAR-flood formulas are transparent heuristics. They cross-validate the CNN but are not substitutes for basin-calibrated hydrological models (e.g. MIKE, HEC-RAS).
3. **The INT8 file is misnamed (ADR 0007).** Until TFLite ships a CONV_3D kernel that supports INT8 quantisation, edge deployments are limited to FP32. The current FP32 bundle fits under the 150 MB edge target but is too large for microcontroller-class devices.
4. **Horizon expansion (10/20/30 days) and ADM3 upazila-level expansion (ADR 0005/0006) are accepted but not shipped.** They require coordinated backend/UI/coverage changes; `test_model_claims.py` blocks premature advertising. ADR 0008 (meteorological fields) is in progress.
5. **README drift.** The README still shows Mapbox GL and Postgres/Docker in places where the code uses Leaflet, Firestore, and lacks a docker-compose file; this is flagged as intent-vs-reality in CONCERNS.md.
6. **Browser CNN / WASM edge mode** is mentioned in the README architecture diagram but is not implemented. ADR 0009 and product direction favour pre-computed forecasts over in-browser inference.
7. **Firebase service account dependency.** Ingest writes require valid Firestore credentials; without them writes fail closed (a deliberate choice to avoid producing memory-only "success"). Operators must set `FIREBASE_SERVICE_ACCOUNT_JSON` or run on infrastructure with Application Default Credentials.
8. **District identity is name-based.** `fetch_kaggle_forecast.py` resolves district identity by exact name with GAUL alias fallbacks, and refuses to guess. New GAUL naming revisions require updating `scripts/etl/districts.py`; the parity test catches drift vs the frontend alias table.
9. **Physics track is single-source.** The Open-Meteo formulas are driven only by Open-Meteo daily aggregates. Blending in BMD/FFWC bulletins (via `scripts/etl/bulletins.py` and `hydrology.py`) is in progress and would strengthen the independent line of evidence.
10. **Model provenance gap.** Because Kaggle kernels hold their own copy of the TFLite, the daily pull records `model_bytes_verified: false` (§14). Until a byte-for-byte verification against the promoted SHA in `Models/VERSION.json` is implemented on the Kaggle side, provenance is "repository version at pull time", not "executed bytes verified".
11. **venv in repo** — the root `venv/` directory is in the working tree and `.gitignore` only excludes `.venv/`, meaning a multi-megabyte virtualenv exists under version control and should be removed/ignored.
12. **Retraining is human-initiated monthly.** MLOps drift detection can recommend retraining but will not auto-merge new model weights; a person must review and merge the intake PR. This is intentional for safety.

### Intent-vs-Reality Summary
| README / PRD says | Code actually does | Status |
|-------------------|--------------------|--------|
| Mapbox GL map | Leaflet map | Divergence (README update needed) |
| Edge Mode TFLite WASM in browser | No TFJS/WASM deps; stored forecasts only | Divergence (ADR 0009) |
| 7/15-day horizons + 10/20/30 (Phase 7) | 7/15 live; 10/20/30 blocked by claims test | ADR 0005 pending |
| PostgreSQL backend (docker-compose) | Firestore (ADR 0014); no docker-compose file | Divergence |
| FP32 + INT8 TFLite bundles | Two FP32 copies (ADR 0007) | Documented |

---

## 32. Evidence Index (File Paths)

Every claim in this document is traceable to one or more of:

- `README.md`, `DESIGN.md`, `HazardNet.md`, `CITATION.cff`, `LICENSE`, `SECURITY.md`
- `package.json`, `frontend/package.json`, `.env.example`, `vercel.json`, `firebase.json`, `firestore.rules`
- `backend/server.js`, `backend/routes/*.js`, `backend/middleware/*.js`, `backend/utils/*.js`, `backend/security/csp.js`
- `backend/alerts/{assess,channels,digest,lifecycle,notify,policy,report,service,store}.js`
- `backend/{forecastStore,forecastPersistence,db,metrics,modelInfo}.js`
- `scripts/fetch_kaggle_forecast.py`, `scripts/validate_forecasts.py`, `scripts/physics_severity.py`, `scripts/auto_forecast.py`
- `scripts/etl/{cli,sources,cog,bulletins,hydrology,events,districts,db,scene_manifest}.py`, `scripts/etl/adapters/bgd_climatic_hazards.py`
- `scripts/mlops/{cli,calibration,drift,evaluate,metrics,registry,retrain_state}.py`
- `scripts/hindcast/{cli,episodes,fetch,score}.py`
- `scripts/build_*.mjs`, `scripts/check-*.mjs`, `scripts/copy-dist.mjs`, `scripts/validate_env.mjs`, `scripts/rehearse_alert_engine.mjs`, `scripts/ingest_forecast_csv.mjs`, `scripts/gen-model-version.mjs`, `scripts/import_nasa_tokens.mjs`, `scripts/bench-predict.mjs`
- `scripts/qa/*.mjs`, `scripts/db/*.sql`, `scripts/tiles/build-adm3-tiles.sh`
- `scripts/tests/test_*.{py,mjs}`, `scripts/tests/fixtures/**`
- `__tests__/**/*.test.js`
- `frontend/{package.json,vite.config.ts,vercel.json,index.html,index.css,tsconfig.json}`
- `frontend/src/{main.tsx,App.tsx,serviceWorker.ts}`
- `frontend/src/pages/*.tsx`, `frontend/src/components/*.tsx`
- `frontend/src/lib/forecasts.ts`
- `frontend/src/content/*.json`
- `frontend/src/data/*.json`, `frontend/src/styles/*.css`
- `Models/{hazardnet_fp32.tflite,hazardnet_int8.tflite,labels.json,normalization_stats.json,preprocessing_config.json,REGISTRY.json,VERSION.json,inference_example.py,README.md}`, `Models/calibration/confidence_map.template.json`
- `training/hazardnet_scientific_pipeline.py`, `training/hazardnet_bd_thresholds.py`, `training/run_bd_proofs.py`, `training/tests/test_severity_normalizer.py`, `training/requirements.txt`
- `ml/*.ipynb`
- `rag_pipeline/{search.js,skill_router.js}`, `rag_pipeline/references/**`, `references/**`, `skills/**`
- `data/{events,hazardnet_forecasts_latest.csv,design/nasa-hds/*,hindcast/*}`, `data/icons/hazard_profiles.json`
- `backend/data/forecasts/{hazardnet_forecasts_latest.csv,hazardnet_forecasts_latest.json,manifest.json}`
- `.github/workflows/{daily_forecast,weekly_forecast,forecast-pipeline,manual_forecast_ingest,model-validation,mlops,hindcast,model_intake,v3-ml-contracts,site-health,ci,Firebase-Store-Verify,verify-secrets}.yml`
- `.github/workflow-templates/*.yml`
- `docs/adr/*.md`, `docs/{PRD,TRD,PRODUCT_SPEC,MODEL_CARD,PUBLIC_SURFACE,RUNBOOK_LOG,CLAIMS,PHASES_0-9_AUDIT,PRODUCTION_RUNBOOK}*.md`, `docs/{alerts,mlops,frontend,design-system,ops,audits}/*`
- `assets/docs/MODEL_CARD.md`
- `VERCEL_ENV_TEMPLATE.md`, `HAZARDNET_WEBAPP_DEPLOYMENT_GUIDE.md`, `ARTIFACTS.yaml`, `audit-exceptions.json`
- `results/bd_thresholds_validation.log`

---

## [ASK USER] — Open Questions

1. Is Mapbox still referenced anywhere (tile endpoints, styles) or should the README Mapbox references be retired in favour of Leaflet-only?
2. Are the PostgreSQL migrations under `scripts/db/` still planned for a future cutover, or should they be archived under `docs/archive/` to reduce onboarding ambiguity?
3. Is Edge/TFJS WASM inference a roadmap goal or can it be removed from the README architecture diagram?
4. What is the expected cutover date/plan for the 10/20/30-day horizons and ADM3 expansion (ADR 0005/0006)? The Kaggle producer appears to emit these, but the backend/UI/claims-test block them.
5. Was the leaked credential history in `.env.example` comments fully rotated?
6. Should the in-repo `venv/` directory be removed and `venv/` added to `.gitignore` (currently only `.venv/` is ignored)?
7. Is there a Conventional Commits / changelog enforcement policy you would like documented? (Currently informal.)
