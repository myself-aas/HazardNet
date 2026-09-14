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
  severity_score numeric     not null check (severity_score >= 0 and severity_score <= 1),
  target_date    date       not null,
  prediction_date date      not null,
  model_version  text,
  -- Dual-track severity + admin context (weekly Kaggle CSV shape; see
  -- backend/utils/forecastRow.js). Optional — older rows may be NULL.
  model_severity   numeric check (model_severity is null or (model_severity >= 0 and model_severity <= 1)),
  physics_severity numeric check (physics_severity is null or (physics_severity >= 0 and physics_severity <= 1)),
  division       text,
  pcode          text,
  -- ADM3 identity (ADR 0005): admin level + parent ADM2 district.
  admin_level    int,
  adm2_name     text,
  adm2_pcode    text,
  created_at    timestamptz not null default now(),
  unique (district_id, horizon, hazard_type, target_date, prediction_date)
);

-- Idempotent upgrades for tables created from an earlier revision of this file.
alter table public.forecasts
  add column if not exists model_severity   numeric check (model_severity is null or (model_severity >= 0 and model_severity <= 1));
alter table public.forecasts
  add column if not exists physics_severity numeric check (physics_severity is null or (physics_severity >= 0 and physics_severity <= 1));
alter table public.forecasts
  add column if not exists division text;
alter table public.forecasts
  add column if not exists admin_level int;
alter table public.forecasts
  add column if not exists adm2_name text;
alter table public.forecasts
  add column if not exists adm2_pcode text;
-- Horizon set canonicalized to 7/15 (ADR 0008): the set the committed Kaggle
-- notebook actually produces. Existing databases converge via 005 (kept as a
-- separate forward migration); this keeps fresh installs identical.
alter table public.forecasts
  drop constraint if exists forecasts_horizon_check;
alter table public.forecasts
  add constraint forecasts_horizon_check
  check (horizon in ('7_days', '15_days'));
alter table public.forecasts
  add column if not exists pcode    text;

create index if not exists forecasts_district_idx on public.forecasts (district_id);
create index if not exists forecasts_dates_idx on public.forecasts (prediction_date desc, target_date);
-- Serving path for GET /api/v1/forecasts/bulk (latest row per district).
create index if not exists forecasts_horizon_idx on public.forecasts (horizon, prediction_date desc);

-- Public read (forecasts are public bulletins); writes only via service role
-- (weekly pipeline, ingest function) which bypasses RLS.
alter table public.forecasts enable row level security;

drop policy if exists "forecasts_public_read" on public.forecasts;
create policy "forecasts_public_read"
  on public.forecasts for select
  using (true);
