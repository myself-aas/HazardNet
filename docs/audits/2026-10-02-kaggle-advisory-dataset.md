# Kaggle advisory dataset — field-by-field gap analysis (2026-10-02)

**Dataset:** https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts
**File analysed:** `hazardnet_advisories_latest.csv` (21.96 kB, CC BY-NC 4.0, daily refresh)
**Question:** *"in this dataset of forecasts there are many fields which aren't present at the
current system, we've to introduce them in the frontend."*

## What the file contains

128 rows = **64 districts × 2 horizons** (`7_days`, `15_days`), no district missing a horizon;
8 divisions; `generated_at` identical on every row (`2026-09-29 23:29:31`); target dates
`2026-10-06` and `2026-10-14`.

| Column | min | mean | max | Notes |
| --- | --- | --- | --- | --- |
| `confidence` | 0.3409 | 0.8747 | 0.9927 | **identical to `prob_top1` on every row** |
| `cnn_severity_raw` | 0.4221 | 0.9015 | 0.9999 | uncalibrated model output |
| `cnn_severity` | 0.4644 | 0.7318 | 0.8998 | calibrated model score |
| `physics_severity` | 0.1000 | 0.3834 | 0.5585 | mostly the 0.4 default; real values on 22 rows |
| `final_severity` | 0.3544 | 0.7081 | 0.8929 | the blend the tier is cut from |
| `prob_top1` | 0.3409 | 0.8747 | 0.9927 | `== confidence` everywhere |
| `prob_top2` | 0.0042 | 0.0675 | 0.3412 | |
| `prob_top3` | 0.0009 | 0.0406 | 0.3008 | |
| `om_max_temp_c` | 27.5 | 32.58 | 34.9 | |
| `om_min_temp_c` | 19.0 | 22.99 | 25.3 | |
| `om_precip_mm` | 2.4 | 18.94 | 90.3 | 7-day vs 15-day totals differ per district |
| `om_wind_kmh` | 10.0 | 12.40 | 18.5 | |
| `latitude` / `longitude` | 21.486 / 88.269 | — | 26.286 / 92.364 | all inside Bangladesh |

Hazards: `Flash Flood` 106, `Tropical Cyclone` 16, `Flood` 4, `Cold Wave` 2.
Tiers: `SEVERE` 86, `WARNING` 24, `WATCH` 18, `NORMAL` 0 — the mapper also allows `NORMAL`.
`physics_override` is `False` on all 128 rows (the column exists; this run did not trip it).

## Where the fields were being lost

The CSV column set is **byte-identical** to `ADVISORY_CSV_COLUMNS`
(`backend/utils/advisoryMapper.js`), and both the mapper and
`scripts/validate_advisory_csv.mjs` already handled all 22. The pipeline round-trips cleanly:

```
node scripts/validate_advisory_csv.mjs hazardnet_advisories_latest.csv --allow-stale
✅ 128 rows · 22 columns · 64 districts · generated 2026-09-29T23:29:31Z (68.49 h old)
```

The loss was in **`frontend/src/lib/forecasts.ts`**, where `parseForecastRow` is an allowlist.
It rebuilt each row field by field and kept 11 of the 22 columns:

| CSV column | Renamed to (mapper) | Reached the UI before this pass |
| --- | --- | --- |
| `advisory_tier` | `advisory_tier` | ❌ dropped — three components read it and always got `undefined` |
| `final_severity` | `final_severity` | ❌ dropped |
| `cnn_severity_raw` | `model_severity_raw` | ❌ dropped |
| `physics_override` | `physics_override` | ❌ dropped |
| `prob_top1/2/3` | same | ❌ dropped |
| `latitude`, `longitude` | same | ❌ dropped |
| `om_*` → `temperature_*`, `precipitation_mm`, `wind_max_kmh` | ✅ | — |
| `cnn_severity` → `model_severity`, `physics_severity` | ✅ | — |
| `confidence`, `district`, `division`, `horizon`, `hazard`, `target_date`, `generated_at` | ✅ | — |
| `data_source`, `model_version`, `confidence_raw/calibrated/kind` | (added by the mapper) | ❌ dropped |

The consequence was not cosmetic. `DistrictDetailPanel`, `ForecastDashboard` and `StatusStrip`
all read `row.advisory_tier` and, finding nothing, substituted their own binning of
`severity_score`. On the analysed file that would have shown `WARNING`-family labels for
districts the pipeline published as `WATCH` (0.35–0.50 severities are common: 18 rows), and
`SEVERE` where the published tier was also `SEVERE` — right answer, wrong authority, and no way
for a reader to tell which they were looking at.

## What changed

- `parseForecastRow` carries all of them, with validation: `[0,1]` floats are dropped rather
  than clamped, `advisory_tier` must be in `ADVISORY_TIERS`, coordinates must fall inside the
  country bounding box (a swapped lat/lon is a valid coordinate in the wrong country).
- `packages/core/src/{forecasts.ts,contracts.ts}` model the same fields, so the shared contract
  no longer strips them either.
- `DistrictForecastRecords` gained **Tier**, **Final Sev.** and **Top-3 %** columns.
- New `AdvisorySignalCard` renders the four severity tracks (raw / calibrated / physics /
  final), the physics-override flag, the ranked distribution, and the provenance line
  (`data_source`, `model_version`, coordinates). It says *Published tier* or *Derived locally*
  rather than presenting a client-side guess as the pipeline's decision.
- 11 new tests pin the pass-through and the refusals.

## Two things worth knowing

1. **The published file is stale relative to the pipeline's own guard.** At the time of the
   check it was 68.5 h old and `validate_advisory_csv.mjs` rejects it as `STALE_DATA` past the
   36 h default — correctly. The Kaggle mirror and the scheduled ingest are not the same run,
   so the public copy lags. Owner Action 11.
2. **`confidence` is `prob_top1`, duplicated.** Every row carries the same number under both
   names (min/mean/max identical to four decimal places). The UI can show the top-1 probability
   without a second column, but the two must not drift: if the pipeline ever changes one, the
   tracker's `confidence` and the card's `Rank 1` will disagree.
