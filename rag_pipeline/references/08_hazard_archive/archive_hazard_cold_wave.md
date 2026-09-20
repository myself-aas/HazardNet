# Cold Wave — recorded history, Bangladesh

322 recorded event-district observations of **Cold Wave** appear in the historical archive
(2000–2025), forming 70 episodes
of which 4 covered all 64 districts.

## Severity as recorded

| Statistic | Value |
| --- | --- |
| Observations with a severity value | 322 |
| Minimum | 0 |
| 25th percentile | 0.0119 |
| Median | 0.5357 |
| 75th percentile | 0.6905 |
| Maximum | 1 |

These are the archive's own reported `Severity_Index` values, reproduced as recorded.

## Where it is recorded

- **Barisal**: 262 observations
- **Dhaka**: 17 observations
- **Chittagong**: 11 observations
- **Khulna**: 10 observations
- **Rajshahi**: 9 observations
- **Rangpur**: 9 observations
- **Sylhet**: 4 observations

## Most recent recorded episodes

- 2012-12-26 — 1 district (GLIDE CW-2013-000001-BGD)
- 2011-01-07 — 64 districts (GLIDE CW-2011-000004-BGD)
- 2010-01-04 — 64 districts (GLIDE CW-2010-000005-IND)
- 2007-01-03 — 64 districts (GLIDE CW-2007-000001-BGD)
- 2006-01-17 — 64 districts (GLIDE CW-2006-000005-IND)


## Limits of this document

- **Unit.** Counts are recorded *event-district observations*, not physical events. The archive holds 2,931 observations across 251 episodes, because a national event is recorded once per district.
- **Severity.** Any severity figure here is the archive's own reported `Severity_Index` (0–1). It is reproduced as recorded; it is not computed by HazardNet and must not be described as a HazardNet score.
- **Casualties.** No casualty or affected-population figure is available. The source archive carries none, so none is stated. Do not infer one.
- **Coverage.** The archive has no records at all for 2001. Reporting density changes over time, so a low-count year may reflect reporting rather than hazard.
- **Classification.** 846 of 2,739 rows (30.9%) carry a GLIDE prefix naming a different hazard class than the archive's own label. Neither is authoritative.
- **Divisions.** The archive resolves to 7 divisions, not 8: Mymensingh division (created 2015) is carried under Dhaka in the ETL district table (scripts/etl/districts.py). Counts by division therefore follow the pre-2015 structure.

Source: validated export of the Bangladesh climatic-hazards archive, loaded through `scripts/etl/cli.py events --adapter bgd-climatic-hazards`. Measured quality: `docs/ops/HAZARD_ARCHIVE_QUALITY.md`.
