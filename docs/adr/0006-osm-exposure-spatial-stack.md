# ADR 0006 — OSM exposure overlay + self-host spatial stack (PostGIS / Tippecanoe)

- **Status:** Accepted (2026-09-12) — phases 8b/8c/8d implemented; first live artifacts expected from the next Sunday pipeline run
- **Context:** Deployment-guide Phase 8 expansion plan (HDX/OSM hybrid); ADR 0005 delivered the 507-unit ADM3 matrix and 10/20/30-day horizons (phase 8a)

## Context

Phase 8a (ADR 0005) moved the pipeline to the 507-unit HDX COD-AB ADM3
matrix. Three deferred pieces followed: an infrastructure-exposure overlay
(OSM), a spatial serving layer (PostGIS + vector tiles), and the frontend
ADM3 transition. The original plan's "554 locations" and uppercase
`ADM3_PCODE` field assumptions were corrected in ADR 0005 (COD standard =
507; HDX v03 fields are lowercase).

## Decision

1. **8b — Exposure is computed in the kernel, not the serving stack.** The
   notebook joins Geofabrik OSM layers (buildings counted by representative
   point; roads/waterways clipped per ADM3 polygon in EPSG:32646, batched
   50k-feature iteration for bounded memory) to the ADM3 matrix and exports
   `hazardnet_adm3_exposure.csv` plus `hazardnet_adm3_latest.geojson`
   (simplified polygons + latest 10-day hazard + exposure). OSM layers are
   discovered from an attached Kaggle dataset first, with a one-off
   Geofabrik wget fallback (the kernel has internet). **Fail-soft**: any
   failure skips the overlay; the forecast CSV is never affected.
2. **8c — PostGIS + Tippecanoe are a self-host module, not platform
   requirements** (consistent with ADR 0003's Vercel topology):
   `scripts/db/003_adm3_spatial_postgis.sql` (boundaries + OSM tables +
   `adm3_exposure` materialized view + `forecasts_adm3` serving view,
   idempotent, P-code keyed) and `scripts/tiles/build-adm3-tiles.sh`
   (tippecanoe: ADM3 base z5–10, OSM overlays z8–14). ADM4 is **excluded** —
   HDX marks it non-COD and inconsistently maintained. Wiring vector tiles
   into the SPA remains future work; the Leaflet + raster basemap +
   SVG-district overlay stays.
3. **8d — Frontend ADM3 transition via ADM2 rollup** (resolves the ADR 0005
   flagged consequence): `/bulk` now returns 507 ADM3 rows that district-name
   matching would mostly miss, so `lib/forecasts.ts` rolls rows up per parent
   ADM2 district (`adm2_name`/`adm2_pcode`): dominant hazard = the max-
   severity unit, district severity = that unit's severity, confidence =
   unit mean — then matches to the 64-district baseline through the existing
   alias table. Legacy ADM2-shaped rows still match directly. The notebook
   also exports `hazardnet_adm3_locations.csv` (the 507-unit matrix) as the
   bridge artifact for a future admin-level drill-down UI.
4. **Artifact distribution:** the weekly workflow attaches the exposure CSV,
   the locations CSV, and the GeoJSON to the GitHub Release when present
   (fail-soft, via a `RELEASE_FILES` env built at download time).

## Consequences

- The exposure overlay adds runtime to the Sunday run (OSM sjoin + clip over
  ~millions of features; batched, est. +15–40 min) and a one-off ~100 MB
  Geofabrik download when no OSM dataset is attached (attaching one is the
  recommended ops follow-up).
- The forecast CSV schema is unchanged (1,521 rows); exposure/locations/
  GeoJSON are separate Release artifacts — ingest and API need no changes.
- PostGIS stays optional: no migration of the production Supabase is implied
  (it supports PostGIS if ever wanted).
- The frontend "Live N/64" overlay works again after the rollup; true
  upazila-level drill-down (507 polygons in the UI) waits on the map-
  architecture decision (vector tiles or SVG re-keying by pcode).

## Verification checklist

- [x] Notebook sections 10–12 added (py_compile clean, valid JSON);
      exposure + GeoJSON are fail-soft
- [x] Workflow attaches optional artifacts (valid YAML; `RELEASE_FILES`
      multiline env via heredoc delimiter form)
- [x] 003 SQL idempotent schema + serving view; tiles script bash -n clean
- [x] Frontend rollup unit-tested (dominant hazard, mean confidence, alias
      matching, legacy passthrough)
- [ ] First live run produces exposure CSV + GeoJSON (next Sunday)
- [ ] PostGIS/tiles exercised against a real self-host instance (when used)
