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
