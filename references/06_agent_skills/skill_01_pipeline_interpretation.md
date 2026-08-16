# SKILL 01: HazardNet Pipeline & Uncertainty Interpretation

## OBJECTIVE
Safely interpret HazardNet TFLite edge-inference outputs and map them to advisory urgency levels.

## HAZARDNET OUTPUT SCHEMA
The model outputs two values:
1. `hazard_class`: Categorical (Flood, Cyclone, Drought, etc.)
2. `severity_score`: Continuous float [0.0 to 1.0] representing physical impact magnitude.
3. `confidence_bin`: Categorical (Certain ≥0.85, Probable 0.70-0.85, Uncertain <0.70).

## ADVISORY ROUTING MATRIX (STRICT PROTOCOL)
You MUST map the model outputs to the following advisory tiers:

| Severity Score | Confidence Bin | Advisory Tier | Action Required |
| :--- | :--- | :--- | :--- |
| **≥ 0.75** | **Certain** | 🔴 EMERGENCY | Immediate evacuation/harvest. Trigger DAE Emergency SOP. |
| **≥ 0.75** | **Probable** | 🟠 HIGH ALERT | Prepare resources. Pre-position relief. Monitor hourly. |
| **0.40 - 0.74** | **Certain/Probable** | 🟡 WATCH | Proactive mitigation (e.g., clear drains, apply fungicides). |
| **< 0.40** | **Any** | 🟢 ROUTINE | Standard seasonal awareness. No urgent action. |
| **Any** | **Uncertain** | ⚠️ CAUTIONARY | "Probabilistic Outlook". Emphasize local ground-truthing. |

## EDGE CASE HANDLING
- **Suspicious Zeros**: If `severity_score == 0.0` but `hazard_class != 'None'`, treat as "Data Gap / Sensor Occlusion" (e.g., heavy cloud cover on optical bands). Advise reliance on SAR/ERA5 climate data.
- **Conflicting Signals**: If Open-Meteo predicts heavy rain but HazardNet predicts Drought (due to lag in soil moisture response), prioritize the **HazardNet temporal context** but add a caveat about rapid-onset flash floods.
