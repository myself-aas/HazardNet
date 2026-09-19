# Bangladesh historical hazard archive — national overview

Recorded hazards for Bangladesh districts from 2000 to 2025, from the validated
historical event archive. This is a *record of what was reported*, and it is the citable source for
questions about how often hazards have affected a district or division.

## Headline counts

| Measure | Value |
| --- | --- |
| Recorded event-district observations | 2,931 |
| Distinct physical episodes | 251 |
| — national episodes (all 64 districts) | 41 |
| — partial episodes | 18 |
| Districts covered | 64 |
| Divisions covered | 7 |
| Hazard classes | 8 |
| Drift against the model card's claim of 2931 | 0 |

## By hazard class

- **Flood**: 890 observations
- **Tropical Cyclone**: 709 observations
- **Severe Local Storm**: 514 observations
- **Flash Flood**: 331 observations
- **Cold Wave**: 322 observations
- **Fire**: 65 observations
- **Drought**: 64 observations
- **Heat Wave**: 36 observations

## By division

- **Dhaka**: 769 observations
- **Chittagong**: 507 observations
- **Khulna**: 450 observations
- **Rangpur**: 373 observations
- **Rajshahi**: 366 observations
- **Barisal**: 279 observations
- **Sylhet**: 187 observations

## Temporal pattern

- Highest-count year in the archive: **2007** with 320 observations.
- Busiest months by observation count: May (720), July (459), June (407).
- The archive is dominated by monsoon-season flooding; the concentration partly reflects when
  third-party reporting is densest.

## How to use this

Cite the counts above for "how often has X happened" questions, and always state the unit
(observations, not events) and the year range. For a single district or division, prefer the
district and division documents below, which carry the per-class breakdown.

## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
