# Phase 2 — Data Pipeline

**Date:** 2026-09-17 · **Branch:** `arena/01a0afa0-hazardnet` · **Status:** two increments complete

Part I (below) is the first increment: the independent physics track, coverage accounting and row
provenance. Part II (after the exit-criteria table) is the second: the ingestion ETL, the historical
event store, the COG contract, the `w3` hydrology/official streams and the per-prediction scene
manifest that carries `dataset_version`.

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
   another stamp. **Addressed in Part II** — with per-scene enumeration and the COG archive still open.
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
| Pipeline emits the full row contract, including provenance | **Yes (Part II)** — provenance + `dataset_version`, gated at publish; per-scene enumeration and the COG archive remain open |
| Every requested unit accounted for; partial runs labelled | **Yes** |
| A second, independent evidence stream exists and can disagree | **Yes** (physics track, all eight classes) |
| Hindcast validation on 2020 Amphan / 2021 Yaas | Not started (Phase 9) — blocked on the archive backfill |
| Ingestion ETL for Sentinel-2/MODIS/ERA5/BMD/FFWC, COG preprocessing, PostGIS event store | **Done as a data layer (Part II)** — every piece is implemented and fixture-tested; nothing invents data, and the real archive/feeds have not been loaded yet |

---

# Part II — Ingestion ETL, event store, COG contract, scene lineage

**Date:** 2026-09-17 · **Status:** complete · **Directive (verbatim):** *"go with Phase 2 increment,
ingestion ETL (Sentinel-2/MODIS/ERA5/BMD/FFWC), COG preprocessing, the PostGIS event store for the
2,931 events, and the per-prediction scene manifest that unlocks dataset_version."*

## 6. Scope and the one hard constraint

| # | Item | Result |
| - | ---- | ------ |
| A | Ingestion ETL for Sentinel-2 / MODIS / ERA5-Land / Open-Meteo | **Done** — `scripts/etl/sources.py`, fixture- or live-driven, "no data" is a labelled answer |
| B | BMD + FFWC ingestion → the `w3` streams | **Done** — `bulletins.py`, `hydrology.py` (scored, tested, not yet wired into the forecast) |
| C | COG preprocessing | **Done as contract + planning + verification**; no raster writer by design (below) |
| D | PostGIS event store for the 2,931 events | **Store, loader, counting and audit done**; the table itself is not in this repository, so no rows were loaded |
| E | Per-prediction scene manifest → `dataset_version` | **Done end to end** — generator → manifest → published manifest → snapshot → frontend, with publish/validate gates |

**The constraint that shaped D:** `docs/MODEL_CARD.md` §4 names 2,931 events, and the table lives in a
Kaggle dataset keyed to a Drive path inside the Colab notebook — not in this repository. Fabricating
rows to make the number true would put invented floods into a district's historical prior and never be
visible again. So this increment ships the *instrument*: a store, a loader and an audit trail that
**measure** the archive, report the drift against the claim, and refuse to guess.

## 7. What shipped

| Module | Purpose | Tests |
| ------ | ------- | ----- |
| `scripts/etl/districts.py` | The 64-district validation snapshot (name → division, pcode) + GAUL/current spelling resolution; generated from committed forecast rows | `test_etl_events.py` |
| `scripts/etl/events.py` | Event contract: date parsing, eight-class vocabulary, district resolution, severity derivation from a documented basis, dedup, counts, recency-weighted prior | `test_etl_events.py` |
| `scripts/etl/db.py` | Escaped, batched, idempotent SQL emission + optional `psycopg` application | `test_etl_events.py` |
| `scripts/etl/hydrology.py` | FFWC levels → district scores (exceedance bands, lead-time damping, staleness, worst-station) | `test_etl_hydrology_bulletins.py` |
| `scripts/etl/bulletins.py` | BMD prose → structured advisories + `model_agrees_with_official` | `test_etl_hydrology_bulletins.py` |
| `scripts/etl/sources.py` | Sentinel-1/2, Landsat-8, MODIS, ERA5-Land, Open-Meteo adapters; fixture/live modes | `test_etl_sources_cog.py` |
| `scripts/etl/cog.py` | COG contract, metadata validation, band scales, job planning, GDAL commands, verification | `test_etl_sources_cog.py` |
| `scripts/etl/scene_manifest.py` | Unit records, `dataset_version`, validation of a manifest that was edited after it was built | `test_etl_sources_cog.py` |
| `scripts/etl/cli.py` | `python -m etl.cli {districts,events,hydrology,bulletins,cog,scene-manifest}`, all dry-runnable, one JSON report each | `test_etl_sources_cog.py` (run as a subprocess, the way a workflow calls it) |
| `scripts/db/008_hazard_events_postgis.sql` + `verify_hazard_events.sql` | The store, its constraints/views/prior function, and the read-only PASS/FAIL/WARN check | `test_etl_events.py` (seed parity, contract, leakage guard, read-only check) |
| `scripts/tests/test_etl_pipeline_lineage.py` | The **live pipeline's** lineage functions (`_tensor_digest`, `build_scene_unit`), exec'd out of `auto_forecast.py` so they can be tested without Earth Engine | 8 |

**Test totals, measured:** 162 tests in the four new files — `test_etl_events.py` (55, incl. the
SQL/migration tests), `test_etl_hydrology_bulletins.py` (46), `test_etl_sources_cog.py` (53),
`test_etl_pipeline_lineage.py` (8) — plus the lineage additions to `test_publish_forecast_csv.py` (18)
and `test_validate_forecasts.py` (21).

Also changed (existing files):

* **`scripts/auto_forecast.py`** — builds one lineage unit per (district × horizon) from the tensors it
  actually fed the model (nine decadal steps **plus** the t0 block), stamps `dataset_version` on every
  row, writes `hazardnet_scene_manifest.json`, records a `scene_manifest` block in the run report, and
  fingerprints the Open-Meteo request *and* response (including which fields fell back to hard-coded
  defaults).
* **`scripts/publish_forecast_csv.py`** — a second pre-write gate: no scene manifest, a failed
  manifest, or a manifest that does not cover every row ⇒ **refuse to publish**. The manifest is copied
  next to the artifacts and its run-level version recorded in `manifest.json`.
* **`scripts/validate_forecasts.py`** — rejects a malformed `dataset_version`, and fails a manifest
  whose lineage claim disagrees with the rows; reports legacy runs as unable to name their inputs.
* **`.github/workflows/ci.yml`** — an offline ETL smoke step runs the entry points a workflow would
  call (`etl.cli events --emit-sql` → the SQL names the store and the ingest-run table;
  `etl.cli scene-manifest` → `status: ok`, no validation problems) against the same fixtures the unit
  tests use, so a broken CLI is caught before a data workflow is.
* **`.github/workflows/daily_forecast.yml`** — the snapshot step now passes `SCENE_MANIFEST`, the
  scene manifest is uploaded as an artifact, and the run summary prints `dataset_version` plus how many
  rows carry a scene version and whether scenes were enumerated (`git add backend/data/forecasts/`
  already covers the published copy).
* **`scripts/build_forecast_snapshot.mjs`** — per-row `dataset_version`, run-level `dataset_version`,
  and a `lineage` block (`status`, `rows_with_version`, `rows_total`, `scenes_enumerated`).
* **`frontend/src/lib/forecasts.ts`** — types and parses `dataset_version` (only when it is shaped like
  a version) so a deployment can show what a forecast was built from.
* **`frontend/public/data/forecasts-latest.json`** — rebuilt, so the artifact the live site serves
  states its own lineage: `dataset_version: null`, `lineage.status: "partial"`, 0/74 rows versioned
  (the rows predate the manifest). That is the honest record, not a defect in the rebuild.

## 8. How the pieces behave when data is missing

Every new module answers "nothing" explicitly instead of substituting a plausible number — the defect
class this phase exists to remove:

| Situation | Behaviour |
| --------- | --------- |
| Sentinel-2 window fully cloud-covered | `ok: false`, `metadata.optical_gap: true`, `monsoon: true`, and the reason string; **no zero-filled composite** |
| ERA5/MODIS/Open-Meteo fetch unavailable | `ok: false` + the missing dependency; adapters never return an empty-but-successful payload |
| FFWC station has no observation and no forecast | rejected at validation (nothing to score) |
| FFWC observation older than 36 h | scored but flagged `stale: true`; the stream state counts stale stations |
| District has no FFWC station | `hydrology_available: false`, `hydrology_severity: null` — **never `0`**, which would read as "no flooding" |
| BMD bulletin names no district | `scope: "national"`, empty district list, one advisory with `district: null` |
| BMD bulletin with no recognisable hazard | hazards `[]`, severity `null`, no advisory, raw text hash preserved |
| Event hazard outside the eight classes (e.g. landslide) | reported as `unmapped`, counted, and — in strict mode — refuses the ingest |
| Event district not among the 64 | validation error naming the row; the store also enforces it with a FK |
| Ingest finds a different total than 2,931 | `verify_claimed_count()` reports `drift` and tells you to fix the card or the export; it never asserts the claim |
| Lineage missing / failed / not covering every row | `publish_forecast_csv.py` refuses the publish |
| CSV byte-identical to the previous publish, but the published directory has no scene manifest | **not** treated as "already current": the publisher runs the gates and writes the lineage artifact (a legacy publish must not keep the site on rows that cannot name their inputs) |
| `--manifest` pointing outside the repository (a rehearsal or staging dir) | the validator validates the CSV **beside that manifest**, not the committed one — otherwise it compares one run's tally against another run's rows |
| A workflow wants to know what an ingest would do | `python -m etl.cli events` reports the generated statement count in every run, and writes the `.sql` only when `--emit-sql` is given without `--dry-run` |

The scoring table for `w3` hydrology is documented in `hydrology.py` and pinned by tests so it can be
argued with: `reference_level / danger_level` → `<0.90: 0`, `0.90–1.00: 0–0.5`, `1.00–1.20: 0.5–0.85`,
`≥1.20: 0.85–1`, with forecast-only levels damped by `max(0.7, 1 − 0.05·lead_days)`.

## 9. `dataset_version` — what it is, and what it is not

`dataset_version = ds1.<16 hex>`: a deterministic content hash over one prediction unit's inputs —
the nine decadal windows, the collections queried per step, a sha256 of every tensor in the stack
(including the t0 input the model actually consumed) and the Open-Meteo request parameters plus the
canonical digest of the response. Rerunning the same day reproduces it; a new scene, a shifted window
or a revised upstream response moves it. It is **not** a model version (`model_version` +
`tensor_build_id` cover that) and **not** a timestamp.

The chain is gated at three points, all of which fail loudly:

1. the generator records `scene_manifest.error` if it cannot write the manifest;
2. the publisher refuses a missing/failed/incomplete lineage block, and copies
   `hazardnet_scene_manifest.json` next to the CSV/JSON sidecar;
3. the validator fails a malformed version and a lineage claim that disagrees with the CSV.

**What it does not claim:** `scenes_enumerated` is `false`. Earth Engine composites do not hand back
per-scene ids without an extra round trip per collection per district, so the manifest hashes tensors
instead. A digest proves the inputs changed; it does not name the scene that changed. And because no
COG has been archived yet, the pixels behind a version are still fetched fresh from Earth Engine — the
version identifies *which* inputs, not a pinned copy of them.

## 10. Verification

| Check | Result |
| ----- | ------ |
| `/tmp/pv2/bin/python -m pytest scripts/tests -q` | **288 passed across 14 files** (+162 in the four new files) |
| `./node_modules/.bin/jest` | **44 suites / 437 tests passed** (+1 `dataset_version` parse) |
| `./node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` | clean |
| `npm run build --prefix frontend` | green (15 public + 5 noindex routes) |
| `node scripts/build_forecast_snapshot.mjs …` | rebuilds the committed snapshot: 74 rows, `lineage.status=partial`, 0/74 versioned (honest) |
| End-to-end rehearsal | 128-row fixture + run report + scene manifest → publish (gates pass, `dataset_version=ds-run.…`, manifest copied) → validate (`dataset_version present on 128/128 rows`, lineage continuity OK) → snapshot (`lineage.status=complete`, per-row `ds1.…`) — the same chain the daily job runs |
| Negative controls | removing `nodata` from a COG spec fails the contract; changing the pipeline's decadal arithmetic fails the window-parity guard; a hand-edited manifest fails its own content hash; a report without a scene block, with a lineage error, or with a partial stamp count each make the publisher refuse; removing a district from the SQL seed fails the migration-parity test; dropping `event_id` from the generated insert fails the column/value arity guard (which is how that bug was found) |

Three of those negative controls found real bugs during the work: `validate_manifest` raised a
`KeyError` instead of reporting a missing `tensor_sha256` (so a malformed manifest crashed the check
that was supposed to describe it); `dataset_version` was order-sensitive for steps until it was made to
sort by step index; and the generated `insert into public.hazard_events` listed nineteen columns while
supplying eighteen values — every real load would have been rejected by Postgres, and no test in the
repository would have noticed until someone pointed the loader at a live database. The migration's
district snapshot also gained the `adm2_pcode` foreign key it was documented to enforce.

## 11. What this closes, and what it does not

**Closed, with tests:** the 2,931-event claim is now *measurable* (store + loader + per-run drift
audit); an optical gap during the monsoon is a labelled outcome instead of constant zeros at ingest;
river levels and official warnings have a structured, scored representation that can disagree with the
model (the roadmap's ground-truth feedback loop); the COG archive has a contract and a planner; and
every published row can carry a content hash of the inputs that produced it, enforced at three gates.

**Open, in Phase 2 scope:**

1. **The 2,931-row archive is still not in-repo** — load it with `python -m etl.cli events …` and the
   run report will state the true count and its drift. Until then the model card's number stays
   "reported".
2. **`w3` is not wired into the forecast.** FFWC/BMD ingestion exists and is tested, but no scheduled
   job runs it and the daily pipeline still publishes `w1`+`w2`. The fusion step is Phase 3.
3. **No COG has been written.** The contract, band scales and GDAL commands exist; running them (and
   re-pointing the pipeline at the archive) is the remaining work.
4. **Per-scene enumeration** — `scenes_enumerated: false`; naming the actual Sentinel scenes behind a
   version needs the extra Earth Engine round trip.
5. **ERA5-Land soil at the live timestep** — the ingestion adapter fetches real soil layers, but
   `auto_forecast.py` still fills those channels with training means.
6. **The live pipeline's constant-zero optical fallback** is unchanged; the *ingestion* path labels the
   gap, the forecast path can still be shown a cloud-free-looking zero tensor.
7. **Everything here is fixture-tested, not live-tested.** No Earth Engine credentials, no GDAL, no
   Postgres, no network in CI; the first run against real FFWC/BMD/COG/archive inputs has not happened.

## 12. Phase 2 exit criteria (final)

| Criterion | Status |
| --------- | ------ |
| Pipeline emits the full row contract, including provenance **and** `dataset_version` | **Yes** — gated at publish; per-scene enumeration and the COG archive remain open (named in `MODEL_CARD.md` §6.4) |
| Every requested unit accounted for; partial runs labelled | **Yes** (Part I) |
| A second, independent evidence stream exists and can disagree | **Yes** — physics (Part I) + hydrology/official streams ingested (Part II, not yet fused) |
| Ingestion ETL for Sentinel-2/MODIS/ERA5/BMD/FFWC + COG preprocessing + PostGIS event store | **Yes as a data layer** — implemented, fixture-tested, nothing invented; no production feed or archive loaded yet |
| Hindcast validation on 2020 Amphan / 2021 Yaas | Not started (Phase 9) — blocked on the archive backfill (item 1 above) |

**Exit items carried into Phase 3/5:** wire `w3` into the fusion and calibrate the combined score
(Phase 3); label coverage gaps and show `dataset_version` in the UI (Phase 5); load the event archive
and run the first hindcast (Phase 9); archive the COGs (Phase 2 follow-up).
