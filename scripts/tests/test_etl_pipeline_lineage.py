#!/usr/bin/env python3
"""The live pipeline's lineage code, tested without Earth Engine (Phase 2).

WHY THIS FILE EXISTS
--------------------
`scripts/auto_forecast.py` cannot be imported in CI: it authenticates to Earth
Engine and loads a TFLite interpreter at import time. That is exactly where the
`dataset_version` contract is *implemented* though — `_tensor_digest()` and
`build_scene_unit()` turn the tensors the model actually consumed into the
manifest that every published row's `dataset_version` is derived from. A bug
there would be invisible until a real run, and would put a wrong content hash on
a real forecast.

So the two functions are loaded out of the module *source* (the fragment between
`SCENE_MANIFEST_PATH` and the main loop) and exercised here with arrays standing
in for the tensors. What that buys:

  * the windows recorded in the manifest are the windows the pipeline used —
    `ten_day_windows()` is asserted against the manifest steps;
  * the t0 input is part of the hash (it is a tenth step, re-fetched by
    `build_t0_and_infer`, and can differ from the ninth history step);
  * a changed pixel moves the digest, an unchanged tensor reproduces it;
  * a missing Open-Meteo provenance block leaves the driver unrecorded rather
    than inventing a fingerprint.
"""

import sys
from pathlib import Path

import pytest

np = pytest.importorskip('numpy', reason='the pipeline runs numpy; CI installs it')

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'scripts' / 'etl'))

import scene_manifest  # noqa: E402
from sources import ten_day_windows  # noqa: E402

PIPELINE = ROOT / 'scripts' / 'auto_forecast.py'


def load_helpers():
    """Exec the lineage fragment of auto_forecast.py with the dependencies it needs."""
    source = PIPELINE.read_text(encoding='utf-8')
    start = source.index('SCENE_MANIFEST_PATH = os.environ.get(')
    end = source.index('results = []\nscene_units = []')
    fragment = source[start:end]
    namespace = {
        'os': __import__('os'),
        'json': __import__('json'),
        'hashlib': __import__('hashlib'),
        'np': np,
        'datetime': __import__('datetime').datetime,
        'timedelta': __import__('datetime').timedelta,
        'timezone': __import__('datetime').timezone,
        'build_scene_manifest': scene_manifest.build_manifest,
        'scene_driver_record': scene_manifest.driver_record,
        'scene_step_record': scene_manifest.step_record,
        'scene_unit_lookup': scene_manifest.unit_lookup,
        'scene_unit_record': scene_manifest.unit_record,
        'write_scene_manifest': scene_manifest.write_manifest,
        'ten_day_windows': ten_day_windows,
    }
    exec(compile(fragment, str(PIPELINE) + ':lineage', 'exec'), namespace)  # noqa: S102
    return namespace


HELPERS = load_helpers()
DISTRICT = {'id': 25, 'name': 'Sylhet', 'division': 'Sylhet', 'pcode': '3082'}
PROVENANCE = {
    'url': 'https://api.open-meteo.com/v1/forecast',
    'params': {'latitude': 24.9, 'longitude': 91.87, 'forecast_days': 8, 'timezone': 'Asia/Dhaka'},
    'payload_sha256': 'a' * 64,
    'fields_defaulted': ['gusts_10m_max'],
    'retrieved_at': '2026-09-17T06:00:00Z',
}
PREDICTION_DATE = '2026-09-17'


def tensors(value=1.0):
    steps = [np.full((9, 15, 8, 8), value + index, dtype='float32') for index in range(9)]
    t0 = np.full((1, 8, 8, 15), value + 100.0, dtype='float32')
    return steps, t0


def build_unit(**overrides):
    steps, t0 = overrides.pop('tensors', tensors())
    om_data = overrides.pop('om_data', {'_provenance': PROVENANCE})
    return HELPERS['build_scene_unit'](
        overrides.pop('dist', DISTRICT), overrides.pop('horizon', '7_days'),
        steps, t0, om_data, overrides.pop('prediction_date', PREDICTION_DATE), **overrides,
    )


def test_tensor_digest_is_stable_and_moves_when_a_pixel_changes():
    digest = HELPERS['_tensor_digest']
    first = np.zeros((9, 15, 4, 4), dtype='float32')
    same = np.zeros((9, 15, 4, 4), dtype='float32')
    changed = np.zeros((9, 15, 4, 4), dtype='float32')
    changed[3, 7, 2, 1] = 0.25

    assert digest(first) == digest(same)
    assert digest(first) != digest(changed)
    assert digest(None) is None
    # The digest is taken over float32 bytes, so two dtypes of the same values agree.
    assert digest(first) == digest(first.astype('float64'))


def test_unit_has_nine_history_steps_plus_the_t0_input():
    unit = build_unit()
    assert len(unit['steps']) == 10
    assert [step['step'] for step in unit['steps']] == list(range(10))
    assert unit['extra']['t0_step_index'] == 9
    # The t0 block is a real input and is hashed separately.
    assert unit['steps'][9]['tensor_sha256'] != unit['steps'][8]['tensor_sha256']
    assert unit['steps'][9]['shape'] == [1, 8, 8, 15]
    assert unit['steps'][0]['shape'] == [9, 15, 8, 8]


def test_recorded_windows_are_the_windows_the_pipeline_used():
    unit = build_unit()
    expected = ten_day_windows(PREDICTION_DATE)
    for step, (start, end) in zip(unit['steps'][:9], expected):
        assert (step['window_start'], step['window_end']) == (start, end)
    # The t0 window is the newest window re-fetched for the forecast input.
    assert (unit['steps'][9]['window_start'], unit['steps'][9]['window_end']) == expected[-1]


def test_unit_names_its_collections_and_is_honest_about_scene_enumeration():
    unit = build_unit()
    assert set(unit['steps'][0]['collections']) == set(HELPERS['STACK_COLLECTIONS'])
    assert 'COPERNICUS/S1_GRD' in unit['steps'][0]['collections']
    # Earth Engine composites are not enumerated per scene (see scene_manifest.py).
    assert unit['scenes_enumerated'] is False


def test_driver_fingerprint_is_recorded_and_defaults_are_disclosed():
    unit = build_unit()
    assert unit['driver']['source'] == 'open-meteo'
    assert unit['driver']['payload_sha256'] == 'a' * 64
    assert unit['driver']['params']['forecast_days'] == 8
    assert unit['extra']['driver_recorded'] is True
    assert unit['extra']['fields_defaulted'] == ['gusts_10m_max']


def test_missing_driver_provenance_leaves_the_driver_unrecorded_rather_than_faked():
    unit = build_unit(om_data={})
    assert 'driver' not in unit
    assert unit['extra']['driver_recorded'] is False
    assert unit['extra']['fields_defaulted'] == []


def test_unit_versions_through_the_manifest_and_stamps_a_row():
    unit = build_unit()
    other = build_unit(horizon='15_days')
    manifest = HELPERS['build_scene_manifest'](
        prediction_date=PREDICTION_DATE, pipeline_version='auto_forecast/2.0.0',
        model_version='2.1.9+model.testfixture', units=[unit, other], run_id='run-1',
        produced_at='2026-09-17T06:00:00Z',
    )
    lookup = HELPERS['scene_unit_lookup'](manifest)
    assert set(lookup) == {('25', '7_days'), ('25', '15_days')}
    assert lookup[('25', '7_days')].startswith('ds1.')
    assert scene_manifest.validate_manifest(manifest) == []

    # A changed input moves the version; unchanged inputs reproduce it.
    steps, t0 = tensors()
    steps[0][0, 0, 0, 0] += 1.0
    changed_unit = build_unit(tensors=(steps, t0))
    changed_manifest = HELPERS['build_scene_manifest'](
        prediction_date=PREDICTION_DATE, pipeline_version='auto_forecast/2.0.0',
        model_version='2.1.9+model.testfixture', units=[changed_unit, other], run_id='run-2',
        produced_at='2026-09-17T06:00:00Z',
    )
    assert changed_manifest['units'][0]['dataset_version'] != manifest['units'][0]['dataset_version']
    assert changed_manifest['units'][1]['dataset_version'] == manifest['units'][1]['dataset_version']


def test_row_stamping_lookup_covers_the_district_ids_the_pipeline_emits():
    """`district_id` is an int in the row and a string in the manifest key.

    A mismatch here would leave every row with an empty `dataset_version` while
    the manifest looked complete — the silent kind of failure this phase removes.
    """
    manifest = HELPERS['build_scene_manifest'](
        prediction_date=PREDICTION_DATE, pipeline_version='auto_forecast/2.0.0', units=[build_unit()],
        run_id='run-1', produced_at='2026-09-17T06:00:00Z',
    )
    lookup = HELPERS['scene_unit_lookup'](manifest)
    row = {'district_id': 25, 'horizon': '7_days', 'dataset_version': None}
    version = lookup.get((str(row['district_id']), row['horizon']))
    assert version is not None
    row['dataset_version'] = version
    assert row['dataset_version'].startswith('ds1.')
