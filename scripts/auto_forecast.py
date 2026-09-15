import os
import io
import json
import time
import urllib.request
import numpy as np
import pandas as pd
import requests
import geopandas as gpd
from datetime import datetime, timedelta
import cv2  # Replaces PyTorch for bilinear interpolation
import tflite_runtime.interpreter as tflite # Replaces full TensorFlow

# ==============================================================================
# 1. GEE AUTHENTICATION (Service Account)
# ==============================================================================
import ee

ee_credentials_json = os.environ.get("EE_SERVICE_ACCOUNT_JSON")
if not ee_credentials_json:
    print("CRITICAL ERROR: EE_SERVICE_ACCOUNT_JSON is missing from the environment.")
    import sys
    sys.exit(1)

with open("ee_creds.json", "w") as f:
    f.write(ee_credentials_json)

SERVICE_ACCOUNT = 'hazardnet-ee-service-kaggle@hazardnet-aas48424.iam.gserviceaccount.com'
try:
    credentials = ee.ServiceAccountCredentials(SERVICE_ACCOUNT, 'ee_creds.json')
    ee.Initialize(credentials)  
    print("OK: Google Earth Engine Initialized via Service Account")
except Exception as e:
    print(f"CRITICAL ERROR: GEE Initialization Failed: {e}")
    import sys
    sys.exit(1)

# ==============================================================================
# 2. CONFIGURATION & PATHS
# ==============================================================================
BAND_NAMES = [
    'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR', 
    'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp', 
    'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad'
]

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
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat, "longitude": lon,
        "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,"
                 "precipitation_sum,dew_point_2m_mean,shortwave_radiation_sum,"
                 "wind_speed_10m_max,et0_fao_evapotranspiration_sum",
        "timezone": "Asia/Dhaka",
        "forecast_days": min(horizon_days + 1, 16)
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        daily = resp.json().get('daily', {})
        
        def safe_array(key, default_val):
            arr = daily.get(key)
            if arr is None: arr = [default_val]
            return np.array([float(x) if x is not None else np.nan for x in arr])

        return {
            'Temp_2m': float(np.nanmean(safe_array('temperature_2m_mean', 295.0))),
            'Precip': float(np.nansum(safe_array('precipitation_sum', 0.0))) / 1000.0,
            'Max_Temp': float(np.nanmax(safe_array('temperature_2m_max', 300.0))),
            'Min_Temp': float(np.nanmin(safe_array('temperature_2m_min', 280.0))),
            'Dewpoint': float(np.nanmean(safe_array('dew_point_2m_mean', 285.0))),
            'Solar_Rad': float(np.nansum(safe_array('shortwave_radiation_sum', 5000.0))) * 1000.0,
            'Wind_Max': float(np.nanmax(safe_array('wind_speed_10m_max', 0.0))),
            'ET_Sum': float(np.nansum(safe_array('et0_fao_evapotranspiration_sum', 0.0)))
        }
    except Exception:
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
            om_bands = [om_data['Temp_2m'], om_data['Precip'], om_data['Max_Temp'], om_data['Min_Temp'],
                        0.3, 0.3, 290.0, om_data['Dewpoint'], om_data['Solar_Rad']]
            t0_np[6:15, :, :] = np.array(om_bands).reshape(9, 1, 1)
            
            full_tensor = np.stack(historical_steps + [t0_np], axis=0)
            normalized = np.zeros_like(full_tensor, dtype=np.float32)
            
            for c, band in enumerate(BAND_NAMES):
                # Ensure we handle nested list structure of norm stats exported by Training script
                mean = norm_stats['means'][band]
                std = max(norm_stats['stds'][band], 1e-6)
                normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std
                
            tflite_input = np.transpose(normalized, (0, 2, 3, 1)) # NCDHW -> NDHWC depending on model format
            
            # Auto-detect transposition need based on tflite expected shape
            expected_shape = input_details[0]['shape']
            if len(expected_shape) == 5 and expected_shape[1] == 15: # NCDHW
                tflite_input = normalized
                
            tflite_input = np.expand_dims(tflite_input, axis=0).astype(np.float32)
            return tflite_input, om_data
        except Exception:
            return None, None
    return None, None

results = []
print(f"\\nStarting Optimized HazardNet Forecast Pipeline...")

for dist in DISTRICTS[:2]: # Truncated for quick testing (full list in prod)
    print(f"Processing {dist['name']}...")
    historical_steps = fetch_historical_steps(dist['lat'], dist['lon'], NORM_STATS)
    if not historical_steps: continue
        
    for horizon_name, days in HORIZONS.items():
        tensor, om_data = build_t0_and_infer(dist, historical_steps, days, NORM_STATS)
        if tensor is not None and om_data is not None:
            hazard, conf, severity = run_inference(tensor)
            
            temp_max_c = om_data['Max_Temp'] - 273.15
            temp_min_c = om_data['Min_Temp'] - 273.15
            precip_mm = om_data['Precip'] * 1000.0
            
            physics_severity = 0.50
            if hazard == 'Tropical Cyclone': physics_severity = om_calc_tropical_cyclone(om_data['Wind_Max'], precip_mm)
            elif hazard == 'Severe Local Storm': physics_severity = om_calc_severe_storm(precip_mm, om_data['Wind_Max'])
            elif hazard == 'Cold Wave': physics_severity = om_calc_cold_wave(temp_min_c, days)
            elif hazard == 'Fire': physics_severity = om_calc_fire(temp_max_c, om_data['Wind_Max'], om_data['ET_Sum'])
            elif hazard == 'Drought': physics_severity = om_calc_drought(temp_max_c, precip_mm)
            elif hazard in ['Flood', 'Flash Flood']: physics_severity = om_calc_flood(precip_mm, precip_mm)
            elif hazard == 'Heat Wave': physics_severity = om_calc_heat_wave(temp_max_c, days)
            
            target_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')
            
            results.append({
                'district_id': dist['id'], 'district_name': dist['name'], 'division': dist['division'],
                'pcode': dist['pcode'], 'horizon': horizon_name, 'hazard_type': hazard,
                'model_severity': round(severity, 4), 'physics_severity': round(physics_severity, 4),
                'confidence': round(conf, 4), 'target_date': target_date,
                'prediction_date': datetime.now().strftime('%Y-%m-%d'), 'data_source': 'Hybrid_Cognitive_Forecast',
                'om_temp_2m_k': round(om_data['Temp_2m'], 4), 'om_precip_m': round(om_data['Precip'], 4),
                'om_max_temp_k': round(om_data['Max_Temp'], 4), 'om_min_temp_k': round(om_data['Min_Temp'], 4),
                'om_dewpoint_k': round(om_data['Dewpoint'], 4), 'om_solar_rad_j': round(om_data['Solar_Rad'], 4),
                'om_wind_max_ms': round(om_data['Wind_Max'], 4), 'om_et_sum_m': round(om_data['ET_Sum'], 4)
            })

df_results = pd.DataFrame(results)
df_results.to_csv(OUTPUT_CSV, index=False)
print("Pipeline complete. Created CSV.")

# ==============================================================================
# 9. PUSH TO LIVE PRODUCTION ENDPOINT
# ==============================================================================
API_URL = os.environ.get("HAZARDNET_API_URL")
AUTH_TOKEN = os.environ.get("HAZARDNET_API_KEY")

if not API_URL or not AUTH_TOKEN:
    print("WARNING: API URL or Auth Token is missing. Saved locally but not pushed.")
    import sys
    sys.exit(0)

try:
    with open(OUTPUT_CSV, 'r') as f:
        csv_data = f.read()
except FileNotFoundError:
    print("CRITICAL ERROR: CSV not found.")
    import sys
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
        import sys
        sys.exit(1)
except requests.exceptions.RequestException as e:
    print(f"FAILED: Network error: {e}")
    import sys
    sys.exit(1)
