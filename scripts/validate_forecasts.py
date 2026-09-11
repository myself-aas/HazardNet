#!/usr/bin/env python3
"""
Validate forecast CSV/JSON schema and data quality.
Part of the HazardNet production deployment pipeline.
"""
import sys
import json
import pandas as pd
from pathlib import Path
from datetime import datetime

FORECAST_DIR = Path("./backend/data/forecasts")
CSV_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.csv"
JSON_FILE = FORECAST_DIR / "hazardnet_forecasts_latest.json"

REQUIRED_COLUMNS = [
    'location_id', 'location_name', 'location_type', 'admin_level',
    'division', 'pcode', 'horizon', 'hazard_type',
    'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source'
]

VALID_HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
]

VALID_HORIZONS = ['10_days', '20_days', '30_days']

def validate_csv():
    """Validate CSV file structure and content."""
    print("📋 Validating CSV file...")
    
    if not CSV_FILE.exists():
        print(f"❌ CSV file not found: {CSV_FILE}")
        return False
    
    try:
        df = pd.read_csv(CSV_FILE)
    except Exception as e:
        print(f"❌ Failed to read CSV: {e}")
        return False
    
    # Check columns
    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        print(f"❌ Missing columns: {missing_cols}")
        return False
    
    # Check row count (should be 554 locations * 3 horizons = 1662 rows minimum)
    expected_rows = 1662
    if len(df) < expected_rows * 0.9:  # Allow 10% tolerance
        print(f"⚠️ Warning: Expected ~{expected_rows} rows, got {len(df)}")
    
    # Check data quality
    if df['confidence'].min() < 0 or df['confidence'].max() > 1:
        print("❌ Confidence values out of range [0, 1]")
        print(f"   Min: {df['confidence'].min()}, Max: {df['confidence'].max()}")
        return False
    
    if df['model_severity'].min() < 0 or df['model_severity'].max() > 1:
        print("❌ Model severity values out of range [0, 1]")
        return False
    
    if df['physics_severity'].min() < 0 or df['physics_severity'].max() > 1:
        print("❌ Physics severity values out of range [0, 1]")
        return False
    
    # Check hazard types
    invalid_hazards = set(df['hazard_type'].unique()) - set(VALID_HAZARDS)
    if invalid_hazards:
        print(f"❌ Invalid hazard types found: {invalid_hazards}")
        return False
    
    # Check horizons
    invalid_horizons = set(df['horizon'].unique()) - set(VALID_HORIZONS)
    if invalid_horizons:
        print(f"❌ Invalid horizon values found: {invalid_horizons}")
        return False
    
    # Check admin levels
    valid_admin_levels = {2, 3}
    invalid_levels = set(df['admin_level'].unique()) - valid_admin_levels
    if invalid_levels:
        print(f"❌ Invalid admin levels found: {invalid_levels}")
        return False
    
    print(f"✅ CSV valid: {len(df)} rows, {len(df.columns)} columns")
    print(f"   Locations: {df['location_id'].nunique()}")
    print(f"   Hazards: {', '.join(df['hazard_type'].unique())}")
    print(f"   Horizons: {', '.join(df['horizon'].unique())}")
    return True

def validate_json():
    """Validate JSON file structure."""
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
    
    # Validate first record
    record = data[0]
    missing_keys = set(REQUIRED_COLUMNS) - set(record.keys())
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
        age_days = (datetime.now() - latest_date).days
        age_hours = (datetime.now() - latest_date).total_seconds() / 3600
        
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
    """Check if all expected districts and upazilas are present."""
    print("\n📊 Checking forecast completeness...")
    
    try:
        df = pd.read_csv(CSV_FILE)
        
        # Check districts (ADM2)
        districts = df[df['admin_level'] == 2]['location_id'].nunique()
        expected_districts = 64
        if districts < expected_districts:
            print(f"⚠️ Warning: Only {districts}/{expected_districts} districts covered")
        else:
            print(f"✅ All {districts} districts covered")
        
        # Check upazilas (ADM3)
        upazilas = df[df['admin_level'] == 3]['location_id'].nunique()
        expected_upazilas = 490
        if upazilas < expected_upazilas * 0.95:  # Allow 5% tolerance
            print(f"⚠️ Warning: Only {upazilas}/{expected_upazilas} upazilas covered")
        else:
            print(f"✅ {upazilas} upazilas covered")
        
        # Check hazard coverage per location
        min_forecasts = df.groupby('location_id').size().min()
        max_forecasts = df.groupby('location_id').size().max()
        print(f"   Forecasts per location: {min_forecasts} - {max_forecasts}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to check completeness: {e}")
        return False

def main():
    print("=" * 60)
    print("HazardNet Forecast Validation")
    print("=" * 60 + "\n")
    
    results = {
        'csv': validate_csv(),
        'json': validate_json(),
        'freshness': validate_freshness(),
        'completeness': validate_completeness()
    }
    
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

if __name__ == "__main__":
    main()
