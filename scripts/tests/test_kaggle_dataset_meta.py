"""The daily metadata pull is a drift *report*, and these tests keep it honest.

`scripts/fetch_kaggle_dataset_meta.py` downloads the two small documents the Kaggle
dataset builder publishes — `normalization_stats.json` and `dataset_config.json` — and
commits them beside the forecast they contextualise. It deliberately does not touch
`Models/`: the shipped normalization belongs to the model that was trained with it, and
only a training pull request changes it. So the value of this script is entirely in the
comparison it prints, which makes the comparison the thing to test:

* a document that changed shape upstream is a problem, not a silent no-op — otherwise
  the report compares nothing to nothing and says "identical";
* a band present in one file and absent in the other is reported, not skipped;
* float32 aggregates from two runs of the same code are equal *within tolerance*, so a
  reordering of summation is not drift worth waking anyone for;
* the shipped copy is never written, whatever the pull says;
* a packaging detail (Kaggle hands back a zip for one file, loose files for a kernel
  output) must not fail the day's forecast.

All offline: no Kaggle CLI, no network.
"""

import json
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import fetch_kaggle_dataset_meta as fkm  # noqa: E402

SHIPPED_STATS = ROOT / 'Models' / 'normalization_stats.json'


def stats_doc(**overrides):
    """A complete, valid normalization document, band by band."""
    doc = {band: {'mean': 0.5 + index / 100, 'std': 0.2 + index / 100}
           for index, band in enumerate(fkm.EXPECTED_BANDS)}
    doc.update(overrides)
    return doc


def config_doc(**overrides):
    doc = {
        'n_classes': 8,
        'hazard_types': ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood',
                         'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'],
        'target_tensor_shape': [15, 96, 96],
        'strategies': ['event_kfold', 'temporal_holdout'],
    }
    doc.update(overrides)
    return doc


# ── what Kaggle hands back ────────────────────────────────────────────────────


def test_loose_json_files_are_found(tmp_path):
    (tmp_path / 'normalization_stats.json').write_text('{}', encoding='utf-8')
    (tmp_path / 'dataset_config.json').write_text('{}', encoding='utf-8')
    found = fkm.collect_json_files(tmp_path)
    assert sorted(found) == ['dataset_config.json', 'normalization_stats.json']


def test_a_single_file_download_is_unzipped(tmp_path):
    """`kaggle datasets download -f <name>` returns `<name>.zip`; a kernel output
    returns loose files. Both have to work or the daily job fails on packaging."""
    payload = json.dumps(stats_doc())
    with zipfile.ZipFile(tmp_path / 'normalization_stats.json.zip', 'w') as bundle:
        bundle.writestr('normalization_stats.json', payload)
    found = fkm.collect_json_files(tmp_path)
    assert list(found) == ['normalization_stats.json']
    assert json.loads(found['normalization_stats.json'].read_text())['SAR_VV']['mean']
    assert not list(tmp_path.glob('*.zip')), 'the archive should be removed after extraction'


def test_a_corrupt_archive_is_warned_about_and_left_alone(tmp_path):
    (tmp_path / 'broken.zip').write_bytes(b'this is not a zip archive')
    (tmp_path / 'dataset_config.json').write_text('{}', encoding='utf-8')
    found = fkm.collect_json_files(tmp_path)
    assert list(found) == ['dataset_config.json']
    assert (tmp_path / 'broken.zip').is_file(), 'a file that is not a zip must not be deleted'


def test_a_nested_directory_is_still_searched(tmp_path):
    nested = tmp_path / 'output' / 'v2'
    nested.mkdir(parents=True)
    (nested / 'dataset_config.json').write_text('{}', encoding='utf-8')
    found = fkm.collect_json_files(tmp_path)
    assert list(found) == ['dataset_config.json']


# ── a document that changed shape upstream ────────────────────────────────────


def test_a_complete_stats_document_passes():
    assert fkm.validate('normalization_stats.json', stats_doc()) == []


def test_a_missing_band_is_a_problem():
    """A partial normalization is worse than none: it normalizes the bands it has and
    leaves the rest to whatever the reader assumes."""
    doc = stats_doc()
    del doc['Dewpoint']
    problems = fkm.validate('normalization_stats.json', doc)
    assert problems and 'Dewpoint' in problems[0]


def test_an_unexpected_band_is_a_problem():
    """Guessing at a renamed key is how a drift report starts comparing nothing to
    nothing, so a new band upstream has to be surfaced rather than absorbed."""
    problems = fkm.validate('normalization_stats.json', stats_doc(New_Band={'mean': 1.0, 'std': 1.0}))
    assert any('New_Band' in problem and 'does not read' in problem for problem in problems)


def test_a_non_numeric_statistic_is_a_problem():
    problems = fkm.validate('normalization_stats.json', stats_doc(Red={'mean': 'n/a', 'std': 0.3}))
    assert any('Red.mean' in problem for problem in problems)


def test_a_zero_standard_deviation_is_a_problem():
    """Normalizing by it would not be finite, and the failure would surface as NaN
    forecasts rather than as a bad statistics file."""
    problems = fkm.validate('normalization_stats.json', stats_doc(Blue={'mean': 0.4, 'std': 0}))
    assert any('Blue.std' in problem for problem in problems)


def test_a_boolean_is_not_accepted_as_a_number():
    problems = fkm.validate('normalization_stats.json', stats_doc(NIR={'mean': True, 'std': 0.3}))
    assert any('NIR.mean' in problem for problem in problems)


def test_a_complete_config_passes():
    assert fkm.validate('dataset_config.json', config_doc()) == []


def test_a_config_missing_a_key_names_the_builder():
    doc = config_doc()
    del doc['target_tensor_shape']
    problems = fkm.validate('dataset_config.json', doc)
    assert problems and 'target_tensor_shape' in problems[0]


def test_a_config_whose_class_count_disagrees_with_its_hazards_is_a_problem():
    problems = fkm.validate('dataset_config.json', config_doc(n_classes=7))
    assert any('n_classes=7' in problem and '8 hazard_types' in problem for problem in problems)


def test_a_config_with_no_split_strategies_is_a_problem():
    problems = fkm.validate('dataset_config.json', config_doc(strategies=[]))
    assert any('no split strategies' in problem for problem in problems)


def test_a_document_that_is_not_an_object_is_a_problem():
    assert fkm.validate('dataset_config.json', ['not', 'an', 'object'])
    assert fkm.validate('normalization_stats.json', None)


# ── the drift report ──────────────────────────────────────────────────────────


def test_identical_documents_report_identical(tmp_path):
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    report = fkm.compare_stats(stats_doc(), shipped)
    assert report['state'] == 'identical'
    assert report['bands_compared'] == len(fkm.EXPECTED_BANDS)
    assert report['moved'] == [] and report['max_relative_delta'] == 0.0


def test_float32_noise_is_not_drift(tmp_path):
    """Two runs of the same aggregation code reorder their summation; a report that
    wakes somebody for the eighth decimal place gets ignored by the ninth."""
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    noisy = stats_doc()
    noisy['Red']['mean'] += 1e-12
    assert fkm.compare_stats(noisy, shipped)['state'] == 'identical'


def test_a_moved_value_is_reported_with_its_relative_delta(tmp_path):
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    moved = stats_doc()
    moved['Precip']['mean'] = 1.0        # was 0.53
    moved['Precip']['std'] = 0.9         # was 0.23
    report = fkm.compare_stats(moved, shipped)
    assert report['state'] == 'drift'
    assert len(report['moved']) == 2
    assert {entry['field'] for entry in report['moved']} == {'mean', 'std'}
    assert all(entry['band'] == 'Precip' for entry in report['moved'])
    assert report['max_relative_delta'] > 0.5


def test_a_band_present_in_only_one_file_is_reported(tmp_path):
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    pulled = stats_doc()
    del pulled['Soil_T1']
    report = fkm.compare_stats(pulled, shipped)
    assert report['state'] == 'drift'
    assert any(entry['band'] == 'Soil_T1' and 'one file only' in entry['state']
               for entry in report['moved'])


def test_a_missing_shipped_copy_says_so_rather_than_comparing_to_nothing(tmp_path):
    report = fkm.compare_stats(stats_doc(), tmp_path / 'absent.json')
    assert report['state'] == 'shipped-missing'
    assert 'does not exist' in report['detail']


def test_an_unreadable_shipped_copy_says_so(tmp_path):
    shipped = tmp_path / 'shipped.json'
    shipped.write_text('{ this is not json', encoding='utf-8')
    report = fkm.compare_stats(stats_doc(), shipped)
    assert report['state'] == 'shipped-unreadable'
    assert 'not valid JSON' in report['detail']


# ── the summary a human reads ─────────────────────────────────────────────────


def test_the_summary_reports_identical(tmp_path):
    stats = tmp_path / 'normalization_stats.json'
    stats.write_text(json.dumps(stats_doc()), encoding='utf-8')
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    text = fkm.markdown_summary(
        source='ashifahmedshuvo/hazardnet-datasets',
        files={'normalization_stats.json': stats},
        drift=fkm.compare_stats(stats_doc(), shipped),
        config=config_doc(),
        problems=[],
    )
    assert '**identical**' in text
    assert '8 classes' in text and '2 split strategies' in text
    assert '[15, 96, 96]' in text


def test_the_summary_reports_drift_and_says_the_shipped_copy_is_untouched(tmp_path):
    stats = tmp_path / 'normalization_stats.json'
    stats.write_text(json.dumps(stats_doc()), encoding='utf-8')
    shipped = tmp_path / 'shipped.json'
    shipped.write_text(json.dumps(stats_doc()), encoding='utf-8')
    moved = stats_doc()
    moved['Precip']['mean'] = 1.0
    text = fkm.markdown_summary(
        source='ashifahmedshuvo/hazardnet-datasets',
        files={'normalization_stats.json': stats},
        drift=fkm.compare_stats(moved, shipped),
        config=None,
        problems=[],
    )
    assert '1 value(s) differ' in text
    assert 'Precip.mean' in text
    # The sentence that keeps this script from becoming a promotion path.
    assert 'The shipped copy is left alone' in text


def test_the_summary_surfaces_problems_as_errors(tmp_path):
    stats = tmp_path / 'dataset_config.json'
    stats.write_text('{}', encoding='utf-8')
    text = fkm.markdown_summary(
        source='ashifahmedshuvo/hazardnet-datasets',
        files={'dataset_config.json': stats},
        drift={'state': 'shipped-missing', 'shipped_path': 'Models/normalization_stats.json',
               'detail': 'absent'},
        config=None,
        problems=["dataset_config.json has no 'n_classes'"],
    )
    assert '::error::' in text and 'n_classes' in text
    assert '**not compared**' in text


# ── the contract with the rest of the repository ──────────────────────────────


def test_the_expected_bands_are_the_shipped_model_bands():
    """`EXPECTED_BANDS` is a copy of a list that also lives in the forecast notebook and
    in the shipped stats file. If they diverge, the pull reports drift for bands nobody
    reads and stays silent about the ones that matter."""
    if not SHIPPED_STATS.is_file():
        pytest.skip(f'{SHIPPED_STATS} is not committed in this checkout')
    shipped = json.loads(SHIPPED_STATS.read_text(encoding='utf-8'))
    assert set(shipped) == set(fkm.EXPECTED_BANDS), (
        f'the shipped model normalizes {sorted(set(shipped) - set(fkm.EXPECTED_BANDS))} '
        f'and not {sorted(set(fkm.EXPECTED_BANDS) - set(shipped))}, against the pull expectation'
    )
    assert fkm.validate('normalization_stats.json', shipped) == [], (
        'the committed Models/normalization_stats.json does not satisfy the pull validator'
    )


def test_the_metadata_destination_is_not_the_model_directory():
    """The whole point of the daily pull's payload boundary: kilobytes of dataset
    metadata in, and nothing written under Models/."""
    import inspect

    source = inspect.getsource(fkm)
    assert 'data/kaggle/dataset-meta' in source, 'the default destination moved'
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith('#'):
            continue
        assert not stripped.startswith(('Models/', "'Models/", '"Models/')), (
            f'the metadata pull writes into the model directory: {stripped}'
        )
