# Tropical Cyclone — recorded history, Bangladesh

709 recorded event-district observations of **Tropical Cyclone** appear in the historical archive
(2000–2025), forming 12 episodes
of which 11 covered all 64 districts.

## Severity as recorded

| Statistic | Value |
| --- | --- |
| Observations with a severity value | 709 |
| Minimum | 0 |
| 25th percentile | 0.0477 |
| Median | 0.8318 |
| 75th percentile | 0.8318 |
| Maximum | 1 |

These are the archive's own reported `Severity_Index` values, reproduced as recorded.

## Where it is recorded

- **Barisal**: 709 observations

## Most recent recorded episodes

- 2024-05-26 — 64 districts (GLIDE TC-2024-000083-BGD)
- 2017-05-27 — 64 districts (GLIDE TC-2017-000058-BGD)
- 2015-07-29 — 64 districts (GLIDE TC-2015-000101-BGD)
- 2009-05-25 — 64 districts (GLIDE TC-2009-000105-BGD)
- 2009-04-17 — 5 districts (GLIDE TC-2009-000078-BGD)


## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
