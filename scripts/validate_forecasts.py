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
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json',
                        help='Pipeline manifest carrying the coverage tally')
    parser.add_argument('--skip-coverage', action='store_true',
                        help='Skip the coverage/run-report gate (legacy Kaggle CSVs have no report)')
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

    # ── Coverage gate (audit 2026-09-17) ────────────────────────────────────
    # The shipped pipeline silently skipped districts whose Earth Engine fetch
    # failed, so a 25/64-district run looked identical to a complete one. A run
    # may now be partial, but only when its coverage is *accounted for*: the
    # manifest must carry the tally, and the tally must match the rows.
    if not args.skip_coverage:
        manifest_path = Path(args.manifest)
        if not manifest_path.exists():
            print(f"❌ Missing manifest: {manifest_path}")
            print("   Without it the coverage of this run is unaccounted for "
                  "(see scripts/publish_forecast_csv.py).")
            sys.exit(1)
        try:
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            print(f"❌ Manifest is not valid JSON: {exc}")
            sys.exit(1)

        coverage = manifest.get('coverage') or {}
        requested = coverage.get('requested_units')
        produced = coverage.get('produced_units')
        if not requested or produced is None:
            print("❌ Manifest has no coverage tally (requested_units/produced_units).")
            print("   Partial runs must be labelled, not silent — re-run the generator "
                  "so it writes a run report, then republish.")
            sys.exit(1)
        if produced != len(rows):
            print(f"❌ Coverage mismatch: manifest says {produced} units, CSV has {len(rows)} rows.")
            sys.exit(1)
        if not manifest.get('model_version') and not manifest.get('model_sha256'):
            print("❌ Manifest carries no model provenance (model_version/model_sha256).")
            sys.exit(1)
        # A run report (straight from the generator) carries `coverage.status`;
        # the published manifest carries it hoisted to `coverage_status`. Accept
        # either so the same gate works on both artifacts.
        status = manifest.get('coverage_status') or coverage.get('status')
        if status != 'complete':
            print(f"⚠️ Partial run: {produced}/{requested} requested units "
                  f"({coverage.get('districts_with_any_horizon')} districts). "
                  "The site must label districts with no current forecast as baseline.")
        else:
            print(f"✅ Complete run: {produced}/{requested} units.")
        if manifest.get('soil_channels_fabricated'):
            print("⚠️ Soil channels are training-mean placeholders "
                  "(soil_channels_fabricated=true) — see docs/MODEL_CARD.md §6.3.")

    print("✅ Forecast validation passed successfully!")
    sys.exit(0)


if __name__ == '__main__':
    main()
