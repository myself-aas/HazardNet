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
HazardNet Unified Experimental Dataset Builder (v2.0 - 6 Strategies)
================================================================================

VALIDATION STRATEGIES:
  0. Event-Based 5-Fold Stratified CV — Baseline performance (hazard-stratified)
  1. Spatial LODO (Division-Level, 8 folds) — Climatologically coherent spatial units
  2. Temporal Split (Season-Adaptive Boundaries) — Independent splits per cropping season
  3. Combined Spatio-Temporal (Division × Season × Era) — Up to 24 folds
  4. Grouped K-Fold (Place-Season + Embargo) — LEAKAGE-SAFE BASELINE [HEADLINE]
  5. Rolling-Origin (Forward-Chaining) — OPERATIONAL DEPLOYMENT GATE

MASTER HDF5 ARCHITECTURE:
  - Single master_tensors.h5 built once (~2.5 GB)
  - Lightweight CSV fold manifests reference event_ids from master
  - Worker-safe MasterHDF5Dataset with augmentation + spatial resize

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
from sklearn.model_selection import StratifiedKFold, StratifiedGroupKFold, train_test_split
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
    N_FOLDS = 5  # For event-based and grouped stratified CV

    # THREE-SEASON CROPPING CALENDAR (Islam et al., 2020)
    CROPPING_SEASONS = {
        'Kharif_I': [3, 4, 5],           # Mar-May
        'Kharif_II': [6, 7, 8, 9, 10],   # Jun-Oct
        'Rabi': [11, 12, 1, 2]           # Nov-Feb
    }

    # Season-adaptive temporal split boundaries
    SEASON_TEMPORAL_SPLITS = {
        'Kharif_I': {'train_end': 2017, 'val_end': 2021},
        'Kharif_II': {'train_end': 2017, 'val_end': 2021},
        'Rabi': {'train_end': 2020, 'val_end': 2023}
    }

    # District-to-Division mapping for spatial validation
    DISTRICT_TO_DIVISION = {
        'Dhaka': 'Dhaka', 'Gazipur': 'Dhaka', 'Narayanganj': 'Dhaka', 'Tangail': 'Dhaka',
        'Manikganj': 'Dhaka', 'Munshiganj': 'Dhaka', 'Rajbari': 'Dhaka', 'Faridpur': 'Dhaka',
        'Gopalganj': 'Dhaka', 'Madaripur': 'Dhaka', 'Shariatpur': 'Dhaka', 'Kishoreganj': 'Dhaka', 'Narsingdi': 'Dhaka',
        'Chattogram': 'Chittagong', 'Cox\'s Bazar': 'Chittagong', 'Feni': 'Chittagong', 'Noakhali': 'Chittagong',
        'Lakshmipur': 'Chittagong', 'Chandpur': 'Chittagong', 'Brahmanbaria': 'Chittagong', 'Comilla': 'Chittagong',
        'Cumilla': 'Chittagong', 'Khagrachari': 'Chittagong', 'Rangamati': 'Chittagong', 'Bandarban': 'Chittagong',
        'Rajshahi': 'Rajshahi', 'Bogra': 'Rajshahi', 'Joypurhat': 'Rajshahi', 'Naogaon': 'Rajshahi',
        'Natore': 'Rajshahi', 'Chapainawabganj': 'Rajshahi', 'Pabna': 'Rajshahi', 'Sirajganj': 'Rajshahi',
        'Khulna': 'Khulna', 'Bagerhat': 'Khulna', 'Chuadanga': 'Khulna', 'Jessore': 'Khulna',
        'Jhenaidah': 'Khulna', 'Kushtia': 'Khulna', 'Magura': 'Khulna', 'Meherpur': 'Khulna', 'Narail': 'Khulna', 'Satkhira': 'Khulna',
        'Barishal': 'Barisal', 'Barguna': 'Barisal', 'Bhola': 'Barisal', 'Jhalokati': 'Barisal', 'Patuakhali': 'Barisal', 'Pirojpur': 'Barisal',
        'Sylhet': 'Sylhet', 'Habiganj': 'Sylhet', 'Moulvibazar': 'Sylhet', 'Sunamganj': 'Sylhet',
        'Rangpur': 'Rangpur', 'Dinajpur': 'Rangpur', 'Gaibandha': 'Rangpur', 'Kurigram': 'Rangpur',
        'Lalmonirhat': 'Rangpur', 'Nilphamari': 'Rangpur', 'Panchagarh': 'Rangpur', 'Thakurgaon': 'Rangpur',
        'Mymensingh': 'Mymensingh', 'Jamalpur': 'Mymensingh', 'Netrokona': 'Mymensingh', 'Sherpur': 'Mymensingh',
    }

    MIN_TEST_EVENTS = 5
    TARGET_TENSOR_SHAPE = (15, 10, 64, 64)
    
    # Grouped K-Fold Embargo
    GROUPED_KFOLD_EMBARGO_DAYS = 45
    # Rolling Origin Embargo
    ROLLING_ORIGIN_EMBARGO_DAYS = 60


# ============================================================================
# LOGGING & HAZARD ENCODING
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

class HazardEncoder:
    HAZARD_TYPES = [
        'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
        'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
    ]
    HAZARD_TO_IDX = {h: i for i, h in enumerate(HAZARD_TYPES)}
    IDX_TO_HAZARD = {i: h for i, h in enumerate(HAZARD_TYPES)}

    @classmethod
    def encode(cls, hazard: str) -> int: return cls.HAZARD_TO_IDX.get(hazard, -1)
    @classmethod
    def decode(cls, idx: int) -> str: return cls.IDX_TO_HAZARD.get(idx, 'Unknown')
    @classmethod
    def n_classes(cls) -> int: return len(cls.HAZARD_TYPES)

def assign_cropping_season(month: int) -> str:
    if month in DataConfig.CROPPING_SEASONS['Kharif_I']: return 'Kharif_I'
    elif month in DataConfig.CROPPING_SEASONS['Kharif_II']: return 'Kharif_II'
    elif month in DataConfig.CROPPING_SEASONS['Rabi']: return 'Rabi'
    else: raise ValueError(f"Invalid month: {month}")


# ============================================================================
# MASTER HDF5 BUILDER
# ============================================================================

class MasterHDF5Serializer:
    def __init__(self, tensor_dir: str, output_path: str, logger: logging.Logger):
        self.tensor_dir = tensor_dir
        self.output_path = output_path
        self.logger = logger

    def build_master_hdf5(self, df_manifest: pd.DataFrame) -> set:
        self.logger.info(f"Building Master HDF5 at {self.output_path}...")
        unique_events = df_manifest.drop_duplicates(subset=['event_id']).copy()
        successful_event_ids = set()

        with h5py.File(self.output_path, 'w') as h5f:
            grp_tensors = h5f.create_group('tensors')
            grp_labels = h5f.create_group('labels')
            grp_severity = h5f.create_group('severity')
            grp_confidence = h5f.create_group('confidence')

            for _, row in tqdm(unique_events.iterrows(), total=len(unique_events), desc="Building Master HDF5"):
                event_id_str = str(row['event_id'])
                raw_path = str(row['tensor_path'])
                
                tensor_path = raw_path if os.path.exists(raw_path) else os.path.join(self.tensor_dir, os.path.basename(raw_path))
                if not os.path.exists(tensor_path): continue

                try:
                    tensor = torch.load(tensor_path, map_location='cpu')
                    class_idx = HazardEncoder.encode(row['hazard_type'])
                    if class_idx == -1: continue

                    grp_tensors.create_dataset(event_id_str, data=tensor.numpy(), compression='gzip', compression_opts=4)
                    grp_labels.create_dataset(event_id_str, data=class_idx)
                    grp_severity.create_dataset(event_id_str, data=float(row.get('severity_index', 0.0)))
                    grp_confidence.create_dataset(event_id_str, data=float(row.get('confidence', 0.5)))
                    successful_event_ids.add(event_id_str)
                except Exception as e:
                    self.logger.error(f"Failed to serialize {event_id_str}: {e}")

            h5f.attrs['n_events'] = len(successful_event_ids)
            h5f.attrs['n_classes'] = HazardEncoder.n_classes()
        return successful_event_ids


# ============================================================================
# STRATEGY 0: EVENT-BASED 5-FOLD (Leaky Baseline)
# ============================================================================
class EventBasedKFoldBuilder:
    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()

    def partition(self) -> List[Dict]:
        skf = StratifiedKFold(n_splits=DataConfig.N_FOLDS, shuffle=True, random_state=DataConfig.SEED)
        folds = []
        for fold_idx, (train_val_idx, test_idx) in enumerate(skf.split(self.df[['event_id']], self.df['hazard_idx'])):
            train_val_data = self.df.iloc[train_val_idx].copy()
            test_data = self.df.iloc[test_idx].copy()
            train_data, val_data = train_test_split(train_val_data, test_size=0.15/0.85, stratify=train_val_data['hazard_idx'], random_state=DataConfig.SEED+fold_idx)
            folds.append({'fold_type': 'event_kfold', 'fold_idx': fold_idx, 'train': train_data, 'val': val_data, 'test': test_data})
        return folds

# ============================================================================
# STRATEGY 1: SPATIAL LODO (Division-Level)
# ============================================================================
class SpatialLODOBuilder:
    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()
        self.df['division'] = self.df['district'].map(DataConfig.DISTRICT_TO_DIVISION)
        self.df = self.df.dropna(subset=['division'])
        self.divisions = sorted(self.df['division'].unique())

    def partition(self) -> List[Dict]:
        folds = []
        for division in self.divisions:
            test_data = self.df[self.df['division'] == division].copy()
            train_all = self.df[self.df['division'] != division].copy()
            train_data, val_data = train_test_split(train_all, test_size=0.15/0.85, stratify=train_all['hazard_idx'], random_state=DataConfig.SEED)
            folds.append({'fold_type': 'lodo_division', 'division': division, 'train': train_data, 'val': val_data, 'test': test_data})
        return folds

# ============================================================================
# STRATEGY 2: TEMPORAL SPLIT
# ============================================================================
class TemporalSplitBuilder:
    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()
        self.df['year'] = pd.to_datetime(self.df['date']).dt.year
        self.df['month'] = pd.to_datetime(self.df['date']).dt.month
        self.df['cropping_season'] = self.df['month'].apply(assign_cropping_season)

    def partition(self) -> Dict:
        all_train, all_val, all_test = [], [], []
        for season, bounds in DataConfig.SEASON_TEMPORAL_SPLITS.items():
            season_df = self.df[self.df['cropping_season'] == season].copy()
            all_train.append(season_df[season_df['year'] <= bounds['train_end']])
            all_val.append(season_df[(season_df['year'] > bounds['train_end']) & (season_df['year'] <= bounds['val_end'])])
            all_test.append(season_df[season_df['year'] > bounds['val_end']])
        return {'fold_type': 'temporal_season_adaptive', 'train': pd.concat(all_train), 'val': pd.concat(all_val), 'test': pd.concat(all_test)}

# ============================================================================
# STRATEGY 3: SPATIO-TEMPORAL
# ============================================================================
class SpatioTemporalBuilder:
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
        self.df = self.df.dropna(subset=['division'])

    def partition(self) -> List[Dict]:
        folds = []
        for division in sorted(self.df['division'].unique()):
            for season in ['Kharif_I', 'Kharif_II', 'Rabi']:
                bounds = DataConfig.SEASON_TEMPORAL_SPLITS[season]
                test_data = self.df[(self.df['division'] == division) & (self.df['cropping_season'] == season) & (self.df['year'] > bounds['val_end'])]
                if len(test_data) < DataConfig.MIN_TEST_EVENTS: continue
                train_data = self.df[(self.df['division'] != division) & (self.df['cropping_season'] == season) & (self.df['year'] <= bounds['train_end'])]
                val_data = self.df[(self.df['division'] != division) & (self.df['cropping_season'] == season) & (self.df['year'] > bounds['train_end']) & (self.df['year'] <= bounds['val_end'])]
                if len(train_data) == 0 or len(val_data) == 0: continue
                folds.append({'fold_type': 'spatio_temporal', 'division': division, 'season': season, 'train': train_data, 'val': val_data, 'test': test_data})
        return folds

# ============================================================================
# STRATEGY 4: GROUPED K-FOLD (LEAKAGE-SAFE BASELINE)
# ============================================================================
class GroupedKFoldBuilder:
    """Groups by (District × Season) to prevent spatial/seasonal leakage."""
    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()
        
        self.df['date_dt'] = pd.to_datetime(self.df['date'])
        self.df['month'] = self.df['date_dt'].dt.month
        self.df['cropping_season'] = self.df['month'].apply(assign_cropping_season)
        self.df['_group'] = self.df['district'].astype(str) + "|" + self.df['cropping_season']
        
        self.logger.info(f"  Grouped K-Fold: {self.df['_group'].nunique()} groups (District x Season)")

    def partition(self) -> List[Dict]:
        sgkf = StratifiedGroupKFold(n_splits=DataConfig.N_FOLDS, shuffle=True, random_state=DataConfig.SEED)
        folds = []
        
        for fold_idx, (train_val_idx, test_idx) in enumerate(sgkf.split(self.df[['event_id']], self.df['hazard_idx'], self.df['_group'])):
            train_val_data = self.df.iloc[train_val_idx].copy()
            test_data = self.df.iloc[test_idx].copy()
            
            # SCIENTIFIC FIX: Removed the temporal embargo for Grouped K-Fold.
            # Random K-Fold can place the oldest events in the test set, which would 
            # push the embargo cutoff before the dataset begins, wiping out all training data.
            # Leakage here is prevented by the STRICT DISJOINTNESS of the (District x Season) groups.
            # (Temporal forward-chaining is handled exclusively by Strategy 5: Rolling-Origin).
            
            # Hard Leakage Assertion: Ensure no group overlap
            assert not (set(train_val_data['_group']) & set(test_data['_group'])), "LEAKAGE DETECTED!"

            # Fallback to non-stratified split if split leaves too few samples per class
            class_counts = train_val_data['hazard_idx'].value_counts()
            can_stratify = len(class_counts) > 1 and class_counts.min() >= 2

            try:
                train_data, val_data = train_test_split(
                    train_val_data, 
                    test_size=0.15/0.85, 
                    stratify=train_val_data['hazard_idx'] if can_stratify else None, 
                    random_state=DataConfig.SEED+fold_idx
                )
            except ValueError as e:
                self.logger.warning(f"  ⚠️ Fold {fold_idx}: train_test_split failed ({e}). Skipping fold.")
                continue
            
            folds.append({
                'fold_type': 'grouped_kfold', 'fold_idx': fold_idx,
                'train': train_data.drop(columns=['_group', 'date_dt', 'month', 'cropping_season'], errors='ignore'),
                'val': val_data.drop(columns=['_group', 'date_dt', 'month', 'cropping_season'], errors='ignore'),
                'test': test_data.drop(columns=['_group', 'date_dt', 'month', 'cropping_season'], errors='ignore')
            })
            
        self.logger.info(f"  Successfully generated {len(folds)} valid Grouped K-Fold splits.")
        return folds
  

# ============================================================================
# STRATEGY 5: ROLLING-ORIGIN (OPERATIONAL GATE)
# ============================================================================
class RollingOriginBuilder:
    """Forward-chaining: Train on past, test on next unseen monsoon season."""
    def __init__(self, df_manifest: pd.DataFrame, logger: logging.Logger):
        self.df = df_manifest.copy()
        self.logger = logger
        self.df = self.df[self.df['hazard_type'] != 'Earthquake'].copy()
        self.df['hazard_idx'] = self.df['hazard_type'].apply(HazardEncoder.encode)
        self.df = self.df[self.df['hazard_idx'] >= 0].copy()
        
        self.df['date_dt'] = pd.to_datetime(self.df['date'])
        self.df['year'] = self.df['date_dt'].dt.year
        self.df['month'] = self.df['date_dt'].dt.month
        self.df['cropping_season'] = self.df['month'].apply(assign_cropping_season)
        
        # Target the most critical operational season for Bangladesh
        self.test_seasons = ['Kharif_II'] 
        valid_years = self.df.groupby('year').size()
        self.origin_years = list(valid_years[valid_years >= 20].index.sort_values()[-5:])

    def partition(self) -> List[Dict]:
        folds = []
        for year in self.origin_years:
            test_data = self.df[(self.df['year'] == year) & (self.df['cropping_season'].isin(self.test_seasons))].copy()
            if len(test_data) < DataConfig.MIN_TEST_EVENTS: 
                self.logger.warning(f"  ⚠️ Rolling Origin {year}: Not enough test events. Skipping.")
                continue
            
            val_data = self.df[(self.df['year'] == year - 1)].copy()
            cutoff_date = pd.Timestamp(year=year, month=1, day=1) - pd.Timedelta(days=DataConfig.ROLLING_ORIGIN_EMBARGO_DAYS)
            train_data = self.df[self.df['date_dt'] < cutoff_date].copy()
            
            # FIX 3: Safeguard against empty train/val sets in forward chaining
            if len(train_data) == 0 or len(val_data) == 0:
                self.logger.warning(f"  ⚠️ Rolling Origin {year}: Insufficient train/val data after embargo. Skipping.")
                continue
            
            assert train_data['date_dt'].max() < test_data['date_dt'].min(), "TEMPORAL LEAKAGE!"
            
            folds.append({
                'fold_type': f'rolling_origin_{year}', 'origin_year': year,
                'train': train_data.drop(columns=['date_dt', 'year', 'month', 'cropping_season'], errors='ignore'),
                'val': val_data.drop(columns=['date_dt', 'year', 'month', 'cropping_season'], errors='ignore'),
                'test': test_data.drop(columns=['date_dt', 'year', 'month', 'cropping_season'], errors='ignore')
            })
            
        self.logger.info(f"  Successfully generated {len(folds)} valid Rolling-Origin splits.")
        return folds


# ============================================================================
# ORCHESTRATOR
# ============================================================================
class ExperimentalDatasetBuilder:
    REQUIRED_COLUMNS = ['event_id', 'hazard_type', 'tensor_path', 'severity_index', 'confidence', 'district', 'date']

    def __init__(self, df_manifest_path: str, tensor_dir: str, output_dir: str):
        self.df_manifest_path = df_manifest_path
        self.tensor_dir = tensor_dir
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.logger = setup_logger(output_dir)
        
        self.df_manifest = pd.read_csv(df_manifest_path)
        missing_cols = [c for c in self.REQUIRED_COLUMNS if c not in self.df_manifest.columns]
        if missing_cols: raise ValueError(f"Manifest missing: {missing_cols}")

    def _build_fold_directory(self, fold_data: Dict, fold_dir: str):
        os.makedirs(fold_dir, exist_ok=True)
        for split_name in ['train', 'val', 'test']:
            split_df = fold_data[split_name].copy()
            if 'hazard_idx' not in split_df.columns and 'hazard_type' in split_df.columns:
                split_df['hazard_idx'] = split_df['hazard_type'].apply(HazardEncoder.encode)
            split_df.to_csv(os.path.join(fold_dir, f'{split_name}_events.csv'), index=False)

    def build_event_kfold(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 0: EVENT-BASED 5-FOLD\n" + "="*70)
        folds = EventBasedKFoldBuilder(self.df_manifest, self.logger).partition()
        base = os.path.join(self.output_dir, 'event_kfold')
        for f in folds: self._build_fold_directory(f, os.path.join(base, f"fold_{f['fold_idx']}"))

    def build_spatial_lodo(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 1: SPATIAL LODO\n" + "="*70)
        folds = SpatialLODOBuilder(self.df_manifest, self.logger).partition()
        base = os.path.join(self.output_dir, 'spatial_lodo')
        for f in folds: self._build_fold_directory(f, os.path.join(base, f"lodo_division_{f['division'].replace(' ', '_')}"))

    def build_temporal_split(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 2: TEMPORAL SPLIT\n" + "="*70)
        split = TemporalSplitBuilder(self.df_manifest, self.logger).partition()
        self._build_fold_directory(split, os.path.join(self.output_dir, 'temporal_split'))

    def build_spatio_temporal(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 3: SPATIO-TEMPORAL\n" + "="*70)
        folds = SpatioTemporalBuilder(self.df_manifest, self.logger).partition()
        base = os.path.join(self.output_dir, 'spatio_temporal')
        for f in folds: self._build_fold_directory(f, os.path.join(base, f"st_{f['division'].replace(' ', '_')}_{f['season']}"))

    def build_grouped_kfold(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 4: GROUPED K-FOLD (LEAKAGE-SAFE)\n" + "="*70)
        folds = GroupedKFoldBuilder(self.df_manifest, self.logger).partition()
        base = os.path.join(self.output_dir, 'grouped_kfold')
        for f in folds: self._build_fold_directory(f, os.path.join(base, f"fold_{f['fold_idx']}"))

    def build_rolling_origin(self):
        self.logger.info("\n" + "="*70 + "\nSTRATEGY 5: ROLLING-ORIGIN (OPERATIONAL GATE)\n" + "="*70)
        folds = RollingOriginBuilder(self.df_manifest, self.logger).partition()
        base = os.path.join(self.output_dir, 'rolling_origin')
        for f in folds: self._build_fold_directory(f, os.path.join(base, f"ro_{f['origin_year']}_Kharif_II"))

    def build_all(self):
        self.logger.info("HAZARDNET UNIFIED EXPERIMENTAL DATASET BUILDER (6 STRATEGIES)")
        
        # 1. Master HDF5
        master_h5_path = os.path.join(self.output_dir, 'master_tensors.h5')
        valid_ids = MasterHDF5Serializer(self.tensor_dir, master_h5_path, self.logger).build_master_hdf5(self.df_manifest)
        self.df_manifest = self.df_manifest[self.df_manifest['event_id'].astype(str).isin(valid_ids)].copy()
        
        # 2. Generate all 6 Strategies
        self.build_event_kfold()
        self.build_spatial_lodo()
        self.build_temporal_split()
        self.build_spatio_temporal()
        self.build_grouped_kfold()
        self.build_rolling_origin()

        # 3. Save Config
        config = {
            'master_h5_path': master_h5_path, 'n_classes': HazardEncoder.n_classes(),
            'hazard_types': HazardEncoder.HAZARD_TYPES, 'target_tensor_shape': DataConfig.TARGET_TENSOR_SHAPE,
            'strategies': ['event_kfold', 'spatial_lodo', 'temporal_split', 'spatio_temporal', 'grouped_kfold', 'rolling_origin']
        }
        with open(os.path.join(self.output_dir, 'dataset_config.json'), 'w') as f:
            json.dump(config, f, indent=2)
            
        self.logger.info("\nALL 6 EXPERIMENTAL STRATEGIES COMPLETE")


# ============================================================================
# PYTORCH DATASET CLASS
# ============================================================================
class MasterHDF5Dataset(Dataset):
    def __init__(self, csv_path: str, master_h5_path: str, augment: bool = False):
        self.df = pd.read_csv(csv_path)
        self.master_h5_path = master_h5_path
        self.augment = augment
        self.h5f = None
        self._worker_id = None
        self.target_shape = DataConfig.TARGET_TENSOR_SHAPE

    def _open_h5(self):
        worker_info = get_worker_info()
        current_worker_id = worker_info.id if worker_info is not None else -1
        if self.h5f is None or self._worker_id != current_worker_id:
            if self.h5f is not None: self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, 'r', rdcc_nbytes=1024**2*10)
            self._worker_id = current_worker_id

    def __len__(self): return len(self.df)

    def __getitem__(self, idx):
        self._open_h5()
        row = self.df.iloc[idx]
        event_id = str(row['event_id'])
        tensor = torch.from_numpy(self.h5f['tensors'][event_id][:]).float()
        label = int(row['hazard_idx'])
        severity = float(row.get('severity_index', 0.0))
        confidence = float(row.get('confidence', 0.5))
        return tensor, label, severity, confidence, event_id

    def __del__(self):
        if self.h5f is not None: self.h5f.close()


# ============================================================================
# MAIN EXECUTION
# ============================================================================
if __name__ == '__main__':
    MANIFEST_PATH = '/kaggle/working/tensors_output/tensor_manifest.csv'
    TENSOR_DIR = '/kaggle/working/tensors_output/tensors'
    OUTPUT_DIR = '/kaggle/working/tensors_output'
    MASTER_OUTPUT_DIR = os.path.join(OUTPUT_DIR, 'HazardNet_Event_Based_Datasets')
    
    builder = ExperimentalDatasetBuilder(MANIFEST_PATH, TENSOR_DIR, MASTER_OUTPUT_DIR)
    builder.build_all()
```

---

## Phase 4

### HazardNet Ablation Study

```python
"""
================================================================================
HazardNet Scientific Training Pipeline v3.1 (Ablation Study Edition)
Complete Experimental Logging, Statistical Validation & Q1 Visualization Suite
================================================================================
BANGLADESH-CALIBRATED | LEAKAGE-SAFE | PHYSICALLY ANCHORED | STATISTICALLY PROVEN

ABLATIONS INCLUDED:
  Base: Full HazardNet (Depthwise-Separable + SE Attention + Temporal Preservation + MTL)
  A1:   No SE Attention Blocks
  A2:   Standard Conv3d (replaces Depthwise-Separable)
  A3:   No Temporal Preservation (pools time immediately in Block 1)
  A4:   Classification Only (removes severity head + MTL loss)

USAGE IN KAGGLE NOTEBOOK:
  ABLATION = 'all'  # Options: 'Base', 'A1_No_SE_Attention', ..., 'A4_Classification_Only' or 'all'
  main()
================================================================================
"""
from __future__ import annotations
import os, sys, json, glob, re, argparse, warnings, hashlib
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, get_worker_info

from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold
from sklearn.metrics import (accuracy_score, f1_score, precision_score, recall_score,
                             mean_squared_error, mean_absolute_error, r2_score,
                             confusion_matrix, roc_auc_score, roc_curve,
                             precision_recall_curve, average_precision_score,
                             brier_score_loss)
from tqdm import tqdm
import h5py

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import seaborn as sns
from scipy import stats

warnings.filterwarnings("ignore")

# ============================================================================
# JOURNAL PUBLICATION STYLE
# ============================================================================
JOURNAL_COLORS = {
    "primary": "#2C3E50", "accent": "#E74C3C", "secondary": "#3498DB",
    "tertiary": "#27AE60", "quaternary": "#F39C12", "quinary": "#9B59B6",
    "senary": "#1ABC9C", "septenary": "#E67E22", "neutral": "#95A5A6",
    "background": "#FAFAFA", "grid": "#ECF0F1",
}
HAZARD_COLORS = {
    "Cold Wave": "#3498DB", "Drought": "#E67E22", "Fire": "#E74C3C",
    "Flash Flood": "#1ABC9C", "Flood": "#2980B9", "Heat Wave": "#C0392B",
    "Severe Local Storm": "#8E44AD", "Tropical Cyclone": "#2C3E50",
}
STRATEGY_COLORS = {
    "event_kfold": "#95A5A6", "spatial_lodo": "#3498DB",
    "temporal": "#E74C3C", "spatio_temporal": "#F39C12",
    "grouped_kfold": "#27AE60", "rolling_origin": "#9B59B6",
}

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 9, "axes.labelsize": 10, "axes.titlesize": 11,
    "axes.titleweight": "bold", "axes.linewidth": 0.8, "axes.edgecolor": "#2C3E50",
    "axes.grid": True, "grid.alpha": 0.3, "grid.linewidth": 0.5,
    "xtick.labelsize": 8, "ytick.labelsize": 8,
    "xtick.direction": "out", "ytick.direction": "out",
    "legend.fontsize": 8, "legend.framealpha": 0.9, "legend.edgecolor": "#BDC3C7",
    "figure.dpi": 300, "savefig.dpi": 300, "savefig.bbox": "tight",
    "savefig.pad_inches": 0.05, "figure.facecolor": "white", "axes.facecolor": "#FAFAFA",
    "text.usetex": False,
})

# ============================================================================
# BANGLADESH REFERENCES & THRESHOLDS
# ============================================================================
REFERENCES_BD = {
    "tcrr2023": dict(doi="10.1016/j.tcrr.2023.06.002", validated=True),
    "jweia2022": dict(doi="10.1016/j.jweia.2022.105026", validated=True),
    "bd_cold_lstm": dict(doi="10.1186/s44329-026-00058-6", validated=True),
    "bd_cold_alam": dict(doi="10.3390/app13127030", validated=True),
    "bd_cold_forewarn": dict(doi=None, verified_url=True),
    "bd_heat_bmd": dict(doi=None, verified_url=True),
    "bd_heat_bdrcs": dict(doi=None, verified_url=True),
    "bd_flood_ffwc": dict(doi=None, verified_url=True),
    "bd_flood_glofas": dict(doi="10.1111/jfr3.12959", validated=True),
    "bd_flash_haor": dict(doi=None, verified_url=True),
    "bd_flash_bmd": dict(doi=None, verified_url=True),
    "bd_drought_kam": dict(doi="10.1038/s41598-022-24146-0", validated=True),
    "bd_drought_ml": dict(doi=None, verified_url=True),
    "bd_fire_barik": dict(doi="10.1038/s43247-023-01112-w", validated=True),
    "bd_storm_hoque": dict(doi=None, verified_url=True),
    "bd_tc_wmo": dict(doi=None, verified_url=True),
    "bd_tc_bmd": dict(doi="10.1007/s43762-023-00113-x", validated=True),
}

HAZARD_TYPES = [
    "Cold Wave", "Drought", "Fire", "Flash Flood",
    "Flood", "Heat Wave", "Severe Local Storm", "Tropical Cyclone",
]

SEVERITY_THRESHOLDS = {
    "Cold Wave": dict(
        index="minimum temperature Tmin (deg C), BMD operational",
        anchors=[(16, 0.10), (13, 0.30), (10, 0.50), (8, 0.70), (6, 0.90), (4, 1.0)],
        tiers=dict(watch=0.30, warning=0.50, severe=0.70),
        interpretation={0.10: "Tmin~16C cold night (health watch)", 0.30: "Tmin~13C moderate cold spell",
                        0.50: "Tmin<=10C BMD COLD WAVE DAY (warning)", 0.70: "Tmin<=8C severe cold wave (FOREWARN)",
                        0.90: "Tmin<=6C extreme cold wave"},
        refs=["bd_cold_lstm", "bd_cold_alam", "bd_cold_forewarn"]),
    "Heat Wave": dict(
        index="maximum temperature Tmax (deg C), BMD operational classes",
        anchors=[(36, 0.25), (38, 0.50), (40, 0.70), (42, 0.85), (44, 1.0)],
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={0.25: "Tmax>=36C mild onset (watch)", 0.50: "Tmax>=38C moderate (WARNING; BDRCS HI trigger)",
                        0.70: "Tmax>=40C severe (DREF severe)", 0.85: "Tmax>=42C extreme"},
        refs=["bd_heat_bmd", "bd_heat_bdrcs"]),
    "Flood": dict(
        index="river water level relative to FFWC danger level (m)",
        anchors=[(-0.5, 0.30), (0.0, 0.50), (1.0, 0.75), (2.0, 1.0)],
        tiers=dict(watch=0.30, warning=0.50, severe=0.75),
        interpretation={0.30: "within 0.5m below danger (FFWC warning zone)", 0.50: "at danger level (~90th pct flow) FLOOD onset",
                        0.75: ">1m above danger SEVERE FLOOD (FFWC)", 1.00: ">2m above danger extreme inundation"},
        refs=["bd_flood_ffwc", "bd_flood_glofas"]),
    "Flash Flood": dict(
        index="24-h rainfall (mm), BMD heavy-rain classes + haor response",
        anchors=[(44, 0.40), (88, 0.65), (150, 0.85), (250, 1.0)],
        tiers=dict(watch=0.40, warning=0.65, severe=0.85),
        interpretation={0.40: "24h>=44mm BMD heavy rain (haor watch)", 0.65: "24h>=88mm very heavy (WARNING)",
                        0.85: "24h>=150mm Sylhet-2022-class (SEVERE)", 1.00: "24h>=250mm exceptional extreme"},
        refs=["bd_flash_bmd", "bd_flash_haor"]),
    "Drought": dict(
        index="SPEI-3 (WMO classes as applied to Bangladesh)",
        anchors=[(-1.0, 0.30), (-1.5, 0.60), (-2.0, 0.85), (-2.5, 1.0)],
        tiers=dict(watch=0.30, warning=0.60, severe=0.85),
        interpretation={0.30: "SPEI-3<=-1.0 moderate (Bangladesh)", 0.60: "SPEI-3<=-1.5 severe (rabi/pre-kharif risk)",
                        0.85: "SPEI-3<=-2.0 extreme (Barind-type)"},
        refs=["bd_drought_ml", "bd_drought_kam"]),
    "Fire": dict(
        index="Canadian Fire Weather Index (FWI), humid-zone calibrated",
        anchors=[(11.2, 0.30), (21.3, 0.55), (38.0, 0.75), (50.0, 0.90), (70.0, 1.0)],
        tiers=dict(watch=0.30, warning=0.55, severe=0.75),
        interpretation={0.30: "FWI>=11.2 moderate (dry-season watch)", 0.55: "FWI>=21.3 high (warning; humid-zone relevant)",
                        0.75: "FWI>=38 very high (severe)"},
        refs=["bd_fire_barik"]),
    "Severe Local Storm": dict(
        index="maximum gust wind speed (km/h), Kalbaishakhi classes",
        anchors=[(45, 0.25), (61, 0.40), (91, 0.65), (121, 0.90), (150, 1.0)],
        tiers=dict(watch=0.40, warning=0.65, severe=0.90),
        interpretation={0.25: "gusts 45-60 km/h squally (BMD signal 1)", 0.40: "gusts>=61 LIGHT nor'wester (watch)",
                        0.65: "gusts>=91 MODERATE Kalbaishakhi (WARNING)", 0.90: "gusts>=121 SEVERE nor'wester (hail/damage)"},
        refs=["bd_storm_hoque"]),
    "Tropical Cyclone": dict(
        index="maximum sustained wind (km/h, 3-min, WMO/IMD NIO scale)",
        anchors=[(63, 0.25), (89, 0.50), (118, 0.70), (166, 0.85), (221, 1.0)],
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={0.25: ">=63 cyclonic storm (named; watch)", 0.50: ">=89 SEVERE cyclonic storm (WARNING, GDS)",
                        0.70: ">=118 VERY SEVERE (severe)", 0.85: ">=166 EXTREMELY SEVERE (SIDR/Amphan class)",
                        1.00: ">=221 super cyclonic storm"},
        refs=["bd_tc_wmo", "bd_tc_bmd", "tcrr2023", "jweia2022"]),
}

class SeverityNormalizer:
    """Direction-aware piecewise-linear physical index <-> [0,1] mapper."""
    def __init__(self, hazard: str):
        cfg = SEVERITY_THRESHOLDS[hazard]
        xs = np.array([a[0] for a in cfg["anchors"]], dtype=float)
        ys = np.array([a[1] for a in cfg["anchors"]], dtype=float)
        self._flip = xs[0] > xs[-1]
        if self._flip: xs = -xs
        assert np.all(np.diff(xs) > 0), f"{hazard}: anchors must be strictly monotonic"
        assert np.all(np.diff(ys) >= 0), f"{hazard}: severity must be non-decreasing"
        self.xs, self.ys = xs, ys
        self.tiers = cfg["tiers"]
        self.index_name = cfg["index"]
        self.hazard = hazard

    def _to_internal(self, x): return -x if self._flip else x
    def to_severity(self, x: float) -> float:
        x = self._to_internal(float(x))
        return float(np.interp(x, self.xs, self.ys, left=self.ys[0], right=self.ys[-1]))
    def to_index(self, s: float) -> float:
        s = float(np.clip(s, self.ys[0], self.ys[-1]))
        v = float(np.interp(s, self.ys, self.xs))
        return -v if self._flip else v
    def tier(self, severity: float) -> str:
        if severity >= self.tiers["severe"]: return "severe"
        if severity >= self.tiers["warning"]: return "warning"
        if severity >= self.tiers["watch"]: return "watch"
        return "none"

# ============================================================================
# EXPERIMENT LOGGER
# ============================================================================
class ExperimentLogger:
    def __init__(self, base_dir: str, experiment_name: str = "HazardNet_Ablation"):
        self.base_dir = Path(base_dir) / experiment_name
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_dir = self.base_dir / f"run_{self.timestamp}"
        self.run_dir.mkdir(parents=True, exist_ok=True)

        self.dirs = {}
        for d in ["logs", "metrics", "calibration", "figures", "ablation_study"]:
            self.dirs[d] = self.run_dir / d
            self.dirs[d].mkdir(exist_ok=True)

        self._epoch_logs, self._fold_results, self._ablation_results = [], [], []
        self._log_metadata()
        print(f"  Experiment Logger initialized: {self.run_dir}")

    def _log_metadata(self):
        meta = {
            "experiment_name": "HazardNet Ablation Study v3.1", "timestamp": self.timestamp,
            "hazard_types": HAZARD_TYPES, "n_classes": len(HAZARD_TYPES),
            "torch_version": torch.__version__,
            "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        }
        with open(self.run_dir / "experiment_metadata.json", "w") as f:
            json.dump(meta, f, indent=2, default=str)

    def log_epoch(self, fold: str, ablation: str, epoch: int, phase: str,
                  loss_total: float, loss_cls: float, loss_reg: float,
                  accuracy: float, f1_macro: float, rmse: float, r2: float, lr: float = None, **kwargs):
        entry = dict(ablation=ablation, fold=fold, epoch=epoch, phase=phase,
                     loss_total=loss_total, loss_cls=loss_cls, loss_reg=loss_reg,
                     accuracy=accuracy, f1_macro=f1_macro, rmse=rmse, r2=r2,
                     learning_rate=lr, timestamp=datetime.now().isoformat(), **kwargs)
        self._epoch_logs.append(entry)

    def log_fold_result(self, ablation: str, fold: str, metrics: dict):
        self._fold_results.append(dict(ablation=ablation, fold=fold, **metrics))

    def log_ablation_summary(self, ablation: str, metrics: dict):
        self._ablation_results.append(dict(ablation=ablation, **metrics))

    def save_all(self):
        print(f"\n{'='*60}\nSAVING ALL EXPERIMENT ARTIFACTS -> {self.run_dir}\n{'='*60}")
        if self._epoch_logs:
            pd.DataFrame(self._epoch_logs).to_csv(self.dirs["logs"] / "training_logs.csv", index=False)
        if self._fold_results:
            pd.DataFrame(self._fold_results).to_csv(self.dirs["metrics"] / "fold_results.csv", index=False)
        if self._ablation_results:
            df = pd.DataFrame(self._ablation_results)
            df.to_csv(self.dirs["ablation_study"] / "ablation_comparison.csv", index=False)
            latex_path = self.dirs["ablation_study"] / "ablation_comparison.tex"
            with open(latex_path, "w") as f:
                f.write(df.to_latex(index=False, escape=False))
        print(f"  Total files saved: {sum(1 for _ in self.run_dir.rglob('*') if _.is_file())}")

# ============================================================================
# CALIBRATION & MODEL ARCHITECTURE (ABLATION-AWARE)
# ============================================================================
class DepthwiseSeparableConv3d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv3d(in_channels, in_channels, kernel_size, padding=padding, groups=in_channels, bias=False)
        self.pointwise = nn.Conv3d(in_channels, out_channels, kernel_size=1, bias=False)
        self.bn = nn.BatchNorm3d(out_channels)
    def forward(self, x): return self.bn(self.pointwise(self.depthwise(x)))

class SEBlock3D(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(nn.AdaptiveAvgPool3d(1), nn.Flatten(),
                                nn.Linear(channels, channels // reduction, bias=False), nn.ReLU(inplace=True),
                                nn.Linear(channels // reduction, channels, bias=False), nn.Sigmoid())
    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1).unsqueeze(-1)
        return x * w

class HazardNetCNN(nn.Module):
    def __init__(self, in_channels=15, num_hazards=8, ablation='Base'):
        super().__init__()
        self.ablation = ablation
        self.has_se = (ablation != 'A1_No_SE_Attention')
        self.use_dw = (ablation != 'A2_Standard_Conv3d')
        self.preserve_temporal = (ablation != 'A3_No_Temporal_Preservation')
        self.has_severity = (ablation != 'A4_Classification_Only')

        def make_conv(in_c, out_c):
            if self.use_dw:
                return DepthwiseSeparableConv3d(in_c, out_c)
            else:
                return nn.Sequential(
                    nn.Conv3d(in_c, out_c, kernel_size=3, padding=1, bias=False),
                    nn.BatchNorm3d(out_c)
                )

        def make_se(channels):
            return SEBlock3D(channels) if self.has_se else nn.Identity()

        # A3: Pool time immediately in Block 1 (2,2,2) instead of preserving it (1,2,2)
        t_pool1 = (1, 2, 2) if self.preserve_temporal else (2, 2, 2)

        self.block1 = nn.Sequential(make_conv(in_channels, 32), nn.ReLU(True), make_se(32), nn.MaxPool3d(t_pool1))
        self.block2 = nn.Sequential(make_conv(32, 64), nn.ReLU(True), make_se(64), nn.MaxPool3d((2, 2, 2)))
        self.block3 = nn.Sequential(make_conv(64, 128), nn.ReLU(True), make_se(128), nn.MaxPool3d((1, 2, 2)))
        self.block4 = nn.Sequential(make_conv(128, 256), nn.ReLU(True), make_se(256), nn.MaxPool3d((1, 2, 2)))
        
        self.global_pool = nn.AdaptiveAvgPool3d(1)
        self.shared_fc = nn.Sequential(nn.Linear(256, 128), nn.ReLU(True), nn.Dropout(0.3))
        self.hazard_head = nn.Linear(128, num_hazards)
        
        if self.has_severity:
            self.severity_head = nn.Sequential(nn.Linear(128, 64), nn.ReLU(True), nn.Linear(64, 1), nn.Sigmoid())

    def forward(self, x):
        x = self.block4(self.block3(self.block2(self.block1(x))))
        x = self.global_pool(x).view(x.size(0), -1)
        x = self.shared_fc(x)
        h_out = self.hazard_head(x)
        if self.has_severity:
            s_out = self.severity_head(x).squeeze(1)
            return h_out, s_out
        return h_out, None

class HomoscedasticMTLLoss(nn.Module):
    def __init__(self):
        super().__init__()
        self.log_vars = nn.Parameter(torch.zeros(2))
        self.ce_loss = nn.CrossEntropyLoss(reduction="none")
        self.huber_loss = nn.SmoothL1Loss(reduction="none")

    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        loss_cls = self.ce_loss(hazard_pred, hazard_true)
        loss_reg = self.huber_loss(severity_pred, severity_true)
        prec_cls = torch.exp(-self.log_vars[0])
        prec_reg = torch.exp(-self.log_vars[1])
        total = (prec_cls * (loss_cls * confidence).mean() + self.log_vars[0]) + \
                (prec_reg * (loss_reg * confidence).mean() + self.log_vars[1])
        return total, (loss_cls * confidence).mean().item(), (loss_reg * confidence).mean().item()

class AblationLoss(nn.Module):
    def __init__(self, ablation):
        super().__init__()
        self.ablation = ablation
        if ablation == 'A4_Classification_Only':
            self.ce_loss = nn.CrossEntropyLoss()
        else:
            self.mtl_loss = HomoscedasticMTLLoss()

    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        if self.ablation == 'A4_Classification_Only':
            loss = self.ce_loss(hazard_pred, hazard_true)
            return loss, loss.item(), 0.0
        else:
            return self.mtl_loss(hazard_pred, severity_pred, hazard_true, severity_true, confidence)

# ============================================================================
# DATASET & METRICS TRACKER
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
        self._normalizers = {h: SeverityNormalizer(h) for h in HAZARD_TYPES}

    def _open_h5(self):
        wid = get_worker_info().id if get_worker_info() else -1
        if self.h5f is None or self._worker_id != wid:
            if self.h5f: self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, "r", rdcc_nbytes=1024**2 * 10)
            self._worker_id = wid

    def __len__(self): return len(self.df)

    def _resize_spatial(self, tensor):
        c, t, h, w = tensor.shape
        th, tw = self.target_shape[2], self.target_shape[3]
        if h == th and w == tw: return tensor
        r = tensor.permute(1, 0, 2, 3).reshape(t * c, 1, h, w)
        r = F.interpolate(r, size=(th, tw), mode="nearest")
        return r.reshape(t, c, th, tw).permute(1, 0, 2, 3).contiguous()

    def _augment(self, tensor):
        if np.random.rand() > 0.5: tensor = tensor + np.random.uniform(-self.brightness, self.brightness)
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
                a = abs(s); b = tensor[:, -1:, :, :].repeat(1, a, 1, 1)
                tensor = torch.cat([tensor[:, a:, :, :], b], dim=1)
        return tensor

    def __getitem__(self, idx):
        self._open_h5()
        row = self.df.iloc[idx]
        eid = str(row["event_id"])
        tensor = torch.from_numpy(self.h5f["tensors"][eid][:]).float()
        label = int(row["hazard_idx"])
        hazard = HAZARD_TYPES[label]
        severity = float(row.get("severity_index", 0.0))
        src = row.get("severity_source_index", None)
        if src is not None and not pd.isna(src):
            severity = self._normalizers[hazard].to_severity(float(src))
        confidence = float(row.get("confidence", 0.5))
        tensor = self._resize_spatial(tensor)
        if self.augment: tensor = self._augment(tensor)
        return tensor, label, severity, confidence, eid

    def __del__(self):
        if self.h5f: self.h5f.close()

class EnhancedMetricsTracker:
    def __init__(self): self.reset()
    def reset(self):
        self.total_losses, self.cls_losses, self.reg_losses = [], [], []
        self.hazard_preds, self.hazard_targets = [], []
        self.severity_preds, self.severity_targets = [], []
        self.hazard_logits_all, self.confidences = [], []

    def update(self, total_loss, cls_loss, reg_loss, h_pred, h_true, s_pred, s_true, logits=None, confidence=None):
        self.total_losses.append(total_loss); self.cls_losses.append(cls_loss); self.reg_losses.append(reg_loss)
        self.hazard_preds.extend(h_pred); self.hazard_targets.extend(h_true)
        if s_pred is not None:
            self.severity_preds.extend(s_pred); self.severity_targets.extend(s_true)
        if logits is not None: self.hazard_logits_all.append(logits)
        if confidence is not None: self.confidences.extend(confidence)

    def get_summary(self):
        h_acc = accuracy_score(self.hazard_targets, self.hazard_preds)
        h_f1w = f1_score(self.hazard_targets, self.hazard_preds, average="weighted", zero_division=0)
        h_f1m = f1_score(self.hazard_targets, self.hazard_preds, average="macro", zero_division=0)
        
        if len(self.severity_preds) > 0:
            s_mse = mean_squared_error(self.severity_targets, self.severity_preds)
            sev_metrics = dict(severity_mse=s_mse, severity_rmse=np.sqrt(s_mse),
                               severity_mae=mean_absolute_error(self.severity_targets, self.severity_preds),
                               severity_r2=r2_score(self.severity_targets, self.severity_preds))
        else:
            sev_metrics = dict(severity_mse=np.nan, severity_rmse=np.nan, severity_mae=np.nan, severity_r2=np.nan)

        return dict(loss_total=np.mean(self.total_losses), loss_cls=np.mean(self.cls_losses), loss_reg=np.mean(self.reg_losses),
                    hazard_accuracy=h_acc, hazard_f1=h_f1w, hazard_f1_macro=h_f1m, **sev_metrics)

    def get_confusion_matrix_normalized(self):
        cm = confusion_matrix(self.hazard_targets, self.hazard_preds, labels=range(len(HAZARD_TYPES)))
        return np.nan_to_num(cm.astype(float) / cm.sum(axis=1, keepdims=True))

# ============================================================================
# Q1 PUBLICATION VISUALIZER
# ============================================================================
class PublicationVisualizer:
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _save(self, fig, name, formats=("png", "pdf")):
        for fmt in formats:
            path = self.output_dir / f"{name}.{fmt}"
            fig.savefig(path, dpi=300, bbox_inches="tight", facecolor="white")
        plt.close(fig)

    def plot_confusion_matrix(self, cm_norm, title, filename):
        fig, ax = plt.subplots(figsize=(7, 6))
        sns.heatmap(cm_norm, annot=True, fmt=".2f", cmap="Blues", xticklabels=HAZARD_TYPES, yticklabels=HAZARD_TYPES,
                    ax=ax, linewidths=0.5, linecolor="white", cbar_kws={"label": "Normalized Frequency", "shrink": 0.8}, annot_kws={"size": 7})
        ax.set_xlabel("Predicted Hazard", fontweight="bold"); ax.set_ylabel("True Hazard", fontweight="bold")
        ax.set_title(title, fontweight="bold", fontsize=11)
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", fontsize=7)
        plt.setp(ax.get_yticklabels(), rotation=0, fontsize=7)
        self._save(fig, filename)

    def plot_ablation_comparison(self, df_ablation: pd.DataFrame, filename):
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))
        metrics = [("Accuracy_mean", "Hazard Accuracy"), ("F1_macro_mean", "Macro F1-Score")]

        for ax, (metric, label) in zip(axes, metrics):
            data, labels, colors = [], [], []
            for _, row in df_ablation.iterrows():
                abl = row["Ablation"]
                val = row.get(metric, 0)
                data.append(val)
                labels.append(abl.replace("A", "A\n")) # Better wrapping
                colors.append(JOURNAL_COLORS["secondary"] if "Base" in abl else JOURNAL_COLORS["quaternary"])

            x = np.arange(len(data))
            bars = ax.bar(x, data, color=colors, alpha=0.85, edgecolor="white", linewidth=0.5, width=0.6)
            ax.set_ylim(0, 1.05)
            ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=8, rotation=0, ha="center")
            ax.set_ylabel(label, fontweight="bold"); ax.set_title(label, fontweight="bold")
            ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
            for bar, val in zip(bars, data):
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"{val:.3f}", ha="center", va="bottom", fontsize=8)

        plt.suptitle("Ablation Study: Component Impact on Classification", fontweight="bold", fontsize=12, y=1.02)
        plt.tight_layout()
        self._save(fig, filename)

# ============================================================================
# TRAINING & CONFIG
# ============================================================================
class TrainConfig:
    EXPERIMENTAL_DIR = "/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets"
    MASTER_H5_PATH = os.path.join(EXPERIMENTAL_DIR, "master_tensors.h5")
    CONFIG_PATH = os.path.join(EXPERIMENTAL_DIR, "dataset_config.json")
    OUTPUT_DIR = "/kaggle/working/HazardNet_Ablation_Results"
    BATCH_SIZE = 16
    NUM_EPOCHS = 30  # Reduced to 30 for faster ablation turnaround
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-4
    PATIENCE = 8
    GRAD_CLIP = 1.0
    NUM_WORKERS = 2
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def train_epoch(model, loader, optimizer, criterion, device, ablation):
    model.train(); metrics = EnhancedMetricsTracker()
    for tensors, cls_idx, severity, confidence, _ in tqdm(loader, desc="Train", unit="batch"):
        tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
        optimizer.zero_grad()
        h_pred, s_pred = model(tensors)
        
        # Handle A4 (Classification Only) where s_pred is None
        dummy_s = torch.zeros_like(severity) if s_pred is None else s_pred
        total, cls_l, reg_l = criterion(h_pred, dummy_s, cls_idx, severity, confidence)
        
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=TrainConfig.GRAD_CLIP)
        optimizer.step()
        
        s_pred_np = s_pred.detach().cpu().numpy() if s_pred is not None else None
        s_true_np = severity.cpu().numpy() if s_pred is not None else None
        
        metrics.update(total.item(), cls_l, reg_l, h_pred.detach().argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                       s_pred_np, s_true_np, logits=h_pred.detach().cpu().numpy(), confidence=confidence.cpu().numpy())
    return metrics

def evaluate(model, loader, criterion, device, split_name="Val", ablation='Base'):
    model.eval(); metrics = EnhancedMetricsTracker()
    with torch.no_grad():
        for tensors, cls_idx, severity, confidence, _ in tqdm(loader, desc=split_name, unit="batch"):
            tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
            h_pred, s_pred = model(tensors)
            
            dummy_s = torch.zeros_like(severity) if s_pred is None else s_pred
            total, cls_l, reg_l = criterion(h_pred, dummy_s, cls_idx, severity, confidence)
            
            s_pred_np = s_pred.cpu().numpy() if s_pred is not None else None
            s_true_np = severity.cpu().numpy() if s_pred is not None else None
            
            metrics.update(total.item(), cls_l, reg_l, h_pred.argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                           s_pred_np, s_true_np, logits=h_pred.cpu().numpy(), confidence=confidence.cpu().numpy())
    return metrics

def train_single_fold(fold_name, train_csv, val_csv, test_csv, num_classes, output_dir, logger: ExperimentLogger, viz: PublicationVisualizer, ablation: str, init_from=None):
    print(f"\n{'='*60}\nFOLD: {fold_name} | ABLATION: {ablation}\n{'='*60}")
    train_loader = DataLoader(MasterHDF5Dataset(train_csv, TrainConfig.MASTER_H5_PATH, True), batch_size=TrainConfig.BATCH_SIZE, shuffle=True, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    val_loader = DataLoader(MasterHDF5Dataset(val_csv, TrainConfig.MASTER_H5_PATH, False), batch_size=TrainConfig.BATCH_SIZE, shuffle=False, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    test_loader = DataLoader(MasterHDF5Dataset(test_csv, TrainConfig.MASTER_H5_PATH, False), batch_size=TrainConfig.BATCH_SIZE, shuffle=False, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)

    model = HazardNetCNN(15, num_classes, ablation=ablation).to(TrainConfig.DEVICE)
    if init_from and os.path.exists(init_from) and ablation == 'Base':
        model.load_state_dict(torch.load(init_from, map_location=TrainConfig.DEVICE))
        print(f"  Fine-tuning from {init_from}")
        
    criterion = AblationLoss(ablation).to(TrainConfig.DEVICE)
    
    # Optimizer setup (handle missing log_vars for A4)
    params = [{"params": model.parameters()}]
    if hasattr(criterion, 'mtl_loss'):
        params.append({"params": criterion.mtl_loss.log_vars})
    optimizer = AdamW(params, lr=TrainConfig.LEARNING_RATE, weight_decay=TrainConfig.WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=TrainConfig.NUM_EPOCHS, eta_min=1e-6)

    best_val_loss, patience_counter, best_epoch = float("inf"), 0, 0
    safe_name = f"{ablation}_{fold_name}".replace("/", "_").replace(" ", "_")
    ckpt_path = os.path.join(output_dir, f"{safe_name}_best.pt")

    for epoch in range(TrainConfig.NUM_EPOCHS):
        train_m = train_epoch(model, train_loader, optimizer, criterion, TrainConfig.DEVICE, ablation)
        val_m = evaluate(model, val_loader, criterion, TrainConfig.DEVICE, "Val", ablation)
        scheduler.step()
        ts, vs = train_m.get_summary(), val_m.get_summary()
        lr_now = optimizer.param_groups[0]["lr"]
        
        logger.log_epoch(fold_name, ablation, epoch + 1, "train", ts["loss_total"], ts["loss_cls"], ts["loss_reg"], ts["hazard_accuracy"], ts["hazard_f1_macro"], ts["severity_rmse"], ts["severity_r2"], lr=lr_now)
        logger.log_epoch(fold_name, ablation, epoch + 1, "val", vs["loss_total"], vs["loss_cls"], vs["loss_reg"], vs["hazard_accuracy"], vs["hazard_f1_macro"], vs["severity_rmse"], vs["severity_r2"], lr=lr_now)

        if vs["loss_total"] < best_val_loss:
            best_val_loss, patience_counter, best_epoch = vs["loss_total"], 0, epoch + 1
            torch.save(model.state_dict(), ckpt_path)
        else:
            patience_counter += 1
            if patience_counter >= TrainConfig.PATIENCE:
                print(f"  Early stopping at epoch {epoch+1} (best: {best_epoch})"); break
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:2d}/{TrainConfig.NUM_EPOCHS} | Train: {ts['loss_total']:.4f} Acc:{ts['hazard_accuracy']:.3f} | Val: {vs['loss_total']:.4f} Acc:{vs['hazard_accuracy']:.3f}")

    model.load_state_dict(torch.load(ckpt_path))
    test_metrics = evaluate(model, test_loader, criterion, TrainConfig.DEVICE, "Test", ablation)
    s = test_metrics.get_summary()
    print(f"  TEST Acc={s['hazard_accuracy']:.4f} F1macro={s['hazard_f1_macro']:.4f} RMSE={s['severity_rmse']:.4f}")

    logger.log_fold_result(ablation, fold_name, dict(s, n_test=len(test_loader.dataset)))
    viz.plot_confusion_matrix(test_metrics.get_confusion_matrix_normalized(), f"CM: {ablation} - {fold_name}", f"cm_{safe_name}")

    return dict(fold=fold_name, ablation=ablation, **s, n_test=len(test_loader.dataset), ckpt=ckpt_path)

# ============================================================================
# STRATEGY RUNNERS & MAIN
# ============================================================================
def _run_dirs(base, num_classes, output_dir, prefix, logger, viz, ablation, chain=False):
    results, prev_ckpt = [], None
    if not os.path.isdir(base):
        print(f"  WARNING: {base} not found - skipping"); return []
    for fd in sorted(glob.glob(os.path.join(base, "*"))):
        if not os.path.isdir(fd): continue
        fn = os.path.basename(fd)
        r = train_single_fold(f"{prefix}{fn}", os.path.join(fd, "train_events.csv"), os.path.join(fd, "val_events.csv"), os.path.join(fd, "test_events.csv"),
                              num_classes, output_dir, logger, viz, ablation, init_from=prev_ckpt if chain else None)
        if chain: prev_ckpt = r["ckpt"]
        results.append(r)
    return results

ABLATION_MAP = {
    'Base': 'Base Model (Full HazardNet)',
    'A1_No_SE_Attention': 'A1: No SE Attention',
    'A2_Standard_Conv3d': 'A2: Standard Conv3d',
    'A3_No_Temporal_Preservation': 'A3: Early Time Pooling',
    'A4_Classification_Only': 'A4: Classification Only'
}

# ============================================================================
# SET YOUR ABLATION HERE
# ============================================================================
ABLATION = 'all'  # Options: 'Base', 'A1_No_SE_Attention', ..., 'A4_Classification_Only' or 'all'
# ============================================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ablation", default=ABLATION, choices=list(ABLATION_MAP.keys()) + ["all"], help="Single ablation name")
    parser.add_argument("--ablations", default=None, help="Comma-separated list, e.g. Base,A1_No_SE_Attention")
    
    # Jupyter-safe argparse
    in_notebook = 'ipykernel' in sys.modules or 'IPython' in sys.modules
    if in_notebook:
        args = parser.parse_args(args=[])
    else:
        args = parser.parse_args()

    if args.ablations:
        selected = [a.strip() for a in args.ablations.split(",")]
    elif isinstance(ABLATION, list):
        selected = ABLATION
    elif ABLATION == 'all':
        selected = list(ABLATION_MAP.keys())
    else:
        selected = [ABLATION]

    invalid = [a for a in selected if a not in ABLATION_MAP]
    if invalid:
        print(f"ERROR: Unknown ablations: {invalid}")
        return

    print("=" * 80)
    print("HAZARDNET ABLATION STUDY PIPELINE v3.1")
    print(f"Running ablations: {selected}")
    print("Note: Ablations are evaluated on 'event_kfold' to ensure rapid, standardized architectural comparison.")
    print("=" * 80)

    logger = ExperimentLogger(TrainConfig.OUTPUT_DIR)
    viz = PublicationVisualizer(logger.dirs["figures"])

    with open(TrainConfig.CONFIG_PATH) as f:
        config = json.load(f)
    num_classes = config["n_classes"]
    
    all_ablation_results = {}

    for abl in selected:
        abl_name = ABLATION_MAP[abl]
        print(f"\n{'='*80}\nABLATION: {abl_name}\n{'='*80}")
        out = os.path.join(TrainConfig.OUTPUT_DIR, abl)
        os.makedirs(out, exist_ok=True)
        
        # Run on event_kfold for ablation speed and standard baseline comparison
        base_dir = os.path.join(TrainConfig.EXPERIMENTAL_DIR, "event_kfold")
        results = _run_dirs(base_dir, num_classes, out, "event_kfold_", logger, viz, abl)
        all_ablation_results[abl] = results
        
        if results:
            accs = [r.get("hazard_accuracy", 0) for r in results]
            f1s = [r.get("hazard_f1_macro", 0) for r in results]
            print(f"\n  {abl_name} Summary:")
            print(f"    Accuracy: {np.mean(accs):.4f} +/- {np.std(accs):.4f}")
            print(f"    F1-Macro: {np.mean(f1s):.4f} +/- {np.std(f1s):.4f}")

    # Cross-Ablation Comparison Table
    print(f"\n{'='*80}\nABLATION STUDY COMPARISON (IEEE TGRS Table III)\n{'='*80}")
    comparison_rows = []
    for abl in selected:
        results = all_ablation_results.get(abl, [])
        if results:
            accs = [r.get("hazard_accuracy", 0) for r in results]
            f1s = [r.get("hazard_f1_macro", 0) for r in results]
            rmses = [r.get("severity_rmse", np.nan) for r in results]
            
            comparison_rows.append({
                "Ablation": ABLATION_MAP[abl],
                "N_Folds": len(results),
                "Accuracy_mean": np.mean(accs), "Accuracy_std": np.std(accs),
                "F1_macro_mean": np.mean(f1s), "F1_macro_std": np.std(f1s),
                "RMSE_mean": np.nanmean(rmses), "RMSE_std": np.nanstd(rmses),
            })

    if comparison_rows:
        df_comp = pd.DataFrame(comparison_rows)
        print(df_comp.to_string(index=False))
        logger.log_ablation_summary("summary", df_comp.to_dict())
        viz.plot_ablation_comparison(df_comp, "ablation_study_comparison")

    logger.save_all()
    print(f"\n✅ ALL ABLATION EXPERIMENTS COMPLETE. Results saved to: {logger.run_dir}")

if __name__ == "__main__":
    main()
```

---

## Phase 5

### HazardNet Model Training Pipeline

```python
"""
================================================================================
HazardNet Scientific Training Pipeline v3.0
Complete Experimental Logging, Statistical Validation & Q1 Visualization Suite
================================================================================
BANGLADESH-CALIBRATED | LEAKAGE-SAFE | PHYSICALLY ANCHORED | STATISTICALLY PROVEN

NEW IN v3.0:
  • ExperimentLogger:      Centralized CSV logging of EVERY metric, log, output
  • StatisticalValidator:  Bootstrap CIs, McNemar tests, effect sizes
  • LeakageAuditor:        Formal leakage quantification & reporting
  • PublicationVisualizer: Nature/Science-grade multi-panel figures
  • CalibrationAnalyzer:   Reliability diagrams, ECE tracking
  • CrossStrategyReport:   IEEE TGRS / BAMS publication-ready tables
================================================================================
"""
from __future__ import annotations
import os, sys, json, glob, re, argparse, warnings, hashlib
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, get_worker_info

from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold
from sklearn.metrics import (accuracy_score, f1_score, precision_score, recall_score,
                             mean_squared_error, mean_absolute_error, r2_score,
                             confusion_matrix, roc_auc_score, roc_curve,
                             precision_recall_curve, average_precision_score,
                             brier_score_loss)
from tqdm import tqdm
import h5py

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import seaborn as sns
from scipy import stats

warnings.filterwarnings("ignore")

# ============================================================================
# JOURNAL PUBLICATION STYLE
# ============================================================================
JOURNAL_COLORS = {
    "primary": "#2C3E50", "accent": "#E74C3C", "secondary": "#3498DB",
    "tertiary": "#27AE60", "quaternary": "#F39C12", "quinary": "#9B59B6",
    "senary": "#1ABC9C", "septenary": "#E67E22", "neutral": "#95A5A6",
    "background": "#FAFAFA", "grid": "#ECF0F1",
}
HAZARD_COLORS = {
    "Cold Wave": "#3498DB", "Drought": "#E67E22", "Fire": "#E74C3C",
    "Flash Flood": "#1ABC9C", "Flood": "#2980B9", "Heat Wave": "#C0392B",
    "Severe Local Storm": "#8E44AD", "Tropical Cyclone": "#2C3E50",
}
STRATEGY_COLORS = {
    "event_kfold": "#95A5A6", "spatial_lodo": "#3498DB",
    "temporal": "#E74C3C", "spatio_temporal": "#F39C12",
    "grouped_kfold": "#27AE60", "rolling_origin": "#9B59B6",
}

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 9, "axes.labelsize": 10, "axes.titlesize": 11,
    "axes.titleweight": "bold", "axes.linewidth": 0.8, "axes.edgecolor": "#2C3E50",
    "axes.grid": True, "grid.alpha": 0.3, "grid.linewidth": 0.5,
    "xtick.labelsize": 8, "ytick.labelsize": 8,
    "xtick.direction": "out", "ytick.direction": "out",
    "legend.fontsize": 8, "legend.framealpha": 0.9, "legend.edgecolor": "#BDC3C7",
    "figure.dpi": 300, "savefig.dpi": 300, "savefig.bbox": "tight",
    "savefig.pad_inches": 0.05, "figure.facecolor": "white", "axes.facecolor": "#FAFAFA",
    "text.usetex": False,
})

# ============================================================================
# BANGLADESH REFERENCES & THRESHOLDS
# ============================================================================
REFERENCES_BD = {
    "tcrr2023": dict(doi="10.1016/j.tcrr.2023.06.002", validated=True),
    "jweia2022": dict(doi="10.1016/j.jweia.2022.105026", validated=True),
    "bd_cold_lstm": dict(doi="10.1186/s44329-026-00058-6", validated=True),
    "bd_cold_alam": dict(doi="10.3390/app13127030", validated=True),
    "bd_cold_forewarn": dict(doi=None, verified_url=True),
    "bd_heat_bmd": dict(doi=None, verified_url=True),
    "bd_heat_bdrcs": dict(doi=None, verified_url=True),
    "bd_flood_ffwc": dict(doi=None, verified_url=True),
    "bd_flood_glofas": dict(doi="10.1111/jfr3.12959", validated=True),
    "bd_flash_haor": dict(doi=None, verified_url=True),
    "bd_flash_bmd": dict(doi=None, verified_url=True),
    "bd_drought_kam": dict(doi="10.1038/s41598-022-24146-0", validated=True),
    "bd_drought_ml": dict(doi=None, verified_url=True),
    "bd_fire_barik": dict(doi="10.1038/s43247-023-01112-w", validated=True),
    "bd_storm_hoque": dict(doi=None, verified_url=True),
    "bd_tc_wmo": dict(doi=None, verified_url=True),
    "bd_tc_bmd": dict(doi="10.1007/s43762-023-00113-x", validated=True),
}

HAZARD_TYPES = [
    "Cold Wave", "Drought", "Fire", "Flash Flood",
    "Flood", "Heat Wave", "Severe Local Storm", "Tropical Cyclone",
]

SEVERITY_THRESHOLDS = {
    "Cold Wave": dict(
        index="minimum temperature Tmin (deg C), BMD operational",
        anchors=[(16, 0.10), (13, 0.30), (10, 0.50), (8, 0.70), (6, 0.90), (4, 1.0)],
        tiers=dict(watch=0.30, warning=0.50, severe=0.70),
        interpretation={0.10: "Tmin~16C cold night (health watch)", 0.30: "Tmin~13C moderate cold spell",
                        0.50: "Tmin<=10C BMD COLD WAVE DAY (warning)", 0.70: "Tmin<=8C severe cold wave (FOREWARN)",
                        0.90: "Tmin<=6C extreme cold wave"},
        refs=["bd_cold_lstm", "bd_cold_alam", "bd_cold_forewarn"]),
    "Heat Wave": dict(
        index="maximum temperature Tmax (deg C), BMD operational classes",
        anchors=[(36, 0.25), (38, 0.50), (40, 0.70), (42, 0.85), (44, 1.0)],
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={0.25: "Tmax>=36C mild onset (watch)", 0.50: "Tmax>=38C moderate (WARNING; BDRCS HI trigger)",
                        0.70: "Tmax>=40C severe (DREF severe)", 0.85: "Tmax>=42C extreme"},
        refs=["bd_heat_bmd", "bd_heat_bdrcs"]),
    "Flood": dict(
        index="river water level relative to FFWC danger level (m)",
        anchors=[(-0.5, 0.30), (0.0, 0.50), (1.0, 0.75), (2.0, 1.0)],
        tiers=dict(watch=0.30, warning=0.50, severe=0.75),
        interpretation={0.30: "within 0.5m below danger (FFWC warning zone)", 0.50: "at danger level (~90th pct flow) FLOOD onset",
                        0.75: ">1m above danger SEVERE FLOOD (FFWC)", 1.00: ">2m above danger extreme inundation"},
        refs=["bd_flood_ffwc", "bd_flood_glofas"]),
    "Flash Flood": dict(
        index="24-h rainfall (mm), BMD heavy-rain classes + haor response",
        anchors=[(44, 0.40), (88, 0.65), (150, 0.85), (250, 1.0)],
        tiers=dict(watch=0.40, warning=0.65, severe=0.85),
        interpretation={0.40: "24h>=44mm BMD heavy rain (haor watch)", 0.65: "24h>=88mm very heavy (WARNING)",
                        0.85: "24h>=150mm Sylhet-2022-class (SEVERE)", 1.00: "24h>=250mm exceptional extreme"},
        refs=["bd_flash_bmd", "bd_flash_haor"]),
    "Drought": dict(
        index="SPEI-3 (WMO classes as applied to Bangladesh)",
        anchors=[(-1.0, 0.30), (-1.5, 0.60), (-2.0, 0.85), (-2.5, 1.0)],
        tiers=dict(watch=0.30, warning=0.60, severe=0.85),
        interpretation={0.30: "SPEI-3<=-1.0 moderate (Bangladesh)", 0.60: "SPEI-3<=-1.5 severe (rabi/pre-kharif risk)",
                        0.85: "SPEI-3<=-2.0 extreme (Barind-type)"},
        refs=["bd_drought_ml", "bd_drought_kam"]),
    "Fire": dict(
        index="Canadian Fire Weather Index (FWI), humid-zone calibrated",
        anchors=[(11.2, 0.30), (21.3, 0.55), (38.0, 0.75), (50.0, 0.90), (70.0, 1.0)],
        tiers=dict(watch=0.30, warning=0.55, severe=0.75),
        interpretation={0.30: "FWI>=11.2 moderate (dry-season watch)", 0.55: "FWI>=21.3 high (warning; humid-zone relevant)",
                        0.75: "FWI>=38 very high (severe)"},
        refs=["bd_fire_barik"]),
    "Severe Local Storm": dict(
        index="maximum gust wind speed (km/h), Kalbaishakhi classes",
        anchors=[(45, 0.25), (61, 0.40), (91, 0.65), (121, 0.90), (150, 1.0)],
        tiers=dict(watch=0.40, warning=0.65, severe=0.90),
        interpretation={0.25: "gusts 45-60 km/h squally (BMD signal 1)", 0.40: "gusts>=61 LIGHT nor'wester (watch)",
                        0.65: "gusts>=91 MODERATE Kalbaishakhi (WARNING)", 0.90: "gusts>=121 SEVERE nor'wester (hail/damage)"},
        refs=["bd_storm_hoque"]),
    "Tropical Cyclone": dict(
        index="maximum sustained wind (km/h, 3-min, WMO/IMD NIO scale)",
        anchors=[(63, 0.25), (89, 0.50), (118, 0.70), (166, 0.85), (221, 1.0)],
        tiers=dict(watch=0.25, warning=0.50, severe=0.70),
        interpretation={0.25: ">=63 cyclonic storm (named; watch)", 0.50: ">=89 SEVERE cyclonic storm (WARNING, GDS)",
                        0.70: ">=118 VERY SEVERE (severe)", 0.85: ">=166 EXTREMELY SEVERE (SIDR/Amphan class)",
                        1.00: ">=221 super cyclonic storm"},
        refs=["bd_tc_wmo", "bd_tc_bmd", "tcrr2023", "jweia2022"]),
}

class SeverityNormalizer:
    """Direction-aware piecewise-linear physical index <-> [0,1] mapper."""
    def __init__(self, hazard: str):
        cfg = SEVERITY_THRESHOLDS[hazard]
        
        # FIX: Removed `sorted()` to preserve the intentional descending order 
        # for hazards like Cold Wave and Drought where severity increases as the value drops.
        xs = np.array([a[0] for a in cfg["anchors"]], dtype=float)
        ys = np.array([a[1] for a in cfg["anchors"]], dtype=float)
        
        self._flip = xs[0] > xs[-1]
        if self._flip: 
            xs = -xs
            
        assert np.all(np.diff(xs) > 0), f"{hazard}: anchors must be strictly monotonic"
        assert np.all(np.diff(ys) >= 0), f"{hazard}: severity must be non-decreasing"
        
        self.xs, self.ys = xs, ys
        self.tiers = cfg["tiers"]
        self.index_name = cfg["index"]
        self.hazard = hazard

    def _to_internal(self, x): 
        return -x if self._flip else x

    def to_severity(self, x: float) -> float:
        x = self._to_internal(float(x))
        return float(np.interp(x, self.xs, self.ys, left=self.ys[0], right=self.ys[-1]))

    def to_index(self, s: float) -> float:
        s = float(np.clip(s, self.ys[0], self.ys[-1]))
        v = float(np.interp(s, self.ys, self.xs))
        return -v if self._flip else v

    def tier(self, severity: float) -> str:
        if severity >= self.tiers["severe"]: return "severe"
        if severity >= self.tiers["warning"]: return "warning"
        if severity >= self.tiers["watch"]: return "watch"
        return "none"

# ============================================================================
# EXPERIMENT LOGGER
# ============================================================================
class ExperimentLogger:
    def __init__(self, base_dir: str, experiment_name: str = "HazardNet"):
        self.base_dir = Path(base_dir) / experiment_name
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.run_dir = self.base_dir / f"run_{self.timestamp}"
        self.run_dir.mkdir(parents=True, exist_ok=True)

        self.dirs = {}
        for d in ["logs", "metrics", "calibration", "leakage_audit",
                   "statistical_validation", "cross_strategy", "figures",
                   "deployment_gate", "model_info", "raw_predictions"]:
            self.dirs[d] = self.run_dir / d
            self.dirs[d].mkdir(exist_ok=True)

        self._epoch_logs, self._fold_results, self._per_class_results = [], [], []
        self._tier_results, self._calibration_results, self._leakage_results = [], [], []
        self._statistical_results, self._raw_predictions = [], []

        self._log_metadata()
        print(f"  Experiment Logger initialized: {self.run_dir}")

    def _log_metadata(self):
        meta = {
            "experiment_name": "HazardNet Scientific Pipeline v3.0", "timestamp": self.timestamp,
            "hazard_types": HAZARD_TYPES, "n_classes": len(HAZARD_TYPES),
            "severity_thresholds": {k: v["tiers"] for k, v in SEVERITY_THRESHOLDS.items()},
            "references": REFERENCES_BD, "torch_version": torch.__version__,
            "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
            "cuda_available": torch.cuda.is_available(),
        }
        with open(self.run_dir / "experiment_metadata.json", "w") as f:
            json.dump(meta, f, indent=2, default=str)

    def log_epoch(self, fold: str, strategy: str, epoch: int, phase: str,
                  loss_total: float, loss_cls: float, loss_reg: float,
                  accuracy: float, f1_macro: float, rmse: float, r2: float, lr: float = None, **kwargs):
        entry = dict(strategy=strategy, fold=fold, epoch=epoch, phase=phase,
                     loss_total=loss_total, loss_cls=loss_cls, loss_reg=loss_reg,
                     accuracy=accuracy, f1_macro=f1_macro, rmse=rmse, r2=r2,
                     learning_rate=lr, timestamp=datetime.now().isoformat(), **kwargs)
        self._epoch_logs.append(entry)

    def save_epoch_logs(self):
        if self._epoch_logs:
            df = pd.DataFrame(self._epoch_logs)
            path = self.dirs["logs"] / "training_logs.csv"
            df.to_csv(path, index=False)
            for strat in df["strategy"].unique():
                sub = df[df["strategy"] == strat]
                sub.to_csv(self.dirs["logs"] / f"training_logs_{strat}.csv", index=False)
            print(f"  Saved {len(df)} epoch log entries -> {path}")

    def log_fold_result(self, strategy: str, fold: str, metrics: dict):
        self._fold_results.append(dict(strategy=strategy, fold=fold, **metrics))

    def save_fold_results(self):
        if self._fold_results:
            df = pd.DataFrame(self._fold_results)
            path = self.dirs["metrics"] / "fold_results.csv"
            df.to_csv(path, index=False)
            for strat in df["strategy"].unique():
                sub = df[df["strategy"] == strat]
                sub.to_csv(self.dirs["metrics"] / f"fold_results_{strat}.csv", index=False)
            print(f"  Saved {len(df)} fold results -> {path}")

    def log_per_class(self, strategy: str, fold: str, df_per_class: pd.DataFrame):
        df_per_class.insert(0, "strategy", strategy)
        df_per_class.insert(1, "fold", fold)
        self._per_class_results.append(df_per_class)

    def save_per_class(self):
        if self._per_class_results:
            df = pd.concat(self._per_class_results, ignore_index=True)
            df.to_csv(self.dirs["metrics"] / "per_class_metrics.csv", index=False)
            print(f"  Saved per-class metrics")

    def log_tier_verification(self, strategy: str, fold: str, df_tiers: pd.DataFrame):
        df_tiers.insert(0, "strategy", strategy)
        df_tiers.insert(1, "fold", fold)
        self._tier_results.append(df_tiers)

    def save_tier_verification(self):
        if self._tier_results:
            df = pd.concat(self._tier_results, ignore_index=True)
            df.to_csv(self.dirs["metrics"] / "tier_verification.csv", index=False)
            print(f"  Saved tier verification")

    def log_calibration(self, strategy: str, fold: str, ece_before: float, ece_after: float, reliability_data: dict):
        self._calibration_results.append(dict(strategy=strategy, fold=fold, ece_before=ece_before,
                                              ece_after=ece_after, ece_improvement=ece_before - ece_after))
        rel_df = pd.DataFrame(reliability_data)
        rel_df.insert(0, "strategy", strategy)
        rel_df.insert(1, "fold", fold)
        rel_df.to_csv(self.dirs["calibration"] / f"reliability_{strategy}_{fold}.csv", index=False)

    def save_calibration(self):
        if self._calibration_results:
            df = pd.DataFrame(self._calibration_results)
            df.to_csv(self.dirs["calibration"] / "calibration_summary.csv", index=False)
            print(f"  Saved calibration results")

    def log_leakage_audit(self, audit_data: dict):
        self._leakage_results.append(audit_data)

    def save_leakage_audit(self):
        if self._leakage_results:
            df = pd.DataFrame(self._leakage_results)
            df.to_csv(self.dirs["leakage_audit"] / "leakage_audit.csv", index=False)
            print(f"  Saved leakage audit")

    def log_statistical(self, test_name: str, strategy: str, result: dict):
        self._statistical_results.append(dict(test_name=test_name, strategy=strategy, **result))

    def save_statistical(self):
        if self._statistical_results:
            df = pd.DataFrame(self._statistical_results)
            df.to_csv(self.dirs["statistical_validation"] / "statistical_tests.csv", index=False)
            print(f"  Saved statistical validation")

    def log_raw_predictions(self, strategy: str, fold: str, preds: dict):
        df = pd.DataFrame(preds)
        df.insert(0, "strategy", strategy)
        df.insert(1, "fold", fold)
        self._raw_predictions.append(df)

    def save_raw_predictions(self):
        if self._raw_predictions:
            df = pd.concat(self._raw_predictions, ignore_index=True)
            df.to_csv(self.dirs["raw_predictions"] / "all_predictions.csv", index=False)
            print(f"  Saved {len(df)} raw predictions")

    def save_cross_strategy(self, df_comparison: pd.DataFrame):
        path = self.dirs["cross_strategy"] / "cross_strategy_comparison.csv"
        df_comparison.to_csv(path, index=False)
        latex_path = self.dirs["cross_strategy"] / "cross_strategy_comparison.tex"
        with open(latex_path, "w") as f:
            f.write(df_comparison.to_latex(index=False, escape=False))
        print(f"  Saved cross-strategy comparison")

    def save_deployment_gate(self, gate_data: dict):
        with open(self.dirs["deployment_gate"] / "gate_evaluation.json", "w") as f:
            json.dump(gate_data, f, indent=2)
        pd.DataFrame([gate_data]).to_csv(self.dirs["deployment_gate"] / "gate_evaluation.csv", index=False)
        print(f"  Saved deployment gate evaluation")

    def save_all(self):
        print(f"\n{'='*60}\nSAVING ALL EXPERIMENT ARTIFACTS -> {self.run_dir}\n{'='*60}")
        self.save_epoch_logs()
        self.save_fold_results()
        self.save_per_class()
        self.save_tier_verification()
        self.save_calibration()
        self.save_leakage_audit()
        self.save_statistical()
        self.save_raw_predictions()
        print(f"\n  Total files saved: {sum(1 for _ in self.run_dir.rglob('*') if _.is_file())}")
        print(f"  Total size: {sum(f.stat().st_size for f in self.run_dir.rglob('*') if f.is_file()) / 1024 / 1024:.2f} MB")

# ============================================================================
# STATISTICAL VALIDATOR & LEAKAGE AUDITOR
# ============================================================================
class StatisticalValidator:
    @staticmethod
    def bootstrap_ci(y_true, y_pred, metric_fn, n_bootstrap=2000, ci=0.95, random_state=42):
        rng = np.random.RandomState(random_state)
        n = len(y_true)
        scores = []
        for _ in range(n_bootstrap):
            idx = rng.randint(0, n, size=n)
            try:
                score = metric_fn(np.array(y_true)[idx], np.array(y_pred)[idx])
                if not np.isnan(score): scores.append(score)
            except Exception: continue
        if len(scores) < 10: return dict(mean=np.nan, ci_lower=np.nan, ci_upper=np.nan, n_valid=0)
        scores = np.array(scores)
        alpha = (1 - ci) / 2
        return dict(mean=float(np.mean(scores)), ci_lower=float(np.percentile(scores, alpha * 100)),
                    ci_upper=float(np.percentile(scores, (1 - alpha) * 100)), n_valid=len(scores), std=float(np.std(scores)))

    @staticmethod
    def cohens_d(group1, group2):
        n1, n2 = len(group1), len(group2)
        var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)
        pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
        if pooled_std == 0: return 0.0
        return float((np.mean(group1) - np.mean(group2)) / pooled_std)

class VerificationMetrics:
    @staticmethod
    def contingency(obs_binary, pred_binary):
        obs_binary, pred_binary = np.asarray(obs_binary).astype(bool), np.asarray(pred_binary).astype(bool)
        H = int(np.sum(pred_binary & obs_binary))
        M = int(np.sum(~pred_binary & obs_binary))
        FA = int(np.sum(pred_binary & ~obs_binary))
        CN = int(np.sum(~pred_binary & ~obs_binary))
        return dict(H=H, M=M, FA=FA, CN=CN)

    @classmethod
    def scores(cls, obs_binary, pred_binary):
        c = cls.contingency(obs_binary, pred_binary)
        H, M, FA = c["H"], c["M"], c["FA"]
        pod = H / (H + M) if (H + M) else np.nan
        far = FA / (H + FA) if (H + FA) else np.nan
        csi = H / (H + M + FA) if (H + M + FA) else np.nan
        return dict(POD=pod, FAR=far, CSI=csi, **c)

    @staticmethod
    def ece(prob, obs_binary, n_bins=10):
        prob, obs_binary = np.asarray(prob, float), np.asarray(obs_binary, float)
        order = np.argsort(prob)
        prob, obs = prob[order], obs_binary[order]
        bins = np.array_split(np.arange(len(prob)), n_bins)
        n = len(prob)
        return float(sum(len(b) / n * abs(obs[b].mean() - prob[b].mean()) for b in bins if len(b)))

# ============================================================================
# SPLIT GENERATORS
# ============================================================================
DATE_CANDIDATES = ["date", "event_date", "start_date", "event_start", "datetime"]
PLACE_CANDIDATES = ["division", "district", "upazila", "region"]

def _first_present(df, candidates):
    for c in candidates:
        if c in df.columns: return c
    return None

def ensure_date_column(df, date_col=None):
    col = date_col or _first_present(df, DATE_CANDIDATES)
    if col and col in df.columns:
        df[col] = pd.to_datetime(df[col], errors="coerce")
        if df[col].notna().any(): return df, col
    def parse_from_id(eid):
        m = re.search(r"(19|20)\d{2}", str(eid))
        return pd.Timestamp(year=int(m.group(0)), month=7, day=1) if m else None
    if "event_id" in df.columns:
        df["_date"] = df["event_id"].map(parse_from_id)
        if df["_date"].notna().any(): return df, "_date"
    raise ValueError(f"No usable date column; need one of {DATE_CANDIDATES}")

def ensure_place_column(df, place_col=None):
    col = place_col or _first_present(df, PLACE_CANDIDATES)
    if col: return df, col
    if "lat" in df.columns and "lon" in df.columns:
        df["_place_cell"] = (df["lat"].round(0).astype(int).astype(str) + "_" + df["lon"].round(0).astype(int).astype(str))
        return df, "_place_cell"
    raise ValueError(f"No place column; need one of {PLACE_CANDIDATES} or lat/lon")

def add_season_column(df, date_col, out_col="season"):
    month = df[date_col].dt.month
    df[out_col] = np.select([month.between(3, 6), month.between(7, 10)], ["Kharif_I", "Kharif_II"], default="Rabi")
    return df

# ============================================================================
# CALIBRATION & MODEL ARCHITECTURE
# ============================================================================
class Calibrator:
    def __init__(self, n_classes=8):
        self.n_classes = n_classes
        self.iso = [IsotonicRegression(out_of_bounds="clip") for _ in range(n_classes)]

    def fit(self, logits, labels):
        probs = torch.softmax(torch.from_numpy(logits), dim=-1).numpy()
        for c in range(self.n_classes):
            mask = labels == c
            if mask.sum() >= 20: self.iso[c].fit(probs[mask, c], (labels[mask] == c).astype(float))
        return self

    def transform(self, logits):
        probs = torch.softmax(torch.from_numpy(logits), dim=-1).numpy()
        out = probs.copy()
        for c in range(self.n_classes):
            if getattr(self.iso[c], "X_thresholds_", None) is not None:
                out[:, c] = self.iso[c].predict(probs[:, c])
        return out / np.maximum(out.sum(axis=1, keepdims=True), 1e-9)

class DepthwiseSeparableConv3d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv3d(in_channels, in_channels, kernel_size, padding=padding, groups=in_channels, bias=False)
        self.pointwise = nn.Conv3d(in_channels, out_channels, kernel_size=1, bias=False)
        self.bn = nn.BatchNorm3d(out_channels)
    def forward(self, x): return self.bn(self.pointwise(self.depthwise(x)))

class SEBlock3D(nn.Module):
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(nn.AdaptiveAvgPool3d(1), nn.Flatten(),
                                nn.Linear(channels, channels // reduction, bias=False), nn.ReLU(inplace=True),
                                nn.Linear(channels // reduction, channels, bias=False), nn.Sigmoid())
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

class HomoscedasticMTLLoss(nn.Module):
    def __init__(self):
        super().__init__()
        self.log_vars = nn.Parameter(torch.zeros(2))
        self.ce_loss = nn.CrossEntropyLoss(reduction="none")
        self.huber_loss = nn.SmoothL1Loss(reduction="none")

    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        loss_cls = self.ce_loss(hazard_pred, hazard_true)
        loss_reg = self.huber_loss(severity_pred, severity_true)
        prec_cls = torch.exp(-self.log_vars[0])
        prec_reg = torch.exp(-self.log_vars[1])
        total = (prec_cls * (loss_cls * confidence).mean() + self.log_vars[0]) + \
                (prec_reg * (loss_reg * confidence).mean() + self.log_vars[1])
        return total, (loss_cls * confidence).mean().item(), (loss_reg * confidence).mean().item()

# ============================================================================
# DATASET & METRICS TRACKER
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
        self._normalizers = {h: SeverityNormalizer(h) for h in HAZARD_TYPES}

    def _open_h5(self):
        wid = get_worker_info().id if get_worker_info() else -1
        if self.h5f is None or self._worker_id != wid:
            if self.h5f: self.h5f.close()
            self.h5f = h5py.File(self.master_h5_path, "r", rdcc_nbytes=1024**2 * 10)
            self._worker_id = wid

    def __len__(self): return len(self.df)

    def _resize_spatial(self, tensor):
        c, t, h, w = tensor.shape
        th, tw = self.target_shape[2], self.target_shape[3]
        if h == th and w == tw: return tensor
        r = tensor.permute(1, 0, 2, 3).reshape(t * c, 1, h, w)
        r = F.interpolate(r, size=(th, tw), mode="nearest")
        return r.reshape(t, c, th, tw).permute(1, 0, 2, 3).contiguous()

    def _augment(self, tensor):
        if np.random.rand() > 0.5: tensor = tensor + np.random.uniform(-self.brightness, self.brightness)
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
                a = abs(s); b = tensor[:, -1:, :, :].repeat(1, a, 1, 1)
                tensor = torch.cat([tensor[:, a:, :, :], b], dim=1)
        return tensor

    def __getitem__(self, idx):
        self._open_h5()
        row = self.df.iloc[idx]
        eid = str(row["event_id"])
        tensor = torch.from_numpy(self.h5f["tensors"][eid][:]).float()
        label = int(row["hazard_idx"])
        hazard = HAZARD_TYPES[label]
        severity = float(row.get("severity_index", 0.0))
        src = row.get("severity_source_index", None)
        if src is not None and not pd.isna(src):
            severity = self._normalizers[hazard].to_severity(float(src))
        confidence = float(row.get("confidence", 0.5))
        tensor = self._resize_spatial(tensor)
        if self.augment: tensor = self._augment(tensor)
        return tensor, label, severity, confidence, eid

    def __del__(self):
        if self.h5f: self.h5f.close()

class EnhancedMetricsTracker:
    def __init__(self): self.reset()
    def reset(self):
        self.total_losses, self.cls_losses, self.reg_losses = [], [], []
        self.hazard_preds, self.hazard_targets = [], []
        self.severity_preds, self.severity_targets = [], []
        self.hazard_logits_all, self.confidences = [], []

    def update(self, total_loss, cls_loss, reg_loss, h_pred, h_true, s_pred, s_true, logits=None, confidence=None):
        self.total_losses.append(total_loss); self.cls_losses.append(cls_loss); self.reg_losses.append(reg_loss)
        self.hazard_preds.extend(h_pred); self.hazard_targets.extend(h_true)
        self.severity_preds.extend(s_pred); self.severity_targets.extend(s_true)
        if logits is not None: self.hazard_logits_all.append(logits)
        if confidence is not None: self.confidences.extend(confidence)

    def get_summary(self):
        h_acc = accuracy_score(self.hazard_targets, self.hazard_preds)
        h_f1w = f1_score(self.hazard_targets, self.hazard_preds, average="weighted", zero_division=0)
        h_f1m = f1_score(self.hazard_targets, self.hazard_preds, average="macro", zero_division=0)
        s_mse = mean_squared_error(self.severity_targets, self.severity_preds)
        return dict(loss_total=np.mean(self.total_losses), loss_cls=np.mean(self.cls_losses), loss_reg=np.mean(self.reg_losses),
                    hazard_accuracy=h_acc, hazard_f1=h_f1w, hazard_f1_macro=h_f1m,
                    severity_mse=s_mse, severity_rmse=np.sqrt(s_mse),
                    severity_mae=mean_absolute_error(self.severity_targets, self.severity_preds),
                    severity_r2=r2_score(self.severity_targets, self.severity_preds))

    def get_per_class_metrics(self):
        prec = precision_score(self.hazard_targets, self.hazard_preds, average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        rec = recall_score(self.hazard_targets, self.hazard_preds, average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        f1 = f1_score(self.hazard_targets, self.hazard_preds, average=None, labels=range(len(HAZARD_TYPES)), zero_division=0)
        support = np.bincount(self.hazard_targets, minlength=len(HAZARD_TYPES))
        rows = [{"Hazard": n, "Precision": prec[i], "Recall": rec[i], "F1-Score": f1[i], "Support": support[i]} for i, n in enumerate(HAZARD_TYPES)]
        for avg in ("macro", "weighted"):
            rows.append({"Hazard": f"{avg.capitalize()} Avg",
                         "Precision": precision_score(self.hazard_targets, self.hazard_preds, average=avg, zero_division=0),
                         "Recall": recall_score(self.hazard_targets, self.hazard_preds, average=avg, zero_division=0),
                         "F1-Score": f1_score(self.hazard_targets, self.hazard_preds, average=avg, zero_division=0),
                         "Support": int(sum(support))})
        return pd.DataFrame(rows)

    def get_tier_verification(self):
        rows = []
        preds, targets = np.array(self.hazard_preds), np.array(self.hazard_targets)
        sev_p, sev_t = np.array(self.severity_preds), np.array(self.severity_targets)
        for c, name in enumerate(HAZARD_TYPES):
            tiers = SEVERITY_THRESHOLDS[name]["tiers"]
            for level in ("watch", "warning", "severe"):
                thr = tiers[level]
                mask = (sev_t >= thr) | (sev_p >= thr)
                if mask.sum() < 5: continue
                sc = VerificationMetrics.scores((targets[mask] == c), (preds[mask] == c))
                rows.append({"Hazard": name, "Tier": level, "Threshold": thr, "N": int(mask.sum()), "POD": sc["POD"], "FAR": sc["FAR"], "CSI": sc["CSI"]})
        return pd.DataFrame(rows)

    def get_confusion_matrix_normalized(self):
        cm = confusion_matrix(self.hazard_targets, self.hazard_preds, labels=range(len(HAZARD_TYPES)))
        return np.nan_to_num(cm.astype(float) / cm.sum(axis=1, keepdims=True))

    def get_raw_predictions_dict(self):
        return dict(hazard_pred=self.hazard_preds, hazard_true=self.hazard_targets,
                    severity_pred=self.severity_preds, severity_true=self.severity_targets,
                    confidence=self.confidences if self.confidences else [0.5] * len(self.hazard_preds))

# ============================================================================
# Q1 PUBLICATION VISUALIZER
# ============================================================================
class PublicationVisualizer:
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _save(self, fig, name, formats=("png", "pdf")):
        for fmt in formats:
            path = self.output_dir / f"{name}.{fmt}"
            fig.savefig(path, dpi=300, bbox_inches="tight", facecolor="white")
        plt.close(fig)

    def plot_confusion_matrix(self, cm_norm, title, filename):
        fig, ax = plt.subplots(figsize=(7, 6))
        sns.heatmap(cm_norm, annot=True, fmt=".2f", cmap="Blues", xticklabels=HAZARD_TYPES, yticklabels=HAZARD_TYPES,
                    ax=ax, linewidths=0.5, linecolor="white", cbar_kws={"label": "Normalized Frequency", "shrink": 0.8}, annot_kws={"size": 7})
        ax.set_xlabel("Predicted Hazard", fontweight="bold"); ax.set_ylabel("True Hazard", fontweight="bold")
        ax.set_title(title, fontweight="bold", fontsize=11)
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", fontsize=7)
        plt.setp(ax.get_yticklabels(), rotation=0, fontsize=7)
        self._save(fig, filename)

    def plot_severity_scatter(self, targets, preds, r2, title, filename):
        fig, ax = plt.subplots(figsize=(5.5, 5.5))
        ax.scatter(targets, preds, alpha=0.25, s=8, c=JOURNAL_COLORS["secondary"], edgecolors="none", rasterized=True)
        ax.plot([0, 1], [0, 1], color=JOURNAL_COLORS["accent"], lw=1.2, linestyle="--", label="Perfect prediction")
        all_tiers = set()
        for h in HAZARD_TYPES:
            for v in SEVERITY_THRESHOLDS[h]["tiers"].values(): all_tiers.add(v)
        for thr in sorted(all_tiers):
            ax.axhline(thr, color=JOURNAL_COLORS["neutral"], lw=0.5, alpha=0.4, linestyle=":")
        ax.set_xlim(-0.02, 1.02); ax.set_ylim(-0.02, 1.02); ax.set_aspect("equal")
        ax.set_xlabel("Ground Truth Severity (physically anchored)", fontweight="bold")
        ax.set_ylabel("Predicted Severity", fontweight="bold")
        ax.set_title(f"{title}\n$R^2$ = {r2:.4f}", fontweight="bold")
        ax.legend(loc="upper left", framealpha=0.9)
        self._save(fig, filename)

    def plot_training_curves(self, epoch_data: pd.DataFrame, strategy: str, filename):
        fig, axes = plt.subplots(1, 3, figsize=(12, 3.5))
        train = epoch_data[epoch_data["phase"] == "train"]
        val = epoch_data[epoch_data["phase"] == "val"]
        axes[0].plot(train["epoch"], train["loss_total"], color=JOURNAL_COLORS["secondary"], lw=1.5, label="Train")
        axes[0].plot(val["epoch"], val["loss_total"], color=JOURNAL_COLORS["accent"], lw=1.5, label="Val")
        axes[0].set_title("Loss", fontweight="bold"); axes[0].legend()
        axes[1].plot(train["epoch"], train["accuracy"], color=JOURNAL_COLORS["secondary"], lw=1.5, label="Train")
        axes[1].plot(val["epoch"], val["accuracy"], color=JOURNAL_COLORS["accent"], lw=1.5, label="Val")
        axes[1].set_title("Accuracy", fontweight="bold"); axes[1].set_ylim(0, 1.05); axes[1].legend()
        axes[2].plot(train["epoch"], train["rmse"], color=JOURNAL_COLORS["secondary"], lw=1.5, label="Train")
        axes[2].plot(val["epoch"], val["rmse"], color=JOURNAL_COLORS["accent"], lw=1.5, label="Val")
        axes[2].set_title("Severity RMSE", fontweight="bold"); axes[2].legend()
        for ax in axes: ax.set_xlabel("Epoch")
        plt.suptitle(f"Training Dynamics: {strategy}", fontweight="bold", y=1.02)
        plt.tight_layout()
        self._save(fig, filename)

    def plot_cross_strategy_comparison(self, df_comparison: pd.DataFrame, filename):
        fig, axes = plt.subplots(2, 2, figsize=(10, 8))
        # FIXED: Mapped to exact DataFrame column names generated in main()
        metrics = [("Accuracy_mean", "Accuracy"), ("F1_macro_mean", "Macro F1"),
                   ("RMSE_mean", "Severity RMSE"), ("R2_mean", "Severity $R^2$")]

        for ax, (metric, label) in zip(axes.flat, metrics):
            if metric not in df_comparison.columns:
                ax.set_visible(False); continue
            data, labels, colors = [], [], []
            for _, row in df_comparison.iterrows():
                strat = row["Strategy"]
                val = row.get(metric, 0)
                data.append(val)
                labels.append(strat.replace(" (", "\n("))
                colors.append(STRATEGY_COLORS.get(strat.split(" ")[0], JOURNAL_COLORS["neutral"]))

            x = np.arange(len(data))
            bars = ax.bar(x, data, color=colors, alpha=0.85, edgecolor="white", linewidth=0.5, width=0.6)
            if metric in ["Accuracy_mean", "F1_macro_mean"]: ax.set_ylim(0, 1.05)
            ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=6, rotation=0, ha="center")
            ax.set_ylabel(label, fontweight="bold"); ax.set_title(label, fontweight="bold")
            ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
            for bar, val in zip(bars, data):
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"{val:.3f}", ha="center", va="bottom", fontsize=7)

        plt.suptitle("Cross-Strategy Performance Comparison", fontweight="bold", fontsize=12, y=0.98)
        plt.tight_layout()
        self._save(fig, filename)

    def plot_reliability_diagram(self, reliability_data: dict, strategy: str, filename):
        fig, ax = plt.subplots(figsize=(5, 5))
        ax.plot([0, 1], [0, 1], "k--", lw=1, label="Perfect calibration")
        ax.plot(reliability_data["mean_predicted"], reliability_data["fraction_positive"],
                "o-", color=JOURNAL_COLORS["secondary"], lw=2, markersize=6, label=f"ECE = {reliability_data.get('ece', 0):.4f}")
        ax.fill_between(reliability_data["mean_predicted"], reliability_data["mean_predicted"],
                        reliability_data["fraction_positive"], alpha=0.15, color=JOURNAL_COLORS["secondary"])
        ax.set_xlabel("Mean Predicted Probability", fontweight="bold"); ax.set_ylabel("Fraction of Positives", fontweight="bold")
        ax.set_title(f"Reliability Diagram: {strategy}", fontweight="bold")
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect("equal"); ax.legend(loc="upper left")
        self._save(fig, filename)

    def plot_per_class_radar(self, df_per_class: pd.DataFrame, strategy: str, filename):
        categories = HAZARD_TYPES; N = len(categories); f1_scores = []
        for h in categories:
            row = df_per_class[df_per_class["Hazard"] == h]
            f1_scores.append(row["F1-Score"].values[0] if len(row) > 0 else 0)
        angles = [n / float(N) * 2 * np.pi for n in range(N)]
        angles += angles[:1]; f1_scores += f1_scores[:1]
        fig, ax = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))
        ax.plot(angles, f1_scores, "o-", linewidth=2, color=JOURNAL_COLORS["secondary"])
        ax.fill(angles, f1_scores, alpha=0.15, color=JOURNAL_COLORS["secondary"])
        ax.set_xticks(angles[:-1]); ax.set_xticklabels(categories, size=7); ax.set_ylim(0, 1)
        ax.set_title(f"Per-Class F1 Score: {strategy}", fontweight="bold", y=1.08)
        self._save(fig, filename)

    def plot_leakage_waterfall(self, audit_data: dict, filename):
        fig, ax = plt.subplots(figsize=(8, 4))
        strategies = ["Event K-Fold\n(Leaky)", "Spatial LODO", "Grouped K-Fold\n(Leakage-Safe)", "Rolling Origin\n(Operational)"]
        accuracies = [audit_data.get("event_kfold_acc", 0.9887), audit_data.get("spatial_lodo_acc", 0.9566),
                      audit_data.get("grouped_kfold_acc", 0.0), audit_data.get("rolling_origin_acc", 0.109)]
        colors = [JOURNAL_COLORS["accent"], JOURNAL_COLORS["quaternary"], JOURNAL_COLORS["tertiary"], JOURNAL_COLORS["quinary"]]
        bars = ax.bar(strategies, accuracies, color=colors, alpha=0.85, edgecolor="white", linewidth=0.5)
        ax.set_ylabel("Test Accuracy", fontweight="bold"); ax.set_title("Accuracy Degradation: Leakage -> Operational Reality", fontweight="bold")
        ax.set_ylim(0, 1.1); ax.axhline(0.5, color=JOURNAL_COLORS["neutral"], linestyle="--", lw=0.8, alpha=0.5)
        ax.text(3.5, 0.52, "Deployment Gate", fontsize=7, ha="right", color=JOURNAL_COLORS["neutral"])
        for bar, val in zip(bars, accuracies):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.02, f"{val:.3f}", ha="center", va="bottom", fontsize=8, fontweight="bold")
        ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
        plt.tight_layout()
        self._save(fig, filename)

# ============================================================================
# TRAINING & CONFIG
# ============================================================================
class TrainConfig:
    EXPERIMENTAL_DIR = "/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets"
    MASTER_H5_PATH = os.path.join(EXPERIMENTAL_DIR, "master_tensors.h5")
    CONFIG_PATH = os.path.join(EXPERIMENTAL_DIR, "dataset_config.json")
    OUTPUT_DIR = "/kaggle/working/HazardNet_Model_Training_Results"
    BATCH_SIZE = 16
    NUM_EPOCHS = 50
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-4
    PATIENCE = 10
    GRAD_CLIP = 1.0
    NUM_WORKERS = 2
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def train_epoch(model, loader, optimizer, criterion, device):
    model.train(); metrics = EnhancedMetricsTracker()
    for tensors, cls_idx, severity, confidence, _ in tqdm(loader, desc="Train", unit="batch"):
        tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
        optimizer.zero_grad()
        h_pred, s_pred = model(tensors)
        total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=TrainConfig.GRAD_CLIP)
        optimizer.step()
        metrics.update(total.item(), cls_l, reg_l, h_pred.detach().argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                       s_pred.detach().cpu().numpy(), severity.cpu().numpy(), logits=h_pred.detach().cpu().numpy(), confidence=confidence.cpu().numpy())
    return metrics

def evaluate(model, loader, criterion, device, split_name="Val"):
    model.eval(); metrics = EnhancedMetricsTracker()
    with torch.no_grad():
        for tensors, cls_idx, severity, confidence, _ in tqdm(loader, desc=split_name, unit="batch"):
            tensors, cls_idx, severity, confidence = [t.to(device) for t in [tensors, cls_idx, severity, confidence]]
            h_pred, s_pred = model(tensors)
            total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
            metrics.update(total.item(), cls_l, reg_l, h_pred.argmax(1).cpu().numpy(), cls_idx.cpu().numpy(),
                           s_pred.cpu().numpy(), severity.cpu().numpy(), logits=h_pred.cpu().numpy(), confidence=confidence.cpu().numpy())
    return metrics

def train_single_fold(fold_name, train_csv, val_csv, test_csv, num_classes, output_dir, logger: ExperimentLogger, viz: PublicationVisualizer, strategy: str, init_from=None):
    print(f"\n{'='*60}\nFOLD: {fold_name}\n{'='*60}")
    train_loader = DataLoader(MasterHDF5Dataset(train_csv, TrainConfig.MASTER_H5_PATH, True), batch_size=TrainConfig.BATCH_SIZE, shuffle=True, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    val_loader = DataLoader(MasterHDF5Dataset(val_csv, TrainConfig.MASTER_H5_PATH, False), batch_size=TrainConfig.BATCH_SIZE, shuffle=False, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    test_loader = DataLoader(MasterHDF5Dataset(test_csv, TrainConfig.MASTER_H5_PATH, False), batch_size=TrainConfig.BATCH_SIZE, shuffle=False, num_workers=TrainConfig.NUM_WORKERS, pin_memory=True)
    print(f"  Train: {len(train_loader.dataset)}, Val: {len(val_loader.dataset)}, Test: {len(test_loader.dataset)}")

    model = HazardNetCNN(15, num_classes).to(TrainConfig.DEVICE)
    if init_from and os.path.exists(init_from):
        model.load_state_dict(torch.load(init_from, map_location=TrainConfig.DEVICE))
        print(f"  Fine-tuning from {init_from}")
    criterion = HomoscedasticMTLLoss().to(TrainConfig.DEVICE)
    optimizer = AdamW([{"params": model.parameters()}, {"params": criterion.log_vars}], lr=TrainConfig.LEARNING_RATE, weight_decay=TrainConfig.WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=TrainConfig.NUM_EPOCHS, eta_min=1e-6)

    best_val_loss, patience_counter, best_epoch = float("inf"), 0, 0
    safe_name = fold_name.replace("/", "_").replace(" ", "_")
    ckpt_path = os.path.join(output_dir, f"{safe_name}_best.pt")

    for epoch in range(TrainConfig.NUM_EPOCHS):
        train_m = train_epoch(model, train_loader, optimizer, criterion, TrainConfig.DEVICE)
        val_m = evaluate(model, val_loader, criterion, TrainConfig.DEVICE, "Val")
        scheduler.step()
        ts, vs = train_m.get_summary(), val_m.get_summary()
        lr_now = optimizer.param_groups[0]["lr"]
        logger.log_epoch(fold_name, strategy, epoch + 1, "train", ts["loss_total"], ts["loss_cls"], ts["loss_reg"], ts["hazard_accuracy"], ts["hazard_f1_macro"], ts["severity_rmse"], ts["severity_r2"], lr=lr_now)
        logger.log_epoch(fold_name, strategy, epoch + 1, "val", vs["loss_total"], vs["loss_cls"], vs["loss_reg"], vs["hazard_accuracy"], vs["hazard_f1_macro"], vs["severity_rmse"], vs["severity_r2"], lr=lr_now)

        if vs["loss_total"] < best_val_loss:
            best_val_loss, patience_counter, best_epoch = vs["loss_total"], 0, epoch + 1
            torch.save(model.state_dict(), ckpt_path)
        else:
            patience_counter += 1
            if patience_counter >= TrainConfig.PATIENCE:
                print(f"  Early stopping at epoch {epoch+1} (best: {best_epoch})"); break
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:2d}/{TrainConfig.NUM_EPOCHS} | Train: {ts['loss_total']:.4f} Acc:{ts['hazard_accuracy']:.3f} mF1:{ts['hazard_f1_macro']:.3f} | Val: {vs['loss_total']:.4f} Acc:{vs['hazard_accuracy']:.3f} mF1:{vs['hazard_f1_macro']:.3f}")

    model.load_state_dict(torch.load(ckpt_path))
    test_metrics = evaluate(model, test_loader, criterion, TrainConfig.DEVICE, "Test")
    s = test_metrics.get_summary()
    print(f"  TEST Acc={s['hazard_accuracy']:.4f} F1w={s['hazard_f1']:.4f} F1macro={s['hazard_f1_macro']:.4f} RMSE={s['severity_rmse']:.4f} R2={s['severity_r2']:.4f}")

    logger.log_fold_result(strategy, fold_name, dict(s, n_test=len(test_loader.dataset)))
    per_class = test_metrics.get_per_class_metrics()
    logger.log_per_class(strategy, fold_name, per_class)
    tier_df = test_metrics.get_tier_verification()
    logger.log_tier_verification(strategy, fold_name, tier_df)
    logger.log_raw_predictions(strategy, fold_name, test_metrics.get_raw_predictions_dict())

    stat_val = StatisticalValidator()
    acc_ci = stat_val.bootstrap_ci(test_metrics.hazard_targets, test_metrics.hazard_preds, lambda yt, yp: accuracy_score(yt, yp))
    logger.log_statistical("bootstrap_accuracy", strategy, dict(fold=fold_name, **acc_ci))
    f1_ci = stat_val.bootstrap_ci(test_metrics.hazard_targets, test_metrics.hazard_preds, lambda yt, yp: f1_score(yt, yp, average="macro", zero_division=0))
    logger.log_statistical("bootstrap_f1_macro", strategy, dict(fold=fold_name, **f1_ci))

    if test_metrics.hazard_logits_all:
        all_logits = np.concatenate(test_metrics.hazard_logits_all, axis=0)
        all_labels = np.array(test_metrics.hazard_targets)
        probs_raw = torch.softmax(torch.from_numpy(all_logits), dim=-1).numpy()
        pred_class = probs_raw.argmax(axis=1)
        ece_before = VerificationMetrics.ece(probs_raw.max(axis=1), (pred_class == all_labels).astype(float))
        cal = Calibrator(num_classes).fit(all_logits, all_labels)
        probs_cal = cal.transform(all_logits)
        pred_cal = probs_cal.argmax(axis=1)
        ece_after = VerificationMetrics.ece(probs_cal.max(axis=1), (pred_cal == all_labels).astype(float))
        n_bins = 10; bin_edges = np.linspace(0, 1, n_bins + 1); mean_pred, frac_pos = [], []
        for i in range(n_bins):
            mask = (probs_cal.max(axis=1) >= bin_edges[i]) & (probs_cal.max(axis=1) < bin_edges[i + 1])
            if mask.sum() > 0:
                mean_pred.append(probs_cal.max(axis=1)[mask].mean())
                frac_pos.append((pred_cal[mask] == all_labels[mask]).mean())
        reliability = dict(mean_predicted=mean_pred, fraction_positive=frac_pos, ece=ece_after)
        logger.log_calibration(strategy, fold_name, ece_before, ece_after, reliability)
        viz.plot_reliability_diagram(reliability, f"{strategy}_{fold_name}", f"reliability_{safe_name}")

    viz.plot_confusion_matrix(test_metrics.get_confusion_matrix_normalized(), f"Confusion Matrix: {fold_name}", f"cm_{safe_name}")
    viz.plot_severity_scatter(test_metrics.severity_targets, test_metrics.severity_preds, s["severity_r2"], f"Severity: {fold_name}", f"severity_{safe_name}")
    viz.plot_per_class_radar(per_class, f"{strategy}_{fold_name}", f"radar_{safe_name}")

    epoch_df = pd.DataFrame(logger._epoch_logs)
    if not epoch_df.empty:
        fold_epochs = epoch_df[(epoch_df["fold"] == fold_name) & (epoch_df["strategy"] == strategy)]
        if not fold_epochs.empty:
            viz.plot_training_curves(fold_epochs, f"{strategy}_{fold_name}", f"training_{safe_name}")

    return dict(fold=fold_name, strategy=strategy, **s, n_test=len(test_loader.dataset), ckpt=ckpt_path)

# ============================================================================
# STRATEGY RUNNERS & MAIN
# ============================================================================
def _run_dirs(base, num_classes, output_dir, prefix, logger, viz, strategy_key, chain=False):
    results, prev_ckpt = [], None
    if not os.path.isdir(base):
        print(f"  WARNING: {base} not found - skipping"); return []
    for fd in sorted(glob.glob(os.path.join(base, "*"))):
        if not os.path.isdir(fd): continue
        fn = os.path.basename(fd)
        r = train_single_fold(f"{prefix}{fn}", os.path.join(fd, "train_events.csv"), os.path.join(fd, "val_events.csv"), os.path.join(fd, "test_events.csv"),
                              num_classes, output_dir, logger, viz, strategy_key, init_from=prev_ckpt if chain else None)
        if chain: prev_ckpt = r["ckpt"]
        results.append(r)
    return results

STRATEGY_MAP_KEYS = ["event_kfold", "spatial_lodo", "temporal", "spatio_temporal", "grouped_kfold", "rolling_origin"]

# Option D: Complete comparison
STRATEGY = "all" 


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy", default=STRATEGY,
                        choices=STRATEGY_MAP_KEYS + ["all"],
                        help="Single strategy name")
    parser.add_argument("--strategies", default=None,
                        help="Comma-separated list, e.g. grouped_kfold,rolling_origin")
    
    in_notebook = 'ipykernel' in sys.modules or 'IPython' in sys.modules
    if in_notebook:
        args = parser.parse_args(args=[])
    else:
        args = parser.parse_args()

    # Resolve which strategies to run
    if args.strategies:
        selected = [s.strip() for s in args.strategies.split(",")]
    elif isinstance(STRATEGY, list):
        selected = STRATEGY
    elif STRATEGY == "all":
        selected = STRATEGY_MAP_KEYS
    else:
        selected = [STRATEGY]

    # Validate selections
    invalid = [s for s in selected if s not in STRATEGY_MAP_KEYS]
    if invalid:
        print(f"ERROR: Unknown strategies: {invalid}")
        print(f"Valid options: {STRATEGY_MAP_KEYS + ['all']}")
        return

    print("=" * 80)
    print("HAZARDNET TRAINING PIPELINE")
    print(f"Running strategies: {selected}")
    print("=" * 80)

    logger = ExperimentLogger(TrainConfig.OUTPUT_DIR)
    viz = PublicationVisualizer(logger.dirs["figures"])

    with open(TrainConfig.CONFIG_PATH) as f:
        config = json.load(f)
    num_classes = config["n_classes"]
    print(f"Classes ({num_classes}): {config['hazard_types']}")
    print(f"Master HDF5: {TrainConfig.MASTER_H5_PATH}")
    print(f"Device: {TrainConfig.DEVICE}")

    strategy_defs = {
        "event_kfold": ("Event-Based 5-Fold CV", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "event_kfold"), n, o, "event_kfold_", logger, viz, "event_kfold")),
        "spatial_lodo": ("Spatial LODO", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "spatial_lodo"), n, o, "", logger, viz, "spatial_lodo")),
        "temporal": ("Temporal Split", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "temporal_split"), n, o, "temporal_", logger, viz, "temporal")),
        "spatio_temporal": ("Spatio-Temporal", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "spatio_temporal"), n, o, "", logger, viz, "spatio_temporal")),
        "grouped_kfold": ("Grouped K-Fold [LEAKAGE-SAFE]", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "grouped_kfold"), n, o, "grouped_", logger, viz, "grouped_kfold")),
        "rolling_origin": ("Rolling-Origin [DEPLOYMENT GATE]", lambda n, o: _run_dirs(os.path.join(TrainConfig.EXPERIMENTAL_DIR, "rolling_origin"), n, o, "rolling_", logger, viz, "rolling_origin", chain=True)),
    }

    # Build execution list in canonical order
    strategies = [(k, strategy_defs[k]) for k in STRATEGY_MAP_KEYS if k in selected]
    all_results = {}

    for key, (name, fn) in strategies:
        print(f"\n{'='*80}\nSTRATEGY: {name}\n{'='*80}")
        out = os.path.join(TrainConfig.OUTPUT_DIR, key)
        os.makedirs(out, exist_ok=True)
        results = fn(num_classes, out)
        all_results[key] = results
        if results:
            for metric in ("hazard_accuracy", "hazard_f1", "hazard_f1_macro",
                           "severity_rmse", "severity_r2"):
                vals = [r.get(metric, r.get("accuracy", 0)) for r in results]
                print(f"  {metric}: {np.mean(vals):.4f} +/- {np.std(vals):.4f}")

    # Cross-strategy comparison table
    print(f"\n{'='*80}\nCROSS-STRATEGY COMPARISON\n{'='*80}")
    comparison_rows = []
    for key, (name, _) in strategies:
        results = all_results.get(key, [])
        if results:
            accs = [r.get("hazard_accuracy", r.get("accuracy", 0)) for r in results]
            f1s = [r.get("hazard_f1_macro", r.get("f1_macro", 0)) for r in results]
            rmses = [r.get("severity_rmse", r.get("rmse", 0)) for r in results]
            r2s = [r.get("severity_r2", r.get("r2", 0)) for r in results]
            comparison_rows.append({
                "Strategy": name,
                "N_Folds": len(results),
                "Accuracy_mean": np.mean(accs), "Accuracy_std": np.std(accs),
                "F1_macro_mean": np.mean(f1s), "F1_macro_std": np.std(f1s),
                "RMSE_mean": np.mean(rmses), "RMSE_std": np.std(rmses),
                "R2_mean": np.mean(r2s), "R2_std": np.std(r2s),
                "Total_Test_Events": sum(r.get("n_test", 0) for r in results),
            })

    if comparison_rows:
        df_comp = pd.DataFrame(comparison_rows)
        print(df_comp.to_string(index=False))
        logger.save_cross_strategy(df_comp)
        viz.plot_cross_strategy_comparison(df_comp, "cross_strategy_comparison")

    # Statistical comparison (if both leaky and safe baselines were run)
    if "grouped_kfold" in all_results and "event_kfold" in all_results:
        gk = all_results["grouped_kfold"]
        ek = all_results["event_kfold"]
        if gk and ek:
            gk_accs = [r.get("hazard_accuracy", 0) for r in gk]
            ek_accs = [r.get("hazard_accuracy", 0) for r in ek]
            cohens_d = StatisticalValidator.cohens_d(ek_accs, gk_accs)
            print(f"\n  Cohen's d (event_kfold vs grouped_kfold): {cohens_d:.4f}")
            print(f"  Interpretation: {'large' if abs(cohens_d)>0.8 else 'medium' if abs(cohens_d)>0.5 else 'small'} effect")
            logger.log_statistical("cohens_d_leakage_vs_safe", "comparison", dict(effect_size=cohens_d))

    # Deployment gate
    ro = all_results.get("rolling_origin", [])
    if ro:
        mF1 = np.mean([r.get("hazard_f1_macro", r.get("f1_macro", 0)) for r in ro])
        gate_pass = mF1 >= 0.5
        gate_data = dict(strategy="rolling_origin", macro_f1=float(mF1), threshold=0.5, gate_pass=bool(gate_pass),
                         recommendation="ADVISORY BETA DEPLOYMENT PERMITTED" if gate_pass else "NO-GO FOR PUBLIC ALERTING",
                         n_folds=len(ro), timestamp=datetime.now().isoformat())
        logger.save_deployment_gate(gate_data)
        print(f"\nDEPLOYMENT GATE (Rolling-Origin Macro-F1={mF1:.3f}, need >=0.5): "
              f"{' PASS - Advisory Beta' if gate_pass else 'NO-GO'}")

    # Leakage Audit Waterfall
    audit_data = {
        "event_kfold_acc": np.mean([r.get("hazard_accuracy", 0) for r in all_results.get("event_kfold", [])]) if all_results.get("event_kfold") else 0.0,
        "spatial_lodo_acc": np.mean([r.get("hazard_accuracy", 0) for r in all_results.get("spatial_lodo", [])]) if all_results.get("spatial_lodo") else 0.0,
        "grouped_kfold_acc": np.mean([r.get("hazard_accuracy", 0) for r in all_results.get("grouped_kfold", [])]) if all_results.get("grouped_kfold") else 0.0,
        "rolling_origin_acc": np.mean([r.get("hazard_accuracy", 0) for r in all_results.get("rolling_origin", [])]) if all_results.get("rolling_origin") else 0.0,
    }
    viz.plot_leakage_waterfall(audit_data, "leakage_degradation_waterfall")
    logger.log_leakage_audit(audit_data)

    # Save all artifacts
    logger.save_all()
    print(f"\n ALL EXPERIMENTS COMPLETE. Results saved to: {logger.run_dir}")

if __name__ == "__main__":
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

## HazardNet Event-Based Model

```python
import os
from kaggle_secrets import UserSecretsClient

# Set as environment variable directly
os.environ["WANDB_API_KEY"] = UserSecretsClient().get_secret("WANDB_API_KEY")

import wandb

"""
================================================================================
Phase 3: HazardNet Multi-Task 3D-CNN — Final Production Training Pipeline
================================================================================

ARCHITECTURAL HIGHLIGHTS:
  • Depthwise-Separable 3D Convolutions (Edge-AI efficient, ~3 MB FP32)
  • Squeeze-and-Excitation (SE) Attention (physically interpretable band selection)
  • Homoscedastic Multi-Task Loss (Kendall et al., 2018) with learnable task uncertainty
  • Huber Loss (SmoothL1) for bounded severity regression stability
  • Causality-Preserving Temporal Augmentation (no wrap-around artifacts)
  • Confidence-Weighted Gradients (hybrid TIF+API quality awareness)

DATA SOURCE:
  • HDF5 folds from Phase 2 Stratified Dataset Builder
  • 15 bands: SAR_VV, SAR_VH, Blue, Red, NIR, SWIR, Temp_2m, Precip,
              Max_Temp, Min_Temp, Soil_W1, Soil_W3, Soil_T1, Dewpoint, Solar_Rad
  • 8 hazard classes (Earthquake excluded)
  • Each sample: (tensor, class_idx, severity, confidence, event_id)

INPUT SHAPE:  (batch, 15, 10, 64, 64)  [channels, timesteps, height, width]
OUTPUT:       hazard_logits (batch, 8), severity_pred (batch,)

================================================================================
"""

import os
import sys
import json
import logging
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset, get_worker_info
from sklearn.metrics import (accuracy_score, f1_score, mean_squared_error,
                             mean_absolute_error, classification_report)
from tqdm import tqdm
import h5py
from pathlib import Path

# Optional: Weights & Biases for experiment tracking
try:
    import wandb
    WANDB_AVAILABLE = True
except ImportError:
    WANDB_AVAILABLE = False
    print("  wandb not installed. Run: pip install wandb")


# ============================================================================
# STEP 1: CONFIGURATION
# ============================================================================

class TrainConfig:
    """Centralized training configuration."""
    
    # Paths (must match Phase 2 output)
    DATASET_DIR = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets'
    CONFIG_PATH = '/kaggle/input/datasets/ashifahmedshuvo/hazardnet-datasets/tensors_output/HazardNet_Event_Based_Datasets/dataset_config.json'
    OUTPUT_DIR = '/kaggle/working/HazardNet_event_based_model_outputs'
    
    # Hyperparameters
    BATCH_SIZE = 16            # Moderate for 3D-CNN VRAM safety on Kaggle T4/P100
    NUM_EPOCHS = 50
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-4
    PATIENCE = 10              # Early stopping patience
    GRAD_CLIP = 1.0            # Gradient clipping max norm
    NUM_WORKERS = 2            # 0 for HDF5 safety; can increase with worker-aware loader
    
    # Device
    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

os.makedirs(TrainConfig.OUTPUT_DIR, exist_ok=True)


# ============================================================================
# STEP 2: HAZARDNET ARCHITECTURE
# ============================================================================

class DepthwiseSeparableConv3d(nn.Module):
    """
    3D Depthwise-Separable Convolution.
    Reduces parameter count by ~85% vs standard Conv3d while preserving
    representational capacity. Critical for Edge-AI deployment.
    """
    
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        # Depthwise: separate convolution per channel
        self.depthwise = nn.Conv3d(
            in_channels, in_channels, kernel_size,
            padding=padding, groups=in_channels, bias=False
        )
        # Pointwise: 1×1×1 convolution to mix channels
        self.pointwise = nn.Conv3d(
            in_channels, out_channels, kernel_size=1, bias=False
        )
        self.bn = nn.BatchNorm3d(out_channels)
    
    def forward(self, x):
        x = self.depthwise(x)
        x = self.pointwise(x)
        x = self.bn(x)
        return x


class SEBlock3D(nn.Module):
    """
    Squeeze-and-Excitation 3D Block.
    Dynamically recalibrates channel importance per sample.
    During floods → amplifies SAR bands; during droughts → amplifies NIR/SWIR/Soil.
    Provides built-in physical interpretability.
    """
    
    def __init__(self, channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool3d(1),
            nn.Flatten(),
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1).unsqueeze(-1)
        return x * w


class HazardNetCNN(nn.Module):
    """
    HazardNet Multi-Task 3D CNN.
    
    Architecture:
      • Depthwise-Separable 3D Convolutions (parameter efficient)
      • Squeeze-and-Excitation Attention (physically interpretable)
      • Temporal preservation in early layers (hazard evolution matters)
      • Shared backbone with dual task heads
    
    Input:  (batch, 15, 10, 64, 64)
    Output: hazard_logits (batch, 8), severity_pred (batch,)
    """
    
    def __init__(self, in_channels=15, num_hazards=8):
        super().__init__()
        
        self.num_hazards = num_hazards
        
        # ── Encoder ──────────────────────────────────────────────
        # Block 1: (B, 15, 10, 64, 64) → (B, 32, 10, 32, 32)
        # Pool spatial only — preserve temporal resolution for hazard onset
        self.block1 = nn.Sequential(
            DepthwiseSeparableConv3d(in_channels, 32),
            nn.ReLU(inplace=True),
            SEBlock3D(32),
            nn.MaxPool3d(kernel_size=(1, 2, 2)),
        )
        
        # Block 2: (B, 32, 10, 32, 32) → (B, 64, 5, 16, 16)
        # Now pool temporally — early temporal patterns captured
        self.block2 = nn.Sequential(
            DepthwiseSeparableConv3d(32, 64),
            nn.ReLU(inplace=True),
            SEBlock3D(64),
            nn.MaxPool3d(kernel_size=(2, 2, 2)),
        )
        
        # Block 3: (B, 64, 5, 16, 16) → (B, 128, 5, 8, 8)
        self.block3 = nn.Sequential(
            DepthwiseSeparableConv3d(64, 128),
            nn.ReLU(inplace=True),
            SEBlock3D(128),
            nn.MaxPool3d(kernel_size=(1, 2, 2)),
        )
        
        # Block 4: (B, 128, 5, 8, 8) → (B, 256, 5, 4, 4)
        self.block4 = nn.Sequential(
            DepthwiseSeparableConv3d(128, 256),
            nn.ReLU(inplace=True),
            SEBlock3D(256),
            nn.MaxPool3d(kernel_size=(1, 2, 2)),
        )
        
        # Global Average Pooling: (B, 256, 5, 4, 4) → (B, 256)
        self.global_pool = nn.AdaptiveAvgPool3d(1)
        
        # ── Shared Representation ────────────────────────────────
        self.shared_fc = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
        )
        
        # ── Multi-Task Heads ─────────────────────────────────────
        
        # Head 1: Hazard Classification (8 meteorological classes)
        self.hazard_head = nn.Linear(128, num_hazards)
        
        # Head 2: Severity Regression (continuous 0.0-1.0)
        self.severity_head = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, 1),
            nn.Sigmoid(),  # Bounded to [0, 1]
        )
    
    def forward(self, x):
        """
        Args:
            x (Tensor): Shape (batch, 15, 10, 64, 64)
        Returns:
            hazard_logits (Tensor): (batch, 8)
            severity_pred (Tensor): (batch,)
        """
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        
        x = self.global_pool(x)
        x = x.view(x.size(0), -1)
        
        x = self.shared_fc(x)
        
        hazard_logits = self.hazard_head(x)           # (batch, 8)
        severity_pred = self.severity_head(x).squeeze(1)  # (batch,)
        
        return hazard_logits, severity_pred
    
    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ============================================================================
# STEP 3: HOMOSCEDASTIC MULTI-TASK LOSS (Kendall et al., 2018)
# ============================================================================

class HomoscedasticMTLLoss(nn.Module):
    """
    Multi-Task Loss using Homoscedastic Uncertainty.
    
    Combines:
      1. Learnable task uncertainty (log_vars) to auto-balance CE vs Huber.
      2. Data confidence weighting to down-weight API-corrected proxy labels.
      3. Huber Loss (SmoothL1) for bounded severity regression stability.
    
    Formula: Loss = (precision_cls * L_cls + log_var_cls) + (precision_reg * L_reg + log_var_reg)
    Where precision = exp(-log_var)
    """
    
    def __init__(self):
        super().__init__()
        # Learnable log-variance parameters (initialized to 0 -> weight = 1.0)
        self.log_vars = nn.Parameter(torch.zeros(2))
        
        self.ce_loss = nn.CrossEntropyLoss(reduction='none')
        self.huber_loss = nn.SmoothL1Loss(reduction='none')  # Huber instead of MSE
    
    def forward(self, hazard_pred, severity_pred, hazard_true, severity_true, confidence):
        # 1. Calculate per-sample task losses
        loss_cls = self.ce_loss(hazard_pred, hazard_true)
        loss_reg = self.huber_loss(severity_pred, severity_true)
        
        # 2. Weight by Data Confidence (TIF=1.0, API=0.75-0.85)
        loss_cls_conf = (loss_cls * confidence).mean()
        loss_reg_conf = (loss_reg * confidence).mean()
        
        # 3. Weight by Learnable Task Uncertainty
        # precision = 1 / sigma^2 = exp(-log_var)
        precision_cls = torch.exp(-self.log_vars[0])
        precision_reg = torch.exp(-self.log_vars[1])
        
        # Total Loss = (precision * task_loss) + log_var
        total_loss = (precision_cls * loss_cls_conf + self.log_vars[0]) + \
                     (precision_reg * loss_reg_conf + self.log_vars[1])
        
        return total_loss, loss_cls_conf.item(), loss_reg_conf.item()


# ============================================================================
# STEP 4: DATASET (Worker-Safe HDF5 with Causality-Preserving Augmentation)
# ============================================================================

class HazardNetHDF5Dataset(Dataset):
    """
    Memory-mapped HDF5 dataset with worker-safe file handles and
    causality-preserving temporal augmentation.
    
    Yields: (tensor, class_idx, severity, confidence, event_id)
    """
    
    def __init__(self, hdf5_path, augment=False):
        self.hdf5_path = hdf5_path
        self.augment = augment
        self._h5_file = None
        self._event_ids = None
        self._worker_id = None
        
        # Augmentation parameters (mathematically correct for z-scored data)
        self.brightness = 0.1   # Additive shift
        self.contrast = 0.1     # Multiplicative scaling
        self.temporal_shift = 1 # Causality-preserving
    
    def _open(self):
        """Worker-safe HDF5 file opening."""
        worker_info = get_worker_info()
        current_worker_id = worker_info.id if worker_info is not None else -1
        
        if self._h5_file is None or self._worker_id != current_worker_id:
            if self._h5_file is not None:
                self._h5_file.close()
            self._h5_file = h5py.File(self.hdf5_path, 'r', rdcc_nbytes=1024**2*10)
            self._event_ids = list(self._h5_file['labels'].keys())
            self._worker_id = current_worker_id
    
    def __len__(self):
        self._open()
        return len(self._event_ids)
    
    def _augment(self, tensor):
        """Causality-preserving, statistically correct augmentation."""
        # Brightness: Additive shift (correct for z-scored data where mean=0)
        if np.random.rand() > 0.5:
            shift = np.random.uniform(-self.brightness, self.brightness)
            tensor = tensor + shift
        
        # Contrast: Multiplicative scaling around per-channel/per-timestep mean
        if np.random.rand() > 0.5:
            factor = 1.0 + np.random.uniform(-self.contrast, self.contrast)
            mean = tensor.mean(dim=[-1, -2], keepdim=True)
            tensor = (tensor - mean) * factor + mean
        
        # Temporal shift: Causality-preserving with exact dimension maintenance
        if np.random.rand() > 0.5:
            shift = np.random.randint(-self.temporal_shift, self.temporal_shift + 1)
            if shift > 0:
                # Repeat the first frame 'shift' times to pad the beginning
                boundary = tensor[:, 0:1, :, :].repeat(1, shift, 1, 1)
                tensor = torch.cat([boundary, tensor[:, :-shift, :, :]], dim=1)
            elif shift < 0:
                # Repeat the last frame 'abs(shift)' times to pad the end
                abs_shift = abs(shift)
                boundary = tensor[:, -1:, :, :].repeat(1, abs_shift, 1, 1)
                tensor = torch.cat([tensor[:, abs_shift:, :, :], boundary], dim=1)
        
        return tensor
    
    def __getitem__(self, idx):
        self._open()
        event_id = self._event_ids[idx]
        
        tensor = torch.from_numpy(self._h5_file[f'tensors/{event_id}'][:]).float()
        cls_idx = int(self._h5_file[f'labels/{event_id}'][()])
        severity = float(self._h5_file[f'severity/{event_id}'][()])
        confidence = float(self._h5_file[f'confidence/{event_id}'][()])
        
        if self.augment:
            tensor = self._augment(tensor)
        
        return tensor, cls_idx, severity, confidence, event_id
    
    def __del__(self):
        if self._h5_file is not None:
            self._h5_file.close()


# ============================================================================
# STEP 5: METRICS TRACKER
# ============================================================================

class MetricsTracker:
    """Tracks training/validation/test metrics per epoch."""
    
    def __init__(self):
        self.reset()
    
    def reset(self):
        self.total_losses = []
        self.cls_losses = []
        self.reg_losses = []
        self.hazard_preds = []
        self.hazard_targets = []
        self.severity_preds = []
        self.severity_targets = []
    
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
        s_mae = mean_absolute_error(self.severity_targets, self.severity_preds)
        
        return {
            'loss_total': np.mean(self.total_losses),
            'loss_cls': np.mean(self.cls_losses),
            'loss_reg': np.mean(self.reg_losses),
            'hazard_accuracy': h_acc,
            'hazard_f1': h_f1,
            'severity_mse': s_mse,
            'severity_rmse': np.sqrt(s_mse),
            'severity_mae': s_mae,
        }


# ============================================================================
# STEP 6: TRAINING & EVALUATION
# ============================================================================

def train_epoch(model, loader, optimizer, criterion, device):
    """Train for one epoch with gradient clipping."""
    model.train()
    metrics = MetricsTracker()
    
    pbar = tqdm(loader, desc="Train", unit="batch")
    for tensors, cls_idx, severity, confidence, _ in pbar:
        tensors = tensors.to(device)
        cls_idx = cls_idx.to(device)
        severity = severity.to(device)
        confidence = confidence.to(device)
        
        optimizer.zero_grad()
        h_pred, s_pred = model(tensors)
        total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
        
        total.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=TrainConfig.GRAD_CLIP)
        optimizer.step()
        
        metrics.update(
            total.item(), cls_l, reg_l,
            h_pred.detach().argmax(dim=1).cpu().numpy(), cls_idx.cpu().numpy(),
            s_pred.detach().cpu().numpy(), severity.cpu().numpy()
        )
        pbar.set_postfix({'loss': f"{total.item():.4f}"})
    
    return metrics.get_summary()

def evaluate(model, loader, criterion, device, split_name="Val"):
    """Evaluate on validation/test set."""
    model.eval()
    metrics = MetricsTracker()
    
    with torch.no_grad():
        pbar = tqdm(loader, desc=split_name, unit="batch")
        for tensors, cls_idx, severity, confidence, _ in pbar:
            tensors = tensors.to(device)
            cls_idx = cls_idx.to(device)
            severity = severity.to(device)
            confidence = confidence.to(device)
            
            h_pred, s_pred = model(tensors)
            total, cls_l, reg_l = criterion(h_pred, s_pred, cls_idx, severity, confidence)
            
            metrics.update(
                total.item(), cls_l, reg_l,
                h_pred.argmax(dim=1).cpu().numpy(), cls_idx.cpu().numpy(),
                s_pred.cpu().numpy(), severity.cpu().numpy()
            )
            pbar.set_postfix({'loss': f"{total.item():.4f}"})
    
    return metrics.get_summary()


# ============================================================================
# STEP 7: MAIN TRAINING LOOP (5-Fold Cross-Validation)
# ============================================================================

def main():
    print("=" * 80)
    print("  HAZARDNET MULTI-TASK 3D-CNN — PHASE 3 TRAINING")
    print("=" * 80)
    
    # Load config from Phase 2
    with open(TrainConfig.CONFIG_PATH, 'r') as f:
        config = json.load(f)
    
    num_classes = config['n_classes']
    hazard_types = config['hazard_types']
    print(f" Classes ({num_classes}): {hazard_types}")
    print(f" Target Tensor Shape: {config['target_tensor_shape']}")
    
    # Initialize W&B
    WANDB_ENABLED = False
    if WANDB_AVAILABLE:
        try:
            wandb.init(
                project='hazardnet',
                name='HazardNet_MTL_3DCNN_Homoscedastic_5FoldCV',
                config={
                    'architecture': 'HazardNet-DSConv3d-SE',
                    'batch_size': TrainConfig.BATCH_SIZE,
                    'learning_rate': TrainConfig.LEARNING_RATE,
                    'num_epochs': TrainConfig.NUM_EPOCHS,
                    'optimizer': 'AdamW',
                    'scheduler': 'CosineAnnealingLR',
                    'loss': 'HomoscedasticMTL + Huber',
                    'num_classes': num_classes,
                    'device': str(TrainConfig.DEVICE),
                }
            )
            WANDB_ENABLED = True
            print(" W&B initialized")
        except Exception as e:
            print(f"  W&B init failed: {e}")
    
    # 5-Fold Cross-Validation
    all_fold_results = []
    
    for fold_idx in range(config['n_folds']):
        print(f"\n{'='*80}")
        print(f" FOLD {fold_idx}/{config['n_folds']-1}")
        print(f"{'='*80}")
        
        fold_dir = os.path.join(TrainConfig.DATASET_DIR, f'fold_{fold_idx}')
        
        train_loader = DataLoader(
            HazardNetHDF5Dataset(os.path.join(fold_dir, 'train.h5'), augment=True),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=True,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True
        )
        val_loader = DataLoader(
            HazardNetHDF5Dataset(os.path.join(fold_dir, 'val.h5'), augment=False),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True
        )
        test_loader = DataLoader(
            HazardNetHDF5Dataset(os.path.join(fold_dir, 'test.h5'), augment=False),
            batch_size=TrainConfig.BATCH_SIZE, shuffle=False,
            num_workers=TrainConfig.NUM_WORKERS, pin_memory=True
        )
        
        print(f"  Train: {len(train_loader.dataset)}, Val: {len(val_loader.dataset)}, Test: {len(test_loader.dataset)}")
        
        # Initialize model, loss, optimizer
        model = HazardNetCNN(in_channels=15, num_hazards=num_classes).to(TrainConfig.DEVICE)
        criterion = HomoscedasticMTLLoss().to(TrainConfig.DEVICE)
        
        #  CRITICAL: Include criterion.log_vars in optimizer for task uncertainty learning
        optimizer = AdamW([
            {'params': model.parameters()},
            {'params': criterion.log_vars}
        ], lr=TrainConfig.LEARNING_RATE, weight_decay=TrainConfig.WEIGHT_DECAY)
        
        scheduler = CosineAnnealingLR(optimizer, T_max=TrainConfig.NUM_EPOCHS, eta_min=1e-6)
        
        if fold_idx == 0:
            print(f"\n  Model Summary:")
            print(f"  Parameters: {model.count_parameters():,} (~{model.count_parameters()*4/1024**2:.2f} MB)")
            print(f"  Device: {TrainConfig.DEVICE}")
            print(f"  Loss: Homoscedastic MTL (learnable log_vars + Huber)")
            print(f"  Scheduler: CosineAnnealingLR (T_max={TrainConfig.NUM_EPOCHS})")
        
        # Training loop with early stopping
        best_val_loss = float('inf')
        patience_counter = 0
        best_epoch = 0
        
        for epoch in range(TrainConfig.NUM_EPOCHS):
            train_m = train_epoch(model, train_loader, optimizer, criterion, TrainConfig.DEVICE)
            val_m = evaluate(model, val_loader, criterion, TrainConfig.DEVICE, "Val")
            scheduler.step()
            
            # Extract current task uncertainty weights for logging
            log_var_cls = criterion.log_vars[0].item()
            log_var_reg = criterion.log_vars[1].item()
            weight_cls = np.exp(-log_var_cls)
            weight_reg = np.exp(-log_var_reg)
            
            print(f"  Epoch {epoch+1:2d}/{TrainConfig.NUM_EPOCHS} | "
                  f"Train Loss: {train_m['loss_total']:.4f} Acc: {train_m['hazard_accuracy']:.3f} | "
                  f"Val Loss: {val_m['loss_total']:.4f} Acc: {val_m['hazard_accuracy']:.3f} "
                  f"RMSE: {val_m['severity_rmse']:.4f} | "
                  f"Task Weights: [Cls:{weight_cls:.2f}, Reg:{weight_reg:.2f}]")
            
            if WANDB_ENABLED:
                wandb.log({
                    f'fold{fold_idx}/train_loss': train_m['loss_total'],
                    f'fold{fold_idx}/val_loss': val_m['loss_total'],
                    f'fold{fold_idx}/train_acc': train_m['hazard_accuracy'],
                    f'fold{fold_idx}/val_acc': val_m['hazard_accuracy'],
                    f'fold{fold_idx}/val_rmse': val_m['severity_rmse'],
                    f'fold{fold_idx}/lr': optimizer.param_groups[0]['lr'],
                    f'fold{fold_idx}/log_var_cls': log_var_cls,
                    f'fold{fold_idx}/log_var_reg': log_var_reg,
                    f'fold{fold_idx}/weight_cls': weight_cls,
                    f'fold{fold_idx}/weight_reg': weight_reg,
                }, step=epoch + fold_idx * TrainConfig.NUM_EPOCHS)
            
            # Early stopping
            if val_m['loss_total'] < best_val_loss:
                best_val_loss = val_m['loss_total']
                patience_counter = 0
                best_epoch = epoch + 1
                torch.save(model.state_dict(), os.path.join(TrainConfig.OUTPUT_DIR, f'best_fold{fold_idx}.pt'))
            else:
                patience_counter += 1
                if patience_counter >= TrainConfig.PATIENCE:
                    print(f"    Early stopping at epoch {epoch+1} (best: epoch {best_epoch})")
                    break
        
        # Test evaluation
        model.load_state_dict(torch.load(os.path.join(TrainConfig.OUTPUT_DIR, f'best_fold{fold_idx}.pt')))
        test_m = evaluate(model, test_loader, criterion, TrainConfig.DEVICE, "Test")
        
        print(f"\n  🏆 Fold {fold_idx} Test Results:")
        print(f"     Accuracy: {test_m['hazard_accuracy']:.4f}")
        print(f"     F1-Score: {test_m['hazard_f1']:.4f}")
        print(f"     Severity RMSE: {test_m['severity_rmse']:.4f}")
        print(f"     Severity MAE:  {test_m['severity_mae']:.4f}")
        
        all_fold_results.append(test_m)
    
    # Aggregate CV results
    print(f"\n{'='*80}")
    print(" 5-FOLD CROSS-VALIDATION SUMMARY")
    print(f"{'='*80}")
    
    avg_acc = np.mean([r['hazard_accuracy'] for r in all_fold_results])
    avg_f1 = np.mean([r['hazard_f1'] for r in all_fold_results])
    avg_rmse = np.mean([r['severity_rmse'] for r in all_fold_results])
    avg_mae = np.mean([r['severity_mae'] for r in all_fold_results])
    
    print(f"  Mean Accuracy:      {avg_acc:.4f} ± {np.std([r['hazard_accuracy'] for r in all_fold_results]):.4f}")
    print(f"  Mean F1-Score:      {avg_f1:.4f} ± {np.std([r['hazard_f1'] for r in all_fold_results]):.4f}")
    print(f"  Mean Severity RMSE: {avg_rmse:.4f} ± {np.std([r['severity_rmse'] for r in all_fold_results]):.4f}")
    print(f"  Mean Severity MAE:  {avg_mae:.4f} ± {np.std([r['severity_mae'] for r in all_fold_results]):.4f}")
    
    # Per-class classification report (using fold 0 test predictions as example)
    print("\n Per-Class Classification Report (Fold 0):")
    fold0_preds = []
    fold0_targets = []
    test_loader = DataLoader(
        HazardNetHDF5Dataset(os.path.join(TrainConfig.DATASET_DIR, 'fold_0', 'test.h5'), augment=False),
        batch_size=TrainConfig.BATCH_SIZE, shuffle=False, num_workers=0
    )
    model = HazardNetCNN(in_channels=15, num_hazards=num_classes).to(TrainConfig.DEVICE)
    model.load_state_dict(torch.load(os.path.join(TrainConfig.OUTPUT_DIR, 'best_fold0.pt')))
    model.eval()
    with torch.no_grad():
        for tensors, cls_idx, _, _, _ in test_loader:
            tensors = tensors.to(TrainConfig.DEVICE)
            h_pred, _ = model(tensors)
            fold0_preds.extend(h_pred.argmax(dim=1).cpu().numpy())
            fold0_targets.extend(cls_idx.numpy())
    
    print(classification_report(fold0_targets, fold0_preds, target_names=hazard_types, zero_division=0))
    
    # Save final metadata
    meta = {
        'classes': hazard_types,
        'input_shape': [15, 10, 64, 64],
        'parameters': model.count_parameters(),
        'cv_results': {
            'mean_accuracy': float(avg_acc),
            'mean_f1': float(avg_f1),
            'mean_rmse': float(avg_rmse),
            'mean_mae': float(avg_mae),
            'std_accuracy': float(np.std([r['hazard_accuracy'] for r in all_fold_results])),
            'std_f1': float(np.std([r['hazard_f1'] for r in all_fold_results])),
            'std_rmse': float(np.std([r['severity_rmse'] for r in all_fold_results])),
        },
        'per_fold_results': [
            {
                'accuracy': r['hazard_accuracy'],
                'f1': r['hazard_f1'],
                'rmse': r['severity_rmse'],
                'mae': r['severity_mae'],
            } for r in all_fold_results
        ]
    }
    with open(os.path.join(TrainConfig.OUTPUT_DIR, 'hazardnet_metadata.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    
    if WANDB_ENABLED:
        wandb.log({
            'cv/mean_accuracy': avg_acc,
            'cv/mean_f1': avg_f1,
            'cv/mean_rmse': avg_rmse,
            'cv/mean_mae': avg_mae,
        })
        wandb.finish()
    
    print(f"\n Phase 3 Complete!")
    print(f"   Outputs saved to: {TrainConfig.OUTPUT_DIR}")
    print(f"   Metadata: hazardnet_metadata.json")
    print(f"\n Ready for Phase 4: QAT Fine-Tuning & TFLite Edge Deployment")


if __name__ == "__main__":
    main()
```


## Phase 8

### HazardNet Auto Forecast Pipeline (10, 20, 30 days Horizons)

```python
!pip install earthengine-api requests tqdm pandas numpy tensorflow geopandas torch --quiet

from kaggle_secrets import UserSecretsClient
user_secrets = UserSecretsClient()
GITHUB_TOKEN = user_secrets.get_secret("GITHUB_TOKEN")
GOOGLE_API_KEY = user_secrets.get_secret("GOOGLE_API_KEY")
WANDB_API_KEY = user_secrets.get_secret("WANDB_API_KEY")


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

HORIZONS = {'7_days': 7, '15_days': 15}
HAZARD_CLASSES = ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 
                  'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone']

# ==============================================================================
# 3. LOAD BANGLADESH FAO GAUL ADMINISTRATIVE BOUNDARIES (Native GEE)
# ==============================================================================
def load_fao_gaul_boundaries():
    print("Loading FAO GAUL Administrative Boundaries for Bangladesh via GEE...")
    
    bd_filter = ee.Filter.eq('ADM0_NAME', 'Bangladesh')
    gaul_adm0 = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(bd_filter)
    gaul_adm1 = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(bd_filter)
    gaul_adm2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(bd_filter)
    
    print(f"   ADM0 (Country): {gaul_adm0.size().getInfo()} feature(s)")
    print(f"   ADM1 (Divisions): {gaul_adm1.size().getInfo()} features")
    print(f"   ADM2 (Districts): {gaul_adm2.size().getInfo()} features")
    
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
        
    divisions = set(d['division'] for d in districts)
    print(f"\nOK: Loaded {len(districts)} districts across {len(divisions)} divisions via FAO GAUL")
    
    return None, None, None, None, districts

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
    s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    if s2_col.size().getInfo() > 0:
        return harmonize_and_rename(s2_col.median(), 'S2').unmask(0)

    l8_col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))
    if l8_col.size().getInfo() > 0:
        return harmonize_and_rename(l8_col.median(), 'L8').resample('bicubic').unmask(0)

    l7_col = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2') \
        .filterBounds(region).filterDate(start, end) \
        .filter(ee.Filter.lt('CLOUD_COVER', 30))
    if l7_col.size().getInfo() > 0:
        return harmonize_and_rename(l7_col.median(), 'L57').resample('bicubic').unmask(0)

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
    
    bands = []
    for b in image.bandNames().getInfo():
        bands.append(data[b])
    
    img_np = np.stack(bands, axis=0)
    h, w = img_np.shape[1], img_np.shape[2]
    
    if h != target_size[0] or w != target_size[1]:
        tensor = torch.from_numpy(img_np).float().unsqueeze(0)
        tensor_resized = F.interpolate(tensor, size=target_size, mode='bilinear', align_corners=False)
        img_np = tensor_resized.squeeze(0).numpy()
        
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
        data = resp.json()
        daily = data.get('daily', {})
        
        def safe_array(key, default_val):
            arr = daily.get(key)
            if arr is None:
                arr = [default_val]
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
    today = datetime.now()
    region = ee.Geometry.Point([lon, lat]).buffer(320).bounds().getInfo()
    
    om_data = get_openmeteo_forecast(lat, lon, horizon_days)
    if not om_data: 
        print("Open-Meteo forecast failed.")
        return None, None
    
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
                print(f"GEE Download Error at T-{t}: {e}")
                return None, None
        else:
            print(f"GEE Stack Construction Failed at T-{t}")
            return None, None

    t0_start = (today - timedelta(days=10)).strftime('%Y-%m-%d')
    t0_end = today.strftime('%Y-%m-%d')
    
    t0_combined_img = get_temporal_15ch_stack(region, t0_start, t0_end)
    if t0_combined_img:
        try:
            t0_np = get_ee_image_as_numpy(t0_combined_img, region, scale=10)
            
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

    full_tensor = np.stack(historical_steps, axis=0)
    normalized = np.zeros_like(full_tensor, dtype=np.float32)
    
    for c, band in enumerate(BAND_NAMES):
        mean = norm_stats[band]['mean']
        std = max(norm_stats[band]['std'], 1e-6)
        normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std
        
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
            
            om_bands = [
                om_data['Temp_2m'], om_data['Precip'], om_data['Max_Temp'], om_data['Min_Temp'],
                0.3, 0.3, 290.0, om_data['Dewpoint'], om_data['Solar_Rad']
            ]
            t0_np[6:15, :, :] = np.array(om_bands).reshape(9, 1, 1)
            
            full_tensor = np.stack(historical_steps + [t0_np], axis=0)
            normalized = np.zeros_like(full_tensor, dtype=np.float32)
            
            for c, band in enumerate(BAND_NAMES):
                mean = norm_stats[band]['mean']
                std = max(norm_stats[band]['std'], 1e-6)
                normalized[:, c, :, :] = (full_tensor[:, c, :, :] - mean) / std
                
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
    
    historical_steps = fetch_historical_steps(dist['lat'], dist['lon'], NORM_STATS)
    
    if not historical_steps:
        print(f"Skipped {dist['name']} due to historical data failure.")
        continue
        
    for horizon_name, days in HORIZONS.items():
        target_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')
        
        tensor, om_data = build_t0_and_infer(dist, historical_steps, days, NORM_STATS)
        
        if tensor is not None and om_data is not None:
            hazard, conf, severity = run_inference(tensor)
            
            temp_max_c = om_data['Max_Temp'] - 273.15
            temp_min_c = om_data['Min_Temp'] - 273.15
            precip_mm = om_data['Precip'] * 1000.0
            
            physics_severity = 0.50
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
            
            # REFACTORED: Appended Open-Meteo forecast variables district-wise
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
                'data_source': 'Hybrid_Cognitive_Forecast',
                # Open-Meteo Forecast Variables (District-wise)
                'om_temp_2m_k': round(om_data['Temp_2m'], 4),
                'om_precip_m': round(om_data['Precip'], 4),
                'om_max_temp_k': round(om_data['Max_Temp'], 4),
                'om_min_temp_k': round(om_data['Min_Temp'], 4),
                'om_dewpoint_k': round(om_data['Dewpoint'], 4),
                'om_solar_rad_j': round(om_data['Solar_Rad'], 4),
                'om_wind_max_ms': round(om_data['Wind_Max'], 4),
                'om_et_sum_m': round(om_data['ET_Sum'], 4)
            })
        else:
            print(f"Failed to process {dist['name']} ({horizon_name})")
            
        time.sleep(0.2)

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