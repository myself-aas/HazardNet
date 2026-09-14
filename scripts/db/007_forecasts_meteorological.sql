-- =============================================================================
-- HazardNet · 007_forecasts_meteorological.sql
--
-- FIX: the Supabase forecast store silently dropped the notebook's eight
-- meteorological columns, so GET endpoints could never serve the weather data
-- that ships with every forecast.
--
-- WHAT WAS WRONG
-- --------------
-- The whole ingest chain carries these fields:
--   * the notebook writes om_* columns for every row;
--   * backend/utils/forecastRow.js parses them and converts to human units;
--   * api/ingest.js Zod-validates all eight;
--   * backend/forecastStore.js toApiRow() reads them back off a DB row;
--   * frontend/src/lib/forecasts.ts types them in ForecastRow and whitelists
--     them in the response parser.
--
-- But the pre-cutover Firestore store wrote `{ ...row, created_at }` (the whole
-- object), while the ADR 0002 Supabase store writes an explicit 15-column
-- INSERT — and none of the eight were in that list. The cutover therefore
-- dropped them on the floor, and because the columns did not exist there was no
-- error: the data simply vanished between the CSV and the API.
--
-- Idempotent — safe to re-run. Run after 002_forecasts_supabase.sql.
-- =============================================================================

alter table public.forecasts
  -- Human-readable units, per the ingest contract in forecastRow.js.
  -- NOTE on the source column names: the notebook's CSV headers are misleading
  -- (`om_temp_2m_k` holds Celsius, `om_et_sum_m` holds millimetres), so the
  -- conversions in forecastRow.js — not the column suffixes — are authoritative.
  add column if not exists temperature_mean      numeric,
  add column if not exists temperature_max       numeric,
  add column if not exists temperature_min       numeric,
  add column if not exists precipitation_mm      numeric,
  add column if not exists wind_max_kmh          numeric,
  add column if not exists dewpoint_mean         numeric,
  add column if not exists solar_radiation_mj_m2 numeric,
  add column if not exists evapotranspiration_mm numeric;

comment on column public.forecasts.temperature_mean is
  'Forecasted mean air temperature, °C (from the notebook om_temp_2m_k column, which holds Celsius despite the suffix).';
comment on column public.forecasts.precipitation_mm is
  'Accumulated precipitation over the horizon, mm (notebook om_precip_m is metres).';
comment on column public.forecasts.wind_max_kmh is
  'Maximum wind speed, km/h (notebook om_wind_max_ms is m/s).';
comment on column public.forecasts.solar_radiation_mj_m2 is
  'Daily mean solar radiation, MJ/m²/day. The notebook accumulates over the horizon and multiplies by 1000 (kJ/m²), so forecastRow.js divides by 1000 and by the horizon length.';
comment on column public.forecasts.evapotranspiration_mm is
  'Daily mean FAO-56 ET0 reference evapotranspiration, mm/day. The notebook accumulates millimetres over the horizon (despite the om_et_sum_m name), so forecastRow.js divides by the horizon length.';

-- All eight are nullable on purpose: rows ingested before this migration (and
-- any future CSV that omits om_*) legitimately have no weather values, and the
-- API treats them as optional.
