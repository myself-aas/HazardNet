"""fetch_kaggle_forecast.py end-to-end test with a mocked Kaggle CLI.

Puts a fake `kaggle` executable on PATH that materializes a notebook-shaped
CSV (+ optional JSON) into the `-p` directory, then runs the real fetch
script: sanity check, JSON regeneration, manifest provenance, and
CHANGED=true -> CHANGED=false change detection across two runs.
"""

import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FETCH = ROOT / 'scripts' / 'fetch_kaggle_forecast.py'

sys.path.insert(0, str(ROOT / 'scripts' / 'tests'))
from make_fixture_csv import notebook_rows  # noqa: E402
import csv as csv_module


FAKE_KAGGLE = """#!/usr/bin/env bash
# Mock: kaggle kernels output <kernel> -p <dest>
dest=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-p" ]; then dest="$arg"; fi
  prev="$arg"
done
mkdir -p "$dest"
cp "$FIXTURE_CSV" "$dest/hazardnet_forecasts_latest.csv"
if [ -n "$FIXTURE_JSON" ]; then cp "$FIXTURE_JSON" "$dest/notebook.json"; fi
echo "mock kernel output written to $dest"
"""


@pytest.fixture()
def mock_env(tmp_path, monkeypatch):
    fixture_csv = tmp_path / 'fixture.csv'
    columns, rows = notebook_rows('2026-09-13')
    with open(fixture_csv, 'w', newline='', encoding='utf-8') as fh:
        writer = csv_module.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    bindir = tmp_path / 'bin'
    bindir.mkdir()
    fake = bindir / 'kaggle'
    fake.write_text(FAKE_KAGGLE, encoding='utf-8')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv('PATH', f'{bindir}{os.pathsep}{os.environ["PATH"]}')
    monkeypatch.setenv('FIXTURE_CSV', str(fixture_csv))
    monkeypatch.delenv('FIXTURE_JSON', raising=False)
    return tmp_path


def run_fetch(workdir, *extra):
    return subprocess.run(
        [sys.executable, str(FETCH),
         '--dest', str(workdir / 'dl'),
         '--csv-out', str(workdir / 'out' / 'hazardnet_forecasts_latest.csv'),
         '--json-out', str(workdir / 'out' / 'hazardnet_forecasts_latest.json'),
         '--manifest', str(workdir / 'out' / 'manifest.json'),
         '--kernel', 'mock/kernel',
         '--attempts', '1', '--retry-delay', '0', *extra],
        capture_output=True, text=True, cwd=ROOT,
    )


def test_fetch_downloads_and_regenerates_json(mock_env):
    proc = run_fetch(mock_env)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'CHANGED=true' in proc.stdout
    assert 'sanity check passed (128 rows)' in proc.stdout
    # Notebook emitted CSV-only -> JSON regenerated from the CSV.
    assert 'regenerated' in proc.stdout
    records = json.loads((mock_env / 'out' / 'hazardnet_forecasts_latest.json').read_text())
    assert len(records) == 128
    manifest = json.loads((mock_env / 'out' / 'manifest.json').read_text())
    assert manifest['prediction_date'] == '2026-09-13'
    assert manifest['row_count'] == 128
    assert len(manifest['csv_sha256']) == 64


def test_second_run_reports_unchanged(mock_env):
    assert run_fetch(mock_env).returncode == 0
    proc = run_fetch(mock_env)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'CHANGED=false' in proc.stdout


def test_invalid_csv_fails_sanity_check(mock_env, monkeypatch):
    bad = mock_env / 'bad.csv'
    rows_cols = notebook_rows('2026-09-13')
    columns, rows = rows_cols
    rows[5] = {**rows[5], 'hazard_type': 'Landslide'}
    with open(bad, 'w', newline='', encoding='utf-8') as fh:
        writer = csv_module.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    monkeypatch.setenv('FIXTURE_CSV', str(bad))
    proc = run_fetch(mock_env)
    assert proc.returncode == 1
    assert 'sanity check failed' in proc.stdout
