# ADR 0005 — ADM3 expansion via HDX COD-AB + 10/20/30-day horizons

- **Status:** Accepted (2026-09-12) — phase 8a implemented; first live run pending the next Sunday pipeline
- **Context:** Audit backlog #8; deployment-guide Phase 0 STEP 0.4 / §1.3; supersedes the 7/15-day horizons chosen when the pipeline was built

## Context

The forecast pipeline covered the 64 ADM2 districts, sourced from FAO GAUL
`FeatureCollection`s in Google Earth Engine, with 7/15-day horizons. Product
direction (2026-09-12): sub-district coverage and the guide's original
10/20/30-day horizons.

Two hard constraints shaped the decision:

1. **GEE hosts GAUL levels 0–2 only** — there is no ADM3 layer in the Earth
   Engine catalog, so upazila-level coverage cannot come from the existing
   GEE path.
2. **Open-Meteo's deterministic forecast API serves at most 16 days**
   (`forecast_days` ≤ 16). The notebook's `get_openmeteo_forecast` already
   clamped requests to 16; under 10/20/30-day horizons the 20/30-day windows
   therefore aggregate the available ≤16-day deterministic window.

## Decision

1. **Location matrix: UN OCHA HDX COD-AB ADM3 — 507 units** (495 Upazilas +
   12 City Corporations, the COD standard, BBS-sourced). The deployment
   guide's "554 locations" (64 + 490) matches neither the COD layer (507) nor
   the raw thana-inclusive geometry (600) per the HDX dataset page; 507 COD
   was chosen as the humanitarian-standard, census-aligned set.
   The boundary bundle (`bgd_admin_boundaries.shp/.geojson/.gdb`) is attached
   to the Kaggle kernel as the dataset
   `ashifahmedshuvo/bangladesh-adm0-3-geoboundaries`; the notebook discovers
   the ADM3 layer across the three formats and asserts 507.
2. **FAO GAUL is decommissioned** in the notebook; the ADM2 loader is replaced
   by `load_hdx_adm3_boundaries()` (geopandas; representative-point centroids
   in EPSG:4326 as GEE window centers).
3. **Deterministic ids:** rows are sorted by the stable ADM3 P-code and
   assigned `district_id` 1..507 (the store was empty — no legacy 7/15-era
   rows exist — so the re-keying is a clean cutover). `district_name` carries
   the ADM3 name; `pcode` the ADM3 P-code.
4. **Additive identity columns** on the ingest/store path: `admin_level`
   (int, 3), `adm2_name`, `adm2_pcode` (parent district context, enables
   future ADM2 aggregation/drill-down). `002_forecasts_supabase.sql` adds
   them idempotently; the history CSV export emits them.
5. **Horizons: 10/20/30 days** end-to-end — notebook `HORIZONS`, backend
   `VALID_HORIZONS`, ingest zod enum, SQL CHECK constraints, frontend
   `FORECAST_HORIZONS`/toggle. `7_days`/`15_days` are retired and now fail
   validation. Cadence stays weekly (Sunday 02:00 UTC).
6. **OM window cap is explicit:** the notebook logs it, and this ADR records
   it — 20/30-day horizon values aggregate the ≤16-day deterministic window.
   (A >16-day source, e.g. a seasonal/climate API, is future work.)

## Consequences

- Weekly CSV grows 128 → 1,521 rows (507 × 3 horizons); GEE downloads ~8×
  (11 windows per unit) — a run is est. 2–3 h, within Kaggle's quota.
- **Frontend transition effect:** ~~the live overlay count will drop until
  the ADM3 frontend phase~~ **RESOLVED 2026-09-12 (ADR 0006 phase 8d):**
  `lib/forecasts.ts` now rolls the 507 ADM3 rows up to their parent ADM2
  district (`rollupAdm3ToDistricts`: dominant hazard = max-severity unit,
  confidence = unit mean) before the existing alias-name merge, so the
  `LiveMapView` overlay keeps covering all 64 districts. True upazila-level
  drill-down (pcode-keyed district data / admin selector) remains future
  work; the API serves all 507 units regardless.
- 001/002 SQL CHECK constraints widened (idempotent swap); the Supabase
  upsert now writes 15 columns.
- Exposure overlay (OSM/Geofabrik sjoin) and PostGIS/Tippecanoe map work are
  **out of scope** (phases 8b/8c).
- The `hazardnet-datasets` attachment (normalization stats) was missing from
  `kernel-metadata.json` — a P0 break fixed with this change (the kernel
  would have died at `open(STATS_PATH)` before producing any forecast).

## Verification checklist

- [x] Notebook refactored, valid JSON, `py_compile` clean; GAUL/DISTRICTS
      references fully removed (comments only)
- [x] `kernel-metadata.json` attaches all four datasets (model, EE token,
      normalization stats, HDX boundaries)
- [x] Backend/frontend horizon set = 10/20/30 everywhere; 7/15 retired
      (422/400 paths covered by tests)
- [x] ADM3 identity columns parse → store → API → CSV export (34 suites /
      309 tests green; live smoke: `/bulk?horizon=10_days` 200, `7_days` 400,
      15-column CSV header)
- [ ] First kernel run on Kaggle: asserts 507 units, produces 1,521 rows
- [ ] First weekly ingest lands; `/bulk?horizon=10_days` returns 507 rows
