#!/usr/bin/env python3
"""The model registry: what artifacts exist, what they are, and their stage.

WHAT A REGISTRY HAS TO DO HERE
------------------------------
This repository has model artifacts (`Models/*.tflite`) and a handshake file
(`Models/VERSION.json`) that CI already pins — but no single place that answers
"which artifact is live, which is a candidate, which is retired, and who said
so". Phase 3 asks for exactly that, plus a promotion policy that a human has to
satisfy. The registry is therefore:

* **an audit of the handshake** — every artifact VERSION.json claims, checked
  against the bytes on disk (size and sha256), plus everything on disk it does
  *not* claim. A stale handshake is a real failure mode: the backend reports
  `model_version` from it, and `scripts/auto_forecast.py` refuses to run when the
  artifact hash disagrees with it.
* **an inventory with roles** — `model`, `support` (labels/stats/config) or
  `documentation`. Roles matter because only a model can hold a *stage*.
* **a stage machine** — `candidate` → `shadow` → `champion` → `retired`, with
  exactly one champion per role and **no transition to `champion` without an
  approver and a passing challenger comparison** (`evaluate_promotion`).

KNOWN LANDMINE, ENCODED HERE
----------------------------
`Models/hazardnet_int8.tflite` is **byte-identical to the FP32 file** (ADR 0007:
TFLite's converter crashes on `CONV_3D` under INT8, so the bundle's "int8" name is
historical). The registry records that as `duplicate_of` rather than letting two
"models" look like two options, and `audit()` reports a duplicate-content artifact
instead of silently listing it as a second model.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import REPO_ROOT

SCHEMA = 'hazardnet-model-registry/v1'
VERSION_PATH = REPO_ROOT / 'Models' / 'VERSION.json'
MODELS_DIR = REPO_ROOT / 'Models'

#: The stages an artifact can hold. `champion` is the one the pipeline runs.
STAGES = ('candidate', 'shadow', 'champion', 'retired')

#: Artifacts whose role is a model (weights) rather than support/contracts.
MODEL_ROLES = ('model',)

#: The registry's own output. Skipped by the disk scan so that *building* the
#: registry cannot change what the registry says: otherwise the first write adds an
#: entry, the second write sees it, and a fresh clone never reproduces the
#: committed file. (An earlier version listed itself and did exactly that.)
SELF_OUTPUTS = ('REGISTRY.json',)

#: What each known artifact is. Anything on disk that is not listed here and not
#: claimed by VERSION.json is reported as unregistered rather than ignored.
KNOWN_ARTIFACTS = {
    'hazardnet_fp32.tflite': {'role': 'model', 'format': 'tflite', 'stage': 'champion',
                              'note': 'the artifact the daily pipeline loads (Models/VERSION.json handshake)'},
    'hazardnet_int8.tflite': {'role': 'model', 'format': 'tflite', 'stage': 'retired',
                              'note': 'ADR 0007: byte-identical duplicate of the FP32 file; the '
                                      '"int8" name is historical, no true INT8 artifact exists'},
    'labels.json': {'role': 'support', 'format': 'json', 'note': 'the eight-class vocabulary order'},
    'normalization_stats.json': {'role': 'support', 'format': 'json', 'note': 'per-band z-score statistics'},
    'preprocessing_config.json': {'role': 'support', 'format': 'json',
                                  'note': 'band order, input shape, normalisation type'},
    'inference_example.py': {'role': 'documentation', 'format': 'python',
                             'note': 'standalone inference example for the edge bundle'},
    'README.md': {'role': 'documentation', 'format': 'markdown', 'note': 'bundle description'},
    'VERSION.json': {'role': 'metadata', 'format': 'json',
                     'note': 'the artifact handshake itself (the registry audits *against* this file)'},
    'REGISTRY.json': {'role': 'metadata', 'format': 'json',
                      'note': 'this registry document (the audit skips its own output)'},
}

#: Promotion policy — the numbers a challenger must beat. Deliberately explicit
#: and deliberately conservative: the repository's model is *degenerate* today
#: (MODEL_CARD §6.1), so "no regression" is a stricter bar than it looks.
PROMOTION_POLICY = {
    'version': 'promotion-policy/1.0.0',
    #: Metrics where lower is better on the challenger.
    'must_improve': {
        'ece': 0.0,           # calibration error must not get worse at all
        'csi': 0.0,           # critical success index must not decrease
        'far': 0.0,           # false-alarm ratio must not increase
    },
    #: Relative tolerance so a change smaller than float noise is not a "regression".
    'tolerance': 0.01,
    #: A challenger with too few evaluated events is not comparable.
    'min_evaluated_events': 30,
    #: Required provenance on the comparison itself.
    'required_fields': ('evaluated_events', 'ece', 'csi', 'far'),
    #: Human sign-off is mandatory; there is no automatic promotion path.
    'requires_approver': True,
}


#: File suffixes that make an artifact a model, used when the registry has no
#: explicit entry for the name.
MODEL_FORMATS = ('.tflite', '.lite', '.onnx', '.pt')


def infer_role(name: str) -> dict:
    """The role of a file the registry has no explicit entry for.

    A `*.tflite` in `Models/` is a model, whoever put it there: without this a
    bundle that is not in `KNOWN_ARTIFACTS` (a challenger staged for comparison, a
    temporary directory in a test) would be classified as `unclassified` and could
    not be promoted, which would make the stage machine untestable and, worse,
    silently wrong for any artifact added later.
    """
    suffix = Path(name).suffix.lower()
    if suffix in MODEL_FORMATS:
        return {'role': 'model', 'format': suffix.lstrip('.')}
    return {'role': 'unclassified', 'format': suffix.lstrip('.') or None}


class RegistryError(ValueError):
    """Raised for a registry that cannot be built or applied."""


def display_path(path) -> str:
    """A path for the report: repo-relative when it is inside the repository.

    `Path.relative_to` raises for anything outside the repo (a temporary bundle in a
    test, or an operator pointing `--models-dir` at a scratch directory), and a
    registry that crashes on a valid input is worse than one that prints an absolute
    path. An earlier version called `relative_to` unconditionally.
    """
    path = Path(path)
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def sha256_file(path, *, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_version_handshake(path=VERSION_PATH) -> dict:
    """Read `Models/VERSION.json`. Missing is an error: CI pins it for a reason."""
    path = Path(path)
    if not path.exists():
        raise RegistryError(f'{path} is missing — run `node scripts/gen-model-version.mjs`')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise RegistryError(f'{path} is not valid JSON ({exc})')


def audit(models_dir=MODELS_DIR, *, handshake_path=VERSION_PATH) -> dict:
    """Compare the handshake, the files on disk, and the known-artifact table.

    Returns every entry it could establish plus lists of problems:
    `missing_on_disk`, `hash_mismatches`, `unregistered`, `duplicate_content`.
    """
    models_dir = Path(models_dir)
    handshake = load_version_handshake(handshake_path)
    problems = {'missing_on_disk': [], 'hash_mismatches': [], 'size_mismatches': [],
                'unregistered': [], 'not_in_handshake': [], 'duplicate_content': []}

    claimed = {entry['name']: entry for entry in handshake.get('artifacts', [])}
    entries = []
    seen_hashes = {}

    for name, claim in claimed.items():
        path = models_dir / name
        entry = {
            'id': name,
            'path': display_path(path),
            'bytes': claim.get('bytes'),
            'sha256': claim.get('sha256'),
            'in_handshake': True,
            'exists': path.exists(),
        }
        entry.update(KNOWN_ARTIFACTS.get(name) or infer_role(name))
        if not path.exists():
            problems['missing_on_disk'].append(name)
            entry['status'] = 'missing'
            entries.append(entry)
            continue
        actual_bytes = path.stat().st_size
        actual_hash = sha256_file(path)
        entry['actual_bytes'] = actual_bytes
        entry['actual_sha256'] = actual_hash
        entry['status'] = 'ok'
        if claim.get('bytes') is not None and claim['bytes'] != actual_bytes:
            problems['size_mismatches'].append(
                f'{name}: handshake says {claim["bytes"]} bytes, disk has {actual_bytes}'
            )
            entry['status'] = 'mismatch'
        if claim.get('sha256') and claim['sha256'] != actual_hash:
            problems['hash_mismatches'].append(
                f'{name}: handshake says {claim["sha256"][:12]}…, disk has {actual_hash[:12]}…'
            )
            entry['status'] = 'mismatch'
        seen_hashes.setdefault(actual_hash, []).append(name)
        entries.append(entry)

    # Files present in Models/ that the handshake does not claim.
    for path in sorted(models_dir.iterdir()):
        if not path.is_file() or path.name in claimed or path.name in SELF_OUTPUTS:
            continue
        entry = {
            'id': path.name,
            'path': display_path(path),
            'bytes': path.stat().st_size,
            'sha256': sha256_file(path),
            'in_handshake': False,
            'exists': True,
            'status': 'unregistered',
        }
        known = KNOWN_ARTIFACTS.get(path.name)
        entry.update(known or infer_role(path.name))
        if known:
            # Known to the registry but not claimed by the handshake: worth a line
            # in the report (a bundle file the handshake forgot) but not an error.
            problems['not_in_handshake'].append(path.name)
        else:
            problems['unregistered'].append(path.name)
        seen_hashes.setdefault(entry['sha256'], []).append(path.name)
        entries.append(entry)

    for digest, names in seen_hashes.items():
        if len(names) > 1:
            problems['duplicate_content'].append(
                f'{", ".join(sorted(names))} are byte-identical (sha256 {digest[:12]}…)'
            )

    # Attach duplicate_of to every duplicate so the registry cannot be misread as
    # offering two models where there is one.
    for entry in entries:
        if entry.get('actual_sha256') or entry.get('sha256'):
            digest = entry.get('actual_sha256') or entry.get('sha256')
            peers = [name for name in seen_hashes.get(digest, []) if name != entry['id']]
            if peers and entry.get('role') == 'model':
                entry['duplicate_of'] = sorted(peers)[0]

    champions = [entry for entry in entries if entry.get('stage') == 'champion']
    return {
        'models_dir': display_path(models_dir),
        'handshake': {
            'path': display_path(handshake_path),
            'version': handshake.get('version'),
            'generated_at': handshake.get('generatedAt'),
            'claimed_artifacts': sorted(claimed),
        },
        'entries': sorted(entries, key=lambda item: (item.get('role') != 'model', item['id'])),
        'champions': [entry['id'] for entry in champions],
        'problems': problems,
        'ok': not (problems['missing_on_disk'] or problems['hash_mismatches']
                   or problems['size_mismatches']),
    }


def build_registry(*, models_dir=MODELS_DIR, handshake_path=VERSION_PATH,
                   stages: dict = None, approvals: dict = None) -> dict:
    """The registry document: the audit, plus the stage each artifact holds.

    `stages` overrides the built-in table (the CLI passes what it read from an
    existing registry file, so a promotion survives a rebuild); `approvals`
    records who promoted what and when — the field that makes the champion claim
    auditable rather than asserted.
    """
    audit_result = audit(models_dir, handshake_path=handshake_path)
    stages = stages or {}
    approvals = approvals or {}
    entries = []
    for entry in audit_result['entries']:
        record = dict(entry)
        if record.get('role') == 'model':
            record['stage'] = stages.get(record['id']) or record.get('stage') or 'candidate'
            approval = approvals.get(record['id'])
            if approval:
                record['approval'] = approval
        entries.append(record)

    champion_ids = [record['id'] for record in entries if record.get('stage') == 'champion']
    return {
        'schema': SCHEMA,
        'source_of_truth': audit_result['handshake'],
        'handshake': audit_result['handshake'],
        'entries': entries,
        'champions': champion_ids,
        'policy': PROMOTION_POLICY,
        'problems': audit_result['problems'],
        'ok': audit_result['ok'],
    }


def validate_registry(registry: dict) -> list:
    """Problems that would make the registry misleading."""
    problems = []
    if registry.get('schema') != SCHEMA:
        problems.append(f"schema is {registry.get('schema')!r}, expected {SCHEMA!r}")
    entries = registry.get('entries') or []
    if not entries:
        problems.append('registry has no entries')
    models = [entry for entry in entries if entry.get('role') == 'model']
    champions = [entry for entry in models if entry.get('stage') == 'champion']
    if len(champions) != 1:
        problems.append(
            f'expected exactly one champion model, found {len(champions)} '
            f'({", ".join(entry["id"] for entry in champions) or "none"})'
        )
    for entry in entries:
        if entry.get('stage') and entry['stage'] not in STAGES:
            problems.append(f"{entry['id']}: unknown stage {entry['stage']!r} (expected {STAGES})")
        if entry.get('role') != 'model' and entry.get('stage'):
            problems.append(f"{entry['id']}: only a model artifact can hold a stage")
    # Two *live* model artifacts with identical bytes means one of them is
    # mislabelled — but a retired alias (ADR 0007's `hazardnet_int8.tflite`) is
    # the documented case of exactly that pair, so it is not a problem. The rule
    # is therefore "no two non-retired models share content".
    by_digest = {}
    for entry in entries:
        # A staged entry counts as a model even when the registry only inferred it
        # from the file suffix; retiring one takes it out of the live set.
        if (entry.get('role') != 'model' and not entry.get('stage')) or entry.get('stage') == 'retired':
            continue
        digest = entry.get('actual_sha256') or entry.get('sha256')
        by_digest.setdefault(digest, []).append(entry['id'])
    for digest, names in by_digest.items():
        if len(names) > 1:
            problems.append(
                f"{', '.join(sorted(names))} are live model artifacts with identical content "
                f'(sha256 {str(digest)[:12]}…) — one of them is a mislabel'
            )
    for name in (registry.get('problems') or {}).get('missing_on_disk', []):
        problems.append(f'{name}: claimed by the handshake but not on disk')
    for mismatch in (registry.get('problems') or {}).get('hash_mismatches', []):
        problems.append(mismatch)
    return problems


def write_registry(registry: dict, path) -> str:
    """Write the registry deterministically (no timestamps: a rebuild is a no-op).

    A `generated_at` that changes on every run would make the file dirty in CI
    for no reason — the same reason `scripts/gen-model-version.mjs` keeps its
    `generatedAt` stable when nothing else changed.
    """
    problems = validate_registry(registry)
    if problems:
        raise RegistryError('refusing to write an invalid registry:\n  - ' + '\n  - '.join(problems))
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(registry, indent=2, sort_keys=False) + '\n'
    existing = target.read_text(encoding='utf-8') if target.exists() else None
    if existing == payload:
        return 'unchanged'
    target.write_text(payload, encoding='utf-8')
    return 'written'


def load_registry(path) -> dict:
    path = Path(path)
    if not path.exists():
        raise RegistryError(f'{path} does not exist — build it with `python -m mlops.cli registry --write`')
    return json.loads(path.read_text(encoding='utf-8'))


# ── promotion ───────────────────────────────────────────────────────────────

def evaluate_promotion(challenger: dict, champion: dict = None, *, approver: str = None,
                       policy: dict = None) -> dict:
    """Decide whether a challenger may replace the champion. Never auto-approves.

    Both arguments are evaluation reports of the shape
    `scripts/mlops/evaluate.py` writes (or any dict carrying the policy's
    required fields). The decision is `approved` only when every gate passes
    **and** a named approver is present; otherwise it is `refused` with the
    reasons, which is what the CLI prints and what a reviewer reads.
    """
    policy = policy or PROMOTION_POLICY
    reasons = []

    if not isinstance(challenger, dict):
        return {'decision': 'refused', 'reasons': ['challenger report is not an object'],
                'policy': policy['version']}

    status = challenger.get('status')
    if status != 'ok':
        reasons.append(
            f"challenger evaluation status is {status!r}"
            + (f" ({challenger.get('reason')})" if challenger.get('reason') else '')
            + ' — a run with insufficient truth cannot be compared'
        )

    missing = [field for field in policy['required_fields'] if challenger.get(field) is None]
    if missing:
        reasons.append(f"challenger report is missing {', '.join(missing)}")

    evaluated = challenger.get('evaluated_events')
    if evaluated is not None and evaluated < policy['min_evaluated_events']:
        reasons.append(
            f"challenger was evaluated on {evaluated} events; at least "
            f"{policy['min_evaluated_events']} are required to compare"
        )

    comparisons = []
    tolerance = policy['tolerance']
    for metric, minimum in policy['must_improve'].items():
        challenger_value = challenger.get(metric)
        if challenger_value is None:
            continue
        if champion is None:
            # No champion report: the challenger still has to be inside an
            # absolute bar for the metric, otherwise "no baseline" becomes a
            # loophole for promoting anything.
            if _worse_than_absolute(metric, challenger_value, minimum):
                reasons.append(f'{metric}={challenger_value} fails the absolute bar for a first champion')
            comparisons.append({'metric': metric, 'challenger': challenger_value,
                                'champion': None, 'verdict': 'absolute-bar'})
            continue
        champion_value = champion.get(metric)
        if champion_value is None:
            comparisons.append({'metric': metric, 'challenger': challenger_value,
                                'champion': None, 'verdict': 'champion-missing-metric'})
            continue
        delta = challenger_value - champion_value
        relative = abs(delta) / abs(champion_value) if champion_value else abs(delta)
        worse = _worse(metric, delta, minimum)
        if worse and relative > tolerance:
            reasons.append(
                f'{metric} regresses: challenger {challenger_value} vs champion {champion_value} '
                f'({delta:+.4f})'
            )
        comparisons.append({
            'metric': metric,
            'challenger': challenger_value,
            'champion': champion_value,
            'delta': round(delta, 6),
            'verdict': 'regression' if worse and relative > tolerance else 'ok',
        })

    if policy.get('requires_approver') and not (approver or '').strip():
        reasons.append(
            'no approver recorded — promotion requires an explicit human sign-off '
            '(this repository has no automatic promotion path)'
        )

    return {
        'decision': 'approved' if not reasons else 'refused',
        'reasons': reasons,
        'comparisons': comparisons,
        'policy': policy['version'],
        'approver': (approver or None),
        'evaluated_events': evaluated,
    }


def _worse(metric, delta, minimum):
    """Is a positive `delta` a regression for this metric?

    Lower-is-better metrics (FAR, ECE) regress when they go up; higher-is-better
    metrics (CSI, POD) regress when they go down. The policy lists each metric
    with the direction it must not move, which keeps the rule readable in the
    policy rather than buried in a comparison.
    """
    direction = _DIRECTION[metric]
    return delta > minimum if direction == 'lower' else delta < -minimum


def _worse_than_absolute(metric, value, minimum):
    direction = _DIRECTION[metric]
    bar = {'csi': 0.20, 'pod': 0.30, 'far': 0.80, 'ece': 0.20}.get(metric)
    if bar is None:
        return value < minimum if direction == 'higher' else value > minimum
    return value < bar if direction == 'higher' else value > bar


#: Which way each metric is better. Adding a metric to the policy without adding
#: it here raises at import time rather than silently comparing the wrong way.
_DIRECTION = {
    'ece': 'lower',
    'far': 'lower',
    'brier': 'lower',
    'psi': 'lower',
    'csi': 'higher',
    'pod': 'higher',
    'precision': 'higher',
    'recall': 'higher',
    'f1': 'higher',
}

for _metric in PROMOTION_POLICY['must_improve']:
    if _metric not in _DIRECTION:
        raise RuntimeError(f'promotion policy names {_metric!r} but _DIRECTION does not define it')


def apply_promotion(registry: dict, *, artifact: str, approver: str, decision: dict = None,
                    stage: str = 'champion') -> dict:
    """Record a promotion in the registry. Refuses without an approved decision."""
    if stage not in STAGES:
        raise RegistryError(f'unknown stage {stage!r}')
    entries = registry.get('entries') or []
    target = next((entry for entry in entries if entry['id'] == artifact), None)
    if target is None:
        raise RegistryError(f'{artifact} is not in the registry')
    if target.get('role') != 'model':
        raise RegistryError(f'{artifact} is a {target.get("role")} artifact; only a model can be promoted')
    if stage == 'champion':
        if not decision or decision.get('decision') != 'approved':
            reasons = (decision or {}).get('reasons') or ['no decision supplied']
            raise RegistryError('refusing to promote without an approved decision:\n  - '
                                + '\n  - '.join(reasons))
        if not (approver or '').strip():
            raise RegistryError('refusing to promote without a named approver')
    if not (approver or '').strip():
        raise RegistryError('every stage change records who made it')

    updated = json.loads(json.dumps(registry))
    for entry in updated['entries']:
        if entry.get('role') != 'model':
            continue
        if entry['id'] == artifact:
            entry['stage'] = stage
            entry['approval'] = {
                'approver': approver.strip(),
                'from': target.get('stage'),
                'to': stage,
                'policy': (decision or {}).get('policy', PROMOTION_POLICY['version']),
                'decision': (decision or {}).get('decision'),
            }
        elif entry.get('stage') == 'champion' and stage == 'champion':
            # Exactly one champion: the previous holder steps down to shadow
            # rather than disappearing, so a rollback is one registry edit away.
            entry['stage'] = 'shadow'
            entry['approval'] = {
                'approver': approver.strip(),
                'from': 'champion',
                'to': 'shadow',
                'policy': (decision or {}).get('policy', PROMOTION_POLICY['version']),
                'decision': 'demoted-by-promotion',
            }
    updated['champions'] = [entry['id'] for entry in updated['entries'] if entry.get('stage') == 'champion']
    problems = validate_registry(updated)
    if problems:
        raise RegistryError('promotion would leave an invalid registry:\n  - ' + '\n  - '.join(problems))
    return updated
