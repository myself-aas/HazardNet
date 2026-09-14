#!/usr/bin/env python3
"""Pull approved source, push a NEW Kaggle version, wait and verify its output.

Kaggle 1.8.4 status/output endpoints are latest-only, not version-selectable.
An injected nonce + CSV digest binds downloaded output to our actual execution.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from forecast_contract import CSV_NAME, MANIFEST_NAME, validate_output

TAG = 'hazardnet-automation'


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def source_cells(notebook):
    return [cell for cell in notebook['cells'] if TAG not in cell.get('metadata', {}).get('tags', [])]


def source_digest(cells):
    # Ignore execution outputs/counts/metadata; Kaggle rewrites source lists as strings.
    source = [{'cell_type': c['cell_type'], 'source': ''.join(c['source'])} for c in cells]
    return hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()


def instrument(folder, kernel, run_id, approved_sha):
    folder = Path(folder)
    meta = json.loads((folder / 'kernel-metadata.json').read_text())
    if meta['id'] != kernel or meta['kernel_type'] != 'notebook' or meta['language'] != 'python':
        raise ValueError('Expected the configured Python notebook identity')
    # EE credentials are attached: never push a public notebook or change its input access.
    if meta.get('is_private') not in (True, 'true'):
        raise ValueError('Production forecast notebook must be private')
    code = (folder / meta['code_file']).resolve()
    if folder.resolve() not in code.parents or code.suffix != '.ipynb':
        raise ValueError('Unsafe notebook code_file')
    notebook = json.loads(code.read_text())
    cells = source_cells(notebook)
    digest = source_digest(cells)
    if digest != approved_sha:
        raise ValueError(f'Notebook source not approved; reviewed-source SHA256 is {digest}')
    expected = dict(run_id=run_id, kernel=kernel, source_sha256=digest, requested_at=utcnow())
    header = f'''import datetime as _hn_dt
from pathlib import Path as _hn_Path
import hashlib as _hn_hash, json as _hn_json
_hn_run = {expected!r}
_hn_run['started_at'] = _hn_dt.datetime.now(_hn_dt.timezone.utc).isoformat()
for _hn_name in ('{CSV_NAME}', '{MANIFEST_NAME}'):
    _hn_Path('/kaggle/working', _hn_name).unlink(missing_ok=True)
'''
    footer = f'''# This declaration MUST be supplied by reviewed, scientifically corrected notebook source.
assert HAZARDNET_FORECAST_CONTRACT == 'hazardnet-si-v1', 'SI contract not implemented'
_hn_run['contract_version'] = HAZARDNET_FORECAST_CONTRACT
_hn_run['model_sha256'] = _hn_hash.sha256(_hn_Path(HAZARDNET_MODEL_PATH).read_bytes()).hexdigest()
_hn_run['normalization_sha256'] = _hn_hash.sha256(_hn_Path(HAZARDNET_NORMALIZATION_PATH).read_bytes()).hexdigest()
_hn_run['csv_sha256'] = _hn_hash.sha256(_hn_Path('/kaggle/working/{CSV_NAME}').read_bytes()).hexdigest()
_hn_run['completed_at'] = _hn_dt.datetime.now(_hn_dt.timezone.utc).isoformat()
_hn_Path('/kaggle/working/{MANIFEST_NAME}').write_text(_hn_json.dumps(_hn_run))
'''
    def cell(source):
        return dict(cell_type='code', metadata={'tags': [TAG]}, execution_count=None, outputs=[], source=source)
    notebook['cells'] = [cell(header), *cells, cell(footer)]
    code.write_text(json.dumps(notebook))
    return expected


def run(api, kernel, approved_sha, output, timeout=90*60, poll_interval=30, clock=time.monotonic, sleep=time.sleep):
    if not re.fullmatch(r'[\w-]+/[\w-]+', kernel):
        raise ValueError('Set KAGGLE_KERNEL to owner/notebook-slug')
    if not re.fullmatch('[0-9a-f]{64}', approved_sha):
        raise ValueError('Configure KAGGLE_SOURCE_SHA256 after reviewing notebook source')
    run_id = f"{os.getenv('GITHUB_RUN_ID', 'local')}-{os.getenv('GITHUB_RUN_ATTEMPT', '1')}-{uuid.uuid4().hex}"
    with tempfile.TemporaryDirectory() as temp:
        source, download = Path(temp) / 'source', Path(temp) / 'download'
        source.mkdir()
        api.kernels_pull(kernel, str(source), metadata=True, quiet=True)
        expected = instrument(source, kernel, run_id, approved_sha)
        response = api.kernels_push(str(source))  # NEVER retry an ambiguous push or poll old output on failure.
        if response.error or not response.version_number:
            raise RuntimeError('Kaggle did not confirm a new version')
        for field in ('invalid_dataset_sources', 'invalid_kernel_sources', 'invalid_model_sources'):
            if getattr(response, field, None):
                raise RuntimeError(f'Kaggle rejected inputs: {field}')
        expected['kaggle_version'] = response.version_number
        print(f"Triggered {kernel} version {response.version_number}; run {run_id}", flush=True)
        deadline = clock() + timeout
        last_error = 'Output has not arrived'
        while clock() < deadline:
            status = api.kernels_status(kernel).status
            status = getattr(status, 'name', str(status)).lower().split('.')[-1]
            print(f'Kaggle status: {status}', flush=True)
            if status in ('error', 'failed', 'canceled', 'cancelled', 'cancel_requested', 'cancel_acknowledged'):
                raise RuntimeError(f'Kaggle execution failed: {status}')
            if status not in ('queued', 'running', 'complete', 'new_script'):
                raise RuntimeError(f'Unexpected Kaggle status: {status}')
            if status == 'complete':
                download.mkdir(exist_ok=True)
                # Clear only expected outputs on every attempt; an old local file cannot satisfy a retry.
                for name in (CSV_NAME, MANIFEST_NAME):
                    (download / name).unlink(missing_ok=True)
                api.kernels_output(kernel, str(download), file_pattern=r'^(hazardnet_forecasts_latest\.csv|hazardnet_run\.json)$', force=True)
                try:
                    result = validate_output(download, expected)
                except (ValueError, KeyError, FileNotFoundError) as exc:
                    # Latest-only endpoints can momentarily return the previous completed run.
                    marker = download / MANIFEST_NAME
                    if marker.exists() and (download / CSV_NAME).exists():
                        try:
                            matches = json.loads(marker.read_text()).get('run_id') == run_id
                        except ValueError:
                            matches = False
                        if matches:
                            raise ValueError(f'Triggered run produced invalid output: {exc}') from exc
                    last_error = str(exc)
                    print(f'Not publishable: {last_error}', flush=True)
                else:
                    out = Path(output)
                    out.mkdir(parents=True, exist_ok=True)
                    (out / 'publication.json').write_text(json.dumps(result, allow_nan=False))
                    for name in (CSV_NAME, MANIFEST_NAME):
                        (out / name).write_bytes((download / name).read_bytes())
                    print(f"Validated {len(result['rows'])} rows for triggered version {response.version_number}")
                    return result
            sleep(min(poll_interval, max(0, deadline - clock())))
        raise TimeoutError(f'Kaggle run/output deadline exceeded: {last_error}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kernel', default=os.getenv('KAGGLE_KERNEL', ''))
    parser.add_argument('--source-sha256', default=os.getenv('KAGGLE_SOURCE_SHA256', ''))
    parser.add_argument('--output', default='.forecast-run')
    parser.add_argument('--timeout-minutes', type=int, default=90)
    args = parser.parse_args()
    if not 1 <= args.timeout_minutes <= 100:
        parser.error('timeout-minutes must be between 1 and 100')
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
    run(api, args.kernel, args.source_sha256, args.output, args.timeout_minutes * 60)


if __name__ == '__main__':
    main()
