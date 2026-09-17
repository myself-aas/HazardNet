#!/usr/bin/env python3
"""The FFWC hydrology stream (w3) and the BMD bulletin parser (Phase 2).

Both modules exist for the same reason: the fusion model's fourth input is
evidence about *today*, and the shipped pipeline had no path for it at all. The
tests below pin the two properties that make the stream usable rather than
merely present:

  * a missing or stale observation is **null/`available: false`**, never a `0`
    that a consumer reads as "no flooding" (the silent-default defect);
  * an official bulletin's severity is derived from the bulletin's own numbers
    with the same formulas as the live physics track, so `w3` and the model's
    physics score are on one scale and can be compared.

Timestamps are always passed in explicitly: a test that depends on the wall clock
would drift into (or out of) the 36-hour staleness window on its own.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'scripts' / 'etl'))

import bulletins  # noqa: E402
import hydrology  # noqa: E402
import physics_severity  # noqa: E402

FIXTURES = ROOT / 'scripts' / 'tests' / 'fixtures' / 'etl'
#: The fixtures were observed on 2026-09-16; scoring "now" is a fixed instant so the
#: staleness window is part of the test, not part of the calendar.
NOW = datetime(2026, 9, 16, 12, 0, tzinfo=timezone.utc)
STALE_NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


def station_records():
    return [hydrology.normalize_record(raw, index=index)
            for index, raw in enumerate(hydrology.load_records(FIXTURES / 'ffwc_stations.json'))]


def bulletin_texts():
    return bulletins.load_bulletins(FIXTURES / 'bmd_bulletins.json')


def parsed_bulletins():
    return [bulletins.parse_bulletin(text) for text in bulletin_texts()]


# ── hydrology: the piecewise severity mapping ───────────────────────────────

@pytest.mark.parametrize('ratio,expected', [
    (0.00, 0.0),
    (0.50, 0.0),
    (0.8999, 0.0),
    (0.90, 0.0),
    (0.95, 0.25),
    (1.00, 0.50),
    (1.10, 0.675),
    (1.20, 0.85),
    (1.35, 0.925),
    (1.50, 1.0),
    (2.00, 1.0),
])
def test_the_ratio_mapping_is_continuous_and_saturates(ratio, expected):
    assert hydrology.score_ratio(ratio) == pytest.approx(expected, abs=1e-4)


def test_the_ratio_mapping_has_no_jump_at_its_breakpoints():
    for ratio in (0.89999, 0.90001, 0.99999, 1.00001, 1.19999, 1.20001):
        assert 0.0 <= hydrology.score_ratio(ratio) <= 1.0
    assert hydrology.score_ratio(0.9001) < hydrology.score_ratio(0.9999)
    assert hydrology.score_ratio(1.0001) < hydrology.score_ratio(1.1999)
    assert hydrology.score_ratio(float('nan')) == 0.0


def test_a_station_with_no_observation_or_forecast_is_refused():
    with pytest.raises(hydrology.HydrologyError) as excinfo:
        hydrology.normalize_record({'station_id': 'SW-X', 'district': 'Sylhet', 'danger_level_m': 10.0})
    assert 'nothing to score' in str(excinfo.value)


def test_a_station_outside_the_64_districts_is_refused():
    with pytest.raises(hydrology.HydrologyError):
        hydrology.normalize_record({'station_id': 'SW-Y', 'district': 'Kolkata',
                                    'danger_level_m': 10.0, 'observed_level_m': 5.0})


def test_a_zero_or_nonsense_danger_level_is_refused():
    with pytest.raises(hydrology.HydrologyError) as excinfo:
        hydrology.normalize_record({'station_id': 'SW-Z', 'district': 'Sylhet',
                                    'danger_level_m': 0, 'observed_level_m': 5.0})
    assert 'must be positive' in str(excinfo.value)
    with pytest.raises(hydrology.HydrologyError):
        hydrology.normalize_record({'station_id': 'SW-Z', 'district': 'Sylhet',
                                    'danger_level_m': 'deep', 'observed_level_m': 5.0})


def test_a_station_needs_at_least_an_id_or_a_name():
    with pytest.raises(hydrology.HydrologyError):
        hydrology.normalize_record({'district': 'Sylhet', 'danger_level_m': 10.0, 'observed_level_m': 11.0})


def test_hazard_class_override_separates_flash_from_riverine_flooding():
    flash = next(r for r in station_records() if r['flood_type'] if 'flood_type' in r) \
        if False else [r for r in station_records() if r['station_id'] == 'SW101'][0]
    assert flash['hazard_class'] == 'Flash Flood'
    riverine = [r for r in station_records() if r['station_id'] == 'SW273'][0]
    assert riverine['hazard_class'] == 'Flood'


def test_scoring_prefers_the_highest_level_and_records_its_basis():
    sylhet = [r for r in station_records() if r['station_id'] == 'SW273'][0]
    score = hydrology.score_station(sylhet, now=NOW)
    # 12.4 m (a forecast, +3 d) is above the 11.42 m observation, so it leads and
    # carries the damping for its lead time.
    assert score['reference_basis'] == 'forecast'
    assert score['reference_level_m'] == 12.4
    assert score['exceedance_ratio'] == pytest.approx(12.4 / 10.8, abs=1e-3)
    assert score['damping'] == pytest.approx(hydrology.forecast_damping(score['forecast_lead_days']))
    assert score['hydrology_severity'] == pytest.approx(
        hydrology.score_ratio(12.4 / 10.8) * score['damping'], abs=1e-4)
    assert score['above_danger'] is True
    assert score['source'] == 'ffwc'


def test_forecast_damping_discounts_long_leads_with_a_floor():
    assert hydrology.forecast_damping(0) == 1.0
    assert hydrology.forecast_damping(2) == pytest.approx(0.9)
    assert hydrology.forecast_damping(100) == hydrology.MIN_FORECAST_DAMPING


def test_an_observation_is_used_at_full_weight_and_flagged_when_stale():
    chittagong = [r for r in station_records() if r['station_id'] == 'SW043'][0]
    # SW043 was observed at 2026-09-12T06:00Z — a four-day-old reading, the case the
    # staleness rule exists for. Six hours after the observation it is fresh:
    six_hours_later = datetime(2026, 9, 12, 12, 0, tzinfo=timezone.utc)
    fresh = hydrology.score_station(chittagong, now=six_hours_later)
    assert fresh['reference_basis'] == 'observed'
    assert fresh['damping'] == 1.0
    assert fresh['stale'] is False
    assert fresh['observed_age_hours'] == 6.0
    stale = hydrology.score_station(chittagong, now=NOW)
    assert stale['stale'] is True                        # 102 h old
    assert stale['observed_age_hours'] > hydrology.STALE_AFTER_HOURS
    # Staleness is disclosed, not silently discounted: the score is unchanged.
    assert stale['hydrology_severity'] == fresh['hydrology_severity']


def test_the_trend_is_derived_when_the_source_does_not_state_one():
    sunamganj = [r for r in station_records() if r['station_id'] == 'SW274'][0]
    assert sunamganj['trend'] is None
    derived = hydrology.score_station(sunamganj, now=NOW)['trend']
    assert derived == 'rising'                           # 7.9 m forecast over 7.1 m observed
    kurigram = [r for r in station_records() if r['station_id'] == 'SW101'][0]
    assert hydrology.score_station(kurigram, now=NOW)['trend'] == 'falling'  # stated by the source


def test_the_worst_station_leads_its_district():
    scores = hydrology.district_scores(station_records(), now=NOW)
    assert set(scores) == {'Sylhet', 'Sunamganj', 'Kurigram', 'Chattogram'}
    sylhet = scores['Sylhet']
    assert sylhet['station_count'] == 1
    assert sylhet['stations_above_danger'] == 1
    assert sylhet['hydrology_severity'] > hydrology.score_ratio(11.42 / 10.8) * 1.0 - 1e-4
    assert sylhet['worst_station'] == 'Sylhet'
    assert scores['Sunamganj']['stations_above_danger'] == 0
    assert scores['Sunamganj']['hydrology_severity'] < 0.5


def test_the_stream_says_how_much_of_it_is_fresh():
    fresh = hydrology.stream_state(station_records(), now=NOW)
    assert fresh['available'] is True
    assert fresh['stations'] == 4
    assert fresh['districts'] == 4
    assert fresh['fresh_stations'] == 3
    assert fresh['stale_stations'] == 1                  # the four-day-old Chittagong reading
    assert fresh['reason'] is None
    # Past the window every observation is stale, and the stream says which way it
    # failed instead of reporting an empty-but-healthy stream.
    stale = hydrology.stream_state(station_records(), now=STALE_NOW)
    assert stale['stale_stations'] == 4
    assert stale['available'] is True                    # forecasts still cover the day
    assert 'older than the staleness threshold' in stale['reason']


def test_an_empty_stream_is_declared_unavailable_not_zero():
    state = hydrology.stream_state([])
    assert state['available'] is False
    assert state['reason'] == 'no FFWC records supplied'
    assert hydrology.district_scores([], now=NOW) == {}


def test_rows_without_a_station_get_null_not_zero():
    rows = [
        {'district_name': 'Sylhet', 'hazard_type': 'Flood'},
        {'district_name': 'Bhola', 'hazard_type': 'Flood'},
    ]
    summary = hydrology.merge_into_rows(rows, station_records(), now=NOW)
    assert rows[0]['hydrology_available'] is True
    assert 0.5 < rows[0]['hydrology_severity'] <= 1.0    # above danger level
    assert rows[0]['hydrology_hazard'] == 'Flood'
    assert rows[0]['hydrology_trend'] == 'rising'
    assert rows[1]['hydrology_available'] is False
    assert rows[1]['hydrology_severity'] is None         # unknown, not "no flooding"
    assert summary['rows_matched'] == 1
    assert summary['rows_unmatched'] == 1
    assert summary['stream'] == 'w3-hydrology'


def test_the_merge_understands_the_gaul_spelling_of_a_district():
    rows = [{'district_name': 'Chittagong', 'hazard_type': 'Flood'}]
    hydrology.merge_into_rows(rows, station_records(), now=NOW)
    assert rows[0]['hydrology_available'] is True


# ── bulletins: parsing what BMD actually writes ─────────────────────────────

def test_the_three_fixture_bulletins_parse_with_their_issue_times():
    parsed = parsed_bulletins()
    assert len(parsed) == 3
    assert parsed[0]['issued_at'] == '2026-06-15T06:00:00Z'
    assert parsed[1]['issued_at'] == '2026-05-20T12:00:00Z'
    assert parsed[2]['issued_at'] == '2026-04-21T09:30:00Z'
    assert all(bulletin['source'] == 'bmd' for bulletin in parsed)
    assert all(len(bulletin['raw_text_sha256']) == 64 for bulletin in parsed)


def test_an_empty_bulletin_is_refused():
    with pytest.raises(bulletins.BulletinError):
        bulletins.parse_bulletin('   \n  ')


def test_a_message_reference_is_preferred_as_the_bulletin_id():
    first = parsed_bulletins()[0]
    assert first['bulletin_id'] == 'bmd-METEO-AC-15-2026'
    assert first['bulletin_id_basis'] == 'message reference'
    assert first['source_record_id'].startswith('bmd-')


def test_a_bulletin_number_is_used_when_there_is_no_reference():
    text = 'Bangladesh Meteorological Department\nSpecial Weather Bulletin\n' \
           'Bulletin No. 8\nDate: 20 May 2026, 12:00 PM\nCyclone warning for Khulna.'
    parsed = bulletins.parse_bulletin(text)
    assert parsed['bulletin_id'] == 'bmd-8'
    assert parsed['bulletin_id_basis'] == 'bulletin number'


def test_a_bulletin_without_any_number_falls_back_to_its_content_hash():
    text = 'Bangladesh Meteorological Department\nWeather Outlook\n' \
           'Date: 20 May 2026, 12:00 PM\nLight rain likely over Dhaka.'
    parsed = bulletins.parse_bulletin(text)
    assert parsed['bulletin_id_basis'] == 'content hash'
    assert parsed['bulletin_id'] == f"bmd-{parsed['raw_text_sha256'][:12]}"


def test_a_full_month_name_in_the_date_is_parsed_not_defaulted():
    """The defect this pins: matching only 'jun' silently fell back to receipt time."""
    text = 'Bangladesh Meteorological Department\nSpecial Weather Bulletin\n' \
           'Bulletin No. 3\nDate: 15 June 2026, 06:00 AM\nHeavy rainfall over Sylhet.'
    assert bulletins.parse_bulletin(text)['issued_at'] == '2026-06-15T06:00:00Z'
    text = text.replace('June', 'Jun.')
    assert bulletins.parse_bulletin(text)['issued_at'] == '2026-06-15T06:00:00Z'


def test_a_12_am_issue_time_is_midnight_not_noon():
    text = 'Special Weather Bulletin\nBulletin No. 4\nDate: 15 June 2026, 12:30 AM\nFlood risk.'
    assert bulletins.parse_bulletin(text)['issued_at'] == '2026-06-15T00:30:00Z'
    text = text.replace('12:30 AM', '12:30 PM')
    assert bulletins.parse_bulletin(text)['issued_at'] == '2026-06-15T12:30:00Z'


def test_districts_are_found_with_word_boundaries_and_gaul_spellings():
    found, spellings = bulletins.find_districts(
        "Warning for Nawabganj, Cox's Bazar and Chittagong; Comilla is not affected but Cumilla is.")
    assert found == ['Chapainawabganj', 'Chattogram', "Cox's Bazar", 'Cumilla']
    # The alias key is recorded lower-cased (it is matched case-insensitively); the
    # canonical name is what every downstream consumer joins on.
    assert spellings['Chapainawabganj'] == 'nawabganj'
    assert spellings['Chattogram'] == 'chittagong'
    found, _ = bulletins.find_districts('Discussion of the monsoon over the country.')
    assert found == []


def test_a_more_specific_hazard_phrase_consumes_its_text():
    # The specific phrase claims its own span, so the "flood" inside "flash flood"
    # does not also produce a riverine-flood advisory.
    assert bulletins.find_hazards('A flash flood warning is in force.') == ['Flash Flood']
    # A separate mention of the generic word *elsewhere* in the bulletin is still a
    # mention: the parser reports what the text says, and both advisories carry the
    # same severity and basis.
    assert bulletins.find_hazards('A flash flood warning: flood water may rise.') == \
        ['Flash Flood', 'Flood']
    assert bulletins.find_hazards('Storm surge of 5 feet, cyclone approaching.') == ['Tropical Cyclone']
    assert bulletins.find_hazards('Heavy to very heavy rainfall likely.') == ['Flash Flood']


def test_the_rain_bulletin_localises_and_severities_its_districts():
    first = parsed_bulletins()[0]
    assert first['hazards'] == ['Flash Flood']
    assert first['districts'] == ['Moulvibazar', 'Sunamganj', 'Sylhet']
    assert first['scope'] == 'district'
    assert first['divisions'] == ['Sylhet']
    assert first['drivers']['rainfall_mm'] == 150.0
    assert first['drivers']['validity_hours'] == 24
    assert first['severity'] == pytest.approx(round(min(150 / 300.0, 1.0), 4), abs=1e-6)
    assert first['severity_basis'] == 'rainfall_mm=150'
    advisories = bulletins.to_advisories(first)
    assert len(advisories) == 3
    assert {advisory['district'] for advisory in advisories} == set(first['districts'])
    assert all(advisory['confidence_kind'] == 'official_bulletin' for advisory in advisories)
    assert all(advisory['headline'] == first['headline'] for advisory in advisories)


def test_the_cyclone_bulletin_maps_signals_and_wind_to_severity():
    second = parsed_bulletins()[1]
    assert second['hazards'] == ['Tropical Cyclone']
    assert second['signals'] == [7]
    assert second['drivers']['wind_kmh'] == 130.0
    assert second['drivers']['signal'] == 7
    assert second['scope'] == 'district'
    assert set(second['districts']) == {'Bagerhat', 'Chattogram', "Cox's Bazar", 'Khulna', 'Noakhali'}
    # The signal table and the wind formula are both candidates; the larger wins and
    # the basis names it, so a reviewer can see which one drove the advisory.
    wind_score = round(physics_severity.om_calc_tropical_cyclone(130.0, 0.0), 4)
    assert second['severity'] == pytest.approx(max(bulletins.SIGNAL_SEVERITY[7], wind_score), abs=1e-4)
    assert second['severity_basis'] == 'signal=7'


def test_a_bulletin_without_districts_is_national_scope_with_an_unlocalised_advisory():
    third = parsed_bulletins()[2]
    assert third['scope'] == 'national'
    assert third['districts'] == []
    assert third['hazards'] == ['Heat Wave']
    advisories = bulletins.to_advisories(third)
    assert len(advisories) == 1
    assert advisories[0]['district'] is None
    assert advisories[0]['advisory_id'].endswith(':national')


def test_a_bulletin_with_no_recognised_hazard_yields_no_advisories():
    text = 'Special Weather Bulletin\nBulletin No. 9\nDate: 15 June 2026, 06:00 AM\n' \
           'A mild earthquake was felt in Dhaka.'
    parsed = bulletins.parse_bulletin(text)
    assert parsed['hazards'] == []
    assert parsed['districts'] == ['Dhaka']              # mentioned, but nothing to warn about
    assert bulletins.to_advisories(parsed) == []


def test_validity_is_recorded_both_ways_round():
    first = parsed_bulletins()[0]
    assert first['valid_until'] == '2026-06-16T06:00:00Z'  # + 24 h
    third = parsed_bulletins()[2]
    assert third['drivers']['validity_hours'] == 72        # "the next 3 days"
    assert third['valid_until'] == '2026-04-24T09:30:00Z'
    text = 'Special Weather Bulletin\nBulletin No. 5\nDate: 15 June 2026, 06:00 AM\n' \
           'Thunderstorm with lightning.'
    assert bulletins.parse_bulletin(text)['valid_until'] is None


def test_a_temperature_only_bulletin_scores_through_the_physics_formulas():
    third = parsed_bulletins()[2]
    assert third['drivers']['temperature_c'] == 39.5
    assert third['severity'] == pytest.approx(
        round(physics_severity.om_calc_heat_wave(39.5, 3.0), 4), abs=1e-4)
    assert third['severity_basis'] == 'temp_max_c=39.5'


def test_severity_is_none_rather_than_guessed_when_no_driver_is_known():
    text = 'Special Weather Bulletin\nBulletin No. 6\nDate: 15 June 2026, 06:00 AM\n' \
           'Drought conditions may persist.'
    parsed = bulletins.parse_bulletin(text)
    assert parsed['hazards'] == ['Drought']
    assert parsed['severity'] is None and parsed['severity_basis'] is None


def test_the_summary_separates_localised_from_national_and_names_its_interpretations():
    summary = bulletins.summarize(parsed_bulletins())
    assert summary['bulletins'] == 3
    assert summary['localised'] == 2
    assert summary['national_scope'] == 1
    assert summary['advisories'] == 3 + 5 + 1
    assert summary['advisories_by_district']['Sylhet'] == 1
    assert set(summary['hazards']) == {'Flash Flood', 'Tropical Cyclone', 'Heat Wave'}
    assert 'heavy rainfall → Flash Flood' in summary['interpretations']
    assert summary['without_severity'] == 0


def test_merging_into_rows_never_reads_an_absent_warning_as_agreement():
    rows = [
        {'district_name': 'Sylhet', 'hazard_type': 'Flash Flood'},
        {'district_name': 'Sunamganj', 'hazard_type': 'Tropical Cyclone'},
        {'district_name': 'Bhola', 'hazard_type': 'Flood'},
    ]
    merge = bulletins.merge_into_rows(rows, parsed_bulletins())
    assert rows[0]['official_hazards'] == 'Flash Flood'
    assert rows[0]['model_agrees_with_official'] is True
    assert rows[1]['model_agrees_with_official'] is False       # the model says cyclone
    assert rows[2]['official_hazards'] is None
    assert rows[2]['model_agrees_with_official'] is None        # unknown, not agreement
    assert rows[2]['official_severity'] is None
    assert merge['rows_matched'] == 2
    assert merge['model_agrees_with_official'] == 1
    assert merge['model_disagrees_with_official'] == 1
    assert merge['districts_with_official_warning'] == 8


def test_a_single_text_file_is_read_as_one_bulletin(tmp_path):
    path = tmp_path / 'bmd.txt'
    path.write_text('Special Weather Bulletin\nBulletin No. 7\nDate: 15 June 2026, 06:00 AM\n'
                    'River flood risk over Kurigram.', encoding='utf-8')
    texts = bulletins.load_bulletins(path)
    assert len(texts) == 1
    assert bulletins.parse_bulletin(texts[0])['hazards'] == ['Flood']


def test_the_json_fixture_is_a_list_of_texts_not_objects():
    payload = json.loads((FIXTURES / 'bmd_bulletins.json').read_text(encoding='utf-8'))
    assert all(isinstance(text, str) for text in payload['bulletins'])
