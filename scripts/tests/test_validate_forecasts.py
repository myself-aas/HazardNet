"""Validator contract tests: scripts/validate_forecasts.py via its CLI surface.

Covers both schemas the pipelines must accept (notebook district_* 128-row
shape + legacy ADM3 location_* shape), the hourly --skip-freshness escape
hatch, and negative cases (bad hazard, missing severity column).
"""

import csv
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
VALIDATE = ROOT / 'scripts' / 'validate_forecasts.py'

sys.path.insert(0, str(ROOT / 'scripts' / 'tests'))
from make_fixture_csv import notebook_rows, adm3_rows  # noqa: E402


def today(offset_days=0):
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).strftime('%Y-%m-%d')


def write_csv_json(tmp_path, columns, rows, name='f'):
    csv_path = tmp_path / f'{name}.csv'
    json_path = tmp_path / f'{name}.json'
    with open(csv_path, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    # The pipeline JSON artifact mirrors the CSV rows (fetch script regenerates
    # it when the notebook emits CSV-only); the validator checks keys only.
    json_path.write_text(json.dumps(rows), encoding='utf-8')
    return csv_path, json_path


def run_validate(csv_path, json_path, *extra):
    return subprocess.run(
        [sys.executable, str(VALIDATE), '--csv', str(csv_path),
         '--json', str(json_path), *extra],
        capture_output=True, text=True, cwd=ROOT,
    )


def test_notebook_schema_fresh_passes(tmp_path):
    columns, rows = notebook_rows(today())
    assert len(rows) == 128  # 64 districts x 2 horizons, top-1 hazard each
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'Detected schema: notebook' in proc.stdout


def test_notebook_schema_stale_fails_freshness_gate(tmp_path):
    columns, rows = notebook_rows(today(offset_days=-5))
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 1
    assert 'freshness' in proc.stdout


def test_skip_freshness_lets_hourly_refresh_pass_on_stale_data(tmp_path):
    columns, rows = notebook_rows(today(offset_days=-5))
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness')
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_adm3_schema_passes(tmp_path):
    columns, rows = adm3_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'Detected schema: adm3' in proc.stdout


def test_invalid_hazard_fails(tmp_path):
    columns, rows = notebook_rows(today())
    rows[0] = {**rows[0], 'hazard_type': 'Landslide'}
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 1
    assert 'Invalid hazard' in proc.stdout


def test_missing_severity_column_fails(tmp_path):
    columns = [c for c in notebook_rows(today())[0]
               if c not in ('severity_score', 'model_severity')]
    _, rows = notebook_rows(today())
    rows = [{k: v for k, v in r.items() if k in set(columns)} for r in rows]
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 1
    assert 'severity' in proc.stdout.lower()


def test_unrecognized_schema_fails(tmp_path):
    csv_path = tmp_path / 'weird.csv'
    csv_path.write_text('a,b\n1,2\n', encoding='utf-8')
    json_path = tmp_path / 'weird.json'
    json_path.write_text('[{"a": 1}]', encoding='utf-8')
    proc = run_validate(csv_path, json_path)
    assert proc.returncode == 1
    assert 'Unrecognized schema' in proc.stdout
