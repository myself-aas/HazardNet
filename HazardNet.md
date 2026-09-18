# HazardNet Complete Pipeline

## Phase 1

### **Process Events in Batches of 300**

```python
from google.colab import drive
drive.mount('/content/drive')
import ee
import pandas as pd
import time
import logging
from datetime import datetime, timedelta
from google.colab import auth

# ============================================================
# 1. TECHNICAL CONFIGURATION & PROTOCOL
# ============================================================
# Approved ReliefWeb appname for research integrity
APP_NAME = "BAU-HazardNet-Research-AAS7016"

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# CONFIGURATION DICTIONARY
CONFIG = {
    "PROJECT_ID": "hazardnet-aas48424",      # GEE Project ID
    "DRIVE_FOLDER": "GeoTIFFs",
    "MAX_PENDING_TASKS": 2800,                # Safety threshold for 3000-task limit
    "POLL_INTERVAL": 300,                     # 5-minute wait if queue is full
    "RES": 10,                                # 10m resolution for 64x64 grid
    "CLOUD_FILTER": 30                        # Project optical standard
}

# Authenticate and Initialize
auth.authenticate_user()
ee.Initialize(project=CONFIG["PROJECT_ID"])

# ============================================================
# 2. SPATIO-TEMPORAL EXTRACTION LOGIC
# ============================================================

def harmonize_and_rename(image, mission_type):
    """
    Safely renames bands based on mission type with existence checks.
    BAU-HazardNet-Research-AAS7016 Protocol
    """
    try:
        # Define mapping dictionaries
        mappings = {
            'L57': {'src': ['SR_B1', 'SR_B3', 'SR_B4', 'SR_B5'], 'dest': ['Blue', 'Red', 'NIR', 'SWIR']},
            'L8':  {'src': ['SR_B2', 'SR_B4', 'SR_B5', 'SR_B6'], 'dest': ['Blue', 'Red', 'NIR', 'SWIR']},
            'S2':  {'src': ['B2', 'B4', 'B8', 'B11'],           'dest': ['Blue', 'Red', 'NIR', 'SWIR']}
        }

        selected_map = mappings.get(mission_type)

        # Check actual band count in the image object
        band_names = image.bandNames()
        count = band_names.size()

        # Conditional Rename: Only execute if band count >= 4
        # We use ee.Algorithms.If to keep it in the GEE server-side flow
        renamed_image = ee.Image(ee.Algorithms.If(
            count.gte(4),
            image.select(selected_map['src']).rename(selected_map['dest']),
            # If failed, return a 4-band zero constant to maintain tensor shape
            ee.Image.constant([0, 0, 0, 0]).rename(selected_map['dest']).updateMask(0)
        ))

        return renamed_image

    except Exception as e:
        # Logging as per HazardNet Research standards
        logger.error(f"HazardNet Pipeline - Band mismatch at {mission_type}: {str(e)}")
        return None

def get_hybrid_optical(region, start, end):
    """
    Seamlessly switches between Sentinel-2 and Landsat based on date.
    Returns 4 harmonized bands: ['Blue', 'Red', 'NIR', 'SWIR']
    """
    # 1. Try Sentinel-2 first (Post-2015)
    s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))

    if s2_col.size().getInfo() > 0:
        s2_image = s2_col.median()
        return harmonize_and_rename(s2_image, 'S2').unmask(0)

    # 2. Fallback to Landsat 8 (2013-2015)
    l8_col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))

    if l8_col.size().getInfo() > 0:
        l8_image = l8_col.median()
        return harmonize_and_rename(l8_image, 'L8').resample('bicubic').unmask(0)

    # 3. Fallback to Landsat 7/5 (2000-2013)
    # Note: Landsat 7 has SLC-off gaps; median reduction helps fill them.
    l7_col = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))

    if l7_col.size().getInfo() > 0:
        l7_image = l7_col.median()
        return harmonize_and_rename(l7_image, 'L57').resample('bicubic').unmask(0)

    # 4. Total Failure: Return 4-channel Zero Tensor with harmonized band names
    return ee.Image.constant([0, 0, 0, 0]).rename(['Blue', 'Red', 'NIR', 'SWIR']).float().unmask(0)

def get_temporal_15ch_stack(region, start, end):
    try:
        # Strict Schemas
        S1_BANDS = ['VV', 'VH']
        ERA5_BANDS = ['temperature_2m', 'total_precipitation_sum', 'temperature_2m_max',
                      'temperature_2m_min', 'volumetric_soil_water_layer_1',
                      'volumetric_soil_water_layer_3', 'soil_temperature_level_1',
                      'dewpoint_temperature_2m', 'surface_solar_radiation_downwards_sum']

        # 1. SAR (Robust Zero-Fill for stability)
        s1_collection = ee.ImageCollection('COPERNICUS/S1_GRD') \
            .filterBounds(region).filterDate(start, end) \
            .filter(ee.Filter.eq('instrumentMode', 'IW')) \
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')) \
            .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))

        # Create a default 2-band zero image for S1, explicitly
        default_s1_image = ee.Image.constant([0, 0]).rename(S1_BANDS).float()

        # If S1 collection has images, take median and select bands, otherwise use default
        s1 = ee.Image(ee.Algorithms.If(
            s1_collection.size().gt(0),
            s1_collection.select(S1_BANDS).median().unmask(0),
            default_s1_image
        ))

        # 2. Hybrid Optical (NEW)
        s2_hybrid = get_hybrid_optical(region, start, end)

        # 3. ERA5-Land
        era5 = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR') \
            .filterBounds(region).filterDate(start, end) \
            .median().resample('bilinear').unmask(0) \
            .select(ERA5_BANDS)

        return s1.addBands(s2_hybrid).addBands(era5).float().clip(region).unmask(0)

    except Exception as e:
        logger.error(f"Stack Construction Error: {e}")
        return None

# ============================================================
# 3. GOVERNOR & BATCH EXECUTION
# ============================================================

def check_queue_capacity():
    """Governor: Ensures we don't exceed the 3,000 task limit."""
    while True:
        tasks = ee.batch.Task.list()
        active = sum(1 for t in tasks if t.state in ['READY', 'RUNNING'])
        if active < CONFIG["MAX_PENDING_TASKS"]:
            return active
        logger.warning(f"Queue saturated ({active} tasks). Sleeping for {CONFIG['POLL_INTERVAL']}s...")
        time.sleep(CONFIG["POLL_INTERVAL"])

def run_300_event_batch(csv_path, start_idx):
    """
    Processes a slice of 300 events.
    Update 'start_idx' each time (0, 300, 600, etc.)
    """
    end_idx = start_idx + 300
    df = pd.read_csv(csv_path).iloc[start_idx:end_idx]

    logger.info(f"STARTING BATCH: Events {start_idx} to {end_idx - 1}")

    for _, row in df.iterrows():
        eid = row['Event_ID_Internal']
        # Spatial groundedness: 640m x 640m buffer for 64x64 pixel tensor
        region = ee.Geometry.Point([row['Longitude'], row['Latitude']]).buffer(320).bounds()
        gee_start_dt = datetime.strptime(row['GEE_Start'], '%m/%d/%Y') # FIX: Changed format string here

        # 10 Temporal time-steps for (10, 8, 64, 64) tensor construction
        for t in range(10):
            # Governor check before every single task submission
            check_queue_capacity()

            t_start = (gee_start_dt + timedelta(days=t*10)).strftime('%Y-%m-%d')
            t_end = (gee_start_dt + timedelta(days=(t+1)*10)).strftime('%Y-%m-%d')

            task_name = f"{eid}_T{t}_15B"
            combined_img = get_temporal_15ch_stack(region, t_start, t_end)

            if combined_img:
                task = ee.batch.Export.image.toDrive(
                    image=combined_img,
                    description=task_name,
                    folder=CONFIG["DRIVE_FOLDER"],
                    fileNamePrefix=task_name,
                    scale=CONFIG["RES"],
                    region=region,
                    fileFormat='GeoTIFF'
                )
                try:
                    task.start()
                except Exception as e:
                    logger.error(f"Submission Error for {task_name}: {e}")
                    time.sleep(5)

    logger.info(f"BATCH {start_idx}-{end_idx} SUBMITTED successfully.")
# ============================================================
# 4. MANUAL EXECUTION CONTROL
# ============================================================
# Set start index here (0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700)
START_INDEX = 0
run_300_event_batch('/content/drive/MyDrive/HazardNet/Events/BGD_climatic_hazards.csv', START_INDEX)
```
---
## Phase 2

### HazardNet Dual Track Implementation

```python
import pandas as pd
import numpy as np
import rasterio
import os
import glob
import requests
import time
import warnings
from tqdm import tqdm
from datetime import datetime, timedelta

# Suppress benign rasterio/numpy warnings for cleaner execution logs
warnings.filterwarnings('ignore', category=rasterio.errors.NotGeoreferencedWarning)
warnings.filterwarnings('ignore', category=RuntimeWarning)

# ==============================================================================
# 1. CONFIGURATION & BAND MAPPING
# ==============================================================================
BANDS = {
    'SAR_VV': 0, 
    'SAR_VH': 1, 
    'Blue': 2, 
    'Red': 3,       
    'NIR': 4,       
    'SWIR': 5,      
    'TEMP_2M': 6, 
    'PRECIP': 7, 
    'MAX_TEMP': 8, 
    'MIN_TEMP': 9,
    'SOIL_W1': 10, 
    'SOIL_W3': 11, 
    'SOIL_T1': 12, 
    'DEWPOINT': 13,
    'SOLAR_RAD': 14
}

CSV_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet/Events/BGD_climatic_hazards_dataset_2000_2026.csv'
TIF_DIR = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet/Tensors' 
OUTPUT_DIR = '/kaggle/working/'
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_CSV = os.path.join(OUTPUT_DIR, 'hazardnet_with_severity.csv')

OM_CONFIG = {
    "openmeteo_base_url": "https://archive-api.open-meteo.com/v1/archive",
    "openmeteo_daily_vars": [
        "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
        "precipitation_sum", "wind_speed_10m_max", "relative_humidity_2m_mean",
        "et0_fao_evapotranspiration_sum"
    ],
    "openmeteo_timezone": "Asia/Singapore",
    "request_timeout": 30,
    "rate_limit_delay": 0.5
}

# ==============================================================================
# 2. HYBRID COGNITIVE: TIF-BASED PHYSICAL INDEX FORMULAS
# ==============================================================================
def is_tif_empty(img_array):
    return np.mean(img_array) < 1e-5

def calc_ndvi(nir, red):
    """Normalized Difference Vegetation Index (Corrected: uses NIR[4] and Red[3])"""
    return (nir - red) / (nir + red + 1e-6)
    
def calc_vhi(nir, red, temp):
    """Vegetation Health Index (Drought Severity)"""
    ndvi = calc_ndvi(nir, red)
    # VCI: Vegetation Condition Index
    vci = (ndvi - np.nanmin(ndvi)) / (np.nanmax(ndvi) - np.nanmin(ndvi) + 1e-6)
    # TCI: Temperature Condition Index (Inverted: cooler is healthier)
    tci = (np.nanmax(temp) - temp) / (np.nanmax(temp) - np.nanmin(temp) + 1e-6)
    vhi = 0.5 * vci + 0.5 * tci
    return float(np.clip(1.0 - np.nanmean(vhi), 0.0, 1.0))

def calc_ehf(max_temp, temp_2m):
    """Heat Wave Severity (Excess Heat Factor)"""
    threshold = np.nanpercentile(temp_2m, 90)
    ehf = np.maximum(0, temp_2m - threshold) * np.maximum(0, max_temp - temp_2m)
    return float(np.clip(np.nanmean(ehf), 0.0, 1.0))

def calc_sar_flood(vv, vh, precip):
    """Flood Severity using SAR backscatter and precipitation"""
    sar_ratio = (vv - vh) / (vv + vh + 1e-6)
    severity = (1.0 - np.nanmean(sar_ratio)) * (np.nanmean(precip) / (np.nanmax(precip) + 1e-6))
    return float(np.clip(severity, 0.0, 1.0))

def calc_fire_severity(temp_2m, solar_rad, soil_w1):
    """
    Fire Severity (Corrected: Uses Thermal Stress + Solar Radiation + Soil Dryness 
    as a robust proxy since SWIR is handled correctly at index 5 now).
    """
    # Thermal anomaly (higher temp = higher risk)
    thermal = np.clip((temp_2m - np.nanmean(temp_2m)) / (np.nanmax(temp_2m) - np.nanmean(temp_2m) + 1e-6), 0, 1)
    # Solar desiccation (higher solar rad = higher risk)
    solar = np.clip(solar_rad / (np.nanmax(solar_rad) + 1e-6), 0, 1)
    # Soil dryness (lower soil moisture = higher risk)
    dryness = np.clip(1.0 - (soil_w1 / (np.nanmax(soil_w1) + 1e-6)), 0, 1)
    
    severity = 0.4 * thermal + 0.3 * solar + 0.3 * dryness
    return float(np.clip(np.nanmean(severity), 0.0, 1.0))

def calc_cold_wave_tif(min_temp):
    """Cold Wave Severity (BMD Threshold: ≤16°C)"""
    # Anomaly from 16°C threshold. 10°C drop = 1.0 severity
    anomaly = np.clip((16.0 - min_temp) / 10.0, 0.0, 1.0)
    return float(np.clip(np.nanmean(anomaly), 0.0, 1.0))

# ==============================================================================
# 3. API FETCHERS & HYBRID COGNITIVE VALIDATION
# ==============================================================================

def safe_float(val, default=0.0):
    try:
        f = float(val)
        return default if np.isnan(f) else f
    except Exception:
        return default

# ==============================================================================
# 4. OPEN-METEO FALLBACK FORMULAS (OUTLIER-CAPPED & PHYSICALLY GROUNDED)
# ==============================================================================
def om_calc_severe_storm(precip_max, wind_max):
    p = safe_float(precip_max, 0.0) / 100.0
    w = max(safe_float(wind_max, 0.0) - 50.0, 0.0) / 100.0
    return float(np.clip(0.6 * w + 0.4 * min(p, 1.0), 0.0, 1.0))

def om_calc_cold_wave(temp_min, duration_days):
    cold_anomaly = np.clip((16.0 - safe_float(temp_min, 16.0)) / 10.0, 0.0, 1.0)
    duration_factor = np.clip(safe_float(duration_days, 1.0) / 5.0, 0.0, 1.0)
    return float(np.clip(0.7 * cold_anomaly + 0.3 * duration_factor, 0.0, 1.0))

def om_calc_fire(temp_max, wind_max, et_sum):
    heat = np.clip((safe_float(temp_max, 30.0) - 25.0) / 15.0, 0.0, 1.0)
    wind = np.clip((safe_float(wind_max, 10.0) - 5.0) / 20.0, 0.0, 1.0)
    dryness = np.clip(safe_float(et_sum, 3.0) / 6.0, 0.0, 1.0)
    return float(np.clip(0.4 * heat + 0.3 * wind + 0.3 * dryness, 0.0, 1.0))

def om_calc_tropical_cyclone(wind_max, precip_sum):
    w = max(safe_float(wind_max, 0.0) - 50.0, 0.0) / 150.0
    p = safe_float(precip_sum, 0.0) / 300.0
    return float(np.clip(0.7 * min(w, 1.0) + 0.3 * min(p, 1.0), 0.0, 1.0))

def om_calc_drought(temp_max, precip_sum):
    temp_stress = np.clip((safe_float(temp_max, 25.0) - 25.0) / 20.0, 0.0, 1.0)
    precip_deficit = np.clip((200.0 - safe_float(precip_sum, 200.0)) / 200.0, 0.0, 1.0)
    return float(np.clip(0.6 * temp_stress + 0.4 * precip_deficit, 0.0, 1.0))

def om_calc_flood(precip_sum, precip_max):
    p_factor = np.clip(safe_float(precip_sum, 0.0) / 300.0, 0.0, 1.0)
    i_factor = np.clip(safe_float(precip_max, 0.0) / 100.0, 0.0, 1.0)
    return float(np.clip(0.5 * p_factor + 0.5 * i_factor, 0.0, 1.0))

def om_calc_heat_wave(temp_max, duration_days):
    temp_anomaly = np.clip((safe_float(temp_max, 30.0) - 30.0) / 15.0, 0.0, 1.0)
    duration_factor = np.clip(safe_float(duration_days, 1.0) / 5.0, 0.0, 1.0)
    return float(np.clip(0.7 * temp_anomaly + 0.3 * duration_factor, 0.0, 1.0))

def fetch_openmeteo(lat, lon, start_date, end_date):
    params = {
        "latitude": float(lat), "longitude": float(lon),
        "start_date": start_date, "end_date": end_date,
        "daily": ",".join(OM_CONFIG["openmeteo_daily_vars"]),
        "timezone": OM_CONFIG["openmeteo_timezone"],
    }
    try:
        response = requests.get(OM_CONFIG["openmeteo_base_url"], params=params, timeout=OM_CONFIG["request_timeout"])
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None

# ==============================================================================
# 5. MAIN PROCESSING LOOP (TIF FIRST)
# ==============================================================================
print(f"Loading CSV from {CSV_PATH}...")
df = pd.read_csv(CSV_PATH)

df = df[df['Hazard_Type'] != 'Earthquake'].copy()
print(f"Filtered out Earthquake events. Remaining events to process: {len(df)}")

severity_scores = []
data_sources = []
confidences = []

print(f"Processing {len(df)} events for HazardNet Severity Indexing (TIF Phase)...")

for idx, row in tqdm(df.iterrows(), total=len(df), desc="TIF Processing"):
    event_id = row['Event_ID_Internal']
    hazard = row['Hazard_Type']

    tif_pattern = os.path.join(TIF_DIR, f"{event_id}_T*_15B.tif")
    tif_files = glob.glob(tif_pattern)

    if not tif_files:
        severity_scores.append(np.nan)
        data_sources.append('Missing_TIF')
        confidences.append(0.5)
        continue

    peak_tif = sorted(tif_files)[-1]

    try:
        with rasterio.open(peak_tif) as src:
            img = src.read()

            if is_tif_empty(img):
                severity_scores.append(np.nan)
                data_sources.append('Empty_TIF')
                confidences.append(0.5)
                continue

            nir = img[BANDS['NIR']]
            red = img[BANDS['Red']]
            temp = img[BANDS['TEMP_2M']]
            max_t = img[BANDS['MAX_TEMP']]
            min_t = img[BANDS['MIN_TEMP']]
            vv = img[BANDS['SAR_VV']]
            vh = img[BANDS['SAR_VH']]
            precip = img[BANDS['PRECIP']]
            solar_rad = img[BANDS['SOLAR_RAD']]
            soil_w1 = img[BANDS['SOIL_W1']]

            if hazard == 'Drought':
                severity_scores.append(calc_vhi(nir, red, temp))
                data_sources.append('TIF_Calculated')
                confidences.append(1.0) # High confidence for direct TIF calculation
            elif hazard == 'Heat Wave':
                severity_scores.append(calc_ehf(max_t, temp))
                data_sources.append('TIF_Calculated')
                confidences.append(1.0)
            elif hazard in ['Flood', 'Flash Flood']:
                severity_scores.append(calc_sar_flood(vv, vh, precip))
                data_sources.append('TIF_Calculated')
                confidences.append(1.0)
            elif hazard == 'Fire':
                severity_scores.append(calc_fire_severity(temp, solar_rad, soil_w1))
                data_sources.append('TIF_Calculated')
                confidences.append(1.0)
            elif hazard == 'Cold Wave':
                severity_scores.append(calc_cold_wave_tif(min_t))
                data_sources.append('TIF_Calculated')
                confidences.append(1.0)
            elif hazard in ['Tropical Cyclone', 'Severe Local Storm']:
                # Proxy using SAR variability + precipitation
                severity_scores.append(float(np.clip(np.nanmean(precip) * np.nanstd(vv), 0.0, 1.0)))
                data_sources.append('TIF_Calculated')
                confidences.append(0.85) # Slightly lower confidence for proxy calculation
            else:
                severity_scores.append(np.nan)
                data_sources.append('Unsupported_Hazard_TIF')
                confidences.append(0.50)

    except Exception as e:
        severity_scores.append(np.nan)
        data_sources.append('TIF_Error')
        confidences.append(0.5)

df['Raw_Severity_Score'] = severity_scores
df['Data_Source'] = data_sources
df['Confidence'] = confidences

# ==============================================================================
# 6. SMART FALLBACK FOR MISSING/FAILED SCORES & SUSPICIOUS ZEROS
# ==============================================================================
failure_mask = df['Data_Source'].isin([
    'Unsupported_Hazard_TIF', 'TIF_Error', 'Empty_TIF', 'Missing_TIF'
])

nan_mask = df['Raw_Severity_Score'].isna()
suspicious_zero_mask = (df['Raw_Severity_Score'] == 0.0)

target_mask = failure_mask | nan_mask | suspicious_zero_mask
df_to_fix = df[target_mask].copy()

if len(df_to_fix) > 0:
    print(f"\n Found {len(df_to_fix)} events requiring API fallback (including suspicious 0.0s). Triggering Open-Meteo...")
    new_scores = []
    new_confidences = []
    
    for idx, row in tqdm(df_to_fix.iterrows(), total=len(df_to_fix), desc="API Fallback"):
        try:
            start_d = pd.to_datetime(row['GEE_Start']).strftime('%Y-%m-%d')
            end_d = pd.to_datetime(row['GEE_End']).strftime('%Y-%m-%d')
            duration = max((pd.to_datetime(end_d) - pd.to_datetime(start_d)).days, 1)
            
            hazard = row['Hazard_Type']
            score = np.nan
            conf = 0.50
            
            
            if hazard == 'Tropical Cyclone':
                api_data = fetch_openmeteo(row['Latitude'], row['Longitude'], start_d, end_d)
                if api_data and "daily" in api_data:
                    daily = api_data["daily"]
                    w_max = np.max(daily.get("wind_speed_10m_max", [0.0]))
                    p_sum = np.sum(daily.get("precipitation_sum", [0.0]))
                    score = om_calc_tropical_cyclone(w_max, p_sum)
                    conf = 0.85 # Strong confidence in Open-Meteo cyclone proxy
                        
            else:
                api_data = fetch_openmeteo(row['Latitude'], row['Longitude'], start_d, end_d)
                if api_data and "daily" in api_data:
                    daily = api_data["daily"]
                    temp_min = np.min(daily.get("temperature_2m_min", [15.0]))
                    temp_max = np.max(daily.get("temperature_2m_max", [30.0]))
                    precip_max = np.max(daily.get("precipitation_sum", [0.0]))
                    precip_sum = np.sum(daily.get("precipitation_sum", [0.0]))
                    wind_max = np.max(daily.get("wind_speed_10m_max", [0.0]))
                    et_sum = np.sum(daily.get("et0_fao_evapotranspiration_sum", [0.0]))
                    
                    if hazard == 'Severe Local Storm':
                        score = om_calc_severe_storm(precip_max, wind_max)
                        conf = 0.85
                    elif hazard == 'Cold Wave':
                        score = om_calc_cold_wave(temp_min, duration)
                        conf = 0.85
                    elif hazard == 'Fire':
                        score = om_calc_fire(temp_max, wind_max, et_sum)
                        conf = 0.85
                    elif hazard == 'Drought':
                        score = om_calc_drought(temp_max, precip_sum)
                        conf = 0.85
                    elif hazard in ['Flood', 'Flash Flood']:
                        score = om_calc_flood(precip_sum, precip_max)
                        conf = 0.85
                    elif hazard == 'Heat Wave':
                        score = om_calc_heat_wave(temp_max, duration)
                        conf = 0.85
            
            new_scores.append(score)
            new_confidences.append(conf)
            
        except Exception:
            new_scores.append(np.nan)
            new_confidences.append(0.50)
            
        time.sleep(OM_CONFIG["rate_limit_delay"])

    df.loc[target_mask, 'Raw_Severity_Score'] = new_scores
    df.loc[target_mask, 'Data_Source'] = np.where(
        df.loc[target_mask, 'Data_Source'].isin(['Missing_TIF', 'Empty_TIF', 'TIF_Error', 'Unsupported_Hazard_TIF']) | suspicious_zero_mask.loc[target_mask],
        'API_Corrected',
        df.loc[target_mask, 'Data_Source']
    )
    df.loc[target_mask, 'Confidence'] = new_confidences

# ==============================================================================
# 7. FINAL NORMALIZATION, UNCERTAINTY BINNING & SAFETY GUARDRAILS
# ==============================================================================
print("\nRe-normalizing per hazard type with variance preservation...")

def normalize_group_safe(group):
    min_val, max_val = group.min(), group.max()
    if pd.isna(min_val) or pd.isna(max_val):
        return pd.Series(np.nan, index=group.index)
    if (max_val - min_val) == 0:
        return group
    return (group - min_val) / (max_val - min_val)

df['Severity_Index'] = df.groupby('Hazard_Type')['Raw_Severity_Score'].transform(normalize_group_safe)

df['Severity_Index'] = df['Severity_Index'].fillna(0.0)
df['Raw_Severity_Score'] = df['Raw_Severity_Score'].fillna(0.0)
df['Data_Source'] = df['Data_Source'].fillna('Default_Fallback')
df['Confidence'] = df['Confidence'].fillna(0.50)

def bin_confidence(conf):
    if conf >= 0.85: return "Certain"
    elif conf >= 0.70: return "Probable"
    else: return "Uncertain"

df['Confidence_Bin'] = df['Confidence'].apply(bin_confidence)
df['Requires_Manual_Review'] = df['Confidence_Bin'] == 'Uncertain'

df.to_csv(OUTPUT_CSV, index=False)
print(f"\n Successfully saved final corrected CSV to: {OUTPUT_CSV}")

print("\n FINAL Severity Index Stats by Hazard Type:")
print(df.groupby('Hazard_Type')['Severity_Index'].agg(['count', 'mean', 'std']).round(3))

print("\n Uncertainty Calibration (Target ECE ≤0.05):")
print(df['Confidence_Bin'].value_counts(normalize=True).round(3))

print("\n Data Source Breakdown:")
print(df['Data_Source'].value_counts())

print(f"\n Safety Guardrail: {df['Requires_Manual_Review'].sum()} events flagged for manual review.")
```
---
## Phase 3

### Dataset Builder

#### HazardNet PyTorch GeoTIFF-to-Tensor Pipeline (3A)

```python
import os
import sys
import glob
import logging
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd
import rasterio
import torch
import torch.nn.functional as F
from tqdm import tqdm
from collections import defaultdict

# ============================================================
# CONFIGURATION
# ============================================================
class DataConfig:
    SPATIAL_DIMS = (64, 64)
    TEMPORAL_STEPS = 10
    CHANNELS = 15
    
    BAND_NAMES = [
        'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR', 
        'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp', 
        'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad'
    ]
    
    BAND_INFO = {
        0: {'name': 'SAR_VV', 'range': [-25, 5]},
        1: {'name': 'SAR_VH', 'range': [-30, 0]},
        2: {'name': 'Blue', 'range': [0, 10000]},
        3: {'name': 'Red', 'range': [0, 10000]},
        4: {'name': 'NIR', 'range': [0, 10000]},
        5: {'name': 'SWIR', 'range': [0, 10000]},
        6: {'name': 'Temp_2m', 'range': [250, 320]},      # Kelvin
        7: {'name': 'Precip', 'range': [0, 0.5]},          # Meters (up to 500mm for extreme monsoon events)
        8: {'name': 'Max_Temp', 'range': [250, 320]},      # Kelvin
        9: {'name': 'Min_Temp', 'range': [250, 320]},      # Kelvin (Preserved for BMD Cold Wave ≤16°C / 289.15K)
        10: {'name': 'Soil_W1', 'range': [0, 1.0]},        # m³/m³
        11: {'name': 'Soil_W3', 'range': [0, 1.0]},        # m³/m³
        12: {'name': 'Soil_T1', 'range': [250, 320]},      # Kelvin
        13: {'name': 'Dewpoint', 'range': [250, 320]},     # Kelvin
        14: {'name': 'Solar_Rad', 'range': [0, 25000000]}  # J/m² (up to 25 MJ/m² for extreme clear-sky days)
    }
    
    MAX_NAN_FRACTION = 0.10
    DTYPE_OUTPUT = torch.float32
    MIXED_RESOLUTION = False
    DYNAMIC_ZSCORE = True


# ============================================================
# LOGGING & DIAGNOSTICS
# ============================================================

def setup_logging(output_dir: str) -> logging.Logger:
    """Configure structured logging for pipeline."""
    log_file = os.path.join(output_dir, 'tensor_conversion.log')
    
    logger = logging.getLogger('HazardNetTensorConverter')
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    
    fh = logging.FileHandler(log_file, mode='w')
    fh.setLevel(logging.INFO)
    
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s')
    fh.setFormatter(formatter)
    ch.setFormatter(formatter)
    
    logger.addHandler(fh)
    logger.addHandler(ch)
    
    return logger


# ============================================================
# STAGE 1: INVENTORY & DISCOVERY
# ============================================================

class GeoTIFFInventory:
    """Index all GeoTIFFs by Event_ID and temporal alignment."""
    
    def __init__(self, tiff_dir: str, logger: logging.Logger):
        self.tiff_dir = tiff_dir
        self.logger = logger
        self.inventory: Dict[str, List[str]] = defaultdict(list)
        
    def scan_directory(self) -> Dict[str, List[str]]:
        pattern = os.path.join(self.tiff_dir, '*_T*_15B.tif')
        tiff_files = glob.glob(pattern)
        
        if not tiff_files:
            self.logger.warning(f"No GeoTIFFs found in {self.tiff_dir}")
            return {}
        
        self.logger.info(f"Found {len(tiff_files)} GeoTIFF files")
        
        for tiff_path in tiff_files:
            basename = os.path.basename(tiff_path)
            parts = basename.replace('_15B.tif', '').split('_T')
            if len(parts) == 2:
                event_id = parts[0]
                self.inventory[event_id].append(tiff_path)
        
        self.logger.info(f"Grouped into {len(self.inventory)} unique events")
        return self.inventory
    
    def validate_temporal_alignment(self) -> Tuple[Dict[str, List[str]], Dict[str, str]]:
        valid_inventory = {}
        event_status = {}
        
        for event_id, tiff_paths in self.inventory.items():
            if len(tiff_paths) != DataConfig.TEMPORAL_STEPS:
                event_status[event_id] = f"INCOMPLETE: {len(tiff_paths)}/{DataConfig.TEMPORAL_STEPS} timesteps"
                continue
            
            sorted_paths = sorted(tiff_paths, key=lambda p: int(p.split('_T')[1].split('_')[0]))
            valid_inventory[event_id] = sorted_paths
            event_status[event_id] = "VALID"
        
        n_valid = sum(1 for s in event_status.values() if s == "VALID")
        n_incomplete = len(self.inventory) - n_valid
        self.logger.info(f"Temporal alignment: {n_valid} valid, {n_incomplete} incomplete")
        
        return valid_inventory, event_status


# ============================================================
# STAGE 2: MASK-AWARE SPATIAL VALIDATION
# ============================================================

class TensorValidator:
    """Validate individual GeoTIFF files and apply mask-aware PyTorch resampling."""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self.resampled_count = 0
    
    def validate_and_process_tiff(self, tiff_path: str) -> Tuple[bool, str, Optional[torch.Tensor], Optional[torch.Tensor]]:
        try:
            with rasterio.open(tiff_path) as src:
                if src.count != DataConfig.CHANNELS:
                    return False, f"Expected {DataConfig.CHANNELS} bands, got {src.count}", None, None
                
                # Read as float32 numpy array (C, H, W)
                img = src.read().astype(np.float32)
                
                # Check NaN fraction
                nan_fraction = np.isnan(img).sum() / img.size
                if nan_fraction > DataConfig.MAX_NAN_FRACTION:
                    return False, f"NaN fraction {nan_fraction:.2%} exceeds limit", None, None
                
                nodata_val = src.nodata if src.nodata is not None else -9999.0
                
                # 1. Convert directly to tensor and generate an explicit, independent boolean mask
                tensor = torch.from_numpy(img)
                valid_mask = ~torch.isnan(tensor) & (tensor != nodata_val)
                
                # 2. Handle Spatial Resampling carefully if sizes mismatch
                if not DataConfig.MIXED_RESOLUTION:
                    h, w = tensor.shape[1], tensor.shape[2]
                    if (h, w) != DataConfig.SPATIAL_DIMS:
                        self.logger.debug(f"Resampling {os.path.basename(tiff_path)} from ({h}, {w}) to {DataConfig.SPATIAL_DIMS}")
                        
                        # Temporarily fill NaNs with 0.0 purely to prevent bilinear NaN explosion
                        tensor_clean = torch.where(valid_mask, tensor, torch.tensor(0.0, dtype=tensor.dtype))
                        
                        # Resample Data (Bilinear) and Mask (Nearest, to preserve strict boundaries)
                        tensor = F.interpolate(
                            tensor_clean.unsqueeze(0), 
                            size=DataConfig.SPATIAL_DIMS, 
                            mode='bilinear', 
                            align_corners=False
                        ).squeeze(0)
                        
                        valid_mask = F.interpolate(
                            valid_mask.unsqueeze(0).float(), 
                            size=DataConfig.SPATIAL_DIMS, 
                            mode='nearest'
                        ).squeeze(0).bool()
                        
                        self.resampled_count += 1
                        
                return True, "OK", tensor, valid_mask
        except Exception as e:
            return False, f"Error reading TIFF: {str(e)}", None, None
    
    def validate_event_tensor(self, tiff_paths: List[str]) -> Tuple[bool, str, Optional[torch.Tensor], Optional[torch.Tensor]]:
        tensors = []
        masks = []
        for t, tiff_path in enumerate(tiff_paths):
            is_valid, msg, tensor, valid_mask = self.validate_and_process_tiff(tiff_path)
            if not is_valid:
                return False, f"Timestep {t}: {msg}", None, None
            tensors.append(tensor)
            masks.append(valid_mask)
        
        # Stack to (T, C, H, W)
        stacked_tensor = torch.stack(tensors, dim=0)
        stacked_mask = torch.stack(masks, dim=0)
        return True, "OK", stacked_tensor, stacked_mask


# ============================================================
# STAGE 3: TRUE DYNAMIC Z-SCORE NORMALIZATION & SERIALIZATION
# ============================================================

class TensorNormalizer:
    """Apply true dynamic z-score normalization per tensor using explicit validity masks."""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
        
    def compute_global_statistics(self, valid_raw_tensors: Dict[str, torch.Tensor], valid_masks: Dict[str, torch.Tensor]) -> Dict[str, Dict]:
        """Compute global mean and std per channel across all valid events for reference/logging."""
        self.logger.info("Computing global normalization statistics...")
        stats = {}
        for c, band_name in enumerate(DataConfig.BAND_NAMES):
            all_values = []
            for event_id, tensor in valid_raw_tensors.items():
                mask = valid_masks[event_id]
                # tensor is (T, C, H, W)
                channel_data = tensor[:, c, :, :]
                channel_mask = mask[:, c, :, :]
                
                if channel_mask.sum() > 0:
                    all_values.append(channel_data[channel_mask])
            
            if len(all_values) > 0:
                concatenated = torch.cat(all_values)
                mean = float(concatenated.mean())
                std = float(concatenated.std())
                std = max(std, 1e-6) # Prevent division by zero
            else:
                mean = 0.0
                std = 1.0
                
            stats[band_name] = {'mean': mean, 'std': std}
            self.logger.debug(f"  {band_name}: µ={mean:.4f}, σ={std:.4f}")
            
        return stats
        
    def normalize_tensor(self, tensor: torch.Tensor, valid_mask: torch.Tensor) -> torch.Tensor:
        """
        Applies true Dynamic Z-score normalization per patch and channel.
        Safeguards valid physical zeros and pins invalid regions to a true neutral 0.0.
        """
        normalized = torch.zeros_like(tensor, dtype=DataConfig.DTYPE_OUTPUT)
        
        # Assuming input layout is (T, C, H, W)
        for c in range(DataConfig.CHANNELS):
            channel_data = tensor[:, c, :, :]
            channel_mask = valid_mask[:, c, :, :]
            
            # Calculate statistics strictly using the explicit mask coordinates
            if channel_mask.sum() > 0:
                mu = channel_data[channel_mask].mean()
                sigma = channel_data[channel_mask].std()
                sigma = torch.clamp(sigma, min=1e-6)
                
                # Compute z-score across the whole slice
                z_score = (channel_data - mu) / sigma
                
                # Map valid data to its z-score, and force invalid regions to an absolute 0.0
                normalized[:, c, :, :] = torch.where(channel_mask, z_score, torch.tensor(0.0, dtype=z_score.dtype))
            else:
                # Entire channel slice is invalid padding
                normalized[:, c, :, :] = 0.0
                
        # Permute to (C, T, H, W) for standard PyTorch 3D CNN input
        return normalized.permute(1, 0, 2, 3)


class TensorSerializer:
    """Save normalized PyTorch tensors to disk."""
    
    def __init__(self, output_dir: str, logger: logging.Logger):
        self.output_dir = output_dir
        self.tensor_dir = os.path.join(output_dir, 'tensors')
        self.logger = logger
        os.makedirs(self.tensor_dir, exist_ok=True)
    
    def save_tensor(self, event_id: str, tensor: torch.Tensor) -> str:
        tensor_path = os.path.join(self.tensor_dir, f'{event_id}.pt')
        torch.save(tensor, tensor_path)
        return tensor_path


# ============================================================
# STAGE 4: PIPELINE ORCHESTRATION
# ============================================================

class GeoTIFFTensorPipeline:
    """End-to-end orchestration of GeoTIFF → PyTorch Tensor conversion."""
    
    def __init__(self, tiff_dir: str, csv_path: str, output_dir: str):
        self.tiff_dir = tiff_dir
        self.csv_path = csv_path
        self.output_dir = output_dir
        
        os.makedirs(output_dir, exist_ok=True)
        self.logger = setup_logging(output_dir)
        
        self.inventory = GeoTIFFInventory(tiff_dir, self.logger)
        self.validator = TensorValidator(self.logger)
        self.normalizer = TensorNormalizer(self.logger)
        self.serializer = TensorSerializer(output_dir, self.logger)
        
        self.df_severity = pd.read_csv(csv_path)
        # Convert 'Date' column to datetime objects immediately after loading
        self.df_severity['Date'] = pd.to_datetime(self.df_severity['Date'])
        self.df_severity = self.df_severity[self.df_severity['Hazard_Type'] != 'Earthquake'].copy()
        self.logger.info(f"Filtered out Earthquake events. Remaining events to process: {len(self.df_severity)}")
        
        self.manifest = []
        self.validation_report = defaultdict(list)
    
    def run(self):
        self.logger.info("=" * 70)
        self.logger.info("HazardNet PyTorch GeoTIFF-to-Tensor Pipeline")
        self.logger.info(f"Dynamic Z-Score: {DataConfig.DYNAMIC_ZSCORE}")
        self.logger.info(f"Mask-Aware Validation: Enabled")
        self.logger.info("=" * 70)
        
        # Stage 1: Inventory
        self.logger.info("\n[STAGE 1] Scanning directory and validating temporal alignment...")
        self.inventory.scan_directory()
        valid_inventory, event_status = self.inventory.validate_temporal_alignment()
        
        # Stage 2: Mask-Aware Validation and Resampling
        self.logger.info("\n[STAGE 2] Validating and Resampling GeoTIFFs (Mask-Aware)...")
        valid_raw_events = {}
        valid_masks_events = {}
        target_event_ids = set(self.df_severity['Event_ID_Internal'].values)
        
        for event_id, tiff_paths in tqdm(valid_inventory.items(), desc="Validate Events"):
            if event_id not in target_event_ids:
                self.logger.debug(f"Skipping {event_id}: Filtered out by hazard type.")
                continue
            is_valid, msg, tensor_stacked, mask_stacked = self.validator.validate_event_tensor(tiff_paths)
            if is_valid:
                valid_raw_events[event_id] = tensor_stacked
                valid_masks_events[event_id] = mask_stacked
                self.validation_report[event_id].append(('VALID', msg))
            else:
                self.validation_report[event_id].append(('INVALID', msg))
                self.logger.warning(f"{event_id}: {msg}")
        
        n_valid = len(valid_raw_events)
        n_total = len(valid_inventory)
        self.logger.info(f"Passed validation: {n_valid}/{n_total} events ({100*n_valid/n_total:.1f}%)")
        self.logger.info(f"Resampled {self.validator.resampled_count} GeoTIFFs to standard dimensions")
        
        # Stage 3: Compute and save global normalization statistics
        self.logger.info("\n[STAGE 3] Computing and saving global normalization statistics...")
        global_stats = self.normalizer.compute_global_statistics(valid_raw_events, valid_masks_events)
        stats_path = os.path.join(self.output_dir, 'normalization_stats.json')
        with open(stats_path, 'w') as f:
            json.dump(global_stats, f, indent=2)
        self.logger.info(f"Global normalization stats saved to {stats_path}")
        
        # Stage 4: Normalization & Serialization
        self.logger.info("\n[STAGE 4] Normalizing and Serializing PyTorch tensors...")
        for event_id, tensor_stacked in tqdm(valid_raw_events.items(), desc="Normalize & Serialize"):
            try:
                mask_stacked = valid_masks_events[event_id]
                
                # Normalize dynamically using explicit mask
                tensor_normalized = self.normalizer.normalize_tensor(tensor_stacked, mask_stacked)
                tensor_path = self.serializer.save_tensor(event_id, tensor_normalized) # Get absolute path
                
                # Link to severity metadata
                severity_row = self.df_severity[self.df_severity['Event_ID_Internal'] == event_id]
                if not severity_row.empty:
                    date = (severity_row.iloc[0]['Date']).strftime('%Y-%m-%d')
                    district = severity_row.iloc[0]['District']
                    latitude = float(severity_row.iloc[0]['Latitude'])
                    longitude = float(severity_row.iloc[0]['Longitude'])
                    hazard_type = severity_row.iloc[0]['Hazard_Type']
                    severity_idx = float(severity_row.iloc[0]['Severity_Index'])
                    confidence = float(severity_row.iloc[0]['Confidence'])
                else:
                    date = ''
                    district = ''
                    latitude = 0.0
                    longitude = 0.0
                    hazard_type, severity_idx, confidence = 'Unknown', 0.0, 0.5
                
                self.manifest.append({
                    'event_id': event_id,
                    'date': date,
                    'district': district,
                    'latitude': latitude,
                    'longitude': longitude,
                    'tensor_path': tensor_path, # Store relative path
                    'shape': f"C={tensor_normalized.shape[0]}, T={tensor_normalized.shape[1]}, H={tensor_normalized.shape[2]}, W={tensor_normalized.shape[3]}",
                    'hazard_type': hazard_type,
                    'severity_index': severity_idx,
                    'confidence': confidence,
                    'status': 'OK'
                })
            except Exception as e:
                self.logger.error(f"{event_id}: Serialization failed: {str(e)}")
                self.manifest.append({
                    'event_id': event_id,
                    'date': '',
                    'district': '',
                    'latitude': 0.0,
                    'longitude': 0.0,
                    'tensor_path': '',
                    'shape': '',
                    'hazard_type': '',
                    'severity_index': 0.0,
                    'confidence': 0.5,
                    'status': f'ERROR: {str(e)}'
                })
        
        # Stage 5: Export manifest
        self.logger.info("\n[STAGE 5] Exporting manifest...")
        df_manifest = pd.DataFrame(self.manifest)
        manifest_path = os.path.join(self.output_dir, 'tensor_manifest.csv')
        df_manifest.to_csv(manifest_path, index=False)
        self.logger.info(f"Manifest saved to {manifest_path}")
        
        # Export validation report
        report_path = os.path.join(self.output_dir, 'tensor_validation_report.txt')
        with open(report_path, 'w') as f:
            f.write("HazardNet Tensor Validation Report\n")
            f.write("=" * 70 + "\n\n")
            for event_id, messages in self.validation_report.items():
                f.write(f"{event_id}:\n")
                for status, msg in messages:
                    f.write(f"  [{status}] {msg}\n")
            f.write(f"\n\nSummary:\n")
            f.write(f"  Total events: {len(self.validation_report)}\n")
            f.write(f"  Valid: {n_valid}\n")
            f.write(f"  Passed: {df_manifest['status'].eq('OK').sum()}\n")
            f.write(f"  Resampled: {self.validator.resampled_count}\n")
        
        self.logger.info(f"Validation report saved to {report_path}")
        self.logger.info("\n" + "=" * 70)
        self.logger.info("PIPELINE COMPLETE")
        self.logger.info("=" * 70)
        
        return df_manifest

if __name__ == '__main__':
    TIFF_DIR = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet/Tensors'
    CSV_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet/Events/hazardnet_with_severity.csv'
    OUTPUT_DIR = 'tensors_output'
    
    pipeline = GeoTIFFTensorPipeline(TIFF_DIR, CSV_PATH, OUTPUT_DIR)
    df_manifest = pipeline.run()
    
    print("\n" + "=" * 70)
    print("TENSOR MANIFEST SUMMARY")
    print("=" * 70)
    print(df_manifest.groupby(['hazard_type', 'status']).size().unstack(fill_value=0))
```

---

#### HazardNet Unified Experimental Dataset Builder (3B)

```python
"""
================================================================================
HazardNet Unified Experimental Dataset Builder
================================================================================

VALIDATION STRATEGIES:
  0. Event-Based 5-Fold Stratified CV — Baseline performance (hazard-stratified)
  1. Spatial LODO (Division-Level, 8 folds) — Climatologically coherent spatial units
  2. Temporal Split (Season-Adaptive Boundaries) — Independent splits per cropping season
     Kharif-I/II: Train 2000-2017 | Val 2018-2021 | Test 2022-2025
     Rabi:        Train 2000-2020 | Val 2021-2023 | Test 2024-2025
  3. Combined Spatio-Temporal (Division × Season × Era) — Up to 24 folds

MASTER HDF5 ARCHITECTURE:
  - Single master_tensors.h5 built once (~2.5 GB)
  - Lightweight CSV fold manifests reference event_ids from master
  - Worker-safe MasterHDF5Dataset with augmentation + spatial resize

REFERENCES:
  - Islam et al. (2020): Three cropping seasons (Kharif-I, Kharif-II, Rabi)
  - Rahman et al. (2017): Climate non-stationarity in Bangladesh droughts
  - BARC (2023): Bangladesh administrative divisions as agro-climatic zones

================================================================================
"""

import os
import json
import logging
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, get_worker_info
from sklearn.model_selection import StratifiedKFold, train_test_split
import h5py
from tqdm import tqdm
from typing import Dict, List, Tuple, Optional
from pathlib import Path
from collections import defaultdict


# ============================================================================
# CONFIGURATION
# ============================================================================

class DataConfig:
    """Dataset and experimental validation configuration."""
    SEED = 42
    N_FOLDS = 5  # For event-based stratified CV

    # THREE-SEASON CROPPING CALENDAR (Islam et al., 2020)
    CROPPING_SEASONS = {
        'Kharif_I': [3, 4, 5],           # Mar-May
        'Kharif_II': [6, 7, 8, 9, 10],   # Jun-Oct
        'Rabi': [11, 12, 1, 2]           # Nov-Feb
    }

    # Season-specific climate signatures (Islam et al., 2020)
    SEASON_CLIMATE_SIGNATURES = {
        'Kharif_I': {'temp_humidity_corr': -0.60, 'primary_driver': 'temperature'},
        'Kharif_II': {'rainfall_humidity_corr': None, 'primary_driver': 'rainfall'},
        'Rabi': {'rainfall_humidity_corr': 0.75, 'primary_driver': 'rainfall+humidity'}
    }

    # Season-adaptive temporal split boundaries
    SEASON_TEMPORAL_SPLITS = {
        'Kharif_I': {
            'train_end': 2017,
            'val_end': 2021,
            'rationale': 'High density; standard 3-era split aligned with Sentinel-2B launch'
        },
        'Kharif_II': {
            'train_end': 2017,
            'val_end': 2021,
            'rationale': 'Highest density; standard 3-era split aligned with Sentinel-2B launch'
        },
        'Rabi': {
            'train_end': 2020,
            'val_end': 2023,
            'rationale': 'Low density; extended train to preserve test samples'
        }
    }

    # District-to-Division mapping for spatial validation
    DISTRICT_TO_DIVISION = {
        # Dhaka Division (13 districts)
        'Dhaka': 'Dhaka', 'Gazipur': 'Dhaka', 'Narayanganj': 'Dhaka',
        'Tangail': 'Dhaka', 'Manikganj': 'Dhaka', 'Munshiganj': 'Dhaka',
        'Rajbari': 'Dhaka', 'Faridpur': 'Dhaka', 'Gopalganj': 'Dhaka',
        'Madaripur': 'Dhaka', 'Shariatpur': 'Dhaka', 'Kishoreganj': 'Dhaka',
        'Narsingdi': 'Dhaka',
        # Chittagong Division (11 districts)
        'Chattogram': 'Chittagong', 'Cox\'s Bazar': 'Chittagong',
        'Feni': 'Chittagong', 'Noakhali': 'Chittagong', 'Lakshmipur': 'Chittagong',
        'Chandpur': 'Chittagong', 'Brahmanbaria': 'Chittagong',
        'Comilla': 'Chittagong', 'Cumilla': 'Chittagong',
        'Khagrachari': 'Chittagong', 'Rangamati': 'Chittagong', 'Bandarban': 'Chittagong',
        # Rajshahi Division (8 districts)
        'Rajshahi': 'Rajshahi', 'Bogra': 'Rajshahi', 'Joypurhat': 'Rajshahi',
        'Naogaon': 'Rajshahi', 'Natore': 'Rajshahi', 'Chapainawabganj': 'Rajshahi',
        'Pabna': 'Rajshahi', 'Sirajganj': 'Rajshahi',
        # Khulna Division (10 districts)
        'Khulna': 'Khulna', 'Bagerhat': 'Khulna', 'Chuadanga': 'Khulna',
        'Jessore': 'Khulna', 'Jhenaidah': 'Khulna', 'Kushtia': 'Khulna',
        'Magura': 'Khulna', 'Meherpur': 'Khulna', 'Narail': 'Khulna',
        'Satkhira': 'Khulna',
        # Barisal Division (6 districts)
        'Barishal': 'Barisal', 'Barguna': 'Barisal', 'Bhola': 'Barisal',
        'Jhalokati': 'Barisal', 'Patuakhali': 'Barisal', 'Pirojpur': 'Barisal',
        # Sylhet Division (4 districts)
        'Sylhet': 'Sylhet', 'Habiganj': 'Sylhet', 'Moulvibazar': 'Sylhet',
        'Sunamganj': 'Sylhet',
        # Rangpur Division (8 districts)
        'Rangpur': 'Rangpur', 'Dinajpur': 'Rangpur', 'Gaibandha': 'Rangpur',
        'Kurigram': 'Rangpur', 'Lalmonirhat': 'Rangpur', 'Nilphamari': 'Rangpur',
        'Panchagarh': 'Rangpur', 'Thakurgaon': 'Rangpur',
        # Mymensingh Division (4 districts)
        'Mymensingh': 'Mymensingh', 'Jamalpur': 'Mymensingh',
        'Netrokona': 'Mymensingh', 'Sherpur': 'Mymensingh',
    }

    MIN_TEST_EVENTS = 5
    TARGET_TENSOR_SHAPE = (15, 10, 64, 64)
    APPLY_DYNAMIC_ZSCORE = False

    AUGMENT_TRAIN = True
    AUGMENT_PARAMS = {
        'brightness': 0.1,
        'contrast': 0.1,
        'temporal_shift': 1
    }


# ============================================================================
# LOGGING
# ============================================================================

def setup_logger(output_dir: str) -> logging.Logger:
    logger = logging.getLogger('HazardNetExperimentalBuilder')
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False

    fh = logging.FileHandler(os.path.join(output_dir, 'experimental_builder.log'), mode='w')
    fh.setLevel(logging.INFO)
    formatter = logging.Formatter('[%(asctime)s] %(levelname)s: %(message)s')
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    return logger


# ============================================================================
# HAZARD TYPE ENCODING
# ============================================================================

class HazardEncoder:
    HAZARD_TYPES = [
        'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
        'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
    ]

    HAZARD_TO_IDX = {h: i for i, h in enumerate(HAZARD_TYPES)}
    IDX_TO_HAZARD = {i: h for i, h in enumerate(HAZARD_TYPES)}

    @classmethod
    def encode(cls, hazard: str) -> int:
        return cls.HAZARD_TO_IDX.get(hazard, -1)

    @classmethod
    def decode(cls, idx: int) -> str:
        return cls.IDX_TO_HAZARD.get(idx, 'Unknown')

    @classmethod
    def n_classes(cls) -> int:
        return len(cls.HAZARD_TYPES)


# ============================================================================
# UTILITY: Season Assignment
# ============================================================================

def assign_cropping_season(month: int) -> str:
    """Assign cropping season per Islam et al. (2020)."""
    if month in DataConfig.CROPPING_SEASONS['Kharif_I']:
        return 'Kharif_I'
    elif month in DataConfig.CROPPING_SEASONS['Kharif_II']:
        return 'Kharif_II'
    elif month in DataConfig.CROPPING_SEASONS['Rabi']:
        return 'Rabi'
    else:
        raise ValueError(f"Invalid month: {month}")


# ============================================================================
# MASTER HDF5 BUILDER (Built ONCE to save disk space)
# ============================================================================

class MasterHDF5Serializer:
    """Builds a single Master HDF5 file containing all unique event tensors."""

    def __init__(self, tensor_dir: str, output_path: str, logger: logging.Logger):
        self.tensor_dir = tensor_dir
        self.output_path = output_path
        self.logger = logger

    def build_master_hdf5(self, df_manifest: pd.DataFrame) -> set:
        self.logger.info(f"Building Master HDF5 at {self.output_path}...")

        unique_events = df_manifest.drop_duplicates(subset=['event_id']).copy()
        successful_event_ids = set()
        failed_count = 0

        with h5py.File(self.output_path, 'w') as h5f:
            grp_tensors = h5f.create_group('tensors')
            grp_labels = h5f.create_group('labels')
            grp_severity = h5f.create_group('severity')
            grp_confidence = h5f.create_group('confidence')

            for _, row in tqdm(unique_events.iterrows(), total=len(unique_events), desc="Building Master HDF5"):
                event_id = row['event_id']
                event_id_str = str(event_id)
                raw_path = str(row['tensor_path'])
                hazard_type = row['hazard_type']

                severity_idx = float(row.get('severity_index', 0.0))
                confidence = float(row.get('confidence', 0.5))

                # Dynamic Path Resolution
                if os.path.exists(raw_path):
                    tensor_path = raw_path
                else:
                    filename = os.path.basename(raw_path)
                    tensor_path = os.path.join(self.tensor_dir, filename)

                if not os.path.exists(tensor_path):
                    self.logger.warning(f"Tensor not found: {tensor_path}")
                    failed_count += 1
                    continue

                try:
                    tensor = torch.load(tensor_path, map_location='cpu')
                    class_idx = HazardEncoder.encode(hazard_type)

                    if class_idx == -1:
                        self.logger.warning(f"Unknown hazard type for {event_id_str}: {hazard_type}")
                        failed_count += 1
                        continue

                    grp_tensors.create_dataset(
                        event_id_str, data=tensor.numpy(),
                        compression='gzip', compression_opts=4
                    )
                    grp_labels.create_dataset(event_id_str, data=class_idx)
                    grp_severity.create_dataset(event_id_str, data=severity_idx)
                    grp_confidence.create_dataset(event_id_str, data=confidence)

                    successful_event_ids.add(event_id_str)

                except Exception as e:
                    self.logger.error(f"Failed to serialize {event_id_str}: {e}")
                    failed_count += 1

            h5f.attrs['n_events'] = len(successful_event_ids)
            h5f.attrs['seed'] = DataConfig.SEED
            h5f.attrs['n_classes'] = HazardEncoder.n_classes()
            h5f.attrs['target_tensor_shape'] = DataConfig.TARGET_TENSOR_SHAPE

        self.logger.info(f"Master HDF5 built successfully: {len(successful_event_ids)} events serialized.")
        return successful_event_ids


# ============================================================================
# STRATEGY 0: EVENT-BASED 5-FOLD STRATIFIED CV
#  NEWLY INTEGRATED: Baseline performance evaluation
# ============================================================================

class EventBasedKFoldBuilder:
    """
    Standard 5-fold stratified cross-validation by hazard type.
    Serves as the baseline performance metric (IEEE TGRS Table II).
    """

    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()

        self.logger.info(f"  Event-Based K-Fold:")
        self.logger.info(f"    Total events: {len(self.df)}")
        self.logger.info(f"    Hazard distribution:\n{self.df['hazard_type'].value_counts().to_string()}")

    def partition(self) -> List[Dict]:
        skf = StratifiedKFold(
            n_splits=DataConfig.N_FOLDS,
            shuffle=True,
            random_state=DataConfig.SEED
        )

        folds = []
        X = self.df[['event_id']].values
        y = self.df['hazard_idx'].values

        for fold_idx, (train_val_idx, test_idx) in enumerate(skf.split(X, y)):
            train_val_data = self.df.iloc[train_val_idx].copy()
            test_data = self.df.iloc[test_idx].copy()

            val_ratio = 0.15 / (0.70 + 0.15)
            train_data, val_data = train_test_split(
                train_val_data,
                test_size=val_ratio,
                stratify=train_val_data['hazard_idx'],
                random_state=DataConfig.SEED + fold_idx
            )

            folds.append({
                'fold_type': 'event_kfold',
                'fold_idx': fold_idx,
                'n_events': len(test_data),
                'train': train_data.reset_index(drop=True),
                'val': val_data.reset_index(drop=True),
                'test': test_data.reset_index(drop=True)
            })

            self.logger.info(f"    Fold {fold_idx}: train={len(train_data)}, "
                             f"val={len(val_data)}, test={len(test_data)}")

        self.logger.info(f"  Total Event-Based K-Fold folds: {len(folds)}")
        return folds


# ============================================================================
# STRATEGY 1: SPATIAL LODO (Division-Level)
# ============================================================================

class SpatialLODOBuilder:
    """Leave-One-Division-Out spatial cross-validation (8 climatologically coherent units)."""

    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()

        self.df['division'] = self.df['district'].map(DataConfig.DISTRICT_TO_DIVISION)
        unmapped = self.df[self.df['division'].isna()]['district'].unique()
        if len(unmapped) > 0:
            self.logger.warning(f"  Unmapped districts (excluded from spatial LODO): {unmapped.tolist()}")
            self.df = self.df.dropna(subset=['division'])

        self.division_counts = self.df['division'].value_counts()
        self.divisions = sorted(self.df['division'].unique())

        self.logger.info(f"  Spatial LODO (Division-Level):")
        self.logger.info(f"    Divisions: {len(self.divisions)}")
        for div in self.divisions:
            count = self.division_counts.get(div, 0)
            self.logger.info(f"      {div}: {count} events")

    def partition(self) -> List[Dict]:
        folds = []

        for division in self.divisions:
            test_mask = self.df['division'] == division
            train_all = self.df[~test_mask].copy()
            test_data = self.df[test_mask].copy()

            val_ratio = 0.15 / (0.70 + 0.15)
            hazard_counts = train_all['hazard_idx'].value_counts()
            can_stratify = hazard_counts.min() >= 2 if not hazard_counts.empty else False

            train_data, val_data = train_test_split(
                train_all, test_size=val_ratio,
                stratify=train_all['hazard_idx'] if can_stratify else None,
                random_state=DataConfig.SEED
            )

            folds.append({
                'fold_type': 'lodo_division',
                'division': division,
                'n_events': len(test_data),
                'train': train_data.reset_index(drop=True),
                'val': val_data.reset_index(drop=True),
                'test': test_data.reset_index(drop=True)
            })

        self.logger.info(f"  Total Spatial LODO folds: {len(folds)}")
        return folds


# ============================================================================
# STRATEGY 2: TEMPORAL SPLIT (Season-Adaptive Boundaries)
# ============================================================================

class TemporalSplitBuilder:
    """Season-Adaptive Temporal Cross-Validation with independent boundaries per season."""

    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()

        self.df['year'] = pd.to_datetime(self.df['date']).dt.year
        self.df['month'] = pd.to_datetime(self.df['date']).dt.month
        self.df['cropping_season'] = self.df['month'].apply(assign_cropping_season)

    def partition(self) -> Dict[str, pd.DataFrame]:
        all_train, all_val, all_test = [], [], []

        self.logger.info(f"  Temporal Split (Season-Adaptive Boundaries):")

        for season, bounds in DataConfig.SEASON_TEMPORAL_SPLITS.items():
            season_df = self.df[self.df['cropping_season'] == season].copy()
            train_end = bounds['train_end']
            val_end = bounds['val_end']

            train_data = season_df[season_df['year'] <= train_end]
            val_data = season_df[(season_df['year'] > train_end) & (season_df['year'] <= val_end)]
            test_data = season_df[season_df['year'] > val_end]

            all_train.append(train_data)
            all_val.append(val_data)
            all_test.append(test_data)

            self.logger.info(f"    {season} ({bounds['rationale']}):")
            self.logger.info(f"      Train (2000-{train_end}): {len(train_data)} events")
            self.logger.info(f"      Val ({train_end+1}-{val_end}):   {len(val_data)} events")
            self.logger.info(f"      Test ({val_end+1}-2025):  {len(test_data)} events")

        combined_train = pd.concat(all_train, ignore_index=True)
        combined_val = pd.concat(all_val, ignore_index=True)
        combined_test = pd.concat(all_test, ignore_index=True)

        self.logger.info(f"\n  Combined Totals:")
        self.logger.info(f"    Train: {len(combined_train)} events")
        self.logger.info(f"    Val:   {len(combined_val)} events")
        self.logger.info(f"    Test:  {len(combined_test)} events")

        return {
            'fold_type': 'temporal_season_adaptive',
            'train': combined_train.reset_index(drop=True),
            'val': combined_val.reset_index(drop=True),
            'test': combined_test.reset_index(drop=True),
            'season_boundaries': DataConfig.SEASON_TEMPORAL_SPLITS
        }


# ============================================================================
# STRATEGY 3: COMBINED SPATIO-TEMPORAL (Division × Season × Era)
# ============================================================================

class SpatioTemporalBuilder:
    """Combined Spatio-Temporal validation at DIVISION level with season-adaptive eras."""

    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()

        self.df['year'] = pd.to_datetime(self.df['date']).dt.year
        self.df['month'] = pd.to_datetime(self.df['date']).dt.month
        self.df['cropping_season'] = self.df['month'].apply(assign_cropping_season)

        self.df['division'] = self.df['district'].map(DataConfig.DISTRICT_TO_DIVISION)
        unmapped = self.df[self.df['division'].isna()]['district'].unique()
        if len(unmapped) > 0:
            self.logger.warning(f"  Unmapped districts (excluded from ST folds): {unmapped.tolist()}")
            self.df = self.df.dropna(subset=['division'])

    def partition(self) -> List[Dict]:
        folds = []
        seasons = ['Kharif_I', 'Kharif_II', 'Rabi']
        divisions = sorted(self.df['division'].unique())

        self.logger.info(f"  Spatio-Temporal (Division-Level × Season-Adaptive): "
                         f"{len(divisions)} divisions × {len(seasons)} seasons")

        skipped = 0
        for division in divisions:
            for season in seasons:
                bounds = DataConfig.SEASON_TEMPORAL_SPLITS[season]
                train_end = bounds['train_end']
                val_end = bounds['val_end']

                test_mask = (self.df['division'] == division) & \
                            (self.df['cropping_season'] == season) & \
                            (self.df['year'] > val_end)
                test_data = self.df[test_mask].copy()

                if len(test_data) < DataConfig.MIN_TEST_EVENTS:
                    skipped += 1
                    continue

                train_mask = (self.df['division'] != division) & \
                             (self.df['cropping_season'] == season) & \
                             (self.df['year'] <= train_end)
                train_data = self.df[train_mask].copy()

                val_mask = (self.df['division'] != division) & \
                           (self.df['cropping_season'] == season) & \
                           (self.df['year'] > train_end) & \
                           (self.df['year'] <= val_end)
                val_data = self.df[val_mask].copy()

                if len(train_data) == 0 or len(val_data) == 0:
                    skipped += 1
                    continue

                folds.append({
                    'fold_type': 'spatio_temporal_division',
                    'division': division,
                    'season': season,
                    'n_test_events': len(test_data),
                    'train': train_data.reset_index(drop=True),
                    'val': val_data.reset_index(drop=True),
                    'test': test_data.reset_index(drop=True)
                })

        self.logger.info(f"  Total Spatio-Temporal folds: {len(folds)} "
                         f"(skipped {skipped} with <{DataConfig.MIN_TEST_EVENTS} test events)")
        return folds


# ============================================================================
# ORCHESTRATOR
# ============================================================================

class ExperimentalDatasetBuilder:
    """Builds single Master HDF5 file once and exports CSV fold manifests for ALL strategies."""

    REQUIRED_COLUMNS = ['event_id', 'hazard_type', 'tensor_path', 'severity_index', 'confidence', 'district', 'date']

    def __init__(self, df_manifest_path: str, tensor_dir: str, output_dir: str):
        self.df_manifest_path = df_manifest_path
        self.tensor_dir = tensor_dir
        self.output_dir = output_dir

        os.makedirs(output_dir, exist_ok=True)
        self.logger = setup_logger(output_dir)

        self.df_manifest = pd.read_csv(df_manifest_path)
        self.logger.info(f"Loaded manifest: {len(self.df_manifest)} events")

        missing_cols = [c for c in self.REQUIRED_COLUMNS if c not in self.df_manifest.columns]
        if missing_cols:
            raise ValueError(f"Manifest missing required columns: {missing_cols}. "
                             f"Ensure manifest contains: {self.REQUIRED_COLUMNS}")

        # Compute class weights
        df_filtered = self.df_manifest[self.df_manifest['hazard_type'] != 'Earthquake'].copy()
        df_filtered['hazard_idx'] = df_filtered['hazard_type'].apply(HazardEncoder.encode)
        df_filtered = df_filtered[df_filtered['hazard_idx'] >= 0]

        value_counts = df_filtered['hazard_idx'].value_counts()
        total = len(df_filtered)
        self.class_weights = {}
        for class_idx, count in value_counts.items():
            self.class_weights[class_idx] = total / (len(value_counts) * count)

    def _build_fold_directory(self, fold_data: Dict, fold_dir: str):
        """Saves lightweight CSV fold manifests with column validation."""
        os.makedirs(fold_dir, exist_ok=True)
        for split_name in ['train', 'val', 'test']:
            split_df = fold_data[split_name]
            if 'hazard_idx' not in split_df.columns and 'hazard_type' in split_df.columns:
                split_df = split_df.copy()
                split_df['hazard_idx'] = split_df['hazard_type'].apply(HazardEncoder.encode)
            split_df.to_csv(os.path.join(fold_dir, f'{split_name}_events.csv'), index=False)

    def build_event_kfold(self):
        """ NEW: Strategy 0 — Event-Based 5-Fold Stratified CV."""
        self.logger.info("\n" + "=" * 70)
        self.logger.info("STRATEGY 0: EVENT-BASED 5-FOLD STRATIFIED CV")
        self.logger.info("=" * 70)

        builder = EventBasedKFoldBuilder(self.df_manifest, self.logger)
        folds = builder.partition()

        output_base = os.path.join(self.output_dir, 'event_kfold')
        os.makedirs(output_base, exist_ok=True)

        for fold in folds:
            fold_dir = os.path.join(output_base, f"fold_{fold['fold_idx']}")
            self._build_fold_directory(fold, fold_dir)

        self.logger.info(f" Event-Based K-Fold complete: {len(folds)} folds")

    def build_spatial_lodo(self):
        self.logger.info("\n" + "=" * 70)
        self.logger.info("STRATEGY 1: SPATIAL LODO (Division-Level, 8 Folds)")
        self.logger.info("=" * 70)

        builder = SpatialLODOBuilder(self.df_manifest, self.logger)
        folds = builder.partition()

        output_base = os.path.join(self.output_dir, 'spatial_lodo')
        os.makedirs(output_base, exist_ok=True)

        for fold in folds:
            division_name = fold['division'].replace(' ', '_').replace('/', '_')
            fold_dir = os.path.join(output_base, f"lodo_division_{division_name}")
            self._build_fold_directory(fold, fold_dir)

        self.logger.info(f" Spatial LODO complete: {len(folds)} folds")

    def build_temporal_split(self):
        self.logger.info("\n" + "=" * 70)
        self.logger.info("STRATEGY 2: TEMPORAL SPLIT (Season-Adaptive Boundaries)")
        self.logger.info("=" * 70)

        builder = TemporalSplitBuilder(self.df_manifest, self.logger)
        split = builder.partition()

        output_dir = os.path.join(self.output_dir, 'temporal_split')
        self._build_fold_directory(split, output_dir)

        self.logger.info(f" Temporal Split complete")

    def build_spatio_temporal(self):
        self.logger.info("\n" + "=" * 70)
        self.logger.info("STRATEGY 3: COMBINED SPATIO-TEMPORAL (Division × Season × Era)")
        self.logger.info("=" * 70)

        builder = SpatioTemporalBuilder(self.df_manifest, self.logger)
        folds = builder.partition()

        output_base = os.path.join(self.output_dir, 'spatio_temporal')
        os.makedirs(output_base, exist_ok=True)

        for fold in folds:
            division_name = fold['division'].replace(' ', '_').replace('/', '_')
            season = fold['season']
            fold_dir = os.path.join(output_base, f"st_{division_name}_{season}")
            self._build_fold_directory(fold, fold_dir)

        self.logger.info(f" Spatio-Temporal complete: {len(folds)} folds")

    def build_all(self):
        self.logger.info("=" * 70)
        self.logger.info("HAZARDNET UNIFIED EXPERIMENTAL DATASET BUILDER")
        self.logger.info("(Event K-Fold + Division LODO + Season-Adaptive Temporal + Spatio-Temporal)")
        self.logger.info("=" * 70)
        self.logger.info(f"Total events in manifest: {len(self.df_manifest)}")

        # 1. BUILD MASTER HDF5 FILE ONCE
        master_h5_path = os.path.join(self.output_dir, 'master_tensors.h5')
        master_builder = MasterHDF5Serializer(self.tensor_dir, master_h5_path, self.logger)
        valid_ids = master_builder.build_master_hdf5(self.df_manifest)

        self.df_manifest = self.df_manifest[self.df_manifest['event_id'].astype(str).isin(valid_ids)].copy()
        self.logger.info(f"Active events after validation: {len(self.df_manifest)}")

        # 2. GENERATE ALL STRATEGY FOLDS
        self.build_event_kfold()       #  NEW
        self.build_spatial_lodo()
        self.build_temporal_split()
        self.build_spatio_temporal()

        # Save configuration
        config = {
            'master_h5_path': master_h5_path,
            'n_classes': HazardEncoder.n_classes(),
            'hazard_types': HazardEncoder.HAZARD_TYPES,
            'class_weights': {str(k): v for k, v in self.class_weights.items()},
            'seed': DataConfig.SEED,
            'n_folds_event_kfold': DataConfig.N_FOLDS,
            'target_tensor_shape': DataConfig.TARGET_TENSOR_SHAPE,
            'cropping_seasons': DataConfig.CROPPING_SEASONS,
            'season_climate_signatures': DataConfig.SEASON_CLIMATE_SIGNATURES,
            'season_temporal_splits': DataConfig.SEASON_TEMPORAL_SPLITS,
            'spatial_unit': 'division',
            'num_divisions': len(set(DataConfig.DISTRICT_TO_DIVISION.values())),
            'min_test_events': DataConfig.MIN_TEST_EVENTS,
            'strategies': ['event_kfold', 'spatial_lodo', 'temporal_split', 'spatio_temporal'],
            'note': 'Master HDF5 + CSV manifests. 4 validation strategies.'
        }

        config_path = os.path.join(self.output_dir, 'dataset_config.json')
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)

        self.logger.info(f"\n Configuration saved to: {config_path}")
        self.logger.info("\n" + "=" * 70)
        self.logger.info("ALL EXPERIMENTAL VALIDATION STRATEGIES COMPLETE")
        self.logger.info("=" * 70)

    def summary(self):
        self.logger.info("\n" + "=" * 70)
        self.logger.info("UNIFIED EXPERIMENTAL DATASET BUILDER SUMMARY")
        self.logger.info("=" * 70)
        self.logger.info(f"Total events: {len(self.df_manifest)}")
        self.logger.info(f"N classes: {HazardEncoder.n_classes()}")
        self.logger.info(f"Target Tensor Shape: {DataConfig.TARGET_TENSOR_SHAPE}")
        self.logger.info(f"Spatial Unit: Division ({len(set(DataConfig.DISTRICT_TO_DIVISION.values()))} divisions)")
        self.logger.info(f"Cropping Seasons: Kharif-I (Mar-May), Kharif-II (Jun-Oct), Rabi (Nov-Feb)")
        self.logger.info(f"Strategies: event_kfold, spatial_lodo, temporal_split, spatio_temporal")
        for season, bounds in DataConfig.SEASON_TEMPORAL_SPLITS.items():
            self.logger.info(f"  {season}: Train 2000-{bounds['train_end']} | "
                             f"Val {bounds['train_end']+1}-{bounds['val_end']} | "
                             f"Test {bounds['val_end']+1}-2025")


# ============================================================================
# PYTORCH DATASET CLASS (Worker-Safe, Augmentation-Capable)
# ============================================================================

class MasterHDF5Dataset(Dataset):
    """
    Worker-safe, augmentation-capable PyTorch Dataset reading from Master HDF5.

    Features:
    - Worker-safe file handle via get_worker_info()
    - Returns 5 values: (tensor, label, severity, confidence, event_id)
    - Causality-preserving augmentation (brightness, contrast, temporal shift)
    - Nearest-neighbor spatial resize to prevent mask bleeding
    """

    def __init__(self, csv_path: str, master_h5_path: str, augment: bool = False):
        self.df = pd.read_csv(csv_path)
        self.master_h5_path = master_h5_path
        self.augment = augment
        self.h5f = None
        self._worker_id = None

        self.brightness = DataConfig.AUGMENT_PARAMS['brightness']
        self.contrast = DataConfig.AUGMENT_PARAMS['contrast']
        self.temporal_shift = DataConfig.AUGMENT_PARAMS['temporal_shift']
        self.target_shape = DataConfig.TARGET_TENSOR_SHAPE

    def _open_h5(self):
        worker_info = get_worker_info()
        current_worker_id = worker_info.id if worker_info is not None else -1

        if self.h5f is None or self._worker_id != current_worker_id:
            if self.h5f is not None:
                self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, 'r', rdcc_nbytes=1024**2*10)
            self._worker_id = current_worker_id

    def __len__(self):
        return len(self.df)

    def _resize_spatial(self, tensor: torch.Tensor) -> torch.Tensor:
        c, t, h, w = tensor.shape
        target_h, target_w = self.target_shape[2], self.target_shape[3]
        if h == target_h and w == target_w:
            return tensor
        tensor_reshaped = tensor.permute(1, 0, 2, 3).reshape(t * c, 1, h, w).contiguous()
        resized = F.interpolate(tensor_reshaped, size=(target_h, target_w), mode='nearest')
        return resized.reshape(t, c, target_h, target_w).permute(1, 0, 2, 3).contiguous()

    def _augment(self, tensor: torch.Tensor) -> torch.Tensor:
        if np.random.rand() > 0.5:
            shift = np.random.uniform(-self.brightness, self.brightness)
            tensor = tensor + shift

        if np.random.rand() > 0.5:
            factor = 1.0 + np.random.uniform(-self.contrast, self.contrast)
            mean = tensor.mean(dim=[-1, -2], keepdim=True)
            tensor = (tensor - mean) * factor + mean

        if np.random.rand() > 0.5:
            shift = np.random.randint(-self.temporal_shift, self.temporal_shift + 1)
            if shift > 0:
                boundary = tensor[:, 0:1, :, :].repeat(1, shift, 1, 1)
                tensor = torch.cat([boundary, tensor[:, :-shift, :, :]], dim=1)
            elif shift < 0:
                abs_shift = abs(shift)
                boundary = tensor[:, -1:, :, :].repeat(1, abs_shift, 1, 1)
                tensor = torch.cat([tensor[:, abs_shift:, :, :], boundary], dim=1)

        return tensor

    def __getitem__(self, idx):
        self._open_h5()

        row = self.df.iloc[idx]
        event_id = str(row['event_id'])

        tensor = torch.from_numpy(self.h5f['tensors'][event_id][:]).float()
        label = int(row['hazard_idx'])
        severity = float(row.get('severity_index', 0.0))
        confidence = float(row.get('confidence', 0.5))

        tensor = self._resize_spatial(tensor)

        if self.augment:
            tensor = self._augment(tensor)

        return tensor, label, severity, confidence, event_id

    def __del__(self):
        if self.h5f is not None:
            self.h5f.close()


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == '__main__':
    MANIFEST_PATH = '/kaggle/working/tensors_output/tensor_manifest.csv'
    TENSOR_DIR = '/kaggle/working/tensors_output/tensors'
    MASTER_OUTPUT_DIR = os.path.join(OUTPUT_DIR, 'HazardNet_Event_Based_Datasets')

    builder = ExperimentalDatasetBuilder(MANIFEST_PATH, TENSOR_DIR, MASTER_OUTPUT_DIR)
    builder.build_all()
    builder.summary()

    print("\n All experimental datasets ready!")
    print(f"   • Master HDF5 File: {os.path.join(OUTPUT_DIR, 'master_tensors.h5')}")
    print("   • Event K-Fold: 5-fold stratified CV (IEEE TGRS Table II)")
    print("   • Spatial LODO: Division-level, 8 folds (IEEE TGRS Table III)")
    print("   • Temporal Split: Season-adaptive boundaries (IEEE TGRS Table IV)")
    print("   • Spatio-Temporal: Division × Season × Era, up to 24 folds (IEEE TGRS Table V)")
    print("\n Usage in training:")
    print("   dataset = MasterHDF5Dataset(csv_path, master_h5_path, augment=True)")
    print("   loader = DataLoader(dataset, batch_size=16, num_workers=2)")
```

---

## Phase 4

### HazardNet Ablation Study

```python
"""
================================================================================
HazardNet Ablation Study: Components A1-A4 Only
================================================================================
PURPOSE: Run ablations A1-A4 using existing event k-fold splits.
         Skips A0 (baseline already completed).
         Auto-computes deltas against existing A0 results.
         All ablations use augmentation=True to isolate architectural effects.

ABLATIONS INCLUDED:
  A1: No SE Attention Blocks
  A2: Standard Conv3d (replace Depthwise-Separable)
  A3: No Temporal Preservation (pool time immediately in Block 1)
  A4: Classification Only (remove severity head + loss)

USAGE IN KAGGLE NOTEBOOK:
  ABLATION = 'all'  # Options: 'A1_No_SE_Attention' ... 'A4_Classification_Only' or 'all'
  main()
================================================================================
"""

import os
import json
import glob
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, get_worker_info
from sklearn.metrics import (accuracy_score, f1_score, mean_squared_error,
                             mean_absolute_error, r2_score)
from tqdm import tqdm
import h5py


# ============================================================================
# CONFIGURATION
# ============================================================================
class TrainConfig:
    EXPERIMENTAL_DIR = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/event_kfold'
    MASTER_H5_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/master_tensors.h5'
    CONFIG_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/dataset_config.json'
    OUTPUT_DIR = '/kaggle/working/HazardNet_Ablation_Results'

    # Path to existing A0 baseline results for delta computation
    A0_RESULTS_CSV = '/kaggle/input/models/ashifahmedshuvo/hazardnet-pytorch/pytorch/default/1/HazardNet_Experimental_Results/event_kfold/event_kfold_results.csv'

    BATCH_SIZE = 16
    NUM_EPOCHS = 1
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-4
    PATIENCE = 10
    GRAD_CLIP = 1.0
    NUM_WORKERS = 2
    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')


os.makedirs(TrainConfig.OUTPUT_DIR, exist_ok=True)

HAZARD_TYPES = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
]


# ============================================================================
# ABLATION CONFIGURATION REGISTRY (4 Studies + Complete)
# ============================================================================
ABLATION_CONFIGS = {
    'A1_No_SE_Attention': {
        'description': 'Remove Squeeze-and-Excitation blocks',
        'model_kwargs': {'use_se': False},
        'loss_kwargs': {},
        'augment': True,
    },
    'A2_Standard_Conv3d': {
        'description': 'Replace depthwise-separable with standard Conv3d',
        'model_kwargs': {'use_depthwise': False},
        'loss_kwargs': {},
        'augment': True,
    },
    'A3_No_Temporal_Preservation': {
        'description': 'Pool temporal dimension immediately in Block 1',
        'model_kwargs': {'preserve_temporal': False},
        'loss_kwargs': {},
        'augment': True,
    },
    'A4_Classification_Only': {
        'description': 'Remove severity head and severity loss',
        'model_kwargs': {'use_severity': False},
        'loss_kwargs': {'severity_weight': 0.0},
        'augment': True,
    },
}


# ============================================================================
# ABLATABLE ARCHITECTURE COMPONENTS
# ============================================================================
class DepthwiseSeparableConv3d(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv3d(in_ch, in_ch, kernel_size, padding=padding, groups=in_ch, bias=False)
        self.pointwise = nn.Conv3d(in_ch, out_ch, 1, bias=False)
        self.bn = nn.BatchNorm3d(out_ch)

    def forward(self, x):
        return self.bn(self.pointwise(self.depthwise(x)))


class StandardConv3dBlock(nn.Module):
    """A2 replacement: Standard Conv3d instead of Depthwise-Separable."""
    def __init__(self, in_ch, out_ch, kernel_size=3, padding=1):
        super().__init__()
        self.conv = nn.Conv3d(in_ch, out_ch, kernel_size, padding=padding, bias=False)
        self.bn = nn.BatchNorm3d(out_ch)

    def forward(self, x):
        return self.bn(self.conv(x))


class SEBlock3D(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool3d(1), nn.Flatten(),
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid())

    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1).unsqueeze(-1)
        return x * w


class IdentitySE(nn.Module):
    """A1 replacement: No-op SE block. Accepts channels arg for API compatibility."""
    def __init__(self, channels=None):
        super().__init__()

    def forward(self, x):
        return x


class HazardNetAblatable(nn.Module):
    def __init__(self, in_channels=15, num_hazards=8,
                 use_se=True, use_depthwise=True,
                 preserve_temporal=True, use_severity=True):
        super().__init__()
        self.num_hazards = num_hazards
        self.use_severity = use_severity

        ConvBlock = DepthwiseSeparableConv3d if use_depthwise else StandardConv3dBlock
        SE = SEBlock3D if use_se else IdentitySE
        pool1_kernel = (1, 2, 2) if preserve_temporal else (2, 2, 2)

        self.block1 = nn.Sequential(
            ConvBlock(in_channels, 32), nn.ReLU(True), SE(32), nn.MaxPool3d(pool1_kernel))
        self.block2 = nn.Sequential(
            ConvBlock(32, 64), nn.ReLU(True), SE(64), nn.MaxPool3d((2, 2, 2)))
        self.block3 = nn.Sequential(
            ConvBlock(64, 128), nn.ReLU(True), SE(128), nn.MaxPool3d((1, 2, 2)))
        self.block4 = nn.Sequential(
            ConvBlock(128, 256), nn.ReLU(True), SE(256), nn.MaxPool3d((1, 2, 2)))

        self.global_pool = nn.AdaptiveAvgPool3d(1)
        self.shared_fc = nn.Sequential(nn.Linear(256, 128), nn.ReLU(True), nn.Dropout(0.3))
        self.hazard_head = nn.Linear(128, num_hazards)

        if use_severity:
            self.severity_head = nn.Sequential(
                nn.Linear(128, 64), nn.ReLU(True), nn.Linear(64, 1), nn.Sigmoid())
        else:
            self.severity_head = None

    def forward(self, x):
        x = self.block4(self.block3(self.block2(self.block1(x))))
        x = self.global_pool(x).view(x.size(0), -1)
        x = self.shared_fc(x)
        hazard = self.hazard_head(x)
        severity = self.severity_head(x).squeeze(1) if self.severity_head is not None \
            else torch.zeros(x.size(0), device=x.device)
        return hazard, severity

    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ============================================================================
# LOSS FUNCTION
# ============================================================================
class AblatableMTLLoss(nn.Module):
    def __init__(self, severity_weight=1.0):
        super().__init__()
        self.log_vars = nn.Parameter(torch.zeros(2))
        self.ce_loss = nn.CrossEntropyLoss(reduction='none')
        self.huber_loss = nn.SmoothL1Loss(reduction='none')
        self.severity_weight = severity_weight

    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        loss_cls = self.ce_loss(hazard_pred, hazard_true)
        loss_reg = self.huber_loss(severity_pred, severity_true)
        loss_cls_conf = (loss_cls * confidence).mean()
        loss_reg_conf = (loss_reg * confidence).mean() * self.severity_weight
        prec_cls = torch.exp(-self.log_vars[0])
        prec_reg = torch.exp(-self.log_vars[1])
        total = (prec_cls * loss_cls_conf + self.log_vars[0]) + \
                (prec_reg * loss_reg_conf + self.log_vars[1])
        return total, loss_cls_conf.item(), loss_reg_conf.item()


# ============================================================================
# DATASET (Identical to main pipeline)
# ============================================================================
class MasterHDF5Dataset(Dataset):
    def __init__(self, csv_path, master_h5_path, augment=False):
        self.df = pd.read_csv(csv_path)
        self.master_h5_path = master_h5_path
        self.augment = augment
        self.h5f = None
        self._worker_id = None
        self.brightness, self.contrast, self.temporal_shift = 0.1, 0.1, 1
        self.target_shape = (15, 10, 64, 64)

    def _open_h5(self):
        wid = get_worker_info().id if get_worker_info() else -1
        if self.h5f is None or self._worker_id != wid:
            if self.h5f:
                self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, 'r', rdcc_nbytes=1024**2*10)
            self._worker_id = wid

    def __len__(self):
        return len(self.df)

    def _resize_spatial(self, tensor):
        c, t, h, w = tensor.shape
        th, tw = self.target_shape[2], self.target_shape[3]
        if h == th and w == tw:
            return tensor
        r = tensor.permute(1, 0, 2, 3).reshape(t * c, 1, h, w)
        r = F.interpolate(r, size=(th, tw), mode='nearest')
        return r.reshape(t, c, th, tw).permute(1, 0, 2, 3).contiguous()

    def _augment(self, tensor):
        if np.random.rand() > 0.5:
            tensor = tensor + np.random.uniform(-self.brightness, self.brightness)
        if np.random.rand() > 0.5:
            f = 1.0 + np.random.uniform(-self.contrast, self.contrast)
            m = tensor.mean(dim=[-1, -2], keepdim=True)
            tensor = (tensor - m) * f + m
        if np.random.rand() > 0.5:
            s = np.random.randint(-self.temporal_shift, self.temporal_shift + 1)
            if s > 0:
                b = tensor[:, 0:1, :, :].repeat(1, s, 1, 1)
                tensor = torch.cat([b, tensor[:, :-s, :, :]], dim=1)
            elif s < 0:
                a = abs(s)
                b = tensor[:, -1:, :, :].repeat(1, a, 1, 1)
                tensor = torch.cat([tensor[:, a:, :, :], b], dim=1)
        return tensor

    def __getitem__(self, idx):
        self._open_h5()
        row = self.df.iloc[idx]
        eid = str(row['event_id'])
        tensor = torch.from_numpy(self.h5f[f'tensors/{eid}'][:]).float()
        label = int(row['hazard_idx'])
        severity = float(row.get('severity_index', 0.0))
        confidence = float(row.get('confidence', 0.5))
        tensor = self._resize_spatial(tensor)
        if self.augment:
            tensor = self._augment(tensor)
        return tensor, label, severity, confidence, eid

    def __del__(self):
        if self.h5f:
            self.h5f.close()


# ============================================================================
# METRICS TRACKER
# ============================================================================
class EnhancedMetricsTracker:
    def __init__(self):
        self.reset()

    def reset(self):
        self.total_losses, self.cls_losses, self.reg_losses = [], [], []
        self.hazard_preds, self.hazard_targets = [], []
        self.severity_preds, self.severity_targets = [], []

    def update(self, tl, cl, rl, hp, ht, sp, st):
        self.total_losses.append(tl)
        self.cls_losses.append(cl)
        self.reg_losses.append(rl)
        self.hazard_preds.extend(hp)
        self.hazard_targets.extend(ht)
        self.severity_preds.extend(sp)
        self.severity_targets.extend(st)

    def get_summary(self):
        h_acc = accuracy_score(self.hazard_targets, self.hazard_preds)
        h_f1 = f1_score(self.hazard_targets, self.hazard_preds, average='weighted', zero_division=0)
        s_mse = mean_squared_error(self.severity_targets, self.severity_preds)
        return {
            'loss_total': np.mean(self.total_losses),
            'hazard_accuracy': h_acc,
            'hazard_f1': h_f1,
            'severity_rmse': np.sqrt(s_mse),
            'severity_mae': mean_absolute_error(self.severity_targets, self.severity_preds),
            'severity_r2': r2_score(self.severity_targets, self.severity_preds),
        }


# ============================================================================
# TRAINING AND EVALUATION FUNCTIONS
# ============================================================================
def train_epoch(model, loader, optimizer, criterion, device):
    model.train()
    metrics = EnhancedMetricsTracker()
    pbar = tqdm(loader, desc="Train", unit="batch")
    for tensors, cls_idx, severity, confidence, _ in pbar:
        tensors, cls_idx, severity, confidence = [
            t.to(device) for t in [tensors, cls_idx, severity, confidence]]
        optimizer.zero_grad()
        h_pred, s_pred = model(tensors)
        total, cl, rl = criterion(h_pred, s_pred, cls_idx, severity, confidence)
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=TrainConfig.GRAD_CLIP)
        optimizer.step()
        metrics.update(total.item(), cl, rl,
                       h_pred.detach().argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                       s_pred.detach().cpu().numpy(), severity.cpu().numpy())
        pbar.set_postfix({'loss': f"{total.item():.4f}"})
    return metrics


def evaluate(model, loader, criterion, device, name="Val"):
    model.eval()
    metrics = EnhancedMetricsTracker()
    with torch.no_grad():
        pbar = tqdm(loader, desc=name, unit="batch")
        for tensors, cls_idx, severity, confidence, _ in pbar:
            tensors, cls_idx, severity, confidence = [
                t.to(device) for t in [tensors, cls_idx, severity, confidence]]
            h_pred, s_pred = model(tensors)
            total, cl, rl = criterion(h_pred, s_pred, cls_idx, severity, confidence)
            metrics.update(total.item(), cl, rl,
                           h_pred.argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                           s_pred.cpu().numpy(), severity.cpu().numpy())
            pbar.set_postfix({'loss': f"{total.item():.4f}"})
    return metrics


# ============================================================================
# SINGLE ABLATION RUNNER (5-Fold CV)
# ============================================================================
def run_ablation(ablation_key, num_classes):
    cfg = ABLATION_CONFIGS[ablation_key]
    safe_name = ablation_key.replace(' ', '_')
    ablation_output = os.path.join(TrainConfig.OUTPUT_DIR, safe_name)
    os.makedirs(ablation_output, exist_ok=True)

    print(f"\n{'='*70}")
    print(f"ABLATION: {cfg['description']}")
    print(f"{'='*70}")

    fold_results = []
    for fold_idx in range(5):
        fold_dir = os.path.join(TrainConfig.EXPERIMENTAL_DIR, f'fold_{fold_idx}')
        if not os.path.exists(fold_dir):
            print(f"  Skipping fold_{fold_idx}: not found")
            continue

        train_loader = DataLoader(
            MasterHDF5Dataset(
                os.path.join(fold_dir, 'train_events.csv'),
                TrainConfig.MASTER_H5_PATH, cfg['augment']),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=True,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
        val_loader = DataLoader(
            MasterHDF5Dataset(
                os.path.join(fold_dir, 'val_events.csv'),
                TrainConfig.MASTER_H5_PATH, False),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
        test_loader = DataLoader(
            MasterHDF5Dataset(
                os.path.join(fold_dir, 'test_events.csv'),
                TrainConfig.MASTER_H5_PATH, False),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)

        model = HazardNetAblatable(15, num_classes, **cfg['model_kwargs']).to(TrainConfig.DEVICE)
        criterion = AblatableMTLLoss(**cfg['loss_kwargs']).to(TrainConfig.DEVICE)
        optimizer = AdamW(
            [{'params': model.parameters()}, {'params': criterion.log_vars}],
            lr=TrainConfig.LEARNING_RATE, weight_decay=TrainConfig.WEIGHT_DECAY)
        scheduler = CosineAnnealingLR(optimizer, T_max=TrainConfig.NUM_EPOCHS, eta_min=1e-6)

        params = model.count_parameters()
        best_val_loss, patience_counter, best_epoch = float('inf'), 0, 0
        ckpt_path = os.path.join(ablation_output, f'{safe_name}_fold{fold_idx}_best.pt')

        for epoch in range(TrainConfig.NUM_EPOCHS):
            tr = train_epoch(model, train_loader, optimizer, criterion, TrainConfig.DEVICE)
            vr = evaluate(model, val_loader, criterion, TrainConfig.DEVICE, "Val")
            scheduler.step()
            ts, vs = tr.get_summary(), vr.get_summary()

            if vs['loss_total'] < best_val_loss:
                best_val_loss = vs['loss_total']
                patience_counter = 0
                best_epoch = epoch + 1
                torch.save(model.state_dict(), ckpt_path)
            else:
                patience_counter += 1
                if patience_counter >= TrainConfig.PATIENCE:
                    print(f"  Fold {fold_idx}: Early stop @ epoch {epoch+1} (best: {best_epoch})")
                    break

            if (epoch + 1) % 10 == 0 or epoch == 0:
                print(f"  Fold {fold_idx} Epoch {epoch+1:2d} | "
                      f"Train Acc:{ts['hazard_accuracy']:.3f} | "
                      f"Val Acc:{vs['hazard_accuracy']:.3f}")

        model.load_state_dict(torch.load(ckpt_path))
        test_m = evaluate(model, test_loader, criterion, TrainConfig.DEVICE, "Test").get_summary()
        print(f"  Fold {fold_idx} Test: Acc={test_m['hazard_accuracy']:.4f} "
              f"F1={test_m['hazard_f1']:.4f} "
              f"RMSE={test_m['severity_rmse']:.4f} "
              f"R2={test_m['severity_r2']:.4f}")

        fold_results.append({**test_m, 'params': params, 'fold': fold_idx})

    accs = [r['hazard_accuracy'] for r in fold_results]
    f1s = [r['hazard_f1'] for r in fold_results]
    rmses = [r['severity_rmse'] for r in fold_results]
    r2s = [r['severity_r2'] for r in fold_results]

    summary = {
        'ablation': ablation_key,
        'description': cfg['description'],
        'params': fold_results[0]['params'] if fold_results else 0,
        'accuracy_mean': np.mean(accs), 'accuracy_std': np.std(accs),
        'f1_mean': np.mean(f1s), 'f1_std': np.std(f1s),
        'rmse_mean': np.mean(rmses), 'rmse_std': np.std(rmses),
        'r2_mean': np.mean(r2s), 'r2_std': np.std(r2s),
    }

    pd.DataFrame(fold_results).to_csv(
        os.path.join(ablation_output, f'{safe_name}_results.csv'), index=False)

    print(f"\n  {cfg['description']} Summary (5 folds):")
    print(f"    Accuracy: {summary['accuracy_mean']:.4f} +/- {summary['accuracy_std']:.4f}")
    print(f"    F1-Score: {summary['f1_mean']:.4f} +/- {summary['f1_std']:.4f}")
    print(f"    RMSE:     {summary['rmse_mean']:.4f} +/- {summary['rmse_std']:.4f}")
    print(f"    R2:       {summary['r2_mean']:.4f} +/- {summary['r2_std']:.4f}")
    print(f"    Params:   {summary['params']:,}")
    return summary


# ============================================================================
# DELTA COMPUTATION AGAINST EXISTING A0 BASELINE
# ============================================================================
def compute_deltas(all_summaries):
    """Load existing A0 results and compute deltas for Table VI."""
    baseline = None

    if os.path.exists(TrainConfig.A0_RESULTS_CSV):
        try:
            a0_df = pd.read_csv(TrainConfig.A0_RESULTS_CSV)
            baseline = {
                'accuracy_mean': a0_df['accuracy'].mean(),
                'f1_mean': a0_df['f1'].mean(),
                'rmse_mean': a0_df['rmse'].mean(),
                'r2_mean': a0_df['r2'].mean(),
                'params': 136670
            }
            print(f"Loaded A0 baseline from {TrainConfig.A0_RESULTS_CSV}")
        except Exception as e:
            print(f"Could not load A0 CSV: {e}")

    if baseline is None:
        print("A0 baseline not found. Deltas will be marked as N/A")
        return None

    rows = []
    for s in all_summaries:
        row = {
            'ID': s['ablation'].split('_')[0],
            'Component Removed': s['description'],
            'Params': f"{s['params']:,}",
            'Accuracy': f"{s['accuracy_mean']:.4f} +/- {s['accuracy_std']:.4f}",
            'F1-Score': f"{s['f1_mean']:.4f} +/- {s['f1_std']:.4f}",
            'RMSE': f"{s['rmse_mean']:.4f} +/- {s['rmse_std']:.4f}",
            'R2': f"{s['r2_mean']:.4f} +/- {s['r2_std']:.4f}",
            'Delta Accuracy': f"{s['accuracy_mean'] - baseline['accuracy_mean']:+.4f}",
            'Delta F1': f"{s['f1_mean'] - baseline['f1_mean']:+.4f}",
            'Delta RMSE': f"{s['rmse_mean'] - baseline['rmse_mean']:+.4f}",
            'Delta Params': f"{((s['params'] - baseline['params']) / baseline['params']) * 100:+.1f}%"
        }
        rows.append(row)
    return pd.DataFrame(rows)


# ============================================================================
# MAIN ORCHESTRATOR
# ============================================================================
ABLATION = 'all'  # SET HERE: specific ablation key or 'all'


def main():
    print("=" * 80)
    print("HAZARDNET ABLATION STUDY -- A1-A4 ONLY (IEEE TGRS Table VI)")
    print("=" * 80)

    with open(TrainConfig.CONFIG_PATH, 'r') as f:
        config = json.load(f)
    num_classes = config['n_classes']

    print(f"  Classes ({num_classes}): {config['hazard_types']}")
    print(f"  Master HDF5: {TrainConfig.MASTER_H5_PATH}")
    print(f"  Device: {TrainConfig.DEVICE}")
    print(f"  Ablations: {len(ABLATION_CONFIGS)} (A1-A4 only, A0 skipped)")

    if ABLATION == 'all':
        ablation_keys = list(ABLATION_CONFIGS.keys())
    else:
        if ABLATION not in ABLATION_CONFIGS:
            raise ValueError(
                f"Unknown ablation '{ABLATION}'. "
                f"Choose from: {list(ABLATION_CONFIGS.keys())}")
        ablation_keys = [ABLATION]

    all_summaries = []
    for key in ablation_keys:
        summary = run_ablation(key, num_classes)
        all_summaries.append(summary)

    # Generate IEEE TGRS Table VI with deltas
    print(f"\n{'='*80}")
    print("ABLATION STUDY RESULTS (IEEE TGRS Table VI)")
    print(f"{'='*80}")

    df_table = compute_deltas(all_summaries)
    if df_table is not None:
        print(df_table.to_string(index=False))
        table_path = os.path.join(TrainConfig.OUTPUT_DIR, 'ablation_study_table_vi.csv')
        df_table.to_csv(table_path, index=False)
        print(f"\nTable VI saved to: {table_path}")
    else:
        rows = []
        for s in all_summaries:
            rows.append({
                'ID': s['ablation'].split('_')[0],
                'Component Removed': s['description'],
                'Params': f"{s['params']:,}",
                'Accuracy': f"{s['accuracy_mean']:.4f} +/- {s['accuracy_std']:.4f}",
                'F1-Score': f"{s['f1_mean']:.4f} +/- {s['f1_std']:.4f}",
                'RMSE': f"{s['rmse_mean']:.4f} +/- {s['rmse_std']:.4f}",
                'R2': f"{s['r2_mean']:.4f} +/- {s['r2_std']:.4f}",
            })
        df_fallback = pd.DataFrame(rows)
        print(df_fallback.to_string(index=False))
        table_path = os.path.join(TrainConfig.OUTPUT_DIR, 'ablation_study_table_vi_no_deltas.csv')
        df_fallback.to_csv(table_path, index=False)
        print(f"\nTable VI (no deltas) saved to: {table_path}")

    print(f"\nAblation study complete! ({len(all_summaries)} ablations evaluated)")


if __name__ == '__main__':
    main()
```

---

## Phase 5

### HazardNet Unified Experimental Training Pipeline

```python
"""
================================================================================
HazardNet Unified Experimental Training Pipeline (Q1 Journal Edition)
================================================================================

INTEGRATED FEATURES:
  • W&B Kaggle Secrets Integration (robust fallback)
  • Enhanced Publication Metrics (Per-class, Severity Quartiles, R²)
  • Publication Figure Generator (Confusion Matrix, Scatter, Spatial Heatmap)
  • 4 Validation Strategies: Event K-Fold, Spatial LODO, Temporal, Spatio-Temporal

USAGE IN KAGGLE NOTEBOOK CELL:
  STRATEGY = 'spatial_lodo'  # Change per session
  main()
================================================================================
"""

import os
import json
import glob
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, get_worker_info
from sklearn.metrics import (accuracy_score, f1_score, precision_score, recall_score,
                             mean_squared_error, mean_absolute_error, confusion_matrix,
                             r2_score)
from tqdm import tqdm
import h5py
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================================================
# WEIGHTS & BIASES INITIALIZATION (Kaggle Secrets Integration)
# ============================================================================
WANDB_ENABLED = False
try:
    from kaggle_secrets import UserSecretsClient
    os.environ["WANDB_API_KEY"] = UserSecretsClient().get_secret("WANDB_API_KEY")
    import wandb
    WANDB_ENABLED = True
    print("✅ W&B API key loaded from Kaggle Secrets")
except Exception as e:
    print(f"⚠️ Could not load W&B API key: {e}")
    print("   Training will proceed without W&B logging.")


# ============================================================================
# CONFIGURATION
# ============================================================================
class TrainConfig:
    EXPERIMENTAL_DIR = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets'
    MASTER_H5_PATH = os.path.join(EXPERIMENTAL_DIR, 'master_tensors.h5')
    CONFIG_PATH = os.path.join(EXPERIMENTAL_DIR, 'dataset_config.json')
    OUTPUT_DIR = '/kaggle/working/HazardNet_Experimental_Results'

    BATCH_SIZE = 16
    NUM_EPOCHS = 50
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-4
    PATIENCE = 10
    GRAD_CLIP = 1.0
    NUM_WORKERS = 2
    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

os.makedirs(TrainConfig.OUTPUT_DIR, exist_ok=True)

HAZARD_TYPES = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
]


# ============================================================================
# HAZARDNET ARCHITECTURE
# ============================================================================
class DepthwiseSeparableConv3d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv3d(in_channels, in_channels, kernel_size,
                                   padding=padding, groups=in_channels, bias=False)
        self.pointwise = nn.Conv3d(in_channels, out_channels, kernel_size=1, bias=False)
        self.bn = nn.BatchNorm3d(out_channels)

    def forward(self, x):
        return self.bn(self.pointwise(self.depthwise(x)))


class SEBlock3D(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool3d(1), nn.Flatten(),
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid())

    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1).unsqueeze(-1)
        return x * w


class HazardNetCNN(nn.Module):
    def __init__(self, in_channels=15, num_hazards=8):
        super().__init__()
        self.block1 = nn.Sequential(
            DepthwiseSeparableConv3d(in_channels, 32), nn.ReLU(True),
            SEBlock3D(32), nn.MaxPool3d((1, 2, 2)))
        self.block2 = nn.Sequential(
            DepthwiseSeparableConv3d(32, 64), nn.ReLU(True),
            SEBlock3D(64), nn.MaxPool3d((2, 2, 2)))
        self.block3 = nn.Sequential(
            DepthwiseSeparableConv3d(64, 128), nn.ReLU(True),
            SEBlock3D(128), nn.MaxPool3d((1, 2, 2)))
        self.block4 = nn.Sequential(
            DepthwiseSeparableConv3d(128, 256), nn.ReLU(True),
            SEBlock3D(256), nn.MaxPool3d((1, 2, 2)))
        self.global_pool = nn.AdaptiveAvgPool3d(1)
        self.shared_fc = nn.Sequential(nn.Linear(256, 128), nn.ReLU(True), nn.Dropout(0.3))
        self.hazard_head = nn.Linear(128, num_hazards)
        self.severity_head = nn.Sequential(nn.Linear(128, 64), nn.ReLU(True), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, x):
        x = self.block4(self.block3(self.block2(self.block1(x))))
        x = self.global_pool(x).view(x.size(0), -1)
        x = self.shared_fc(x)
        return self.hazard_head(x), self.severity_head(x).squeeze(1)

    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ============================================================================
# LOSS FUNCTION
# ============================================================================
class HomoscedasticMTLLoss(nn.Module):
    def __init__(self):
        super().__init__()
        self.log_vars = nn.Parameter(torch.zeros(2))
        self.ce_loss = nn.CrossEntropyLoss(reduction='none')
        self.huber_loss = nn.SmoothL1Loss(reduction='none')

    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        loss_cls = self.ce_loss(hazard_pred, hazard_true)
        loss_reg = self.huber_loss(severity_pred, severity_true)
        loss_cls_conf = (loss_cls * confidence).mean()
        loss_reg_conf = (loss_reg * confidence).mean()
        prec_cls = torch.exp(-self.log_vars[0])
        prec_reg = torch.exp(-self.log_vars[1])
        total = (prec_cls * loss_cls_conf + self.log_vars[0]) + \
                (prec_reg * loss_reg_conf + self.log_vars[1])
        return total, loss_cls_conf.item(), loss_reg_conf.item()


# ============================================================================
# MASTER HDF5 DATASET
# ============================================================================
class MasterHDF5Dataset(Dataset):
    def __init__(self, csv_path, master_h5_path, augment=False):
        self.df = pd.read_csv(csv_path)
        self.master_h5_path = master_h5_path
        self.augment = augment
        self.h5f = None
        self._worker_id = None
        self.brightness, self.contrast, self.temporal_shift = 0.1, 0.1, 1
        self.target_shape = (15, 10, 64, 64)

    def _open_h5(self):
        wid = get_worker_info().id if get_worker_info() else -1
        if self.h5f is None or self._worker_id != wid:
            if self.h5f: self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, 'r', rdcc_nbytes=1024**2*10)
            self._worker_id = wid

    def __len__(self): return len(self.df)

    def _resize_spatial(self, tensor):
        c, t, h, w = tensor.shape
        th, tw = self.target_shape[2], self.target_shape[3]
        if h == th and w == tw: return tensor
        r = tensor.permute(1,0,2,3).reshape(t*c,1,h,w)
        r = F.interpolate(r, size=(th,tw), mode='nearest')
        return r.reshape(t,c,th,tw).permute(1,0,2,3).contiguous()

    def _augment(self, tensor):
        if np.random.rand() > 0.5:
            tensor = tensor + np.random.uniform(-self.brightness, self.brightness)
        if np.random.rand() > 0.5:
            f = 1.0 + np.random.uniform(-self.contrast, self.contrast)
            m = tensor.mean(dim=[-1,-2], keepdim=True)
            tensor = (tensor - m) * f + m
        if np.random.rand() > 0.5:
            s = np.random.randint(-self.temporal_shift, self.temporal_shift+1)
            if s > 0:
                b = tensor[:,0:1,:,:].repeat(1,s,1,1)
                tensor = torch.cat([b, tensor[:,:-s,:,:]], dim=1)
            elif s < 0:
                a = abs(s); b = tensor[:,-1:,:,:].repeat(1,a,1,1)
                tensor = torch.cat([tensor[:,a:,:,:], b], dim=1)
        return tensor

    def __getitem__(self, idx):
        self._open_h5()
        row = self.df.iloc[idx]
        eid = str(row['event_id'])
        tensor = torch.from_numpy(self.h5f['tensors'][eid][:]).float()
        label = int(row['hazard_idx'])
        severity = float(row.get('severity_index', 0.0))
        confidence = float(row.get('confidence', 0.5))
        tensor = self._resize_spatial(tensor)
        if self.augment: tensor = self._augment(tensor)
        return tensor, label, severity, confidence, eid

    def __del__(self):
        if self.h5f: self.h5f.close()


# ============================================================================
# ENHANCED METRICS TRACKER (Q1 Journal Grade)
# ============================================================================
class EnhancedMetricsTracker:
    def __init__(self):
        self.reset()

    def reset(self):
        self.total_losses, self.cls_losses, self.reg_losses = [], [], []
        self.hazard_preds, self.hazard_targets = [], []
        self.severity_preds, self.severity_targets = [], []

    def update(self, total_loss, cls_loss, reg_loss, h_pred, h_true, s_pred, s_true):
        self.total_losses.append(total_loss)
        self.cls_losses.append(cls_loss)
        self.reg_losses.append(reg_loss)
        self.hazard_preds.extend(h_pred)
        self.hazard_targets.extend(h_true)
        self.severity_preds.extend(s_pred)
        self.severity_targets.extend(s_true)

    def get_summary(self):
        h_acc = accuracy_score(self.hazard_targets, self.hazard_preds)
        h_f1 = f1_score(self.hazard_targets, self.hazard_preds, average='weighted', zero_division=0)
        s_mse = mean_squared_error(self.severity_targets, self.severity_preds)
        return {
            'loss_total': np.mean(self.total_losses),
            'loss_cls': np.mean(self.cls_losses),
            'loss_reg': np.mean(self.reg_losses),
            'hazard_accuracy': h_acc, 'hazard_f1': h_f1,
            'severity_mse': s_mse, 'severity_rmse': np.sqrt(s_mse),
            'severity_mae': mean_absolute_error(self.severity_targets, self.severity_preds),
            'severity_r2': r2_score(self.severity_targets, self.severity_preds),
        }

    def get_per_class_metrics(self):
        prec = precision_score(self.hazard_targets, self.hazard_preds,
                               average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        rec = recall_score(self.hazard_targets, self.hazard_preds,
                           average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        f1 = f1_score(self.hazard_targets, self.hazard_preds,
                      average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        support = np.bincount(self.hazard_targets, minlength=len(HAZARD_TYPES))
        rows = []
        for i, name in enumerate(HAZARD_TYPES):
            rows.append({'Hazard': name, 'Precision': prec[i], 'Recall': rec[i],
                         'F1-Score': f1[i], 'Support': support[i]})
        rows.append({'Hazard': 'Macro Avg',
                     'Precision': precision_score(self.hazard_targets, self.hazard_preds, average='macro', zero_division=0),
                     'Recall': recall_score(self.hazard_targets, self.hazard_preds, average='macro', zero_division=0),
                     'F1-Score': f1_score(self.hazard_targets, self.hazard_preds, average='macro', zero_division=0),
                     'Support': sum(support)})
        rows.append({'Hazard': 'Weighted Avg',
                     'Precision': precision_score(self.hazard_targets, self.hazard_preds, average='weighted', zero_division=0),
                     'Recall': recall_score(self.hazard_targets, self.hazard_preds, average='weighted', zero_division=0),
                     'F1-Score': f1_score(self.hazard_targets, self.hazard_preds, average='weighted', zero_division=0),
                     'Support': sum(support)})
        return pd.DataFrame(rows)

    def get_severity_error_by_quartile(self):
        targets = np.array(self.severity_targets)
        preds = np.array(self.severity_preds)
        if len(targets) == 0: return pd.DataFrame()
        quartiles = np.percentile(targets, [25, 50, 75])
        bins = [0, quartiles[0], quartiles[1], quartiles[2], 1.0]
        labels = ['Q1 (Low)', 'Q2 (Moderate)', 'Q3 (High)', 'Q4 (Severe)']
        bin_idx = np.digitize(targets, bins[1:-1])
        rows = []
        for q in range(4):
            mask = bin_idx == q
            if mask.sum() == 0: continue
            t_q, p_q = targets[mask], preds[mask]
            rows.append({'Severity Quartile': labels[q], 'N': int(mask.sum()),
                         'MAE': mean_absolute_error(t_q, p_q),
                         'RMSE': np.sqrt(mean_squared_error(t_q, p_q)),
                         'Mean Predicted': p_q.mean(), 'Mean Actual': t_q.mean()})
        return pd.DataFrame(rows)

    def get_confusion_matrix_normalized(self):
        cm = confusion_matrix(self.hazard_targets, self.hazard_preds, labels=range(len(HAZARD_TYPES)))
        cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
        return np.nan_to_num(cm_norm)


# ============================================================================
# PUBLICATION FIGURES GENERATOR
# ============================================================================
class PublicationFigureGenerator:
    def __init__(self, output_dir):
        self.output_dir = output_dir
        os.makedirs(os.path.join(output_dir, 'figures'), exist_ok=True)
        plt.rcParams.update({'font.size': 10, 'axes.labelsize': 12, 'axes.titlesize': 13,
                             'xtick.labelsize': 9, 'ytick.labelsize': 9,
                             'figure.dpi': 300, 'savefig.dpi': 300, 'savefig.bbox': 'tight'})

    def plot_confusion_matrix(self, cm_normalized, title, filename):
        fig, ax = plt.subplots(figsize=(8, 7))
        sns.heatmap(cm_normalized, annot=True, fmt='.2f', cmap='Blues',
                    xticklabels=HAZARD_TYPES, yticklabels=HAZARD_TYPES, ax=ax)
        ax.set_xlabel('Predicted Hazard'); ax.set_ylabel('True Hazard'); ax.set_title(title)
        plt.xticks(rotation=45, ha='right'); plt.yticks(rotation=0)
        plt.tight_layout()
        path = os.path.join(self.output_dir, 'figures', filename)
        plt.savefig(path); plt.close()
        print(f"  📊 Saved: {path}")

    def plot_severity_scatter(self, targets, preds, r2, title, filename):
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.scatter(targets, preds, alpha=0.3, s=10, c='steelblue')
        lims = [0, 1]
        ax.plot(lims, lims, 'r--', lw=1.5, label='Perfect prediction')
        ax.set_xlim(lims); ax.set_ylim(lims)
        ax.set_xlabel('Ground Truth Severity'); ax.set_ylabel('Predicted Severity')
        ax.set_title(f"{title}\nR²={r2:.4f}"); ax.legend(); ax.set_aspect('equal')
        plt.tight_layout()
        path = os.path.join(self.output_dir, 'figures', filename)
        plt.savefig(path); plt.close()
        print(f"  📊 Saved: {path}")

    def plot_spatial_heatmap(self, results_df, title, filename):
        if 'division' not in results_df.columns or 'season' not in results_df.columns: return
        pivot = results_df.pivot_table(values='accuracy', index='division', columns='season', aggfunc='mean')
        fig, ax = plt.subplots(figsize=(8, 6))
        sns.heatmap(pivot, annot=True, fmt='.3f', cmap='YlOrRd', vmin=0.5, vmax=1.0, ax=ax)
        ax.set_title(title)
        plt.tight_layout()
        path = os.path.join(self.output_dir, 'figures', filename)
        plt.savefig(path); plt.close()
        print(f"  📊 Saved: {path}")


# ============================================================================
# TRAINING & EVALUATION FUNCTIONS
# ============================================================================
def train_epoch(model, loader, optimizer, criterion, device):
    model.train()
    metrics = EnhancedMetricsTracker()
    pbar = tqdm(loader, desc="Train", unit="batch")
    for tensors, cls_idx, severity, confidence, _ in pbar:
        tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
        optimizer.zero_grad()
        h_pred, s_pred = model(tensors)
        total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=TrainConfig.GRAD_CLIP)
        optimizer.step()
        metrics.update(total.item(), cls_l, reg_l,
                       h_pred.detach().argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                       s_pred.detach().cpu().numpy(), severity.cpu().numpy())
        pbar.set_postfix({'loss': f"{total.item():.4f}"})
    return metrics


def evaluate(model, loader, criterion, device, split_name="Val"):
    model.eval()
    metrics = EnhancedMetricsTracker()
    with torch.no_grad():
        pbar = tqdm(loader, desc=split_name, unit="batch")
        for tensors, cls_idx, severity, confidence, _ in pbar:
            tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
            h_pred, s_pred = model(tensors)
            total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
            metrics.update(total.item(), cls_l, reg_l,
                           h_pred.argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                           s_pred.cpu().numpy(), severity.cpu().numpy())
            pbar.set_postfix({'loss': f"{total.item():.4f}"})
    return metrics


def train_single_fold(fold_name, train_csv, val_csv, test_csv, num_classes, output_dir):
    print(f"\n{'─'*60}")
    print(f"📂 {fold_name}")
    print(f"{'─'*60}")

    train_loader = DataLoader(MasterHDF5Dataset(train_csv, TrainConfig.MASTER_H5_PATH, True),
                              batch_size=TrainConfig.BATCH_SIZE, shuffle=True,
                              num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    val_loader = DataLoader(MasterHDF5Dataset(val_csv, TrainConfig.MASTER_H5_PATH, False),
                            batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
                            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    test_loader = DataLoader(MasterHDF5Dataset(test_csv, TrainConfig.MASTER_H5_PATH, False),
                             batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
                             num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)

    print(f"  Train: {len(train_loader.dataset)}, Val: {len(val_loader.dataset)}, Test: {len(test_loader.dataset)}")

    model = HazardNetCNN(15, num_classes).to(TrainConfig.DEVICE)
    criterion = HomoscedasticMTLLoss().to(TrainConfig.DEVICE)
    optimizer = AdamW([{'params': model.parameters()}, {'params': criterion.log_vars}],
                      lr=TrainConfig.LEARNING_RATE, weight_decay=TrainConfig.WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=TrainConfig.NUM_EPOCHS, eta_min=1e-6)

    best_val_loss, patience_counter, best_epoch = float('inf'), 0, 0
    safe_name = fold_name.replace('/', '_').replace(' ', '_')
    ckpt_path = os.path.join(output_dir, f'{safe_name}_best.pt')
    fig_gen = PublicationFigureGenerator(output_dir)

    # W&B Init per fold
    run = None
    if WANDB_ENABLED:
        try:
            run = wandb.init(project='hazardnet', name=safe_name, reinit=True,
                             config={'strategy': fold_name, 'batch_size': TrainConfig.BATCH_SIZE})
        except: pass

    for epoch in range(TrainConfig.NUM_EPOCHS):
        train_m = train_epoch(model, train_loader, optimizer, criterion, TrainConfig.DEVICE)
        val_m = evaluate(model, val_loader, criterion, TrainConfig.DEVICE, "Val")
        scheduler.step()
        ts, vs = train_m.get_summary(), val_m.get_summary()

        if vs['loss_total'] < best_val_loss:
            best_val_loss = vs['loss_total']; patience_counter = 0; best_epoch = epoch + 1
            torch.save(model.state_dict(), ckpt_path)
        else:
            patience_counter += 1
            if patience_counter >= TrainConfig.PATIENCE:
                print(f"  ⏹️ Early stopping at epoch {epoch+1} (best: {best_epoch})"); break

        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:2d}/{TrainConfig.NUM_EPOCHS} | "
                  f"Train: {ts['loss_total']:.4f} Acc:{ts['hazard_accuracy']:.3f} | "
                  f"Val: {vs['loss_total']:.4f} Acc:{vs['hazard_accuracy']:.3f} RMSE:{vs['severity_rmse']:.4f}")

        if run:
            wandb.log({'train_loss': ts['loss_total'], 'val_loss': vs['loss_total'],
                       'train_acc': ts['hazard_accuracy'], 'val_acc': vs['hazard_accuracy']})

    # TEST EVALUATION WITH FULL METRICS
    model.load_state_dict(torch.load(ckpt_path))
    test_metrics = evaluate(model, test_loader, criterion, TrainConfig.DEVICE, "Test")
    test_summary = test_metrics.get_summary()

    print(f"  🏆 Test: Acc={test_summary['hazard_accuracy']:.4f} F1={test_summary['hazard_f1']:.4f} "
          f"RMSE={test_summary['severity_rmse']:.4f} R²={test_summary['severity_r2']:.4f}")

    # Generate Publication Tables & Figures
    per_class = test_metrics.get_per_class_metrics()
    per_class.to_csv(os.path.join(output_dir, f'{safe_name}_per_class.csv'), index=False)

    sev_quartile = test_metrics.get_severity_error_by_quartile()
    if not sev_quartile.empty:
        sev_quartile.to_csv(os.path.join(output_dir, f'{safe_name}_severity_quartile.csv'), index=False)

    fig_gen.plot_confusion_matrix(test_metrics.get_confusion_matrix_normalized(),
                                  f'Confusion Matrix: {fold_name}', f'{safe_name}_confusion_matrix.png')
    fig_gen.plot_severity_scatter(test_metrics.severity_targets, test_metrics.severity_preds,
                                  test_summary['severity_r2'], f'Severity: {fold_name}', f'{safe_name}_severity_scatter.png')

    if run: wandb.finish()

    return {
        'fold': fold_name, 'accuracy': test_summary['hazard_accuracy'],
        'f1': test_summary['hazard_f1'], 'rmse': test_summary['severity_rmse'],
        'mae': test_summary['severity_mae'], 'r2': test_summary['severity_r2'],
        'n_test': len(test_loader.dataset),
    }


# ============================================================================
# STRATEGY RUNNERS
# ============================================================================
def run_event_kfold(num_classes, output_dir):
    base = os.path.join(TrainConfig.EXPERIMENTAL_DIR, 'event_kfold')
    results = []
    for fold_idx in range(5):
        fd = os.path.join(base, f'fold_{fold_idx}')
        if not os.path.exists(fd): print(f"  ⚠️ Skipping fold_{fold_idx}"); continue
        r = train_single_fold(f'event_kfold_fold{fold_idx}',
                              os.path.join(fd, 'train_events.csv'), os.path.join(fd, 'val_events.csv'),
                              os.path.join(fd, 'test_events.csv'), num_classes, output_dir)
        results.append(r)
    return results

def run_spatial_lodo(num_classes, output_dir):
    base = os.path.join(TrainConfig.EXPERIMENTAL_DIR, 'spatial_lodo')
    results = []
    fold_dirs = sorted(glob.glob(os.path.join(base, 'lodo_division_*')))
    print(f"  Found {len(fold_dirs)} LODO division folds")
    for fd in fold_dirs:
        fn = os.path.basename(fd)
        r = train_single_fold(fn, os.path.join(fd, 'train_events.csv'), os.path.join(fd, 'val_events.csv'),
                              os.path.join(fd, 'test_events.csv'), num_classes, output_dir)
        r['division'] = fn.replace('lodo_division_', '')
        results.append(r)
    return results

def run_temporal(num_classes, output_dir):
    base = os.path.join(TrainConfig.EXPERIMENTAL_DIR, 'temporal_split')
    if not os.path.exists(os.path.join(base, 'train_events.csv')):
        print("  ⚠️ Temporal split not found"); return []
    r = train_single_fold('temporal_season_adaptive',
                          os.path.join(base, 'train_events.csv'), os.path.join(base, 'val_events.csv'),
                          os.path.join(base, 'test_events.csv'), num_classes, output_dir)
    return [r]

def run_spatio_temporal(num_classes, output_dir):
    base = os.path.join(TrainConfig.EXPERIMENTAL_DIR, 'spatio_temporal')
    results = []
    fold_dirs = sorted(glob.glob(os.path.join(base, 'st_*')))
    print(f"  Found {len(fold_dirs)} spatio-temporal folds")
    for fd in fold_dirs:
        fn = os.path.basename(fd)
        r = train_single_fold(fn, os.path.join(fd, 'train_events.csv'), os.path.join(fd, 'val_events.csv'),
                              os.path.join(fd, 'test_events.csv'), num_classes, output_dir)
        parts = fn.replace('st_', '').rsplit('_', 1)
        if len(parts) == 2: r['division'], r['season'] = parts[0], parts[1]
        results.append(r)
    return results


# ============================================================================
# MAIN ORCHESTRATOR
# ============================================================================
STRATEGY_MAP = {
    'event_kfold': ('Event-Based 5-Fold CV', run_event_kfold),
    'spatial_lodo': ('Spatial LODO (Division-Level)', run_spatial_lodo),
    'temporal': ('Temporal Split (Season-Adaptive)', run_temporal),
    'spatio_temporal': ('Spatio-Temporal (Division×Season×Era)', run_spatio_temporal),
}

# ═══════════════════════════════════════════════════════════
# SET YOUR STRATEGY HERE (for Kaggle notebook execution)
# ═══════════════════════════════════════════════════════════
STRATEGY = 'all'  # Options: event_kfold, spatial_lodo, temporal, spatio_temporal, all
# ═══════════════════════════════════════════════════════════

def main():
    print("=" * 80)
    print("🏗️  HAZARDNET UNIFIED EXPERIMENTAL TRAINING (Q1 Journal Edition)")
    print("=" * 80)

    with open(TrainConfig.CONFIG_PATH, 'r') as f:
        config = json.load(f)
    num_classes = config['n_classes']

    print(f"  Classes ({num_classes}): {config['hazard_types']}")
    print(f"  Master HDF5: {TrainConfig.MASTER_H5_PATH}")
    print(f"  Device: {TrainConfig.DEVICE}")
    print(f"  W&B Enabled: {WANDB_ENABLED}")

    strategies = list(STRATEGY_MAP.items()) if STRATEGY == 'all' else [(STRATEGY, STRATEGY_MAP[STRATEGY])]
    all_strategy_results = {}

    for strat_key, (strat_name, strat_fn) in strategies:
        print(f"\n{'='*80}")
        print(f"🚀 STRATEGY: {strat_name.upper()}")
        print(f"{'='*80}")

        strat_output = os.path.join(TrainConfig.OUTPUT_DIR, strat_key)
        os.makedirs(strat_output, exist_ok=True)

        results = strat_fn(num_classes, strat_output)
        all_strategy_results[strat_key] = results

        if results:
            accs = [r['accuracy'] for r in results]
            f1s = [r['f1'] for r in results]
            rmses = [r['rmse'] for r in results]
            r2s = [r['r2'] for r in results]
            print(f"\n  📊 {strat_name} Summary ({len(results)} folds):")
            print(f"     Accuracy: {np.mean(accs):.4f} ± {np.std(accs):.4f}")
            print(f"     F1-Score: {np.mean(f1s):.4f} ± {np.std(f1s):.4f}")
            print(f"     RMSE:     {np.mean(rmses):.4f} ± {np.std(rmses):.4f}")
            print(f"     R²:       {np.mean(r2s):.4f} ± {np.std(r2s):.4f}")

            df = pd.DataFrame([{k: v for k, v in r.items()} for r in results])
            df.to_csv(os.path.join(strat_output, f'{strat_key}_results.csv'), index=False)

            if strat_key in ['spatial_lodo', 'spatio_temporal']:
                fig_gen = PublicationFigureGenerator(strat_output)
                fig_gen.plot_spatial_heatmap(df, f'{strat_name} Accuracy', f'{strat_key}_spatial_heatmap.png')

    # CROSS-STRATEGY COMPARISON
    print(f"\n{'='*80}")
    print("📊 CROSS-STRATEGY COMPARISON (IEEE TGRS Table II)")
    print(f"{'='*80}")

    comparison_rows = []
    for strat_key, (strat_name, _) in STRATEGY_MAP.items():
        results = all_strategy_results.get(strat_key, [])
        if results:
            accs = [r['accuracy'] for r in results]
            f1s = [r['f1'] for r in results]
            rmses = [r['rmse'] for r in results]
            r2s = [r['r2'] for r in results]
            comparison_rows.append({
                'Strategy': strat_name, 'N_Folds': len(results),
                'Accuracy': f"{np.mean(accs):.4f} ± {np.std(accs):.4f}",
                'F1-Score': f"{np.mean(f1s):.4f} ± {np.std(f1s):.4f}",
                'RMSE': f"{np.mean(rmses):.4f} ± {np.std(rmses):.4f}",
                'R²': f"{np.mean(r2s):.4f} ± {np.std(r2s):.4f}",
                'Total_Test_Events': sum(r['n_test'] for r in results),
            })

    if comparison_rows:
        df_comp = pd.DataFrame(comparison_rows)
        print(df_comp.to_string(index=False))
        comp_path = os.path.join(TrainConfig.OUTPUT_DIR, 'cross_strategy_comparison.csv')
        df_comp.to_csv(comp_path, index=False)
        print(f"\n💾 Comparison saved to: {comp_path}")

    print(f"\n✅ All experimental training complete!")
    print(f"   Results: {TrainConfig.OUTPUT_DIR}")


if __name__ == '__main__':
    main()
```

---

## Phase 6

### HazardNet Edge Deployment Converter

```python
"""
================================================================================
HazardNet Edge Deployment Converter (Production Refactored)
================================================================================
Converts the best PyTorch checkpoint to ONNX and TFLite for edge deployment.
Handles TFLite CONV_3D FP32 limitations and NCDHW->NDHWC transposes automatically.
================================================================================
"""

import os
import json
import glob
import subprocess
import shutil
import sys
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import h5py
from tqdm import tqdm


class DeployConfig:
    BEST_CHECKPOINT = '/kaggle/input/models/ashifahmedshuvo/hazardnet-pytorch/pytorch/default/1/HazardNet_Experimental_Results/event_kfold/event_kfold_fold2_best.pt'
    MASTER_H5_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/master_tensors.h5'
    CONFIG_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/dataset_config.json'
    NORMALIZATION_STATS_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/normalization_stats.json'
    OUTPUT_DIR = '/kaggle/working/HazardNet_Deployment_Bundles'

    IN_CHANNELS = 15
    NUM_HAZARDS = 8
    INPUT_SHAPE = (1, 15, 10, 64, 64)
    NUM_REPRESENTATIVE_SAMPLES = 100

    BAND_NAMES = [
        'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR',
        'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp',
        'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad'
    ]

os.makedirs(DeployConfig.OUTPUT_DIR, exist_ok=True)


class NormalizationStats:
    """Robust Normalization Stats Loader that adapts to various JSON schemas."""
    def __init__(self, stats_path: str, band_names: list):
        print(f"Loading normalization stats from: {stats_path}")
        if not os.path.exists(stats_path):
            raise FileNotFoundError(f"Normalization stats file not found: {stats_path}")

        with open(stats_path, 'r') as f:
            self.stats = json.load(f)

        self.band_names = band_names
        self.means_list = []
        self.stds_list = []

        self._parse_and_validate()

        self.means = np.array(self.means_list, dtype=np.float32).reshape(1, -1, 1, 1, 1)
        self.stds = np.array(self.stds_list, dtype=np.float32).reshape(1, -1, 1, 1, 1)
        self.stds = np.where(self.stds < 1e-8, 1.0, self.stds)

        print(f"  [OK] Successfully loaded normalization stats for {len(self.band_names)} bands")

    def _parse_and_validate(self):
        data = self.stats

        if isinstance(data, dict):
            for nested_key in ['per_band', 'bands', 'stats', 'band_stats']:
                if nested_key in data and isinstance(data[nested_key], (dict, list)):
                    data = data[nested_key]
                    break

        if isinstance(data, dict) and any(k in data for k in ['mean', 'means']) and any(k in data for k in ['std', 'stds']):
            m_key = 'mean' if 'mean' in data else 'means'
            s_key = 'std' if 'std' in data else 'stds'
            means_data, stds_data = data[m_key], data[s_key]

            if isinstance(means_data, list) and isinstance(stds_data, list):
                if len(means_data) == len(self.band_names):
                    self.means_list = [float(m) for m in means_data]
                    self.stds_list = [float(s) for s in stds_data]
                    return
                else:
                    raise ValueError(f"Stats list length ({len(means_data)}) != expected bands ({len(self.band_names)})")

            elif isinstance(means_data, dict) and isinstance(stds_data, dict):
                means_lower = {str(k).lower(): v for k, v in means_data.items()}
                stds_lower = {str(k).lower(): v for k, v in stds_data.items()}
                for i, b in enumerate(self.band_names):
                    b_lower, b_idx = b.lower(), str(i)
                    if b_lower in means_lower and b_lower in stds_lower:
                        self.means_list.append(float(means_lower[b_lower]))
                        self.stds_list.append(float(stds_lower[b_lower]))
                    elif b_idx in means_lower and b_idx in stds_lower:
                        self.means_list.append(float(means_lower[b_idx]))
                        self.stds_list.append(float(stds_lower[b_idx]))
                    else:
                        raise ValueError(f"Could not find mean/std for band '{b}' in stats dict")
                return

        if isinstance(data, dict):
            key_map = {str(k).lower(): v for k, v in data.items() if isinstance(v, dict)}
            missing = []
            for i, band in enumerate(self.band_names):
                band_lower, band_idx = band.lower(), str(i)
                target = key_map.get(band_lower) or key_map.get(band_idx)
                if target is not None:
                    m_val = target.get('mean', target.get('means'))
                    s_val = target.get('std', target.get('stds'))
                    if m_val is not None and s_val is not None:
                        self.means_list.append(float(m_val))
                        self.stds_list.append(float(s_val))
                        continue
                missing.append(band)
            if not missing:
                return
            raise ValueError(f"Normalization stats missing bands: {missing}.")

        if isinstance(data, list) and all(isinstance(x, dict) for x in data):
            band_map = {}
            for entry in data:
                b_name = entry.get('band', entry.get('name', entry.get('band_name')))
                if b_name is not None:
                    band_map[str(b_name).lower()] = entry
            for i, band in enumerate(self.band_names):
                entry = band_map.get(band.lower()) or band_map.get(str(i))
                if entry and 'mean' in entry and 'std' in entry:
                    self.means_list.append(float(entry['mean']))
                    self.stds_list.append(float(entry['std']))
                else:
                    raise ValueError(f"Missing stats entry for band '{band}' in list of stats.")
            return

        raise ValueError("Unrecognized normalization stats JSON structure.")

    def normalize(self, tensor: np.ndarray) -> np.ndarray:
        if tensor.ndim == 4:
            means, stds = self.means[0], self.stds[0]
        elif tensor.ndim == 5:
            means, stds = self.means, self.stds
        else:
            raise ValueError(f"Expected 4D or 5D tensor, got {tensor.ndim}D")
        return (tensor.astype(np.float32) - means) / stds

    def to_dict(self) -> dict:
        return {
            'means': {b: float(self.means_list[i]) for i, b in enumerate(self.band_names)},
            'stds': {b: float(self.stds_list[i]) for i, b in enumerate(self.band_names)},
            'band_order': self.band_names,
            'normalization_type': 'z_score',
        }


class DepthwiseSeparableConv3d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv3d(in_channels, in_channels, kernel_size, padding=padding, groups=in_channels, bias=False)
        self.pointwise = nn.Conv3d(in_channels, out_channels, kernel_size=1, bias=False)
        self.bn = nn.BatchNorm3d(out_channels)

    def forward(self, x):
        return self.bn(self.pointwise(self.depthwise(x)))


class SEBlock3D(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool3d(1), nn.Flatten(),
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid())

    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1).unsqueeze(-1)
        return x * w


class HazardNetCNN(nn.Module):
    def __init__(self, in_channels=15, num_hazards=8):
        super().__init__()
        self.block1 = nn.Sequential(DepthwiseSeparableConv3d(in_channels, 32), nn.ReLU(True), SEBlock3D(32), nn.MaxPool3d((1, 2, 2)))
        self.block2 = nn.Sequential(DepthwiseSeparableConv3d(32, 64), nn.ReLU(True), SEBlock3D(64), nn.MaxPool3d((2, 2, 2)))
        self.block3 = nn.Sequential(DepthwiseSeparableConv3d(64, 128), nn.ReLU(True), SEBlock3D(128), nn.MaxPool3d((1, 2, 2)))
        self.block4 = nn.Sequential(DepthwiseSeparableConv3d(128, 256), nn.ReLU(True), SEBlock3D(256), nn.MaxPool3d((1, 2, 2)))
        self.global_pool = nn.AdaptiveAvgPool3d(1)
        self.shared_fc = nn.Sequential(nn.Linear(256, 128), nn.ReLU(True), nn.Dropout(0.3))
        self.hazard_head = nn.Linear(128, num_hazards)
        self.severity_head = nn.Sequential(nn.Linear(128, 64), nn.ReLU(True), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, x):
        x = self.block4(self.block3(self.block2(self.block1(x))))
        x = self.global_pool(x).view(x.size(0), -1)
        x = self.shared_fc(x)
        return self.hazard_head(x), self.severity_head(x).squeeze(1)


def load_model_and_stats():
    print("=" * 70)
    print("STEP 1: Loading Model & Pre-computed Normalization Stats")
    print("=" * 70)
    norm_stats = NormalizationStats(DeployConfig.NORMALIZATION_STATS_PATH, DeployConfig.BAND_NAMES)

    model = HazardNetCNN(DeployConfig.IN_CHANNELS, DeployConfig.NUM_HAZARDS)
    state_dict = torch.load(DeployConfig.BEST_CHECKPOINT, map_location='cpu')
    model.load_state_dict(state_dict)
    model.eval()

    params = sum(p.numel() for p in model.parameters())
    print(f"  [OK] Model loaded: {params:,} params (~{params * 4 / 1024**2:.2f} MB FP32)")
    return model, norm_stats


def export_to_onnx(model):
    print("\n" + "=" * 70)
    print("STEP 2: Exporting to ONNX")
    print("=" * 70)
    output_path = os.path.join(DeployConfig.OUTPUT_DIR, 'hazardnet.onnx')
    dummy_input = torch.randn(*DeployConfig.INPUT_SHAPE)

    print("  Tracing model with torch.jit.trace to bypass onnxscript registry bugs...")
    try:
        export_target = torch.jit.trace(model, dummy_input)
    except Exception as e:
        print(f"  [WARN] Tracing warning ({e}), falling back to PyTorch model")
        export_target = model

    torch.onnx.export(
        export_target, dummy_input, output_path,
        export_params=True, opset_version=17, do_constant_folding=True,
        input_names=['input'],
        output_names=['hazard_logits', 'severity_pred'],
        dynamic_axes={'input': {0: 'batch_size'}, 'hazard_logits': {0: 'batch_size'}, 'severity_pred': {0: 'batch_size'}},
        dynamo=False
    )

    import onnx
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print(f"  [OK] ONNX exported: {output_path} ({os.path.getsize(output_path) / 1024**2:.2f} MB)")
    return output_path


def create_representative_dataset(norm_stats: NormalizationStats):
    print("\n" + "=" * 70)
    print(f"STEP 3: Creating Representative Dataset ({DeployConfig.NUM_REPRESENTATIVE_SAMPLES} samples)")
    print("=" * 70)

    event_kfold_dir = os.path.dirname(DeployConfig.MASTER_H5_PATH)
    train_csvs = sorted(glob.glob(os.path.join(event_kfold_dir, 'event_kfold/fold_*/train_events.csv')))
    if not train_csvs:
        raise FileNotFoundError(f"No train CSVs found in {event_kfold_dir}")

    samples_per_fold = max(1, DeployConfig.NUM_REPRESENTATIVE_SAMPLES // len(train_csvs))
    all_event_ids = []
    for csv_path in train_csvs:
        fold_df = pd.read_csv(csv_path)
        fold_sample = fold_df.sample(n=min(samples_per_fold, len(fold_df)), random_state=42)
        all_event_ids.extend(fold_sample['event_id'].astype(str).tolist())
    all_event_ids = all_event_ids[:DeployConfig.NUM_REPRESENTATIVE_SAMPLES]

    h5f = h5py.File(DeployConfig.MASTER_H5_PATH, 'r')
    samples = []
    for eid in tqdm(all_event_ids, desc="Loading & normalizing"):
        raw_tensor = h5f[f'tensors/{eid}'][:]
        normalized = norm_stats.normalize(raw_tensor)
        samples.append(normalized[np.newaxis, ...])
    h5f.close()

    print(f"  [OK] Created {len(samples)} normalized representative samples")
    return samples


def convert_to_tflite(onnx_path, representative_samples):
    print("\n" + "=" * 70)
    print("STEP 4: Converting to TFLite")
    print("=" * 70)

    import tensorflow as tf

    tflite_dir = os.path.join(DeployConfig.OUTPUT_DIR, 'tflite')
    os.makedirs(tflite_dir, exist_ok=True)
    tf_saved_model_dir = os.path.join(tflite_dir, 'tf_saved_model')

    print("  Converting ONNX -> TF SavedModel / TFLite...")
    
    # Robust CLI execution using sys.executable to avoid PATH issues in Kaggle/Colab
    cmd = [sys.executable, '-m', 'onnx2tf', '-i', onnx_path, '-o', tf_saved_model_dir, '-osd', '-nuo']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  [WARN] onnx2tf CLI returned non-zero exit code. Checking outputs...")

    def _find_saved_model(path):
        for root, _, files in os.walk(path):
            if 'saved_model.pb' in files: return root
        return None

    saved_pb_path = _find_saved_model(tf_saved_model_dir)
    fp32_model_bytes = None

    if saved_pb_path:
        print(f"  [OK] Found TF SavedModel at: {saved_pb_path}")
        print("  Converting SavedModel to Pure FP32 TFLite...")
        converter = tf.lite.TFLiteConverter.from_saved_model(saved_pb_path)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS, tf.lite.OpsSet.SELECT_TF_OPS]
        converter.inference_input_type = tf.float32
        converter.inference_output_type = tf.float32
        fp32_model_bytes = converter.convert()
    else:
        # Fallback: onnx2tf often outputs .tflite directly if SavedModel generation fails
        direct_tflite_files = glob.glob(os.path.join(tf_saved_model_dir, "*float32.tflite"))
        if not direct_tflite_files:
            direct_tflite_files = glob.glob(os.path.join(tf_saved_model_dir, "*.tflite"))
            
        if direct_tflite_files:
            saved_pb_path = direct_tflite_files[0]
            print(f"  [OK] Found direct FP32 TFLite model: {saved_pb_path}")
            with open(saved_pb_path, 'rb') as f: 
                fp32_model_bytes = f.read()
        else:
            raise RuntimeError(f"TF SavedModel or TFLite not created at '{tf_saved_model_dir}'.")

    fp32_path = os.path.join(tflite_dir, 'hazardnet_fp32.tflite')
    with open(fp32_path, 'wb') as f: 
        f.write(fp32_model_bytes)

    print("\n  [INFO] ARCHITECTURE LIMITATION DETECTED")
    print("  TensorFlow Lite's native 'CONV_3D' kernel strictly requires FLOAT32 tensors.")
    print("  Applying Optimize.DEFAULT (INT8) causes a runtime crash in conv3d.cc.")
    print("  To guarantee edge compatibility, INT8 quantization is safely bypassed.")

    # Save FP32 as the final optimized model for edge deployment
    int8_path = os.path.join(tflite_dir, 'hazardnet_optimized_fp32.tflite')
    with open(int8_path, 'wb') as f: 
        f.write(fp32_model_bytes)

    fp32_mb = len(fp32_model_bytes) / (1024 ** 2)
    print(f"\n  TFLite Results:")
    print(f"     Model Size: {fp32_mb:.2f} MB (Pure FP32)")
    print(f"     {'[OK] UNDER 150 MB TARGET' if fp32_mb < 150 else '[WARN] EXCEEDS 150 MB'}")

    return fp32_path, int8_path


def golden_parity_test(model, norm_stats, int8_path, n_samples=50):
    print("\n" + "=" * 70)
    print(f"STEP 5: Golden Parity Test ({n_samples} samples)")
    print("=" * 70)

    import tensorflow as tf

    event_kfold_dir = os.path.dirname(DeployConfig.MASTER_H5_PATH)
    test_csvs = sorted(glob.glob(os.path.join(event_kfold_dir, 'event_kfold/fold_*/test_events.csv')))
    if not test_csvs:
        print("  [WARN] No test CSVs found, skipping parity test")
        return 0.0, 0.0

    samples_per_fold = max(1, n_samples // len(test_csvs))
    all_event_ids = []
    for csv_path in test_csvs:
        fold_df = pd.read_csv(csv_path)
        fold_sample = fold_df.sample(n=min(samples_per_fold, len(fold_df)), random_state=42)
        all_event_ids.extend(fold_sample['event_id'].astype(str).tolist())
    all_event_ids = all_event_ids[:n_samples]

    h5f = h5py.File(DeployConfig.MASTER_H5_PATH, 'r')
    interpreter = tf.lite.Interpreter(model_path=int8_path)
    interpreter.allocate_tensors()
    inp_details = interpreter.get_input_details()[0]
    out_details = interpreter.get_output_details()

    tflite_input_shape = inp_details['shape']
    # Detect if TFLite expects NDHWC (1, 10, 64, 64, 15) instead of NCDHW (1, 15, 10, 64, 64)
    needs_transpose = (len(tflite_input_shape) == 5 and tflite_input_shape[1] != DeployConfig.IN_CHANNELS and tflite_input_shape[4] == DeployConfig.IN_CHANNELS)

    print(f"  [INFO] TFLite expected input shape: {tuple(tflite_input_shape)}")
    print(f"  [INFO] Transpose required (NCDHW -> NDHWC): {needs_transpose}")

    model.eval()
    hazard_agreements = 0
    severity_diffs = []

    for eid in tqdm(all_event_ids, desc="Parity test"):
        raw_tensor = h5f[f'tensors/{eid}'][:]
        normalized = norm_stats.normalize(raw_tensor)
        batch = normalized[np.newaxis, ...]

        with torch.no_grad():
            pt_hazard, pt_severity = model(torch.from_numpy(batch))
        pt_class = pt_hazard.argmax(dim=1).item()

        tflite_batch = np.transpose(batch, (0, 2, 3, 4, 1)) if needs_transpose else batch
        tflite_input = tflite_batch.astype(inp_details['dtype'])
        interpreter.set_tensor(inp_details['index'], tflite_input)
        interpreter.invoke()

        # Robust output extraction by shape rather than strict index
        tf_hazard, tf_severity = None, None
        for out in out_details:
            out_shape = out['shape']
            if len(out_shape) == 2 and out_shape[1] == DeployConfig.NUM_HAZARDS:
                tf_hazard = interpreter.get_tensor(out['index'])[0]
            elif len(out_shape) <= 2 and (out_shape[-1] == 1 or out_shape == (1,)):
                tf_severity = interpreter.get_tensor(out['index'])[0]
                if isinstance(tf_severity, np.ndarray):
                    tf_severity = tf_severity.item() if tf_severity.size == 1 else tf_severity[0]

        # Fallback if shape matching failed
        if tf_hazard is None or tf_severity is None:
            tf_hazard = interpreter.get_tensor(out_details[0]['index'])[0]
            tf_severity = interpreter.get_tensor(out_details[1]['index'])[0]
            if isinstance(tf_severity, np.ndarray):
                tf_severity = tf_severity.item() if tf_severity.size == 1 else tf_severity[0]

        if pt_class == int(np.argmax(tf_hazard)): 
            hazard_agreements += 1
        severity_diffs.append(abs(pt_severity.item() - float(tf_severity)))

    h5f.close()
    agreement_pct = hazard_agreements / len(all_event_ids) * 100
    mean_sev_diff = np.mean(severity_diffs)

    print(f"\n  Parity Results:")
    print(f"     Hazard agreement: {agreement_pct:.1f}%")
    print(f"     Severity MAE (PT vs TFLite): {mean_sev_diff:.4f}")
    print(f"     Status: {'[OK] PASSED' if agreement_pct >= 95 else '[WARN] BELOW 95% THRESHOLD'}")
    return agreement_pct, mean_sev_diff


def create_deployment_bundle(norm_stats: NormalizationStats, int8_path, fp32_path):
    print("\n" + "=" * 70)
    print("STEP 6: Creating Deployment Bundle")
    print("=" * 70)

    bundle_dir = os.path.join(DeployConfig.OUTPUT_DIR, 'deployment_bundle')
    os.makedirs(bundle_dir, exist_ok=True)

    for src_path, dst_name in [(int8_path, 'hazardnet_int8.tflite'), (fp32_path, 'hazardnet_fp32.tflite')]:
        if src_path and os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(bundle_dir, dst_name))

    if os.path.exists(DeployConfig.CONFIG_PATH):
        with open(DeployConfig.CONFIG_PATH, 'r') as f: 
            config = json.load(f)
        labels = {str(i): h for i, h in enumerate(config.get('hazard_types', []))}
    else:
        labels = {str(i): f"Hazard_{i}" for i in range(DeployConfig.NUM_HAZARDS)}

    with open(os.path.join(bundle_dir, 'labels.json'), 'w') as f: 
        json.dump(labels, f, indent=2)

    preprocessing_config = {
        'normalization': norm_stats.to_dict(),
        'input_shape': list(DeployConfig.INPUT_SHAPE),
        'num_hazards': DeployConfig.NUM_HAZARDS,
        'outputs': {'hazard_logits': 'index_0', 'severity_pred': 'index_1'},
    }
    with open(os.path.join(bundle_dir, 'preprocessing_config.json'), 'w') as f:
        json.dump(preprocessing_config, f, indent=2)

    inference_script = '''#!/usr/bin/env python3
"""HazardNet Edge Inference with Pre-computed Normalization"""
import numpy as np, tensorflow as tf, json, time, sys

def load_normalization_stats(config_path='preprocessing_config.json'):
    with open(config_path) as f: config = json.load(f)
    norm = config['normalization']
    means = np.array([norm['means'][b] for b in norm['band_order']], dtype=np.float32).reshape(1, -1, 1, 1, 1)
    stds = np.array([norm['stds'][b] for b in norm['band_order']], dtype=np.float32).reshape(1, -1, 1, 1, 1)
    return means, np.where(stds < 1e-8, 1.0, stds)

def normalize(raw_tensor, means, stds):
    return (raw_tensor.astype(np.float32) - means) / stds

def predict(tflite_path, raw_tensor, means, stds, labels_path='labels.json'):
    normalized = normalize(raw_tensor, means, stds)
    
    # Transpose NCDHW -> NDHWC for TFLite if necessary
    if normalized.shape[1] == 15 and normalized.shape[2] == 10:
        normalized = np.transpose(normalized, (0, 2, 3, 4, 1))

    interp = tf.lite.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    outs = interp.get_output_details()

    start = time.perf_counter()
    interp.set_tensor(inp['index'], normalized.astype(inp['dtype']))
    interp.invoke()
    latency = (time.perf_counter() - start) * 1000

    # Robust output extraction by shape
    hazard, severity = None, None
    for out in outs:
        if len(out['shape']) == 2 and out['shape'][1] == 8: 
            hazard = interp.get_tensor(out['index'])[0]
        elif len(out['shape']) <= 2: 
            severity = interp.get_tensor(out['index'])[0]

    if hazard is None: hazard = interp.get_tensor(outs[0]['index'])[0]
    if severity is None: severity = interp.get_tensor(outs[1]['index'])[0]
    if isinstance(severity, np.ndarray): 
        severity = severity.item() if severity.size == 1 else severity[0]

    with open(labels_path) as f: labels = json.load(f)
    cls = int(np.argmax(hazard))
    return {
        'hazard': labels[str(cls)], 
        'confidence': float(np.max(hazard)), 
        'severity': float(severity), 
        'latency_ms': latency
    }

if __name__ == '__main__':
    model = sys.argv[1] if len(sys.argv) > 1 else 'hazardnet_int8.tflite'
    means, stds = load_normalization_stats()
    r = predict(model, np.random.randn(1, 15, 10, 64, 64).astype(np.float32), means, stds)
    print(f"Hazard: {r['hazard']} (conf: {r['confidence']:.3f}) | Severity: {r['severity']:.4f} | Latency: {r['latency_ms']:.1f} ms")
'''
    with open(os.path.join(bundle_dir, 'inference_example.py'), 'w') as f: 
        f.write(inference_script)

    readme = f"""# HazardNet Edge Deployment Bundle

## Contents
- `hazardnet_int8.tflite` - Optimized FP32 model (TFLite CONV_3D requires FP32)
- `hazardnet_fp32.tflite` - FP32 baseline model
- `labels.json` - {DeployConfig.NUM_HAZARDS} hazard class labels
- `preprocessing_config.json` - Pre-computed normalization stats + band order
- `inference_example.py` - Standalone inference with normalization & NDHWC transpose

## Input Spec
- Shape: (1, 15, 10, 64, 64) - [batch, channels, timesteps, height, width]
- Normalization: z-score with pre-computed per-band mean/std
- Transpose: NCDHW -> NDHWC handled automatically by inference script
"""
    with open(os.path.join(bundle_dir, 'README.md'), 'w') as f: 
        f.write(readme)

    print(f"\n  [OK] Bundle created: {bundle_dir}")
    for item in sorted(os.listdir(bundle_dir)):
        fpath = os.path.join(bundle_dir, item)
        if os.path.isfile(fpath): 
            print(f"     {item}: {os.path.getsize(fpath) / 1024:.1f} KB")
        else: 
            print(f"     {item}/ (directory)")
    return bundle_dir


def main():
    print("=" * 70)
    print("HAZARDNET EDGE DEPLOYMENT CONVERTER")
    print("=" * 70)

    model, norm_stats = load_model_and_stats()
    onnx_path = export_to_onnx(model)
    rep_samples = create_representative_dataset(norm_stats)
    fp32_path, int8_path = convert_to_tflite(onnx_path, rep_samples)
    agreement, sev_diff = golden_parity_test(model, norm_stats, int8_path)
    bundle_dir = create_deployment_bundle(norm_stats, int8_path, fp32_path)

    print("\n" + "=" * 70)
    print("[OK] DEPLOYMENT CONVERSION COMPLETE")
    print("=" * 70)
    print(f"  Bundle: {bundle_dir}")
    print(f"  Parity: {agreement:.1f}% hazard agreement, {sev_diff:.4f} severity MAE")


if __name__ == '__main__':
    main()
```

## Phase 7

### HazardNet Auto Forecast Pipeline (10, 20, 30 days Horizons)

```python
import ee
import io
import json
import time
import urllib.request
import numpy as np
import pandas as pd
import requests
import tensorflow as tf
import geopandas as gpd
from datetime import datetime, timedelta
import torch
import torch.nn.functional as F

# ==============================================================================
# 1. GEE AUTHENTICATION (Service Account)
# ==============================================================================
SERVICE_ACCOUNT = 'hazardnet-ee-service-kaggle@hazardnet-aas48424.iam.gserviceaccount.com'
CREDENTIALS_PATH = '/kaggle/input/datasets/ashifahmedshuvo/ee-token-json/hazardnet-aas48424-48d18edabfcc.json'

try:
    credentials = ee.ServiceAccountCredentials(SERVICE_ACCOUNT, CREDENTIALS_PATH)
    ee.Initialize(credentials)  
    print("OK: Google Earth Engine Initialized via Service Account")
except Exception as e:
    print(f"Warning: GEE Initialization Failed: {e}")
    print("   Please verify the service account path and permissions in Kaggle Secrets/Dataset.")

# ==============================================================================
# 2. CONFIGURATION & PATHS
# ==============================================================================
BAND_NAMES = [
    'SAR_VV', 'SAR_VH', 'Blue', 'Red', 'NIR', 'SWIR', 
    'Temp_2m', 'Precip', 'Max_Temp', 'Min_Temp', 
    'Soil_W1', 'Soil_W3', 'Soil_T1', 'Dewpoint', 'Solar_Rad'
]

MODEL_PATH = '/kaggle/input/notebooks/ashifahmedshuvo/hazardnet-model-conversion/HazardNet_Deployment_Bundles/deployment_bundle/hazardnet_fp32.tflite'
STATS_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/normalization_stats.json'
OUTPUT_CSV = '/kaggle/working/hazardnet_forecasts_latest.csv'

HORIZONS = {'10_days': 10, '20_days': 20, '30_days': 30}
HAZARD_CLASSES = ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 
                  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone']

# ==============================================================================
# 3. LOAD BANGLADESH FAO GAUL ADMINISTRATIVE BOUNDARIES (Native GEE)
# ==============================================================================
def load_fao_gaul_boundaries():
    print("Loading FAO GAUL Administrative Boundaries for Bangladesh via GEE...")
    
    # 1. Define Bangladesh filter
    bd_filter = ee.Filter.eq('ADM0_NAME', 'Bangladesh')
    
    # 2. Load GAUL collections (2015 is the most stable, widely cited version)
    gaul_adm0 = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(bd_filter)
    gaul_adm1 = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(bd_filter)
    gaul_adm2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(bd_filter)
    
    print(f"   ADM0 (Country): {gaul_adm0.size().getInfo()} feature(s)")
    print(f"   ADM1 (Divisions): {gaul_adm1.size().getInfo()} features")
    print(f"   ADM2 (Districts): {gaul_adm2.size().getInfo()} features")
    
    # 3. Extract ADM2 (Districts) with their ADM1 (Division) parent and centroids
    def extract_props(feat):
        geom = feat.geometry()
        centroid = geom.centroid()
        return feat.set({
            'lon': centroid.coordinates().get(0),
            'lat': centroid.coordinates().get(1),
            'ADM2_NAME': feat.get('ADM2_NAME'),
            'ADM1_NAME': feat.get('ADM1_NAME'),
            'ADM2_PCODE': feat.get('ADM2_PCODE') # Fallback to ADM2_CODE if PCODE is missing
        })
    
    gaul_adm2_mapped = gaul_adm2.map(extract_props)
    
    # 4. Fetch to Python (Perfectly safe and fast for ~64 features)
    features = gaul_adm2_mapped.getInfo()['features']
    
    districts = []
    # Sort alphabetically by district name to ensure consistent ID assignment
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
        
    # Get unique divisions count for logging
    divisions = set(d['division'] for d in districts)
    print(f"\nOK: Loaded {len(districts)} districts across {len(divisions)} divisions via FAO GAUL")
    
    # Return None for GeoDataFrames to maintain function signature compatibility, 
    # as the rest of your script only actively uses the `DISTRICTS` list.
    return None, None, None, None, districts

# Execute the FAO GAUL loader
adm0, adm1, adm2, capitals, DISTRICTS = load_fao_gaul_boundaries()

print(f"\nFirst 5 districts:")
for d in DISTRICTS[:5]:
    print(f"   {d['id']:2d}. {d['name']:20s} | {d['division']:12s} | ({d['lat']}, {d['lon']}) | {d['pcode']}")

# ==============================================================================
# 4. ROBUST GEE PIPELINE
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
    except Exception as e:
        return None

def get_hybrid_optical(region, start, end):
    # 1. Try Sentinel-2 first (Post-2015)
    s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    if s2_col.size().getInfo() > 0:
        return harmonize_and_rename(s2_col.median(), 'S2').unmask(0)

    # 2. Fallback to Landsat 8 (2013-2015)
    l8_col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))
    if l8_col.size().getInfo() > 0:
        return harmonize_and_rename(l8_col.median(), 'L8').resample('bicubic').unmask(0)

    # 3. Fallback to Landsat 7/5 (2000-2013)
    l7_col = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))
    if l7_col.size().getInfo() > 0:
        return harmonize_and_rename(l7_col.median(), 'L57').resample('bicubic').unmask(0)

    # 4. Total Failure
    return ee.Image.constant([0, 0, 0, 0]).rename(['Blue', 'Red', 'NIR', 'SWIR']).float().unmask(0)

def get_temporal_15ch_stack(region, start, end):
    try:
        S1_BANDS = ['VV', 'VH']
        ERA5_BANDS = ['temperature_2m', 'total_precipitation_sum', 'temperature_2m_max',
                      'temperature_2m_min', 'volumetric_soil_water_layer_1',
                      'volumetric_soil_water_layer_3', 'soil_temperature_level_1',
                      'dewpoint_temperature_2m', 'surface_solar_radiation_downwards_sum']

        # 1. SAR (Robust Zero-Fill)
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

        # 2. Hybrid Optical
        s2_hybrid = get_hybrid_optical(region, start, end)

        # 3. ERA5-Land
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
    """
    Downloads EE Image as NPY, enforces exact spatial dimensions, 
    and converts to numpy array (C, H, W).
    """
    url = image.getDownloadURL({'region': region, 'scale': scale, 'format': 'NPY'})
    response = urllib.request.urlopen(url)
    data = np.load(io.BytesIO(response.read()), allow_pickle=True)
    
    bands = []
    for b in image.bandNames().getInfo():
        bands.append(data[b])
    
    # Stack to (C, H, W)
    img_np = np.stack(bands, axis=0)
    
    # SAFEGUARD: Enforce exact spatial dimensions to prevent GEE grid snapping mismatches
    h, w = img_np.shape[1], img_np.shape[2]
    if h != target_size[0] or w != target_size[1]:
        # Convert to torch tensor for reliable bilinear resizing (matches training pipeline)
        tensor = torch.from_numpy(img_np).float().unsqueeze(0) # Shape: (1, C, H, W)
        
        # Resample using bilinear interpolation (align_corners=False is standard for this)
        tensor_resized = F.interpolate(
            tensor, 
            size=target_size, 
            mode='bilinear', 
            align_corners=False
        )
        img_np = tensor_resized.squeeze(0).numpy()
        
    return img_np

def get_openmeteo_forecast(lat, lon, horizon_days):
    """Fetches deterministic forecast, safely handling None/null values from API."""
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
        resp.raise_for_status()  # Catch HTTP 4xx/5xx errors explicitly
        data = resp.json()
        daily = data.get('daily', {})
        
        # Helper to safely convert lists (which may contain None) to numpy arrays
        def safe_array(key, default_val):
            arr = daily.get(key)
            if arr is None:
                arr = [default_val]
            # Replace None with np.nan for safe numpy aggregation
            arr = [float(x) if x is not None else np.nan for x in arr]
            return np.array(arr)

        temp_mean = safe_array('temperature_2m_mean', 295.0)
        temp_max = safe_array('temperature_2m_max', 300.0)
        temp_min = safe_array('temperature_2m_min', 280.0)
        precip = safe_array('precipitation_sum', 0.0)
        dewpoint = safe_array('dew_point_2m_mean', 285.0)
        solar_rad = safe_array('shortwave_radiation_sum', 5000.0)
        wind_max = safe_array('wind_speed_10m_max', 0.0)
        et_sum = safe_array('et0_fao_evapotranspiration_sum', 0.0)
        
        return {
            'Temp_2m': float(np.nanmean(temp_mean)),
            'Precip': float(np.nansum(precip)) / 1000.0,
            'Max_Temp': float(np.nanmax(temp_max)),
            'Min_Temp': float(np.nanmin(temp_min)),
            'Dewpoint': float(np.nanmean(dewpoint)),
            'Solar_Rad': float(np.nansum(solar_rad)) * 1000.0,
            'Wind_Max': float(np.nanmax(wind_max)),
            'ET_Sum': float(np.nansum(et_sum))
        }
    except requests.exceptions.RequestException as e:
        print(f"Open-Meteo HTTP Error for ({lat}, {lon}): {e}")
        return None
    except Exception as e:
        print(f"Open-Meteo Processing Error for ({lat}, {lon}): {e}")
        return None

def build_future_tensor(lat, lon, horizon_days, norm_stats):
    """Constructs the (10, 15, 64, 64) tensor using the exact training pipeline logic."""
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()
    
    # 1. Fetch Open-Meteo Forecast for T-0 (Future Climate Injection)
    om_data = get_openmeteo_forecast(lat, lon, horizon_days)
    if not om_data: 
        print("Open-Meteo forecast failed.")
        return None, None
    
    historical_steps = []
    
    # 2. Fetch Historical GEE Data (T-9 to T-1) using the EXACT robust pipeline
    for t in range(9, 0, -1): 
        end_date = today - timedelta(days=(t-1)*10)
        start_date = end_date - timedelta(days=10)
        
        combined_img = get_temporal_15ch_stack(region, start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
        
        if combined_img:
            try:
                step_np = get_ee_image_as_numpy(combined_img, region, scale=10)
                historical_steps.append(step_np)
            except Exception as e:
                print(f"GEE Download Error at T-{t}: {e}")
                return None, None
        else:
            print(f"GEE Stack Construction Failed at T-{t}")
            return None, None

    # 3. Construct T-0 (Future Step)
    t0_start = (today - timedelta(days=10)).strftime('%Y-%m-%d')
    t0_end = today.strftime('%Y-%m-%d')
    
    t0_combined_img = get_temporal_15ch_stack(region, t0_start, t0_end)
    if t0_combined_img:
        try:
            t0_np = get_ee_image_as_numpy(t0_combined_img, region, scale=10)
            
            # Surgically inject Open-Meteo forecasts into the climate bands (indices 6 to 14)
            om_bands = [
                om_data['Temp_2m'], om_data['Precip'], om_data['Max_Temp'], om_data['Min_Temp'],
                0.3, 0.3, 290.0, om_data['Dewpoint'], om_data['Solar_Rad']
            ]
            t0_np[6:15, :, :] = np.array(om_bands).reshape(9, 1, 1)
            
            historical_steps.append(t0_np)
        except Exception as e:
            print(f"T-0 Construction Error: {e}")
            return None, None
    else:
        print("T-0 Stack Construction Failed")
        return None, None

    # 4. Stack & Normalize
    full_tensor = np.stack(historical_steps, axis=0)
    
    normalized = np.zeros_like(full_tensor, dtype=np.float32)
    for c, band in enumerate(BAND_NAMES):
        mean = norm_stats[band]['mean']
        std = max(norm_stats[band]['std'], 1e-6)
        normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std
        
    # Transpose to NDHWC for TFLite: (10, 64, 64, 15)
    tflite_input = np.transpose(normalized, (0, 2, 3, 1))
    
    return np.expand_dims(tflite_input, axis=0).astype(np.float32), om_data

# ==============================================================================
# 6. HYBRID COGNITIVE: PHYSICAL INDEX FORMULAS (Integrated)
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

def om_calc_cold_wave(temp_min_celsius, duration_days):
    cold_anomaly = np.clip((16.0 - safe_float(temp_min_celsius, 16.0)) / 10.0, 0.0, 1.0)
    duration_factor = np.clip(safe_float(duration_days, 1.0) / 5.0, 0.0, 1.0)
    return float(np.clip(0.7 * cold_anomaly + 0.3 * duration_factor, 0.0, 1.0))

def om_calc_fire(temp_max_celsius, wind_max, et_sum):
    heat = np.clip((safe_float(temp_max_celsius, 30.0) - 25.0) / 15.0, 0.0, 1.0)
    wind = np.clip((safe_float(wind_max, 10.0) - 5.0) / 20.0, 0.0, 1.0)
    dryness = np.clip(safe_float(et_sum, 3.0) / 6.0, 0.0, 1.0)
    return float(np.clip(0.4 * heat + 0.3 * wind + 0.3 * dryness, 0.0, 1.0))

def om_calc_tropical_cyclone(wind_max, precip_sum_mm):
    w = max(safe_float(wind_max, 0.0) - 50.0, 0.0) / 150.0
    p = safe_float(precip_sum_mm, 0.0) / 300.0
    return float(np.clip(0.7 * min(w, 1.0) + 0.3 * min(p, 1.0), 0.0, 1.0))

def om_calc_drought(temp_max_celsius, precip_sum_mm):
    temp_stress = np.clip((safe_float(temp_max_celsius, 25.0) - 25.0) / 20.0, 0.0, 1.0)
    precip_deficit = np.clip((200.0 - safe_float(precip_sum_mm, 200.0)) / 200.0, 0.0, 1.0)
    return float(np.clip(0.6 * temp_stress + 0.4 * precip_deficit, 0.0, 1.0))

def om_calc_flood(precip_sum_mm, precip_max_mm):
    p_factor = np.clip(safe_float(precip_sum_mm, 0.0) / 300.0, 0.0, 1.0)
    i_factor = np.clip(safe_float(precip_max_mm, 0.0) / 100.0, 0.0, 1.0)
    return float(np.clip(0.5 * p_factor + 0.5 * i_factor, 0.0, 1.0))

def om_calc_heat_wave(temp_max_celsius, duration_days):
    temp_anomaly = np.clip((safe_float(temp_max_celsius, 30.0) - 30.0) / 15.0, 0.0, 1.0)
    duration_factor = np.clip(safe_float(duration_days, 1.0) / 5.0, 0.0, 1.0)
    return float(np.clip(0.7 * temp_anomaly + 0.3 * duration_factor, 0.0, 1.0))

# ==============================================================================
# 7. MODEL INFERENCE SETUP
# ==============================================================================
print("\nLoading TFLite Model and Normalization Stats...")
with open(STATS_PATH, 'r') as f:
    NORM_STATS = json.load(f)

interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

def run_inference(tensor):
    interpreter.set_tensor(input_details[0]['index'], tensor)
    interpreter.invoke()
    
    hazard_logits = interpreter.get_tensor(output_details[0]['index'])[0]
    severity_score = interpreter.get_tensor(output_details[1]['index'])[0]
    
    probs = tf.nn.softmax(hazard_logits).numpy()
    pred_class = np.argmax(probs)
    confidence = probs[pred_class]
    
    return HAZARD_CLASSES[pred_class], float(confidence), float(severity_score)

# ==============================================================================
# 8. OPTIMIZED MAIN EXECUTION LOOP (40% Faster)
# ==============================================================================

def fetch_historical_steps(lat, lon, norm_stats):
    """Fetches T-9 to T-1 historical GEE data ONCE per district."""
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()
    historical_steps = []
    
    for t in range(9, 0, -1): 
        end_date = today - timedelta(days=(t-1)*10)
        start_date = end_date - timedelta(days=10)
        
        combined_img = get_temporal_15ch_stack(region, start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
        
        if combined_img:
            try:
                step_np = get_ee_image_as_numpy(combined_img, region, scale=10)
                historical_steps.append(step_np)
            except Exception as e:
                print(f"GEE Download Error at T-{t} for {lat},{lon}: {e}")
                return None
        else:
            print(f"GEE Stack Construction Failed at T-{t} for {lat},{lon}")
            return None
            
    return historical_steps

def build_t0_and_infer(dist, historical_steps, horizon_days, norm_stats):
    """Constructs T-0, normalizes, and prepares for inference."""
    lat, lon = dist['lat'], dist['lon']
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()
    
    om_data = get_openmeteo_forecast(lat, lon, horizon_days)
    if not om_data: 
        return None, None
        
    t0_start = (today - timedelta(days=10)).strftime('%Y-%m-%d')
    t0_end = today.strftime('%Y-%m-%d')
    
    t0_combined_img = get_temporal_15ch_stack(region, t0_start, t0_end)
    if t0_combined_img:
        try:
            t0_np = get_ee_image_as_numpy(t0_combined_img, region, scale=10)
            
            # Surgically inject Open-Meteo forecasts into the climate bands (indices 6 to 14)
            om_bands = [
                om_data['Temp_2m'], om_data['Precip'], om_data['Max_Temp'], om_data['Min_Temp'],
                0.3, 0.3, 290.0, om_data['Dewpoint'], om_data['Solar_Rad']
            ]
            t0_np[6:15, :, :] = np.array(om_bands).reshape(9, 1, 1)
            
            # Stack historical (T-9 to T-1) with new T-0
            full_tensor = np.stack(historical_steps + [t0_np], axis=0)
            
            # Normalize
            normalized = np.zeros_like(full_tensor, dtype=np.float32)
            for c, band in enumerate(BAND_NAMES):
                mean = norm_stats[band]['mean']
                std = max(norm_stats[band]['std'], 1e-6)
                normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std
                
            # Transpose to NDHWC for TFLite: (10, 64, 64, 15)
            tflite_input = np.transpose(normalized, (0, 2, 3, 1))
            tflite_input = np.expand_dims(tflite_input, axis=0).astype(np.float32)
            
            return tflite_input, om_data
        except Exception as e:
            print(f"T-0 Construction Error for {dist['name']}: {e}")
            return None, None
    return None, None


# --- Execute Optimized Loop ---
results = []
print(f"\nStarting Optimized HazardNet Forecast Pipeline for {len(DISTRICTS)} Districts...")
print("Fetching historical data once per district, then projecting 2 horizons.\n")

for dist in DISTRICTS:
    print(f"Processing {dist['name']} ({dist['id']}/{len(DISTRICTS)})...")
    
    # 1. Fetch historical data (T-9 to T-1) ONLY ONCE
    historical_steps = fetch_historical_steps(dist['lat'], dist['lon'], NORM_STATS)
    
    if not historical_steps:
        print(f"Skipped {dist['name']} due to historical data failure.")
        continue
        
    # 2. Process each horizon using the cached historical data
    for horizon_name, days in HORIZONS.items():
        target_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')
        
        tensor, om_data = build_t0_and_infer(dist, historical_steps, days, NORM_STATS)
        
        if tensor is not None and om_data is not None:
            hazard, conf, severity = run_inference(tensor)
            
            # Calculate Physics-Based Severity
            temp_max_c = om_data['Max_Temp'] - 273.15
            temp_min_c = om_data['Min_Temp'] - 273.15
            precip_mm = om_data['Precip'] * 1000.0
            
            physics_severity = 0.50 # Default fallback
            if hazard == 'Tropical Cyclone':
                physics_severity = om_calc_tropical_cyclone(om_data['Wind_Max'], precip_mm)
            elif hazard == 'Severe Local Storm':
                physics_severity = om_calc_severe_storm(precip_mm, om_data['Wind_Max'])
            elif hazard == 'Cold Wave':
                physics_severity = om_calc_cold_wave(temp_min_c, days)
            elif hazard == 'Fire':
                physics_severity = om_calc_fire(temp_max_c, om_data['Wind_Max'], om_data['ET_Sum'])
            elif hazard == 'Drought':
                physics_severity = om_calc_drought(temp_max_c, precip_mm)
            elif hazard in ['Flood', 'Flash Flood']:
                physics_severity = om_calc_flood(precip_mm, precip_mm)
            elif hazard == 'Heat Wave':
                physics_severity = om_calc_heat_wave(temp_max_c, days)
            
            results.append({
                'district_id': dist['id'],
                'district_name': dist['name'],
                'division': dist['division'],
                'pcode': dist['pcode'],
                'horizon': horizon_name,
                'hazard_type': hazard,
                'model_severity': round(severity, 4),
                'physics_severity': round(physics_severity, 4),
                'confidence': round(conf, 4),
                'target_date': target_date,
                'prediction_date': datetime.now().strftime('%Y-%m-%d'),
                'data_source': 'Hybrid_Cognitive_Forecast'
            })
        else:
            print(f"Failed to process {dist['name']} ({horizon_name})")
            
        time.sleep(0.2) # Rate limit Open-Meteo API

# ==============================================================================
# 9. SAVE & VERIFY OUTPUT
# ==============================================================================
df_results = pd.DataFrame(results)
df_results.to_csv(OUTPUT_CSV, index=False)

print("\n" + "="*60)
print("FORECAST PIPELINE COMPLETE")
print("="*60)
print(f"Total Predictions: {len(df_results)}")
print(f"Output Saved To: {OUTPUT_CSV}")
print("\nSample Output:")
print(df_results.head(10).to_string())
```

---