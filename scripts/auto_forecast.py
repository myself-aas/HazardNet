import os
import io
import sys
import json
import time
import uuid
import hashlib
import urllib.request
import numpy as np
import pandas as pd
import requests
from datetime import datetime, timedelta, timezone
import cv2  # Replaces PyTorch for bilinear interpolation
import tflite_runtime.interpreter as tflite # Replaces full TensorFlow

# ── Independent physics track (Phase 2, audit 2026-09-17) ────────────────────
# The formulas live in their own standard-library-only module so they can be
# unit-tested without Earth Engine or TFLite (scripts/tests/test_physics_severity.py)
# and so the pipeline cannot drift from the tested version. All eight hazard
# classes are scored from the meteorological drivers alone — never from the
# model's own answer.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from physics_severity import (  # noqa: E402  (after the path insert just above)
    HAZARD_CLASSES,
    compute_physics_scores,
    missing_drivers,
    physics_columns,
    physics_summary,
)

# ── Per-prediction scene lineage (PRODUCT_SPEC §5.8) ─────────────────────────
# `scripts/etl/scene_manifest.py` describes and hashes what a prediction was
# built from; `scripts/etl/sources.py` owns the decadal-window arithmetic this
# pipeline uses. Both are standard-library-only, and both are tested offline
# (scripts/tests/test_etl_sources_cog.py), which is why the lineage can be
# verified in CI even though the tensors can only be built on a runner with
# Earth Engine credentials.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'etl'))
from scene_manifest import (  # noqa: E402
    build_manifest as build_scene_manifest,
    driver_record as scene_driver_record,
    step_record as scene_step_record,
    unit_lookup as scene_unit_lookup,
    unit_record as scene_unit_record,
    write_manifest as write_scene_manifest,
)
from sources import ten_day_windows  # noqa: E402

# ==============================================================================
# 1. GEE AUTHENTICATION (Service Account)
# ==============================================================================
import ee

# --- Earth Engine authentication via service-account JSON from env -----------
# On GitHub Actions the JSON is injected as a repository secret and must never
# be committed to disk beyond the lifetime of the job. We write it to a
# temporary file, initialize EE, then remove it.
ee_credentials_json = os.environ.get("EE_SERVICE_ACCOUNT_JSON", "").strip()
if not ee_credentials_json:
    print("CRITICAL ERROR: EE_SERVICE_ACCOUNT_JSON is missing from the environment.")
    sys.exit(1)

# Allow the service-account email to be overridden via env; otherwise
# fall back to the HazardNet Kaggle/GCP service account.
SERVICE_ACCOUNT = os.environ.get(
    "EE_SERVICE_ACCOUNT_EMAIL",
    "hazardnet-ee-service-kaggle@hazardnet-aas48424.iam.gserviceaccount.com",
)

CREDS_PATH = "ee_creds.json"
try:
    with open(CREDS_PATH, "w") as f:
        f.write(ee_credentials_json)
    credentials = ee.ServiceAccountCredentials(SERVICE_ACCOUNT, CREDS_PATH)
    ee.Initialize(credentials)
    print("OK: Google Earth Engine initialized via service account.")
finally:
    # Remove the credential file from disk as soon as EE is initialized so a
    # later crash/debug log can't leak it.
    try:
        os.remove(CREDS_PATH)
    except OSError:
        pass

# ==============================================================================
# 2. CONFIGURATION & PATHS
# ==============================================================================
BAND_NAMES = [
    'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR', 
    'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp', 
    'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad'
]

# Fix the path to the model to load it directly
MODEL_PATH = 'Models/hazardnet_fp32.tflite'
STATS_PATH = 'Models/normalization_stats.json'
OUTPUT_CSV = 'hazardnet_forecasts_latest.csv'

HORIZONS = {'7_days': 7, '15_days': 15}
# HAZARD_CLASSES is imported from scripts/physics_severity.py (single source of
# truth, pinned to Models/labels.json and backend/utils/forecastRow.js by
# scripts/tests/test_model_claims.py). Do not redefine it here.

# ==============================================================================
# 3. LOAD BANGLADESH FAO GAUL ADMINISTRATIVE BOUNDARIES
# ==============================================================================
def load_fao_gaul_boundaries():
    print("Loading FAO GAUL Administrative Boundaries for Bangladesh via GEE...")
    bd_filter = ee.Filter.eq('ADM0_NAME', 'Bangladesh')
    gaul_adm2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(bd_filter)
    
    def extract_props(feat):
        geom = feat.geometry()
        centroid = geom.centroid()
        return feat.set({
            'lon': centroid.coordinates().get(0),
            'lat': centroid.coordinates().get(1),
            'ADM2_NAME': feat.get('ADM2_NAME'),
            'ADM1_NAME': feat.get('ADM1_NAME'),
            'ADM2_PCODE': feat.get('ADM2_PCODE')
        })
    
    gaul_adm2_mapped = gaul_adm2.map(extract_props)
    features = gaul_adm2_mapped.getInfo()['features']
    
    districts = []
    sorted_features = sorted(features, key=lambda x: x['properties'].get('ADM2_NAME', ''))
    
    for i, feat in enumerate(sorted_features):
        props = feat['properties']
        districts.append({
            "id": i + 1,
            "name": str(props.get('ADM2_NAME', 'Unknown')).strip(),
            "division": str(props.get('ADM1_NAME', 'Unknown')).strip(),
            "pcode": str(props.get('ADM2_PCODE', props.get('ADM2_CODE', ''))).strip(),
            "lat": round(float(props.get('lat', 0)), 4),
            "lon": round(float(props.get('lon', 0)), 4)
        })
    return districts

DISTRICTS = load_fao_gaul_boundaries()
print(f"\\nOK: Loaded {len(DISTRICTS)} districts via FAO GAUL")

# ==============================================================================
# 4. GEE PIPELINE
# ==============================================================================
def harmonize_and_rename(image, mission_type):
    try:
        mappings = {
            'L57': {'src': ['SR_B1', 'SR_B3', 'SR_B4', 'SR_B5'], 'dest': ['Blue', 'Red', 'NIR', 'SWIR']},
            'L8':  {'src': ['SR_B2', 'SR_B4', 'SR_B5', 'SR_B6'], 'dest': ['Blue', 'Red', 'NIR', 'SWIR']},
            'S2':  {'src': ['B2', 'B4', 'B8', 'B11'],           'dest': ['Blue', 'Red', 'NIR', 'SWIR']}
        }
        selected_map = mappings.get(mission_type)
        band_names = image.bandNames()
        count = band_names.size()
        
        return ee.Image(ee.Algorithms.If(
            count.gte(4),
            image.select(selected_map['src']).rename(selected_map['dest']),
            ee.Image.constant([0, 0, 0, 0]).rename(selected_map['dest']).updateMask(0)
        ))
    except Exception:
        return None

def get_hybrid_optical(region, start, end):
    s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(region).filterDate(start, end).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    if s2_col.size().getInfo() > 0:
        return harmonize_and_rename(s2_col.median(), 'S2').unmask(0)

    l8_col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end).filter(ee.Filter.lt('CLOUD_COVER', 30))
    if l8_col.size().getInfo() > 0:
        return harmonize_and_rename(l8_col.median(), 'L8').resample('bicubic').unmask(0)

    return ee.Image.constant([0, 0, 0, 0]).rename(['Blue', 'Red', 'NIR', 'SWIR']).float().unmask(0)

def get_temporal_15ch_stack(region, start, end):
    try:
        S1_BANDS = ['VV', 'VH']
        ERA5_BANDS = ['temperature_2m', 'total_precipitation_sum', 'temperature_2m_max',
                      'temperature_2m_min', 'volumetric_soil_water_layer_1',
                      'volumetric_soil_water_layer_3', 'soil_temperature_level_1',
                      'dewpoint_temperature_2m', 'surface_solar_radiation_downwards_sum']

        s1_collection = ee.ImageCollection('COPERNICUS/S1_GRD') \
            .filterBounds(region).filterDate(start, end) \
            .filter(ee.Filter.eq('instrumentMode', 'IW')) \
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')) \
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
        
        default_s1 = ee.Image.constant([0, 0]).rename(S1_BANDS).float()
        s1 = ee.Image(ee.Algorithms.If(
            s1_collection.size().gt(0),
            s1_collection.select(S1_BANDS).median().unmask(0),
            default_s1
        ))

        s2_hybrid = get_hybrid_optical(region, start, end)
        era5 = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR') \
            .filterBounds(region).filterDate(start, end) \
            .median().resample('bilinear').unmask(0).select(ERA5_BANDS)

        return s1.addBands(s2_hybrid).addBands(era5).float().clip(region).unmask(0)
    except Exception as e:
        print(f"Stack Construction Error: {e}")
        return None

# ==============================================================================
# 5. NUMPY DOWNLOAD & TENSOR BUILDER
# ==============================================================================
def get_ee_image_as_numpy(image, region, scale=10, target_size=(64, 64)):
    url = image.getDownloadURL({'region': region, 'scale': scale, 'format': 'NPY'})
    # 60s socket timeout: without one a stalled GEE download can hang the
    # district loop until the 120-minute job timeout kills the whole workflow.
    response = urllib.request.urlopen(url, timeout=60)
    data = np.load(io.BytesIO(response.read()), allow_pickle=True)
    
    bands = [data[b] for b in image.bandNames().getInfo()]
    img_np = np.stack(bands, axis=0) # Shape: [channels, height, width]
    
    h, w = img_np.shape[1], img_np.shape[2]
    
    if h != target_size[0] or w != target_size[1]:
        # Refactored: Replace PyTorch interpolate with OpenCV resize
        # OpenCV resize expects shape (H, W, Channels)
        img_hwc = np.transpose(img_np, (1, 2, 0))
        resized_hwc = cv2.resize(img_hwc, (target_size[1], target_size[0]), interpolation=cv2.INTER_LINEAR)
        img_np = np.transpose(resized_hwc, (2, 0, 1)) # Back to [C, H, W]
        
    return img_np

# ==============================================================================
# 4-bis. RESILIENT NETWORK HELPERS
# ==============================================================================
# 2026-09-17 incident: every district's GEE download failed *silently*
# (`except Exception: return None` in fetch_historical_steps swallowed the real
# error), the run "succeeded" with a 0-row CSV and only died later at
# publish_forecast_csv.py's sanity check ("CSV contains zero rows"), pointing
# everyone at the wrong step. The helpers below make the pipeline (a) retry the
# transient failures we actually see in production logs (Open-Meteo read
# timeouts, GEE 429/5xx) and (b) log every failure with its cause so the next
# red run names the real culprit in the "Execute pipeline" step itself.
# ==============================================================================

RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_S = 5.0

def _is_retryable(exc):
    """Retry transient transport/quota errors; permanent ones fail fast."""
    msg = str(exc).lower()
    transient_markers = (
        '429', 'too many requests', 'rate limit', 'quota',
        '500', '502', '503', '504', 'internalerror', 'unavailable',
        'timeout', 'timed out', 'connection reset', 'connection refused',
        'temporarily unavailable', 'overloaded', 'deadline',
    )
    return any(marker in msg for marker in transient_markers)

def retry_call(fn, *, what, attempts=RETRY_ATTEMPTS, base_delay=RETRY_BASE_DELAY_S):
    """Run fn(), retrying transient failures with exponential backoff.

    Raises the last exception after `attempts` tries; the caller decides
    whether that failure is fatal for its district/step.
    """
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            if attempt >= attempts or not _is_retryable(exc):
                raise
            delay = base_delay * (2 ** (attempt - 1))
            print(f"   ⚠️ {what} failed (attempt {attempt}/{attempts}): {type(exc).__name__}: {exc} — retrying in {delay:.0f}s")
            time.sleep(delay)
    # Unreachable, but keeps the contract explicit.
    raise RuntimeError(f"{what} exhausted retries")

def _openmeteo_provenance(url, params, payload, fields_defaulted=()):
    """Fingerprint one Open-Meteo request for the scene manifest.

    Two things make a prediction reproducible: the exact question that was asked
    (`url` + `params`, hashed canonically) and the exact bytes that came back
    (canonical-JSON digest of the parsed response). Either changing moves the
    unit's `dataset_version`.

    `fields_defaulted` lists the fields the aggregator had to fill from its
    hard-coded defaults because the response omitted them — the same class of
    problem as the fabricated soil channels, so it is recorded rather than
    absorbed into a plausible-looking number.
    """
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode('utf-8')
    ).hexdigest()
    return {
        'url': url,
        'params': {str(key): params[key] for key in sorted(params)},
        'payload_sha256': digest,
        'fields_defaulted': sorted(fields_defaulted),
        'retrieved_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }


def observed_series(values) -> list:
    """The finite values of a daily array, in order, with gaps left out.

    `scripts/physics_severity.py` derives the mean daily ET, the mean daily wind and the two
    exceedance counts from these series. A missing day is therefore dropped rather than
    substituted: a zero-filled temperature gap would read as a day below 16 °C, and a
    zero-filled ET gap would pull the drying term down — both are the 2026-09 defect class
    (a value that is not the quantity the formula describes) wearing a different hat.
    """
    array = np.asarray(values, dtype=float).ravel()
    return [float(value) for value in array if np.isfinite(value)]


def get_openmeteo_forecast(lat, lon, horizon_days):
    """Fetch an Open-Meteo forecast and aggregate to the scalar daily
    summaries the downstream 15-channel tensor + physics-severity formulas
    consume.

    Unit contract (matches what the model was trained on and what the
    om_calc_* thresholds expect):
      * Temperatures -> K  (physics-formula code converts to °C locally)
      * Precipitation, ET0 -> m  (formulas convert to mm locally)
      * Shortwave radiation -> J/m² (sum over horizon)
      * Wind speed -> km/h  (om_calc_* use km/h thresholds: 50 km/h storm, etc.)

    Corrections vs. the original Kaggle notebook:
      1. `dew_point_2m_mean` is NOT a valid daily parameter, so we request
         hourly dew_point_2m and compute the daily mean ourselves. Without
         this, the HTTP call 200s but returns None for dewpoint and the
         script silently falls back to NaN defaults.
      2. `et0_fao_evapotranspiration_sum` is wrong (correct daily param is
         `et0_fao_evapotranspiration`).
      3. Default `temperature_unit=celsius` (Kaggle relied on this default
         but then the default-value branch returned 295 K while the API
         branch returned ~25 °C -> ~12 σ mismatch for the model). We now
         convert API temps to Kelvin explicitly.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": (
            "temperature_2m_mean,temperature_2m_max,temperature_2m_min,"
            "precipitation_sum,"
            "shortwave_radiation_sum,"
            "wind_speed_10m_max,wind_gusts_10m_max,"
            "et0_fao_evapotranspiration"
        ),
        "hourly": "dew_point_2m",
        "timezone": "Asia/Dhaka",
        # Use defaults (wind=km/h, temp=°C, precip=mm) so physics thresholds
        # (50 km/h storm, 30 °C heat wave, etc.) behave identically to
        # training.
        "forecast_days": min(horizon_days + 1, 16),
    }
    try:
        # Retried with backoff: the 2026-09-16 production run lost ~27/64
        # districts to single 15s Open-Meteo read timeouts — a transient
        # failure mode that a retry absorbs. raise_for_status() is inside the
        # retried closure so HTTP 429/5xx responses are retried too.
        def _fetch():
            r = requests.get(url, params=params, timeout=30)
            r.raise_for_status()
            return r
        resp = retry_call(_fetch, what=f"Open-Meteo fetch for ({lat}, {lon})")
        payload = resp.json()
        daily = payload.get('daily', {})
        hourly = payload.get('hourly', {})

        fields_defaulted = []

        def safe_daily(key, default_val):
            arr = daily.get(key)
            if arr is None or len(arr) == 0:
                # The response did not carry this field; the value below is a
                # hard-coded default, not an observation. Recorded so the scene
                # manifest can say so instead of presenting it as data.
                fields_defaulted.append(key)
                arr = [default_val]
            return np.array([float(x) if x is not None else np.nan for x in arr])

        # --- Dew point: daily API doesn't expose it, aggregate from hourly.
        dew_hourly = np.array(
            [float(x) if x is not None else np.nan
             for x in (hourly.get('dew_point_2m') or [])]
        )
        hours_per_day = 24
        n_days = horizon_days + 1
        if dew_hourly.size >= hours_per_day * n_days:
            dew_daily = np.array([
                np.nanmean(dew_hourly[i*hours_per_day:(i+1)*hours_per_day])
                for i in range(n_days)
            ])
        else:
            dew_daily = np.full(n_days, np.nan)

        # --- Raw Open-Meteo daily arrays in native units (°C, mm, km/h, MJ/m²).
        temp_mean_c = safe_daily('temperature_2m_mean', 22.0)
        temp_max_c  = safe_daily('temperature_2m_max',  27.0)
        temp_min_c  = safe_daily('temperature_2m_min',  17.0)
        precip_mm   = safe_daily('precipitation_sum',   0.0)
        wind_max_kmh = safe_daily('wind_speed_10m_max', 0.0)    # km/h
        gust_max_kmh = safe_daily('wind_gusts_10m_max', 0.0)   # km/h
        swr_sum_mj   = safe_daily('shortwave_radiation_sum', 5.0)  # MJ/m²
        et_mm        = safe_daily('et0_fao_evapotranspiration', 0.0)  # mm
        dew_c        = dew_daily

        return {
            # Outputs in the units the model's normalization stats expect.
            'Temp_2m':   float(np.nanmean(temp_mean_c)) + 273.15,   # K
            'Max_Temp':  float(np.nanmax(temp_max_c))  + 273.15,
            'Min_Temp':  float(np.nanmin(temp_min_c))  + 273.15,
            'Dewpoint':  float(np.nanmean(dew_c))       + 273.15,
            'Precip':    float(np.nansum(precip_mm)) / 1000.0,     # m
            'Solar_Rad': float(np.nansum(swr_sum_mj)) * 1.0e6,     # J/m²
            'Wind_Max':  float(np.nanmax(wind_max_kmh)),            # km/h
            'Gust_Max':  float(np.nanmax(gust_max_kmh)),            # km/h
            'ET_Sum':    float(np.nansum(et_mm)) / 1000.0,         # m
            # ── horizon-shape drivers for the physics track ──────────────
            # `Precip` is the horizon total; a flood intensity term needs the
            # wettest 24 h inside it and the length of the horizon, otherwise
            # `om_calc_flood` receives the same quantity twice (the defect fixed
            # on 2026-09-17). Both are derived from the same daily series, so
            # they stay consistent with the total.
            'Precip_Peak_24h_mm': float(np.nanmax(np.nan_to_num(precip_mm, nan=0.0))),
            # ── daily series for the physics track (defect fixed 2026-09-18) ─────
            # The fire drying/persistence terms are written for *daily* quantities
            # (their own defaults are 3 mm ET, 1 day, 10 km/h), and the hindcast
            # measured what happens when a horizon total or a horizon length is
            # passed instead: every one of those terms sat at its ceiling on every
            # row of every episode, and `Fire` — a class that is high everywhere —
            # became the physics track's top pick on 127 of 128 windows of a
            # landfalling cyclone. The fix is not a better scalar: it is to stop
            # aggregating here at all. `scripts/physics_severity.py` takes these
            # series and computes the mean daily ET, the mean daily wind and the
            # two exceedance counts itself, so this caller cannot pass the wrong
            # aggregate — it is not the one aggregating.
            '_daily_for_physics': {
                # `observed_series`, not `nan_to_num`: a missing day must be *absent* from the
                # series, never a zero. Zero-filling temperature would count every gap as a day
                # below 16 °C (the cold-wave exceedance term) and drag the mean daily ET toward
                # zero — i.e. it would reintroduce the same class of defect in a new place.
                'daily_temp_max_c': observed_series(temp_max_c),
                'daily_temp_min_c': observed_series(temp_min_c),
                'daily_et0_mm':     observed_series(et_mm),
                'daily_wind_max_kmh': observed_series(wind_max_kmh),
            },
            # ── lineage for the scene manifest (not a model input) ───────
            '_provenance': _openmeteo_provenance(url, params, payload, fields_defaulted),
        }
    except requests.exceptions.RequestException as e:
        print(f"Open-Meteo HTTP Error for ({lat}, {lon}): {e}")
        return None
    except Exception as e:
        print(f"Open-Meteo Processing Error for ({lat}, {lon}): {e}")
        return None

# ==============================================================================
# 6. HYBRID COGNITIVE: PHYSICAL INDEX FORMULAS
# ==============================================================================

# ==============================================================================
# 7. MODEL INFERENCE SETUP
# ==============================================================================
print("\\nLoading TFLite Model and Normalization Stats...")
with open(STATS_PATH, 'r') as f:
    NORM_STATS = json.load(f)

# Use optimized TFLite runtime instead of full TF
interpreter = tflite.Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=-1, keepdims=True)

def run_inference(tensor):
    interpreter.set_tensor(input_details[0]['index'], tensor)
    interpreter.invoke()
    
    # Extract robustly
    hazard_logits, severity_score = None, None
    for out in output_details:
        shape = out['shape']
        if len(shape) == 2 and shape[1] == 8:
            hazard_logits = interpreter.get_tensor(out['index'])[0]
        elif len(shape) <= 2:
            severity_score = interpreter.get_tensor(out['index'])[0]
    
    probs = softmax(hazard_logits)
    pred_class = int(np.argmax(probs))
    confidence = float(probs[pred_class])

    # Return the class ORDINAL (0..7 per Models/labels.json), not a name: the
    # caller maps it through the fixed class order and validates the range. The
    # shipped pipeline wrote this ordinal straight into `hazard_type`, which is
    # why the committed snapshot contains integer hazard labels.
    return pred_class, confidence, float(severity_score)

# ==============================================================================
# 8. OPTIMIZED MAIN EXECUTION LOOP
# ==============================================================================
def fetch_historical_steps(lat, lon, norm_stats):
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()
    historical_steps = []
    
    for t in range(9, 0, -1): 
        end_date = today - timedelta(days=(t-1)*10)
        start_date = end_date - timedelta(days=10)
        combined_img = get_temporal_15ch_stack(region, start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
        if combined_img:
            try:
                # Retried per-request: absorbs GEE 429/5xx/timeout blips that
                # used to kill a whole district on the first failure.
                historical_steps.append(retry_call(
                    lambda: get_ee_image_as_numpy(combined_img, region, scale=10),
                    what=f"GEE historical download (step t={t})",
                ))
            except Exception as e:
                # 2026-09-17: this used to `return None` with zero logging, so
                # a full GEE outage produced a silent 0-row CSV and a
                # confusing failure two steps later. Now the cause is in the log.
                print(f"   ❌ GEE historical fetch failed: {type(e).__name__}: {e}")
                return None
        else:
            return None
    return historical_steps

def build_t0_and_infer(dist, historical_steps, horizon_days, norm_stats):
    lat, lon = dist['lat'], dist['lon']
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()

    om_data = get_openmeteo_forecast(lat, lon, horizon_days)
    if not om_data: return None, None

    t0_start = (today - timedelta(days=10)).strftime('%Y-%m-%d')
    t0_end = today.strftime('%Y-%m-%d')

    t0_combined_img = get_temporal_15ch_stack(region, t0_start, t0_end)
    if t0_combined_img:
        try:
            # Retried per-request: absorbs GEE 429/5xx/timeout blips that
            # used to zero out a whole district on the first failure.
            t0_np = retry_call(
                lambda: get_ee_image_as_numpy(t0_combined_img, region, scale=10),
                what=f"GEE T0 download for {dist.get('name', '?')}",
            )
            # Replace ERA5-Land weather bands 6..15 (0-indexed) with Open-Meteo
            # forecast values for the T0 step. Bands 0..5 (SAR+optical) come
            # straight from Earth Engine. The Soil_W1/W3/T1 placeholders match
            # the trained model's normalization means (~0.32, ~0.32, ~300 K).
            om_bands = [
                om_data['Temp_2m'], om_data['Precip'],
                om_data['Max_Temp'], om_data['Min_Temp'],
                soil_w1, soil_w3, soil_t1,
                om_data['Dewpoint'], om_data['Solar_Rad'],
            ]
            t0_np[6:15, :, :] = np.array(om_bands, dtype=np.float32).reshape(9, 1, 1)

            # After stacking: [T=10, C=15, H=64, W=64]
            full_tensor = np.stack(historical_steps + [t0_np], axis=0).astype(np.float32)

            # Per-channel z-score normalization.
            normalized = np.empty_like(full_tensor, dtype=np.float32)
            for c, band in enumerate(BAND_NAMES):
                if 'means' in norm_stats and band in norm_stats['means']:
                    mean = float(norm_stats['means'][band])
                    std = float(norm_stats['stds'][band])
                elif band in norm_stats and isinstance(norm_stats[band], dict):
                    mean = float(norm_stats[band]['mean'])
                    std = float(norm_stats[band]['std'])
                else:
                    raise KeyError(f"Band '{band}' missing from normalization stats")
                std = max(std, 1e-6)
                normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std

            # Model expects [B, T, H, W, C] = [1, 10, 64, 64, 15] (channels-last 3D CNN).
            tflite_input = np.transpose(normalized, (0, 2, 3, 1))  # T,C,H,W -> T,H,W,C
            tflite_input = np.expand_dims(tflite_input, axis=0)     # add batch dim

            # Shape sanity check (fail loud rather than silently feeding garbage).
            expected = tuple(input_details[0]['shape'].tolist())
            actual = tuple(tflite_input.shape)
            if actual != expected:
                print(f"Shape mismatch: got {actual}, model expects {expected}")
                return None, None

            return tflite_input.astype(np.float32), om_data
        except Exception as e:
            import traceback
            print(f"Error creating tensor for {dist.get('name','?')}: {e}")
            traceback.print_exc()
            return None, None
    return None, None

SCENE_MANIFEST_PATH = os.environ.get(
    'HAZARDNET_SCENE_MANIFEST_PATH', 'hazardnet_scene_manifest.json'
)
#: The collections the 15-channel historical stack is built from
#: (`get_temporal_15ch_stack`). Recorded per step so the manifest names its
#: sources rather than saying only "Earth Engine".
STACK_COLLECTIONS = (
    'COPERNICUS/S1_GRD',
    'COPERNICUS/S2_SR_HARMONIZED',
    'LANDSAT/LC08/C02/T1_L2',
    'ECMWF/ERA5_LAND/DAILY_AGGR',
)


def _tensor_digest(tensor):
    """sha256 of a tensor's bytes — how "the inputs changed" becomes observable.

    Digesting the float32 buffer rather than a summary statistic means a single
    changed pixel moves the `dataset_version`; NaN bit patterns are stable, so an
    unchanged composite always hashes the same.
    """
    if tensor is None:
        return None
    return hashlib.sha256(np.asarray(tensor, dtype='float32').tobytes()).hexdigest()


def build_scene_unit(dist, horizon_name, historical_steps, t0_tensor, om_data, prediction_date):
    """Lineage for one (district, horizon) prediction unit.

    Steps 0..8 are the nine decadal composites the model's history carries;
    step 9 is the t0 block the forecast input is built from. The t0 window is the
    same ten days as step 8 — `build_t0_and_infer` re-fetches it for the forecast
    input rather than reusing the historical array — which is why the two steps
    can differ and why both are hashed.
    """
    windows = ten_day_windows(prediction_date)
    steps = []
    for index, tensor in enumerate(historical_steps):
        window = windows[index] if index < len(windows) else (None, None)
        steps.append(scene_step_record(
            step=index, window_start=window[0], window_end=window[1],
            collections=STACK_COLLECTIONS, tensor_digest=_tensor_digest(tensor),
            shape=np.asarray(tensor).shape, scale_m=10,
        ))
    t0_window = windows[-1] if windows else (None, None)
    steps.append(scene_step_record(
        step=len(steps), window_start=t0_window[0], window_end=t0_window[1],
        collections=STACK_COLLECTIONS, tensor_digest=_tensor_digest(t0_tensor),
        shape=np.asarray(t0_tensor).shape, scale_m=10,
    ))

    provenance = (om_data or {}).get('_provenance') or {}
    driver = None
    if provenance.get('payload_sha256'):
        driver = scene_driver_record(
            source='open-meteo', url=provenance['url'], params=provenance['params'],
            payload_sha256=provenance['payload_sha256'], retrieved_at=provenance.get('retrieved_at'),
        )
    return scene_unit_record(
        district_id=dist['id'], district_name=dist['name'], horizon=horizon_name,
        steps=steps, driver=driver,
        # Earth Engine composites do not hand back per-scene ids without one extra
        # round trip per collection per district. Until that cost is paid, the
        # manifest says `false` and still carries the tensor digests — enough to
        # detect that the inputs changed, not enough to name the scene. Recorded
        # rather than implied (see scripts/etl/scene_manifest.py).
        enumerated=False,
        extra={
            't0_step_index': len(steps) - 1,
            'fields_defaulted': provenance.get('fields_defaulted', []),
            'driver_recorded': driver is not None,
        },
    )


results = []
scene_units = []
scene_units_error = None
print(f"\\nStarting Optimized HazardNet Forecast Pipeline...")

# ── provenance for this run (PRODUCT_SPEC §5.8 / §3.1) ───────────────────────
# Every emitted row must be traceable to the artifacts and code that produced
# it, otherwise a forecast cannot be reproduced from its own record.
PIPELINE_VERSION = 'auto_forecast/2.0.0'
RUN_ID = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
prediction_date = datetime.now().strftime('%Y-%m-%d')


def _artifact_digest(path):
    """sha256 of a model artifact, or None when it is not present."""
    try:
        with open(path, 'rb') as handle:
            return hashlib.sha256(handle.read()).hexdigest()
    except OSError:
        return None


MODEL_SHA256 = _artifact_digest(MODEL_PATH)
MODEL_VERSION = None
MODEL_ARTIFACT_MISMATCH = None
try:
    with open(os.path.join(os.path.dirname(MODEL_PATH) or '.', 'VERSION.json'), 'r') as handle:
        _manifest = json.load(handle)
    MODEL_VERSION = _manifest.get('version')
    # Integrity check: the model bundle records each artifact's sha256, so a
    # swapped or truncated model can be detected here rather than in a forecast
    # that silently stops matching its own version string.
    for artifact in _manifest.get('artifacts', []):
        if artifact.get('name') == os.path.basename(MODEL_PATH):
            recorded = artifact.get('sha256')
            if recorded and MODEL_SHA256 and recorded != MODEL_SHA256:
                MODEL_ARTIFACT_MISMATCH = (
                    f"{MODEL_PATH} sha256 {MODEL_SHA256[:16]}… does not match "
                    f"Models/VERSION.json ({recorded[:16]}…)"
                )
except (OSError, ValueError):
    pass
# Falls back to the artifact digest so a row is never traceable to nothing.
TENSOR_BUILD_ID = MODEL_SHA256[:16] if MODEL_SHA256 else None
if MODEL_ARTIFACT_MISMATCH:
    raise SystemExit(
        f"CRITICAL: {MODEL_ARTIFACT_MISMATCH}. Refusing to run: every row this run emits "
        "would be stamped with a version that does not describe the weights that produced it."
    )

# ── soil channels: fabricate-and-label, or refuse ────────────────────────────
# The model takes 15 channels; three of them (Soil_W1/W3/T1) are ERA5-Land soil
# variables that the live path does not currently fetch, so the shipped pipeline
# passed their *training means* (0.32, 0.32, 299.0) — zero information that the
# model cannot distinguish from a real measurement (MODEL_CARD §6.3).
#
# Default `mean` keeps the pipeline running and stamps every row with
# `soil_channels_fabricated=true` so the defect is visible in the data instead of
# hidden in a literal. Set HAZARDNET_SOIL_MODE=forbid to make fabricated soil
# channels a hard failure — use it once real soil drivers are wired in, and in any
# run whose output will be used for evaluation.
SOIL_MODE = os.environ.get('HAZARDNET_SOIL_MODE', 'mean').strip().lower()
SOIL_MEAN_DEFAULTS = (0.32, 0.32, 299.0)
if SOIL_MODE == 'forbid':
    raise SystemExit(
        "HAZARDNET_SOIL_MODE=forbid is set, but this pipeline does not yet fetch "
        "ERA5-Land soil moisture/temperature for the live timestep. Wire those bands "
        "in (see docs/PRODUCT_SPEC.md §5.6) before using forbid mode."
    )
if SOIL_MODE not in ('mean',):
    raise SystemExit(f"Unknown HAZARDNET_SOIL_MODE={SOIL_MODE!r} (expected 'mean' or 'forbid')")
soil_w1, soil_w3, soil_t1 = SOIL_MEAN_DEFAULTS
SOIL_FABRICATED = True
print(f"[config] soil channels: mode={SOIL_MODE} -> values {SOIL_MEAN_DEFAULTS} "
      f"(fabricated=true; HAZARDNET_SOIL_MODE=forbid makes this fatal)")

# ── coverage accounting (PRODUCT_SPEC §5.1) ──────────────────────────────────
# The shipped pipeline skipped a district silently whenever an Earth Engine fetch
# failed (`if not historical_steps: continue`), so 25/64 and 49/64-district runs
# looked exactly like complete ones on the website. Every requested
# (district, horizon) is now accounted for, and manifest.json carries the tally.
requested_units = len(DISTRICTS) * len(HORIZONS)
# ── pass-level retry + fail-fast guard (2026-09-17 incident) ────────────────
# A pass that yields ZERO rows means an upstream outage (GEE downloads or
# Open-Meteo), not "no hazards today" — every district needs both sources to
# emit a row. Retry the whole sweep once after a cool-down; if it is still
# empty, exit non-zero HERE so the workflow's "Execute pipeline" step shows
# the real failure instead of publish_forecast_csv.py's downstream
# "CSV contains zero rows" sanity-check error.
PASS_RETRY_WAIT_S = 5 * 60
for pass_num in (1, 2):
    # Per-pass state: the coverage tally and lineage capture describe the pass
    # whose rows ship — never a blend of two passes.
    results = []
    scene_units = []
    scene_units_error = None
    coverage = {
        'requested_units': requested_units,
        'requested_districts': len(DISTRICTS),
        'requested_horizons': list(HORIZONS.keys()),
        'horizons': list(HORIZONS.keys()),
        'produced_units': 0,
        'districts_with_any_horizon': 0,
        'per_horizon': {name: {'requested': len(DISTRICTS), 'produced': 0} for name in HORIZONS},
        'skipped': [],
        'started_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }

    for dist in DISTRICTS: # Full pipeline now
        print(f"Processing {dist['name']}...")
        historical_steps = fetch_historical_steps(dist['lat'], dist['lon'], NORM_STATS)
        if not historical_steps:
            # Not silent any more: the district is recorded with a reason and the
            # run is reported as partial rather than successful.
            print(f"  [SKIP] {dist['name']}: no historical tensor (Earth Engine fetch empty/failed)")
            coverage['skipped'].append({
                'district_id': dist['id'], 'district_name': dist['name'],
                'horizon': '*', 'reason': 'no_historical_steps',
            })
            continue

        for horizon_name, days in HORIZONS.items():
            tensor, om_data = build_t0_and_infer(dist, historical_steps, days, NORM_STATS)
            if tensor is not None and om_data is not None:
                model_class_index, conf, severity = run_inference(tensor)

                # Convert once, reuse for both physics and CSV output. The
                # Open-Meteo scalars are aggregated over the whole horizon in the
                # units documented on get_openmeteo_forecast (K, m, J/m², km/h).
                temp_mean_c     = om_data['Temp_2m']  - 273.15
                temp_max_c      = om_data['Max_Temp'] - 273.15
                temp_min_c      = om_data['Min_Temp'] - 273.15
                dew_c           = om_data['Dewpoint'] - 273.15
                precip_total_mm = om_data['Precip'] * 1000.0    # horizon total (mm)
                et_total_mm     = om_data['ET_Sum'] * 1000.0    # horizon total (mm)
                solar_total_kj  = om_data['Solar_Rad'] / 1000.0 # horizon total (kJ/m²)
                wind_max_kmh    = om_data['Wind_Max']           # km/h (default Open-Meteo unit)

                # The classification head returns a class INDEX into the fixed
                # order (Models/labels.json). Writing it straight into
                # `hazard_type` is what put integers in the hazard column of the
                # shipped snapshot; map it to the name and fail loudly if the model
                # ever returns something outside the eight classes.
                if not isinstance(model_class_ordinal, (int, np.integer)) or not (
                    0 <= int(model_class_ordinal) < len(HAZARD_CLASSES)
                ):
                    print(f"  [SKIP] {dist['name']} {horizon_name}: model returned class "
                          f"{model_class_ordinal!r}, outside 0..{len(HAZARD_CLASSES) - 1}")
                    coverage['skipped'].append({
                        'district_id': dist['id'], 'district_name': dist['name'],
                        'horizon': horizon_name, 'reason': f'invalid_class_ordinal:{model_class_ordinal!r}',
                    })
                    continue
                hazard = HAZARD_CLASSES[int(model_class_ordinal)]

                # Independent physics track: all eight classes are scored from the
                # meteorological drivers alone, with no reference to what the model
                # predicted (PRODUCT_SPEC §5.4). `physics_severity` keeps its old
                # meaning — the physics score for the class the model chose — so
                # existing consumers keep working, while the new columns expose a
                # hazard the model may have missed.
                physics_drivers = {
                    'temp_max_c': temp_max_c,
                    'temp_min_c': temp_min_c,
                    'precip_total_mm': precip_total_mm,
                    'precip_peak_mm': om_data.get('Precip_Peak_24h_mm'),
                    # Gust, not the sustained maximum: the unit is a district centroid, and
                    # the hindcast measured the sustained field at 19-69 km/h on Amphan's
                    # landfall day where the same archive's gust field reached 51-134 km/h.
                    'wind_gust_kmh': om_data.get('Gust_Max'),
                    # The daily series: `resolve_drivers` turns these into the daily-mean ET,
                    # the daily-mean wind and the two exceedance counts the formulas describe.
                    **(om_data.get('_daily_for_physics') or {}),
                    # Kept so the row records what the horizon accumulated. The module reads it
                    # only when no daily ET series was supplied.
                    'et_total_mm': et_total_mm,
                }
                physics_scores = compute_physics_scores(physics_drivers, days)
                physics = physics_summary(physics_scores, hazard, severity)
                physics_severity = physics['physics_severity']
                if physics_severity is None:  # cannot happen: hazard is validated above
                    physics_severity = physics_scores[hazard]
                missing = missing_drivers(physics_drivers)

                # Scene lineage for this unit. Built from the same tensors and the
                # same Open-Meteo payload the prediction used, so `dataset_version`
                # identifies the actual inputs (PRODUCT_SPEC §5.8). The row is stamped
                # after the manifest is assembled, below.
                try:
                    scene_units.append(build_scene_unit(
                        dist, horizon_name, historical_steps, tensor, om_data, prediction_date,
                    ))
                except Exception as exc:  # noqa: BLE001 - lineage failure must not lose the forecast
                    # The forecast is still emitted (it is the product); the run report
                    # records that this unit has no usable lineage, and the publisher
                    # refuses to ship a run whose lineage failed.
                    scene_units_error = scene_units_error or f"{dist['name']}/{horizon_name}: {exc}"
                    print(f"  [LINEAGE] {dist['name']} {horizon_name}: {exc}")

                target_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')

                # Emit BOTH canonical field names (in the documented ingest
                # units: °C, mm/day, km/h, MJ/m²/day) AND the legacy `om_*`
                # columns that the ingest parser maps for back-compat. The
                # legacy aliases are populated with values that match what the
                # ingest layer expects them to mean (NOT their misleading
                # suffixes — see backend/utils/forecastRow.js).
                horizon_days = days

                results.append({
                    'district_id': dist['id'], 'district_name': dist['name'],
                    'division': dist['division'], 'pcode': dist['pcode'],
                    'horizon': horizon_name, 'hazard_type': hazard,
                    'model_severity': round(severity, 4),
                    'physics_severity': round(physics_severity, 4),
                    'confidence': round(conf, 4),
                    'target_date': target_date,
                    'prediction_date': prediction_date,
                    'data_source': 'Hybrid_Cognitive_Forecast',
                    # ── provenance (PRODUCT_SPEC §5.8 / §3.1) ────────────────────
                    'model_version': MODEL_VERSION,
                    'tensor_build_id': TENSOR_BUILD_ID,
                    'pipeline_version': PIPELINE_VERSION,
                    'run_id': RUN_ID,
                    # The stored confidence is the model's own softmax for its top
                    # class — uncalibrated, and not a model/physics agreement score.
                    # Naming it means no consumer has to guess (PRODUCT_SPEC §3).
                    'confidence_kind': 'model_softmax_top_class',
                    # ── independent physics track, all eight classes ─────────────
                    'physics_top_hazard': physics['physics_top_hazard'],
                    'physics_top_severity': physics['physics_top_severity'],
                    'physics_agreement': bool(physics['physics_agreement']),
                    'track_divergence': physics.get('track_divergence'),
                    'physics_inputs_missing': '|'.join(missing),
                    # ── lineage (filled in from the scene manifest, below) ───────
                    'dataset_version': None,
                    'soil_channels_fabricated': SOIL_FABRICATED,
                    **physics_columns(physics_scores),
                    # Canonical per-day meteorological fields (forecastRow.js
                    # METEOROLOGICAL_FIELDS, in the documented units).
                    'temperature_mean':      round(temp_mean_c, 4),   # °C
                    'temperature_max':       round(temp_max_c, 4),    # °C
                    'temperature_min':       round(temp_min_c, 4),    # °C
                    'precipitation_mm':      round(precip_total_mm / horizon_days, 4),  # mm/day
                    'wind_max_kmh':          round(wind_max_kmh, 4),  # km/h
                    'dewpoint_mean':         round(dew_c, 4),         # °C
                    'solar_radiation_mj_m2': round(solar_total_kj / horizon_days / 1000.0, 4),  # MJ/m²/day
                    'evapotranspiration_mm': round(et_total_mm / horizon_days, 4),        # mm/day
                    # Legacy columns kept for any downstream consumers that still
                    # scrape the old names. Suffixes reflect what ingest expects
                    # them to contain (see forecastRow.js).
                    'om_temp_2m_k':    round(temp_mean_c, 4),   # °C (despite _k suffix)
                    'om_max_temp_k':   round(temp_max_c, 4),    # °C
                    'om_min_temp_k':   round(temp_min_c, 4),    # °C
                    'om_dewpoint_k':   round(dew_c, 4),         # °C
                    'om_precip_m':     round(precip_total_mm / 1000.0, 6),   # m total
                    'om_wind_max_ms':  round(wind_max_kmh / 3.6, 4),        # m/s (so ×3.6 = km/h)
                    'om_solar_rad_j':  round(solar_total_kj, 4),            # kJ/m² total
                    'om_et_sum_m':     round(et_total_mm, 4),               # mm total (despite _m suffix)
                })

        # Light rate-limit between districts to be polite to EE + Open-Meteo.
        time.sleep(0.2)

    if results:
        break
    print(f"❌ Pass {pass_num}/2 produced 0 rows — every district failed (see errors above).")
    if pass_num == 1:
        print(f"   Waiting {PASS_RETRY_WAIT_S // 60} minutes before a full retry pass…")
        time.sleep(PASS_RETRY_WAIT_S)

if not results:
    print("CRITICAL ERROR: forecast pipeline produced 0 rows across both passes — every district failed.")
    print("   The committed snapshot stays untouched and this step fails so the cause")
    print("   is visible here (GEE availability / Open-Meteo availability / credentials).")
    print("   Do NOT rerun publish/validate/commit steps off an empty CSV.")
    sys.exit(1)

# ── scene manifest → dataset_version (PRODUCT_SPEC §5.8) ────────────────────
# Every prediction unit gets a content hash over the inputs that produced it: the
# decadal windows, the contributing collections, the digest of each tensor in the
# stack (including the t0 input) and the Open-Meteo request/response fingerprint.
# Rerunning a day reproduces the version; a new satellite scene, a changed
# forecast window or a revised upstream response moves it. Recorded by the scene
# manifest and stamped on each row so a consumer can tell one from the other.
scene_manifest_info = {
    'path': None, 'units': 0, 'rows_stamped': 0,
    'dataset_version': None, 'sha256': None, 'error': scene_units_error,
}
if scene_units:
    try:
        scene_manifest = build_scene_manifest(
            prediction_date=prediction_date,
            pipeline_version=PIPELINE_VERSION,
            model_version=MODEL_VERSION,
            units=scene_units,
            run_id=RUN_ID,
        )
        scene_manifest_info['sha256'] = write_scene_manifest(scene_manifest, SCENE_MANIFEST_PATH)
        lookup = scene_unit_lookup(scene_manifest)
        stamped = 0
        for row in results:
            version = lookup.get((str(row.get('district_id')), row.get('horizon')))
            if version:
                row['dataset_version'] = version
                stamped += 1
        scene_manifest_info.update({
            'path': SCENE_MANIFEST_PATH,
            'units': len(scene_manifest['units']),
            'rows_stamped': stamped,
            'dataset_version': scene_manifest['dataset_version'],
            'scenes_enumerated': scene_manifest['scenes_enumerated'],
            'units_with_defaulted_drivers': sum(
                1 for unit in scene_manifest['units']
                if (unit.get('extra') or {}).get('fields_defaulted')
            ),
        })
        print(f"Scene manifest: {SCENE_MANIFEST_PATH} — {len(scene_manifest['units'])} units, "
              f"dataset_version={scene_manifest['dataset_version']}, rows stamped={stamped}")
    except Exception as exc:  # noqa: BLE001 - reported, and publishing is refused below
        scene_manifest_info['error'] = f'{type(exc).__name__}: {exc}'
        print(f"::warning::scene manifest could not be written ({exc}); rows carry no dataset_version")
elif not scene_units_error:
    scene_manifest_info['error'] = 'no prediction units produced a lineage record'

if scene_manifest_info['error'] and scene_manifest_info['rows_stamped'] < len(results):
    print(f"::warning::scene lineage incomplete: {scene_manifest_info['error']} — "
          f"{len(results) - scene_manifest_info['rows_stamped']} row(s) have no dataset_version")

# ── coverage tally + run report (PRODUCT_SPEC §5.1 / TARGET_ARCHITECTURE §3.3) ─
df_results = pd.DataFrame(results)
df_results.to_csv(OUTPUT_CSV, index=False)

coverage['produced_units'] = int(len(df_results))
coverage['districts_with_any_horizon'] = (
    int(df_results['district_name'].nunique()) if len(df_results) else 0
)
for horizon_name in HORIZONS:
    coverage['per_horizon'][horizon_name]['produced'] = (
        int((df_results['horizon'] == horizon_name).sum()) if len(df_results) else 0
    )
# Districts with no row at all — the frozen coverage-stamp contract
# (TARGET_ARCHITECTURE §3.2) names this explicitly, and it is the list the site
# must label as "no current forecast" rather than filling with baseline numbers.
produced_ids = {int(r['district_id']) for r in results if r.get('district_id') is not None}
coverage['missing_district_ids'] = sorted(
    int(dist['id']) for dist in DISTRICTS if int(dist['id']) not in produced_ids
)
coverage['missing_district_names'] = sorted(
    dist['name'] for dist in DISTRICTS if int(dist['id']) not in produced_ids
)
coverage['finished_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
coverage['status'] = 'complete' if coverage['produced_units'] == requested_units else 'partial'

run_report = {
    'schema': 'hazardnet-run-report/v1',
    'run_id': RUN_ID,
    'pipeline_version': PIPELINE_VERSION,
    'model_version': MODEL_VERSION,
    'model_sha256': MODEL_SHA256,
    'started_at': coverage['started_at'],
    'finished_at': coverage['finished_at'],
    'prediction_date': prediction_date,
    'horizons': list(HORIZONS.keys()),
    'requested_units': requested_units,
    'produced_units': coverage['produced_units'],
    'status': coverage['status'],
    'coverage': coverage,
    'soil_channels_fabricated': SOIL_FABRICATED,
    'soil_mode': SOIL_MODE,
    # Scene lineage: where the manifest is, which run-level dataset_version it
    # carries, and whether every unit got one. A non-null `error` makes the
    # publisher refuse the run — a forecast that cannot name its inputs must not
    # ship (PRODUCT_SPEC §5.8).
    'scene_manifest': scene_manifest_info,
}

REPORT_PATH = os.environ.get('HAZARDNET_RUN_REPORT_PATH', 'hazardnet_run_report.json')
with open(REPORT_PATH, 'w') as handle:
    json.dump(run_report, handle, indent=2)

print(f"Pipeline complete. Created CSV with {len(df_results)} rows.")
print(f"Coverage: {coverage['produced_units']}/{requested_units} requested units "
      f"({coverage['districts_with_any_horizon']}/{len(DISTRICTS)} districts) — "
      f"status={coverage['status']}")
print(f"Run report: {REPORT_PATH} (run_id={RUN_ID})")
if coverage['status'] != 'complete':
    # Loud, but not fatal: a partial run is still publishable *when it is labelled
    # as partial*. The manifest and the run report carry the tally, and
    # scripts/publish_forecast_csv.py refuses to publish an unlabelled partial.
    print(f"::warning::Pipeline produced {coverage['produced_units']} of {requested_units} "
          f"requested units. The site will label the remaining districts as having no "
          f"current forecast — see coverage.skipped in {REPORT_PATH}.")

# ==============================================================================
# 9. PUSH TO LIVE PRODUCTION ENDPOINT
# ==============================================================================
API_URL = os.environ.get("HAZARDNET_API_URL")
AUTH_TOKEN = os.environ.get("HAZARDNET_API_KEY")

if not API_URL or not AUTH_TOKEN:
    print("WARNING: API URL or Auth Token is missing. Saved locally but not pushed.")

    sys.exit(0)

try:
    with open(OUTPUT_CSV, 'r') as f:
        csv_data = f.read()
except FileNotFoundError:
    print("CRITICAL ERROR: CSV not found.")

    sys.exit(1)

try:
    resp = requests.post(
        API_URL, 
        data=csv_data, 
        headers={'Authorization': f'Bearer {AUTH_TOKEN}', 'Content-Type': 'text/csv'},
        timeout=30
    )
    if resp.status_code == 200:
        print(f"SUCCESS: Successfully pushed forecasts to {API_URL}.")
    else:
        print(f"FAILED: API rejected the payload. HTTP {resp.status_code}: {resp.text}")
        sys.exit(1)
except requests.exceptions.RequestException as e:
    print(f"FAILED: Network error: {e}")

    sys.exit(1)
