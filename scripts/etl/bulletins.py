#!/usr/bin/env python3
"""BMD warning bulletins → structured advisories.

WHY
---
The Bangladesh Meteorological Department publishes the authoritative warnings for
cyclones, heavy rainfall, heat and cold waves as prose bulletins (and PDFs). They
are the closest thing to ground truth that exists *before* an event, which makes
them valuable twice over:

  * as the `w3`-adjacent official stream beside the model and the physics proxies;
  * as a **ground-truth feedback loop** (the roadmap's fifth project-killer):
    if BMD warned of heavy rainfall for Sylhet and the model called a heat wave,
    that disagreement is training signal, and today nothing anywhere records it.

WHAT THIS MODULE DOES AND DOES NOT DO
-------------------------------------
It parses the *text* of a bulletin into a structured record: bulletin id, issue
time, headline, hazard classes, maritime signal numbers, meteorological drivers,
validity window, and the districts named. It then turns that into per-district
advisory records with a severity — derived from a documented mapping of the
bulletin's own numbers (signal number, wind speed, rainfall, temperature) via the
tested physics formulas where one exists.

It does **not** guess. A bulletin naming no district is recorded as `scope:
national` with an empty district list, and the CLI reports how many bulletins
could not be localised — inventing district coverage from a national warning would
be exactly the kind of fabrication this project has spent Phase 0 and 2 removing.
An unparseable severity stays `None` with the driver text preserved.

No network, no database, standard library only.
"""

from __future__ import annotations

import hashlib
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from physics_severity import (  # noqa: E402
    HAZARD_CLASSES,
    om_calc_cold_wave,
    om_calc_heat_wave,
    om_calc_severe_storm,
    om_calc_tropical_cyclone,
)

from districts import ALIASES as DISTRICT_ALIASES  # noqa: E402
from districts import NAMES as DISTRICT_NAMES  # noqa: E402
from districts import resolve as resolve_district  # noqa: E402

#: Keyword → hazard class. Ordered: the first match wins, and the more specific
#: phrases come first ("flash flood" before "flood", "storm surge" before "storm").
KEYWORD_HAZARDS = (
    ('flash flood', 'Flash Flood'),
    ('flash-flood', 'Flash Flood'),
    ('heavy rainfall', 'Flash Flood'),
    ('heavy rain', 'Flash Flood'),
    ('heavy to very heavy', 'Flash Flood'),
    ('torrential', 'Flash Flood'),
    ('storm surge', 'Tropical Cyclone'),
    ('cyclone', 'Tropical Cyclone'),
    ('depression over', 'Tropical Cyclone'),
    ('river flood', 'Flood'),
    ('flood', 'Flood'),
    ('drought', 'Drought'),
    ('heat wave', 'Heat Wave'),
    ('heatwave', 'Heat Wave'),
    ('cold wave', 'Cold Wave'),
    ('coldwave', 'Cold Wave'),
    ('cold spell', 'Cold Wave'),
    ('wildfire', 'Fire'),
    ('forest fire', 'Fire'),
    ('norwester', "Severe Local Storm"),
    ("nor'wester", 'Severe Local Storm'),
    ('thunderstorm', 'Severe Local Storm'),
    ('lightning', 'Severe Local Storm'),
    ('hailstorm', 'Severe Local Storm'),
    ('hail', 'Severe Local Storm'),
    ('squall', 'Severe Local Storm'),
)

#: Interpretations this parser makes, surfaced in the run report so a reviewer can
#: see them rather than having to read the code. Maps key → explanation.
INTERPRETATIONS = {
    'heavy rainfall → Flash Flood': (
        'BMD heavy-rainfall warnings are the operational trigger for flash flooding in the '
        'hills and the northern districts; classified as Flash Flood because that is the '
        'warning a user needs. The original label is preserved in `headline`.'
    ),
    'signal → severity': (
        'Maritime/land warning signal numbers are mapped to severity by a fixed table '
        '(see SIGNAL_SEVERITY). The signal number itself is preserved per advisory.'
    ),
}

#: BMD maritime warning signals → severity. Signals 1–3 are advisory, 4–6 warning,
#: 7–10 danger/great danger. The table is monotonic and saturates.
SIGNAL_SEVERITY = {
    1: 0.30, 2: 0.35, 3: 0.40, 4: 0.50, 5: 0.55,
    6: 0.60, 7: 0.75, 8: 0.85, 9: 0.92, 10: 1.00,
}

MONTHS = ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec')
MONTH_INDEX = {name: i + 1 for i, name in enumerate(MONTHS)}
# BMD writes both "15 June 2026" and "15 Jun. 2026" — the alternation has to accept
# the full month name, not just the three-letter form: matching only "jun" and then
# requiring a comma left "June" unparsed, so every bulletin's issue time silently
# fell back to its receipt time (midnight) instead of the time printed on it.
MONTH_PATTERN = ('jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|'
                 'aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?')

SIGNAL_RE = re.compile(r'(?:danger\s+)?signal\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{1,2})', re.I)
WIND_RE = re.compile(r'(\d{2,3})\s*(?:km/?h|kmph|kph|kilomet(?:er|re)s?\s+per\s+hour)', re.I)
WIND_KNOTS_RE = re.compile(r'(\d{2,3})\s*(?:knots?|kt)', re.I)
RAIN_RE = re.compile(r'(\d{2,4})\s*(?:mm|millimet(?:er|re)s?)\b', re.I)
TEMP_RE = re.compile(r'(-?\d{1,2}(?:\.\d)?)\s*(?:°|deg(?:ree)?s?\s*)?\s*C\b', re.I)
HOURS_RE = re.compile(r'(?:next|valid\s+for|for\s+the\s+next)\s+(\d{1,3})\s*(?:hours|hrs)', re.I)
DAYS_RE = re.compile(r'(?:next|valid\s+for)\s+(\d{1,2})\s*days?', re.I)
DATE_RE = re.compile(r'(\d{1,2})\s*(?:st|nd|rd|th)?\s+(' + MONTH_PATTERN + r')\.?,?\s*(\d{4})?', re.I)
DATETIME_RE = re.compile(
    r'(\d{1,2})\s*(?:st|nd|rd|th)?\s+(' + MONTH_PATTERN + r')\.?,?\s*(\d{4})?[,\s]+'
    r'(\d{1,2})[:.](\d{2})\s*(am|pm|AM|PM)?', re.I
)
# The bulletin number is always numeric ("Bulletin No. 8"), and the whitespace
# between the words must not cross a line break: allowing `\s*` there made
# "Special Weather Bulletin\nDate: 15 June 2026" parse the *date label* as the
# bulletin number.
BULLETIN_NO_RE = re.compile(r'bulletin[ \t]*(?:no\.?|number)?[ \t]*[:#-]?[ \t]*(\d{1,4}(?:[/\-]\d{1,4})*)', re.I)
# Some bulletins lead with a message reference instead (e.g. "METEO/AC/15/2026").
REFERENCE_RE = re.compile(r'^[ \t]*([A-Z]{2,}(?:[/\-][A-Z0-9]{1,6}){1,5})[ \t]*$', re.M)
DIVISION_RE = re.compile(
    r'\b(Barisal|Barishal|Chattogram|Chittagong|Dhaka|Khulna|Mymensingh|Rajshahi|Rangpur|Sylhet)\b', re.I
)

RECORD_COLUMNS = (
    'advisory_id', 'bulletin_id', 'district', 'hazard_type', 'severity', 'severity_basis',
    'signal', 'scope', 'issued_at', 'valid_from', 'valid_until', 'headline',
    'source', 'source_url', 'source_record_id', 'confidence_kind', 'raw_text_sha256',
)


class BulletinError(ValueError):
    """Raised for input that is not a parseable bulletin."""


def _issue_datetime(text: str, *, received_at: datetime = None) -> datetime:
    """Pull the issue time out of the bulletin text, else fall back to receipt time."""
    match = DATETIME_RE.search(text)
    received_at = received_at or datetime.now(timezone.utc)
    if not match:
        date_match = DATE_RE.search(text)
        if not date_match:
            return received_at
        day, month_name, year = date_match.groups()
        month = MONTH_INDEX[month_name.lower()[:3]]
        return datetime(int(year) if year else received_at.year, month, int(day), tzinfo=timezone.utc)
    day, month_name, year, hour, minute, meridiem = match.groups()
    month = MONTH_INDEX[month_name.lower()[:3]]
    hour = int(hour)
    if meridiem:
        hour = hour % 12 + (12 if meridiem.lower() == 'pm' else 0)
    return datetime(int(year) if year else received_at.year, month, int(day), hour, int(minute), tzinfo=timezone.utc)


def find_districts(text: str) -> tuple:
    """Districts named in the text, plus the spellings that were used.

    Matching is word-boundary based over canonical names and the GAUL aliases, so
    `Nawabganj` and `Chapainawabganj` both resolve to one district.
    """
    found, spellings = [], {}
    lowered = text.lower()
    for name in DISTRICT_NAMES:
        if re.search(r'\b' + re.escape(name.lower()) + r'\b', lowered):
            found.append(name)
            spellings[name] = name
    for alias, canonical in DISTRICT_ALIASES.items():
        if re.search(r'\b' + re.escape(alias) + r'\b', lowered) and canonical not in found:
            found.append(canonical)
            spellings[canonical] = alias
    return sorted(set(found)), spellings


def find_hazards(text: str) -> list:
    """Hazard classes named in the text, in KEYWORD_HAZARDS priority order.

    Matched spans are consumed as they are claimed, so a longer, more specific
    phrase keeps its text: "flash flood" must yield *Flash Flood* alone, not
    Flash Flood **and** Flood because the word "flood" also appears inside it.
    Mis-classifying an official flash-flood warning as riverine flooding would
    change the alert a user sees, so the specificity rule is enforced here rather
    than left to whichever keyword happens to be checked last.
    """
    lowered = text.lower()
    consumed = []
    found, seen = [], set()

    def _overlaps(start, end):
        return any(start < used_end and end > used_start for used_start, used_end in consumed)

    for keyword, hazard in KEYWORD_HAZARDS:
        if hazard in seen:
            continue
        spans = [match.span() for match in re.finditer(re.escape(keyword), lowered)
                 if not _overlaps(*match.span())]
        if spans:
            found.append(hazard)
            seen.add(hazard)
            consumed.extend(spans)
    return found


def parse_bulletin(text: str, *, source: str = 'bmd', source_url: str = None,
                   received_at: datetime = None, source_record_id: str = None) -> dict:
    """Parse one bulletin into a structured record (never raises on format drift)."""
    if not text or not text.strip():
        raise BulletinError('bulletin text is empty')
    digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
    issued = _issue_datetime(text, received_at=received_at)

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    hazards = find_hazards(text)
    headline = next(
        (line for line in lines if any(hazard.lower() in line.lower() or _keyword(line) for hazard in hazards)),
        lines[0] if lines else '',
    )

    bulletin_no = BULLETIN_NO_RE.search(text)
    reference = REFERENCE_RE.search(text)
    if reference:
        identifier, id_basis = reference.group(1).replace('/', '-'), 'message reference'
    elif bulletin_no:
        identifier, id_basis = bulletin_no.group(1), 'bulletin number'
    else:
        identifier, id_basis = digest[:12], 'content hash'
    signals = sorted({int(value) for value in SIGNAL_RE.findall(text)})
    districts, spellings = find_districts(text)
    divisions = sorted({match.group(1).title() for match in DIVISION_RE.finditer(text)})

    wind_kmh = None
    wind_match = WIND_RE.search(text)
    if wind_match:
        wind_kmh = float(wind_match.group(1))
    else:
        knots_match = WIND_KNOTS_RE.search(text)
        if knots_match:
            wind_kmh = round(float(knots_match.group(1)) * 1.852, 1)

    rainfall = RAIN_RE.search(text)
    temperature = TEMP_RE.search(text)

    hours_match = HOURS_RE.search(text)
    days_match = DAYS_RE.search(text)
    if hours_match:
        validity_hours = int(hours_match.group(1))
    elif days_match:
        validity_hours = int(days_match.group(1)) * 24
    else:
        validity_hours = None

    drivers = {
        'wind_kmh': wind_kmh,
        'rainfall_mm': float(rainfall.group(1)) if rainfall else None,
        'temperature_c': float(temperature.group(1)) if temperature else None,
        'signal': signals[-1] if signals else None,
        'validity_hours': validity_hours,
    }

    record = {
        'bulletin_id': f'bmd-{identifier}',
        'bulletin_id_basis': id_basis,
        'source': source,
        'source_url': source_url,
        'source_record_id': source_record_id or f'bmd-{digest[:16]}',
        'raw_text_sha256': digest,
        'issued_at': issued.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'headline': headline,
        'hazards': hazards,
        'signals': signals,
        'districts': districts,
        'district_spellings': spellings,
        'divisions': divisions,
        'scope': 'district' if districts else 'national',
        'drivers': drivers,
        'valid_until': (issued + timedelta(hours=validity_hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
                       if validity_hours else None,
    }
    record['severity'], record['severity_basis'] = severity_for(record)
    return record


def _keyword(line: str) -> bool:
    lowered = line.lower()
    return any(keyword in lowered for keyword, _ in KEYWORD_HAZARDS)


def severity_for(bulletin: dict) -> tuple:
    """Severity + the basis string that produced it (or `(None, None)`).

    Every candidate is computed from the bulletin's own numbers using the same
    formulas as the live physics track, so an advisory's severity is on the same
    scale as `physics_severity`. The max wins, and the basis records which driver
    it came from.
    """
    drivers = bulletin.get('drivers') or {}
    hazard = (bulletin.get('hazards') or [None])[0]
    candidates = []

    signal = drivers.get('signal')
    if signal in SIGNAL_SEVERITY:
        candidates.append((SIGNAL_SEVERITY[signal], f'signal={signal}'))

    wind = drivers.get('wind_kmh')
    if wind:
        if hazard == 'Tropical Cyclone' or (signal and signal >= 4):
            candidates.append((om_calc_tropical_cyclone(wind, drivers.get('rainfall_mm') or 0.0),
                               f'wind_speed_kmh={wind:g}'))
        else:
            candidates.append((om_calc_severe_storm(drivers.get('rainfall_mm') or 0.0, wind),
                               f'wind_speed_kmh={wind:g}'))

    rainfall = drivers.get('rainfall_mm')
    if rainfall and hazard in ('Flash Flood', 'Flood'):
        candidates.append((min(rainfall / 300.0, 1.0), f'rainfall_mm={rainfall:g}'))

    temperature = drivers.get('temperature_c')
    if temperature is not None:
        hours = drivers.get('validity_hours') or 24
        duration_days = max(hours / 24.0, 1.0)
        if hazard == 'Cold Wave':
            candidates.append((om_calc_cold_wave(temperature, duration_days), f'temp_min_c={temperature:g}'))
        elif hazard == 'Heat Wave':
            candidates.append((om_calc_heat_wave(temperature, duration_days), f'temp_max_c={temperature:g}'))

    if not candidates:
        return None, None
    score, basis = max(candidates, key=lambda row: row[0])
    return round(float(score), 4), basis


def to_advisories(bulletin: dict, *, fallback_districts=None) -> list:
    """Per-district advisories. A national bulletin yields one advisory with district None.

    `fallback_districts` lets a caller say "this bulletin covers these districts"
    (e.g. from the issuing office's area), but the default is to record the
    absence: an advisory without a district must not silently become nationwide.
    """
    hazards = [hazard for hazard in (bulletin.get('hazards') or []) if hazard in HAZARD_CLASSES]
    if not hazards:
        return []
    districts = bulletin.get('districts') or list(fallback_districts or [])
    targets = districts or [None]
    advisories = []
    for hazard in hazards:
        for district in targets:
            advisories.append({
                'advisory_id': f"{bulletin['bulletin_id']}:{hazard}:{district or 'national'}",
                'bulletin_id': bulletin['bulletin_id'],
                'district': district,
                'hazard_type': hazard,
                'severity': bulletin.get('severity'),
                'severity_basis': bulletin.get('severity_basis'),
                'signal': (bulletin.get('signals') or [None])[-1],
                'scope': bulletin.get('scope'),
                'issued_at': bulletin.get('issued_at'),
                'valid_from': bulletin.get('issued_at'),
                'valid_until': bulletin.get('valid_until'),
                'headline': bulletin.get('headline'),
                'source': bulletin.get('source'),
                'source_url': bulletin.get('source_url'),
                'source_record_id': bulletin.get('source_record_id'),
                'confidence_kind': 'official_bulletin',
                'raw_text_sha256': bulletin.get('raw_text_sha256'),
            })
    return advisories


def load_bulletins(path) -> list:
    """Read a bulletin file: `.txt` (one bulletin), `.json` (list of strings or objects)."""
    import json

    source = Path(path)
    text = source.read_text(encoding='utf-8')
    if source.suffix.lower() == '.json':
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            parsed = parsed.get('bulletins') or parsed.get('records') or [parsed]
        return [
            item if isinstance(item, str) else (item.get('text') or item.get('body') or '')
            for item in parsed
        ]
    return [text]


def summarize(bulletins: list) -> dict:
    """Counts a workflow log can act on, including what could not be localised."""
    localised = [b for b in bulletins if b.get('scope') == 'district']
    unlocalised = [b for b in bulletins if b.get('scope') != 'district']
    no_severity = [b for b in bulletins if b.get('severity') is None]
    advisories = [advisory for bulletin in bulletins for advisory in to_advisories(bulletin)]
    by_district = {}
    for advisory in advisories:
        if advisory['district']:
            by_district[advisory['district']] = by_district.get(advisory['district'], 0) + 1
    return {
        'bulletins': len(bulletins),
        'localised': len(localised),
        'national_scope': len(unlocalised),
        'without_severity': len(no_severity),
        'advisories': len(advisories),
        'advisories_by_district': dict(sorted(by_district.items())),
        'hazards': sorted({hazard for bulletin in bulletins for hazard in bulletin.get('hazards', [])}),
        'interpretations': INTERPRETATIONS,
    }


def merge_into_rows(rows, bulletins, *, now=None) -> dict:
    """Attach official advisories to forecast rows in place.

    `official_hazard` / `official_severity` are null when no bulletin named the
    district. `model_agrees_with_official` is the disagreement signal the roadmap
    asks for as a training feedback loop — computed only when both sides exist, so
    an absent official warning never reads as agreement.
    """
    advisories = [advisory for bulletin in bulletins for advisory in to_advisories(bulletin)]
    by_district = {}
    for advisory in advisories:
        if not advisory['district']:
            continue
        entry = by_district.setdefault(advisory['district'], {'hazards': [], 'severity': None, 'evidence': []})
        entry['hazards'].append(advisory['hazard_type'])
        entry['evidence'].append(advisory)
        if advisory['severity'] is not None:
            entry['severity'] = max(entry['severity'] or 0.0, advisory['severity'])

    matched = 0
    agreement_true = agreement_false = 0
    for row in rows:
        district = resolve_district(row.get('district_name') or row.get('adm2_name'))
        entry = by_district.get(district) if district else None
        if entry:
            matched += 1
            official_hazards = sorted(set(entry['hazards']))
            row['official_hazards'] = '|'.join(official_hazards)
            row['official_severity'] = entry['severity']
            row['official_bulletin_id'] = entry['evidence'][-1]['bulletin_id']
            agrees = row.get('hazard_type') in official_hazards
            row['model_agrees_with_official'] = bool(agrees)
            agreement_true += 1 if agrees else 0
            agreement_false += 0 if agrees else 1
        else:
            row['official_hazards'] = None
            row['official_severity'] = None
            row['model_agrees_with_official'] = None
    return {
        'stream': 'w3-official-bulletins',
        'bulletins': len(bulletins),
        'advisories': len(advisories),
        'districts_with_official_warning': len(by_district),
        'rows_matched': matched,
        'model_agrees_with_official': agreement_true,
        'model_disagrees_with_official': agreement_false,
        'interpretations': INTERPRETATIONS,
    }
