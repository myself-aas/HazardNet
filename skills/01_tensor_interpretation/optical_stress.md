# SKILL: Optical Multispectral Vegetation Stress Indices
## OBJECTIVE
Derive vegetation canopy health, soil moisture deficit, and flood debris signals from Blue, Red, NIR, and SWIR bands.

## SPECTRAL FORMULATIONS
- **NDVI = (NIR - Red) / (NIR + Red):** Healthy crop > 0.6; Water < 0.0; Bare Soil 0.1–0.2.
- **NDWI = (Green/NIR - SWIR) / (Green/NIR + SWIR):** Water body and canopy liquid water content. NDWI > 0.3 indicates waterlogging.
- **NDMI = (NIR - SWIR) / (NIR + SWIR):** Crop canopy moisture stress. NDMI < 0.1 indicates severe water stress.

## ANOMALY INTERPRETATION
- **Rapid NDVI Collapse (> 40% drop in 5 days):** Crop inundation, cyclone lodging, or severe pest infestation.
- **SWIR Rise with Stable Red:** Canopy dehydration during prolonged dry spells or high evaporative demand.
