#!/usr/bin/env python3
"""Physics-track guards (Phase 2).

Two shipped defects are pinned here, both from the 2026-09-17 audit
(`docs/PRODUCT_SPEC.md` §5.3/§5.4, `docs/MODEL_CARD.md` §6):

1. **The physics cross-check was not independent.** It was computed only for the
   hazard class the model had already chosen, so it could never disagree with
   the model's *choice* of hazard — only with its magnitude. It also fell back
   to a flat `0.50` for anything it did not recognise.
2. **`om_calc_flood` received the same quantity twice**
   (`om_calc_flood(precip_total_mm, precip_total_mm)`), so rainfall *intensity*
   was never actually part of the flood score: 300 mm in a fortnight and 300 mm
   in a three-day burst scored identically. `om_calc_severe_storm` had the same
   wiring problem.

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
    compute_physics_scores,
    missing_drivers,
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

# A wet fortnight with an intense burst, a hot dry spell, and a calm week.
MONSOON = {
    'temp_max_c': 31.0,
    'temp_min_c': 25.0,
    'precip_total_mm': 300.0,
    'precip_peak_mm': 90.0,
    'wind_max_kmh': 45.0,
    'et_total_mm': 20.0,
}
CALM_DRY = {
    'temp_max_c': 33.0,
    'temp_min_c': 22.0,
    'precip_total_mm': 0.0,
    'precip_peak_mm': 0.0,
    'wind_max_kmh': 10.0,
    'et_total_mm': 40.0,
}
CYCLONE = {
    'temp_max_c': 29.0,
    'temp_min_c': 24.0,
    'precip_total_mm': 250.0,
    'precip_peak_mm': 80.0,
    'wind_max_kmh': 130.0,
    'et_total_mm': 10.0,
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
    wet_fortnight = om_calc_severe_storm(precip_peak_mm=5.0, wind_max_kmh=30.0)
    squall = om_calc_severe_storm(precip_peak_mm=100.0, wind_max_kmh=90.0)
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
    weak = om_calc_tropical_cyclone(wind_max_kmh=20.0, precip_total_mm=300.0)
    strong = om_calc_tropical_cyclone(wind_max_kmh=180.0, precip_total_mm=300.0)
    assert strong > weak
    assert om_calc_tropical_cyclone(50.0, 0.0) == 0.0


def test_fire_and_storm_are_bounded():
    for value in (
        om_calc_fire(60.0, 200.0, 100.0),
        om_calc_severe_storm(500.0, 300.0),
    ):
        assert 0.0 <= value <= 1.0


def test_missing_drivers_are_reported_not_defaulted_silently():
    partial = {'temp_max_c': 30.0, 'wind_max_kmh': 20.0}
    missing = missing_drivers(partial)
    assert 'precip_total_mm' in missing
    assert 'precip_peak_mm' in missing
    assert 'temp_min_c' in missing
    # Scoring still returns all eight, using the documented defaults.
    assert set(compute_physics_scores(partial, horizon_days=7)) == set(HAZARD_CLASSES)
    assert missing_drivers(MONSOON) == []


def test_non_finite_drivers_are_treated_as_missing():
    nan = float('nan')
    assert 'wind_max_kmh' in missing_drivers({**MONSOON, 'wind_max_kmh': nan})
    assert 'precip_peak_mm' in missing_drivers({**MONSOON, 'precip_peak_mm': None})


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
