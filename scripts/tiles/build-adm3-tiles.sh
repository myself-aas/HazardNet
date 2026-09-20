#!/usr/bin/env bash
# ==============================================================================
# ADM3 vector-tile builder — phase 8c, ADR 0006 (SELF-HOST tooling)
#
# Builds offline-capable MBTiles from the weekly kernel artifacts:
#   1. hazardnet_adm3_latest.geojson → base admin polygons (hazard + exposure
#      properties, already simplified to ~0.001° by the notebook)
#   2. optional Geofabrik OSM layers → overlay tiles (roads, waterways)
#
# Requires: tippecanoe (https://github.com/mapbox/tippecanoe) — e.g.
#   docker run --rm -v "$PWD:$PWD" -w "$PWD" ghcr.io/mapbox/tippecanoe:latest ...
#
# Serving (see README.md in this directory): tileserver-gl or any static
# host that can serve MBTiles/pbf tile pyramids. This is the ADR 0003-
# compliant self-host path — the Vercel deployment does not need it.
# ==============================================================================
set -euo pipefail

GEOJSON="${1:-./hazardnet_adm3_latest.geojson}"
OUT_DIR="${2:-./tiles-out}"
OSM_DIR="${3:-}"   # optional dir with gis_osm_{roads,waterways}_free_*.shp

command -v tippecanoe >/dev/null 2>&1 || {
  echo "ERROR: tippecanoe not found — see the header comment for the docker invocation." >&2
  exit 1
}

mkdir -p "$OUT_DIR"

# ── 1. Base layer: ADM3 polygons with hazard + exposure properties ──────────
tippecanoe \
  -o "$OUT_DIR/hazardnet_adm3.mbtiles" \
  --layer=adm3 \
  --minimum-zoom=5 --maximum-zoom=10 \
  --simplification=10 --no-tiny-polygon-reduction \
  --generate-ids \
  "$GEOJSON"
echo "OK: $OUT_DIR/hazardnet_adm3.mbtiles"

# ── 2. Optional overlay layers: OSM roads + waterways ───────────────────────
# Roads/waterways only make sense at street-level zooms; drop-densest keeps
# tile sizes bounded at low zooms.
if [ -n "$OSM_DIR" ]; then
  ROADS=$(find "$OSM_DIR" -name 'gis_osm_roads_free_*.shp' | head -n 1 || true)
  WATER=$(find "$OSM_DIR" -name 'gis_osm_waterways_free_*.shp' | head -n 1 || true)
  if [ -n "$ROADS" ]; then
    tippecanoe -o "$OUT_DIR/hazardnet_osm_roads.mbtiles" --layer=roads \
      --minimum-zoom=8 --maximum-zoom=14 --drop-densest-as-needed "$ROADS"
    echo "OK: $OUT_DIR/hazardnet_osm_roads.mbtiles"
  fi
  if [ -n "$WATER" ]; then
    tippecanoe -o "$OUT_DIR/hazardnet_osm_waterways.mbtiles" --layer=waterways \
      --minimum-zoom=8 --maximum-zoom=14 --drop-densest-as-needed "$WATER"
    echo "OK: $OUT_DIR/hazardnet_osm_waterways.mbtiles"
  fi
else
  echo "NOTE: OSM_DIR not provided — skipping overlay tiles (base ADM3 only)."
fi

echo "Done. Serve with: docker run -p 8080:8080 -v $PWD/$OUT_DIR:/data maptiler/tileserver-gl"
