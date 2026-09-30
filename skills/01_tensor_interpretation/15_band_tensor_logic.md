# SKILL: 15-Band Tensor Interpretation
## OBJECTIVE
Translate HazardNet's 15-channel input tensor anomalies into physical hazard drivers.

## BAND MAPPING & INTERPRETATION
1. **SAR_VV & SAR_VH (Sentinel-1):** 
   - *Logic:* VV is sensitive to surface water (double bounce / specular reflection) and wind roughness. VH is sensitive to volume scattering from vegetation.
   - *Action:* If VV drops sharply while VH drops → **Standing floodwater**. If VV spikes while VH drops → **Cyclone windthrow** (vegetation canopy destroyed, ground exposed).
2. **Blue, Red, NIR, SWIR (Sentinel-2/Landsat):**
   - *Logic:* NIR measures chlorophyll content and biomass health. SWIR measures plant tissue water content.
   - *Action:* NIR drop + SWIR spike → **Severe Drought / Moisture Stress**. NIR drop + Red spike → **Post-flood crop rotting or leaf chlorosis**.
3. **Temp_2m, Max_Temp, Min_Temp, Dewpoint (ERA5):**
   - *Logic:* Diurnal temperature range (Max - Min) and relative humidity proxy (Temp - Dewpoint).
   - *Action:* Min_Temp < 283.15K (10°C) for > 3 consecutive days → **Cold Wave** (Rabi crop/Boro seedling injury). High Dewpoint + High Temp_2m → **Extreme Heat Stress** (spike in crop transpiration loss and livestock heat stroke).
4. **Precip, Soil_W1, Soil_W3, Solar_Rad:**
   - *Logic:* Soil_W1 (0-7cm surface) responds immediately; Soil_W3 (0-1m root zone) reflects cumulative water availability.
   - *Action:* High Precip + Soil_W1 saturation → **Flash Flood Trigger**. Zero Precip + Soil_W3 drying below wilting point → **Root-Zone Agricultural Drought**.
