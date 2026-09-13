-- Canonicalize the forecast horizon set to 7/15 days (ADR 0008).
--
-- The committed Kaggle notebook
-- (kaggle_notebooks/hazardnet-auto-forecast-pipeline) writes HORIZONS =
-- {'7_days', '15_days'}; the ingest parser (backend/utils/forecastRow.js),
-- the validators, the frontend, and the test suite all accept exactly that
-- set. Revisions 001/002 constrained public.forecasts to the aspirational
-- 10/20/30-day set instead, which made Supabase ingest IMPOSSIBLE (every real
-- row violated the CHECK). This migration swaps the CHECK to the set the
-- pipeline actually produces. Idempotent; safe to re-run.
--
-- NOTE: revisions 001/002 in this directory were corrected to the same CHECK
-- so fresh installs match. Databases created from the old revisions converge
-- by applying this file.

alter table public.forecasts
  drop constraint if exists forecasts_horizon_check;

alter table public.forecasts
  add constraint forecasts_horizon_check
  check (horizon in ('7_days', '15_days'));
