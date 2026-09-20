# Fire — recorded history, Bangladesh

65 recorded event-district observations of **Fire** appear in the historical archive
(2000–2025), forming 2 episodes
of which 1 covered all 64 districts.

## Severity as recorded

| Statistic | Value |
| --- | --- |
| Observations with a severity value | 65 |
| Minimum | 0 |
| 25th percentile | 0.0526 |
| Median | 0.1534 |
| 75th percentile | 0.402 |
| Maximum | 1 |

These are the archive's own reported `Severity_Index` values, reproduced as recorded.

## Where it is recorded

- **Barisal**: 64 observations
- **Chittagong**: 1 observation

## Most recent recorded episodes

- 2023-03-05 — 64 districts (GLIDE FR-2023-000031-BGD)
- 2021-03-22 — 1 district (GLIDE FR-2021-000027-BGD)


## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
