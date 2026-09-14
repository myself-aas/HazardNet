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
import shlex
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = ROOT / '.github' / 'workflows'

# The data-pipeline workflows that must exist for the website-refresh story:
# daily producer, hourly refresher, manual CSV ingest, weekly release.
REQUIRED_WORKFLOWS = {
    'ci.yml',
    'forecast-pipeline.yml',
    'hourly_forecast.yml',
    'manual_forecast_ingest.yml',
    'weekly_forecast.yml',
}

DATA_COMMIT_WORKFLOWS = {
    'forecast-pipeline.yml',
    'hourly_forecast.yml',
    'manual_forecast_ingest.yml',
    'weekly_forecast.yml',
}


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


def test_hourly_workflow_runs_hourly(workflows):
    doc = workflows['hourly_forecast.yml']
    schedules = (doc.get('on') or {}).get('schedule') or []
    crons = [s.get('cron', '') for s in schedules]
    assert any(c.startswith('5 * * * *') or c.startswith('*/60') or ' * * *' in c
               for c in crons), (
        f'hourly_forecast.yml must run hourly; found schedules: {crons}'
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
