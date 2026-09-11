# Spatial layer — PostGIS + vector tiles (phase 8c, ADR 0006)

Self-host tooling for the ADM3 spatial stack. **Nothing here is required by
the production deployment** (ADR 0003: Vercel + the Node server read the
`forecasts` table only) — this module exists for self-hosted PostGIS serving,
offline vector maps, and spatial analytics on the exposure data.

## Data flow

```
Kaggle kernel (weekly)
  ├─ hazardnet_forecasts_latest.csv      → ingest API → forecasts table
  ├─ hazardnet_adm3_locations.csv        → 507-unit matrix (frontend bridge)
  ├─ hazardnet_adm3_exposure.csv         → per-ADM3 buildings / road km / waterway km
  └─ hazardnet_adm3_latest.geojson       → simplified ADM3 polygons + hazard + exposure
        (all attached to the weekly GitHub Release)
                    │
   self-host only:  ├─ PostGIS   (scripts/db/003_adm3_spatial_postgis.sql)
                   └─ Tippecanoe (scripts/tiles/build-adm3-tiles.sh)
```

The kernel computes exposure with geopandas (batched sjoin + clip in
EPSG:32646, fail-soft — see the notebook's section 11), so PostGIS/OSM
import is only needed to *recompute or query* exposure spatially.

## PostGIS

```bash
# 1. Apply the schema (idempotent; requires the PostGIS extension).
psql "$DATABASE_URL" -f scripts/db/003_adm3_spatial_postgis.sql

# 2. Load the ADM3 boundaries from the weekly GeoJSON artifact
#    (download it from the latest GitHub Release first).
ogr2ogr -f PostgreSQL PG:"$DATABASE_URL" \
  -nln adm3_boundaries -append -update \
  -t_srs EPSG:4326 hazardnet_adm3_latest.geojson

# 3. (Optional) load raw Geofabrik OSM layers + recompute exposure.
#    Drop .shp sidecar expectations; assign each feature its ADM3 pcode via
#    the loaded boundaries:
#      ST_Intersects-based UPDATE per table, then
#      REFRESH MATERIALIZED VIEW CONCURRENTLY adm3_exposure;
```

`public.forecasts_adm3` is the serving view (forecasts × boundaries ×
exposure). `hazardnet_adm3_exposure.csv` from the Release can be loaded
directly into `adm3_exposure` when the raw-OSM route is skipped.

ADM4 (wards) is intentionally excluded — HDX marks it non-COD and
inconsistently maintained (dataset caveat, 2026-01).

## Vector tiles (offline maps)

```bash
# Base ADM3 tiles (+ optional OSM overlays from a Geofabrik extract):
./scripts/tiles/build-adm3-tiles.sh ./hazardnet_adm3_latest.geojson ./tiles-out [OSM_DIR]

# Serve:
docker run -p 8080:8080 -v "$PWD/tiles-out":/data maptiler/tileserver-gl
```

Frontend consumption would use Leaflet + a vector-tile plugin (e.g.
`leaflet.vectorgrid`) pointed at the tileserver — deliberately not wired into
the Vercel SPA (that map-architecture change remains future work; the current
Leaflet + raster-basemap + SVG-district overlay stays per ADR 0003/0005).
