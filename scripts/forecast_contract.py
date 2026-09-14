"""Strict publication contract. Legacy CSV import remains separate, never certified."""
import csv
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

CONTRACT = 'hazardnet-si-v1'
CSV_NAME = 'hazardnet_forecasts_latest.csv'
MANIFEST_NAME = 'hazardnet_run.json'
APPROVED_ARTIFACTS = {item['name']: item['sha256'] for item in json.loads(
    (Path(__file__).resolve().parents[1] / 'Models/VERSION.json').read_text())['artifacts']}
HAZARDS = {'Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave',
           'Severe Local Storm', 'Tropical Cyclone'}
ALIASES = dict(chittagong='chattogram', jessore='jashore', comilla='cumilla',
               barishal='barisal', bogura='bogra', jaipurhat='joypurhat',
               netrakona='netrokona', maulvibazar='moulvibazar',
               brahamanbaria='brahmanbaria', jhalakathi='jhalokati',
               khagrachari='khagrachhari')


def canonical(name):
    key = re.sub('[^a-z0-9]', '', name.lower())
    return ALIASES.get(key, key)


DISTRICTS = {canonical(n) for n in json.loads(
    (Path(__file__).parent / 'config/forecast-districts.json').read_text())}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Run timestamps must include timezone')
    return result.astimezone(timezone.utc)


def validate_output(folder, expected, now=None):
    """Verify exact run nonce/hash before converting SI units to serving units."""
    now = now or datetime.now(timezone.utc)
    folder = Path(folder)
    manifest = json.loads((folder / MANIFEST_NAME).read_text())
    for key in ('run_id', 'kernel', 'source_sha256', 'requested_at'):
        if manifest.get(key) != expected.get(key) or not expected.get(key):
            raise ValueError(f'Output provenance mismatch: {key}')
    if manifest.get('contract_version') != CONTRACT:
        raise ValueError('Notebook must implement the reviewed SI contract')
    started, finished = instant(manifest['started_at']), instant(manifest['completed_at'])
    requested = instant(expected['requested_at'])
    if not requested - timedelta(minutes=5) <= started <= finished <= now + timedelta(minutes=5):
        raise ValueError('Invalid execution timestamps')
    if now - requested > timedelta(hours=2) or now - finished > timedelta(hours=2):
        raise ValueError('Output too old to publish')
    for field in ('model_sha256', 'normalization_sha256', 'source_sha256'):
        if not re.fullmatch('[0-9a-f]{64}', manifest.get(field, '')):
            raise ValueError(f'Missing artifact hash: {field}')
    for field, artifact in (('model_sha256', 'hazardnet_fp32.tflite'),
                            ('normalization_sha256', 'normalization_stats.json')):
        if manifest[field] != APPROVED_ARTIFACTS[artifact]:
            raise ValueError(f'Notebook {artifact} differs from the authoritative repository artifact')
    if sha256(folder / CSV_NAME) != manifest.get('csv_sha256'):
        raise ValueError('CSV hash mismatch')
    with (folder / CSV_NAME).open(newline='') as file:
        reader = csv.DictReader(file)
        if len(reader.fieldnames or []) != len(set(reader.fieldnames or [])):
            raise ValueError('Duplicate CSV headers')
        rows = list(reader)
    if len(rows) != 128:
        raise ValueError('Expected exactly 64 districts × 2 horizons (128 rows)')
    seen, identities, pcodes, dates, records = set(), {}, {}, set(), []
    for row in rows:
        name = canonical(row['district_name'])
        horizon = row['horizon']
        if name not in DISTRICTS or horizon not in ('7_days', '15_days'):
            raise ValueError('Unknown district or horizon')
        key = (name, horizon)
        if key in seen:
            raise ValueError('Duplicate district/horizon')
        seen.add(key)
        identity = int(row['district_id'])
        pcode = row['pcode'].strip()
        if identity <= 0 or not pcode or not row['division'].strip():
            raise ValueError('Missing district identity/context')
        if identities.setdefault(identity, name) != name or pcodes.setdefault(pcode, name) != name:
            raise ValueError('Ambiguous district identity')
        days = int(horizon.split('_')[0])
        pred = datetime.strptime(row['prediction_date'], '%Y-%m-%d').date()
        dates.add(pred)
        if pred not in (started.date(), finished.date()):
            raise ValueError('Prediction date does not belong to this run (UTC)')
        if row['target_date'] != (pred + timedelta(days=days)).isoformat():
            raise ValueError('Target date does not match horizon')
        if row['hazard_type'] not in HAZARDS:
            raise ValueError('Unknown hazard')
        def number(field, low, high):
            value = float(row[field])
            if not math.isfinite(value) or not low <= value <= high:
                raise ValueError(f'Invalid {field}: expected [{low}, {high}]')
            return value
        record = {k: row[k] for k in ('district_name', 'division', 'pcode', 'horizon',
                                      'hazard_type', 'target_date', 'prediction_date')}
        record['district_id'] = identity
        for field in ('model_severity', 'physics_severity', 'confidence'):
            record[field] = number(field, 0, 1)
        record['severity_score'] = record['model_severity']
        for dest, source in (('temperature_mean', 'om_temp_2m_k'), ('temperature_max', 'om_max_temp_k'),
                             ('temperature_min', 'om_min_temp_k'), ('dewpoint_mean', 'om_dewpoint_k')):
            record[dest] = number(source, 230, 340) - 273.15
        if not record['temperature_min'] <= record['temperature_mean'] <= record['temperature_max']:
            raise ValueError('Inconsistent temperature range')
        record['precipitation_mm'] = number('om_precip_m', 0, 5) * 1000
        record['wind_max_kmh'] = number('om_wind_max_ms', 0, 150) * 3.6
        record['solar_radiation_mj_m2'] = number('om_solar_rad_j', 0, days * 40e6) / 1e6 / days
        record['evapotranspiration_mm'] = number('om_et_sum_m', 0, days * .03) * 1000 / days
        records.append(record)
    if len(dates) != 1 or len(identities) != 64 or len(pcodes) != 64:
        raise ValueError('Inconsistent dates or district identities across horizons')
    manifest.update(kaggle_version=expected['kaggle_version'], row_count=len(records),
                    prediction_date=next(iter(dates)).isoformat())
    return {'manifest': manifest, 'rows': records}
