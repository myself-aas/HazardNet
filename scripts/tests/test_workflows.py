"""GitHub Actions workflow static guards (regression suite for Sept 2026).

Two whole-pipeline outages came from workflow files that GitHub refused to
load (zero jobs, instant failure):
  1. weekly_forecast.yml was unparseable YAML (column-0 shell continuation
     inside a `run: |` block).
  2. ci.yml used the `secrets` context in `if:` conditions, which GitHub
     rejects at ANY level — job-level AND step-level both kill the whole
     file (bisect-proven 2026-09-13: moving the check from a job-level `if:`
     to a step-level `if:` did NOT help). Gate on a resolved step output
     instead (secrets ARE allowed inside `run:`).

These tests fail the build if any workflow regresses on either front, and
enforce the structural invariants the data pipelines depend on (explicit
write permissions for data commits, concurrency guards, required files).
"""

import json
import re
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = ROOT / '.github' / 'workflows'

# The data-pipeline workflows that must exist for the website-refresh story:
# the daily Kaggle pull, the on-demand Kaggle trigger+pull, the manual CSV ingest,
# the weekly release, and the gate on the monthly model PR.
REQUIRED_WORKFLOWS = {
    'ci.yml',
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'manual_forecast_ingest.yml',
    'model_intake.yml',
    'model-validation.yml',
    'site-health.yml',
    'Firebase-Store-Verify.yml',
    'verify-secrets.yml',
    'weekly_forecast.yml',
    # v3 ML contract tests: severity normalizer proofs + 57 BD threshold
    # proofs (TRD §10 / PRD REQ-002 / TASK-003). Failure blocks training.
    'v3-ml-contracts.yml',
}

# Workflows that must have contents:write (they push data/commits).
# daily_forecast.yml commits the pulled Kaggle forecast, the website snapshot and
# the dataset builder's metadata — the only delivery path that works while the
# deployment serves no ingest API.
DATA_COMMIT_WORKFLOWS = {
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'manual_forecast_ingest.yml',
    'weekly_forecast.yml',
}

# Kaggle-dependent workflows that must stay dispatch-only. daily_forecast.yml is
# NOT in this list: since 2026-09-20 the schedule belongs to the Kaggle pull, and
# these two are the manual entry points around it (trigger the notebook and wait,
# or run the weekly release).
KAGGLE_WORKFLOWS = ('forecast-pipeline.yml', 'weekly_forecast.yml')

# model-validation.yml needs pull-requests:write to leave a status summary;
# other workflows that only read should default to contents:read.


def load_workflows():
    files = sorted(WORKFLOWS_DIR.glob('*.yml')) + sorted(WORKFLOWS_DIR.glob('*.yaml'))
    assert files, f'no workflow files found in {WORKFLOWS_DIR}'
    docs = {}
    for path in files:
        with open(path, encoding='utf-8') as fh:
            # yaml.safe_load resolves the YAML 1.1 `on:` key to boolean True —
            # normalize it back so assertions read naturally.
            doc = yaml.safe_load(fh)
        assert isinstance(doc, dict), f'{path.name}: top level must be a mapping'
        if True in doc and 'on' not in doc:
            doc['on'] = doc.pop(True)
        docs[path.name] = doc
    return docs


@pytest.fixture(scope='module')
def workflows():
    return load_workflows()


def test_required_workflows_exist(workflows):
    missing = REQUIRED_WORKFLOWS - set(workflows)
    assert not missing, f'missing workflow files: {sorted(missing)}'


def test_setup_node_npm_cache_has_a_lockfile():
    """actions/setup-node cache: npm fails the job when no lockfile exists.

    On 2026-09-20 (run 35508816360) every CI job died at 'Set up Node.js'
    with "Dependencies lock file is not found" after package-lock.json was
    dropped from the tree. npm ci (and setup-node's cache: npm) both require
    it — keep it committed.
    """
    assert (ROOT / 'package-lock.json').is_file(), (
        'package-lock.json is missing; actions/setup-node cache: npm and '
        '`npm ci` will fail every job. Restore it from git history.'
    )


def test_python_cache_dependency_files_exist():
    """setup-python cache: pip fails when the declared requirements file is gone.

    Hindcast (run 35508816425) and v3 ML Contracts (run 35508816366) died at
    'Set up Python' after scripts/requirements-pipeline.txt and
    training/requirements.txt were deleted in the same commit as the npm
    lockfile.
    """
    missing = [
        path for path in (
            'scripts/requirements-pipeline.txt',
            'training/requirements.txt',
        )
        if not (ROOT / path).is_file()
    ]
    assert not missing, (
        'setup-python cache-dependency-path file(s) missing: '
        + ', '.join(missing)
    )


def test_every_workflow_has_triggers_and_jobs(workflows):
    for name, doc in workflows.items():
        assert 'on' in doc, f'{name}: missing `on:` triggers'
        assert 'jobs' in doc and isinstance(doc['jobs'], dict) and doc['jobs'], \
            f'{name}: missing `jobs:`'
        for job_id, job in doc['jobs'].items():
            assert 'runs-on' in job, f'{name} job {job_id}: missing runs-on'
            assert job.get('steps'), f'{name} job {job_id}: no steps'


def test_no_secrets_context_in_any_if(workflows):
    """No `if:` — job-level OR step-level — may reference `secrets.*`.

    GitHub rejects the entire file with zero jobs when any condition touches
    the secrets context (bisect-proven 2026-09-13 for both levels — the Sept
    2026 CI outage). Resolve token presence into a step output
    (`echo "flag=${{ secrets.X != '' }}" >> "$GITHUB_OUTPUT"` — secrets ARE
    allowed inside `run:`) and gate on `steps.<id>.outputs.<flag>` instead.
    """
    violations = []
    for name, doc in workflows.items():
        for job_id, job in doc['jobs'].items():
            condition = job.get('if', '')
            if isinstance(condition, str) and 'secrets.' in condition:
                violations.append(f'{name} job `{job_id}` if: {condition!r}')
            for step in job.get('steps', []) or []:
                step_if = step.get('if', '')
                if isinstance(step_if, str) and 'secrets.' in step_if:
                    violations.append(
                        f'{name} job `{job_id}` step `{step.get("name")}` if: {step_if!r}'
                    )
    assert not violations, (
        'secrets context in `if:` condition (resolve to a step output instead):\n'
        + '\n'.join(violations)
    )


def test_data_pipelines_have_write_permissions(workflows):
    """Pipelines that commit refreshed data need explicit contents:write —
    the default GITHUB_TOKEN permission set is repo-configurable."""
    for name in DATA_COMMIT_WORKFLOWS:
        doc = workflows[name]
        top = (doc.get('permissions') or {}).get('contents')
        job_level = [(doc.get('permissions') or {}).get('contents') == 'write']
        for job in doc['jobs'].values():
            perms = job.get('permissions') or {}
            job_level.append(perms.get('contents') == 'write')
        assert top == 'write' or any(job_level), (
            f'{name}: needs `permissions: contents: write` (top-level or job-level) '
            'to push refreshed forecast data'
        )


def test_data_pipelines_have_concurrency_guards(workflows):
    for name in DATA_COMMIT_WORKFLOWS:
        assert 'concurrency' in workflows[name], (
            f'{name}: missing concurrency guard — overlapping runs would '
            'race on the data commit'
        )


def test_the_daily_forecast_is_pulled_from_kaggle_not_generated_on_the_runner(workflows):
    """One producer, and it is the Kaggle notebook the owner already schedules.

    Until 2026-09-20 the runner generated the forecast itself
    (`scripts/auto_forecast.py`: Earth Engine + Open-Meteo + TFLite) while four
    Kaggle notebooks generated one too, on Kaggle's own daily schedule. Two
    producers for one artifact meant whichever job happened to run last decided
    what the website served, and the runner-side producer needed an Earth Engine
    service-account key in GitHub secrets — when that key rotated, the scheduled
    run died one minute in with a bare traceback and the site silently kept
    serving the last committed snapshot.

    The notebooks stay the producers (they are the ones with the EE token, the
    severity pipeline and the trained model). This workflow pulls their output,
    translates the advisory shape into the committed canonical shape, and commits.
    """
    daily = workflows['daily_forecast.yml']
    crons = [(s or {}).get('cron', '') for s in (daily.get('on') or {}).get('schedule') or []]
    assert crons, 'daily_forecast.yml must keep a schedule — it is the production producer'
    assert 'workflow_dispatch' in (daily.get('on') or {}), (
        'daily_forecast.yml must stay manually dispatchable'
    )

    runs = _all_run_text(daily)
    assert 'scripts/fetch_kaggle_forecast.py' in runs, (
        'daily_forecast.yml must pull the forecast from the Kaggle notebook output'
    )
    assert 'scripts/validate_forecasts.py' in runs, (
        'daily_forecast.yml must validate what it pulled before publishing it'
    )
    assert 'build_forecast_snapshot.mjs' in runs, (
        'daily_forecast.yml must rebuild the website snapshot it commits'
    )
    assert 'scripts/fetch_kaggle_dataset_meta.py' in runs, (
        'daily_forecast.yml must also pull the dataset builder\'s normalization + config'
    )

    # The runner must not generate a second forecast. `auto_forecast.py` stays in
    # the repository (tested, dispatchable nowhere) as the offline fallback; what
    # it must not be is a scheduled producer alongside the Kaggle pull.
    for line in _executed_lines(daily):
        assert 'auto_forecast.py' not in line, (
            f'daily_forecast.yml executes the runner-side generator ({line!r}); two '
            'producers for one artifact is how the site served whichever ran last'
        )
        # The Earth Engine key was the fragile dependency this rewrite removed.
        assert 'EE_SERVICE_ACCOUNT_JSON' not in line, (
            f'daily_forecast.yml still needs an Earth Engine secret ({line!r}); the '
            'notebook holds the EE token, the runner only reads Kaggle output'
        )

    # Kaggle credentials are required, and the workflow must authenticate before
    # pulling rather than let the CLI fail with a bare 403.
    whole = _all_text(daily)
    assert 'secrets.KAGGLE_USERNAME' in whole and 'secrets.KAGGLE_KEY' in whole, (
        'daily_forecast.yml must read the Kaggle credentials from repository secrets'
    )

    # The other Kaggle workflows stay dispatch-only: they trigger or re-run the
    # notebook, which is a human decision, not a cron.
    scheduled = [
        name for name in KAGGLE_WORKFLOWS
        if (workflows[name].get('on') or {}).get('schedule')
    ]
    assert not scheduled, (
        'these Kaggle-backed workflows must stay dispatch-only (they push and run a '
        f'notebook, which the daily pull already consumes): {scheduled}'
    )


def test_the_daily_pull_takes_metadata_but_never_writes_a_model(workflows):
    """The payload boundary: forecast CSV + kilobytes of dataset metadata in, and
    nothing under Models/ out.

    `master_tensors.h5` is hundreds of megabytes and Colab reads it straight from
    the Kaggle dataset, so pulling it into git would buy nothing and cost the
    repository its clone time. The metadata that *is* pulled
    (normalization_stats.json, dataset_config.json) exists so the shipped model's
    normalization can be compared against what the pipeline is producing now —
    a drift report, not a model update. A daily job that could write Models/ would
    be an unattended promotion path.
    """
    daily = workflows['daily_forecast.yml']
    runs = _all_run_text(daily)
    assert 'normalization_stats' in runs or 'dataset-meta' in runs, (
        'daily_forecast.yml must pull the dataset builder metadata'
    )
    for line in _executed_lines(daily):
        if re.search(r'\bgit\s+(add|commit|checkout|restore|push)\b', line):
            assert 'Models/' not in line, (
                f'daily_forecast.yml writes into Models/ ({line!r}): model artifacts '
                'arrive through the monthly notebook PR and its gate, never through '
                'the daily data pull'
            )
        assert 'master_tensors' not in line, (
            f'daily_forecast.yml pulls the tensor archive ({line!r}); Colab reads it '
            'from the Kaggle dataset directly'
        )

    # The metadata pull is advisory: a Kaggle-side gap must not cost the day's
    # forecast its commit. The forecast pull itself is not allowed to fail soft.
    meta_step = next(
        step for _, step in _steps(daily)
        if 'fetch_kaggle_dataset_meta.py' in str(step.get('run', ''))
    )
    assert meta_step.get('continue-on-error') is True, (
        'the dataset-metadata step must be continue-on-error: the forecast commit '
        'cannot depend on the builder notebook having published metadata that day'
    )
    fetch_step = next(
        step for _, step in _steps(daily)
        if 'fetch_kaggle_forecast.py' in str(step.get('run', ''))
    )
    assert not fetch_step.get('continue-on-error'), (
        'the forecast pull must fail the run: a silent skip is how the site serves '
        'a stale forecast with a green check next to it'
    )


def test_manual_ingest_triggers_on_csv_push(workflows):
    doc = workflows['manual_forecast_ingest.yml']
    push = (doc.get('on') or {}).get('push') or {}
    paths = push.get('paths') or []
    assert any('manual_forecast' in p for p in paths), (
        'manual_forecast_ingest.yml must trigger on pushes to the manual CSV path'
    )
    assert 'workflow_dispatch' in (doc.get('on') or {}), (
        'manual_forecast_ingest.yml must support manual dispatch'
    )


def test_no_workflow_requires_vercel_deploy_credentials(workflows):
    """No workflow may depend on Vercel deploy credentials.

    CI used to deploy with `npx vercel deploy` scoped by `VERCEL_TOKEN` /
    `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`. That path was removed on 2026-09-14:
    the ids in the secrets were stale, every attempt failed with a 403 the CLI
    reports as "Could not retrieve Project Settings", and the credential could
    not be corrected from CI at all (see
    docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md).

    Deployments are the Vercel **Git integration**'s job: it builds previews for
    pull requests and production on push to `main` from the repository itself,
    with no repository secret involved — its `Vercel` commit status is the
    signal to watch. This guard keeps a credential requirement from creeping
    back in and silently turning every run red for a reason unrelated to the
    code under test.

    Reference `VERCEL`/`_vercel` for the *analytics build gate* is fine and not
    matched here — only the deploy credentials and the CLI are.
    """
    forbidden = (
        'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID',
        'VERCEL_ORG_SLUG', 'VERCEL_PROJECT_NAME',
        'amondnet/vercel-action', 'vercel-action',
    )
    problems = []
    for name, doc in workflows.items():
        text = json.dumps(doc)
        for needle in forbidden:
            if needle in text:
                problems.append(f'{name}: references {needle}')
        for job_id, job in doc['jobs'].items():
            for step in job.get('steps', []) or []:
                run = str(step.get('run', ''))
                if 'vercel' in run and 'deploy' in run and 'npx' in run:
                    problems.append(
                        f'{name} job `{job_id}` step `{step.get("name")}`: '
                        'runs the Vercel CLI'
                    )
    assert not problems, (
        'workflows must not require Vercel deploy credentials '
        '(the Git integration deploys; no secret needed):\n' + '\n'.join(problems)
    )


# ---------------------------------------------------------------------------
# Jest argv guards (regression for the silent backend-suite dropout)
# ---------------------------------------------------------------------------

def jest_steps(workflow):
    """Every step in ci.yml whose `run:` invokes jest, as (name, run) pairs."""
    found = []
    for job in workflow.get('jobs', {}).values():
        for step in job.get('steps', []) or []:
            run = step.get('run')
            if isinstance(run, str) and 'jest' in run:
                found.append((step.get('name', '<unnamed>'), run))
    return found


def ignore_patterns(run):
    """The arguments consumed by `--testPathIgnorePatterns`.

    Handles both spellings, because the shell collapses the first one:
        --testPathIgnorePatterns='/e2e/' '/frontend/'
        -> ['--testPathIgnorePatterns=/e2e/', '/frontend/']
    The flag is array-valued, so everything AFTER it belongs to it regardless
    of how it is written.
    """
    tokens = shlex.split(run)
    for index, token in enumerate(tokens):
        if token.startswith('--testPathIgnorePatterns='):
            return [token.split('=', 1)[1], *tokens[index + 1:]]
        if token == '--testPathIgnorePatterns':
            return list(tokens[index + 1:])
    return []


def test_ci_has_a_backend_jest_step(workflows):
    steps = jest_steps(workflows['ci.yml'])
    assert steps, 'ci.yml no longer runs jest'


def test_backend_jest_step_has_no_bare_selector(workflows):
    """`--testPathIgnorePatterns` is array-valued and consumes EVERY following
    argument, so a bare positional selector after it is silently reinterpreted
    as one more ignore pattern instead of selecting tests.

    The backend step used to read `... --testPathIgnorePatterns='/e2e/'
    'frontend/src'`: 'frontend/src' never selected anything, and the step only
    ran the backend suites because the ignore patterns happened to win. Moving
    the selector first would have swapped in all 21 frontend suites and still
    reported 21 passing suites — a green job covering none of the backend.
    """
    assert 'ci.yml' in workflows
    offenders = []

    for name, run in jest_steps(workflows['ci.yml']):
        for pattern in ignore_patterns(run):
            # Ignore patterns are path fragments. A selector like
            # 'frontend/src' has no leading slash and is the bug shape.
            if not (pattern.startswith('/') and pattern.endswith('/')):
                offenders.append((name, pattern))

    assert not offenders, (
        'jest argument(s) after --testPathIgnorePatterns are not ignore '
        f'patterns and will be swallowed silently: {offenders}'
    )


def _backend_jest_step(workflows):
    """The ci.yml step that runs the backend suites (matched by step name).

    Scoped by name on purpose: the frontend job also runs jest, and mixing the
    two steps' arguments would make these assertions meaningless.
    """
    for name, run in jest_steps(workflows['ci.yml']):
        if 'backend' in name.lower():
            return name, run
    raise AssertionError('ci.yml has no jest step named for the backend')


def test_backend_jest_step_excludes_frontend_and_e2e(workflows):
    """The backend step must keep the frontend suites out. If '/frontend/' is
    ever dropped from the list, the step starts measuring the wrong half of the
    repository."""
    name, run = _backend_jest_step(workflows)
    patterns = ignore_patterns(run)

    assert patterns, f'{name!r} no longer pins an ignore list: {run}'
    assert '/frontend/' in patterns, (
        f'{name!r} must ignore /frontend/ (patterns: {patterns})'
    )
    assert '/e2e/' in patterns, (
        f'{name!r} must ignore /e2e/ (patterns: {patterns})'
    )


# ---------------------------------------------------------------------------
# Workflow hygiene guards (added 2026-09-15)
# ---------------------------------------------------------------------------

# Actions whose major version must be consistent across every workflow file.
# When we bump one, we bump all — a single stale checkout@v4 in a forgotten
# pipeline has caused subtle bugs before.
REQUIRED_ACTION_VERSIONS = {
    'actions/checkout':        'v7',
    'actions/setup-node':      'v7',
    'actions/setup-python':    'v7',
    'actions/upload-artifact': 'v7',
    'codecov/codecov-action':  'v7',
    # actions/cache@v4 is the last node20 release; the runner forced it onto
    # Node 24 and annotated every job with a deprecation warning (the
    # 2026-09-14 runtime sweep moved the other actions but missed this one).
    # v5 is node24 and needs runner >= 2.327.1 (hosted runners are far past it).
    # v6 (Dependabot actions-group bump, Sept 2026) migrates the action to ESM,
    # picks up the read-only-token save-only fix (v6.1.0), and keeps the same
    # inputs/outputs — no workflow changes needed beyond the tag.
    'actions/cache':           'v6',
}

# Workflows that are either scheduled or long-running and therefore need a
# concurrency guard to avoid overlapping runs.
CONCURRENCY_REQUIRED = {
    'ci.yml',
    # The model PR gate: two overlapping runs would post two reports and interleave
    # writes into Models/ while regenerating the handshake.
    'model_intake.yml',
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'manual_forecast_ingest.yml',
    'site-health.yml',
    'Firebase-Store-Verify.yml',
    'verify-secrets.yml',
    'weekly_forecast.yml',
    'v3-ml-contracts.yml',
}

# Every workflow should declare an explicit top-level `permissions:` block so
# GITHUB_TOKEN privileges are not left to repository defaults (a workflow that
# only reads the repo should not silently inherit write access).
PERMISSIONS_REQUIRED = set(CONCURRENCY_REQUIRED)

# Jobs that can potentially run forever without a timeout (cron jobs especially
# — a single stuck 6-hour job blocks the queue and burns minutes).
TIMEOUT_REQUIRED = set(CONCURRENCY_REQUIRED)


def _collect_action_refs(doc):
    """Yield (action_base, version, location) for every `uses:` step."""
    import re
    for job_id, job in (doc.get('jobs') or {}).items():
        for step in job.get('steps') or []:
            uses = step.get('uses')
            if not isinstance(uses, str):
                continue
            m = re.match(r'^([\w.-]+/[\w.-]+(?:/[\w./-]+)?)@([\w.-]+)$', uses)
            if m:
                yield m.group(1), m.group(2), f'{job_id}/{step.get("name", "?")}'


def test_action_versions_are_consistent(workflows):
    """No workflow should pin an older major of a first-party action than the
    versions REQUIRED_ACTION_VERSIONS declares. Drift caused daily_forecast.yml
    to sit on checkout@v4 / setup-python@v5 while everything else moved to v7."""
    violations = []
    for name, doc in workflows.items():
        for action, version, loc in _collect_action_refs(doc):
            expected = REQUIRED_ACTION_VERSIONS.get(action)
            if expected and version != expected:
                violations.append(
                    f'{name} {loc}: uses {action}@{version}, expected @{expected}'
                )
    assert not violations, (
        'action version drift (bump all references uniformly):\n'
        + '\n'.join(violations)
    )


def test_every_workflow_declares_permissions(workflows):
    """Every workflow must have an explicit top-level permissions: block."""
    violations = []
    for name in PERMISSIONS_REQUIRED:
        if name not in workflows:
            continue
        doc = workflows[name]
        if not isinstance(doc.get('permissions'), dict):
            violations.append(f'{name}: missing top-level permissions: block')
    assert not violations, (
        'workflows missing explicit permissions: (defaults to repo settings; '
        'declare least-privilege explicitly):\n' + '\n'.join(violations)
    )


def test_every_workflow_has_concurrency_guard(workflows):
    """Every scheduled/manual workflow must declare concurrency to prevent
    overlapping runs from racing on data commits or double-pinging."""
    violations = []
    for name in CONCURRENCY_REQUIRED:
        if name not in workflows:
            continue
        if 'concurrency' not in workflows[name]:
            violations.append(f'{name}: missing concurrency: guard')
    assert not violations, (
        'workflows missing concurrency guard:\n' + '\n'.join(violations)
    )


def test_every_job_has_timeout(workflows):
    """Every job should declare timeout-minutes so a stuck run cannot burn
    minutes indefinitely."""
    violations = []
    for name, doc in workflows.items():
        if name not in TIMEOUT_REQUIRED:
            continue
        for job_id, job in doc['jobs'].items():
            if not job.get('timeout-minutes'):
                violations.append(f'{name} job `{job_id}`: missing timeout-minutes')
    assert not violations, (
        'jobs without timeout-minutes (add an upper bound appropriate to the job):\n'
        + '\n'.join(violations)
    )


def test_daily_forecast_has_secret_preflight(workflows):
    """A missing credential must produce a sentence, not a traceback.

    `kaggle kernels output` answers 401/403/404 with a one-line CLI error and a
    non-zero exit; three different owner actions (rotate the token, fix the
    ownership, repoint the slug) look identical in the log unless the workflow
    says which one it is. The preflight checks both secrets are set, writes
    ~/.kaggle/kaggle.json with 0600, and asks Kaggle whether it can see the
    kernel before anything depends on the answer.
    """
    doc = workflows['daily_forecast.yml']
    preflight = None
    for _, step in _steps(doc):
        run = step.get('run', '') or ''
        name = (step.get('name') or '').lower()
        if ('preflight' in name or 'credential' in name) \
           and 'KAGGLE_USERNAME' in run and 'KAGGLE_KEY' in run:
            preflight = run
            break
    assert preflight, (
        'daily_forecast.yml must include a preflight step that verifies '
        'KAGGLE_USERNAME / KAGGLE_KEY are set before pulling from Kaggle'
    )
    assert 'kaggle.json' in preflight, (
        'the preflight must write ~/.kaggle/kaggle.json — the CLI reads its '
        'credentials from that file, not from the environment'
    )
    assert 'chmod 600' in preflight or 'chmod 0600' in preflight, (
        'the preflight must chmod 600 the credentials file it writes'
    )
    assert 'kernels status' in preflight, (
        'the preflight must confirm Kaggle can see the kernel, so a rotated token '
        'or a renamed slug fails here with a named remedy instead of mid-pipeline'
    )
    # Naming the secret in guidance is what keeps it from being missing next
    # month; expanding its value into the log is the leak. Writing the
    # credentials file is the one legitimate expansion — it redirects into
    # ~/.kaggle/kaggle.json instead of into the runner log.
    for line in preflight.splitlines():
        stripped = line.strip()
        if not stripped.startswith(('echo', 'cat', 'printf')):
            continue
        expands = any(token in stripped for token in
                      ('$KAGGLE_KEY', '${KAGGLE_KEY', '$KAGGLE_USERNAME', '${KAGGLE_USERNAME'))
        if not expands:
            continue
        assert re.search(r'>\s*\S*kaggle\.json', stripped) or 'wc -c' in stripped, (
            f'the preflight prints a Kaggle credential into the log: {stripped}'
        )


# ---------------------------------------------------------------------------
# Regression guards for the 2026-09-15 "everything red" sweep
# ---------------------------------------------------------------------------
# Three independent failures, all of which looked like "CI is broken" from the
# outside: the backend suite fell over on a model-version string, the site
# probe reported a redirect as an outage, and the Kaggle jobs died with a bare
# exit code 1. Each guard below pins the invariant that makes the failure
# legible instead of silent.

KAGGLE_KERNEL_WORKFLOWS = (
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'weekly_forecast.yml',
)
KAGGLE_KERNEL_SLUG = 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline'


def test_model_version_gate_detects_missing_file(workflows):
    """The Models/VERSION.json gate must see a MISSING file, not just a stale
    one.

    `git diff --exit-code -- Models/VERSION.json` prints nothing for an
    untracked file, so the gate reported "current" on `main` while the file did
    not exist at all — and the backend suite failed 60 s earlier on
    `model_version` falling back to the legacy literal. `git status --porcelain`
    reports untracked (`??`) and modified (` M`) alike.
    """
    steps = [
        step
        for job in workflows['ci.yml']['jobs'].values()
        for step in (job.get('steps') or [])
    ]
    gate = [s for s in steps if 'VERSION.json' in (s.get('name') or '')]
    assert gate, 'ci.yml has no Models/VERSION.json gate step'

    run = '\n'.join(str(s.get('run', '')) for s in gate)
    assert 'gen-model-version.mjs' in run, (
        'the VERSION.json gate must regenerate the file before comparing it'
    )
    assert 'git status --porcelain' in run, (
        'the VERSION.json gate must use `git status --porcelain` — a plain '
        '`git diff --exit-code` cannot see an untracked/missing file, which is '
        'exactly how the handshake stayed absent while CI stayed green'
    )


def _curl_flag_strings(text):
    """Every `curl` invocation's short flags in `text` (long flags excluded)."""
    for match in re.finditer(r'\bcurl\s+((?:-\S+\s+)*)', text):
        for token in match.group(1).split():
            if token.startswith('-') and not token.startswith('--'):
                yield token


def test_site_health_probe_follows_redirects(workflows):
    """curl without -L records a redirect *as* the probe result.

    The canonical deployment is www.hazardnet.live and the apex answers 308,
    so every scheduled Site Health run was red ("Homepage returned HTTP 308")
    while the site itself was up. -L plus the same-domain check in the step
    keeps the probe honest: a redirect that leaves the domain still fails.
    """
    doc = workflows['site-health.yml']
    runs = [
        str(step.get('run', ''))
        for job in doc['jobs'].values()
        for step in (job.get('steps') or [])
    ]
    assert any('curl' in run for run in runs), 'site-health.yml no longer probes with curl'

    offenders = []
    for run in runs:
        for line in run.splitlines():
            if 'curl' not in line:
                continue
            flags = list(_curl_flag_strings(line))
            if not flags:
                continue  # not a curl invocation (comment or echo)
            if not any('L' in flag for flag in flags):
                offenders.append(line.strip()[:100])

    assert not offenders, (
        'site-health.yml curl invocation(s) without -L will report the redirect '
        'instead of the site: ' + '; '.join(offenders)
    )

    # The API half of the probe must stay repointable: production served the
    # website without any /api/* route for weeks (the deployment runs the
    # frontend only), so the probe needs to be able to target the host that
    # actually answers — without editing the workflow.
    env_text = json.dumps(doc.get('env') or {})
    whole = '\n'.join(runs) + env_text
    assert 'vars.API_METADATA_URL' in whole, (
        'site-health.yml must let the forecast-API probe target another host '
        'via the API_METADATA_URL repository variable'
    )


def test_kaggle_backed_workflows_take_the_kernel_from_a_repo_variable(workflows):
    """All three Kaggle pipelines must read the kernel slug from the
    `KAGGLE_KERNEL` repository variable (with the known slug as the fallback).

    A renamed/re-uploaded notebook changes its slug; with the slug hardcoded in
    three files, every Kaggle-backed job died at the first API call with a bare
    `exit code 1` and could only be fixed by editing and merging code.
    """
    for name in KAGGLE_KERNEL_WORKFLOWS:
        doc = workflows[name]
        env = doc.get('env') or {}
        overrides = {k: env.get(k) for k in ('KAGGLE_KERNEL', 'KERNEL_SLUG') if k in env}
        assert overrides, f'{name}: no KAGGLE_KERNEL/KERNEL_SLUG in the workflow env'
        for key, value in overrides.items():
            assert 'vars.KAGGLE_KERNEL' in str(value), (
                f'{name}: {key} must be `${{{{ vars.KAGGLE_KERNEL || ... }}}}` '
                f'so it can be repointed without a code change (found: {value!r})'
            )

        # No step may shadow the overridable value with a hardcoded slug.
        for job_id, job in doc['jobs'].items():
            for step in job.get('steps') or []:
                step_env = step.get('env') or {}
                for key in ('KAGGLE_KERNEL', 'KERNEL_SLUG'):
                    if step_env.get(key) == KAGGLE_KERNEL_SLUG:
                        raise AssertionError(
                            f'{name} job `{job_id}` step `{step.get("name")}`: '
                            f'{key} is hardcoded and would shadow the repository '
                            'variable'
                        )


# ── shell syntax of every `run:` block ────────────────────────────────────────
#
# GitHub hands a `run:` block to a shell verbatim (after resolving `${{ }}`
# expressions), so a shell syntax error in a workflow is a guaranteed red step —
# and a *silent* one whenever an earlier `exit 0` guard means bash never parses
# as far as the broken line. That is exactly how daily_forecast.yml shipped an
# unbalanced quote in the alert-engine step: the credential guard returned first,
# so the defect only armed itself on the first run where the alert engine was
# actually configured to run.
#
# `bash -n` parses without executing, which makes this a cheap whole-fleet gate.

def _run_blocks(doc):
    """Yield (job_id, step_name, shell, script) for every `run:` step."""
    default_shell = (doc.get('defaults') or {}).get('run', {}).get('shell')
    for job_id, job in (doc.get('jobs') or {}).items():
        job_shell = (job.get('defaults') or {}).get('run', {}).get('shell')
        for index, step in enumerate(job.get('steps') or []):
            script = step.get('run')
            if not isinstance(script, str):
                continue
            shell = step.get('shell') or job_shell or default_shell or 'bash'
            yield job_id, step.get('name') or f'step {index}', shell, script


def _workflow_files():
    """Live workflows plus the product-repo templates (both are shell-bearing)."""
    dirs = [WORKFLOWS_DIR, ROOT / '.github' / 'workflow-templates']
    files = []
    for directory in dirs:
        files += sorted(directory.glob('*.yml')) + sorted(directory.glob('*.yaml'))
    return files


def test_every_run_block_is_valid_shell():
    """Every bash/sh `run:` block in every workflow must parse.

    `${{ … }}` is rewritten to `${ … }` first: GitHub substitutes expressions
    before the shell sees the script, and a value like `${{ secrets.X }}` is not
    shell syntax on its own.
    """
    bash = shutil.which('bash')
    if not bash:
        pytest.skip('bash not available on this platform')

    failures = []
    checked = 0
    for path in _workflow_files():
        with open(path, encoding='utf-8') as fh:
            doc = yaml.safe_load(fh)
        if True in doc and 'on' not in doc:
            doc['on'] = doc.pop(True)
        rel = path.relative_to(ROOT)
        for job_id, step_name, shell, script in _run_blocks(doc):
            if not (shell == 'sh' or shell.startswith('bash')):
                continue  # pwsh/python/etc. are not bash's problem
            checked += 1
            probe = script.replace('${{', '${').replace('}}', '}')
            result = subprocess.run(
                [bash, '-n'], input=probe, capture_output=True, text=True
            )
            if result.returncode != 0:
                failures.append(
                    f'{rel} [{job_id}] "{step_name}" ({shell}): '
                    f'{result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "parse error"}'
                )

    assert checked, 'no bash/sh run blocks found — the extractor is broken'
    assert not failures, (
        f'{len(failures)} run block(s) are not valid shell (bash -n):\n  '
        + '\n  '.join(failures)
    )


# ── every script a workflow invokes must exist ────────────────────────────────
#
# A workflow that runs a file that is not in the repository dies with a bare
# `Cannot find module` — an error that reads like a database or credentials
# failure and is neither. Each run block is scanned for script invocations and
# each one must resolve inside the tree.

SCRIPT_INVOKE_RE = re.compile(
    r'\b(?:python3?|node|npx|bash|sh)\s+'
    r'((?:scripts|frontend|backend|api|ml|e2e|data)/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts|py|sh))'
)
NPM_RUN_RE = re.compile(r'npm\s+(?:(--prefix\s+frontend)\s+)?run\s+([A-Za-z0-9:_-]+)')


def _package_scripts():
    root = json.loads((ROOT / 'package.json').read_text(encoding='utf-8')).get('scripts') or {}
    frontend_path = ROOT / 'frontend' / 'package.json'
    frontend = {}
    if frontend_path.exists():
        frontend = json.loads(frontend_path.read_text(encoding='utf-8')).get('scripts') or {}
    return root, frontend


def _strip_shell_comments(script):
    """Drop whole-line shell comments before looking for invocations.

    A commented-out `node scripts/foo.mjs` is documentation, not an invocation.
    Only lines whose first non-space character is `#` are dropped, so a `#`
    inside a quoted string cannot hide a real invocation.
    """
    return '\n'.join(
        line for line in script.splitlines() if not line.lstrip().startswith('#')
    )


def test_workflows_only_invoke_scripts_that_exist():
    """No workflow may run a file that is not in the repository.

    A step may invoke a script it has just checked for (`[ -f path ]` in the same
    `run:` block) — that is how a workflow refuses to pretend an artifact exists
    while still being ready for the day it does.
    """
    root_scripts, frontend_scripts = _package_scripts()
    problems = []

    for path in sorted(WORKFLOWS_DIR.glob('*.yml')) + sorted(WORKFLOWS_DIR.glob('*.yaml')):
        doc = yaml.safe_load(path.read_text(encoding='utf-8'))
        if True in doc and 'on' not in doc:
            doc['on'] = doc.pop(True)
        rel = path.relative_to(ROOT)
        for job_id, job in (doc.get('jobs') or {}).items():
            for step in job.get('steps') or []:
                run = step.get('run')
                if not isinstance(run, str):
                    continue
                label = f'{rel} [{job_id}] "{step.get("name") or "step"}"'
                run = _strip_shell_comments(run)

                for target in SCRIPT_INVOKE_RE.findall(run):
                    if (ROOT / target).exists():
                        continue
                    guarded = f'-f "{target}"' in run or f'-e "{target}"' in run
                    if not guarded:
                        problems.append(f'{label} invokes `{target}`, which does not exist')

                for prefix, name in NPM_RUN_RE.findall(run):
                    scripts = frontend_scripts if prefix else root_scripts
                    if name not in scripts and name not in root_scripts:
                        problems.append(f'{label} runs `npm run {name}`, which no package.json defines')

    assert not problems, (
        f'{len(problems)} workflow step(s) invoke artifacts the repository does not have:\n  '
        + '\n  '.join(problems)
    )

# ── the monthly model PR gate (model_intake.yml) ─────────────────────────────
#
# The training run is a human act: the owner opens ml/HazardNet_auto_train.ipynb on
# Colab (T4), runs the monthly block, and the notebook's own PR cell writes the
# version handshake, pushes a branch with a PAT typed at a getpass prompt, and opens
# the pull request. CI's job on that PR is to *gate* it — prove the bundle loads,
# prove the handshake the notebook committed is the one the canonical writers
# produce, show what a promotion decision would say — and then stop. Merging and
# recording a champion stay human acts (docs/mlops/RETRAIN_AND_PROMOTION.md).
#
# What used to live here: a launch workflow that provisioned a Colab VM, a watcher
# on a twenty-minute cron that followed a run marker through git, and an intake that
# collected the bundle over SSH. All three are deleted; the tests below pin that they
# stay deleted, because "we automated the monthly run" is an attractive nuisance that
# will be proposed again the first time somebody forgets why it failed.

INTAKE_GATE = 'model_intake.yml'


def _steps(doc):
    for job_id, job in (doc.get('jobs') or {}).items():
        for step in job.get('steps') or []:
            yield job_id, step


def _all_run_text(doc):
    return '\n'.join(step.get('run', '') for _, step in _steps(doc) if isinstance(step.get('run'), str))


def _all_text(doc):
    """Every string a workflow could execute or resolve: runs, env, with-args.

    Pins and slugs live in `env:` as often as in `run:`, and a test that only reads
    run blocks happily passes while the value it is guarding has moved.
    """
    return json.dumps(doc)


def _promote_commands(text):
    """Each `mlops.cli promote` invocation, with its line continuations joined.

    Prose in the same file names the command too (the report explains that the dry
    run records nothing), so a window scan over the raw text reads an explanation
    as an invocation. Only lines that could execute count.
    """
    lines = text.splitlines()
    commands = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        if 'mlops.cli promote' not in stripped:
            continue
        if stripped.startswith(('#', 'echo', 'printf', 'cat')):
            continue
        command = stripped
        cursor = index
        while command.endswith('\\') and cursor + 1 < len(lines):
            cursor += 1
            command = command[:-1].strip() + ' ' + lines[cursor].strip()
        commands.append(command)
    return commands


def _executed_lines(doc):
    """Run-block lines that are not comments — what the runner actually executes."""
    for _, step in _steps(doc):
        run = step.get('run')
        if not isinstance(run, str):
            continue
        for line in run.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith('#'):
                yield stripped


def test_the_retrain_automation_stays_deleted(workflows):
    """The Colab chain is gone: workflows, CLI modules, and the marker directory."""
    deleted_workflows = ('model_retrain.yml', 'model_retrain_watch.yml', 'hourly_forecast.yml')
    present = [name for name in deleted_workflows if name in workflows]
    assert not present, (
        f'{", ".join(present)} exists again. The monthly training run is manual '
        '(a human on Colab T4) and the forecast is pulled from Kaggle once a day; '
        'both of these workflows existed to drive a machine through a surface that '
        'only accepts a human session.'
    )
    deleted_scripts = (
        'scripts/mlops/colab_session.py',
        'scripts/mlops/retrain_cli.py',
        'scripts/tests/test_retrain_automation.py',
    )
    resurrected = [path for path in deleted_scripts if (ROOT / path).exists()]
    assert not resurrected, f'deleted Colab automation came back: {resurrected}'
    assert not (ROOT / 'data' / 'mlops' / 'retrain-runs').exists(), (
        'data/mlops/retrain-runs/ was the launch→watcher handoff; nothing writes it now'
    )


def test_the_intake_gate_is_a_pull_request_check_that_never_promotes(workflows):
    """The gate proves the bundle and reports to the human. It does not decide."""
    doc = workflows[INTAKE_GATE]
    pull = (doc.get('on') or {}).get('pull_request') or {}
    paths = pull.get('paths') or []
    assert any(p.startswith('Models') for p in paths), (
        f'{INTAKE_GATE} must trigger on changes under Models/ (found paths: {paths})'
    )
    assert 'workflow_dispatch' in (doc.get('on') or {}), (
        f'{INTAKE_GATE} must stay dispatchable so a gate can be re-run on demand'
    )

    runs = _all_run_text(doc)
    # It verifies the notebook's own handshake instead of trusting it.
    assert 'node scripts/gen-model-version.mjs' in runs, (
        f'{INTAKE_GATE} must regenerate Models/VERSION.json with the canonical writer'
    )
    assert 'mlops.cli registry --write' in runs, (
        f'{INTAKE_GATE} must rebuild Models/REGISTRY.json with the canonical writer'
    )
    assert 'scripts/validate_model_bundle.py' in runs, (
        f'{INTAKE_GATE} must run the same bundle validator model-validation.yml runs'
    )
    # It reports to the reviewer, in the PR, and stops there.
    assert 'gh pr comment' in runs, (
        f'{INTAKE_GATE} must post its findings on the pull request it gates'
    )
    assert 'gh pr merge' not in runs and 'git push' not in runs, (
        f'{INTAKE_GATE} must neither merge nor push: the merge is the human gate'
    )
    # `promote --write` is the one command that records a champion; the dry run is
    # allowed (and wanted) because a reviewer should see the decision before merging.
    commands = _promote_commands(runs)
    assert commands, (
        f'{INTAKE_GATE} must show the promotion decision (dry run) in the PR body'
    )
    for command in commands:
        assert '--write' not in command, (
            f'{INTAKE_GATE} records a promotion automatically ({command!r}); '
            '`champion` requires a named human approver'
        )


def test_no_workflow_drives_a_colab_session(workflows):
    """Nothing in CI may start, watch, or collect from a Colab VM.

    Colab exposes no non-interactive execution surface: `colab auth` and
    `drivemount` are interactive-only, and a session can be recycled at any moment.
    A workflow that reaches for it produces a red run that looks like a training
    failure. The commands below are the ones the deleted automation used.
    """
    offenders = []
    for name, doc in workflows.items():
        for line in _executed_lines(doc):
            if re.search(r'\bcolab\s+(exec|ssh|auth|drivemount)\b', line) \
               or 'nbconvert' in line \
               or 'mlops.retrain_cli' in line \
               or 'mlops.colab_session' in line:
                offenders.append(f'{name}: {line}')
    assert not offenders, (
        'CI drives a Colab session (the monthly run is manual — see '
        'docs/mlops/RETRAIN_AND_PROMOTION.md):\n  ' + '\n  '.join(offenders)
    )


def test_the_candidate_gate_runs_the_same_runtime_ci_will(workflows):
    """The gate's pins must match model-validation.yml, or a reviewer reads a green
    gate that the merge check immediately turns red."""
    intake = _all_text(workflows[INTAKE_GATE])
    validation = _all_text(workflows['model-validation.yml'])
    for pin in ('tflite-runtime==2.14.0', 'numpy==1.26.4'):
        assert pin in intake, f'{INTAKE_GATE} does not pin {pin}'
        assert pin in validation, f'model-validation.yml no longer pins {pin} — update both together'
