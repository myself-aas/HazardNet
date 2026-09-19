#!/usr/bin/env python3
"""The retrain run: one contract, read by a notebook in Colab and by Actions on a runner.

WHY THIS MODULE EXISTS
----------------------
A monthly retrain now spans two machines that never meet. A Colab VM trains for
seven to nine hours on a free-tier T4; GitHub Actions provisions it, watches it,
and turns what it produced into a pull request. Neither side can call the other,
neither can see the other's filesystem, and a GitHub-hosted job is killed at six
hours — so no single process is alive for the whole run. Everything they share
has to be a file with a schema, in a place both can reach, written so that a
reader can tell three things apart: *still training*, *finished*, and *died
silently*.

That last distinction is the reason for the heartbeat. Colab's free tier recycles
a session whenever it likes, and a recycled session does not notify anybody: the
VM simply stops existing. Without a periodic signal, a watcher cannot distinguish
a fold that has been inside one long epoch for forty minutes from a run that died
four hours ago, and the two need opposite responses — leave it alone, or relaunch
it with `--resume` and let the checkpoint carry on.

So the run is described by three documents, all written atomically, all
schema-stamped, all in this one module so the notebook and the workflows cannot
drift apart:

``run marker``    ``data/mlops/retrain-runs/<run_id>.json`` — committed to the
                  repository. The run's identity and lifecycle: which notebook
                  sha, which strategy, which Colab session, which attempt, what
                  status. It is committed because the question "did we retrain
                  this month, and what happened" has to be answerable from the
                  repository alone, without a Colab account.
``heartbeat``     ``<run_dir>/heartbeat.json`` — written by the notebook every
                  epoch, on the VM, and mirrored to Drive when a human has mounted
                  one (a headless session cannot: `colab drivemount` needs a TTY).
                  Liveness and progress.
``manifest``      ``<run_dir>/run_manifest.json`` — written once, at the end, by
                  the notebook. What was produced: every artifact with its size
                  and sha256, the fold metrics, the ONNX→TFLite parity numbers,
                  and the environment that produced them. This is the handshake
                  the intake step validates the bundle against, in the same spirit
                  as ``Models/VERSION.json`` is the handshake for the bundle that
                  ships.

RULES
-----
* **A run is resumable or it is not worth starting.** On a free-tier GPU an
  eight-hour run that dies at hour seven has to continue from hour seven, so every
  epoch writes a resumable state next to the best-weights checkpoint, and
  ``resume_states()`` is how a relaunched attempt finds it.
* **Nothing is inferred from absence.** A missing heartbeat is not "epoch 0" and a
  missing manifest is not "failed"; both are reported as unknown, with the age that
  made them so. Same rule as ``mlops.metrics``: no metric without evidence.
* **The manifest is validated before it is trusted.** ``validate_manifest()``
  returns the list of reasons a bundle may not be promoted, and an empty list is
  the only pass. Intake refuses on a non-empty one.

Deliberately dependency-free and offline, like the rest of ``scripts.mlops``: the
only thing this module touches is the filesystem, so every rule in it is tested in
CI without a Colab account, a GPU, or a network.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_RUN = 'hazardnet-retrain-run/v1'
SCHEMA_HEARTBEAT = 'hazardnet-retrain-heartbeat/v1'
SCHEMA_MANIFEST = 'hazardnet-retrain-manifest/v1'

#: Where a run's files live, and which of those places survives the VM.
#:
#: `vm` is inside the Colab session: fast, and gone the moment the free tier recycles
#: it. `drive` is the mirror the notebook keeps *when a human has mounted Drive* —
#: `colab drivemount` needs a TTY and browser consent, so a headless session has no
#: Drive at all, and nothing in the automated path may assume one.
#:
#: The durable store for an unattended run is therefore GitHub: the watcher downloads
#: the newest resumable checkpoint off the VM each tick and uploads it as a workflow
#: artifact, and a relaunch uploads it back into the fresh VM. Same trust boundary as
#: everything else in the pipeline, and no third credential.
#:
#: The Drive folder name uses the underscore form; the notebook's first cell used to
#: `cd` into a space-separated "HazardNet Deployment" while every later cell read
#: "HazardNet_Deployment" — the kind of mismatch that only ever surfaces at hour six.
VM_RUN_ROOT = '/content/hn_retrain'
DRIVE_ROOT = '/content/drive/MyDrive/HazardNet_Deployment'
DRIVE_RETRAIN_SUBDIR = 'retrain_runs'

#: Prefix for the workflow artifact that carries a run's resumable checkpoint between
#: sessions. One live artifact per run: the watcher deletes the previous one after
#: uploading the next, because a checkpoint per twenty-minute tick would be a gigabyte
#: of storage for a run whose only useful state is the newest epoch.
CHECKPOINT_ARTIFACT_PREFIX = 'retrain-checkpoint-'


def checkpoint_artifact_name(run_id: str, epoch: int) -> str:
    return f'{CHECKPOINT_ARTIFACT_PREFIX}{run_id}-e{int(epoch)}'

#: The repository's own record of every run, committed.
RUN_MARKER_DIR = Path('data/mlops/retrain-runs')

#: The artifacts a complete bundle must contain. `hazardnet_int8.tflite` is
#: expected and is byte-identical to the fp32 file (ADR 0007: TFLite's converter
#: crashes on CONV_3D under INT8, so the name is historical) — intake checks that
#: it is present and says so, rather than reporting a duplicate as a defect.
REQUIRED_ARTIFACTS = (
    'hazardnet_fp32.tflite',
    'hazardnet_int8.tflite',
    'labels.json',
    'normalization_stats.json',
    'preprocessing_config.json',
)

#: The conversion parity gate, defined once. The notebook's golden test refuses to
#: publish below it and `validate_manifest()` refuses to accept above it — a single
#: number, because two thresholds for the same question is how a bundle gets
#: published that intake then rejects, eight hours after the run started.
PARITY_GATE_PCT = 99.0

#: Liveness and lifetime policy, in minutes. A fold's epoch on the event K-fold
#: strategy is minutes long, not hours, so 45 minutes of silence means the session
#: is gone; 15 hours means the run has outlivened the budget for one attempt and
#: the watcher stops paying for it. Both are arguments to `classify()`, not
#: constants the caller cannot change.
HEARTBEAT_STALE_MINUTES = 45
MAX_RUN_HOURS = 15
#: Colab's free tier does not guarantee a T4; an attempt that never produced a
#: heartbeat within this window is treated as a provisioning failure and retried.
PROVISION_GRACE_MINUTES = 25

STATUSES = (
    'pending',       # marker written, nothing provisioned yet
    'provisioning',  # session requested, no heartbeat yet
    'training',      # heartbeat fresh, manifest absent
    'converting',    # heartbeat says the fold loop is done and conversion started
    'complete',      # manifest present and valid
    'stalled',       # heartbeat older than the staleness window
    'failed',        # the notebook wrote a failure into the marker or the manifest
    'abandoned',     # the attempt budget ran out
)
TERMINAL_STATUSES = ('complete', 'failed', 'abandoned')

RUN_ID_RE = re.compile(r'^\d{8}T\d{6}-[a-z_]{3,24}(-r\d+)?$')
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


class RetrainStateError(Exception):
    """The run state could not be read or written; the message says why."""


# ── time ─────────────────────────────────────────────────────────────────────


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def stamp(when: datetime | None = None) -> str:
    """An ISO-8601 UTC stamp with seconds — the form every other artifact here uses."""
    return (when or utcnow()).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def parse_stamp(value: Any) -> datetime | None:
    """Parse a stamp without raising: an unparseable date is evidence of nothing."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def age_minutes(value: Any, now: datetime | None = None) -> float | None:
    """Minutes since `value`; None when it is absent or unparseable."""
    parsed = parse_stamp(value)
    if parsed is None:
        return None
    return ((now or utcnow()) - parsed).total_seconds() / 60.0


# ── files ────────────────────────────────────────────────────────────────────


def atomic_write_json(path: Path | str, payload: dict[str, Any]) -> Path:
    """Write JSON so a reader never sees a half-written document.

    This matters twice over: a Colab VM can vanish mid-write, and the Drive mirror
    is a FUSE filesystem where a partially flushed file is a normal occurrence. A
    reader that parsed a truncated heartbeat would conclude the run died at the
    exact moment it was alive.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(f'.{target.name}.tmp')
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    os.replace(tmp, target)
    return target


def read_json(path: Path | str) -> dict[str, Any] | None:
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None


def sha256_file(path: Path | str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


# ── the run marker (committed) ───────────────────────────────────────────────


def new_run_id(strategy: str, now: datetime | None = None, attempt: int = 1) -> str:
    """`20261001T180000-event_kfold`, with `-r2` on a relaunched attempt."""
    when = now or utcnow()
    safe = re.sub(r'[^a-z_]', '', strategy.lower())[:24] or 'run'
    suffix = '' if attempt <= 1 else f'-r{attempt}'
    return f"{when.strftime('%Y%m%dT%H%M%S')}-{safe}{suffix}"


def marker_path(run_id: str, repo_root: Path | str = '.') -> Path:
    if not RUN_ID_RE.match(run_id):
        raise RetrainStateError(f'{run_id!r} is not a run id this module writes')
    return Path(repo_root) / RUN_MARKER_DIR / f'{run_id}.json'


def new_marker(
    run_id: str,
    *,
    strategy: str,
    notebook_sha256: str,
    repo_sha: str,
    session: str,
    gpu: str = 'T4',
    triggered_by: str = 'schedule',
    now: datetime | None = None,
) -> dict[str, Any]:
    """The marker as written at provision time: an identity, not a prediction."""
    return {
        'schema': SCHEMA_RUN,
        'run_id': run_id,
        'status': 'provisioning',
        'strategy': strategy,
        'gpu': gpu,
        'session': session,
        'attempt': int(run_id.rsplit('-r', 1)[-1]) if '-r' in run_id else 1,
        'triggered_by': triggered_by,
        'created_at': stamp(now),
        'started_at': stamp(now),
        'heartbeat_at': None,
        'ended_at': None,
        'notebook_sha256': notebook_sha256,
        'repo_sha': repo_sha,
        'vm_run_dir': f'{VM_RUN_ROOT}/{run_id}',
        'drive_run_dir': f'{DRIVE_ROOT}/{DRIVE_RETRAIN_SUBDIR}/{run_id}',
        'expected_artifacts': list(REQUIRED_ARTIFACTS),
        'events': [],
    }


def append_event(marker: dict[str, Any], message: str, now: datetime | None = None) -> dict[str, Any]:
    """A run's log lives in its marker, because the VM that produced it will not."""
    events = marker.setdefault('events', [])
    events.append({'at': stamp(now), 'message': message})
    marker['events'] = events[-40:]
    return marker


def list_markers(repo_root: Path | str = '.') -> list[dict[str, Any]]:
    directory = Path(repo_root) / RUN_MARKER_DIR
    if not directory.is_dir():
        return []
    runs = []
    for path in sorted(directory.glob('*.json')):
        doc = read_json(path)
        if isinstance(doc, dict) and doc.get('schema') == SCHEMA_RUN:
            doc['_path'] = str(path)
            runs.append(doc)
    return runs


def active_marker(repo_root: Path | str = '.') -> dict[str, Any] | None:
    """The newest run that has not reached a terminal status, if there is one.

    One run at a time is a policy, not a limitation: two attempts training on one
    free-tier quota would both be recycled, and two bundles competing for one
    promotion PR is a confusion nobody needs.
    """
    live = [run for run in list_markers(repo_root) if run.get('status') not in TERMINAL_STATUSES]
    if not live:
        return None
    live.sort(key=lambda run: run.get('created_at') or '', reverse=True)
    return live[0]


# ── heartbeat and manifest paths ─────────────────────────────────────────────


def run_dirs(run_id: str) -> tuple[Path, Path]:
    """(vm_run_dir, drive_run_dir) for a run id."""
    return Path(VM_RUN_ROOT) / run_id, Path(DRIVE_ROOT) / DRIVE_RETRAIN_SUBDIR / run_id


def checkpoint_dir(vm_run_dir: str, drive_mounted: bool) -> str:
    """Where fold checkpoints go: Drive when a human mounted it, the VM otherwise.

    The distinction decides whether a run can survive a recycled session on its own.
    Unattended, it cannot — which is why the watcher carries the newest checkpoint out
    to a workflow artifact every tick instead.
    """
    if drive_mounted:
        return f'{DRIVE_ROOT}/data/HazardNet_event_based_model_outputs'
    return f'{vm_run_dir}/outputs'


def heartbeat_doc(
    run_id: str,
    *,
    phase: str,
    fold: str | None = None,
    epoch: int | None = None,
    epochs: int | None = None,
    val_loss: float | None = None,
    val_acc: float | None = None,
    message: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """One heartbeat. Every field is optional except the run and the time: a
    heartbeat that could not measure the loss still proves the session is alive."""
    doc: dict[str, Any] = {
        'schema': SCHEMA_HEARTBEAT,
        'run_id': run_id,
        'at': stamp(now),
        'phase': phase,
        'pid': os.getpid(),
        'host': os.environ.get('HOSTNAME') or 'colab',
    }
    for key, value in (
        ('fold', fold), ('epoch', epoch), ('epochs', epochs),
        ('val_loss', val_loss), ('val_acc', val_acc), ('message', message),
    ):
        if value is not None:
            doc[key] = value
    return doc


def write_heartbeat(run_dir: Path | str, doc: dict[str, Any], mirror_dir: Path | str | None = None) -> Path:
    """Write the heartbeat to the VM, then mirror it to Drive.

    The mirror is best-effort on purpose: a Drive FUSE hiccup must not kill a
    training run at hour six, and the VM copy is the one the watcher reads while
    the session lives. The mirror is what survives it.
    """
    written = atomic_write_json(Path(run_dir) / 'heartbeat.json', doc)
    if mirror_dir:
        try:
            atomic_write_json(Path(mirror_dir) / 'heartbeat.json', doc)
        except OSError:
            pass
    return written


def manifest_doc(
    run_id: str,
    *,
    strategy: str,
    folds: list[dict[str, Any]],
    parity: dict[str, Any] | None,
    environment: dict[str, Any],
    artifacts: list[dict[str, Any]],
    notebook_sha256: str,
    repo_sha: str,
    started_at: str,
    duration_seconds: float,
    resumed_from: list[str] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """The document intake validates a bundle against."""
    return {
        'schema': SCHEMA_MANIFEST,
        'run_id': run_id,
        'generated_at': stamp(now),
        'strategy': strategy,
        'started_at': started_at,
        'duration_seconds': round(float(duration_seconds), 1),
        'resumed_from': resumed_from or [],
        'notebook_sha256': notebook_sha256,
        'repo_sha': repo_sha,
        'environment': environment,
        'folds': folds,
        'parity': parity,
        'artifacts': artifacts,
    }


def inventory(bundle_dir: Path | str, names: tuple[str, ...] = REQUIRED_ARTIFACTS) -> list[dict[str, Any]]:
    """Size and hash every artifact in a bundle directory, in a stable order."""
    root = Path(bundle_dir)
    out = []
    for name in sorted(names):
        path = root / name
        if not path.is_file():
            out.append({'name': name, 'present': False})
            continue
        out.append({
            'name': name,
            'present': True,
            'bytes': path.stat().st_size,
            'sha256': sha256_file(path),
            'role': 'model' if name.endswith('.tflite') else 'support',
        })
    return out


def validate_manifest(manifest: Any) -> list[str]:
    """Every reason this manifest may not become a promotion candidate.

    An empty list is the only pass. Each string is written to be read by whoever
    is on the hook for the run at 02:00, so it names the field and the value.
    """
    problems: list[str] = []
    if not isinstance(manifest, dict):
        return ['the manifest is not a JSON object']
    if manifest.get('schema') != SCHEMA_MANIFEST:
        problems.append(f"schema is {manifest.get('schema')!r}, expected {SCHEMA_MANIFEST!r}")
    if not manifest.get('run_id'):
        problems.append('run_id is missing')
    artifacts = manifest.get('artifacts')
    if not isinstance(artifacts, list) or not artifacts:
        problems.append('artifacts is missing or empty')
        return problems

    by_name = {a.get('name'): a for a in artifacts if isinstance(a, dict)}
    for name in REQUIRED_ARTIFACTS:
        entry = by_name.get(name)
        if entry is None:
            problems.append(f'artifact {name} is not in the manifest')
            continue
        if entry.get('present') is not True:
            problems.append(f'artifact {name} was not produced')
            continue
        if not isinstance(entry.get('bytes'), int) or entry['bytes'] <= 0:
            problems.append(f'artifact {name} reports a non-positive size: {entry.get("bytes")!r}')
        if not SHA256_RE.match(str(entry.get('sha256', ''))):
            problems.append(f'artifact {name} has no sha256: {entry.get("sha256")!r}')

    fp32 = by_name.get('hazardnet_fp32.tflite') or {}
    if isinstance(fp32.get('bytes'), int) and fp32['bytes'] > 0:
        # The production bundle is ~790 KB. A conversion that produced a stub, or a
        # truncated download, shows up here long before it shows up as bad forecasts.
        if fp32['bytes'] < 100_000:
            problems.append(f'hazardnet_fp32.tflite is only {fp32["bytes"]} bytes — too small to be the CNN')
        if fp32['bytes'] > 60_000_000:
            problems.append(f'hazardnet_fp32.tflite is {fp32["bytes"]} bytes — far larger than the ~790 KB bundle')

    folds = manifest.get('folds')
    if not isinstance(folds, list) or not folds:
        problems.append('no fold reported any metric')
    else:
        for fold in folds:
            if not isinstance(fold, dict):
                problems.append('a fold entry is not an object')
                continue
            for metric in ('accuracy', 'f1'):
                value = fold.get(metric)
                if not isinstance(value, (int, float)) or not 0.0 <= float(value) <= 1.0:
                    problems.append(f"fold {fold.get('fold')!r} reports {metric}={value!r}, outside 0..1")

    parity = manifest.get('parity')
    if not isinstance(parity, dict):
        problems.append('parity is missing: the ONNX→TFLite golden test did not report')
    else:
        agreement = parity.get('hazard_agreement_pct')
        if not isinstance(agreement, (int, float)) or float(agreement) < PARITY_GATE_PCT:
            problems.append(
                f'converted model agrees with the trained model on {agreement!r}% of hazards '
                f'(the gate is {PARITY_GATE_PCT}% — a conversion that changes predictions is not a conversion)'
            )

    environment = manifest.get('environment')
    if not isinstance(environment, dict) or not environment.get('gpu'):
        problems.append('environment.gpu is missing: nothing records what hardware produced this bundle')
    return problems


# ── the state machine the watcher runs on ────────────────────────────────────


def classify(
    marker: dict[str, Any],
    heartbeat: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    *,
    now: datetime | None = None,
    heartbeat_stale_minutes: float = HEARTBEAT_STALE_MINUTES,
    max_run_hours: float = MAX_RUN_HOURS,
    provision_grace_minutes: float = PROVISION_GRACE_MINUTES,
) -> tuple[str, str]:
    """(status, reason) for a run, from the three documents and the clock.

    The watcher calls this every twenty minutes and acts on the answer: keep the
    session alive, relaunch it with `--resume`, collect the bundle, or give up and
    say so. Every branch names the evidence it used, because "the retrain did not
    happen this month" needs a reason in the issue it opens, not a shrug.
    """
    moment = now or utcnow()
    recorded = marker.get('status')
    if recorded in ('failed', 'abandoned'):
        return recorded, f'the run marker records {recorded}'

    if manifest is not None:
        problems = validate_manifest(manifest)
        if problems:
            return 'failed', 'the manifest is present but not promotable: ' + '; '.join(problems[:4])
        return 'complete', f'manifest present with {len(manifest.get("artifacts") or [])} artifacts'

    beat_at = (heartbeat or {}).get('at') or marker.get('heartbeat_at')
    beat_age = age_minutes(beat_at, moment)
    started_age = age_minutes(marker.get('started_at'), moment)

    # The lifetime budget is checked first, and deliberately so: a run that has been
    # going for sixteen hours and has *also* gone quiet must not be relaunched into
    # another sixteen. Giving up wins over retrying, because the retry is the thing
    # with a cost.
    if started_age is not None and started_age > max_run_hours * 60:
        return 'abandoned', (
            f'the run has been going {started_age / 60:.1f} h, past the {max_run_hours:.0f} h budget'
            + ('' if beat_age is None else f', and its last heartbeat is {beat_age:.0f} minutes old')
        )

    if beat_age is None:
        if started_age is not None and started_age > provision_grace_minutes:
            return 'stalled', (
                f'no heartbeat {started_age:.0f} minutes after the session was provisioned '
                f'(the free tier may not have had a {marker.get("gpu", "T4")} to give)'
            )
        return 'provisioning', 'the session is provisioned and no heartbeat has arrived yet'

    if beat_age > heartbeat_stale_minutes:
        phase = (heartbeat or {}).get('phase', 'unknown phase')
        return 'stalled', (
            f'the last heartbeat is {beat_age:.0f} minutes old ({phase}) — a session that is '
            'recycled stops writing without telling anybody, so silence this old means it is gone'
        )

    phase = (heartbeat or {}).get('phase')
    if phase == 'converting':
        return 'converting', 'the fold loop finished and the converter is running'
    epoch, epochs = (heartbeat or {}).get('epoch'), (heartbeat or {}).get('epochs')
    progress = f', epoch {epoch}/{epochs}' if epoch and epochs else ''
    return 'training', f'heartbeat {beat_age:.0f} minutes old ({phase}{progress})'


def resume_states(run_dir: Path | str) -> list[Path]:
    """The resumable states a previous attempt left in a run directory.

    Written by the notebook next to each fold's best-weights checkpoint, read by
    the next attempt. A run that has none simply starts over — which is correct,
    and is why this returns a list rather than raising.
    """
    root = Path(run_dir)
    if not root.is_dir():
        return []
    return sorted(root.rglob('*_resume.pt'))
