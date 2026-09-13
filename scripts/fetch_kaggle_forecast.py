#!/usr/bin/env python3
"""
Fetch the latest forecast CSV from the Kaggle notebook's output.

This is the data source step of the *hourly* refresh pipeline
(.github/workflows/hourly_forecast.yml). It downloads the latest run's output
of the forecast notebook with:

    kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline -p <dest>

which yields the notebook's `/kaggle/working/hazardnet_forecasts_latest.csv`
(and any sibling JSON artifact), without re-executing the notebook. The
notebook keeps running on its own Kaggle schedule; this script simply
retrieves whatever its most recent run produced, so the website picks up a
new forecast within one hour of every notebook completion.

Behaviour:
  * Retries the Kaggle CLI (transient network/API failures are common).
  * Prefers `hazardnet_forecasts_latest.csv` among the downloaded files.
  * Performs a lightweight ingest-contract sanity check on the CSV
    (the workflow runs the full scripts/validate_forecasts.py afterwards).
  * Regenerates the JSON artifact from the CSV when the notebook did not
    emit one, so downstream validation/archiving always has both shapes.
  * Writes backend/data/forecasts/manifest.json with fetch provenance and a
    content sha256, and prints CHANGED=true|false comparing against the
    previously committed manifest (the workflow skips commit/ingest when the
    data has not changed, avoiding no-op hourly commits).

Exit codes: 0 = fetched OK (regardless of CHANGED), 1 = fatal failure.
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
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_KERNEL = 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline'
PREFERRED_CSV = 'hazardnet_forecasts_latest.csv'
VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
}
VALID_HORIZONS = {'7_days', '15_days'}
REQUIRED_NOTEBOOK_COLUMNS = {
    'district_id', 'district_name', 'horizon', 'hazard_type',
    'confidence', 'target_date', 'prediction_date',
}


def log(msg: str) -> None:
    print(msg, flush=True)


def run_kaggle_output(kernel: str, dest: Path, attempts: int, delay: int) -> bool:
    """Download the notebook's latest-run outputs with retries."""
    dest.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, attempts + 1):
        cmd = ['kaggle', 'kernels', 'output', kernel, '-p', str(dest)]
        log(f"📥 [{attempt}/{attempts}] $ {' '.join(cmd)}")
        proc = subprocess.run(cmd, capture_output=True, text=True)
        output = (proc.stdout or '') + (proc.stderr or '')
        if output.strip():
            log(output.strip())
        if proc.returncode == 0 and any(dest.iterdir()):
            return True
        # "Kernel has no output" is deterministic — retrying cannot help.
        if 'no output' in output.lower():
            log('❌ The notebook has no published output yet (has it ever run?).')
            return False
        if attempt < attempts:
            log(f"   Retrying in {delay}s...")
            time.sleep(delay)
    return False


def find_artifacts(dest: Path):
    """Locate the forecast CSV (preferred name first) and any JSON artifact."""
    csvs = sorted(dest.rglob('*.csv'))
    preferred = [p for p in csvs if p.name == PREFERRED_CSV]
    csv_file = preferred[0] if preferred else (csvs[0] if csvs else None)
    jsons = sorted(dest.rglob('*.json'))
    json_file = jsons[0] if jsons else None
    return csv_file, json_file


def sanity_check_csv(csv_path: Path):
    """Ingest-contract sanity check (backend/utils/forecastRow.js parity)."""
    with open(csv_path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_NOTEBOOK_COLUMNS - columns
        if missing:
            raise ValueError(f'CSV is missing required columns: {sorted(missing)}')
        if 'severity_score' not in columns and 'model_severity' not in columns:
            raise ValueError('CSV has neither severity_score nor model_severity')

        rows = 0
        for row in reader:
            rows += 1
            if row.get('hazard_type') not in VALID_HAZARDS:
                raise ValueError(f"Row {rows}: invalid hazard_type {row.get('hazard_type')!r}")
            if row.get('horizon') not in VALID_HORIZONS:
                raise ValueError(f"Row {rows}: invalid horizon {row.get('horizon')!r}")
            severity_raw = row.get('severity_score') or row.get('model_severity')
            try:
                severity = float(severity_raw)
                confidence = float(row.get('confidence'))
            except (TypeError, ValueError):
                raise ValueError(f'Row {rows}: non-numeric severity/confidence') from None
            if not (0.0 <= severity <= 1.0) or not (0.0 <= confidence <= 1.0):
                raise ValueError(f'Row {rows}: severity/confidence outside [0, 1]')
    if rows == 0:
        raise ValueError('CSV contains no data rows')
    return rows


def csv_to_json(csv_path: Path, json_path: Path) -> int:
    """Regenerate the JSON artifact (array of row objects) from the CSV."""
    with open(csv_path, newline='', encoding='utf-8') as fh:
        records = list(csv.DictReader(fh))
    json_path.write_text(json.dumps(records, indent=2), encoding='utf-8')
    return len(records)


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_manifest(manifest_path: Path):
    try:
        return json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', default='data/kaggle_notebook_output',
                        help='Download directory for the Kaggle notebook output')
    parser.add_argument('--csv-out', default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--json-out', default='backend/data/forecasts/hazardnet_forecasts_latest.json')
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json')
    parser.add_argument('--kernel', default=os.environ.get('KAGGLE_KERNEL', DEFAULT_KERNEL))
    parser.add_argument('--attempts', type=int, default=3)
    parser.add_argument('--retry-delay', type=int, default=30)
    parser.add_argument('--max-age-hours', type=float, default=72.0,
                        help='Warn (not fail) when prediction_date is older than this')
    args = parser.parse_args()

    dest = Path(args.dest)
    csv_out = Path(args.csv_out)
    json_out = Path(args.json_out)
    manifest_path = Path(args.manifest)

    # Start from a clean download directory so stale files from previous runs
    # of the workflow can never masquerade as fresh notebook output.
    if dest.exists():
        shutil.rmtree(dest)

    if not run_kaggle_output(args.kernel, dest, args.attempts, args.retry_delay):
        log('❌ Failed to download the Kaggle notebook output.')
        sys.exit(1)

    csv_file, json_file = find_artifacts(dest)
    if csv_file is None:
        log('❌ Notebook output contained no CSV file. Found:')
        for p in sorted(dest.rglob('*')):
            if p.is_file():
                log(f'   - {p.relative_to(dest)}')
        sys.exit(1)
    log(f"✅ Notebook output CSV: {csv_file.relative_to(dest)} ({csv_file.stat().st_size:,} bytes)")

    try:
        row_count = sanity_check_csv(csv_file)
    except ValueError as exc:
        log(f'❌ CSV sanity check failed: {exc}')
        sys.exit(1)
    log(f'✅ CSV sanity check passed ({row_count} rows)')

    csv_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(csv_file, csv_out)

    if json_file is not None:
        shutil.copyfile(json_file, json_out)
        log(f"✅ Notebook JSON artifact: {json_file.relative_to(dest)}")
    else:
        n = csv_to_json(csv_out, json_out)
        log(f'ℹ️ No notebook JSON artifact — regenerated {json_out} from the CSV ({n} records)')

    # Provenance manifest: powers change detection + the freshness badge.
    with open(csv_out, newline='', encoding='utf-8') as fh:
        prediction_dates = {r.get('prediction_date') for r in csv.DictReader(fh)}
    prediction_date = max(prediction_dates) if prediction_dates else None
    digest = sha256_of(csv_out)
    previous = read_manifest(manifest_path)
    changed = not previous or previous.get('csv_sha256') != digest

    if prediction_date:
        try:
            age_hours = (datetime.now(timezone.utc)
                         - datetime.fromisoformat(prediction_date).replace(tzinfo=timezone.utc)
                         ).total_seconds() / 3600
            if age_hours > args.max_age_hours:
                log(f"⚠️ ::warning::prediction_date {prediction_date} is {age_hours:.0f}h old "
                    f"(threshold {args.max_age_hours:.0f}h) — the Kaggle notebook schedule may be stalled.")
        except ValueError:
            pass

    manifest = {
        'source': f'kaggle kernels output {args.kernel}',
        'kernel': args.kernel,
        'fetched_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'prediction_date': prediction_date,
        'row_count': row_count,
        'csv_sha256': digest,
        'csv_path': str(csv_out),
        'json_path': str(json_out),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    log(f"📝 Manifest written to {manifest_path}")

    log(f"CHANGED={'true' if changed else 'false'}")
    if not changed:
        log('ℹ️ Notebook output unchanged since the last committed manifest — '
            'the workflow will skip ingestion and committing.')


if __name__ == '__main__':
    main()
