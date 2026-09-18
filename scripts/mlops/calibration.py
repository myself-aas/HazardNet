#!/usr/bin/env python3
"""Isotonic and Platt calibration — making `confidence` mean what it says.

WHY THIS EXISTS
---------------
The shipped rows carry `confidence_kind: model_softmax_top_class`: the model's
own softmax for its top class, which the model card (§6.1) shows is *saturated*
(19/25 rows at 1.0000 at 7 days, 49/49 at 15 days). A softmax of 1.0 is not a
90 %-confident statement, and the public copy has claimed it was "calibrated
against ground stations and Sentinel-1 SAR observations" with nothing behind it.
Phase 3 replaces the claim with an artifact.

WHAT IS IMPLEMENTED, AND WHAT IT REFUSES TO DO
----------------------------------------------
* `fit_isotonic` — the pool-adjacent-violators algorithm (PAVA), non-decreasing,
  with tie handling. Implemented here rather than pulled from scikit-learn so the
  rules are readable and testable offline.
* `fit_platt` — two-parameter logistic fit by damped Newton iterations on the
  log-likelihood, with a deterministic initialisation and a convergence report.
* `CalibrationMap` — the serialisable artifact: method, fitted pairs, the sample
  it was fitted on, and its own reliability numbers. `apply()` refuses to run on a
  map that was never fitted.

**The refusal rules matter more than the fitting.** A calibration map fitted on
the same events the model trained on measures nothing; one fitted on 40 rows
overfits; one derived from the *fitted values themselves* (see
`decompose_reliability`) is circular. `validation_problems()` states all of those,
and `scripts/publish_forecast_csv.py` refuses to stamp a calibrated probability
whose map does not pass them.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from .metrics import brier_score, expected_calibration_error, reliability_bins

FORMAT = 'hazardnet-calibration/v1'

#: Below this many labelled outcomes a map cannot be trusted (a step function
#: fitted on a handful of points reproduces the sample, not the phenomenon).
MIN_FIT_SAMPLES = 200

#: A map must improve the Brier score by this much on its own fit sample before
#: it is worth shipping; equal-or-worse means "leave the softmax alone".
MIN_BRIER_IMPROVEMENT = 0.0


class CalibrationError(ValueError):
    """Raised for input a calibration map cannot be built or applied to."""


def _clean_pairs(scores, outcomes) -> list:
    if len(scores) != len(outcomes):
        raise CalibrationError(f'{len(scores)} scores but {len(outcomes)} outcomes')
    pairs = []
    for index, (score, outcome) in enumerate(zip(scores, outcomes)):
        if score is None or outcome is None:
            continue
        value = float(score)
        if not 0.0 <= value <= 1.0:
            raise CalibrationError(f'[{index}] score {value} outside [0, 1]')
        pairs.append((value, 1 if outcome else 0))
    if not pairs:
        raise CalibrationError('no usable (score, outcome) pairs')
    return pairs


# ── isotonic regression (PAVA) ──────────────────────────────────────────────

def pava(x, y, weights=None) -> list:
    """Pool adjacent violators: the least-squares non-decreasing fit of `y` on `x`.

    `x` are the scores and `y` the observed outcomes, which are *different*
    vectors — fitting the scores against themselves (an earlier version of this
    function did exactly that) returns the input unchanged and looks like a
    perfectly monotone map. Returns one fitted value per input position.

    Equal scores are pooled first: two rows with the same score must map to the
    same probability, or the calibration map would not be a function of the score.
    """
    if len(x) != len(y):
        raise CalibrationError(f'{len(x)} scores but {len(y)} outcomes')
    if not x:
        return []
    if weights is None:
        weights = [1.0] * len(x)
    if len(weights) != len(x):
        raise CalibrationError('weights must be the same length as the scores')

    order = sorted(range(len(x)), key=lambda index: (x[index], index))
    groups = []
    for index in order:
        if groups and x[index] == x[groups[-1][0]]:
            groups[-1].append(index)
        else:
            groups.append([index])

    stack = []
    for group in groups:
        total_weight = sum(weights[index] for index in group)
        if total_weight <= 0:
            raise CalibrationError('weights must be positive')
        value = sum(weights[index] * y[index] for index in group) / total_weight
        stack.append({'indices': list(group), 'weight': total_weight, 'value': value})
        # Whenever a block is below its predecessor the two are pooled; the
        # weighted mean keeps the merged block above the one before it, so a
        # single pass suffices.
        while len(stack) >= 2 and stack[-2]['value'] >= stack[-1]['value']:
            right = stack.pop()
            left = stack.pop()
            weight = left['weight'] + right['weight']
            stack.append({
                'indices': left['indices'] + right['indices'],
                'weight': weight,
                'value': (left['value'] * left['weight'] + right['value'] * right['weight']) / weight,
            })

    fitted = [0.0] * len(x)
    for block in stack:
        for index in block['indices']:
            fitted[index] = block['value']
    return fitted


def fit_isotonic(scores, outcomes, *, bins: int = 10) -> dict:
    """Fit a non-decreasing score → probability map and report how it behaves.

    The fitted values are evaluated where a consumer will use them — on bins of
    the score — because that is what the reliability diagram plots, and a map can
    look monotone yet still be overconfident across a whole bin.
    """
    pairs = _clean_pairs(scores, outcomes)
    scores_only = [score for score, _ in pairs]
    outcomes_only = [outcome for _, outcome in pairs]
    fitted = pava(scores_only, [float(outcome) for _, outcome in pairs])

    # The map is a function of the score, so it is stored sorted by score with
    # duplicate scores collapsed (PAVA already gave them one value). Storing it in
    # input order — an earlier version did — makes `apply()`'s interpolation walk
    # backwards through the knots and silently return the wrong probability.
    by_score = {}
    for score, value in zip(scores_only, fitted):
        by_score[score] = value
    ordered = sorted(by_score.items())

    rows = reliability_bins(fitted, outcomes_only, bins=bins)
    raw_rows = reliability_bins(scores_only, outcomes_only, bins=bins)
    return {
        'method': 'isotonic',
        'pairs': [[round(score, 6), round(value, 6)] for score, value in ordered],
        'samples': len(pairs),
        'unique_scores': len(ordered),
        'base_rate': sum(outcomes_only) / len(outcomes_only),
        'brier': brier_score(fitted, outcomes_only),
        'brier_raw': brier_score(scores_only, outcomes_only),
        'ece': expected_calibration_error(rows, total=len(pairs)),
        'ece_raw': expected_calibration_error(raw_rows, total=len(pairs)),
        'monotone': all(
            ordered[index][1] <= ordered[index + 1][1] + 1e-12 for index in range(len(ordered) - 1)
        ),
    }


# ── Platt scaling ───────────────────────────────────────────────────────────

def fit_platt(scores, outcomes, *, iterations: int = 100, tolerance: float = 1e-9) -> dict:
    """Fit `sigmoid(a·logit(s) + b)` by damped Newton iterations.

    Two parameters instead of a step function, so it cannot overfit 200 points
    into 200 steps — at the cost of only being able to re-scale confidence, not
    reshape it. The convergence report says whether the fit actually converged;
    a non-converged fit is not silently returned as a success.
    """
    pairs = _clean_pairs(scores, outcomes)
    scores_only = [min(max(score, 1e-6), 1 - 1e-6) for score, _ in pairs]
    outcomes_only = [outcome for _, outcome in pairs]
    logits = [math.log(score / (1 - score)) for score in scores_only]

    a, b = 1.0, 0.0  # identity in logit space: the softmax itself
    history = []
    converged = False
    for step in range(iterations):
        # Gradient and curvature of the *log-likelihood* (not of a loss): with
        # g = Σ (y − p)·z and the information matrix H = Σ p(1−p)·zzᵀ, Newton's
        # step for a maximisation is Δ = +H⁻¹g. Using the loss convention
        # (g = Σ (p − y)·z) with a `+` sign walks *uphill in the wrong
        # direction* — which is exactly the bug this comment exists to prevent
        # from coming back (the first version of this function never improved)
        gradient_a = gradient_b = 0.0
        info_aa = info_ab = info_bb = 0.0
        for z, y in zip(logits, outcomes_only):
            p = _sigmoid(a * z + b)
            error = y - p
            gradient_a += error * z
            gradient_b += error
            weight = p * (1 - p)
            info_aa += weight * z * z
            info_ab += weight * z
            info_bb += weight
        # Ridge term keeps the system solvable when the scores are saturated
        # (precisely the situation being corrected: p ≈ 1 for every row).
        ridge = 1e-9
        info_aa += ridge
        info_bb += ridge
        determinant = info_aa * info_bb - info_ab * info_ab
        if determinant <= 0:
            break
        delta_a = (info_bb * gradient_a - info_ab * gradient_b) / determinant
        delta_b = (info_aa * gradient_b - info_ab * gradient_a) / determinant

        # Backtracking line search: the unconstrained Newton step can be huge on
        # separable data, so accept the largest step that actually improves the
        # likelihood (halving up to ~30 times).
        step_size = 1.0
        improved = False
        current = _log_likelihood(a, b, logits, outcomes_only)
        for _ in range(30):
            candidate_a = a + step_size * delta_a
            candidate_b = b + step_size * delta_b
            if _log_likelihood(candidate_a, candidate_b, logits, outcomes_only) >= current:
                a, b = candidate_a, candidate_b
                improved = True
                break
            step_size /= 2
        history.append({'iteration': step, 'a': round(a, 9), 'b': round(b, 9),
                        'step': step_size, 'log_likelihood': round(current, 6)})
        if not improved:
            converged = True  # the step no longer improves: at the optimum
            break
        if abs(step_size * delta_a) < tolerance and abs(step_size * delta_b) < tolerance:
            converged = True
            break

    fitted = [_sigmoid(a * z + b) for z in logits]
    rows = reliability_bins(fitted, outcomes_only, bins=10)
    return {
        'method': 'platt',
        'a': round(a, 9),
        'b': round(b, 9),
        'logit_scores': [round(z, 6) for z in logits],
        'fitted': [round(value, 6) for value in fitted],
        'samples': len(pairs),
        'base_rate': sum(outcomes_only) / len(outcomes_only),
        'converged': converged,
        'iterations': len(history),
        'brier': brier_score(fitted, outcomes_only),
        'brier_raw': brier_score(scores_only, outcomes_only),
        'ece': expected_calibration_error(rows, total=len(pairs)),
    }


def _sigmoid(value):
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exp = math.exp(value)
    return exp / (1.0 + exp)


def _log_likelihood(a, b, logits, outcomes):
    total = 0.0
    for z, y in zip(logits, outcomes):
        p = min(max(_sigmoid(a * z + b), 1e-12), 1 - 1e-12)
        total += math.log(p) if y else math.log(1 - p)
    return total


def apply_platt(logit_score, a, b):
    """Apply a fitted Platt map to a probability (not a logit)."""
    if not 0.0 < logit_score < 1.0:
        # 0 and 1 are the saturated cases the map exists to correct; clamp rather
        # than raise, but keep the value strictly inside the open interval.
        logit_score = min(max(float(logit_score), 1e-6), 1 - 1e-6)
    z = math.log(logit_score / (1 - logit_score))
    return _sigmoid(a * z + b)


# ── the artifact ────────────────────────────────────────────────────────────

class CalibrationMap:
    """A fitted map plus the provenance needed to judge it."""

    def __init__(self, payload: dict):
        self.payload = payload

    # -- construction ------------------------------------------------------

    @classmethod
    def fit(cls, scores, outcomes, *, method: str = 'isotonic', bins: int = 10, **extra) -> 'CalibrationMap':
        if method == 'isotonic':
            fitted = fit_isotonic(scores, outcomes, bins=bins)
        elif method == 'platt':
            fitted = fit_platt(scores, outcomes)
        else:
            raise CalibrationError(f'unknown method {method!r} (expected isotonic or platt)')
        payload = {
            'format': FORMAT,
            'method': method,
            'samples': fitted['samples'],
            'unique_scores': fitted.get('unique_scores'),
            'base_rate': round(fitted['base_rate'], 6),
            'brier': round(fitted['brier'], 6) if fitted['brier'] is not None else None,
            'brier_raw': round(fitted['brier_raw'], 6) if fitted['brier_raw'] is not None else None,
            'ece': round(fitted['ece'], 6) if fitted['ece'] is not None else None,
            'ece_raw': round(fitted.get('ece_raw'), 6) if fitted.get('ece_raw') is not None else None,
            'monotone': fitted.get('monotone'),
            'converged': fitted.get('converged'),
        }
        if method == 'isotonic':
            payload['pairs'] = fitted['pairs']
        else:
            payload['a'] = fitted['a']
            payload['b'] = fitted['b']
        payload.update(extra)
        return cls(payload)

    @classmethod
    def load(cls, path) -> 'CalibrationMap':
        payload = json.loads(Path(path).read_text(encoding='utf-8'))
        if payload.get('format') != FORMAT:
            raise CalibrationError(
                f"{path}: format is {payload.get('format')!r}, expected {FORMAT!r}"
            )
        return cls(payload)

    def save(self, path) -> str:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(self.payload, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        return str(target)

    # -- use ---------------------------------------------------------------

    @property
    def fitted(self) -> bool:
        return bool(self.payload.get('samples')) and bool(
            self.payload.get('pairs') or self.payload.get('method') == 'platt'
        )

    def apply(self, score):
        """Map a raw score to a calibrated probability.

        Refuses to run on an unfitted map: returning the input unchanged would
        put an uncalibrated number behind a `calibrated_probability` label, which
        is worse than having no calibration at all.
        """
        if not self.fitted:
            raise CalibrationError('this calibration map was never fitted')
        if score is None:
            return None
        value = float(score)
        if not 0.0 <= value <= 1.0:
            raise CalibrationError(f'score {value} outside [0, 1]')
        if self.payload['method'] == 'platt':
            return round(apply_platt(value, self.payload['a'], self.payload['b']), 6)

        pairs = self.payload['pairs']
        # Step function with linear interpolation between the fitted knots: the
        # empirical CDF it approximates is a step, but a consumer comparing two
        # districts should not see the same number for 0.94 and 0.98.
        if value <= pairs[0][0]:
            return round(pairs[0][1], 6)
        if value >= pairs[-1][0]:
            return round(pairs[-1][1], 6)
        for index in range(1, len(pairs)):
            left_score, left_value = pairs[index - 1]
            right_score, right_value = pairs[index]
            if value <= right_score:
                if right_score == left_score:
                    return round(right_value, 6)
                span = (value - left_score) / (right_score - left_score)
                return round(left_value + span * (right_value - left_value), 6)
        return round(pairs[-1][1], 6)

    def validate(self, *, min_samples: int = MIN_FIT_SAMPLES) -> list:
        """Problems that disqualify this map from being stamped on a published row."""
        problems = []
        if self.payload.get('format') != FORMAT:
            problems.append(f"format is {self.payload.get('format')!r}")
        if not self.fitted:
            problems.append('no fitted parameters')
            return problems
        samples = self.payload.get('samples') or 0
        if samples < min_samples:
            problems.append(
                f'fitted on {samples} samples; at least {min_samples} are required '
                '(a map fitted on a handful of rows reproduces the sample, not the phenomenon)'
            )
        if not self.payload.get('fit_period') or not self.payload.get('fitted_on'):
            problems.append(
                'fit provenance missing: `fit_period` and `fitted_on` are required so a '
                'reader can tell when the map was fitted and to what window'
            )
        brier, brier_raw = self.payload.get('brier'), self.payload.get('brier_raw')
        if brier is not None and brier_raw is not None and brier > brier_raw + 1e-12:
            problems.append(
                f'calibration makes the Brier score worse ({brier} vs {brier_raw} raw) — '
                'do not ship a map that degrades the forecast'
            )
        if self.payload.get('converged') is False:
            problems.append('the Platt fit did not converge')
        if self.payload.get('monotone') is False:
            problems.append('the isotonic map is not monotone')
        return problems

    def reliability(self, scores, outcomes, *, bins: int = 10) -> dict:
        """Apply the map and report the reliability of the result."""
        applied = [self.apply(score) for score in scores]
        rows = reliability_bins(applied, outcomes, bins=bins)
        return {
            'bins': rows,
            'ece': expected_calibration_error(rows, total=len(applied)),
            'brier': brier_score(applied, outcomes),
            'brier_raw': brier_score([float(score) for score in scores], outcomes),
            'samples': len(applied),
        }


def decompose_reliability(scores, fitted, outcomes) -> dict:
    """Split observed Brier into reliability / resolution / uncertainty.

    `Brier = reliability − resolution + uncertainty` (Murphy's decomposition).
    Reported because it answers the question a single Brier score cannot: a model
    can be *well calibrated but useless* (reliability low, resolution ≈ 0), which
    is exactly what a saturated softmax looks like once it has been corrected.

    **The `fitted` argument must be out-of-sample.** Passing the same values the
    map was fitted on produces a reliability of ~0 by construction and is
    circular; `validate_decomposition` flags that case rather than reporting a
    perfect score.
    """
    if not scores or len(scores) != len(fitted) or len(scores) != len(outcomes):
        raise CalibrationError('scores, fitted and outcomes must be equal-length non-empty lists')
    base_rate = sum(1 for outcome in outcomes if outcome) / len(outcomes)
    reliability = resolution = 0.0
    for score, mapped, outcome in zip(scores, fitted, outcomes):
        y = 1.0 if outcome else 0.0
        reliability += (float(mapped) - y) ** 2
        resolution += (y - base_rate) ** 2
    n = len(scores)
    return {
        'samples': n,
        'base_rate': round(base_rate, 6),
        'reliability': round(reliability / n, 6),
        'resolution': round(resolution / n, 6),
        'uncertainty': round(base_rate * (1 - base_rate), 6),
    }


def validate_decomposition(decomposition: dict, *, raw_brier: float) -> dict:
    """Check that a decomposition is consistent with the Brier score it explains."""
    expected = (
        decomposition['reliability'] - decomposition['resolution'] + decomposition['uncertainty']
    )
    delta = abs(expected - raw_brier)
    return {
        'consistent': delta <= 1e-6,
        'expected_brier': round(expected, 6),
        'reported_brier': round(raw_brier, 6),
        'delta': round(delta, 9),
        'note': (
            'reliability ≈ 0 with resolution ≈ 0 means the map reproduces the sample it was '
            'fitted on (in-sample); evaluate on a held-out window instead'
            if decomposition['reliability'] <= 1e-6
            else 'decomposition reconciles with the Brier score'
        ),
    }
