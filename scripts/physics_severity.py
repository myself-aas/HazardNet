#!/usr/bin/env python3
"""Independent physics-severity track for HazardNet forecasts.

WHY THIS MODULE EXISTS
----------------------
Two defects in the shipped pipeline (2026-09-17 audit, `docs/PRODUCT_SPEC.md`
§5.4, `docs/MODEL_CARD.md` §6):

1. **The "physics cross-check" was not independent.** `scripts/auto_forecast.py`
   computed a physics score *only for the hazard class the model had already
   chosen* (`if hazard == 'Tropical Cyclone': … elif hazard == 'Flash Flood': …`),
   defaulting to a flat `0.50` for anything else. It checked the model's
   magnitude and could never detect a hazard the model missed. Now all eight
   classes are scored from the meteorological drivers alone, and the summary
   reports which class the physics track would have picked.

2. **`om_calc_flood` was called with the same value twice.**
   `om_calc_flood(precip_total_mm, precip_total_mm)` fed the horizon *total*
   into both the "accumulated rainfall" term and the "rainfall intensity" term,
   so a 300 mm season-in-a-week scored identically to 300 mm spread over a
   fortnight. The two arguments are now genuinely distinct: a horizon total and
   a peak 24-hour total, both computed by the caller from hourly Open-Meteo data
   (`scripts/auto_forecast.py`). `om_calc_severe_storm` had the same defect and
   is fixed the same way.

DESIGN
------
Pure functions, standard library only: the formulas can be unit-tested without
Earth Engine, TFLite or a network (`scripts/tests/test_physics_severity.py`), and
the pipeline cannot drift from the tested version.

Scores are damage-potential proxies in `[0, 1]`, **not** calibrated
probabilities, and they are deliberately simple: each one encodes a published
meteorological rule of thumb, so a reader can check the reasoning. They are one
evidence stream beside the model, never a replacement for it.

KNOWN LIMITATION (kept explicit so it is not mistaken for coverage)
------------------------------------------------------------------
`Flood` and `Flash Flood` share one rainfall formula. Separating them needs
catchment/river-level data (FFWC) and soil/imperviousness context, which is the
`w3 hydrology` stream planned in `docs/architecture/TARGET_ARCHITECTURE.md` §2.1
— not something this module can infer from point weather alone.
"""

from __future__ import annotations

import math

# Fixed class order — must match Models/labels.json and
# backend/utils/forecastRow.js VALID_HAZARDS.
HAZARD_CLASSES = (
    'Cold Wave',
    'Drought',
    'Fire',
    'Flash Flood',
    'Flood',
    'Heat Wave',
    'Severe Local Storm',
    'Tropical Cyclone',
)

#: Classes whose physics proxy is identical in this implementation (see the
#: module docstring: distinguishing them needs hydrology, not weather).
SHARED_RAINFALL_CLASSES = ('Flood', 'Flash Flood')


def _clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def safe_float(value, default: float = 0.0) -> float:
    """Coerce to float, treating None/NaN/garbage as `default`."""
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(parsed) or math.isinf(parsed):
        return default
    return parsed


# ── the eight formulas ───────────────────────────────────────────────────────
# Each was carried over from the shipped pipeline so scores stay comparable,
# with argument wiring corrected where the two inputs were the same quantity.


def om_calc_severe_storm(precip_peak_mm, wind_max_kmh):
    """Nor'wester / Kalbaishakhi: squall wind plus a convective downpour.

    `precip_peak_mm` is the peak 24-hour total (mm). The shipped pipeline passed
    the horizon total here, which made a wet fortnight look like a squall line.
    """
    p = _clip(safe_float(precip_peak_mm, 0.0) / 100.0)
    w = _clip(max(safe_float(wind_max_kmh, 0.0) - 50.0, 0.0) / 100.0)
    return _clip(0.6 * w + 0.4 * p)


def om_calc_cold_wave(temp_min_c, duration_days):
    """Cold wave: how far the minimum falls below 16 °C, plus persistence."""
    return _clip(
        0.7 * _clip((16.0 - safe_float(temp_min_c, 16.0)) / 10.0)
        + 0.3 * _clip(safe_float(duration_days, 1.0) / 5.0)
    )


def om_calc_fire(temp_max_c, wind_max_kmh, et_sum_mm):
    """Vegetation/burn risk: heat, wind and drying (evapotranspiration)."""
    h = _clip((safe_float(temp_max_c, 30.0) - 25.0) / 15.0)
    w = _clip((safe_float(wind_max_kmh, 10.0) - 5.0) / 20.0)
    d = _clip(safe_float(et_sum_mm, 3.0) / 6.0)
    return _clip(0.4 * h + 0.3 * w + 0.3 * d)


def om_calc_tropical_cyclone(wind_max_kmh, precip_total_mm):
    """Cyclone: sustained wind above 50 km/h, with the rainfall it drags in."""
    wind = _clip(max(safe_float(wind_max_kmh, 0.0) - 50.0, 0.0) / 150.0)
    rain = _clip(safe_float(precip_total_mm, 0.0) / 300.0)
    return _clip(0.7 * wind + 0.3 * rain)


def om_calc_drought(temp_max_c, precip_total_mm):
    """Drought: heat load against the rainfall the horizon is expected to bring."""
    t = _clip((safe_float(temp_max_c, 25.0) - 25.0) / 20.0)
    p = _clip((200.0 - safe_float(precip_total_mm, 200.0)) / 200.0)
    return _clip(0.6 * t + 0.4 * p)


def om_calc_flood(precip_total_mm, precip_peak_mm):
    """Flood: accumulated rainfall AND peak intensity.

    Both arguments are required and must be different quantities — the shipped
    pipeline passed the horizon total twice (the bug this signature prevents):

      * `precip_total_mm` — rainfall accumulated over the horizon (mm)
      * `precip_peak_mm`  — the wettest 24 hours inside that horizon (mm)

    A 300 mm fortnight and a 300 mm three-day burst now score differently, which
    is the entire point of an intensity term.
    """
    total = _clip(safe_float(precip_total_mm, 0.0) / 300.0)
    peak = _clip(safe_float(precip_peak_mm, 0.0) / 100.0)
    return _clip(0.5 * total + 0.5 * peak)


def om_calc_heat_wave(temp_max_c, duration_days):
    """Heat wave: exceedance above 30 °C, plus persistence."""
    return _clip(
        0.7 * _clip((safe_float(temp_max_c, 30.0) - 30.0) / 15.0)
        + 0.3 * _clip(safe_float(duration_days, 1.0) / 5.0)
    )


# ── driver bundle → all eight scores ─────────────────────────────────────────

REQUIRED_DRIVERS = (
    'temp_max_c',
    'temp_min_c',
    'precip_total_mm',
    'precip_peak_mm',
    'wind_max_kmh',
    'et_total_mm',
)


def compute_physics_scores(drivers: dict, horizon_days: int) -> dict:
    """Score **all eight** hazard classes from meteorological drivers.

    The classification model is deliberately not an input: that is what makes
    this an independent evidence stream rather than a restatement of the model's
    own choice (`docs/PRODUCT_SPEC.md` §5.4).

    `drivers` keys (see `REQUIRED_DRIVERS`): `temp_max_c`, `temp_min_c`,
    `precip_total_mm` (horizon total), `precip_peak_mm` (wettest 24 h),
    `wind_max_kmh`, `et_total_mm`.

    Missing drivers degrade to the formula defaults rather than raising, because
    a partially-observed forecast is still useful — but callers should record
    which inputs were missing (see `missing_drivers`).
    """
    return {
        'Cold Wave': om_calc_cold_wave(drivers.get('temp_min_c'), horizon_days),
        'Drought': om_calc_drought(drivers.get('temp_max_c'), drivers.get('precip_total_mm')),
        'Fire': om_calc_fire(
            drivers.get('temp_max_c'), drivers.get('wind_max_kmh'), drivers.get('et_total_mm')
        ),
        'Flash Flood': om_calc_flood(drivers.get('precip_total_mm'), drivers.get('precip_peak_mm')),
        'Flood': om_calc_flood(drivers.get('precip_total_mm'), drivers.get('precip_peak_mm')),
        'Heat Wave': om_calc_heat_wave(drivers.get('temp_max_c'), horizon_days),
        'Severe Local Storm': om_calc_severe_storm(
            drivers.get('precip_peak_mm'), drivers.get('wind_max_kmh')
        ),
        'Tropical Cyclone': om_calc_tropical_cyclone(
            drivers.get('wind_max_kmh'), drivers.get('precip_total_mm')
        ),
    }


def missing_drivers(drivers: dict) -> list:
    """Driver names absent or non-finite — recorded so a score can be qualified."""
    return [
        name
        for name in REQUIRED_DRIVERS
        if name not in drivers or not math.isfinite(safe_float(drivers.get(name), float('nan')))
    ]


def physics_summary(scores: dict, model_hazard: str, model_severity: float = None) -> dict:
    """Summarise the physics track relative to the model's choice.

    Returns:
      * `physics_severity` — the physics score for the class the model chose
        (keeps the existing `physics_severity` column semantics: a cross-check of
        the model's *magnitude*, now computed without reference to it)
      * `physics_top_hazard` / `physics_top_severity` — what the physics track
        would have picked on its own. When this differs from `model_hazard`, the
        two streams disagree and the row should be reviewed, not trusted.
      * `physics_agreement` — whether the two picks match
      * `track_divergence` — |model_severity − physics_severity| when the model
        severity is supplied
    """
    if not scores:
        raise ValueError('physics_summary requires at least one score')

    # Deterministic tie-break: highest score, then HAZARD_CLASSES order.
    top_hazard = max(HAZARD_CLASSES, key=lambda name: (scores.get(name, 0.0), -HAZARD_CLASSES.index(name)))
    ordered_top = max(
        scores.items(),
        key=lambda item: (item[1], -HAZARD_CLASSES.index(item[0]) if item[0] in HAZARD_CLASSES else -len(HAZARD_CLASSES)),
    )
    top_hazard = ordered_top[0]

    physics_severity = scores.get(model_hazard)
    summary = {
        'physics_severity': None if physics_severity is None else round(float(physics_severity), 4),
        'physics_top_hazard': top_hazard,
        'physics_top_severity': round(float(ordered_top[1]), 4),
        'physics_agreement': top_hazard == model_hazard,
    }
    if model_severity is not None and physics_severity is not None:
        summary['track_divergence'] = round(abs(float(model_severity) - float(physics_severity)), 4)
    return summary


def physics_columns(scores: dict) -> dict:
    """CSV column names for the per-class scores (`physics_cold_wave`, …).

    Emitting all eight (rather than only the selected class's score) is what lets
    a consumer see a hazard the model missed — the defect in `PRODUCT_SPEC` §5.4.
    """
    return {
        'physics_' + name.lower().replace(' ', '_'): round(float(score), 4)
        for name, score in scores.items()
    }
