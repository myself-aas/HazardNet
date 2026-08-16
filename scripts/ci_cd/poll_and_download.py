# scripts/ci_cd/poll_and_download.py
import os
import sys
import time
import subprocess

NOTEBOOK_SLUG = os.environ.get("KAGGLE_NOTEBOOK_SLUG", "ashifahmedshuvo/hazardnet-weekly-forecast")
MAX_ATTEMPTS = int(os.environ.get("MAX_POLL_ATTEMPTS", "120"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
OUTPUT_FILE = "hazardnet_forecasts_latest.csv"

def main():
    print(f"⏳ Polling Kaggle for {NOTEBOOK_SLUG}...")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        result = subprocess.run(["kaggle", "kernels", "status", NOTEBOOK_SLUG], capture_output=True, text=True)
        status = result.stdout.lower()
        
        if "complete" in status or "success" in status:
            print("✅ Notebook completed. Downloading output...")
            subprocess.run(["kaggle", "kernels", "output", NOTEBOOK_SLUG, "-p", "."])
            if os.path.exists(OUTPUT_FILE):
                print(f"✅ Downloaded {OUTPUT_FILE}")
                return
            else:
                print("❌ Output file not found in Kaggle directory.")
                sys.exit(1)
        elif "error" in status or "fail" in status:
            print("❌ Notebook failed.")
            sys.exit(1)
            
        print(f"  [{attempt}/{MAX_ATTEMPTS}] Status: running/queued. Waiting {POLL_INTERVAL}s...")
        time.sleep(POLL_INTERVAL)
        
    print("❌ Timeout waiting for Kaggle.")
    sys.exit(1)

if __name__ == "__main__":
    main()
