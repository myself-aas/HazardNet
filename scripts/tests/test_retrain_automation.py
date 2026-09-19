"""The unattended retrain: run state, the Colab CLI wrapper, and the bundle gate.

What is being pinned here is the part of the pipeline nobody can watch. A monthly
retrain is launched by cron, trains for hours on a VM that Google can recycle at
any moment, and is observed by a *different* workflow twenty minutes later. Three
things therefore have to be exactly right, and all three are testable offline:

* **the state machine** — `classify()` must not confuse "in a long epoch" with
  "the session died", because the responses are opposite (leave it alone vs.
  relaunch with `--resume`). Every branch is exercised against a fixed clock.
* **the manifest gate** — a bundle may only become a promotion candidate when its
  manifest describes artifacts that exist, at plausible sizes, with hashes, fold
  metrics inside 0..1, and a parity number that proves the conversion did not
  change predictions. A missing field must be a *named* problem, never a pass.
* **the CLI wrapper** — every call timed out, every failure carrying the command
  and the tail of the output, the detached launch parsing a pid, and the OAuth
  token written 0600 and never echoed. Driven against a stub `colab` on PATH, so
  no network and no Google account are involved.

Also here: the run marker directory the workflows commit into, and the resume
discovery that makes a relaunched attempt a continuation rather than a restart.
"""

import json
import os
import pathlib
import re
import stat
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))

from mlops import colab_session as cs  # noqa: E402
from mlops import retrain_cli  # noqa: E402
from mlops import retrain_state as rs  # noqa: E402

MODELS = ROOT / 'Models'

NOW = rs.parse_stamp('2026-10-01T18:00:00Z')


def _marker(**overrides):
    marker = rs.new_marker(
        '20261001T180000-event_kfold',
        strategy='event_kfold',
        notebook_sha256='a' * 64,
        repo_sha='f2ef061',
        session='fake-session',
        now=NOW,
    )
    marker.update(overrides)
    return marker


def _good_manifest(**overrides):
    manifest = rs.manifest_doc(
        '20261001T180000-event_kfold',
        strategy='event_kfold',
        folds=[{'fold': 'event_0', 'accuracy': 0.91, 'f1': 0.88, 'rmse': 0.31, 'mae': 0.22, 'r2': 0.61}],
        parity={'hazard_agreement_pct': 99.97, 'severity_mae': 0.001},
        environment={'torch': '2.4.0', 'tensorflow': '2.17.0', 'python': '3.11', 'gpu': 'Tesla T4', 'cuda': '12.1'},
        artifacts=[
            {'name': name, 'present': True, 'bytes': 790_000 if name.endswith('.tflite') else 400,
             'sha256': 'b' * 64, 'role': 'model' if name.endswith('.tflite') else 'support'}
            for name in rs.REQUIRED_ARTIFACTS
        ],
        notebook_sha256='a' * 64,
        repo_sha='f2ef061',
        started_at='2026-10-01T18:00:00Z',
        duration_seconds=28_000.0,
        now=NOW,
    )
    manifest.update(overrides)
    return manifest


# ── run identity and markers ─────────────────────────────────────────────────


def test_run_id_is_sortable_and_carries_the_strategy():
    run_id = rs.new_run_id('event_kfold', now=NOW)
    assert run_id == '20261001T180000-event_kfold'
    assert rs.RUN_ID_RE.match(run_id)
    assert rs.RUN_ID_RE.match(rs.new_run_id('spatial_lodo', now=NOW, attempt=3))
    assert rs.new_run_id('spatial_lodo', now=NOW, attempt=3).endswith('-r3')


def test_a_relaunched_attempt_reuses_the_run_id_so_the_marker_stays_one_file():
    """Two attempts of one monthly run must not look like two runs."""
    marker = _marker(attempt=1)
    marker['attempt'] = 2
    assert rs.marker_path(marker['run_id'], ROOT).name == '20261001T180000-event_kfold.json'


def test_marker_records_identity_not_prediction(tmp_path):
    marker = _marker()
    path = rs.atomic_write_json(tmp_path / 'run.json', marker)
    back = rs.read_json(path)
    assert back['schema'] == rs.SCHEMA_RUN
    assert back['status'] == 'provisioning'
    assert back['notebook_sha256'] == 'a' * 64
    assert back['expected_artifacts'] == list(rs.REQUIRED_ARTIFACTS)
    assert back['vm_run_dir'].startswith(rs.VM_RUN_ROOT)
    assert back['drive_run_dir'].startswith(rs.DRIVE_ROOT)
    # No half-written file may ever be visible to a reader on the other machine.
    assert not list(tmp_path.glob('.*.tmp'))


def test_drive_path_uses_one_spelling(tmp_path):
    """The notebook used to `cd` into "HazardNet Deployment" and read
    "HazardNet_Deployment"; the contract now fixes one form for both sides."""
    assert ' ' not in rs.DRIVE_ROOT
    assert rs.DRIVE_ROOT.endswith('HazardNet_Deployment')
    assert rs.DRIVE_RETRAIN_SUBDIR in _marker()['drive_run_dir']


def test_active_marker_is_the_newest_non_terminal_one(tmp_path):
    repo = tmp_path
    (repo / rs.RUN_MARKER_DIR).mkdir(parents=True)
    older = _marker(run_id='20260901T180000-event_kfold', created_at='2026-09-01T18:00:00Z', status='complete')
    newer = _marker(created_at='2026-10-01T18:00:00Z', status='training')
    rs.atomic_write_json(repo / rs.RUN_MARKER_DIR / f"{older['run_id']}.json", older)
    rs.atomic_write_json(repo / rs.RUN_MARKER_DIR / f"{newer['run_id']}.json", newer)
    assert rs.active_marker(repo)['run_id'] == newer['run_id']
    assert len(rs.list_markers(repo)) == 2

    newer['status'] = 'complete'
    rs.atomic_write_json(repo / rs.RUN_MARKER_DIR / f"{newer['run_id']}.json", newer)
    assert rs.active_marker(repo) is None


def test_events_are_capped_so_a_long_run_cannot_grow_the_marker_forever():
    marker = _marker()
    for index in range(60):
        rs.append_event(marker, f'event {index}', now=NOW)
    assert len(marker['events']) == 40
    assert marker['events'][-1]['message'] == 'event 59'


# ── heartbeat ────────────────────────────────────────────────────────────────


def test_heartbeat_only_carries_what_was_measured():
    """A heartbeat that could not read the loss still proves the session is alive."""
    doc = rs.heartbeat_doc('20261001T180000-event_kfold', phase='training', fold='event_0', epoch=12, epochs=50,
                           now=NOW)
    assert doc['at'] == '2026-10-01T18:00:00Z'
    assert doc['epoch'] == 12 and doc['epochs'] == 50
    assert 'val_loss' not in doc and 'message' not in doc
    assert doc['pid'] == os.getpid()


def test_heartbeat_is_mirrored_and_a_drive_failure_does_not_kill_it(tmp_path):
    vm = tmp_path / 'vm'
    beat = rs.heartbeat_doc('r', phase='training', epoch=1, epochs=50, now=NOW)
    written = rs.write_heartbeat(vm, beat, mirror_dir=tmp_path / 'drive')
    assert rs.read_json(written) == beat
    assert rs.read_json(tmp_path / 'drive' / 'heartbeat.json') == beat
    # A mirror path that cannot be written (Drive FUSE unplugged) must not raise.
    rs.write_heartbeat(vm, beat, mirror_dir=tmp_path / 'nope' / 'deeper' / 'still')


# ── the state machine ────────────────────────────────────────────────────────


def test_classify_provisioning_then_stalled_when_no_heartbeat_ever_arrives():
    marker = _marker()
    status, reason = rs.classify(marker, None, None, now=NOW)
    assert status == 'provisioning'

    ten_minutes = rs.parse_stamp('2026-10-01T18:10:00Z')
    assert rs.classify(marker, None, None, now=ten_minutes)[0] == 'provisioning'

    an_hour = rs.parse_stamp('2026-10-01T19:00:00Z')
    status, reason = rs.classify(marker, None, None, now=an_hour)
    assert status == 'stalled'
    assert 'free tier' in reason


def test_classify_training_while_the_heartbeat_is_fresh():
    marker = _marker(status='training')
    beat = rs.heartbeat_doc(marker['run_id'], phase='training', fold='event_0', epoch=31, epochs=50,
                            val_loss=0.42, val_acc=0.9, now=rs.parse_stamp('2026-10-01T23:50:00Z'))
    status, reason = rs.classify(marker, beat, None, now=rs.parse_stamp('2026-10-02T00:00:00Z'))
    assert status == 'training'
    assert 'epoch 31/50' in reason


def test_classify_silence_older_than_the_window_means_the_session_is_gone():
    """This is the distinction the whole watcher exists to make."""
    marker = _marker(status='training')
    beat = rs.heartbeat_doc(marker['run_id'], phase='training', epoch=31, epochs=50,
                            now=rs.parse_stamp('2026-10-01T23:00:00Z'))
    status, reason = rs.classify(marker, beat, None, now=rs.parse_stamp('2026-10-02T00:00:00Z'))
    assert status == 'stalled'
    assert '60 minutes old' in reason and 'recycled' in reason


def test_classify_a_long_epoch_inside_the_window_is_left_alone():
    marker = _marker(status='training')
    beat = rs.heartbeat_doc(marker['run_id'], phase='training', epoch=31, epochs=50,
                            now=rs.parse_stamp('2026-10-01T23:40:00Z'))
    status, _ = rs.classify(marker, beat, None, now=rs.parse_stamp('2026-10-02T00:00:00Z'))
    assert status == 'training'


def test_classify_conversion_phase():
    marker = _marker()
    beat = rs.heartbeat_doc(marker['run_id'], phase='converting', message='ONNX exported',
                            now=rs.parse_stamp('2026-10-02T02:00:00Z'))
    status, reason = rs.classify(marker, beat, None, now=rs.parse_stamp('2026-10-02T02:05:00Z'))
    assert status == 'converting' and 'converter' in reason


def test_classify_complete_only_when_the_manifest_validates():
    marker = _marker()
    status, reason = rs.classify(marker, None, _good_manifest(), now=NOW)
    assert status == 'complete' and '5 artifacts' in reason


def test_classify_a_present_but_unpromotable_manifest_is_a_failure_not_a_completion():
    marker = _marker()
    bad = _good_manifest()
    bad['parity'] = {'hazard_agreement_pct': 91.0}
    status, reason = rs.classify(marker, None, bad, now=NOW)
    assert status == 'failed'
    assert 'not promotable' in reason


def test_classify_gives_up_past_the_attempt_budget():
    marker = _marker()
    beat = rs.heartbeat_doc(marker['run_id'], phase='training', epoch=5, epochs=50,
                            now=rs.parse_stamp('2026-10-02T08:00:00Z'))
    status, reason = rs.classify(marker, beat, None, now=rs.parse_stamp('2026-10-02T10:00:00Z'), max_run_hours=15)
    assert status == 'abandoned' and '16.0 h' in reason


def test_classify_trusts_a_recorded_terminal_status():
    marker = _marker(status='failed')
    assert rs.classify(marker, None, None, now=NOW)[0] == 'failed'


# ── the manifest gate ────────────────────────────────────────────────────────


def test_a_good_manifest_passes_with_no_problems():
    assert rs.validate_manifest(_good_manifest()) == []


@pytest.mark.parametrize('mutate,expect', [
    (lambda m: m.pop('schema'), 'schema'),
    (lambda m: m.pop('run_id'), 'run_id is missing'),
    (lambda m: m.update(artifacts=[]), 'artifacts is missing'),
    (lambda m: m.update(folds=[]), 'no fold reported any metric'),
    (lambda m: m.update(parity=None), 'parity is missing'),
    (lambda m: m.update(environment={'torch': '2.4'}), 'environment.gpu is missing'),
])
def test_manifest_gate_names_the_field_it_rejected(mutate, expect):
    manifest = _good_manifest()
    mutate(manifest)
    problems = rs.validate_manifest(manifest)
    assert problems, f'expected a rejection mentioning {expect!r}'
    assert any(expect in problem for problem in problems), problems


def test_manifest_gate_rejects_a_missing_required_artifact():
    manifest = _good_manifest()
    manifest['artifacts'] = [a for a in manifest['artifacts'] if a['name'] != 'normalization_stats.json']
    problems = rs.validate_manifest(manifest)
    assert any('normalization_stats.json is not in the manifest' in p for p in problems)


def test_manifest_gate_rejects_an_artifact_that_was_not_produced():
    manifest = _good_manifest()
    manifest['artifacts'][0] = {'name': manifest['artifacts'][0]['name'], 'present': False}
    assert any('was not produced' in p for p in rs.validate_manifest(manifest))


def test_manifest_gate_rejects_implausible_sizes_and_hashes():
    tiny = _good_manifest()
    for entry in tiny['artifacts']:
        if entry['name'] == 'hazardnet_fp32.tflite':
            entry['bytes'] = 4096
    assert any('too small' in p for p in rs.validate_manifest(tiny))

    enormous = _good_manifest()
    for entry in enormous['artifacts']:
        if entry['name'] == 'hazardnet_fp32.tflite':
            entry['bytes'] = 900_000_000
    assert any('far larger' in p for p in rs.validate_manifest(enormous))

    unhashed = _good_manifest()
    unhashed['artifacts'][0]['sha256'] = 'not-a-hash'
    assert any('no sha256' in p for p in rs.validate_manifest(unhashed))


def test_manifest_gate_rejects_metrics_outside_their_range():
    manifest = _good_manifest()
    manifest['folds'][0]['accuracy'] = 1.4
    assert any('outside 0..1' in p for p in rs.validate_manifest(manifest))


def test_manifest_gate_holds_the_conversion_to_its_parity_claim():
    manifest = _good_manifest()
    manifest['parity'] = {'hazard_agreement_pct': 98.4, 'severity_mae': 0.02}
    problems = rs.validate_manifest(manifest)
    assert any(f'{rs.PARITY_GATE_PCT}%' in p for p in problems)


def test_inventory_hashes_what_is_there_and_records_what_is_not(tmp_path):
    (tmp_path / 'labels.json').write_text('{"hazards": []}', encoding='utf-8')
    inventory = {entry['name']: entry for entry in rs.inventory(tmp_path)}
    assert inventory['labels.json']['present'] is True
    assert inventory['labels.json']['sha256'] == rs.sha256_file(tmp_path / 'labels.json')
    assert inventory['hazardnet_fp32.tflite']['present'] is False


def test_the_shipped_bundle_would_pass_its_own_gate():
    """Reality check: the artifacts in `Models/` today satisfy the new contract."""
    inventory = rs.inventory(MODELS)
    manifest = rs.manifest_doc(
        'shipped-bundle',
        strategy='event_kfold',
        folds=[{'fold': 'event_0', 'accuracy': 0.91, 'f1': 0.88}],
        parity={'hazard_agreement_pct': 100.0, 'severity_mae': 0.0},
        environment={'gpu': 'Tesla T4', 'torch': '2.4.0', 'tensorflow': '2.17.0'},
        artifacts=inventory,
        notebook_sha256=rs.sha256_file(ROOT / 'ml' / 'HazardNet_auto_train.ipynb'),
        repo_sha='f2ef061',
        started_at='2026-09-15T20:00:00Z',
        duration_seconds=1.0,
        now=NOW,
    )
    assert all(entry['present'] for entry in inventory), 'the shipped bundle is missing an artifact'
    assert rs.validate_manifest(manifest) == []


def test_resume_states_are_how_a_relaunch_finds_the_dead_attempt(tmp_path):
    run_dir = tmp_path / 'run'
    assert rs.resume_states(run_dir) == []
    (run_dir).mkdir()
    (run_dir / 'event_0_resume.pt').write_bytes(b'state')
    (run_dir / 'event_0_best.pt').write_bytes(b'weights')
    states = rs.resume_states(run_dir)
    assert [path.name for path in states] == ['event_0_resume.pt']


# ── the Colab CLI wrapper, driven by a stub binary ───────────────────────────

STUB = r"""#!/usr/bin/env bash
# A stand-in for `colab` that records what it was asked and obeys the environment.
echo "$@" >> "$STUB_LOG"
case "$1" in
  version|--version) echo "colab-cli 1.4.0 (stub)"; exit 0 ;;
  new)
    if [[ "${NEW_EXIT:-0}" != "0" ]]; then echo "no GPU available right now" >&2; exit 1; fi
    echo "[colab] Creating session '$3'..."
    echo "[colab] Session READY."
    exit 0 ;;
  status)
    if [[ "${STATUS_EXIT:-0}" != "0" ]]; then echo "session not found" >&2; exit 1; fi
    echo "[${SESSION_NAME:-stub-session-9f3}] m-s-stub-usw1c0-1 | Hardware: ${GPU_KIND:-T4} | Variant: DEFAULT | Status: ${SESSION_STATE:-BUSY}"
    echo "  Last Execution: /content/hn_retrain/run.ipynb at 2026-10-01 18:05:00"
    exit 0 ;;
  ls) for entry in $LS_FILES; do echo "$entry"; done; exit 0 ;;
  download)
    remote="${@: -2:1}"; local="${@: -1}"; base="$(basename "$remote")"
    mkdir -p "$(dirname "$local")"
    if [[ -n "$STUB_FILES" && -f "$STUB_FILES/$base" ]]; then cp "$STUB_FILES/$base" "$local"; exit 0; fi
    for allowed in $ALLOW_REMOTE; do
      if [[ "$remote" == *"$allowed"* ]]; then printf '{}' > "$local"; exit 0; fi
    done
    echo "not found: $remote" >&2; exit 1 ;;
  upload)
    # Keep a copy of whatever the CLI was asked to upload, so a test can read the
    # run_config.json — or the checkpoint — that a relaunch actually sent to the VM.
    if [[ -n "$UPLOAD_SINK" ]]; then mkdir -p "$UPLOAD_SINK"; cp "${@: -2:1}" "$UPLOAD_SINK/"; fi
    exit 0 ;;
  console)
    # Kernel-free one-shot shell: this is how the detached launch happens.
    read -r command || true
    echo "$command" >> "${CONSOLE_LOG:-/dev/null}"
    if [[ "${CONSOLE_EXIT:-0}" != "0" ]]; then exit 1; fi
    echo "HN_PID=${STUB_PID:-4242}"
    exit 0 ;;
  exec) exit 0 ;;
  rm|stop) exit 0 ;;
  sleep) sleep "${SLEEP_FOR:-3}"; exit 0 ;;
esac
exit 3
"""


@pytest.fixture()
def stub_colab(tmp_path, monkeypatch):
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    stub = bin_dir / 'colab'
    stub.write_text(STUB, encoding='utf-8')
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / 'calls.log'
    monkeypatch.setenv('PATH', f'{bin_dir}{os.pathsep}{os.environ["PATH"]}')
    monkeypatch.setenv('STUB_LOG', str(log))
    return log


def test_version_and_install_report_the_cli(stub_colab):
    assert 'stub' in cs.version()


def test_create_names_the_session_it_asks_for(stub_colab):
    """We choose the name, so a job that never saw the launch can still address the VM."""
    session = cs.ColabSession.create('20261001T180000-event_kfold', gpu='T4')
    assert session.name == '20261001T180000-event_kfold'
    assert 'new -s 20261001T180000-event_kfold --gpu T4' in stub_colab.read_text()


def test_session_names_survive_the_cli_character_rules():
    assert cs.session_name('20261001T180000-event_kfold') == '20261001T180000-event_kfold'
    assert cs.session_name('run/with odd:chars') == 'run-with-odd-chars'


def test_create_fails_actionably_when_the_free_tier_has_no_gpu(stub_colab, monkeypatch):
    monkeypatch.setenv('NEW_EXIT', '1')
    with pytest.raises(cs.ColabCliError) as excinfo:
        cs.ColabSession.create('a-run')
    assert 'colab new -s a-run --gpu T4' in str(excinfo.value)
    assert 'no GPU available' in str(excinfo.value)


def test_keepalive_reports_a_dead_session_as_false_not_an_exception(stub_colab, monkeypatch):
    session = cs.ColabSession(name='stub-session-9f3')
    assert session.keepalive() is True
    monkeypatch.setenv('STATUS_EXIT', '1')
    assert session.keepalive() is False


def test_status_reads_hardware_and_kernel_state_without_touching_the_kernel(stub_colab, monkeypatch):
    """A Jupyter kernel runs one thing at a time, so a status read must not queue behind
    the training cell — which is why it comes from `colab status`, not `colab exec`."""
    monkeypatch.setenv('SESSION_STATE', 'BUSY')
    monkeypatch.setenv('GPU_KIND', 'T4')
    info = cs.ColabSession(name='stub-session-9f3').status()
    assert info['state'] == 'BUSY' and info['hardware'] == 'T4'
    assert info['last_execution_at'] == '2026-10-01 18:05:00'
    assert 'exec' not in stub_colab.read_text()


def test_console_output_has_its_terminal_control_bytes_stripped(stub_colab):
    """`colab console` is a tmux-wrapped pty; raw output would corrupt anything parsed
    from it."""
    assert cs.clean('\x1b[2K\rHN_PID=4242\x1b[0m') == 'HN_PID=4242'


def test_download_is_false_when_the_file_is_not_there_yet(stub_colab, tmp_path, monkeypatch):
    session = cs.ColabSession(name='stub-session-9f3')
    monkeypatch.setenv('ALLOW_REMOTE', 'heartbeat.json')
    target = tmp_path / 'out' / 'heartbeat.json'
    assert session.download('/content/hn_retrain/r/heartbeat.json', target) is True
    assert target.exists()
    assert session.download('/content/hn_retrain/r/run_manifest.json', tmp_path / 'out' / 'manifest.json') is False


def test_launch_training_returns_the_pid_of_a_detached_job(stub_colab, tmp_path, monkeypatch):
    console_log = tmp_path / 'console.log'
    monkeypatch.setenv('CONSOLE_LOG', str(console_log))
    session = cs.ColabSession(name='stub-session-9f3')
    pid = session.launch_training('/content/hn_retrain/r/HazardNet_auto_train.ipynb',
                                  '/content/hn_retrain/r/run.log',
                                  env={'HN_RUN_CONFIG': '/content/hn_retrain/r/run_config.json'})
    assert pid == 4242
    assert 'console' in stub_colab.read_text()
    command = console_log.read_text(encoding='utf-8')
    # The three properties that make an eight-hour run survivable in a six-hour job.
    assert 'setsid nohup jupyter nbconvert' in command, 'the job must outlive the shell that started it'
    assert '--ExecutePreprocessor.timeout=-1' in command, 'a cell may run for hours'
    assert 'HN_RUN_CONFIG=/content/hn_retrain/r/run_config.json' in command
    assert '> /content/hn_retrain/r/run.log 2>&1' in command


def test_launch_training_fails_when_no_pid_comes_back(stub_colab, monkeypatch):
    monkeypatch.setenv('CONSOLE_EXIT', '1')
    session = cs.ColabSession(name='stub-session-9f3')
    with pytest.raises(cs.ColabCliError):
        session.launch_training('/content/x.ipynb', '/content/x.log')


def test_the_log_is_downloaded_rather_than_execd(stub_colab, tmp_path, monkeypatch):
    monkeypatch.setenv('STUB_FILES', str(tmp_path))
    (tmp_path / 'run.log').write_text('\n'.join(f'line {n}' for n in range(100)), encoding='utf-8')
    tail = cs.ColabSession(name='stub-session-9f3').tail_log('/content/run.log', lines=5, scratch=tmp_path / 's')
    assert tail.splitlines()[-1] == 'line 99'
    assert 'exec' not in stub_colab.read_text(), 'reading the log must not touch the kernel'


def test_every_call_has_a_timeout(stub_colab, monkeypatch):
    """A hung CLI must fail in seconds, not eat the six-hour job budget."""
    monkeypatch.setenv('SLEEP_FOR', '5')
    session = cs.ColabSession(name='stub-session-9f3')
    with pytest.raises(cs.ColabCliError) as excinfo:
        session._run(['sleep'], timeout=1)
    assert 'timed out after 1s' in str(excinfo.value)


def test_a_missing_cli_is_a_configuration_error_with_the_install_line(tmp_path, monkeypatch):
    monkeypatch.setenv('PATH', str(tmp_path))
    with pytest.raises(cs.ColabCliError) as excinfo:
        cs.ColabSession.create('a-run')
    assert 'google-colab-cli' in str(excinfo.value)


def test_the_oauth_token_is_written_0600_and_rejected_when_unusable(tmp_path, monkeypatch):
    path = tmp_path / 'token.json'
    monkeypatch.setattr(cs, 'TOKEN_PATH', path)
    written = cs.write_token('{"refresh_token": "1//secret", "token_uri": "https://oauth2.googleapis.com/token"}', path)
    assert stat.S_IMODE(written.stat().st_mode) == 0o600
    assert cs.token_present(path)
    assert 'secret' not in str(written.read_text()).replace('1//secret', '')  # it is stored, never printed
    for bad in ('', '   ', 'not json', '[1,2,3]'):
        with pytest.raises(cs.ColabCliError):
            cs.write_token(bad, path)


# ── the CLI's offline gate ───────────────────────────────────────────────────


def _bundle(tmp_path, *, tamper=None):
    """A realistic bundle: the shipped artifacts plus a manifest that describes them."""
    bundle = tmp_path / 'bundle'
    bundle.mkdir()
    for name in rs.REQUIRED_ARTIFACTS:
        source = MODELS / name
        if source.is_file():
            (bundle / name).write_bytes(source.read_bytes())
    manifest = rs.manifest_doc(
        '20261001T180000-event_kfold',
        strategy='event_kfold',
        folds=[{'fold': 'event_0', 'accuracy': 0.912, 'f1': 0.884}],
        parity={'hazard_agreement_pct': 99.97, 'severity_mae': 0.0008},
        environment={'gpu': 'Tesla T4', 'torch': '2.4.0', 'tensorflow': '2.17.0', 'python': '3.11'},
        artifacts=rs.inventory(bundle),
        notebook_sha256='a' * 64,
        repo_sha='f2ef061',
        started_at='2026-10-01T18:00:00Z',
        duration_seconds=27_540.0,
        now=NOW,
    )
    if tamper:
        tamper(manifest, bundle)
    rs.atomic_write_json(bundle / 'run_manifest.json', manifest)
    return bundle


def _run_cli(*argv):
    return subprocess.run(
        [sys.executable, '-m', 'mlops.retrain_cli', *argv],
        cwd=str(SCRIPTS), capture_output=True, text=True, timeout=120,
    )


def test_cli_validate_passes_a_real_bundle(tmp_path):
    bundle = _bundle(tmp_path)
    report = tmp_path / 'report.json'
    proc = _run_cli('validate', str(bundle), '--report', str(report))
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert 'agree' in proc.stdout
    document = json.loads(report.read_text(encoding='utf-8'))
    assert document['problems'] == []
    assert len(document['inventory']) == len(rs.REQUIRED_ARTIFACTS)


def test_cli_validate_refuses_a_bundle_whose_bytes_disagree_with_its_manifest(tmp_path):
    def tamper(manifest, bundle):
        (bundle / 'hazardnet_fp32.tflite').write_bytes(b'not the model any more')

    bundle = _bundle(tmp_path, tamper=tamper)
    proc = _run_cli('validate', str(bundle))
    assert proc.returncode == 1
    assert 'on disk is' in proc.stdout and 'manifest claims' in proc.stdout


def test_cli_validate_refuses_a_bundle_with_a_missing_artifact(tmp_path):
    bundle = _bundle(tmp_path)
    (bundle / 'normalization_stats.json').unlink()
    proc = _run_cli('validate', str(bundle))
    assert proc.returncode == 1
    assert 'not on disk' in proc.stdout


def test_cli_validate_refuses_a_conversion_that_changed_predictions(tmp_path):
    bundle = _bundle(tmp_path, tamper=lambda manifest, _b: manifest.update(
        parity={'hazard_agreement_pct': 93.0, 'severity_mae': 0.4}))
    proc = _run_cli('validate', str(bundle))
    assert proc.returncode == 1
    assert f'gate is {rs.PARITY_GATE_PCT}%' in proc.stdout


def test_cli_status_is_quiet_when_nothing_has_run(tmp_path):
    proc = _run_cli('status')
    assert proc.returncode == 0
    assert 'no retrain runs recorded' in proc.stdout


def test_cli_watch_exits_cleanly_when_no_run_is_in_flight():
    """The watcher runs every twenty minutes; most of the time there is nothing to do."""
    assert retrain_cli.cmd_watch(_watch_args(run_id=None)) == 0


def _watch_args(**overrides):
    import argparse
    defaults = dict(run_id=None, token_json=None, stale_minutes=rs.HEARTBEAT_STALE_MINUTES,
                    max_hours=rs.MAX_RUN_HOURS, max_attempts=3, tail=False, keep_session=False,
                    mode='follow', resume_from=None, workdir='/tmp/hn-watch-test')
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def test_cli_start_refuses_to_run_without_a_notebook(tmp_path, monkeypatch):
    monkeypatch.setattr(retrain_cli, 'NOTEBOOK_PATH', tmp_path / 'absent.ipynb')
    import argparse
    args = argparse.Namespace(strategy='event_kfold', gpu='T4', token_json=None,
                              triggered_by='schedule', force=False, workdir=str(tmp_path))
    assert retrain_cli.cmd_start(args) == 2


def test_cli_start_will_not_double_book_the_quota(tmp_path, monkeypatch):
    """A second run would share one free-tier quota and both would be recycled."""
    monkeypatch.setattr(retrain_cli, 'REPO_ROOT', tmp_path)
    (tmp_path / rs.RUN_MARKER_DIR).mkdir(parents=True)
    rs.atomic_write_json(tmp_path / rs.RUN_MARKER_DIR / f"{_marker()['run_id']}.json", _marker(status='training'))
    import argparse
    args = argparse.Namespace(strategy='event_kfold', gpu='T4', token_json=None,
                              triggered_by='schedule', force=False, workdir=str(tmp_path))
    assert retrain_cli.cmd_start(args) == 0


# ── the handshake has exactly one writer ─────────────────────────────────────


def test_intake_regenerates_the_handshake_with_the_canonical_script():
    """`Models/VERSION.json` is written by `scripts/gen-model-version.mjs` and nothing else.

    An earlier draft of `retrain_cli` grew its own stamp command with its own idea of the
    version suffix — the FP32 hash alone, where the generator hashes all four claimed
    artifacts together. Two writers for one handshake is how a repository ends up with a
    version string nobody can recompute, and CI already fails on a stale one.
    """
    import yaml
    workflow = yaml.safe_load((ROOT / '.github' / 'workflows' / 'model_intake.yml').read_text(encoding='utf-8'))
    runs = '\n'.join(step.get('run', '') for job in workflow['jobs'].values()
                      for step in job.get('steps') or [] if isinstance(step.get('run'), str))
    assert 'node scripts/gen-model-version.mjs' in runs
    assert 'retrain_cli stamp' not in runs
    assert (ROOT / 'scripts' / 'gen-model-version.mjs').is_file()
    assert not hasattr(retrain_cli, 'cmd_stamp'), 'the duplicate stamp command is back'


def test_the_contract_and_the_generator_agree_about_what_ships():
    """The Python contract and the Node generator must not drift about the bundle.

    The one deliberate difference is `hazardnet_int8.tflite`: it ships and is
    byte-identical to the FP32 file (ADR 0007 — TFLite's converter crashes on CONV_3D
    under INT8), so the registry reports it as a duplicate rather than claiming it as a
    second model. Anything else that differs is a mistake.
    """
    claimed = set(retrain_cli.handshake_artifacts())
    expected = set(rs.REQUIRED_ARTIFACTS)
    assert expected - claimed == {'hazardnet_int8.tflite'}
    assert claimed - expected == set()


def test_the_generator_hash_rule_is_the_one_the_docs_claim():
    """`<package.json version>+model.<first 12 hex of sha256(the four artifact hashes)>`.

    Pinned because the shipped version string is what the frontend, the forecast CSVs and
    `model_version` in every API response report: a change to the rule is a change to the
    repository's public numbers, and should not happen by accident.
    """
    text = (ROOT / 'scripts' / 'gen-model-version.mjs').read_text(encoding='utf-8')
    assert 'pkg.version' in text and '+model.' in text
    assert ".slice(0, 12)" in text
    version = json.loads((MODELS / 'VERSION.json').read_text(encoding='utf-8'))['version']
    assert re.fullmatch(r'\d+\.\d+\.\d+\+model\.[0-9a-f]{12}', version), version
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    assert version.startswith(f'{package}+model.'), (
        f'the shipped version {version} does not follow package.json ({package})'
    )


# ── the watcher, end to end, against the stub CLI ────────────────────────────
#
# The unit tests above cover the state machine and the wrapper separately. These drive
# `retrain_cli watch` the way the workflow does — a committed marker, a stub `colab` on
# PATH, a token file on disk — because the interesting behaviour is the sequence: read
# the marker, ping the session, fetch the heartbeat, decide, relaunch with `resume:
# true`, write the marker back.


@pytest.fixture()
def stubbed_watch(tmp_path, monkeypatch, stub_colab):
    """A temp repository with one in-flight run, and a stub Colab that answers pings."""
    repo = tmp_path / 'repo'
    (repo / rs.RUN_MARKER_DIR).mkdir(parents=True)
    marker = rs.new_marker('20261001T180000-event_kfold', strategy='event_kfold',
                           notebook_sha256='a' * 64, repo_sha='f2ef061', session='stub-session-9f3')
    marker['checkpoint_dir'] = f'{marker["vm_run_dir"]}/outputs'
    rs.atomic_write_json(repo / rs.RUN_MARKER_DIR / f"{marker['run_id']}.json", marker)

    files = tmp_path / 'vm'
    files.mkdir()
    sink = tmp_path / 'uploads'
    token = tmp_path / 'token.json'
    token.write_text('{"refresh_token": "stub"}', encoding='utf-8')

    monkeypatch.setattr(retrain_cli, 'REPO_ROOT', repo)
    monkeypatch.setattr(cs, 'TOKEN_PATH', token)
    monkeypatch.setenv('STUB_FILES', str(files))
    monkeypatch.setenv('UPLOAD_SINK', str(sink))
    monkeypatch.setenv('GITHUB_OUTPUT', str(tmp_path / 'gh_output'))
    return type('Ctx', (), {'repo': repo, 'marker': marker, 'files': files, 'sink': sink,
                            'tmp': tmp_path, 'outputs': tmp_path / 'gh_output',
                            'calls': stub_colab})()


def _outputs(ctx):
    text = ctx.outputs.read_text(encoding='utf-8') if ctx.outputs.exists() else ''
    return dict(line.split('=', 1) for line in text.splitlines() if '=' in line)


def test_watch_leaves_a_live_run_alone_and_records_its_progress(stubbed_watch):
    rs.atomic_write_json(stubbed_watch.files / 'heartbeat.json',
                         rs.heartbeat_doc(stubbed_watch.marker['run_id'], phase='training', fold='event_0',
                                          epoch=31, epochs=50, val_loss=0.42, val_acc=0.9))
    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 0

    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['status'] == 'training'
    assert marker['progress'] == {'phase': 'training', 'fold': 'event_0', 'epoch': 31, 'epochs': 50,
                                  'val_loss': 0.42, 'val_acc': 0.9}
    assert marker['events'][0]['message'].startswith('provisioning → training')
    assert _outputs(stubbed_watch)['status'] == 'training'


def test_watch_relaunches_a_dead_session_with_resume_on(stubbed_watch):
    """The whole point of the watcher: a recycled session costs an epoch, not the run."""
    dead = rs.heartbeat_doc(stubbed_watch.marker['run_id'], phase='training', epoch=31, epochs=50,
                            now=rs.utcnow() - __import__('datetime').timedelta(hours=2))
    rs.atomic_write_json(stubbed_watch.files / 'heartbeat.json', dead)

    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 0

    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['attempt'] == 2
    assert marker['status'] == 'provisioning'
    assert any('relaunched with resume=true' in event['message'] for event in marker['events'])

    # And the config it uploaded to the replacement VM really does say resume.
    configs = [path for path in stubbed_watch.sink.glob('*config.json') if 'relaunch' in path.name]
    assert configs, f'nothing was uploaded; the sink holds {list(stubbed_watch.sink.iterdir())}'
    sent = json.loads(configs[0].read_text(encoding='utf-8'))
    assert sent['resume'] is True and sent['run_id'] == stubbed_watch.marker['run_id']
    assert sent['drive_run_dir'] == stubbed_watch.marker['drive_run_dir'], (
        'a relaunch must point at the same Drive directory, or the checkpoints are unreachable'
    )


def test_watch_gives_up_after_the_attempt_budget(stubbed_watch):
    stubbed_watch.marker['attempt'] = 3
    rs.atomic_write_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo),
                         dict(stubbed_watch.marker, attempt=3, status='training'))
    dead = rs.heartbeat_doc(stubbed_watch.marker['run_id'], phase='training', epoch=7, epochs=50,
                            now=rs.utcnow() - __import__('datetime').timedelta(hours=3))
    rs.atomic_write_json(stubbed_watch.files / 'heartbeat.json', dead)

    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 1
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['status'] == 'abandoned'
    assert marker['ended_at']
    assert _outputs(stubbed_watch)['status'] == 'abandoned'


def test_watch_recognises_a_finished_run_and_releases_the_vm(stubbed_watch):
    bundle = stubbed_watch.files
    manifest = _good_manifest()
    manifest['run_id'] = stubbed_watch.marker['run_id']
    rs.atomic_write_json(bundle / 'run_manifest.json', manifest)

    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 0
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['status'] == 'complete'
    assert 'stop' in stubbed_watch.calls.read_text(encoding='utf-8'), 'a finished run must release the VM'
    assert _outputs(stubbed_watch)['status'] == 'complete'


def test_watch_refuses_a_finished_run_whose_manifest_does_not_validate(stubbed_watch):
    """Completion is not "a manifest exists"; it is "a manifest that would survive intake"."""
    manifest = _good_manifest()
    manifest['run_id'] = stubbed_watch.marker['run_id']
    manifest['parity'] = {'hazard_agreement_pct': 88.0}
    rs.atomic_write_json(stubbed_watch.files / 'run_manifest.json', manifest)

    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 1
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['status'] == 'failed'
    assert 'not promotable' in marker['events'][-1]['message']


def test_watch_does_nothing_at_all_when_no_run_is_in_flight(stubbed_watch, monkeypatch):
    monkeypatch.setattr(retrain_cli, 'REPO_ROOT', stubbed_watch.tmp / 'empty-repo')
    assert retrain_cli.cmd_watch(_watch_args(workdir=str(stubbed_watch.tmp / 'wd'))) == 0
    assert _outputs(stubbed_watch)['status'] == 'none'


def test_mark_records_an_intake_so_the_next_tick_does_not_repeat_it(stubbed_watch):
    import argparse
    marker_path = rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo)
    rs.atomic_write_json(marker_path, dict(stubbed_watch.marker, status='complete'))
    assert retrain_cli.cmd_mark(argparse.Namespace(
        run_id=stubbed_watch.marker['run_id'], pr='https://github.com/myself-aas/HazardNet/pull/42',
        failed=None)) == 0
    marker = rs.read_json(marker_path)
    assert marker['intake'] == {'done': True, 'pr': 'https://github.com/myself-aas/HazardNet/pull/42',
                                'pr_at': marker['intake']['pr_at']}
    # And a run that has been intaken is no longer "in flight".
    assert rs.active_marker(stubbed_watch.repo) is None


# ── probe and relaunch, the two halves the watcher workflow runs ─────────────


def _stage_checkpoints(ctx, monkeypatch, names=('event_0_resume.pt', 'event_1_resume.pt')):
    """Make the stub VM's Contents API serve resumable states."""
    for name in names:
        (ctx.files / name).write_bytes(b'\x00checkpoint-bytes')
    monkeypatch.setenv('LS_FILES', ' '.join(names))
    return names


def test_probe_carries_the_checkpoints_out_of_the_vm(stubbed_watch, monkeypatch):
    """A headless session has no Drive, so the watcher is the durable store: it has to
    bring the resumable states out every tick or a recycled session costs the whole run."""
    rs.atomic_write_json(stubbed_watch.files / 'heartbeat.json',
                         rs.heartbeat_doc(stubbed_watch.marker['run_id'], phase='training',
                                          fold='event_1', epoch=31, epochs=50))
    names = _stage_checkpoints(stubbed_watch, monkeypatch)

    assert retrain_cli.cmd_watch(_watch_args(mode='probe', workdir=str(stubbed_watch.tmp / 'wd'))) == 0

    outputs = _outputs(stubbed_watch)
    assert outputs['status'] == 'training'
    carried = pathlib.Path(outputs['checkpoint_dir'])
    assert sorted(path.name for path in carried.iterdir()) == list(names), (
        'every fold has its own resumable state; restoring only the newest would silently '
        'retrain the earlier folds'
    )
    assert outputs['checkpoint_artifact'] == rs.checkpoint_artifact_name(stubbed_watch.marker['run_id'], 31)
    assert outputs['checkpoint_epoch'] == '31'
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['checkpoint']['files'] == list(names)


def test_probe_never_provisions_anything(stubbed_watch, monkeypatch):
    """Probe runs every twenty minutes; diagnosing must not become a second launch."""
    dead = rs.heartbeat_doc(stubbed_watch.marker['run_id'], phase='training', epoch=31, epochs=50,
                            now=rs.utcnow() - __import__('datetime').timedelta(hours=2))
    rs.atomic_write_json(stubbed_watch.files / 'heartbeat.json', dead)

    assert retrain_cli.cmd_watch(_watch_args(mode='probe', workdir=str(stubbed_watch.tmp / 'wd'))) == 0
    assert _outputs(stubbed_watch)['status'] == 'stalled'
    calls = stubbed_watch.calls.read_text(encoding='utf-8')
    assert 'new -s' not in calls, 'probe must not provision; relaunch is a separate verb'
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['attempt'] == 1


def test_probe_carries_a_finished_bundle_out_before_the_vm_can_vanish(stubbed_watch):
    """Completing and then losing the session ten minutes later must not cost eight hours."""
    manifest = _good_manifest()
    manifest['run_id'] = stubbed_watch.marker['run_id']
    rs.atomic_write_json(stubbed_watch.files / 'run_manifest.json', manifest)
    for name in rs.REQUIRED_ARTIFACTS:
        (stubbed_watch.files / name).write_bytes(b'artifact-bytes')

    assert retrain_cli.cmd_watch(_watch_args(mode='probe', workdir=str(stubbed_watch.tmp / 'wd'))) == 0
    bundle = pathlib.Path(_outputs(stubbed_watch)['bundle_dir'])
    assert sorted(p.name for p in bundle.iterdir()) == sorted(
        [*rs.REQUIRED_ARTIFACTS, 'run_manifest.json'])


def test_relaunch_restores_the_checkpoints_into_the_same_directory(stubbed_watch, monkeypatch):
    resume_dir = stubbed_watch.tmp / 'artifact' / 'checkpoint'
    resume_dir.mkdir(parents=True)
    (resume_dir / 'event_0_resume.pt').write_bytes(b'\x00restored-state')
    monkeypatch.setenv('STATUS_EXIT', '1')   # the old session is gone

    assert retrain_cli.cmd_watch(_watch_args(mode='relaunch', resume_from=str(resume_dir),
                                             workdir=str(stubbed_watch.tmp / 'wd'))) == 0

    uploaded = {path.name for path in stubbed_watch.sink.iterdir()}
    assert 'event_0_resume.pt' in uploaded, 'the replacement VM must be handed the checkpoint back'
    config = json.loads((stubbed_watch.sink / 'run_config.json').read_text(encoding='utf-8')) \
        if (stubbed_watch.sink / 'run_config.json').exists() else \
        json.loads(next(stubbed_watch.sink.glob('*config.json')).read_text(encoding='utf-8'))
    assert config['resume'] is True
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert marker['attempt'] == 2
    assert 'restoring 1 checkpoint(s)' in marker['events'][-1]['message']
    calls = stubbed_watch.calls.read_text(encoding='utf-8')
    assert f'upload -s {marker["session"]}' in calls


def test_relaunch_says_so_when_there_is_nothing_to_resume_from(stubbed_watch, monkeypatch, capsys):
    """The expensive outcome has to be visible, not silently absorbed."""
    monkeypatch.setenv('STATUS_EXIT', '1')
    empty = stubbed_watch.tmp / 'no-checkpoints'
    empty.mkdir()
    assert retrain_cli.cmd_watch(_watch_args(mode='relaunch', resume_from=str(empty),
                                             workdir=str(stubbed_watch.tmp / 'wd'))) == 0
    out = capsys.readouterr().out
    assert 'no resumable state was available' in out
    marker = rs.read_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo))
    assert 'with no checkpoint to restore' in marker['events'][-1]['message']


# ── intake from a bundle the watcher already carried out ─────────────────────


def test_collect_validates_a_bundle_that_is_already_on_disk(stubbed_watch, tmp_path, monkeypatch):
    """The VM is usually gone by the time a run is collected; the archive is not."""
    monkeypatch.setenv('STATUS_EXIT', '1')
    bundle_root = tmp_path / 'incoming'
    staged = bundle_root / stubbed_watch.marker['run_id']
    staged.mkdir(parents=True)
    for name in rs.REQUIRED_ARTIFACTS:
        source = MODELS / name
        (staged / name).write_bytes(source.read_bytes())
    manifest = _good_manifest()
    manifest['run_id'] = stubbed_watch.marker['run_id']
    manifest['artifacts'] = rs.inventory(staged)
    rs.atomic_write_json(staged / 'run_manifest.json', manifest)
    rs.atomic_write_json(rs.marker_path(stubbed_watch.marker['run_id'], stubbed_watch.repo),
                         dict(stubbed_watch.marker, status='complete'))

    import argparse
    assert retrain_cli.cmd_collect(argparse.Namespace(
        run_id=stubbed_watch.marker['run_id'], bundle_dir=str(bundle_root), token_json=None)) == 0

    report = json.loads((staged / 'intake-report.json').read_text(encoding='utf-8'))
    assert report['problems'] == []
    assert report['source'] == 'workflow artifact'
    assert report['session_was_alive'] is False


def test_collect_says_what_to_do_when_the_bundle_is_gone_with_the_session(stubbed_watch, tmp_path,
                                                                           monkeypatch, capsys):
    monkeypatch.setenv('STATUS_EXIT', '1')
    import argparse
    assert retrain_cli.cmd_collect(argparse.Namespace(
        run_id=stubbed_watch.marker['run_id'], bundle_dir=str(tmp_path / 'incoming'),
        token_json=None)) == 1
    out = capsys.readouterr().out
    assert 'no bundle was staged' in out and 'relaunch' in out
