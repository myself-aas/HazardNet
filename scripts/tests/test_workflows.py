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
# daily producer, hourly refresher, manual CSV ingest, weekly release.
REQUIRED_WORKFLOWS = {
    'ci.yml',
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'hourly_forecast.yml',
    'manual_forecast_ingest.yml',
    'model-validation.yml',
    'site-health.yml',
    'Supabase-cutover-verify.yml',
    'verify-secrets.yml',
    'weekly_forecast.yml',
    # v3 ML contract tests: severity normalizer proofs + 57 BD threshold
    # proofs (TRD §10 / PRD REQ-002 / TASK-003). Failure blocks training.
    'v3-ml-contracts.yml',
}

# Workflows that must have contents:write (they push data/commits).
# daily_forecast.yml joined on 2026-09-16: the GitHub-native producer commits
# the refreshed CSV + website snapshot, which is the only delivery path that
# works while the deployment serves no ingest API.
DATA_COMMIT_WORKFLOWS = {
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'hourly_forecast.yml',
    'manual_forecast_ingest.yml',
    'weekly_forecast.yml',
}

# Kaggle-dependent workflows, retired from the schedule on 2026-09-16.
KAGGLE_WORKFLOWS = ('forecast-pipeline.yml', 'hourly_forecast.yml', 'weekly_forecast.yml')

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

    # 3. No workflow that needs Kaggle is on a schedule any more.
    scheduled = []
    for name in KAGGLE_WORKFLOWS:
        doc = workflows[name]
        if (doc.get('on') or {}).get('schedule'):
            scheduled.append(name)
    assert not scheduled, (
        'these Kaggle-backed workflows must stay dispatch-only (they need a valid '
        f'token + a runnable kernel; production runs on the runner): {scheduled}'
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
    # The retrain trio: launch, watcher, intake. The watcher is the one that most
    # needs the guard — two overlapping ticks would provision two VMs and race on the
    # same run marker in git.
    'model_retrain.yml',
    'model_retrain_watch.yml',
    'model_intake.yml',
    'daily_forecast.yml',
    'forecast-pipeline.yml',
    'hourly_forecast.yml',
    'manual_forecast_ingest.yml',
    'site-health.yml',
    'Supabase-cutover-verify.yml',
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
# legible instead of silent.

KAGGLE_KERNEL_WORKFLOWS = ('forecast-pipeline.yml', 'hourly_forecast.yml', 'weekly_forecast.yml')
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
# `Supabase-cutover-verify.yml` was committed invoking
# `scripts/verify-supabase-cutover.mjs`, a file that was never written (as were
# `scripts/db/002_forecasts_supabase.sql` and
# `scripts/migrate-firestore-to-supabase.mjs`, which ADR 0002 and
# scripts/db/README.md both name). Dispatching the workflow died with
# `Cannot find module …` — an error that reads like a database or credentials
# failure and is neither. A workflow that describes work nobody did is worse than
# no workflow: it reports a red run whose cause is not in the run.

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

    A commented-out `node scripts/foo.mjs` is documentation, not an invocation —
    and `Supabase-cutover-verify.yml` keeps exactly that: the step it will restore
    once the missing artifact is committed (Action 14). Only lines whose first
    non-space character is `#` are dropped, so a `#` inside a quoted string cannot
    hide a real invocation.
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


# ── the unattended retrain chain (model_retrain / _watch / model_intake) ──────
#
# Three workflows that only work together: a launch that provisions a Colab T4 and
# commits a run marker, a watcher that follows the marker every twenty minutes, and
# an intake that turns a finished bundle into a pull request. Each leg is short —
# the training itself is eight hours long and runs on a VM, not on a runner — so the
# invariants below are about the handoffs, which are the parts that fail silently.

RETRAIN_CHAIN = ('model_retrain.yml', 'model_retrain_watch.yml', 'model_intake.yml')


def _steps(doc):
    for job_id, job in (doc.get('jobs') or {}).items():
        for step in job.get('steps') or []:
            yield job_id, step


def _all_run_text(doc):
    return '\n'.join(step.get('run', '') for _, step in _steps(doc) if isinstance(step.get('run'), str))


def test_the_retrain_chain_exists(workflows):
    missing = [name for name in RETRAIN_CHAIN if name not in workflows]
    assert not missing, (
        f'missing {", ".join(missing)}: the monthly retrain is three workflows that hand off '
        'through data/mlops/retrain-runs/, and a chain with a leg removed fails silently'
    )


def test_the_launch_commits_the_marker_the_watcher_reads(workflows):
    """The handoff is git. A launch that does not commit leaves an orphaned VM."""
    launch = _all_run_text(workflows['model_retrain.yml'])
    assert 'mlops.retrain_cli start' in launch
    assert 'data/mlops/retrain-runs' in launch
    assert 'git push origin' in launch

    watch = _all_run_text(workflows['model_retrain_watch.yml'])
    assert 'mlops.retrain_cli watch' in watch
    assert 'data/mlops/retrain-runs' in watch


def test_the_watcher_runs_often_enough_to_notice_a_recycled_session(workflows):
    triggers = workflows['model_retrain_watch.yml']['on']
    crons = [entry['cron'] for entry in triggers.get('schedule') or []]
    assert crons, 'the watcher has no schedule: nothing would notice a dead session'
    # A free-tier session can vanish at any moment; a watcher that runs hourly would
    # leave the run dead for an hour and lose an hour of the monthly window.
    assert any(cron.startswith('*/') and int(cron.split('/')[1].split()[0]) <= 30 for cron in crons), crons


def test_no_workflow_runs_the_training_in_the_foreground(workflows):
    """`colab exec` blocks until the notebook finishes — a job is killed at six hours.

    The training has to be handed to the VM detached (`colab ssh` + nohup, which is
    what `retrain_cli start` does) and observed afterwards. This pins the reason: if
    somebody "simplifies" the launch into a blocking exec, the run dies at hour six
    every month and the failure looks like a training bug.
    """
    for name in RETRAIN_CHAIN:
        text = _all_run_text(workflows[name])
        assert 'colab exec -f' not in text, f'{name} runs a notebook in the foreground'
        assert 'nbconvert' not in text, (
            f'{name} invokes nbconvert on the runner; execution belongs to the Colab VM'
        )
    for job_id, job in (workflows['model_retrain.yml'].get('jobs') or {}).items():
        timeout = job.get('timeout-minutes') or 0
        assert timeout <= 60, (
            f'model_retrain.yml job `{job_id}` has timeout-minutes {timeout}: the launch is '
            'minutes long, and a long timeout here means somebody is training on the runner'
        )


def test_intake_opens_a_pull_request_and_never_promotes(workflows):
    """Merging is the human's step; `promote --write` is the machine's forbidden one."""
    intake = _all_run_text(workflows['model_intake.yml'])
    assert 'gh pr create' in intake
    # The handshake is regenerated by the repository's canonical writer, not by a
    # second implementation living in the Python CLI.
    assert 'node scripts/gen-model-version.mjs' in intake
    assert 'scripts/validate_model_bundle.py' in intake
    assert 'promote --write' not in intake and 'promote\n' not in intake
    for name in RETRAIN_CHAIN:
        text = _all_run_text(workflows[name])
        assert 'mlops.cli promote' not in text or '--write' not in text.split('mlops.cli promote')[1][:200], (
            f'{name} records a promotion automatically; `champion` requires a named approver'
        )


def test_the_candidate_job_runs_the_same_runtime_the_gate_will(workflows):
    """The smoke test in intake must match model-validation.yml, or the PR reviewer
    reads a green check that CI is about to turn red."""
    intake = _all_run_text(workflows['model_intake.yml'])
    validation = _all_run_text(workflows['model-validation.yml'])
    for pin in ('tflite-runtime==2.14.0', 'numpy==1.26.4'):
        assert pin in intake, f'model_intake.yml does not install {pin}'
        assert pin in validation, f'model-validation.yml no longer pins {pin} — update both together'


def test_the_colab_token_is_used_but_never_printed(workflows):
    """A refresh token is a standing credential for a person's Google account."""
    for name in RETRAIN_CHAIN:
        for job_id, step in _steps(workflows[name]):
            run = step.get('run')
            if not isinstance(run, str):
                continue
            for line in run.splitlines():
                stripped = line.strip()
                # Naming the secret in an error message is the guidance that keeps it
                # from being missing next month; *expanding* it is the leak.
                if not stripped.startswith(('echo', 'cat', 'printf')):
                    continue
                expands = '$COLAB_TOKEN_JSON' in stripped or '${COLAB_TOKEN_JSON' in stripped
                if not expands:
                    continue
                # The one allowed expansion is a byte count, which prints a number.
                assert 'wc -c' in stripped, (
                    f'{name} [{job_id}] "{step.get("name")}" prints the Colab token: {stripped}'
                )
