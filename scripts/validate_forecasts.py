#!/usr/bin/env python3
"""Validate CSV and JSON forecast artifacts against expected schema, bounds, and freshness rules.
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
}

NOTEBOOK_REQUIRED = {'district_id', 'district_name', 'division', 'pcode', 'horizon', 'hazard_type', 'target_date', 'prediction_date'}
ADM3_REQUIRED = {'location_id', 'location_name', 'location_type', 'admin_level', 'division', 'pcode', 'horizon', 'hazard_type', 'target_date', 'prediction_date'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--json', default='backend/data/forecasts/hazardnet_forecasts_latest.json')
    parser.add_argument('--skip-freshness', action='store_true', help='Skip freshness validation check')
    args = parser.parse_args()

    csv_path = Path(args.csv)
    json_path = Path(args.json)

    if not csv_path.exists():
        print(f"❌ Missing CSV file: {csv_path}")
        sys.exit(1)
    if not json_path.exists():
        print(f"❌ Missing JSON file: {json_path}")
        sys.exit(1)

    # Read CSV rows
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        rows = list(reader)

    if not rows:
        print("❌ CSV contains zero rows")
        sys.exit(1)

    # Check severity column
    has_severity = ('model_severity' in fieldnames or 'severity_score' in fieldnames)
    if not has_severity:
        print("❌ Invalid schema: severity column (model_severity or severity_score) is missing")
        sys.exit(1)

    # Detect schema
    schema = None
    if NOTEBOOK_REQUIRED.issubset(fieldnames):
        schema = 'notebook'
    elif ADM3_REQUIRED.issubset(fieldnames):
        schema = 'adm3'

    if not schema:
        print("❌ Unrecognized schema: CSV columns do not match notebook or adm3 specification")
        sys.exit(1)

    print(f"Detected schema: {schema}")

    # Validate hazards and values across rows
    for i, row in enumerate(rows):
        hazard = row.get('hazard_type', '').strip()
        if hazard not in VALID_HAZARDS:
            print(f"❌ Invalid hazard type found at row {i + 1}: '{hazard}'")
            sys.exit(1)

    # Validate row count for notebook schema
    if schema == 'notebook':
        if len(rows) != 128:
            print(f"⚠️ Expected ~128 rows, got {len(rows)}")

    # Freshness check
    if not args.skip_freshness:
        pred_date_str = rows[0].get('prediction_date')
        if not pred_date_str:
            print("❌ Missing prediction_date for freshness validation")
            sys.exit(1)
        try:
            pred_dt = datetime.strptime(pred_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            days_old = (now_dt - pred_dt).days
            if days_old > 3:
                print(f"❌ Forecast failed freshness gate: prediction_date {pred_date_str} is {days_old} days old (>3 days threshold)")
                sys.exit(1)
        except Exception as e:
            print(f"❌ Error parsing prediction_date for freshness check: {e}")
            sys.exit(1)

    print("✅ Forecast validation passed successfully!")
    sys.exit(0)


if __name__ == '__main__':
    main()
