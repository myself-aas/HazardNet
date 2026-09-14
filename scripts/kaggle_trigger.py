#!/usr/bin/env python3
"""Kaggle Notebook Trigger and Polling Script for HazardNet Forecast Pipeline.

Triggers execution of the Kaggle notebook, polls kernel status until complete,
and logs progress or errors.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_KERNEL = "ashifahmedshuvo/hazardnet-auto-forecast-pipeline"
DEFAULT_NOTEBOOK_DIR = "./kaggle_notebooks/hazardnet-auto-forecast-pipeline"


def run_command(cmd, check=True):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(cmd)}\n{res.stderr}")
    return res.stdout.strip(), res.stderr.strip(), res.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kernel", default=os.getenv("KAGGLE_KERNEL", DEFAULT_KERNEL))
    parser.add_argument("--dir", default=DEFAULT_NOTEBOOK_DIR)
    parser.add_argument("--max-retries", type=int, default=60, help="Max polling attempts (minutes)")
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

    print(f"⏳ Polling Kaggle kernel status for {kernel_slug} (max {args.max_retries} mins)...")
    retry_count = 0
    while retry_count < args.max_retries:
        retry_count += 1
        stdout, stderr, code = run_command(["kaggle", "kernels", "status", kernel_slug], check=False)
        output = (stdout + " " + stderr).strip()
        print(f"[{retry_count}/{args.max_retries}] Status: {output}")

        output_lower = output.lower()
        if "complete" in output_lower:
            print("✅ Kaggle notebook execution completed successfully!")
            sys.exit(0)
        elif any(err in output_lower for err in ["error", "cancel", "failed"]):
            print(f"❌ Notebook execution failed: {output}")
            sys.exit(1)

        time.sleep(args.poll_interval)

    print("❌ Timeout waiting for Kaggle notebook execution to complete.")
    sys.exit(1)


if __name__ == "__main__":
    main()
