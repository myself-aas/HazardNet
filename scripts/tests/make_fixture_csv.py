#!/usr/bin/env python3
"""Generate a notebook-shaped forecast CSV fixture (test/dev use only).

Replicates the exact column set the committed Kaggle notebook writes to
/kaggle/working/hazardnet_forecasts_latest.csv: one top-1-hazard row per
district per horizon (64 districts x 2 horizons = 128 rows), dual-track
severity columns, division/pcode context, and the om_* Open-Meteo columns
(which the ingest parser converts to human units).

Usage:
  python scripts/tests/make_fixture_csv.py [out.csv] [--schema notebook|adm3]
      [--prediction-date YYYY-MM-DD] [--stale-days N]
"""

import argparse
import csv
import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DISTRICTS = [
    'Kurigram', 'Rangpur', 'Gaibandha', 'Nilphamari', 'Dinajpur', 'Panchagarh',
    'Thakurgaon', 'Lalmonirhat', 'Rajshahi', 'Bogra', 'Sirajganj', 'Pabna',
    'Naogaon', 'Natore', 'Chapainawabganj', 'Joypurhat', 'Mymensingh',
    'Netrokona', 'Jamalpur', 'Sherpur', 'Sylhet', 'Sunamganj', 'Habiganj',
    'Moulvibazar', 'Dhaka', 'Gazipur', 'Narayanganj', 'Tangail',
    'Kishoreganj', 'Manikganj', 'Munshiganj', 'Narsingdi', 'Faridpur',
    'Gopalganj', 'Madaripur', 'Rajbari', 'Shariatpur', 'Khulna', 'Satkhira',
    'Bagerhat', 'Jessore', 'Jhenaidah', 'Magura', 'Narail', 'Chuadanga',
    'Kushtia', 'Meherpur', 'Barisal', 'Bhola', 'Jhalokati', 'Patuakhali',
    'Pirojpur', 'Barguna', 'Chattogram', "Cox's Bazar", 'Cumilla', 'Feni',
    'Noakhali', 'Lakshmipur', 'Chandpur', 'Brahmanbaria', 'Khagrachhari',
    'Rangamati', 'Bandarban',
]
assert len(DISTRICTS) == 64, f'expected 64 districts, got {len(DISTRICTS)}'

HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
]
HORIZONS = [('7_days', 7), ('15_days', 15)]

NOTEBOOK_COLUMNS = [
    'district_id', 'district_name', 'division', 'pcode', 'horizon',
    'hazard_type', 'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source',
    'om_temp_2m_k', 'om_precip_m', 'om_max_temp_k', 'om_min_temp_k',
    'om_dewpoint_k', 'om_solar_rad_j', 'om_wind_max_ms', 'om_et_sum_m',
    # Scene lineage. The pipeline stamps a content hash over the inputs that
    # produced each unit (scripts/etl/scene_manifest.py); the fixture stands in
    # with a deterministic per-row value so the publish/validate/snapshot chain
    # can be exercised end to end offline.
    'dataset_version',
]


def fixture_dataset_version(district_id, horizon, prediction_date):
    """A deterministic stand-in for a real `dataset_version` (`ds1.<16 hex>`)."""
    digest = hashlib.sha256(
        f'{district_id}|{horizon}|{prediction_date}'.encode('utf-8')
    ).hexdigest()
    return f'ds1.{digest[:16]}'

ADM3_COLUMNS = [
    'location_id', 'location_name', 'location_type', 'admin_level',
    'division', 'pcode', 'horizon', 'hazard_type',
    'model_severity', 'physics_severity', 'confidence',
    'target_date', 'prediction_date', 'data_source',
]


def notebook_rows(prediction_date: str):
    rows = []
    pred = datetime.strptime(prediction_date, '%Y-%m-%d')
    for district_id, name in enumerate(DISTRICTS, start=1):
        for hi, (horizon, days) in enumerate(HORIZONS):
            hazard = HAZARDS[(district_id + hi) % len(HAZARDS)]
            severity = round(0.15 + ((district_id * 7 + hi * 13) % 70) / 100, 4)
            physics = round(min(1.0, severity + 0.05), 4)
            confidence = round(0.55 + ((district_id * 3 + hi) % 40) / 100, 4)
            target = (pred + timedelta(days=days)).strftime('%Y-%m-%d')
            rows.append({
                'district_id': district_id,
                'district_name': name,
                'division': 'TestDivision',
                'pcode': f'{3000 + district_id}',
                'horizon': horizon,
                'hazard_type': hazard,
                'model_severity': severity,
                'physics_severity': physics,
                'confidence': confidence,
                'target_date': target,
                'prediction_date': prediction_date,
                'data_source': 'Hybrid_Cognitive_Forecast',
                'om_temp_2m_k': 300.15,
                'om_precip_m': 0.004,
                'om_max_temp_k': 305.15,
                'om_min_temp_k': 295.15,
                'om_dewpoint_k': 298.15,
                'om_solar_rad_j': 18000000,
                'om_wind_max_ms': 8.5,
                'om_et_sum_m': 0.005,
                'dataset_version': fixture_dataset_version(district_id, horizon, prediction_date),
            })
    return NOTEBOOK_COLUMNS, rows


def adm3_rows(prediction_date: str):
    columns = ADM3_COLUMNS
    rows = []
    pred = datetime.strptime(prediction_date, '%Y-%m-%d')
    loc_id = 0
    # 64 districts (admin_level 2) + 120 synthetic upazilas (admin_level 3).
    units = [(f'D{n:02d}', n, 2, 'District') for n in range(1, 65)]
    units += [(f'U{n:03d}', 1000 + n, 3, 'Upazila') for n in range(1, 121)]
    for uname, uid, level, ltype in units:
        for hi, (horizon, days) in enumerate(HORIZONS):
            hazard = HAZARDS[(uid + hi) % len(HAZARDS)]
            severity = round(0.15 + ((uid * 7 + hi * 13) % 70) / 100, 4)
            target = (pred + timedelta(days=days)).strftime('%Y-%m-%d')
            rows.append({
                'location_id': uid,
                'location_name': uname,
                'location_type': ltype,
                'admin_level': level,
                'division': 'TestDivision',
                'pcode': f'{uid}',
                'horizon': horizon,
                'hazard_type': hazard,
                'model_severity': severity,
                'physics_severity': round(min(1.0, severity + 0.05), 4),
                'confidence': 0.8,
                'target_date': target,
                'prediction_date': prediction_date,
                'data_source': 'Hybrid_Cognitive_Forecast',
            })
            loc_id += 1
    return columns, rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', nargs='?',
                        default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--schema', choices=['notebook', 'adm3'], default='notebook')
    parser.add_argument('--prediction-date', default=None)
    parser.add_argument('--stale-days', type=int, default=0)
    args = parser.parse_args()

    if args.prediction_date:
        prediction_date = args.prediction_date
    else:
        prediction_date = (
            datetime.now(timezone.utc) - timedelta(days=args.stale_days)
        ).strftime('%Y-%m-%d')

    columns, rows = (notebook_rows(prediction_date) if args.schema == 'notebook'
                     else adm3_rows(prediction_date))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f'wrote {len(rows)} {args.schema} rows -> {out} (prediction_date={prediction_date})')


if __name__ == '__main__':
    main()
