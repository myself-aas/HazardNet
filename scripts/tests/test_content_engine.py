#!/usr/bin/env python3
"""The Phase 8 content engine: what it may publish, and what it must refuse to.

WHAT THESE TESTS ARE GUARDING
-----------------------------
The content engine (`scripts/build_content_engine.mjs`) turns committed artifacts into the
hazard-methodology pages, the 64 district outlooks and the season retrospectives. Two failure
modes would be worse than having no content pages at all:

1. **Copy that drifts from the code.** Each hazard page publishes the formula its physics
   cross-check uses. If `scripts/severity.py` changes and the published expression does
   not, the site teaches a formula the pipeline no longer runs. The `expr` field in
   `frontend/src/content/hazard-methodology.json` is therefore *executed* here against the real
   Python functions for a grid of driver vectors — not compared as text.

2. **A statistic that was invented.** `docs/MODEL_CARD.md` §4 quotes 2,931 historical events
   (2000–2025) and that archive is not in this repository. The engine must never print a
   per-district or per-year event count it did not read from a loaded archive, and when an archive
   *is* loaded it must print the drift against the claim beside the count. Both paths are executed
   here: once with no archive, once with the pipeline's own export of the fixture events.

The hazard vocabulary is pinned to `scripts/HAZARD_CLASSES` for the same reason
`scripts/tests/test_severity.py` pins the physics: eight classes is the model's whole output
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


HAZARD_CLASSES = (
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
)

METHODOLOGY = ROOT / 'frontend' / 'src' / 'content' / 'hazard-methodology.json'
ATTRIBUTION = ROOT / 'frontend' / 'src' / 'content' / 'attribution.json'
GENERATED = ROOT / 'frontend' / 'src' / 'content' / 'generated-routes.json'
DISTRICT_TABLE = ROOT / 'frontend' / 'src' / 'data' / 'bangladeshDistricts.ts'
ENGINE = ROOT / 'scripts' / 'build_content_engine.mjs'
pipeline_CLI = ROOT / 'scripts' / 'pipeline' / 'cli.py'
FIXTURE_EVENTS = ROOT / 'scripts' / 'tests' / 'fixtures' / 'pipeline' / 'events_sample.csv'

# Driver vectors chosen to exercise each formula's clamp boundaries as well as its interior: the
# 16 °C cold-wave threshold, the 50 km/h wind floors, the 300 mm / 100 mm rainfall denominators.

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
    """A small events export in the shape the content engine accepts."""
    export = tmp_path / 'hazardnet-events.json'
    events = [
        {'hazard_type': 'Flood', 'start_date': '2020-07-01', 'end_date': '2020-07-10',
         'adm2_name': 'Bhola', 'severity': 0.7, 'affected': 1200, 'event_id': f'ev-{n}'}
        for n in range(3)
    ] + [
        {'hazard_type': 'Tropical Cyclone', 'start_date': '2020-05-20',
         'adm2_name': 'Satkhira', 'severity': 0.9, 'event_id': 'ev-c1'},
        {'hazard_type': 'Drought', 'start_date': '2022-03-05',
         'adm2_name': 'Rajshahi', 'severity': 0.5, 'event_id': 'ev-d1'},
    ]
    export.write_text(json.dumps({'events': events}), encoding='utf-8')
    return export


# ── 1. the copy cannot drift from the physics it describes ───────────────────


def test_every_published_hazard_is_one_of_the_models_eight_classes():
    published = {entry['class'] for entry in load_methodology()['hazards']}
    assert published == set(HAZARD_CLASSES), (
        'the hazard pages must cover exactly the model vocabulary: '
        f'missing={set(HAZARD_CLASSES) - published} extra={published - set(HAZARD_CLASSES)}'
    )


def test_every_published_slug_is_unique_and_url_safe():
    slugs = [entry['slug'] for entry in load_methodology()['hazards']]
    assert len(slugs) == len(set(slugs))
    for slug in slugs:
        assert re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', slug), slug


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
    assert 'validation' in text.lower()


def test_an_archive_page_publishes_the_dataset_it_actually_has(with_archive):
    year = next(r for r in with_archive['routes'] if re.fullmatch(r'/retrospectives/\d{4}', r['path']))
    dataset = year['structuredData']['dataset']
    assert dataset['kind'] == 'event-archive'
    assert dataset['temporalCoverage'].startswith(year['path'].rsplit('/', 1)[-1])


def test_the_archive_is_described_by_what_it_holds_not_by_where_it_was_read_from(with_archive):
    """The page states the archive's own figures; the location it came from stays in `inputs`.

    This test used to require the operator's path to be printed on /retrospectives, so a
    reader could check the claim against the file. A reader of the deployed site cannot open
    a location in this repository's tree, so the surface now says what the archive holds and
    the generated document keeps where it was read from in its machine-readable `inputs` —
    which is what a script auditing a published number reads (docs/PUBLIC_SURFACE.md §3).
    The drift sentence is the half that had to survive: it is the page saying that the
    measured count, not the count the model card quotes, is the one it uses.
    """
    index = next(r for r in with_archive['routes'] if r['path'] == '/retrospectives')
    text = ' '.join(' '.join(s.get('paragraphs', [])) for s in index['sections'])
    assert 'the archive this deployment loaded' in text
    assert 'drift' in text
    assert 'hazardnet-events.json' not in text
    assert with_archive['inputs']['event_archive']['path'].endswith('hazardnet-events.json')


# ── 6. the export the content engine consumes is the loader's own ────────────


