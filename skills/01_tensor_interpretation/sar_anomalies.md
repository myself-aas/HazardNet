# SKILL: SAR Anomalies (Sentinel-1 VV/VH)
## OBJECTIVE
Interpret Synthetic Aperture Radar backscatter signals for all-weather, day-and-night flood inundation and windthrow detection.

## PHYSICAL MECHANISMS
- **Specular Reflection (Smooth Water):** Smooth open water reflects radar pulses away from the antenna, resulting in dark pixels (VV < -18 dB).
- **Double-Bounce Scattering (Flooded Vegetation):** Water beneath crop stalks causes double reflection between water surface and vertical stems, producing bright VV signatures (+2 to +5 dB anomaly).
- **Volume Scattering Loss (Lodging/Windthrow):** Flattened rice stalks lose structural canopy geometry, reducing VH backscatter (-4 to -8 dB drop).

## OPERATIONAL TRIAGE
- **Flood Inundation:** VV < -16 dB AND VH < -22 dB across > 15% of grid cells.
- **Submerged Boro Paddy:** VV double-bounce spike followed by VV dark surface drop as water level rises above canopy.
