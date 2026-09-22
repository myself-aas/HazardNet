"""The daily Kaggle pull is a shape bridge — these tests are its refusals.

`scripts/fetch_kaggle_forecast.py` replaced the runner-native generator on
2026-09-20: the Kaggle notebook produces an *advisory* table
(`district`, `hazard`, `cnn_severity`, `final_severity`, `advisory_tier`, Celsius and
km/h drivers), and the repository's committed artifact, its validator, its ingest path
and its website snapshot all expect the *canonical* row
(`district_id`, `pcode`, `hazard_type`, `model_severity`, `prediction_date`, an
Open-Meteo SI block). Bridging those two is the whole job, and the failure modes that
matter are not "the mapping is wrong" but "the mapping guessed":

* a second CSV in the kernel output silently becoming the day's forecast;
* a district the notebook renamed being matched by fuzzy name and given someone else's
  pcode;
* a measurement the notebook never fetched arriving as `0.0`, which reads as "0 kelvin"
  or "a sunless day" instead of "not measured";
* an identity table that erodes — one short day dropping districts that can never come
  back, because the table is read from the file the script is about to overwrite;
* `prediction_date` being invented instead of derived from `target_date − horizon`.

Everything here runs offline against CSVs written into `tmp_path`: no Kaggle CLI, no
network, no committed artifact mutated.
"""

import csv
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import fetch_kaggle_forecast as fkf  # noqa: E402
import validate_forecasts as vf  # noqa: E402

ADVISORY_HEADER = (
    'district', 'division', 'horizon', 'hazard', 'confidence', 'cnn_severity',
    'physics_severity', 'final_severity', 'advisory_tier', 'target_date',
    'om_max_temp_c', 'om_min_temp_c', 'om_precip_mm', 'om_wind_kmh',
)

IDENTITY_HEADER = ('district_id', 'district_name', 'division', 'pcode')


def write_csv(path: Path, header, rows) -> Path:
    with path.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\n')
        writer.writerow(header)
        writer.writerows(rows)
    return path


def advisory_row(**overrides):
    row = {
        'district': 'Cumilla', 'division': 'Chattogram', 'horizon': '7_days',
        'hazard': 'Flash Flood', 'confidence': '0.82', 'cnn_severity': '0.61',
        'physics_severity': '0.44', 'final_severity': '0.55', 'advisory_tier': 'WATCH',
        'target_date': '2026-09-26', 'om_max_temp_c': '32.5', 'om_min_temp_c': '25.1',
        'om_precip_mm': '18.4', 'om_wind_kmh': '11.5',
    }
    row.update(overrides)
    return [row[column] for column in ADVISORY_HEADER]


def identity_csv(path: Path, rows=None) -> Path:
    rows = rows if rows is not None else [
        ('12', 'Cumilla', 'Chattogram', 'BD012'),
        ('33', 'Khulna', 'Khulna', 'BD033'),
    ]
    return write_csv(path, IDENTITY_HEADER, rows)


# ── the producer is named, not guessed ────────────────────────────────────────


def test_detect_shape_names_the_producer():
    assert fkf.detect_shape(set(fkf.CANONICAL_COLUMNS)) == 'canonical'
    assert fkf.detect_shape(set(ADVISORY_HEADER)) == 'advisory'


def test_an_unrecognised_table_is_unknown_rather_than_canonical():
    """The refusal is the point: publishing somebody else's CSV as the day's forecast
    is worse than a red run."""
    assert fkf.detect_shape({'district', 'hazard'}) == 'unknown'
    assert fkf.detect_shape({'whatever', 'columns'}) == 'unknown'


def test_choose_csv_prefers_the_canonical_name(tmp_path):
    write_csv(tmp_path / 'hazardnet_advisories_latest.csv', ADVISORY_HEADER, [advisory_row()])
    canonical = write_csv(
        tmp_path / 'hazardnet_forecasts_latest.csv', fkf.CANONICAL_COLUMNS, [],
    )
    chosen, found = fkf.choose_csv(tmp_path)
    assert chosen == canonical and found == ['hazardnet_forecasts_latest.csv']


def test_choose_csv_falls_back_to_the_advisory_name(tmp_path):
    advisory = write_csv(
        tmp_path / 'hazardnet_advisories_latest.csv', ADVISORY_HEADER, [advisory_row()],
    )
    chosen, _ = fkf.choose_csv(tmp_path)
    assert chosen == advisory


def test_a_lone_unnamed_csv_is_still_published(tmp_path):
    only = write_csv(tmp_path / 'todays_output.csv', ADVISORY_HEADER, [advisory_row()])
    chosen, found = fkf.choose_csv(tmp_path)
    assert chosen == only and found == ['todays_output.csv']


def test_two_unnamed_csvs_are_refused(tmp_path):
    """Glob order decided the day's forecast once; it must not again."""
    write_csv(tmp_path / 'a_debug_dump.csv', ADVISORY_HEADER, [advisory_row()])
    write_csv(tmp_path / 'b_real_output.csv', ADVISORY_HEADER, [advisory_row()])
    chosen, found = fkf.choose_csv(tmp_path)
    assert chosen is None
    assert sorted(found) == ['a_debug_dump.csv', 'b_real_output.csv']


def test_no_csv_at_all_is_refused(tmp_path):
    chosen, found = fkf.choose_csv(tmp_path)
    assert chosen is None and found == []


# ── the district identity table ───────────────────────────────────────────────


def test_the_identity_table_comes_from_a_published_artifact(tmp_path):
    table, problems = fkf.load_identity(identity_csv(tmp_path / 'identity.csv'))
    assert not problems
    assert table['Cumilla'] == {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}


def test_the_known_spelling_drifts_resolve(tmp_path):
    """The producer writes FAO GAUL 2015 ("Comilla", "Chittagong", "Jessore"); the site
    and the event store use the current spellings ("Cumilla", "Chattogram", "Jashore").
    A drift that silently drops a district is indistinguishable from a district with no
    hazard, so the lookup goes through the resolver `scripts/etl/districts.py` already
    tests against the frontend's alias table.
    """
    table, problems = fkf.load_identity(identity_csv(
        tmp_path / 'identity.csv',
        [('12', 'Comilla', 'Chittagong', '5773'), ('22', 'Jessore', 'Khulna', '5797')],
    ))
    assert not problems
    # The artifact's own spelling resolves to itself…
    assert fkf.lookup_identity('Comilla', table)['district_id'] == '12'
    # …and the current spelling finds the same record through the snapshot's resolver.
    assert fkf.lookup_identity('Cumilla', table)['district_id'] == '12'
    assert fkf.lookup_identity('Jashore', table)['pcode'] == '5797'
    # The alias entry is a marked copy, so the two spellings never look like two districts.
    assert table['Cumilla']['alias_of'] == 'Comilla'


def test_a_punctuation_drift_still_resolves(tmp_path):
    """GAUL/BBS also renders Khagrachhari "Khagrachari"; the normalized pass catches what
    the resolver's alias table does not."""
    table, _ = fkf.load_identity(identity_csv(
        tmp_path / 'identity.csv', [('26', 'Khagrachhari', 'Chittagong', '5774')],
    ))
    assert fkf.lookup_identity('khagrachari', table) is not None or \
        fkf.lookup_identity('Khagrachari', table) is not None


def test_an_unknown_district_still_resolves_to_nothing(tmp_path):
    table, _ = fkf.load_identity(identity_csv(tmp_path / 'identity.csv'))
    assert fkf.lookup_identity('Nowhere', table) is None
    assert fkf.lookup_identity('', table) is None


# ── coverage is not capped by the previous producer's failures ────────────────


def test_a_short_artifact_is_completed_from_the_64_district_snapshot():
    """The committed artifact carried 60 of the 64 districts on 2026-09-19, because the
    runner-side generator had dropped four. Translating a faithful 64-row Kaggle pull
    against that table would have published 60 forever: coverage capped by an unrelated
    failure, with the gap reported as "unmatchable" rather than as a hole."""
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    path = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'
    if not path.is_file():
        pytest.skip(f'{path} is not committed in this checkout')

    table, problems = fkf.load_identity(path)
    assert not problems
    short_by = [name for name in reference.NAMES if reference.resolve(name) not in
                {reference.resolve(key) for key in table}]
    added, extension_problems = fkf.extend_identity_with_reference(table)
    assert not extension_problems
    assert sorted(added) == sorted(short_by)
    assert not [name for name in reference.NAMES
                if reference.resolve(name) not in {reference.resolve(k) for k in table}], (
        'after the extension some district is still unresolvable'
    )
    for name in added:
        record = table[name]
        assert record['district_id'].isdigit(), f'{name} got a non-numeric id'
        assert record['pcode'] and record['division'], f'{name} got no pcode/division'


def test_derived_ids_reproduce_every_published_id():
    """The derivation is a rule, not a guess, and the rule is checked before it is used:
    both producers number districts by position in the sorted GAUL vocabulary."""
    reference = fkf.reference_districts()
    path = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'
    if reference is None or not path.is_file():
        pytest.skip('the snapshot or the committed artifact is not available here')
    table, _ = fkf.load_identity(path)
    published = {name: record['district_id'] for name, record in table.items()
                 if 'alias_of' not in record}
    added, problems = fkf.extend_identity_with_reference(table)
    assert not problems
    vocabulary = sorted(set(published) | set(added))
    assert len(vocabulary) == len(reference.NAMES)
    for index, name in enumerate(vocabulary, start=1):
        if name in published:
            assert published[name] == str(index), (
                f'{name} is published as {published[name]} but sits at position {index}'
            )
        else:
            assert table[name]['district_id'] == str(index)


def test_the_derivation_is_refused_when_it_contradicts_the_artifact(tmp_path):
    """An artifact whose ids do not follow the rule must not have four more ids invented
    on top of it — that is how two districts end up sharing one."""
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    # All but one district, and one of those renumbered: there is an id to derive and a
    # published id that contradicts the rule.
    vocabulary = sorted(reference.NAMES)
    rows = []
    for index, name in enumerate(vocabulary, start=1):
        if name == 'Bandarban':
            continue                      # the district the extension would have to add
        rows.append((str(999 if name == 'Kurigram' else index), name,
                     reference.division_of(name) or '', reference.pcode_of(name) or ''))
    table, problems = fkf.load_identity(identity_csv(tmp_path / 'identity.csv', rows))
    assert not problems
    added, extension_problems = fkf.extend_identity_with_reference(table)
    assert added == []
    assert extension_problems and 'does not reproduce' in extension_problems[0]


def test_a_complete_artifact_needs_no_extension(tmp_path):
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    rows = [(str(index), name, reference.division_of(name) or '', reference.pcode_of(name) or '')
            for index, name in enumerate(sorted(reference.NAMES), start=1)]
    table, problems = fkf.load_identity(identity_csv(tmp_path / 'identity.csv', rows))
    assert not problems
    added, extension_problems = fkf.extend_identity_with_reference(table)
    assert added == [] and not extension_problems


def test_a_table_without_identifiers_is_refused(tmp_path):
    path = write_csv(tmp_path / 'identity.csv', ('district_name', 'division'), [('Cumilla', 'Chattogram')])
    table, problems = fkf.load_identity(path)
    assert table == {}
    assert problems and 'district_name/district_id/pcode' in problems[0]


def test_a_missing_table_is_a_problem_not_an_exception(tmp_path):
    table, problems = fkf.load_identity(tmp_path / 'absent.csv')
    assert table == {} and problems


def test_identity_from_head_is_best_effort(tmp_path):
    """No git, no HEAD copy, or a path that was never committed all yield an empty
    floor — the working copy still carries the identity."""
    assert fkf.identity_from_head('backend/data/forecasts/never_committed_anywhere.csv') == {}


# ── prediction_date is derived, never invented ────────────────────────────────


def test_the_prediction_date_is_the_target_minus_the_horizon():
    stamp, problems = fkf.derive_prediction_date([
        {'horizon': '7_days', 'target_date': '2026-09-26'},
        {'horizon': '15_days', 'target_date': '2026-10-04'},
    ])
    assert stamp == '2026-09-19' and not problems


def test_rows_that_disagree_about_their_run_date_are_refused():
    stamp, problems = fkf.derive_prediction_date([
        {'horizon': '7_days', 'target_date': '2026-09-26'},
        {'horizon': '7_days', 'target_date': '2026-09-27'},
    ])
    assert stamp is None and problems and 'disagree' in problems[0]


def test_an_unknown_horizon_is_a_problem_not_a_guess():
    stamp, problems = fkf.derive_prediction_date([{'horizon': '10_days', 'target_date': '2026-09-26'}])
    assert stamp is None and problems


def test_a_missing_horizon_is_reported_rather_than_defaulted():
    stamp, problems = fkf.derive_prediction_date([{'horizon': '', 'target_date': ''}])
    assert stamp is None and problems


# ── the translation itself ────────────────────────────────────────────────────


def test_translation_supplies_the_identity_the_notebook_does_not_know():
    """The advisory table has no district_id and no pcode; the canonical artifact needs
    both, and they come from a published artifact rather than from a guess."""
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, problems, _summary = fkf.translate_advisory(
        [dict(zip(ADVISORY_HEADER, advisory_row()))], table, '2026-09-19',
    )
    assert not problems and len(rows) == 1
    row = rows[0]
    assert row['district_id'] == '12' and row['pcode'] == 'BD012'
    assert row['hazard_type'] == 'Flash Flood'
    assert row['model_severity'] == '0.61'
    assert row['prediction_date'] == '2026-09-19'
    assert row['data_source'] == fkf.DATA_SOURCE
    assert set(row) == set(fkf.CANONICAL_COLUMNS)



def test_translation_converts_units_and_leaves_unfetched_measurements_empty():
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, problems, _summary = fkf.translate_advisory(
        [dict(zip(ADVISORY_HEADER, advisory_row()))], table, '2026-09-19',
    )
    assert not problems
    row = rows[0]
    # 32.5 °C -> 305.65 K, 25.1 °C -> 298.25 K, 18.4 mm -> 0.0184 m, 11.5 km/h -> 3.194 m/s.
    assert float(row['om_max_temp_k']) == pytest.approx(305.65, abs=1e-3)
    assert float(row['om_min_temp_k']) == pytest.approx(298.25, abs=1e-3)
    assert float(row['om_precip_m']) == pytest.approx(0.0184, abs=1e-6)
    assert float(row['om_wind_max_ms']) == pytest.approx(3.194, abs=1e-3)
    # The notebook never fetches these; an honest empty beats a plausible number.
    for absent in ('om_dewpoint_k', 'om_solar_rad_j', 'om_et_sum_m', 'dewpoint_mean',
                   'solar_radiation_mj_m2', 'evapotranspiration_mm'):
        assert row[absent] == '', f'{absent} was invented: {row[absent]!r}'



def test_a_district_outside_the_identity_table_is_dropped_and_reported():
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, problems, summary = fkf.translate_advisory(
        [
            dict(zip(ADVISORY_HEADER, advisory_row())),
            dict(zip(ADVISORY_HEADER, advisory_row(district='Nowhere'))),
        ],
        table, '2026-09-19',
    )
    assert len(rows) == 1
    assert summary['unmatched_districts'] == ['Nowhere'] and summary['unmatched_rows'] == 1
    assert any('Nowhere' in problem for problem in problems)


def test_a_hazard_outside_the_model_classes_is_dropped_and_reported():
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, problems, _ = fkf.translate_advisory(
        [dict(zip(ADVISORY_HEADER, advisory_row(hazard='Tsunami')))], table, '2026-09-19',
    )
    assert rows == [] and any('Tsunami' in problem for problem in problems)


def test_the_notebooks_own_tiers_are_summarised_not_published_as_columns():
    """`advisory_tier` and `final_severity` are the notebook's editorial layer. The
    committed artifact has no column for them, and inventing one would put an
    unvalidated severity blend into the website's data path."""
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, _, summary = fkf.translate_advisory(
        [
            dict(zip(ADVISORY_HEADER, advisory_row(advisory_tier='WARNING', final_severity='0.9'))),
            dict(zip(ADVISORY_HEADER, advisory_row(hazard='Heat Wave', advisory_tier='WATCH'))),
        ],
        table, '2026-09-19',
    )
    assert summary['advisory_tiers'] == {'WARNING': 1, 'WATCH': 1}
    assert summary['max_final_severity'] == pytest.approx(0.9)
    for row in rows:
        assert 'advisory_tier' not in row and 'final_severity' not in row


def test_a_non_numeric_driver_is_a_problem_not_a_silent_zero():
    table = {'Cumilla': {'district_id': '12', 'pcode': 'BD012', 'division': 'Chattogram'}}
    rows, problems, _ = fkf.translate_advisory(
        [dict(zip(ADVISORY_HEADER, advisory_row(om_precip_mm='n/a')))], table, '2026-09-19',
    )
    assert any('om_precip_mm' in problem for problem in problems)


# ── the JSON sidecar types its numbers ────────────────────────────────────────


def canonical_row(**overrides):
    """A canonical row built by column name, so no test depends on column order."""
    row = {column: '' for column in fkf.CANONICAL_COLUMNS}
    row.update(overrides)
    return [row[column] for column in fkf.CANONICAL_COLUMNS]


def test_the_sidecar_types_numbers_booleans_and_nulls(tmp_path):
    path = write_csv(tmp_path / 'forecast.csv', fkf.CANONICAL_COLUMNS, [canonical_row(
        district_id='12', district_name='Cumilla', division='Chattogram', pcode='BD012',
        horizon='7_days', hazard_type='Flash Flood', model_severity='0.61',
        confidence='0.82', target_date='2026-09-26', prediction_date='2026-09-19',
        temperature_max='32.5',
    )])
    records = fkf.convert_csv_to_json_records(path)
    assert len(records) == 1
    record = records[0]
    assert record['district_id'] == 12
    assert record['model_severity'] == pytest.approx(0.61)
    assert record['temperature_max'] == pytest.approx(32.5)
    assert record['district_name'] == 'Cumilla'


def test_an_absent_measurement_is_null_never_zero(tmp_path):
    """`om_dewpoint_k: 0.0` reads as 0 kelvin and `solar_radiation_mj_m2: 0.0` as a
    sunless day. The advisory producer genuinely does not fetch either."""
    path = write_csv(tmp_path / 'forecast.csv', fkf.CANONICAL_COLUMNS, [canonical_row(
        district_id='12', district_name='Cumilla', division='Chattogram', pcode='BD012',
        horizon='7_days', hazard_type='Flood', model_severity='0.4',
        target_date='2026-09-26', prediction_date='2026-09-19',
    )])
    record = fkf.convert_csv_to_json_records(path)[0]
    for absent in ('om_dewpoint_k', 'om_solar_rad_j', 'om_et_sum_m', 'temperature_mean',
                   'precipitation_mm', 'wind_max_kmh', 'physics_severity', 'confidence'):
        assert record[absent] is None, f'{absent} became {record[absent]!r} instead of null'


# ── the pre-publish sanity gate ───────────────────────────────────────────────


def test_sanity_check_refuses_an_empty_csv(tmp_path):
    path = write_csv(tmp_path / 'empty.csv', fkf.CANONICAL_COLUMNS, [])
    ok, message = fkf.sanity_check(path)
    assert not ok and 'zero rows' in message


def test_sanity_check_refuses_a_table_with_no_severity(tmp_path):
    path = write_csv(tmp_path / 'nosev.csv', ('district_id', 'hazard_type'), [('12', 'Flood')])
    ok, message = fkf.sanity_check(path)
    assert not ok and 'severity' in message.lower()


def test_sanity_check_refuses_a_hazard_outside_the_model_classes(tmp_path):
    path = write_csv(tmp_path / 'bad.csv', fkf.CANONICAL_COLUMNS, [canonical_row(
        district_id='12', model_severity='0.5', hazard_type='Tsunami',
    )])
    ok, message = fkf.sanity_check(path)
    assert not ok and 'Tsunami' in message


def test_sanity_check_passes_a_canonical_row(tmp_path):
    path = write_csv(tmp_path / 'good.csv', fkf.CANONICAL_COLUMNS, [canonical_row(
        district_id='12', model_severity='0.5', hazard_type='Flood',
    )])
    ok, message = fkf.sanity_check(path)
    assert ok and '1 rows' in message


# ── the bridge and its consumers agree ────────────────────────────────────────


def test_the_canonical_shape_covers_every_column_the_validator_requires():
    """If this fails, the pull can succeed and `validate_forecasts.py` can still reject
    the artifact — a red run whose cause is a schema, not the data."""
    missing = vf.NOTEBOOK_REQUIRED - set(fkf.CANONICAL_COLUMNS)
    assert not missing, f'the canonical row is missing required columns: {sorted(missing)}'


def test_the_committed_artifact_is_unix_terminated_and_canonical():
    """The pull rewrites this file daily; a CRLF regression would show up as a whole-file
    diff every morning and bury the rows that actually changed."""
    path = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'
    if not path.is_file():
        pytest.skip(f'{path} is not committed in this checkout')
    raw = path.read_bytes()
    assert b'\r\n' not in raw, 'the committed forecast CSV carries CRLF line endings'
    with path.open('r', encoding='utf-8') as handle:
        fields = set(csv.DictReader(handle).fieldnames or ())
    assert fields == set(fkf.CANONICAL_COLUMNS), (
        f'the committed CSV and CANONICAL_COLUMNS disagree: '
        f'only-in-file={sorted(fields - set(fkf.CANONICAL_COLUMNS))} '
        f'only-in-code={sorted(set(fkf.CANONICAL_COLUMNS) - fields)}'
    )


# ── the run summary a human reads ─────────────────────────────────────────────


def test_the_summary_names_the_shape_the_rows_and_the_dropped_districts():
    text = fkf.markdown_summary({
        'kernel': 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline',
        'source_file': 'hazardnet_advisories_latest.csv',
        'shape': 'advisory',
        'row_count': 3,
        'district_count': 2,
        'prediction_date': '2026-09-19',
        'fetched_at': '2026-09-20T00:04:11Z',
        'changed': True,
        'advisory': {
            'advisory_tiers': {'WATCH': 2, 'WARNING': 1},
            'max_final_severity': 0.9,
            'unmatched_districts': ['Nowhere'],
            'unmatched_rows': 1,
        },
    })
    assert 'advisory' in text and 'translated' in text
    assert '3 across 2 districts' in text
    assert '2026-09-19' in text and 'target_date − horizon' in text
    assert 'Nowhere' in text and '::warning::' in text
    assert 'WATCH: 2' in text


def test_the_summary_says_when_nothing_changed():
    text = fkf.markdown_summary({
        'kernel': 'k', 'source_file': 'hazardnet_forecasts_latest.csv', 'shape': 'canonical',
        'row_count': 74, 'district_count': 60, 'prediction_date': '2026-09-19',
        'fetched_at': '2026-09-20T00:04:11Z', 'changed': False,
    })
    assert '**False**' in text
    assert 'translated' not in text, 'a canonical passthrough must not claim a translation'

# ── the coverage tally the validator's gate reads ─────────────────────────────


def advisory_records(names, horizons=('7_days', '15_days')):
    return [{'district_name': name, 'horizon': horizon}
            for name in names for horizon in horizons]


def test_a_full_pull_is_complete(tmp_path):
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    names = list(reference.NAMES)
    records = advisory_records(names)
    coverage = fkf.coverage_tally(records, records, sorted(set(names)))
    assert coverage['status'] == 'complete'
    assert coverage['requested_units'] == coverage['produced_units'] == len(names) * 2
    assert coverage['missing_districts'] == []
    assert coverage['per_horizon']['7_days'] == {'requested': len(names), 'produced': len(names)}


def test_a_short_pull_is_partial_and_names_the_districts(tmp_path):
    """The notebook skips a district whose Earth Engine fetch or Open-Meteo call failed,
    and nothing in its CSV says so — the row is simply absent. This is the gate that
    makes the absence visible: the runner-side generator's 25-of-64 day went unnoticed
    for exactly this reason (audit 2026-09-17)."""
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    dropped = list(reference.NAMES[:4])
    names = [name for name in reference.NAMES if name not in dropped]
    records = advisory_records(names)
    coverage = fkf.coverage_tally(records, records, sorted(set(names)))
    assert coverage['status'] == 'partial'
    assert coverage['produced_units'] == len(names) * 2
    assert coverage['requested_units'] == len(reference.NAMES) * 2
    assert coverage['missing_districts'] == sorted(dropped)
    assert coverage['districts_with_any_horizon'] == len(names)


def test_a_renamed_district_is_not_reported_missing():
    """The producer writes FAO GAUL spellings; the vocabulary is written in the current
    ones. Comparing by string would report seven districts missing every single day."""
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    gaul = ['Chittagong', 'Comilla', 'Jessore', 'Maulvibazar', 'Netrakona', 'Nawabganj',
            'Brahamanbaria']
    names = [n for n in reference.NAMES if reference.resolve(n) not in
             {reference.resolve(g) for g in gaul}] + gaul
    records = advisory_records(names)
    coverage = fkf.coverage_tally(records, records, sorted(set(names)))
    assert coverage['missing_districts'] == [], coverage['missing_districts']
    assert coverage['status'] == 'complete'


def test_one_horizon_missing_is_partial_even_with_every_district():
    reference = fkf.reference_districts()
    if reference is None:
        pytest.skip('scripts/etl/districts.py is not importable here')
    names = list(reference.NAMES)
    source = advisory_records(names)                       # the producer asked for two
    published = advisory_records(names, horizons=('7_days',))   # one horizon survived
    coverage = fkf.coverage_tally(source, published, sorted(set(names)))
    assert coverage['status'] == 'partial'
    assert coverage['per_horizon'] == {
        '7_days': {'requested': len(names), 'produced': len(names)},
        '15_days': {'requested': len(names), 'produced': 0},
    }


# ── model provenance, labelled as what it is ──────────────────────────────────


def test_model_provenance_records_the_promoted_version_and_says_it_is_unverified(tmp_path):
    """The notebook loads its TFLite from a Kaggle output, not from this repository, so a
    pull cannot attest to the bytes that ran. It records the version the repository
    promotes and says plainly that the bytes were not verified — a field that claims
    provenance it does not have is worse than one that admits the limit."""
    models = tmp_path / 'Models'
    models.mkdir()
    (models / 'VERSION.json').write_text(json.dumps({
        'generatedAt': '2026-09-19T19:39:21.731Z',
        'artifacts': [{'name': 'hazardnet_fp32.tflite', 'bytes': 10, 'sha256': 'a' * 64}],
        'version': '2.1.9+model.0bb5bdaf1789',
    }), encoding='utf-8')
    provenance = fkf.model_provenance(tmp_path)
    assert provenance['model_version'] == '2.1.9+model.0bb5bdaf1789'
    assert provenance['model_sha256'] == 'a' * 64
    assert provenance['model_bytes_verified'] is False
    assert 'hazardnet-model-conversion' in provenance['model_note']
    assert provenance['model_version_source']


def test_model_provenance_survives_a_missing_handshake(tmp_path):
    provenance = fkf.model_provenance(tmp_path)
    assert provenance['model_version'] is None
    assert provenance['model_bytes_verified'] is False


def test_the_committed_artifact_paths_are_repo_relative(tmp_path):
    inside = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'
    assert fkf.repo_relative(inside, ROOT) == 'backend/data/forecasts/hazardnet_forecasts_latest.csv'
    outside = tmp_path / 'elsewhere.csv'
    assert fkf.repo_relative(outside, ROOT) == str(outside)


def test_the_summary_reports_coverage_and_names_the_gaps():
    text = fkf.markdown_summary({
        'kernel': 'k', 'source_file': 'hazardnet_advisories_latest.csv', 'shape': 'advisory',
        'row_count': 120, 'district_count': 60, 'prediction_date': '2026-09-19',
        'fetched_at': '2026-09-20T00:04:11Z', 'changed': True,
        'coverage': {
            'status': 'partial', 'requested_districts': 64, 'requested_units': 128,
            'produced_units': 120, 'districts_with_any_horizon': 60,
            'per_horizon': {}, 'missing_districts': ['Bandarban', 'Barisal'],
            'district_vocabulary': 'scripts/etl/districts.py (64)',
        },
    })
    assert '**partial**' in text and '120 of 128' in text
    assert 'Bandarban' in text and '::warning::' in text
