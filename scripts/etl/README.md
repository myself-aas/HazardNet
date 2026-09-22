# `scripts/etl` — ingestion ETL (Phase 2, second increment)

Standard-library-only modules for the **ingestion** half of the data pipeline.
Everything here runs and is tested offline: no Earth Engine credentials, no GDAL,
no database, no network. The parts that genuinely need those (`ee`, `rasterio`,
`psycopg`) are imported *inside* the functions that use them and report their
absence instead of failing at import time.

| Module | What it does | Tests |
| --- | --- | --- |
| `districts.py` | The 64-district validation snapshot (name → division, pcode) + GAUL/current spelling resolution | `test_etl_events.py` |
| `events.py` | Historical hazard-event contract: validation, the eight-class vocabulary, counting, w4 prior | `test_etl_events.py` |
| `scene_manifest.py` | Per-prediction scene lineage and `dataset_version` | `test_etl_sources_cog.py` |
| `cog.py` | COG contract, metadata validation, job planning, `gdal_translate` command generation | `test_etl_sources_cog.py` |
| `hydrology.py` | FFWC station levels → the `w3` hydrology stream (exceedance-ratio severity) | `test_etl_hydrology_bulletins.py` |
| `bulletins.py` | BMD warning bulletins → structured advisories | `test_etl_hydrology_bulletins.py` |
| `sources.py` | Source adapters (Sentinel-1/2, Landsat-8, MODIS, ERA5-Land, Open-Meteo), fixture or live | `test_etl_sources_cog.py` |
| `db.py` | Emit reviewable SQL for the event store; optional `psycopg` application | `test_etl_events.py` |
| `cli.py` | `python -m etl.cli <command>` — every command has `--dry-run` | `test_etl_sources_cog.py` |

## Commands

Run them from `scripts/` (so `-m etl.cli` resolves) — every one prints a JSON
report on stdout and writes files only when not in `--dry-run`.

```bash
cd scripts

# 64-district snapshot the store validates against
python -m etl.cli districts

# Historical events → validated rows, counts, and a load script
# Validated run reports `status: review` whenever the ingested total does not match
# --claimed-total (default 2931) — that is how the model card's figure gets measured.
# The archive is ingested strictly: one unmapped or invalid row fails the run, and
# --lenient is for reconnaissance against a new source, not for loading.
python -m etl.cli events --input /path/to/events.csv \
    --claimed-total 2931 --emit-sql ../out/hazard_events.sql --report ../out/events-run.json
# …and, when a DSN is configured, apply it (psycopg required):
HAZARDNET_DATABASE_URL=postgres://… python -m etl.cli events --input … --apply

# FFWC levels → district scores; optionally merge into a forecast CSV
python -m etl.cli hydrology --input /path/to/ffwc.json \
    --rows ../backend/data/forecasts/hazardnet_forecasts_latest.csv --report ../out/ffwc.json

# BMD bulletins → advisories
python -m etl.cli bulletins --input /path/to/bulletin.txt --advisories ../out/advisories.json

# COG archive: validate + plan jobs, emit a manifest and the GDAL commands
python -m etl.cli cog --plan jobs.json --manifest ../out/cog-manifest.json

# Scene manifest for a set of unit records (stamps each unit's dataset_version)
python -m etl.cli scene-manifest --units units.json --out ../out/scene-manifest.json
```

## The event store (2,931 events)

`docs/MODEL_CARD.md` §4 says the historical prior rests on **2,931 events,
2000–2025, 64 districts**. That table is *not in this repository* — it lives in a
Kaggle dataset keyed to a Drive path inside the Colab notebook — so this
increment ships the **store, the loader and the counting**, not the rows:

* `scripts/db/008_hazard_events_postgis.sql` — the tables, constraints, indexes,
  aggregate views and the `hazard_event_prior()` SQL function;
* `python -m etl.cli events` — validates, counts, emits the load SQL, and writes a
  run report recording **the drift against 2,931**;
* `scripts/db/verify_hazard_events.sql` — read-only PASS/FAIL/WARN self-check,
  including the per-run drift.

The loader never asserts the claimed count. A run that finds a different total
reports the difference and tells you to fix the model card or the export. No rows
are invented, and nothing is seeded by the migration: a fabricated history would
put made-up floods into a district's prior and never be visible again.

```bash
python -m etl.cli events --input events.csv --claimed-total 2931 --dry-run | jq .claimed_total
# { "claimed": 2931, "ingested": 2318, "drift": -613, "within_tolerance": false,
#   "message": "ingested 2318 events against a claimed 2931 (-613) — update
#   docs/MODEL_CARD.md §4 to the measured number or fix the source export; do not
#   restate the claim" }
```

## The `w3` streams: river levels and official warnings

Both are independent of the model and of the physics track, which is the point:
they are the second and third opinions in `docs/architecture/TARGET_ARCHITECTURE.md` §2.1.

* **`hydrology.py`** scores FFWC levels against the published danger level:
  `< 0.90 → 0`, `0.90–1.00 → 0–0.5`, `1.00–1.20 → 0.5–0.85`, `≥ 1.20 → 0.85–1`
  of the ratio `reference_level / danger_level`, where the reference is the
  highest observed-or-forecast level in the record. Forecast-only levels are
  damped by lead time (`max(0.7, 1 − 0.05·lead_days)`), observations older than
  36 h are flagged stale rather than used silently, and a district with no station
  is `hydrology_available: false` — never `0`, which would read as "no flooding".
* **`bulletins.py`** parses BMD prose into advisories (hazard class, signal
  numbers, drivers, districts, validity window) and derives severity with the same
  formulas as the physics track. A bulletin naming no district stays
  `scope: national` with an empty district list, and an unparseable one keeps its
  text and records no severity. `model_agrees_with_official` is the ground-truth
  feedback loop the roadmap asks for (project-killer #5) — it is `null`, not
  `true`, when no bulletin named the district.

## COG preprocessing

`cog.py` defines the archive contract (EPSG:4326, 512-px tiles, DEFLATE, halving
overviews, explicit nodata, per-source band scales — MODIS LST is 0.02 K per
step, not the 0.0001 NDVI scale) and turns STAC-style items into
`gdal_translate`/`gdaladdo` commands plus a manifest whose entries are
`present`/`planned` with sha256 hashes.

It deliberately contains **no raster writer**: a hand-rolled TIFF writer that
silently produces a non-COG would be worse than none. `gdal_translate -of COG`
(or rio-cogeo) writes the files; `verify_cog()` re-checks structure, size and
recorded hash afterwards, and says which checks it could not run (a full
`gdalinfo` validation needs GDAL, which CI does not have).

## Scene manifest and `dataset_version`

`scene_manifest.py` is what makes a forecast reproducible from its own record
(`docs/PRODUCT_SPEC.md` §5.8). One manifest per run, one record per
(district × horizon) unit:

* the nine decadal history windows plus the t0 window;
* the collections each step drew on;
* a sha256 **tensor digest** per step (a single changed pixel moves it);
* the Open-Meteo request parameters *and* the canonical digest of the response,
  plus any fields the aggregator had to fill from hard-coded defaults.

From those, `dataset_version = ds1.<16 hex>` is a deterministic content hash:
same inputs → same version, different inputs → different version. It is stamped
on every published row, carried in `backend/data/forecasts/manifest.json`, and
exposed in the website snapshot as a per-row field, a run-level
`dataset_version`, and a `lineage` block whose `status` is `partial` when any row
cannot name its inputs.

`scripts/auto_forecast.py` builds the units (including the t0 tensor digest),
writes `hazardnet_scene_manifest.json`, and records a `scene_manifest` block in
`hazardnet_run_report.json`. `scripts/publish_forecast_csv.py` **refuses to
publish** when that block is missing, when it reports an error, or when it does
not cover every row — the same rule as the coverage gate, applied to inputs.

## How this is verified

| Suite | Covers |
| --- | --- |
| `scripts/tests/test_etl_events.py` (55) | the event contract, severity derivation (against the real physics formulas), counting, the drift report, the prior's leakage guard, the generated SQL (escaping, batching, upsert semantics, column/value arity) and the migration itself (seed parity with `districts.py`, constraints, no seeded events, read-only verification script) |
| `scripts/tests/test_etl_hydrology_bulletins.py` (46) | the exceedance bands and their continuity, damping, staleness, worst-station-per-district, `null`-not-zero merges, and bulletin parsing (dates, signals, districts, advisories, agreement signal) |
| `scripts/tests/test_etl_sources_cog.py` (53) | registry ↔ pipeline collection parity, the window arithmetic against the live loop, gap reporting, the COG contract and GDAL argv, manifest `dataset_version` integrity, and the CLI via `subprocess` (exit codes, dry-runs, writing only when asked) |
| `scripts/tests/test_etl_pipeline_lineage.py` (8) | the *live* pipeline's lineage functions, exec'd out of `auto_forecast.py` so the tensor digests can be tested without Earth Engine |

`.github/workflows/ci.yml` additionally runs the entry points offline (`etl.cli events --emit-sql` →
the script names the store and the ingest-run table; `etl.cli scene-manifest` → `status: ok`), so a
broken CLI is caught before a data workflow is. Everything here is fixture-tested: no Earth Engine
credentials, no GDAL, no Postgres, no network in CI.

## What is fixture-only, and what is not

| Path | State |
| --- | --- |
| Event validation, counting, drift, prior, emitted SQL | **live**, tested against `scripts/tests/fixtures/etl/events_sample.csv` |
| FFWC scoring, BMD parsing, COG planning, scene manifest | **live**, tested against fixtures |
| `sources.py` live fetches (`ee` collections, Open-Meteo HTTP) | raise/report "needs the dependency"; the running pipeline still fetches through `scripts/auto_forecast.py` |
| GDAL raster writing | not implemented here by design (see above) |
| The 2,931-event table | not in this repository (Kaggle/Drive) — store + loader only |
| Per-scene enumeration in the manifest | `scenes_enumerated: false`; tensor digests are recorded instead |

Fixtures live in `scripts/tests/fixtures/etl/` and are small on purpose: enough to
pin the contracts, not a substitute for data. The directory is resolved from this
package (`sources.FIXTURE_DIR`), not from the working directory, so the same fixture
loads whether you run `python -m etl.cli` from `scripts/`, pytest from the repository
root, or a workflow step from somewhere else. `scripts/etl/districts.py` is
**generated** from committed forecast rows (`make_fixture_csv.py` names +
`pcode`/`division` off the CSVs) and `test_etl_events.py` fails if it drifts from
either the fixture vocabulary or the migration's district seed.
