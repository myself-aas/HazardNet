# Phase 2 — Data Pipeline (first increment)

**Date:** 2026-09-17 · **Branch:** `arena/01a0afa0-hazardnet` · **Status:** first increment complete; phase continues

This file is the phase report: what was asked for, what changed, the evidence, and what remains
open. It is written so that a reader who was not in the room can reproduce every claim.

---

## 1. Scope of this increment

Two cheap Phase-0-adjacent fixes, then Phase 2's three load-bearing items, per the owner's
sequencing:

| # | Item | Result |
| - | ---- | ------ |
| A | Coverage stamp so partial runs cannot ship silently | **Done** — run report + publish/validate gates + v2 snapshot coverage |
| B | `om_calc_flood(precip, precip)` argument bug | **Done** — distinct horizon-total and peak-24h arguments, neither defaulted |
| C | Independent physics track, all 8 classes | **Done** — `scripts/physics_severity.py` + 19 unit tests |
| D | Constant soil channels | **Guarded, not fixed** — labelled per row, `forbid` mode refuses to run; real drivers still missing |
| E | Provenance columns | **Partial** — model/tensor/pipeline/run/confidence-kind stamped end to end; `dataset_version` + scene lineage open (needs a scene manifest) |

## 2. What changed (files)

### Physics track — new, tested, independent

* **`scripts/physics_severity.py`** (new, standard library only): the eight formulas plus
  `compute_physics_scores(drivers, horizon_days)`, `physics_summary()`, `physics_columns()`.
  The model's predicted class is **not an input**. `HAZARD_CLASSES` here is now the single source of
  truth for class order (pinned against `Models/labels.json` and `forecastRow.js VALID_HAZARDS`).
* **`scripts/auto_forecast.py`**: imports the module (the inline formulas are deleted, so the
  pipeline cannot drift from the tested version); the `Precip_Peak_24h_mm` driver is derived from the
  hourly Open-Meteo series; the `if hazard == …` conditioning and the flat `0.50` default are gone;
  `om_calc_flood` now receives two genuinely different quantities.
* **`scripts/tests/test_physics_severity.py`** (new, 19 tests): flood intensity must change the score
  for a constant horizon total; neither `om_calc_flood` argument may have a default; all eight classes
  are scored; two different model answers cannot change the physics scores; disagreement is surfaced
  not hidden; class order matches the model labels and the forecast contract.

### Coverage accounting — a partial run is now a labelled run

* **`scripts/auto_forecast.py`**: every skipped district is recorded with a reason
  (`no_historical_steps`, `invalid_class_ordinal`), a coverage tally is built
  (`requested_units`, `produced_units`, `per_horizon`, `missing_district_ids`/`_names`, `skipped[]`,
  `status`), and `hazardnet_run_report.json` is written next to the CSV with provenance. A partial run
  prints a loud `::warning::` and sets `status: partial` instead of looking identical to a full one.
* **`scripts/publish_forecast_csv.py`**: refuses to publish without a run report, refuses a report
  that disagrees with the CSV row count, and refuses a report with no coverage tally. The gate runs
  **before** any artifact is written, so a refusal leaves the previous artifacts intact. The manifest
  gains `coverage_status`, `coverage{}`, `run_id`, `pipeline_version`, `model_version`,
  `model_sha256`, `soil_channels_fabricated`, `soil_mode`.
* **`scripts/validate_forecasts.py`**: new coverage gate (manifest must carry the tally; the tally must
  match the rows; a manifest with no model provenance fails; a partial run is labelled but allowed;
  placeholder soil channels warn). Legacy Kaggle producers opt out explicitly with `--skip-coverage`.
* **`scripts/build_forecast_snapshot.mjs`**: snapshot schema **v2** with `provenance`, `coverage`
  (`units_per_horizon`, `districts_per_horizon`, `districts_covered`, `districts_expected`,
  `missing_district_ids` — `null` when the producer did not report them), `soil_channels_fabricated`;
  a run report can be passed via `SNAPSHOT_RUN_REPORT`; unrecognised hazard labels are reported and
  fail the step instead of quietly shrinking the dataset.
* **`.github/workflows/daily_forecast.yml`**: publish step passes `--run-report`, validate step passes
  `--manifest`, the snapshot step passes `SNAPSHOT_RUN_REPORT`, the job summary states coverage and
  warns on a partial run, and the run report is uploaded as an artifact.

### Provenance end to end

Row ← `model_version` (`Models/VERSION.json`), `tensor_build_id` (sha256 prefix of the loaded
artifact), `pipeline_version`, `run_id`, `confidence_kind: model_softmax_top_class`; plus
`physics_top_hazard`, `physics_top_severity`, `physics_agreement`, `track_divergence`,
`physics_inputs_missing`, `soil_channels_fabricated` and one `physics_<class>` score per class.
These flow through `forecastRow.js` (parsed, validated, typed) → `predictFromStore.js` (API envelope
`provenance`) → the snapshot. `scripts/fetch_kaggle_forecast.py` now types booleans and per-class
scores in the JSON sidecar, and leaves an uncomputed score `null` rather than `0.0`.

### Two incidental defects found while wiring coverage

1. **Hazard class ordinals in `hazard_type`.** Part of the pipeline's history wrote the model's output
   *index* (0–7) into the hazard column; the snapshot builder silently dropped those rows. The
   generator now maps the ordinal through the pinned class order and range-checks it, and the builder
   reports unknown labels instead of dropping them mutely.
2. **District names that never matched.** The pipeline labels districts with FAO GAUL spellings; the
   site bridges them with an alias map. `Nawabganj` (Chapainawabganj) had no alias — the district
   showed baseline data while its forecast sat unused — and `jessore → jashore` pointed at a key no
   district had, rewriting a *working* key. Fixed, plus the site table now uses the 2018 official
   spelling (Jashore, keeping the URL id `jessore`), guarded by
   **`scripts/tests/test_district_name_parity.py`** (new, 5 tests: pipeline names must all resolve,
   aliases must all target real districts, the 64-count holds, the GAUL spellings stay aliased, and
   both join paths use the alias-aware key).

### Model artifact integrity

`Models/VERSION.json` already recorded each artifact's sha256 but nothing compared it to the file
actually loaded. `auto_forecast.py` now refuses to run when they disagree — otherwise every row would
be stamped with a version that does not describe its weights.

### Copy and documentation

* **`frontend/src/content/site-routes.json`**: the physics-track disclosure is now two-sided and
  time-qualified — records published before 2026-09-17 were produced by the model-conditioned version
  (and are stamped with their pipeline version); from that date all eight classes are scored from
  weather drivers alone and the physics track's own pick is published.
* **`docs/MODEL_CARD.md`**: §6 header states that §6 describes pre-Phase-2 rows; §6.3/§6.4 carry
  status; new **§6.5 Phase 2 increment** table; §8 failure-mode table marks what is fixed, guarded and
  open. **`docs/PRODUCT_SPEC.md`**: §5 gains a fix-log legend and status blocks on §5.1, §5.4, §5.6,
  §5.8; change log 1.1-draft. **`docs/architecture/TARGET_ARCHITECTURE.md`** §3.1/§3.2 record which
  parts of the frozen contract are implemented and what is still missing.
  **`docs/codebase/CONCERNS.md`** gains a Phase 2 section. **`data/README.md`** documents the run
  report and the coverage gate.

## 3. Verification (all on the committed tree)

| Check | Result |
| ----- | ------ |
| `./node_modules/.bin/jest --silent` | **44 suites / 436 tests passed** (was 434; +2 envelope) |
| `/tmp/pv2/bin/python -m pytest scripts/tests -q` | **119 passed** (was 79; +40) |
| `./node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` | clean |
| `npm run build --prefix frontend` | green (15 public + 5 noindex routes) |
| Negative controls | physics guard fails when the conditioned branch returns; copy guards fail on removed disclosure and on a present-tense limitation; district guard fails when the `nawabganj` alias is removed and when the dangling `jessore` alias returns |
| End-to-end rehearsal | 120-row/60-district CSV + run report → publish (`coverage=120/128 units (partial)`, warning) → validate (`⚠️ Partial run…`, `⚠️ Soil channels…`, pass) → snapshot (`v2`, provenance, coverage, 8 physics scores per row) |

## 4. What this closes, and what it does not

**Closed (with tests):** the physics cross-check can now disagree with the model; the
`om_calc_flood(precip, precip)` bug; silent district dropout (recorded, gated, labelled in the
artifacts); unverifiable provenance labels (partially — see below); hazard ordinals in a name column;
two district-name join failures.

**Guarded but not fixed:** soil channels are still training means — the model's live input is 12
informative channels, now labelled `soil_channels_fabricated=true` on every row, with
`HAZARDNET_SOIL_MODE=forbid` refusing to run if a consumer needs real inputs.

**Still open, in Phase 2 scope:**

1. **`dataset_version` and per-prediction scene lineage** — the rest of the §3.1 row contract. Needs
   the scene manifest (which EE image, which COG, which acquisition dates per district-timestep), not
   another stamp.
2. **ERA5-Land soil moisture/temperature at the live timestep** — the actual fix for the placeholder
   channels.
3. **SMS-capable / hydrology inputs (FFWC) and the w3 stream** — weather-only physics cannot separate
   `Flood` from `Flash Flood` (documented limitation), and cannot see river levels.
4. **UI labelling of coverage gaps (Phase 5)** — the data now says which districts have no forecast
   (`coverage.missing_district_ids`, `districts_expected`); the dashboard still renders baseline
   numbers for them.
5. **Open-Meteo's ~16-day deterministic limit** bounds any future 15+ day horizon ambition (relevant
   to ADR 0005's retired 10/20/30 set).
6. **A real measured run is required to replace §6.1's degenerate-output figures** — everything in
   `docs/MODEL_CARD.md` §6 still describes pre-Phase-2 rows, and will until the next daily run ships
   with these stamps.

## 5. Exit criteria for Phase 2 (from the roadmap)

| Criterion | Status |
| --------- | ------ |
| Pipeline emits the full row contract, including provenance | **Partial** — provenance yes, `dataset_version`/scene lineage no |
| Every requested unit accounted for; partial runs labelled | **Yes** |
| A second, independent evidence stream exists and can disagree | **Yes** (physics track, all eight classes) |
| Hindcast validation on 2020 Amphan / 2021 Yaas | Not started (Phase 9) — blocked on the archive backfill |
| Ingestion ETL for Sentinel-2/MODIS/ERA5/BMD/FFWC, COG preprocessing, PostGIS event store | Not started — the next Phase 2 increment |
