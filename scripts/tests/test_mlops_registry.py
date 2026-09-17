"""The model registry, its audit, and the promotion gates (Phase 3 MLOps).

The registry's job is to make three claims checkable:

* **what the bundle contains** — every artifact's bytes against the handshake that
  `scripts/gen-model-version.mjs` produces and CI pins. A stale handshake is not a
  cosmetic problem: `backend/modelInfo.js` reports `model_version` from it and
  `scripts/auto_forecast.py` refuses to run when the artifact hash disagrees.
* **what the "int8" bundle really is** — ADR 0007 records that
  `Models/hazardnet_int8.tflite` is a byte-identical copy of the FP32 file (TFLite's
  converter crashes on `CONV_3D`), so the registry must show one model and one
  retired alias, not two models.
* **who said a model may be live** — `champion` requires a challenger that beats the
  bar *and* a named human. There is no automatic promotion path, and the tests below
  fail if one is added.
"""

import json
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))

from mlops import registry as registry_module  # noqa: E402
from mlops.registry import (  # noqa: E402
    PROMOTION_POLICY,
    RegistryError,
    apply_promotion,
    audit,
    build_registry,
    evaluate_promotion,
    sha256_file,
    validate_registry,
    write_registry,
)


def make_bundle(tmp_path, *, artifacts=None, extra=()):
    """A miniature Models/ directory plus its VERSION.json handshake."""
    models = tmp_path / 'Models'
    models.mkdir(parents=True, exist_ok=True)
    artifacts = artifacts if artifacts is not None else {'hazardnet_fp32.tflite': b'model-bytes' * 64}
    entries = []
    for name, payload in artifacts.items():
        path = models / name
        path.write_bytes(payload)
        entries.append({'name': name, 'bytes': len(payload), 'sha256': sha256_file(path)})
    for name, payload in extra:
        (models / name).write_bytes(payload)
    handshake = {
        'version': '9.9.9+model.deadbeefcafe',
        'generatedAt': '2026-09-18T00:00:00.000Z',
        'artifacts': entries,
    }
    handshake_path = models / 'VERSION.json'
    handshake_path.write_text(json.dumps(handshake, indent=2) + '\n')
    return models, handshake_path


# ── the real bundle ─────────────────────────────────────────────────────────

def test_the_shipped_bundle_audits_clean():
    result = audit()
    assert result['ok'] is True
    assert result['problems']['hash_mismatches'] == []
    assert result['problems']['missing_on_disk'] == []
    assert result['handshake']['version'].startswith('2.1.9+model.')


def test_the_int8_artifact_is_reported_as_a_duplicate_not_a_second_model():
    result = audit()
    duplicates = result['problems']['duplicate_content']
    assert any('hazardnet_int8.tflite' in entry and 'hazardnet_fp32.tflite' in entry
               for entry in duplicates)
    fp32 = next(entry for entry in result['entries'] if entry['id'] == 'hazardnet_fp32.tflite')
    int8 = next(entry for entry in result['entries'] if entry['id'] == 'hazardnet_int8.tflite')
    assert fp32['duplicate_of'] == 'hazardnet_int8.tflite'
    assert int8['duplicate_of'] == 'hazardnet_fp32.tflite'
    assert int8['stage'] == 'retired'
    assert int8['in_handshake'] is False      # gen-model-version.mjs excludes it


def test_the_registry_has_exactly_one_champion():
    project = build_registry()
    assert validate_registry(project) == []
    assert project['champions'] == ['hazardnet_fp32.tflite']
    assert [entry['id'] for entry in project['entries'] if entry.get('stage') == 'champion'] == \
        ['hazardnet_fp32.tflite']


def test_support_artifacts_cannot_hold_a_stage():
    project = build_registry()
    for entry in project['entries']:
        if entry.get('role') != 'model':
            assert 'stage' not in entry or entry.get('stage') is None


# ── the audit against a bundle that is wrong ────────────────────────────────

def test_a_hash_mismatch_is_reported_and_fails_the_audit(tmp_path):
    models, handshake = make_bundle(tmp_path)
    (models / 'hazardnet_fp32.tflite').write_bytes(b'tampered' * 8)
    result = audit(models, handshake_path=handshake)
    assert result['ok'] is False
    assert any('hazardnet_fp32.tflite' in entry for entry in result['problems']['hash_mismatches'])


def test_a_size_mismatch_is_reported(tmp_path):
    models, handshake = make_bundle(tmp_path)
    payload = json.loads(handshake.read_text())
    payload['artifacts'][0]['bytes'] = 1
    handshake.write_text(json.dumps(payload))
    result = audit(models, handshake_path=handshake)
    assert result['ok'] is False
    assert result['problems']['size_mismatches']


def test_a_handshake_entry_with_no_file_is_reported(tmp_path):
    models, handshake = make_bundle(tmp_path)
    (models / 'hazardnet_fp32.tflite').unlink()
    result = audit(models, handshake_path=handshake)
    assert result['ok'] is False
    assert 'hazardnet_fp32.tflite' in result['problems']['missing_on_disk']


def test_an_unknown_file_is_unregistered(tmp_path):
    models, handshake = make_bundle(tmp_path, extra=[('mystery.bin', b'?')])
    result = audit(models, handshake_path=handshake)
    assert 'mystery.bin' in result['problems']['unregistered']


def test_a_known_file_outside_the_handshake_is_not_an_error(tmp_path):
    models, handshake = make_bundle(tmp_path)
    (models / 'labels.json').write_text('["Flood"]')
    result = audit(models, handshake_path=handshake)
    assert 'labels.json' in result['problems']['not_in_handshake']
    assert result['problems']['unregistered'] == []


def test_a_missing_handshake_is_an_error(tmp_path):
    with pytest.raises(RegistryError):
        audit(tmp_path, handshake_path=tmp_path / 'Models' / 'VERSION.json')


def test_two_live_models_with_identical_bytes_is_invalid(tmp_path):
    payload = b'same-bytes' * 32
    models, handshake = make_bundle(tmp_path, artifacts={'a.tflite': payload, 'b.tflite': payload})
    project = build_registry(models_dir=models, handshake_path=handshake,
                             stages={'a.tflite': 'champion', 'b.tflite': 'candidate'})
    problems = validate_registry(project)
    assert any('identical content' in problem for problem in problems)


# ── writing ─────────────────────────────────────────────────────────────────

def test_writing_the_registry_twice_is_a_no_op():
    project = build_registry()
    first = write_registry(project, ROOT / 'Models' / 'REGISTRY.json')
    second = write_registry(build_registry(), ROOT / 'Models' / 'REGISTRY.json')
    assert (first, second) in {('written', 'unchanged'), ('unchanged', 'unchanged')}
    assert second == 'unchanged'
    assert json.loads((ROOT / 'Models' / 'REGISTRY.json').read_text())['champions'] == \
        ['hazardnet_fp32.tflite']


def test_an_invalid_registry_is_not_written(tmp_path):
    payload = b'x' * 16
    models, handshake = make_bundle(tmp_path, artifacts={'a.tflite': payload, 'b.tflite': payload})
    project = build_registry(models_dir=models, handshake_path=handshake,
                             stages={'a.tflite': 'champion', 'b.tflite': 'champion'})
    target = tmp_path / 'REGISTRY.json'
    with pytest.raises(RegistryError):
        write_registry(project, target)
    assert not target.exists()


def test_the_committed_registry_matches_a_fresh_build():
    committed = json.loads((ROOT / 'Models' / 'REGISTRY.json').read_text())
    fresh = build_registry()
    assert committed['champions'] == fresh['champions']
    assert committed['handshake'] == fresh['handshake']
    assert len(committed['entries']) == len(fresh['entries'])


# ── promotion ───────────────────────────────────────────────────────────────

def good_report(**overrides):
    report = {'status': 'ok', 'evaluated_events': 120, 'ece': 0.08, 'csi': 0.55, 'far': 0.30,
              'pod': 0.62}
    report.update(overrides)
    return report


def test_promotion_is_refused_without_an_approver():
    decision = evaluate_promotion(good_report(), good_report())
    assert decision['decision'] == 'refused'
    assert any('approver' in reason for reason in decision['reasons'])


def test_promotion_is_refused_without_a_champion_to_compare_against_unless_the_bar_is_met():
    # No baseline at all: the challenger still has to clear the absolute bars.
    weak = evaluate_promotion(good_report(csi=0.05, far=0.95), None, approver='owner')
    assert weak['decision'] == 'refused'
    assert any('absolute bar' in reason for reason in weak['reasons'])
    strong = evaluate_promotion(good_report(), None, approver='owner')
    assert strong['decision'] == 'approved'
    assert strong['comparisons'][0]['champion'] is None


def test_promotion_is_refused_when_the_evaluation_had_insufficient_truth():
    decision = evaluate_promotion(good_report(status='insufficient_truth', reason='no outcomes',
                                              evaluated_events=None), None, approver='owner')
    assert decision['decision'] == 'refused'
    assert any('insufficient truth' in reason for reason in decision['reasons'])


def test_promotion_is_refused_on_a_regression_the_tolerance_cannot_excuse():
    champion = good_report(ece=0.05, csi=0.60, far=0.25)
    challenger = good_report(ece=0.12, csi=0.45, far=0.40)
    decision = evaluate_promotion(challenger, champion, approver='owner')
    assert decision['decision'] == 'refused'
    regressed = {row['metric'] for row in decision['comparisons'] if row['verdict'] == 'regression'}
    assert regressed == {'ece', 'csi', 'far'}


def test_a_change_smaller_than_the_tolerance_is_not_a_regression():
    champion = good_report(csi=0.500)
    challenger = good_report(csi=0.498)     # within 1 %
    decision = evaluate_promotion(challenger, champion, approver='owner')
    assert decision['decision'] == 'approved'


def test_promotion_is_refused_on_too_few_evaluated_events():
    decision = evaluate_promotion(good_report(evaluated_events=5), None, approver='owner')
    assert decision['decision'] == 'refused'
    assert any('events' in reason for reason in decision['reasons'])


def test_promotion_is_refused_when_a_required_metric_is_missing():
    report = good_report()
    report.pop('ece')
    decision = evaluate_promotion(report, None, approver='owner')
    assert any('missing' in reason for reason in decision['reasons'])


def test_every_policy_metric_has_a_documented_direction():
    for metric in PROMOTION_POLICY['must_improve']:
        assert metric in registry_module._DIRECTION


# ── applying a promotion ────────────────────────────────────────────────────

def promoter_registry():
    return build_registry(stages={'hazardnet_fp32.tflite': 'champion',
                                  'hazardnet_int8.tflite': 'retired'})


def test_promoting_a_candidate_requires_an_approved_decision():
    with pytest.raises(RegistryError):
        apply_promotion(promoter_registry(), artifact='hazardnet_int8.tflite', approver='owner')


def test_promoting_an_artifact_moves_the_previous_champion_to_shadow(tmp_path):
    models, handshake = make_bundle(
        tmp_path, artifacts={'old.tflite': b'old-weights' * 8, 'new.tflite': b'new-weights' * 8})
    project = build_registry(models_dir=models, handshake_path=handshake,
                             stages={'old.tflite': 'champion', 'new.tflite': 'candidate'})
    decision = evaluate_promotion(good_report(), good_report(ece=0.09, csi=0.50, far=0.32),
                                  approver='owner')
    assert decision['decision'] == 'approved'
    updated = apply_promotion(project, artifact='new.tflite', approver='owner', decision=decision)
    stages = {entry['id']: entry.get('stage') for entry in updated['entries']}
    assert stages['new.tflite'] == 'champion'
    assert stages['old.tflite'] == 'shadow'      # demoted, not deleted: rollback is one edit
    assert updated['champions'] == ['new.tflite']
    assert validate_registry(updated) == []


def test_promoting_the_byte_identical_duplicate_is_refused():
    # `hazardnet_int8.tflite` is a copy of the FP32 file (ADR 0007). Promoting it
    # would leave two live models with identical bytes — the mislabel the registry
    # exists to prevent — so the write must be refused even with an approval.
    decision = evaluate_promotion(good_report(), None, approver='owner')
    assert decision['decision'] == 'approved'
    with pytest.raises(RegistryError) as error:
        apply_promotion(build_registry(), artifact='hazardnet_int8.tflite',
                        approver='owner', decision=decision)
    assert 'identical content' in str(error.value)


def test_a_promotion_records_who_made_it_and_from_what():
    decision = evaluate_promotion(good_report(), None, approver='owner')
    updated = apply_promotion(promoter_registry(), artifact='hazardnet_fp32.tflite',
                              approver='owner', decision=decision)
    entry = next(item for item in updated['entries'] if item['id'] == 'hazardnet_fp32.tflite')
    assert entry['approval']['approver'] == 'owner'
    assert entry['approval']['to'] == 'champion'


def test_a_support_artifact_cannot_be_promoted():
    with pytest.raises(RegistryError):
        apply_promotion(promoter_registry(), artifact='labels.json', approver='owner')


def test_an_unknown_artifact_cannot_be_promoted():
    with pytest.raises(RegistryError):
        apply_promotion(promoter_registry(), artifact='nope.tflite', approver='owner')


# ── the CLI ─────────────────────────────────────────────────────────────────

def run_cli(*args):
    return subprocess.run([sys.executable, '-m', 'mlops.cli', *args],
                          capture_output=True, text=True, cwd=SCRIPTS)


def test_cli_registry_writes_and_rebuilds_idempotently(tmp_path):
    target = tmp_path / 'REGISTRY.json'
    first = run_cli('registry', '--out', str(target), '--write')
    assert first.returncode == 0, first.stdout
    body = target.read_text()
    second = run_cli('registry', '--out', str(target), '--write')
    assert second.returncode == 0
    assert 'unchanged' in second.stdout
    assert target.read_text() == body


def test_cli_promote_refuses_without_an_approver_flag(tmp_path):
    result = run_cli('promote', '--artifact', 'hazardnet_fp32.tflite', '--by', '',
                     '--registry', str(ROOT / 'Models' / 'REGISTRY.json'))
    # argparse requires --by, but an empty value must still be refused, not treated as consent.
    assert result.returncode != 0
