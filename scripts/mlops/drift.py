#!/usr/bin/env python3
"""Drift monitoring (PSI) over the drivers the model actually consumes.

WHY THE INPUTS ARE WHAT THEY ARE
--------------------------------
Drift detection needs a *reference* distribution and a *current* one. The tensors
themselves are not committed (they are fetched from Earth Engine per run), so the
closest thing this repository can honestly monitor is the **published driver
columns** — the Open-Meteo meteorology written next to every row
(`temperature_*`, `precipitation_mm`, `wind_max_kmh`, `dewpoint_mean`,
`solar_radiation_mj_m2`, `evapotranspiration_mm`), plus the hydrology columns the
`w3` ETL adds when FFWC data is present. Those are the same numbers that feed the
physics track and the model's `Temp_2m`/`Precip` channels, and they are on disk
for every published run, which makes drift measurable *today* rather than after
some future feature store exists.

Three series are monitored:

* **drivers** — per-column PSI between a reference window and the current run;
* **prediction distribution** — the share of each hazard class (a categorical PSI,
  which is how "the model collapsed onto one class" announces itself before the
  scores do);
* **severity** — the distribution of the top-class score.

Each result carries its sample counts and, when the sample is too small, says
`insufficient_sample` instead of a number. A PSI computed from twelve rows is
noise that reads as a finding — the failure mode this whole package is built to
avoid.
"""

from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path

from .metrics import psi, psi_level, summarize_drift

#: The meteorological columns this repository publishes (canonical names). The
#: legacy `om_*` names are what the pre-Phase-2 pipeline wrote into `data/`; they
#: are still on disk, so they are aliases here rather than a second column set.
DRIVER_COLUMNS = (
    'temperature_mean', 'temperature_max', 'temperature_min',
    'precipitation_mm', 'wind_max_kmh', 'dewpoint_mean',
    'solar_radiation_mj_m2', 'evapotranspiration_mm',
)

#: `alias -> {canonical, scale, offset, per_day}`; the value becomes
#: `canonical = alias * scale + offset`, divided by the row's `horizon` when
#: `per_day` is set.
#:
#: These conversions are **not** guessed: they are the rules the ingest boundary
#: (`backend/utils/forecastRow.js`) and `scripts/build_forecast_snapshot.mjs`
#: already apply, and they exist because the legacy column *names* do not describe
#: their contents — `om_temp_2m_k` holds °C "despite the _k suffix" (the comment in
#: `scripts/auto_forecast.py` says so), `om_solar_rad_j` holds **kJ/m² over the
#: horizon** rather than J, and `om_et_sum_m` holds **mm** rather than metres. Two
#: of the eight are horizon totals, so they are only comparable to the canonical
#: per-day columns after division by the horizon.
#:
#: Guessing instead (for instance reading `_k` as Kelvin, as an earlier version of
#: this table did) yields a drift index of ~12 for every column of two runs of the
#: same weather — a fabricated finding, which is worse than no drift report.
COLUMN_ALIASES = {
    'om_temp_2m_k': {'canonical': 'temperature_mean', 'scale': 1.0, 'offset': 0.0},
    'om_max_temp_k': {'canonical': 'temperature_max', 'scale': 1.0, 'offset': 0.0},
    'om_min_temp_k': {'canonical': 'temperature_min', 'scale': 1.0, 'offset': 0.0},
    'om_dewpoint_k': {'canonical': 'dewpoint_mean', 'scale': 1.0, 'offset': 0.0},
    'om_precip_m': {'canonical': 'precipitation_mm', 'scale': 1000.0, 'offset': 0.0,
                    'per_day': True},   # metres (total) -> mm/day
    'om_wind_max_ms': {'canonical': 'wind_max_kmh', 'scale': 3.6, 'offset': 0.0},
    'om_solar_rad_j': {'canonical': 'solar_radiation_mj_m2', 'scale': 1e-3, 'offset': 0.0,
                       'per_day': True},   # kJ/m² (total) -> MJ/m²/day
    'om_et_sum_m': {'canonical': 'evapotranspiration_mm', 'scale': 1.0, 'offset': 0.0,
                    'per_day': True},   # mm (total, despite _m) -> mm/day
}

#: Added by `python -m etl.cli hydrology --write-rows`, so a run that has them is
#: monitored on them too and a run that does not is not penalised.
W3_COLUMNS = ('hydrology_severity', 'hydrology_exceedance_ratio')

#: Below this many values per side, PSI is not reported.
MIN_SAMPLES = 30

SCHEMA = 'hazardnet-mlops-drift/v1'


class DriftError(ValueError):
    """Raised for input that cannot be compared at all."""


def load_rows(path) -> list:
    """Read rows from a CSV or a website snapshot JSON."""
    path = Path(path)
    if not path.exists():
        raise DriftError(f'{path} does not exist')
    text = path.read_text(encoding='utf-8')
    if path.suffix.lower() == '.csv':
        return list(csv.DictReader(text.splitlines()))
    payload = json.loads(text)
    if isinstance(payload, dict):
        rows = []
        for horizon_rows in (payload.get('horizons') or {}).values():
            rows.extend(horizon_rows)
        if not rows:
            raise DriftError(f'{path}: object has no horizons with rows')
        return rows
    if not isinstance(payload, list):
        raise DriftError(f'{path}: expected a CSV, a snapshot object or an array of rows')
    return payload


def _number(value):
    """A float, or `None` for anything that is not a usable number.

    `None` (not 0.0) is returned for blanks, non-numerics and NaN — a missing
    driver must not enter a distribution as a zero, which would drag the PSI
    reference bins toward zero and invent drift.
    """
    if value in (None, ''):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return number


#: Legacy rows spell the horizon in several ways across this repository's files —
#: `7`, `7d`, `7_days` all appear — so it is parsed rather than looked up in a
#: table that goes stale the next time someone renames a column.
HORIZON_PATTERN = re.compile(r'^(\d+)(?:\s*_?\s*days?|\s*d)?$', re.IGNORECASE)


def horizon_days(row):
    """Horizon length in days, or `None` if the row does not say."""
    value = row.get('horizon')
    if value is None:
        return None
    match = HORIZON_PATTERN.match(str(value).strip())
    if not match:
        return None
    number = int(match.group(1))
    return number or None


def columns_for(rows) -> list:
    """Which monitored columns this dataset actually carries (non-empty)."""
    present = []
    for column in (*DRIVER_COLUMNS, *W3_COLUMNS):
        if any(value is not None for value in series(rows, column)):
            present.append(column)
    return present


def conversions_for(rows) -> dict:
    """Which legacy columns were converted, and how (recorded in the report)."""
    used = {}
    available = set(rows[0].keys()) if rows else set()
    for alias, rule in COLUMN_ALIASES.items():
        if alias in available and rule['canonical'] not in available:
            used[alias] = dict(rule)
    return used


def series(rows, column) -> list:
    """The values of one monitored column, in canonical units.

    Reads the canonical column if present and falls back to a legacy alias with
    its documented conversion. A caller never has to know which schema the file
    came from. Values that cannot be converted (a horizon total with no horizon on
    the row) are dropped rather than approximated, and `coverage()` reports the
    count so the drop is visible.
    """
    values, _ = series_with_coverage(rows, column)
    return values


def series_with_coverage(rows, column) -> tuple:
    """`(values, coverage)` — coverage records how many rows could not be used."""
    values = []
    coverage = {'rows': len(rows), 'used': 0, 'missing': 0, 'dropped_no_horizon': 0}
    for row in rows:
        value = _number(row.get(column))
        if value is None:
            for alias, rule in COLUMN_ALIASES.items():
                if rule['canonical'] != column:
                    continue
                raw = _number(row.get(alias))
                if raw is None:
                    continue
                if rule.get('per_day'):
                    days = horizon_days(row)
                    if not days:
                        coverage['dropped_no_horizon'] += 1
                        value = None
                        break
                    value = (raw * rule['scale'] + rule['offset']) / days
                else:
                    value = raw * rule['scale'] + rule['offset']
                break
        if value is None:
            coverage['missing'] += 1
        else:
            values.append(value)
            coverage['used'] += 1
    return values, coverage


def compare_rows(reference_rows, current_rows, *, columns=None, min_samples: int = MIN_SAMPLES) -> dict:
    """Per-column PSI between two sets of published rows."""
    columns = columns or sorted(set(columns_for(reference_rows)) & set(columns_for(current_rows)))
    monitored = {}
    coverage = {}
    for column in columns:
        reference_values, reference_coverage = series_with_coverage(reference_rows, column)
        current_values, current_coverage = series_with_coverage(current_rows, column)
        monitored[column] = reference_values, current_values
        coverage[column] = {'reference': reference_coverage, 'current': current_coverage}
    summary = summarize_drift(monitored, min_samples=min_samples)
    return {
        'columns': columns,
        'reference_rows': len(reference_rows),
        'current_rows': len(current_rows),
        'min_samples': min_samples,
        'coverage': coverage,
        'drivers': summary,
    }


def class_share_drift(reference_rows, current_rows, *, min_samples: int = MIN_SAMPLES) -> dict:
    """Categorical PSI over the share of each hazard class.

    A categorical distribution has no natural bin edges, so the "bins" are the
    classes themselves: `PSI = Σ (current_share − reference_share)·ln(current/reference)`.
    That is the same formula as the numeric case, which is why this is a small
    function and not a second implementation of the index.
    """
    reference_counts = _class_counts(reference_rows)
    current_counts = _class_counts(current_rows)
    total_reference = sum(reference_counts.values())
    total_current = sum(current_counts.values())
    result = {
        'reference_count': total_reference,
        'current_count': total_current,
        'value': None,
        'level': 'insufficient_sample',
        'classes': [],
    }
    if total_reference < min_samples or total_current < min_samples:
        result['reason'] = (
            f'need at least {min_samples} rows on each side '
            f'(reference {total_reference}, current {total_current})'
        )
        return result

    floor = 1e-6
    total = 0.0
    for hazard in sorted(set(reference_counts) | set(current_counts)):
        expected = reference_counts.get(hazard, 0) / total_reference
        actual = current_counts.get(hazard, 0) / total_current
        expected_f, actual_f = max(expected, floor), max(actual, floor)
        contribution = (actual_f - expected_f) * math.log(actual_f / expected_f)
        total += contribution
        result['classes'].append({
            'hazard': hazard,
            'reference_share': round(expected, 6),
            'current_share': round(actual, 6),
            'contribution': round(contribution, 6),
        })
    result['value'] = round(total, 6)
    result['level'] = psi_level(total)
    result['collapsed'] = _collapse_check(reference_counts, current_counts, total_reference, total_current)
    return result


def _class_counts(rows):
    counts = {}
    for row in rows:
        hazard = row.get('hazard_type')
        if not hazard:
            continue
        counts[str(hazard)] = counts.get(str(hazard), 0) + 1
    return counts


def _collapse_check(reference_counts, current_counts, total_reference, total_current) -> dict:
    """Is the current run dominated by one class, more than the reference was?

    This is MODEL_CARD §6.1 in monitoring form: a classifier that returns the same
    class for every district is degenerate, and the class-share drift is where that
    shows up before the (currently unmeasured) POD does.
    """
    if not current_counts:
        return {'status': 'no_predictions'}
    top, count = max(current_counts.items(), key=lambda item: item[1])
    share = count / total_current
    reference_share = reference_counts.get(top, 0) / total_reference if total_reference else None
    # 95 % in one class is degenerate whether or not a second class has the rest:
    # 96/4 is not a functioning classifier, it is one class plus leakage. The
    # distinct-class counts are reported either way so the reader can judge.
    return {
        'status': 'collapsed' if share >= 0.95 else 'ok',
        'dominant_class': top,
        'current_share': round(share, 6),
        'reference_share': round(reference_share, 6) if reference_share is not None else None,
        'distinct_classes_current': len(current_counts),
        'distinct_classes_reference': len(reference_counts),
    }


def run(reference_path, current_path, *, min_samples: int = MIN_SAMPLES,
        severity_column: str = 'model_severity') -> dict:
    """The full drift report: drivers, class shares, severity distribution."""
    reference_rows = load_rows(reference_path)
    current_rows = load_rows(current_path)
    if not reference_rows or not current_rows:
        raise DriftError('both sides need at least one row')

    comparison = compare_rows(reference_rows, current_rows, min_samples=min_samples)
    comparison['unit_conversions'] = {
        'reference': conversions_for(reference_rows),
        'current': conversions_for(current_rows),
    }
    comparison['run_dates'] = {
        'reference': _run_dates(reference_rows),
        'current': _run_dates(current_rows),
    }
    severity = psi(series(reference_rows, severity_column), series(current_rows, severity_column),
                   min_samples=min_samples)
    shares = class_share_drift(reference_rows, current_rows, min_samples=min_samples)

    significant = list(comparison['drivers']['significant'])
    if shares['level'] == 'significant':
        significant.append('hazard_type(share)')
    if severity['level'] == 'significant':
        significant.append(f'{severity_column}(distribution)')

    unavailable = list(comparison['drivers']['unavailable'])
    if shares['value'] is None:
        unavailable.append('hazard_type(share)')
    if severity['value'] is None:
        unavailable.append(f'{severity_column}(distribution)')

    return {
        'schema': SCHEMA,
        'inputs': {'reference': str(reference_path), 'current': str(current_path)},
        'counts': {'reference_rows': len(reference_rows), 'current_rows': len(current_rows),
                   'min_samples': min_samples},
        'drivers': comparison,
        'hazard_share': shares,
        'severity_distribution': {
            'column': severity_column,
            'value': severity['value'],
            'level': severity['level'],
            'reference_count': severity['reference_count'],
            'current_count': severity['current_count'],
            'reason': severity.get('reason'),
        },
        'significant': significant,
        'unavailable': unavailable,
        'status': 'significant_drift' if significant else 'ok',
    }


def _run_dates(rows, *, field: str = 'prediction_date') -> dict:
    """The dates a file's rows were issued for.

    Printed in the report because two files from different runs are not a
    reference/current pair, and a large PSI between them says more about the
    calendar than about drift.
    """
    dates = sorted({str(row.get(field))[:10] for row in rows if row.get(field)})
    return {'field': field, 'first': dates[0] if dates else None,
            'last': dates[-1] if dates else None, 'distinct': len(dates)}


def render_summary(report: dict) -> str:
    counts = report['counts']
    lines = [
        f"drift: {report['status']} — reference {counts['reference_rows']} rows, "
        f"current {counts['current_rows']} rows",
    ]
    drivers = report['drivers']['drivers']
    for name, row in drivers['series'].items():
        if row['value'] is None:
            lines.append(f"  {name}: unavailable ({row.get('reason')})")
        else:
            lines.append(f"  {name}: PSI {row['value']} ({row['level']})")
    shares = report['hazard_share']
    lines.append(
        f"  hazard_type share: "
        + (f"PSI {shares['value']} ({shares['level']})" if shares['value'] is not None
           else f"unavailable ({shares.get('reason')})")
        + (f" — collapsed onto {shares['collapsed'].get('dominant_class')}"
           if shares.get('collapsed', {}).get('status') == 'collapsed' else '')
    )
    if report['significant']:
        lines.append(f"  ⚠ significant: {', '.join(report['significant'])}")
    return '\n'.join(lines)
