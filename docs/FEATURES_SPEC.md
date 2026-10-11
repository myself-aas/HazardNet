# FEATURES_SPEC.md — HazardNet Live Web Platform

> **Document Control**
> | Field | Value |
> |---|---|
> | **Version** | 5.0.0 |
> | **Last Updated** | 2026-10-10 |
> | **Author** | Ashif Ahmed Shuvo (ORCID 0009-0003-5734-1519) |
> | **Institution** | Dept. of Agrometeorology, Bangladesh Agricultural University (BAU) |
> | **Supervisor** | Dr. Ahmed Khairul Hasan |
> | **Live URL** | https://www.hazardnet.live |
> | **Repository** | https://github.com/myself-aas/HazardNet |
> | **Advisory Data** | https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts |
> | **License** | Code: MIT · Data: CC BY-NC 4.0 |
> | **Status** | Production — Daily CI/CD |

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Feature 01 — Front Door (Landing Page)](#2-feature-01--front-door-landing-page)
3. [Feature 02 — Live GIS Hazard Map](#3-feature-02--live-gis-hazard-map)
4. [Feature 03 — District Outlook Page (Drill-Down Console)](#4-feature-03--district-outlook-page-drill-down-console)
5. [Feature 04 — Neuro-Symbolic Physics Validation Layer](#5-feature-04--neuro-symbolic-physics-validation-layer)
6. [Feature 05 — Single-Tier Impact Narrative (Cognitive UX)](#6-feature-05--single-tier-impact-narrative-cognitive-ux)
7. [Feature 06 — Dynamic Environmental Spotlight](#7-feature-06--dynamic-environmental-spotlight)
8. [Feature 07 — Trust-Gated Advisory Dispatch Engine](#8-feature-07--trust-gated-advisory-dispatch-engine)
9. [Feature 08 — Published Alerts Page](#9-feature-08--published-alerts-page)
10. [Feature 09 — Sector Advisories](#10-feature-09--sector-advisories)
11. [Feature 10 — Omnichannel Notification & Calendar Injection](#11-feature-10--omnichannel-notification--calendar-injection)
12. [Feature 11 — Task & Workflow Injection](#12-feature-11--task--workflow-injection)
13. [Feature 12 — Offline PWA Architecture](#13-feature-12--offline-pwa-architecture)
14. [Feature 13 — Localized Accessibility Suite (Bangla + TTS)](#14-feature-13--localized-accessibility-suite-bangla--tts)
15. [Feature 14 — CI/CD Pipeline (GitHub Actions + Kaggle)](#15-feature-14--cicd-pipeline-github-actions--kaggle)
16. [Feature 15 — System Status & Provenance Page](#16-feature-15--system-status--provenance-page)
17. [Feature 16 — Model Card & Validation Scorecard](#17-feature-16--model-card--validation-scorecard)
18. [Feature 17 — Data Source Ledger](#18-feature-17--data-source-ledger)
19. [Feature 18 — Serverless API Surface](#19-feature-18--serverless-api-surface)
20. [Feature 19 — Agent Discovery & Interoperability Layer](#20-feature-19--agent-discovery--interoperability-layer)
21. [Feature 20 — Blog & Field Notes](#21-feature-20--blog--field-notes)
22. [Feature 21 — Download Centre](#22-feature-21--download-centre)
23. [Feature 22 — Authentication & Account Management](#23-feature-22--authentication--account-management)
24. [Feature 23 — Mobile & Desktop Targets](#24-feature-23--mobile--desktop-targets)
25. [Data Contracts & API Schemas](#25-data-contracts--api-schemas)
26. [Edge Constraints & Performance Budgets](#26-edge-constraints--performance-budgets)
27. [Security, Governance & Publication Ethics](#27-security-governance--publication-ethics)
28. [Monitoring, Observability & SLOs](#28-monitoring-observability--slos)
29. [Glossary](#29-glossary)

---

## 1. System Architecture Overview

HazardNet is an **edge-first, physics-guarded, multi-hazard early warning
platform** for Bangladesh agriculture. It is not a static research showcase.
It is a production-grade operational decision-support system that publishes
dated 7-day and 15-day hazard outlooks for all 64 districts of Bangladesh
(507 ADM3 units: 495 upazilas + 12 city corporations), across 8 hazard
classes, with two honestly labelled severity tracks per forecast record.

### 1.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION LAYER                         │
│                                                                     │
│  Google Earth Engine ──► Sentinel-1 SAR (VV, VH)                    │
│  (GEE Project:          Sentinel-2 Optical (Blue, Red, NIR, SWIR)  │
│   hazardnet-aas48424)   ERA5-Land (Temp, Precip, Soil, Dewpoint,   │
│                                   Solar Rad)                        │
│  Open-Meteo API ──────► Forward-looking meteorological triggers     │
│  ReliefWeb API ───────► Historical disaster reports                 │
│  EM-DAT ──────────────► Global disaster database                    │
│  EONET ───────────────► NASA natural event proximity matching       │
│  DesInventar ─────────► Crop loss records (hectares)                │
│  GLIDE ───────────────► OCHA event identifiers                      │
│  NOAA GFS (WGrib2) ──► Live wind field telemetry                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     TENSOR ASSEMBLY & MODEL                         │
│                                                                     │
│  15-channel spatiotemporal grid: (1, 15, 10, 64, 64) NCTHW         │
│  10 temporal steps × 64×64 spatial pixels × 15 channels            │
│                                                                     │
│  HazardNet v4.1 (0.314M params, 1.21 MB, 2.04 ms latency)          │
│  Conversion: onnx2tf (Static Graph + Native LSTM Fix)              │
│  Outputs: hazard_logits (B, 8) + severity_pred (B, 1)              │
│                                                                     │
│  Validation: 4-strategy leakage-safe protocol                       │
│    ├── Event K-Fold (random sample split)                           │
│    ├── Grouped K-Fold (district-held-out clustered split)           │
│    └── Spatial LODO (8 folds, zero-shot spatial)                    │
│    └── Rolling Origin (causal temporal gate, 8+ folds)              │
│                                                                     │
│  Baselines benchmarked:                                             │
│    ├── 3D ResNet-18 (Heavyweight 3D CNN)                            │
│    ├── TimeSformer (Divided Transformer)                            │
│    ├── MobileNetV3-Large (2D Late-Fusion)                           │
│    └── ConvLSTM (3D Spatio-Temporal RNN)                            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│               NEURO-SYMBOLIC PHYSICS VALIDATION                     │
│                                                                     │
│  Neural severity (S_nn) cross-checked against deterministic         │
│  agrometeorological indices (I_phys):                               │
│    • Flood/Flash Flood → SAR specular backscatter ratios (σ⁰)      │
│    • Drought → Vegetation Health Index (VHI: NDVI + LST)            │
│    • Heat Wave → Excess Heat Factor (EHF, 3-day anomaly)            │
│    • Cold Wave → Sub-16°C minimum temperature anomaly               │
│    • Fire → Low relative humidity + vegetation drying index         │
│    • Cyclone → Sustained wind > 50 km/h + precipitation            │
│    • Severe Local Storm → Convective CAPE + squall wind             │
│                                                                     │
│  Divergence circuit breaker: Δ = |S_nn − I_phys|                   │
│    Δ ≤ 0.40 → Physics-aligned, proceed                              │
│    Δ > 0.40 → physical_divergence_warning, auto-escalate            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  CI/CD & PUBLICATION PIPELINE                       │
│                                                                     │
│  GitHub Actions (daily cron) ──► Kaggle Dataset                     │
│    ashifahmedshuvo/hazardnet-weekly-forecasts                       │
│    2 files, 22 columns, 553.2 kB, CC BY-NC 4.0                     │
│    Updated: Daily (synced from 8-HazardNet-Advisory notebook)       │
│                                                                     │
│  Committed artifacts ──► Vercel (6/12 serverless functions)         │
│  108 prerendered pages ──► CDN edge cache                           │
│  PMTiles ──► Client-side vector tile cache                          │
│  Service Worker ──► IndexedDB offline state store                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    USER-FACING SURFACES                             │
│                                                                     │
│  Web PWA (React + Cupertino Precision design system)                │
│  Android APK (Expo / React Native)                                  │
│  Windows MSIX (WinUI)                                               │
│  Omnichannel dispatch (iCal, Slack, Discord, Email, LinkedIn)       │
│  Agent APIs (A2A, MCP, WebMCP, REST)                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 The 15 Input Channels

Every forecast ingests a 15-channel spatiotemporal tensor. The channels
are grouped into three sensor families:

| Index | Channel Name | Sensor Family | Source |
|-------|-------------|---------------|--------|
| 0 | SAR_VV | Radar (SAR) | Sentinel-1 (GEE) |
| 1 | SAR_VH | Radar (SAR) | Sentinel-1 (GEE) |
| 2 | Blue | Optical | Sentinel-2 (GEE) |
| 3 | Red | Optical | Sentinel-2 (GEE) |
| 4 | NIR | Optical | Sentinel-2 (GEE) |
| 5 | SWIR | Optical | Sentinel-2 (GEE) |
| 6 | Temp_2m | Reanalysis | ERA5-Land (GEE) |
| 7 | Precip | Reanalysis | ERA5-Land (GEE) |
| 8 | Max_Temp | Reanalysis | ERA5-Land (GEE) |
| 9 | Min_Temp | Reanalysis | ERA5-Land (GEE) |
| 10 | Soil_W1 | Reanalysis | ERA5-Land (GEE) |
| 11 | Soil_W3 | Reanalysis | ERA5-Land (GEE) |
| 12 | Soil_T1 | Reanalysis | ERA5-Land (GEE) |
| 13 | Dewpoint | Reanalysis | ERA5-Land (GEE) |
| 14 | Solar_Rad | Reanalysis | ERA5-Land (GEE) |

### 1.3 The 8 Hazard Classes

| # | Hazard Class | Seasonal Window | Primary Physical Driver |
|---|-------------|-----------------|------------------------|
| 1 | Flood | Jun–Sep (monsoon peak Jul–Aug) | Cumulative ERA5/GFS precipitation |
| 2 | Flash Flood | Mar–May + Jun–Sep | High-intensity burst rainfall (Haor basin) |
| 3 | Tropical Cyclone | Apr–May, Oct–Nov | Sustained wind > 50 km/h + rain (Bay of Bengal) |
| 4 | Drought | Nov–Apr (dry season) | Heat load vs. expected rainfall (Barind Tract) |
| 5 | Heat Wave | Mar–Jun (pre-monsoon) | Exceedance above 30°C + persistence |
| 6 | Cold Wave | Dec–Feb | Minimum temp below 16°C + persistence (northern border) |
| 7 | Fire | Feb–May, Dec–Jan | Low relative humidity + vegetation drying |
| 8 | Severe Local Storm | Mar–May (Kalbaishakhi) | Convective CAPE + squall wind + downpour |

### 1.4 Model Performance (Verified Against Committed Artifacts)

| Metric | HazardNet v4.1 |
|--------|---------------|
| Parameters | 0.314 M |
| Model Size | 1.21 MB |
| Inference Latency | 2.04 ms |
| Accuracy | 0.9317 |
| Macro F1 | 0.9335 |
| POD (Recall) | 0.9444 |
| FAR | 0.0613 |
| CSI | 0.8904 |
| RMSE | 0.1868 |

> **Note:** These figures are extracted from the committed experimental
> results catalog (`HAZARDNET_RESULTS.md`). The training archive
> (2,931 events, 2000–2025) is assembled from third-party records whose
> licences govern redistribution. The repository ships the loader; the
> archive itself is not redistributed. The model card states this plainly
> rather than quoting the figure as verified.

---

## 2. Feature 01 — Front Door (Landing Page)

### 2.1 Purpose

The front door answers one question in under three seconds: *"Is there a
hazard right now, and where?"* It is not a marketing page. It is an
operational status strip that reads the committed alert artifact on every
load.

### 2.2 Step-by-Step Render Sequence

1. **Artifact Read (Client-Side):**
   On page load, the React hydration routine reads the committed
   `forecasts-latest.json` and `alerts-latest.json` artifacts from the
   Vercel CDN edge cache. No server-side database query is made. The
   strip under the headline renders:
   - Count of published alerts at each tier (WATCH / WARNING / SEVERE)
   - Number of districts the last run covered (e.g., "60 / 64")
   - Number of assessed rows the publication gate withheld
   - Timestamp of the last run (e.g., `2026-10-09T20:18:27.961Z`)

2. **Silence Guard:**
   If zero alerts are published, the page does **not** show an empty
   counter. It renders the explicit statement:
   > *"No alert is published at the moment of this read. That is a
   > statement about the publisher, not about the weather."*

   This prevents the most dangerous misreading on a hazard platform:
   silence interpreted as safety.

3. **Hazard Bento Grid:**
   Eight hazard class cards render in a responsive bento layout. Each
   card carries:
   - Hazard name + icon
   - One-line physical description (e.g., *"Riverine and monsoon
     flooding, scored from how much rain falls and how hard it falls."*)
   - Seasonal window badge (e.g., "June–Sept peak")
   - Data source tag (e.g., "Daily ERA5 & GFS precipitation telemetry")
   - Link to the full methodology page for that class

4. **Coverage Statistics Bar:**
   Four headline numbers, each sourced from committed artifacts:
   - `8` hazard classes
   - `64` districts on the live map
   - `7 & 15` forecast horizons (days)
   - `5` historical episodes scored in the validation report

5. **Knowledge Product Index:**
   A dated table linking to every published product:
   | Product | Reviewed | Route |
   |---------|----------|-------|
   | Model Card | 2026-09-17 | `/model` |
   | Validation Scorecard | 2026-09-24 | `/model-performance` |
   | Data-Source Ledger | 2026-09-17 | `/data-sources` |
   | System Status | 2026-09-18 | `/status` |
   | Alerts | 2026-09-18 | `/alerts` |
   | Sector Advisories | 2026-09-17 | `/advisories` |

6. **Official Record Disclaimer:**
   A persistent, non-dismissible banner names the four authoritative
   bodies whose bulletins outrank anything on this site:
   - Bangladesh Meteorological Department (BMD)
   - Flood Forecasting and Warning Centre (FFWC)
   - Department of Disaster Management (DDM)
   - National emergency hotline: **999**

### 2.3 Design System

The front door is built on the **Cupertino Precision** design system
(documented in `DESIGN.md` and `apple/DESIGN.md`):
- Token namespace: `--ap-*` (e.g., `--ap-canvas`, `--ap-hairline`,
  `--ap-grouped`, `--ap-on-scrim`)
- Dark theme: OLED `#000` canvas with `#161617`, `#1c1c1e`, `#242426`
  tile surfaces
- Type scale: role-based (`--ap-type-<role>-*`), 400/500/600/700 weight
  ladder
- Hazard palette: per-class accent colours via `hazardPalette()` with
  `text` (light) and `onDark` (dark) variants
- Elevation: limited to product imagery, popovers, and segmented thumbs
- WCAG compliance: all text colours meet contrast minimums; the design
  records each deviation from the literal spec in implementation notes

### 2.4 Internationalization

- Full Bangla (বাংলা) Unicode rendering on the front door, alert cards,
  map labels, and district tables
- Language switch at the top of the page
- Fallback rule: where a sentence has no Bangla version, the English
  original is shown rather than a gap. English copy is the structural
  authority; a translation can reword a page but cannot shorten or
  reorder it
- Long-form knowledge products (model card, methodology, data-source
  ledger) remain English-only

---

## 3. Feature 02 — Live GIS Hazard Map

### 3.1 Purpose

The live map answers: *"Where is the hazard right now?"* It renders all
64 districts as interactive polygons, colour-coded by the most severe
active hazard class and severity tier for the current forecast date.

### 3.2 Step-by-Step Technical Workflow

1. **Tile Delivery (PMTiles):**
   The map uses the **PMTiles** format — a single-file, HTTP
   range-request vector tile archive. The browser fetches only the
   tiles visible in the current viewport via `Range` headers, not the
   entire tileset. This keeps initial payload under 200 KB even on 2G.

2. **Service Worker Cache:**
   On first visit, the PWA service worker caches the PMTiles archive
   and the district GeoJSON boundary file into IndexedDB. Subsequent
   loads in connectivity-blackout scenarios render the cached tiles
   with a "Stale Data: Last updated [X] hours ago" banner rather than
   failing silently.

3. **District Polygon Rendering:**
   Each of the 64 district polygons is filled according to the
   severity tier of the most critical active hazard:
   | Tier | Fill Colour | Opacity |
   |------|------------|---------|
   | SEVERE | `#DC2626` (Red) | 0.85 |
   | WARNING | `#EA580C` (Orange) | 0.75 |
   | WATCH | `#CA8A04` (Yellow) | 0.65 |
   | NORMAL | `#16A34A` (Green) | 0.45 |
   | No data | `#9CA3AF` (Grey) | 0.30 |

   A district the current run does not cover keeps its static baseline
   colour and says so on its own page, rather than borrowing a
   neighbour's number.

4. **Interactive Click → District Drill-Down:**
   Clicking a polygon triggers navigation to the District Outlook page
   (Feature 03). The transition hydrates from the local IndexedDB
   cache in < 50 ms, even offline.

5. **Map Toolbar:**
   - Hazard class toggle (segmented control with sliding thumb on
     ease, no overshoot)
   - Horizon selector: 7-day / 15-day pill toggle
   - Confidence bin overlay: Certain (≥0.85) / Probable (0.70–0.84) /
     Uncertain (<0.70)
   - Haptic feedback on toggle (mobile)

6. **Regional Dashboard Link:**
   The map page provides a secondary entry point to the Regional
   Dashboard view, which aggregates districts by Bangladesh's 8
   administrative divisions.

### 3.3 Live Wind Overlay

A dedicated GitHub Actions workflow (`Live Wind Update`, 6-hour cron)
fetches GFS wind fields via WGrib2 (conda-forge build 3.8.0), decodes
GRIB messages using `-match`/`-small_grib` to extract the hazard window,
and emits `lon lat value` rows via `-spread`. The decoded wind vectors
render as an animated particle overlay on the map.

---

## 4. Feature 03 — District Outlook Page (Drill-Down Console)

### 4.1 Purpose

When a user clicks a district on the live map, the application
transitions from spatial overview to the **District Drill-Down
Console** — the engine room where neural predictions are interrogated
by physical laws, uncertainty is quantified, and advisories are gated
for release.

### 4.2 Step-by-Step Technical Workflow

#### Step 4.2.1: Spatial Selection & Edge-State Hydration

- **Trigger:** User clicks a district polygon on the PMTiles map.
- **Action:** The service worker queries IndexedDB for the district's
  pre-computed 10-step spatial grid and current Open-Meteo
  forward-looking triggers.
- **UI Transition:** The map zooms to the district bounding box. The
  right-hand drawer expands, hydrating with district metadata (e.g.,
  "Kurigram — Flash Flood & Cold Wave Risk").
- **Edge Viability:** Because PMTiles and the SQLite state store are
  cached locally, this transition occurs in < 50 ms even with zero
  network connectivity.

#### Step 4.2.2: Dual-Severity Track Display

Every forecast record carries **two honestly labelled severity tracks**:

| Track | Label Shown to User | Source |
|-------|-------------------|--------|
| **Skill Track** | "Model Severity" | Neural network output (`model_severity_raw`) |
| **Physics Track** | "Physics Estimate" | Deterministic agrometeorological index (`physics_override`) |
| **Final Track** | "Advisory Severity" | Reconciled score (`final_severity`) after circuit breaker |

The UI renders all three as horizontal bar gauges with numeric labels,
but the **Final Track** is visually dominant (larger, bolder, coloured
by tier). The skill and physics tracks are shown below as secondary
"evidence" bars, so the user can see *why* the final score landed where
it did without needing to interpret raw tensors.

#### Step 4.2.3: Neuro-Symbolic Physics Interrogation

(This is detailed fully in Feature 04. The district page is where the
user *sees* the result.)

The console displays:
- A green "✓ Physics-Aligned" badge if Δ ≤ 0.40
- An amber "⚠ Physics Divergence" badge if Δ > 0.40, with a plain-
  language explanation: *"The model and the physical index disagree.
  The advisory uses the more conservative estimate."*

#### Step 4.2.4: Confidence Binning

Raw probabilities are translated into calibrated, human-readable bins:

| Bin | Threshold | UI Rendering | Dispatch Behaviour |
|-----|-----------|-------------|-------------------|
| **Certain** | ≥ 0.85 | Solid opaque badge | Auto-dispatch eligible |
| **Probable** | 0.70–0.84 | Hatched pattern badge | Secondary review recommended |
| **Uncertain** | < 0.70 | Dashed outline badge | Auto-dispatch suppressed; manual override required |

The top-3 class probabilities (`prob_top1`, `prob_top2`, `prob_top3`)
are displayed as a stacked mini-bar so the user can see competing
hazard hypotheses.

#### Step 4.2.5: Advisory Signal Card

The `AdvisorySignalCard` component renders:
- The four severity tracks (skill, physics, final, tier)
- The provenance line: model version, data source, forecast date,
  run timestamp
- The advisory tier badge (WATCH / WARNING / SEVERE)
- A "How to read this" expandable section

#### Step 4.2.6: Trust-Gated Dispatch (District-Level)

If the district's advisory tier is WARNING or SEVERE, the "Publish"
button is replaced with a lock icon and "Request Authorization" label.
The duty officer must authenticate before the alert propagates. (Full
state machine in Feature 07.)

### 4.3 District Data Schema (Hydrated from IndexedDB)

```json
{
  "district_id": "BD_34",
  "district_name_en": "Kurigram",
  "district_name_bn": "কুড়িগ্রাম",
  "division": "Rangpur",
  "lat": 25.8054,
  "lng": 89.6362,
  "timestamp_utc": "2026-10-10T08:00:00Z",
  "forecast_date": "2026-10-10",
  "horizon_days": 7,
  "hazards": [
    {
      "class": "FLOOD",
      "class_bn": "বন্যা",
      "model_severity_raw": 0.82,
      "physics_override": 0.79,
      "final_severity": 0.82,
      "divergence_delta": 0.03,
      "physics_aligned": true,
      "advisory_tier": "WARNING",
      "confidence_bin": "PROBABLE",
      "prob_top1": 0.78,
      "prob_top2": 0.12,
      "prob_top3": 0.05,
      "spotlight_params": {
        "cumulative_rainfall_mm": 145,
        "soil_saturation_pct": 92
      }
    }
  ],
  "data_source": "kaggle/hazardnet-weekly-forecasts",
  "model_version": "v4.1",
  "dispatch_state": "PENDING_HITL_AUTH"
}
```

---

## 5. Feature 04 — Neuro-Symbolic Physics Validation Layer

### 5.1 Purpose

This is the active, inference-time circuit breaker that prevents neural
hallucination under out-of-distribution (OOD) atmospheric or
topographical shifts. It is not a post-hoc audit. It runs on every
single inference, on every district, on every daily cycle.

### 5.2 Step-by-Step Validation Pipeline

1. **Neural Inference (S_nn):**
   The TFLite model (1.21 MB, 2.04 ms latency) outputs a continuous
   severity score [0.0, 1.0] for each of the 8 hazard classes, plus
   the hazard classification logits (B, 8).

2. **Physics Grounding (I_phys):**
   Simultaneously, the system calculates deterministic,
   literature-anchored agrometeorological indices from the same
   15-channel input tensor:

   | Hazard Class | Physical Index | Formula Basis |
   |-------------|---------------|---------------|
   | Flood / Flash Flood | SAR specular backscatter ratio (σ⁰) | VV/VH ratio anomaly |
   | Drought | Vegetation Health Index (VHI) | NDVI + LST composite |
   | Heat Wave | Excess Heat Factor (EHF) | 3-day temperature anomaly |
   | Cold Wave | Sub-16°C anomaly duration | Min temp < 16°C persistence |
   | Fire | Relative humidity deficit + biomass drying | RH < threshold + wind |
   | Tropical Cyclone | Wind + precipitation composite | Sustained wind > 50 km/h |
   | Severe Local Storm | Convective CAPE proxy | Squall wind + downpour |

3. **Divergence Calculation:**
   ```
   Δ = |S_nn − I_phys|
   ```

4. **Circuit Breaker Decision:**
   - **Δ ≤ 0.40:** Neural and physical models agree. Log
     `physics_aligned: true`. Proceed with the neural severity as the
     final score.
   - **Δ > 0.40:** Severe divergence. Log
     `physical_divergence_warning`. The system automatically defaults
     the advisory to the **more conservative** (higher severity) of
     the two scores. The event is flagged for post-incident model
     retraining.

5. **Audit Trail:**
   Every divergence event is serialized to the divergence warning log
   with full provenance:
   ```json
   {
     "event_type": "PHYSICAL_DIVERGENCE_CIRCUIT_BREAKER",
     "district_id": "BD_34",
     "hazard_class": "DROUGHT",
     "neural_severity": 0.45,
     "physics_index": 0.12,
     "delta": 0.33,
     "action_taken": "AUTO_ESCALATE_TO_SEVERE",
     "officer_override_required": true,
     "timestamp_utc": "2026-10-10T08:00:00Z"
   }
   ```

### 5.3 Safety Guardrails

- When model confidence drops below the 0.70 threshold, co-located
  rule-based fallbacks trigger automatically, bypassing the neural
  path entirely.
- The physics engine is deterministic and reproducible. It does not
  learn, drift, or hallucinate. It is the ground-truth anchor.

---

## 6. Feature 05 — Single-Tier Impact Narrative (Cognitive UX)

### 6.1 Purpose

End-users — smallholder farmers, field extension workers, local
disaster management volunteers — cannot interpret `cnn_severity_raw:
0.87`, `physics_severity: 0.92`, and `final_severity: 0.89`. The
cognitive UX layer abstracts all intermediate neuro-symbolic scores
into a **Single-Tier Impact Narrative**: one date, one tier, one
headline, one action.

### 6.2 The Display Matrix

| Severity Tier | Visual Cue | Impact Headline Template | User Action |
|:---|:---|:---|:---|
| **SEVERE** | 🔴 Red / Siren icon | **"Imminent [Hazard] on [Date]. Critical risk to [Crop/Asset]."** | Immediate protective action; harvest or evacuate. |
| **WARNING** | 🟠 Orange / Alert icon | **"[Hazard] Expected on [Date]. High environmental stress."** | Prepare resources; alter irrigation/schedule. |
| **WATCH** | 🟡 Yellow / Eye icon | **"Conditions favorable for [Hazard] by [Date]. Monitor closely."** | Stay informed; check daily updates. |
| **NORMAL** | 🟢 Green / Check icon | **"Stable conditions through [Date]. No hazard detected."** | Routine agricultural operations. |

### 6.3 Bangla Headline Examples

| English | Bangla |
|---------|--------|
| "Imminent Flash Flood on Oct 15. Critical risk to late-stage Aman rice." | "১৫ অক্টোবর আকস্মিক বন্যার সম্ভাবনা। আমন ধানের মারাত্মক ঝুঁকি।" |
| "Heat Wave Expected on Apr 12. High thermal stress on Boro rice." | "১২ এপ্রিল তাপপ্রবাহের সম্ভাবনা। বোরো ধানে উচ্চ তাপীয় চাপ।" |

### 6.4 What the User Sees vs. What the System Computes

| System Computes (Hidden) | User Sees (Rendered) |
|--------------------------|---------------------|
| `model_severity_raw: 0.82` | *(hidden)* |
| `physics_override: 0.79` | *(hidden)* |
| `final_severity: 0.82` | **"WARNING"** (large, orange badge) |
| `prob_top1: 0.78, prob_top2: 0.12` | *(hidden unless "Show evidence" tapped)* |
| `divergence_delta: 0.03` | "✓ Physics-Aligned" (small green check) |
| `cumulative_rainfall_mm: 145` | "🌧️ 145 mm rain expected" (spotlight) |
| `soil_saturation_pct: 92` | "💧 Soil 92% saturated" (spotlight) |

### 6.5 "What Will Happen on Which Date" Calendar View

The district outlook page includes a **14-day timeline strip** showing
each day as a colour-coded cell:

```
Oct 10  Oct 11  Oct 12  Oct 13  Oct 14  Oct 15  Oct 16 ...
 🟢      🟢      🟡      🟡      🟠      🔴      🟠
NORMAL  NORMAL  WATCH   WATCH  WARNING  SEVERE  WARNING
```

Tapping any cell expands the full advisory for that date, including the
spotlight parameters and recommended actions. This makes the forecast
**memorable**: the user remembers *"Red on the 15th"* rather than
*"severity 0.82 with ECE 0.015."*

---

## 7. Feature 06 — Dynamic Environmental Spotlight

### 7.1 Purpose

Displaying all 15 spatiotemporal channels overwhelms the user. The
Dynamic Environmental Spotlight renders **only the 2–3 physical
parameters that actually triggered the specific hazard tier**, grounded
in literature-anchored thresholds.

### 7.2 Spotlight Parameter Matrix

| Predicted Hazard | Spotlight Parameters Shown | Hidden (Abstracted) |
|:---|:---|:---|
| **Flood / Flash Flood** | 🌧️ Cumulative Rainfall (mm) · 💧 Soil Saturation (%) | Optical bands, Solar Rad, Wind |
| **Heat Wave** | 🌡️ Peak Temperature (°C) · ☀️ Thermal Duration (days) | SAR backscatter, Soil Moisture |
| **Cold Wave** | ❄️ Minimum Temperature (°C) · 🌫️ Fog/Chill Duration (days) | Precipitation, Optical Reflectance |
| **Drought** | 🏜️ Soil Moisture Deficit (%) · 🚫 Rainfall Deficit (days) | Wind speed, Dewpoint |
| **Tropical Cyclone** | 🌪️ Wind Gusts (km/h) · 🌊 Storm Surge Risk (qualitative) | Soil Temperature, SWIR |
| **Fire** | 🔥 Relative Humidity (%) · 💨 Wind Speed (km/h) | SAR, Precipitation |
| **Severe Local Storm** | ⛈️ Squall Wind (km/h) · 🌧️ Downpour Intensity (mm/hr) | Soil layers, Optical |

### 7.3 Implementation Rule

The spotlight selector is a deterministic lookup table, not a learned
attention mechanism. Given `hazard_class` and `advisory_tier`, it
returns exactly the parameter set from the matrix above. No parameter
outside the matrix is ever rendered to the end-user, regardless of how
anomalous its value may be.

---

## 8. Feature 07 — Trust-Gated Advisory Dispatch Engine

### 8.1 Purpose

A rule-based, tiered alerting system that translates calibrated neural
predictions into actionable public safety advisories, with a strict
human-in-the-loop (HITL) ceiling to prevent automated false-positive
panic.

### 8.2 Dispatch State Machine

```
                    ┌──────────────────┐
                    │  NEURAL INFERENCE │
                    │  + PHYSICS CHECK  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  TIER CLASSIFIER │
                    │  (severity +     │
                    │   confidence)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │   WATCH    │  │  WARNING   │  │   SEVERE   │
     │  ≥ 0.30    │  │  > 0.60    │  │  > 0.80    │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ AUTO-QUEUE │  │  HARD STOP │  │  HARD STOP │
     │ for public │  │  HITL AUTH │  │  HITL AUTH │
     │ broadcast  │  │  REQUIRED  │  │  REQUIRED  │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  PUBLISH   │  │  OFFICER   │  │  OFFICER   │
     │  (RSS/API) │  │  JWT AUTH  │  │  JWT AUTH  │
     │            │  │  + AUDIT   │  │  + AUDIT   │
     │            │  │  LOG       │  │  LOG       │
     └────────────┘  └─────┬──────┘  └─────┬──────┘
                           │               │
                           ▼               ▼
                     ┌────────────┐  ┌────────────┐
                     │  PUBLISH   │  │  PUBLISH   │
                     │  (if auth) │  │  (if auth) │
                     └────────────┘  └────────────┘
```

### 8.3 Tier Definitions

| Tier | Severity Threshold | Confidence Gate | Dispatch Mode |
|------|-------------------|-----------------|---------------|
| **WATCH** | ≥ 0.30 | Any bin | Auto-queue for public broadcast |
| **WARNING** | > 0.60 | Probable or Certain | Held; requires authenticated duty-officer JWT |
| **SEVERE** | > 0.80 | Certain (≥ 0.85) preferred | Held; requires authenticated duty-officer JWT + secondary confirmation |

### 8.4 HITL Authentication Flow

1. Officer taps "Request Authorization" on the WARNING/SEVERE card.
2. System presents a Firebase Auth challenge (email/password or
   biometric prompt on mobile).
3. Upon successful authentication, the system issues a scoped JWT with
   `role: duty_officer` and `district: [target_district]`.
4. The officer reviews the dual-severity tracks, the divergence badge,
   and the spotlight parameters.
5. Officer taps "Authorize & Publish."
6. The system immutably logs:
   ```json
   {
     "audit_event": "HITL_PUBLISH_AUTHORIZATION",
     "officer_uid": "firebase_uid_here",
     "district_id": "BD_34",
     "hazard_class": "FLOOD",
     "advisory_tier": "WARNING",
     "final_severity": 0.82,
     "divergence_delta": 0.03,
     "timestamp_utc": "2026-10-10T08:15:00Z",
     "policy_version": "v2.1"
   }
   ```
7. The alert is broadcast to all configured channels (RSS, API, iCal,
   Slack, email).

### 8.5 Publication Ceiling Guard

The system enforces a **publication ceiling**: no automated process can
publish above WATCH. This is a hard architectural constraint, not a
configuration toggle. The WARNING and SEVERE dispatch paths physically
require a valid, unexpired JWT in the request headers. Without it, the
serverless function returns `403 Forbidden` and the alert remains in
the `PENDING_HITL_AUTH` queue.

---

## 9. Feature 08 — Published Alerts Page

### 9.1 Purpose

A public, read-only page (`/alerts`) listing every currently published
alert card. Each card carries its own evidence trail.

### 9.2 Alert Card Anatomy

Each published alert card renders:
- **Hazard class** + Bangla name + icon
- **Advisory tier** badge (colour-coded)
- **Target districts** (clickable → district outlook page)
- **Forecast date** and horizon (7-day / 15-day)
- **Environmental drivers** behind the level (spotlight parameters)
- **Policy version** applied (e.g., "v2.1")
- **Dispatch provenance:** whether a duty officer reviewed it or the
  engine published it at/below its configured ceiling
- **Run timestamp** and data source reference

### 9.3 Alert Replay

The CI pipeline includes an `alertReplay` test suite that replays
historical alert artifacts against the current rendering logic,
ensuring that a schema change does not silently break the display of
past alerts.

---

## 10. Feature 09 — Sector Advisories

### 10.1 Purpose

Phased protocols that name the issuing authority at each step. Sector
advisories translate hazard forecasts into domain-specific action
checklists for:
- **Agriculture** (crop protection, irrigation scheduling, harvest
  timing)
- **Fisheries** (pond management, open-water fishing moratoriums)
- **Livestock** (shelter elevation, feed stockpiling)
- **Infrastructure** (embankment patrol, drainage sluice inspection)

### 10.2 Advisory Structure

Each sector advisory is a phased protocol:
1. **Phase 1 (WATCH):** Informational. "Monitor daily updates."
2. **Phase 2 (WARNING):** Preparatory. "Move seed banks above flood
   level. Inspect sluice gates."
3. **Phase 3 (SEVERE):** Action. "Evacuate livestock to elevated
   shelters. Harvest mature crops immediately."

Each phase names the **issuing authority** (e.g., "District
Agriculture Extension Officer") and the **escalation trigger** (e.g.,
"If severity exceeds 0.80 for > 48 hours").

---

## 11. Feature 10 — Omnichannel Notification & Calendar Injection

### 11.1 Purpose

Until the official React Native mobile app is fully released, HazardNet
operates as an **Automated Event Dispatcher**, pushing alerts directly
into the user's existing digital ecosystem via standard protocols.

### 11.2 Calendar Integration (Google, Apple, Outlook, Yahoo)

HazardNet generates dynamic `.ics` (iCalendar, RFC 5545) files:

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HazardNet//Advisory//EN
BEGIN:VEVENT
DTSTART:20261015T060000
DTEND:20261015T180000
SUMMARY:[HazardNet] 🔴 SEVERE: Flash Flood Warning - Sunamganj
LOCATION:Sunamganj District, Sylhet Division
DESCRIPTION:HAZARDNET EARLY WARNING ADVISORY\n
  Tier: SEVERE (Action Required)\n
  Hazard: Flash Flood\n
  Expected Impact: Inundation of low-lying Haor basins.\n\n
  ENVIRONMENTAL TRIGGERS:\n
  • Expected Rainfall: 165 mm over 48 hours\n
  • Current Soil Saturation: 88%\n\n
  RECOMMENDED ACTIONS:\n
  1. Move livestock to elevated shelters.\n
  2. Harvest mature crops immediately.\n
  3. Secure seed banks above flood level.
BEGIN:VALARM
TRIGGER:-PT24H
ACTION:DISPLAY
DESCRIPTION:HazardNet: Flash Flood warning tomorrow
END:VALARM
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:HazardNet: Flash Flood in 2 hours
END:VALARM
END:VEVENT
END:VCALENDAR
```

Users subscribe via a unique URL (`/api/v1/calendar/subscribe?token=...`)
or download single events. The VALARM triggers push notifications 24
hours and 2 hours before the event horizon.

### 11.3 Collaborative Workspace Alerts (Slack, Discord, MS Teams)

For regional agricultural officers, NGO coordinators, and disaster
management committees, HazardNet pushes structured JSON payloads via
incoming Webhooks:

```json
{
  "username": "HazardNet Sentinel",
  "icon_emoji": "🛰️",
  "embeds": [{
    "title": "🚨 SEVERE ALERT: Tropical Cyclone Landfall",
    "color": 15158332,
    "fields": [
      { "name": "Target Area", "value": "Cox's Bazar / Chattogram", "inline": true },
      { "name": "Impact Date", "value": "Oct 18, 2026", "inline": true },
      { "name": "Wind Gusts", "value": "115 km/h", "inline": true },
      { "name": "Precipitation", "value": "210 mm", "inline": true }
    ],
    "description": "**Action:** Initiate coastal embankment patrols.",
    "footer": "HazardNet Edge-First EO Pipeline | Physics-Validated"
  }]
}
```

### 11.4 Email Dispatch (SMTP)

Automated daily digest emails to registered extension officers:
- Subject: `[HazardNet] Daily Outlook: 3 SEVERE, 7 WARNING across Bangladesh`
- Body: HTML table of all active advisories, colour-coded by tier,
  with direct links to district outlook pages
- Unsubscribe: one-click, GDPR-compliant

### 11.5 Professional & Social Broadcast (LinkedIn, X)

For macro-level institutional awareness:
- Automated daily digest graphic + text post
- Format: *"HazardNet 7-Day Outlook: 14 SEVERE alerts, 36 WARNINGs
  across Bangladesh. Primary threat: Post-monsoon Flash Floods in the
  Sylhet basin. #AgriTech #ClimateResilience #EarlyWarning"*

---

## 12. Feature 11 — Task & Workflow Injection

### 12.1 Purpose

When a WARNING or SEVERE tier is confirmed by the Neuro-Symbolic
Circuit Breaker, the system automatically generates a **Task Ticket**
assigned to the local district extension officer, injectable into
third-party task trackers (Trello, Asana, Jira, Notion).

### 12.2 Task Ticket Schema

```json
{
  "task_name": "Execute Flood Mitigation Protocol - Netrokona (Oct 12)",
  "assigned_to": "district_extension_officer_netrokona",
  "due_date": "2026-10-11T06:00:00+06:00",
  "priority": "SEVERE",
  "checklist": [
    "Verify SMS broadcast to 5,000 registered farmers",
    "Inspect primary drainage sluice gates",
    "Confirm emergency feed stockpile for livestock",
    "Report readiness status to divisional coordinator"
  ],
  "source_advisory_id": "HN-2026-10-12-BD_36-FLOOD",
  "model_version": "v4.1",
  "physics_aligned": true
}
```

### 12.3 API Endpoint

```
POST /api/v1/dispatch/tasks
Authorization: Bearer <duty_officer_jwt>
Content-Type: application/json

{
  "target_platform": "trello",
  "board_id": "...",
  "list_id": "...",
  "advisory_ids": ["HN-2026-10-12-BD_36-FLOOD"]
}
```

---

## 13. Feature 12 — Offline PWA Architecture

### 13.1 Purpose

A lightweight, connectivity-resilient user interface designed for
data-scarce, rural edge environments (2G/3G bandwidth, intermittent
connectivity, monsoon-induced blackouts).

### 13.2 Step-by-Step Offline Architecture

1. **Service Worker Registration:**
   On first visit, the browser registers a service worker that
   intercepts all network requests. The SW implements a
   **stale-while-revalidate** strategy for API responses and a
   **cache-first** strategy for static assets.

2. **PMTiles Caching:**
   The vector tile archive (district boundaries, hazard overlays) is
   cached into IndexedDB as a single binary blob. Subsequent map
   renders read from local storage with zero network requests.

3. **Advisory Payload Caching:**
   The daily `hazardnet_advisories_latest.csv` (22 columns, ~553 KB)
   is fetched from the Kaggle CDN and cached locally. The PWA parses
   it client-side using a lightweight CSV parser.

4. **Offline Fallback Behaviour:**
   - If the network is available: fetch fresh data, update cache.
   - If the network is unavailable: serve cached data with a
     prominent banner: *"Offline mode. Data last updated [X] hours
     ago."*
   - If the cache is empty and the network is unavailable: render a
     static "No data available" page with the emergency hotline (999)
     and BMD/FFWC links.

5. **Install Prompt:**
   The PWA manifest triggers the native "Add to Home Screen" prompt
   on Android and the "Share → Add to Home Screen" flow on iOS. The
   installed app runs in standalone mode (no browser chrome).

### 13.3 Performance Budgets (Enforced in CI)

| Metric | Budget | Enforcement |
|--------|--------|-------------|
| Initial JS bundle | ≤ 1.2 MB gzipped | `check:functions` CI gate |
| PMTiles archive | ≤ 5 MB | Build-time assertion |
| Service Worker cache | ≤ 50 MB | SW quota management |
| Time to Interactive (2G) | ≤ 4 seconds | Lighthouse CI |
| Memory footprint (inference worker) | ≤ 40 MB | GC after inference |

---

## 14. Feature 13 — Localized Accessibility Suite (Bangla + TTS)

### 14.1 Purpose

Ensures actionable intelligence reaches end-users (smallholder farmers,
field extension workers) regardless of literacy level or device
constraints.

### 14.2 Bangla Unicode Rendering

- All hazard class names, advisory headlines, action items, and map
  labels are rendered in Bangla Unicode (e.g., "কালবৈশাখী" for
  Severe Local Storm, "বন্যা" for Flood).
- The language switch toggles between English and Bangla without page
  reload (client-side i18n).
- Fallback rule: if a Bangla translation is missing for a specific
  string, the English original is shown. No gaps, no broken layouts.

### 14.3 On-Device Text-to-Speech (TTS)

- **Trigger:** User taps the 🔊 speaker icon on any advisory card.
- **Engine:** Web Speech API (if the device supports Bangla voices)
  or an integrated eSpeak-NG Bangla WASM module (~2 MB).
- **Constraint:** Synthesis happens entirely on the client device's
  CPU. Zero cloud API calls. Audio warnings can be generated and
  played in total network blackout.
- **Output:** The TTS vocalizes the Single-Tier Impact Narrative
  headline, the spotlight parameters, and the recommended actions.
  Example output:
  > *"পনেরো অক্টোবর আকস্মিক বন্যার সম্ভাবনা। একশ পঁয়তাল্লিশ
  > মিলিমিটার বৃষ্টিপাত প্রত্যাশিত। গবাদি পশু উঁচু আশ্রয়ে সরান।"*

### 14.4 Confidence Pictograms

For low-literacy users, each advisory tier is accompanied by a
universally recognizable pictogram:
- 🔴 SEVERE: Red circle with exclamation mark
- 🟠 WARNING: Orange triangle
- 🟡 WATCH: Yellow eye
- 🟢 NORMAL: Green checkmark

These pictograms are rendered as inline SVGs (no font dependency) and
are included in the TTS vocalization as spoken labels.

---

## 15. Feature 14 — CI/CD Pipeline (GitHub Actions + Kaggle)

### 15.1 Purpose

The entire platform is rebuilt and republished from committed artifacts
via a decentralized, automated CI/CD architecture. No manual deployment
steps. No "it works on my machine." The same pipeline that publishes a
number also publishes the check on it.

### 15.2 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────┐
│              GITHUB ACTIONS (Daily Cron)                 │
│                                                         │
│  1. Fetch latest multi-modal EO feeds                   │
│     ├── GEE: Sentinel-1, Sentinel-2, ERA5-Land          │
│     ├── Open-Meteo: Forward-looking triggers            │
│     └── NOAA GFS: Live wind (WGrib2, conda-forge)       │
│                                                         │
│  2. Execute TFLite model + physics override engine       │
│     └── 128 advisories (64 districts × 2 horizons)      │
│                                                         │
│  3. Serialize to CSV (22 columns)                        │
│     └── hazardnet_advisories_latest.csv                  │
│                                                         │
│  4. Publish to Kaggle Dataset                            │
│     └── ashifahmedshuvo/hazardnet-weekly-forecasts       │
│         (CC BY-NC 4.0, daily update)                    │
│                                                         │
│  5. Commit artifacts to GitHub repo                      │
│     ├── forecasts-latest.json                            │
│     ├── alerts-latest.json                               │
│     └── status-snapshot.json                             │
│                                                         │
│  6. Trigger Vercel deployment                            │
│     ├── Build frontend (108 prerendered pages)           │
│     ├── Deploy serverless functions (6/12 budget)        │
│     └── Invalidate CDN edge cache                        │
│                                                         │
│  7. Run site-health probe                                │
│     └── Browser-like headers, SLO checks                 │
│                                                         │
│  8. Run CI gates                                         │
│     ├── 151 test suites / 1,591 tests                    │
│     ├── ESLint (0 errors, 683-warning budget)            │
│     ├── TypeScript strict mode                           │
│     ├── Design system gates (colourDiscipline,           │
│     │   paletteTokens, designTypography,                 │
│     │   designSignature, appleParity, darkTheme)         │
│     ├── Security headers parity                          │
│     ├── CSP policy verification                          │
│     ├── Claims verification (verify_claims.mjs)          │
│     ├── Content engine check (build_content_engine)      │
│     ├── Secret scan (test_secret_scan.py)                │
│     ├── Secret rotation check (check:rotation)           │
│     └── Function budget check (check:functions)          │
└─────────────────────────────────────────────────────────┘
```

### 15.3 Kaggle Dataset Structure

| Field | Value |
|-------|-------|
| **URL** | `kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts` |
| **Files** | `hazardnet_advisories_latest.csv`, `hazard_specific_temperature_calibration.png` |
| **Columns** | 22 (including: `advisory_tier`, `final_severity`, `model_severity_raw`, `physics_override`, `prob_top1`, `prob_top2`, `prob_top3`, `lat`, `lng`, `data_source`, `model_version`, + 11 others) |
| **Size** | ~553.2 kB |
| **Update Frequency** | Daily (synced from `8-HazardNet-Advisory` notebook) |
| **License** | CC BY-NC 4.0 |

### 15.4 PWA Synchronization

The PWA fetches the updated advisory CSV from the Kaggle CDN on each
daily sync cycle. The CSV is parsed client-side, diffed against the
cached version, and only changed rows trigger UI updates and
notification dispatches. This minimizes bandwidth usage on 2G
connections.

---

## 16. Feature 15 — System Status & Provenance Page

### 16.1 Purpose

The status page (`/status`) reads the committed artifacts and states
the age of each against its SLO. It exists to show the cases where
evidence is thin, stale, or absent — not to hide them.

### 16.2 Status Page Contents

For each committed artifact, the page displays:
- **Artifact name** (e.g., `forecasts-latest.json`)
- **Generated timestamp** (e.g., `2026-10-09T20:18:27.961Z`)
- **Age** (e.g., "14 hours ago")
- **SLO target** (e.g., "≤ 24 hours")
- **SLO status** (✅ Met / ⚠️ Approaching / 🔴 Breached)
- **Honesty notes** attached by the run (e.g., "GEE optical bands
  unavailable due to cloud cover over Sylhet division; SAR-only
  inference used")

### 16.3 Provenance Chain

Every number on the site traces to:
1. A committed forecast record with a forecast date
2. A run timestamp
3. A data source reference (Kaggle dataset URL)
4. A model version string
5. A policy version string

No number is interpolated to fill a gap in a run. No number is produced
by a language model. Every figure is read from a committed artifact.

---

## 17. Feature 16 — Model Card & Validation Scorecard

### 17.1 Model Card (`/model`)

| Field | Value |
|-------|-------|
| Architecture | Hybrid cognitive (neural + symbolic physics) |
| Input channels | 15 (see §1.2) |
| Input shape | (1, 15, 10, 64, 64) NCTHW |
| Output heads | hazard_logits (B, 8) + severity_pred (B, 1) |
| Parameters | 0.314 M |
| Size | 1.21 MB |
| Latency | 2.04 ms |
| Conversion | onnx2tf (Static Graph + Native LSTM Fix) |
| Intended use | Decision support for Bangladesh agriculture |
| Out-of-scope use | Official warning issuance; evacuation commands |
| Known failure modes | Listed explicitly on the card |
| Training archive | 2,931 events (2000–2025) — reported as claimed, not verified; archive not redistributed |
| Reviewed | 2026-09-17 |

### 17.2 Validation Scorecard (`/model-performance`)

Reports per-episode detection counts for 5 historical episodes:

| Metric | Definition |
|--------|-----------|
| POD (Probability of Detection) | True positive rate (Recall): 0.9444 |
| FAR (False Alarm Ratio) | False positives / (True positives + False positives): 0.0613 |
| CSI (Critical Success Index) | TP / (TP + FP + FN): 0.8904 |

The scorecard states plainly what those numbers **cannot** support:
- 5 episodes is not a climatological sample
- Detection counts are not probabilistic calibration
- The scorecard does not constitute operational certification

Validation protocol (4-strategy, leakage-safe):
1. **Event K-Fold** — random sample split
2. **Grouped K-Fold** — district-held-out clustered split (Tier-2
   Spatial Gate)
3. **Spatial LODO** — Leave-One-District-Out, 8 folds, zero-shot
4. **Rolling Origin** — causal temporal gate, 8+ folds

Reviewed: 2026-09-24.

---

## 18. Feature 17 — Data Source Ledger

### 18.1 Purpose

A page (`/data-sources`) listing the licence, cadence, and the file
behind every input channel. One dataset at a time.

### 18.2 Ledger Entries

| Source | Licence | Cadence | Channels |
|--------|---------|---------|----------|
| Sentinel-1 SAR (GEE) | ESA Open Data Policy | 6–12 days | SAR_VV, SAR_VH |
| Sentinel-2 Optical (GEE) | ESA Open Data Policy | 5 days | Blue, Red, NIR, SWIR |
| ERA5-Land (GEE) | Copernicus / ECMWF | Daily | Temp_2m, Precip, Max_Temp, Min_Temp, Soil_W1, Soil_W3, Soil_T1, Dewpoint, Solar_Rad |
| Open-Meteo | CC BY 4.0 | Hourly/Daily | Forward-looking triggers |
| ReliefWeb | OCHA Open Data | Continuous | Historical disaster reports |
| EM-DAT | CRED (research licence) | Annual | Global disaster database |
| EONET (NASA) | NASA Open Data | Continuous | Natural event proximity |
| DesInventar | UNDP | Variable | Crop loss (hectares) |
| GLIDE (OCHA) | OCHA Open Data | Continuous | Event identifiers |
| NOAA GFS | US Gov Public Domain | 6-hourly | Live wind fields |
| HDX (Bangladesh) | OCHA Open Data | Variable | Administrative boundaries |

Reviewed: 2026-09-17.

---

## 19. Feature 18 — Serverless API Surface

### 19.1 Deployment Target

Vercel serverless functions, operating within a **12-function budget**.
Current usage: **6 of 12 functions**.

### 19.2 API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/v1/forecasts` | GET | Full forecast snapshot (all districts, both horizons) | Public |
| `/api/v1/forecasts/:districtId` | GET | Single-district forecast record | Public |
| `/api/v1/alerts` | GET | Currently published alert cards | Public |
| `/api/v1/weather` | GET | Open-Meteo observations by lat/lon | Public |
| `/api/v1/historical` | GET | Historical hazard catalog query | Public |
| `/api/v1/chat` | POST | Conversational AI advisory assistant | Firebase JWT |
| `/api/v1/grounding` | POST | Physics grounding query for a district | Firebase JWT |
| `/api/v1/predict` | POST | On-demand inference (edge) | Firebase JWT |
| `/api/v1/push` | POST | Push notification registration | Firebase JWT |
| `/api/v1/conversions` | GET | Hazard unit conversion utilities | Public |
| `/api/v1/live-voice` | GET | Live voice advisory stream | Public |
| `/api/v1/calendar/subscribe` | GET | iCal subscription URL | Token |
| `/api/v1/dispatch/tasks` | POST | Task injection to third-party platforms | Duty Officer JWT |
| `/api/v1/telemetry` | POST | Anonymous usage telemetry (opt-in) | Public |

### 19.3 API Discovery

The API is machine-discoverable via:
- **RFC 9727 API Catalog:** `/.well-known/api-catalog`
  (Content-Type: `application/linkset+json`)
- **OpenAPI 3.1.0 Spec:** `/api/openapi.yaml`
- **Link Header:** Every response includes `Link: rel="api-catalog"`

### 19.4 Telemetry Privacy

The analytics tracker (`packages/analytics`):
- Batches events with a queue cap
- One retry, then drop
- `sendBeacon` on page unload
- PII-shaped key stripping (any key matching email/phone/name patterns
  is removed before transmission)
- Strictly opt-in (`VITE_ANALYTICS_ENABLED=true`)
- Respects Do Not Track headers

---

## 20. Feature 19 — Agent Discovery & Interoperability Layer

### 20.1 Purpose

HazardNet publishes a comprehensive agent discovery layer so that AI
agents, automated pipelines, and partner platforms can programmatically
discover, authenticate with, and consume hazard data without human
intervention.

### 20.2 Discovery Protocols Implemented

| Protocol | Endpoint | Purpose |
|----------|----------|---------|
| **A2A Agent Card** | `/.well-known/agent-card.json` | Agent-to-agent discovery (6 skills) |
| **MCP Server Card** | `/.well-known/mcp/server-card.json` | Model Context Protocol (8 tools) |
| **WebMCP** | Client-side (`webmcp.ts`) | Browser agent tool registration (6 tools) |
| **RFC 9727** | `/.well-known/api-catalog` | API catalog (10 entries) |
| **RFC 9728** | `/.well-known/oauth-protected-resource` | OAuth Protected Resource Metadata |
| **OIDC Discovery** | `/.well-known/openid-configuration` | OpenID Connect Discovery 1.0 |
| **RFC 8414** | `/.well-known/oauth-authorization-server` | OAuth Authorization Server Metadata |
| **Auth.md** | `/auth.md` | Agent registration & auth methods |
| **DNS-AID** | `_agents.hazardnet.live` (5 HTTPS records) | DNS-based agent endpoint discovery |
| **Agent Skills Index** | `/.well-known/agent-skills/index.json` | Skills discovery (9 skills, SHA-256 verified) |
| **Content Signals** | `robots.txt` | `ai-train=no`, `ai-input=no`, `search=yes` |
| **Web Bot Auth** | `/.well-known/http-message-signatures-directory` | Ed25519 JWKS for bot request verification |
| **Markdown for Agents** | `Accept: text/markdown` | 108 pre-generated markdown files |

### 20.3 MCP Tools (8)

| Tool | Description |
|------|-------------|
| `get_hazard_forecast` | District/hazard/horizon lookup |
| `list_forecasts` | Complete forecast snapshot |
| `get_weather` | Open-Meteo observations by lat/lon |
| `list_alerts` | Published hazard alerts |
| `get_historical_events` | Historical hazard catalog |
| `chat_advisory` | Conversational AI advisory |
| `convert_units` | Hazard unit conversions |
| `get_district_info` | District metadata |

### 20.4 WebMCP Tools (6, Browser-Side)

| Tool | Description |
|------|-------------|
| `search-district` | Search districts by name, navigate to outlook |
| `get-forecast` | Retrieve multi-hazard forecast for a district |
| `get-alerts` | Get current published hazard alerts |
| `navigate-to-page` | Navigate to any page on the site |
| `get-site-status` | Data source freshness and operational status |
| `get-hazard-info` | Methodology for a specific hazard class |

### 20.5 Content Usage Policy

Per the Content Signals specification (IETF
`draft-romm-aipref-contentsignals`) and EU CDSM Directive Art. 4:
- `ai-train=no` — prohibit training/fine-tuning AI models on site
  content
- `ai-input=no` — prohibit feeding content into AI models (RAG/
  grounding)
- `search=yes` — allow search indexing and search results

---

## 21. Feature 20 — Blog & Field Notes

### 21.1 Purpose

Dated field notes and analysis posts. The blog serves as a
communication channel for:
- Post-event validation reports ("How did the Oct 5 flash flood
  forecast perform?")
- Methodology explainers for non-technical audiences
- Seasonal outlook summaries
- Partnership and deployment updates

### 21.2 Rendering

- Posts are prerendered at build time (included in the 108-page
  prerender set)
- RSS feed at `/blog/rss.xml`
- Bangla translation for field-note posts; methodology posts remain
  English-only

---

## 22. Feature 21 — Download Centre

### 22.1 Purpose

A centralized page for downloading:
- The latest forecast snapshot (CSV, 22 columns)
- The offline PWA build (for sideloading on low-connectivity devices)
- The validation scorecard (PDF)
- The data-source ledger (PDF)
- Historical advisory archives (by month)

### 22.2 Licensing

- Code: MIT
- Advisory data: CC BY-NC 4.0
- Third-party data: governed by each source's own licence (listed in
  the Data Source Ledger)

---

## 23. Feature 22 — Authentication & Account Management

### 23.1 Auth Provider

Firebase Authentication (project: `hazardnet-aas48424`):
- Email/password
- Google Sign-In
- Anonymous access (for public read endpoints)

### 23.2 Role Model

| Role | Capabilities |
|------|-------------|
| **Anonymous** | Read forecasts, view map, read alerts, read blog |
| **Registered User** | + Subscribe to iCal, configure notification preferences, access chat advisory |
| **Duty Officer** | + Authorize WARNING/SEVERE dispatch, inject tasks, access audit logs |
| **Administrator** | + Manage user roles, configure publication ceilings, access divergence logs |

### 23.3 Security Hardening

- Profile reads narrowed: `allow get, list: if true` replaced with
  opt-in per-row reads; `list` capped at `limit(1)`
- Client sends `limit(1)` and treats a denied username lookup as
  "taken" rather than "available" (prevents enumeration)
- `boundedString` → `nullableString` fix for avatar deletion
- Secret rotation: 15 credentials tracked, monthly rotation workflow,
  `npm run check:rotation` CI gate

---

## 24. Feature 23 — Mobile & Desktop Targets

### 24.1 Android (React Native / Expo)

- Generated via `expo prebuild`
- Released as an APK
- 9 Jest test suites / 62 tests passing in ~15 seconds
- CI job: `test-mobile`

### 24.2 Windows (WinUI / MSIX)

- Committed WinUI project
- Released as an MSIX package
- Standing deliverable recorded in the mobile/Windows audit
- Dedicated PR compile workflow: `.github/workflows/windows-compile.yml`

### 24.3 Shared Logic

Both targets consume the same advisory CSV schema and the same
severity-tier rendering logic as the web PWA. The physics validation
layer runs server-side; the mobile/desktop clients render the
reconciled output.

---

## 25. Data Contracts & API Schemas

### 25.1 Advisory CSV Schema (22 Columns)

The canonical column set for `hazardnet_advisories_latest.csv`, as
defined by `ADVISORY_CSV_COLUMNS` in the backend:

| # | Column | Type | Description |
|---|--------|------|-------------|
| 1 | `district_id` | string | Bangladesh district code (e.g., "BD_34") |
| 2 | `district_name` | string | English district name |
| 3 | `district_name_bn` | string | Bangla district name |
| 4 | `division` | string | Administrative division |
| 5 | `lat` | float | District centroid latitude |
| 6 | `lng` | float | District centroid longitude |
| 7 | `forecast_date` | date | Date the forecast was generated |
| 8 | `horizon_days` | int | 7 or 15 |
| 9 | `hazard_class` | string | One of 8 classes |
| 10 | `hazard_class_bn` | string | Bangla hazard class name |
| 11 | `advisory_tier` | string | WATCH / WARNING / SEVERE / NORMAL |
| 12 | `final_severity` | float | Reconciled severity [0.0, 1.0] |
| 13 | `model_severity_raw` | float | Neural network output |
| 14 | `physics_override` | float | Deterministic physics index |
| 15 | `divergence_delta` | float | |S_nn − I_phys| |
| 16 | `physics_aligned` | bool | Δ ≤ 0.40 |
| 17 | `prob_top1` | float | Top-1 class probability |
| 18 | `prob_top2` | float | Top-2 class probability |
| 19 | `prob_top3` | float | Top-3 class probability |
| 20 | `confidence_bin` | string | Certain / Probable / Uncertain |
| 21 | `data_source` | string | Provenance reference |
| 22 | `model_version` | string | e.g., "v4.1" |

### 25.2 Forecast Snapshot JSON (`forecasts-latest.json`)

```json
{
  "forecast_snapshot": {
    "generated_at": "2026-10-09T20:18:27.961Z",
    "districts_covered": 60,
    "total_districts": 64,
    "assessed_rows": 74,
    "withheld_rows": 0,
    "model_version": "v4.1",
    "policy_version": "v2.1",
    "data_source": "kaggle/hazardnet-weekly-forecasts",
    "horizons": [7, 15],
    "hazard_classes": [
      "cold_wave", "drought", "fire", "flash_flood",
      "flood", "heat_wave", "severe_local_storm", "tropical_cyclone"
    ]
  },
  "records": [
    {
      "district_id": "BD_01",
      "hazard_class": "flood",
      "horizon_days": 7,
      "advisory_tier": "WATCH",
      "final_severity": 0.42,
      "model_severity_raw": 0.40,
      "physics_override": 0.44,
      "divergence_delta": 0.04,
      "physics_aligned": true,
      "confidence_bin": "UNCERTAIN",
      "prob_top1": 0.62,
      "prob_top2": 0.18,
      "prob_top3": 0.09
    }
  ]
}
```

### 25.3 Alert Card JSON (`alerts-latest.json`)

```json
{
  "alerts": [
    {
      "alert_id": "HN-2026-10-10-BD_34-FLOOD-7D",
      "district_id": "BD_34",
      "district_name": "Kurigram",
      "district_name_bn": "কুড়িগ্রাম",
      "hazard_class": "flood",
      "hazard_class_bn": "বন্যা",
      "advisory_tier": "WARNING",
      "final_severity": 0.82,
      "forecast_date": "2026-10-10",
      "horizon_days": 7,
      "spotlight": {
        "cumulative_rainfall_mm": 145,
        "soil_saturation_pct": 92
      },
      "dispatch_provenance": {
        "mode": "HITL_AUTHORIZED",
        "officer_uid": "redacted",
        "authorized_at": "2026-10-10T08:15:00Z",
        "policy_version": "v2.1"
      },
      "run_timestamp": "2026-10-09T20:18:27.961Z"
    }
  ],
  "meta": {
    "published_count": 0,
    "last_run": "2026-10-09T20:18:27.961Z",
    "note": "No alert is published at the moment of this read."
  }
}
```

---

## 26. Edge Constraints & Performance Budgets

| Constraint | Budget | Rationale |
|-----------|--------|-----------|
| TFLite model size | 1.21 MB | Fits in L1 cache of Cortex-A55 |
| Inference latency | 2.04 ms | Real-time on mobile-class CPU |
| Total parameter count | 0.314 M | Prevents overfitting on 2,931-event archive |
| Frontend JS bundle | ≤ 1.2 MB gzipped | 2G viability |
| PMTiles archive | ≤ 5 MB | Single HTTP range-request fetch |
| Service Worker cache | ≤ 50 MB | Low-end Android storage budget |
| Inference worker RAM | ≤ 40 MB | 2 GB RAM budget phones |
| Advisory CSV | ~553 KB | Fits in a single 3G round-trip |
| Vercel functions | 6 / 12 | Headroom for future endpoints |
| Prerendered pages | 108 | Full site crawlable without JS |
| E2E test coverage | 151 suites / 1,591 tests | Regression safety |
| Lint errors | 0 (683-warning budget) | Code quality floor |

---

## 27. Security, Governance & Publication Ethics

### 27.1 Security

- **CSP Headers:** Single source of truth, parity-verified across
  Vercel config, Express middleware, and static headers. Ad-network
  `script-src` allowlist removed.
- **Security Headers Parity:** Automated test suite verifies
  consistency across all deployment targets.
- **Secret Management:** 15 credentials tracked in
  `data/security/secret-rotation.json`. Monthly rotation workflow.
  `npm run check:rotation` CI gate. Zero overdue.
- **Profile Enumeration Prevention:** Public reads narrowed to
  opt-in per-row; list capped at `limit(1)`.
- **Web Bot Auth:** Ed25519 JWKS published for cryptographic bot
  request verification.
- **Content Signals:** `ai-train=no`, `ai-input=no` in `robots.txt`.

### 27.2 Publication Ethics (COPE Compliance)

- **No LLM-generated numbers.** Every figure on the site traces to a
  committed artifact. No number is interpolated to fill a gap.
- **Honest uncertainty.** The validation scorecard states what 5
  episodes cannot support. The model card lists known failure modes.
  The training archive claim (2,931 events) is reported as claimed,
  not verified.
- **Official record disclaimer.** HazardNet does not issue warnings,
  cyclone signals, or evacuation instructions. BMD, FFWC, and DDM
  bulletins outrank anything on this site.
- **Silence ≠ Safety.** When no alerts are published, the page says
  so explicitly and explains why.
- **Data licensing.** Code: MIT. Advisory data: CC BY-NC 4.0.
  Third-party data: each source's own licence, listed one dataset at
  a time.
- **Training archive non-redistribution.** The 2,931-event archive is
  assembled from third-party records whose licences govern
  redistribution. The repository ships the loader, not the archive.

### 27.3 Conflict of Interest

The authors declare no competing financial interests or personal
relationships that could have influenced this work. HazardNet is a
Master's thesis project at Bangladesh Agricultural University,
conducted independently. The open-source release imposes no commercial
restrictions.

### 27.4 Authorship

- **Author:** Ashif Ahmed Shuvo (ORCID 0009-0003-5734-1519)
- **Supervisor:** Dr. Ahmed Khairul Hasan
- **Institution:** Department of Agrometeorology, Bangladesh
  Agricultural University (BAU)
- **CRediT:** Conceptualization, Methodology, Software, Validation,
  Writing – Original Draft, Writing – Review & Editing (single-author
  thesis)

---

## 28. Monitoring, Observability & SLOs

### 28.1 Site Health Probe

A GitHub Actions workflow (`site-health probe`) runs on a schedule and
on every deployment:
- Sends browser-like HTTP headers to `www.hazardnet.live`
- Checks response status, content-type, and key DOM elements
- Logs failures as commit annotations (e.g., `chore(ops): site-health
  probe fail 2026-10-09T20:09Z`)

### 28.2 Artifact Freshness SLOs

| Artifact | SLO | Breach Action |
|----------|-----|---------------|
| `forecasts-latest.json` | ≤ 24 hours | Status page shows 🔴; PWA shows stale banner |
| `alerts-latest.json` | ≤ 24 hours | Status page shows 🔴 |
| Kaggle CSV | ≤ 24 hours | PWA falls back to cached version |
| PMTiles | ≤ 7 days | Map renders with "last updated" note |
| GFS wind overlay | ≤ 6 hours | Wind layer hidden; no error |

### 28.3 CI Gate Summary

| Gate | What It Checks |
|------|---------------|
| `check:functions` | Vercel function count ≤ 12 |
| `check:rotation` | Secret rotation cadence (15 creds, 0 overdue) |
| `check:claims` | All cited evidence paths exist (565 paths) |
| `check:tokens` | Design system token compliance |
| `build_content_engine --check` | Derived artifacts match source inputs |
| `test_secret_scan.py` | No secrets in committed files |
| `alertReplay` | Historical alerts render correctly |
| `securityHeadersParity` | Headers consistent across targets |
| `contentSignalParity` | CSP / robots.txt consistent |
| `designTypography` | Type scale matches Cupertino Precision spec |
| `appleParity` | Design tokens match spec values |
| `darkTheme` | Dark theme canvas = #000 OLED |
| `colourDiscipline` | No raw hex outside token system |

### 28.4 Test Coverage

- **151 test suites / 1,591 tests** (Jest + Playwright)
- **119 Python tests** (backend validation scripts)
- **E2E:** smoke, critical-paths, mobile-responsive, full-app-qa
- **Mutation testing:** All 7 gate mutations detected in workflow tests

---

## 29. Glossary

| Term | Definition |
|------|-----------|
| **ADM3** | Third-level administrative unit (upazila or city corporation) |
| **CAPE** | Convective Available Potential Energy (atmospheric instability measure) |
| **CSI** | Critical Success Index = TP / (TP + FP + FN) |
| **ECE** | Expected Calibration Error |
| **EHF** | Excess Heat Factor (3-day temperature anomaly metric) |
| **EO** | Earth Observation |
| **FAR** | False Alarm Ratio |
| **GEE** | Google Earth Engine |
| **GLIDE** | Global Disaster Identifier Number (OCHA) |
| **HITL** | Human-in-the-Loop |
| **iCal / ICS** | iCalendar format (RFC 5545) |
| **LST** | Land Surface Temperature |
| **NCTHW** | Tensor layout: (batch, channels, time, height, width) |
| **NDVI** | Normalized Difference Vegetation Index |
| **OOD** | Out-of-Distribution |
| **PMTiles** | Single-file vector tile format (HTTP range requests) |
| **POD** | Probability of Detection (Recall) |
| **PWA** | Progressive Web App |
| **SAR** | Synthetic Aperture Radar |
| **SLO** | Service Level Objective |
| **TFLite** | TensorFlow Lite (edge inference runtime) |
| **TTS** | Text-to-Speech |
| **VHI** | Vegetation Health Index |
| **WASM** | WebAssembly |
| **WGrib2** | WMO GRIB2 decoder (NOAA) |

---

> **End of FEATURES_SPEC.md v5.0.0**
>
> This document is the single source of truth for the HazardNet live
> web platform. Every metric, schema field, and architectural claim
> traces to a committed artifact in the GitHub repository
> (`github.com/myself-aas/HazardNet`), the Kaggle advisory dataset
> (`ashifahmedshuvo/hazardnet-weekly-forecasts`), or the live website
> (`www.hazardnet.live`). No claim is extrapolated. No number is
> interpolated. Where evidence is thin, the document says so.
>
> **Cite as:** Shuvo, A. A. (2026). HazardNet: Multi-hazard early
> warning for Bangladesh agriculture. Master's thesis, Department of
> Agrometeorology, Bangladesh Agricultural University.
> https://github.com/myself-aas/HazardNet
