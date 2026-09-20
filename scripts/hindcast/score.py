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
extremes over the horizon, `wind_gust_kmh` is the gust maximum and `wind_mean_kmh` the mean
daily maximum. The one approximation is `precip_peak_mm`: the live pipeline takes the peak
6-hourly accumulation, while a daily reanalysis series can only offer the wettest day, which
understates a forward-flood term. It is declared in the episode's `known_limitations` and
repeated in the report.

**The wiring correction (2026-09-18).** Each row now also carries the *pre-fix* wiring's
scores and top class (`legacy_*`), recomputed from the same drivers, because the comparison is
the evidence: the four arguments below were replaced after this harness measured them at their
ceiling on every row of every episode, and the pipeline owner shipped the correction on that
evidence. The harness keeps computing both sides so the reports still show what the fix
changed, instead of the change being asserted in a commit message.
"""

from __future__ import annotations

import statistics
import sys
from datetime import date
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import physics_severity  # noqa: E402
from etl import districts as etl_districts  # noqa: E402

HORIZONS = (('7_days', 7), ('15_days', 15))

#: The four terms below were the finding of this harness: each received a quantity its formula
#: was not written for, and each therefore sat at its ceiling on every row (measured 128/128,
#: 128/128, 128/128 and 116/128 in Amphan alone). The corrected wiring is now what ships; the
#: legacy wiring is recomputed on every row as `legacy_*` so the difference stays on the record:
#:
#:   fire drying term        `et_sum_mm / 6.0`      receives the *horizon total* ET (tens of mm)
#:   heat-wave persistence   `duration_days / 5.0`  receives the horizon *length* (7 or 15)
#:   cold-wave persistence   `duration_days / 5.0`  receives the horizon *length* (7 or 15)
#:
#: Three of them were therefore at their ceiling on **every row of every episode** — the fire
#: drying term because any horizon accumulates well over 6 mm of ET, the two persistence terms
#: because both published horizons exceed five days. The fourth, the fire wind term, was at its
#: ceiling wherever the window's windiest afternoon passed 25 km/h, which is 36–128 of the 128
#: rows depending on the episode. The formulas' own defaults (3.0 mm ET, 1 day) are the clue
#: that they were written for a daily ET value and an observed exceedance count.
SATURATING_TERMS = ('fire_wind', 'fire_drying', 'heat_persistence', 'cold_persistence')

#: The two wind drivers the archive provides, as the corrected wiring sees them.
#:
#: The shipped track scores the **gust** maximum, because the unit is a district centroid and a
#: centroid is not the eyewall: on Amphan's landfall day the sustained maximum there was
#: 19–69 km/h while the same archive's gust field reached 51–134 km/h. The comparison below
#: re-scores every row with the sustained maximum instead, which is what the pre-correction
#: pipeline used, so the effect of that single choice stays measured rather than asserted.
WIND_SCENARIOS = (
    ('era5_10m_gust', 'wind_gust_max_kmh'),
    ('era5_10m_sustained', 'wind_max_kmh'),
)
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

    et_values = select('et0_fao_evapotranspiration')
    precip = select('precipitation_sum')
    gust = select('wind_gusts_10m_max')
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
        # Sustained maximum: kept for the legacy comparison and for the record of what the
        # model's ERA5-Land band receives; the physics track now uses the gust below.
        'wind_max_kmh': max(wind) if wind else None,
        'wind_gust_max_kmh': max(gust) if gust else None,
        'et_total_mm': sum(et) if et else None,
        # ── the daily series, so the physics module does the aggregating itself ─────
        # This is what removes the defect class: the caller hands over the observed days and
        # `physics_severity.resolve_drivers` computes the mean daily ET, the mean daily wind
        # and the two exceedance counts. A caller cannot pass the wrong aggregate when it is
        # not the one aggregating.
        'daily_temp_max_c': t_max,
        'daily_temp_min_c': t_min,
        'daily_et0_mm': et_values,
        'daily_wind_max_kmh': wind,
        # Kept for the record and the legacy comparison.
        'window_daily': {
            'temp_max_c': t_max, 'temp_min_c': t_min, 'et0_mm': et_values,
            'wind_max_kmh': wind, 'wind_gust_max_kmh': gust, 'precip_mm': precip,
        },
    }


def _count_above(values, threshold):
    return sum(1 for value in values if value is not None and value > threshold)


def _count_below(values, threshold):
    return sum(1 for value in values if value is not None and value < threshold)


def legacy_scores(drivers: dict, horizon_days: int) -> dict:
    """The **pre-correction** wiring, recomputed on every row so the fix stays measurable.

    Until 2026-09-18 the pipeline passed:

      * `et_total_mm` (the horizon total) into the fire drying term, whose divisor and own
        default (6.0 mm, 3.0 mm) are *daily* quantities;
      * `horizon_days` (7 or 15) into both persistence terms, whose divisor (5.0 days) and own
        default (1 day) are *exceedance counts* — the number of days that crossed the
        formula's threshold;
      * the sustained `wind_max_kmh` into the two wind-damage classes.

    Three of those put their term at its ceiling on **every row of every committed episode**
    (the fire drying term and both persistence terms); the sustained-wind argument did so on
    36–128 of 128 rows depending on the episode. The consequence was measurable:
    `Fire` — a class that is high everywhere and therefore discriminates nowhere — was the
    track's top pick on 127 of 128 windows of a landfalling cyclone, and on 85% of all 640 rows
    in the set against 62% after the correction. The corrected wiring ships; this function
    exists so every report still carries the comparison, and so the numbers in the phase report
    stay reproducible from the committed drivers.
    """
    window_daily = drivers.get('window_daily') or {}
    days = max(int(drivers.get('days') or horizon_days), 1)
    et_total = drivers.get('et_total_mm')

    scores = physics_severity.compute_legacy_scores(drivers, horizon_days)
    substitutions = {
        'fire_et_argument': 'et_total_mm (horizon total)',
        'persistence_argument': f'horizon length ({days} days)',
        'wind_argument': 'wind_max_kmh (sustained maximum)',
        'fire_et_mm_total': et_total,
        'horizon_days_passed': days,
        'heat_exceedance_days_above_30c': _count_above(window_daily.get('temp_max_c', []), 30.0),
        'cold_exceedance_days_below_16c': _count_below(window_daily.get('temp_min_c', []), 16.0),
    }
    return {'scores': scores, 'substitutions': substitutions}


def wind_driver_scenarios(drivers: dict, hazard_class: str, horizon_days: int) -> dict:
    """Re-score the two wind-driven classes from each wind driver the archive offers.

    The cyclone score is `0.7 * clip((wind - 50) / 150) + 0.3 * clip(rain / 300)`, so it is
    dominated by the wind argument: with the sustained 10 m maximum at a district point (tens of
    km/h under a landfalling cyclone) it stays near zero, while the gust field — the closer
    proxy for what the district experienced — puts it in the range the class is meant to describe.
    Measuring both turns "the driver choice matters" into a number.
    """
    out = {}
    for name, key in WIND_SCENARIOS:
        value = drivers.get(key)
        if value is None:
            continue
        # Override the *gust* argument, because that is the one the corrected wiring reads;
        # passing the sustained maximum here reproduces the pre-correction driver exactly.
        scores = dict(physics_severity.compute_physics_scores({**drivers, 'wind_gust_kmh': value},
                                                              horizon_days))
        summary = physics_severity.physics_summary(scores, hazard_class)
        out[name] = {
            'wind_kmh': round(value, 1),
            'top_hazard': summary['physics_top_hazard'],
            'episode_class_score': round(scores.get(hazard_class, 0.0), 4),
            'tropical_cyclone': round(scores['Tropical Cyclone'], 4),
            'severe_local_storm': round(scores['Severe Local Storm'], 4),
            'named_the_episode_class': summary['physics_top_hazard'] == hazard_class,
        }
    return out


def saturation_report(row: dict, horizon_days: int) -> dict:
    """How far each of the four corrected terms is from its ceiling, per row.

    The verdict is now a *check* rather than a finding: the four terms were at their ceiling on
    every row before the 2026-09-18 correction, and this block is what makes a regression
    visible. `legacy_argument` keeps the value the pre-fix wiring passed, so a reader can see
    both the defect and that it is gone.
    """
    drivers = row['drivers']
    et_total = drivers.get('et_total_mm')
    wind_max = drivers.get('wind_max_kmh')
    wind_mean = drivers.get('wind_mean_kmh')
    et_daily = drivers.get('et_mm_per_day')
    heat_days = drivers.get('heat_exceedance_days')
    cold_days = drivers.get('cold_exceedance_days')
    return {
        'fire_wind': {
            'term': '(wind_mean_kmh - 5.0) / 20.0',
            'legacy_term': '(wind_max_kmh - 5.0) / 20.0',
            'argument': wind_mean,
            'legacy_argument': wind_max,
            'at_ceiling': wind_mean is not None and (wind_mean - 5.0) / 20.0 >= 1.0,
            'legacy_at_ceiling': wind_max is not None and (wind_max - 5.0) / 20.0 >= 1.0,
        },
        'fire_drying': {
            'term': 'et_mm_per_day / 6.0',
            'legacy_term': 'et_total_mm / 6.0',
            'argument': et_daily,
            'legacy_argument': et_total,
            'at_ceiling': et_daily is not None and et_daily / 6.0 >= 1.0,
            'legacy_at_ceiling': et_total is not None and et_total / 6.0 >= 1.0,
        },
        'heat_persistence': {
            'term': 'heat_exceedance_days / 5.0',
            'legacy_term': 'horizon_days / 5.0',
            'argument': heat_days,
            'legacy_argument': horizon_days,
            'at_ceiling': heat_days is not None and heat_days / 5.0 >= 1.0,
            'legacy_at_ceiling': horizon_days / 5.0 >= 1.0,
        },
        'cold_persistence': {
            'term': 'cold_exceedance_days / 5.0',
            'legacy_term': 'horizon_days / 5.0',
            'argument': cold_days,
            'legacy_argument': horizon_days,
            'at_ceiling': cold_days is not None and cold_days / 5.0 >= 1.0,
            'legacy_at_ceiling': horizon_days / 5.0 >= 1.0,
        },
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
            # Resolve once: the physics module does the aggregation from the daily series,
            # and the same resolved bundle feeds the scores, the saturation check and the
            # provenance columns, so the report cannot describe a different wiring than the
            # one it scored.
            resolved = physics_severity.resolve_drivers(drivers, lead_days)
            missing = physics_severity.missing_drivers(resolved, lead_days)
            scores = physics_severity.compute_physics_scores(resolved, lead_days)
            summary = physics_severity.physics_summary(scores, episode['hazard_class'])
            legacy = legacy_scores(drivers, lead_days)
            row = {
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
                # The aggregates the physics module computed from the daily series above,
                # recorded so a reader can see the exact arguments the formulas received.
                'drivers_resolved': {key: value for key, value in resolved.items()
                                     if key not in ('window_daily', 'daily_temp_max_c',
                                                    'daily_temp_min_c', 'daily_et0_mm',
                                                    'daily_wind_max_kmh')},
                'drivers_missing': missing,
                'physics_scores': {name: round(value, 4) for name, value in scores.items()},
                'physics_score_of_episode_class': round(scores[episode['hazard_class']], 4),
                'physics_agreement_with_episode_class':
                    summary['physics_top_hazard'] == episode['hazard_class'],
                'legacy_top_hazard': max(
                    legacy['scores'],
                    key=lambda name: (legacy['scores'][name], -physics_severity.HAZARD_CLASSES.index(name)),
                ),
                'legacy_scores': {name: round(value, 4) for name, value in legacy['scores'].items()},
                'legacy_arguments': legacy['substitutions'],
                'wind_driver_scenarios': wind_driver_scenarios(
                    resolved, episode['hazard_class'], lead_days),
                'saturated_terms': saturation_report({'drivers': resolved}, lead_days),
            }
            rows.append(row)
    return rows


def outcome_rows(episode: dict) -> list:
    """The truth set as `mlops.evaluate` reads it: one observed outcome per named district.

    The district is resolved through `etl.districts` before it is written, because the join with
    the prediction rows is a *name* join: an episode that spells a district the way its source
    did ("Cumilla", "Coxs Bazar", "Jhalakathi") would otherwise produce rows that never match a
    prediction and silently vanish from the table. `validate_episode` already refuses an
    unresolvable name, so `resolve` cannot return None here.
    """
    onset = episode['event']['onset_date']
    ends = episode['event'].get('ends_date') or onset
    rows = []
    for entry in episode['truth']['affected']:
        rows.append({
            'district': etl_districts.resolve(entry['district']),
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
        district = etl_districts.resolve(entry['district'])
        row = by_district.get(district)
        table.append({
            'district': district,
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
