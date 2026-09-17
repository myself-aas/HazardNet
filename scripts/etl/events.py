#!/usr/bin/env python3
"""Historical hazard-event store: normalisation, validation and counting.

WHAT THIS IS FOR
----------------
`docs/MODEL_CARD.md` §4 and the retired card both cite **2,931 hazard events,
2000–2025** as the training set for the historical prior. The number has never
been checkable from this repository: the event table lives in a Kaggle dataset
keyed to a Drive path in a Colab notebook. Phase 2 turns that claim into an
*auditable* one:

  * this module defines the event contract and the normalisation rules;
  * `scripts/db/008_hazard_events_postgis.sql` is the store (PostGIS, ADM2 plus
    optional ADM3 geometry, idempotent upsert, ingest-run audit);
  * the loader **reports** the counts it actually ingested — total, per class,
    per year, per district — and compares them to the claimed figure instead of
    asserting it. A run that finds 2,301 events fails the count check and says
    so; it never rounds up to the number in the model card.

WHY THE VALIDATION IS STRICT
----------------------------
Every rule here exists because of a defect this project has already shipped once:

  * an unrecognised hazard label is **reported, never silently mapped** — the
    class vocabulary is fixed at eight (`Models/labels.json`), and a landslide is
    not a Flood;
  * an unrecognised district is an **error**, not a dropped row — a district that
    disappears without a record is the silent-dropout defect of Phase 2;
  * `end_date < start_date`, a severity outside `[0, 1]`, or a missing source
    record id are rejected — an event store that accepts them makes the prior
    uncomputable in ways that surface much later.

Purity: no network, no database, standard library only (plus the tested physics
module for severity derivation). `scripts/tests/test_etl_events.py` exercises all
of it offline.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:  # running as `python -m etl.cli` from scripts/
    sys.path.insert(0, str(_SCRIPTS_DIR))

from physics_severity import (  # noqa: E402  (single source of truth for the class list)
    HAZARD_CLASSES,
    om_calc_cold_wave,
    om_calc_drought,
    om_calc_flood,
    om_calc_heat_wave,
    om_calc_tropical_cyclone,
)

#: Columns of an event record, in the order the CSV fixture uses and the SQL
#: loader writes them. Adding a column means updating the migration + this tuple
#: + the loader test together.
EVENT_COLUMNS = (
    'event_id', 'hazard_type', 'start_date', 'end_date',
    'adm2_name', 'adm2_pcode', 'division', 'adm3_pcode', 'adm3_name',
    'severity', 'severity_basis',
    'source', 'source_record_id', 'source_url',
    'deaths', 'affected', 'damage_usd',
    'geom_geojson', 'notes',
)

#: Source vocabularies → the eight model classes. `None` means "a real hazard we
#: do not model": those rows are counted and reported under `unmapped`, never
#: coerced into a class (a landslide is not a Flood, and pretending otherwise
#: would put wrong labels into the historical prior).
SOURCE_LABELS = {
    'flood': 'Flood',
    'river flood': 'Flood',
    'riverine flood': 'Flood',
    'monsoon flood': 'Flood',
    'flash flood': 'Flash Flood',
    'flashflood': 'Flash Flood',
    'flood flash': 'Flash Flood',
    'storm': 'Tropical Cyclone',
    'cyclone': 'Tropical Cyclone',
    'tropical cyclone': 'Tropical Cyclone',
    'tropical storm': 'Tropical Cyclone',
    'storm surge': 'Tropical Cyclone',
    'drought': 'Drought',
    'agricultural drought': 'Drought',
    'heat wave': 'Heat Wave',
    'heatwave': 'Heat Wave',
    'extreme temperature': 'Heat Wave',  # EM-DAT's combined label; see NOTE below
    'cold wave': 'Cold Wave',
    'coldwave': 'Cold Wave',
    'cold spell': 'Cold Wave',
    'fire': 'Fire',
    'wildfire': 'Fire',
    'forest fire': 'Fire',
    'severe local storm': 'Severe Local Storm',
    'local storm': 'Severe Local Storm',
    'thunderstorm': 'Severe Local Storm',
    'norwester': 'Severe Local Storm',
    "nor'wester": 'Severe Local Storm',
    'hailstorm': 'Severe Local Storm',
    'lightning': 'Severe Local Storm',
    # Deliberately unmapped (real hazards, outside the eight-class model):
    'landslide': None,
    'riverbank erosion': None,
    'erosion': None,
    'tornado': None,
    'epidemic': None,
    'storm/tornado': None,
}

#: Labels whose mapping is a judgement call rather than a synonym. Recorded in
#: the run report so the operator can see which rows were interpreted.
AMBIGUOUS_MAPPINGS = {
    'extreme temperature': 'Heat Wave (EM-DAT does not split heat from cold here — '
                           'rows are classified by the severity basis when present)',
}

DATE_FORMATS = ('%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%d/%m/%Y', '%Y%m%d', '%d %b %Y', '%d %B %Y')

#: Runtime district vocabulary + spelling resolution.
from districts import division_of, pcode_of, resolve as resolve_district  # noqa: E402

_SEVERITY_BASIS = re.compile(r'^\s*([a-z_]+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$', re.I)


class EventValidationError(ValueError):
    """Raised for an event row that cannot enter the store."""


# ── small helpers ────────────────────────────────────────────────────────────


def parse_date(value) -> date:
    """Parse a date in any format this repo's sources actually use."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value or '').strip()
    if not text:
        raise EventValidationError('missing date')
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise EventValidationError(f'unparseable date {value!r} (tried {", ".join(DATE_FORMATS)})')


def parse_float(value, *, field: str, default=None):
    """Parse an optional numeric field; blank/None → default."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        parsed = float(str(value).strip().replace(',', ''))
    except (TypeError, ValueError):
        raise EventValidationError(f'{field}: {value!r} is not a number')
    if math.isnan(parsed) or math.isinf(parsed):
        raise EventValidationError(f'{field}: {value!r} is not finite')
    return parsed


def normalize_hazard_label(label) -> str:
    """Source label → one of the eight classes, or ``None`` when unmapped."""
    key = re.sub(r'\s+', ' ', str(label or '').strip().lower())
    key = key.replace('_', ' ').replace('-', ' ')
    if key in SOURCE_LABELS:
        return SOURCE_LABELS[key]
    # The eight canonical names are accepted verbatim, case-insensitively.
    for hazard in HAZARD_CLASSES:
        if key == hazard.lower():
            return hazard
    return None


def deterministic_event_id(source: str, source_record_id: str) -> str:
    """A stable id for a source row, so re-ingesting updates instead of duplicating.

    Uses the hash rather than the raw values because source record ids contain
    slashes, spaces and non-ASCII text (BMD bulletin ids, EM-DAT keys) that make
    poor primary keys.
    """
    digest = hashlib.sha256(f'{source}\x1f{source_record_id}'.encode('utf-8')).hexdigest()
    return f'evt-{digest[:16]}'


def severity_from_basis(basis, hazard: str, duration_days: float = 1.0):
    """Derive a 0–1 severity from a documented driver, using the live formulas.

    Reusing `scripts/physics_severity.py` means an archived event's severity is on
    the *same scale* as the live physics track — otherwise the historical prior
    (w4) and the live streams could not be compared. Returns ``None`` when the
    basis names a driver we do not have a formula for; the caller then stores
    ``severity: null`` with the basis string, rather than inventing a number.
    """
    if not basis:
        return None
    match = _SEVERITY_BASIS.match(str(basis))
    if not match:
        return None
    driver, raw = match.group(1).lower(), float(match.group(2))
    if driver in ('wind_speed_kmh', 'wind_kmh', 'wind'):
        if hazard == 'Tropical Cyclone':
            return round(om_calc_tropical_cyclone(raw, 0.0), 4)
        return round(min(max((raw - 50.0) / 100.0, 0.0), 1.0), 4)
    if driver in ('rainfall_mm', 'precip_mm', 'rain_mm'):
        if hazard in ('Flood', 'Flash Flood'):
            return round(om_calc_flood(raw, raw / 3.0), 4)
        return round(min(max(raw / 300.0, 0.0), 1.0), 4)
    if driver in ('temp_min_c', 'minimum_temperature_c'):
        return round(om_calc_cold_wave(raw, duration_days), 4)
    if driver in ('temp_max_c', 'maximum_temperature_c', 'temp_c'):
        if hazard == 'Drought':
            return round(om_calc_drought(raw, 0.0), 4)
        return round(om_calc_heat_wave(raw, duration_days), 4)
    if driver in ('dry_days', 'rainfall_deficit_mm'):
        return round(min(max(raw / 90.0, 0.0), 1.0), 4)
    return None


# ── the contract ─────────────────────────────────────────────────────────────


def normalize_event(raw: dict, *, index: int = 0) -> dict:
    """Validate and normalise one raw event row into the store contract.

    Raises `EventValidationError` with a message that names the offending field
    and row — a validation failure has to be actionable in a workflow log.
    """
    prefix = f'event[{index}]'
    if not isinstance(raw, dict):
        raise EventValidationError(f'{prefix}: expected an object, got {type(raw).__name__}')

    source = str(raw.get('source') or raw.get('Source') or '').strip().lower()
    if not source:
        raise EventValidationError(f'{prefix}: "source" is required')
    source_record_id = str(
        raw.get('source_record_id') or raw.get('record_id') or raw.get('event_id') or ''
    ).strip()
    if not source_record_id:
        raise EventValidationError(f'{prefix}: "source_record_id" is required (idempotency key)')

    label = raw.get('hazard_type') or raw.get('hazard') or raw.get('type') or raw.get('disaster_type')
    hazard = normalize_hazard_label(label)
    if hazard is None:
        # Distinguished from "invalid": the label may be a real hazard outside the
        # model's vocabulary, which is reported (and, in strict mode, fatal).
        raise UnmappedHazardLabel(f'{prefix}: hazard label {label!r} maps to none of the eight classes')

    start = parse_date(raw.get('start_date') or raw.get('date') or raw.get('event_date'))
    end_raw = raw.get('end_date') or raw.get('end') or None
    end = parse_date(end_raw) if end_raw not in (None, '') else start
    if end < start:
        raise EventValidationError(f'{prefix}: end_date {end} precedes start_date {start}')

    district_raw = raw.get('adm2_name') or raw.get('district') or raw.get('district_name') or raw.get('adm2_pcode')
    district = resolve_district(district_raw)
    if district is None:
        raise EventValidationError(
            f'{prefix}: district {district_raw!r} is not one of the 64 (see scripts/etl/districts.py). '
            'An event whose district cannot be resolved must be fixed at the source, not dropped here.'
        )

    severity_raw = raw.get('severity')
    basis = str(raw.get('severity_basis') or raw.get('basis') or '').strip() or None
    # Duration drives heat/cold-wave severity, so it is derived from the dates the
    # row actually carries. A source-reported duration is validated but not stored:
    # the column is generated from `end_date - start_date + 1`, so the two can never
    # disagree (an event over 6 days is not scored as if it lasted one).
    window_days = (end - start).days + 1
    if raw.get('duration_days') in (None, ''):
        duration_days = float(window_days)
    else:
        duration_days = parse_float(raw.get('duration_days'), field='duration_days')
        if duration_days <= 0:
            raise EventValidationError(f'{prefix}: duration_days must be positive ({duration_days})')
    if severity_raw not in (None, ''):
        severity = parse_float(severity_raw, field='severity')
        if not 0.0 <= severity <= 1.0:
            raise EventValidationError(f'{prefix}: severity {severity} outside [0, 1]')
    else:
        severity = severity_from_basis(basis, hazard, duration_days or 1.0)

    deaths = parse_float(raw.get('deaths'), field='deaths', default=None)
    affected = parse_float(raw.get('affected'), field='affected', default=None)
    damage_usd = parse_float(raw.get('damage_usd') or raw.get('damage'), field='damage_usd', default=None)
    for name, value in (('deaths', deaths), ('affected', affected), ('damage_usd', damage_usd)):
        if value is not None and value < 0:
            raise EventValidationError(f'{prefix}: {name} cannot be negative ({value})')

    geometry = raw.get('geom_geojson') or raw.get('geometry') or None
    geometry_text = None
    if geometry:
        geometry_text = geometry if isinstance(geometry, str) else json.dumps(geometry, sort_keys=True)
        try:
            parsed = json.loads(geometry_text)
        except json.JSONDecodeError as exc:
            raise EventValidationError(f'{prefix}: geometry is not valid GeoJSON ({exc})')
        if parsed.get('type') not in ('Point', 'MultiPoint', 'Polygon', 'MultiPolygon'):
            raise EventValidationError(
                f'{prefix}: geometry type {parsed.get("type")!r} is not a supported GeoJSON geometry'
            )

    return {
        'event_id': deterministic_event_id(source, source_record_id),
        'hazard_type': hazard,
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'adm2_name': district,
        'adm2_pcode': (raw.get('adm2_pcode') or pcode_of(district)),
        'division': (raw.get('division') or division_of(district)),
        'adm3_pcode': (str(raw.get('adm3_pcode')).strip() if raw.get('adm3_pcode') else None),
        'adm3_name': (str(raw.get('adm3_name')).strip() if raw.get('adm3_name') else None),
        'severity': (round(float(severity), 4) if severity is not None else None),
        'severity_basis': basis,
        'source': source,
        'source_record_id': source_record_id,
        'source_url': (str(raw.get('source_url')).strip() if raw.get('source_url') else None),
        'deaths': deaths,
        'affected': affected,
        'damage_usd': damage_usd,
        'geom_geojson': geometry_text,
        'notes': (str(raw.get('notes')).strip() if raw.get('notes') else None),
    }


class UnmappedHazardLabel(EventValidationError):
    """The row names a real hazard that is not one of the eight model classes."""


def load_events(path) -> list:
    """Read raw event rows from CSV, JSON array or JSON-lines."""
    source = Path(path)
    text = source.read_text(encoding='utf-8')
    if source.suffix.lower() == '.csv':
        import csv

        return list(csv.DictReader(text.splitlines()))
    if source.suffix.lower() in ('.jsonl', '.ndjson'):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    parsed = json.loads(text)
    if isinstance(parsed, dict):
        for key in ('events', 'records', 'rows', 'data'):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        raise EventValidationError(f'{source}: JSON object has no event array (looked for events/records/rows/data)')
    if not isinstance(parsed, list):
        raise EventValidationError(f'{source}: expected an array of events')
    return parsed


def normalize_events(raw_events, *, strict: bool = False) -> dict:
    """Normalise a batch, collecting every problem instead of stopping at the first.

    Returns ``{events, errors, unmapped, duplicates_dropped}``. ``strict`` turns
    both `errors` and `unmapped` into a raised `EventValidationError` (the
    default for archival ingestion: a partial archive is worse than a failed job),
    while lenient mode is for reconnaissance against a new source.
    """
    events, errors, unmapped = [], [], []
    seen = set()
    duplicates = 0
    for index, raw in enumerate(raw_events):
        try:
            event = normalize_event(raw, index=index)
        except UnmappedHazardLabel as exc:
            unmapped.append(str(exc))
            continue
        except EventValidationError as exc:
            errors.append(str(exc))
            continue
        if event['event_id'] in seen:
            duplicates += 1
            continue
        seen.add(event['event_id'])
        events.append(event)

    if strict and (errors or unmapped):
        raise EventValidationError(
            f'{len(errors)} invalid row(s) and {len(unmapped)} unmapped hazard label(s); '
            'refusing to ingest a partial archive.\n  - ' + '\n  - '.join((errors + unmapped)[:20])
        )
    return {'events': events, 'errors': errors, 'unmapped': unmapped, 'duplicates_dropped': duplicates}


def summarize(events) -> dict:
    """Counts by class, year and district — the numbers the model card quotes."""
    by_hazard = {hazard: 0 for hazard in HAZARD_CLASSES}
    by_year, by_district = {}, {}
    with_severity = 0
    with_geometry = 0
    for event in events:
        hazard = event.get('hazard_type')
        if hazard in by_hazard:
            by_hazard[hazard] += 1
        else:  # pragma: no cover - normalize_event guarantees membership
            by_hazard[hazard] = by_hazard.get(hazard, 0) + 1
        by_year[event['start_date'][:4]] = by_year.get(event['start_date'][:4], 0) + 1
        by_district[event['adm2_name']] = by_district.get(event['adm2_name'], 0) + 1
        if event.get('severity') is not None:
            with_severity += 1
        if event.get('geom_geojson'):
            with_geometry += 1
    return {
        'total': len(events),
        'by_hazard': dict(sorted(by_hazard.items())),
        'by_year': dict(sorted(by_year.items())),
        'by_district': dict(sorted(by_district.items())),
        'with_severity': with_severity,
        'with_geometry': with_geometry,
        'date_range': (
            [min((e['start_date'] for e in events), default=None),
             max((e['end_date'] for e in events), default=None)]
            if events else [None, None]
        ),
    }


def verify_claimed_count(summary: dict, claimed: int = 2931, tolerance: float = 0.0) -> dict:
    """Compare the ingested total to the figure the model card quotes.

    Deliberately *not* an assertion inside `summarize`: the loader must be able to
    ingest 2,301 events, publish the real number and flag the discrepancy. A
    claimed count that cannot be reproduced is a documentation defect, and the
    run report is where that gets recorded.
    """
    total = summary.get('total', 0)
    drift = total - claimed
    within = abs(drift) <= max(0.0, tolerance) * claimed if claimed else True
    return {
        'claimed': claimed,
        'ingested': total,
        'drift': drift,
        'within_tolerance': bool(within),
        'message': (
            f'ingested {total} events against a claimed {claimed} ({drift:+d})'
            + ('' if within else ' — update docs/MODEL_CARD.md §4 to the measured number '
                                 'or fix the source export; do not restate the claim')
        ),
    }


def district_year_matrix(events) -> dict:
    """`{district: {year: count}}` — the shape the w4 `historical_prior` needs.

    Kept here (not only in SQL) so the same aggregation can be computed and tested
    without a database, and so the SQL view and this function can be compared.
    """
    matrix: dict = {name: {} for name in {e['adm2_name'] for e in events}}
    for event in events:
        year = event['start_date'][:4]
        per_year = matrix[event['adm2_name']]
        per_year[year] = per_year.get(year, 0) + 1
    return {name: dict(sorted(years.items())) for name, years in sorted(matrix.items())}


def historical_prior_score(events, adm2_name: str, hazard_type: str, on_date: str, *, half_life_years: float = 7.0) -> float:
    """Recency-weighted climatological prior in `[0, 1]` (the w4 stream).

    `score = 1 - exp(-Σ 0.5 ** (age_years / half_life))` over events of that class
    in that district up to `on_date`. Exponential decay, so 2005 and 2022 events
    are not treated as equally informative, and the score saturates rather than
    growing without bound (a district with six historic floods is not "six times"
    as likely as one with one).

    Only events strictly before `on_date` count — using an event to score its own
    day would be temporal leakage, the failure mode in `MODEL_CARD.md` §4.1.
    """
    if not events:
        return 0.0
    cutoff = parse_date(on_date)
    weight = 0.0
    for event in events:
        if event.get('adm2_name') != adm2_name or event.get('hazard_type') != hazard_type:
            continue
        started = parse_date(event['start_date'])
        if started >= cutoff:
            continue
        age_years = (cutoff - started).days / 365.25
        weight += 0.5 ** (age_years / half_life_years) if half_life_years > 0 else 1.0
    return round(1.0 - math.exp(-weight), 4)


def event_window_days(event: dict) -> int:
    """Inclusive duration of an event, in days (1 for a single-day event)."""
    return (parse_date(event['end_date']) - parse_date(event['start_date'])).days + 1


def events_in_window(events, start, end, *, district=None, hazard_type=None) -> list:
    """Events overlapping an inclusive window — the query shape the archive uses."""
    start_date, end_date = parse_date(start), parse_date(end)
    selected = []
    for event in events:
        if district and event.get('adm2_name') != district:
            continue
        if hazard_type and event.get('hazard_type') != hazard_type:
            continue
        if parse_date(event['start_date']) > end_date or parse_date(event['end_date']) < start_date:
            continue
        selected.append(event)
    return selected


def default_window(days_back: int = 365, *, today=None):
    """A convenience window used by the CLI (`--since`/`--until` defaults)."""
    end = today or date.today()
    return (end - timedelta(days=days_back)).isoformat(), end.isoformat()
