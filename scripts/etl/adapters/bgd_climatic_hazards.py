#!/usr/bin/env python3
"""Adapter: the Bangladesh climatic-hazards archive → the event contract.

SOURCE
------
`data/events/BGD_climatic_hazards_dataset_2000_2026.csv` (and its severity-augmented
sibling `historical_hazard_records_with_HazardNet_severity.csv`), the collection
pipeline's output described in `data/events/README.md`.

SHAPE OF THE SOURCE — read this before changing the mapping
-----------------------------------------------------------
The archive is **event-district observations**, not one row per physical event:

  * `Event_ID_Internal` is unique across all 2,931 rows (verified), so it is the
    per-row idempotency key the contract wants;
  * `GLIDE` is the *event* identifier, and only **60 of them** appear in 2,931 rows —
    41 GLIDE groups carry exactly 64 rows (one per district). A single cyclone is
    therefore 64 rows sharing one GLIDE and one date.

That is why GLIDE cannot be the row key: using it would collapse a national event to
one district. It is carried into the contract through `notes` as a documented
`glide=` token (see `NOTES GRAMMAR`) so the archive surfaces can group rows back into
physical events without the event contract growing a column that only this archive
would populate.

WHAT THIS ADAPTER DELIBERATELY DOES *NOT* MAP
---------------------------------------------
Three columns carry no information — they are constant across all 2,931 rows:

  | column                 | value                | rows  |
  |------------------------|----------------------|-------|
  | `Severity_Score`       | `1.0`                | 2931  |
  | `Severity_Index_Name`  | `MODERATE_RISK`      | 2931  |
  | `Validated_Affected`   | `0.0`                | 2931  |

Mapping them would be worse than useless:

  * `Severity_Score = 1.0` on every row would present "maximum severity" for all
    2,931 events, including 64 droughts and 65 fires;
  * `Severity_Index_Name = MODERATE_RISK` would contradict that same score;
  * `Validated_Affected = 0.0` would assert "nobody was affected" for every event,
    when the truth is **"not recorded"**. The contract distinguishes the two
    (`affected: None` vs `affected: 0`), and the retrospectives compute a
    *fatality-coverage gap* from that distinction — so writing 0 here would silently
    fabricate the one number the pages are careful to report as missing.

Severity therefore comes from `Severity_Index`, the only per-row continuous field
(0–1, 1,376 distinct values). It is passed as an explicit `severity`, so
`events.severity_from_basis()` is never invoked and no formula is applied to it.
The adapter does not clamp, scale or rank it.

**`Severity_Index` is a field of the archive, not a HazardNet contribution.** It is
already present in the committed data, so publishing it discloses nothing that was
not already public. Any *new* index derived in this repository is out of scope for
public copy until the associated research is published — see
`scripts/check-severity-embargo.mjs`, which fails the build if one leaks.

NOTES GRAMMAR
-------------
`notes` is a space-separated list of `key=value` tokens (values are `[A-Za-z0-9._-]+`),
followed by an optional free-text tail after ` | `. Consumers parse tokens, never
positions:

    glide=ST-2000-000211-BGD gee=2000-03-13..2000-06-21 src=API_Corrected conf=0.85 \
    raw=0.1752 review=false | <first 160 chars of Full_Description>

Timestamps
----------
`start_date = end_date = Date`. The archive's `GEE_Start`/`GEE_End` pair is the
**satellite retrieval window**, not the physical event window, and it is recorded in
`notes` as `gee=<start>..<end>` for provenance. Using it as the event window would
inflate duration by months and change any duration-dependent severity derivation —
which is why severity is supplied explicitly instead (see above).
"""

from __future__ import annotations

import re

#: Registered name; recorded as the `source` on the ingest run and therefore part of
#: every deterministic `event_id` (`evt-<sha256(source, source_record_id)>`).
#: **Never change this string** — doing so re-keys the entire archive and every row
#: would insert again as new instead of updating in place.
SOURCE = 'bgd-climatic-hazards'

#: Contract field ← source column. Renames only; no transforms.
COLUMN_MAP = {
    'source_record_id': 'Event_ID_Internal',
    'start_date': 'Date',
    'hazard_type': 'Hazard_Type',
    'adm2_name': 'District',
    'severity': 'Severity_Index',
}

#: Columns that exist in the source and are intentionally not carried into the
#: contract. Each is either a constant (see module docstring) or provenance that
#: `notes` already preserves.
UNMAPPED_COLUMNS = (
    'Severity_Score',        # constant 1.0
    'Severity_Index_Name',   # constant MODERATE_RISK
    'Validated_Affected',    # constant 0.0 — means "not recorded", not "none"
    'GEE_Start',             # retrieval window → notes
    'GEE_End',               # retrieval window → notes
    'GLIDE',                 # event key → notes
    'Latitude',              # → geom_geojson
    'Longitude',             # → geom_geojson
    'Data_Source',           # → notes
    'Confidence',            # → notes
    'Raw_Severity_Score',    # → notes
    'Requires_Manual_Review',  # → notes
    'Full_Description',      # → notes tail
)

#: Recorded as `severity_basis` so a page can state where the number came from
#: without implying HazardNet computed it.
SEVERITY_BASIS = 'archive:severity_index'

_TOKEN = re.compile(r'^[A-Za-z0-9._\-]+$')
_NOTE_TAIL_CHARS = 160


def _token(value) -> str | None:
    """A value safe to embed in `notes`. Returns None when unusable.

    The grammar is `key=value` with no whitespace, so a value containing a space
    (test fixtures do this) is dropped rather than escaped — a parseable token
    matters more than a marginal field.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text or not _TOKEN.match(text):
        return None
    return text


def _coordinate(value):
    """Parse a latitude/longitude into a float, or None. Values are not clipped."""
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number


def _geometry(row) -> str | None:
    """A GeoJSON Point for the row's coordinates, or None when they are unusable.

    Longitude first (GeoJSON is x,y). Coordinates are trusted as given: a point that
    lands outside Bangladesh is a data defect to be *reported* by the quality report,
    not silently moved here.
    """
    lat = _coordinate(row.get('Latitude'))
    lng = _coordinate(row.get('Longitude'))
    if lat is None or lng is None:
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return None
    return '{"type": "Point", "coordinates": [%r, %r]}' % (lng, lat)


def _notes(row) -> str | None:
    """The provenance token list described in NOTES GRAMMAR."""
    tokens = []
    glide = _token(row.get('GLIDE'))
    if glide:
        tokens.append(f'glide={glide}')

    gee_start = _token(row.get('GEE_Start'))
    gee_end = _token(row.get('GEE_End'))
    if gee_start and gee_end:
        tokens.append(f'gee={gee_start}..{gee_end}')

    for key, column in (
        ('src', 'Data_Source'),
        ('conf', 'Confidence'),
        ('raw', 'Raw_Severity_Score'),
        ('review', 'Requires_Manual_Review'),
    ):
        value = _token(row.get(column))
        if value:
            tokens.append(f'{key}={value}')

    if not tokens:
        tokens.append('adapter=bgd-climatic-hazards')

    tail = str(row.get('Full_Description') or '').strip()
    # Collapse whitespace: the descriptions are multi-paragraph markdown with
    # embedded newlines, and `notes` is a single-line audit field.
    tail = re.sub(r'\s+', ' ', tail)
    if tail and tail.lower() != 'no detailed description available.':
        tail = tail[:_NOTE_TAIL_CHARS]
        return f'{" ".join(tokens)} | {tail}'
    return ' '.join(tokens)


def adapt(records) -> list:
    """Translate raw archive rows into contract-shaped dicts.

    Every returned key is an `EVENT_COLUMNS` name or a contract alias
    `events.normalize_event()` already understands. Validation, district resolution,
    hazard classification and date parsing all happen downstream, unchanged.
    """
    out = []
    for row in records:
        if not isinstance(row, dict):
            continue
        mapped = {}
        for target, source in COLUMN_MAP.items():
            value = row.get(source)
            if value is not None and str(value).strip() != '':
                mapped[target] = str(value).strip()

        # A row with no id or no date cannot be validated downstream; emit it anyway
        # so the loader reports it as an error with a row number rather than the
        # adapter dropping it silently (silent dropout is the defect class the ETL
        # exists to remove).
        mapped.setdefault('source_record_id', '')
        mapped['source'] = SOURCE
        mapped['severity_basis'] = SEVERITY_BASIS

        notes = _notes(row)
        if notes:
            mapped['notes'] = notes
        geometry = _geometry(row)
        if geometry:
            mapped['geom_geojson'] = geometry

        out.append(mapped)
    return out
