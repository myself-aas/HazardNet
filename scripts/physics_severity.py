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

A third defect, measured by the Phase 9 hindcast and corrected here (2026-09-18)
---------------------------------------------------------------------------------
`scripts/hindcast/` scored all five committed episodes and found that four
arguments the formulas receive are *not the quantities the formulas describe*
(phase report §4.1–§4.3, `data/hindcast/reports/*.json`):

    fire_drying       `et_sum_mm / 6.0`       received the horizon **total** ET (tens of mm)
    fire_wind         `(wind - 5) / 20`       received the horizon's **maximum** wind
    heat_persistence  `duration_days / 5.0`   received the horizon **length** (7 or 15 days)
    cold_persistence  `duration_days / 5.0`   the same

Three of those terms therefore sat at their ceiling on **every row of every
episode** — the fire drying term (128/128 in all five) and both persistence
terms (128/128 in all five) — and the fire wind term on 36–128 of 128 rows
depending on the episode (Amphan: 116). The formulas' own defaults (3.0 mm ET,
1 day, 10 km/h) are the clue: they were written for a *daily* ET value, an
*exceedance count* and an ordinary day's wind.

The wiring is now corrected, and the prevention is structural rather than a
better guard: `resolve_drivers` below takes the **observed daily series**
(`daily_temp_max_c`, `daily_temp_min_c`, `daily_et0_mm`, `daily_wind_max_kmh`)
and computes the mean daily ET, the mean daily wind and the two exceedance
counts itself, so a caller cannot pass the wrong aggregate — it is not the one
aggregating. The two live callers (`scripts/auto_forecast.py` and
`scripts/hindcast/score.py`) hand over the series for exactly that reason. The
corrected arguments are:

  * **`et_mm_per_day`** — the window's mean daily ET, not its total;
  * **`exceedance_days`** — the number of days the window actually crossed the
    formula's threshold (30 °C for heat, 16 °C for cold), not the horizon length;
  * **`wind_gust_kmh`** — the gust maximum, not the sustained 10 m maximum, for
    the two wind-damage classes. A district centroid is not the eyewall: under
    Amphan the sustained maximum at the sampled centroids was 19–69 km/h while
    the gust field the same archive endpoint offers reached 51–134 km/h, and the
    cyclone class scores 0.0136–0.2480 on the first and 0.0987–0.5145 on the
    second (`data/hindcast/reports/amphan-2020.json`).
  * **`wind_mean_kmh`** — the window's mean daily maximum wind for the *fire*
    term, because `Fire` is a drying condition over days, not a single gusty
    afternoon. (The single windiest afternoon pinned this term at its ceiling on
    128/128 rows in the 2025 episode.)

Each of those substitutions is measured in the hindcast before it was shipped,
and the reports still carry the pre-fix wiring beside the corrected one, so the
before/after remains auditable rather than asserted. What the correction does
**not** fix is reported there too: the physics family still cannot name
`Tropical Cyclone` as its top pick for a cyclone (`Fire` remains the top class
on 62% of all rows after the fix, against 85% before) because the four rain and
wind classes are not separable from point weather (see the known limitation
below, and §4.4 of the phase report).

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


def om_calc_severe_storm(precip_peak_mm, wind_gust_kmh):
    """Nor'wester / Kalbaishakhi: squall wind plus a convective downpour.

    `precip_peak_mm` is the peak 24-hour total (mm). The shipped pipeline passed
    the horizon total here, which made a wet fortnight look like a squall line.

    `wind_gust_kmh` is the gust maximum, for the same reason as the cyclone
    class: a squall *is* the gust. Its divisor is 100 km/h rather than 150, so
    this class saturates above 150 km/h — a separation problem between two
    wind-driven classes that the wiring fix does not solve and the hindcast
    reports as a finding (§4.4).
    """
    p = _clip(safe_float(precip_peak_mm, 0.0) / 100.0)
    w = _clip(max(safe_float(wind_gust_kmh, 0.0) - 50.0, 0.0) / 100.0)
    return _clip(0.6 * w + 0.4 * p)


def om_calc_cold_wave(temp_min_c, exceedance_days):
    """Cold wave: how far the minimum falls below 16 °C, plus persistence.

    `exceedance_days` is the number of days in the window whose minimum actually
    fell below 16 °C — **not** the length of the window. The horizon length put
    this term at its ceiling on every row of every episode (a 7-day horizon
    against a 5-day divisor), which reported a cold wave wherever the night was
    cool.
    """
    return _cold_wave_arithmetic(temp_min_c, _require_exceedance_days(exceedance_days, 16.0))


def _cold_wave_arithmetic(temp_min_c, duration_argument):
    return _clip(
        0.7 * _clip((16.0 - safe_float(temp_min_c, 16.0)) / 10.0)
        + 0.3 * _clip(safe_float(duration_argument, 1.0) / 5.0)
    )


def _require_exceedance_days(value, threshold) -> float:
    """Days past a threshold: a whole number, non-negative, no longer than any window.

    A magnitude check cannot tell a count from a horizon *length* — a 15-day window can have 15
    exceedance days — so this guard covers the coarser mistake (a longer series, a duration in
    hours) and the real prevention is `compute_physics_scores`' own aggregation of
    `daily_temp_max_c` / `daily_temp_min_c` (`DAILY_SERIES_DRIVERS`).
    """
    days = max(safe_float(value, 0.0), 0.0)
    if days > MAX_EXCEEDANCE_DAYS:
        raise ValueError(
            f'exceedance_days={days!r} exceeds MAX_EXCEEDANCE_DAYS={MAX_EXCEEDANCE_DAYS} '
            f'({threshold} °C threshold): this is not a count of days inside a published horizon'
        )
    if days != int(days):
        raise ValueError(f'exceedance_days={days!r} is not a whole number of days')
    return days


def _fire_arithmetic(temp_max_c, wind_kmh, et_argument):
    """The fire formula's arithmetic, with no opinion about what the arguments are.

    Split out so `compute_legacy_scores` can reproduce the pre-2026-09-18 wiring (and be
    checked against the committed reports), while the public `om_calc_fire` refuses the
    argument that wiring passed. A guard that cannot be bypassed on purpose cannot be shown to
    catch anything.
    """
    h = _clip((safe_float(temp_max_c, 30.0) - 25.0) / 15.0)
    w = _clip((safe_float(wind_kmh, 10.0) - 5.0) / 20.0)
    d = _clip(safe_float(et_argument, 3.0) / 6.0)
    return _clip(0.4 * h + 0.3 * w + 0.3 * d)


def om_calc_fire(temp_max_c, wind_mean_kmh, et_mm_per_day):
    """Vegetation/burn risk: heat, wind and drying (evapotranspiration).

    Both non-temperature arguments are **daily** quantities, which is what the
    formula's own defaults say (10 km/h of wind, 3 mm of ET):

      * `wind_mean_kmh` — the window's mean daily maximum wind, not its single
        windiest moment. A single afternoon above 25 km/h pins the term at 1.0,
        which in Bangladesh's coastal belt is most days of the pre-monsoon;
      * `et_mm_per_day` — mean daily reference evapotranspiration. Passing the
        horizon *total* put this term at its ceiling on 128/128 rows of every
        committed episode (a 7-day total is 20–40 mm against a 6 mm divisor).

    `_require_daily_et` refuses a value that can only be a horizon total, because
    that is the exact defect this signature exists to prevent.
    """
    return _fire_arithmetic(temp_max_c, wind_mean_kmh, _require_daily_et(et_mm_per_day))


#: Highest mean daily reference ET this implementation will accept (mm/day).
#: World-record daily ET is around 15 mm; a horizon total over any horizon we
#: publish is 20–60 mm. The gap is wide enough that a guard cannot reject a real
#: value, and it cannot accept the defect.
MAX_DAILY_ET_MM = 20.0


def _require_daily_et(value) -> float:
    """Mean daily ET in mm, or raise when the argument is a horizon total."""
    et = safe_float(value, 3.0)
    if et > MAX_DAILY_ET_MM:
        raise ValueError(
            f'et_mm_per_day={et!r} exceeds {MAX_DAILY_ET_MM} mm/day, which is only possible if a '
            'horizon total was passed instead of the daily mean (the 2026-09 defect)'
        )
    return max(et, 0.0)


def om_calc_tropical_cyclone(wind_gust_kmh, precip_total_mm):
    """Cyclone: gust wind above 50 km/h, with the rainfall it drags in.

    The argument is the window's **gust** maximum. The pipeline samples district
    centroids, and a centroid is not the eyewall: on Amphan's landfall day the
    sustained 10 m maximum there was 19–69 km/h while the gust field reached
    51–134 km/h, which is the difference between a class that scores 0.01–0.25
    and one that reaches the 0.5 band at the coast
    (`data/hindcast/reports/amphan-2020.json` §wind_drivers).
    """
    wind = _clip(max(safe_float(wind_gust_kmh, 0.0) - 50.0, 0.0) / 150.0)
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


def om_calc_heat_wave(temp_max_c, exceedance_days):
    """Heat wave: exceedance above 30 °C, plus persistence.

    `exceedance_days` is the number of days whose maximum actually exceeded
    30 °C — not the horizon length (see `om_calc_cold_wave`).
    """
    return _heat_wave_arithmetic(temp_max_c, _require_exceedance_days(exceedance_days, 30.0))


def _heat_wave_arithmetic(temp_max_c, duration_argument):
    return _clip(
        0.7 * _clip((safe_float(temp_max_c, 30.0) - 30.0) / 15.0)
        + 0.3 * _clip(safe_float(duration_argument, 1.0) / 5.0)
    )


# ── driver bundle → all eight scores ─────────────────────────────────────────

#: Upper bound for a legitimate exceedance count. The longest published horizon is 15 days and
#: the hindcast window is inclusive at both ends (16 days), so 31 is comfortably above any real
#: count while still rejecting a duration in hours or a multi-month series.
MAX_EXCEEDANCE_DAYS = 31

#: Drivers a caller must supply for a fully-qualified score set. Every one of them is a
#: *measured quantity of the window*, never a horizon total standing in for a daily value —
#: the distinction is the whole defect class this module was corrected for.
REQUIRED_DRIVERS = (
    'temp_max_c',
    'temp_min_c',
    'precip_total_mm',
    'precip_peak_mm',
    'wind_gust_kmh',
    'wind_mean_kmh',
    'et_mm_per_day',
    'heat_exceedance_days',
    'cold_exceedance_days',
)

#: Daily series a caller may hand over **instead of** a precomputed daily aggregate.
#:
#: This is the structural half of the 2026-09-18 correction. A scalar `et_mm_per_day` can be
#: wrong in a way no guard can detect — a horizon total is a plausible number — so the real
#: prevention is to remove the aggregation from the caller: a pipeline that passes the observed
#: daily values cannot pass the wrong aggregate, because it is not the one aggregating. Both
#: callers that feed published numbers (`scripts/auto_forecast.py` and
#: `scripts/hindcast/score.py`) pass the series; the scalar keys remain for fixtures and for
#: any consumer that genuinely has only an aggregate, and the guards below cover those.
DAILY_SERIES_DRIVERS = (
    ('daily_temp_max_c', 'temp_max_c', 'max'),
    ('daily_temp_min_c', 'temp_min_c', 'min'),
    ('daily_et0_mm', 'et_mm_per_day', 'mean'),
    ('daily_wind_max_kmh', 'wind_mean_kmh', 'mean'),
)

#: Thresholds the two persistence terms count days past (the formulas' own baselines).
HEAT_THRESHOLD_C = 30.0
COLD_THRESHOLD_C = 16.0


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
    resolved = resolve_drivers(drivers, horizon_days)
    return {
        'Cold Wave': om_calc_cold_wave(resolved.get('temp_min_c'), resolved.get('cold_exceedance_days')),
        'Drought': om_calc_drought(resolved.get('temp_max_c'), resolved.get('precip_total_mm')),
        'Fire': om_calc_fire(
            resolved.get('temp_max_c'), resolved.get('wind_mean_kmh'), resolved.get('et_mm_per_day')
        ),
        'Flash Flood': om_calc_flood(resolved.get('precip_total_mm'), resolved.get('precip_peak_mm')),
        'Flood': om_calc_flood(resolved.get('precip_total_mm'), resolved.get('precip_peak_mm')),
        'Heat Wave': om_calc_heat_wave(resolved.get('temp_max_c'), resolved.get('heat_exceedance_days')),
        'Severe Local Storm': om_calc_severe_storm(
            resolved.get('precip_peak_mm'), resolved.get('wind_gust_kmh')
        ),
        'Tropical Cyclone': om_calc_tropical_cyclone(
            resolved.get('wind_gust_kmh'), resolved.get('precip_total_mm')
        ),
    }


def resolve_drivers(drivers: dict, horizon_days: int) -> dict:
    """Aggregate the daily series a caller supplied, then fill in what is still missing.

    Order matters and is the whole design: a series always wins over a scalar, so a caller
    that hands over the observed days gets this module's aggregation and cannot pass the wrong
    one. The only derivation performed from scalars is `et_total_mm / horizon_days`, which is
    exact and unambiguous; a horizon length never becomes an exceedance count, because those
    are different measurements (the defect).
    """
    resolved = dict(drivers)
    for series_key, target, aggregate in DAILY_SERIES_DRIVERS:
        values = _finite([drivers.get(series_key)])
        values = _finite(drivers.get(series_key) or [])
        if not values:
            continue
        if aggregate == 'max':
            resolved[target] = max(values)
        elif aggregate == 'min':
            resolved[target] = min(values)
        else:
            resolved[target] = sum(values) / len(values)

    if resolved.get('heat_exceedance_days') is None:
        daily_max = _finite(drivers.get('daily_temp_max_c') or [])
        if daily_max:
            resolved['heat_exceedance_days'] = sum(1 for value in daily_max if value > HEAT_THRESHOLD_C)
    if resolved.get('cold_exceedance_days') is None:
        daily_min = _finite(drivers.get('daily_temp_min_c') or [])
        if daily_min:
            resolved['cold_exceedance_days'] = sum(1 for value in daily_min if value < COLD_THRESHOLD_C)

    if resolved.get('et_mm_per_day') is None and drivers.get('et_total_mm') is not None:
        resolved['et_mm_per_day'] = safe_float(drivers['et_total_mm']) / max(horizon_days, 1)

    # Always hand back the full vocabulary: a key present but `None` means "not supplied" and
    # is what `missing_drivers` reports, which is clearer than an absent key at every call site.
    for key in REQUIRED_DRIVERS:
        resolved.setdefault(key, None)
    return resolved


def _finite(values) -> list:
    """The values that are present and finite — the series a caller actually observed."""
    out = []
    for value in values or []:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            out.append(number)
    return out


def compute_legacy_scores(drivers: dict, horizon_days: int) -> dict:
    """The **pre-2026-09-18** wiring, kept here so the correction stays measurable.

    This is the defect, preserved on purpose. It passes:

      * the horizon **total** ET into the fire drying term (whose divisor and own default are
        daily values);
      * the horizon **length** into both persistence terms (which are written for a count of
        days that crossed the threshold);
      * the **sustained** maximum wind into the two wind-damage classes.

    Each of those put its term at its ceiling on every row of every committed hindcast episode,
    and the consequence was that `Fire` — a class that scores high everywhere in the pre-monsoon
    coastal belt and therefore separates nothing — became the physics track's top pick on 127 of
    128 windows of a landfalling cyclone. `scripts/hindcast/score.py` recomputes both wirings on
    the same rows so the reports carry the comparison; `check` then verifies it.

    Nothing in the live pipeline calls this. It exists because deleting the defect would also
    delete the evidence of what it did, and because a guard on the corrected path is only
    meaningful if there is a wrong version to guard against.
    """
    return {
        'Cold Wave': _cold_wave_arithmetic(drivers.get('temp_min_c'), horizon_days),
        'Drought': om_calc_drought(drivers.get('temp_max_c'), drivers.get('precip_total_mm')),
        'Fire': _fire_arithmetic(
            drivers.get('temp_max_c'), drivers.get('wind_max_kmh'), drivers.get('et_total_mm')
        ),
        'Flash Flood': om_calc_flood(drivers.get('precip_total_mm'), drivers.get('precip_peak_mm')),
        'Flood': om_calc_flood(drivers.get('precip_total_mm'), drivers.get('precip_peak_mm')),
        'Heat Wave': _heat_wave_arithmetic(drivers.get('temp_max_c'), horizon_days),
        'Severe Local Storm': om_calc_severe_storm(
            drivers.get('precip_peak_mm'), drivers.get('wind_max_kmh')
        ),
        'Tropical Cyclone': om_calc_tropical_cyclone(
            drivers.get('wind_max_kmh'), drivers.get('precip_total_mm')
        ),
    }


def missing_drivers(drivers: dict, horizon_days: int = 1) -> list:
    """Driver names absent or non-finite — recorded so a score can be qualified.

    Resolves the derivable keys first (`et_mm_per_day` from a horizon total), so a caller
    that supplies totals is not reported as missing something it did supply.
    """
    resolved = resolve_drivers(drivers, horizon_days)
    return [
        name
        for name in REQUIRED_DRIVERS
        if name not in resolved or not math.isfinite(safe_float(resolved.get(name), float('nan')))
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
