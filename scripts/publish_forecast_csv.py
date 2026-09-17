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
    python scripts/publish_forecast_csv.py --csv hazardnet_forecasts_latest.csv \
        --run-report hazardnet_run_report.json

The run report is what makes a partial run publishable-but-labelled: it carries
the coverage tally from the generator, and its coverage/horizons/soil flags are
copied into manifest.json so the website and the API can state how complete (and
how synthetic) the data they are serving is. Publishing a CSV whose coverage
cannot be accounted for is refused — that is the "partial runs must not ship
silently" rule from the 2026-09-17 audit.

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
    parser.add_argument('--run-report', default='hazardnet_run_report.json',
                        help='Run report emitted by scripts/auto_forecast.py '
                             '(coverage + provenance). Missing report = refuse to publish.')
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

    # ── coverage + provenance gate (audit 2026-09-17) ──────────────────────
    # Validated BEFORE anything is written, so a refused publish leaves the
    # previous artifacts in place instead of half-replacing them. The shipped
    # pipeline skipped failed districts silently, which made a 25-of-64-district
    # run indistinguishable from a complete one; a partial run may still be
    # published, but only with the tally that says it is partial.
    records = convert_csv_to_json_records(src)
    prediction_dates = [r.get('prediction_date') for r in records if r.get('prediction_date')]

    report_path = Path(args.run_report)
    if not report_path.exists():
        print(f"❌ Run report not found: {report_path}")
        print("   scripts/auto_forecast.py writes one next to the CSV; without it the "
              "coverage of this run cannot be accounted for, and a partial run must not "
              "be published without a tally. Re-run the generator, or pass "
              "--run-report <path>.")
        sys.exit(1)
    try:
        report = json.loads(report_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        print(f"❌ Run report is not valid JSON ({exc}); refusing to publish.")
        sys.exit(1)

    coverage = report.get('coverage') or {}
    if not coverage.get('requested_units'):
        print("❌ Run report has no coverage tally; refusing to publish an unaccounted run.")
        sys.exit(1)

    produced = coverage.get('produced_units', 0)
    requested = coverage['requested_units']
    if len(records) != produced:
        print(f"❌ CSV/report mismatch: report says {produced} units produced, "
              f"CSV has {len(records)} rows. Refusing to publish.")
        sys.exit(1)

    csv_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(src, csv_out)
    json_out.write_text(json.dumps(records, indent=2), encoding='utf-8')

    produced = coverage.get('produced_units', 0)
    requested = coverage['requested_units']
    if len(records) != produced:
        print(f"❌ CSV/report mismatch: report says {produced} units produced, "
              f"CSV has {len(records)} rows. Refusing to publish.")
        sys.exit(1)

    manifest = {
        'source': args.source,
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'prediction_date': max(prediction_dates) if prediction_dates else None,
        'row_count': len(records),
        'csv_sha256': new_sha,
        'csv_path': str(csv_out),
        'json_path': str(json_out),
        # Provenance: which model/tensor/pipeline produced these rows.
        'run_id': report.get('run_id'),
        'pipeline_version': report.get('pipeline_version'),
        'model_version': report.get('model_version'),
        'model_sha256': report.get('model_sha256'),
        # Coverage: how complete this run is (never assume 64 x 2).
        'coverage_status': report.get('status'),
        'coverage': {
            'requested_units': requested,
            'produced_units': produced,
            'districts_with_any_horizon': coverage.get('districts_with_any_horizon'),
            'missing_district_ids': coverage.get('missing_district_ids', []),
            'horizons': coverage.get('horizons') or coverage.get('requested_horizons'),
            'per_horizon': coverage.get('per_horizon'),
            'skipped': coverage.get('skipped', []),
        },
        # Input integrity: the three soil channels are training-mean placeholders.
        'soil_channels_fabricated': report.get('soil_channels_fabricated'),
        'soil_mode': report.get('soil_mode'),
    }
    manifest_out.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    print(f"   wrote {csv_out}")
    print(f"   wrote {json_out} ({len(records)} records)")
    print(f"   wrote {manifest_out}")
    print(f"CHANGED={'false' if unchanged else 'true'}")
    print(f"   prediction_date={manifest['prediction_date']} rows={manifest['row_count']}")
    print(f"   coverage={produced}/{requested} units ({manifest['coverage_status']}), "
          f"districts={coverage.get('districts_with_any_horizon')}")
    print(f"   model_version={manifest.get('model_version')} run_id={manifest.get('run_id')}")
    if manifest['coverage_status'] != 'complete':
        print("::warning::partial run published — the manifest records the coverage tally, "
              "and the site must label districts that have no current forecast.")


if __name__ == '__main__':
    main()
