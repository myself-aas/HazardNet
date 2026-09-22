"""kaggle_trigger.py — status classification + actionable failure output.

The three Kaggle-backed workflows (forecast-pipeline, hourly, weekly) all died
with a bare `exit code 1` at the first Kaggle call, which identified neither of
the two live causes: a rejected token (401/403) or a renamed notebook (404).
This pins the classification helpers and runs the script end-to-end against a
fake `kaggle` CLI for each signature.
"""

import importlib.util
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TRIGGER = ROOT / 'scripts' / 'kaggle_trigger.py'


def _load_module():
    spec = importlib.util.spec_from_file_location('kaggle_trigger', TRIGGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kt = _load_module()


# ---------------------------------------------------------------------------
# classify_status
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('output', [
    'KernelWorkerStatus.COMPLETE',
    'KernelWorkerStatus complete',
    'kernel status: complete',
])
def test_classify_complete(output):
    assert kt.classify_status(output) == 'complete'


@pytest.mark.parametrize('output', [
    'KernelWorkerStatus.ERROR',
    'KernelWorkerStatus.CANCEL_ACKNOWLEDGED',
    'Run failed',
    '401 Client Error: Unauthorized for url: https://www.kaggle.com/api/v1/kernels/status',
])
def test_classify_failed(output):
    assert kt.classify_status(output) == 'failed'


@pytest.mark.parametrize('output', [
    'KernelWorkerStatus.RUNNING',
    'KernelWorkerStatus.QUEUED',
    'Kernel has never been run',
    '',
])
def test_classify_pending(output):
    assert kt.classify_status(output) == 'pending'


def test_complete_wins_over_failure_keywords():
    """A summary line containing both words must not read as a failure."""
    assert kt.classify_status('complete (0 errors)') == 'complete'


# ---------------------------------------------------------------------------
# failure_hint
# ---------------------------------------------------------------------------

def test_hint_for_rejected_credentials():
    hint = kt.failure_hint('401 Client Error: Unauthorized', 'user/kernel')
    assert 'KAGGLE_USERNAME' in hint and 'KAGGLE_KEY' in hint


def test_hint_for_missing_kernel_names_the_variable():
    hint = kt.failure_hint('404 Client Error: Not Found for url', 'old/slug')
    assert 'KAGGLE_KERNEL' in hint
    assert 'old/slug' in hint


def test_hint_is_empty_when_signature_is_unknown():
    assert kt.failure_hint('KernelWorkerStatus.ERROR', 'user/kernel') == ''


# ---------------------------------------------------------------------------
# End-to-end against a fake `kaggle` CLI
# ---------------------------------------------------------------------------

FAKE_KAGGLE = """#!/usr/bin/env bash
if [ "$1" = "kernels" ] && [ "$2" = "status" ]; then
  echo "$FAKE_STATUS"
  exit "${FAKE_STATUS_EXIT:-0}"
fi
if [ "$1" = "kernels" ] && [ "$2" = "list" ]; then
  echo "ref  title  lastRun"
  exit 0
fi
exit 0
"""


def _run(tmp_path, status, status_exit='0'):
    bindir = tmp_path / 'bin'
    bindir.mkdir(exist_ok=True)
    fake = bindir / 'kaggle'
    fake.write_text(FAKE_KAGGLE, encoding='utf-8')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)

    env = dict(os.environ)
    env['PATH'] = f'{bindir}{os.pathsep}{env["PATH"]}'
    env['FAKE_STATUS'] = status
    env['FAKE_STATUS_EXIT'] = status_exit

    return subprocess.run(
        [sys.executable, str(TRIGGER), '--kernel', 'user/kernel',
         '--max-retries', '2', '--poll-interval', '1'],
        capture_output=True, text=True, env=env, cwd=str(ROOT), timeout=120,
    )


def test_complete_status_exits_zero(tmp_path):
    result = _run(tmp_path, 'KernelWorkerStatus.COMPLETE')
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'completed successfully' in result.stdout


def test_rejected_credentials_exit_one_with_annotation(tmp_path):
    result = _run(tmp_path, '401 Client Error: Unauthorized', status_exit='1')
    assert result.returncode == 1
    assert '::error::' in result.stdout
    assert 'KAGGLE_USERNAME' in result.stdout
    # Diagnostics still run (they are best effort, not a second failure).
    assert 'Kaggle diagnostics' in result.stdout


def test_renamed_notebook_names_the_override(tmp_path):
    result = _run(tmp_path, '404 Client Error: Not Found', status_exit='1')
    assert result.returncode == 1
    assert 'KAGGLE_KERNEL' in result.stdout


def test_pending_status_times_out_without_a_false_pass(tmp_path):
    result = _run(tmp_path, 'KernelWorkerStatus.RUNNING')
    assert result.returncode == 1
    assert '::error::' in result.stdout
    assert 'Timeout' in result.stdout or 'Timed out' in result.stdout


def test_never_run_kernel_gets_a_pointer_not_silence(tmp_path):
    result = _run(tmp_path, 'Kernel has never been run')
    assert result.returncode == 1
    assert 'never been run' in result.stdout
    assert 'kaggle kernels push' in result.stdout
