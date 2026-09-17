#!/usr/bin/env python3
"""Turn weather series into the two files `mlops.evaluate` scores.

Predictions
    One row per (district, horizon) for the episode window. The hazard class and severity
    come from `physics_severity.compute_physics_scores` — the pipeline's independent
    cross-check — because the CNN cannot be re-run here (no Sentinel/ERA5-Land tensor over
    Earth Engine in this environment). Every row therefore carries
    `score_source: 'physics_track'`, and the report says the same thing in prose; a reader
    must never be able to mistake these numbers for model skill.

Outcomes
    One row per district the episode's sources name as affected, dated to the event's onset
    so `mlops.evaluate.match_pairs` can join it to the prediction window.

Aggregation follows the live pipeline's contract (`scripts/auto_forecast.py`):
`precip_total_mm` and `et_total_mm` are horizon totals, `temp_max_c`/`temp_min_c` are the
extremes over the horizon, `wind_max_kmh` is the maximum. The one approximation is
`precip_peak_mm`: the live pipeline takes the peak 6-hourly accumulation, while a daily
reanalysis series can only offer the wettest day, which understates a forward-flood term.
It is declared in the episode's `known_limitations` and repeated in the report.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import physics_severity  # noqa: E402

HORIZONS = (('7_days', 7), ('15_days', 15))
SCORE_SOURCE = 'physics_track'
SCORE_SOURCE_NOTE = (
    'Severity and class come from the independent physics cross-check '
    '(scripts/physics_severity.py) run on reanalysis drivers. The CNN was not re-run: its '
    't2 tensor needs Sentinel-1/2 + Landsat + ERA5-Land bands over Earth Engine for the '
    'historical window. These are not model-skill numbers.'
)


def _numbers(values):
    return [None if value is None else float(value) for value in values]


def drivers_for_window(series: dict, prediction_date: str, target_date: str) -> dict:
    """Aggregate a daily series over an inclusive-exclusive window, in the pipeline's units.

    Returns `None` for any driver the window does not cover — `physics_severity` degrades a
    missing driver to its formula default, so the caller records which ones were missing
    rather than filling them silently.
    """
    times = series['time']
    mask = [prediction_date <= day <= target_date for day in times]
    if not any(mask):
        return {'days': 0}

    def select(variable):
        values = [value for value, keep in zip(_numbers(series['daily'][variable]), mask) if keep]
        return [value for value in values if value is not None]

    precip = select('precipitation_sum')
    t_max = select('temperature_2m_max')
    t_min = select('temperature_2m_min')
    wind = select('wind_speed_10m_max')
    et = select('et0_fao_evapotranspiration')
    return {
        'days': sum(mask),
        'temp_max_c': max(t_max) if t_max else None,
        'temp_min_c': min(t_min) if t_min else None,
        'precip_total_mm': sum(precip) if precip else None,
        'precip_peak_mm': max(precip) if precip else None,
        'wind_max_kmh': max(wind) if wind else None,
        'et_total_mm': sum(et) if et else None,
    }


def prediction_rows(episode: dict, district_locations, series: dict) -> list:
    """One prediction row per (district, horizon) — 128 for a 64-district episode."""
    onset = episode['event']['onset_date']
    rows = []
    for location in district_locations:
        station = series.get(location['id'])
        if station is None:
            continue
        for horizon, lead_days in HORIZONS:
            prediction_date = date.fromordinal(date.fromisoformat(onset).toordinal() - lead_days).isoformat()
            drivers = drivers_for_window(station, prediction_date, onset)
            if not drivers.get('days'):
                continue
            missing = physics_severity.missing_drivers(drivers)
            scores = physics_severity.compute_physics_scores(drivers, lead_days)
            summary = physics_severity.physics_summary(scores, episode['hazard_class'])
            rows.append({
                # The fields mlops.evaluate joins on.
                'district_name': location['name'],
                'hazard_type': summary['physics_top_hazard'],
                'prediction_date': prediction_date,
                'target_date': onset,
                'horizon': horizon,
                'severity_score': summary['physics_top_severity'],
                'model_severity': summary['physics_top_severity'],
                # Evidence the score came from, and what it is.
                'score_source': SCORE_SOURCE,
                'score_source_note': SCORE_SOURCE_NOTE,
                'weather_product': station.get('product'),
                'station_grid_cell': station['grid_cell'],
                'drivers': drivers,
                'drivers_missing': missing,
                'physics_scores': {name: round(value, 4) for name, value in scores.items()},
                'physics_score_of_episode_class': round(scores[episode['hazard_class']], 4),
                'physics_agreement_with_episode_class':
                    summary['physics_top_hazard'] == episode['hazard_class'],
            })
    return rows


def outcome_rows(episode: dict) -> list:
    """The truth set as `mlops.evaluate` reads it: one observed outcome per named district."""
    onset = episode['event']['onset_date']
    ends = episode['event'].get('ends_date') or onset
    rows = []
    for entry in episode['truth']['affected']:
        rows.append({
            'district': entry['district'],
            'hazard_type': episode['hazard_class'],
            'start_date': onset,
            'end_date': ends,
            'severity': None,
            'source': entry['source_id'],
            'tier': entry.get('tier'),
            'as_written': entry.get('as_written'),
        })
    return rows


def per_district(episode: dict, predictions: list) -> list:
    """The reader-facing table: what the physics track said about each named district.

    One entry per district named in the truth set (not per row), carrying the strongest
    signal across the episode's horizons, so a reader can see a near-miss at one horizon
    against a hit at the other.
    """
    by_district = {}
    for row in predictions:
        current = by_district.get(row['district_name'])
        if current is None or (row['physics_score_of_episode_class'] or 0) > (
            current['physics_score_of_episode_class'] or 0
        ):
            by_district[row['district_name']] = row
    table = []
    for entry in episode['truth']['affected']:
        row = by_district.get(entry['district'])
        table.append({
            'district': entry['district'],
            'as_written': entry.get('as_written'),
            'tier': entry.get('tier'),
            'source_id': entry.get('source_id'),
            'physics_top_hazard': (row or {}).get('hazard_type'),
            'physics_top_severity': (row or {}).get('severity_score'),
            'physics_score_of_episode_class': (row or {}).get('physics_score_of_episode_class'),
            'physics_named_episode_class': (row or {}).get('physics_agreement_with_episode_class'),
            'within_window_days': (row or {}).get('drivers', {}).get('days'),
        })
    return table
