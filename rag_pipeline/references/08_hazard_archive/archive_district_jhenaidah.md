# Jhenaidah district — recorded hazard history

45 recorded event-district observations for **Jhenaidah** district
(Khulna division) appear in the historical archive
(2000–2025).

## By hazard class

- **Flood**: 13 observations
- **Tropical Cyclone**: 11 observations
- **Severe Local Storm**: 8 observations
- **Cold Wave**: 5 observations
- **Flash Flood**: 5 observations
- **Drought**: 1 observation
- **Fire**: 1 observation
- **Heat Wave**: 1 observation

## Recent division-level episodes

- None recorded.

Use this for "how often has Jhenaidah flooded / been hit by a cyclone" questions, and state the
unit and year range in the answer.

## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
