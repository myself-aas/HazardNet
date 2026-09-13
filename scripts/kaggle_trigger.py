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

def download_outputs():
    """Download CSV and JSON outputs from Kaggle."""
    print("\n📥 Downloading outputs...")
    
    output_dir = Path("./backend/data/forecasts")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Download files
    cmd = f"kaggle kernels output {NOTEBOOK_PATH} -p {output_dir}"
    result = os.system(cmd)
    
    if result != 0:
        print("❌ Failed to download outputs")
        return False
    
    # Verify files exist
    csv_file = output_dir / "hazardnet_forecasts_latest.csv"
    json_file = output_dir / "hazardnet_forecasts_latest.json"
    
    if csv_file.exists() and json_file.exists():
        csv_size = csv_file.stat().st_size
        json_size = json_file.stat().st_size
        print(f"✅ Downloaded: {csv_file} ({csv_size:,} bytes)")
        print(f"✅ Downloaded: {json_file} ({json_size:,} bytes)")
        return True
    else:
        print("❌ Output files not found")
        if csv_file.exists():
            print(f"   Found: {csv_file}")
        if json_file.exists():
            print(f"   Found: {json_file}")
        return False

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
