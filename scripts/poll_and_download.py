#!/usr/bin/env python3
"""
Polls Kaggle API until the notebook completes, then downloads the output CSV.
"""
import os
import sys
import time
import subprocess
import json

NOTEBOOK_SLUG = os.environ.get(
    "KAGGLE_NOTEBOOK_SLUG",
    "ashifahmedshuvo/hazardnet-auto-forecast-pipeline"
)
MAX_ATTEMPTS = int(os.environ.get("MAX_POLL_ATTEMPTS", "120"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
OUTPUT_FILE = "hazardnet_forecasts_latest.csv"


def get_kernel_status():
    """Returns the current status of the Kaggle kernel."""
    result = subprocess.run(
        ["kaggle", "kernels", "status", NOTEBOOK_SLUG, "--csv"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return "unknown", result.stderr
    
    # Parse CSV output: ref,title,author,lastRunTime,totalVotes,...
    lines = result.stdout.strip().split("\n")
    if len(lines) < 2:
        return "unknown", "No status output"
    
    # The status field varies by Kaggle CLI version
    # Typically: "complete", "running", "queued", "error"
    output = result.stdout.lower()
    if "complete" in output or "success" in output:
        return "complete", result.stdout
    elif "error" in output or "fail" in output:
        return "error", result.stdout
    elif "running" in output or "queued" in output:
        return "running", result.stdout
    else:
        return "unknown", result.stdout


def download_output():
    """Downloads the notebook output files from Kaggle."""
    print(f"\nDownloading output from: {NOTEBOOK_SLUG}")
    
    result = subprocess.run(
        ["kaggle", "kernels", "output", NOTEBOOK_SLUG, "-p", "."],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        print(f"Download failed: {result.stderr}")
        return False
    
    print(f"Download complete: {result.stdout}")
    
    # Verify the CSV exists
    if os.path.exists(OUTPUT_FILE):
        size = os.path.getsize(OUTPUT_FILE)
        print(f"{OUTPUT_FILE} found ({size:,} bytes)")
        return True
    else:
        # Kaggle might nest it in a subfolder
        for root, dirs, files in os.walk("."):
            if OUTPUT_FILE in files:
                os.rename(os.path.join(root, OUTPUT_FILE), OUTPUT_FILE)
                print(f"Found and moved {OUTPUT_FILE}")
                return True
    
    print(f"{OUTPUT_FILE} not found in downloaded files")
    return False


def main():
    print("=" * 60)
    print("POLLING KAGGLE NOTEBOOK STATUS")
    print(f"   Max attempts: {MAX_ATTEMPTS} × {POLL_INTERVAL}s = {MAX_ATTEMPTS * POLL_INTERVAL // 60} min")
    print("=" * 60)
    
    for attempt in range(1, MAX_ATTEMPTS + 1):
        status, detail = get_kernel_status()
        elapsed = attempt * POLL_INTERVAL
        
        print(f"  [{attempt:3d}/{MAX_ATTEMPTS}] Status: {status:10s} | Elapsed: {elapsed // 60}m {elapsed % 60}s")
        
        if status == "complete":
            print(f"\nNotebook completed after ~{elapsed // 60} minutes")
            break
        elif status == "error":
            print(f"\nNotebook failed with error:")
            print(detail)
            
            # Try to get logs
            log_result = subprocess.run(
                ["kaggle", "kernels", "output", NOTEBOOK_SLUG, "-p", "./logs"],
                capture_output=True, text=True
            )
            sys.exit(1)
        
        time.sleep(POLL_INTERVAL)
    else:
        print(f"\nNotebook did not complete in {MAX_ATTEMPTS * POLL_INTERVAL // 60} minutes")
        sys.exit(1)
    
    # Download the output
    if not download_output():
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("POLL & DOWNLOAD COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()