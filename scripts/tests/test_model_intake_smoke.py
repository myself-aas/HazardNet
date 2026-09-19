"""The gate's smoke test is code, so it gets tested like code.

`model_intake.yml` loads every `Models/*.tflite` under `tflite-runtime` — the wheel the
API infers with, not tensorflow — and pushes a zero input through each one. That step is
the only place a candidate converted against a newer TFLite schema, or one whose severity
head went non-finite, is caught before a human merges it. It is also inline Python inside
a workflow file, which no collector picks up, so it went to CI untested and failed on its
first run for a reason that reads like correct code:

    shape = [d if isinstance(d, int) and d > 0 else 1 for d in details['shape']]

`details['shape']` is a numpy `int32` array and `isinstance(np.int32(10), int)` is False,
so every dimension collapsed to 1 and `set_tensor` raised
"Cannot set tensor: Dimension mismatch. Got 1 but expected 10 for dimension 1 of input 0"
— a red gate on a bundle that loads and infers perfectly. The step now reads
`shape_signature` (where the dynamic batch dim is -1) and coerces through `int()`.

These tests run the workflow's own bytes against a stub interpreter, which covers the
shape derivation, the quantization handling, the every-output-head-is-finite rule and the
no-artifacts refusal without installing a runtime wheel; the last one runs the same bytes
against the committed bundle when `tflite_runtime` is importable, which it is in the Model
Bundle PR Gate job — that job installs the pins and then runs this file, so the real
runtime path is exercised on the very PR the gate is judging.
"""

import importlib.util
import sys
import textwrap
import types
from pathlib import Path

import numpy as np
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github' / 'workflows' / 'model_intake.yml'
MODELS_DIR = ROOT / 'Models'
STEP_NAME = 'Smoke-test the bundle exactly as CI will'
PIN = 'tflite-runtime==2.14.0'

# The committed bundle's input, exactly as tflite-runtime 2.14.0 reports it: a dynamic
# batch dimension (-1 in the signature, 1 in the runtime's current shape) and 10 spatial
# steps of 64x64x15. Every test below feeds the stub these numpy arrays rather than
# Python lists, because the numpy integer types are what broke the step.
BUNDLE_INPUT = {
    'name': 'input',
    'index': 0,
    'shape': np.array([1, 10, 64, 64, 15], dtype=np.int32),
    'shape_signature': np.array([-1, 10, 64, 64, 15], dtype=np.int32),
    'dtype': np.float32,
    'quantization': (0.0, 0),
}

# Both heads. The hazard logits are (1, 8); the severity head is a scalar per row.
BUNDLE_OUTPUTS = [
    {'name': 'hazard_logits', 'index': 1, 'shape': np.array([1, 8], dtype=np.int32)},
    {'name': 'severity_pred', 'index': 2, 'shape': np.array([1], dtype=np.int32)},
]


def smoke_step() -> dict:
    """The workflow step under test, found by name so a rename breaks this loudly."""
    doc = yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))
    steps = doc['jobs']['gate']['steps']
    matches = [step for step in steps if step.get('name') == STEP_NAME]
    assert len(matches) == 1, (
        f'expected exactly one step named {STEP_NAME!r} in {WORKFLOW.name}, found {len(matches)}'
    )
    return matches[0]


def smoke_source() -> str:
    """The Python the step runs, lifted out of its heredoc.

    Extracted rather than copied: a test that carries its own transcript of the workflow
    would keep passing after the workflow changed, which is the whole failure mode this
    file exists to prevent.
    """
    run = smoke_step()['run']
    lines = run.splitlines()
    opens = [i for i, line in enumerate(lines) if line.strip() == "python - <<'PY'"]
    assert len(opens) == 1, f'{STEP_NAME}: expected one python heredoc, found {len(opens)}'
    closes = [i for i, line in enumerate(lines) if i > opens[0] and line.strip() == 'PY']
    assert closes, f'{STEP_NAME}: the python heredoc is never closed'
    return textwrap.dedent('\n'.join(lines[opens[0] + 1:closes[0]]))


def install_runtime(monkeypatch, *, input_details=None, outputs=None, tensors=None):
    """Put a stub `tflite_runtime.interpreter` in sys.modules; return the created list.

    The stub records every tensor it was handed and every output that was read, which is
    what makes the assertions below about behaviour rather than about source text.
    """
    created: list = []
    details = dict(input_details if input_details is not None else BUNDLE_INPUT)
    output_details = [dict(out) for out in (outputs if outputs is not None else BUNDLE_OUTPUTS)]
    output_tensors = dict(tensors if tensors is not None else {
        1: np.zeros((1, 8), dtype=np.float32),
        2: np.zeros((1,), dtype=np.float32),
    })

    class Interpreter:
        def __init__(self, model_path=None, **kwargs):
            self.model_path = model_path
            self.fed: dict = {}
            self.invocations = 0
            self.reads: list = []
            created.append(self)

        def allocate_tensors(self):
            return None

        def get_input_details(self):
            return [dict(details)]

        def get_output_details(self):
            return [dict(out) for out in output_details]

        def set_tensor(self, index, value):
            self.fed[index] = np.asarray(value)

        def invoke(self):
            self.invocations += 1

        def get_tensor(self, index):
            self.reads.append(index)
            return output_tensors[index]

    package = types.ModuleType('tflite_runtime')
    module = types.ModuleType('tflite_runtime.interpreter')
    module.Interpreter = Interpreter
    package.interpreter = module
    monkeypatch.setitem(sys.modules, 'tflite_runtime', package)
    monkeypatch.setitem(sys.modules, 'tflite_runtime.interpreter', module)
    return created


@pytest.fixture
def bundle(tmp_path):
    """A directory holding the two artifact names the real bundle carries."""
    for name in ('hazardnet_fp32.tflite', 'hazardnet_int8.tflite'):
        (tmp_path / name).write_bytes(b'\x00' * 16)
    return tmp_path


def run_smoke(monkeypatch, bundle_dir, *, pin=PIN):
    """Execute the workflow's block with BUNDLE_DIR set; return its exit code."""
    monkeypatch.setenv('BUNDLE_DIR', str(bundle_dir))
    monkeypatch.setenv('TFLITE_PIN', pin)
    source = smoke_source()
    try:
        exec(compile(source, f'{WORKFLOW.name}:{STEP_NAME}', 'exec'), {'__name__': '__main__'})
    except SystemExit as exc:  # the step's own sys.exit(1) refusals
        return int(exc.code or 0)
    return 0


def test_the_dynamic_batch_dimension_does_not_collapse_the_input_shape(monkeypatch, bundle, capsys):
    """The regression that turned the first gate run red.

    numpy int32 dimensions are not Python ints, so a comprehension guarded on
    `isinstance(d, int)` fed the interpreter (1, 1, 1, 1, 1) and set_tensor refused it.
    """
    created = install_runtime(monkeypatch)

    assert run_smoke(monkeypatch, bundle) == 0

    for interp in created:
        assert interp.fed[0].shape == (1, 10, 64, 64, 15), (
            'the zero input must carry the model\'s declared dimensions, with only the '
            'dynamic batch dim resolved to 1'
        )
        assert interp.invocations == 1
    assert 'non-finite' not in capsys.readouterr().out


def test_the_shape_is_read_from_the_signature_not_the_runtime_guess(monkeypatch, bundle):
    """`shape` is whatever the runtime last resolved; `shape_signature` is the contract.

    A model exported with a dynamic batch reports shape (1, 10, 64, 64, 15) and signature
    (-1, 10, 64, 64, 15). Feeding the signature's positive dims and resolving -1 to 1 is
    what keeps the smoke test honest for a bundle that is later invoked with batch 8.
    """
    details = dict(BUNDLE_INPUT)
    details['shape'] = np.array([4, 10, 64, 64, 15], dtype=np.int32)
    details['shape_signature'] = np.array([-1, 10, 64, 64, 15], dtype=np.int32)
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    assert created[0].fed[0].shape == (1, 10, 64, 64, 15)


def test_a_runtime_without_a_signature_falls_back_to_the_reported_shape(monkeypatch, bundle):
    """Older runtimes omit `shape_signature`; a fixed-shape model then reports `shape`."""
    details = {key: value for key, value in BUNDLE_INPUT.items() if key != 'shape_signature'}
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    assert created[0].fed[0].shape == (1, 10, 64, 64, 15)


def test_an_empty_signature_also_falls_back(monkeypatch, bundle):
    """A zero-length signature is the same absence, expressed as an empty array."""
    details = dict(BUNDLE_INPUT)
    details['shape_signature'] = np.array([], dtype=np.int32)
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    assert created[0].fed[0].shape == (1, 10, 64, 64, 15)


def test_every_unknown_dimension_resolves_to_one(monkeypatch, bundle):
    """A model with two dynamic dims still gets a loadable input, not a 0-length one."""
    details = dict(BUNDLE_INPUT)
    details['shape_signature'] = np.array([-1, -1, 64, 64, 15], dtype=np.int32)
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    assert created[0].fed[0].shape == (1, 1, 64, 64, 15)


def test_a_quantized_input_is_filled_with_its_zero_point(monkeypatch, bundle):
    """For an integer input, "zero" is the zero point — feeding 0 would be an outlier.

    ADR 0007 keeps the shipped int8 artifact byte-identical to fp32, but a future
    genuinely-quantized conversion must not be smoke-tested on a value the model has
    never seen, or the gate would report non-finite output for a healthy bundle.
    """
    details = dict(BUNDLE_INPUT)
    details['dtype'] = np.int8
    details['quantization'] = (0.0312, -128)
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    fed = created[0].fed[0]
    assert fed.dtype == np.int8
    assert fed.shape == (1, 10, 64, 64, 15)
    assert set(fed.flatten().tolist()) == {-128}


def test_a_scaled_float_input_is_dequantized_from_zero(monkeypatch, bundle):
    """A float input carrying a scale/zero-point pair is fed the real-valued zero."""
    details = dict(BUNDLE_INPUT)
    details['quantization'] = (0.5, 3)
    created = install_runtime(monkeypatch, input_details=details)

    assert run_smoke(monkeypatch, bundle) == 0
    fed = created[0].fed[0]
    assert fed.dtype == np.float32
    assert np.allclose(fed, 3.0), 'real 0 encodes as 0 / scale + zero_point = 3'


def test_both_output_heads_are_read(monkeypatch, bundle):
    """The gate must look at the severity head too, not only the first output.

    Reading `get_output_details()[0]` alone was the second trap: a candidate whose
    severity head returned NaN would have been reported as a clean smoke test.
    """
    created = install_runtime(monkeypatch)

    assert run_smoke(monkeypatch, bundle) == 0
    assert created[0].reads == [1, 2]


def test_a_non_finite_output_fails_the_gate(monkeypatch, bundle, capsys):
    created = install_runtime(monkeypatch, tensors={
        1: np.zeros((1, 8), dtype=np.float32),
        2: np.array([np.nan], dtype=np.float32),
    })

    assert run_smoke(monkeypatch, bundle) == 1
    out = capsys.readouterr().out
    assert '::error::hazardnet_fp32.tflite produced a non-finite or empty output' in out
    assert created[0].invocations == 1


def test_an_infinite_output_fails_the_gate(monkeypatch, bundle):
    install_runtime(monkeypatch, tensors={
        1: np.full((1, 8), np.inf, dtype=np.float32),
        2: np.zeros((1,), dtype=np.float32),
    })

    assert run_smoke(monkeypatch, bundle) == 1


def test_an_empty_output_fails_the_gate(monkeypatch, bundle, capsys):
    """A head that returns nothing is a broken conversion, not a passing one."""
    install_runtime(monkeypatch, tensors={
        1: np.zeros((0, 8), dtype=np.float32),
        2: np.zeros((1,), dtype=np.float32),
    })

    assert run_smoke(monkeypatch, bundle) == 1
    assert 'non-finite or empty' in capsys.readouterr().out


def test_a_bundle_with_no_artifacts_is_refused_not_passed(monkeypatch, tmp_path, capsys):
    """An empty Models/ must not report "smoke-tested 0 artifacts" and exit 0."""
    install_runtime(monkeypatch)

    assert run_smoke(monkeypatch, tmp_path) == 1
    assert f'::error::no .tflite artifacts under {tmp_path}' in capsys.readouterr().out


def test_every_artifact_in_the_bundle_is_loaded(monkeypatch, bundle, capsys):
    created = install_runtime(monkeypatch)

    assert run_smoke(monkeypatch, bundle) == 0
    out = capsys.readouterr().out
    assert len(created) == 2
    assert [Path(interp.model_path).name for interp in created] == [
        'hazardnet_fp32.tflite', 'hazardnet_int8.tflite',
    ]
    assert 'smoke-tested 2 artifact(s)' in out


def test_the_report_names_the_runtime_it_ran_under(monkeypatch, bundle, capsys):
    """The pin in the success line is the pin this workflow installed.

    A gate that quietly ran under a different runtime than model-validation.yml would
    prove nothing about the merge check, which is why the pins are shared and asserted.
    """
    install_runtime(monkeypatch)

    assert run_smoke(monkeypatch, bundle, pin='tflite-runtime==9.9.9') == 0
    assert 'under tflite-runtime==9.9.9' in capsys.readouterr().out


def test_the_step_does_not_reintroduce_the_numpy_integer_trap():
    """Guard the guard: the fix is `int(...)` coercion, and the trap has a signature."""
    source = smoke_source()
    assert 'isinstance(d, int)' not in source, (
        'numpy int32 dimensions are not Python ints — this comprehension collapsed the '
        'input shape to all-ones and failed the first gate run'
    )
    assert "details.get('shape_signature')" in source
    assert 'int(d)' in source


def test_the_step_reads_every_output_rather_than_the_first():
    source = smoke_source()
    assert 'get_output_details()[0]' not in source, (
        'only reading the first output would let a non-finite severity head pass'
    )
    assert 'for out in outputs' in source


def test_the_gate_job_runs_these_tests_under_the_pinned_runtime():
    """The real-runtime case only executes in the gate job, so that step has to stay.

    Everywhere else `tflite_runtime` is absent and the last test skips. If the gate job
    stopped running this file, the committed bundle would never be smoke-tested by a test
    — only by the inline step, which is exactly the arrangement that shipped the numpy
    integer bug once already.
    """
    steps = yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))['jobs']['gate']['steps']
    runners = [step for step in steps if Path(__file__).name in (step.get('run') or '')]
    assert len(runners) == 1, (
        f'expected exactly one step of {WORKFLOW.name} to run {Path(__file__).name}, '
        f'found {len(runners)}'
    )
    step = runners[0]
    assert step.get('name') == "Run the smoke test's own contract tests"
    # The harness pins are read from the file the scripts suite installs, so the two runs
    # of these tests cannot drift onto different pytest/pyyaml versions.
    assert "grep -E '^(pytest|pyyaml)==' scripts/requirements-pipeline.txt" in step['run']


@pytest.mark.skipif(
    importlib.util.find_spec('tflite_runtime') is None,
    reason='tflite_runtime is not installed here; the Model Bundle PR Gate job runs this',
)
def test_the_committed_bundle_smoke_tests_clean_under_the_real_runtime(monkeypatch, capsys):
    """The workflow's own bytes against the artifacts actually committed.

    No stub: this is the step as CI runs it, on Models/ as the repository ships it.
    """
    assert (MODELS_DIR / 'hazardnet_fp32.tflite').is_file(), 'the bundle is missing its fp32 artifact'

    assert run_smoke(monkeypatch, MODELS_DIR) == 0
    out = capsys.readouterr().out
    assert 'hazardnet_fp32.tflite: input [1, 10, 64, 64, 15] float32' in out
    assert 'finite=True' in out
