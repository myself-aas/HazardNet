-- =============================================================================
-- HazardNet · verify_forecasts_meteorological.sql
--
-- Self-assessing verification for 007_forecasts_meteorological.sql, the
-- migration that adds the eight Open-Meteo meteorological columns the weekly
-- notebook emits. Run it in the Supabase SQL editor:
--
--   • BEFORE scripts/db/007_forecasts_meteorological.sql — expect FAILs. A FAIL
--     on the first block means the columns are absent, and because the ingest's
--     INSERT names them explicitly, the next
--     POST /api/v1/forecasts/update will fail with
--     `column "temperature_mean" of relation "forecasts" does not exist`.
--   • AFTER it — expect every row to read PASS.
--
-- It is READ-ONLY: it only inspects catalogs and aggregates existing rows, so
-- it never creates, alters or deletes anything.
--
-- A PASS with zero stored rows in the data block is expected on a fresh
-- database — the columns exist but nothing has been ingested yet.
-- =============================================================================


-- =============================================================================
-- PART 1 · Schema: are the eight columns present, with the expected types?
-- =============================================================================
-- `numeric`, matching the neighbouring severity_score / confidence columns in
-- 002_forecasts_supabase.sql. The driver returns numeric as strings and the
-- store coerces them, exactly as it already does for severity.
with expected(ord, column_name, data_type) as (
  values
    (1, 'temperature_mean',       'numeric'),
    (2, 'temperature_max',        'numeric'),
    (3, 'temperature_min',        'numeric'),
    (4, 'precipitation_mm',       'numeric'),
    (5, 'wind_max_kmh',           'numeric'),
    (6, 'dewpoint_mean',          'numeric'),
    (7, 'solar_radiation_mj_m2',  'numeric'),
    (8, 'evapotranspiration_mm',  'numeric')
),
actual as (
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'forecasts'
)
select
  e.ord as ord,
  'column ' || e.column_name as check_name,
  case
    when a.column_name is null then 'FAIL'
    when a.data_type <> e.data_type then 'FAIL'
    when a.is_nullable <> 'YES' then 'FAIL'
    else 'PASS'
  end as status,
  case
    when a.column_name is null
      then 'missing — run scripts/db/007_forecasts_meteorological.sql'
    when a.data_type <> e.data_type
      then 'wrong type: ' || a.data_type || ' (expected ' || e.data_type || ')'
    when a.is_nullable <> 'YES'
      then 'must stay nullable so pre-007 rows and weather-less CSVs still ingest'
    else a.data_type || ', nullable'
  end as detail
from expected e
left join actual a using (column_name)

union all

-- The table itself must exist first.
select 0, 'forecasts table exists',
  case when to_regclass('public.forecasts') is not null then 'PASS' else 'FAIL' end,
  coalesce(to_regclass('public.forecasts')::text, 'public.forecasts is missing — run 001/002 first')

order by ord;


-- =============================================================================
-- PART 2 · Data: are stored weather values populated AND physically sane?
--
-- Catches the two failure modes this migration exists for:
--   * the columns exist but every value is NULL (the ingest is not writing
--     them), and
--   * the horizon totals were stored raw — 30,000 mm of evapotranspiration
--     instead of ~4 mm/day, and 0.15 MJ/m² of solar radiation instead of ~20.
-- =============================================================================
-- Each stored row is inspected through to_jsonb() so the query still runs —
-- and still reports FAIL rather than erroring — on a database where 007 has
-- not been applied yet. A missing column simply yields no key in the JSON, so
-- it can never make the checks below look better than they are.
with latest as (
  select to_jsonb(f) as j
  from public.forecasts f
  where prediction_date = (select max(prediction_date) from public.forecasts)
),
totals as (
  select
    count(*) as rows_total,
    count(j->>'temperature_mean') as rows_with_weather,
    count(*) filter (
      where (j->>'evapotranspiration_mm')::numeric > 20
         or (j->>'solar_radiation_mj_m2')::numeric < 5
         or (j->>'solar_radiation_mj_m2')::numeric > 40
         or (j->>'temperature_mean')::numeric > 45
         or (j->>'precipitation_mm')::numeric > 1000
         or (j->>'wind_max_kmh')::numeric > 250
    ) as out_of_range,
    round(min((j->>'evapotranspiration_mm')::numeric), 2) as et_min,
    round(max((j->>'evapotranspiration_mm')::numeric), 2) as et_max,
    round(min((j->>'solar_radiation_mj_m2')::numeric), 2) as solar_min,
    round(max((j->>'solar_radiation_mj_m2')::numeric), 2) as solar_max,
    round(min((j->>'temperature_mean')::numeric), 2) as temp_min,
    round(max((j->>'temperature_mean')::numeric), 2) as temp_max
  from latest
)
select ord, check_name, status, detail
from (
  select 10 as ord, 'latest prediction_date has rows' as check_name,
    case when rows_total > 0 then 'PASS' else 'SKIP' end as status,
    case when rows_total > 0
      then rows_total || ' rows for the newest prediction_date'
      else 'no rows stored yet — nothing ingested on this database' end as detail
  from totals

  union all
  select 11, 'every stored row carries the weather fields',
    case when rows_total = 0 then 'SKIP'
         when rows_with_weather = rows_total then 'PASS'
         else 'FAIL' end,
    case when rows_total = 0 then 'no data to check'
      when rows_with_weather = 0 then 'the columns are missing or the ingest is still writing the old 15-column INSERT — apply 007 and re-run the ingest'
      else rows_with_weather || ' of ' || rows_total || ' rows have a temperature_mean' end
  from totals

  union all
  select 12, 'values are physically plausible (not raw horizon totals)',
    case when rows_total = 0 or rows_with_weather = 0 then 'SKIP'
         when out_of_range = 0 then 'PASS'
         else 'FAIL' end,
    case when rows_total = 0 or rows_with_weather = 0 then 'no data to range-check'
      else out_of_range || ' row(s) outside plausible bounds; ET0 ' || et_min || '-' || et_max
        || ' mm/day, solar ' || solar_min || '-' || solar_max
        || ' MJ/m2/day, temp ' || temp_min || '-' || temp_max || ' C' end
  from totals
) checks
order by ord;
