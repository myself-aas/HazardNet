"""Offline contract tests: no credentials or actual Kaggle compute required."""
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from forecast_contract import APPROVED_ARTIFACTS, CSV_NAME, MANIFEST_NAME, sha256, validate_output
from kaggle_trigger import instrument, run, source_digest
from make_fixture_csv import notebook_rows


@pytest.fixture
def output(tmp_path):
    now = datetime.now(timezone.utc)
    columns, rows = notebook_rows(now.date().isoformat())
    expected = dict(run_id='test-run', kernel='test/kernel', source_sha256='a'*64,
                    requested_at=now.isoformat(), kaggle_version=12)
    manifest = {**expected, 'started_at': now.isoformat(), 'completed_at': now.isoformat(),
                'contract_version': 'hazardnet-si-v1', 'model_sha256': APPROVED_ARTIFACTS['hazardnet_fp32.tflite'],
                'normalization_sha256': APPROVED_ARTIFACTS['normalization_stats.json']}
    def write(changed=rows, changes=None):
        with (tmp_path / CSV_NAME).open('w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=columns)
            writer.writeheader()
            writer.writerows(changed)
        m = {**manifest, 'csv_sha256': sha256(tmp_path / CSV_NAME), **(changes or {})}
        (tmp_path / MANIFEST_NAME).write_text(json.dumps(m))
    write()
    return tmp_path, expected, rows, write


def test_complete_si_output_converted_once(output):
    folder, expected, _, _ = output
    result = validate_output(folder, expected)
    assert len(result['rows']) == 128
    row = result['rows'][0]
    assert row['temperature_mean'] == pytest.approx(27)
    assert row['evapotranspiration_mm'] == pytest.approx(5/7)
    assert row['solar_radiation_mj_m2'] == pytest.approx(18/7)
    assert result['manifest']['kaggle_version'] == 12


@pytest.mark.parametrize('mutation', ['partial', 'duplicate', 'celsius', 'nan', 'target', 'future', 'district', 'identity', 'hazard', 'confidence', 'et'])
def test_invalid_csv_never_publishable(output, mutation):
    folder, expected, rows, write = output
    if mutation == 'partial': rows.pop()
    elif mutation == 'duplicate': rows[1] = rows[0]
    else:
        key, value = {
            'celsius': ('om_temp_2m_k', 28), 'nan': ('model_severity', 'NaN'),
            'target': ('target_date', '2020-01-01'), 'future': ('prediction_date', '2099-01-01'),
            'district': ('district_name', 'MissingDistrict'), 'identity': ('district_id', 999),
            'hazard': ('hazard_type', 'Unknown'), 'confidence': ('confidence', 1.1),
            'et': ('om_et_sum_m', 45),
        }[mutation]
        rows[0][key] = value
    write(rows)
    with pytest.raises(ValueError): validate_output(folder, expected)


@pytest.mark.parametrize('changes', [dict(run_id='old-run'), dict(csv_sha256='e'*64),
    dict(contract_version='legacy'), dict(model_sha256=''), dict(model_sha256='f'*64), dict(normalization_sha256='f'*64),
    dict(completed_at='2020-01-01T00:00:00+00:00'), dict(started_at='2099-01-01T00:00:00+00:00')])
def test_wrong_provenance_rejected(output, changes):
    folder, expected, rows, write = output
    write(rows, changes)
    with pytest.raises(ValueError): validate_output(folder, expected)


CELLS = [dict(cell_type='code', metadata={}, source=['print("reviewed")\n'], outputs=[], execution_count=None)]


def notebook(folder):
    Path(folder, 'kernel-metadata.json').write_text(json.dumps(dict(id='test/kernel', kernel_type='notebook',
        language='python', is_private=True, code_file='forecast.ipynb')))
    Path(folder, 'forecast.ipynb').write_text(json.dumps(dict(cells=CELLS)))


def test_injection_idempotent_and_approval_required(tmp_path):
    notebook(tmp_path)
    digest = source_digest(CELLS)
    instrument(tmp_path, 'test/kernel', 'run1', digest)
    instrument(tmp_path, 'test/kernel', 'run2', digest)
    result = json.loads((tmp_path / 'forecast.ipynb').read_text())
    assert len(result['cells']) == 3
    assert 'run1' not in json.dumps(result)
    assert 'run2' in json.dumps(result)
    with pytest.raises(ValueError, match='not approved'):
        instrument(tmp_path, 'test/kernel', 'run3', 'd'*64)


class FakeApi:
    def __init__(self, output, error=None, state='complete', stale=False):
        self.fixture, _, self.rows, self.write = output
        self.error, self.state, self.stale = error, state, stale
        self.pushes, self.downloads = 0, 0
    def kernels_pull(self, kernel, path, **kwargs): notebook(path)
    def kernels_push(self, path):
        self.pushes += 1
        header = json.loads(Path(path, 'forecast.ipynb').read_text())['cells'][0]['source']
        import ast
        assignment = next(line for line in header.splitlines() if line.startswith('_hn_run = '))
        self.expected = ast.literal_eval(assignment.split(' = ', 1)[1])
        return SimpleNamespace(error=self.error, version_number=13)
    def kernels_status(self, kernel): return SimpleNamespace(status=self.state)
    def kernels_output(self, kernel, path, **kwargs):
        self.downloads += 1
        changes = self.expected.copy()
        # Old complete output must be ignored even though status says complete.
        if self.stale or self.downloads == 1: changes['run_id'] = 'old-run'
        self.write(self.rows, changes)
        for name in (CSV_NAME, MANIFEST_NAME):
            Path(path, name).write_bytes((self.fixture / name).read_bytes())


def test_push_then_old_complete_then_matching_output(output, tmp_path):
    api = FakeApi(output)
    ticks = [0]
    result = run(api, 'test/kernel', source_digest(CELLS), tmp_path / 'out',
                 clock=lambda: ticks[0], sleep=lambda n: ticks.__setitem__(0, ticks[0]+n))
    assert api.pushes == 1 and api.downloads == 2
    assert result['manifest']['kaggle_version'] == 13
    assert (tmp_path / 'out/publication.json').exists()


def test_failed_push_never_downloads(output, tmp_path):
    api = FakeApi(output, error='quota')
    with pytest.raises(RuntimeError, match='confirm'):
        run(api, 'test/kernel', source_digest(CELLS), tmp_path / 'out')
    assert api.downloads == 0


@pytest.mark.parametrize('state,stale', [('running', False), ('complete', True)])
def test_timeout_never_writes_publication(output, tmp_path, state, stale):
    api = FakeApi(output, state=state, stale=stale)
    ticks = [0]
    with pytest.raises(TimeoutError):
        run(api, 'test/kernel', source_digest(CELLS), tmp_path / 'out', timeout=60,
            clock=lambda: ticks[0], sleep=lambda n: ticks.__setitem__(0, ticks[0]+n))
    assert not (tmp_path / 'out/publication.json').exists()


def test_failed_execution_stops(output, tmp_path):
    with pytest.raises(RuntimeError, match='execution failed'):
        run(FakeApi(output, state='error'), 'test/kernel', source_digest(CELLS), tmp_path / 'out')


def test_matching_run_invalid_csv_fails_immediately(output, tmp_path):
    api = FakeApi(output)
    api.rows.pop()
    ticks = [0]
    with pytest.raises(ValueError, match='Triggered run produced invalid output'):
        run(api, 'test/kernel', source_digest(CELLS), tmp_path / 'out',
            clock=lambda: ticks[0], sleep=lambda n: ticks.__setitem__(0, ticks[0]+n))
    assert api.downloads == 2 and ticks[0] == 30
    assert not (tmp_path / 'out/publication.json').exists()
