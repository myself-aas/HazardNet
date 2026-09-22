#!/usr/bin/env python3
"""Source adapters, COG preprocessing, the scene manifest, and the ETL CLI.

The three things here that are easy to get wrong and expensive to get wrong:

  * **the window arithmetic** — the manifest's windows are a claim about which
    imagery produced a prediction, so `sources.ten_day_windows` is pinned against
    the live pipeline's own loop rather than against a comment;
  * **the COG contract** — a raster written with the wrong scale is not obviously
    broken (MODIS LST read at the NDVI scale understates temperature 50x), so the
    scales, nodata rules and `gdal_translate` argv are asserted exactly;
  * **the manifest's integrity rules** — a `dataset_version` that can be edited
    after the fact, or computed from reordered inputs, is not a version at all.

The CLI is exercised through `subprocess` because that is how a workflow calls it:
`python -m etl.cli …` from `scripts/`, one JSON report on stdout, exit codes 0/1/2.
"""

import json
import re
import struct
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
FIXTURES = SCRIPTS / 'tests' / 'fixtures' / 'etl'
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / 'etl'))

import cog  # noqa: E402
import scene_manifest  # noqa: E402
import sources  # noqa: E402


def unit_record(district='Sylhet', horizon='7_days', digest='a' * 64, window=None):
    start, end = window or ('2026-09-08', '2026-09-17')
    return scene_manifest.unit_record(
        district_id=district.lower(), district_name=district, horizon=horizon,
        steps=[scene_manifest.step_record(
            step=9, window_start=start, window_end=end,
            collections=['COPERNICUS/S2_SR_HARMONIZED', 'COPERNICUS/S1_GRD'],
            tensor_digest=digest, shape=[9, 15, 8, 8],
        )],
        driver=scene_manifest.driver_record(
            source='open-meteo', url='https://api.open-meteo.com/v1/forecast',
            params={'latitude': 24.9, 'longitude': 91.87, 'forecast_days': 7},
            payload_sha256='b' * 64,
        ),
    )


# ── sources: the registry and the window arithmetic ─────────────────────────

def test_the_registry_names_every_collection_the_live_pipeline_reads():
    """The ingest must not describe a different stack from the one the model uses."""
    pipeline = (SCRIPTS / 'auto_forecast.py').read_text(encoding='utf-8')
    referenced = set(re.findall(r"'((?:COPERNICUS|LANDSAT|ECMWF)/[A-Za-z0-9_/]+)'", pipeline))
    referenced |= set(re.findall(r'"(ECMWF/[A-Za-z0-9_/]+)"', pipeline))
    assert 'COPERNICUS/S2_SR_HARMONIZED' in referenced
    assert 'COPERNICUS/S1_GRD' in referenced
    registered = {spec['asset'] for spec in sources.COLLECTIONS.values() if 'asset' in spec}
    assert referenced - registered == set(), f'not in the registry: {referenced - registered}'


def test_the_windows_are_nine_consecutive_decades_ending_at_the_prediction_date():
    windows = sources.ten_day_windows('2026-09-17')
    assert len(windows) == 9
    assert windows[0] == ('2026-06-19', '2026-06-29')
    assert windows[-1] == ('2026-09-07', '2026-09-17')
    assert windows[-1][1] == '2026-09-17'                 # the newest step ends "today"
    for (_, previous_end), (start, _) in zip(windows, windows[1:]):
        assert previous_end < start or start == previous_end
    from datetime import date
    for start, end in windows:
        assert (date.fromisoformat(end) - date.fromisoformat(start)).days == 10
    assert sources.ten_day_windows('2026-09-17', count=3)[0][1] == '2026-08-28'


def test_the_window_arithmetic_matches_the_live_pipeline_line_for_line():
    """`fetch_historical_steps` is the authority; this fails when the two drift."""
    pipeline = (SCRIPTS / 'auto_forecast.py').read_text(encoding='utf-8')
    assert 'for t in range(9, 0, -1):' in pipeline
    assert 'end_date = today - timedelta(days=(t-1)*10)' in pipeline
    assert 'start_date = end_date - timedelta(days=10)' in pipeline
    # …and the pipeline builds its units from this module, so there is one window
    # definition rather than two that happen to agree today.
    assert 'from sources import ten_day_windows' in pipeline
    assert 'windows = ten_day_windows(prediction_date)' in pipeline


def test_ten_day_windows_accepts_a_date_or_an_iso_string():
    from datetime import date
    assert sources.ten_day_windows(date(2026, 9, 17)) == sources.ten_day_windows('2026-09-17')


def test_the_monsoon_flag_marks_the_optical_gap_season():
    assert sources.is_monsoon('2026-07-15') is True
    assert sources.is_monsoon('2026-09-30') is True
    assert sources.is_monsoon('2026-01-15') is False
    assert sources.MONSOON_MONTHS == (6, 7, 8, 9)


# ── sources: adapters report gaps instead of inventing data ─────────────────

def test_the_sentinel2_fixture_filters_cloud_and_discloses_what_it_dropped():
    result = sources.sentinel2_window('2026-09-07', '2026-09-17', fixture='s2_scenes.json')
    assert result.ok is True
    assert [scene['id'] for scene in result['payload']['scenes']] == ['S2B_MSIL2A_20260912T044659']
    assert result['metadata']['discarded'] == 1
    assert result['metadata']['optical_gap'] is False
    assert result['metadata']['monsoon'] is True          # September is monsoon: say so
    assert result['fixture'] is True
    assert result['metadata']['asset'] == 'COPERNICUS/S2_SR_HARMONIZED'


def test_an_all_cloudy_window_is_reported_as_an_optical_gap_not_an_empty_composite():
    result = sources.sentinel2_window('2026-09-07', '2026-09-17', max_cloud_pct=1,
                                      fixture='s2_scenes.json')
    assert result.ok is False
    assert result['metadata']['optical_gap'] is True
    assert 'no scene under 1% cloud' in result['reason']
    gaps = sources.coverage_gaps([result])
    assert gaps[0]['optical_gap'] is True
    assert gaps[0]['source'] == 'sentinel-2'


def test_the_modis_and_era5_fixtures_carry_the_bands_the_soil_channels_need():
    modis = sources.modis_window('2026-09-05', '2026-09-20', fixture='modis_composites.json')
    assert modis.ok is True
    assert {composite['id'].split('_')[0] for composite in modis['payload']['composites']} == {'MOD13Q1', 'MOD11A1'}
    assert modis['metadata']['lst_asset'] == 'MODIS/061/MOD11A1'

    era5 = sources.era5_land_daily('2026-09-15', '2026-09-16', fixture='era5_days.json')
    assert era5.ok is True
    days = era5['payload']['days']
    assert len(days) == 2
    for day in days:
        # These three are why the adapter exists: they replace the fabricated soil
        # channels (PRODUCT_SPEC §5 fix log).
        assert day['volumetric_soil_water_layer_1'] is not None
        assert day['volumetric_soil_water_layer_3'] is not None
        assert day['soil_temperature_level_1_c'] is not None


def test_the_open_meteo_fixture_reports_the_hourly_block_and_its_request():
    result = sources.open_meteo_drivers(25.02, 91.87, fixture='open_meteo.json')
    assert result.ok is True
    assert result['metadata']['url'] == 'https://api.open-meteo.com/v1/forecast'
    assert result['metadata']['params']['forecast_days'] == 7
    assert result['payload']['responses'][0]['hourly']['soil_moisture_0_to_1cm'] == [0.41, 0.43]


def test_a_live_fetch_says_which_dependency_it_needs_instead_of_failing_at_import():
    sentinel = sources.sentinel2_window('2026-09-07', '2026-09-17')
    assert sentinel.ok is False
    assert 'ee' in sentinel['reason']
    modis = sources.modis_window('2026-09-05', '2026-09-20')
    era5 = sources.era5_land_daily('2026-09-15', '2026-09-16')
    assert modis.ok is False and era5.ok is False
    meteo = sources.open_meteo_drivers(24.9, 91.87)
    assert meteo.ok is False and 'requests' in meteo['reason']


def test_a_missing_fixture_is_an_error_not_an_empty_payload():
    with pytest.raises(FileNotFoundError) as excinfo:
        sources.load_fixture('does_not_exist.json')
    assert 'does_not_exist.json' in str(excinfo.value)


def test_the_fixture_directory_is_resolved_from_the_repository_not_the_cwd(tmp_path, monkeypatch):
    """`python -m etl.cli` runs from scripts/, tests run from the root, a workflow may
    run from anywhere — a cwd-relative default silently looks in the wrong place."""
    assert sources.FIXTURE_DIR == ROOT / 'scripts' / 'tests' / 'fixtures' / 'etl'
    monkeypatch.chdir(tmp_path)
    assert sources.load_fixture('s2_scenes.json')['scenes']        # still found
    assert sources.sentinel2_window('2026-09-07', '2026-09-17', fixture='s2_scenes.json').ok


def test_the_fetch_summary_separates_available_partial_and_failed_streams():
    ok = sources.sentinel2_window('2026-09-07', '2026-09-17', fixture='s2_scenes.json')
    failed = sources.modis_window('2026-09-05', '2026-09-20')
    summary = sources.summarize_fetches([ok, failed, dict(ok)])
    assert summary['sentinel-2']['attempted'] == 2
    assert summary['sentinel-2']['ok'] == 2
    assert summary['sentinel-2']['available'] is True
    assert summary['modis']['failed'] == 1
    assert summary['modis']['available'] is False
    assert summary['modis']['reasons'] == ['live Earth Engine fetch requires the `ee` extra']


def test_a_partly_failed_stream_is_neither_available_nor_failed():
    good = sources.era5_land_daily('2026-09-15', '2026-09-16', fixture='era5_days.json')
    bad = sources.era5_land_daily('2026-09-15', '2026-09-16')
    summary = sources.summarize_fetches([good, bad])
    assert summary['era5-land']['available'] is False
    assert summary['era5-land']['partial'] is True


# ── COG contract ────────────────────────────────────────────────────────────

def test_every_registered_source_has_a_valid_default_contract():
    for source in cog.BAND_SPECS:
        problems = cog.validate_cog_metadata(cog.default_metadata(source), source=source)
        assert problems == [], f'{source}: {problems}'
    assert cog.COG_SPEC['blocksize'] in cog.ALLOWED_BLOCKSIZES


def test_the_modis_lst_scale_is_per_band_not_the_ndvi_scale():
    assert cog.scale_factor('modis', 'NDVI') == 0.0001
    assert cog.scale_factor('modis', 'LST_Day_1km') == 0.02
    assert cog.to_physical('modis', 'LST_Day_1km', 15000) == pytest.approx(300.0)
    assert cog.to_physical('modis', 'NDVI', 6000) == pytest.approx(0.6)
    # Sentinel-2 L2A reflectance is 0.0001-scaled too (a 1234 DN is 0.1234).
    assert cog.scale_factor('sentinel-2', 'B4') == 0.0001
    assert cog.to_physical('sentinel-2', 'B4', 1234) == pytest.approx(0.1234)


@pytest.mark.parametrize('patch,expected', [
    ({'crs': 'EPSG:32646'}, 'not EPSG:4326'),
    ({'blocksize': 100}, 'must be one of'),
    ({'compression': 'NONE'}, 'compression'),
    ({'overview_levels': []}, 'is empty'),
    ({'overview_levels': [4, 2]}, 'strictly increasing'),
    ({'overview_levels': [3]}, 'not a power of two'),
    ({'overview_levels': None}, 'overview_levels is required'),
    ({'dtype': 'float32'}, 'does not match'),
    ({'scale': 0.02}, 'does not match'),          # the LST scale, not the NDVI one
])
def test_a_broken_cog_contract_names_the_problem(patch, expected):
    meta = cog.default_metadata('modis')
    meta.update(patch)
    problems = cog.validate_cog_metadata(meta, source='modis')
    assert any(expected in problem for problem in problems), problems


def test_an_undeclared_nodata_is_refused_and_a_known_source_is_required():
    meta = cog.default_metadata('sentinel-2')
    del meta['nodata']
    assert any('nodata must be declared' in problem
               for problem in cog.validate_cog_metadata(meta, source='sentinel-2'))
    assert cog.validate_cog_metadata({'crs': 'EPSG:4326'}, source='not-a-source') != []
    assert any('unknown source' in problem
               for problem in cog.validate_cog_metadata(cog.default_metadata('modis'), source='nope'))


def test_the_planned_job_is_content_addressed_with_an_exact_gdal_command():
    job = cog.plan_job(source='modis', item_id='MOD13Q1_A2026257_h27v06', band='NDVI',
                       href='s3://modis/MOD13Q1_A2026257_h27v06_NDVI.tif', acquired='2026-09-14')
    assert job['output'] == 'cog/modis/2026-09-14/MOD13Q1_A2026257_h27v06__NDVI.tif'
    command = job['translate_command']
    assert command[0] == 'gdal_translate' and command[1:3] == ['-of', 'COG']
    assert 'BLOCKSIZE=512' in command
    assert 'COMPRESS=DEFLATE' in command
    assert 'OVERVIEWS=AUTO' in command
    assert 'OVERVIEW_RESAMPLING=MODE' in command            # MODIS contract
    assert command[-2:] == ['s3://modis/MOD13Q1_A2026257_h27v06_NDVI.tif', job['output']]
    assert 'EPSG:4326' in command
    assert job['overview_command'][0] == 'gdaladdo'
    assert job['overview_command'][-5:] == ['2', '4', '8', '16', '32']  # the halving series
    # Paths are stable: the same job planned twice is the same archive path.
    again = cog.plan_job(source='modis', item_id='MOD13Q1_A2026257_h27v06', band='NDVI',
                         href='x', acquired='2026-09-14')
    assert again['output'] == job['output']


def test_an_unknown_band_or_source_is_refused_with_the_known_list():
    with pytest.raises(cog.CogError) as excinfo:
        cog.plan_job(source='modis', item_id='x', band='LST', href='x')
    assert 'unknown band' in str(excinfo.value)
    with pytest.raises(cog.CogError):
        cog.plan_job(source='goes-19', item_id='x', band='B4', href='x')


def test_the_fixture_plan_covers_every_item_and_reports_planned_files():
    plan = json.loads((FIXTURES / 'cog_jobs.json').read_text(encoding='utf-8'))
    jobs = cog.plan_jobs(plan['items'], root='/tmp/hazardnet-cog')
    assert [job['band'] for job in jobs] == ['B4', 'B8', 'NDVI', 'VV']
    manifest = cog.build_cog_manifest(jobs, produced_at='2026-09-17T00:00:00Z')
    assert manifest['schema'] == cog.SCHEMA
    assert manifest['counts'] == {'jobs': 4, 'present': 0, 'planned': 4}
    assert all(entry['status'] == 'planned' for entry in manifest['entries'])


def test_sniffing_identifies_a_tiff_container_and_rejects_other_files():
    little = struct.pack('<2sHI', b'II', 42, 8)
    assert cog.sniff_tiff(little) == {'is_tiff': True, 'byte_order': 'little', 'bigtiff': False,
                                      'first_ifd_offset': 8, 'phantom_cog': False}
    big = struct.pack('>2sHI', b'MM', 43, 8)
    assert cog.sniff_tiff(big)['bigtiff'] is True
    # A leading IFD offset of 0 means the layout is not streamable: a GeoTIFF, not a COG.
    assert cog.sniff_tiff(struct.pack('<2sHI', b'II', 42, 0))['phantom_cog'] is True
    assert cog.sniff_tiff(b'\x89PNG\r\n\x1a\n')['is_tiff'] is False
    assert cog.sniff_tiff(b'II')['reason'].startswith('file shorter')
    with pytest.raises(cog.CogError):
        cog.is_cog_like('/tmp/definitely-not-here.tif')


def test_verification_checks_structure_size_and_the_recorded_hash(tmp_path):
    path = tmp_path / 'tile.tif'
    path.write_bytes(struct.pack('<2sHI', b'II', 42, 8) + b'\x00' * 64)
    good = cog.verify_cog(path, meta={'bytes': path.stat().st_size, 'sha256': cog.sha256_file(path)})
    assert good['ok'] is True
    assert good['checks_run'] == ['tiff_header', 'size', 'sha256']

    tampered = cog.verify_cog(path, meta={'bytes': 999999, 'sha256': 'c' * 64})
    assert tampered['ok'] is False
    assert any('size' in problem for problem in tampered['problems'])
    assert any('sha256' in problem for problem in tampered['problems'])

    path.write_bytes(b'not a tiff at all, just text')
    assert cog.verify_cog(path)['ok'] is False


def test_the_manifest_reports_a_present_file_with_its_hash(tmp_path):
    job = cog.plan_job(source='sentinel-2', item_id='S2B_TEST', band='B4', href='s3://x/B04.jp2',
                       acquired='2026-09-12', root=str(tmp_path))
    Path(job['output']).parent.mkdir(parents=True, exist_ok=True)
    Path(job['output']).write_bytes(struct.pack('<2sHI', b'II', 42, 8) + b'\x00' * 16)
    manifest = cog.build_cog_manifest([job], produced_at='2026-09-17T00:00:00Z')
    assert manifest['counts'] == {'jobs': 1, 'present': 1, 'planned': 0}
    entry = manifest['entries'][0]
    assert entry['status'] == 'present' and len(entry['sha256']) == 64
    assert entry['overview_levels'] == [2, 4, 8, 16, 32]


def test_no_raster_writer_hid_inside_this_module():
    """A hand-rolled TIFF writer is how \"COG\" becomes \"not a COG\"."""
    source = (SCRIPTS / 'etl' / 'cog.py').read_text(encoding='utf-8')
    for forbidden in ('rasterio', 'tifffile', 'import gdal', 'from osgeo', "'wb'", '"wb"'):
        assert forbidden not in source, f'{forbidden} — writing rasters belongs to gdal_translate'
    assert 'gdal_translate' in source               # the writer this module delegates to
    assert 'def write_json' in source               # …and the only thing it does write


# ── scene manifest: versions that mean something ────────────────────────────

def test_dataset_version_is_content_addressed_and_stable():
    unit = unit_record()
    first = scene_manifest.dataset_version(unit)
    assert re.fullmatch(r'ds1\.[0-9a-f]{16}', first)
    assert scene_manifest.dataset_version(unit_record()) == first
    assert scene_manifest.dataset_version(unit_record(digest='c' * 64)) != first
    assert scene_manifest.dataset_version(
        unit_record(window=('2026-09-06', '2026-09-16'))) != first
    changed_driver = unit_record()
    changed_driver['driver']['payload_sha256'] = 'd' * 64
    assert scene_manifest.dataset_version(changed_driver) != first
    changed_collections = unit_record()
    changed_collections['steps'][0]['collections'] = ['COPERNICUS/S2_SR_HARMONIZED']
    assert scene_manifest.dataset_version(changed_collections) != first


def test_the_version_does_not_depend_on_the_order_the_pipeline_collected_things():
    unit = unit_record()
    reordered = unit_record()
    reordered['steps'][0]['collections'] = sorted(reordered['steps'][0]['collections'], reverse=True)
    assert scene_manifest.dataset_version(reordered) == scene_manifest.dataset_version(unit)

    two_steps = unit_record()
    two_steps['steps'].append(scene_manifest.step_record(
        step=0, window_start='2026-06-19', window_end='2026-06-29',
        collections=['COPERNICUS/S1_GRD'], tensor_digest='e' * 64, shape=[9, 15, 8, 8]))
    reversed_steps = dict(two_steps, steps=list(reversed(two_steps['steps'])))
    assert scene_manifest.dataset_version(reversed_steps) == scene_manifest.dataset_version(two_steps)
    # But the run id and the timestamp are deliberately *not* part of the version:
    # the same inputs on a re-run must reproduce it.
    assert scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1',
                                         units=[two_steps], run_id='run-a')['units'][0]['dataset_version'] \
        == scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v2',
                                         units=[reversed_steps], run_id='run-b')['units'][0]['dataset_version']


def test_a_unit_without_steps_cannot_be_versioned():
    with pytest.raises(scene_manifest.ManifestError):
        scene_manifest.dataset_version({'district_name': 'Sylhet', 'horizon': '7_days', 'steps': []})
    with pytest.raises(scene_manifest.ManifestError):
        scene_manifest.unit_record(district_id='x', district_name='X', horizon='7_days', steps=[])


def test_the_manifest_validates_and_refuses_to_write_a_tampered_one(tmp_path):
    manifest = scene_manifest.build_manifest(
        prediction_date='2026-09-17', pipeline_version='etl/1.0.0', model_version='2.1.9+model.x',
        units=[unit_record(), unit_record(horizon='15_days')], run_id='run-1')
    assert scene_manifest.validate_manifest(manifest) == []
    assert manifest['dataset_version'].startswith('ds-run.')
    assert manifest['scenes_enumerated'] is False

    path = tmp_path / 'scene-manifest.json'
    digest = scene_manifest.write_manifest(manifest, path)
    assert len(digest) == 64
    assert scene_manifest.read_manifest(path)['dataset_version'] == manifest['dataset_version']

    tamp = json.loads(path.read_text(encoding='utf-8'))
    tamp['units'][0]['dataset_version'] = 'ds1.0000000000000000'
    path.write_text(json.dumps(tamp), encoding='utf-8')
    problems = scene_manifest.validate_manifest(tamp)
    assert any('does not match the content hash' in problem for problem in problems)
    with pytest.raises(scene_manifest.ManifestError):
        scene_manifest.write_manifest(tamp, tmp_path / 'tampered.json')
    with pytest.raises(scene_manifest.ManifestError):
        scene_manifest.read_manifest(path)


def test_a_manifest_that_is_missing_a_piece_says_which_piece():
    manifest = scene_manifest.build_manifest(
        prediction_date='2026-09-17', pipeline_version='etl/1.0.0', units=[unit_record()])
    broken = json.loads(json.dumps(manifest))
    del broken['units'][0]['steps'][0]['tensor_sha256']
    problems = scene_manifest.validate_manifest(broken)
    assert any('missing tensor_sha256' in problem for problem in problems)
    # A step that cannot be hashed is not silently re-versioned: the recorded value
    # stays, and the missing field is reported on its own.
    assert not any('does not match the content hash' in problem for problem in problems)

    schema_broken = json.loads(json.dumps(manifest))
    schema_broken['schema'] = 'hazardnet-scene-manifest/v0'
    assert any('schema is' in problem for problem in scene_manifest.validate_manifest(schema_broken))
    assert scene_manifest.validate_manifest({'units': []}) != []


def test_duplicate_units_and_the_expected_unit_count_are_both_reported():
    duplicated = [unit_record(), unit_record()]
    manifest = scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1',
                                             units=duplicated)
    problems = scene_manifest.validate_manifest(manifest, expected_units=128)
    assert any('duplicate unit' in problem for problem in problems)
    assert any('covers 2 units, expected 128' in problem for problem in problems)


def test_the_unit_lookup_keys_are_strings_so_published_rows_can_be_stamped():
    manifest = scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1',
                                             units=[unit_record(district='Sylhet', horizon='7_days')])
    lookup = scene_manifest.unit_lookup(manifest)
    assert list(lookup) == [('sylhet', '7_days')]
    assert lookup[('sylhet', '7_days')].startswith('ds1.')
    # The pipeline's rows carry `district_id` as a string slug and `horizon` as the key.
    assert (str('sylhet'), '7_days') in lookup


def test_the_run_version_changes_when_any_unit_changes_but_not_when_order_does():
    manifest = scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1',
                                             units=[unit_record(horizon='7_days'),
                                                    unit_record(horizon='15_days', digest='f' * 64)])
    reordered = scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1',
                                              units=list(reversed(manifest['units'])))
    assert reordered['dataset_version'] == manifest['dataset_version']
    changed = scene_manifest.build_manifest(
        prediction_date='2026-09-17', pipeline_version='v1',
        units=[unit_record(horizon='7_days'), unit_record(horizon='15_days', digest='0' * 64)])
    assert changed['dataset_version'] != manifest['dataset_version']


def test_a_manifest_cannot_be_built_without_units():
    with pytest.raises(scene_manifest.ManifestError):
        scene_manifest.build_manifest(prediction_date='2026-09-17', pipeline_version='v1', units=[])


# ── the CLI a workflow actually calls ───────────────────────────────────────

def run_cli(*args, expect=0):
    process = subprocess.run(
        [sys.executable, '-m', 'etl.cli', *args], cwd=str(SCRIPTS),
        capture_output=True, text=True, timeout=120,
    )
    assert process.returncode == expect, f'exit {process.returncode}: {process.stdout}{process.stderr}'
    return json.loads(process.stdout) if process.stdout.strip() else {}


def test_the_cli_prints_the_district_snapshot_the_store_validates_against():
    report = run_cli('districts', '--verbose')
    assert report['command'] == 'districts'
    assert report['count'] == 64
    assert len(report['districts']) == 64
    assert 'Sylhet' in report['districts']
    assert len(report['divisions']) == 7   # GAUL spells two divisions the older way
    assert report['etl_version'].startswith('etl/')


def test_the_cli_ingests_events_and_reports_the_drift_against_2931(tmp_path):
    report = run_cli('events', '--input', str(FIXTURES / 'events_sample.csv'), '--dry-run')
    # A 9-row fixture legitimately fails the claim check: the run says so instead of
    # passing silently, and calls itself 'review' because of it.
    assert report['status'] == 'review'
    assert report['rows_ingested'] == 9
    assert report['rows_seen'] == 9
    assert report['claimed_total']['claimed'] == 2931
    assert report['claimed_total']['drift'] == -2922
    assert report['counts']['total'] == 9
    assert report['districts_covered'] == 9
    assert report['sql']['path'] is None


def test_the_cli_writes_the_load_script_and_a_run_report_only_when_asked(tmp_path):
    sql_path = tmp_path / 'events.sql'
    report_path = tmp_path / 'events-run.json'
    dry = run_cli('events', '--input', str(FIXTURES / 'events_sample.csv'),
                  '--emit-sql', str(sql_path), '--report', str(report_path), '--dry-run')
    assert dry['sql']['path'] is None
    assert not sql_path.exists() and not report_path.exists()

    run_cli('events', '--input', str(FIXTURES / 'events_sample.csv'),
            '--emit-sql', str(sql_path), '--report', str(report_path),
            '--source', 'ffwc-archive', '--run-id', 'test-run-1')
    script = sql_path.read_text(encoding='utf-8')
    assert 'insert into public.hazard_events' in script
    assert 'begin;' in script and script.rstrip().endswith('commit;')
    assert 'on conflict (event_id) do update set' in script
    assert 'test-run-1' in script                       # the audit row names the run
    assert 'public.hazard_event_ingest_runs' in script
    assert 'refresh materialized view concurrently' in script
    assert '2931' in script                             # the drift note travels with the data
    written = json.loads(report_path.read_text(encoding='utf-8'))
    assert written['run_id'] == 'test-run-1'
    assert written['sql']['statements'] == 1


def test_the_cli_refuses_a_batch_with_unmapped_or_invalid_rows_and_points_at_lenient():
    process = subprocess.run(
        [sys.executable, '-m', 'etl.cli', 'events', '--input', str(FIXTURES / 'events_mixed.json'),
         '--dry-run'], cwd=str(SCRIPTS), capture_output=True, text=True, timeout=120)
    assert process.returncode == 1
    report = json.loads(process.stdout)
    assert report['status'] == 'failed'
    assert report['reason'] == 'validation'
    assert 'landslide' in report['detail']              # the unmapped label is named

    lenient = run_cli('events', '--input', str(FIXTURES / 'events_mixed.json'), '--lenient', '--dry-run')
    assert lenient['rows_ingested'] == 3
    assert lenient['rows_rejected'] == 3
    assert lenient['rows_unmapped'] == 1


def test_the_cli_scores_the_hydrology_stream_and_merges_it_into_rows(tmp_path):
    report = run_cli('hydrology', '--input', str(FIXTURES / 'ffwc_stations.json'), '--dry-run')
    assert report['status'] == 'ok'
    assert report['stream']['stations'] == 4
    assert report['districts']['Sylhet']['stations_above_danger'] == 1

    rows = tmp_path / 'forecasts.csv'
    rows.write_text('district_name,hazard_type\nSylhet,Flood\nBhola,Flood\n', encoding='utf-8')
    merge = run_cli('hydrology', '--input', str(FIXTURES / 'ffwc_stations.json'),
                    '--rows', str(rows), '--write-rows')
    assert merge['merge']['rows_matched'] == 1
    written = rows.read_text(encoding='utf-8')
    assert 'hydrology_severity' in written
    assert merge['merge']['rows_written'] == str(rows)


def test_the_cli_parses_bmd_bulletins_into_advisories(tmp_path):
    advisories_path = tmp_path / 'advisories.json'
    report = run_cli('bulletins', '--input', str(FIXTURES / 'bmd_bulletins.json'),
                     '--advisories', str(advisories_path))
    assert report['status'] == 'ok'
    assert report['summary']['bulletins'] == 3
    assert report['summary']['localised'] == 2
    advisories = json.loads(advisories_path.read_text(encoding='utf-8'))
    assert len(advisories) == 9
    assert {advisory['confidence_kind'] for advisory in advisories} == {'official_bulletin'}


def test_the_cli_plans_cog_jobs_and_builds_a_scene_manifest(tmp_path):
    manifest_path = tmp_path / 'cog-manifest.json'
    commands_path = tmp_path / 'gdal.txt'
    cog_report = run_cli('cog', '--plan', str(FIXTURES / 'cog_jobs.json'),
                         '--manifest', str(manifest_path), '--commands', str(commands_path),
                         '--root', str(tmp_path / 'cog'))
    assert cog_report['status'] == 'ok'
    assert cog_report['counts'] == {'jobs': 4, 'present': 0, 'planned': 4}
    assert commands_path.read_text(encoding='utf-8').count('gdal_translate') == 4

    out = tmp_path / 'scene-manifest.json'
    scene_report = run_cli('scene-manifest', '--units', str(FIXTURES / 'scene_units.json'),
                           '--out', str(out), '--pipeline-version', 'etl/1.0.0')
    assert scene_report['status'] == 'ok'
    assert scene_report['problems'] == []
    # One of the fixture's two units is not enumerated, so the run is not either:
    # `scenes_enumerated` is an all() over the units, not a claim about the fixture.
    assert scene_report['scenes_enumerated'] is False
    assert list(scene_report['unit_versions']) == ['sylhet/7_days', 'kurigram/15_days']
    written = json.loads(out.read_text(encoding='utf-8'))
    assert scene_manifest.validate_manifest(written) == []
    assert written['dataset_version'] == scene_report['dataset_version']


def test_the_cli_fails_loudly_on_a_bad_plan_or_a_broken_unit_list(tmp_path):
    empty_plan = tmp_path / 'empty.json'
    empty_plan.write_text('{"items": []}', encoding='utf-8')
    assert run_cli('cog', '--plan', str(empty_plan), '--dry-run', expect=1)['reason'] == 'plan has no items'

    bad_units = tmp_path / 'units.json'
    bad_units.write_text('{"units": []}', encoding='utf-8')
    scene = run_cli('scene-manifest', '--units', str(bad_units), '--dry-run', expect=1)
    assert scene['reason'] == 'no units in input'


def test_the_cli_reports_a_missing_input_as_a_failure_not_a_traceback():
    report = run_cli('events', '--input', '/tmp/no-such-events.csv', '--dry-run', expect=1)
    assert report['status'] == 'failed'
    assert 'no-such-events.csv' in report['reason']


def test_the_cli_rejects_an_unknown_command_with_the_usage_exit_code():
    process = subprocess.run([sys.executable, '-m', 'etl.cli', 'frobnicate'],
                             cwd=str(SCRIPTS), capture_output=True, text=True, timeout=120)
    assert process.returncode == 2


def test_the_cli_exposes_every_documented_subcommand():
    process = subprocess.run([sys.executable, '-m', 'etl.cli', '--help'],
                             cwd=str(SCRIPTS), capture_output=True, text=True, timeout=120)
    assert process.returncode == 0
    for command in ('districts', 'events', 'hydrology', 'bulletins', 'cog', 'scene-manifest'):
        assert command in process.stdout
    version = subprocess.run([sys.executable, '-m', 'etl.cli', '--version'],
                             cwd=str(SCRIPTS), capture_output=True, text=True, timeout=120)
    assert version.stdout.strip().startswith('etl/')
