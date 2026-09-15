#!/usr/bin/env python3
"""Promote a locally generated forecast CSV into the repository's data paths.

This is the **Kaggle-free** half of the data pipeline: `scripts/auto_forecast.py`
runs on a GitHub runner (GEE + Open-Meteo + TFLite), writes
`hazardnet_forecasts_latest.csv` in the working directory, and this script turns
that file into the committed artifacts the rest of the system reads:

    backend/data/forecasts/hazardnet_forecasts_latest.csv   (ingest input)
    backend/data/forecasts/hazardnet_forecasts_latest.json  (JSON sidecar)
    backend/data/forecasts/manifest.json                    (provenance)

It replaces the Kaggle path (`kaggle kernels output` +
`scripts/fetch_kaggle_forecast.py`), which needed a Kaggle token, a live kernel
and a network download. The validation helpers are shared with that script so
both paths apply the same schema/hazard sanity check.

Nothing here talks to the network and nothing is pushed: the caller decides what
to do with `CHANGED=true` (commit, rebuild the snapshot, ingest into a store).

Usage:
    python scripts/publish_forecast_csv.py --csv hazardnet_forecasts_latest.csv

Exit codes: 0 = artifacts written (or already current), 1 = invalid input.
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

# Shared with the (legacy) Kaggle fetcher — one implementation of the sanity
# check, so the two data paths cannot drift apart.
from fetch_kaggle_forecast import (  # noqa: E402
    compute_sha256,
    convert_csv_to_json_records,
    sanity_check,
)


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
