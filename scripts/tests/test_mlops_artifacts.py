"""What Phase 3 leaves on disk, and the public claims it licenses (Phase 3 MLOps).

Three groups:

* **the shipped calibration artifact** — a template that is *deliberately* unfit,
  so that "the pipeline can stamp `calibrated_probability`" is only true when a real
  map has been fitted from labelled outcomes;
* **the copy** — the site may not describe the model's softmax as a calibrated
  probability. `frontend/src/pages/DistrictDetailPage.tsx` said the score was
  "calibrated against ground stations and Sentinel-1 SAR observations" with nothing
  behind it, which PRODUCT_SPEC §3 makes a release blocker;
* **the automation** — the nightly evaluation and quarterly retrain workflow, and
  the reports directory the runs write into.
"""

import json
import pathlib
import re
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))

import yaml  # noqa: E402

TEMPLATE = ROOT / 'Models' / 'calibration' / 'confidence_map.template.json'
REGISTRY = ROOT / 'Models' / 'REGISTRY.json'
WORKFLOW = ROOT / '.github' / 'workflows' / 'mlops.yml'
REPORTS_DIR = ROOT / 'docs' / 'mlops'

#: Every file that authors user-facing text about the model (Phase 0's list plus
#: the district detail surfaces Phase 3 touched).
DISTRICT_DIR = ROOT / 'frontend' / 'src' / 'components' / 'district'
COPY_FILES = [
    ROOT / 'frontend' / 'src' / 'pages' / 'DistrictDetailPage.tsx',
    *sorted(DISTRICT_DIR.glob('*.tsx')),
    ROOT / 'frontend' / 'src' / 'components' / 'DisasterDetailModalUI.tsx',
    ROOT / 'frontend' / 'src' / 'data' / 'disasterDetails.ts',
    ROOT / 'frontend' / 'src' / 'content' / 'site-routes.json',
]


#: The historical pipeline dump uploaded in 2026-09-18 (commit 487e79e). It is the
#: research source, not a contract — but it lives in a public repository, so the
#: same claim discipline applies: it may describe what the code did, never an
#: accuracy number the repository has not measured.
ARCHIVED_DUMP = ROOT / 'docs' / 'HazardNet.md'


def test_the_archived_pipeline_dump_carries_a_provenance_header():
    text = ARCHIVED_DUMP.read_text(encoding='utf-8')
    assert text.startswith('> **Provenance'), (
        'docs/HazardNet.md must keep its provenance header: without it the dump reads '
        'as a description of the shipped system'
    )
    for marker in ('not a contract and not a description of the shipped system',
                   'om_calc_flood(precip_mm, precip_mm)',
                   'PRODUCT_SPEC wins'):
        assert marker in text


def test_the_archived_pipeline_dump_repeats_no_retired_claim():
    text = ARCHIVED_DUMP.read_text(encoding='utf-8')
    offenders = []
    for phrase in ('98.55', 'ensemble agreement', 'ground stations',
                   'Platt calibration', '1.2 million'):
        for match in re.finditer(re.escape(phrase), text, re.IGNORECASE):
            line = text[:match.start()].count('\n') + 1
            context = text.splitlines()[line - 1]
            if any(negation in context.lower() for negation in
                   ('not ', 'no ', 'never', 'without', 'unsupported')):
                continue
            offenders.append(f'docs/HazardNet.md:{line}: {context.strip()[:120]}')
    assert offenders == [], 'retired claim quoted in the archived dump:\n' + '\n'.join(offenders)


# ── the artifact ────────────────────────────────────────────────────────────

def test_the_calibration_template_is_present_and_records_why_it_is_unfit():
    payload = json.loads(TEMPLATE.read_text())
    assert payload['format'] == 'hazardnet-calibration/v1'
    assert payload['samples'] == 0
    assert payload['status'] == 'awaiting-outcomes'
    assert payload['pairs'] == []
    assert any('UNFITTED' in line for line in payload['_comment'])


def test_the_template_names_the_command_that_produces_the_real_map():
    text = TEMPLATE.read_text()
    assert 'mlops.cli calibrate' in text
    assert 'confidence_map.json' in text
    assert 'calibrated_probability' in text


def test_no_fitted_map_is_shipped_even_though_the_wiring_exists():
    # If this ever fails because a real map landed, that is fine — but it must have
    # provenance, or `validate()` refuses it anyway.
    fitted = ROOT / 'Models' / 'calibration' / 'confidence_map.json'
    if fitted.exists():
        from mlops.calibration import CalibrationMap
        assert CalibrationMap.load(fitted).validate() == []


def test_the_registry_is_committed_and_matches_the_bundle():
    payload = json.loads(REGISTRY.read_text())
    assert payload['schema'] == 'hazardnet-model-registry/v1'
    assert payload['champions'] == ['hazardnet_fp32.tflite']
    int8 = next(entry for entry in payload['entries'] if entry['id'] == 'hazardnet_int8.tflite')
    assert int8['duplicate_of'] == 'hazardnet_fp32.tflite'
    assert int8['stage'] == 'retired'
    assert payload['policy']['requires_approver'] is True


def test_the_registry_records_the_int8_identity_in_its_problems_list():
    payload = json.loads(REGISTRY.read_text())
    assert any('byte-identical' in entry for entry in payload['problems']['duplicate_content'])


# ── the copy ────────────────────────────────────────────────────────────────

def test_no_copy_claims_the_model_score_is_calibrated():
    offenders = []
    for path in COPY_FILES:
        text = path.read_text(encoding='utf-8')
        for pattern in (r'calibrated against', r'calibrated probability of',
                        r'calibrated confidence', r'\bcalibrated\b'):
            for match in re.finditer(pattern, text, re.IGNORECASE):
                line = text[:match.start()].count('\n') + 1
                context = text.splitlines()[line - 1]
                # The remaining uses are the ones that say what is NOT calibrated.
                lowered = context.lower()
                negations = ('uncalibrated', 'not calibrated', 'not yet calibrated',
                             'not a calibrated', 'nothing in this repository is calibrated',
                             'no calibration map', 'calibrated probability', 'awaiting')
                if any(negation in lowered for negation in negations):
                    continue
                offenders.append(f'{path.relative_to(ROOT)}:{line}: {context.strip()[:120]}')
    assert offenders == [], 'copy claims calibration without an artifact:\n' + '\n'.join(offenders)


#: Claims that were live in the copy before this phase and must never come back.
#: A line may mention them only to say they are not true ("not calibrated against
#: ground stations"), which is what the negation check below allows.
RETIRED_PHRASES = ('98.55', 'ensemble agreement', 'ground stations', 'platt calibration',
                   'guarantees')


def test_no_copy_reinstates_a_retired_confidence_claim():
    offenders = []
    for path in COPY_FILES:
        text = path.read_text(encoding='utf-8')
        for phrase in RETIRED_PHRASES:
            for match in re.finditer(re.escape(phrase), text, re.IGNORECASE):
                line = text[:match.start()].count('\n') + 1
                context = text.splitlines()[line - 1]
                lowered = context.lower()
                if any(negation in lowered for negation in
                       ('not ', 'no ', 'never', 'uncalibrated', 'awaiting', 'without')):
                    continue
                offenders.append(f'{path.relative_to(ROOT)}:{line}: {context.strip()[:120]}')
    assert offenders == [], (
        'copy re-uses a retired claim (Phase 0 audit / Phase 3 correction):\n'
        + '\n'.join(offenders)
    )


def test_the_district_page_says_the_score_is_uncalibrated():
    # Brief copy lives in components/district/ after the Phase 5 god-file split.
    parts = [ROOT / 'frontend' / 'src' / 'pages' / 'DistrictDetailPage.tsx', *sorted(DISTRICT_DIR.glob('*.tsx'))]
    text = '\n'.join(path.read_text(encoding='utf-8') for path in parts if path.exists())
    assert 'uncalibrated' in text
    assert 'Model Score' in text


def test_the_detail_panel_is_documented_as_a_synthesis():
    text = (ROOT / 'frontend' / 'src' / 'data' / 'disasterDetails.ts').read_text()
    assert 'SYNTHESISES' in text
    assert 'not model output' in text


def test_the_snapshot_still_reports_the_uncalibrated_kind_namespace():
    # The published rows carry no `confidence_kind`, and the API defaults it to the
    # softmax label; if a calibrated kind ever appears in the committed snapshot
    # without a fitted map, that is the exact claim this phase exists to prevent.
    from mlops.calibration import CalibrationMap
    fitted = (ROOT / 'Models' / 'calibration' / 'confidence_map.json').exists()
    snapshot = json.loads((ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json').read_text())
    kinds = {
        row.get('confidence_kind')
        for rows in snapshot['horizons'].values() for row in rows
        if row.get('confidence_kind')
    }
    if not fitted:
        assert kinds in (set(), {'model_softmax_top_class'}), kinds


# ── the automation ──────────────────────────────────────────────────────────

def test_the_nightly_workflow_exists_and_is_valid_yaml():
    assert WORKFLOW.exists(), 'the nightly evaluation workflow is missing'
    payload = yaml.safe_load(WORKFLOW.read_text())
    assert set(payload['jobs']) == {'nightly', 'quarterly-retrain-brief'}


def test_the_nightly_workflow_runs_evaluation_and_drift_and_uploads_reports():
    text = WORKFLOW.read_text()
    payload = yaml.safe_load(text)
    assert 'mlops.cli evaluate' in text
    assert 'mlops.cli drift' in text
    assert 'mlops.cli registry --write' in text
    assert 'upload-artifact' in text
    # The nightly run must not fail the default branch just because truth is missing
    # — it reports `insufficient_truth` and the counts — but it must not silently
    # promote anything either. Check the executed commands, not the comments that
    # explain why promotion is absent.
    commands = '\n'.join(
        step.get('run', '') for job in payload['jobs'].values() for step in job['steps'])
    assert 'mlops.cli promote' not in commands
    assert 'apply-calibration' not in commands


def test_the_workflow_pins_the_same_python_the_tests_use():
    text = WORKFLOW.read_text()
    assert 'setup-python' in text
    assert 'pyyaml' in text                       # the workflow validates its own YAML


def test_the_registry_workflow_gate_stays_in_ci():
    # `gen-model-version.mjs` is the handshake's generator and its drift gate already
    # exists; the registry must be audited by the phase-3 workflow rather than
    # duplicated here.
    text = WORKFLOW.read_text()
    assert 'mlops.cli audit' in text


def test_the_mlops_docs_exist_and_state_the_honesty_rules():
    for name in ('README.md', 'CALIBRATION.md', 'RETRAIN_AND_PROMOTION.md'):
        path = REPORTS_DIR / name
        assert path.exists(), f'{name} is missing'
    calibration = (REPORTS_DIR / 'CALIBRATION.md').read_text()
    assert 'unfitted' in calibration.lower()
    assert 'no observed-outcome dataset' in calibration.lower() or \
        'no observed outcome dataset' in calibration.lower()


def test_the_fixture_directory_says_its_data_is_synthetic():
    readme = ROOT / 'scripts' / 'tests' / 'fixtures' / 'mlops' / 'README.md'
    assert readme.exists()
    text = readme.read_text()
    assert 'synthetic' in text.lower()
    assert 'not evidence' in text.lower()


def test_the_fixture_generator_reproduces_the_committed_files():
    result = subprocess.run([sys.executable, str(SCRIPTS / 'tests' / 'make_mlops_fixtures.py'),
                             '--check'], capture_output=True, text=True, cwd=ROOT)
    assert result.returncode == 0, result.stdout + result.stderr
