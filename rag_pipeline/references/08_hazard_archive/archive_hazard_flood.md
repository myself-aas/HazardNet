# Flood — recorded history, Bangladesh

890 recorded event-district observations of **Flood** appear in the historical archive
(2000–2025), forming 20 episodes
of which 13 covered all 64 districts.

## Severity as recorded

| Statistic | Value |
| --- | --- |
| Observations with a severity value | 890 |
| Minimum | 0 |
| 25th percentile | 0.9958 |
| Median | 0.9975 |
| 75th percentile | 0.9995 |
| Maximum | 1 |

These are the archive's own reported `Severity_Index` values, reproduced as recorded.

## Where it is recorded

- **Barisal**: 849 observations
- **Chittagong**: 31 observations
- **Dhaka**: 10 observations

## Most recent recorded episodes

- 2025-05-29 — 15 districts (GLIDE FL-2025-000076-BGD)
- 2021-07-27 — 64 districts (GLIDE FL-2021-000097-BGD)
- 2020-07-01 — 64 districts (GLIDE FL-2020-000161-BGD)
- 2019-11-01 — 2 districts (GLIDE TC-2019-000147-BGD)
- 2019-06-21 — 10 districts (GLIDE FL-2019-000079-BGD)


## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
