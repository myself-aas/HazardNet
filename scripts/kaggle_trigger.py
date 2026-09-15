#!/usr/bin/env python3
"""Kaggle Notebook Trigger and Polling Script for HazardNet Forecast Pipeline.

Triggers execution of the Kaggle notebook, polls kernel status until complete,
and logs progress or errors.

Failure modes this script is expected to explain (all three Kaggle-backed
workflows used to die with a bare `exit code 1`, which told nobody anything):

  * credentials rejected (401/403) — KAGGLE_USERNAME / KAGGLE_KEY rotated or
    expired; the secrets are *present* (the preflight step passes) but no
    longer accepted;
  * kernel not found (404) — the notebook was renamed or re-uploaded on Kaggle,
    which changes its slug; point `KAGGLE_KERNEL` (repo variable) at the new one;
  * terminal run status (`KernelWorkerStatus.ERROR` / CANCEL / FAILED) — the
    notebook itself failed, so the log is on Kaggle, not here.

When the status check fails for any of those reasons the script emits a
GitHub `::error::` annotation (the message lands in the job summary), prints a
best-effort `kaggle kernels list` so the log shows which kernels the token can
actually see, and exits 1.
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_KERNEL = "ashifahmedshuvo/hazardnet-auto-forecast-pipeline"
DEFAULT_NOTEBOOK_DIR = "./kaggle_notebooks/hazardnet-auto-forecast-pipeline"

# Kaggle CLI / API failure signatures -> actionable cause. Matched
# case-insensitively against the combined stdout+stderr of the status call;
# the first matching entry wins.
FAILURE_HINTS = (
    (
        ("401", "unauthorized", "authentication", "invalid credentials"),
        "Kaggle rejected the credentials (401/Unauthorized). KAGGLE_USERNAME / "
        "KAGGLE_KEY are present but no longer accepted — rotate them (Kaggle → "
        "Account → Create New API Token) and re-run the 'Verify GitHub Actions "
        "Secrets' workflow to confirm.",
    ),
    (
        ("403", "forbidden"),
        "Kaggle returned 403 (Forbidden): the token has no access to kernel "
        "'{kernel}'. Check that KAGGLE_USERNAME matches the notebook owner.",
    ),
    (
        ("404", "not found", "does not exist"),
        "Kernel '{kernel}' was not found. A renamed/re-uploaded notebook changes "
        "its slug — set the KAGGLE_KERNEL repository variable (Settings → Secrets "
        "and variables → Actions → Variables) to the current one.",
    ),
    (
        ("quota", "429", "too many requests", "exceeded"),
        "Kaggle rate limit / quota hit (429). Re-run once the quota window resets.",
    ),
)

# Substrings of `kaggle kernels status` that mean the run will never progress
# any further (as opposed to queued/running).
TERMINAL_FAILURE_MARKERS = ("error", "cancel", "failed")


def run_command(cmd, check=True):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(cmd)}\n{res.stderr}")
    return res.stdout.strip(), res.stderr.strip(), res.returncode


def classify_status(output):
    """Classify one `kaggle kernels status` line.

    Returns 'complete', 'failed' or 'pending'. `complete` is checked first so a
    status that contains both words (e.g. a summary line) cannot be misread as
    a failure.
    """
    text = (output or "").lower()
    if "complete" in text:
        return "complete"
    if any(marker in text for marker in TERMINAL_FAILURE_MARKERS):
        return "failed"
    return "pending"


def failure_hint(output, kernel):
    """Actionable explanation for a failed status line ('' when unknown)."""
    text = (output or "").lower()
    for markers, hint in FAILURE_HINTS:
        if any(marker in text for marker in markers):
            return hint.format(kernel=kernel)
    return ""


def print_diagnostics(kernel):
    """Best-effort `kaggle kernels list` dump — never raises, never hides the
    real error."""
    print("\n--- Kaggle diagnostics (best effort) ---")
    commands = [
        ["kaggle", "kernels", "list", "--mine", "--page-size", "30"],
        ["kaggle", "kernels", "list", "--search", kernel.split("/")[-1], "--page-size", "10"],
    ]
    for cmd in commands:
        try:
            stdout, stderr, code = run_command(cmd, check=False)
        except Exception as exc:  # pragma: no cover - diagnostics only
            print(f"$ {' '.join(cmd)}\n  <failed: {exc}>")
            continue
        print(f"$ {' '.join(cmd)} (exit {code})")
        print(stdout or f"<no stdout> {stderr}".strip())
    print("--- end diagnostics ---\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kernel", default=os.getenv("KAGGLE_KERNEL", DEFAULT_KERNEL))
    parser.add_argument("--dir", default=DEFAULT_NOTEBOOK_DIR)
    parser.add_argument("--max-retries", type=int, default=60,
                        help="Max polling attempts (each one waits --poll-interval seconds)")
    parser.add_argument("--poll-interval", type=int, default=30, help="Seconds between polls")
    args = parser.parse_args()

    kernel_slug = args.kernel
    notebook_dir = Path(args.dir)

    print(f"🚀 Initializing Kaggle notebook execution for kernel: {kernel_slug}")

    # Push kernel if metadata directory exists
    if notebook_dir.exists() and (notebook_dir / "kernel-metadata.json").exists():
        print(f"Pushing kernel from local metadata directory: {notebook_dir}")
        try:
            stdout, stderr, code = run_command(["kaggle", "kernels", "push", "-p", str(notebook_dir)])
            print(f"Push response: {stdout}")
        except Exception as e:
            print(f"Warning/Error on kernel push: {e}")
            print("Will attempt status polling on existing kernel...")
    else:
        print(f"Metadata directory not found at {notebook_dir}. Polling existing kernel {kernel_slug}...")
        print("⚠️  Nothing in CI starts a Kaggle run without that directory — the kernel must "
              "already exist and be runnable on Kaggle.")

    print(f"⏳ Polling Kaggle kernel status for {kernel_slug} "
          f"(max {args.max_retries} polls × {args.poll_interval}s)...")
    retry_count = 0
    while retry_count < args.max_retries:
        retry_count += 1
        stdout, stderr, code = run_command(["kaggle", "kernels", "status", kernel_slug], check=False)
        output = (stdout + " " + stderr).strip()
        print(f"[{retry_count}/{args.max_retries}] Status: {output}")

        status = classify_status(output)
        if status == "complete":
            print("✅ Kaggle notebook execution completed successfully!")
            sys.exit(0)
        if status == "failed":
            hint = failure_hint(output, kernel_slug)
            print(f"❌ Notebook execution failed: {output}")
            if hint:
                print(f"👉 {hint}")
            print(f"::error::{hint or f'Kaggle kernel {kernel_slug} reported a terminal failure: {output}'}")
            print_diagnostics(kernel_slug)
            sys.exit(1)

        if "never been run" in output.lower() and retry_count == 1:
            print("⚠️  Kaggle reports this kernel has never been run. Polling will not start a "
                  "run: trigger it once from the Kaggle UI, or commit the notebook directory "
                  f"({notebook_dir} = notebook + kernel-metadata.json) so `kaggle kernels push` can.")

        time.sleep(args.poll_interval)

    print(f"❌ Timeout: no terminal status for {kernel_slug} after "
          f"{args.max_retries} polls ({args.max_retries * args.poll_interval}s).")
    print(f"::error::Timed out waiting for Kaggle kernel {kernel_slug}; the run is still "
          "queued/running (or the kernel has never been run). Check "
          "https://www.kaggle.com/code/" + kernel_slug)
    print_diagnostics(kernel_slug)
    sys.exit(1)


if __name__ == "__main__":
    main()
