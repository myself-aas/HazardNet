#!/usr/bin/env python3
"""Fetch the daily forecast off Kaggle, put it in the repository's schema, and say what it did.

WHY THIS EXISTS
---------------
The forecast is produced on Kaggle, on a schedule, by
`ml/hazardnet-auto-forecast-pipeline.ipynb`: Earth Engine imagery + Open-Meteo drivers
+ the deployed TFLite model, one row per district per horizon. Kaggle has the Earth
Engine service account attached; a GitHub runner does not. So the daily job here does
not *generate* anything — it fetches what the notebook produced, checks it, translates
it into the schema the site and the store read, and commits.

THE TWO SHAPES, AND WHY ONE OF THEM IS A TRANSLATION
-----------------------------------------------------
The notebook's output CSV (`hazardnet_advisories_latest.csv`) is an *advisory* table:

    district, division, horizon, hazard, confidence, cnn_severity, physics_severity,
    final_severity, advisory_tier, target_date, om_max_temp_c, om_min_temp_c,
    om_precip_mm, om_wind_kmh

Everything downstream — `backend/utils/forecastRow.js`, `scripts/validate_forecasts.py`,
`scripts/build_forecast_snapshot.mjs`, the district pages — reads the repository's
canonical row:

    district_id, district_name, division, pcode, horizon, hazard_type, model_severity,
    physics_severity, confidence, target_date, prediction_date, data_source, …

The gap is not cosmetic. Three canonical fields the advisory table does not carry at
all, and each is filled from evidence rather than invention:

* `district_id` / `pcode` — from an identity table (`--identity-csv`, by default the
  last canonical artifact this repository published) matched on the **exact** district
  name. Exact on purpose: a fuzzy match could attach a forecast row to the wrong
  district, which is the one failure a district page must not have — the same rule
  `DISTRICT_ALIASES` in scripts/build_content_engine.mjs is kept explicit for. A name
  the table does not know is reported and its rows are dropped, never guessed.
* `prediction_date` — derived as `target_date − horizon_days`, then cross-checked:
  every row must agree on one date, because the notebook stamps `target_date =
  today + days` and a run that straddles midnight would otherwise publish two
  "todays". A disagreement fails the fetch rather than picking one.
* `data_source` — `Kaggle_Advisory_Pipeline`, so a published row names the producer
  that actually made it.

`cnn_severity` maps to `model_severity` and `physics_severity` passes through, which is
the dual-track pair the ingest contract already accepts. The notebook's blended
`final_severity` and its `advisory_tier` are **not** written into the rows: publishing a
blend as `severity_score` would silently change what "severity" means on every surface
that reads it (the snapshot takes `severity_score ?? model_severity`), and the composite
phrases are embargoed in public copy (ADR 0012, `npm run check:embargo`). They are
recorded in the manifest instead — counts per tier, the maximum blend — so the
notebook's own advisory decision stays auditable without entering the row schema.

When the notebook is updated to emit the canonical columns itself (this repository's
copy of it already does), the translation is a no-op: the shape is detected per file and
reported, and a canonical pull is passed through untouched apart from validation.

CONTRACT
--------
Prints `CHANGED=true|false` (the last line the workflows grep), writes the CSV, the
typed JSON sidecar and the manifest, and sets `changed` / `rows` / `shape` /
`districts` / `unmatched` as step outputs. Exit 0 on a published or unchanged pull, 1 on
anything that must stop the day's publication: no CSV, a shape this script does not
know, a failed sanity check, an unresolved district, a split prediction date.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent

VALID_HAZARDS = {
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
}

#: Canonical meteorological columns — mirrors backend/utils/forecastRow.js
#: METEOROLOGICAL_FIELDS. They must be NUMBERS in the JSON sidecar: the ingest path
#: drops non-numeric values, and the committed sidecar is the auditable record of what
#: the producer actually said. (Found 2026-09-16: these arrived as strings "27.5" from
#: every producer, because the converter's numeric allowlist only covered the
#: severity/confidence columns and the legacy om_*.)
METEOROLOGICAL_FIELDS = (
    'temperature_mean', 'temperature_max', 'temperature_min',
    'precipitation_mm', 'wind_max_kmh', 'dewpoint_mean',
    'solar_radiation_mj_m2', 'evapotranspiration_mm',
)

NUMERIC_FIELDS = (
    'model_severity', 'physics_severity', 'severity_score', 'confidence',
    'severity', 'latitude', 'longitude', 'track_divergence',
    *METEOROLOGICAL_FIELDS,
)

#: Columns the pipeline writes as Python/CSV booleans. The JSON sidecar is consumed by
#: stores and by the snapshot builder, so they are typed here rather than left as the
#: strings 'True'/'False' (audit 2026-09-17).
BOOLEAN_FIELDS = ('physics_agreement', 'soil_channels_fabricated')

#: Per-class physics scores (`physics_flash_flood`, …) are numeric; the other
#: `physics_*` columns are not. An empty score means "not computed for this row" and
#: must stay null rather than becoming a 0.0 that reads as "no hazard".
PHYSICS_PREFIX = 'physics_'
PHYSICS_NON_NUMERIC = ('physics_top_hazard', 'physics_agreement', 'physics_inputs_missing')

#: The canonical row, in the order the committed artifact carries it. A pulled CSV that
#: already has these is passed through; the advisory shape is mapped onto them.
CANONICAL_COLUMNS = (
    'district_id', 'district_name', 'division', 'pcode', 'horizon', 'hazard_type',
    'model_severity', 'physics_severity', 'confidence', 'target_date', 'prediction_date',
    'data_source', *METEOROLOGICAL_FIELDS,
    'om_temp_2m_k', 'om_max_temp_k', 'om_min_temp_k', 'om_dewpoint_k',
    'om_precip_m', 'om_wind_max_ms', 'om_solar_rad_j', 'om_et_sum_m',
)

#: What the advisory table calls each canonical field. Absent canonical fields are
#: derived (district identity, prediction_date) or left empty — never invented: an empty
#: `dewpoint_mean` is honest, a plausible one is not.
ADVISORY_MAP = {
    'hazard_type': 'hazard',
    'model_severity': 'cnn_severity',
    'physics_severity': 'physics_severity',
    'confidence': 'confidence',
    'target_date': 'target_date',
    'horizon': 'horizon',
    'division': 'division',
    'temperature_max': 'om_max_temp_c',
    'temperature_min': 'om_min_temp_c',
    'precipitation_mm': 'om_precip_mm',
    'wind_max_kmh': 'om_wind_kmh',
}

#: The advisory table's drivers are Celsius / millimetres / km h⁻¹; the canonical om_*
#: columns are the Open-Meteo SI block (kelvin, metres, m s⁻¹). Conversions, not
#: guesses — and the three the notebook does not fetch (dewpoint, radiation, ET) stay
#: empty rather than being estimated from the ones it did.
ADVISORY_OM_CONVERSIONS = {
    'om_max_temp_k': ('om_max_temp_c', lambda c: c + 273.15),
    'om_min_temp_k': ('om_min_temp_c', lambda c: c + 273.15),
    'om_precip_m': ('om_precip_mm', lambda mm: mm / 1000.0),
    'om_wind_max_ms': ('om_wind_kmh', lambda kmh: kmh / 3.6),
}

HORIZON_DAYS = {'7_days': 7, '15_days': 15, '3_days': 3, '30_days': 30}

#: Names the notebook may write its output under, in preference order. The advisory
#: pipeline calls it `hazardnet_advisories_latest.csv`; the runner-native generator
#: called it `hazardnet_forecasts_latest.csv`. Choosing by glob order was how a second
#: CSV in the kernel output could silently become the day's forecast.
PREFERRED_CSV_NAMES = (
    'hazardnet_forecasts_latest.csv',
    'hazardnet_advisories_latest.csv',
)

DATA_SOURCE = 'Kaggle_Advisory_Pipeline'


def compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with file_path.open('rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def github_output(key: str, value: Any) -> None:
    print(f'{key}={value}')
    sink = os.environ.get('GITHUB_OUTPUT')
    if sink:
        with open(sink, 'a', encoding='utf-8') as handle:
            handle.write(f'{key}={value}\n')


def parse_value(val):
    if val is None or val == '':
        return None
    try:
        if '.' in str(val) or 'e' in str(val).lower():
            return float(val)
        return int(val)
    except ValueError:
        return str(val)


def convert_csv_to_json_records(csv_path: Path) -> list[dict]:
    records = []
    with csv_path.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed_row = {}
            for k, v in row.items():
                if k in ('district_id', 'location_id'):
                    parsed_row[k] = int(v) if v else 0
                elif k in BOOLEAN_FIELDS:
                    text = (v or '').strip().lower()
                    if text in ('true', 'false'):
                        parsed_row[k] = text == 'true'
                    else:
                        parsed_row[k] = None if text == '' else v
                elif k.startswith(PHYSICS_PREFIX) and k not in PHYSICS_NON_NUMERIC:
                    try:
                        parsed_row[k] = float(v)
                    except (ValueError, TypeError):
                        parsed_row[k] = None
                elif k in NUMERIC_FIELDS or k.startswith('om_'):
                    # An absent measurement is null, never 0.0: `om_dewpoint_k: 0.0`
                    # reads as 0 kelvin and `solar_radiation_mj_m2: 0.0` as a sunless
                    # day, and the advisory producer genuinely does not fetch either.
                    # Same rule the snapshot builder already applies ("an absent number
                    # is never rendered as 0") and the physics_* block above.
                    text = (v or '').strip()
                    if text == '':
                        parsed_row[k] = None
                    else:
                        try:
                            parsed_row[k] = float(text)
                        except ValueError:
                            print(f'::warning::JSON sidecar: {k}={v!r} is not a number; recorded as null')
                            parsed_row[k] = None
                else:
                    parsed_row[k] = v
            records.append(parsed_row)
    return records


# ── the download ─────────────────────────────────────────────────────────────


def download(kernel: str, dest: Path, attempts: int, retry_delay: int, file_pattern: str | None) -> str:
    """`kaggle kernels output`, retried, with the CLI's own answer kept for triage.

    The stderr is the diagnosis: 401 is the token, 403 is a token that does not own the
    kernel, 404 is a slug that moved, and "Kernel has never been run" needs one run from
    the Kaggle UI. docs/ops/kaggle-pipeline-triage.md is the decision table.
    """
    cmd = ['kaggle', 'kernels', 'output', kernel, '-p', str(dest)]
    if file_pattern:
        cmd += ['--file-pattern', file_pattern]
    last = ''
    for attempt in range(1, attempts + 1):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except FileNotFoundError:
            return 'the `kaggle` CLI is not installed (pip install -r scripts/requirements-pipeline.txt)'
        except subprocess.TimeoutExpired:
            last = f'attempt {attempt}/{attempts}: timed out after 900 s'
        else:
            if res.returncode == 0:
                return ''
            last = f'attempt {attempt}/{attempts}: exit {res.returncode}: {(res.stderr or res.stdout).strip()}'
        print(f'  kaggle {" ".join(cmd)} → {last}', file=sys.stderr)
        if attempt < attempts:
            time.sleep(retry_delay)
    return last


def choose_csv(dest: Path) -> tuple[Path | None, list[str]]:
    """The CSV to publish, chosen by name and reported — never by glob order."""
    for name in PREFERRED_CSV_NAMES:
        hit = dest / name
        if hit.is_file():
            return hit, [name]
    found = sorted(p.name for p in dest.glob('*.csv'))
    if len(found) == 1:
        return dest / found[0], found
    if not found:
        return None, []
    # More than one CSV and none of them a name this pipeline knows: picking one would
    # be a guess about which producer wrote the day's forecast.
    return None, found


# ── the district identity table ──────────────────────────────────────────────


def identity_from_head(csv_out: Path) -> dict[str, dict[str, str]]:
    """The identity the *committed* artifact carries, as a floor under the working copy.

    The default identity source is the CSV this script is about to overwrite, which is
    self-sustaining but erodes: a day when the notebook reports fewer districts would
    drop them from the table, and the next day they could not come back. `git show
    HEAD:<path>` is the published record, so the union of the two can only grow. Best
    effort — no git, no HEAD copy, or a detached checkout all just yield nothing.
    """
    try:
        text = subprocess.run(
            ['git', 'show', f'HEAD:{csv_out}'], capture_output=True, text=True, timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {}
    if text.returncode != 0 or not text.stdout.strip():
        return {}
    table: dict[str, dict[str, str]] = {}
    reader = csv.DictReader(text.stdout.splitlines())
    for row in reader:
        name = (row.get('district_name') or '').strip()
        if name and name not in table:
            table[name] = {
                'district_id': (row.get('district_id') or '').strip(),
                'pcode': (row.get('pcode') or '').strip(),
                'division': (row.get('division') or '').strip(),
            }
    return table


_REFERENCE = None
_REFERENCE_TRIED = False


def reference_districts():
    """`scripts/etl/districts.py` — the repository's 64-district validation snapshot.

    It carries every district's pcode and division under the current spelling, plus the
    tested `resolve()` that maps the FAO GAUL 2015 spellings the Kaggle producer writes
    ("Chittagong", "Comilla", "Jessore") onto them. Using it here rather than a second
    hardcoded alias list is the point: `scripts/tests/test_district_name_parity.py`
    already fails when that table drifts from the frontend's, so this bridge inherits a
    guard it does not have to write.

    Returns None when the module cannot be imported (running the script from outside the
    repository, say); every caller treats that as "no second opinion available".
    """
    global _REFERENCE, _REFERENCE_TRIED
    if not _REFERENCE_TRIED:
        _REFERENCE_TRIED = True
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))
        try:
            from etl import districts as reference
            _REFERENCE = reference
        except ImportError:
            _REFERENCE = None
    return _REFERENCE


def normalize_name(name: str) -> str:
    """Lowercase, letters and digits only — `etl.districts._normalize`'s rule."""
    return ''.join(ch for ch in str(name or '').lower() if ch.isalnum())


def lookup_identity(name: str, identity: dict[str, dict[str, str]]) -> dict[str, str] | None:
    """The identity record for a district name, or None.

    Exact match first, then the repository's tested resolver (GAUL 2015 → current
    spelling), then a punctuation-insensitive match. The chain stops at "no record":
    a district that cannot be identified is dropped and reported by the caller, because
    the alternative is giving one district another district's pcode.
    """
    if name in identity:
        return identity[name]
    reference = reference_districts()
    if reference is not None:
        canonical = reference.resolve(name)
        if canonical and canonical in identity:
            return identity[canonical]
    needle = normalize_name(name)
    if needle:
        for key, record in identity.items():
            if normalize_name(key) == needle:
                return record
    return None


def extend_identity_with_reference(
    identity: dict[str, dict[str, str]],
) -> tuple[list[str], list[str]]:
    """Add the districts the published artifact does not carry. Returns (added, problems).

    Why this is needed: the identity table is read from the last published CSV, and that
    artifact is whatever the previous producer managed to write. On 2026-09-19 it carried
    60 of the 64 districts — the runner-side generator had dropped Bandarban, Barisal,
    Jhenaidah and Khagrachhari — so a pull that faithfully translated the notebook's 64
    rows would have published 60 and reported the other four as unmatchable. Coverage
    would have been capped by an unrelated failure, permanently.

    `district_id` is the one field the snapshot does not carry, and it is not invented
    here either: both producers enumerate FAO GAUL ADM2 sorted by name and number them
    from 1, so an id is a district's position in that sorted vocabulary. That rule is
    *checked* against every id the published artifact already carries before it is used
    for a single new one, and the derivation is refused when it does not reproduce them.
    """
    reference = reference_districts()
    if reference is None:
        return [], [
            'scripts/etl/districts.py could not be imported, so districts the published '
            'artifact does not carry cannot be resolved from the 64-district snapshot'
        ]
    published = {name: record for name, record in identity.items() if 'alias_of' not in record}
    covered = {reference.resolve(name) for name in published}
    covered.discard(None)
    missing = [name for name in reference.NAMES if name not in covered]
    if not missing:
        return [], []

    # The vocabulary is the artifact's own spellings plus the snapshot's names for the
    # districts it lacks. Both producers number districts by position in the sorted FAO
    # GAUL ADM2 vocabulary, and for every district missing from a 60-district artifact the
    # two spellings coincide — which the conflict check below is what proves, rather than
    # an assumption this function is allowed to make.
    vocabulary = sorted(set(published) | set(missing))
    derived = {name: index + 1 for index, name in enumerate(vocabulary)}
    conflicts = [
        (name, record.get('district_id'), str(derived[name]))
        for name, record in published.items()
        if record.get('district_id') and record['district_id'] != str(derived[name])
    ]
    if conflicts:
        example = ', '.join(f'{name}: published {got} vs derived {want}'
                            for name, got, want in conflicts[:3])
        return [], [
            f'the GAUL id rule (position in the sorted 64-name vocabulary) does not '
            f'reproduce {len(conflicts)} published district_id(s) — {example}. Refusing to '
            f'derive ids for {", ".join(missing)}; those rows will be dropped and reported.'
        ]

    added = []
    for name in missing:
        identity[name] = {
            'district_id': str(derived[name]),
            'pcode': reference.pcode_of(name) or '',
            'division': reference.division_of(name) or '',
        }
        added.append(name)
    return added, []


def load_identity(path: Path) -> tuple[dict[str, dict[str, str]], list[str]]:
    """`district name → {district_id, pcode, division}` from a canonical artifact.

    The default source is the last canonical CSV this repository published, which is
    real data with real identifiers rather than a table somebody typed. Returns
    (table, problems); a missing or unreadable table is a problem, not an exception, so
    the caller decides whether the day's pull can proceed without it.
    """
    if not path.is_file():
        return {}, [f'identity table {path} does not exist']
    table: dict[str, dict[str, str]] = {}
    problems: list[str] = []
    with path.open('r', encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        fields = set(reader.fieldnames or ())
        if not {'district_name', 'district_id', 'pcode'} <= fields:
            return {}, [f'identity table {path} has no district_name/district_id/pcode columns']
        for row in reader:
            name = (row.get('district_name') or '').strip()
            if not name or name in table:
                continue
            table[name] = {
                'district_id': (row.get('district_id') or '').strip(),
                'pcode': (row.get('pcode') or '').strip(),
                'division': (row.get('division') or '').strip(),
            }
    # The artifact carries FAO GAUL 2015 spellings ("Chittagong", "Jessore") while the
    # site and the event store use the current ones ("Chattogram", "Jashore"). Both
    # spellings get an entry, through the resolver `scripts/etl/districts.py` already
    # tests against the frontend's alias table — not through a second list kept here.
    reference = reference_districts()
    if reference is not None:
        for name in list(table):
            canonical = reference.resolve(name)
            if canonical and canonical not in table:
                # A marked copy, not the same object: `extend_identity_with_reference`
                # derives GAUL ids from the artifact's own spellings, and a table that
                # carried both spellings of one district would number 71 districts.
                table[canonical] = dict(table[name], alias_of=name)
    if not table:
        problems.append(f'identity table {path} carried no districts')
    return table, problems


def detect_shape(fieldnames: set[str]) -> str:
    if {'district_id', 'hazard_type', 'prediction_date'} <= fieldnames:
        return 'canonical'
    if {'district', 'hazard', 'target_date'} <= fieldnames:
        return 'advisory'
    return 'unknown'


def derive_prediction_date(rows: list[dict]) -> tuple[str | None, list[str]]:
    """`target_date − horizon_days`, cross-checked across every row."""
    derived: dict[str, int] = {}
    problems: list[str] = []
    for index, row in enumerate(rows, start=1):
        horizon = (row.get('horizon') or '').strip()
        target = (row.get('target_date') or '').strip()
        days = HORIZON_DAYS.get(horizon)
        if days is None:
            problems.append(f'row {index}: horizon {horizon!r} is not one of {sorted(HORIZON_DAYS)}')
            continue
        try:
            when = date.fromisoformat(target)
        except ValueError:
            problems.append(f'row {index}: target_date {target!r} is not an ISO date')
            continue
        stamp = (when - timedelta(days=days)).isoformat()
        derived[stamp] = derived.get(stamp, 0) + 1
    if problems:
        return None, problems
    if not derived:
        return None, ['no row carried a horizon and a target_date, so the run date cannot be derived']
    if len(derived) > 1:
        spread = ', '.join(f'{k} ({v} rows)' for k, v in sorted(derived.items()))
        return None, [f'rows disagree about the date they were produced: {spread}']
    return next(iter(derived)), []


def translate_advisory(
    rows: list[dict],
    identity: dict[str, dict[str, str]],
    prediction_date: str,
) -> tuple[list[dict], list[str], dict[str, Any]]:
    """Advisory rows → canonical rows. Returns (rows, problems, advisory_summary)."""
    problems: list[str] = []
    translated: list[dict] = []
    unmatched: dict[str, int] = {}
    tiers: dict[str, int] = {}
    max_blend = 0.0

    for index, row in enumerate(rows, start=2):  # header is line 1
        name = (row.get('district') or '').strip()
        known = lookup_identity(name, identity)
        if not known:
            unmatched[name] = unmatched.get(name, 0) + 1
            continue
        hazard = (row.get('hazard') or '').strip()
        if hazard not in VALID_HAZARDS:
            problems.append(f'line {index}: hazard {hazard!r} is not one of the {len(VALID_HAZARDS)} model classes')
            continue

        out: dict[str, Any] = {column: '' for column in CANONICAL_COLUMNS}
        out.update({
            'district_id': known['district_id'],
            'district_name': name if name in identity else known.get('district_name', name),
            'division': (row.get('division') or known['division'] or '').strip(),
            'pcode': known['pcode'],
            'horizon': (row.get('horizon') or '').strip(),
            'prediction_date': prediction_date,
            'data_source': DATA_SOURCE,
        })
        for canonical, source in ADVISORY_MAP.items():
            if canonical in out and out[canonical] != '':
                continue
            value = row.get(source)
            out[canonical] = '' if value is None else str(value).strip()
        out['district_name'] = name
        for canonical, (source, convert) in ADVISORY_OM_CONVERSIONS.items():
            raw = row.get(source)
            try:
                out[canonical] = '' if raw in (None, '') else f'{convert(float(raw)):.6g}'
            except (TypeError, ValueError):
                problems.append(f'line {index}: {source}={raw!r} is not a number')

        tier = (row.get('advisory_tier') or '').strip()
        if tier:
            tiers[tier] = tiers.get(tier, 0) + 1
        try:
            max_blend = max(max_blend, float(row.get('final_severity') or 0.0))
        except (TypeError, ValueError):
            pass
        translated.append(out)

    for name, count in sorted(unmatched.items()):
        problems.append(
            f'{count} row(s) name district {name!r}, which the identity table does not carry — '
            'dropped rather than matched by guesswork'
        )
    summary = {
        'advisory_tiers': tiers,
        'max_final_severity': round(max_blend, 6),
        'unmatched_districts': sorted(unmatched),
        'unmatched_rows': sum(unmatched.values()),
    }
    return translated, problems, summary


def coverage_tally(
    source_rows: list[dict],
    records: list[dict],
    district_names: list[str],
) -> dict[str, Any]:
    """What the producer asked for, what survived the bridge, and what is missing.

    The coverage gate in `scripts/validate_forecasts.py` exists because the runner-side
    generator silently skipped districts whose Earth Engine fetch failed, so a
    25-of-64 run looked identical to a complete one (audit 2026-09-17). A pull inherits
    that risk from the other side: the notebook skips a district when its spatial stack
    or its Open-Meteo call fails, and nothing in its CSV says so — the row is simply
    absent. So `requested` is the district vocabulary the pipeline is supposed to cover
    (the 64-district snapshot when it is importable, else the source's own districts)
    times the horizons the source used, and `produced` is the rows published.

    A partial run is allowed; an unlabelled one is not.
    """
    horizons = sorted({(row.get('horizon') or '').strip() for row in source_rows} - {''})
    reference = reference_districts()
    vocabulary = list(reference.NAMES) if reference is not None else sorted(district_names)
    requested_districts = len(vocabulary)
    requested_units = requested_districts * max(len(horizons), 1)
    produced_units = len(records)

    produced_names = set(district_names)
    if reference is not None:
        # The producer writes GAUL spellings ("Chittagong"); the vocabulary is written in
        # the current ones ("Chattogram"). Compare through the tested resolver rather than
        # by string, or every renamed district looks missing.
        produced_canonical = {reference.resolve(name) for name in produced_names}
        produced_canonical.discard(None)
        missing = sorted(name for name in vocabulary if name not in produced_canonical)
    else:
        missing = []
    per_horizon = {
        horizon: {
            'requested': requested_districts,
            'produced': sum(1 for record in records if record.get('horizon') == horizon),
        }
        for horizon in horizons
    }
    complete = produced_units == requested_units and not missing
    return {
        'status': 'complete' if complete else 'partial',
        'requested_districts': requested_districts,
        'requested_units': requested_units,
        'produced_units': produced_units,
        'districts_with_any_horizon': len(produced_names),
        'per_horizon': per_horizon,
        'missing_districts': missing,
        'district_vocabulary': 'scripts/etl/districts.py (64)' if reference is not None
                               else 'the pulled rows themselves',
    }


def model_provenance(repo_root: Path) -> dict[str, Any]:
    """The model version the repository has promoted, labelled as exactly that.

    The daily forecast is produced on Kaggle, and the notebook loads its TFLite from the
    `hazardnet-model-conversion` Kaggle output — not from this repository. So the honest
    provenance a pull can carry is the version the repository promotes (which is what the
    owner last merged), plus an explicit statement that the executed bytes were not
    verified from here. Recording that is better than recording nothing: the validator
    requires model provenance, and a field that says "unverified" cannot be mistaken for
    an attestation the way a bare version string can.
    """
    doc = read_json_any(repo_root / 'Models' / 'VERSION.json') or {}
    artifacts = {entry.get('name'): entry for entry in doc.get('artifacts') or []
                 if isinstance(entry, dict)}
    fp32 = artifacts.get('hazardnet_fp32.tflite') or {}
    return {
        'model_version': doc.get('version'),
        'model_sha256': fp32.get('sha256'),
        'model_version_source': 'repository Models/VERSION.json at pull time',
        'model_bytes_verified': False,
        'model_note': (
            'the Kaggle notebook loads its TFLite from the hazardnet-model-conversion '
            'Kaggle output, not from this repository; updating Models/ here does not '
            'change what Kaggle infers with until that output is refreshed '
            '(docs/mlops/RETRAIN_AND_PROMOTION.md)'
        ),
    }


def read_json_any(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def repo_relative(path: Path, repo_root: Path) -> str:
    """A repo-relative path when the artifact is inside the repository, else absolute.

    The committed manifest carries `backend/data/forecasts/...`; an absolute runner path
    in a committed file is noise that changes on every machine.
    """
    try:
        return str(path.resolve().relative_to(repo_root.resolve()))
    except ValueError:
        return str(path)


def sanity_check(csv_path: Path) -> tuple[bool, str]:
    with csv_path.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        rows = list(reader)

    if not rows:
        return False, 'CSV contains zero rows'

    has_severity = ('model_severity' in fieldnames or 'severity_score' in fieldnames)
    if not has_severity:
        return False, 'Missing severity column'

    has_district_or_loc = ('district_id' in fieldnames or 'location_id' in fieldnames)
    if not has_district_or_loc:
        return False, 'Missing location/district identifier'

    for i, row in enumerate(rows):
        hazard = (row.get('hazard_type') or '').strip()
        if hazard not in VALID_HAZARDS:
            return False, f"Row {i + 1} has invalid hazard_type: '{hazard}'"

    return True, f'sanity check passed ({len(rows)} rows)'


def markdown_summary(payload: dict[str, Any]) -> str:
    lines = [
        '#### Kaggle forecast pull',
        '',
        f"* kernel: `{payload['kernel']}`",
        f'* source file: `{payload["source_file"]}`',
        f"* shape: **{payload['shape']}**"
        + ('' if payload['shape'] != 'advisory' else ' (translated into the canonical row schema)'),
        f"* rows: {payload['row_count']} across {payload['district_count']} districts",
        f"* prediction date: {payload['prediction_date']}"
        + ('' if payload['shape'] != 'advisory' else ' (derived as `target_date − horizon`)'),
        f'* fetched: {payload["fetched_at"]}',
        f'* changed since the committed artifact: **{payload["changed"]}**',
    ]
    coverage = payload.get('coverage') or {}
    if coverage:
        lines.append(
            f"* coverage: **{coverage['status']}** — {coverage['produced_units']} of "
            f"{coverage['requested_units']} requested units "
            f"({coverage['districts_with_any_horizon']} districts, vocabulary: "
            f"{coverage['district_vocabulary']})"
        )
        if coverage.get('missing_districts'):
            missing = coverage['missing_districts']
            lines.append(
                f"* ::warning:: the producer reported no row for {len(missing)} district(s): "
                + ', '.join(missing[:10])
                + ('' if len(missing) <= 10 else f' … and {len(missing) - 10} more')
            )
    advisory = payload.get('advisory') or {}
    if advisory.get('advisory_tiers'):
        tiers = ', '.join(f'{k}: {v}' for k, v in sorted(advisory['advisory_tiers'].items()))
        lines.append(f"* the notebook's own advisory tiers (recorded, not published as rows): {tiers}")
    if advisory.get('unmatched_rows'):
        lines.append(
            f"* ::warning:: {advisory['unmatched_rows']} row(s) dropped for districts the identity table "
            f"does not carry: {', '.join(advisory['unmatched_districts'][:8])}"
        )
    return '\n'.join(lines) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--dest', default='data/kaggle_notebook_output')
    parser.add_argument('--csv-out', default='backend/data/forecasts/hazardnet_forecasts_latest.csv')
    parser.add_argument('--json-out', default='backend/data/forecasts/hazardnet_forecasts_latest.json')
    parser.add_argument('--manifest', default='backend/data/forecasts/manifest.json')
    parser.add_argument('--kernel', default=os.environ.get(
        'KAGGLE_KERNEL', 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline'))
    parser.add_argument('--file-pattern', default=r'.*\.csv$',
                        help='only download matching files from the kernel output')
    parser.add_argument('--identity-csv', default=None,
                        help='canonical CSV to take district_id/pcode/division from '
                             '(default: the committed --csv-out, or its last committed copy)')
    parser.add_argument('--attempts', type=int, default=3)
    parser.add_argument('--retry-delay', type=int, default=30)
    parser.add_argument('--summary-out', default=None, help='write the job-summary markdown here')
    args = parser.parse_args()

    dest_dir = Path(args.dest)
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    csv_out = Path(args.csv_out)
    json_out = Path(args.json_out)
    manifest_out = Path(args.manifest)
    for path in (csv_out, json_out, manifest_out):
        path.parent.mkdir(parents=True, exist_ok=True)

    error = download(args.kernel, dest_dir, args.attempts, args.retry_delay, args.file_pattern)
    if error:
        print(f'❌ could not fetch the output of {args.kernel}: {error}')
        print('   Triage: docs/ops/kaggle-pipeline-triage.md — a 401 is the token, a 403 is a token '
              'that does not own the kernel, a 404 is a slug that moved, and "never been run" needs '
              'one run from the Kaggle UI.')
        return 1

    downloaded_csv, available = choose_csv(dest_dir)
    if downloaded_csv is None:
        print(f'❌ no publishable CSV in the kernel output. Files downloaded: {available or "none"}'
              + ('' if len(available) < 2 else
                 ' — more than one CSV and none named ' + '/'.join(PREFERRED_CSV_NAMES) +
                 ', so choosing one would be a guess about which producer wrote the day\'s forecast.'))
        return 1
    print(f'· kernel output: {available}')
    print(f'· publishing {downloaded_csv.name}')

    with downloaded_csv.open('r', encoding='utf-8') as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or ())
        raw_rows = list(reader)

    shape = detect_shape(set(fieldnames))
    advisory_summary: dict[str, Any] = {}
    problems: list[str] = []

    if shape == 'unknown':
        print(f'❌ {downloaded_csv.name} is neither the canonical forecast schema nor the notebook\'s '
              f'advisory schema. Columns: {fieldnames}')
        print('   If the notebook changed shape, update CANONICAL_COLUMNS / ADVISORY_MAP here and the '
              'matching test in scripts/tests/test_kaggle_forecast_fetch.py — do not widen the sanity '
              'check to accept it.')
        return 1

    if shape == 'advisory':
        identity_path = Path(args.identity_csv) if args.identity_csv else csv_out
        identity, identity_problems = load_identity(identity_path)
        if not args.identity_csv:
            committed = identity_from_head(csv_out)
            for name, record in committed.items():
                identity.setdefault(name, record)
            if committed:
                print(f'· district identity: {len(identity)} names '
                      f'({len(committed)} from the committed artifact at HEAD)')
        if not identity:
            for problem in identity_problems:
                print(f'❌ {problem}')
            print('   Pass --identity-csv pointing at a canonical artifact that carries '
                  'district_id/pcode, or publish the notebook version that writes them itself.')
            return 1
        # The published artifact is 60 of the 64 districts (the runner-side generator
        # dropped four on its last run); the snapshot supplies the rest, with ids derived
        # by a rule that is checked against all 60 before it is used for any of them.
        extended, extension_problems = extend_identity_with_reference(identity)
        problems.extend(extension_problems)
        if extended:
            print(f'· district identity: +{len(extended)} from the 64-district snapshot '
                  f'({", ".join(extended)})')
        prediction_date, date_problems = derive_prediction_date(raw_rows)
        problems.extend(date_problems)
        if prediction_date is None:
            for problem in problems:
                print(f'❌ {problem}')
            return 1
        rows, translate_problems, advisory_summary = translate_advisory(raw_rows, identity, prediction_date)
        problems.extend(translate_problems)
        if not rows:
            for problem in problems:
                print(f'❌ {problem}')
            print('❌ the advisory table translated to zero canonical rows; nothing to publish.')
            return 1
        if advisory_summary.get('unmatched_rows'):
            # Dropped rows are a warning, not a failure: the notebook walks whatever
            # districts GAUL returns, and the repository publishes the ones the site has
            # a page for. Silence about the difference is what would be a defect.
            print(f'::warning::{advisory_summary["unmatched_rows"]} row(s) dropped for '
                  f'{len(advisory_summary["unmatched_districts"])} district name(s) the identity table '
                  f'does not carry: {", ".join(advisory_summary["unmatched_districts"][:8])}')
        staged = dest_dir / 'canonical.csv'
        with staged.open('w', encoding='utf-8', newline='') as handle:
            # `lineterminator='\n'`, not csv's `\r\n` default: the committed artifact
            # is LF, and a CRLF rewrite would make every pull compare unequal to the
            # file it replaced — a permanent "CHANGED=true" and a diff of the whole file.
            writer = csv.DictWriter(handle, fieldnames=list(CANONICAL_COLUMNS), lineterminator='\n')
            writer.writeheader()
            writer.writerows(rows)
        publish_csv = staged
    else:
        prediction_date = (raw_rows[0].get('prediction_date') or '').strip() if raw_rows else ''
        publish_csv = downloaded_csv
        if not prediction_date:
            problems.append('the canonical CSV carries no prediction_date in its first row')

    ok, message = sanity_check(publish_csv)
    if not ok:
        print(f'❌ sanity check failed: {message}')
        return 1
    print(f'· {message}')

    new_sha = compute_sha256(publish_csv)
    old_sha = compute_sha256(csv_out) if csv_out.is_file() else None
    changed = old_sha != new_sha

    records = convert_csv_to_json_records(publish_csv)
    districts = sorted({str(r.get('district_name') or r.get('district_id')) for r in records})
    fetched_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    coverage = coverage_tally(raw_rows, records, districts)

    if changed or not csv_out.is_file() or not json_out.is_file() or not manifest_out.is_file():
        shutil.copy(publish_csv, csv_out)
        json_out.write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
        print(f'· regenerated {json_out} from {publish_csv.name}')
        manifest = {
            'schema': 'hazardnet-forecast-manifest/v1',
            'source': f'kaggle kernels output {args.kernel}',
            'generated_at': fetched_at,
            'prediction_date': prediction_date,
            'row_count': len(records),
            'district_count': len(districts),
            'source_shape': shape,
            'source_file': downloaded_csv.name,
            'csv_sha256': new_sha,
            'csv_path': repo_relative(csv_out, ROOT),
            'json_path': repo_relative(json_out, ROOT),
            'kernel': args.kernel,
            'data_source': DATA_SOURCE if shape == 'advisory' else (
                records[0].get('data_source') if records else None),
            # What the coverage gate in validate_forecasts.py reads. Without it the daily
            # job has to pass --skip-coverage, which is how a 60-district day looks
            # identical to a 64-district one.
            'coverage': coverage,
            'coverage_status': coverage['status'],
            **model_provenance(ROOT),
            'advisory': advisory_summary or None,
            'notes': problems or None,
        }
        manifest_out.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        print('CHANGED=true')
    else:
        print('· the pulled CSV is byte-identical to the committed one')
        print('CHANGED=false')

    if coverage['status'] != 'complete':
        missing = coverage['missing_districts']
        print(f"::warning::partial pull: {coverage['produced_units']} of "
              f"{coverage['requested_units']} requested units"
              + (f"; no row for {', '.join(missing[:8])}" if missing else '')
              + ('' if len(missing) <= 8 else f' and {len(missing) - 8} more'))

    payload = {
        'kernel': args.kernel,
        'source_file': downloaded_csv.name,
        'shape': shape,
        'row_count': len(records),
        'district_count': len(districts),
        'prediction_date': prediction_date,
        'fetched_at': fetched_at,
        'changed': changed,
        'advisory': advisory_summary,
        'coverage': coverage,
    }
    if args.summary_out:
        Path(args.summary_out).write_text(markdown_summary(payload), encoding='utf-8')

    github_output('changed', 'true' if changed else 'false')
    github_output('shape', shape)
    github_output('rows', len(records))
    github_output('districts', len(districts))
    github_output('prediction_date', prediction_date)
    github_output('unmatched', (advisory_summary or {}).get('unmatched_rows', 0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
