-- =============================================================================
-- HazardNet · 008_hazard_events_postgis.sql
--
-- The historical hazard-event store (PostGIS): the missing foundation of the
-- `w4` historical-prior stream in docs/architecture/TARGET_ARCHITECTURE.md §2.1.
--
-- WHY THIS EXISTS
-- --------------
-- docs/MODEL_CARD.md §4 states the historical prior is trained on **2,931 hazard
-- events, 2000–2025, across 64 districts**. Nothing in this repository can
-- reproduce that number: the event table lives in a production dataset keyed to a
-- Drive path inside a Colab notebook. So the model card quotes a figure that has
-- never been checked against anything, and every downstream claim that depends on
-- it ("the prior covers 25 monsoons") inherits that.
--
-- This migration creates the store so the claim can be *measured*:
--   * events are keyed by a deterministic id, so re-ingesting is an upsert, not a
--     duplicate (a duplicated archive silently inflates the prior);
--   * the ingest-run table records, per run, how many rows were seen, ingested,
--     rejected, unmapped and duplicated, plus the drift against the claimed
--     2,931 — the run report and the database agree on the same numbers;
--   * geometry is derived from the ADM3 layer (union of a district's upazilas,
--     see 003_adm3_spatial_postgis.sql) rather than trusted from the source.
--
-- THE TABLE IS DELIBERATELY EMPTY AFTER APPLYING THIS MIGRATION
-- -------------------------------------------------------------
-- Loading is done by `the events ingest step` (see scripts/etl/README.md).
-- No rows are seeded here, and no event is invented: on this repository the
-- archive's *source* file is not present, and a fabricated history is worse than
-- no history — it would put made-up floods into a district's prior and be
-- invisible forever after. If you are reading this with the production export in
-- hand, run the loader and check `verify_hazard_events.sql` afterwards.
--
-- SCOPE / DEPENDENCIES
-- --------------------
--   * Requires PostGIS (like 003). Self-host / backend module per ADR 0003: the
--     Vercel serving path, the API and the frontend do not need it.
--   * Uses public.adm3_boundaries (003) *when present* to derive district
--     geometry. On a database without it the migration still applies; `geom`
--     simply stays NULL and verify_hazard_events.sql reports it as a WARN.
--   * Independent of the numbered order; safe to apply at any time.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- =============================================================================
-- PART 0 · Preconditions
-- =============================================================================

create extension if not exists postgis;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    raise exception 'PostGIS is required for public.hazard_events (geometry column)';
  end if;

  -- A pre-existing table of the same name with a different shape is a real
  -- hazard: `create table if not exists` would silently keep it and every insert
  -- below would fail in a confusing way. Fail loudly instead.
  if to_regclass('public.hazard_events') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'hazard_events' and column_name = 'event_id'
     ) then
    raise exception 'public.hazard_events exists but has no event_id column — resolve the conflict before applying 008';
  end if;

  if to_regclass('public.adm3_boundaries') is null then
    raise notice 'public.adm3_boundaries (003) is absent: hazard_events.geom will stay NULL until it is loaded.';
  end if;
end $$;


-- =============================================================================
-- PART 1 · District validation snapshot (referenced by the event store)
-- =============================================================================
-- The 64 districts this pipeline labels, with BBS/GAUL pcodes — the same list as
-- the district table (tests assert the two
-- agree). It exists as a table so the database itself rejects an event naming a
-- district that does not exist, instead of accepting it and skewing a prior for a
-- district nobody can query.

create table if not exists public.hazard_event_districts (
  adm2_name  text primary key,
  division   text not null,
  pcode      text unique,
  created_at timestamptz not null default now()
);

comment on table public.hazard_event_districts is
  'The 64 forecast districts (name → division, pcode) as a referential target for hazard_events. Mirrors the district table.';

insert into public.hazard_event_districts (adm2_name, division, pcode) values
  ('Kurigram', 'Rangpur', '5809'),
  ('Rangpur', 'Rangpur', '5818'),
  ('Gaibandha', 'Rangpur', '5807'),
  ('Nilphamari', 'Rangpur', '5814'),
  ('Dinajpur', 'Rangpur', '5806'),
  ('Panchagarh', 'Rangpur', '5816'),
  ('Thakurgaon', 'Rangpur', '5820'),
  ('Lalmonirhat', 'Rangpur', '5810'),
  ('Rajshahi', 'Rajshahi', '5817'),
  ('Bogra', 'Rajshahi', '5805'),
  ('Sirajganj', 'Rajshahi', '5819'),
  ('Pabna', 'Rajshahi', '5815'),
  ('Naogaon', 'Rajshahi', '5811'),
  ('Natore', 'Rajshahi', '5812'),
  ('Chapainawabganj', 'Rajshahi', '5813'),
  ('Joypurhat', 'Rajshahi', '5808'),
  ('Mymensingh', 'Dhaka', '5787'),
  ('Netrokona', 'Dhaka', '5790'),
  ('Jamalpur', 'Dhaka', '5782'),
  ('Sherpur', 'Dhaka', '5793'),
  ('Sylhet', 'Sylhet', '5824'),
  ('Sunamganj', 'Sylhet', '5823'),
  ('Habiganj', 'Sylhet', '5821'),
  ('Moulvibazar', 'Sylhet', '5822'),
  ('Dhaka', 'Dhaka', '5778'),
  ('Gazipur', 'Dhaka', '5780'),
  ('Narayanganj', 'Dhaka', '5788'),
  ('Tangail', 'Dhaka', '5794'),
  ('Kishoreganj', 'Dhaka', '5783'),
  ('Manikganj', 'Dhaka', '5785'),
  ('Munshiganj', 'Dhaka', '5786'),
  ('Narsingdi', 'Dhaka', '5789'),
  ('Faridpur', 'Dhaka', '5779'),
  ('Gopalganj', 'Dhaka', '5781'),
  ('Madaripur', 'Dhaka', '5784'),
  ('Rajbari', 'Dhaka', '5791'),
  ('Shariatpur', 'Dhaka', '5792'),
  ('Khulna', 'Khulna', '5799'),
  ('Satkhira', 'Khulna', '5804'),
  ('Bagerhat', 'Khulna', '5795'),
  ('Jashore', 'Khulna', '5797'),
  ('Jhenaidah', 'Khulna', '5798'),
  ('Magura', 'Khulna', '5801'),
  ('Narail', 'Khulna', '5803'),
  ('Chuadanga', 'Khulna', '5796'),
  ('Kushtia', 'Khulna', '5800'),
  ('Meherpur', 'Khulna', '5802'),
  ('Barisal', 'Barisal', '5762'),
  ('Bhola', 'Barisal', '5763'),
  ('Jhalokati', 'Barisal', '5764'),
  ('Patuakhali', 'Barisal', '5765'),
  ('Pirojpur', 'Barisal', '5766'),
  ('Barguna', 'Barisal', '5761'),
  ('Chattogram', 'Chittagong', '5770'),
  ('Cox''s Bazar', 'Chittagong', '5772'),
  ('Cumilla', 'Chittagong', '5771'),
  ('Feni', 'Chittagong', '5773'),
  ('Noakhali', 'Chittagong', '5776'),
  ('Lakshmipur', 'Chittagong', '5775'),
  ('Chandpur', 'Chittagong', '5769'),
  ('Brahmanbaria', 'Chittagong', '5768'),
  ('Khagrachhari', 'Chittagong', '5774'),
  ('Rangamati', 'Chittagong', '5777'),
  ('Bandarban', 'Chittagong', '5767')
on conflict (adm2_name) do update
  set division = excluded.division, pcode = excluded.pcode;


-- =============================================================================
-- PART 2 · The event store
-- =============================================================================

create table if not exists public.hazard_events (
  event_id          text primary key,
  hazard_type       text not null
                      check (hazard_type in (
                        'Flood', 'Flash Flood', 'Tropical Cyclone', 'Drought',
                        'Heat Wave', 'Cold Wave', 'Fire', 'Severe Local Storm')),
  start_date        date not null,
  end_date          date not null,
  duration_days     integer generated always as (end_date - start_date + 1) stored,
  adm2_name         text not null references public.hazard_event_districts (adm2_name),
  adm2_pcode        text references public.hazard_event_districts (pcode),
  division          text,
  adm3_pcode        text,
  adm3_name         text,
  -- 0..1, on the same scale as scripts/physics_severity.py. NULL means "the source
  -- documents the event but not a severity we can put on that scale" — never 0.
  severity          numeric check (severity is null or (severity >= 0 and severity <= 1)),
  severity_basis    text,
  source            text not null,
  source_record_id  text not null,
  source_url        text,
  deaths            numeric check (deaths is null or deaths >= 0),
  affected          numeric check (affected is null or affected >= 0),
  damage_usd        numeric check (damage_usd is null or damage_usd >= 0),
  geom              geometry(MultiPolygon, 4326),
  ingest_run_id     text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint hazard_events_window_ordered check (end_date >= start_date),
  constraint hazard_events_source_identity unique (source, source_record_id)
);

comment on table public.hazard_events is
  'Historical hazard events (2000–2025) behind the w4 historical prior. Empty until the archive is loaded with `python -m etl.cli events`; docs/MODEL_CARD.md §4 quotes 2,931 events — the ingest run records the measured number and its drift from that claim.';
comment on column public.hazard_events.event_id is
  'sha256(source + source_record_id) prefix — deterministic, so re-ingesting updates instead of duplicating.';
comment on column public.hazard_events.severity is
  '0..1 on the physics-severity scale (scripts/physics_severity.py). NULL = documented event, undocumented severity. Never coerce to 0.';
comment on column public.hazard_events.geom is
  'ADM2 outline derived from the union of the district''s ADM3 units (003), not copied from the source record.';

create index if not exists idx_hazard_events_geom        on public.hazard_events using gist (geom);
create index if not exists idx_hazard_events_date        on public.hazard_events (start_date desc);
create index if not exists idx_hazard_events_hazard      on public.hazard_events (hazard_type);
create index if not exists idx_hazard_events_district    on public.hazard_events (adm2_name, hazard_type, start_date);
create index if not exists idx_hazard_events_source      on public.hazard_events (source, source_record_id);
create index if not exists idx_hazard_events_run         on public.hazard_events (ingest_run_id);


-- =============================================================================
-- PART 3 · Ingest-run audit trail
-- =============================================================================
-- One row per loader invocation. This is what makes the model card's count
-- auditable: the number that ends up in the report is stored next to the number
-- that was claimed, with the drift.

create table if not exists public.hazard_event_ingest_runs (
  run_id          text primary key,
  source          text not null,
  command         text,
  status          text not null default 'ok',
  started_at      timestamptz,
  finished_at     timestamptz,
  rows_seen       integer,
  rows_ingested   integer,
  rows_rejected   integer,
  rows_unmapped   integer,
  rows_duplicate  integer,
  claimed_total   integer,
  drift           integer,
  manifest_sha256 text,
  summary         jsonb not null default '{}'::jsonb,
  notes           text
);

comment on table public.hazard_event_ingest_runs is
  'Audit trail for historical-event ingestion: rows seen/ingested/rejected/unmapped vs the count quoted in docs/MODEL_CARD.md §4.';

create index if not exists idx_hazard_event_runs_finished
  on public.hazard_event_ingest_runs (finished_at desc);


-- =============================================================================
-- PART 4 · Aggregate views (what the prior actually reads)
-- =============================================================================

create materialized view if not exists public.hazard_event_district_year as
select
  adm2_name,
  hazard_type,
  extract(year from start_date)::integer as year,
  count(*)                               as event_count,
  max(start_date)                        as latest_event,
  avg(severity)                          as mean_severity,
  count(severity)                        as events_with_severity
from public.hazard_events
group by 1, 2, 3;

create unique index if not exists idx_hazard_event_district_year_key
  on public.hazard_event_district_year (adm2_name, hazard_type, year);

create materialized view if not exists public.hazard_event_yearly_totals as
select
  extract(year from start_date)::integer as year,
  hazard_type,
  count(*)                               as event_count,
  count(distinct adm2_name)              as districts
from public.hazard_events
group by 1, 2;

create unique index if not exists idx_hazard_event_yearly_totals_key
  on public.hazard_event_yearly_totals (year, hazard_type);

comment on materialized view public.hazard_event_district_year is
  'Per district × hazard × year event counts, with mean severity. Refreshed by the loader after each ingest.';


-- =============================================================================
-- PART 5 · Recency-weighted prior (SQL mirror of the tested Python function)
-- =============================================================================
-- the prior-score routine is the reference implementation
-- and the tested one (scripts/tests/test_etl_events.py). This function is the
-- same formula for callers that already live in the database:
--
--   prior = 1 - exp(-Σ 0.5 ** (age_years / half_life))
--
-- over events of that class in that district STRICTLY before `as_of`. The
-- strictness is the point: including events on or after `as_of` would score a day
-- with its own outcome — temporal leakage, the failure mode in MODEL_CARD §4.1.

create or replace function public.hazard_event_prior(
  p_adm2_name  text,
  p_hazard     text,
  p_as_of      date,
  p_half_life  numeric default 7.0
) returns numeric
language sql
stable
as $$
  select coalesce(
    round(
      (1 - exp(-sum(power(0.5::numeric, ((p_as_of - start_date)::numeric / 365.25) /
                                  nullif(p_half_life, 0)))))::numeric,
      4
    ),
    0
  )
  from public.hazard_events
  where adm2_name = p_adm2_name
    and hazard_type = p_hazard
    and start_date < p_as_of;
$$;

comment on function public.hazard_event_prior(text, text, date, numeric) is
  'Recency-weighted historical prior in [0,1] for a district × hazard as of a date. Mirrors the prior-score routine (the tested implementation). Events on or after p_as_of are excluded to avoid temporal leakage.';


-- =============================================================================
-- PART 6 · Post-apply notice
-- =============================================================================

do $$
declare
  event_rows bigint;
begin
  select count(*) into event_rows from public.hazard_events;
  if event_rows = 0 then
    raise notice 'hazard_events is empty. Load the archive with: python -m etl.cli events --input <file> --emit-sql out/events.sql (then check scripts/db/verify_hazard_events.sql).';
  else
    raise notice 'hazard_events holds % row(s).', event_rows;
  end if;
end $$;
