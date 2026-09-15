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


def _publish(tmp_path, csv_path, *extra):
    return subprocess.run(
        [sys.executable, str(PUBLISH),
         '--csv', str(csv_path),
         '--csv-out', str(tmp_path / 'out.csv'),
         '--json-out', str(tmp_path / 'out.json'),
         '--manifest', str(tmp_path / 'manifest.json'),
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
         '--skip-freshness'],
        capture_output=True, text=True, cwd=str(ROOT), timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'Detected schema: notebook' in result.stdout


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
    'temperature_mean', 'temperature_max', 'temperature_min',
    'precipitation_mm', 'wind_max_kmh', 'dewpoint_mean',
    'solar_radiation_mj_m2', 'evapotranspiration_mm',
    'om_temp_2m_k', 'om_max_temp_k', 'om_min_temp_k', 'om_dewpoint_k',
    'om_precip_m', 'om_wind_max_ms', 'om_solar_rad_j', 'om_et_sum_m',
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

    # The canonical meteorological columns are not part of the (deliberately
    # small) website snapshot; they travel in the JSON sidecar the store ingest
    # consumes — prove they survive the promoter as numbers, not strings.
    sidecar = json.loads((tmp_path / 'out.json').read_text())
    assert sidecar[0]['temperature_mean'] == 27.5
    assert sidecar[0]['precipitation_mm'] == 4.2
