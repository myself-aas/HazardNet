#!/usr/bin/env python3
"""The historical-event store: contract, severity derivation, and the 2,931 claim.

WHAT THESE TESTS ARE GUARDING
-----------------------------
`docs/MODEL_CARD.md` §4 quotes **2,931 events, 2000–2025** as the data behind the
historical prior. Phase 2 makes that number auditable, which only works if the
loader refuses to be sloppy in the specific ways it was sloppy before:

  * an unrecognised district is an error, not a dropped row (silent dropout);
  * a landslide is reported as unmapped, never coerced into `Flood`;
  * an event that has not happened yet must not contribute to a prior
    (temporal leakage — the failure mode in MODEL_CARD §4.1);
  * the run **reports** the drift against 2,931 and tells the operator to fix the
    documentation or the source export — it never restates the claim.

Severity values are checked against `scripts/physics_severity.py`, not against
literals: an archived event has to be on the same scale as the live physics track,
and duplicating the formula here would let the two drift apart.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'scripts' / 'etl'))

import events  # noqa: E402
import physics_severity  # noqa: E402

FIXTURES = ROOT / 'scripts' / 'tests' / 'fixtures' / 'etl'


def sample_events():
    raw = events.load_events(FIXTURES / 'events_sample.csv')
    return events.normalize_events(raw)


def one(**overrides):
    row = {
        'hazard_type': 'flood',
        'start_date': '2020-06-01',
        'end_date': '2020-06-05',
        'adm2_name': 'Sunamganj',
        'source': 'news-archive',
        'source_record_id': 'row-1',
    }
    row.update(overrides)
    return events.normalize_event(row)


# ── the fixture itself ───────────────────────────────────────────────────────

def test_the_sample_archive_normalises_cleanly():
    outcome = sample_events()
    assert outcome['errors'] == []
    assert outcome['unmapped'] == []
    assert len(outcome['events']) == 9


def test_the_fixture_covers_every_class_the_model_predicts():
    hazards = {event['hazard_type'] for event in sample_events()['events']}
    assert hazards == set(physics_severity.HAZARD_CLASSES)


def test_the_fixture_is_not_mistaken_for_the_real_archive():
    """Nine rows from a fixture must never look like a 2,931-row ingest."""
    summary = events.summarize(sample_events()['events'])
    claim = events.verify_claimed_count(summary)
    assert claim['ingested'] == 9
    assert claim['drift'] == -2922
    assert claim['within_tolerance'] is False
    assert 'do not restate the claim' in claim['message']


# ── validation: what must be refused ────────────────────────────────────────

def test_an_unknown_district_is_an_error_not_a_drop():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(adm2_name='Kolkata')
    assert 'not one of the 64' in str(excinfo.value)


def test_a_gaul_spelling_resolves_to_the_canonical_district():
    event = one(adm2_name='Chittagong')
    assert event['adm2_name'] == 'Chattogram'
    # Division names keep the source (GAUL) spelling: 'Chattogram' the district sits
    # in 'Chittagong' the division, and both spellings are in the archive's vocabulary.
    assert event['division'] == 'Chittagong'


def test_district_pcode_and_division_are_derived_from_the_district():
    from districts import division_of, pcode_of
    event = one(adm2_name="Cox's Bazar")
    assert event['adm2_pcode'] == pcode_of("Cox's Bazar")
    assert event['division'] == division_of("Cox's Bazar")


def test_end_before_start_is_refused():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(start_date='2020-06-05', end_date='2020-06-01')
    assert 'precedes' in str(excinfo.value)


def test_severity_outside_the_unit_interval_is_refused():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(severity=1.4)
    assert 'outside [0, 1]' in str(excinfo.value)
    with pytest.raises(events.EventValidationError):
        one(severity=-0.01)


def test_a_missing_source_record_id_is_refused():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(source_record_id='')
    assert 'source_record_id' in str(excinfo.value)


def test_a_missing_source_is_refused():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(source='')
    assert 'source' in str(excinfo.value)


def test_an_unmapped_hazard_label_is_not_coerced_into_a_class():
    with pytest.raises(events.UnmappedHazardLabel):
        one(hazard_type='landslide')
    assert events.normalize_hazard_label('landslide') is None
    # A synonym that *is* in the vocabulary still maps.
    assert events.normalize_hazard_label('NORWESTER') == 'Severe Local Storm'


def test_negative_impact_figures_are_refused():
    for field in ('deaths', 'affected', 'damage_usd'):
        with pytest.raises(events.EventValidationError):
            one(**{field: -1})


def test_a_broken_geometry_is_refused_and_a_good_one_round_trips():
    with pytest.raises(events.EventValidationError) as excinfo:
        one(geom_geojson='{"type": "Banana", "coordinates": []}')
    assert 'not a supported GeoJSON geometry' in str(excinfo.value)
    event = one(geom_geojson={'type': 'Point', 'coordinates': [91.4, 25.0]})
    assert event['geom_geojson'] == '{"coordinates": [91.4, 25.0], "type": "Point"}'


# ── date and number parsing ─────────────────────────────────────────────────

@pytest.mark.parametrize('value,expected', [
    ('2022-06-15', '2022-06-15'),
    ('2022/06/15', '2022-06-15'),
    ('15-06-2022', '2022-06-15'),
    ('15/06/2022', '2022-06-15'),
    ('20220615', '2022-06-15'),
    ('15 Jun 2022', '2022-06-15'),
    ('15 June 2022', '2022-06-15'),
])
def test_date_formats_the_sources_actually_use(value, expected):
    assert events.parse_date(value).isoformat() == expected


def test_an_unparseable_date_says_so():
    with pytest.raises(events.EventValidationError) as excinfo:
        events.parse_date('June-ish 2022')
    assert 'June-ish 2022' in str(excinfo.value)


def test_numeric_fields_may_be_blank_but_not_nonsense():
    assert events.parse_float('', field='deaths', default=None) is None
    assert events.parse_float(None, field='deaths', default=None) is None
    assert events.parse_float('12', field='deaths') == 12.0
    with pytest.raises(events.EventValidationError):
        events.parse_float('many', field='deaths')


def test_a_single_day_event_gets_end_equal_start():
    event = one(end_date=None)
    assert event['end_date'] == event['start_date']
    assert events.event_window_days(event) == 1


def test_event_ids_are_deterministic_and_source_scoped():
    first = events.deterministic_event_id('ffwc-archive', 'abc-1')
    again = events.deterministic_event_id('ffwc-archive', 'abc-1')
    other_source = events.deterministic_event_id('emdat', 'abc-1')
    assert first == again
    assert first != other_source
    assert first.startswith('evt-') and len(first) == 20  # evt- + 16 hex of the sha256


# ── severity: the same scale as the live physics track ──────────────────────

def test_rainfall_severity_matches_the_flood_formula():
    event = one(severity_basis='rainfall_mm=720', adm2_name='Sylhet')
    expected = physics_severity.om_calc_flood(720, 720 / 3.0)
    assert event['severity'] == pytest.approx(round(expected, 4), abs=1e-6)


def test_cyclone_severity_matches_the_wind_formula():
    event = one(hazard_type='tropical cyclone', severity_basis='wind_speed_kmh=185')
    expected = physics_severity.om_calc_tropical_cyclone(185.0, 0.0)
    assert event['severity'] == pytest.approx(round(expected, 4), abs=1e-6)


def test_temperature_severity_matches_the_formulas_and_uses_duration():
    heat = one(hazard_type='heat wave', severity_basis='temp_max_c=41.5',
               start_date='2023-04-20', end_date='2023-04-25')
    assert heat['severity'] == pytest.approx(
        round(physics_severity.om_calc_heat_wave(41.5, 6), 4), abs=1e-6)
    short = one(hazard_type='heat wave', severity_basis='temp_max_c=41.5',
                start_date='2023-04-20', end_date='2023-04-20')
    assert short['severity'] <= heat['severity']  # a longer heat wave is not milder
    cold = one(hazard_type='cold wave', severity_basis='temp_min_c=6.2')
    assert cold['severity'] == pytest.approx(
        round(physics_severity.om_calc_cold_wave(6.2, 5), 4), abs=1e-6)


def test_drought_and_dry_day_severities_are_bounded():
    drought = one(hazard_type='drought', severity_basis='rainfall_deficit_mm=400')
    dry = one(hazard_type='drought', severity_basis='dry_days=75')
    assert drought['severity'] == pytest.approx(round(min(400 / 90.0, 1.0), 4))
    assert dry['severity'] == pytest.approx(round(75 / 90.0, 4))
    assert 0.0 <= dry['severity'] <= 1.0


def test_an_unknown_basis_leaves_severity_null_rather_than_guessing():
    event = one(severity_basis='observed_by_a_person=1')
    assert event['severity'] is None
    assert event['severity_basis'] == 'observed_by_a_person=1'
    assert events.severity_from_basis(None, 'Flood') is None


# ── batch behaviour ─────────────────────────────────────────────────────────

def test_lenient_mode_collects_problems_and_strict_mode_refuses():
    raw = events.load_events(FIXTURES / 'events_mixed.json')
    lenient = events.normalize_events(raw, strict=False)
    assert len(lenient['events']) == 3               # clean + GAUL spelling + basis-less
    assert len(lenient['errors']) == 3               # unknown district, end<start, severity
    assert len(lenient['unmapped']) == 1             # landslide
    assert any('Jessore' not in e and 'Jashore' in e['adm2_name'] for e in lenient['events'])

    with pytest.raises(events.EventValidationError) as excinfo:
        events.normalize_events(raw, strict=True)
    message = str(excinfo.value)
    assert '3 invalid row(s) and 1 unmapped hazard label(s)' in message
    assert 'refusing to ingest a partial archive' in message


def test_duplicate_records_are_counted_not_double_ingested():
    row = {'hazard_type': 'flood', 'start_date': '2020-06-01', 'adm2_name': 'Sylhet',
           'source': 'news-archive', 'source_record_id': 'dup-1'}
    outcome = events.normalize_events([row, dict(row)])
    assert outcome['duplicates_dropped'] == 1
    assert len(outcome['events']) == 1


def test_an_empty_archive_is_ingestable_and_reports_zero():
    outcome = events.normalize_events(events.load_events(FIXTURES / 'events_empty.json'))
    summary = events.summarize(outcome['events'])
    assert summary['total'] == 0
    assert summary['date_range'] == [None, None]
    assert all(count == 0 for count in summary['by_hazard'].values())
    assert events.verify_claimed_count(summary)['drift'] == -2931


# ── counting: the audit trail ───────────────────────────────────────────────

def test_the_summary_counts_every_class_and_the_date_range():
    summary = events.summarize(sample_events()['events'])
    assert summary['total'] == 9
    assert summary['date_range'] == ['2009-07-01', '2023-04-25']
    assert summary['by_hazard']['Tropical Cyclone'] == 2
    assert summary['by_hazard']['Fire'] == 1
    assert summary['by_year']['2022'] == 2
    assert summary['by_district']['Sylhet'] == 1
    assert summary['with_severity'] == 8              # the Cox's Bazar fire has none
    assert summary['with_geometry'] == 0              # the fixture carries no polygons


def test_the_claim_check_reports_drift_inside_and_outside_tolerance():
    summary = {'total': 2931}
    exact = events.verify_claimed_count(summary)
    assert exact['drift'] == 0 and exact['within_tolerance'] is True
    assert 'ingested 2931 events against a claimed 2931' in exact['message']

    short = events.verify_claimed_count({'total': 2301})
    assert short['drift'] == -630
    assert short['within_tolerance'] is False
    assert 'MODEL_CARD.md §4' in short['message']

    tolerant = events.verify_claimed_count({'total': 2880}, tolerance=0.03)
    assert tolerant['within_tolerance'] is True


def test_the_district_year_matrix_matches_the_events():
    matrix = events.district_year_matrix(sample_events()['events'])
    assert matrix['Sylhet'] == {'2022': 1}
    assert matrix['Bhola'] if 'Bhola' in matrix else True
    assert sum(sum(years.values()) for years in matrix.values()) == 9


# ── the prior (w4) and its leakage guard ───────────────────────────────────

def test_the_prior_decays_with_age_and_saturates():
    events_list = sample_events()['events']
    recent = events.historical_prior_score(events_list, 'Sylhet', 'Flood', '2023-06-01')
    later = events.historical_prior_score(events_list, 'Sylhet', 'Flood', '2026-06-01')
    assert 0.0 < later < recent <= 1.0
    assert events.historical_prior_score([], 'Sylhet', 'Flood', '2026-06-01') == 0.0
    assert events.historical_prior_score(
        events_list, 'Sylhet', 'Drought', '2026-06-01') == 0.0


def test_an_event_never_scores_its_own_day_or_the_future():
    """Temporal leakage is one of the five project-killers; this is the guard."""
    events_list = sample_events()['events']
    day = '2022-06-15'
    on_the_day = events.historical_prior_score(events_list, 'Sylhet', 'Flood', day)
    day_before = events.historical_prior_score(events_list, 'Sylhet', 'Flood', '2022-06-14')
    day_after = events.historical_prior_score(events_list, 'Sylhet', 'Flood', '2022-06-16')
    assert on_the_day == day_before == 0.0     # strictly-before rule
    assert day_after > 0.0                     # the event counts from the next day


def test_the_window_query_selects_overlapping_events_only():
    events_list = sample_events()['events']
    window = events.events_in_window(events_list, '2022-06-16', '2022-06-30', district='Sylhet')
    assert [event['hazard_type'] for event in window] == ['Flood']
    assert events.events_in_window(events_list, '2022-06-16', '2022-06-30', district='Sylhet',
                                   hazard_type='Tropical Cyclone') == []
    assert len(events.events_in_window(events_list, '2020-05-01', '2020-05-31')) == 1


def test_default_window_covers_the_requested_number_of_days():
    from datetime import date
    start, end = events.default_window(30, today=date(2026, 9, 17))
    assert (start, end) == ('2026-08-18', '2026-09-17')


# ── the SQL the loader emits ────────────────────────────────────────────────
# `scripts/etl/db.py` writes SQL text rather than talking to a database, so the
# load script can be reviewed and re-run by an operator (and tested in CI). These
# tests check the statements themselves: escaping, batching, idempotency, the
# derived geometry, and the audit row that carries the drift.

import re  # noqa: E402
import db  # noqa: E402  (scripts/etl is on sys.path above)

MIGRATION = ROOT / 'scripts' / 'db' / '008_hazard_events_postgis.sql'
VERIFY = ROOT / 'scripts' / 'db' / 'verify_hazard_events.sql'


def script_for(rows, **overrides):
    options = dict(run_id='evt-ingest-test', source='archive',
                   summary={'rows_seen': len(rows), 'rows_ingested': len(rows), 'counts': {'total': len(rows)}},
                   started_at='2026-09-17T06:00:00Z', finished_at='2026-09-17T06:00:05Z',
                   status='ok')
    options.update(overrides)
    return db.build_script(events=rows, **options)


def test_sql_literals_are_escaped_and_typed():
    assert db.sql_literal(None) == 'NULL'
    assert db.sql_literal(True) == 'TRUE' and db.sql_literal(False) == 'FALSE'
    assert db.sql_literal(3) == '3' and db.sql_literal(0.5) == '0.5'
    assert db.sql_literal("O'Brien") == "'O''Brien'"
    assert db.sql_literal('x; drop table hazard_events') == "'x; drop table hazard_events'"
    assert db.sql_literal("a'b'c") == "'a''b''c'"


def test_the_insert_is_an_upsert_that_never_rewrites_an_event_s_identity():
    statement = db.events_insert_statement([one(source_record_id='row-1'), one(source_record_id='row-2')])
    assert statement.startswith('insert into public.hazard_events (')
    assert 'on conflict (event_id) do update set' in statement
    # Identity columns are not updated: a re-ingest corrects the facts, not the keys.
    assert 'source = excluded.source' not in statement
    assert 'source_record_id = excluded.source_record_id' not in statement
    assert statement.count("'news-archive'") == 2
    for column in db.INSERT_COLUMNS:
        assert column in statement


def split_sql_list(text):
    """Split a SQL value list on top-level commas (quoted commas are data)."""
    parts, current, in_string = [], [], False
    for char in text:
        if char == "'":
            in_string = not in_string
        if char == ',' and not in_string:
            parts.append(''.join(current).strip())
            current = []
        else:
            current.append(char)
    parts.append(''.join(current).strip())
    return parts


def test_every_insert_tuple_has_exactly_one_value_per_column():
    """The column list and each tuple must line up — Postgres rejects the statement
    otherwise, and the failure would only appear on a real database (no CI has one).
    This is the arity check that caught a missing `event_id` value."""
    events = [one(), one(source_record_id='row-2', notes="comma, and 'quote'")]
    statement = db.events_insert_statement(events)
    header = re.search(r'insert into public\.hazard_events \(\n\s*(.*?)\n\) values\n', statement, re.S)
    columns = [column.strip() for column in header.group(1).split(',')]
    tuples = re.findall(r'^\s{2}\((.*)\)(?:,|$)', statement.split('values\n', 1)[1], re.M)
    assert len(tuples) == len(events)
    for values in tuples:
        assert len(split_sql_list(values)) == len(columns)


def test_geometry_is_derived_from_the_adm3_layer_not_taken_from_the_source():
    event = one(geom_geojson={'type': 'Point', 'coordinates': [91.0, 25.0]})
    statement = db.events_insert_statement([event])
    assert 'update public.hazard_events e set geom =' in statement
    assert 'from public.adm3_boundaries a' in statement
    # The source's GeoJSON is stored as text for reference, but the map column is
    # the union of the district's upazilas — a bad polygon cannot corrupt the map.
    assert 'st_multi(st_union(a.geom))' in statement


def test_a_large_ingest_is_batched_and_every_row_lands_in_exactly_one_insert():
    rows = [one(source_record_id=f'row-{index}') for index in range(db.BATCH_SIZE + 1)]
    script = script_for(rows)
    assert script.count('insert into public.hazard_events') == 2
    for event in rows:
        assert script.count(event['event_id']) >= 1
    assert script.count('on conflict (event_id) do update set') == 2


def test_the_script_is_one_transaction_with_an_audit_row_and_a_view_refresh():
    rows = [one()]
    script = script_for(rows)
    assert script.startswith('-- HazardNet historical hazard-event ingest (generated)')
    assert '-- run_id: evt-ingest-test' in script
    assert 'set standard_conforming_strings = on;' in script
    assert script.index('begin;') < script.index('insert into public.hazard_events')
    assert script.rstrip().endswith('commit;')
    assert 'insert into public.hazard_event_ingest_runs' in script
    assert "'evt-ingest-test'" in script and "'archive'" in script
    assert 'refresh materialized view concurrently public.hazard_event_district_year;' in script
    assert 'refresh materialized view concurrently public.hazard_event_yearly_totals;' in script


def test_the_audit_row_carries_the_counts_and_the_drift_note():
    rows = [one(), one(source_record_id='row-2')]
    script = script_for(rows, notes='ingested 2 events against a claimed 2931 (-2929)',
                        summary={'rows_seen': 5, 'rows_ingested': 2, 'rows_rejected': 2,
                                 'rows_unmapped': 1, 'rows_duplicate': 1,
                                 'claimed_total': 2931, 'drift': -2929, 'counts': {'total': 2}})
    assert "'ingested 2 events against a claimed 2931 (-2929)'" in script
    assert 'on conflict (run_id) do update' in script
    for value in ('5', '2', '-2929'):
        assert f'  {value},' in script or f'  {value}\n' in script


def test_writing_the_script_creates_the_directory_and_keeps_the_bytes(tmp_path):
    script = script_for([one()])
    target = tmp_path / 'nested' / 'events.sql'
    assert db.write_script(script, target) == str(target)
    assert target.read_text(encoding='utf-8') == script


def test_a_live_load_without_a_driver_or_dsn_says_so():
    with pytest.raises(db.DatabaseUnavailable):
        db.connect(None)
    with pytest.raises(db.DatabaseUnavailable):
        db.connect('')


def test_an_empty_batch_is_refused_rather_than_emitting_empty_sql():
    with pytest.raises(ValueError):
        db.events_insert_statement([])


# ── the migration and its verification script ───────────────────────────────

def migration_text():
    return MIGRATION.read_text(encoding='utf-8')


def test_the_migration_seed_matches_the_district_module_row_for_row():
    """The database's validation snapshot and the loader's vocabulary are one list."""
    block = migration_text().split('insert into public.hazard_event_districts', 1)[1]
    block = block.split(';', 1)[0]
    rows = []
    for match in re.finditer(r"\('([^']*(?:''[^']*)*)',\s*'([^']*)',\s*'([^']*)'\)", block):
        name = match.group(1).replace("''", "'")
        rows.append((name, match.group(2), match.group(3)))
    from districts import DISTRICTS
    assert len(rows) == 64
    assert rows == list(DISTRICTS), 'the SQL seed and scripts/etl/districts.py have drifted'


def test_the_migration_enforces_the_contract_in_the_database_itself():
    sql = migration_text()
    assert 'check (hazard_type in (' in sql
    for hazard in physics_severity.HAZARD_CLASSES:
        assert f"'{hazard}'" in sql
    assert 'check (severity is null or (severity >= 0 and severity <= 1))' in sql
    assert 'check (end_date >= start_date)' in sql
    assert 'unique (source, source_record_id)' in sql
    assert 'duration_days     integer generated always as (end_date - start_date + 1) stored' in sql
    assert 'references public.hazard_event_districts (pcode)' in sql


def test_the_migration_never_seeds_an_event():
    """A fabricated history would enter a district's prior and never be visible again."""
    sql = migration_text()
    assert 'insert into public.hazard_events' not in sql
    assert 'raise notice' in sql and 'hazard_events is empty' in sql


def test_the_prior_function_excludes_the_day_it_scores():
    sql = migration_text()
    assert 'and start_date < p_as_of;' in sql          # strictly before: no leakage
    assert 'p_half_life' in sql and 'power(0.5::numeric' in sql
    assert 'create or replace function public.hazard_event_prior(' in sql


def test_the_migration_refuses_a_conflicting_pre_existing_table():
    sql = migration_text()
    assert "raise exception 'public.hazard_events exists but has no event_id column" in sql
    assert 'create table if not exists public.hazard_events' in sql   # idempotent re-run


def test_the_verification_script_is_read_only_and_checks_the_claim():
    sql = VERIFY.read_text(encoding='utf-8')
    for forbidden in ('insert into public.hazard_events', 'delete from', 'drop table', 'alter table'):
        assert forbidden not in sql.lower()
    assert 'PASS' in sql and 'WARN' in sql and 'FAIL' in sql
    assert '2931' in sql            # the claim it measures, not asserts
