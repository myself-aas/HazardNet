#!/usr/bin/env python3
"""Promote a locally generated forecast CSV into the repository's data paths.

This is the **Kaggle-free** half of the data pipeline: `scripts/auto_forecast.py`
runs on a GitHub runner (GEE + Open-Meteo + TFLite), writes
`hazardnet_forecasts_latest.csv` in the working directory, and this script turns
that file into the committed artifacts the rest of the system reads:

    backend/data/forecasts/hazardnet_forecasts_latest.csv   (ingest input)
    backend/data/forecasts/hazardnet_forecasts_latest.json  (JSON sidecar)
    backend/data/forecasts/manifest.json                    (provenance)

It replaces the former Kaggle path (`kaggle kernels output` +
`scripts/fetch_kaggle_forecast.py`, removed 2026-09-17 along with the four
Kaggle-backed workflows), which needed a Kaggle token, a live kernel and a
network download.

Nothing here talks to the network and nothing is pushed: the caller decides what
to do with `CHANGED=true` (commit, rebuild the snapshot, ingest into a store).

Usage:
    python scripts/publish_forecast_csv.py --csv hazardnet_forecasts_latest.csv

Exit codes: 0 = artifacts written (or already current), 1 = invalid input.
"""

import argparse
import csv
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── CSV sanity/validation helpers ────────────────────────────────────────────
# These lived in scripts/fetch_kaggle_forecast.py and were shared with the
# legacy Kaggle path; they moved here (verbatim) when the Kaggle workflows were
# removed on 2026-09-17 — the runner-generated pipeline is now the only producer.

VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
}

# Canonical meteorological columns — mirrors backend/utils/forecastRow.js
# METEOROLOGICAL_FIELDS. They must be NUMBERS in the JSON sidecar: the ingest
# path drops non-numeric values, and the committed sidecar is the auditable
# record of what the generator actually produced. (Found 2026-09-16: these
# arrived as strings "27.5" from every producer, because the converter's numeric
# allowlist only covered the severity/confidence columns and the legacy om_*.)
METEOROLOGICAL_FIELDS = (
    'temperature_mean', 'temperature_max', 'temperature_min',
    'precipitation_mm', 'wind_max_kmh', 'dewpoint_mean',
    'solar_radiation_mj_m2', 'evapotranspiration_mm',
)

NUMERIC_FIELDS = (
    'model_severity', 'physics_severity', 'severity_score', 'confidence',
    'severity', 'latitude', 'longitude',
    *METEOROLOGICAL_FIELDS,
)


def compute_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def convert_csv_to_json_records(csv_path):
    records = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed_row = {}
            for k, v in row.items():
                if k in ('district_id', 'location_id'):
                    parsed_row[k] = int(v) if v else 0
                elif k in NUMERIC_FIELDS or k.startswith('om_'):
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
    parser.add_argument('--csv', default='hazardnet_forecasts_latest.csv',
                        help='CSV produced by scripts/auto_forecast.py')
    parser.add_argument('--csv-out', default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--json-out', default='backend/data/forecasts/hazardnet_forecasts_latest.json')
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json')
    parser.add_argument('--source', default='github-actions: scripts/auto_forecast.py (GEE + Open-Meteo + TFLite)',
                        help='Provenance stamped into manifest.json')
    parser.add_argument('--force', action='store_true',
                        help='Rewrite the artifacts even when the CSV hash is unchanged')
    args = parser.parse_args()

    src = Path(args.csv)
    csv_out = Path(args.csv_out)
    json_out = Path(args.json_out)
    manifest_out = Path(args.manifest)

    if not src.exists():
        print(f"❌ Forecast CSV not found: {src}")
        print("   Run `python scripts/auto_forecast.py` first (it writes the CSV to the CWD).")
        sys.exit(1)

    is_valid, msg = sanity_check(src)
    if not is_valid:
        print(f"❌ sanity check failed: {msg}")
        sys.exit(1)
    print(f"✅ {msg}")

    new_sha = compute_sha256(src)
    old_sha = None
    if manifest_out.exists():
        try:
            old_sha = json.loads(manifest_out.read_text(encoding='utf-8')).get('csv_sha256')
        except (json.JSONDecodeError, OSError):
            old_sha = None

    unchanged = (old_sha == new_sha)
    if unchanged and not args.force and csv_out.exists() and json_out.exists():
        print('CHANGED=false')
        print(f"   CSV unchanged since the last publish (sha256 {new_sha[:12]}…) — keeping existing artifacts.")
        return

    csv_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)

    records = convert_csv_to_json_records(src)
    shutil.copyfile(src, csv_out)
    json_out.write_text(json.dumps(records, indent=2), encoding='utf-8')

    prediction_dates = [r.get('prediction_date') for r in records if r.get('prediction_date')]
    manifest = {
        'source': args.source,
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'prediction_date': max(prediction_dates) if prediction_dates else None,
        'row_count': len(records),
        'csv_sha256': new_sha,
        'csv_path': str(csv_out),
        'json_path': str(json_out),
    }
    manifest_out.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    print(f"   wrote {csv_out}")
    print(f"   wrote {json_out} ({len(records)} records)")
    print(f"   wrote {manifest_out}")
    print(f"CHANGED={'false' if unchanged else 'true'}")
    print(f"   prediction_date={manifest['prediction_date']} rows={manifest['row_count']}")


if __name__ == '__main__':
    main()
