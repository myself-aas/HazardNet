#!/usr/bin/env python3
"""The BGD climatic-hazards adapter: mapping, refusals, and the column contract.

WHY THESE ASSERTIONS AND NOT OTHERS
-----------------------------------
An adapter is the one place where a column name can be silently reinterpreted, and a
silent reinterpretation here is indistinguishable from a data defect three phases later.
So the tests are about *what the adapter refuses to do* as much as what it does:

  * it must not map the three constant columns — writing `Validated_Affected = 0.0` into
    `affected` would assert "nobody was affected" for all 2,931 rows when the truth is
    "not recorded", and the content engine's coverage sentence exists precisely to keep
    those apart;
  * it must not use the GEE window as the event window (that would inflate duration by
    months and change any duration-derived severity);
  * it must not drop a row it cannot map — a dropped row is the silent-dropout defect
    `scripts/etl/events.py` was written to remove.

The end-to-end test loads the real committed archive when it is present and asserts the
full pipeline reaches `status: ok`. It skips (rather than fails) when the archive is
absent, which is the normal state of a fresh clone — see `data/events/README.md`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'etl'))

import adapters as adapters_module  # noqa: E402
import districts as districts_module  # noqa: E402
import events as events_module  # noqa: E402

ADAPTER_KEY = 'bgd-climatic-hazards'
ARCHIVE = ROOT / 'data' / 'events' / 'historical_hazard_records_with_HazardNet_severity.csv'

# One representative source row, in the archive's own column vocabulary.
SOURCE_ROW = {
    'Event_ID_Internal': 'Event_0000',
    'GLIDE': 'ST-2000-000211-BGD',
    'Date': '2000-05-02',
    'District': 'Barguna',
    'Latitude': '22.1509',
    'Longitude': '90.1263',
    'Hazard_Type': 'Severe Local Storm',
    'GEE_Start': '2000-03-13',
    'GEE_End': '2000-06-21',
    'Severity_Index_Name': 'MODERATE_RISK',
    'Severity_Score': '1.0',
    'Validated_Affected': '0.0',
    'Full_Description': 'No detailed description available.',
    'Raw_Severity_Score': '0.1752',
    'Data_Source': 'API_Corrected',
    'Confidence': '0.85',
    'Severity_Index': '0.4096638655462185',
    'Confidence_Bin': 'Certain',
    'Requires_Manual_Review': 'False',
}


def adapter():
    return adapters_module.get(ADAPTER_KEY)


def adapt_one(row=None):
    return adapter().adapt([row or dict(SOURCE_ROW)])[0]


# ── registration ─────────────────────────────────────────────────────────────

def test_adapter_is_registered():
    module = adapter()
    assert module.SOURCE == 'bgd-climatic-hazards'


def test_unknown_adapter_key_raises():
    with pytest.raises(KeyError):
        adapters_module.get('does-not-exist')


# ── column mapping ───────────────────────────────────────────────────────────

def test_renames_the_five_mapped_columns():
    mapped = adapt_one()
    assert mapped['source_record_id'] == 'Event_0000'
    assert mapped['start_date'] == '2000-05-02'
    assert mapped['hazard_type'] == 'Severe Local Storm'
    assert mapped['adm2_name'] == 'Barguna'
    assert mapped['severity'] == '0.4096638655462185'
    assert mapped['source'] == 'bgd-climatic-hazards'


def test_never_maps_the_constant_columns():
    """The three constants carry no information and mapping them would fabricate claims."""
    mapped = adapt_one()
    # Severity_Score (1.0 everywhere) must not become the severity.
    assert mapped['severity'] == SOURCE_ROW['Severity_Index']
    assert mapped['severity'] != SOURCE_ROW['Severity_Score']
    # Validated_Affected (0.0 everywhere) must not become an affected count.
    assert 'affected' not in mapped
    # Severity_Index_Name (MODERATE_RISK everywhere) must not become a basis or label.
    assert 'severity_index_name' not in mapped
    assert mapped.get('severity_basis') == 'archive:severity_index'


def test_declares_the_constants_it_excludes():
    """The exclusion list is a documented decision, not an omission."""
    assert set(adapter().UNMAPPED_COLUMNS) >= {
        'Severity_Score', 'Severity_Index_Name', 'Validated_Affected',
    }


def test_does_not_use_the_gee_window_as_the_event_window():
    """GEE_Start/GEE_End is a retrieval window; using it would inflate duration."""
    mapped = adapt_one()
    assert mapped['start_date'] == '2000-05-02'
    assert mapped['start_date'] != SOURCE_ROW['GEE_Start']


# ── notes grammar ────────────────────────────────────────────────────────────

def test_notes_carry_the_provenance_tokens():
    notes = adapt_one()['notes']
    assert 'glide=ST-2000-000211-BGD' in notes
    assert 'gee=2000-03-13..2000-06-21' in notes
    assert 'src=API_Corrected' in notes
    assert 'conf=0.85' in notes
    assert 'raw=0.1752' in notes
    assert 'review=False' in notes


def test_notes_omit_the_placeholder_description():
    """1856 of 2931 rows say only 'No detailed description available.'"""
    assert '|' not in adapt_one()['notes']


def test_notes_carry_a_real_description_as_a_tail():
    row = dict(SOURCE_ROW, Full_Description='Some\n  real   prose.')
    notes = adapt_one(row)['notes']
    assert '| Some real prose.' in notes


def test_notes_drop_a_value_that_would_break_the_token_grammar():
    """A value containing a space cannot be a token; it is dropped, not escaped."""
    notes = adapt_one(dict(SOURCE_ROW, Data_Source='two words'))['notes']
    assert 'src=' not in notes


def test_notes_always_carry_at_least_one_token():
    empty = {k: '' for k in SOURCE_ROW}
    empty['Event_ID_Internal'] = 'Event_9999'
    notes = adapt_one(empty)['notes']
    assert notes and notes.split('=')[0]


# ── geometry ─────────────────────────────────────────────────────────────────

def test_builds_a_geojson_point_longitude_first():
    geometry = adapt_one()['geom_geojson']
    assert '"type": "Point"' in geometry
    assert '90.1263' in geometry and '22.1509' in geometry
    assert geometry.index('90.1263') < geometry.index('22.1509')


def test_omits_geometry_when_coordinates_are_unusable():
    assert 'geom_geojson' not in adapt_one(dict(SOURCE_ROW, Latitude='', Longitude=''))


def test_rejects_out_of_range_coordinates_rather_than_relocating_them():
    assert 'geom_geojson' not in adapt_one(dict(SOURCE_ROW, Latitude='991.0'))


# ── no silent dropout ────────────────────────────────────────────────────────

def test_a_row_with_no_id_is_emitted_so_the_loader_reports_it():
    mapped = adapt_one(dict(SOURCE_ROW, Event_ID_Internal=''))
    assert 'source_record_id' in mapped
    assert mapped['source_record_id'] == ''
    # …and the contract rejects it, naming the field.
    with pytest.raises(events_module.EventValidationError, match='source_record_id'):
        events_module.normalize_event(mapped, index=0)


def test_every_row_is_returned_even_when_columns_are_missing():
    rows = adapter().adapt([dict(SOURCE_ROW), {}, dict(SOURCE_ROW)])
    assert len(rows) == 3


# ── district aliases this archive needs ──────────────────────────────────────

@pytest.mark.parametrize(
    'spelling,canonical',
    [
        ('Barishal', 'Barisal'),          # archive + frontend alias; was missing in the ETL
        ('Khagrachari', 'Khagrachhari'),  # archive + GAUL/BBS rendering; was missing in both
        ('Jessore', 'Jashore'),
        ('Bogra', 'Bogra'),
    ],
)
def test_archive_spellings_resolve(spelling, canonical):
    assert districts_module.resolve(spelling) == canonical


def test_aliases_stay_in_step_with_the_frontend():
    """`barishal` was aliased in frontend/src/lib/forecasts.ts but not in the ETL.

    That drift refused every Barishal row. The parity test asserts pipeline → site; this
    asserts the reverse for the two spellings this archive actually uses.
    """
    frontend = (ROOT / 'frontend' / 'src' / 'lib' / 'forecasts.ts').read_text(encoding='utf-8')
    for alias in ('barishal', 'khagrachari'):
        assert f"{alias}:" in frontend, f'{alias} missing from DISTRICT_NAME_ALIASES'
        assert alias in districts_module.ALIASES, f'{alias} missing from scripts/etl/districts.py'


# ── end-to-end against the real archive ──────────────────────────────────────

@pytest.mark.skipif(not ARCHIVE.exists(), reason='archive not present (not redistributed — see data/events/README.md)')
def test_real_archive_loads_clean():
    rows = adapter().adapt(adapters_module.read_records(ARCHIVE))
    outcome = events_module.normalize_events(rows, strict=True)
    summary = events_module.summarize(outcome['events'])

    assert summary['total'] == 2931, 'the archive holds 2931 event-district observations'
    assert not outcome['errors']
    assert summary['by_hazard'] == {
        'Cold Wave': 322, 'Drought': 64, 'Fire': 65, 'Flash Flood': 331,
        'Flood': 890, 'Heat Wave': 36, 'Severe Local Storm': 514, 'Tropical Cyclone': 709,
    }
    # Every district in the archive resolves; none is silently dropped.
    assert len(summary['by_district']) == 64
    # The claim in docs/MODEL_CARD.md §4 is reproduced exactly, with zero drift.
    claim = events_module.verify_claimed_count(summary, claimed=2931)
    assert claim['drift'] == 0 and claim['within_tolerance']


@pytest.mark.skipif(not ARCHIVE.exists(), reason='archive not present')
def test_real_archive_writes_no_casualty_figure():
    """`affected` must be absent, not 0 — 'not recorded' and 'nobody affected' differ."""
    rows = adapter().adapt(adapters_module.read_records(ARCHIVE))
    outcome = events_module.normalize_events(rows, strict=True)
    assert all(event['affected'] is None for event in outcome['events'])
    assert all(event['deaths'] is None for event in outcome['events'])
