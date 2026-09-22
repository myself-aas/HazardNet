"""The model version handshake has two writers, and they must agree byte for byte.

`Models/VERSION.json` is the model's identity: the backend reads it at boot and reports
it through `/health` and `/api/predict` metadata, CI regenerates it and fails on a diff,
and the audit ledger quotes its version string. Two implementations write it:

* `scripts/gen-model-version.mjs` — Node, run by CI and by the verify gates;
* `mlops.retrain_state.write_version_handshake` — Python, run by the training notebook
  on a Colab VM, where there is no Node.js.

The notebook's pull request therefore has to arrive with a handshake the Node writer
would reproduce exactly, or `model_intake.yml` reports the PR as stale and a human has
to work out which of the two writers is lying. These tests pin the shared contract:
the artifact list, the version derivation, the key order, the skip-don't-fail rule for a
missing artifact, the idempotence rule that keeps `generatedAt` from dirtying the file,
and — when Node is available — the two writers' output on identical bytes.
"""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

from mlops import retrain_state as rs  # noqa: E402

NODE_WRITER = ROOT / 'scripts' / 'gen-model-version.mjs'
PACKAGE_JSON = ROOT / 'package.json'
MODELS_DIR = ROOT / 'Models'


def fixture_tree(root: Path, *, package_version='9.9.9', artifacts=None, script=True) -> Path:
    """A throwaway repository: package.json, Models/, and a copy of the Node writer.

    The writer derives its root from its own path (`import.meta.url`), so copying it into
    the fixture is what points it at the fixture's Models/ — the bytes under test are the
    same bytes CI runs.
    """
    (root / 'Models').mkdir(parents=True, exist_ok=True)
    (root / 'package.json').write_text(
        json.dumps({'name': 'hazardnet', 'version': package_version}, indent=2), encoding='utf-8',
    )
    for name, payload in (artifacts or default_artifacts()).items():
        (root / 'Models' / name).write_bytes(payload)
    if script:
        (root / 'scripts').mkdir(parents=True, exist_ok=True)
        shutil.copy2(NODE_WRITER, root / 'scripts' / NODE_WRITER.name)
    return root


def default_artifacts() -> dict[str, bytes]:
    """Deterministic, distinct bytes for the four contract artifacts."""
    return {
        name: f'{name}:{index}'.encode() * 64
        for index, name in enumerate(rs.VERSION_ARTIFACTS)
    }


def expected_version(artifacts: dict[str, bytes], package_version: str) -> str:
    digests = [hashlib.sha256(artifacts[name]).hexdigest()
               for name in rs.VERSION_ARTIFACTS if name in artifacts]
    combined = hashlib.sha256(''.join(digests).encode()).hexdigest()[:12]
    return f'{package_version}+model.{combined}'


def node_available() -> bool:
    return shutil.which('node') is not None


# ── the shape of the timestamp ────────────────────────────────────────────────


def test_iso_millis_is_what_javascript_prints():
    """`new Date().toISOString()` — milliseconds and a literal Z, no offset.

    The file is compared byte-for-byte against the Node writer's output, so a
    microsecond-precision or `+00:00` timestamp makes every regeneration dirty.
    """
    from datetime import datetime, timezone

    moment = datetime(2026, 9, 19, 19, 39, 21, 731000, tzinfo=timezone.utc)
    assert rs.iso_millis(moment) == '2026-09-19T19:39:21.731Z'
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', rs.iso_millis())


def test_the_stamp_helper_is_not_the_handshake_stamp():
    """`stamp()` is second-precision for human-readable records; the handshake needs
    millis. Keeping them separate is what stops a "cleanup" from merging the two."""
    assert '.' not in rs.stamp()
    assert '.' in rs.iso_millis()


# ── the version string ────────────────────────────────────────────────────────


def test_the_version_is_the_package_version_plus_the_artifact_digest(tmp_path):
    artifacts = default_artifacts()
    fixture_tree(tmp_path, artifacts=artifacts, script=False)
    doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert doc['version'] == expected_version(artifacts, '9.9.9')
    assert doc['version'].startswith('9.9.9+model.')
    assert len(doc['version'].split('+model.')[1]) == 12


def test_the_artifacts_are_listed_with_their_bytes_and_digests(tmp_path):
    artifacts = default_artifacts()
    fixture_tree(tmp_path, artifacts=artifacts, script=False)
    doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert [entry['name'] for entry in doc['artifacts']] == list(rs.VERSION_ARTIFACTS)
    for entry in doc['artifacts']:
        assert entry['bytes'] == len(artifacts[entry['name']])
        assert entry['sha256'] == hashlib.sha256(artifacts[entry['name']]).hexdigest()


def test_the_key_order_is_part_of_the_contract(tmp_path):
    """The file is compared byte-for-byte, so `json.dumps` order matters."""
    fixture_tree(tmp_path, script=False)
    doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert list(doc) == ['generatedAt', 'artifacts', 'version']
    assert list(doc['artifacts'][0]) == ['name', 'bytes', 'sha256']


def test_a_missing_artifact_is_skipped_not_fatal(tmp_path):
    """Same rule as the Node writer's warning: the absence is reported by the manifest
    validator and the registry audit, which can say what it means."""
    artifacts = default_artifacts()
    del artifacts['labels.json']
    fixture_tree(tmp_path, artifacts=artifacts, script=False)
    doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert [entry['name'] for entry in doc['artifacts']] == [
        name for name in rs.VERSION_ARTIFACTS if name != 'labels.json'
    ]
    assert doc['version'] == expected_version(artifacts, '9.9.9')


def test_the_package_version_is_read_from_package_json(tmp_path):
    fixture_tree(tmp_path, package_version='4.2.0', script=False)
    assert rs.read_package_version(tmp_path) == '4.2.0'


def test_a_package_without_a_version_is_an_error(tmp_path):
    (tmp_path / 'package.json').write_text('{"name": "hazardnet"}', encoding='utf-8')
    with pytest.raises(rs.RetrainStateError):
        rs.read_package_version(tmp_path)


# ── writing it, and not rewriting it ─────────────────────────────────────────


def test_writing_then_writing_again_changes_nothing(tmp_path):
    """CI regenerates the handshake and fails on a diff. A fresh `generatedAt` on every
    run would make that gate red on every commit, so `generatedAt` means "the handshake
    last changed", not "the writer last ran"."""
    fixture_tree(tmp_path, script=False)
    models = tmp_path / 'Models'
    path, changed = rs.write_version_handshake(models, '9.9.9')
    assert changed and path.is_file()
    first = path.read_bytes()

    path, changed = rs.write_version_handshake(models, '9.9.9')
    assert not changed, 'an unchanged handshake must not be rewritten'
    assert path.read_bytes() == first, 'the second write changed the bytes'


def test_a_changed_artifact_changes_the_handshake(tmp_path):
    fixture_tree(tmp_path, script=False)
    models = tmp_path / 'Models'
    rs.write_version_handshake(models, '9.9.9')
    before = json.loads((models / 'VERSION.json').read_text())

    (models / 'hazardnet_fp32.tflite').write_bytes(b'a different model entirely')
    # `generatedAt` has millisecond precision, so two writes inside one millisecond would
    # make the timestamp assertion below flaky rather than wrong.
    time.sleep(0.005)
    _, changed = rs.write_version_handshake(models, '9.9.9')
    after = json.loads((models / 'VERSION.json').read_text())
    assert changed
    assert after['version'] != before['version']
    assert after['generatedAt'] != before['generatedAt'], (
        'generatedAt records when the handshake last changed — and it just changed'
    )


def test_a_changed_package_version_changes_the_handshake(tmp_path):
    fixture_tree(tmp_path, script=False)
    models = tmp_path / 'Models'
    rs.write_version_handshake(models, '9.9.9')
    _, changed = rs.write_version_handshake(models, '9.9.10')
    doc = json.loads((models / 'VERSION.json').read_text())
    assert changed and doc['version'].startswith('9.9.10+model.')


def test_the_written_file_is_indented_json_with_a_trailing_newline(tmp_path):
    """`JSON.stringify(entry, null, 2) + '\\n'` on the Node side; anything else diffs."""
    fixture_tree(tmp_path, script=False)
    path, _ = rs.write_version_handshake(tmp_path / 'Models', '9.9.9')
    text = path.read_text(encoding='utf-8')
    assert text.endswith('}\n') and not text.endswith('}\n\n')
    assert '\n  "generatedAt"' in text


# ── the two writers agree ─────────────────────────────────────────────────────


def test_the_artifact_lists_are_the_same_list():
    """The Node writer hardcodes its four names; the Python writer has VERSION_ARTIFACTS.
    One of them gaining an artifact would silently change every version string."""
    source = NODE_WRITER.read_text(encoding='utf-8')
    match = re.search(r'const artifacts = \[(.*?)\];', source, re.S)
    assert match, f'{NODE_WRITER} no longer declares its artifact list'
    node_names = re.findall(r"'([^']+)'", match.group(1))
    assert node_names == list(rs.VERSION_ARTIFACTS), (
        f'node={node_names} python={list(rs.VERSION_ARTIFACTS)}'
    )


@pytest.mark.skipif(not node_available(), reason='node is not installed')
def test_the_node_writer_produces_the_same_version_string(tmp_path):
    artifacts = default_artifacts()
    fixture_tree(tmp_path, package_version='9.9.9', artifacts=artifacts)
    completed = subprocess.run(
        ['node', 'scripts/gen-model-version.mjs'], cwd=tmp_path,
        capture_output=True, text=True, timeout=120,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout
    node_doc = json.loads((tmp_path / 'Models' / 'VERSION.json').read_text(encoding='utf-8'))

    python_doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert node_doc['version'] == python_doc['version']
    assert node_doc['artifacts'] == python_doc['artifacts']
    assert list(node_doc) == list(python_doc)
    assert node_doc['version'] == expected_version(artifacts, '9.9.9')


@pytest.mark.skipif(not node_available(), reason='node is not installed')
def test_the_node_writer_is_idempotent_too(tmp_path):
    """If only one of the two writers were idempotent, CI's `git diff` gate would depend
    on which one ran last."""
    fixture_tree(tmp_path, package_version='9.9.9')
    target = tmp_path / 'Models' / 'VERSION.json'
    for _ in range(2):
        subprocess.run(['node', 'scripts/gen-model-version.mjs'], cwd=tmp_path,
                       check=True, capture_output=True, timeout=120)
    node_bytes = target.read_bytes()

    rs.write_version_handshake(tmp_path / 'Models', '9.9.9')
    python_doc = json.loads(target.read_text(encoding='utf-8'))
    node_doc = json.loads(node_bytes.decode('utf-8'))
    assert python_doc['version'] == node_doc['version']
    assert python_doc['artifacts'] == node_doc['artifacts']
    assert 'unchanged' in subprocess.run(
        ['node', 'scripts/gen-model-version.mjs'], cwd=tmp_path,
        check=True, capture_output=True, text=True, timeout=120,
    ).stdout


@pytest.mark.skipif(not node_available(), reason='node is not installed')
def test_a_missing_artifact_is_skipped_by_both_writers(tmp_path):
    artifacts = default_artifacts()
    del artifacts['preprocessing_config.json']
    fixture_tree(tmp_path, package_version='9.9.9', artifacts=artifacts)
    completed = subprocess.run(
        ['node', 'scripts/gen-model-version.mjs'], cwd=tmp_path,
        capture_output=True, text=True, timeout=120,
    )
    assert completed.returncode == 0
    assert 'missing artifact' in completed.stdout + completed.stderr
    node_doc = json.loads((tmp_path / 'Models' / 'VERSION.json').read_text(encoding='utf-8'))
    python_doc = rs.handshake_doc(tmp_path / 'Models', '9.9.9')
    assert node_doc['version'] == python_doc['version'] == expected_version(artifacts, '9.9.9')
    assert [a['name'] for a in node_doc['artifacts']] == list(artifacts)


# ── the committed handshake is current ────────────────────────────────────────


def test_the_committed_handshake_matches_the_committed_artifacts():
    """This is the gate `model_intake.yml` and the verify job run, expressed in Python so
    it also fails in a plain `pytest` run: a bundle and a stale VERSION.json cannot
    coexist without something noticing."""
    if not (MODELS_DIR / 'VERSION.json').is_file() or not PACKAGE_JSON.is_file():
        pytest.skip('Models/VERSION.json or package.json is not committed in this checkout')
    committed = json.loads((MODELS_DIR / 'VERSION.json').read_text(encoding='utf-8'))
    derived = rs.handshake_doc(MODELS_DIR, rs.read_package_version(ROOT))
    assert committed['version'] == derived['version'], (
        f'committed {committed["version"]} but the artifacts on disk derive '
        f'{derived["version"]} — run `node scripts/gen-model-version.mjs`'
    )
    assert committed['artifacts'] == derived['artifacts']
    assert set(committed) == {'generatedAt', 'artifacts', 'version'}
