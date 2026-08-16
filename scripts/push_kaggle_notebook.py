#!/usr/bin/env python3
"""
Pushes the HazardNet auto-forecast pipeline notebook to Kaggle and triggers execution.
"""
import os
import sys
import subprocess
import time

NOTEBOOK_SLUG = os.environ.get(
    "KAGGLE_NOTEBOOK_SLUG", 
    "ashifahmedshuvo/hazardnet-auto-forecast-pipeline"
)

def main():
    print("=" * 60)
    print("PUSHING NOTEBOOK TO KAGGLE")
    print("=" * 60)
    
    notebook_dir = "kaggle_notebooks/hazardnet-auto-forecast-pipeline"
    
    # Push the notebook (this also triggers a run if 'enable_gpu' or schedule is set)
    result = subprocess.run(
        ["kaggle", "kernels", "push", "-p", notebook_dir],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        print(f"Push failed: {result.stderr}")
        sys.exit(1)
    
    print(f"Notebook pushed: {NOTEBOOK_SLUG}")
    print(result.stdout)
    
    # Wait 10 seconds for Kaggle to register the run
    time.sleep(10)
    
    # Check initial status
    status_result = subprocess.run(
        ["kaggle", "kernels", "status", NOTEBOOK_SLUG],
        capture_output=True, text=True
    )
    print(f"Initial Status:\n{status_result.stdout}")

if __name__ == "__main__":
    main()