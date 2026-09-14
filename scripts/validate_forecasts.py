#!/usr/bin/env python3
"""
Validate forecast CSV/JSON schema and data quality.
Part of the HazardNet production deployment pipeline.

Schema-adaptive: two forecast CSV shapes circulate through the pipelines and
both must validate —

  * ADM3 schema (location_* columns) — the 507-unit dataset used by the
    historical validation contract.
  * Notebook schema (district_* columns) — what the committed Kaggle notebook
    (ashifahmedshuvo/hazardnet-auto-forecast-pipeline) writes to
    /kaggle/working/hazardnet_forecasts_latest.csv and what the hourly
    refresh workflow (hourly_forecast.yml) + the backend ingest endpoint
    (backend/utils/forecastRow.js) consume.

The schema is detected from the CSV header; the JSON artifact must match the
CSV's detected schema.
"""
import argparse
import sys
import json
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

FORECAST_DIR = Path("./backend/data/forecasts")
CSV_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.csv"
JSON_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.json"
# Hourly refresh pulls the notebook's latest output, which may legitimately be
# days old between notebook runs — freshness is a warning there, not a gate.
# Producer pipelines (daily/weekly) keep the strict freshness gate.
SKIP_FRESHNESS = False

# Columns common to both schemas.
COMMON_COLUMNS = [
    'horizon', 'hazard_type',
    'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date',
]

# ADM3 schema (507 locations: 64 districts + 443 upazilas/city corporations).
ADM3_COLUMNS = ['location_id', 'location_name', 'location_type', 'admin_level',
                'division', 'pcode'] + COMMON_COLUMNS + ['data_source']

# Notebook schema — 64 FAO GAUL districts × 2 horizons = 128 rows. The
# notebook emits ONE row per district per horizon carrying that district's
# single top-1 hazard (`run_inference` returns one (hazard, confidence,
# severity) triple and the loop appends once), NOT the full hazard cross
# product. Severity may arrive as the legacy single-track column instead of
# the dual-track pair; district_name/division/pcode are required by the ingest
# contract, admin_level & adm2_* optional.
NOTEBOOK_COLUMNS = ['district_id', 'district_name', 'horizon', 'hazard_type',
                    'confidence', 'target_date', 'prediction_date']

VALID_HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
]

VALID_HORIZONS = ['7_days', '15_days']


def detect_schema(df):
    """Return 'adm3' | 'notebook' based on the header, or None if neither."""
    cols = set(df.columns)
    if {'location_id', 'location_name'} <= cols:
        return 'adm3'
    if {'district_id', 'district_name'} <= cols:
        return 'notebook'
    return None


def validate_csv():
    """Validate CSV file structure and content. Returns (ok, schema)."""
    print("📋 Validating CSV file...")

    if not CSV_FILE.exists():
        print(f"❌ CSV file not found: {CSV_FILE}")
        return False, None

    try:
        df = pd.read_csv(CSV_FILE)
    except Exception as e:
        print(f"❌ Failed to read CSV: {e}")
        return False, None

    schema = detect_schema(df)
    if schema is None:
        print("❌ Unrecognized schema: CSV has neither location_* nor district_* identity columns")
        return False, None
    print(f"   Detected schema: {schema}")

    if schema == 'adm3':
        missing_cols = set(ADM3_COLUMNS) - set(df.columns)
    else:
        required = set(NOTEBOOK_COLUMNS)
        # Severity may be single-track (severity_score) or dual-track.
        if 'model_severity' not in df.columns and 'severity_score' not in df.columns:
            print("❌ Missing severity column (need severity_score or model_severity)")
            return False, schema
        missing_cols = required - set(df.columns)
    if missing_cols:
        print(f"❌ Missing columns: {missing_cols}")
        return False, schema

    # Row-count expectations (10 % tolerance — warns, does not fail).
    if schema == 'adm3':
        expected_rows = 1108  # 554 locations × horizons (historical contract)
    else:
        # One top-1-hazard row per district per horizon. This used to multiply
        # by len(VALID_HAZARDS) for 1024, which the notebook never produced —
        # every real run warned "Expected ~1024 rows, got 128", which is how a
        # genuine shortfall would have been mistaken for the usual noise.
        expected_rows = 64 * len(VALID_HORIZONS)  # 128
    if len(df) < expected_rows * 0.9:
        print(f"⚠️ Warning: Expected ~{expected_rows} rows, got {len(df)}")

    # Severity columns present in this file (dual-track or single-track).
    severity_cols = [c for c in ('model_severity', 'physics_severity', 'severity_score')
                     if c in df.columns]

    # Check data quality
    if df['confidence'].min() < 0 or df['confidence'].max() > 1:
        print("❌ Confidence values out of range [0, 1]")
        print(f"   Min: {df['confidence'].min()}, Max: {df['confidence'].max()}")
        return False, schema

    for col in severity_cols:
        if df[col].min() < 0 or df[col].max() > 1:
            print(f"❌ {col} values out of range [0, 1]")
            return False, schema

    # Check hazard types
    invalid_hazards = set(df['hazard_type'].unique()) - set(VALID_HAZARDS)
    if invalid_hazards:
        print(f"❌ Invalid hazard types found: {invalid_hazards}")
        return False, schema

    # Check horizons
    invalid_horizons = set(df['horizon'].unique()) - set(VALID_HORIZONS)
    if invalid_horizons:
        print(f"❌ Invalid horizon values found: {invalid_horizons}")
        return False, schema

    # Check admin levels (only meaningful when the column is present)
    if 'admin_level' in df.columns:
        valid_admin_levels = {2, 3}
        invalid_levels = set(df['admin_level'].dropna().astype(int).unique()) - valid_admin_levels
        if invalid_levels:
            print(f"❌ Invalid admin levels found: {invalid_levels}")
            return False, schema

    id_col = 'location_id' if schema == 'adm3' else 'district_id'
    print(f"✅ CSV valid: {len(df)} rows, {len(df.columns)} columns")
    print(f"   Locations: {df[id_col].nunique()}")
    print(f"   Hazards: {', '.join(sorted(df['hazard_type'].unique()))}")
    print(f"   Horizons: {', '.join(sorted(df['horizon'].unique()))}")
    return True, schema


def validate_json(schema):
    """Validate JSON file structure (must match the CSV's detected schema)."""
    print("\n📋 Validating JSON file...")

    if not JSON_FILE.exists():
        print(f"❌ JSON file not found: {JSON_FILE}")
        return False

    try:
        with open(JSON_FILE, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to read JSON: {e}")
        return False

    if not isinstance(data, list):
        print("❌ JSON root must be an array")
        return False

    if len(data) == 0:
        print("❌ JSON array is empty")
        return False

    # Validate first record against the CSV's schema.
    record = data[0]
    if schema == 'adm3':
        required = set(ADM3_COLUMNS)
    else:
        required = set(NOTEBOOK_COLUMNS)
        if 'model_severity' not in record and 'severity_score' not in record:
            print("❌ Missing severity key in JSON (need severity_score or model_severity)")
            return False
    missing_keys = required - set(record.keys())
    if missing_keys:
        print(f"❌ Missing keys in JSON: {missing_keys}")
        return False

    print(f"✅ JSON valid: {len(data)} records")
    return True


def validate_freshness():
    """Check if forecasts are recent."""
    print("\n📅 Checking forecast freshness...")

    try:
        df = pd.read_csv(CSV_FILE)
        latest_date = pd.to_datetime(df['prediction_date'].max())
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        age_days = (now - latest_date).days
        age_hours = (now - latest_date).total_seconds() / 3600

        if age_days > 2:
            print(f"⚠️ Warning: Forecasts are {age_days} days old")
            return False
        else:
            print(f"✅ Forecasts are fresh ({age_hours:.1f} hours old)")
            return True
    except Exception as e:
        print(f"❌ Failed to check freshness: {e}")
        return False


def validate_completeness():
    """Check that all expected districts (and upazilas, ADM3 schema) exist."""
    print("\n📊 Checking forecast completeness...")

    try:
        df = pd.read_csv(CSV_FILE)
        schema = detect_schema(df)

        if schema == 'adm3':
            districts = df[df['admin_level'] == 2]['location_id'].nunique()
            expected_districts = 64
            if districts < expected_districts:
                print(f"⚠️ Warning: Only {districts}/{expected_districts} districts covered")
            else:
                print(f"✅ All {districts} districts covered")

            upazilas = df[df['admin_level'] == 3]['location_id'].nunique()
            expected_upazilas = 490
            if upazilas < expected_upazilas * 0.95:  # Allow 5 % tolerance
                print(f"⚠️ Warning: Only {upazilas}/{expected_upazilas} upazilas covered")
            else:
                print(f"✅ {upazilas} upazilas covered")
            id_col = 'location_id'
        else:
            id_col = 'district_id'
            districts = df[id_col].nunique()
            expected_districts = 64
            if districts < expected_districts:
                print(f"⚠️ Warning: Only {districts}/{expected_districts} districts covered")
            else:
                print(f"✅ All {districts} districts covered")

        # Check hazard coverage per location
        min_forecasts = df.groupby(id_col).size().min()
        max_forecasts = df.groupby(id_col).size().max()
        print(f"   Forecasts per location: {min_forecasts} - {max_forecasts}")

        return True
    except Exception as e:
        print(f"❌ Failed to check completeness: {e}")
        return False


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', default=str(CSV_FILE), help='Forecast CSV to validate')
    parser.add_argument('--json', default=str(JSON_FILE), help='Forecast JSON artifact to validate')
    parser.add_argument('--skip-freshness', action='store_true',
                        help='Warn instead of failing on stale prediction_date '
                             '(hourly refresh: the notebook runs on its own cadence)')
    return parser.parse_args(argv)


def main(argv=None):
    global CSV_FILE, JSON_FILE, SKIP_FRESHNESS
    args = parse_args(argv)
    CSV_FILE = Path(args.csv)
    JSON_FILE = Path(args.json)
    SKIP_FRESHNESS = args.skip_freshness

    print("=" * 60)
    print("HazardNet Forecast Validation")
    print("=" * 60 + "\n")

    csv_ok, schema = validate_csv()
    results = {
        'csv': csv_ok,
        'json': validate_json(schema) if csv_ok else False,
        'freshness': validate_freshness() if csv_ok else False,
        'completeness': validate_completeness() if csv_ok else False,
    }
    if SKIP_FRESHNESS and csv_ok and not results['freshness']:
        print("ℹ️ Freshness gate skipped (--skip-freshness): stale data warns but passes.")
        results['freshness'] = True

    print("\n" + "=" * 60)
    if all(results.values()):
        print("✅ All validation checks passed!")
        print("=" * 60)
        sys.exit(0)
    else:
        failed = [k for k, v in results.items() if not v]
        print(f"❌ Validation failed: {', '.join(failed)}")
        print("=" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()
