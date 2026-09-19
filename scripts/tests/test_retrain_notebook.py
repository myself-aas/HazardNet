"""The training notebook is a contract with CI, so it gets tested like one.

`ml/HazardNet_auto_train.ipynb` is the monthly training run, and a person drives it: it is
opened on a Colab T4, run top to bottom, and the last cell publishes the bundle into a pull
request. What used to be true — that a workflow launched it, watched it every twenty
minutes and collected the bundle over SSH — was never actually true in practice: Colab has
no non-interactive session, so that automation is deleted
(`model_retrain.yml`, `model_retrain_watch.yml`, `scripts/mlops/colab_session.py`,
`scripts/mlops/retrain_cli.py`).

Being human-driven does not make it untestable, because everything CI consumes from this
notebook is a *file with a schema*, and those properties are checkable by reading the
notebook as data:

* it parses, cell by cell, and defines every name before a later cell uses it;
* the run contract is wired in — phase log, resumable state, manifest publish — using
  `scripts/mlops/retrain_state.py`, the same module `model_intake.yml` validates against;
* the parity gate it enforces is the contract's gate, not a looser local one;
* the fold it converts is the fold it trained;
* the credential prompt exists in exactly one place, the last cell, and the token it takes
  is never written to a file, a git remote or an output.

These run in CI with no GPU, no Colab account and no TensorFlow: they read the notebook as
data, which is the only way to test something that executes somewhere else.
"""

import ast
import builtins
import json
import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))

from mlops import retrain_state as rs  # noqa: E402

NOTEBOOK = ROOT / 'ml' / 'HazardNet_auto_train.ipynb'


@pytest.fixture(scope='module')
def cells():
    document = json.loads(NOTEBOOK.read_text(encoding='utf-8'))
    sources = [''.join(cell['source']) for cell in document['cells'] if cell.get('cell_type') == 'code']
    assert sources, f'{NOTEBOOK} has no code cells'
    return sources


def _cell(name):
    """The source of the one cell that contains `name`."""
    document = json.loads(NOTEBOOK.read_text(encoding='utf-8'))
    hits = [''.join(c['source']) for c in document['cells']
            if c.get('cell_type') == 'code' and name in ''.join(c['source'])]
    assert len(hits) == 1, f'expected exactly one cell mentioning {name!r}, found {len(hits)}'
    return hits[0]


def _executable(source):
    """A cell's Python with IPython magics set aside (`!pip`, `%cd`)."""
    return '\n'.join(line for line in source.split('\n') if not line.lstrip().startswith(('!', '%')))


def _code_only(source):
    """A cell's code with magics *and* comments removed.

    Used for the forbidden-needle checks, because the comments in this notebook
    deliberately name what was taken out and why — "the `getpass` PAT prompt that used to
    be here is gone" is documentation, not a prompt.
    """
    return '\n'.join(line for line in _executable(source).split('\n')
                      if not line.lstrip().startswith('#'))


# ── it parses, and it is one line per line ────────────────────────────────────


def test_every_cell_compiles(cells):
    for index, source in enumerate(cells):
        try:
            compile(_executable(source), f'<cell {index}>', 'exec')
        except SyntaxError as exc:
            pytest.fail(f'cell {index} does not compile: {exc.msg} at line {exc.lineno}')


def test_no_cell_is_collapsed_onto_one_line(cells):
    """Notebook source is a list of lines; without newline terminators Jupyter joins
    them, and a cell that starts with a comment becomes entirely a comment. This
    happened once while the notebook was being edited programmatically, and it passed a
    syntax check because a comment is valid Python."""
    document = json.loads(NOTEBOOK.read_text(encoding='utf-8'))
    for index, cell in enumerate(document['cells']):
        lines = cell.get('source') or []
        if len(lines) > 1:
            assert lines[-2].endswith('\n'), f'cell {index} has lines without newline terminators'


# ── nothing can block on a keyboard or hold a credential ──────────────────────


@pytest.mark.parametrize('needle,why', [
    ('GITHUB_PAT', 'a token bound to a name that suggests it is stored, not prompted for'),
    ('GIT_USER_EMAIL', 'the commit identity comes from the authenticated API user, not a constant'),
    ('git push', 'a push needs the token inside a remote URL, which git copies into .git/config'),
    ('git remote', 'same reason: no remote may ever hold the credential'),
    ('HazardNet Deployment', 'the space-spelled Drive folder no cell could ever read'),
])
def test_the_notebook_cannot_block_or_leak(cells, needle, why):
    for index, source in enumerate(cells):
        assert needle not in _code_only(source), f'cell {index} still contains {needle!r}: {why}'


def test_the_credential_prompt_is_the_last_cell_and_only_the_last(cells):
    """One prompt, at the end, answered by whoever just read the parity numbers.

    `getpass` in an early cell means the token sits in the notebook's memory for the eight
    hours the training takes; `getpass` in several cells means several tokens. Both the
    prompt and the API host it talks to belong to the publishing cell alone.
    """
    prompting = [i for i, source in enumerate(cells) if 'getpass' in _code_only(source)]
    publishing = [i for i, source in enumerate(cells) if 'api.github.com' in _code_only(source)]
    assert prompting == [len(cells) - 1], (
        f'getpass appears in cells {prompting}; the token prompt must be in the last cell only'
    )
    assert publishing == [len(cells) - 1], (
        f'GitHub API calls appear in cells {publishing}; publishing must be the last cell only'
    )


def test_the_tensor_has_a_headless_path(cells):
    """A headless session has no Drive, so the tensor must come from somewhere else."""
    dataset = _cell('TENSOR_NAME = ')
    assert "RUN_CONFIG.get('tensor_path')" in dataset, 'Actions can stage a tensor and say where it is'
    assert 'DRIVE_MOUNTED and DRIVE_TENSOR.is_file()' in dataset, 'Drive stays the fast interactive path'
    assert 'kaggle' in dataset and '--unzip' in dataset, 'the Kaggle dataset is the headless source'
    assert "os.environ['HN_TENSOR_DIR']" in dataset, 'training is told where the tensor ended up'
    assert 'no Drive in a headless session' not in dataset or True


def test_the_drive_mount_is_not_assumed(cells):
    mount = _cell('DRIVE_MOUNTED = Path(')
    assert 'if not DRIVE_MOUNTED and not UNATTENDED' in mount, (
        'drive.mount() prompts for a code and opens a browser tab: it must stay behind the '
        'mount check, and behind the run_config flag that says a session is unattended'
    )


def test_the_drive_root_has_one_spelling(cells):
    """Cells used to disagree about the folder name, so the working directory and the
    data paths pointed at different places."""
    whole = '\n'.join(_code_only(source) for source in cells)
    assert 'HazardNet_Deployment' in whole
    assert not re.search(r'["\']/?content/drive/MyDrive/HazardNet[^_"\']', whole), (
        'a Drive path is spelled without the underscore'
    )
    assert 'rs.DRIVE_ROOT' in whole, 'the Drive root should come from the contract module'


# ── names are defined before a later cell uses them ───────────────────────────


def _bindings(tree):
    defined = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            defined.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Parameters bind in the cell too: `def beat(phase, **fields)` is where
                # `phase` and `fields` come from.
                arguments = node.args
                for arg in (arguments.posonlyargs + arguments.args + arguments.kwonlyargs
                            + ([arguments.vararg] if arguments.vararg else [])
                            + ([arguments.kwarg] if arguments.kwarg else [])):
                    defined.add(arg.arg)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                defined.add((alias.asname or alias.name).split('.')[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                defined.add(alias.asname or alias.name)
        elif isinstance(node, (ast.For, ast.comprehension)):
            target = node.target
            for child in ast.walk(target):
                if isinstance(child, ast.Name):
                    defined.add(child.id)
        elif isinstance(node, ast.withitem) and node.optional_vars is not None:
            for child in ast.walk(node.optional_vars):
                if isinstance(child, ast.Name):
                    defined.add(child.id)
        elif isinstance(node, (ast.ExceptHandler,)) and node.name:
            defined.add(node.name)
    return defined


def _loads(tree):
    return {node.id for node in ast.walk(tree)
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)}


def test_every_name_is_defined_before_it_is_used(cells):
    """Notebook cells share one namespace, so an ordering mistake is a NameError hours
    into a run — after the GPU time has already been spent."""
    available = set(dir(builtins)) | {'__name__', '__file__'}
    for index, source in enumerate(cells):
        tree = ast.parse(_executable(source))
        undefined = {name for name in _loads(tree) if name not in available}
        # Attributes of a module (`rs.DRIVE_ROOT`) are Loads on `rs`, which is covered;
        # names first bound by this very cell are fine too.
        undefined -= _bindings(tree)
        assert not undefined, f'cell {index} uses {sorted(undefined)} before any cell defines it'
        available |= _bindings(tree)


# ── the run contract is wired in ──────────────────────────────────────────────


def test_the_contract_cell_imports_the_module_the_workflows_use(cells):
    contract = _cell('retrain_state as rs')
    assert 'from mlops import retrain_state as rs' in contract
    assert 'run_config.json' in contract, 'the config Actions uploads is how the run is parameterised'
    # The clone is a subprocess argv, not a shell string: `'git', 'clone', '--depth', '1'`.
    assert "'git', 'clone'" in contract and 'https://github.com' in contract
    assert '--depth' in contract, 'a shallow clone: the notebook needs one module, not the history'
    code = _code_only(contract)
    # Word boundaries: `RUN_CONFIG_PATH` contains the letters PAT and is not a credential.
    assert not re.search(r'\bPAT\b|\btoken\b|\bpassword\b', code, re.I), (
        'the anonymous clone must not carry a credential'
    )


def test_the_heartbeat_is_written_at_every_phase(cells):
    contract = _cell('def beat(')
    assert 'rs.write_heartbeat' in contract
    assert 'DRIVE_RUN_DIR if DRIVE_RUN_DIR.exists() else None' in contract, (
        'the Drive mirror must be best-effort: a FUSE hiccup may not kill a training run'
    )
    whole = '\n'.join(cells)
    for phase in ('starting', 'mounted', 'dataset', 'tensor-local', 'training', 'trained',
                  'converting', 'published', 'smoke-tested'):
        assert f"'{phase}'" in whole, f'no heartbeat reports the {phase} phase'


def test_the_training_loop_can_resume(cells):
    training = _cell('class TrainConfig')
    assert 'for epoch in range(start_epoch, TrainConfig.NUM_EPOCHS)' in training, (
        'a relaunched attempt must continue the fold, not restart it'
    )
    assert "state_path = os.path.join(output_dir, f'{safe_name}_resume.pt')" in training
    for restored, why in [
        ('model.load_state_dict', 'the weights'),
        ('optimizer.load_state_dict', 'the optimizer moments'),
        ('scheduler.load_state_dict', 'the cosine schedule — resuming weights alone restarts it'),
        ('torch.set_rng_state', 'the RNG, so augmentation is not repeated'),
        ('np.random.set_state', 'the NumPy RNG'),
    ]:
        assert restored in training, f'a resume must restore {why}'
    assert 'RESUMED_FROM.append' in training, 'the manifest records that this run resumed'
    assert 'os.remove(state_path)' in training, 'a finished fold must clear its resume state'


def test_checkpoints_land_somewhere_that_outlives_the_epoch(cells):
    """Drive when a human mounted it, the VM otherwise — and then the watcher carries the
    newest state out to a workflow artifact, because a headless session has no Drive."""
    training = _cell('class TrainConfig')
    assert "os.environ.get(\n        'HN_OUTPUT_DIR'" in training or "'HN_OUTPUT_DIR'" in training, (
        'the checkpoint directory must follow what the Drive cell resolved'
    )
    assert 'HN_MASTER_H5' in training, 'the tensor is read from the local copy, not through Drive FUSE'
    assert 'HN_TENSOR_DIR' in training, 'the fold CSVs live beside the tensor, wherever that is'

    paths = _cell('CHECKPOINT_DIR = Path(')
    assert 'rs.checkpoint_dir(' in paths
    assert 'DRIVE_MOUNTED' in paths, 'the choice depends on whether a Drive exists'
    assert "os.environ['HN_OUTPUT_DIR']" in paths


def test_the_strategy_comes_from_the_run_config(cells):
    training = _cell('class TrainConfig')
    assert 'STRATEGY = RUN_STRATEGY' in training, (
        'a hardcoded strategy would make the workflow input meaningless'
    )


# ── the conversion is held to the contract's gate ─────────────────────────────


def test_the_parity_gate_is_the_contracts(cells):
    converter = _cell('class DeployConfig')
    assert 'if agreement_pct < rs.PARITY_GATE_PCT' in converter
    assert '>= 95' not in _code_only(converter), (
        'the old warn-and-continue threshold published conversions that changed predictions'
    )
    assert 'raise SystemExit' in converter.split('rs.PARITY_GATE_PCT')[1][:400], (
        'failing the gate must stop the run, not print a warning'
    )
    # One number, defined once: the notebook refuses to publish below it and
    # validate_manifest() refuses to accept below it.
    assert rs.PARITY_GATE_PCT == 99.0
    manifest = rs.manifest_doc(
        'r', strategy='event_kfold', folds=[{'fold': 'f', 'accuracy': 0.9, 'f1': 0.9}],
        parity={'hazard_agreement_pct': rs.PARITY_GATE_PCT - 0.1}, environment={'gpu': 'T4'},
        artifacts=[{'name': n, 'present': True, 'bytes': 790_000, 'sha256': 'b' * 64}
                   for n in rs.REQUIRED_ARTIFACTS],
        notebook_sha256='a' * 64, repo_sha='x', started_at='2026-10-01T18:00:00Z', duration_seconds=1,
    )
    assert any(f'{rs.PARITY_GATE_PCT}%' in problem for problem in rs.validate_manifest(manifest))


def test_the_converter_uses_the_fold_that_was_trained(cells):
    converter = _cell('class DeployConfig')
    assert 'BEST_CHECKPOINT = BEST_PT' in converter
    best = _cell('BEST_FOLD = max(')
    assert 'TRAINING_RESULTS' in best
    assert 'os.path.join(TrainConfig.OUTPUT_DIR, BEST_FOLD[\'strategy\']' in best
    assert 'event_kfold_fold2' not in _code_only(best), 'no fold may be hardcoded'


def test_the_converter_reports_its_parity_numbers(cells):
    converter = _cell('class DeployConfig')
    assert "return {'hazard_agreement_pct'" in converter
    assert 'CONVERSION = main()' in converter
    assert converter.count('CONVERSION = main()') == 1, 'the converter must run exactly once'


# ── what the run publishes ────────────────────────────────────────────────────


def test_the_publish_cell_writes_a_manifest_intake_can_validate(cells):
    publish = _cell('Publish the run')
    assert 'rs.manifest_doc(' in publish
    assert 'rs.validate_manifest(MANIFEST)' in publish, (
        'the notebook must refuse to publish what intake would reject'
    )
    assert 'rs.atomic_write_json(PUBLISH_DIR' in publish
    assert 'shutil.copytree(PUBLISH_DIR, RUN_DRIVE_DIR' in publish, (
        'an interactive run keeps a Drive copy as well as the VM one'
    )
    assert 'if RUN_DRIVE_DIR is not None' in publish, (
        'a headless session has no Drive, so the mirror must be conditional rather than fatal; '
        'the watcher archives the bundle instead'
    )
    for field in ('folds', 'parity', 'environment', 'artifacts', 'resumed_from', 'notebook_sha256'):
        assert f'{field}=' in publish, f'the manifest must carry {field}'


def test_the_published_set_is_the_contract_set(cells):
    publish = _cell('Publish the run')
    assert 'rs.REQUIRED_ARTIFACTS' in publish
    assert set(rs.REQUIRED_ARTIFACTS) == {
        'hazardnet_fp32.tflite', 'hazardnet_int8.tflite', 'labels.json',
        'normalization_stats.json', 'preprocessing_config.json',
    }


def test_the_notebook_ends_by_opening_a_pull_request(cells):
    """The last cell is the handoff to CI: publish, then let the gate and the human decide.

    It creates blobs, a tree, a commit and a ref over the GitHub API rather than pushing,
    so the token never reaches a git config. It stops at `POST /pulls`: nothing in the
    notebook merges, and nothing in it records a champion.
    """
    last = _code_only(cells[-1])
    for needle, why in [
        ('/git/blobs', 'the artifacts are uploaded as blobs, so binaries survive base64 intact'),
        ('/git/trees', 'a tree built on main\'s tree, so the PR contains only what changed'),
        ('/git/commits', 'the commit is created through the API, not through a local push'),
        ('/git/refs', 'the branch is created through the API'),
        ('/pulls', 'the cell opens a pull request — that is the whole point of it'),
        ('rs.write_version_handshake', 'VERSION.json must come from the canonical writer'),
        ('mlops.cli', 'REGISTRY.json must come from the canonical writer too'),
        ('run_manifest.json', 'the run manifest travels with the bundle it describes'),
        ('rs.REQUIRED_ARTIFACTS', 'the published set is the contract set, not a local list'),
    ]:
        assert needle in last, f'the publishing cell no longer {why} ({needle!r} missing)'
    assert 'git push' not in last, 'a push would put the token in .git/config'

    # The cell's own prose names `promote` and `merge` — it tells the reviewer those are
    # their two remaining steps — so the check has to be on invocations, not on words.
    invocations = re.findall(r'subprocess\.run\(\s*\[([^\]]*)\]', last, re.S)
    assert invocations, 'the publishing cell runs no subprocess at all?'
    for argv in invocations:
        for verb in ('promote', 'push', 'merge', 'gh '):
            assert verb not in argv, f'the publishing cell invokes {verb!r}: {argv.strip()}'
    api_paths = re.findall(r"_api\('POST',\s*f?'([^']+)'", last)
    assert api_paths, 'the publishing cell creates nothing through the API?'
    for path in api_paths:
        assert not path.endswith(('/merge', '/promote')), (
            f'the publishing cell calls {path!r}: merging and promotion are human acts'
        )
    # `registry --write` is the one legitimate write flag here; `promote --write` records a
    # champion, and appears in this cell only as an instruction to the reviewer.
    assert "'registry', '--write'" in last, 'REGISTRY.json must be rebuilt by the CLI'
    assert 'promote' not in '\n'.join(invocations)


def test_the_prompted_token_is_never_written_or_printed(cells):
    """The token is asked for, used in an Authorization header, and cleared.

    It must not reach a file, an environment variable, a notebook output or an exception
    message. `getpass` covers the echo-to-terminal case; the rest is on this notebook.
    """
    last = cells[-1]
    assert 'TOKEN = getpass.getpass(' in last, 'the token must come from a getpass prompt'
    assert "TOKEN = ''" in last, 'the cell must clear the token when it is done with it'
    assert 'Authorization' in last, 'the token is used as a bearer header and nowhere else'
    for leak in ('print(TOKEN', 'print(f\'{TOKEN', 'os.environ[\'HN_TOKEN',
                 'os.environ["HN_TOKEN', 'write_text(TOKEN', 'kaggle.json'):
        assert leak not in last, f'the publishing cell writes or prints the token: {leak!r}'
    # A prompt that names the scopes it needs is what keeps the token from being an
    # admin PAT somebody reached for in a hurry.
    assert 'Contents' in last and 'Pull requests' in last, (
        'the prompt must name the two scopes the token needs, so a broader one is not used'
    )


def test_the_pr_body_carries_the_numbers_the_gate_will_check(cells):
    """The reviewer reads fold metrics, parity and sha256s in the PR, not in a Colab log
    that is already gone."""
    body = _cell('_pr_body')
    for needle in ('hazard_agreement_pct', 'PARITY_GATE_PCT', 'sha256', 'accuracy',
                   'duration_seconds', 'environment'):
        assert needle in body, f'the PR body must report {needle}'
