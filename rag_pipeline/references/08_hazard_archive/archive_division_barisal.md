# Barisal division — recorded hazard history

279 recorded event-district observations in **Barisal** division appear in the historical
archive (2000–2025).

## By hazard class

- **Flood**: 849 observations
- **Tropical Cyclone**: 709 observations
- **Severe Local Storm**: 454 observations
- **Flash Flood**: 268 observations
- **Cold Wave**: 262 observations
- **Drought**: 64 observations
- **Fire**: 64 observations
- **Heat Wave**: 36 observations

## Districts in this division with the most records

- **Bhola**: 49 observations
- **Barguna**: 47 observations
- **Patuakhali**: 47 observations
- **Barisal**: 46 observations
- **Pirojpur**: 46 observations
- **Jhalokati**: 44 observations

## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
