#!/usr/bin/env python3
"""The Phase 8 content engine: what it may publish, and what it must refuse to.

WHAT THESE TESTS ARE GUARDING
-----------------------------
The content engine (`scripts/build_content_engine.mjs`) turns committed artifacts into the
hazard-methodology pages, the 64 district outlooks and the season retrospectives. Two failure
modes would be worse than having no content pages at all:

1. **Copy that drifts from the code.** Each hazard page publishes the formula its physics
   cross-check uses. If `scripts/physics_severity.py` changes and the published expression does
   not, the site teaches a formula the pipeline no longer runs. The `expr` field in
   `frontend/src/content/hazard-methodology.json` is therefore *executed* here against the real
   Python functions for a grid of driver vectors — not compared as text.

2. **A statistic that was invented.** `docs/MODEL_CARD.md` §4 quotes 2,931 historical events
   (2000–2025) and that archive is not in this repository. The engine must never print a
   per-district or per-year event count it did not read from a loaded archive, and when an archive
   *is* loaded it must print the drift against the claim beside the count. Both paths are executed
   here: once with no archive, once with the ETL's own export of the fixture events.

The hazard vocabulary is pinned to `scripts/physics_severity.HAZARD_CLASSES` for the same reason
`scripts/tests/test_physics_severity.py` pins the physics: eight classes is the model's whole output
vocabulary, and a page that invents a ninth would describe a hazard the model cannot emit.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import physics_severity  # noqa: E402

METHODOLOGY = ROOT / 'frontend' / 'src' / 'content' / 'hazard-methodology.json'
ATTRIBUTION = ROOT / 'frontend' / 'src' / 'content' / 'attribution.json'
GENERATED = ROOT / 'frontend' / 'src' / 'content' / 'generated-routes.json'
DISTRICT_TABLE = ROOT / 'frontend' / 'src' / 'data' / 'bangladeshDistricts.ts'
ENGINE = ROOT / 'scripts' / 'build_content_engine.mjs'
ETL_CLI = ROOT / 'scripts' / 'etl' / 'cli.py'
FIXTURE_EVENTS = ROOT / 'scripts' / 'tests' / 'fixtures' / 'etl' / 'events_sample.csv'

# The public expressions are written with named driver symbols; this maps each hazard to the
# physics function it claims to implement and the argument order that function expects.
PHYSICS_BINDINGS = {
    'Flood': (physics_severity.om_calc_flood, ('P_total', 'P_peak')),
    'Flash Flood': (physics_severity.om_calc_flood, ('P_total', 'P_peak')),
    'Tropical Cyclone': (physics_severity.om_calc_tropical_cyclone, ('W', 'P_total')),
    'Drought': (physics_severity.om_calc_drought, ('T_max', 'P_total')),
    'Heat Wave': (physics_severity.om_calc_heat_wave, ('T_max', 'duration')),
    'Cold Wave': (physics_severity.om_calc_cold_wave, ('T_min', 'duration')),
    'Fire': (physics_severity.om_calc_fire, ('T_max', 'W', 'ET')),
    'Severe Local Storm': (physics_severity.om_calc_severe_storm, ('P_peak', 'W')),
}

# Driver vectors chosen to exercise each formula's clamp boundaries as well as its interior: the
# 16 °C cold-wave threshold, the 50 km/h wind floors, the 300 mm / 100 mm rainfall denominators.
DRIVER_VECTORS = [
    {'P_total': 0.0, 'P_peak': 0.0, 'W': 0.0, 'T_max': 20.0, 'T_min': 20.0, 'ET': 0.0, 'duration': 1.0},
    {'P_total': 300.0, 'P_peak': 100.0, 'W': 50.0, 'T_max': 30.0, 'T_min': 16.0, 'ET': 6.0, 'duration': 5.0},
    {'P_total': 120.0, 'P_peak': 60.0, 'W': 90.0, 'T_max': 38.5, 'T_min': 9.5, 'ET': 4.2, 'duration': 3.0},
    {'P_total': 900.0, 'P_peak': 400.0, 'W': 220.0, 'T_max': 45.0, 'T_min': -2.0, 'ET': 12.0, 'duration': 9.0},
]


def clip(value):
    """`scripts/physics_severity._clip` — the published expression's one non-arithmetic term."""
    return max(0.0, min(1.0, float(value)))


def load_methodology():
    return json.loads(METHODOLOGY.read_text(encoding='utf-8'))


def run_engine(*args, tmp_path=None):
    """Run the engine and return its parsed output document."""
    out = (tmp_path or ROOT) / 'generated-routes.test.json'
    result = subprocess.run(
        ['node', str(ENGINE), *args, '--out', str(out)],
        capture_output=True, text=True, cwd=ROOT, check=False,
    )
    assert result.returncode == 0, f'engine failed: {result.stdout}\n{result.stderr}'
    return json.loads(out.read_text(encoding='utf-8'))


def make_archive(tmp_path):
    """A normalised export of the fixture events, produced by the ETL itself."""
    export = tmp_path / 'hazardnet-events.json'
    result = subprocess.run(
        [sys.executable, '-m', 'etl.cli', 'events', '--input', str(FIXTURE_EVENTS),
         '--export-json', str(export), '--run-id', 'content-engine-test'],
        capture_output=True, text=True, cwd=ROOT / 'scripts', check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return export


# ── 1. the copy cannot drift from the physics it describes ───────────────────


def test_every_published_hazard_is_one_of_the_models_eight_classes():
    published = {entry['class'] for entry in load_methodology()['hazards']}
    assert published == set(physics_severity.HAZARD_CLASSES), (
        'the hazard pages must cover exactly the model vocabulary: '
        f'missing={set(physics_severity.HAZARD_CLASSES) - published} extra={published - set(physics_severity.HAZARD_CLASSES)}'
    )


def test_every_published_slug_is_unique_and_url_safe():
    slugs = [entry['slug'] for entry in load_methodology()['hazards']]
    assert len(slugs) == len(set(slugs))
    for slug in slugs:
        assert re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', slug), slug


@pytest.mark.parametrize('entry', load_methodology()['hazards'], ids=lambda e: e['slug'])
def test_the_published_formula_is_the_one_the_code_runs(entry):
    """Execute the published `expr` against `scripts/physics_severity.py` itself."""
    function, variables = PHYSICS_BINDINGS[entry['class']]
    expr = entry['physics']['expr']
    for drivers in DRIVER_VECTORS:
        published = eval(expr, {'__builtins__': {}}, {'clip': clip, **drivers})  # noqa: S307
        actual = function(*(drivers[name] for name in variables))
        assert published == pytest.approx(actual, abs=1e-9), (
            f'{entry["class"]}: published expr {expr!r} gives {published} but '
            f'{function.__name__}{variables} gives {actual} for {drivers}'
        )


@pytest.mark.parametrize('entry', load_methodology()['hazards'], ids=lambda e: e['slug'])
def test_every_hazard_page_states_its_limits_and_its_inputs(entry):
    for field in ('model', 'confidence', 'season', 'summary'):
        assert isinstance(entry.get(field), str) and entry[field].strip(), f'{entry["slug"]}: {field}'
    assert len(entry['limits']) >= 2, f'{entry["slug"]}: needs at least two stated limits'
    assert entry['sources'], f'{entry["slug"]}: must name its inputs'
    assert entry['physics']['form'].strip() and entry['physics']['note'].strip()


def test_the_methodology_copy_never_quotes_a_historical_count():
    """2,931 belongs to the model card and to the pages' honesty framing — not to the copy."""
    raw = METHODOLOGY.read_text(encoding='utf-8')
    assert '2,931' not in raw and '2931' not in raw
    assert not re.search(r'\b\d{3,}\s+(?:recorded\s+)?events\b', raw)


# ── 2. attribution is exact, because it is the project's identity ────────────


def test_attribution_carries_the_required_identifiers_verbatim():
    attribution = json.loads(ATTRIBUTION.read_text(encoding='utf-8'))
    assert attribution['author'] == {
        'name': 'Ashif Ahmed Shuvo',
        'orcid': '0009-0003-5734-1519',
        'orcidUrl': 'https://orcid.org/0009-0003-5734-1519',
        'github': 'https://github.com/myself-aas',
        'linkedin': 'https://www.linkedin.com/in/me-aas',
        'x': 'https://x.com/myself_aas',
        'role': "Master's thesis author",
    }
    assert attribution['supervisor']['name'] == 'Dr. Ahmed Khairul Hasan'
    assert attribution['supervisor']['url'] == 'https://bau.edu.bd/profile/AGRON1013'
    assert attribution['coSupervisor']['url'] == 'https://csm.bau.edu.bd/teachers/CSM1007'
    assert attribution['department']['name'] == 'Department of Agrometeorology'
    assert attribution['work']['repository'] == 'https://github.com/myself-aas/HazardNet'


def test_citation_file_matches_the_attribution_block():
    citation = (ROOT / 'CITATION.cff').read_text(encoding='utf-8')
    attribution = json.loads(ATTRIBUTION.read_text(encoding='utf-8'))
    assert attribution['author']['orcidUrl'] in citation
    assert attribution['work']['repository'] in citation
    assert 'HazardNet' in citation
    # CFF stores the name in two fields, so both parts must appear.
    for required in ('Ashif Ahmed', 'Shuvo', 'Bangladesh Agricultural University', 'Ahmed Khairul Hasan'):
        assert required in citation, required


# ── 3. the district table is the app's, not a second copy ────────────────────


def test_the_engine_reads_all_sixty_four_districts_from_the_app_table():
    source = DISTRICT_TABLE.read_text(encoding='utf-8')
    ids = re.findall(r"\{ id: '([a-z0-9]+)'", source)
    assert len(ids) == 64, len(ids)
    assert len(set(ids)) == 64
    for expected in ('bhola', 'kurigram', 'coxsbazar', 'jessore', 'bandarban'):
        assert expected in ids


# ── 4. what the engine publishes when it has no archive (the committed state) ─


@pytest.fixture(scope='module')
def archive_free(tmp_path_factory):
    return run_engine('--no-events', tmp_path=tmp_path_factory.mktemp('noarchive'))


@pytest.fixture(scope='module')
def with_archive(tmp_path_factory):
    tmp = tmp_path_factory.mktemp('archive')
    return run_engine('--events', str(make_archive(tmp)), tmp_path=tmp)


def test_the_committed_routes_describe_the_committed_inputs():
    """`--check` is the drift gate CI runs; it must pass on the committed file."""
    result = subprocess.run(
        ['node', str(ENGINE), '--check'], capture_output=True, text=True, cwd=ROOT, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_without_an_archive_no_page_claims_a_historical_count(archive_free):
    districts = [r for r in archive_free['routes'] if r['path'].startswith('/districts/')]
    assert len(districts) == 64
    assert archive_free['counts']['retrospectives'] == 0
    assert not [r for r in archive_free['routes'] if r['path'].startswith('/retrospectives')]
    for route in districts:
        section = next(s for s in route['sections'] if s['h2'] == 'Recorded hazard history')
        text = ' '.join(section.get('paragraphs', []))
        assert 'no event archive loaded' in text, route['path']
        assert 'reported rather than verified' in text, route['path']
        for paragraph in section.get('paragraphs', []):
            assert not re.search(r'\b\d+\s+recorded events?\b', paragraph), (route['path'], paragraph)
        assert not section.get('bullets'), f'{route.path} must not list events it does not have'


def test_without_an_archive_the_history_section_cites_the_claim_and_does_not_assert_it(archive_free):
    route = next(r for r in archive_free['routes'] if r['path'] == '/districts/bhola')
    section = next(s for s in route['sections'] if s['h2'] == 'Recorded hazard history')
    text = ' '.join(section['paragraphs'])
    assert '2,931' in text
    assert 'states no historical count' in text


def test_the_district_pages_follow_the_coverage_the_snapshot_reports(archive_free):
    snapshot = json.loads((ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json').read_text())
    covered = snapshot['coverage']['districts_covered']
    with_outlook = archive_free['counts']['districts_with_outlook']
    assert with_outlook == covered, (
        f'{with_outlook} district pages carry an outlook but the snapshot reports {covered} districts '
        'covered — the pages and the coverage stamp must not disagree'
    )
    noindex = [r for r in archive_free['routes'] if r['path'].startswith('/districts/') and r['robots'].startswith('noindex')]
    assert len(noindex) == 64 - covered
    for route in noindex:
        assert route['sitemap'] is None, f'{route["path"]} is noindex and must stay out of the sitemap'
        assert 'carries no row' in route['standfirst']


def test_the_engine_reports_snapshot_names_it_could_not_match(archive_free):
    """A district the app knows but the snapshot spells differently must not vanish silently."""
    assert archive_free['unmatched_snapshot_districts'] == []


def test_every_generated_route_is_indexable_or_deliberately_not(archive_free):
    for route in archive_free['routes']:
        assert route['robots'] in ('index,follow', 'noindex,follow'), route['path']
        assert (route['sitemap'] is None) == route['robots'].startswith('noindex'), route['path']
        assert route['title'] and route['description'] and route['h1']
        hint = route.get('structuredData')
        assert hint is None or 'place' in hint, route['path']


# ── 5. what the engine publishes when an archive is loaded ───────────────────


def test_a_loaded_archive_produces_retrospectives_and_district_history(with_archive):
    years = [r['path'] for r in with_archive['routes'] if re.fullmatch(r'/retrospectives/\d{4}', r['path'])]
    assert '/retrospectives' in [r['path'] for r in with_archive['routes']]
    assert years, 'a loaded archive must produce at least one year page'
    assert with_archive['counts']['retrospectives'] == len(years)

    sylhet = next(r for r in with_archive['routes'] if r['path'] == '/districts/sylhet')
    section = next(s for s in sylhet['sections'] if s['h2'].startswith('Recorded hazard history'))
    text = ' '.join(section['paragraphs'])
    assert 'recorded event' in text
    assert 'drift' in text and '2,931' in text, 'the count must be published with its drift'


def test_a_loaded_archive_states_its_own_drift_rather_than_the_claim(with_archive):
    index = next(r for r in with_archive['routes'] if r['path'] == '/retrospectives')
    text = ' '.join(' '.join(s.get('paragraphs', [])) for s in index['sections'])
    assert 'the measured number is used here' in text
    assert re.search(r'drift [+-]\d+', text)


def test_retrospective_pages_say_what_they_cannot_measure(with_archive):
    year = next(r for r in with_archive['routes'] if re.fullmatch(r'/retrospectives/\d{4}', r['path']))
    text = ' '.join(' '.join(s.get('paragraphs', [])) for s in year['sections'])
    bullets = ' '.join(b for s in year['sections'] for b in s.get('bullets', []))
    assert 'unknown rather than zero' in bullets
    assert 'event-district pairs' in bullets
    assert 'hindcast' in text


def test_an_archive_page_publishes_the_dataset_it_actually_has(with_archive):
    year = next(r for r in with_archive['routes'] if re.fullmatch(r'/retrospectives/\d{4}', r['path']))
    dataset = year['structuredData']['dataset']
    assert dataset['kind'] == 'event-archive'
    assert dataset['temporalCoverage'].startswith(year['path'].rsplit('/', 1)[-1])


def test_the_archive_path_is_printed_as_the_operator_gave_it(with_archive):
    index = next(r for r in with_archive['routes'] if r['path'] == '/retrospectives')
    text = ' '.join(' '.join(s.get('paragraphs', [])) for s in index['sections'])
    assert '/hazardnet-events.json' in text or 'hazardnet-events.json' in text


# ── 6. the export the content engine consumes is the loader's own ────────────


def test_the_etl_export_is_normalised_rows_with_the_claim_beside_them(tmp_path):
    export = make_archive(tmp_path)
    payload = json.loads(export.read_text(encoding='utf-8'))
    assert payload['schema'] == 'hazardnet-events-export/v1'
    assert payload['claimed_total'] == 2931
    assert payload['ingested'] == len(payload['events'])
    assert payload['drift'] == payload['ingested'] - 2931
    for event in payload['events']:
        assert set(event) >= {'event_id', 'hazard_type', 'start_date', 'adm2_name', 'severity'}
        assert event['hazard_type'] in physics_severity.HAZARD_CLASSES


def test_the_archive_is_not_committed_and_says_why():
    """The compiled archive is not redistributed; the directory explains that and is ignored."""
    readme = (ROOT / 'data' / 'events' / 'README.md').read_text(encoding='utf-8')
    assert 'not redistributed' in readme
    assert 'python -m etl.cli events --input' in readme
    ignore = (ROOT / 'data' / 'events' / '.gitignore').read_text(encoding='utf-8')
    assert '*.json' in ignore
    assert (ROOT / 'data' / 'events' / 'README.md').exists()
    tracked_json = subprocess.run(
        ['git', 'ls-files', 'data/events/*.json'], capture_output=True, text=True, cwd=ROOT, check=False
    ).stdout.split()
    assert tracked_json == [], f'an event archive must never be committed: {tracked_json}'
