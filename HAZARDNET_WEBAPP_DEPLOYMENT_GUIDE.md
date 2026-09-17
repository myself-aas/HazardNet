<!-- Historical design document (2026-08), reconciled against the implemented
     system on 2026-09-12 (audit backlog 7 — see the RECONCILIATION STATUS
     block below). Preserved verbatim as the design record; every divergent
     prescription carries an inline "Reconciled (2026-09-12)" annotation.
     Current truth: docs/codebase/*.md, docs/adr/*.md,
     docs/audits/2026-09-12-deployment-verification.md.

     Update 2026-09-17: the Kaggle pipeline described here is GONE. The four
     Kaggle-backed workflows (forecast-pipeline, hourly_forecast,
     weekly_forecast, manual_forecast_ingest) and their scripts were deleted —
     nothing runs on the Kaggle platform. The single forecast producer is
     .github/workflows/daily_forecast.yml, which runs entirely on the GitHub
     runner (GEE + Open-Meteo + TFLite) and commits the refreshed data. -->

# HazardNet WebApp Deployment System
## Production-Ready Automated Forecast Deployment (IEEE TGRS Submission Ready)

**Project**: Multi-Hazard AI Classification for Bangladesh Agricultural Disaster Risk  
**Deployment Target**: CI/CD Automated Forecast Pipeline + Data API WebApp  
**Paper Submission Deadline**: August 25, 2026  
**Architecture**: Kaggle Compute (Inference) → GitHub Actions (Orchestration) → Node.js API (Data Serving)

---

## ⚠️ RECONCILIATION STATUS (2026-09-12 — audit backlog 7)

This document is the **original 2026-08 design record**, preserved verbatim. The implemented
system diverges from it in well-understood ways; every divergent section below carries an
inline **⚠️ Reconciled (2026-09-12)** note. Authoritative sources: `docs/adr/*.md`,
`docs/codebase/*.md`, `docs/audits/2026-09-12-deployment-verification.md`.

**Topology decision (resolved — accepted ADR 0003; the "Docker vs. Vercel" question is
closed):** Vercel is the primary deploy target (static SPA + `api/` serverless functions,
`vercel.json`); the Node server (`npm start`) is the local/self-host runtime; **Docker is
not implemented** — PART 8 is superseded. Self-host observability (Prometheus/Grafana)
runs via the `docker run` commands in `monitoring/README.md`.

| Prescribed here | Implemented reality |
|---|---|
| Daily 00:00 UTC runs; 10/20/30-day horizons | **Weekly Sunday 02:00 UTC** (`weekly_forecast.yml`); **10/20/30-day** horizons (restored 2026-09-12, ADR 0005; Open-Meteo's 16-day cap documented there) |
| 64 districts + 490 upazilas (554 locations) | **507 ADM3 units** — 495 Upazilas + 12 City Corporations (HDX COD-AB, ADR 0005; the 554 figure matches neither COD 507 nor raw 600) |
| Static JSON/CSV under `backend/data/` | Forecast store — Firestore (default) / Supabase (ADR 0002) — behind `backend/forecastStore.js` |
| Express CJS + morgan, no ML inference | ESM, no morgan, **TFJS on-demand inference** (`/api/predict`) |
| Redux Toolkit + RTK Query; Mapbox GL | **TanStack Query** (`useForecasts`); **Leaflet** |
| Docker Compose deploy | **Vercel** (ADR 0003) + Node self-host |
| CSV committed to repo | CSV → **GitHub Release** + API ingest; history via `GET /api/v1/forecasts/history` |

---

## PART 1: SYSTEM ARCHITECTURE OVERVIEW

### 1.1 Technology Stack

> ⚠️ **Reconciled (2026-09-12):** Several rows are aspirational — Frontend is **Leaflet** (not Mapbox GL), State Mgmt is **TanStack Query** (not RTK Query), Data Storage is the **forecast store** (Firestore/Supabase per ADR 0002, not static files), the Backend **does** run TFJS inference (`/api/predict`), Deployment is **Vercel + Node self-host** (ADR 0003, no Docker), and Monitoring now ships in `monitoring/`. See the table above and `docs/codebase/STACK.md`.


```
Forecast Engine:  Kaggle Notebooks (Python + TFLite + GEE + Open-Meteo)
Orchestration:    GitHub Actions (CI/CD, scheduled triggers, data sync)
Backend:          Node.js + Express (Data API, no ML inference)
Frontend:         React 18 + TypeScript + Tailwind CSS + Mapbox GL
Data Storage:     Static JSON/CSV files (versioned, archived)
State Mgmt:       Redux Toolkit + RTK Query (async forecast fetching)
Testing:          Jest + React Testing Library + Playwright (E2E)
Deployment:       Docker + Docker Compose (local/cloud)
Monitoring:       Prometheus + Grafana (forecast freshness, pipeline health)
```

### 1.2 HazardNet Model Architecture

> ⚠️ **Reconciled (2026-09-12, ADR 0007):** the "→ <2MB (INT8 quantized)" step below was never producible — TFLite's converter crashes on `CONV_3D` under INT8, so quantization is bypassed and the shipped bundle is **FP32 only** (790 KB, `Models/VERSION.json`). The external Kaggle bundle's `hazardnet_int8.tflite` is a misnomer (optimized-FP32 bytes). No INT8 edge path is planned (ADR 0007).

```
Model Class:     HazardNetCNN (3D Depthwise-Separable CNN)
Input Tensor:    (B, T=10, C=15, H=64, W=64)  [10 timesteps, 15 channels, 64x64 pixels]
Channels:        SAR_VV, SAR_VH, Blue, Red, NIR, SWIR, Temp_2m, Precip, Max_Temp, 
                 Min_Temp, Soil_W1, Soil_W3, Soil_T1, Dewpoint, Solar_Rad
Output Classes:  8 hazards (Cold Wave, Drought, Fire, Flash Flood, Flood, 
                 Heat Wave, Severe Local Storm, Tropical Cyclone)
Model Size:      ~1.2M parameters → 4.8MB (FP32) → <2MB (INT8 quantized)
Framework:       PyTorch → ONNX → TensorFlow Lite
Deployment:      Kaggle Notebooks (30 hrs CPU/week free tier)
```

### 1.3 Administrative Boundaries (FAO GAUL 2015)

> ⚠️ **Reconciled (2026-09-12, updated same day — ADR 0005):** Coverage is now the **507-unit HDX COD-AB ADM3 matrix** (495 Upazilas + 12 City Corporations — *not* the 554 figure below, which matches neither the COD layer nor the raw thana geometry), cadence is **weekly Sunday ~02:00 UTC**, horizons are **10/20/30-day** (with Open-Meteo's 16-day cap: 20/30 aggregate the available window).


```
ADM0 (Country):   Bangladesh (1 feature)
ADM1 (Divisions): 8 divisions (Dhaka, Chittagong, Rajshahi, Khulna, 
                  Barisal, Sylhet, Rangpur, Mymensingh)
ADM2 (Districts): 64 districts (Dhaka, Gazipur, Tangail, etc.)
ADM3 (Upazilas):  ~490 sub-districts (Savar, Dhamrai, Keraniganj, etc.)
```

**Forecast Coverage**: All 64 districts + 490 upazilas (554 locations total)  
**Update Frequency**: Daily at 00:00 UTC (configurable)  
**Horizons**: 10-day, 20-day, 30-day forecasts

### 1.4 Deployment Phases

| Phase | Duration | Deliverable | Status |
|-------|----------|-------------|--------|
| Phase 0: Kaggle Setup | 2-3 hrs | Kaggle API auth, notebook deployment, secrets config | **→ Start Here** |
| Phase 1: CI/CD Pipeline | 3-4 hrs | GitHub Actions workflow, Kaggle triggers, data sync | → Next |
| Phase 2: Backend Data API | 2-3 hrs | Express server serving pre-computed forecasts | → Next |
| Phase 3: Frontend UI | 6-8 hrs | React webapp with map + forecast display | → Next |
| Phase 4: Testing & Monitoring | 3-4 hrs | Unit/E2E tests + Prometheus metrics | → Next |
| Phase 5: Docker & Deploy | 1-2 hrs | Docker Compose + deployment pipeline | → Next |
| Phase 6: Data Archiving | 1-2 hrs | Historical forecast storage + versioning | → Next |

> ⚠️ **Reconciled (2026-09-12, updated same day — ADR 0005):** Actual status — Phase 0 ✅ (notebook + secrets + HDX ADM3 boundaries; horizons 10/20/30) · Phase 1 ✅ (`weekly_forecast.yml`, Sun 02:00 UTC — not the daily workflow prescribed here) · Phase 2 ✅ (different shape: ESM server, forecast store, `/api/v1` prefix, TFJS inference) · Phase 3 ✅ (TanStack + Leaflet, wired 2026-09-12) · Phase 4 ✅ (34 Jest suites, forecast-age SLO, `monitoring/`) · Phase 5 🔴 superseded by ADR 0003 (Vercel) · Phase 6 ✅ (history API + GitHub-Release CSV). Full matrix: `docs/audits/2026-09-12-deployment-verification.md` §2.

---

## PART 2: ARCHITECTURE COMPARISON

> ⚠️ **Reconciled (2026-09-12):** The "New Architecture" block's "Download CSV/JSON → Commit to repo" step was implemented differently: the CSV is attached to a **GitHub Release** and POSTed to the ingest API (`POST /api/v1/forecasts/update`); the frontend reads the API (`/bulk`), not committed files. History is queryable via `GET /api/v1/forecasts/history`.


### Old Architecture (Edge Inference)
```
User uploads GeoTIFF → Frontend preprocessing → Backend TFLite inference → Result
Issues: Large model files, slow cold starts, complex tensor preprocessing
```

### New Architecture (Automated Forecasts)
```
GitHub Actions (cron) → Trigger Kaggle Notebook → Download CSV/JSON → Commit to repo
                                                   ↓
User visits webapp → Frontend requests forecast → Backend serves JSON → Display
Benefits: No model deployment, fast API responses, scheduled updates, historical data
```

---

## PART 3: PHASE 0 - KAGGLE SETUP

### STEP 0.1: Create Kaggle Account & API Token

1. **Create Kaggle Account**: https://www.kaggle.com/account/login
2. **Generate API Token**:
   - Go to https://www.kaggle.com/settings/account
   - Scroll to "API" section → Click "Create New Token"
   - Download `kaggle.json` (contains username + key)

3. **Store in GitHub Secrets**:
   ```bash
   # Navigate to your GitHub repository
   # Settings → Secrets and variables → Actions → New repository secret
   
   Name: KAGGLE_USERNAME
   Value: <username from kaggle.json>
   
   Name: KAGGLE_KEY
   Value: <key from kaggle.json>
   ```

### STEP 0.2: Upload Google Earth Engine Service Account to Kaggle

**Prerequisites**: GEE service account JSON (from Phase 7 forecast script)

1. **Create Kaggle Dataset for GEE Credentials**:
   ```bash
   # Install Kaggle CLI
   pip install kaggle
   
   # Configure Kaggle
   mkdir -p ~/.kaggle
   cp /path/to/kaggle.json ~/.kaggle/
   chmod 600 ~/.kaggle/kaggle.json
   
   # Create dataset metadata
   cat > dataset-metadata.json << EOF
   {
     "title": "HazardNet GEE Service Account",
     "id": "<your-username>/hazardnet-gee-credentials",
     "licenses": [{"name": "CC0-1.0"}]
   }
   EOF
   
   # Upload GEE service account JSON
   kaggle datasets create -p . -r zip
   ```

2. **Add Dataset to Kaggle Notebook**:
   - In Kaggle notebook → "Add Data" → "Your Datasets"
   - Select "hazardnet-gee-credentials"
   - Access in code: `/kaggle/input/hazardnet-gee-credentials/service-account.json`

### STEP 0.3: Create HazardNet Forecast Notebook on Kaggle

1. **Upload Model Artifacts**:
   ```bash
   # Create Kaggle dataset for model files
   cat > model-metadata.json << EOF
   {
     "title": "HazardNet TFLite Model",
     "id": "<your-username>/hazardnet-model",
     "licenses": [{"name": "CC-BY-SA-4.0"}]
   }
   EOF
   
   # Upload model + normalization stats
   mkdir hazardnet-model
   cp HazardNet_FP32.tflite hazardnet-model/
   cp normalization_stats.json hazardnet-model/
   kaggle datasets create -p hazardnet-model/
   ```

2. **Create Notebook** (`hazardnet-auto-forecast.ipynb`):
   - Copy the Phase 7 forecast pipeline code (provided in your prompt)
   - Update paths to Kaggle dataset locations:
     ```python
     MODEL_PATH = '/kaggle/input/hazardnet-model/hazardnet_fp32.tflite'
     STATS_PATH = '/kaggle/input/hazardnet-model/normalization_stats.json'
     GEE_CREDS = '/kaggle/input/hazardnet-gee-credentials/service-account.json'
     OUTPUT_CSV = '/kaggle/working/hazardnet_forecasts_latest.csv'
     OUTPUT_JSON = '/kaggle/working/hazardnet_forecasts_latest.json'
     ```

3. **Add JSON Export at End**:
   ```python
   # Add after CSV save (line ~450 in forecast script)
   df_results.to_json(OUTPUT_JSON, orient='records', indent=2)
   print(f"JSON Output Saved To: {OUTPUT_JSON}")
   ```

4. **Enable Notebook API Access**:
   - Notebook Settings → Privacy → "Public" (required for API trigger)
   - Note the notebook path: `<username>/hazardnet-auto-forecast`

### STEP 0.4: Add ADM3 (Upazila) Support to Forecast Script

> ⚠️ **Reconciled (2026-09-12, updated same day — ADR 0005):** **Implemented (phase 8a)** — the notebook loads the **507-unit HDX COD-AB ADM3** layer (495 Upazilas + 12 City Corporations) from the attached Kaggle dataset `bangladesh-adm0-3-geoboundaries`; FAO GAUL is decommissioned (GEE hosts GAUL levels 0–2 only). The code sketch below predates this: the implemented loader is `load_hdx_adm3_boundaries()` (geopandas, P-code-keyed, asserts 507). The frontend admin-level selector remains future work.


**Update the `load_fao_gaul_boundaries()` function**:

```python
def load_fao_gaul_boundaries():
    print("Loading FAO GAUL Administrative Boundaries for Bangladesh...")
    
    bd_filter = ee.Filter.eq('ADM0_NAME', 'Bangladesh')
    
    # Load all admin levels
    gaul_adm0 = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(bd_filter)
    gaul_adm1 = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(bd_filter)
    gaul_adm2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(bd_filter)
    
    # NEW: Load ADM3 (Upazilas)
    gaul_adm3 = ee.FeatureCollection('FAO/GAUL/2015/level3').filter(bd_filter)
    
    print(f"   ADM0 (Country): {gaul_adm0.size().getInfo()} feature(s)")
    print(f"   ADM1 (Divisions): {gaul_adm1.size().getInfo()} features")
    print(f"   ADM2 (Districts): {gaul_adm2.size().getInfo()} features")
    print(f"   ADM3 (Upazilas): {gaul_adm3.size().getInfo()} features")
    
    # Extract properties function
    def extract_props(feat, admin_level):
        geom = feat.geometry()
        centroid = geom.centroid()
        
        props = {
            'lon': centroid.coordinates().get(0),
            'lat': centroid.coordinates().get(1),
            'admin_level': admin_level
        }
        
        if admin_level == 2:
            props.update({
                'name': feat.get('ADM2_NAME'),
                'parent': feat.get('ADM1_NAME'),
                'pcode': feat.get('ADM2_CODE')
            })
        elif admin_level == 3:
            props.update({
                'name': feat.get('ADM3_NAME'),
                'parent': feat.get('ADM2_NAME'),
                'division': feat.get('ADM1_NAME'),
                'pcode': feat.get('ADM3_CODE')
            })
        
        return feat.set(props)
    
    # Map extraction for both ADM2 and ADM3
    gaul_adm2_mapped = gaul_adm2.map(lambda f: extract_props(f, 2))
    gaul_adm3_mapped = gaul_adm3.map(lambda f: extract_props(f, 3))
    
    # Fetch to Python
    features_adm2 = gaul_adm2_mapped.getInfo()['features']
    features_adm3 = gaul_adm3_mapped.getInfo()['features']
    
    locations = []
    location_id = 1
    
    # Process Districts (ADM2)
    for feat in sorted(features_adm2, key=lambda x: x['properties'].get('name', '')):
        props = feat['properties']
        locations.append({
            "id": location_id,
            "name": str(props.get('name', 'Unknown')).strip(),
            "type": "district",
            "parent": str(props.get('parent', 'Unknown')).strip(),
            "pcode": str(props.get('pcode', '')).strip(),
            "lat": round(float(props.get('lat', 0)), 4),
            "lon": round(float(props.get('lon', 0)), 4),
            "admin_level": 2
        })
        location_id += 1
    
    # Process Upazilas (ADM3)
    for feat in sorted(features_adm3, key=lambda x: x['properties'].get('name', '')):
        props = feat['properties']
        locations.append({
            "id": location_id,
            "name": str(props.get('name', 'Unknown')).strip(),
            "type": "upazila",
            "parent": str(props.get('parent', 'Unknown')).strip(),
            "division": str(props.get('division', 'Unknown')).strip(),
            "pcode": str(props.get('pcode', '')).strip(),
            "lat": round(float(props.get('lat', 0)), 4),
            "lon": round(float(props.get('lon', 0)), 4),
            "admin_level": 3
        })
        location_id += 1
    
    print(f"\nOK: Loaded {len(locations)} locations ({len(features_adm2)} districts + {len(features_adm3)} upazilas)")
    
    return locations

# Update global variable
LOCATIONS = load_fao_gaul_boundaries()

# Update main loop to use LOCATIONS instead of DISTRICTS
for loc in LOCATIONS:
    print(f"Processing {loc['name']} ({loc['type']}) [{loc['id']}/{len(LOCATIONS)}]...")
    # ... rest of forecast logic
```

**Update result storage to include admin level**:

```python
results.append({
    'location_id': loc['id'],
    'location_name': loc['name'],
    'location_type': loc['type'],
    'admin_level': loc['admin_level'],
    'parent': loc.get('parent', ''),
    'division': loc.get('division', loc.get('parent', '')),
    'pcode': loc['pcode'],
    'horizon': horizon_name,
    'hazard_type': hazard,
    'model_severity': round(severity, 4),
    'physics_severity': round(physics_severity, 4),
    'confidence': round(conf, 4),
    'target_date': target_date,
    'prediction_date': datetime.now().strftime('%Y-%m-%d'),
    'data_source': 'Hybrid_Cognitive_Forecast'
})
```

---

## PART 4: PHASE 1 - CI/CD PIPELINE

### STEP 1.1: Create Kaggle Trigger Script

> ⚠️ **Reconciled (2026-09-12):** **`scripts/kaggle_trigger.py` does not exist.** The equivalent (Kaggle kernel push, poll, download via the Kaggle CLI) is inlined as bash steps in `.github/workflows/weekly_forecast.yml`.


**File**: `scripts/kaggle_trigger.py`

```python
#!/usr/bin/env python3
"""
Trigger Kaggle notebook execution and download results.
"""
import os
import sys
import time
import json
import requests
from pathlib import Path

KAGGLE_USERNAME = os.environ['KAGGLE_USERNAME']
KAGGLE_KEY = os.environ['KAGGLE_KEY']
NOTEBOOK_PATH = f"{KAGGLE_USERNAME}/hazardnet-auto-forecast"
MAX_POLL_ATTEMPTS = 120  # 2 hours with 60s intervals
POLL_INTERVAL = 60  # seconds

def trigger_notebook():
    """Push a new version to trigger execution."""
    print(f"Triggering Kaggle notebook: {NOTEBOOK_PATH}")
    
    # Using Kaggle API's push command (requires notebook already exists)
    cmd = f"kaggle kernels push -p ./kaggle-notebook"
    result = os.system(cmd)
    
    if result != 0:
        print("❌ Failed to trigger notebook")
        sys.exit(1)
    
    print("✅ Notebook triggered successfully")
    return True

def poll_notebook_status():
    """Poll notebook until completion."""
    print(f"\n⏳ Polling notebook status (max {MAX_POLL_ATTEMPTS} attempts)...")
    
    for attempt in range(MAX_POLL_ATTEMPTS):
        cmd = f"kaggle kernels status {NOTEBOOK_PATH}"
        result = os.popen(cmd).read()
        
        if "complete" in result.lower():
            print("\n✅ Notebook execution complete!")
            return True
        elif "error" in result.lower() or "failed" in result.lower():
            print("\n❌ Notebook execution failed!")
            print(result)
            return False
        
        print(f"   Attempt {attempt + 1}/{MAX_POLL_ATTEMPTS}: Status = {result.strip()}")
        time.sleep(POLL_INTERVAL)
    
    print("\n⏱️ Timeout: Notebook execution took too long")
    return False

def download_outputs():
    """Download CSV and JSON outputs from Kaggle."""
    print("\n📥 Downloading outputs...")
    
    output_dir = Path("./backend/data/forecasts")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Download files
    cmd = f"kaggle kernels output {NOTEBOOK_PATH} -p {output_dir}"
    result = os.system(cmd)
    
    if result != 0:
        print("❌ Failed to download outputs")
        return False
    
    # Verify files exist
    csv_file = output_dir / "hazardnet_forecasts_latest.csv"
    json_file = output_dir / "hazardnet_forecasts_latest.json"
    
    if csv_file.exists() and json_file.exists():
        print(f"✅ Downloaded: {csv_file} ({csv_file.stat().st_size} bytes)")
        print(f"✅ Downloaded: {json_file} ({json_file.stat().st_size} bytes)")
        return True
    else:
        print("❌ Output files not found")
        return False

def main():
    print("=" * 60)
    print("HazardNet Kaggle Forecast Pipeline")
    print("=" * 60)
    
    # Step 1: Trigger notebook
    if not trigger_notebook():
        sys.exit(1)
    
    # Step 2: Poll for completion
    if not poll_notebook_status():
        sys.exit(1)
    
    # Step 3: Download outputs
    if not download_outputs():
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ Pipeline completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()
```

### STEP 1.2: Create GitHub Actions Workflow

> ⚠️ **Reconciled (2026-09-12):** **Different workflow.** The canonical pipeline is `.github/workflows/weekly_forecast.yml`: weekly **Sunday 02:00 UTC** (not daily), version bump + patch release + Kaggle run + CSV → Release & ingest + Jest gate. The overlapping legacy `weekly_hazardnet.yml` was retired (ADR 0004). There is no `forecast-pipeline.yml`.


**File**: `.github/workflows/forecast-pipeline.yml`

```yaml
name: HazardNet Automated Forecast Pipeline

on:
  schedule:
    # Run daily at 00:00 UTC
    - cron: '0 0 * * *'
  workflow_dispatch:  # Allow manual trigger
    inputs:
      force_run:
        description: 'Force forecast generation'
        required: false
        default: 'false'

jobs:
  generate-forecasts:
    runs-on: ubuntu-latest
    timeout-minutes: 150  # 2.5 hours max
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Install Kaggle CLI
        run: |
          pip install kaggle pandas
          mkdir -p ~/.kaggle
          echo '{"username":"${{ secrets.KAGGLE_USERNAME }}","key":"${{ secrets.KAGGLE_KEY }}"}' > ~/.kaggle/kaggle.json
          chmod 600 ~/.kaggle/kaggle.json
      
      - name: Trigger Kaggle Notebook
        env:
          KAGGLE_USERNAME: ${{ secrets.KAGGLE_USERNAME }}
          KAGGLE_KEY: ${{ secrets.KAGGLE_KEY }}
        run: |
          python scripts/kaggle_trigger.py
      
      - name: Validate Forecast Data
        run: |
          python scripts/validate_forecasts.py
      
      - name: Archive Historical Forecasts
        run: |
          TIMESTAMP=$(date +%Y-%m-%d)
          mkdir -p backend/data/forecasts/archive/${TIMESTAMP}
          cp backend/data/forecasts/hazardnet_forecasts_latest.csv \
             backend/data/forecasts/archive/${TIMESTAMP}/
          cp backend/data/forecasts/hazardnet_forecasts_latest.json \
             backend/data/forecasts/archive/${TIMESTAMP}/
          echo "Archived forecasts to archive/${TIMESTAMP}/"
      
      - name: Commit Forecast Data
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add backend/data/forecasts/
          git commit -m "chore: update forecasts $(date +%Y-%m-%d)" || echo "No changes to commit"
          git push
      
      - name: Upload Artifacts
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: forecast-outputs
          path: |
            backend/data/forecasts/hazardnet_forecasts_latest.csv
            backend/data/forecasts/hazardnet_forecasts_latest.json
          retention-days: 90
      
      - name: Notify on Failure
        if: failure()
        run: |
          echo "⚠️ Forecast pipeline failed! Check logs for details."
          # Add Slack/email notification here if needed
```

### STEP 1.3: Create Forecast Validation Script

> ⚠️ **Reconciled (2026-09-12):** **`scripts/validate_forecasts.py` does not exist.** Row-level schema validation lives in the ingest paths (`backend/utils/forecastRow.js` for CSV, a zod chunk schema in `api/ingest.js`); freshness is monitored by the `hazardnet_forecast_age_hours` gauge with a **192h** alert threshold at weekly cadence (`monitoring/alerts.yml`).


**File**: `scripts/validate_forecasts.py`

```python
#!/usr/bin/env python3
"""
Validate forecast CSV/JSON schema and data quality.
"""
import sys
import json
import pandas as pd
from pathlib import Path
from datetime import datetime

FORECAST_DIR = Path("./backend/data/forecasts")
CSV_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.csv"
JSON_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.json"

REQUIRED_COLUMNS = [
    'location_id', 'location_name', 'location_type', 'admin_level',
    'division', 'pcode', 'horizon', 'hazard_type',
    'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source'
]

VALID_HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
]

VALID_HORIZONS = ['10_days', '20_days', '30_days']

def validate_csv():
    """Validate CSV file structure and content."""
    print("📋 Validating CSV file...")
    
    if not CSV_FILE.exists():
        print(f"❌ CSV file not found: {CSV_FILE}")
        return False
    
    df = pd.read_csv(CSV_FILE)
    
    # Check columns
    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        print(f"❌ Missing columns: {missing_cols}")
        return False
    
    # Check row count (should be 554 locations * 3 horizons = 1662 rows)
    expected_rows = 1662
    if len(df) < expected_rows * 0.9:  # Allow 10% tolerance
        print(f"⚠️ Warning: Expected ~{expected_rows} rows, got {len(df)}")
    
    # Check data quality
    if df['confidence'].min() < 0 or df['confidence'].max() > 1:
        print("❌ Confidence values out of range [0, 1]")
        return False
    
    if not df['hazard_type'].isin(VALID_HAZARDS).all():
        print("❌ Invalid hazard types found")
        return False
    
    if not df['horizon'].isin(VALID_HORIZONS).all():
        print("❌ Invalid horizon values found")
        return False
    
    print(f"✅ CSV valid: {len(df)} rows, {len(df.columns)} columns")
    return True

def validate_json():
    """Validate JSON file structure."""
    print("\n📋 Validating JSON file...")
    
    if not JSON_FILE.exists():
        print(f"❌ JSON file not found: {JSON_FILE}")
        return False
    
    with open(JSON_FILE, 'r') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print("❌ JSON root must be an array")
        return False
    
    # Validate first record
    if len(data) > 0:
        record = data[0]
        missing_keys = set(REQUIRED_COLUMNS) - set(record.keys())
        if missing_keys:
            print(f"❌ Missing keys in JSON: {missing_keys}")
            return False
    
    print(f"✅ JSON valid: {len(data)} records")
    return True

def validate_freshness():
    """Check if forecasts are recent."""
    print("\n📅 Checking forecast freshness...")
    
    df = pd.read_csv(CSV_FILE)
    latest_date = pd.to_datetime(df['prediction_date'].max())
    age_days = (datetime.now() - latest_date).days
    
    if age_days > 2:
        print(f"⚠️ Warning: Forecasts are {age_days} days old")
    else:
        print(f"✅ Forecasts are fresh ({age_days} days old)")
    
    return True

def main():
    print("=" * 60)
    print("HazardNet Forecast Validation")
    print("=" * 60 + "\n")
    
    csv_valid = validate_csv()
    json_valid = validate_json()
    fresh = validate_freshness()
    
    print("\n" + "=" * 60)
    if csv_valid and json_valid and fresh:
        print("✅ All validation checks passed!")
        print("=" * 60)
        sys.exit(0)
    else:
        print("❌ Validation failed!")
        print("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

---

## PART 5: PHASE 2 - BACKEND DATA API

### STEP 2.1: Create Express Server (No TFLite)

> ⚠️ **Reconciled (2026-09-12):** **Different server.** The actual `backend/server.js` is **ESM** (no `require`, no morgan — request-id middleware + structured logger), **does** run TFJS inference (`/api/predict`), mounts forecast routes under `/api/v1/forecasts`, serves `/health` inline (model-version handshake), and lives in a single root `package.json` (no `backend/package.json`).


**File**: `backend/server.js`

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const forecastRoutes = require('./routes/forecasts');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/api/forecasts', forecastRoutes);
app.use('/health', healthRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ HazardNet API server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Forecasts API: http://localhost:${PORT}/api/forecasts`);
});

module.exports = app;
```

**Dependencies** (`backend/package.json`):

```json
{
  "name": "hazardnet-backend",
  "version": "2.0.0",
  "description": "HazardNet Forecast Data API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.5.0"
  }
}
```

### STEP 2.2: Create Forecast Routes

> ⚠️ **Reconciled (2026-09-12):** The actual router (`backend/routes/forecasts.js`) exposes `POST /update` (multipart CSV, Bearer `BACKEND_API_KEY`), `GET /?district_id&horizon`, `GET /bulk?horizon`, and `GET /history?from&to` (added 2026-09-12) — all reading/writing through the forecast store (`backend/forecastStore.js`, ADR 0002).


**File**: `backend/routes/forecasts.js`

```javascript
const express = require('express');
const router = express.Router();
const forecastService = require('../services/forecastService');

/**
 * GET /api/forecasts
 * Query params: location, horizon, hazard, date, admin_level
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      location: req.query.location,
      horizon: req.query.horizon,
      hazard: req.query.hazard,
      date: req.query.date,
      admin_level: req.query.admin_level ? parseInt(req.query.admin_level) : null
    };
    
    const forecasts = await forecastService.getForecasts(filters);
    
    res.json({
      count: forecasts.length,
      filters: filters,
      data: forecasts
    });
  } catch (error) {
    console.error('Forecast fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch forecasts' });
  }
});

/**
 * GET /api/forecasts/locations
 * Get list of all locations
 */
router.get('/locations', async (req, res) => {
  try {
    const adminLevel = req.query.admin_level ? parseInt(req.query.admin_level) : null;
    const locations = await forecastService.getLocations(adminLevel);
    
    res.json({
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Locations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

/**
 * GET /api/forecasts/latest
 * Get most recent forecast update info
 */
router.get('/latest', async (req, res) => {
  try {
    const info = await forecastService.getLatestInfo();
    res.json(info);
  } catch (error) {
    console.error('Latest info fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch latest info' });
  }
});

/**
 * GET /api/forecasts/statistics
 * Get aggregate statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = await forecastService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Statistics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
```

### STEP 2.3: Create Forecast Service

> ⚠️ **Reconciled (2026-09-12):** **Never implemented** — no static-file reader or `CACHE_TTL`. Replaced by `backend/forecastStore.js`: Firestore (default) or Supabase Postgres (`FORECAST_STORE` env, ADR 0002). The freshness info this service was meant to provide is the `hazardnet_forecast_age_hours` gauge on `/metrics`.


**File**: `backend/services/forecastService.js`

```javascript
const fs = require('fs').promises;
const path = require('path');

const FORECAST_FILE = path.join(__dirname, '../data/forecasts/hazardnet_forecasts_latest.json');

class ForecastService {
  constructor() {
    this.cache = null;
    this.cacheTime = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }
  
  async loadForecasts() {
    // Check cache
    if (this.cache && this.cacheTime && (Date.now() - this.cacheTime < this.CACHE_TTL)) {
      return this.cache;
    }
    
    // Load from file
    try {
      const data = await fs.readFile(FORECAST_FILE, 'utf8');
      this.cache = JSON.parse(data);
      this.cacheTime = Date.now();
      console.log(`✅ Loaded ${this.cache.length} forecasts from file`);
      return this.cache;
    } catch (error) {
      console.error('Failed to load forecasts:', error);
      throw new Error('Forecast data not available');
    }
  }
  
  async getForecasts(filters = {}) {
    const forecasts = await this.loadForecasts();
    
    let filtered = forecasts;
    
    // Apply filters
    if (filters.location) {
      filtered = filtered.filter(f => 
        f.location_name.toLowerCase().includes(filters.location.toLowerCase())
      );
    }
    
    if (filters.horizon) {
      filtered = filtered.filter(f => f.horizon === filters.horizon);
    }
    
    if (filters.hazard) {
      filtered = filtered.filter(f => f.hazard_type === filters.hazard);
    }
    
    if (filters.date) {
      filtered = filtered.filter(f => f.target_date === filters.date);
    }
    
    if (filters.admin_level !== null) {
      filtered = filtered.filter(f => f.admin_level === filters.admin_level);
    }
    
    return filtered;
  }
  
  async getLocations(adminLevel = null) {
    const forecasts = await this.loadForecasts();
    
    // Extract unique locations
    const locationMap = new Map();
    forecasts.forEach(f => {
      if (adminLevel === null || f.admin_level === adminLevel) {
        if (!locationMap.has(f.location_id)) {
          locationMap.set(f.location_id, {
            id: f.location_id,
            name: f.location_name,
            type: f.location_type,
            admin_level: f.admin_level,
            parent: f.parent || f.division,
            division: f.division,
            pcode: f.pcode
          });
        }
      }
    });
    
    return Array.from(locationMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  
  async getLatestInfo() {
    const forecasts = await this.loadForecasts();
    
    if (forecasts.length === 0) {
      return { available: false };
    }
    
    const latestDate = forecasts[0].prediction_date;
    const age = Math.floor((Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60));
    
    return {
      available: true,
      prediction_date: latestDate,
      age_hours: age,
      total_forecasts: forecasts.length,
      horizons: [...new Set(forecasts.map(f => f.horizon))],
      hazards: [...new Set(forecasts.map(f => f.hazard_type))]
    };
  }
  
  async getStatistics() {
    const forecasts = await this.loadForecasts();
    
    const stats = {
      total_forecasts: forecasts.length,
      by_horizon: {},
      by_hazard: {},
      by_admin_level: {},
      avg_confidence: 0,
      high_risk_count: 0
    };
    
    forecasts.forEach(f => {
      // By horizon
      stats.by_horizon[f.horizon] = (stats.by_horizon[f.horizon] || 0) + 1;
      
      // By hazard
      stats.by_hazard[f.hazard_type] = (stats.by_hazard[f.hazard_type] || 0) + 1;
      
      // By admin level
      const level = f.admin_level === 2 ? 'district' : 'upazila';
      stats.by_admin_level[level] = (stats.by_admin_level[level] || 0) + 1;
      
      // Confidence sum
      stats.avg_confidence += f.confidence;
      
      // High risk (model severity > 0.7 or physics severity > 0.7)
      if (f.model_severity > 0.7 || f.physics_severity > 0.7) {
        stats.high_risk_count++;
      }
    });
    
    stats.avg_confidence = (stats.avg_confidence / forecasts.length).toFixed(3);
    
    return stats;
  }
}

module.exports = new ForecastService();
```

### STEP 2.4: Health Check Endpoint

> ⚠️ **Reconciled (2026-09-12):** No `backend/routes/health.js` — `/health` is inline in `backend/server.js` and includes the model-version handshake. Forecast data status is exposed via `/metrics` (`hazardnet_forecast_age_hours`; absent series = no data / store unreadable).


**File**: `backend/routes/health.js`

```javascript
const express = require('express');
const router = express.Router();
const forecastService = require('../services/forecastService');
const { promises: fs } = require('fs');
const path = require('path');

router.get('/', async (req, res) => {
  try {
    const info = await forecastService.getLatestInfo();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      forecast_data: {
        available: info.available,
        age_hours: info.age_hours || null,
        stale: info.age_hours > 48,
        last_update: info.prediction_date || null
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    const statusCode = health.forecast_data.stale ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
```

---

## PART 6: PHASE 3 - FRONTEND UI

### STEP 3.1: Update Frontend to Fetch Pre-Computed Forecasts

> ⚠️ **Reconciled (2026-09-12):** Implemented **differently (2026-09-12)**: TanStack Query hooks (`frontend/src/hooks/useForecasts.ts`) + defensive parsing/district-alias matching (`frontend/src/lib/forecasts.ts`), **Leaflet** map (not Mapbox), horizons **10/20/30-day** (ADR 0005). The GeoTIFF upload components still exist as UI-only mocks; there is no admin-level selector (ADM3 not implemented).


**Key Changes**:
1. Remove GeoTIFF upload components
2. Replace with forecast data fetching from API
3. Add admin level selector (District vs Upazila)
4. Display forecast freshness warnings

**File**: `frontend/src/services/forecastApi.ts`

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export interface Forecast {
  location_id: number;
  location_name: string;
  location_type: 'district' | 'upazila';
  admin_level: 2 | 3;
  division: string;
  parent: string;
  pcode: string;
  horizon: '10_days' | '20_days' | '30_days';
  hazard_type: string;
  model_severity: number;
  physics_severity: number;
  confidence: number;
  target_date: string;
  prediction_date: string;
  data_source: string;
}

export interface Location {
  id: number;
  name: string;
  type: 'district' | 'upazila';
  admin_level: 2 | 3;
  parent: string;
  division: string;
  pcode: string;
}

export const forecastApi = createApi({
  reducerPath: 'forecastApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (builder) => ({
    getForecasts: builder.query<Forecast[], {
      location?: string;
      horizon?: string;
      hazard?: string;
      admin_level?: number;
    }>({
      query: (params) => ({
        url: '/forecasts',
        params
      }),
      transformResponse: (response: { data: Forecast[] }) => response.data
    }),
    
    getLocations: builder.query<Location[], number | undefined>({
      query: (adminLevel) => ({
        url: '/forecasts/locations',
        params: adminLevel ? { admin_level: adminLevel } : {}
      }),
      transformResponse: (response: { data: Location[] }) => response.data
    }),
    
    getLatestInfo: builder.query<{
      available: boolean;
      prediction_date?: string;
      age_hours?: number;
      total_forecasts?: number;
    }, void>({
      query: () => '/forecasts/latest'
    }),
    
    getStatistics: builder.query<any, void>({
      query: () => '/forecasts/statistics'
    })
  })
});

export const {
  useGetForecastsQuery,
  useGetLocationsQuery,
  useGetLatestInfoQuery,
  useGetStatisticsQuery
} = forecastApi;
```

**File**: `frontend/src/components/ForecastPanel.tsx`

```typescript
import React, { useState } from 'react';
import { useGetForecastsQuery, useGetLatestInfoQuery } from '../services/forecastApi';

interface ForecastPanelProps {
  selectedLocation?: string;
  adminLevel: 2 | 3;
}

export const ForecastPanel: React.FC<ForecastPanelProps> = ({ 
  selectedLocation,
  adminLevel 
}) => {
  const [selectedHorizon, setSelectedHorizon] = useState<string>('10_days');
  
  const { data: forecasts, isLoading, error } = useGetForecastsQuery({
    location: selectedLocation,
    horizon: selectedHorizon,
    admin_level: adminLevel
  });
  
  const { data: latestInfo } = useGetLatestInfoQuery();
  
  if (!selectedLocation) {
    return (
      <div className="p-6 text-center text-gray-500">
        Select a location on the map to view forecasts
      </div>
    );
  }
  
  if (isLoading) return <div>Loading forecasts...</div>;
  if (error) return <div>Error loading forecasts</div>;
  
  const isStale = latestInfo && latestInfo.age_hours && latestInfo.age_hours > 48;
  
  return (
    <div className="p-6">
      {/* Freshness Warning */}
      {isStale && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 rounded">
          ⚠️ Forecasts are {latestInfo.age_hours} hours old. 
          Latest update: {latestInfo.prediction_date}
        </div>
      )}
      
      {/* Horizon Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Forecast Horizon</label>
        <select 
          value={selectedHorizon}
          onChange={(e) => setSelectedHorizon(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="10_days">10 Days</option>
          <option value="20_days">20 Days</option>
          <option value="30_days">30 Days</option>
        </select>
      </div>
      
      {/* Forecast Results */}
      <div className="space-y-4">
        {forecasts && forecasts.map((forecast, idx) => (
          <div key={idx} className="border rounded-lg p-4 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{forecast.hazard_type}</h3>
              <span className={`px-3 py-1 rounded-full text-sm ${
                forecast.confidence >= 0.85 ? 'bg-green-100 text-green-800' :
                forecast.confidence >= 0.70 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {(forecast.confidence * 100).toFixed(1)}% confidence
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-600">Model Severity</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${forecast.model_severity * 100}%` }}
                  />
                </div>
                <p className="text-sm mt-1">{(forecast.model_severity * 100).toFixed(1)}%</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Physics Severity</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-orange-600 h-2 rounded-full"
                    style={{ width: `${forecast.physics_severity * 100}%` }}
                  />
                </div>
                <p className="text-sm mt-1">{(forecast.physics_severity * 100).toFixed(1)}%</p>
              </div>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              <p>Target Date: {forecast.target_date}</p>
              <p>Location: {forecast.location_name} ({forecast.location_type})</p>
              <p>Division: {forecast.division}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## PART 7: PHASE 4 - TESTING & MONITORING

### STEP 4.1: Prometheus Metrics for Forecast Pipeline

> ⚠️ **Reconciled (2026-09-12):** **Implemented 2026-09-12 (backlog 5)** — `hazardnet_forecast_age_hours` exists verbatim in `backend/metrics.js` (refreshed per scrape via `backend/utils/forecastFreshness.js`; the stateless Vercel `/api/metrics` exposes the same gauge). The other names here differ from the implemented set: `api_requests_total`, `inference_latency_ms`, `model_load_time_ms`, `cache_hit_rate` — see `backend/metrics.js` and `monitoring/README.md`.


**File**: `backend/metrics.js`

```javascript
const prometheus = require('prom-client');

const register = new prometheus.Register();

// Forecast data age (staleness indicator)
const forecastAge = new prometheus.Gauge({
  name: 'hazardnet_forecast_age_hours',
  help: 'Age of forecast data in hours',
  registers: [register]
});

// API request counter
const httpRequestsTotal = new prometheus.Counter({
  name: 'hazardnet_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// API response time
const httpRequestDuration = new prometheus.Histogram({
  name: 'hazardnet_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  registers: [register]
});

// Forecast cache hits
const cacheHits = new prometheus.Counter({
  name: 'hazardnet_cache_hits_total',
  help: 'Total cache hits',
  registers: [register]
});

module.exports = {
  register,
  forecastAge,
  httpRequestsTotal,
  httpRequestDuration,
  cacheHits
};
```

**Add metrics endpoint to `backend/server.js`**:

```javascript
const { register, forecastAge } = require('./metrics');

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  
  // Update forecast age before serving metrics
  const info = await forecastService.getLatestInfo();
  if (info.age_hours !== undefined) {
    forecastAge.set(info.age_hours);
  }
  
  res.end(await register.metrics());
});
```

### STEP 4.2: Grafana Dashboard Configuration

> ⚠️ **Reconciled (2026-09-12):** **Committed 2026-09-12:** `monitoring/grafana-dashboard.json` (importable, 4 panels, real metric names), `monitoring/prometheus.yml`, `monitoring/alerts.yml`. The alert threshold was **recalibrated 48h → 192h**: this guide's 48h assumed daily runs; at the weekly cadence it would false-fire ~5 of 7 days.


**File**: `monitoring/grafana-dashboard.json`

```json
{
  "dashboard": {
    "title": "HazardNet Forecast Pipeline",
    "panels": [
      {
        "title": "Forecast Data Age",
        "type": "graph",
        "targets": [{
          "expr": "hazardnet_forecast_age_hours"
        }],
        "alert": {
          "conditions": [{
            "evaluator": { "params": [48], "type": "gt" },
            "query": { "params": ["A", "5m", "now"] }
          }],
          "name": "Stale Forecast Data"
        }
      },
      {
        "title": "API Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(hazardnet_http_requests_total[5m])"
        }]
      },
      {
        "title": "API Response Time (p95)",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, hazardnet_http_request_duration_seconds_bucket)"
        }]
      },
      {
        "title": "Forecast Distribution by Hazard",
        "type": "piechart",
        "targets": [{
          "expr": "count by (hazard_type) (hazardnet_forecasts)"
        }]
      }
    ]
  }
}
```

---

## PART 8: PHASE 5 - DOCKER & DEPLOYMENT

> ⚠️ **Reconciled (2026-09-12):** **Superseded by ADR 0003.** No `docker-compose.yml` or `Dockerfile` exists in the repo, and none is planned: the primary deploy is **Vercel** (Git integration, static SPA + `api/` functions, `vercel.json`); the self-host runtime is the Node server (`npm start`, Node ≥ 20). For the Prometheus/Grafana services prescribed here, use the `docker run` commands in `monitoring/README.md`.


### STEP 5.1: Updated docker-compose.yml (No Model Files)

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend/data/forecasts:/app/data/forecasts:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      - REACT_APP_API_URL=http://backend:3001
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3005:3000"
    depends_on:
      - prometheus
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana-dashboard.json:/etc/grafana/provisioning/dashboards/hazardnet.json:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=hazardnet2026
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

### STEP 5.2: Backend Dockerfile (Lightweight)

**File**: `backend/Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data/forecasts

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]
```

---

## PART 9: DEPLOYMENT WORKFLOW

> ⚠️ **Reconciled (2026-09-12):** **Actual steps:** deploy = push to `main` (Vercel builds the SPA + functions) — no compose; self-host = `npm ci --no-audit --no-fund && npm run build && npm start`, then `curl http://localhost:3001/health`; manual pipeline run = `gh workflow run weekly_forecast.yml`. Note there is no `/api/forecasts/latest` route — use `/api/v1/forecasts?district_id&horizon` or `/api/v1/forecasts/bulk`.


### Complete Deployment Steps

```bash
# 1. Clone repository
git clone https://github.com/your-org/hazardnet-webapp.git
cd hazardnet-webapp

# 2. Set up Kaggle credentials (GitHub Secrets)
# Go to GitHub repo → Settings → Secrets → Actions
# Add: KAGGLE_USERNAME, KAGGLE_KEY

# 3. Trigger first forecast run (manual)
gh workflow run forecast-pipeline.yml

# 4. Wait for forecast data to be committed (check Actions tab)

# 5. Deploy with Docker Compose
docker-compose up -d

# 6. Verify services
curl http://localhost:3001/health
curl http://localhost:3001/api/forecasts/latest

# 7. Access webapp
open http://localhost:3000

# 8. Monitor forecasts
open http://localhost:3005  # Grafana
```

---

## PART 10: COST ANALYSIS & QUOTAS

### Kaggle Free Tier Limits
- **CPU Kernels**: 30 hours/week
- **GPU P100**: 9 hours/week
- **Disk Quota**: 20GB max per dataset

### Forecast Pipeline Runtime

> ⚠️ **Reconciled (2026-09-12):** The math below assumes 554 locations × 3 horizons **daily**. Implemented: **64 districts × 2 horizons weekly** — recompute before relying on the quota-headroom figures.

- **Per Run**: ~90 minutes (554 locations × 3 horizons)
- **Daily Runs**: 1.5 hours × 7 days = 10.5 hours/week
- **Headroom**: 19.5 hours/week remaining

### Alternative: GitHub Actions Self-Hosted Runner
If Kaggle limits become restrictive:
1. Set up self-hosted runner with GPU
2. Install GEE Python SDK + TFLite runtime
3. Run forecast script directly in GitHub Actions

---

## PART 11: TROUBLESHOOTING

> ⚠️ **Reconciled (2026-09-12):** Rows referencing this guide's unimplemented stack: ">48hrs old" → at weekly cadence the staleness threshold is **192h** (`monitoring/alerts.yml`); "Forecast JSON missing in `backend/data/forecasts/`" → data lives in the forecast store (Firestore/Supabase), and a 503 from authenticated endpoints means `BACKEND_API_KEY` is unset — fail-closed by design; "`CACHE_TTL` in `forecastService.js`" → no such service (store-backed reads).


| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Kaggle notebook timeout | Too many locations/GEE rate limits | Split into multiple notebooks by division |
| Forecast data >48hrs old | CI/CD pipeline failed | Check GitHub Actions logs; manually trigger |
| Backend returns 503 | Forecast JSON missing | Verify forecast files exist in `backend/data/forecasts/` |
| Map shows no forecasts | API CORS error | Check `backend/server.js` CORS config |
| High memory usage | Forecast cache not expiring | Reduce `CACHE_TTL` in `forecastService.js` |
| GEE auth fails in Kaggle | Invalid service account JSON | Re-upload credentials to Kaggle dataset |

---

## PART 12: NEXT STEPS & ENHANCEMENTS

> ⚠️ **Reconciled (2026-09-12):** Status: **web push notifications exist** (`/api/push/*`, VAPID — close to "real-time alerts"); **historical comparison is served** (`GET /api/v1/forecasts/history`, 2026-09-12); downscaling / ensemble / mobile app not started.


### Phase 7: Advanced Features (Post-MVP)
1. **Real-time Alerts**: Webhook notifications for high-risk forecasts
2. **Historical Comparison**: Compare current vs past forecasts
3. **Downscaling**: Sub-upazila (village-level) forecasts using spatial interpolation
4. **Multi-Model Ensemble**: Integrate multiple forecast sources
5. **Mobile App**: React Native app with offline forecast caching

---

**Estimated Total Time**: 18-22 hours for full deployment  
**Backend Latency Target**: <50ms (static file serving)  
**Forecast Update Frequency**: Daily (configurable)  
**Storage Requirements**: ~5MB per forecast version (30-day archive = 150MB)

> ⚠️ **Reconciled (2026-09-12):** Update frequency is **weekly** (Sunday 02:00 UTC), and the archive is the **GitHub-Release CSV set + the history API** — no in-repo 30-day snapshot rotation.

**Key Benefits**:
- ✅ No model deployment complexity
- ✅ Scalable to 1000s of locations
- ✅ Historical forecast tracking
- ✅ Zero inference latency
- ✅ Free hosting (Kaggle + GitHub)

---

This refactored guide eliminates TFLite model deployment entirely, leveraging Kaggle's free compute tier for automated forecast generation via GitHub Actions CI/CD. The backend becomes a lightweight data API serving pre-computed forecasts with support for 64 districts + 490 upazilas (FAO GAUL ADM3).