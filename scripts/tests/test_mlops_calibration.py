"""Calibration fitting, application and the refusal rules (Phase 3 MLOps).

A calibration map is the artifact that lets the site say "this number is a
probability". The tests below are therefore split the way the risk is:

* **the fit works** — PAVA pools correctly, Platt converges, both improve the
  Brier score on an overconfident sample (the defect MODEL_CARD §6.1 documents);
* **the artifact behaves** — a stored map is a monotone function of the score, the
  map is written sorted by score, `apply()` interpolates and clamps at the ends;
* **it refuses** — an unfitted map, a map fitted on too few rows, a map with no
  provenance, a map that makes the Brier score worse, a non-converged fit, and a
  shipped template that claims none of those properties.
"""

import json
import pathlib
import random
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
FIXTURES = ROOT / 'scripts' / 'tests' / 'fixtures' / 'mlops'
sys.path.insert(0, str(SCRIPTS))

from mlops.calibration import (  # noqa: E402
    CalibrationError,
    CalibrationMap,
    apply_platt,
    decompose_reliability,
    fit_isotonic,
    fit_platt,
    pava,
    validate_decomposition,
)


def overconfident_sample(size=600, seed=3):
    """A sample where the model's score overshoots the true rate.

    Built the same way the fixture is: a latent probability, an outcome drawn from
    it, and a score pushed toward the extremes. A working calibration map must
    recover the diagonal from this; an uncalibrated score cannot.
    """
    rng = random.Random(seed)
    scores, outcomes = [], []
    for _ in range(size):
        latent = rng.random()
        outcomes.append(1 if rng.random() < latent else 0)
        scores.append(min(1.0, round(0.15 + latent * 1.8, 4)))
    return scores, outcomes


# ── PAVA ────────────────────────────────────────────────────────────────────

def test_pava_pools_violators_into_a_monotone_fit():
    fitted = pava([0.1, 0.2, 0.3, 0.9], [1, 0, 0, 1])
    assert fitted == pytest.approx([1 / 3, 1 / 3, 1 / 3, 1.0])
    assert all(fitted[index] <= fitted[index + 1] for index in range(len(fitted) - 1))


def test_pava_pools_identical_scores_into_one_value():
    # 0.5 is observed at 100 % and 0.9 at 0 %: the pair is a violation, so the whole
    # run pools to 2/3 — monotonicity is a property of the sequence, not of adjacent
    # pairs, which is why the pooling is iterative.
    fitted = pava([0.5, 0.5, 0.9], [1, 1, 0])
    assert fitted == pytest.approx([2 / 3, 2 / 3, 2 / 3])
    identical = pava([0.5, 0.5, 0.9], [1, 1, 1])
    assert identical[0] == identical[1] == 1.0


def test_pava_is_the_least_squares_fit_of_the_outcomes_not_of_the_scores():
    # Fitting the scores against themselves (the bug this replaced) returns the
    # input unchanged, which looks perfectly monotone and calibrates nothing.
    scores = [0.9, 0.9, 0.9, 0.9]
    fitted = pava(scores, [0, 0, 1, 1])
    assert fitted == pytest.approx([0.5, 0.5, 0.5, 0.5])
    assert fitted != pytest.approx(scores)


def test_pava_rejects_mismatched_inputs():
    with pytest.raises(CalibrationError):
        pava([0.1, 0.2], [1])


# ── fitting ─────────────────────────────────────────────────────────────────

def test_isotonic_fit_improves_brier_and_ece_on_an_overconfident_sample():
    scores, outcomes = overconfident_sample()
    fitted = fit_isotonic(scores, outcomes)
    assert fitted['monotone'] is True
    assert fitted['brier'] < fitted['brier_raw']
    assert fitted['ece'] < fitted['ece_raw']
    assert fitted['samples'] == len(scores)


def test_isotonic_pairs_are_sorted_by_score_and_deduplicated():
    fitted = fit_isotonic([0.9, 0.2, 0.5, 0.2], [1, 0, 1, 0])
    scores = [pair[0] for pair in fitted['pairs']]
    assert scores == sorted(scores)
    assert len(scores) == len(set(scores)) == 3


def test_platt_fit_converges_and_improves_the_brier_score():
    scores, outcomes = overconfident_sample()
    fitted = fit_platt(scores, outcomes)
    assert fitted['converged'] is True
    assert fitted['iterations'] >= 1
    assert fitted['brier'] < fitted['brier_raw']


def test_platt_recovers_a_monotone_direction():
    # `a` must be positive: a higher score still means a higher probability, just
    # less extremely. A negative `a` would invert the forecast.
    scores, outcomes = overconfident_sample(seed=11)
    assert fit_platt(scores, outcomes)['a'] > 0


def test_apply_platt_maps_endpoints_into_the_open_interval():
    assert 0.0 < apply_platt(1.0, 0.5, 0.0) < 1.0
    assert 0.0 < apply_platt(0.0, 0.5, 0.0) < 1.0
    assert apply_platt(0.5, 1.0, 0.0) == pytest.approx(0.5, abs=1e-6)


def test_fitting_rejects_input_it_cannot_use():
    with pytest.raises(CalibrationError):
        fit_isotonic([0.5], [1, 0])          # length mismatch
    with pytest.raises(CalibrationError):
        fit_isotonic([1.5], [1])             # out of range
    with pytest.raises(CalibrationError):
        fit_isotonic([None], [None])         # nothing usable


# ── the artifact ────────────────────────────────────────────────────────────

def fitted_map(**overrides):
    scores, outcomes = overconfident_sample()
    payload = {'fit_period': '2020-2025', 'fitted_on': '2026-09-18'}
    payload.update(overrides)
    return CalibrationMap.fit(scores, outcomes, method='isotonic', **payload)


def test_map_is_a_monotone_function_of_the_score():
    calibration = fitted_map()
    values = [calibration.apply(step / 100) for step in range(101)]
    assert values == sorted(values)
    assert values[0] <= values[-1]


def test_map_interpolates_between_fitted_knots_and_clamps_outside():
    calibration = fitted_map()
    assert calibration.apply(0.0) == pytest.approx(calibration.payload['pairs'][0][1])
    assert calibration.apply(1.0) == pytest.approx(calibration.payload['pairs'][-1][1])
    assert calibration.apply(0.9999) <= 1.0


def test_map_round_trips_through_json(tmp_path):
    calibration = fitted_map()
    path = tmp_path / 'map.json'
    calibration.save(path)
    reloaded = CalibrationMap.load(path)
    assert reloaded.payload == calibration.payload
    assert reloaded.apply(0.9) == calibration.apply(0.9)


def test_map_load_rejects_a_foreign_format(tmp_path):
    path = tmp_path / 'map.json'
    path.write_text(json.dumps({'format': 'something-else/v1', 'samples': 10}))
    with pytest.raises(CalibrationError):
        CalibrationMap.load(path)


def test_an_unfitted_map_refuses_to_apply():
    calibration = CalibrationMap({'format': 'hazardnet-calibration/v1', 'method': 'isotonic'})
    assert calibration.fitted is False
    with pytest.raises(CalibrationError):
        calibration.apply(0.9)
    assert 'no fitted parameters' in calibration.validate()[0]


def test_validation_flags_a_map_fitted_on_too_few_rows():
    small = CalibrationMap.fit([0.9, 0.8, 0.7], [1, 1, 0], method='isotonic',
                               fit_period='x', fitted_on='y')
    problems = small.validate()
    assert any('at least' in problem for problem in problems)


def test_validation_flags_missing_provenance():
    scores, outcomes = overconfident_sample()
    anonymous = CalibrationMap.fit(scores, outcomes, method='isotonic')
    assert any('provenance' in problem for problem in anonymous.validate())


def test_validation_flags_a_map_that_makes_the_brier_score_worse():
    payload = fitted_map().payload
    payload['brier'] = (payload['brier_raw'] or 0.2) + 0.1
    assert any('Brier' in problem for problem in CalibrationMap(payload).validate())


def test_validation_flags_a_non_converged_or_inverted_map():
    payload = fitted_map().payload
    payload['converged'] = False
    assert any('converge' in problem for problem in CalibrationMap(payload).validate())
    payload = fitted_map().payload
    payload['monotone'] = False
    assert any('monotone' in problem for problem in CalibrationMap(payload).validate())


def test_validation_passes_for_a_properly_fitted_map():
    assert fitted_map().validate() == []


def test_the_shipped_template_is_deliberately_unfitted():
    template = CalibrationMap.load(ROOT / 'Models' / 'calibration' / 'confidence_map.template.json')
    assert template.fitted is False
    assert template.payload['status'] == 'awaiting-outcomes'
    assert template.validate() == ['no fitted parameters']
    with pytest.raises(CalibrationError):
        template.apply(0.95)


def test_reliability_applies_the_map_before_scoring():
    scores, outcomes = overconfident_sample()
    calibration = fitted_map()
    report = calibration.reliability(scores, outcomes)
    assert report['brier'] < report['brier_raw']
    assert report['samples'] == len(scores)


# ── decomposition ───────────────────────────────────────────────────────────

def test_decomposition_reconciles_with_the_brier_score():
    scores, outcomes = overconfident_sample()
    calibration = fitted_map()
    applied = [calibration.apply(score) for score in scores]
    decomposition = decompose_reliability(scores, applied, outcomes)
    check = validate_decomposition(decomposition, raw_brier=calibration.payload['brier'])
    assert check['consistent'] is True


def test_decomposition_says_so_when_it_is_in_sample():
    scores, outcomes = overconfident_sample()
    # The degenerate case is a map that reproduces the labels themselves: perfect
    # reliability, zero resolution — well calibrated and useless.
    oracle = [1.0 if outcome else 0.0 for outcome in outcomes]
    decomposition = decompose_reliability(scores, oracle, outcomes)
    assert decomposition['reliability'] == 0
    assert 'in-sample' in validate_decomposition(decomposition, raw_brier=scores and 0.0)['note']


# ── the CLI paths that stamp a map onto data ────────────────────────────────

def run_cli(*args):
    return subprocess.run(
        [sys.executable, '-m', 'mlops.cli', *args],
        capture_output=True, text=True, cwd=SCRIPTS,
    )


def test_cli_calibrate_refuses_without_enough_labelled_predictions():
    result = run_cli('calibrate', '--fit-from', str(FIXTURES / 'synthetic_predictions.csv'),
                     '--outcomes', str(FIXTURES / 'synthetic_outcomes.json'),
                     '--min-samples', '1000')
    assert result.returncode == 2
    assert 'Refusing to fit' in result.stdout


def test_cli_calibrate_fits_and_reports_the_improvement(tmp_path):
    out = tmp_path / 'map.json'
    result = run_cli('calibrate', '--fit-from', str(FIXTURES / 'synthetic_predictions.csv'),
                     '--outcomes', str(FIXTURES / 'synthetic_outcomes.json'),
                     '--absence-means-no-event', '--min-samples', '200',
                     '--fit-period', 'synthetic-2026', '--fitted-on', '2026-09-18',
                     '--out', str(out))
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'Brier' in result.stdout
    payload = json.loads(out.read_text())
    assert payload['samples'] >= 200
    assert payload['brier'] <= payload['brier_raw']


def test_cli_apply_calibration_refuses_the_unfitted_template(tmp_path):
    result = run_cli('apply-calibration',
                     '--csv', str(FIXTURES / 'synthetic_predictions.csv'),
                     '--map', str(ROOT / 'Models' / 'calibration' / 'confidence_map.template.json'),
                     '--out', str(tmp_path / 'out.csv'))
    assert result.returncode == 2
    assert 'refusing to stamp' in result.stdout.lower()
    assert not (tmp_path / 'out.csv').exists()


def test_cli_apply_calibration_stamps_the_map_and_keeps_the_raw_score(tmp_path):
    map_path = tmp_path / 'map.json'
    fit = run_cli('calibrate', '--fit-from', str(FIXTURES / 'synthetic_predictions.csv'),
                  '--outcomes', str(FIXTURES / 'synthetic_outcomes.json'),
                  '--absence-means-no-event', '--min-samples', '200',
                  '--fit-period', 'synthetic-2026', '--fitted-on', '2026-09-18',
                  '--out', str(map_path))
    assert fit.returncode == 0, fit.stdout

    out = tmp_path / 'calibrated.csv'
    result = run_cli('apply-calibration',
                     '--csv', str(FIXTURES / 'synthetic_predictions.csv'),
                     '--map', str(map_path), '--out', str(out))
    assert result.returncode == 0, result.stdout

    import csv
    rows = list(csv.DictReader(out.read_text().splitlines()))
    assert len(rows) == 400
    assert all(row['confidence_kind'] == 'calibrated_probability' for row in rows)
    assert all(0.0 < float(row['confidence_calibrated']) <= 1.0 for row in rows)
    calibrated = [float(row['confidence_calibrated']) for row in rows]
    raw = [float(row['confidence_raw']) for row in rows]
    # Direction is not asserted: on this fixture the map raises the low scores
    # (toward the 58 % base rate) and lowers the saturated ones, so the mean can
    # move either way. What must hold is that the fitted map is what was applied.
    assert any(abs(applied - base) > 1e-6 for applied, base in zip(calibrated, raw))
    # The calibrated value must equal what the map says for the raw score.
    calibration = CalibrationMap.load(map_path)
    assert float(rows[0]['confidence_calibrated']) == calibration.apply(float(rows[0]['confidence_raw']))
