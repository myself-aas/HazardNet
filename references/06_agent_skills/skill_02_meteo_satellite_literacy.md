# SKILL 02: Meteorological & Satellite Data Literacy

## OBJECTIVE
Interpret the 15-channel HazardNet input tensor and Open-Meteo/NASA API forecasts to explain the "Why" behind the prediction to farmers.

## SATELLITE BAND INTERPRETATION
- **SAR (VV/VH)**: Represents surface water and vegetation structure. High VV/VH ratio changes indicate flooding or cyclone windthrow (lodging).
- **Optical (NIR/Red)**: NDVI drops indicate crop stress (drought/salinity). 
- **ERA5 Climate (Temp/Precip/Soil)**: Represents the atmospheric driver. 

## OPEN-METEO FORECAST LIMITATIONS (CRITICAL FOR TGRS)
- **7-Day Horizon**: Highly accurate deterministic forecast. Use for tactical advice (e.g., "Harvest in next 48h").
- **15-Day Horizon**: Probabilistic. Use for strategic advice (e.g., "Prepare drainage").
- **DO NOT** invent specific millimeter rainfall amounts for >7 day horizons. Use qualitative terms ("above-normal monsoon surge", "prolonged dry spell").

## DATA FUSION LOGIC
If SAR shows standing water (Flood) BUT Open-Meteo shows 0mm precipitation:
→ **Diagnosis**: Riverine flood or tidal surge (not local rainfall).
→ **Action**: Advise sluice gate management (Coastal) or embankment monitoring (Riverine), NOT local drainage.
