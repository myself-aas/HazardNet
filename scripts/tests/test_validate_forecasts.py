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


def write_run_report(tmp_path, rows, *, produced=None, status=None, name='hazardnet_run_report.json',
                     model_version='2.1.9+model.testfixture', model_sha256='a' * 64, scene=None):
    """A coverage tally of the shape scripts/auto_forecast.py emits.

    `scene` attaches a scene-manifest block (PRODUCT_SPEC §5.8); without it the
    validator must warn that the dataset cannot name its inputs rather than fail,
    because the committed 2026-09-16 artifacts predate the manifest.
    """
    produced = len(rows) if produced is None else produced
    horizons = sorted({r.get('horizon') for r in rows if r.get('horizon')})
    districts = {r.get('district_name') for r in rows if r.get('district_name')}
    report = {
        'schema': 'hazardnet-run-report/v1',
        'run_id': '20260917T000000Z-testtest',
        'pipeline_version': 'auto_forecast/2.0.0',
        'model_version': model_version,
        'model_sha256': model_sha256,
        'status': status or ('complete' if produced == len(rows) else 'partial'),
        'soil_channels_fabricated': True,
        'soil_mode': 'mean',
        'coverage': {
            'requested_units': 128,
            'requested_districts': 64,
            'requested_horizons': horizons or ['7_days', '15_days'],
            'produced_units': produced,
            'districts_with_any_horizon': len(districts),
            'per_horizon': {h: {'requested': 64, 'produced': 64} for h in (horizons or ['7_days', '15_days'])},
            'skipped': [],
            'status': status or ('complete' if produced == len(rows) else 'partial'),
        },
    }
    if scene is not None:
        report['scene_manifest'] = scene
    path = tmp_path / name
    path.write_text(json.dumps(report), encoding='utf-8')
    return path


def run_validate(csv_path, json_path, *extra, coverage=False, manifest=None):
    """Run the validator.

    Most tests here are about schema detection and the freshness gate, so they
    opt out of the coverage gate (`--skip-coverage`); the coverage gate has its
    own tests below, which pass `coverage=True` (optionally with `manifest=`).
    """
    args = [sys.executable, str(VALIDATE), '--csv', str(csv_path), '--json', str(json_path)]
    if not coverage:
        args.append('--skip-coverage')
    if manifest is not None:
        args += ['--manifest', str(manifest)]
    return subprocess.run(args + list(extra), capture_output=True, text=True, cwd=ROOT)


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
    assert 'Invalid schema' in proc.stdout


def test_full_notebook_fixture_does_not_warn_about_row_count(tmp_path):
    """One row per district per horizon (128), not the 64x2x8 cross product.

    Regression: the expectation was `64 * len(HORIZONS) * len(HAZARDS)` = 1024,
    but the notebook's loop runs a single top-1-hazard inference per district
    per horizon and appends once, so every real run printed "Expected ~1024
    rows, got 128". A permanent spurious warning is how a genuine shortfall
    (skipped districts) would have been dismissed as the usual noise.
    """
    columns, rows = notebook_rows(today())
    assert len(rows) == 128, 'fixture drifted from the notebook row contract'
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness')
    assert proc.returncode == 0, proc.stdout
    assert 'Expected ~' not in proc.stdout, proc.stdout


def test_short_notebook_csv_still_warns_about_row_count(tmp_path):
    """...and the warning must stay live for a real shortfall."""
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows[:50])
    proc = run_validate(csv_path, json_path, '--skip-freshness')
    assert 'Expected ~128 rows, got 50' in proc.stdout, proc.stdout


# ---------------------------------------------------------------------------
# Coverage gate (audit 2026-09-17)
#
# The shipped pipeline skipped a district whenever its Earth Engine fetch came
# back empty (`if not historical_steps: continue`) and printed nothing, so a
# 25-of-64-district run looked identical to a complete one on the website. A
# partial run may still be published — but only with its coverage tally
# attached, so the site can label the gaps instead of shipping stale baseline
# numbers as if they were today's forecast.
# ---------------------------------------------------------------------------


def test_missing_manifest_fails_the_coverage_gate(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness',
                        coverage=True, manifest=tmp_path / 'absent.json')
    assert proc.returncode == 1
    assert 'Missing manifest' in proc.stdout


def test_manifest_without_a_coverage_tally_fails(tmp_path):
    """The real committed manifest (2026-09-16) is exactly this shape."""
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'row_count': 128, 'source': 'kaggle'}), encoding='utf-8')
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 1
    assert 'no coverage tally' in proc.stdout


def test_complete_run_passes_and_says_so(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'Complete run: 128/128 units' in proc.stdout


def test_partial_run_is_labelled_not_blocked(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows[:50])
    manifest = write_run_report(tmp_path, rows[:50], produced=50, status='partial')
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'Partial run: 50/128' in proc.stdout
    assert 'no current forecast' in proc.stdout  # what the site must label


def test_coverage_mismatch_between_manifest_and_rows_fails(tmp_path):
    """A manifest claiming more rows than the CSV holds is a lie, not a partial run."""
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows, produced=130, status='partial')
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 1
    assert 'Coverage mismatch' in proc.stdout


def test_manifest_without_model_provenance_fails(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows, model_version=None, model_sha256=None)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 1
    assert 'no model provenance' in proc.stdout


def test_fabricated_soil_channels_are_disclosed_not_hidden(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 0, proc.stdout
    assert 'soil_channels_fabricated=true' in proc.stdout.replace(' ', '')
    assert 'training-mean placeholders' in proc.stdout


# ---------------------------------------------------------------------------
# Scene lineage (PRODUCT_SPEC §5.8)
#
# A forecast that cannot name the inputs behind it is not reproducible: the
# scene manifest carries a content hash over the decadal windows, the tensor
# digests and the Open-Meteo request/response fingerprint. These tests pin the
# three ways the chain breaks: a malformed version, a manifest block pointing at
# a file that is not there, and a row count that no longer matches.
# ---------------------------------------------------------------------------


def test_malformed_dataset_version_is_rejected(tmp_path):
    columns, rows = notebook_rows(today())
    rows[0]['dataset_version'] = 'ds1.NOTAHASH'
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness')
    assert proc.returncode == 1
    assert 'Malformed dataset_version' in proc.stdout


def test_blank_dataset_version_is_tolerated_for_legacy_producers(tmp_path):
    columns, rows = notebook_rows(today())
    for row in rows:
        row['dataset_version'] = ''
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'dataset_version present on 0/128 rows' in proc.stdout


def test_manifest_without_scene_block_warns_about_unnameable_inputs(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'no scene_manifest block' in proc.stdout


def test_scene_manifest_continuity_is_checked(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    scene_file = tmp_path / 'hazardnet_scene_manifest.json'
    scene_file.write_text(json.dumps({'schema': 'hazardnet-scene-manifest/v1'}), encoding='utf-8')
    block = {
        'path': str(scene_file), 'units': len(rows), 'rows_stamped': len(rows),
        'dataset_version': 'ds-run.0011223344556677', 'scenes_enumerated': False,
    }
    manifest = write_run_report(tmp_path, rows, scene=block)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'dataset_version=ds-run.0011223344556677' in proc.stdout

    # ...and a claim that more rows were stamped than the CSV holds is a failure.
    lying = dict(block, rows_stamped=len(rows) + 1)
    manifest = write_run_report(tmp_path, rows, scene=lying)
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 1
    assert 'Lineage mismatch' in proc.stdout


def test_scene_manifest_missing_from_disk_fails(tmp_path):
    columns, rows = notebook_rows(today())
    csv_path, json_path = write_csv_json(tmp_path, columns, rows)
    manifest = write_run_report(tmp_path, rows, scene={
        'path': str(tmp_path / 'gone.json'), 'units': len(rows), 'rows_stamped': len(rows),
        'dataset_version': 'ds-run.0011223344556677',
    })
    proc = run_validate(csv_path, json_path, '--skip-freshness', coverage=True, manifest=manifest)
    assert proc.returncode == 1
    assert 'not on disk' in proc.stdout


# ---------------------------------------------------------------------------
# Artifact resolution (a rehearsal / staging directory)
#
# `--manifest` is the one path a caller must give; the CSV and its JSON sidecar
# are resolved beside it. Without that, validating a staging run compares that
# run's coverage tally against the *committed* CSV and fails with a mismatch that
# looks like a data defect but is a path defect.
# ---------------------------------------------------------------------------


def test_csv_and_sidecar_resolve_beside_the_manifest(tmp_path):
    columns, rows = notebook_rows(today())
    stage = tmp_path / 'stage'
    stage.mkdir()
    manifest = write_run_report(stage, rows)
    # A CSV that is *not* the committed one, under the manifest's own directory.
    staged_rows = rows[:20]
    csv_path = stage / 'hazardnet_forecasts_latest.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(staged_rows)
    (stage / 'hazardnet_forecasts_latest.json').write_text(json.dumps(staged_rows), encoding='utf-8')

    proc = subprocess.run(
        [sys.executable, str(VALIDATE), '--manifest', str(manifest), '--skip-freshness',
         '--skip-coverage'],
        capture_output=True, text=True, cwd=ROOT,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    # 20 rows read, not the 74 of the committed CSV: the file beside the manifest won.
    assert 'Expected ~20 rows' in proc.stdout or '20 rows' in proc.stdout
