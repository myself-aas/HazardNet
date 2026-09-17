-- =============================================================================
-- HazardNet · verify_hazard_events.sql
--
-- Self-assessing verification for 008_hazard_events_postgis.sql, the historical
-- hazard-event store that backs the `w4` prior. Run it in the SQL editor:
--
--   • BEFORE 008 — expect FAILs. The first block reports the missing tables.
--   • AFTER 008, with no ingest yet — expect the schema blocks to PASS and the
--     DATA block to read WARN ('0 events'), not FAIL: an empty store is the
--     correct state of a freshly migrated database, and pretending otherwise
--     would train the operator to ignore FAILs.
--   • AFTER an ingest — expect every row to read PASS except the ones whose
--     conditions genuinely do not hold (e.g. severity coverage < 50%), which are
--     WARN rather than FAIL because they describe the data, not the schema.
--
-- READ-ONLY: it inspects catalogs and aggregates existing rows. It does not
-- create, alter, delete or insert anything.
--
-- The last block compares the store against the claimed 2,931 events from
-- docs/MODEL_CARD.md §4. It reports the measured count and the drift; it does
-- NOT assert the claim. A store holding 2,301 events is a documentation defect to
-- fix, and this file is where you find that out.
-- =============================================================================


-- =============================================================================
-- PART 1 · Schema: tables, constraints and indexes from 008
-- =============================================================================

with expected as (
  select * from (values
    ('hazard_events',              'table'),
    ('hazard_event_districts',     'table'),
    ('hazard_event_ingest_runs',   'table'),
    ('hazard_event_district_year',  'matview'),
    ('hazard_event_yearly_totals',  'matview')
  ) as t(object_name, object_kind)
)
select
  'schema/' || object_name as check_name,
  case
    when object_kind = 'table'   and to_regclass('public.' || object_name) is not null then 'PASS'
    when object_kind = 'matview' and to_regclass('public.' || object_name) is not null then 'PASS'
    when to_regclass('public.' || object_name) is null then 'FAIL'
    else 'FAIL'
  end as result,
  case
    when to_regclass('public.' || object_name) is null
      then 'apply scripts/db/008_hazard_events_postgis.sql'
    else 'present'
  end as detail
from expected
order by object_name;


-- The eight hazard classes, enforced by a CHECK on the column. If this reads
-- FAIL, a class the model can predict has nowhere to be stored.
select
  'schema/hazard_type_check_covers_8_classes' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as result,
  'constraint present: ' || coalesce(max(constraint_name), 'none') as detail
from information_schema.table_constraints
where table_schema = 'public' and table_name = 'hazard_events'
  and constraint_type = 'CHECK' and constraint_name = 'hazard_events_hazard_type_check';


-- A duplicate ingest must be an upsert, not a second row: the unique key on
-- (source, source_record_id) is what makes that true.
select
  'schema/source_identity_unique' as check_name,
  case when count(*) >= 1 then 'PASS' else 'FAIL' end as result,
  coalesce(string_agg(constraint_name, ', '), 'missing') as detail
from information_schema.table_constraints
where table_schema = 'public' and table_name = 'hazard_events'
  and constraint_name = 'hazard_events_source_identity';


select
  'schema/geom_index_is_gist' as check_name,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as result,
  coalesce(max(indexdef), 'idx_hazard_events_geom missing') as detail
from pg_indexes
where schemaname = 'public' and indexname = 'idx_hazard_events_geom'
  and indexdef ilike '%using gist%';


-- The district validation snapshot must hold exactly the 64 districts; anything
-- else means the referential target drifted from scripts/etl/districts.py.
select
  'schema/64_districts_seeded' as check_name,
  case when count(*) = 64 then 'PASS' else 'FAIL' end as result,
  count(*)::text || ' district row(s)' as detail
from public.hazard_event_districts;


-- =============================================================================
-- PART 2 · Data quality (aggregates over whatever is loaded)
-- =============================================================================

select
  'data/store_populated' as check_name,
  case when count(*) > 0 then 'PASS' else 'WARN' end as result,
  case when count(*) = 0
    then 'store is empty — load with python -m etl.cli events (this is expected before the first ingest)'
    else count(*)::text || ' event(s), '
         || count(distinct adm2_name)::text || '/64 districts, '
         || min(start_date)::text || ' … ' || max(end_date)::text
  end as detail
from public.hazard_events;


-- Every district × hazard pair the prior can be asked about. A district with no
-- events at all is a WARN, not a FAIL: it may be genuinely quiet, but 30+ of them
-- usually means the archive is partial.
select
  'data/districts_covered' as check_name,
  case
    when count(distinct e.adm2_name) = 64 then 'PASS'
    when count(distinct e.adm2_name) = 0 then 'WARN'
    else 'WARN'
  end as result,
  count(distinct e.adm2_name)::text || '/64 districts have at least one event' as detail
from public.hazard_events e;


select
  'data/severity_coverage' as check_name,
  case
    when count(*) = 0 then 'WARN'
    when count(severity)::numeric / count(*) >= 0.5 then 'PASS'
    else 'WARN'
  end as result,
  count(severity)::text || '/' || count(*)::text || ' events carry a 0–1 severity' as detail
from public.hazard_events;


-- Geometry must be derived, not invented: rows present only where the ADM3 layer
-- exists. A district with ADM3 coverage but a NULL geom means the loader ran
-- without the geometry step.
select
  'data/geometry_derived' as check_name,
  case
    when count(*) = 0 then 'WARN'
    when count(geom) = 0 and to_regclass('public.adm3_boundaries') is null then 'WARN'
    when count(geom)::numeric / count(*) >= 0.9 then 'PASS'
    else 'WARN'
  end as result,
  count(geom)::text || '/' || count(*)::text || ' events have derived ADM2 geometry' as detail
from public.hazard_events;


-- Temporal leakage guard: an event that ends in the future would be scored into a
-- prior for a date that has not happened.
select
  'data/no_future_events' as check_name,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  coalesce('events ending after today: ' || count(*)::text, 'none') as detail
from public.hazard_events
where end_date > current_date;


-- Aggregate views must not be stale relative to the store. The loader refreshes
-- them; if these disagree, someone inserted rows by hand.
select
  'data/aggregates_in_sync' as check_name,
  case when (select count(*) from public.hazard_events) =
            (select coalesce(sum(event_count), 0) from public.hazard_event_yearly_totals)
       then 'PASS' else 'FAIL' end as result,
  (select count(*) from public.hazard_events)::text || ' rows in store vs '
    || (select coalesce(sum(event_count), 0) from public.hazard_event_yearly_totals)::text
    || ' summed in hazard_event_yearly_totals (refresh the views after a manual insert)' as detail;


-- The recency-weighted prior must be computable and inside [0,1]. A NULL here
-- means the function is missing; a value outside the range means the formula
-- drifted from scripts/etl/events.py::historical_prior_score.
select
  'data/prior_function_usable' as check_name,
  case
    when to_regprocedure('public.hazard_event_prior(text,text,date,numeric)') is null then 'FAIL'
    when public.hazard_event_prior('Sylhet', 'Flash Flood', current_date) between 0 and 1 then 'PASS'
    else 'FAIL'
  end as result,
  coalesce(public.hazard_event_prior('Sylhet', 'Flash Flood', current_date)::text,
           '0') || ' (Sylhet / Flash Flood, as of today; 0 is correct when the store is empty)' as detail;


-- =============================================================================
-- PART 3 · The model-card claim
-- =============================================================================

select
  'claim/model_card_2931_events' as check_name,
  case
    when (select count(*) from public.hazard_events) = 0 then 'WARN'
    when (select count(*) from public.hazard_events) = 2931 then 'PASS'
    else 'WARN'
  end as result,
  'store holds ' || (select count(*) from public.hazard_events)::text
    || ' events; docs/MODEL_CARD.md §4 claims 2,931 (2000–2025, 64 districts).'
    || ' WARN = the claim is unverified or wrong: either the archive load is incomplete'
    || ' or the model card needs the measured number.' as detail;


select
  'claim/last_ingest_run' as check_name,
  case when count(*) = 0 then 'WARN' else 'PASS' end as result,
  coalesce(
    string_agg(
      run_id || ' — ' || coalesce(rows_ingested, 0)::text || ' ingested, '
        || coalesce(rows_rejected, 0)::text || ' rejected, '
        || coalesce(rows_unmapped, 0)::text || ' unmapped, drift '
        || coalesce(drift, 0)::text || ' vs claim (' || coalesce(status, 'unknown') || ')',
      E'\n' order by finished_at desc
    ),
    'no ingest run has been recorded yet'
  ) as detail
from (
  select * from public.hazard_event_ingest_runs
  order by finished_at desc nulls last
  fetch first 3 rows only
) recent;
