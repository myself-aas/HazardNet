"""Verification, reliability and drift arithmetic (Phase 3 MLOps).

The rules this file guards, in order of how badly they bite when broken:

1. **A metric with no denominator is `None`, not 0.** "POD 0 %" and "FAR 0 %" are
   opposite-sounding claims that both mean "we could not measure this"; only the
   counts tell them apart.
2. **PSI against a point mass is not a drift measurement.** The shipped severity
   column is 0.9999/1.0 across every row (MODEL_CARD §6.1), and a naive PSI against
   it produced a headline index of 18.5 out of a share floor rather than out of any
   movement of mass.
3. **FAR's denominator is alarms, not events** — the classic way a verification
   table is silently wrong.
"""

import pathlib
import random
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

from mlops.metrics import (  # noqa: E402
    brier_score,
    brier_skill_score,
    confusion_matrix,
    contingency,
    expected_calibration_error,
    log_loss,
    maximum_calibration_error,
    psi,
    psi_level,
    reliability_bins,
    score_from_pairs,
)


# ── contingency + rates ─────────────────────────────────────────────────────

def test_rates_use_the_documented_denominators():
    table = contingency(hits=8, misses=2, false_alarms=4, correct_negatives=6)
    assert table['pod'] == pytest.approx(0.8)          # 8/(8+2)
    assert table['far'] == pytest.approx(4 / 12)       # 4/(8+4) — alarms, not events
    assert table['csi'] == pytest.approx(8 / 14)       # 8/(8+2+4)
    assert table['frequency_bias'] == pytest.approx(1.2)  # 12/10
    assert table['accuracy'] == pytest.approx(14 / 20)


def test_pod_is_none_when_nothing_was_observed():
    table = contingency(hits=0, misses=0, false_alarms=3, correct_negatives=10)
    assert table['pod'] is None       # not 0.0: there was nothing to detect
    assert table['far'] == 1.0        # every alarm was false
    assert table['observed_events'] == 0


def test_far_is_none_when_no_alarm_was_issued():
    table = contingency(hits=0, misses=5, false_alarms=0, correct_negatives=5)
    assert table['far'] is None
    assert table['pod'] == 0.0        # events happened and none was forecast


def test_csi_is_none_when_there_is_neither_event_nor_alarm():
    assert contingency(0, 0, 0, 12)['csi'] is None


def test_negative_counts_are_rejected():
    with pytest.raises(ValueError):
        contingency(hits=-1, misses=0, false_alarms=0)


def test_score_from_pairs_counts_the_four_cells():
    pairs = [(True, True), (False, True), (True, False), (False, False), (True, True)]
    table = score_from_pairs(pairs)
    assert (table['hits'], table['misses'], table['false_alarms'], table['correct_negatives']) == (2, 1, 1, 1)


def test_f1_is_none_when_precision_or_recall_is_undefined():
    assert contingency(0, 0, 3, 1)['f1'] is None


# ── reliability ─────────────────────────────────────────────────────────────

def test_a_score_of_one_lands_in_the_last_bin():
    rows = reliability_bins([1.0, 0.0], [True, False], bins=10)
    assert rows[0]['lo'] == 0.0 and rows[-1]['hi'] == 1.0
    assert rows[-1]['count'] == 1


def test_bins_report_the_gap_between_score_and_frequency():
    rows = reliability_bins([0.9, 0.9, 0.9, 0.9], [True, True, False, False], bins=10)
    assert rows[0]['mean_score'] == pytest.approx(0.9)
    assert rows[0]['observed_frequency'] == pytest.approx(0.5)
    assert rows[0]['gap'] == pytest.approx(0.4)     # overconfident by 0.4


def test_ece_and_mce_weight_and_take_the_worst():
    rows = reliability_bins([0.9, 0.9, 0.9, 0.9, 0.55], [True, True, False, False, False], bins=10)
    ece = expected_calibration_error(rows, total=5)
    mce = maximum_calibration_error(rows)
    assert ece == pytest.approx((4 * 0.4 + 1 * 0.55) / 5)
    assert mce == pytest.approx(0.55)


def test_reliability_metrics_are_none_for_an_empty_sample():
    assert expected_calibration_error([]) is None
    assert maximum_calibration_error([]) is None
    assert brier_score([], []) is None
    assert log_loss([], []) is None


def test_out_of_range_scores_are_rejected():
    with pytest.raises(ValueError):
        reliability_bins([1.2], [True])


def test_brier_and_skill_against_the_base_rate():
    # A model that always says 0.5 when the base rate is 0.5 has zero skill, not
    # negative skill, and the reference score is 0.25.
    assert brier_score([0.5, 0.5], [True, False]) == pytest.approx(0.25)
    assert brier_skill_score([0.5, 0.5], [True, False]) == pytest.approx(0.0)
    # A deft model beats the reference; a clumsy one is worse than the base rate.
    assert brier_skill_score([0.99, 0.01], [True, False]) > 0
    assert brier_skill_score([0.01, 0.99], [True, False]) < 0


def test_skill_is_none_for_a_degenerate_base_rate():
    assert brier_skill_score([0.9, 0.8], [True, True]) is None


def test_log_loss_punishes_confident_mistakes_harder_than_brier():
    confident_mistake = log_loss([0.99], [False])
    mild_mistake = log_loss([0.6], [False])
    assert confident_mistake > mild_mistake


def test_confusion_matrix_keeps_every_label_on_both_axes():
    labels = ('Flood', 'Flash Flood')
    result = confusion_matrix([('Flood', 'Flash Flood'), ('Flood', 'Flood')], labels=labels)
    assert result['matrix']['Flash Flood']['Flood'] == 1
    assert result['matrix']['Flood']['Flood'] == 1
    assert result['matrix']['Flash Flood']['Flash Flood'] == 0   # present, not missing
    assert result['total'] == 2


def test_confusion_matrix_records_labels_it_was_not_given():
    result = confusion_matrix([('Flood', 'landslide')], labels=('Flood',))
    assert result['unlabelled'][('Flood', 'landslide')] == 1
    assert result['total'] == 0


# ── drift ───────────────────────────────────────────────────────────────────

def _sample(rng, mean, spread=1.0, size=300):
    return [rng.gauss(mean, spread) for _ in range(size)]


def test_psi_is_near_zero_for_the_same_distribution():
    rng = random.Random(7)
    result = psi(_sample(rng, 0.0), _sample(rng, 0.0))
    assert result['level'] == 'stable'
    assert result['value'] < 0.1


def test_psi_grows_with_a_shifted_distribution():
    rng = random.Random(7)
    result = psi(_sample(rng, 0.0), _sample(rng, 0.9))
    assert result['level'] == 'significant'
    assert result['value'] > 0.25
    assert result['worst_bins']                       # the report says where it moved


def test_psi_is_undefined_for_a_small_sample():
    result = psi([1.0, 2.0, 3.0, 4.0, 5.0], [6.0, 7.0, 8.0, 9.0, 10.0])
    assert result['value'] is None
    assert result['level'] == 'insufficient_sample'
    assert 'sampling noise' in result['reason']


def test_psi_needs_twenty_observations_per_bin():
    import random as _random
    rng = _random.Random(7)
    # Two draws from the same distribution: 60 rows each is enough to *look* like a
    # significant drift, which is why the floor exists.
    result = psi([rng.gauss(0, 1) for _ in range(60)], [rng.gauss(0, 1) for _ in range(60)])
    assert result['level'] == 'insufficient_sample'
    assert result['min_samples'] == 200


def test_psi_refuses_a_point_mass_reference():
    result = psi([1.0] * 127, [0.9] * 40)
    assert result['value'] is None
    assert result['level'] == 'degenerate_reference'
    assert result['reference_spread'] == 0
    assert result['moved_off_reference_values'] == 40


def test_psi_refuses_a_near_point_mass_reference():
    # The shipped severity column: two distinct values across every row.
    reference = [1.0] * 100 + [0.9999] * 27
    result = psi(reference, [0.85] * 40)
    assert result['value'] is None
    assert result['level'] == 'degenerate_reference'
    assert 'distinct values' in result['reason']


def test_psi_reports_the_distribution_summaries():
    rng = random.Random(11)
    result = psi(_sample(rng, 5.0, 0.5), _sample(rng, 6.0, 0.5))
    assert result['summary']['reference']['p50'] == pytest.approx(5.0, abs=0.2)
    assert result['summary']['current']['p50'] == pytest.approx(6.0, abs=0.2)
    assert result['summary']['distinct_reference'] > 100


def test_psi_level_boundaries_are_the_documented_ones():
    assert psi_level(0.09) == 'stable'
    assert psi_level(0.10) == 'moderate'
    assert psi_level(0.249) == 'moderate'
    assert psi_level(0.25) == 'significant'
    assert psi_level(None) == 'insufficient_sample'


def test_psi_floors_thin_buckets_instead_of_dividing_by_zero():
    # A reference with real spread but almost no mass in its top bin, and a current
    # sample that is entirely in it: the share is floored, so the index is large but
    # finite (a missing log term would be an exception or an infinity instead).
    reference = [index / 270 for index in range(270)] + [1.0]
    current = [1.0] * 300
    result = psi(reference, current)
    assert result['value'] is not None
    assert result['level'] == 'significant'
    assert result['value'] < 100
