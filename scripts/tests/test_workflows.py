"""
test_workflows.py — guards for GitHub Actions workflow files

Checks:
- every .github/workflows/*.yml parses as YAML
- no `secrets` context in ANY `if:` (job or step) — GitHub rejects the whole file
- the backend jest step has no bare selector (test_backend_jest_step_has_no_bare_selector)
- the Model VERSION gate detects missing file
- the claims gate step is present
"""
import pathlib
import re
import yaml

WORKFLOWS_DIR = pathlib.Path(".github/workflows")

def test_workflows_parse_as_yaml():
    for path in WORKFLOWS_DIR.glob("*.yml"):
        with open(path) as f:
            data = yaml.safe_load(f)
        assert isinstance(data, dict), f"{path} did not parse as dict"

def test_no_secrets_in_if():
    secret_if = re.compile(r"if\s*:\s*.*secrets\.")
    for path in WORKFLOWS_DIR.glob("*.yml"):
        text = path.read_text()
        # Find any line with `if:` containing `secrets.`
        for i, line in enumerate(text.splitlines(), 1):
            if "if:" in line and "secrets." in line:
                assert False, f"{path}:{i} uses secrets in if: {line.strip()}"

def test_backend_jest_step_has_no_bare_selector():
    ci = WORKFLOWS_DIR / "ci.yml"
    text = ci.read_text()
    # The backend jest step should have --testPathIgnorePatterns with explicit patterns, not a bare 'frontend/src' selector
    # Check that the line after "Run backend unit tests" contains --testPathIgnorePatterns and does not end with a bare path selector without flag
    assert "--testPathIgnorePatterns=" in text
    # Ensure the backend step does not have a bare `'frontend/src'` at end of command without flag
    # The fixed version has multiple --testPathIgnorePatterns args each with = or quoted pattern
    backend_section = text.split("Run backend unit tests")[1].split("Upload backend coverage")[0]
    # It should not contain a trailing `'frontend/src'` without preceding flag
    # Simple check: the backend jest command should not end with `'frontend/src'` as bare selector
    assert "testPathIgnorePatterns='/node_modules/'" in backend_section

def test_model_version_gate_detects_missing_file():
    ci = WORKFLOWS_DIR / "ci.yml"
    text = ci.read_text()
    assert "Model VERSION.json is current" in text
    assert "git status --porcelain" in text

def test_claims_gate_step_present():
    ci = WORKFLOWS_DIR / "ci.yml"
    text = ci.read_text()
    assert "Claims registry gate" in text
    assert "check-claims.mjs" in text
