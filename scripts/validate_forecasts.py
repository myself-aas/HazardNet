#!/usr/bin/env python3
"""Validate CSV and JSON forecast artifacts against expected schema, bounds, and freshness rules.
"""

import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
}

NOTEBOOK_REQUIRED = {'district_id', 'district_name', 'division', 'pcode', 'horizon', 'hazard_type', 'target_date', 'prediction_date'}
ADM3_REQUIRED = {'location_id', 'location_name', 'location_type', 'admin_level', 'division', 'pcode', 'horizon', 'hazard_type', 'target_date', 'prediction_date'}

#: Fallbacks for the artifact paths when nothing sits beside --manifest.
COMMITTED_CSV = Path('backend/data/forecasts/hazardnet_forecasts_latest.csv')
COMMITTED_JSON = Path('backend/data/forecasts/hazardnet_forecasts_latest.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    # Derived from --manifest when it is not given: validating a manifest from
    # somewhere other than the committed paths (a rehearsal, a staging directory)
    # must validate the CSV *beside it*, not the one in the repository — otherwise
    # the coverage gate compares one run's tally with another run's rows and fails
    # with a confusing mismatch.
    parser.add_argument('--csv', default=None)
    parser.add_argument('--json', default=None)
    parser.add_argument('--skip-freshness', action='store_true', help='Skip freshness validation check')
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json',
                        help='Pipeline manifest carrying the coverage tally')
    parser.add_argument('--skip-coverage', action='store_true',
                        help='Skip the coverage/run-report gate (legacy CSVs have no report)')
    args = parser.parse_args()

    manifest_dir = Path(args.manifest).parent
    if args.csv is None:
        beside = manifest_dir / 'hazardnet_forecasts_latest.csv'
        args.csv = str(beside if beside.exists() else COMMITTED_CSV)
    if args.json is None:
        beside = manifest_dir / 'hazardnet_forecasts_latest.json'
        args.json = str(beside if beside.exists() else COMMITTED_JSON)

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

    # ── dataset_version shape (PRODUCT_SPEC §5.8) ───────────────────────────
    # A blank value is allowed only for the legacy producers that ran before the
    # scene manifest existed. A value that is present and malformed is not: it
    # would read as lineage while identifying nothing.
    if 'dataset_version' in fieldnames:
        versioned = 0
        for i, row in enumerate(rows):
            value = (row.get('dataset_version') or '').strip()
            if not value:
                continue
            versioned += 1
            if not re.fullmatch(r'ds1\.[0-9a-f]{16}', value):
                print(f"❌ Malformed dataset_version at row {i + 1}: {value!r} "
                      "(expected ds1.<16 hex chars>)")
                sys.exit(1)
        print(f"✅ dataset_version present on {versioned}/{len(rows)} rows")

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
    # A producer may silently skip districts whose upstream fetch
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
        # Lineage continuity: the published manifest must name the scene manifest
        # it shipped with, and (when it does) the rows must carry versions. This
        # is the check that catches a CSV republished without its lineage file.
        scene = manifest.get('scene_manifest') or {}
        if scene:
            scene_path = Path(scene.get('path') or '')
            if not scene_path.exists():
                print(f"❌ Manifest references a scene manifest that is not on disk: {scene_path}")
                sys.exit(1)
            stamped = sum(1 for row in rows if (row.get('dataset_version') or '').strip())
            if scene.get('rows_stamped') is not None and stamped != scene['rows_stamped']:
                print(f"❌ Lineage mismatch: manifest says {scene['rows_stamped']} rows were stamped, "
                      f"the CSV has {stamped}.")
                sys.exit(1)
            # A published manifest carries the run-level version at the top level;
            # a generator run report carries it inside the scene block. Accept both.
            version = manifest.get('dataset_version') or scene.get('dataset_version')
            print(f"✅ dataset_version={version} "
                  f"({scene.get('units')} units, scenes_enumerated={scene.get('scenes_enumerated')})")
        else:
            print("⚠️ Manifest has no scene_manifest block — this dataset cannot name the inputs "
                  "that produced it (legacy run). See docs/PRODUCT_SPEC.md §5.8.")

    print("✅ Forecast validation passed successfully!")
    sys.exit(0)


if __name__ == '__main__':
    main()
