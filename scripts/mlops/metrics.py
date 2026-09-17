#!/usr/bin/env python3
"""Verification, reliability and drift metrics — the arithmetic behind Phase 3.

THREE RULES THAT SHAPE EVERY FUNCTION HERE
------------------------------------------
1. **Undefined is `None`, never `0`.** POD with no observed events is not 0 %
   (that would read as "we detected nothing"); it is undefined, because there was
   nothing to detect. Every score below returns `None` with the counts that made
   it undefined, and the callers print those counts. A metric that silently
   reports 0 for a missing denominator is how a verification report ends up
   claiming a system is failing (or succeeding) when it was never tested.

2. **Counts are primary, scores are derived.** Each helper takes a contingency
   table and every score is computed from the four cells. Nothing recomputes a
   rate from another rate, so the report can always show the evidence next to the
   number.

3. **No floating-point comparisons for thresholds.** Drift levels use `>=` on
   documented cut-offs; calibration bins use closed intervals on the left except
   the last, so a score of exactly 1.0 lands in the last bin rather than nowhere.

Definitions used here (standard meteorological verification, WMO-style):

  hit          an event occurred and was forecast
  miss         an event occurred and was not forecast
  false alarm  no event occurred but one was forecast
  correct negative  no event occurred and none was forecast

  POD = hits / (hits + misses)            "probability of detection"
  FAR = false alarms / (hits + false alarms)   "false alarm ratio"
  CSI = hits / (hits + misses + false alarms)  "critical success index"

FAR's denominator is *alarms*, not events — the single most common place a
verification table is silently wrong (a hit rate and a false-alarm ratio must not
be mistaken for each other). `frequency_bias` is provided separately, because
FAR alone cannot tell "we miss everything" from "we fire at everything".
"""

from __future__ import annotations

import math

#: Drift interpretation (the conventional PSI reading; see `psi_level`).
PSI_STABLE_BELOW = 0.10
PSI_MODERATE_BELOW = 0.25

#: A reference needs at least this many distinct values, and this many populated
#: equal-mass bins, before a PSI against it means anything (see `psi`).
MIN_DISTINCT_REFERENCE = 3
MIN_NON_EMPTY_BINS = 3

#: Observations required per bin before a PSI is reported. The default 10-bin index
#: therefore needs 200 values per side. This floor is not decoration: two 60-row
#: draws from the *same* weather distribution measured PSI ≈ 0.48 (a "significant
#: drift" headline) purely from sampling noise, because each bin held ~6 values.
MIN_SAMPLES_PER_BIN = 20


def _rate(numerator, denominator):
    """A rate, or `None` when the denominator is empty.

    `None` (not 0.0) is the whole point: "we could not measure this" and "we
    measured zero" are different statements, and only one of them is true when there
    were no events to detect.
    """
    if denominator is None or denominator <= 0:
        return None
    return numerator / denominator


def contingency(hits: int, misses: int, false_alarms: int, correct_negatives: int = 0) -> dict:
    """The four-cell table plus the derived rates. Counts are checked, not trusted."""
    for name, value in (('hits', hits), ('misses', misses), ('false_alarms', false_alarms),
                        ('correct_negatives', correct_negatives)):
        if not isinstance(value, int) or value < 0:
            raise ValueError(f'{name} must be a non-negative integer (got {value!r})')
    total = hits + misses + false_alarms + correct_negatives
    observed = hits + misses
    forecast = hits + false_alarms
    return {
        'hits': hits,
        'misses': misses,
        'false_alarms': false_alarms,
        'correct_negatives': correct_negatives,
        'observed_events': observed,
        'forecast_events': forecast,
        'samples': total,
        'pod': _rate(hits, observed),
        'far': _rate(false_alarms, forecast),
        'csi': _rate(hits, hits + misses + false_alarms),
        'precision': _rate(hits, forecast),
        'recall': _rate(hits, observed),
        'accuracy': _rate(hits + correct_negatives, total),
        'frequency_bias': _rate(forecast, observed),
        'f1': _f1(_rate(hits, forecast), _rate(hits, observed)),
    }


def _f1(precision, recall):
    if precision is None or recall is None:
        return None
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def score_from_pairs(pairs) -> dict:
    """Contingency table from `(forecast: bool, observed: bool)` pairs.

    The one place the four cells are counted, so the categorical join in
    `evaluate.py` and the unit tests cannot disagree about what a hit is.
    """
    hits = misses = false_alarms = correct_negatives = 0
    for forecast, observed in pairs:
        if forecast and observed:
            hits += 1
        elif observed:
            misses += 1
        elif forecast:
            false_alarms += 1
        else:
            correct_negatives += 1
    return contingency(hits, misses, false_alarms, correct_negatives)


def confusion_matrix(pairs, *, labels) -> dict:
    """`{actual: {predicted: count}}` for `(predicted, actual)` label pairs.

    Rows are truth, columns are predictions, and every label appears in both axes
    even when it never occurs — a missing row reads as "not scored" instead of
    "zero errors".
    """
    labels = list(labels)
    matrix = {actual: {predicted: 0 for predicted in labels} for actual in labels}
    unknown = {}
    for predicted, actual in pairs:
        if actual not in matrix or predicted not in matrix[actual]:
            key = (predicted, actual)
            unknown[key] = unknown.get(key, 0) + 1
            continue
        matrix[actual][predicted] += 1
    return {'labels': labels, 'matrix': matrix, 'unlabelled': unknown,
            'total': sum(sum(row.values()) for row in matrix.values())}


# ── reliability: does `confidence` mean anything? ───────────────────────────

def reliability_bins(scores, outcomes, *, bins: int = 10, min_bin_count: int = 1) -> list:
    """Per-bin `{lo, hi, count, mean_score, observed_frequency, gap}`.

    `gap = mean_score - observed_frequency` is the calibration error in that bin:
    positive means the model is overconfident there. Bins are equal-width on
    `[0, 1]`, and a score of exactly 1.0 falls in the last bin (a half-open
    interval everywhere else).
    """
    if bins < 2:
        raise ValueError('bins must be >= 2')
    if len(scores) != len(outcomes):
        raise ValueError(f'{len(scores)} scores but {len(outcomes)} outcomes')
    edges = [index / bins for index in range(bins + 1)]
    buckets = [{'lo': edges[i], 'hi': edges[i + 1], 'scores': [], 'outcomes': []} for i in range(bins)]
    for score, outcome in zip(scores, outcomes):
        value = float(score)
        if not 0.0 <= value <= 1.0:
            raise ValueError(f'score {value} outside [0, 1]')
        index = min(int(value * bins), bins - 1)
        buckets[index]['scores'].append(value)
        buckets[index]['outcomes'].append(1 if outcome else 0)
    rows = []
    for bucket in buckets:
        count = len(bucket['scores'])
        if count < min_bin_count:
            continue
        mean_score = sum(bucket['scores']) / count
        observed = sum(bucket['outcomes']) / count
        rows.append({
            'lo': round(bucket['lo'], 6),
            'hi': round(bucket['hi'], 6),
            'count': count,
            'mean_score': round(mean_score, 6),
            'observed_frequency': round(observed, 6),
            'gap': round(mean_score - observed, 6),
        })
    return rows


def expected_calibration_error(rows, *, total: int = None) -> float:
    """Weighted mean absolute per-bin gap (ECE). `None` when there are no bins."""
    if not rows:
        return None
    weight_total = total if total else sum(row['count'] for row in rows)
    if not weight_total:
        return None
    return sum(row['count'] * abs(row['gap']) for row in rows) / weight_total


def maximum_calibration_error(rows) -> float:
    """The worst per-bin gap (MCE) — what a user of the most-confident bin feels."""
    if not rows:
        return None
    return max(abs(row['gap']) for row in rows)


def brier_score(scores, outcomes) -> float:
    """Mean squared error of the probabilities. `None` for an empty sample."""
    if not scores:
        return None
    total = 0.0
    for score, outcome in zip(scores, outcomes):
        total += (float(score) - (1.0 if outcome else 0.0)) ** 2
    return total / len(scores)


def brier_skill_score(scores, outcomes) -> float:
    """Brier score relative to the base rate (`1 - Brier/Brier_climatology`).

    0 is "no better than always quoting the base rate", 1 is perfect, negative is
    worse than the base rate. `None` when the base rate is degenerate (no events
    or all events), because the reference score would be 0.
    """
    brier = brier_score(scores, outcomes)
    if brier is None or not outcomes:
        return None
    base_rate = sum(1 for outcome in outcomes if outcome) / len(outcomes)
    if base_rate in (0.0, 1.0):
        return None
    reference = base_rate * (1 - base_rate)
    return 1 - brier / reference


def log_loss(scores, outcomes, *, epsilon: float = 1e-15) -> float:
    """Mean negative log-likelihood (Brier's sharper, less forgiving sibling)."""
    if not scores:
        return None
    total = 0.0
    for score, outcome in zip(scores, outcomes):
        p = min(max(float(score), epsilon), 1 - epsilon)
        total += -(math.log(p) if outcome else math.log(1 - p))
    return total / len(scores)


# ── drift: is the input distribution the one the model was fitted on? ───────

def psi(reference, current, *, bins: int = 10, min_samples: int = None) -> dict:
    """Population Stability Index between a reference and a current sample.

    Bin edges come from the **reference** quantiles (equal-mass bins), because the
    question PSI answers is "has the current sample moved away from what the model
    was fitted on", not "is the current sample internally balanced". Bucketing the
    current sample by its own quantiles would always look stable.

    `level` follows the conventional reading: `< 0.10` stable, `< 0.25` moderate,
    `>= 0.25` significant. When either sample is too small to bin meaningfully the
    function returns `value: None`, `level: 'insufficient_sample'` and the counts —
    a PSI computed from 12 rows is noise that reads as a finding.
    """
    reference = [float(value) for value in reference if value is not None]
    current = [float(value) for value in current if value is not None]
    if min_samples is None:
        min_samples = MIN_SAMPLES_PER_BIN * bins
    result = {
        'reference_count': len(reference),
        'current_count': len(current),
        'value': None,
        'level': 'insufficient_sample',
        'bins': [],
        'min_samples': min_samples,
    }

    if not reference or not current:
        result['reason'] = (
            f'need values on both sides (reference {len(reference)}, current {len(current)})'
        )
        return result

    distinct_reference = len(set(reference))
    spread = max(reference) - min(reference)
    result['summary'] = {
        'reference': _describe(reference),
        'current': _describe(current),
        'distinct_reference': distinct_reference,
        'distinct_current': len(set(current)),
    }

    def _degenerate(reason, **extra):
        """A reference that cannot be binned is a finding, not a drift index.

        Two cases produce a numerically enormous but meaningless PSI: a point mass
        (all values equal, where the quantile edges collapse) and a near-point mass
        (`0.9999`/`1.0` over every row — the saturated severity in MODEL_CARD §6.1).
        In both, the index is dominated by the 1e-6 share floor rather than by any
        movement of mass, so it is reported as `degenerate_reference` with the
        spread, the distinct count and the counts that made it so.
        """
        result['level'] = 'degenerate_reference'
        result['reference_spread'] = spread
        result['moved_off_reference_values'] = sum(
            1 for value in current if value not in set(reference)
        )
        result['reason'] = reason
        result.update(extra)
        return result

    if spread <= 1e-9:
        return _degenerate(
            f'the reference is a point mass: all {len(reference)} values are {reference[0]:g}'
        )
    if distinct_reference < MIN_DISTINCT_REFERENCE:
        values = sorted(set(reference))
        return _degenerate(
            f'the reference has only {distinct_reference} distinct values '
            f'({values[0]:g}…{values[-1]:g}); PSI needs at least '
            f'{MIN_DISTINCT_REFERENCE} to bin against — a saturated reference is itself the finding'
        )

    # Size is checked *after* degeneracy: a point mass is a point mass however many
    # rows it has, and that is the more specific finding (the shipped severity column
    # is 127 rows of 0.9999/1.0 — calling that "insufficient sample" would bury it).
    if len(reference) < min_samples or len(current) < min_samples:
        result['reason'] = (
            f'need at least {min_samples} values on each side for a {bins}-bin index '
            f'({min_samples // bins} per bin); reference has {len(reference)}, '
            f'current has {len(current)} — a PSI from this many rows is sampling noise, '
            f'not drift'
        )
        return result

    edges = _quantile_edges(sorted(reference), bins)
    reference_share = _bucket_shares(reference, edges)
    non_empty = sum(1 for share in reference_share if share > 0)
    if non_empty < MIN_NON_EMPTY_BINS:
        return _degenerate(
            f'only {non_empty} of {bins} reference bins are populated — the equal-mass binning '
            'collapsed, so the index would measure the share floor rather than the data',
            populated_reference_bins=non_empty,
        )

    current_share = _bucket_shares(current, edges)
    # A bucket that is empty on either side would make the log term infinite; the
    # conventional fix is to floor the shares, which caps that bucket's
    # contribution instead of letting one empty bin dominate the index.
    floor = 1e-6
    contributions = []
    total = 0.0
    for index, (expected, actual) in enumerate(zip(reference_share, current_share)):
        expected_f = max(expected, floor)
        actual_f = max(actual, floor)
        delta = (actual_f - expected_f) * math.log(actual_f / expected_f)
        total += delta
        contributions.append({
            'index': index,
            'lo': round(edges[index], 6),
            'hi': round(edges[index + 1], 6),
            'reference_share': round(expected, 6),
            'current_share': round(actual, 6),
            'contribution': round(delta, 6),
        })
    result['value'] = round(total, 6)
    result['level'] = psi_level(total)
    result['bins'] = contributions
    result['worst_bins'] = sorted(contributions, key=lambda row: row['contribution'], reverse=True)[:3]
    return result


def _describe(values):
    ordered = sorted(values)
    count = len(ordered)
    return {
        'count': count,
        'min': round(ordered[0], 6),
        'p50': round(ordered[count // 2], 6),
        'mean': round(sum(ordered) / count, 6),
        'max': round(ordered[-1], 6),
        'distinct': len(set(ordered)),
    }


def psi_level(value) -> str:
    """The conventional PSI reading. `None` is not stable — it is unknown."""
    if value is None:
        return 'insufficient_sample'
    if value < PSI_STABLE_BELOW:
        return 'stable'
    if value < PSI_MODERATE_BELOW:
        return 'moderate'
    return 'significant'


def _quantile_edges(sorted_values, bins):
    """`bins + 1` edges at equal-mass quantiles of an already-sorted list."""
    edges = []
    n = len(sorted_values)
    for index in range(bins + 1):
        if index == 0:
            edges.append(sorted_values[0])
            continue
        if index == bins:
            edges.append(sorted_values[-1])
            continue
        position = (n - 1) * index / bins
        lower = int(math.floor(position))
        upper = min(lower + 1, n - 1)
        weight = position - lower
        edges.append(sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight)
    # Degenerate distributions (e.g. a constant channel) collapse to repeated
    # edges; widen by a hair so the bucket assignment still terminates.
    for index in range(1, len(edges)):
        if edges[index] <= edges[index - 1]:
            edges[index] = edges[index - 1] + 1e-9
    return edges


def _bucket_shares(values, edges):
    counts = [0] * (len(edges) - 1)
    for value in values:
        index = len(counts) - 1
        for candidate in range(len(counts)):
            if value < edges[candidate + 1]:
                index = candidate
                break
        counts[index] += 1
    total = sum(counts) or 1
    return [count / total for count in counts]


def summarize_drift(series: dict, *, bins: int = 10, min_samples: int = 30) -> dict:
    """PSI for several named series at once, with the worst offenders first."""
    per_series = {}
    for name, (reference, current) in series.items():
        per_series[name] = psi(reference, current, bins=bins, min_samples=min_samples)
    ranked = sorted(
        ((name, row['value']) for name, row in per_series.items() if row['value'] is not None),
        key=lambda pair: pair[1], reverse=True,
    )
    return {
        'series': per_series,
        'ranked': [{'series': name, 'psi': value, 'level': psi_level(value)} for name, value in ranked],
        'significant': [name for name, value in ranked if psi_level(value) == 'significant'],
        'moderate': [name for name, value in ranked if psi_level(value) == 'moderate'],
        'unavailable': [name for name, row in per_series.items() if row['value'] is None],
    }
