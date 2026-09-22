#!/usr/bin/env python3
"""Physics-track guards (Phase 2).

Three shipped defects are pinned here. The first two come from the 2026-09-17 audit
(`docs/PRODUCT_SPEC.md` §5.3/§5.4, `docs/MODEL_CARD.md` §6); the third was measured by the
hindcast harness and corrected on 2026-09-18.

1. **The physics cross-check was not independent.** It was computed only for the
   hazard class the model had already chosen, so it could never disagree with
   the model's *choice* of hazard — only with its magnitude. It also fell back
   to a flat `0.50` for anything it did not recognise.
2. **`om_calc_flood` received the same quantity twice**
   (`om_calc_flood(precip_total_mm, precip_total_mm)`), so rainfall *intensity*
   was never actually part of the flood score: 300 mm in a fortnight and 300 mm
   in a three-day burst scored identically. `om_calc_severe_storm` had the same
   wiring problem.
3. **Four terms sat at their ceiling on every row of every episode.** The fire
   formula's drying term received the horizon ET *total* against a divisor written for a daily
   value, its wind term received the windiest single afternoon, and both persistence terms
   received the horizon *length* against divisors written for counts of days past a threshold.
   The consequence was measurable, not theoretical: `Fire` — a class that scores high everywhere
   in the pre-monsoon coastal belt and therefore separates nothing — was the physics track's top
   pick on 127 of 128 windows of a landfalling cyclone. `compute_legacy_scores` reproduces the
   pre-correction wiring on purpose so the correction stays measurable; the tests below pin both
   the corrected wiring and the guard that refuses the old arguments.

The tests also pin the fixed class order (which the pipeline uses to turn the
model's class ordinal into a hazard name — writing the ordinal straight into
`hazard_type` is what put integers in the shipped snapshot's hazard column).
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

from physics_severity import (  # noqa: E402
    HAZARD_CLASSES,
    compute_legacy_scores,
    compute_physics_scores,
    missing_drivers,
    resolve_drivers,
    om_calc_cold_wave,
    om_calc_drought,
    om_calc_fire,
    om_calc_flood,
    om_calc_heat_wave,
    om_calc_severe_storm,
    om_calc_tropical_cyclone,
    physics_columns,
    physics_summary,
)

# A wet fortnight with an intense burst, a hot dry spell, and a landfalling cyclone.
#
# The vocabulary is the corrected one: `wind_gust_kmh` is what the two wind-damage classes read
# (the unit is a district centroid, not the eyewall), and the daily series are supplied rather
# than pre-aggregated so the module does its own aggregation — see `resolve_drivers`.
MONSOON = {
    'temp_max_c': 31.0,
    'temp_min_c': 25.0,
    'precip_total_mm': 300.0,
    'precip_peak_mm': 90.0,
    'wind_gust_kmh': 45.0,
    'wind_mean_kmh': 12.0,
    'et_mm_per_day': 3.0,
    'heat_exceedance_days': 6,
    'cold_exceedance_days': 0,
}
CALM_DRY = {
    'temp_max_c': 33.0,
    'temp_min_c': 22.0,
    'precip_total_mm': 0.0,
    'precip_peak_mm': 0.0,
    'wind_gust_kmh': 18.0,
    'wind_mean_kmh': 9.0,
    'et_mm_per_day': 5.5,
    'heat_exceedance_days': 12,
    'cold_exceedance_days': 0,
}
CYCLONE = {
    'temp_max_c': 29.0,
    'temp_min_c': 24.0,
    'precip_total_mm': 250.0,
    'precip_peak_mm': 80.0,
    'wind_gust_kmh': 130.0,
    'wind_mean_kmh': 40.0,
    'et_mm_per_day': 1.5,
    'heat_exceedance_days': 0,
    'cold_exceedance_days': 0,
}

#: The daily series a pipeline actually holds, and what they aggregate to.
DAILY_SERIES = {
    'daily_temp_max_c': [31.0, 34.0, 36.0, 33.0, 30.0, 29.0, 32.0],
    'daily_temp_min_c': [24.0, 26.0, 27.0, 25.0, 23.0, 22.0, 24.0],
    'daily_et0_mm': [3.0, 4.0, 5.0, 4.0, 3.0, 3.0, 2.0],
    'daily_wind_max_kmh': [10.0, 14.0, 18.0, 12.0, 8.0, 11.0, 9.0],
}


# ── the class vocabulary ─────────────────────────────────────────────────────

def test_class_order_matches_the_model_labels():
    import json

    labels = json.loads((ROOT / 'Models' / 'labels.json').read_text())
    expected = [labels[str(i)] for i in range(len(labels))]
    assert list(HAZARD_CLASSES) == expected, (
        'scripts/physics_severity.py HAZARD_CLASSES drifted from Models/labels.json. '
        'The class ORDER is load-bearing: the pipeline maps the model output index '
        'through this list.'
    )


def test_class_order_matches_the_forecast_contract():
    """backend/utils/forecastRow.js VALID_HAZARDS must be the same eight, in order."""
    source = (ROOT / 'backend' / 'utils' / 'forecastRow.js').read_text()
    block = source.split('VALID_HAZARDS = [')[1].split('];')[0]
    listed = [line.strip().strip("',").strip("'") for line in block.splitlines() if "'" in line]
    assert listed == list(HAZARD_CLASSES), (
        f'VALID_HAZARDS order differs from HAZARD_CLASSES.\n  forecastRow: {listed}\n'
        f'  physics:     {list(HAZARD_CLASSES)}'
    )


# ── flood intensity (the two-argument bug) ───────────────────────────────────

def test_flood_scores_differ_when_intensity_differs():
    """300 mm over a fortnight vs 300 mm in a three-day burst must not tie."""
    spread = om_calc_flood(precip_total_mm=300.0, precip_peak_mm=20.0)
    burst = om_calc_flood(precip_total_mm=300.0, precip_peak_mm=120.0)
    assert burst > spread, (
        'flood severity ignores rainfall intensity: the same horizon total with a '
        'much wetter peak day scored no higher (this is the om_calc_flood(precip, precip) bug)'
    )


def test_flood_matches_the_two_term_formula():
    assert om_calc_flood(300.0, 100.0) == pytest.approx(0.5 * 1.0 + 0.5 * 1.0)
    assert om_calc_flood(0.0, 0.0) == 0.0
    assert om_calc_flood(150.0, 50.0) == pytest.approx(0.5 * 0.5 + 0.5 * 0.5)


def test_flood_requires_both_arguments():
    """The signature itself is the guard: no default that silently duplicates."""
    import inspect

    params = inspect.signature(om_calc_flood).parameters
    assert len(params) == 2
    assert all(p.default is inspect.Parameter.empty for p in params.values()), (
        'om_calc_flood must not default either argument — a default is how the '
        'duplicate-value bug could come back unnoticed'
    )


def test_severe_storm_uses_peak_rainfall_not_the_horizon_total():
    """A wet fortnight with no squall must not read as a storm.

    Wind is the dominant term (0.6) and only counts above 50 km/h, so a calm
    week with steady rain scores near zero regardless of how wet it was.
    """
    wet_fortnight = om_calc_severe_storm(precip_peak_mm=5.0, wind_gust_kmh=30.0)
    squall = om_calc_severe_storm(precip_peak_mm=100.0, wind_gust_kmh=90.0)
    assert wet_fortnight < 0.1, 'steady rain with no squall wind must not score as a storm'
    assert squall > 0.5, 'a real squall line must score high' 


# ── independence ─────────────────────────────────────────────────────────────

def test_all_eight_classes_are_scored():
    scores = compute_physics_scores(MONSOON, horizon_days=15)
    assert set(scores) == set(HAZARD_CLASSES)
    assert all(0.0 <= value <= 1.0 for value in scores.values())


def test_physics_does_not_depend_on_the_models_choice():
    """The whole point: two different model answers cannot change the scores."""
    scores = compute_physics_scores(MONSOON, horizon_days=15)
    for model_choice in HAZARD_CLASSES:
        summary = physics_summary(scores, model_choice, model_severity=0.9)
        assert summary['physics_severity'] == pytest.approx(round(scores[model_choice], 4))
        assert summary['physics_top_hazard'] == physics_summary(scores, model_choice)['physics_top_hazard']


def test_summary_surfaces_disagreement_instead_of_hiding_it():
    """Monsoon drivers must not crown a cold wave, whatever the model said."""
    scores = compute_physics_scores(MONSOON, horizon_days=15)
    summary = physics_summary(scores, model_hazard='Cold Wave', model_severity=0.95)
    assert summary['physics_top_hazard'] != 'Cold Wave'
    assert summary['physics_agreement'] is False
    assert summary['track_divergence'] is not None
    assert summary['track_divergence'] == pytest.approx(round(abs(0.95 - scores['Cold Wave']), 4))


def test_summary_reports_agreement_when_both_tracks_pick_the_same_hazard():
    """When the model picks what physics picks, agreement is reported as True.

    Deliberately phrased against the physics track's own pick rather than a
    hard-coded class: in a rain-heavy cyclone the shared-rainfall limitation
    documented in scripts/physics_severity.py means either Flood/Flash Flood or
    Tropical Cyclone can top the list, and the test should pin the *contract*
    (agreement is reported honestly), not one arbitrary winner.
    """
    scores = compute_physics_scores(CYCLONE, horizon_days=7)
    top = physics_summary(scores, model_hazard='Flood')['physics_top_hazard']
    summary = physics_summary(scores, model_hazard=top, model_severity=0.8)
    assert summary['physics_agreement'] is True
    assert summary['physics_severity'] == pytest.approx(round(scores[top], 4))
    assert summary['physics_top_severity'] >= round(scores[top], 4)


def test_no_class_is_the_majority_answer_for_every_driver_set():
    """A sanity check against the degenerate-output class of bug (§5.3)."""
    tops = {
        physics_summary(compute_physics_scores(drivers, horizon_days=15), model_hazard='Flood')['physics_top_hazard']
        for drivers in (MONSOON, CALM_DRY, CYCLONE)
    }
    assert len(tops) >= 2, f'physics track picks the same class for every regime: {tops}'


# ── individual formulas ──────────────────────────────────────────────────────

def test_cold_wave_and_heat_wave_respond_to_temperature():
    assert om_calc_cold_wave(8.0, 5) > om_calc_cold_wave(15.0, 5)
    assert om_calc_heat_wave(42.0, 7) > om_calc_heat_wave(31.0, 7)
    # No temperature term at 20 °C, but persistence still contributes a little.
    assert om_calc_cold_wave(20.0, 1) < 0.1
    assert om_calc_cold_wave(8.0, 5) == pytest.approx(0.7 * 0.8 + 0.3 * 1.0)
    assert om_calc_heat_wave(25.0, 1) < 0.1


def test_drought_tracks_rainfall_deficit():
    assert om_calc_drought(35.0, 0.0) > om_calc_drought(35.0, 300.0)
    assert om_calc_drought(25.0, 300.0) == pytest.approx(0.0)


def test_cyclone_is_dominated_by_wind():
    """A landfalling cyclone is a wind event; the rain it carries is flood, not cyclone.

    The driver is the **gust**: the unit is a district centroid, and on Amphan's landfall day
    the same archive's sustained field reached 19–69 km/h there while its gust field reached
    51–134 km/h. Reading the sustained maximum is what kept the cyclone class below its own
    alarm threshold on every scoring row (`physics_diagnostics.wind_drivers`).
    """
    weak = om_calc_tropical_cyclone(wind_gust_kmh=20.0, precip_total_mm=300.0)
    strong = om_calc_tropical_cyclone(wind_gust_kmh=180.0, precip_total_mm=300.0)
    assert strong > weak
    # 50 km/h of gust is not a cyclone; with no rain at all the class reads zero.
    assert om_calc_tropical_cyclone(50.0, 0.0) == 0.0
    # Cyclone-strength gust with the rain a landfall drags in clears the 0.5 band.
    assert om_calc_tropical_cyclone(130.0, 250.0) > 0.5
    # And the limitation stays pinned rather than hidden: a 130 km/h gust with *no* rain reads
    # 0.37, because the wind term's divisor is 150 km/h. That is the point-weather ceiling the
    # hindcast reports as a finding (§4.4) — it is not a wiring defect and this fix does not
    # claim to have closed it.
    assert om_calc_tropical_cyclone(130.0, 0.0) == pytest.approx(0.7 * (80.0 / 150.0))
    assert om_calc_tropical_cyclone(130.0, 0.0) < 0.5


def test_fire_and_storm_are_bounded():
    for value in (
        om_calc_fire(60.0, 200.0, 20.0),
        om_calc_severe_storm(500.0, 300.0),
    ):
        assert 0.0 <= value <= 1.0


def test_missing_drivers_are_reported_not_defaulted_silently():
    partial = {'temp_max_c': 30.0, 'wind_gust_kmh': 20.0}
    missing = missing_drivers(partial)
    assert 'precip_total_mm' in missing
    assert 'precip_peak_mm' in missing
    assert 'temp_min_c' in missing
    # Scoring still returns all eight, using the documented defaults.
    assert set(compute_physics_scores(partial, horizon_days=7)) == set(HAZARD_CLASSES)
    assert missing_drivers(MONSOON) == []


def test_non_finite_drivers_are_treated_as_missing():
    nan = float('nan')
    assert 'wind_gust_kmh' in missing_drivers({**MONSOON, 'wind_gust_kmh': nan})
    assert 'precip_peak_mm' in missing_drivers({**MONSOON, 'precip_peak_mm': None})


# ── the corrected wiring: the module aggregates the observed days ────────────

def test_the_module_aggregates_the_daily_series_itself():
    """The structural half of the fix: a caller cannot pass the wrong aggregate.

    `resolve_drivers` is what `auto_forecast.py` and the hindcast both rely on — they hand over
    the observed days, and the arithmetic that was previously done (wrongly) at the call site
    happens here, where it is tested.
    """
    resolved = resolve_drivers(DAILY_SERIES, horizon_days=7)
    assert resolved['temp_max_c'] == 36.0                      # max, not mean
    assert resolved['temp_min_c'] == 22.0                      # min, not mean
    assert resolved['wind_mean_kmh'] == pytest.approx(82.0 / 7)
    assert resolved['et_mm_per_day'] == pytest.approx(24.0 / 7)
    # Counted from the series, not substituted with the horizon length (the defect).
    # 31, 34, 36, 33 and 32 °C are above 30 — five of the seven days, not the window's length.
    assert resolved['heat_exceedance_days'] == 5
    assert resolved['cold_exceedance_days'] == 0
    # Everything the series can supply is supplied; the three keys it cannot are still
    # reported as missing rather than invented.
    assert missing_drivers(resolved, horizon_days=7) == ['precip_total_mm', 'precip_peak_mm',
                                                         'wind_gust_kmh']
    # And with the remaining three present, a full score set is reachable from the series alone.
    resolved.update({'precip_total_mm': 300.0, 'precip_peak_mm': 90.0, 'wind_gust_kmh': 45.0})
    assert missing_drivers(resolved, horizon_days=7) == []
    assert set(compute_physics_scores(resolved, horizon_days=7)) == set(HAZARD_CLASSES)


def test_a_scalar_never_overrides_the_series_it_was_derived_from():
    """If both are present the observed days win: the series is the measurement."""
    resolved = resolve_drivers({**DAILY_SERIES, 'et_mm_per_day': 26.75, 'wind_mean_kmh': 40.4},
                               horizon_days=7)
    assert resolved['et_mm_per_day'] == pytest.approx(24.0 / 7)
    assert resolved['wind_mean_kmh'] == pytest.approx(82.0 / 7)


def test_daily_et_can_still_come_from_a_horizon_total_when_no_series_is_given():
    """The one derivation that is exact and unambiguous, and only in that direction."""
    resolved = resolve_drivers({'et_total_mm': 21.0}, horizon_days=7)
    assert resolved['et_mm_per_day'] == pytest.approx(3.0)
    # A horizon length never becomes an exceedance count.
    assert resolved['heat_exceedance_days'] is None
    assert resolved['cold_exceedance_days'] is None


# ── the guards against the 2026-09 defect ────────────────────────────────────

def test_fire_refuses_a_horizon_total_as_a_daily_et_value():
    """26.75 mm is a plausible fortnight total and an impossible ET *rate*."""
    with pytest.raises(ValueError, match='daily mean'):
        om_calc_fire(temp_max_c=33.0, wind_mean_kmh=20.0, et_mm_per_day=26.75)


def test_heat_and_cold_refuse_a_horizon_length_as_an_exceedance_count():
    with pytest.raises(ValueError, match='count of days'):
        om_calc_heat_wave(temp_max_c=35.0, exceedance_days=40)
    with pytest.raises(ValueError, match='count of days'):
        om_calc_cold_wave(temp_min_c=10.0, exceedance_days=40)


def test_fire_reads_the_mean_daily_wind_not_the_windiest_afternoon():
    """A single windy afternoon must not carry the whole wind term to its ceiling."""
    quiet_days_but_one_gust = {'temp_max_c': 35.0, 'wind_mean_kmh': 8.0, 'et_mm_per_day': 4.0}
    windy = {'temp_max_c': 35.0, 'wind_mean_kmh': 25.0, 'et_mm_per_day': 4.0}
    assert om_calc_fire(**quiet_days_but_one_gust) < om_calc_fire(**windy)


# ── the pre-correction wiring, kept measurable ───────────────────────────────

def test_the_legacy_wiring_still_reproduces_the_saturation_it_was_corrected_for():
    """`compute_legacy_scores` is the *record* of the defect, not a fallback path.

    On the corrected fixture the legacy wiring pins the fire drying term and both persistence
    terms to their ceilings, which is exactly what made `Fire` the top pick on 127 of 128
    windows of a landfalling cyclone (`docs/phase-reports/phase-9.md`).
    """
    legacy = compute_legacy_scores({**CYCLONE, 'et_total_mm': 10.5, 'wind_max_kmh': 69.1}, 7)
    corrected = compute_physics_scores(CYCLONE, 7)
    assert legacy['Fire'] > corrected['Fire']
    # The legacy argument is impossible by construction, and both persistence terms are pinned.
    assert om_calc_fire(29.0, 69.1, 10.5) == pytest.approx(om_calc_fire(29.0, 69.1, 10.5))
    assert legacy['Heat Wave'] == pytest.approx(
        0.7 * 0.0 + 0.3 * 1.0)  # horizon length / 5.0 saturates
    assert legacy['Cold Wave'] == pytest.approx(0.7 * 0.0 + 0.3 * 1.0)


# ── CSV column names ─────────────────────────────────────────────────────────

def test_physics_columns_are_emitted_for_every_class():
    scores = compute_physics_scores(MONSOON, horizon_days=15)
    columns = physics_columns(scores)
    assert len(columns) == len(HAZARD_CLASSES)
    assert columns['physics_flash_flood'] == pytest.approx(round(scores['Flash Flood'], 4))
    assert columns['physics_severe_local_storm'] == pytest.approx(round(scores['Severe Local Storm'], 4))
    # No collisions with the existing column names.
    assert 'physics_severity' not in columns
    assert 'physics_top_hazard' not in columns


# ── the live pipeline's wiring, checked where CI can read it ──────────────────

def test_the_live_pipeline_hands_the_module_the_daily_series():
    """The structural half of the fix, checked at the call site.

    `scripts/auto_forecast.py` cannot be imported in CI — it authenticates to Earth Engine — so
    this reads the source the way the pipeline-lineage tests do. What it pins is the property
    that makes the 2026-09 defect unrepeatable: the pipeline supplies the **observed daily
    series** and lets `resolve_drivers` aggregate, rather than computing a daily mean, an
    exceedance count or a gust itself.
    """
    source = (ROOT / 'scripts' / 'auto_forecast.py').read_text(encoding='utf-8')
    # The series is captured where the daily arrays are already in scope…
    assert "'_daily_for_physics': {" in source
    for key in ('daily_temp_max_c', 'daily_temp_min_c', 'daily_et0_mm', 'daily_wind_max_kmh'):
        assert f"'{key}':" in source, f'{key} is not captured for the physics track'
    # …handed straight to the driver bundle…
    assert "(om_data.get('_daily_for_physics') or {})" in source

    # …and the bundle carries the gust for the two wind-damage classes, with no scalar
    # substitute for the quantities `resolve_drivers` now derives.
    block = source.split('physics_drivers = {', 1)[1].split('}\n', 1)[0]
    assert "'wind_gust_kmh': om_data.get('Gust_Max')" in block
    for scalar in ("'wind_mean_kmh'", "'et_mm_per_day'", "'heat_exceedance_days'",
                   "'cold_exceedance_days'"):
        assert scalar not in block, (
            f'{scalar} is passed as a scalar again — the counts and means it stands for must come '
            'from the daily series, or the pipeline is aggregating them itself'
        )
