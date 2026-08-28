-- Forecast consolidation schema (ADR 0002).
-- Apply in Supabase (SQL editor or supabase db push) BEFORE running
-- scripts/migrate-firestore-to-supabase.mjs.

create table if not exists public.forecasts (
  id            uuid primary key default gen_random_uuid(),
  district_id   text        not null,
  district_name text        not null,
  horizon       text        not null check (horizon in ('7_days', '15_days')),
  hazard_type   text        not null,
  confidence    numeric     not null check (confidence >= 0 and confidence <= 1),
  severity_score numeric    not null check (severity_score >= 0 and severity_score <= 1),
  target_date    date       not null,
  prediction_date date      not null,
  model_version  text,
  created_at    timestamptz not null default now(),
  unique (district_id, horizon, hazard_type, target_date, prediction_date)
);

create index if not exists forecasts_district_idx on public.forecasts (district_id);
create index if not exists forecasts_dates_idx on public.forecasts (prediction_date desc, target_date);

-- Public read (forecasts are public bulletins); writes only via service role
-- (weekly pipeline, ingest function) which bypasses RLS.
alter table public.forecasts enable row level security;

drop policy if exists "forecasts_public_read" on public.forecasts;
create policy "forecasts_public_read"
  on public.forecasts for select
  using (true);
