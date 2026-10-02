#!/usr/bin/env python3
"""Guards over the workflow files themselves (`.github/workflows/*.yml`).

Three properties of this repository's CI are not enforced by any step *inside* a
workflow, because they are properties of the workflow YAML. A step cannot check
its own command line, and a job cannot notice that a sibling job's gate has
quietly stopped existing. Each failure mode below has already happened here once,
which is why the assertion lives in the tree rather than in a reviewer's memory:

1. **A bare Jest selector in the backend job.** `--testPathIgnorePatterns` is
   ARRAY-valued: every following argument is swallowed as another ignore pattern.
   The backend step therefore ends with a directory scope (`'/frontend/'`), never
   with a bare path like `frontend/src` intended as a *selector* — a trailing
   selector silently matches nothing, and because the frontend and backend suites
   happen to number the same, the job stayed green while covering none of the
   backend.

2. **A missing file that `git diff` cannot see.** `git diff --exit-code` compares
   the working tree against the index, so an *untracked* file diffs clean. The
   model-version handshake (`Models/VERSION.json`) went missing while a
   diff-based step reported success, and the backend suite then failed on
   `model_version` falling back to a legacy literal. The step must use
   `git status --porcelain`, which reports untracked (`??`) and modified (` M`)
   alike, so stale == missing == red.

3. **A gate that stopped existing.** The claims registry is the one check that
   keeps a fabricated metric off the public site (PRD REQ-005 / TRD §10). If the
   step that runs `scripts/verify_claims.mjs` is ever dropped from `ci.yml`, the
   build must fail here rather than ship an unregistered number.

These tests parse the YAML rather than grepping it, so a reindented or renamed
step is still found — only a genuinely removed gate fails.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

try:  # PyYAML ships on the GitHub runner image; degrade to a clear message if not.
    import yaml
except ImportError:  # pragma: no cover - environment problem, not a test failure
    pytest.skip("PyYAML is required to parse the workflow files", allow_module_level=True)

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
CI = ROOT / ".github" / "workflows" / "ci.yml"


def load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def steps(job: dict) -> list[dict]:
    """Every step of a job, flattened across `steps` (a job has no other shape)."""
    return list(job.get("steps") or [])


def run_of(step: dict) -> str:
    """A step's shell command, whether it is a bare string or a `|` block."""
    run = step.get("run")
    if run is None:
        return ""
    return run if isinstance(run, str) else str(run)


def all_steps() -> list[tuple[str, str, str]]:
    """(workflow name, job id, step name) for every step in every workflow."""
    out = []
    for path in WORKFLOWS:
        doc = load(path)
        for job_id, job in (doc.get("jobs") or {}).items():
            for step in steps(job):
                out.append((path.name, job_id, str(step.get("name", "<unnamed>"))))
    return out


# ---------------------------------------------------------------------------
# 1. The backend Jest step must not carry a bare selector.
# ---------------------------------------------------------------------------

BACKEND_JOB = "test-backend"


def backend_jest_step() -> dict:
    doc = load(CI)
    job = (doc.get("jobs") or {}).get(BACKEND_JOB)
    assert job is not None, f"{BACKEND_JOB} job is missing from ci.yml"
    for step in steps(job):
        if "jest" in run_of(step):
            return step
    pytest.fail(f"no step in the {BACKEND_JOB} job runs jest")


def ignore_patterns(command: str) -> list[str]:
    """The quoted arguments that follow `--testPathIgnorePatterns`.

    The flag is written `--testPathIgnorePatterns='/node_modules/' '/e2e/' …` — an
    `=` glues the first value to the flag and the rest are space-separated, so the
    separator class is `[=\\s]*`, not `\\s+`.
    """
    match = re.search(r"--testPathIgnorePatterns[=\s]*((?:'[^']*'[=\s]*)+)", command)
    if not match:
        pytest.fail("the backend jest step passes no --testPathIgnorePatterns")
    return re.findall(r"'([^']*)'", match.group(1))


def test_backend_jest_step_has_no_bare_selector() -> None:
    """`--testPathIgnorePatterns` must receive scopes, never a path meant as a selector."""
    command = run_of(backend_jest_step())
    patterns = ignore_patterns(command)

    # Every argument is an ignore pattern, so each one must be a *pattern*: a
    # leading slash (a path-like scope such as '/frontend/') or a regex fragment.
    # A bare `frontend/src` is neither — it was meant to select, and selects nothing.
    for pattern in patterns:
        assert pattern.startswith("/") or re.search(r"[*?|()\[\]\\]", pattern), (
            f"{pattern!r} looks like a selector, not an ignore pattern — every "
            "argument after --testPathIgnorePatterns is swallowed as one"
        )

    # The directory scopes this job needs in order to run the backend only.
    for scope in ("/node_modules/", "/e2e/", "/frontend/", "/apps/", "/__mocks__/"):
        assert scope in patterns, f"the backend job no longer excludes {scope}"


def test_backend_job_runs_every_backend_suite() -> None:
    """No individual suite may be excluded by name — that is how coverage vanished.

    The list once named nine suites on the grounds that the scripts/ they import
    were absent. They are present, so the suites must run. A suite that genuinely
    cannot run should be failing visibly, not silently excluded.
    """
    patterns = ignore_patterns(run_of(backend_jest_step()))
    retired = [
        "severityEmbargo",
        "securityTxt",
        "securityHeadersParity",
        "nasaTokens",
        "freshnessArtifact",
        "contentEngine",
        "claimsGate",
        "alertSnapshot",
        "alertReplay",
    ]
    for name in retired:
        for pattern in patterns:
            assert name not in pattern, (
                f"{name} is still excluded by name ({pattern!r}); its scripts are in "
                "the tree, so the suite must run"
            )


# ---------------------------------------------------------------------------
# 2. The model-version handshake gate must detect a MISSING file.
# ---------------------------------------------------------------------------


def model_handshake_step() -> dict:
    doc = load(CI)
    for job in (doc.get("jobs") or {}).values():
        for step in steps(job):
            if "Models/VERSION.json" in run_of(step):
                return step
    pytest.fail("no step checks Models/VERSION.json — the handshake can go missing unseen")


def test_model_version_gate_detects_missing_file() -> None:
    """`git diff` cannot see an untracked file; the step must use `git status --porcelain`."""
    command = run_of(model_handshake_step())
    assert "git status --porcelain" in command, (
        "the handshake gate uses a diff-based check, which reports success for a "
        "file that is absent rather than modified"
    )
    assert "git diff --exit-code" not in command, (
        "a diff-based gate cannot detect a MISSING file — use git status --porcelain"
    )


def test_model_version_gate_step_exists() -> None:
    """The gate must be a real step in the verify job, and it must be able to fail.

    A comment describing a gate, or a step that reads the file but never exits
    non-zero, is the same as no gate. All four pieces are asserted together:
    the file is named, its presence is tested directly, the untracked/modified
    check is the porcelain one, and there is a failure path.
    """
    doc = load(CI)
    verify = (doc.get("jobs") or {}).get("verify")
    assert verify is not None, "the verify job is missing from ci.yml"
    names = [str(step.get("name", "")) for step in steps(verify)]
    matching = [step for step in steps(verify) if "Models/VERSION.json" in run_of(step)]
    assert matching, (
        f"the verify job has no step that reads Models/VERSION.json (steps: {names})"
    )

    command = run_of(matching[0])
    assert "git status --porcelain" in command, "the gate does not check for a missing file"
    assert "test -f Models/VERSION.json" in command, (
        "the gate never asserts the file exists — an absent handshake passes"
    )
    assert "exit 1" in command, "the gate has no failure path, so it can only ever pass"


# ---------------------------------------------------------------------------
# 3. The claims registry gate must keep existing.
# ---------------------------------------------------------------------------

CLAIMS_SCRIPT = "scripts/verify_claims.mjs"


def test_claims_gate_step_present() -> None:
    """PRD REQ-005 / TRD §10: a metric-shaped number in public copy needs a registry entry."""
    runners = []
    for path in WORKFLOWS:
        for job_id, job in (load(path).get("jobs") or {}).items():
            for step in steps(job):
                if CLAIMS_SCRIPT in run_of(step):
                    runners.append(f"{path.name}:{job_id}:{step.get('name', '<unnamed>')}")
    assert runners, (
        f"no workflow step runs {CLAIMS_SCRIPT} — an unregistered public metric "
        "would now build successfully"
    )


def test_no_workflow_reads_the_secrets_context_in_a_condition() -> None:
    """GitHub rejects the whole file when `secrets` is used in an `if:`.

    The Sept 2026 CI outage was exactly this: every job in the file disappeared,
    so the failure read as "CI is broken" rather than "this condition is illegal".
    The expression opener is scanned across the entire file before YAML parsing,
    so a comment is enough to trip it.
    """
    for path in WORKFLOWS:
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"\$\{\{[^}]*secrets\.[^}]*\}\}", text):
            # Find the line and check whether it is inside an `if:` condition.
            line_start = text.rfind("\n", 0, match.start()) + 1
            line_end = text.find("\n", match.end())
            line = text[line_start : line_end if line_end != -1 else None]
            assert "if:" not in line, (
                f"{path.name} uses the secrets context in a condition: {line.strip()!r}"
            )


def test_every_workflow_parses_and_declares_permissions() -> None:
    """A file that does not parse contributes zero jobs; say so loudly."""
    assert WORKFLOWS, "no workflow files found — .github/workflows is empty?"
    for path in WORKFLOWS:
        doc = load(path)
        assert "jobs" in doc, f"{path.name} declares no jobs (it will not run at all)"
        assert "permissions" in doc, f"{path.name} sets no permissions block"


def test_site_health_probes_do_not_cascade_skip() -> None:
    """Every probe step in site-health.yml must set continue-on-error: true so a single
    failing check never leaves downstream checks 'skipped' in data/site-health/latest.json,
    and a final gate step must fail the job if the aggregate outcome is not 'pass'.
    """
    site_health = ROOT / ".github" / "workflows" / "site-health.yml"
    doc = load(site_health)
    probe_job = (doc.get("jobs") or {}).get("probe")
    assert probe_job is not None, "site-health.yml is missing the 'probe' job"

    expected_probe_ids = {
        "homepage",
        "deep_links",
        "security_headers",
        "sitemap",
        "forecast_data",
        "status_page",
        "content_pages",
    }
    by_id = {step.get("id"): step for step in steps(probe_job) if step.get("id")}
    for probe_id in expected_probe_ids:
        assert probe_id in by_id, f"site-health.yml missing probe step id={probe_id}"
        assert by_id[probe_id].get("continue-on-error") is True, (
            f"site-health.yml step '{probe_id}' lacks continue-on-error: true — "
            "if it fails, subsequent checks are skipped in data/site-health/latest.json"
        )

    final_gates = [
        step
        for step in steps(probe_job)
        if "data/site-health/latest.json" in run_of(step)
        and "!= \"pass\"" in run_of(step)
        and "exit 1" in run_of(step)
    ]
    assert final_gates, (
        "site-health.yml must include a final enforcement step that exits 1 when "
        "data/site-health/latest.json outcome != 'pass'"
    )


def test_daily_advisory_ingest_refreshes_alerts_and_freshness() -> None:
    """daily_advisory_ingest.yml must rebuild alerts-latest.json and freshness.json
    and stage both in git add so the status surface never drifts after ingestion.
    """
    daily_ingest = ROOT / ".github" / "workflows" / "daily_advisory_ingest.yml"
    doc = load(daily_ingest)
    ingest_job = (doc.get("jobs") or {}).get("ingest")
    assert ingest_job is not None, "daily_advisory_ingest.yml is missing the 'ingest' job"

    all_runs = "\n".join(run_of(step) for step in steps(ingest_job))
    assert "rehearse_alert_engine.mjs" in all_runs, (
        "daily_advisory_ingest.yml must run scripts/rehearse_alert_engine.mjs"
    )
    assert "build_alert_snapshot.mjs" in all_runs, (
        "daily_advisory_ingest.yml must run scripts/build_alert_snapshot.mjs"
    )
    assert "build_freshness_artifact.mjs" in all_runs, (
        "daily_advisory_ingest.yml must run scripts/build_freshness_artifact.mjs"
    )

    commit_steps = [
        step for step in steps(ingest_job) if step.get("id") == "commit-artifacts"
    ]
    assert commit_steps, "daily_advisory_ingest.yml missing commit-artifacts step"
    commit_cmd = run_of(commit_steps[0])
    assert "frontend/public/data/alerts-latest.json" in commit_cmd, (
        "commit-artifacts must git add frontend/public/data/alerts-latest.json"
    )
    assert "frontend/public/data/freshness.json" in commit_cmd, (
        "commit-artifacts must git add frontend/public/data/freshness.json"
    )


if __name__ == "__main__":  # pragma: no cover
    sys.exit(pytest.main([__file__, "-v"]))
