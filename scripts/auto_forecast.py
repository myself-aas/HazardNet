import os
import io
import sys
import json
import time
import urllib.request
import numpy as np
import pandas as pd
import requests
from datetime import datetime, timedelta
import cv2  # Replaces PyTorch for bilinear interpolation
import tflite_runtime.interpreter as tflite # Replaces full TensorFlow

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
HAZARD_CLASSES = ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 
                  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone']

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
    response = urllib.request.urlopen(url)
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
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        daily = payload.get('daily', {})
        hourly = payload.get('hourly', {})

        def safe_daily(key, default_val):
            arr = daily.get(key)
            if arr is None or len(arr) == 0:
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
def safe_float(val, default=0.0):
    try:
        f = float(val)
        return default if np.isnan(f) else f
    except Exception:
        return default

def om_calc_severe_storm(precip_max, wind_max):
    p = safe_float(precip_max, 0.0) / 100.0
    w = max(safe_float(wind_max, 0.0) - 50.0, 0.0) / 100.0
    return float(np.clip(0.6 * w + 0.4 * min(p, 1.0), 0.0, 1.0))

def om_calc_cold_wave(temp_min, duration):
    return float(np.clip(0.7 * np.clip((16.0 - safe_float(temp_min, 16.0)) / 10.0, 0.0, 1.0) + 0.3 * np.clip(safe_float(duration, 1.0) / 5.0, 0.0, 1.0), 0.0, 1.0))

def om_calc_fire(temp_max, wind_max, et_sum):
    h = np.clip((safe_float(temp_max, 30.0) - 25.0) / 15.0, 0.0, 1.0)
    w = np.clip((safe_float(wind_max, 10.0) - 5.0) / 20.0, 0.0, 1.0)
    d = np.clip(safe_float(et_sum, 3.0) / 6.0, 0.0, 1.0)
    return float(np.clip(0.4 * h + 0.3 * w + 0.3 * d, 0.0, 1.0))

def om_calc_tropical_cyclone(wind_max, precip_sum):
    return float(np.clip(0.7 * min(max(safe_float(wind_max, 0.0) - 50.0, 0.0) / 150.0, 1.0) + 0.3 * min(safe_float(precip_sum, 0.0) / 300.0, 1.0), 0.0, 1.0))

def om_calc_drought(temp_max, precip_sum):
    t = np.clip((safe_float(temp_max, 25.0) - 25.0) / 20.0, 0.0, 1.0)
    p = np.clip((200.0 - safe_float(precip_sum, 200.0)) / 200.0, 0.0, 1.0)
    return float(np.clip(0.6 * t + 0.4 * p, 0.0, 1.0))

def om_calc_flood(precip_sum, precip_max):
    return float(np.clip(0.5 * np.clip(safe_float(precip_sum, 0.0) / 300.0, 0.0, 1.0) + 0.5 * np.clip(safe_float(precip_max, 0.0) / 100.0, 0.0, 1.0), 0.0, 1.0))

def om_calc_heat_wave(temp_max, duration):
    return float(np.clip(0.7 * np.clip((safe_float(temp_max, 30.0) - 30.0) / 15.0, 0.0, 1.0) + 0.3 * np.clip(safe_float(duration, 1.0) / 5.0, 0.0, 1.0), 0.0, 1.0))

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
    pred_class = np.argmax(probs)
    confidence = float(probs[pred_class])
    
    return HAZARD_CLASSES[pred_class], confidence, float(severity_score)

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
                historical_steps.append(get_ee_image_as_numpy(combined_img, region, scale=10))
            except Exception:
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
            t0_np = get_ee_image_as_numpy(t0_combined_img, region, scale=10)
            # Replace ERA5-Land weather bands 6..15 (0-indexed) with Open-Meteo
            # forecast values for the T0 step. Bands 0..5 (SAR+optical) come
            # straight from Earth Engine. The Soil_W1/W3/T1 placeholders match
            # the trained model's normalization means (~0.32, ~0.32, ~300 K).
            om_bands = [
                om_data['Temp_2m'], om_data['Precip'],
                om_data['Max_Temp'], om_data['Min_Temp'],
                0.32, 0.32, 299.0,   # Soil_W1, Soil_W3, Soil_T1 (fallback)
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

results = []
print(f"\\nStarting Optimized HazardNet Forecast Pipeline...")

for dist in DISTRICTS: # Full pipeline now
    print(f"Processing {dist['name']}...")
    historical_steps = fetch_historical_steps(dist['lat'], dist['lon'], NORM_STATS)
    if not historical_steps:
        continue

    for horizon_name, days in HORIZONS.items():
        tensor, om_data = build_t0_and_infer(dist, historical_steps, days, NORM_STATS)
        if tensor is not None and om_data is not None:
            hazard, conf, severity = run_inference(tensor)

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

            # Physics-severity formulas use °C, horizon-total mm, km/h, days.
            physics_severity = 0.50
            if hazard == 'Tropical Cyclone':
                physics_severity = om_calc_tropical_cyclone(wind_max_kmh, precip_total_mm)
            elif hazard == 'Severe Local Storm':
                physics_severity = om_calc_severe_storm(precip_total_mm, wind_max_kmh)
            elif hazard == 'Cold Wave':
                physics_severity = om_calc_cold_wave(temp_min_c, days)
            elif hazard == 'Fire':
                physics_severity = om_calc_fire(temp_max_c, wind_max_kmh, et_total_mm)
            elif hazard == 'Drought':
                physics_severity = om_calc_drought(temp_max_c, precip_total_mm)
            elif hazard in ('Flood', 'Flash Flood'):
                physics_severity = om_calc_flood(precip_total_mm, precip_total_mm)
            elif hazard == 'Heat Wave':
                physics_severity = om_calc_heat_wave(temp_max_c, days)

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
                'prediction_date': datetime.now().strftime('%Y-%m-%d'),
                'data_source': 'Hybrid_Cognitive_Forecast',
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

df_results = pd.DataFrame(results)
df_results.to_csv(OUTPUT_CSV, index=False)
print(f"Pipeline complete. Created CSV with {len(df_results)} rows.")

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
