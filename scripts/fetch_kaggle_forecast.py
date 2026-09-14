#!/usr/bin/env python3
"""Fetch latest output CSV from Kaggle notebook, validate, regenerate JSON, and manage manifest provenance.
"""

import argparse
import csv
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
}


def compute_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def parse_value(val):
    if val is None or val == '':
        return None
    try:
        if '.' in str(val) or 'e' in str(val).lower():
            return float(val)
        return int(val)
    except ValueError:
        return str(val)


def convert_csv_to_json_records(csv_path):
    records = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed_row = {}
            for k, v in row.items():
                if k in ('district_id', 'location_id'):
                    parsed_row[k] = int(v) if v else 0
                elif k in ('model_severity', 'physics_severity', 'severity_score', 'confidence') or k.startswith('om_'):
                    try:
                        parsed_row[k] = float(v)
                    except (ValueError, TypeError):
                        parsed_row[k] = 0.0
                else:
                    parsed_row[k] = v
            records.append(parsed_row)
    return records


def sanity_check(csv_path):
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        rows = list(reader)

    if not rows:
        return False, "CSV contains zero rows"

    has_severity = ('model_severity' in fieldnames or 'severity_score' in fieldnames)
    if not has_severity:
        return False, "Missing severity column"

    has_district_or_loc = ('district_id' in fieldnames or 'location_id' in fieldnames)
    if not has_district_or_loc:
        return False, "Missing location/district identifier"

    for i, row in enumerate(rows):
        hazard = row.get('hazard_type', '').strip()
        if hazard not in VALID_HAZARDS:
            return False, f"Row {i + 1} has invalid hazard_type: '{hazard}'"

    return True, f"sanity check passed ({len(rows)} rows)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', default='data/kaggle_notebook_output')
    parser.add_argument('--csv-out', default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--json-out', default='backend/data/forecasts/hazardnet_forecasts_latest.json')
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json')
    parser.add_argument('--kernel', default='ashifahmedshuvo/hazardnet-auto-forecast-pipeline')
    parser.add_argument('--attempts', type=int, default=3)
    parser.add_argument('--retry-delay', type=int, default=30)
    args = parser.parse_args()

    dest_dir = Path(args.dest)
    dest_dir.mkdir(parents=True, exist_ok=True)

    csv_out = Path(args.csv_out)
    json_out = Path(args.json_out)
    manifest_out = Path(args.manifest)

    csv_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)

    # Download from kaggle
    cmd = ["kaggle", "kernels", "output", args.kernel, "-p", str(dest_dir)]
    download_success = False
    last_err = ""

    for attempt in range(1, args.attempts + 1):
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            download_success = True
            break
        last_err = res.stderr or res.stdout
        print(f"Download attempt {attempt}/{args.attempts} failed: {last_err}")
        if attempt < args.attempts:
            time.sleep(args.retry_delay)

    if not download_success:
        print(f"❌ Failed to download kernel output from {args.kernel}: {last_err}")
        sys.exit(1)

    # Locate downloaded CSV
    downloaded_csv = dest_dir / 'hazardnet_forecasts_latest.csv'
    if not downloaded_csv.exists():
        csv_files = list(dest_dir.glob('*.csv'))
        if csv_files:
            downloaded_csv = csv_files[0]
        else:
            print(f"❌ No CSV file found in download directory: {dest_dir}")
            sys.exit(1)

    # Perform sanity check on downloaded CSV
    is_valid, msg = sanity_check(downloaded_csv)
    if not is_valid:
        print(f"sanity check failed: {msg}")
        sys.exit(1)

    print(msg)

    # Compute SHA256 of newly downloaded CSV
    new_sha = compute_sha256(downloaded_csv)

    # Check if target CSV already exists and has matching SHA
    old_sha = None
    if csv_out.exists():
        old_sha = compute_sha256(csv_out)

    changed = (old_sha != new_sha)

    # Read records & prediction_date
    records = convert_csv_to_json_records(downloaded_csv)
    prediction_date = records[0].get('prediction_date', 'unknown') if records else 'unknown'

    # Always update destination files if changed or if missing
    if changed or not csv_out.exists() or not json_out.exists() or not manifest_out.exists():
        shutil.copy(downloaded_csv, csv_out)
        json_out.write_text(json.dumps(records, indent=2), encoding='utf-8')
        print(f"regenerated {json_out} from CSV")

        manifest_data = {
            "prediction_date": prediction_date,
            "row_count": len(records),
            "csv_sha256": new_sha,
            "kernel": args.kernel
        }
        manifest_out.write_text(json.dumps(manifest_data, indent=2), encoding='utf-8')
        print(f"CHANGED=true")
    else:
        print(f"CHANGED=false")

    sys.exit(0)


if __name__ == '__main__':
    main()
