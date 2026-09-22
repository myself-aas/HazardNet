"""Regression tests for the secret scan (Phase 6, SEC-14).

`scripts/check-secrets.sh` is the gate that stops a credential from being committed, and
it shipped with a false negative that made the gate decorative for the one file most
likely to hold a key:

    the allowlist was applied to the whole `file:line:match` string, so the token
    `EXAMPLE` matched the *path* `.env.example` and every hit inside that file was
    silently allowed.

Real provider keys (Groq `gsk_…`, HuggingFace `hf_…`, Vercel `vcp_…`, a 64-hex
BACKEND_API_KEY, a VAPID private key, Gemini and OpenRouter keys) sat in the tracked
`.env.example` while the scan printed "✅ passed" — including in CI.

These tests pin both directions in a throwaway repository, so the gate itself is now
tested rather than trusted:

1. a secret in a file whose path contains "example" MUST fail;
2. a placeholder-valued template MUST pass;
3. the scanner's exit code, not just its output, is what the test asserts.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCANNER = ROOT / "scripts" / "check-secrets.sh"
REAL_EXAMPLE = ROOT / ".env.example"


def make_repo(tmp_path: Path, filename: str, content: str) -> Path:
    """A minimal git repo containing the scanner and one file of interest."""
    repo = tmp_path / "repo"
    (repo / "scripts").mkdir(parents=True)
    shutil.copy(SCANNER, repo / "scripts" / "check-secrets.sh")
    (repo / "tracked.txt").write_text("nothing to see here\n", encoding="utf-8")
    target = repo / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(
        ["git", "-c", "user.email=t@example.com", "-c", "user.name=t", "add", "-A"],
        cwd=repo, check=True,
    )
    return repo


def run_scanner(repo: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", "scripts/check-secrets.sh"],
        cwd=repo, capture_output=True, text=True, timeout=120,
    )


# A synthetic credential per provider shape the scanner claims to catch. Values are
# obviously fake (`zzzz…`) — they only need the prefix/length the patterns match.
PROVIDER_SHAPES = {
    "groq": "GROQ_API_KEY=gsk_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    "huggingface": "HUGGINGFACE_API_KEY=hf_zzzzzzzzzzzzzzzzzzzz",
    "openrouter": "OPENROUTER_API_KEY=sk-or-v1-zzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    "gemini": "GEMINI_API_KEY=AQ.Azzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    "vapid-private": "VAPID_PRIVATE_KEY=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    "backend-hex": "BACKEND_API_KEY=" + "0" * 64,
    "postgres": "DATABASE_URL=postgresql://hazard:sup3rs3cret@db.internal:5432/hazardnet",
    "github": "TOKEN=ghp_" + "z" * 30,
}


@pytest.mark.parametrize("name,line", sorted(PROVIDER_SHAPES.items()))
def test_secret_in_env_example_is_caught(tmp_path: Path, name: str, line: str) -> None:
    """The exact bug: the *path* `.env.example` must not suppress a real value."""
    repo = make_repo(tmp_path, ".env.example", line + "\n")
    result = run_scanner(repo)
    assert result.returncode != 0, f"{name} slipped through:\n{result.stdout}"
    assert "possible secret" in result.stdout


@pytest.mark.parametrize("name,line", sorted(PROVIDER_SHAPES.items()))
def test_secret_in_an_example_named_file_is_caught(tmp_path: Path, name: str, line: str) -> None:
    """…and neither must any other filename that merely contains the word."""
    repo = make_repo(tmp_path, "docs/example-config.md", line + "\n")
    result = run_scanner(repo)
    assert result.returncode != 0, f"{name} slipped through:\n{result.stdout}"


def test_placeholders_pass(tmp_path: Path) -> None:
    repo = make_repo(
        tmp_path,
        ".env.example",
        "BACKEND_API_KEY=REPLACE_WITH_64_HEX_CHARS\n"
        "GEMINI_API_KEY=REPLACE_WITH_GOOGLE_AI_STUDIO_KEY\n"
        "VAPID_PRIVATE_KEY=REPLACE_WITH_VAPID_PRIVATE_KEY\n"
        "AUTH_TOKEN=<your-token-here>\n",
    )
    result = run_scanner(repo)
    assert result.returncode == 0, result.stdout
    assert "Secret scan passed" in result.stdout


def test_public_by_design_values_pass(tmp_path: Path) -> None:
    """The Firebase web key and the analytics tag ship to browsers; they are not secrets."""
    repo = make_repo(
        tmp_path,
        ".env.example",
        "VITE_FIREBASE_API_KEY=AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ\n"
        "VITE_VERCEL_ANALYTICS=vcp_0BIONpJARYHz3ZwJ3KvCVcPwWPcAsQmzsdqg9JFsePWFyRV4413tRKtw\n"
        "VAPID_PUBLIC_KEY=<vapid-public-key>\n",
    )
    assert run_scanner(repo).returncode == 0


def test_vite_values_are_treated_as_public_only_for_the_shipped_shapes(tmp_path: Path) -> None:
    """A Firebase web key inside a VITE_ variable is public; the same string elsewhere is not."""
    public = make_repo(tmp_path / "public", ".env.example", "VITE_FIREBASE_API_KEY=AIzaSyBzzzzzzzzzzzzzzzzzzzzzzzzzzzz\n")
    assert run_scanner(public).returncode == 0

    leaking = make_repo(tmp_path / "leaking", "config.ts", "const FIREBASE_API_KEY = 'AIzaSyBzzzzzzzzzzzzzzzzzzzzzzzzzzzz';\n")
    assert run_scanner(leaking).returncode != 0


def test_private_key_pasted_into_a_public_key_variable_still_fails(tmp_path: Path) -> None:
    """The public-by-design exemption is by NAME, not by shape: the value must match."""
    repo = make_repo(tmp_path, ".env.example", "VAPID_PUBLIC_KEY=ghp_" + "z" * 30 + "\n")
    assert run_scanner(repo).returncode != 0


def test_the_shipped_env_example_is_clean() -> None:
    """The tracked template must stay placeholder-only — this file is the one that leaked."""
    # `.env.example` is optional in the tree (it was removed from main on
    # 2026-09-22); when present it must be placeholder-only. The scanner run
    # below always executes either way — that is the gate over the real tree.
    if REAL_EXAMPLE.exists():
        text = REAL_EXAMPLE.read_text(encoding="utf-8")
        assignments = [
            line for line in text.splitlines()
            if line.strip() and not line.lstrip().startswith("#") and "=" in line
        ]
        assert assignments, "the template should document the environment"

        # Nothing that looks like a credential, by the same shapes the scanner uses.
        suspicious = [
            line for line in assignments
            if any(prefix in line for prefix in ("gsk_", "hf_", "sk-or-v1-", "AQ.", "ghp_", "vcp_"))
            and "REPLACE_WITH" not in line
            and "VITE_VERCEL_ANALYTICS" not in line
        ]
        assert suspicious == [], f"real-looking values in .env.example: {suspicious}"

    # …and the scanner agrees, run over the real tree from the repo root.
    result = subprocess.run(
        ["bash", str(SCANNER)], cwd=ROOT, capture_output=True, text=True, timeout=300,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Secret scan passed" in result.stdout


def test_scan_covers_the_whole_tracked_tree() -> None:
    """A gate that scans nothing passes everything — assert the file count is real."""
    result = subprocess.run(
        ["bash", str(SCANNER)], cwd=ROOT, capture_output=True, text=True, timeout=300,
    )
    assert result.returncode == 0, result.stdout
    counted = int(result.stdout.split("(")[1].split(" tracked files")[0])
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    # Lockfiles, the scanner and this suite (which is full of credential-shaped fixtures)
    # are the only exclusions — the list lives in the script and is asserted here so a new
    # exemption cannot be added quietly.
    script = SCANNER.read_text(encoding="utf-8")
    files_block = script[script.index("mapfile -t FILES"):script.index("value_of()")]
    assert "check-secrets" in files_block, "the scanner itself should be excluded by name"
    assert "tests/test_secret_scan" in files_block, "its own fixture suite should be excluded by name"
    # Lockfiles (4 names) + the two excluded scripts: nothing else may be skipped.
    assert len(tracked) - counted <= 8, f"scanned {counted} of {len(tracked)} tracked files"
    exclusions = [line.strip() for line in files_block.splitlines() if "grep -vE" in line]
    assert len(exclusions) == 2, f"unexpected extra exclusions: {exclusions}"
    # Both name files explicitly (escaped dots, anchored ends) — no directory-wide exemption.
    for line in exclusions:
        assert "\\." in line, f"exclusion is not a file pattern: {line}"
        assert line.count("'") == 2, f"exclusion should be one quoted pattern: {line}"
    assert counted > 500, f"only {counted} files scanned"


if __name__ == "__main__":  # pragma: no cover
    sys.exit(pytest.main([__file__, "-v"]))
