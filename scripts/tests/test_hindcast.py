#!/usr/bin/env python3
"""The Phase 9 hindcast harness: what it may claim, and what it must refuse to.

WHAT THESE TESTS ARE GUARDING
-----------------------------
`docs/phase-reports/phase-8-seo-content.md` §5 records that the site publishes no skill
number because none has been measured, and `docs/PRODUCT_SPEC.md` §3 lists the claims that
need evidence first. A hindcast harness is the easiest place in the repository to
manufacture that evidence by accident, so these tests are mostly about refusals:

1. **No episode may name a district that does not exist**, or attach a truth set to a source
   that is not cited: either one turns a spelling mistake into a score.
2. **The harness may not claim it ran the CNN.** The physics track is the independent
   cross-check; the report has to say so in as many words.
3. **An unknown district may not be scored as a negative.** The fixtures exercise the
   absence-rule both ways: unnamed districts stay `unknown` (so the false-alarm ratio is
   unmeasurable) and only an explicit `absence_means_no_event` turns them into negatives.
4. **The committed driver series must reproduce the committed report byte for byte** (clock
   excluded). `check` is the gate; this suite runs the same recomputation on a fixture.

Everything here runs offline. The fixture is six scripted stations over the Amphan window,
including one genuine cyclonic day at the coast, so the scoring path is exercised with a
hit, a miss and a class mismatch rather than with empty arrays.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))

from hindcast import cli as hindcast_cli  # noqa: E402
from hindcast import episodes as episode_module  # noqa: E402
from hindcast import fetch as fetch_module  # noqa: E402
from hindcast import score as score_module  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / 'fixtures' / 'hindcast'
FIXTURE_EPISODE = FIXTURES / 'episode_amphan_fixture.json'
FIXTURE_DRIVERS = FIXTURES / 'drivers_amphan_fixture.json'
EPISODES_DIR = ROOT / 'data' / 'hindcast' / 'episodes'
REPORTS_DIR = ROOT / 'data' / 'hindcast' / 'reports'


def fixture_episode() -> dict:
    return episode_module.load_episode(FIXTURE_EPISODE)


def fixture_series() -> dict:
    return fetch_module.load_series(FIXTURE_DRIVERS)


def build(episode=None, series=None, **kwargs) -> dict:
    return hindcast_cli.build_report(
        episode or fixture_episode(),
        series=series or fixture_series(),
        drivers_path=str(FIXTURE_DRIVERS),
        now='2026-09-18T00:00:00Z',
        **kwargs,
    )


# ── the curated half: episodes ───────────────────────────────────────────────

def test_every_committed_episode_names_only_real_districts_and_cited_sources():
    from etl import districts as district_table

    episodes = sorted(EPISODES_DIR.glob('*.json'))
    assert episodes, 'no episodes are committed'
    for path in episodes:
        episode = episode_module.load_episode(path)
        source_ids = {row['id'] for row in episode['sources']}
        for entry in episode['truth']['affected']:
            assert district_table.resolve(entry['district']) == entry['district'], (
                f"{path.name}: {entry['district']!r} is not the canonical district spelling"
            )
            assert entry['source_id'] in source_ids
        assert episode['truth'].get('completeness'), f'{path.name}: truth completeness is unstated'


def test_episode_validation_refuses_a_typo_and_an_uncited_truth_set():
    episode = json.loads(FIXTURE_EPISODE.read_text(encoding='utf-8'))

    broken = json.loads(json.dumps(episode))
    broken['truth']['affected'][0]['district'] = 'Atlantis'
    with pytest.raises(episode_module.EpisodeError, match='not one of the 64 districts'):
        episode_module.validate_episode(broken)

    broken = json.loads(json.dumps(episode))
    broken['truth']['affected'][0]['source_id'] = 'no-such-source'
    with pytest.raises(episode_module.EpisodeError, match='not in `sources`'):
        episode_module.validate_episode(broken)

    broken = json.loads(json.dumps(episode))
    broken['hazard_class'] = 'Tsunami'
    with pytest.raises(episode_module.EpisodeError, match='not one of the eight classes'):
        episode_module.validate_episode(broken)

    broken = json.loads(json.dumps(episode))
    broken['sources'][0].pop('url')
    with pytest.raises(episode_module.EpisodeError, match='needs `url`'):
        episode_module.validate_episode(broken)


def test_the_shipped_episodes_are_the_ones_the_plan_names():
    ids = {p.stem for p in EPISODES_DIR.glob('*.json')}
    assert {'amphan-2020', 'yaas-2021'} <= ids, 'the Phase 9 list names Amphan (2020) and Yaas (2021)'


# ── the wiring diagnostic ────────────────────────────────────────────────────

def test_the_saturated_physics_terms_are_measured_not_asserted():
    """Two terms in the shipped wiring are at their ceiling on every row. The harness has to
    show that with counts, because a reader cannot check a claim made only in prose."""
    report = build()
    diagnostics = report['physics_diagnostics']
    for term in ('fire_drying', 'heat_persistence', 'cold_persistence'):
        entry = diagnostics['saturated_terms'][term]
        assert entry['rows'] == report['counts']['predictions']
        assert entry['rows_at_ceiling'] == entry['rows'], (
            f'{term} is not at its ceiling on every row — the finding needs restating'
        )
    # The counterfactual substitutes the arguments the formulas actually describe, and the
    # substitution is reported so the difference can be attributed.
    substitutions = diagnostics['counterfactual_substitutions']
    assert substitutions['fire_et_mm_per_day']['max'] < 6.0, (
        'a daily ET mean below the fire divisor (6 mm) is what makes the shipped term saturate: the '
        'formula is handed the horizon total, which on any horizon reaches the divisor'
    )
    assert substitutions['heat_exceedance_days_above_30c']['max'] <= 16
    assert 'wiring finding' in diagnostics['finding']


def test_the_counterfactual_lowers_the_fire_score_and_is_published_beside_the_shipped_one():
    episode = fixture_episode()
    rows = score_module.prediction_rows(episode, hindcast_cli.district_locations(), fixture_series())
    for row in rows:
        assert row['counterfactual_scores']['Fire'] <= row['physics_scores']['Fire']
    report = build()
    assert set(report['physics_diagnostics']['top_class_distribution_shipped'])
    assert set(report['physics_diagnostics']['top_class_distribution_counterfactual'])
    assert report['physics_diagnostics']['detection_counterfactual']['named_districts'] == \
        report['detection']['named_districts']


# ── the computed half: drivers, scores, report ───────────────────────────────

def test_window_aggregation_matches_the_pipeline_contract():
    series = fixture_series()
    station = series['satkhira']
    drivers = score_module.drivers_for_window(station, '2020-05-13', '2020-05-20')
    index = station['time'].index('2020-05-20')
    assert drivers['days'] == 8
    assert drivers['precip_total_mm'] == pytest.approx(sum(station['daily']['precipitation_sum'][8:]))
    assert drivers['precip_peak_mm'] == station['daily']['precipitation_sum'][index]
    assert drivers['wind_max_kmh'] == station['daily']['wind_speed_10m_max'][index]
    assert drivers['temp_max_c'] == max(station['daily']['temperature_2m_max'][8:])
    assert drivers['temp_min_c'] == min(station['daily']['temperature_2m_min'][8:])
    assert drivers['et_total_mm'] == pytest.approx(sum(station['daily']['et0_fao_evapotranspiration'][8:]))
    # A window the series does not cover yields no days rather than a default-filled driver set.
    assert score_module.drivers_for_window(station, '2019-01-01', '2019-01-07') == {'days': 0}


def test_the_fixture_carries_both_wind_drivers_the_archive_offers():
    """The harness's central finding is about the *driver*, so the fixture has to carry the pair
    a post-event record describes: a sustained maximum far below the cyclone, and a gust field
    near it. Without both, the wind-scenario diagnostic would have nothing to measure."""
    station = fixture_series()['khulna']
    assert 'wind_gusts_10m_max' in station['daily'], 'the gust driver must be fetched'
    index = station['time'].index('2020-05-20')
    sustained = station['daily']['wind_speed_10m_max'][index]
    gust = station['daily']['wind_gusts_10m_max'][index]
    assert sustained < 70 and gust > 150, 'the fixture must reproduce the sustained/gust gap'


def test_prediction_rows_carry_the_objective_window_and_their_provenance():
    episode = fixture_episode()
    rows = score_module.prediction_rows(episode, hindcast_cli.district_locations(), fixture_series())
    assert {row['horizon'] for row in rows} == {'7_days', '15_days'}
    for row in rows:
        expected_lead = dict(score_module.HORIZONS)[row['horizon']]
        from datetime import date
        lead = (date.fromisoformat(row['target_date']) - date.fromisoformat(row['prediction_date'])).days
        assert lead == expected_lead
        assert row['target_date'] == episode['event']['onset_date']
        assert row['score_source'] == 'physics_track'
        assert 'CNN was not re-run' in row['score_source_note']
        assert set(row['physics_scores']) == set(score_module.physics_severity.HAZARD_CLASSES)
        # The row's severity belongs to the class the row names — never a different class's score.
        assert row['severity_score'] == row['physics_scores'][row['hazard_type']]


def test_a_scripted_cyclonic_day_is_flagged_at_the_coast_and_not_inland():
    report = build()
    detection = {row['district']: row for row in report['detection']['per_district']}
    for district in ('Khulna', 'Satkhira', 'Bhola', 'Patuakhali'):
        assert detection[district]['flagged_any_class'], f'{district} should be flagged'
    # The inland controls are in the driver series but not in the truth set: they must not be
    # reported as either hits or false alarms.
    assert 'Dhaka' not in detection and 'Sylhet' not in detection


def test_the_shipped_wind_driver_leaves_the_cyclone_class_below_the_band():
    """The finding, in the fixture: with the sustained 10 m maximum the pipeline feeds the
    physics track, the class the event actually was does not cross the alarm band at the coast —
    while a differently-named class does. The gust field the archive also offers puts it over."""
    episode = fixture_episode()
    rows = score_module.prediction_rows(episode, hindcast_cli.district_locations(), fixture_series())
    coastal = [row for row in rows if row['district_name'] in ('Khulna', 'Satkhira', 'Bhola', 'Patuakhali')]
    assert coastal
    for row in coastal:
        sustained = row['wind_driver_scenarios']['era5_10m_sustained']
        gust = row['wind_driver_scenarios']['era5_10m_gust']
        assert sustained['tropical_cyclone'] < 0.5, 'sustained driver stays below the WATCH band'
        assert gust['tropical_cyclone'] >= 0.5, 'the gust driver crosses it'
        assert gust['tropical_cyclone'] > sustained['tropical_cyclone']
        # Crossing the band is not the same as being named: `Severe Local Storm` tops both
        # scenarios at gust speed, so the episode class is still not the track's pick.
        assert sustained['top_hazard'] != 'Tropical Cyclone'
        assert gust['top_hazard'] == 'Severe Local Storm'
    # And the shipped run therefore reports the episode class below threshold everywhere.
    assert report_detection(rows, episode)['episode_class_over_threshold'] == 0


def report_detection(rows, episode, threshold=0.5):
    return hindcast_cli.detection_summary(episode, rows, threshold)


def test_the_report_carries_the_wind_driver_comparison_and_its_finding_sentence():
    """The finding has to survive into the artifact a reader sees, not only into the row payload."""
    report = build()
    wind = report['physics_diagnostics']['wind_drivers']
    sustained, gust = wind['era5_10m_sustained'], wind['era5_10m_gust']
    assert sustained['rows'] == gust['rows'] == report['counts']['predictions']
    assert sustained['episode_class_over_threshold'] == 0
    assert gust['episode_class_over_threshold'] > 0
    assert gust['episode_class_score']['max'] > sustained['episode_class_score']['max']
    assert gust['named_the_episode_class'] == 0, (
        'the gust driver crosses the band without naming the class — that is the second defect'
    )
    assert 'Severe Local Storm' in wind['finding'] and 'wind driver' in wind['finding']


def test_an_alias_spelling_in_the_truth_set_resolves_before_it_is_joined():
    """The district join is a name join, and episodes are written from sources that spell
    districts their own way (Comilla, Coxs Bazar, Jhalakathi, Pirozpur). Resolution therefore
    happens in the harness, on both sides of the join. The first version of the 2024 episode
    spelled two districts the way its source did, and CI caught two districts missing from the
    per-district table — this pins both halves of the fix.
    """
    from etl import districts as district_table

    episode = fixture_episode()
    episode['truth']['affected'] = [
        {**episode['truth']['affected'][0], 'district': 'Comilla', 'as_written': 'Cumilla'},
        {**episode['truth']['affected'][0], 'district': 'Coxs Bazar', 'as_written': "Cox's Bazar"},
    ]
    # 1. The truth rows carry canonical names, which is what the predict side speaks.
    assert [row['district'] for row in score_module.outcome_rows(episode)] == \
        ['Cumilla', "Cox's Bazar"]
    assert [entry['district'] for entry in episode_module.affected_districts(episode)] == \
        ['Cumilla', "Cox's Bazar"]
    assert district_table.resolve('Coxs Bazar') == "Cox's Bazar"

    # 2. The fixture has no station for either district (it is six scripted stations), and that
    #    hole is *reported* rather than left as a silently empty row in the table.
    report = build(episode=episode)
    assert report['counts']['named_districts_without_a_prediction_row'] == ["Cox's Bazar", 'Cumilla']
    assert [row['district'] for row in report['per_district']] == ['Cumilla', "Cox's Bazar"]
    assert all(row['physics_top_hazard'] is None for row in report['per_district'])


def test_the_engine_scores_the_episode_class_and_the_mismatch_is_visible():
    report = build()
    scores = report['evaluation']['scores']
    assert report['evaluation']['status'] == 'ok'
    # The scripted storm is wind-driven, and the physics family's steeper persistence and rain
    # terms win: the track never names the cyclone class. That is the finding, and it must show
    # up as a class mismatch in per_class rather than being smoothed into a hit.
    assert scores['per_class']['Tropical Cyclone']['hits'] == 0
    assert scores['per_class']['Tropical Cyclone']['misses'] > 0
    assert report['detection']['flagged_episode_class'] == 0
    assert report['detection']['episode_class_over_threshold'] == 0


def test_swapping_the_episode_class_to_what_the_track_names_produces_hits():
    """The scoring path must be able to produce a hit at all — otherwise the harness would
    report `pod 0` for every event and read as a finding it is not.

    `Fire` is the class the fixture's shipped wiring names on the majority of its rows (the
    saturation diagnostic explains why), so scoring against `Fire` must produce hits on those
    rows and misses on the rest — a partial detection, which is what a working scorer looks like.
    """
    episode = fixture_episode()
    episode['hazard_class'] = 'Fire'
    report = build(episode=episode)
    events = report['evaluation']['scores']['events']
    assert events['hits'] > 0
    assert events['pod'] is not None and events['pod'] > 0.0
    assert report['detection']['flagged_episode_class'] > 0


def test_absence_of_a_record_is_never_a_false_alarm():
    """Two absence rules, both of them the honest reading.

    * With `absence_means_no_event: false` a district-window with **no outcome at all** is not
      scored — it cannot become a correct negative or a false alarm. In this fixture the two
      inland controls are exactly that set, and the engine reports them as unmatched.
    * `far` may still be measured from the pairs that *do* have an outcome. Here every such pair
      is a class mismatch, so the engine reports `far: 1.0` under its class-strict rule — which
      the report explains next to the class-agnostic detection count, so a reader cannot take
      that 1.0 for "80 % of the alarms were wrong".
    """
    report = build()
    assert report['what_was_hindcast']['absence_means_no_event'] is False
    assert report['counts']['prediction_windows_without_an_outcome'] == 4  # 2 inland controls × 2
    events = report['evaluation']['scores']['events']
    assert events['far'] == 1.0 and events['hits'] == 0
    assert events['negatives_available'] > 0
    assert any('class-strict' in line for line in report['what_was_hindcast']['how_to_read'])
    assert report['detection']['flagged_any_class'] == report['detection']['named_districts']


def test_an_episode_with_no_joinable_outcome_reports_insufficient_truth_rather_than_zeroes():
    episode = fixture_episode()
    episode['truth']['affected'] = [
        {'district': 'Kurigram', 'as_written': 'Kurigram', 'tier': 'most_affected',
         'source_id': 'nawg-jna' if any(s['id'] == 'nawg-jna' for s in episode['sources']) else
         episode['sources'][0]['id']}
    ]
    report = build(episode=episode)
    assert report['evaluation']['status'] == 'insufficient_truth'
    assert 'no prediction could be joined' in report['evaluation']['reason']
    assert report['evaluation'].get('scores') is None
    assert report['detection']['named_districts'] == 1
    assert report['detection']['flagged_any_class'] == 0


def test_the_report_declares_what_was_not_done():
    report = build()
    declaration = report['what_was_hindcast']
    assert declaration['physics_track'] is True
    assert declaration['cnn_evaluated'] is False
    assert 'CNN was not re-run' in declaration['cnn_note']
    assert declaration['drivers']['is_forecast'] is False
    assert 'ceiling on detection' in declaration['drivers']['is_forecast_note']
    assert report['citations'], 'the truth set must be cited inside the report'


def test_threshold_sensitivity_reports_every_band():
    report = build()
    bands = {row['alarm_threshold']: row for row in report['threshold_sensitivity']}
    assert set(bands) >= {0.40, 0.50, 0.65}
    assert 'WATCH band' in bands[0.40]['note']
    assert 'WARNING band' in bands[0.65]['note']
    for row in bands.values():
        assert row['hits'] + row['misses'] + row['false_alarms'] == row['scored_samples']


def test_the_report_recomputes_identically_from_the_committed_inputs(tmp_path):
    report = build()
    again = build()
    assert hindcast_cli.stable_view(report) == hindcast_cli.stable_view(again)
    # The clock and the driver path are the only fields excluded from the comparison.
    assert report['generated_at'] == again['generated_at']
    assert hindcast_cli.stable_view(report)['what_was_hindcast']['drivers'].get(
        'driver_series_loaded_from'
    ) is None


def test_check_rejects_a_hand_edited_number_and_accepts_the_real_thing(tmp_path):
    episode = fixture_episode()
    drivers_dir = tmp_path / 'drivers'
    drivers_dir.mkdir()
    (drivers_dir / f"{episode['id']}.json").write_text(
        FIXTURE_DRIVERS.read_text(encoding='utf-8'), encoding='utf-8'
    )
    reports_dir = tmp_path / 'reports'
    reports_dir.mkdir()
    report_path = reports_dir / 'fixture.json'
    report_path.write_text(json.dumps(build(), indent=2), encoding='utf-8')

    args = type('Args', (), {'reports_dir': str(reports_dir), 'drivers_dir': str(drivers_dir)})()
    assert hindcast_cli.cmd_check(args) == 0

    tampered = json.loads(report_path.read_text(encoding='utf-8'))
    tampered['detection']['flagged_any_class'] = 99
    report_path.write_text(json.dumps(tampered, indent=2), encoding='utf-8')
    assert hindcast_cli.cmd_check(args) == 1


def test_cli_run_writes_a_report_and_refuses_to_guess_without_drivers(tmp_path):
    out = tmp_path / 'report.json'
    code = hindcast_cli.main([
        'run', '--episode', str(FIXTURE_EPISODE), '--drivers', str(FIXTURE_DRIVERS),
        '--out', str(out),
    ])
    assert code == 0
    assert json.loads(out.read_text(encoding='utf-8'))['schema'] == hindcast_cli.REPORT_SCHEMA

    with pytest.raises(SystemExit, match='no driver series'):
        hindcast_cli.main([
            'run', '--episode', str(FIXTURE_EPISODE),
            '--drivers', str(tmp_path / 'missing.json'), '--out', str(out),
        ])


def test_the_committed_reports_and_drivers_agree_when_present():
    """Once the workflow has fetched drivers and written reports, CI must be able to
    recompute them. Until then there is nothing to check, and the suite says so."""
    reports = sorted(REPORTS_DIR.glob('*.json'))
    drivers = sorted((ROOT / 'data' / 'hindcast' / 'drivers').glob('*.json'))
    if not reports:
        pytest.skip('no hindcast report is committed yet — run .github/workflows/hindcast.yml')
    assert drivers, 'a committed report without a committed driver series cannot be checked'
    result = subprocess.run(
        [sys.executable, '-m', 'hindcast.cli', 'check'],
        cwd=SCRIPTS, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    for report in reports:
        payload = json.loads(report.read_text(encoding='utf-8'))
        assert payload['schema'] == hindcast_cli.REPORT_SCHEMA
        assert payload['what_was_hindcast']['cnn_evaluated'] is False
        assert payload['episode']['episode_sha256']
