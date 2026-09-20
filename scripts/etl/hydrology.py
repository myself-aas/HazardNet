#!/usr/bin/env python3
"""FFWC river-level ingestion → the `w3` hydrology stream.

WHY THIS STREAM EXISTS
----------------------
`docs/architecture/TARGET_ARCHITECTURE.md` §2.1 defines four independent evidence
streams; only the CNN (`w1`) and the physics proxies (`w2`) exist. The most
consequential gap is *hydrology*: Bangladesh's monsoon floods are driven by river
levels in upstream catchments, and `w2` cannot see them — it is why `Flood` and
`Flash Flood` share one rainfall formula and why the CNN's own confidence has no
second opinion on the deadliest hazard.

The Flood Forecasting and Warning Centre publishes exactly the right input:
observed and forecast water levels per station, against each station's published
danger level. This module ingests that and scores it, independently of both the
model and the physics track.

THE SCORE (documented so it can be argued with)
-----------------------------------------------
`ratio = reference_level / danger_level`, where `reference_level` is the highest
observed or forecast level in the record:

    ratio < 0.90              → 0.00        (well below danger)
    0.90 ≤ ratio < 1.00       → 0.00–0.50   (approaching danger)
    1.00 ≤ ratio < 1.20       → 0.50–0.85   (above danger)
    ratio ≥ 1.20              → 0.85–1.00   (severe, saturating)

Forecast-only records are damped by lead time (`max(0.7, 1 − 0.05·lead_days)`),
because a five-day-out level is a weaker statement than a measured one; an
observed level is never damped. Everything else — `trend`, station count,
staleness (`observed_at` too old), and which station drove the district score — is
carried through so a consumer can see the basis instead of a bare number.

No network, no database, standard library only. `scripts/tests/test_etl_hydrology_bulletins.py`
covers the scoring table, the damping, staleness and district aggregation.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from districts import resolve as resolve_district

#: The class a hydrology record maps to. FFWC distinguishes monsoon riverine
#: flooding from flash floods in the north-east; the source row says which, and
#: anything unlabelled is treated as riverine (`Flood`) — the conservative choice,
#: because calling a river flood a flash flood would change the alert class the
#: user sees.
DEFAULT_HAZARD = 'Flood'
HAZARD_OVERRIDES = {
    'flash': 'Flash Flood',
    'flash_flood': 'Flash Flood',
    'flash flood': 'Flash Flood',
    'river': 'Flood',
    'riverine': 'Flood',
    'monsoon': 'Flood',
}

#: A water level older than this is reported as stale rather than scored as if it
#: were current. FFWC updates at least daily during the monsoon.
STALE_AFTER_HOURS = 36

#: Forecast-only damping: a level 5 days out is not the same statement as a
#: measured one.
MIN_FORECAST_DAMPING = 0.7
DAMPING_PER_LEAD_DAY = 0.05


class HydrologyError(ValueError):
    """Raised for a record that cannot be scored."""


def _parse_dt(value, *, field: str):
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip().replace('Z', '+00:00')
    for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise HydrologyError(f'{field}: unparseable datetime {value!r}')


def _first(raw: dict, *keys):
    """First value present under any of `keys` — `0` and `0.0` are values, not absences.

    `raw.get(a) or raw.get(b)` is the bug this replaces: a water level of exactly
    0.00 m (or a danger level of 0) is falsy, so it would read as "missing" and
    produce a confusing "is required" error — or, worse, silently fall through to
    a different key.
    """
    for key in keys:
        if key in raw and raw[key] is not None and raw[key] != '':
            return raw[key]
    return None


def _float(value, *, field: str, required: bool = False):
    if value in (None, ''):
        if required:
            raise HydrologyError(f'{field} is required')
        return None
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        raise HydrologyError(f'{field}: {value!r} is not a number')
    if math.isnan(parsed) or math.isinf(parsed):
        raise HydrologyError(f'{field}: {value!r} is not finite')
    return parsed


def normalize_forecast_entries(entries) -> list:
    """Forecast levels → `[{valid_from, level_m, lead_days}]`, sorted by time."""
    normalized = []
    for entry in entries or []:
        if isinstance(entry, dict):
            valid_from = _first(entry, 'valid_from', 'date', 'datetime')
            level = _first(entry, 'level_m', 'level')
        else:  # (date, level) pairs are a common shape in FFWC exports
            valid_from, level = entry[0], entry[1]
        moment = _parse_dt(valid_from, field='forecast.valid_from')
        if moment is None:
            raise HydrologyError('forecast entries need valid_from/date')
        normalized.append({
            'valid_from': moment.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'level_m': _float(level, field='forecast.level_m', required=True),
            '_moment': moment,
        })
    normalized.sort(key=lambda entry: entry['_moment'])
    return normalized


def normalize_record(raw: dict, *, index: int = 0) -> dict:
    """Validate and normalise one FFWC station record."""
    if not isinstance(raw, dict):
        raise HydrologyError(f'station[{index}]: expected an object')
    prefix = f'station[{index}]'

    station_id = str(_first(raw, 'station_id', 'station', 'id') or '').strip()
    station_name = str(_first(raw, 'station_name', 'name') or station_id).strip()
    if not station_id and not station_name:
        raise HydrologyError(f'{prefix}: needs at least a station_id or station_name')

    district_raw = _first(raw, 'adm2_name', 'district', 'district_name')
    district = resolve_district(district_raw)
    if district is None:
        raise HydrologyError(
            f'{prefix}: district {district_raw!r} is not one of the 64 '
            '(scripts/etl/districts.py) — a station outside Bangladesh cannot be scored here'
        )

    danger = _float(_first(raw, 'danger_level_m', 'danger_level'),
                    field=f'{prefix}.danger_level_m', required=True)
    if danger <= 0:
        raise HydrologyError(f'{prefix}: danger_level_m must be positive (got {danger})')

    observed = _float(_first(raw, 'observed_level_m', 'observed_level'), field=f'{prefix}.observed_level_m')
    observed_at = _parse_dt(_first(raw, 'observed_at', 'observed_time'), field=f'{prefix}.observed_at')
    forecast = normalize_forecast_entries(_first(raw, 'forecast', 'forecast_levels') or [])

    if observed is None and not forecast:
        raise HydrologyError(f'{prefix}: neither an observed level nor a forecast — nothing to score')

    hazard_raw = str(_first(raw, 'hazard_class', 'flood_type') or '').strip().lower()
    hazard = HAZARD_OVERRIDES.get(hazard_raw, DEFAULT_HAZARD)

    return {
        'station_id': station_id or station_name,
        'station_name': station_name,
        'river': (str(raw['river']).strip() if raw.get('river') else None),
        'adm2_name': district,
        'danger_level_m': round(danger, 3),
        'observed_level_m': (round(observed, 3) if observed is not None else None),
        'observed_at': (observed_at.strftime('%Y-%m-%dT%H:%M:%SZ') if observed_at else None),
        'trend': (str(raw['trend']).strip().lower() if raw.get('trend') else None),
        'hazard_class': hazard,
        'forecast': [{k: entry[k] for k in ('valid_from', 'level_m')} for entry in forecast],
        '_observed_moment': observed_at,
        '_forecast_moments': [entry['_moment'] for entry in forecast],
    }


def load_records(path) -> list:
    """Read station records from CSV, JSON array or JSON-lines."""
    source = Path(path)
    text = source.read_text(encoding='utf-8')
    if source.suffix.lower() == '.csv':
        import csv

        rows = list(csv.DictReader(text.splitlines()))
        for row in rows:
            if isinstance(row.get('forecast'), str) and row['forecast'].strip():
                row['forecast'] = json.loads(row['forecast'])
        return rows
    if source.suffix.lower() in ('.jsonl', '.ndjson'):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    parsed = json.loads(text)
    if isinstance(parsed, dict):
        for key in ('stations', 'records', 'rows', 'data'):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        return [parsed]
    return parsed


def score_ratio(ratio: float) -> float:
    """The piecewise mapping documented at the top of this module."""
    if ratio is None or ratio != ratio:  # NaN guard
        return 0.0
    if ratio < 0.90:
        return 0.0
    if ratio < 1.00:
        return round((ratio - 0.90) / 0.10 * 0.50, 4)
    if ratio < 1.20:
        return round(0.50 + (ratio - 1.00) / 0.20 * 0.35, 4)
    return round(min(0.85 + (ratio - 1.20) / 0.30 * 0.15, 1.0), 4)


def forecast_damping(lead_days: float) -> float:
    """How much a forecast-only level is discounted for its lead time."""
    return max(MIN_FORECAST_DAMPING, 1.0 - DAMPING_PER_LEAD_DAY * max(lead_days, 0.0))


def score_station(record: dict, *, now=None) -> dict:
    """Score one station record; returns the score plus everything it is based on."""
    now = now or datetime.now(timezone.utc)
    danger = record['danger_level_m']
    observed = record.get('observed_level_m')
    forecast_levels = [entry['level_m'] for entry in record.get('forecast', [])]

    candidates = []
    if observed is not None:
        candidates.append(('observed', observed, 0.0))
    for entry, moment in zip(record.get('forecast', []), record.get('_forecast_moments', [])):
        lead_days = max((moment - now).total_seconds() / 86400.0, 0.0)
        candidates.append(('forecast', entry['level_m'], lead_days))
    if not candidates:
        raise HydrologyError(f"{record.get('station_name')}: no levels to score")

    basis, level, lead_days = max(candidates, key=lambda row: row[1])
    ratio = level / danger
    raw_score = score_ratio(ratio)
    damping = 1.0 if basis == 'observed' else forecast_damping(lead_days)
    score = round(raw_score * damping, 4)

    observed_moment = record.get('_observed_moment')
    staleness_hours = None
    stale = False
    if observed_moment is not None:
        staleness_hours = round((now - observed_moment).total_seconds() / 3600.0, 1)
        if basis == 'observed':
            stale = staleness_hours > STALE_AFTER_HOURS

    # Trend: measured when the source gives one, else derived from the forecast
    # series (a rising river is the operational signal, independent of level).
    trend = record.get('trend')
    if trend not in ('rising', 'falling', 'steady') and forecast_levels:
        reference = observed if observed is not None else forecast_levels[0]
        delta = forecast_levels[-1] - reference
        trend = 'rising' if delta > 0.05 else 'falling' if delta < -0.05 else 'steady'

    return {
        'station_id': record.get('station_id'),
        'station_name': record.get('station_name'),
        'river': record.get('river'),
        'adm2_name': record['adm2_name'],
        'hazard_class': record.get('hazard_class', DEFAULT_HAZARD),
        'danger_level_m': danger,
        'reference_level_m': round(level, 3),
        'reference_basis': basis,
        'exceedance_ratio': round(ratio, 4),
        'hydrology_severity': score,
        'raw_score_before_damping': raw_score,
        'forecast_lead_days': round(lead_days, 2) if basis == 'forecast' else 0.0,
        'damping': round(damping, 4),
        'trend': trend,
        'observed_age_hours': staleness_hours,
        'stale': stale,
        'above_danger': ratio >= 1.0,
        'source': 'ffwc',
    }


def district_scores(records, *, now=None) -> dict:
    """Aggregate station scores to districts: the worst station leads.

    Max (not mean) because a district with one station above danger is in more
    trouble than a district whose five stations are all slightly below it —
    averaging would hide exactly the case the warning exists for.
    """
    now = now or datetime.now(timezone.utc)
    scored = [score_station(record, now=now) for record in records]
    by_district: dict = {}
    for station in scored:
        district = station['adm2_name']
        entry = by_district.setdefault(district, {
            'district': district,
            'hazard_class': station['hazard_class'],
            'hydrology_severity': 0.0,
            'stations': [],
            'stations_above_danger': 0,
            'trend': None,
            'stale': False,
            'source': 'ffwc',
        })
        entry['stations'].append(station)
        if station['hydrology_severity'] > entry['hydrology_severity']:
            entry['hydrology_severity'] = station['hydrology_severity']
            entry['worst_station'] = station['station_name']
            entry['worst_station_id'] = station['station_id']
            entry['reference_level_m'] = station['reference_level_m']
            entry['danger_level_m'] = station['danger_level_m']
            entry['exceedance_ratio'] = station['exceedance_ratio']
            entry['trend'] = station['trend']
            entry['stale'] = station['stale']
            entry['reference_basis'] = station['reference_basis']
            entry['hazard_class'] = station['hazard_class']
        entry['stations_above_danger'] += 1 if station['above_danger'] else 0

    for entry in by_district.values():
        entry['station_count'] = len(entry['stations'])
        entry['stations'] = [s['station_id'] for s in entry['stations']]
    return dict(sorted(by_district.items()))


def stream_state(records, *, now=None) -> dict:
    """Whether the w3 stream is usable for a run, and why not.

    A run must be able to say "no hydrology input today" — the alternative is
    publishing a flood forecast with a silent gap in the evidence that supports it.
    """
    now = now or datetime.now(timezone.utc)
    if not records:
        return {'available': False, 'reason': 'no FFWC records supplied', 'stations': 0, 'districts': 0}
    fresh = [r for r in records if r.get('_observed_moment') is None
             or (now - r['_observed_moment']).total_seconds() <= STALE_AFTER_HOURS * 3600]
    return {
        'available': True,
        'stations': len(records),
        'districts': len({r['adm2_name'] for r in records}),
        'fresh_stations': len(fresh),
        'stale_stations': len(records) - len(fresh),
        'stale_after_hours': STALE_AFTER_HOURS,
        'reason': None if fresh else 'all supplied observations are older than the staleness threshold',
    }


def merge_into_rows(rows, records, *, now=None) -> dict:
    """Attach the hydrology stream to forecast rows, in place.

    Rows for districts with no station get `hydrology_severity: None` and
    `hydrology_available: false` — an explicit "unknown", never a 0 that reads as
    "no flooding". Returns the merge summary for the run report.
    """
    scores = district_scores(records, now=now) if records else {}
    state = stream_state(records, now=now)
    matched = 0
    for row in rows:
        district = resolve_district(row.get('district_name') or row.get('adm2_name'))
        entry = scores.get(district) if district else None
        if entry:
            matched += 1
            row['hydrology_severity'] = entry['hydrology_severity']
            row['hydrology_hazard'] = entry['hazard_class']
            row['hydrology_station'] = entry.get('worst_station')
            row['hydrology_exceedance_ratio'] = entry.get('exceedance_ratio')
            row['hydrology_trend'] = entry.get('trend')
            row['hydrology_available'] = True
            row['hydrology_stale'] = entry.get('stale', False)
        else:
            row['hydrology_severity'] = None
            row['hydrology_available'] = False
    return {
        'stream': 'w3-hydrology',
        'available': state['available'],
        'reason': state['reason'],
        'stations': state.get('stations', 0),
        'districts_with_station_data': len(scores),
        'rows_matched': matched,
        'rows_unmatched': len(rows) - matched,
        'stale_stations': state.get('stale_stations', 0),
    }
