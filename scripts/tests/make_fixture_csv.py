"""Test fixture builders for the forecast CSV schemas.

Rebuilt after the confidentiality cleanup: only the two accepted forecast CSV
shapes (notebook district_* and legacy ADM3 location_*) for the validator
contract tests. No dataset, no collection procedure, no pipeline code.
"""

HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
]

DISTRICT_NAMES = [f'District {i:02d}' for i in range(1, 65)]

NOTEBOOK_COLUMNS = [
    'district_id', 'district_name', 'division', 'pcode', 'horizon',
    'hazard_type', 'target_date', 'prediction_date',
    'severity_score', 'model_severity', 'confidence', 'dataset_version',
]

ADM3_COLUMNS = [
    'location_id', 'location_name', 'location_type', 'admin_level',
    'division', 'pcode', 'horizon', 'hazard_type', 'target_date',
    'prediction_date', 'severity_score', 'model_severity', 'confidence', 'dataset_version',
]


def _rows(columns, id_key, name_key, extra, prediction_date):
    rows = []
    for i in range(64):
        for horizon in ('7_days', '15_days'):
            row = {
                id_key: str(i + 1),
                name_key: DISTRICT_NAMES[i],
                'division': 'Dhaka',
                'pcode': f'BD{i + 1:02d}',
                'horizon': horizon,
                'hazard_type': HAZARDS[i % len(HAZARDS)],
                'target_date': prediction_date,
                'prediction_date': prediction_date,
                'severity_score': '0.42',
                'model_severity': '0.42',
                'confidence': '0.95',
                'dataset_version': 'ds1.' + f'{(i * 2 + (horizon == "15_days")):016x}',
            }
            row.update(extra)
            rows.append({c: row.get(c, '') for c in columns})
    return rows


def notebook_rows(prediction_date):
    """(columns, 128 rows) of the notebook district_* shape."""
    columns = list(NOTEBOOK_COLUMNS)
    return columns, _rows(columns, 'district_id', 'district_name', {}, prediction_date)


def adm3_rows(prediction_date):
    """(columns, 128 rows) of the legacy ADM3 location_* shape."""
    columns = list(ADM3_COLUMNS)
    extra = {'location_type': 'upazila', 'admin_level': 'ADM3'}
    return columns, _rows(columns, 'location_id', 'location_name', extra, prediction_date)


if __name__ == '__main__':
    import csv
    import sys
    from datetime import datetime, timezone

    out_file = sys.argv[1] if len(sys.argv) > 1 else 'fixture_forecasts.csv'
    today_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    cols, data = notebook_rows(today_date)
    with open(out_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        writer.writerows(data)
    print(f'Wrote {len(data)} rows to {out_file}')

