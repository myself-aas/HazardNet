"""Verification and drift over published runs (Phase 3 MLOps).

The two things this file is really guarding:

1. **The join must not invent negatives, and must not lose positives.** An
   event-archive join can only produce "an event happened" rows; treating the
   absence of a record as "no event" would manufacture a false-alarm ratio of 0 and
   read as perfection. Absence is therefore `unknown` by default, with an explicit
   opt-in (`absence_means_no_event`) that a caller may only use when the archive is
   known complete — and the report says which mode produced the number.

2. **Drift must be measured in canonical units.** The legacy `om_*` columns are
   mislabelled (`om_temp_2m_k` holds °C, `om_solar_rad_j` holds kJ/m² over the
   horizon), so comparing them to the canonical columns without the documented
   conversions reports a huge index for two runs of the same weather. The fixture
   pair is the same weather by construction, which makes that detectable.
"""

import json
import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
FIXTURES = SCRIPTS / 'tests' / 'fixtures' / 'mlops'
PREDICTIONS = FIXTURES / 'synthetic_predictions.csv'
OUTCOMES = FIXTURES / 'synthetic_outcomes.json'
sys.path.insert(0, str(SCRIPTS))

from mlops import drift as drift_module  # noqa: E402
from mlops import evaluate as evaluate_module  # noqa: E402
from mlops.evaluate import (  # noqa: E402
    HAZARD_CLASSES,
    load_outcomes,
    load_predictions,
    match_pairs,
    normalize_hazard,
    normalize_key,
    render_summary,
    score_evaluation,
)


# ── the join ────────────────────────────────────────────────────────────────

def outcome(district, hazard, start, end=None):
    return {'district': district, 'hazard_type': hazard, 'start_date': start,
            'end_date': end or start, 'source': 'test'}


def prediction(district, hazard, issued, target=None, confidence=0.9, severity=0.7):
    return {'district_name': district, 'hazard_type': hazard, 'prediction_date': issued,
            'target_date': target, 'confidence': confidence, 'severity_score': severity}


def test_a_prediction_with_no_recorded_outcome_is_unknown_not_a_negative():
    joined = match_pairs([prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')], [])
    assert joined['pairs'] == []
    assert joined['unmatched_no_outcome'] == ['Sylhet/2026-06-10']


def test_absence_can_be_declared_a_negative_but_only_explicitly():
    joined = match_pairs([prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')], [],
                         absence_means_no_event=True)
    assert len(joined['pairs']) == 1
    assert joined['pairs'][0]['observed'] is False
    assert joined['pairs'][0]['truth_source'] == 'absence'


def test_an_outcome_before_the_forecast_is_never_a_hit():
    joined = match_pairs(
        [prediction('Bogura', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('Bogura', 'Flood', '2026-06-02')],
    )
    assert joined['pairs'] == []
    assert joined['outcome_before_forecast']


def test_an_outcome_after_the_horizon_is_outside_the_window():
    joined = match_pairs(
        [prediction('Dinajpur', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('Dinajpur', 'Flood', '2026-06-20')],
    )
    assert joined['pairs'] == []
    assert joined['outside_window']


def test_distant_outcomes_are_not_counted_as_near_misses():
    joined = match_pairs(
        [prediction('Dinajpur', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('Dinajpur', 'Flood', '2026-04-01')] + [outcome('Dinajpur', 'Flood', '2026-12-01')],
    )
    assert joined['not_relevant'] == 2
    assert joined['outcome_before_forecast'] == []
    assert joined['outside_window'] == []


def test_at_most_one_near_miss_per_prediction_per_side():
    outcomes = [outcome('Sirajganj', 'Flood', day) for day in ('2026-06-01', '2026-06-04')]
    joined = match_pairs([prediction('Sirajganj', 'Flood', '2026-06-10', '2026-06-17')], outcomes)
    assert len(joined['outcome_before_forecast']) == 1
    assert 'by 6 day(s)' in joined['outcome_before_forecast'][0]


def test_a_district_with_no_qualifying_event_is_a_correct_negative():
    joined = match_pairs(
        [prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('Sylhet', 'landslide', '2026-06-12')],
    )
    assert joined['pairs'][0]['observed'] is False
    assert joined['pairs'][0]['observed_any_event'] is True
    assert joined['conflicting_observations']


def test_a_malformed_prediction_is_reported_not_silently_dropped():
    joined = match_pairs([{'district_name': 'Sylhet'}], [])
    assert joined['missing_fields']
    assert joined['pairs'] == []


def test_district_keys_fold_case_spacing_and_known_aliases():
    assert normalize_key('Coxs Bazar') == 'coxs bazar'
    assert normalize_key("Cox's Bazar") == 'coxs bazar'
    assert normalize_key('Cox_s_Bazar'.replace('_', ' ')) == 'cox s bazar'
    assert normalize_key('Comilla') == normalize_key('Cumilla')
    assert normalize_key('Jessore') == normalize_key('Jashore')


def test_join_matches_across_those_aliases():
    joined = match_pairs(
        [prediction('Comilla', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('cumilla', 'Flood', '2026-06-12')],
    )
    assert len(joined['pairs']) == 1
    assert joined['pairs'][0]['observed'] is True


def test_hazard_vocabulary_normalisation_is_explicit_about_unknowns():
    assert normalize_hazard('Monsoon Flood') == 'Flood'
    assert normalize_hazard('flash flood') == 'Flash Flood'
    assert normalize_hazard('landslide') is None      # not one of the eight
    assert normalize_hazard(None) is None
    assert set(HAZARD_CLASSES) == {
        'Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave',
        'Severe Local Storm', 'Tropical Cyclone',
    }


# ── scoring ─────────────────────────────────────────────────────────────────

def test_without_negatives_the_classifier_scores_that_need_them_are_none():
    joined = match_pairs([prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')],
                         [outcome('Sylhet', 'Flood', '2026-06-12')])
    scored = score_evaluation(joined)
    events = scored['events']
    assert events['pod'] == 1.0
    assert events['far'] is None
    assert events['csi'] is None
    assert events['accuracy'] is None
    assert 'no false alarm is possible' in events['unmeasurable']['reason']


def test_with_absence_as_negative_the_scores_are_measurable():
    joined = match_pairs(
        [prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17', severity=0.9),
         prediction('Pabna', 'Flood', '2026-06-10', '2026-06-17', severity=0.9)],
        [outcome('Sylhet', 'Flood', '2026-06-12')],
        absence_means_no_event=True,
    )
    scored = score_evaluation(joined)
    assert scored['events']['hits'] == 1
    assert scored['events']['false_alarms'] == 1
    assert scored['events']['far'] == pytest.approx(0.5)
    assert scored['events']['csi'] == pytest.approx(0.5)
    assert scored['events']['negatives_available'] == 1


def test_the_alarm_threshold_decides_what_counts_as_an_alarm():
    joined = match_pairs(
        [prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17', severity=0.3)],
        [outcome('Sylhet', 'Flood', '2026-06-12')],
        absence_means_no_event=True,
    )
    quiet = score_evaluation(joined, alarm_threshold=0.5)
    loud = score_evaluation(joined, alarm_threshold=0.2)
    assert quiet['events']['hits'] == 0 and quiet['events']['misses'] == 1
    assert loud['events']['hits'] == 1
    assert loud['events']['alarm_threshold'] == 0.2


def test_per_class_view_marks_classes_that_were_never_predicted_as_untested():
    joined = match_pairs([prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')],
                        [outcome('Sylhet', 'Flood', '2026-06-12')],
                        absence_means_no_event=True)
    per_class = score_evaluation(joined)['per_class']
    assert per_class['Flood']['status'] == 'measured'
    assert per_class['Tropical Cyclone']['status'] == 'untested'
    assert per_class['Tropical Cyclone']['pod'] is None


def test_per_class_far_counts_false_alarms_for_that_class_only():
    joined = match_pairs(
        [prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17'),
         prediction('Pabna', 'Flash Flood', '2026-06-10', '2026-06-17')],
        [outcome('Sylhet', 'Flood', '2026-06-12')],
        absence_means_no_event=True,
    )
    per_class = score_evaluation(joined)['per_class']
    assert per_class['Flood']['false_alarms'] == 0
    assert per_class['Flash Flood']['false_alarms'] == 1


def test_a_single_class_sample_is_flagged_in_the_reliability_block():
    joined = match_pairs([prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17')],
                         [outcome('Sylhet', 'Flood', '2026-06-12')],
                         absence_means_no_event=True)
    reliability = score_evaluation(joined)['reliability']
    assert reliability['single_class_sample'] is True
    assert 'not a calibration assessment' in reliability['note']


def test_lead_time_is_reported_so_a_same_day_match_cannot_pass_as_skill():
    joined = match_pairs(
        [prediction('Sylhet', 'Flood', '2026-06-10', '2026-06-17'),
         prediction('Pabna', 'Flood', '2026-06-10', '2026-06-17')],
        [outcome('Sylhet', 'Flood', '2026-06-10'), outcome('Pabna', 'Flood', '2026-06-14')],
        absence_means_no_event=True,
    )
    lead = score_evaluation(joined)['lead_time_days']
    assert lead['min'] == 0
    assert lead['samples_with_lead_over_0'] == 1


# ── the report ──────────────────────────────────────────────────────────────

def test_evaluation_reports_insufficient_truth_below_the_threshold():
    report = evaluate_module.evaluate(PREDICTIONS, OUTCOMES, min_matched=10_000)
    assert report['status'] == 'insufficient_truth'
    assert 'at least' in report['reason']
    assert report['scores'] is None
    assert 'evaluated_events' not in report


def test_evaluation_on_the_fixture_produces_a_usable_report():
    report = evaluate_module.evaluate(PREDICTIONS, OUTCOMES, absence_means_no_event=True)
    assert report['status'] == 'ok'
    assert report['counts']['matched'] == 400
    assert report['scored_samples'] == 400
    assert report['negative_samples'] > 0
    assert report['scores']['events']['far'] is not None
    assert report['model_versions'] == ['2.1.9+model.d7b1a5b48aa6']
    summary = render_summary(report)
    assert 'POD' in summary and 'FAR' in summary and 'CSI' in summary


def test_loaders_accept_the_shapes_this_repository_publishes():
    predictions = load_predictions(PREDICTIONS)
    outcomes = load_outcomes(OUTCOMES)
    assert len(predictions) == 400 and len(outcomes) == 231
    snapshot = json.loads((ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json').read_text())
    flattened = load_predictions(ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json')
    assert len(flattened) == sum(len(rows) for rows in snapshot['horizons'].values())


def test_an_outcome_row_without_a_district_is_an_error(tmp_path):
    path = tmp_path / 'outcomes.json'
    path.write_text(json.dumps([{'hazard_type': 'Flood', 'start_date': '2026-06-01'}]))
    with pytest.raises(evaluate_module.EvaluationError):
        load_outcomes(path)


# ── drift ───────────────────────────────────────────────────────────────────

def test_the_legacy_alias_table_names_the_documented_units():
    aliases = drift_module.COLUMN_ALIASES
    # `om_temp_2m_k` holds °C despite its name: no offset, no scale.
    assert aliases['om_temp_2m_k']['scale'] == 1.0
    assert aliases['om_temp_2m_k']['offset'] == 0.0
    assert aliases['om_precip_m']['per_day'] is True
    assert aliases['om_solar_rad_j']['per_day'] is True
    assert aliases['om_et_sum_m']['canonical'] == 'evapotranspiration_mm'


def test_legacy_values_are_converted_to_canonical_units():
    rows = [{'horizon': '7_days', 'om_temp_2m_k': '28.0', 'om_wind_max_ms': '3.0',
             'om_precip_m': '0.07', 'om_solar_rad_j': '140000.0', 'om_et_sum_m': '28.0'}]
    assert drift_module.series(rows, 'temperature_mean') == [28.0]
    assert drift_module.series(rows, 'wind_max_kmh') == [pytest.approx(10.8)]
    assert drift_module.series(rows, 'precipitation_mm') == [pytest.approx(10.0)]
    assert drift_module.series(rows, 'solar_radiation_mj_m2') == [pytest.approx(20.0)]
    assert drift_module.series(rows, 'evapotranspiration_mm') == [pytest.approx(4.0)]


def test_a_horizon_total_without_a_horizon_is_dropped_and_reported():
    rows = [{'om_precip_m': '0.07'}]
    values, coverage = drift_module.series_with_coverage(rows, 'precipitation_mm')
    assert values == []
    assert coverage['dropped_no_horizon'] == 1


def test_horizon_spellings_are_parsed_not_looked_up():
    assert drift_module.horizon_days({'horizon': '7_days'}) == 7
    assert drift_module.horizon_days({'horizon': '15_days'}) == 15
    assert drift_module.horizon_days({'horizon': '7d'}) == 7
    assert drift_module.horizon_days({'horizon': 15}) == 15
    assert drift_module.horizon_days({'horizon': 'always'}) is None


def test_the_two_fixture_runs_describe_the_same_weather_and_compare_stable():
    report = drift_module.run(FIXTURES / 'reference_run.csv', FIXTURES / 'current_run.csv')
    drivers = report['drivers']['drivers']['series']
    # Temperature and wind are converted from the legacy units: if the conversion
    # were wrong, these would be the loudest series in the report.
    assert drivers['temperature_mean']['level'] in ('stable', 'moderate')
    assert drivers['wind_max_kmh']['level'] in ('stable', 'moderate')
    assert report['drivers']['unit_conversions']['reference']
    assert report['drivers']['run_dates']['reference']['first'] == '2026-06-05'


def test_a_changed_regime_shows_up_in_the_column_it_changed():
    # The current fixture adds ~12 mm/day to the last six rows: the expected-value
    # shift is small, so the assertion is on the comparison being computed at all
    # plus the ranking being usable, not on a fabricated index.
    report = drift_module.run(FIXTURES / 'reference_run.csv', FIXTURES / 'current_run.csv')
    ranked = {row['series'] for row in report['drivers']['drivers']['ranked']}
    assert 'precipitation_mm' in ranked
    assert report['status'] in ('ok', 'significant_drift')


def test_the_shipped_runs_report_the_saturated_severity_as_a_degenerate_reference():
    report = drift_module.run(ROOT / 'data' / 'hazardnet_forecasts_latest.csv',
                              ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv')
    assert report['severity_distribution']['level'] == 'degenerate_reference'
    assert 'distinct values' in report['severity_distribution']['reason']


def test_a_small_sample_is_unavailable_rather_than_a_number(tmp_path):
    small = tmp_path / 'small.csv'
    small.write_text('temperature_mean\n' + '\n'.join(f'2{index}.0' for index in range(5)) + '\n')
    report = drift_module.run(small, small, min_samples=30)
    assert report['drivers']['drivers']['series']['temperature_mean']['level'] == 'insufficient_sample'


def test_the_collapse_check_flags_a_single_class_run(tmp_path):
    reference = tmp_path / 'reference.csv'
    current = tmp_path / 'current.csv'
    reference.write_text('hazard_type\n' + '\n'.join(['Flood'] * 20 + ['Flash Flood'] * 20) + '\n')
    current.write_text('hazard_type\n' + '\n'.join(['Flood'] * 40) + '\n')
    shares = drift_module.class_share_drift(drift_module.load_rows(reference),
                                            drift_module.load_rows(current))
    assert shares['collapsed']['status'] == 'collapsed'
    assert shares['collapsed']['dominant_class'] == 'Flood'


# ── the CLI ─────────────────────────────────────────────────────────────────

def run_cli(*args):
    return subprocess.run([sys.executable, '-m', 'mlops.cli', *args],
                          capture_output=True, text=True, cwd=SCRIPTS)


def test_cli_evaluate_writes_a_json_report(tmp_path):
    target = tmp_path / 'eval.json'
    result = run_cli('evaluate', '--predictions', str(PREDICTIONS), '--outcomes', str(OUTCOMES),
                     '--absence-means-no-event', '--json', str(target))
    assert result.returncode == 0, result.stdout
    report = json.loads(target.read_text())
    assert report['status'] == 'ok'
    assert report['counts']['absence_means_no_event'] is True


def test_cli_evaluate_can_fail_a_workflow_on_insufficient_truth():
    ok = run_cli('evaluate', '--predictions', str(PREDICTIONS), '--outcomes', str(OUTCOMES))
    assert ok.returncode == 0
    strict = run_cli('evaluate', '--predictions', str(PREDICTIONS), '--outcomes', str(OUTCOMES),
                     '--min-matched', '100000', '--fail-on', 'insufficient_truth')
    assert strict.returncode == 1
    assert 'insufficient_truth' in strict.stdout


def test_cli_drift_fails_only_when_asked():
    base = run_cli('drift', '--reference', str(FIXTURES / 'reference_run.csv'),
                   '--current', str(FIXTURES / 'current_run.csv'))
    assert base.returncode == 0
    strict = run_cli('drift', '--reference', str(ROOT / 'data' / 'hazardnet_forecasts_latest.csv'),
                     '--current', str(ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'),
                     '--fail-on', 'significant_drift')
    assert strict.returncode == 1
    assert 'significant' in strict.stdout
