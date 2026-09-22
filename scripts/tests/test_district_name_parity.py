#!/usr/bin/env python3
"""District-name parity between the pipeline and the website (Phase 2).

THE BUG THIS EXISTS TO PREVENT
------------------------------
The forecast pipeline labels districts with FAO GAUL 2015 spellings
(`Nawabganj`, `Chittagong`, `Comilla`, `Netrakona`, …) while the website's
district table uses current local spellings (`Chapainawabganj`, `Chattogram`,
`Cumilla`, `Netrokona`, …). The site bridges the two with an alias map in
`frontend/src/lib/forecasts.ts` — and a name that is missing from that map is
**silently dropped**: the district keeps rendering its static baseline numbers
while a real forecast for it sits unused in the store.

That is exactly what happened to Chapainawabganj (found 2026-09-17 while adding
coverage accounting): the pipeline emitted `Nawabganj`, no alias existed, and the
district's card never showed its forecast. Nothing failed — which is the point:
this class of mismatch is invisible without a test that joins the two name sets.

WHAT IT CHECKS
--------------
1. every district name the pipeline can emit (the canonical 64-name fixture list
   plus the names in the committed forecast CSV) resolves to a site district key
   after normalization + aliases;
2. the site's district table really does hold 64 districts;
3. no alias points at a key that does not exist (a typo'd alias silently
   un-alias-es a district);
4. the alias map and the alias-aware lookup stay in sync.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'tests'))

FORECAST_LIB = ROOT / 'frontend' / 'src' / 'lib' / 'forecasts.ts'
DISTRICT_TABLE = ROOT / 'frontend' / 'src' / 'data' / 'bangladeshDistricts.ts'
FORECAST_CSV = ROOT / 'backend' / 'data' / 'forecasts' / 'hazardnet_forecasts_latest.csv'

from make_fixture_csv import DISTRICTS as PIPELINE_DISTRICTS  # noqa: E402


def normalize(name: str) -> str:
    """The same normalization as frontend/src/lib/forecasts.ts::normalizeDistrictKey."""
    return re.sub(r'[^a-z0-9]', '', name.lower())


# Matches `{ id: 'coxsbazar', name: 'Cox\'s Bazar', … }` — the name may be in
# single or double quotes, and a single-quoted name may contain an escaped
# apostrophe (which is how the district table spells Cox's Bazar).
DISTRICT_ENTRY = re.compile(
    r"\{\s*id:\s*'[^']*',\s*name:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")"
)


def site_districts() -> list[str]:
    text = DISTRICT_TABLE.read_text(encoding='utf-8')
    array = text.split('ALL_64_DISTRICTS')[1].split('];')[0]
    return DISTRICT_ENTRY.findall(array)


def site_district_names() -> list[str]:
    # The runtime value is the unescaped name, so compare against that.
    return [(a or b).replace("\\'", "'") for a, b in site_districts()]


def aliases() -> dict[str, str]:
    text = FORECAST_LIB.read_text(encoding='utf-8')
    block = text.split('DISTRICT_NAME_ALIASES: Record<string, string> = {')[1].split('};')[0]
    pairs = re.findall(r"'?([A-Za-z0-9 ']+?)'?:\s*'([^']+)'", block)
    return {normalize(key): value for key, value in pairs}


def resolve(name: str, alias_map: dict[str, str]) -> str:
    key = normalize(name)
    return alias_map.get(key, key)


def pipeline_emitted_names() -> set[str]:
    names = set(PIPELINE_DISTRICTS)
    if FORECAST_CSV.exists():
        import csv

        with open(FORECAST_CSV, newline='', encoding='utf-8') as handle:
            names |= {row['district_name'].strip() for row in csv.DictReader(handle) if row.get('district_name')}
    return names


def test_site_district_table_holds_64_districts():
    names = site_district_names()
    assert len(names) == 64, f'expected 64 districts in the site table, found {len(names)}'
    assert len(set(names)) == 64, 'duplicate district names in the site table'


def test_every_pipeline_district_name_reaches_a_site_district():
    """A name the site cannot resolve is a forecast the site silently ignores."""
    alias_map = aliases()
    known = {normalize(name) for name in site_district_names()}

    unresolved = sorted(
        name for name in pipeline_emitted_names() if resolve(name, alias_map) not in known
    )
    assert not unresolved, (
        f'the pipeline can emit district names the site cannot match: {unresolved}. '
        'Add them to DISTRICT_NAME_ALIASES in frontend/src/lib/forecasts.ts '
        '(alias -> site district name) or the site will show those districts as baseline '
        'while their forecast sits unused.'
    )


def test_every_alias_targets_a_real_site_district():
    alias_map = aliases()
    known = {normalize(name) for name in site_district_names()}
    dangling = sorted({target for target in alias_map.values() if target not in known})
    assert not dangling, (
        f'DISTRICT_NAME_ALIASES point at keys with no district in the site table: {dangling}. '
        'A dangling alias un-aliases the district it was meant to fix.'
    )


def test_gaul_spellings_stay_aliased():
    """The specific spellings this repo has been bitten by."""
    alias_map = aliases()
    for alias, expected in {
        'nawabganj': 'chapainawabganj',
        'chittagong': 'chattogram',
        'comilla': 'cumilla',
        'netrakona': 'netrokona',
        'maulvibazar': 'moulvibazar',
        'brahamanbaria': 'brahmanbaria',
    }.items():
        assert alias_map.get(alias) == expected, (
            f"the '{alias}' -> '{expected}' alias is gone; forecasts labelled with the GAUL "
            'spelling will not match that district on the site'
        )


def test_alias_lookup_is_used_by_the_index_and_rollup():
    """The alias map is only useful if the join paths actually call it."""
    text = FORECAST_LIB.read_text(encoding='utf-8')
    assert text.count('canonicalKey(') >= 2, (
        'canonicalKey is not used by both buildForecastIndex and rollupAdm3ToDistricts — '
        'an alias-aware key on only one path still drops the other path\'s districts'
    )
