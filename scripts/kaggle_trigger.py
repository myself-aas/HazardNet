#!/usr/bin/env python3
"""
Trigger Kaggle notebook execution and download results.
Part of the HazardNet automated forecast pipeline.
"""
import os
import sys
import time
import json
from pathlib import Path

KAGGLE_USERNAME = os.environ.get('KAGGLE_USERNAME')
KAGGLE_KEY = os.environ.get('KAGGLE_KEY')
# This is the committed Kaggle kernel that owns the forecast artifacts. Keep
# this explicit so a missing username cannot silently target a different slug.
NOTEBOOK_PATH = os.environ.get(
    'KAGGLE_KERNEL',
    'ashifahmedshuvo/hazardnet-auto-forecast-pipeline'
)
DATASET_PATH = os.environ.get(
    'KAGGLE_DATASET',
    'ashifahmedshuvo/hazardnet-weekly-forecasts'
)
MAX_POLL_ATTEMPTS = 120  # 2 hours with 60s intervals
POLL_INTERVAL = 60  # seconds

def trigger_notebook():
    """Push a new version to trigger execution."""
    print(f"🚀 Triggering Kaggle notebook: {NOTEBOOK_PATH}")
    
    # Using Kaggle API's push command (requires notebook already exists)
    notebook_dir = Path("./kaggle_notebooks/hazardnet-auto-forecast-pipeline")
    if not notebook_dir.exists():
        print(f"❌ Notebook directory not found: {notebook_dir}")
        sys.exit(1)
    
    cmd = f"kaggle kernels push -p {notebook_dir}"
    result = os.system(cmd)
    
    if result != 0:
        print("❌ Failed to trigger notebook")
        sys.exit(1)
    
    print("✅ Notebook triggered successfully")
    return True

def poll_notebook_status():
    """Poll notebook until completion."""
    print(f"\n⏳ Polling notebook status (max {MAX_POLL_ATTEMPTS} attempts)...")
    
    for attempt in range(MAX_POLL_ATTEMPTS):
        cmd = f"kaggle kernels status {NOTEBOOK_PATH}"
        result = os.popen(cmd).read().strip()
        
        if "complete" in result.lower():
            print("\n✅ Notebook execution complete!")
            return True
        elif "error" in result.lower() or "failed" in result.lower():
            print(f"\n❌ Notebook execution failed!")
            print(f"Status: {result}")
            return False
        
        print(f"   Attempt {attempt + 1}/{MAX_POLL_ATTEMPTS}: Status = {result}")
        time.sleep(POLL_INTERVAL)
    
    print("\n⏱️ Timeout: Notebook execution took too long")
    return False

def _pick_csv(directory: Path, target_name: str):
    """Pick the forecast CSV from a download dir (preferred name first)."""
    candidates = list(directory.rglob("*.csv"))
    preferred = [p for p in candidates if p.name == target_name]
    return preferred[0] if preferred else (candidates[0] if candidates else None)


def download_outputs():
    """Download the notebook's CSV output, falling back to the daily dataset.

    Primary source (same one the hourly refresh workflow uses):
        kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline -p <dir>
    which yields the notebook's /kaggle/working/hazardnet_forecasts_latest.csv
    from its most recent run. The daily Kaggle dataset remains the fallback
    for when the kernel output is unpublished or unavailable.
    """
    output_dir = Path("./backend/data/forecasts")
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_file = output_dir / "hazardnet_forecasts_latest.csv"

    # 1) Preferred: the notebook kernel's own output files.
    print(f"\n📥 Downloading notebook output: kaggle kernels output {NOTEBOOK_PATH}")
    notebook_dir = output_dir / "notebook_output"
    if notebook_dir.exists():
        import shutil
        shutil.rmtree(notebook_dir)
    notebook_dir.mkdir(parents=True, exist_ok=True)

    kernel_ok = os.system(f"kaggle kernels output {NOTEBOOK_PATH} -p {notebook_dir}") == 0
    source_csv = _pick_csv(notebook_dir, csv_file.name) if kernel_ok else None
    if source_csv is not None:
        source_csv.replace(csv_file)
        print(f"✅ Downloaded notebook output CSV: {csv_file} ({csv_file.stat().st_size:,} bytes)")
    else:
        # 2) Fallback: the daily Kaggle dataset snapshot.
        print("ℹ️ Notebook output unavailable — falling back to the daily dataset")
        print(f"📥 Downloading daily dataset: {DATASET_PATH}")
        dataset_dir = output_dir / "kaggle_dataset"
        dataset_dir.mkdir(parents=True, exist_ok=True)

        dataset_cmd = f"kaggle datasets download -d {DATASET_PATH} -p {dataset_dir} --unzip --force"
        if os.system(dataset_cmd) != 0:
            print("❌ Failed to download the daily Kaggle dataset")
            return False

        source_csv = _pick_csv(dataset_dir, csv_file.name)
        if source_csv is None:
            print("❌ Daily Kaggle dataset did not contain a CSV")
            return False
        source_csv.replace(csv_file)
        print(f"✅ Downloaded dataset CSV: {csv_file} ({csv_file.stat().st_size:,} bytes)")

    # Keep the notebook JSON artifact when available for validation and archives.
    json_candidates = list(notebook_dir.rglob("*.json"))
    if json_candidates:
        json_candidates[0].replace(output_dir / "hazardnet_forecasts_latest.json")
    else:
        print("ℹ️ Notebook JSON output unavailable; CSV remains authoritative")
    return True

def main():
    print("=" * 60)
    print("HazardNet Kaggle Forecast Pipeline")
    print("=" * 60)
    
    # Validate environment
    if not KAGGLE_USERNAME or not KAGGLE_KEY:
        print("❌ KAGGLE_USERNAME and KAGGLE_KEY must be set")
        sys.exit(1)
    
    # Step 1: Trigger notebook
    if not trigger_notebook():
        sys.exit(1)
    
    # Step 2: Poll for completion
    if not poll_notebook_status():
        sys.exit(1)
    
    # Step 3: Download outputs
    if not download_outputs():
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ Pipeline completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()
