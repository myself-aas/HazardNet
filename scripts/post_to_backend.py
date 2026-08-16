#!/usr/bin/env python3
"""
POSTs the forecast CSV to the HazardNet Node.js backend API.
Includes retry logic and response validation.
"""
import os
import sys
import time
import requests
import json

BACKEND_URL = os.environ.get("BACKEND_API_URL", "http://localhost:3001")
API_KEY = os.environ.get("BACKEND_API_KEY", "")
ENDPOINT = os.environ.get("BACKEND_ENDPOINT", "/api/v1/forecasts/update")
CSV_FILE = "hazardnet_forecasts_latest.csv"
MAX_RETRIES = 3
RETRY_DELAY = 10  # seconds


def post_csv():
    """Uploads the CSV file to the backend API."""
    url = f"{BACKEND_URL}{ENDPOINT}"
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
    }
    
    if not os.path.exists(CSV_FILE):
        print(f"File not found: {CSV_FILE}")
        sys.exit(1)
    
    file_size = os.path.getsize(CSV_FILE)
    print(f"POSTing {CSV_FILE} ({file_size:,} bytes) to {url}")
    
    with open(CSV_FILE, "rb") as f:
        files = {"file": (CSV_FILE, f, "text/csv")}
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                print(f"  Attempt {attempt}/{MAX_RETRIES}...")
                response = requests.post(
                    url,
                    headers=headers,
                    files=files,
                    timeout=60
                )
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"\nSUCCESS (HTTP 200)")
                    print(f"   Records updated: {data.get('records_updated', 'N/A')}")
                    print(f"   Message: {data.get('message', 'N/A')}")
                    return True
                
                elif response.status_code == 401:
                    print(f"\nAUTHENTICATION FAILED (HTTP 401)")
                    print(f"   Check BACKEND_API_KEY secret")
                    return False
                
                elif response.status_code == 422:
                    print(f"\nVALIDATION ERROR (HTTP 422)")
                    print(f"   Response: {response.text}")
                    return False
                
                else:
                    print(f"  Unexpected status: HTTP {response.status_code}")
                    print(f"  Response: {response.text[:200]}")
                    
            except requests.exceptions.ConnectionError as e:
                print(f"  Connection error: {e}")
            except requests.exceptions.Timeout:
                print(f"  Request timed out")
            except Exception as e:
                print(f"  Error: {e}")
            
            if attempt < MAX_RETRIES:
                print(f"  Retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
                f.seek(0)  # Reset file pointer for retry
    
    print(f"\nFAILED after {MAX_RETRIES} attempts")
    return False


def verify_update():
    """Verifies the backend has the latest data."""
    url = f"{BACKEND_URL}/api/v1/forecasts?district_id=1&horizon=7_days"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            print(f"\nVerification (Dhaka, 7-day):")
            print(f"   Hazard: {data.get('hazard_type', 'N/A')}")
            print(f"   Severity: {data.get('severity_score', 'N/A')}")
            print(f"   Confidence: {data.get('confidence', 'N/A')}")
            print(f"   Target Date: {data.get('target_date', 'N/A')}")
            return True
        else:
            print(f"\nVerification returned HTTP {resp.status_code}")
            return False
    except Exception as e:
        print(f"\nVerification failed: {e}")
        return False


def main():
    print("=" * 60)
    print("HAZARDNET FORECAST DEPLOYMENT")
    print("=" * 60)
    
    if not API_KEY:
        print("BACKEND_API_KEY not set")
        sys.exit(1)
    
    success = post_csv()
    
    if success:
        time.sleep(2)  # Let DB commit
        verify_update()
        print("\n" + "=" * 60)
        print("DEPLOYMENT COMPLETE")
        print("=" * 60)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()