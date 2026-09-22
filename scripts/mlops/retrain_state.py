#!/usr/bin/env python3
"""The retrain run: one contract, read by a notebook in Colab and by Actions on a runner.

WHY THIS MODULE EXISTS
----------------------
A monthly retrain spans two machines that never meet. A Colab VM — driven by hand,
on a free-tier T4, for seven to nine hours — trains the model and opens a pull
request; a GitHub runner then validates what that PR carries before a human decides
to merge it. Neither side can see the other's filesystem, and the run is far too
long to hold open in one process, so everything they share has to be a file with a
schema, written where the other can reach it.

Two documents, both written atomically, both schema-stamped, both defined here so
the notebook and the workflows cannot drift apart:

``journal``    ``<run_dir>/heartbeat.json`` — written by the notebook at every phase
               change and mirrored to Drive. Progress, and the record a *resumed*
               run reads to know how far the session that died had got.
``manifest``   ``<run_dir>/run_manifest.json`` — written once, at the end. What was
               produced: every artifact with its size and sha256, the fold metrics
               the training actually returned, the ONNX→TFLite parity numbers, and
               the environment that produced them. This is the handshake the PR gate
               validates the bundle against, in the same spirit as
               ``Models/VERSION.json`` is the handshake for the bundle that ships —
               and ``write_version_handshake()`` below writes that one too, so a
               notebook on a VM with no Node.js produces byte-identical output to
               the repository's ``scripts/gen-model-version.mjs``.

RULES
-----
* **A run is resumable or it is not worth starting.** Colab's free tier drops a
  session without telling anybody, and a run that dies at hour seven has to continue
  from hour seven — so every epoch writes a resumable state next to the best-weights
  checkpoint, and ``resume_states()`` is how the next attempt finds it. Weights alone
  are not enough: without the optimizer, the LR schedule and the RNGs, a "resumed"
  run silently restarts its cosine decay and converges to something nobody validated.
* **Nothing is inferred from absence.** A missing journal is not "epoch 0" and a
  missing manifest is not "failed"; both are reported as unknown, with the age that
  made them so. Same rule as ``mlops.metrics``: no metric without evidence.
* **The manifest is validated before it is trusted.** ``validate_manifest()`` returns
  the list of reasons a bundle may not be merged, and an empty list is the only pass.
  The PR gate refuses on a non-empty one.
* **The bundle never deletes what it does not replace.** A retrain writes the five
  artifacts it produced into ``Models/`` and leaves everything else there — the
  README, the inference example, the calibration template, the registry. The
  notebook's publish cell used to ``rm -rf Models/*`` first, which is how a merged
  training PR silently deleted ``Models/VERSION.json``, ``Models/REGISTRY.json`` and
  ``Models/calibration/`` from ``main`` and turned three CI jobs red for a day.

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

SCHEMA_HEARTBEAT = 'hazardnet-retrain-heartbeat/v1'
SCHEMA_MANIFEST = 'hazardnet-retrain-manifest/v1'

#: Where a run's files live, and which of those places survives the VM.
#:
#: `vm` is inside the Colab session: fast, and gone the moment the free tier recycles
#: it. `drive` is the mirror the notebook keeps — mounting Drive is interactive (it
#: prompts for a code in the browser), which a run driven by hand can answer.
#: Checkpoints go to Drive whenever it is mounted, because that is what makes a
#: dropped session cost twenty minutes instead of eight hours.
#:
#: The Drive folder name uses the underscore form; the notebook's first cell used to
#: `cd` into a space-separated "HazardNet Deployment" while every later cell read
#: "HazardNet_Deployment" — the kind of mismatch that only ever surfaces at hour six.
VM_RUN_ROOT = '/content/hn_retrain'
DRIVE_ROOT = '/content/drive/MyDrive/HazardNet_Deployment'
DRIVE_RETRAIN_SUBDIR = 'retrain_runs'

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

#: The run's own identity: a timestamp and the strategy, so two attempts in one month
#: cannot collide and a reader can tell what produced a bundle without opening it.
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


# ── run identity ─────────────────────────────────────────────────────────────


def new_run_id(strategy: str, now: datetime | None = None, attempt: int = 1) -> str:
    """`20261001T180000-event_kfold`, with `-r2` on a relaunched attempt."""
    when = now or utcnow()
    safe = re.sub(r'[^a-z_]', '', strategy.lower())[:24] or 'run'
    suffix = '' if attempt <= 1 else f'-r{attempt}'
    return f"{when.strftime('%Y%m%dT%H%M%S')}-{safe}{suffix}"


# ── run directories ──────────────────────────────────────────────────────────


def run_dirs(run_id: str) -> tuple[Path, Path]:
    """(vm_run_dir, drive_run_dir) for a run id."""
    return Path(VM_RUN_ROOT) / run_id, Path(DRIVE_ROOT) / DRIVE_RETRAIN_SUBDIR / run_id


def checkpoint_dir(vm_run_dir: str, drive_mounted: bool) -> str:
    """Where fold checkpoints go: Drive when it is mounted, the VM otherwise.

    The distinction decides whether a run survives a dropped session on its own. On
    Drive it does — a re-run finds the resumable states exactly where they were left.
    On the VM it does not, which is why the notebook says out loud which one it got.
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


# ── the shipped bundle's handshake ───────────────────────────────────────────

#: The artifacts `Models/VERSION.json` names. This is the *shipped* bundle, which is
#: narrower than `REQUIRED_ARTIFACTS`: the handshake covers what the backend loads at
#: boot and reports as `model_version`, and `hazardnet_int8.tflite` is a byte-identical
#: duplicate (ADR 0007) that no caller reads. The list, the field order, the hash and
#: the version string all mirror `scripts/gen-model-version.mjs` — deliberately, and
#: `scripts/tests/test_model_handshake.py` runs both writers over the committed bundle
#: and fails if a single byte differs. Two implementations of one contract is a drift
#: risk, so the drift risk is the test.
VERSION_ARTIFACTS = (
    'hazardnet_fp32.tflite',
    'labels.json',
    'normalization_stats.json',
    'preprocessing_config.json',
)


def iso_millis(now: datetime | None = None) -> str:
    """`2026-09-19T19:39:21.731Z` — what JavaScript's `Date.toISOString()` prints.

    Not `stamp()`: the handshake's `generatedAt` has to be byte-comparable with the
    file the Node writer produces, which means millisecond precision and a literal Z.
    """
    moment = now or utcnow()
    return moment.strftime('%Y-%m-%dT%H:%M:%S.') + f'{moment.microsecond // 1000:03d}Z'


def read_package_version(repo_root: Path | str = '.') -> str:
    """`package.json`'s version, which the handshake's version string is built from."""
    doc = read_json(Path(repo_root) / 'package.json')
    if not isinstance(doc, dict) or not doc.get('version'):
        raise RetrainStateError(f'{repo_root}/package.json carries no version')
    return str(doc['version'])


def handshake_doc(
    models_dir: Path | str,
    package_version: str,
    *,
    names: tuple[str, ...] = VERSION_ARTIFACTS,
    now: datetime | None = None,
) -> dict[str, Any]:
    """The handshake document for the artifacts on disk, in the Node writer's shape.

    Key order is part of the contract (`generatedAt`, `artifacts`, `version`) because
    the file is compared byte-for-byte against what CI regenerates. An artifact that is
    not on disk is skipped rather than fatal — same as the Node writer's warning — so
    the *absence* is reported by `validate_manifest()` and the registry audit, which
    are the two places that can say what it means.
    """
    root = Path(models_dir)
    artifacts: list[dict[str, Any]] = []
    for name in names:
        path = root / name
        if not path.is_file():
            continue
        artifacts.append({
            'name': name,
            'bytes': path.stat().st_size,
            'sha256': sha256_file(path),
        })
    combined = hashlib.sha256(''.join(a['sha256'] for a in artifacts).encode('utf-8')).hexdigest()[:12]
    return {
        'generatedAt': iso_millis(now),
        'artifacts': artifacts,
        'version': f'{package_version}+model.{combined}',
    }


def write_version_handshake(
    models_dir: Path | str,
    package_version: str,
    *,
    path: Path | str | None = None,
    now: datetime | None = None,
) -> tuple[Path, bool]:
    """Write `Models/VERSION.json`; returns (path, changed).

    Idempotent in the same way the Node writer is: when the artifacts and the version
    string are unchanged, the committed file is left byte-identical — a fresh
    `generatedAt` on every run would dirty it unconditionally, and CI's
    `Model VERSION.json is current` gate would then be red on every commit. So
    `generatedAt` means "the handshake last changed", not "the script last ran".

    The notebook calls this from a Colab VM, where there is no Node.js; the PR it opens
    therefore arrives with a handshake that CI can verify rather than repair.
    """
    target = Path(path) if path is not None else Path(models_dir) / 'VERSION.json'
    entry = handshake_doc(models_dir, package_version, now=now)
    previous = read_json(target)
    if (
        isinstance(previous, dict)
        and previous.get('version') == entry['version']
        and previous.get('artifacts') == entry['artifacts']
    ):
        return target, False
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return target, True
