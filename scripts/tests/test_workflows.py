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
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = ROOT / '.github' / 'workflows'

# The data-pipeline workflows that must exist for the website-refresh story:
# the daily runner-based producer is the single forecast pipeline (the four
# Kaggle-backed workflows — forecast-pipeline, hourly_forecast, weekly_forecast,
# manual_forecast_ingest — were removed on 2026-09-17: nothing runs on Kaggle).
REQUIRED_WORKFLOWS = {
    'ci.yml',
    'daily_forecast.yml',
    'model-validation.yml',
    'site-health.yml',
    'Supabase-cutover-verify.yml',
    'verify-secrets.yml',
    # v3 ML contract tests: severity normalizer proofs + 57 BD threshold
    # proofs (TRD §10 / PRD REQ-002 / TASK-003). Failure blocks training.
    'v3-ml-contracts.yml',
}

# Workflows that must have contents:write (they push data/commits).
# daily_forecast.yml is the only data producer: the GitHub-native generator
# commits the refreshed CSV + website snapshot, which is the only delivery path
# that works while the deployment serves no ingest API.
DATA_COMMIT_WORKFLOWS = {
    'daily_forecast.yml',
}

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


def test_forecast_generation_runs_on_the_runner_not_kaggle(workflows):
    """The GitHub-native pipeline must be the scheduled producer, and the
    Kaggle-backed workflows must not run on a schedule.

    Two things were true before 2026-09-16: every scheduled forecast job went
    through Kaggle (`kaggle kernels push` / `kernels output`), and after the
    token rotation all of them failed with a bare exit code 1 — while
    `scripts/auto_forecast.py`, which needs only the GEE service account and
    runs on the runner, sat idle in daily_forecast.yml without ever committing
    its output. The schedule now belongs to the runner.
    """
    # 1. The runner-based producer is scheduled.
    daily = workflows['daily_forecast.yml']
    crons = [(s or {}).get('cron', '') for s in (daily.get('on') or {}).get('schedule') or []]
    assert crons, 'daily_forecast.yml must keep a schedule — it is the production producer'
    assert 'workflow_dispatch' in (daily.get('on') or {}), (
        'daily_forecast.yml must stay manually dispatchable'
    )

    # 2. …and it actually generates the forecast on the runner.
    runs = [
        str(step.get('run', ''))
        for job in daily['jobs'].values()
        for step in (job.get('steps') or [])
    ]
    whole = '\n'.join(runs)
    assert 'scripts/auto_forecast.py' in whole, (
        'daily_forecast.yml must run scripts/auto_forecast.py (the GEE + TFLite generator)'
    )
    assert 'publish_forecast_csv' in whole, (
        'daily_forecast.yml must promote the generated CSV into backend/data/forecasts/'
    )
    assert 'build_forecast_snapshot.mjs' in whole, (
        'daily_forecast.yml must rebuild the website snapshot it commits'
    )
    # The workflow must not *invoke* Kaggle or read its secrets. Prose is
    # allowed (the file explains why Kaggle is gone), executed commands are not:
    # strip comment lines, then look for CLI calls and secret references.
    kaggle_calls = []
    for job_id, job in daily['jobs'].items():
        for step in job.get('steps') or []:
            if 'secrets.KAGGLE' in json.dumps(step.get('env') or {}):
                kaggle_calls.append(f'{job_id}/{step.get("name")}: reads a KAGGLE_* secret')
            commands = '\n'.join(
                line for line in str(step.get('run', '')).splitlines()
                if not line.strip().startswith('#')
            )
            if re.search(r'\bkaggle\s+(kernels|datasets|config)', commands):
                kaggle_calls.append(f'{job_id}/{step.get("name")}: calls the kaggle CLI')
    assert not kaggle_calls, (
        'the production forecast pipeline must not depend on Kaggle:\n'
        + '\n'.join(kaggle_calls)
    )

    # 3. Nothing anywhere in .github/workflows/ may talk to Kaggle any more.
    #    The four Kaggle-backed workflows were removed on 2026-09-17 (owner
    #    decision: nothing runs on the Kaggle platform). This guard keeps them
    #    out: any reintroduced `kaggle` CLI call, KAGGLE_* secret read, or
    #    kernel-slug variable in an EXECUTED command fails here. Prose
    #    comments explaining the history are fine — commands are not.
    violations = []
    for name, doc in workflows.items():
        for job_id, job in doc['jobs'].items():
            env_blob = json.dumps(doc.get('env') or {}) + json.dumps(job.get('env') or {})
            for step in job.get('steps', []) or []:
                env_blob += json.dumps(step.get('env') or {})
            if 'secrets.KAGGLE' in env_blob or 'vars.KAGGLE_KERNEL' in env_blob:
                violations.append(f'{name}/{job_id}: reads a KAGGLE secret/variable')
            for step in job.get('steps', []) or []:
                commands = '\n'.join(
                    line for line in str(step.get('run', '')).splitlines()
                    if not line.strip().startswith('#')
                )
                if re.search(r'\bkaggle\s+(kernels|datasets|config|competitions)', commands):
                    violations.append(
                        f'{name}/{job_id}/{step.get("name")}: calls the kaggle CLI'
                    )
    assert not violations, (
        'no workflow may depend on Kaggle (removed 2026-09-17 — the runner '
        'pipeline is the only producer):\n' + '\n'.join(violations)
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
    'actions/cache':           'v5',
}

# Workflows that are either scheduled or long-running and therefore need a
# concurrency guard to avoid overlapping runs.
CONCURRENCY_REQUIRED = {
    'ci.yml',
    'daily_forecast.yml',
    'site-health.yml',
    'Supabase-cutover-verify.yml',
    'verify-secrets.yml',
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
    """The daily forecast script exits with a cryptic traceback when
    EE_SERVICE_ACCOUNT_JSON / HAZARDNET_API_* are missing. The workflow must
    run a preflight step that checks them and fails fast with a clear
    message (mirroring the pattern used by forecast-pipeline, hourly,
    weekly, and manual-ingest)."""
    doc = workflows['daily_forecast.yml']
    preflight_seen = False
    for job in doc['jobs'].values():
        for step in job.get('steps') or []:
            run = step.get('run', '') or ''
            name = (step.get('name') or '').lower()
            if ('preflight' in name or 'secret' in name or 'required' in name) \
               and 'EE_SERVICE_ACCOUNT_JSON' in run and 'HAZARDNET_API' in run:
                preflight_seen = True
                break
    assert preflight_seen, (
        'daily_forecast.yml must include a preflight step that verifies '
        'EE_SERVICE_ACCOUNT_JSON / HAZARDNET_API_URL / HAZARDNET_API_KEY are '
        'set before running auto_forecast.py (see other pipelines for the pattern)'
    )


# ---------------------------------------------------------------------------
# Regression guards for the 2026-09-15 "everything red" sweep
# ---------------------------------------------------------------------------
# Three independent failures, all of which looked like "CI is broken" from the
# outside: the backend suite fell over on a model-version string, the site
# probe reported a redirect as an outage, and the Kaggle jobs died with a bare
# exit code 1. Each guard below pins the invariant that makes the failure
# legible instead of silent. (The Kaggle leg of that sweep is now enforced
# structurally by test_forecast_generation_runs_on_the_runner_not_kaggle:
# the Kaggle workflows were deleted outright on 2026-09-17.)


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
