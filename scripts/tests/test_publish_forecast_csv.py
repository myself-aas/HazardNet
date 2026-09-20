"""publish_forecast_csv.py — the Kaggle-free promotion step of the pipeline.

`.github/workflows/daily_forecast.yml` generates the CSV on the runner
(`scripts/auto_forecast.py`), then runs this script to turn it into the
committed artifacts. These tests run the real script (and, when node is
available, the real snapshot builder) against a fixture CSV, so a schema drift
between the generator, the promoter and the website snapshot fails here instead
of in production.
"""

import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PUBLISH = ROOT / 'scripts' / 'publish_forecast_csv.py'
VALIDATE = ROOT / 'scripts' / 'validate_forecasts.py'
SNAPSHOT = ROOT / 'scripts' / 'build_forecast_snapshot.mjs'

sys.path.insert(0, str(ROOT / 'scripts' / 'tests'))
from make_fixture_csv import notebook_rows  # noqa: E402

SOURCE = 'github-actions: scripts/auto_forecast.py (GEE + Open-Meteo + TFLite)'


def _write_fixture_csv(path, rows=None, columns=None):
    columns, rows = notebook_rows('2026-09-15') if rows is None else (columns, rows)
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return path


def write_scene_manifest(tmp_path, rows, *, name='hazardnet_scene_manifest.json',
                         dataset_version='ds-run.0011223344556677'):
    """Stand-in for the manifest scripts/auto_forecast.py writes.

    Only the fields the publish/validate gates read are populated; the real
    manifest (scripts/etl/scene_manifest.py) carries the full per-step lineage and
    its own schema tests (scripts/tests/test_etl_sources_cog.py).
    """
    stamped = [row for row in rows if str(row.get('dataset_version') or '').strip()]
    manifest = {
        'schema': 'hazardnet-scene-manifest/v1',
        'prediction_date': rows[0].get('prediction_date') if rows else None,
        'pipeline_version': 'auto_forecast/2.0.0',
        'model_version': '2.1.9+model.testfixture',
        'run_id': '20260917T000000Z-testtest',
        'dataset_version': dataset_version,
        'scenes_enumerated': False,
        'units': [
            {
                'district_id': row.get('district_id'),
                'district_name': row.get('district_name'),
                'horizon': row.get('horizon'),
                'dataset_version': row.get('dataset_version'),
            }
            for row in stamped
        ],
    }
    path = tmp_path / name
    path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return path


def write_run_report(tmp_path, rows=None, *, produced=None, status=None, name='hazardnet_run_report.json',
                     soil=True, scene_error=None, with_scene=True):
    """A run report of the shape scripts/auto_forecast.py writes.

    The publisher refuses to publish without one: the coverage tally it carries
    is what stops a partial run from shipping as if it were complete, and the
    scene-manifest block is what stops a run whose inputs cannot be named.
    """
    rows = rows if rows is not None else notebook_rows('2026-09-15')[1]
    produced = len(rows) if produced is None else produced
    horizons = sorted({r.get('horizon') for r in rows if r.get('horizon')}) or ['7_days', '15_days']
    districts = {r.get('district_name') for r in rows if r.get('district_name')}
    resolved = status or ('complete' if produced == len(rows) else 'partial')
    report = {
        'schema': 'hazardnet-run-report/v1',
        'run_id': '20260917T000000Z-testtest',
        'pipeline_version': 'auto_forecast/2.0.0',
        'model_version': '2.1.9+model.testfixture',
        'model_sha256': 'b' * 64,
        'status': resolved,
        'soil_channels_fabricated': soil,
        'soil_mode': 'mean',
        'coverage': {
            'requested_units': 128,
            'requested_districts': 64,
            'requested_horizons': horizons,
            'produced_units': produced,
            'districts_with_any_horizon': len(districts),
            'per_horizon': {h: {'requested': 64, 'produced': 64} for h in horizons},
            'skipped': [],
            'status': resolved,
        },
    }
    if with_scene:
        scene_path = write_scene_manifest(tmp_path, rows)
        stamped = sum(1 for row in rows if str(row.get('dataset_version') or '').strip())
        report['scene_manifest'] = {
            'path': str(scene_path),
            'units': stamped,
            'rows_stamped': stamped,
            'dataset_version': 'ds-run.0011223344556677',
            'sha256': 'c' * 64,
            'scenes_enumerated': False,
            'units_with_defaulted_drivers': 0,
            'error': scene_error,
        }
    path = tmp_path / name
    path.write_text(json.dumps(report), encoding='utf-8')
    return path


def _publish(tmp_path, csv_path, *extra):
    report = tmp_path / 'hazardnet_run_report.json'
    if not report.exists():
        write_run_report(tmp_path)
    return subprocess.run(
        [sys.executable, str(PUBLISH),
         '--csv', str(csv_path),
         '--csv-out', str(tmp_path / 'out.csv'),
         '--json-out', str(tmp_path / 'out.json'),
         '--manifest', str(tmp_path / 'manifest.json'),
         '--run-report', str(report),
         '--source', SOURCE,
         *extra],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )


def test_publishes_csv_json_and_manifest(tmp_path):
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    result = _publish(tmp_path, src)

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'CHANGED=true' in result.stdout

    manifest = json.loads((tmp_path / 'manifest.json').read_text())
    assert manifest['source'] == SOURCE
    assert manifest['row_count'] == 128
    assert manifest['prediction_date'] == '2026-09-15'
    assert manifest['csv_sha256'] == hashlib.sha256(src.read_bytes()).hexdigest()

    # Coverage + provenance travel with the artifacts (audit 2026-09-17): the
    # site and the API state how complete the run was and which model made it,
    # instead of implying that whatever rows exist are the whole country.
    assert manifest['coverage_status'] == 'complete'
    assert manifest['coverage']['requested_units'] == 128
    assert manifest['coverage']['produced_units'] == 128
    assert manifest['coverage']['districts_with_any_horizon'] == 64
    assert manifest['run_id'] == '20260917T000000Z-testtest'
    assert manifest['model_version'] == '2.1.9+model.testfixture'
    assert manifest['model_sha256'] == 'b' * 64
    assert manifest['pipeline_version'] == 'auto_forecast/2.0.0'
    assert manifest['soil_channels_fabricated'] is True

    records = json.loads((tmp_path / 'out.json').read_text())
    assert len(records) == 128
    # Types the store/ingest expect: identifiers and severities are numeric.
    assert isinstance(records[0]['district_id'], int)
    assert isinstance(records[0]['model_severity'], float)
    assert (tmp_path / 'out.csv').read_bytes() == src.read_bytes()


def test_second_run_is_idempotent(tmp_path):
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    assert _publish(tmp_path, src).returncode == 0

    second = _publish(tmp_path, src)
    assert second.returncode == 0
    assert 'CHANGED=false' in second.stdout


def test_force_republishes_identical_csv(tmp_path):
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    assert _publish(tmp_path, src).returncode == 0
    forced = _publish(tmp_path, src, '--force')
    assert forced.returncode == 0
    assert 'CHANGED=false' in forced.stdout  # unchanged data, rewritten anyway


def test_rejects_invalid_hazard_and_writes_nothing(tmp_path):
    columns, rows = notebook_rows('2026-09-15')
    rows[0]['hazard_type'] = 'Volcano'
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv', rows, columns)

    result = _publish(tmp_path, src)
    assert result.returncode == 1
    assert 'sanity check failed' in result.stdout
    assert not (tmp_path / 'manifest.json').exists()
    assert not (tmp_path / 'out.csv').exists()


def test_missing_csv_points_at_the_generator(tmp_path):
    result = _publish(tmp_path, tmp_path / 'nope.csv')
    assert result.returncode == 1
    assert 'auto_forecast.py' in result.stdout


def test_published_artifacts_pass_the_pipeline_validator(tmp_path):
    """The promoter output must satisfy the same validator the workflows run —
    otherwise the daily job would go red one step after generating the data."""
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    assert _publish(tmp_path, src).returncode == 0

    result = subprocess.run(
        [sys.executable, str(VALIDATE),
         '--csv', str(tmp_path / 'out.csv'),
         '--json', str(tmp_path / 'out.json'),
         '--manifest', str(tmp_path / 'manifest.json'),
         '--skip-freshness'],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'Detected schema: notebook' in result.stdout
    assert 'Complete run: 128/128 units' in result.stdout


@pytest.mark.skipif(shutil.which('node') is None, reason='node not installed')
def test_website_snapshot_builds_from_the_published_csv(tmp_path):
    """The last step of the chain: the committed snapshot the site falls back
    to must carry the caller's provenance, not the legacy Kaggle string."""
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    assert _publish(tmp_path, src).returncode == 0

    out = tmp_path / 'forecasts-latest.json'
    result = subprocess.run(
        ['node', str(SNAPSHOT), str(tmp_path / 'out.csv'), str(out)],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
        env={'PATH': '/usr/bin:/bin:/usr/local/bin', 'SNAPSHOT_SOURCE': SOURCE},
    )
    assert result.returncode == 0, result.stdout + result.stderr

    snapshot = json.loads(out.read_text())
    assert snapshot['source'] == SOURCE
    assert 'kaggle' not in snapshot['source'].lower()
    assert snapshot['prediction_date'] == '2026-09-15'
    assert sorted(snapshot['horizons']) == ['15_days', '7_days']
    assert len(snapshot['horizons']['7_days']) == 64

    # Legacy om_* columns (this fixture carries no canonical met columns) must
    # be converted into the snapshot with the SAME rules as the ingest
    # boundary (backend/utils/forecastRow.js): precip m→mm, wind m/s→km/h,
    # solar kJ-over-horizon→MJ/m²/day, ET mm-over-horizon→mm/day.
    met_row = snapshot['horizons']['7_days'][0]
    assert met_row['temperature_mean'] == 300.15   # om_temp_2m_k passthrough
    assert met_row['precipitation_mm'] == 4.0      # 0.004 m * 1000
    assert met_row['wind_max_kmh'] == 30.6         # 8.5 m/s * 3.6
    assert met_row['evapotranspiration_mm'] == round(0.005 / 7, 4)
    assert met_row['solar_radiation_mj_m2'] == round(18000000 / 1000 / 7, 4)


# ---------------------------------------------------------------------------
# The generator's own schema must survive the whole chain
# ---------------------------------------------------------------------------

# Columns scripts/auto_forecast.py puts in its CSV. Kept in the test on purpose:
# the generator's `results.append({...})` block is parsed below and compared, so
# adding/removing a column there fails here instead of in the daily job.
GENERATOR_COLUMNS = {
    'district_id', 'district_name', 'division', 'pcode', 'horizon',
    'hazard_type', 'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source',
    # Provenance: which model/tensor/pipeline/run produced the row.
    'model_version', 'tensor_build_id', 'pipeline_version', 'run_id', 'confidence_kind',
    # Independent physics track, all eight classes (audit 2026-09-17).
    'physics_top_hazard', 'physics_top_severity', 'physics_agreement',
    'track_divergence', 'physics_inputs_missing', 'soil_channels_fabricated',
    # Scene lineage (PRODUCT_SPEC §5.8): content hash over the inputs.
    'dataset_version',
    'temperature_mean', 'temperature_max', 'temperature_min',
    'precipitation_mm', 'wind_max_kmh', 'dewpoint_mean',
    'solar_radiation_mj_m2', 'evapotranspiration_mm',
    'om_temp_2m_k', 'om_max_temp_k', 'om_min_temp_k', 'om_dewpoint_k',
    'om_precip_m', 'om_wind_max_ms', 'om_solar_rad_j', 'om_et_sum_m',
}

# The per-class physics columns are generated by
# physics_severity.physics_columns() rather than written literally, so they are
# asserted against that module instead of this set (see
# test_generator_emits_all_eight_physics_scores).
PHYSICS_SCORE_COLUMNS = {
    'physics_cold_wave', 'physics_drought', 'physics_fire', 'physics_flash_flood',
    'physics_flood', 'physics_heat_wave', 'physics_severe_local_storm',
    'physics_tropical_cyclone',
}

REQUIRED_FOR_VALIDATION = {
    'district_id', 'district_name', 'division', 'pcode', 'horizon',
    'hazard_type', 'target_date', 'prediction_date', 'model_severity',
}


def _generator_schema_from_source():
    source = (ROOT / 'scripts' / 'auto_forecast.py').read_text(encoding='utf-8')
    block = source.split('results.append({', 1)[1].split('})', 1)[0]
    return set(re.findall(r"'([a-z_0-9]+)':", block))


def test_generator_schema_matches_the_pipeline_contract():
    schema = _generator_schema_from_source()
    missing = REQUIRED_FOR_VALIDATION - schema
    assert not missing, (
        'scripts/auto_forecast.py no longer emits columns the validator requires: '
        f'{sorted(missing)} — the daily pipeline would fail right after generating'
    )
    drift = schema ^ GENERATOR_COLUMNS
    assert not drift, (
        f'scripts/auto_forecast.py CSV schema changed: {sorted(drift)}. Update '
        'GENERATOR_COLUMNS (and this test) together with the generator — the '
        'snapshot builder and the stores read these names.'
    )


def test_generated_schema_flows_through_publish_validate_and_snapshot(tmp_path):
    """End-to-end on the generator's OWN column set (not the fixture's)."""
    columns = sorted(GENERATOR_COLUMNS)
    _, fixture_rows = notebook_rows('2026-09-15')
    rows = []
    for row in fixture_rows:
        out = {name: '' for name in columns}
        out.update({k: v for k, v in row.items() if k in columns})
        out.update({
            'temperature_mean': '27.5', 'temperature_max': '33.1',
            'temperature_min': '24.9', 'precipitation_mm': '4.2',
            'wind_max_kmh': '10.3', 'dewpoint_mean': '25.5',
            'solar_radiation_mj_m2': '18.4', 'evapotranspiration_mm': '3.1',
        })
        rows.append(out)

    src = tmp_path / 'hazardnet_forecasts_latest.csv'
    with open(src, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    published = _publish(tmp_path, src)
    assert published.returncode == 0, published.stdout + published.stderr
    assert 'CHANGED=true' in published.stdout

    validated = subprocess.run(
        [sys.executable, str(VALIDATE),
         '--csv', str(tmp_path / 'out.csv'),
         '--json', str(tmp_path / 'out.json'),
         '--manifest', str(tmp_path / 'manifest.json'),
         '--skip-freshness'],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )
    assert validated.returncode == 0, validated.stdout + validated.stderr

    if shutil.which('node') is None:
        pytest.skip('node not installed — snapshot step skipped')

    out = tmp_path / 'snapshot.json'
    snapshot = subprocess.run(
        ['node', str(SNAPSHOT), str(tmp_path / 'out.csv'), str(out)],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
        env={'PATH': '/usr/bin:/bin:/usr/local/bin', 'SNAPSHOT_SOURCE': SOURCE},
    )
    assert snapshot.returncode == 0, snapshot.stdout + snapshot.stderr
    data = json.loads(out.read_text())
    assert data['prediction_date'] == '2026-09-15'
    assert len(data['horizons']['7_days']) == 64
    row = data['horizons']['7_days'][0]
    assert row['district_id'] == 1
    assert row['severity_score'] == row['model_severity']
    assert row['hazard_type'] in {
        'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
        'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
    }

    # The canonical meteorological columns must survive INTO the website
    # snapshot: the District Detail page's forecast table renders
    # Temp (Min/Max) / Precip. / Wind Max from the committed snapshot, and
    # until 2026-09-16 the builder dropped them, so production showed "—" in
    # every weather column whenever it ran off the snapshot fallback.
    assert row['temperature_min'] == 24.9
    assert row['temperature_max'] == 33.1
    assert row['precipitation_mm'] == 4.2
    assert row['wind_max_kmh'] == 10.3
    assert row['dewpoint_mean'] == 25.5
    assert row['solar_radiation_mj_m2'] == 18.4
    assert row['evapotranspiration_mm'] == 3.1

    # …and they travel in the JSON sidecar the store ingest consumes — prove
    # they survive the promoter as numbers, not strings.
    sidecar = json.loads((tmp_path / 'out.json').read_text())
    assert sidecar[0]['temperature_mean'] == 27.5
    assert sidecar[0]['precipitation_mm'] == 4.2


# ---------------------------------------------------------------------------
# Coverage gate (audit 2026-09-17)
# ---------------------------------------------------------------------------


def test_publish_refuses_without_a_run_report(tmp_path):
    """No run report = no coverage tally = the run must not ship.

    The shipped pipeline skipped failed districts silently, so a run covering a
    third of the country was indistinguishable from a complete one. Publishing
    an unaccounted CSV is now an error rather than a shrug.
    """
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    report = tmp_path / 'hazardnet_run_report.json'   # deliberately absent
    result = subprocess.run(
        [sys.executable, str(PUBLISH),
         '--csv', str(src), '--csv-out', str(tmp_path / 'out.csv'),
         '--json-out', str(tmp_path / 'out.json'),
         '--manifest', str(tmp_path / 'manifest.json'),
         '--run-report', str(report), '--source', SOURCE],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )
    assert result.returncode == 1
    assert 'Run report not found' in result.stdout
    assert not (tmp_path / 'manifest.json').exists()
    assert not (tmp_path / 'out.csv').exists()


def test_publish_refuses_a_report_that_does_not_match_the_csv(tmp_path):
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    write_run_report(tmp_path, produced=100, status='partial')
    result = _publish(tmp_path, src)
    assert result.returncode == 1
    assert 'CSV/report mismatch' in result.stdout


def test_publish_refuses_a_report_without_coverage_or_tally(tmp_path):
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv')
    (tmp_path / 'hazardnet_run_report.json').write_text(json.dumps({'run_id': 'x'}), encoding='utf-8')
    result = _publish(tmp_path, src)
    assert result.returncode == 1
    assert 'no coverage tally' in result.stdout


def test_partial_run_publishes_with_its_gap_recorded(tmp_path):
    """A partial run is publishable — but only labelled."""
    columns, rows = notebook_rows('2026-09-15')
    dropped = rows[:50]
    src = _write_fixture_csv(tmp_path / 'hazardnet_forecasts_latest.csv', dropped, columns)
    write_run_report(tmp_path, dropped, produced=50, status='partial')

    result = _publish(tmp_path, src)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'coverage=50/128 units (partial)' in result.stdout
    assert 'partial run published' in result.stdout

    manifest = json.loads((tmp_path / 'manifest.json').read_text())
    assert manifest['coverage_status'] == 'partial'
    assert manifest['coverage']['produced_units'] == 50
    assert manifest['coverage']['requested_units'] == 128


def test_physics_columns_are_emitted_for_all_eight_classes(tmp_path):
    """The generator's per-class physics columns must reach the JSON sidecar.

    The shipped pipeline scored only the class the model had already chosen, so
    a hazard the model missed could never show up in the data.
    """
    columns = sorted(GENERATOR_COLUMNS | PHYSICS_SCORE_COLUMNS)
    _, fixture_rows = notebook_rows('2026-09-15')
    rows = []
    for row in fixture_rows:
        out = {name: '' for name in columns}
        out.update({k: v for k, v in row.items() if k in columns})
        for i, name in enumerate(sorted(PHYSICS_SCORE_COLUMNS)):
            out[name] = f'{0.05 * (i + 1):.4f}'
        out['physics_top_hazard'] = 'Tropical Cyclone'
        out['physics_top_severity'] = '0.8125'
        out['physics_agreement'] = 'False'
        out['track_divergence'] = '0.4321'
        out['model_version'] = '2.1.9+model.testfixture'
        out['tensor_build_id'] = 'deadbeefdeadbeef'
        out['pipeline_version'] = 'auto_forecast/2.0.0'
        out['run_id'] = '20260917T000000Z-testtest'
        out['soil_channels_fabricated'] = 'True'
        rows.append(out)

    path = tmp_path / 'hazardnet_forecasts_latest.csv'
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    write_run_report(tmp_path, rows)
    result = _publish(tmp_path, path)
    assert result.returncode == 0, result.stdout + result.stderr

    sidecar = json.loads((tmp_path / 'out.json').read_text())
    assert sidecar[0]['physics_top_hazard'] == 'Tropical Cyclone'
    # The sidecar is typed, not stringly: a store reading it should not have to
    # know that the CSV wrote 'False'.
    assert sidecar[0]['physics_agreement'] is False
    assert sidecar[0]['soil_channels_fabricated'] is True
    # (0.05 * (index in the sorted physics column list + 1) — see the fixture above.)
    expected_flash_flood = 0.05 * (sorted(PHYSICS_SCORE_COLUMNS).index('physics_flash_flood') + 1)
    assert sidecar[0]['physics_flash_flood'] == pytest.approx(expected_flash_flood)
    assert sidecar[0]['model_version'] == '2.1.9+model.testfixture'

    if shutil.which('node') is not None:
        out = tmp_path / 'snapshot.json'
        snapshot = subprocess.run(
            ['node', str(SNAPSHOT), str(tmp_path / 'out.csv'), str(out)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=120,
            env={'PATH': '/usr/bin:/bin:/usr/local/bin', 'SNAPSHOT_SOURCE': SOURCE,
                 'SNAPSHOT_RUN_REPORT': str(tmp_path / 'hazardnet_run_report.json')},
        )
        assert snapshot.returncode == 0, snapshot.stdout + snapshot.stderr
        data = json.loads(out.read_text())
        row = data['horizons']['7_days'][0]
        assert len(row['physics_scores']) == 8
        assert row['physics_top_hazard'] == 'Tropical Cyclone'
        assert row['physics_agreement'] is False
        assert row['track_divergence'] == 0.4321
        assert row['soil_channels_fabricated'] is True
        assert data['provenance']['model_version'] == '2.1.9+model.testfixture'
        assert data['coverage']['produced_units'] == 128
        assert data['coverage']['districts_covered'] == 64


def test_generator_emits_all_eight_physics_scores():
    """The generator imports the tested module for its per-class columns."""
    source = (ROOT / 'scripts' / 'auto_forecast.py').read_text(encoding='utf-8')
    assert 'from physics_severity import' in source
    assert 'physics_columns(physics_scores)' in source
    assert 'compute_physics_scores(' in source
    # The independence property: the model's own answer must not feed the
    # physics inputs.
    block = source.split('physics_drivers = {', 1)[1].split('}', 1)[0]
    assert 'hazard' not in block, 'physics inputs must not depend on the model class'


def test_generator_refuses_to_run_with_a_mismatched_model_artifact():
    """A row must never be stamped with a version that is not its weights.

    Models/VERSION.json records each artifact's sha256 (the bundle was already
    self-describing); before this check nothing compared it to the file actually
    loaded, so a swapped model would have shipped under the old version string.
    """
    source = (ROOT / 'scripts' / 'auto_forecast.py').read_text(encoding='utf-8')
    assert 'MODEL_ARTIFACT_MISMATCH' in source
    assert "Refusing to run" in source
    assert "artifacts" in source, 'VERSION.json artifact digests are no longer consulted'
    assert "'model_sha256': MODEL_SHA256" in source or "MODEL_SHA256" in source


def test_generator_accounts_for_every_requested_unit():
    source = (ROOT / 'scripts' / 'auto_forecast.py').read_text(encoding='utf-8')
    assert "coverage['skipped'].append" in source
    assert "'no_historical_steps'" in source
    assert 'hazardnet_run_report.json' in source
    # The silent skip must be gone: every `continue` in the district loop has to
    # be preceded by a recorded reason.
    assert 'if not historical_steps:\n        continue' not in source


def test_both_gates_run_before_anything_is_written_and_only_once():
    """The gates are the only reason a refusal leaves the previous data intact.

    A duplicate copy of a gate that runs *after* the writes is worse than dead
    code: it can fail a publish whose artifacts are already half-replaced, and it
    hides the real one from a reader tracing the control flow. (Both mistakes were
    made, and this test is the guard.)
    """
    source = PUBLISH.read_text(encoding='utf-8')
    assert source.count('coverage + provenance gate') == 1  # box-drawing comment marker
    assert source.count('CSV/report mismatch') == 1
    assert source.count('scene-lineage gate') == 1
    assert source.count('Lineage coverage mismatch') == 1
    # Every gate exit precedes the first write to the artifact paths.
    first_write = source.index("_copy_if_distinct(src, csv_out)")
    for gate in ('Run report not found', 'CSV/report mismatch', 'Scene lineage failed',
                 'Lineage coverage mismatch', 'Scene manifest not found'):
        assert source.index(gate) < first_write, f'{gate} must run before the writes'
