#!/usr/bin/env python3
"""`python -m mlops.retrain_cli` — the unattended half of the retrain pipeline.

WHY A SEPARATE CLI
------------------
``mlops.cli`` is the evaluation surface: it computes scores from data and answers
"should this bundle replace the champion?". This one is the *operations* surface:
it provisions a Colab VM, hands it a notebook, watches a run that outlives the
process watching it, and collects what came out. Different verbs, different
failure modes, and — critically — a different relationship to time.

THE SHAPE OF THE PROBLEM
------------------------
Training takes seven to nine hours on a T4. A GitHub-hosted job is killed at six.
A Colab free-tier session is recycled whenever Google decides, and says nothing
when it goes. So no process is alive for the whole run, and the pipeline is built
out of short ones that pass state through two durable places:

* **git** — the run marker (``data/mlops/retrain-runs/<run_id>.json``) is committed
  by ``start``, updated by every ``watch``, and read by ``collect``. That is how a
  workflow run at 23:40 knows what a workflow run at 18:00 did.
* **Google Drive** — the resumable checkpoints and the finished bundle, written by
  the notebook. That is how an attempt launched at 04:00 continues the fold an
  attempt that died at 03:50 was in the middle of.

Subcommands
-----------
``start``      provision a VM, upload the notebook and its run config, launch the
               notebook *detached*, commit the marker. Minutes, not hours.
``watch``      classify the run from its marker + heartbeat + manifest and act:
               keep a live session warm, relaunch a dead one with ``--resume``,
               record completion, or give up with a reason. Idempotent; safe to run
               every twenty minutes and safe to run twice.
``collect``    download the bundle from the VM (or from Drive if the VM is gone)
               and validate it against its manifest.
``validate``   validate a bundle already on disk. Offline; this is what CI tests.
``status``     print the run table a human reads.

Exit codes follow the repository's convention: 0 nothing wrong, 1 a problem was
measured (a stall that could not be recovered, a bundle that did not validate),
2 the input was unusable (no CLI, no token, no such run).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import REPO_ROOT
from . import colab_session as cs
from . import retrain_state as rs

NOTEBOOK_PATH = REPO_ROOT / 'ml' / 'HazardNet_auto_train.ipynb'
DEFAULT_STRATEGY = 'event_kfold'
DEFAULT_MAX_ATTEMPTS = 3


# ── shared helpers ───────────────────────────────────────────────────────────


def _say(message: str) -> None:
    print(message, flush=True)


def _github_output(key: str, value: str) -> None:
    """Publish a value to the workflow via $GITHUB_OUTPUT (a no-op locally)."""
    target = os.environ.get('GITHUB_OUTPUT')
    if not target:
        return
    with open(target, 'a', encoding='utf-8') as handle:
        handle.write(f'{key}={value}\n')


def _require_cli_and_token(token_json: str | None) -> None:
    if token_json:
        cs.write_token(token_json)
    if not cs.token_present():
        raise SystemExit(
            'no Colab credentials: capture them once with `colab auth` on your own machine, then store the '
            'contents of ~/.config/colab-cli/token.json as the COLAB_TOKEN_JSON repository secret '
            '(exit 2 — this is a configuration problem, not a failed run)'
        )


def _this_workflow_run() -> str:
    """A link back to the run that launched this one, for the notebook's manifest."""
    server, repo, run = (os.environ.get('GITHUB_SERVER_URL'), os.environ.get('GITHUB_REPOSITORY'),
                         os.environ.get('GITHUB_RUN_ID'))
    return f'{server}/{repo}/actions/runs/{run}' if server and repo and run else ''


def _stage_data_credentials(session: cs.ColabSession, workdir: Path, run_id: str) -> None:
    """Put Kaggle credentials on the VM, because a headless session has no Drive.

    The master tensor lives in Drive, and `colab drivemount` needs a TTY and browser
    consent — so an unattended run cannot read it. The notebook's fallback is the Kaggle
    dataset the Drive copy was made from, which needs `~/.kaggle/kaggle.json`. These are
    the repository's existing `KAGGLE_USERNAME`/`KAGGLE_KEY` secrets, already used by the
    forecast workflows: no new credential, and the file is written 0600 on the VM.

    Absent credentials are not an error here. The tensor may already be in the image, or
    `tensor_path` in the run config may point at one; the notebook says what it needs if
    it can find neither.
    """
    username = os.environ.get('KAGGLE_USERNAME')
    key = os.environ.get('KAGGLE_KEY')
    if not username or not key:
        _say('  · no KAGGLE_USERNAME/KAGGLE_KEY in the environment; the notebook will need '
             'the tensor from Drive or from run_config.tensor_path')
        return
    local = workdir / f'{run_id}.kaggle.json'
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(json.dumps({'username': username, 'key': key}), encoding='utf-8')
    os.chmod(local, 0o600)
    session.upload(local, '/root/.kaggle/kaggle.json')
    local.unlink(missing_ok=True)   # never leave a credential in the runner workspace
    _say('  · staged Kaggle credentials on the VM (the tensor comes from the dataset, not Drive)')


def _repo_sha() -> str:
    return os.environ.get('GITHUB_SHA') or os.environ.get('HN_REPO_SHA') or 'unknown'


def _run_config(run_id: str, marker: dict[str, Any], resume: bool, notebook_sha: str) -> dict[str, Any]:
    """Everything the notebook needs to know, in one file, uploaded to the VM.

    The notebook reads this instead of asking a human: it is the difference between
    a run that can be launched at 18:00 UTC by cron and one that needs somebody at
    a keyboard.
    """
    return {
        'schema': 'hazardnet-retrain-config/v1',
        'run_id': run_id,
        'attempt': marker.get('attempt', 1),
        'strategy': marker.get('strategy', DEFAULT_STRATEGY),
        'resume': resume,
        'vm_run_dir': marker['vm_run_dir'],
        'drive_run_dir': marker['drive_run_dir'],
        'checkpoint_dir': marker.get('checkpoint_dir') or rs.checkpoint_dir(marker['vm_run_dir'], False),
        'drive_root': rs.DRIVE_ROOT,
        'notebook_sha256': notebook_sha,
        'repo_sha': marker.get('repo_sha', _repo_sha()),
        'expected_artifacts': list(rs.REQUIRED_ARTIFACTS),
        'launched_at': rs.stamp(),
        'unattended': True,
        'github_run': _this_workflow_run(),
    }


# ── start ────────────────────────────────────────────────────────────────────


def cmd_start(args: argparse.Namespace) -> int:
    if not NOTEBOOK_PATH.is_file():
        _say(f'✗ the training notebook is not at {NOTEBOOK_PATH}')
        return 2

    existing = rs.active_marker(REPO_ROOT)
    if existing and not args.force:
        _say(
            f'⏸ a retrain is already in flight: {existing["run_id"]} '
            f'(status {existing.get("status")}, started {existing.get("started_at")})'
        )
        _say('  Two attempts would share one free-tier quota and both would be recycled. '
             'Wait for it, or pass --force if you know it is dead.')
        _github_output('run_id', existing['run_id'])
        _github_output('skipped', 'true')
        return 0

    notebook_sha = rs.sha256_file(NOTEBOOK_PATH)
    attempt = 1
    run_id = rs.new_run_id(args.strategy, attempt=attempt)
    marker_dir = REPO_ROOT / rs.RUN_MARKER_DIR

    _say(f'▶ installing the Colab CLI')
    try:
        _say(f'  colab {cs.install_cli()}')
        _require_cli_and_token(args.token_json)
    except cs.ColabCliError as exc:
        _say(f'✗ {exc}')
        return 2

    _say(f'▶ requesting a {args.gpu} session named after the run')
    try:
        session = cs.ColabSession.create(cs.session_name(run_id), gpu=args.gpu)
    except cs.ColabCliError as exc:
        _say(f'✗ could not get a GPU: {exc}')
        _say('  On the free tier a T4 is offered on a first-come basis; the watcher will retry.')
        return 1
    _say(f'  session {session.name}')

    marker = rs.new_marker(
        run_id,
        strategy=args.strategy,
        notebook_sha256=notebook_sha,
        repo_sha=_repo_sha(),
        session=session.name,
        gpu=args.gpu,
        triggered_by=args.triggered_by,
    )
    # A headless session has no Drive (`colab drivemount` needs a TTY), so the checkpoints
    # go on the VM and the watcher carries the newest one out to a workflow artifact.
    marker['checkpoint_dir'] = rs.checkpoint_dir(marker['vm_run_dir'], False)
    config = _run_config(run_id, marker, resume=False, notebook_sha=notebook_sha)

    try:
        remote_config = f'{marker["vm_run_dir"]}/run_config.json'
        remote_notebook = f'{marker["vm_run_dir"]}/HazardNet_auto_train.ipynb'
        log_path = f'{marker["vm_run_dir"]}/run.log'
        _say('▶ preparing the run directory')
        # Over the shell, not the kernel: `colab exec` would be fine here (nothing is
        # running yet) but the shell path is the one that also works mid-run, and having
        # two ways to do it is how the wrong one gets used later.
        session.mkdir(marker['vm_run_dir'])
        session.mkdir(marker['checkpoint_dir'])

        local_config = Path(args.workdir) / f'{run_id}.run_config.json'
        local_config.parent.mkdir(parents=True, exist_ok=True)
        rs.atomic_write_json(local_config, config)
        session.upload(local_config, remote_config)
        session.upload(NOTEBOOK_PATH, remote_notebook)
        _stage_data_credentials(session, Path(args.workdir), run_id)

        _say(f'▶ launching the notebook detached (log: {log_path})')
        pid = session.launch_training(remote_notebook, log_path, env={'HN_RUN_CONFIG': remote_config})
        _say(f'  pid {pid} — the job now belongs to the VM, not to this workflow')
        rs.append_event(marker, f'launched detached as pid {pid} in session {session.name}')
        marker['pid'] = pid
        marker['log_path'] = log_path
    except cs.ColabCliError as exc:
        _say(f'✗ could not launch the run: {exc}')
        marker['status'] = 'failed'
        marker['ended_at'] = rs.stamp()
        rs.append_event(marker, f'launch failed: {exc}')
        rs.atomic_write_json(marker_dir / f'{run_id}.json', marker)
        session.stop()
        return 1

    rs.atomic_write_json(marker_dir / f'{run_id}.json', marker)
    _say(f'✓ run {run_id} is training; marker written to {rs.RUN_MARKER_DIR}/{run_id}.json')
    _say('  Commit that marker: the watcher workflow reads it from the repository, '
         'not from this job, because this job will be over long before the run is.')
    _github_output('run_id', run_id)
    _github_output('session', session.name)
    _github_output('marker_path', f'{rs.RUN_MARKER_DIR}/{run_id}.json')
    _github_output('skipped', 'false')
    return 0


# ── watch ────────────────────────────────────────────────────────────────────
#
# Three modes, because the watcher has to work in two directions at once: it observes a
# VM through the Colab CLI, and it moves bytes through GitHub. The CLI cannot call the
# GitHub API and the workflow cannot read a Jupyter Contents API, so the boundary is:
#
#   probe     look at the run, classify it, and carry out anything worth keeping —
#             the heartbeat, the manifest, and every resumable checkpoint on the VM.
#             Never provisions anything. This is what runs every twenty minutes.
#   relaunch  provision a replacement VM and continue the run from checkpoints the
#             caller has already fetched (`--resume-from`). Separate so the workflow can
#             put a GitHub artifact download between the diagnosis and the cure.
#   follow    probe, then relaunch if that is the verdict. One command for a human.
#
# What `probe` never does is `colab exec`: a Jupyter kernel runs one thing at a time, so
# a kernel call at hour four queues behind the training cell and returns at hour nine.
# Every read goes through the Contents API (`ls`, `download`) or `status`.


def _fetch_state(session: cs.ColabSession, marker: dict[str, Any], workdir: Path) -> tuple[Any, Any]:
    """The heartbeat and the manifest, downloaded from the VM."""
    heartbeat = manifest = None
    for name, is_heartbeat in (('heartbeat.json', True), ('run_manifest.json', False)):
        local = workdir / f'{marker["run_id"]}.{name}'
        if session.download(f'{marker["vm_run_dir"]}/{name}', local):
            document = rs.read_json(local)
            if is_heartbeat:
                heartbeat = document
            else:
                manifest = document
    return heartbeat, manifest


def _fetch_checkpoints(session: cs.ColabSession, marker: dict[str, Any], workdir: Path) -> list[Path]:
    """Every resumable state on the VM, downloaded so the workflow can archive them.

    All of them, not the newest: a run under `event_kfold` has one state per fold, and a
    relaunch that restores only the last would silently retrain the earlier folds.
    """
    checkpoint_dir = marker.get('checkpoint_dir')
    if not checkpoint_dir:
        return []
    directories = [f'{checkpoint_dir}/{marker.get("strategy", DEFAULT_STRATEGY)}', checkpoint_dir]
    target_dir = workdir / 'checkpoint'
    fetched: list[Path] = []
    for directory in directories:
        names = sorted(name for name in session.ls(directory) if name.endswith('_resume.pt'))
        for name in names:
            local = target_dir / name
            if session.download(f'{directory}/{name}', local):
                fetched.append(local)
        if fetched:
            break
    return fetched


def _fetch_bundle(session: cs.ColabSession, marker: dict[str, Any], workdir: Path) -> Path | None:
    """Carry a finished bundle off the VM before the VM disappears.

    A run that completes and then loses its session to a recycle ten minutes later has
    still done the work; without this the eight hours are gone and the watcher can only
    report a bundle it cannot produce.
    """
    bundle_dir = workdir / 'bundle'
    bundle_dir.mkdir(parents=True, exist_ok=True)
    got_any = False
    for name in (*rs.REQUIRED_ARTIFACTS, 'run_manifest.json'):
        if session.download(f'{marker["vm_run_dir"]}/bundle/{name}', bundle_dir / name):
            got_any = True
    return bundle_dir if got_any else None


def cmd_watch(args: argparse.Namespace) -> int:
    marker = _load_marker(args.run_id)
    if marker is None:
        _say('· no retrain in flight')
        _github_output('status', 'none')
        return 0

    run_id = marker['run_id']
    workdir = Path(args.workdir) / run_id
    workdir.mkdir(parents=True, exist_ok=True)
    marker_path = rs.marker_path(run_id, REPO_ROOT)

    try:
        _require_cli_and_token(args.token_json)
    except SystemExit as exc:
        _say(str(exc))
        return 2

    if args.mode == 'relaunch':
        return _relaunch(marker, marker_path, workdir, args)

    session = cs.ColabSession(name=marker.get('session') or '', gpu=marker.get('gpu', cs.GPU))
    info = session.status()
    alive = info is not None
    _say(f'▶ run {run_id}: session {session.name} '
         f'{"alive (" + str(info.get("state")) + ", " + str(info.get("hardware")) + ")" if alive else "not responding"}')

    heartbeat, manifest = (None, None)
    if alive:
        try:
            heartbeat, manifest = _fetch_state(session, marker, workdir)
        except cs.ColabCliError as exc:
            _say(f'  · could not read the run directory: {exc}')

    status, reason = rs.classify(
        marker, heartbeat, manifest,
        heartbeat_stale_minutes=args.stale_minutes,
        max_run_hours=args.max_hours,
    )
    _say(f'  status {status} — {reason}')

    previous = marker.get('status')
    marker['status'] = status
    if heartbeat:
        marker['heartbeat_at'] = heartbeat.get('at')
        marker['progress'] = {key: heartbeat[key] for key in ('phase', 'fold', 'epoch', 'epochs', 'val_loss', 'val_acc')
                              if heartbeat.get(key) is not None}
    if status != previous:
        rs.append_event(marker, f'{previous} → {status}: {reason}')

    # Carry out whatever is worth keeping, while the session is still there to ask.
    if alive and status in ('training', 'converting'):
        try:
            checkpoints = _fetch_checkpoints(session, marker, workdir)
        except cs.ColabCliError as exc:
            _say(f'  · could not fetch checkpoints: {exc}')
            checkpoints = []
        if checkpoints:
            epoch = (marker.get('progress') or {}).get('epoch') or 0
            marker['checkpoint'] = {
                'epoch': epoch,
                'files': [path.name for path in checkpoints],
                'artifact': rs.checkpoint_artifact_name(run_id, epoch),
                'at': rs.stamp(),
            }
            _say(f'  · fetched {len(checkpoints)} resumable state(s) at epoch {epoch}: '
                 f'{", ".join(path.name for path in checkpoints)}')
            _github_output('checkpoint_dir', str(workdir / 'checkpoint'))
            _github_output('checkpoint_artifact', marker['checkpoint']['artifact'])
            _github_output('checkpoint_epoch', str(epoch))

    if alive and status == 'complete':
        bundle = _fetch_bundle(session, marker, workdir)
        if bundle:
            _say(f'  · carried the finished bundle off the VM to {bundle}')
            _github_output('bundle_dir', str(bundle))

    rs.atomic_write_json(marker_path, marker)
    _github_output('status', status)
    _github_output('run_id', run_id)
    _github_output('reason', reason)
    _github_output('session', session.name)

    if status in ('training', 'converting', 'provisioning'):
        _say('✓ still running; the status call above is what keeps the tunnel warm')
        if args.tail and status != 'provisioning':
            _say('  ── last log lines ──')
            for line in session.tail_log(marker.get('log_path', f'{marker["vm_run_dir"]}/run.log'),
                                         scratch=workdir).splitlines()[-15:]:
                _say(f'  {line}')
        # Nothing to do but leave it alone — in every mode. Falling through here would
        # report a healthy run as a failure, which is the one mistake a watcher must not
        # make: the response to it is a relaunch nobody needed.
        return 0

    if status == 'complete':
        _say('✓ the run finished and its manifest validates')
        _say('  Intake collects the bundle on its own schedule and opens the pull request.')
        if args.mode == 'probe':
            return 0
        if not args.keep_session:
            session.stop()
            rs.append_event(marker, 'session released after a complete run')
            rs.atomic_write_json(marker_path, marker)
        return 0

    if status == 'stalled':
        if args.mode == 'probe':
            _say('· stalled; `--mode relaunch` (or the workflow step that follows) continues it')
            return 0
        attempts = int(marker.get('attempt', 1))
        if attempts >= args.max_attempts:
            marker['status'] = 'abandoned'
            marker['ended_at'] = rs.stamp()
            rs.append_event(marker, f'{attempts} attempts all went quiet; giving up')
            rs.atomic_write_json(marker_path, marker)
            session.stop()
            _say(f'✗ {attempts} attempts have died. The run is abandoned; the marker records why.')
            _say('  This is the case for a Colab Pro+ seat or a self-hosted GPU runner: the free '
                 'tier is recycling sessions faster than the checkpoints can save work.')
            _github_output('status', 'abandoned')
            return 1
        return _relaunch(marker, marker_path, workdir, args, session=session)

    # failed or abandoned
    marker['ended_at'] = marker.get('ended_at') or rs.stamp()
    rs.atomic_write_json(marker_path, marker)
    if alive:
        _say('  ── last log lines ──')
        for line in session.tail_log(marker.get('log_path', f'{marker["vm_run_dir"]}/run.log'),
                                     scratch=workdir).splitlines()[-25:]:
            _say(f'  {line}')
        if not args.keep_session:
            session.stop()
    _say(f'✗ run {run_id} ended as {status}: {reason}')
    return 1


def _load_marker(run_id: str | None) -> dict[str, Any] | None:
    if run_id:
        marker = rs.read_json(rs.marker_path(run_id, REPO_ROOT))
        if marker is None:
            _say(f'✗ no run marker for {run_id}')
        return marker
    return rs.active_marker(REPO_ROOT)


def _relaunch(marker: dict[str, Any], marker_path: Path, workdir: Path,
              args: argparse.Namespace, session: cs.ColabSession | None = None) -> int:
    """Provision a replacement VM and continue the run from whatever checkpoints exist."""
    run_id = marker['run_id']
    attempts = int(marker.get('attempt', 1))
    if session is None:
        session = cs.ColabSession(name=marker.get('session') or '', gpu=marker.get('gpu', cs.GPU))
        if session.alive():
            _say(f'· session {session.name} is alive; releasing it before provisioning a replacement')
            session.stop()

    _say(f'▶ relaunching (attempt {attempts + 1}) — the checkpoints make this a continuation')
    try:
        replacement = cs.ColabSession.create(cs.session_name(f'{run_id}-r{attempts + 1}'),
                                             gpu=marker.get('gpu', cs.GPU))
    except cs.ColabCliError as exc:
        _say(f'  · no GPU available right now: {exc}')
        _say('  Leaving the marker as stalled; the next watch tick tries again.')
        marker['status'] = 'stalled'
        rs.atomic_write_json(marker_path, marker)
        _github_output('status', 'stalled')
        return 0

    resume_from = Path(args.resume_from) if args.resume_from else workdir / 'checkpoint'
    states = sorted(resume_from.glob('*_resume.pt')) if resume_from.is_dir() else []

    new_marker = dict(marker)
    new_marker.update({
        'attempt': attempts + 1,
        'session': replacement.name,
        'status': 'provisioning',
        'heartbeat_at': None,
        'relaunched_at': rs.stamp(),
    })
    config = _run_config(run_id, new_marker, resume=True, notebook_sha=marker.get('notebook_sha256', ''))
    remote_config = f'{new_marker["vm_run_dir"]}/run_config.json'
    remote_notebook = f'{new_marker["vm_run_dir"]}/HazardNet_auto_train.ipynb'
    try:
        replacement.mkdir(new_marker['vm_run_dir'])
        replacement.mkdir(new_marker['checkpoint_dir'])
        local_config = workdir / f'{run_id}.relaunch_config.json'
        rs.atomic_write_json(local_config, config)
        replacement.upload(local_config, remote_config)
        replacement.upload(NOTEBOOK_PATH, remote_notebook)
        # The checkpoints go back to the same place the dead session kept them, which is
        # what makes `resume: true` mean something to the notebook.
        target_dir = f'{new_marker["checkpoint_dir"]}/{new_marker.get("strategy", DEFAULT_STRATEGY)}'
        replacement.mkdir(target_dir)
        for state in states:
            replacement.upload(state, f'{target_dir}/{state.name}')
            _say(f'  · restored {state.name} ({state.stat().st_size / 1e6:.1f} MB)')
        pid = replacement.launch_training(remote_notebook, f'{new_marker["vm_run_dir"]}/run.log',
                                          env={'HN_RUN_CONFIG': remote_config})
        new_marker['pid'] = pid
        rs.append_event(new_marker,
                        f'relaunched with resume=true as pid {pid} in session {replacement.name}'
                        + (f', restoring {len(states)} checkpoint(s)' if states else ', with no checkpoint to restore'))
        rs.atomic_write_json(marker_path, new_marker)
        _say(f'✓ relaunched as attempt {attempts + 1} (pid {pid})'
             + (f' from {len(states)} checkpoint(s)' if states else ' from scratch'))
        if not states:
            _say('  ⚠ no resumable state was available, so this attempt starts over. That is the '
                 'expensive outcome: the watcher archives a checkpoint every tick precisely so it '
                 'does not happen.')
        _github_output('status', 'relaunched')
        _github_output('run_id', run_id)
        return 0
    except cs.ColabCliError as exc:
        _say(f'✗ the relaunch failed: {exc}')
        replacement.stop()
        rs.append_event(new_marker, f'relaunch failed: {exc}')
        rs.atomic_write_json(marker_path, new_marker)
        _github_output('status', 'stalled')
        return 1


# ── collect / validate ───────────────────────────────────────────────────────


def cmd_collect(args: argparse.Namespace) -> int:
    run_id = args.run_id
    marker: dict[str, Any] | None = None
    if run_id:
        marker = rs.read_json(rs.marker_path(run_id, REPO_ROOT))
        if marker is None:
            _say(f'✗ no run marker for {run_id}')
            return 2
    else:
        candidates = [run for run in rs.list_markers(REPO_ROOT)
                      if run.get('status') == 'complete' and not (run.get('intake') or {}).get('done')]
        if not candidates:
            _say('· no completed run is waiting for intake')
            _github_output('found', 'false')
            return 0
        candidates.sort(key=lambda run: run.get('ended_at') or run.get('created_at') or '')
        marker = candidates[-1]
        run_id = marker['run_id']

    bundle_dir = Path(args.bundle_dir) / run_id
    bundle_dir.mkdir(parents=True, exist_ok=True)
    _say(f'▶ collecting the bundle for {run_id} into {bundle_dir}')

    try:
        _require_cli_and_token(args.token_json)
    except SystemExit as exc:
        _say(str(exc))
        return 2

    staged = bundle_dir / 'run_manifest.json'
    if staged.is_file():
        # The watcher already carried the bundle off the VM and the workflow handed it
        # down as an artifact. Validating what is on disk is the whole job now.
        _say('  · the bundle was already collected by the watcher; validating it')
        vm_ok, source_dir = False, 'workflow artifact'
        missing = [name for name in (*rs.REQUIRED_ARTIFACTS, 'run_manifest.json')
                   if not (bundle_dir / name).is_file()]
    else:
        session = cs.ColabSession(name=marker.get('session') or '')
        # A headless session has no Drive (`colab drivemount` needs a TTY), so the VM is
        # the only place the bundle exists. If it is gone and the watcher never carried
        # the bundle out, the run has to be relaunched — which is what the message says.
        vm_ok = session.alive()
        source_dir = marker['vm_run_dir']
        if not vm_ok:
            _say(f'✗ session {session.name} is gone and no bundle was staged for validation.')
            _say('  The watcher downloads a finished bundle on the tick that sees it; if this '
                 'run completed and vanished in between, relaunch it — the checkpoints make '
                 'that a continuation, not a restart.')
            _github_output('found', 'true')
            _github_output('run_id', run_id)
            _github_output('valid', 'false')
            return 1
        missing = []
    if vm_ok:
        session = cs.ColabSession(name=marker.get('session') or '')
        for name in rs.REQUIRED_ARTIFACTS + ('run_manifest.json', 'run.log'):
            local = bundle_dir / name
            got = session.download(f'{source_dir}/bundle/{name}', local)
            if not got and name != 'run.log':
                got = session.download(f'{source_dir}/{name}', local)
            if not got:
                missing.append(name)
            elif local.is_file():
                _say(f'  · {name} ({local.stat().st_size:,} bytes)')

    manifest = rs.read_json(bundle_dir / 'run_manifest.json')
    problems = rs.validate_manifest(manifest)
    if missing:
        problems.append('not downloaded: ' + ', '.join(missing))

    report = {
        'schema': 'hazardnet-retrain-intake/v1',
        'run_id': run_id,
        'collected_at': rs.stamp(),
        'bundle_dir': str(bundle_dir),
        'source': source_dir,
        'session_was_alive': vm_ok,
        'manifest': manifest,
        'problems': problems,
        'inventory': rs.inventory(bundle_dir),
    }
    rs.atomic_write_json(bundle_dir / 'intake-report.json', report)

    if problems:
        _say(f'✗ the bundle is not promotable:')
        for problem in problems:
            _say(f'  - {problem}')
        _github_output('found', 'true')
        _github_output('run_id', run_id)
        _github_output('valid', 'false')
        return 1

    _say(f'✓ the bundle validates: {len(report["inventory"])} artifacts, manifest agrees')
    marker.setdefault('intake', {})['done'] = False
    marker['intake'].update({'collected_at': report['collected_at'], 'bundle_dir': str(bundle_dir), 'valid': True})
    rs.atomic_write_json(rs.marker_path(run_id, REPO_ROOT), marker)
    _github_output('found', 'true')
    _github_output('run_id', run_id)
    _github_output('valid', 'true')
    _github_output('bundle_dir', str(bundle_dir))
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Validate a bundle on disk — no Colab, no network. This is what CI runs."""
    bundle_dir = Path(args.bundle_dir)
    manifest_path = bundle_dir / 'run_manifest.json'
    if not bundle_dir.is_dir():
        _say(f'✗ {bundle_dir} is not a directory')
        return 2
    manifest = rs.read_json(manifest_path)
    problems = rs.validate_manifest(manifest)

    # Cross-check the manifest against the bytes actually on disk: a manifest that
    # describes a different file than the one sitting next to it is worse than no
    # manifest, because it looks like evidence.
    inventory = {entry['name']: entry for entry in rs.inventory(bundle_dir)}
    for entry in (manifest or {}).get('artifacts') or []:
        name = entry.get('name')
        on_disk = inventory.get(name)
        if on_disk is None or on_disk.get('present') is not True:
            problems.append(f'{name} is in the manifest but not on disk')
        elif on_disk.get('sha256') != entry.get('sha256'):
            problems.append(f'{name} on disk is {on_disk.get("sha256")} but the manifest claims {entry.get("sha256")}')

    fp32 = bundle_dir / 'hazardnet_fp32.tflite'
    int8 = bundle_dir / 'hazardnet_int8.tflite'
    if fp32.is_file() and int8.is_file() and rs.sha256_file(fp32) == rs.sha256_file(int8):
        # Expected, and worth saying: ADR 0007 records that TFLite's converter
        # crashes on CONV_3D under INT8, so the "int8" file is a copy. A bundle that
        # suddenly has a *different* int8 file is the surprising case.
        _say('· hazardnet_int8.tflite is byte-identical to fp32, as ADR 0007 expects')

    report = {
        'schema': 'hazardnet-retrain-intake/v1',
        'bundle_dir': str(bundle_dir),
        'validated_at': rs.stamp(),
        'manifest': manifest,
        'inventory': rs.inventory(bundle_dir),
        'problems': problems,
    }
    if args.report:
        rs.atomic_write_json(Path(args.report), report)
        _say(f'· report written to {args.report}')

    if problems:
        _say('✗ not promotable:')
        for problem in problems:
            _say(f'  - {problem}')
        _github_output('valid', 'false')
        return 1
    _say('✓ the bundle and its manifest agree')
    _github_output('valid', 'true')
    return 0


# ── the handshake ────────────────────────────────────────────────────────────
#
# `Models/VERSION.json` is written by `scripts/gen-model-version.mjs` and by nothing
# else. Its version is `<package.json version>+model.<sha256 of the four claimed
# artifact hashes, first 12 hex>`, it is idempotent, and CI fails when the file is
# stale. An earlier draft of this module grew its own `stamp` command with its own
# idea of the suffix (the FP32 hash alone); two writers for one handshake is how a
# repository ends up with a version string nobody can recompute, so the duplicate is
# gone and `model_intake.yml` calls the generator. `handshake_artifacts()` exists to
# keep the two artifact lists honest with each other.

class RetrainCliError(RuntimeError):
    """The automation could not read something it depends on; the message says what."""


GENERATOR = REPO_ROOT / 'scripts' / 'gen-model-version.mjs'
_ARTIFACT_LIST_RE = re.compile(r'const artifacts = \[([^\]]+)\]')


def handshake_artifacts(generator: Path = GENERATOR) -> list[str]:
    """The artifact names the handshake generator claims, read from its source.

    Parsed rather than retyped: the Python contract (`retrain_state.REQUIRED_ARTIFACTS`)
    and the Node generator have to agree about what ships, and a copy of the list in a
    third place would be the thing that drifts.
    """
    text = Path(generator).read_text(encoding='utf-8')
    match = _ARTIFACT_LIST_RE.search(text)
    if not match:
        raise RetrainCliError(f'{generator} no longer declares `const artifacts = [...]`')
    return re.findall(r"'([^']+)'", match.group(1))


def cmd_mark(args: argparse.Namespace) -> int:
    """Record what intake did, in the marker, so the next tick does not repeat it.

    The hourly intake workflow is only safe to schedule because a run that has become a
    pull request stops looking like work to do. Without this the same bundle would open a
    new PR every hour.
    """
    marker_path = rs.marker_path(args.run_id, REPO_ROOT)
    marker = rs.read_json(marker_path)
    if marker is None:
        _say(f'✗ no run marker at {marker_path}')
        return 2
    intake = marker.setdefault('intake', {})
    if args.pr:
        intake.update({'done': True, 'pr': args.pr, 'pr_at': rs.stamp()})
        rs.append_event(marker, f'intake opened {args.pr}')
        _say(f'✓ {args.run_id} is recorded as intaken: {args.pr}')
    elif args.failed:
        intake.update({'done': False, 'failed_at': rs.stamp(), 'reason': args.failed})
        rs.append_event(marker, f'intake refused the bundle: {args.failed}')
        _say(f'✗ {args.run_id} intake refused: {args.failed}')
        _say('  The marker keeps the run eligible, so a bundle that becomes complete on a '
             'later attempt is picked up automatically. A bundle that cannot be fixed needs '
             'a human to mark the run failed.')
    else:
        _say('· nothing to record: pass --pr or --failed')
        return 0
    rs.atomic_write_json(marker_path, marker)
    return 0


# ── status ───────────────────────────────────────────────────────────────────


def cmd_status(args: argparse.Namespace) -> int:
    runs = rs.list_markers(REPO_ROOT)
    if not runs:
        _say('no retrain runs recorded')
        return 0
    runs.sort(key=lambda run: run.get('created_at') or '')
    for run in runs[-args.limit:]:
        progress = run.get('progress') or {}
        where = ''
        if progress.get('epoch') and progress.get('epochs'):
            where = f" epoch {progress['epoch']}/{progress['epochs']}"
            if progress.get('fold'):
                where += f" ({progress['fold']})"
        _say(f"{run['run_id']}  {run.get('status'):<12} attempt {run.get('attempt', 1)}  "
             f"started {run.get('started_at')}{where}")
        if run.get('events'):
            _say(f"    last: {run['events'][-1].get('message', '')}")
    return 0


# ── argparse ─────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='python -m mlops.retrain_cli', description=__doc__.splitlines()[0])
    parser.add_argument('--workdir', default=os.environ.get('RUNNER_TEMP', '/tmp/hn-retrain'),
                        help='scratch directory for downloaded state (default: $RUNNER_TEMP)')
    sub = parser.add_subparsers(dest='command', required=True)

    start = sub.add_parser('start', help='provision a Colab VM and launch the notebook detached')
    start.add_argument('--strategy', default=os.environ.get('HN_STRATEGY', DEFAULT_STRATEGY))
    start.add_argument('--gpu', default=os.environ.get('HN_GPU', 'T4'))
    start.add_argument('--token-json', default=os.environ.get('COLAB_TOKEN_JSON'),
                       help='the Colab OAuth token; normally the COLAB_TOKEN_JSON secret')
    start.add_argument('--triggered-by', default=os.environ.get('GITHUB_EVENT_NAME', 'manual'))
    start.add_argument('--force', action='store_true', help='start even if a run is already in flight')
    start.set_defaults(func=cmd_start)

    watch = sub.add_parser('watch', help='classify the in-flight run and act on it')
    watch.add_argument('--run-id', default=os.environ.get('HN_RUN_ID'))
    watch.add_argument('--token-json', default=os.environ.get('COLAB_TOKEN_JSON'))
    watch.add_argument('--stale-minutes', type=float, default=rs.HEARTBEAT_STALE_MINUTES)
    watch.add_argument('--max-hours', type=float, default=rs.MAX_RUN_HOURS)
    watch.add_argument('--max-attempts', type=int, default=DEFAULT_MAX_ATTEMPTS)
    watch.add_argument('--tail', action='store_true', help='print the last log lines of a live run')
    watch.add_argument('--keep-session', action='store_true', help='do not release the VM after completion')
    watch.add_argument('--mode', choices=('follow', 'probe', 'relaunch'),
                       default=os.environ.get('HN_WATCH_MODE', 'follow'),
                       help='probe: observe and carry state out. relaunch: provision a replacement '
                            'and resume. follow (default): both, in one command')
    watch.add_argument('--resume-from', help='a directory of *_resume.pt files to restore into the '
                                             'replacement VM (normally a downloaded workflow artifact)')
    watch.set_defaults(func=cmd_watch)

    collect = sub.add_parser('collect', help='download a finished bundle and validate it')
    collect.add_argument('--run-id', default=os.environ.get('HN_RUN_ID'))
    collect.add_argument('--bundle-dir', default=os.environ.get('HN_BUNDLE_DIR', 'data/mlops/incoming'))
    collect.add_argument('--token-json', default=os.environ.get('COLAB_TOKEN_JSON'))
    collect.set_defaults(func=cmd_collect)

    validate = sub.add_parser('validate', help='validate a bundle already on disk (offline)')
    validate.add_argument('bundle_dir')
    validate.add_argument('--report', help='write the intake report here')
    validate.set_defaults(func=cmd_validate)

    mark = sub.add_parser('mark', help='record an intake outcome in the run marker')
    mark.add_argument('--run-id', required=True)
    mark.add_argument('--pr', help='the pull request the bundle became')
    mark.add_argument('--failed', help='why intake refused the bundle')
    mark.set_defaults(func=cmd_mark)

    status = sub.add_parser('status', help='print recorded runs')
    status.add_argument('--limit', type=int, default=10)
    status.set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except cs.ColabCliError as exc:
        _say(f'✗ {exc}')
        return 2


if __name__ == '__main__':
    sys.exit(main())
