-- ==============================================================================
-- 003 — ADM3 spatial layer (PostGIS) — phase 8c, ADR 0006
--
-- SELF-HOST MODULE (per ADR 0003): applies to a Postgres instance with the
-- PostGIS extension (plain self-host Postgres)
-- via the dashboard if this is ever wanted there). It is NOT required by the
-- Vercel deployment, the API, or the frontend — the serving path reads the
-- `forecasts` table only.
--
-- Inputs (all produced by the weekly production kernel and attached to each
-- GitHub Release, see ADR 0006):
--   hazardnet_adm3_latest.geojson  → public.adm3_boundaries (+ osm_* tables
--                                    when loading raw Geofabrik layers)
--   hazardnet_adm3_exposure.csv    → alternative to the osm_* aggregation
--
-- ADM4 (ward level) is deliberately absent: HDX marks it non-COD,
-- unofficial and inconsistently maintained (dataset caveat, 2026-01).
--
-- Idempotent: safe to re-run.
-- ==============================================================================

create extension if not exists postgis;

-- ── ADM3 boundaries (507 units: 495 Upazilas + 12 City Corporations) ────────

create table if not exists public.adm3_boundaries (
  adm3_pcode text primary key,
  adm3_name  text not null,
  division   text,
  adm2_name  text,
  adm2_pcode text,
  geometry   geometry(MultiPolygon, 4326) not null
);

create index if not exists idx_adm3_boundaries_geom
  on public.adm3_boundaries using gist (geometry);
create index if not exists idx_adm3_boundaries_adm2
  on public.adm3_boundaries (adm2_pcode);

-- ── Raw OSM infrastructure tables (loaded from Geofabrik extracts) ─────────
-- Optional: only needed when recomputing exposure inside PostGIS instead of
-- using the kernel's pre-aggregated hazardnet_adm3_exposure.csv.

create table if not exists public.osm_buildings (
  gid        bigserial primary key,
  adm3_pcode text references public.adm3_boundaries (adm3_pcode),
  geometry   geometry(Polygon, 4326) not null
);
create index if not exists idx_osm_buildings_geom
  on public.osm_buildings using gist (geometry);

create table if not exists public.osm_roads (
  gid        bigserial primary key,
  adm3_pcode text references public.adm3_boundaries (adm3_pcode),
  geometry   geometry(LineString, 4326) not null
);
create index if not exists idx_osm_roads_geom
  on public.osm_roads using gist (geometry);

create table if not exists public.osm_waterways (
  gid        bigserial primary key,
  adm3_pcode text references public.adm3_boundaries (adm3_pcode),
  geometry   geometry(LineString, 4326) not null
);
create index if not exists idx_osm_waterways_geom
  on public.osm_waterways using gist (geometry);

-- ── Exposure materialized view (per-ADM3 aggregates) ────────────────────────
-- Mirrors the kernel's geopandas computation (buildings counted, roads /
-- waterways clipped per unit then measured in km via geography casts).

do $$
begin
  if not exists (
    select 1 from pg_matviews
    where schemaname = 'public' and matviewname = 'adm3_exposure'
  ) then
    create materialized view public.adm3_exposure as
    with b as (
      select adm3_pcode, count(*) as building_count
      from public.osm_buildings group by adm3_pcode
    ), r as (
      select adm3_pcode, sum(ST_Length(geometry::geography)) / 1000.0 as road_km
      from public.osm_roads group by adm3_pcode
    ), w as (
      select adm3_pcode, sum(ST_Length(geometry::geography)) / 1000.0 as waterway_km
      from public.osm_waterways group by adm3_pcode
    )
    select
      ab.adm3_pcode, ab.adm3_name, ab.adm2_name, ab.adm2_pcode,
      coalesce(b.building_count, 0)      as building_count,
      coalesce(r.road_km, 0)::numeric    as road_km,
      coalesce(w.waterway_km, 0)::numeric as waterway_km
    from public.adm3_boundaries ab
    left join b on b.adm3_pcode = ab.adm3_pcode
    left join r on r.adm3_pcode = ab.adm3_pcode
    left join w on w.adm3_pcode = ab.adm3_pcode;
  end if;
end $$;

-- Unique index so REFRESH MATERIALIZED VIEW CONCURRENTLY works.
create unique index if not exists idx_adm3_exposure_pcode
  on public.adm3_exposure (adm3_pcode);

-- ── Serving view: forecasts joined to geometry + exposure ───────────────────
-- `forecasts.pcode` carries the ADM3 P-code since ADR 0005 (the notebook's
-- ADM3 rows). Postgres-only convenience for geo queries / tile generation.

create or replace view public.forecasts_adm3 as
select
  f.*,
  b.adm3_name, b.division, b.adm2_name, b.adm2_pcode,
  b.geometry as adm3_geometry,
  e.building_count, e.road_km, e.waterway_km
from public.forecasts f
join public.adm3_boundaries b on b.adm3_pcode = f.pcode
left join public.adm3_exposure e on e.adm3_pcode = f.pcode;
