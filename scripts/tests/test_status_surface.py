"""The status surface: the artifact, the page, the probe that keeps both honest (Phase 7).

Three failure modes this file exists to prevent, all of them ways a status page becomes
worse than no status page:

  1. **The artifact drifts from the data it describes.** The page quotes the committed
     snapshots; if a pipeline commit moves the data and not the artifact, the page states
     something false with full confidence. The numbers are re-derived here from the
     committed files and compared, independently of the builder's own `--check`.
  2. **The page is a shell.** `/status` must carry the figures in the *static* HTML, and the
     route must be configured so the prerenderer can render it (a `sitemap: true` entry
     crashes the sitemap builder, which is how this was found).
  3. **Nothing publishes the probe result.** The probe workflow has to be able to write the
     machine-readable result the page reads, and must degrade to a warning — not a failure —
     when the repository's workflow permissions are read-only, because the probe's job is to
     *detect*, not to publish.
"""

import json
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / 'frontend' / 'public' / 'data' / 'freshness.json'
FORECAST_SNAPSHOT = ROOT / 'frontend' / 'public' / 'data' / 'forecasts-latest.json'
ALERTS_SNAPSHOT = ROOT / 'frontend' / 'public' / 'data' / 'alerts-latest.json'
MANIFEST = ROOT / 'backend' / 'data' / 'forecasts' / 'manifest.json'
PROBE_RESULT = ROOT / 'data' / 'site-health' / 'latest.json'
SITE_ROUTES = ROOT / 'frontend' / 'src' / 'content' / 'site-routes.json'
APP = ROOT / 'frontend' / 'src' / 'App.tsx'
PRERENDER = ROOT / 'frontend' / 'scripts' / 'prerender.mjs'
STATUS_PAGE = ROOT / 'frontend' / 'src' / 'pages' / 'StatusPage.tsx'
PANEL = ROOT / 'frontend' / 'src' / 'components' / 'status' / 'FreshnessPanel.tsx'
FRESHNESS_LIB = ROOT / 'frontend' / 'src' / 'lib' / 'freshness.ts'
SITE_HEALTH = ROOT / '.github' / 'workflows' / 'site-health.yml'
DAILY = ROOT / '.github' / 'workflows' / 'daily_forecast.yml'
WEEKLY = ROOT / '.github' / 'workflows' / 'weekly_forecast.yml'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


@pytest.fixture(scope='module')
def artifact():
    assert ARTIFACT.exists(), (
        f'{ARTIFACT.relative_to(ROOT)} is missing. The status page renders it; regenerate with '
        '`node scripts/build_freshness_artifact.mjs`.'
    )
    return load(ARTIFACT)


def source(artifact, source_id):
    matches = [entry for entry in artifact['sources'] if entry['id'] == source_id]
    assert matches, f'no {source_id} source in the artifact: {[e["id"] for e in artifact["sources"]]}'
    return matches[0]


def test_artifact_carries_the_contract(artifact):
    assert artifact['schema'] == 'hazardnet-freshness/v1'
    assert artifact['generated_by'] == 'scripts/build_freshness_artifact.mjs'
    assert artifact['built_at'].endswith('Z')
    assert [entry['id'] for entry in artifact['sources']] == [
        'forecast_ingest',
        'forecast_snapshot',
        'alert_engine',
        'site_probe',
    ]
    assert artifact['overall']['state'] in {'fresh', 'stale', 'failing', 'missing', 'unknown'}
    assert artifact['what_this_is'], 'the artifact must say what it is, on the page it feeds'


def test_artifact_states_match_its_own_counts(artifact):
    counts = artifact['overall']['counts']
    assert sum(counts.values()) == len(artifact['sources'])
    for state, count in counts.items():
        assert count == len([s for s in artifact['sources'] if s['state'] == state])
    not_fresh = [entry['id'] for entry in artifact['sources'] if entry['state'] != 'fresh']
    assert artifact['overall']['not_fresh'] == not_fresh


def test_artifact_quotes_the_committed_forecast_snapshot(artifact):
    """The drift guard: re-derive the coverage numbers from the snapshot itself."""
    snapshot = load(FORECAST_SNAPSHOT)
    forecast = source(artifact, 'forecast_snapshot')
    assert forecast['prediction_date'] == snapshot['prediction_date']
    assert forecast['generated_at'] == snapshot['generated_at']
    assert forecast['detail']['schema'] == snapshot['schema']

    coverage = artifact['coverage']
    assert coverage is not None
    for key in ('status', 'produced_units', 'districts_covered', 'districts_expected', 'horizons'):
        assert coverage[key] == snapshot['coverage'][key], f'coverage.{key} drifted from the snapshot'
    assert coverage['units_per_horizon'] == snapshot['coverage']['units_per_horizon']


def test_artifact_quotes_the_committed_ingest_manifest(artifact):
    manifest = load(MANIFEST)
    ingest = source(artifact, 'forecast_ingest')
    assert ingest['prediction_date'] == manifest['prediction_date']
    assert ingest['generated_at'] == manifest['generated_at']
    assert ingest['detail']['row_count'] == manifest['row_count']
    assert ingest['detail']['csv_sha256'] == manifest['csv_sha256']


def test_artifact_quotes_the_committed_alert_snapshot(artifact):
    alerts = load(ALERTS_SNAPSHOT)
    engine = source(artifact, 'alert_engine')
    assert engine['generated_at'] == alerts['generated_at']
    assert engine['detail']['assessed'] == alerts['assessed']
    assert engine['detail']['published'] == len(alerts['alerts'])
    assert engine['detail']['not_published'] == alerts['counts']['not_published']


def test_artifact_never_invents_a_model_version(artifact):
    """§1.6: while the pipeline stamps no version, the artifact must not carry one."""
    snapshot = load(FORECAST_SNAPSHOT)
    stamped = snapshot['provenance'].get('model_version')
    assert artifact['model']['model_version'] == stamped
    assert artifact['model']['stamped'] is (stamped is not None)
    if stamped is None:
        assert any('model_version is null' in note for note in artifact['honesty']), (
            'an unstamped model version must be explained on the page, not left to inference'
        )


def test_artifact_states_every_source_it_cannot_vouch_for(artifact):
    for entry in artifact['sources']:
        if entry['state'] == 'fresh':
            assert entry['reason'] is None
            assert isinstance(entry['age_hours'], (int, float))
        else:
            assert entry['reason'], f'{entry["id"]} is {entry["state"]} without a reason'
    assert artifact['honesty'], 'a page with nothing to disclaim should still say so explicitly'


def test_probe_result_is_reported_honestly(artifact):
    """When the probe has published a result, the artifact must reproduce it exactly."""
    probe = source(artifact, 'site_probe')
    if not PROBE_RESULT.exists():
        assert probe['state'] == 'unknown', 'no probe result committed, so the state must be unknown'
        assert probe['outcome'] == 'unknown'
        return
    published = load(PROBE_RESULT)
    assert published['schema'] == 'hazardnet-site-probe/v1'
    assert probe['generated_at'] == published['ran_at']
    failed = [c for c in published['checks'] if c['outcome'] != 'success']
    expected = 'fail' if (published['outcome'] != 'pass' or failed) else 'pass'
    assert probe['outcome'] == expected
    if expected == 'fail':
        assert probe['state'] == 'failing', 'a failing probe must be reported as failing'
    else:
        # A passing probe is `fresh` or `stale` depending on how old the result
        # is relative to its SLO — never `missing`, `unknown` or `failing`.
        assert probe['state'] in ('fresh', 'stale'), (
            f'a passing probe must be fresh or stale, got {probe["state"]!r}'
        )
    assert len(published['checks']) >= 6, 'the probe must cover the whole public surface'


def test_builder_check_passes_against_the_committed_tree():
    """The committed artifact must be exactly what its inputs imply (no hand edits)."""
    result = subprocess.run(
        ['node', 'scripts/build_freshness_artifact.mjs', '--check'],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        'the committed freshness artifact no longer describes the committed inputs — '
        f're-run the builder and commit it.\nstdout: {result.stdout}\nstderr: {result.stderr}'
    )


def test_status_route_is_configured_for_the_prerenderer():
    routes = load(SITE_ROUTES)['routes']
    status = [route for route in routes if route['path'] == '/status']
    assert len(status) == 1, 'exactly one /status route entry'
    route = status[0]
    assert route['robots'] == 'index,follow', 'the status page is a trust surface: it is indexable'
    assert route.get('appShell') is True
    # The prerenderer reads these two fields and calls .toFixed() on the priority — the
    # entry must carry an object, not a bare `true` (that crash is why this assertion exists).
    assert isinstance(route['sitemap'], dict), 'sitemap must be {changefreq, priority}'
    assert isinstance(route['sitemap']['priority'], (int, float))
    assert isinstance(route['sitemap']['changefreq'], str)
    assert route['sections'], 'the page needs its explanatory copy in the shared content file'
    assert route['faqs'], 'the page needs its questions answered in the shared content file'


def test_status_page_is_wired_into_the_app_and_the_build():
    app = APP.read_text(encoding='utf-8')
    assert "import('./pages/StatusPage')" in app, 'StatusPage must be lazily routed in App.tsx'
    assert 'path="/status"' in app

    prerender = PRERENDER.read_text(encoding='utf-8')
    assert "route.path === '/status'" in prerender, 'the prerenderer must render the live panel'
    assert 'statusArtifact' in prerender
    assert 'frontend/public/data/freshness.json' in prerender or 'freshness.json' in prerender

    for path in (STATUS_PAGE, PANEL, FRESHNESS_LIB):
        assert path.exists(), f'{path.relative_to(ROOT)} is missing'
    assert 'hazardnet-freshness/v1' in FRESHNESS_LIB.read_text(encoding='utf-8')


def test_status_page_copy_does_not_promise_liveness():
    """A status page that claims to be a live probe is the lie it exists to prevent."""
    route = [route for route in load(SITE_ROUTES)['routes'] if route['path'] == '/status'][0]
    copy = ' '.join(
        [route.get('standfirst', ''), route.get('description', '')]
        + [section.get('h2', '') for section in route['sections']]
        + [part for section in route['sections'] for part in section.get('paragraphs', [])]
        + [part for section in route['sections'] for part in section.get('bullets', [])]
    )
    assert 'not from a live probe' in copy or 'not a live probe' in copy
    assert 'does not claim' in copy or 'deliberately does not claim' in copy
    # And it must not advertise an uptime percentage it does not compute.
    assert not re.search(r'\b9{2}\.\d+\s*%\s*uptime', copy, re.IGNORECASE)


def test_probe_workflow_publishes_the_result_it_reads():
    workflow = SITE_HEALTH.read_text(encoding='utf-8')
    assert 'contents: write' in workflow, 'the publish step needs a write-scoped token'
    # Every check must feed the machine-readable result.
    for check_id in (
        'homepage',
        'deep_links',
        'security_headers',
        'sitemap',
        'forecast_data',
        'status_page',
    ):
        assert f'id: {check_id}' in workflow, f'missing probe step id {check_id}'
        assert f'steps.{check_id}.outcome' in workflow, f'{check_id} outcome not recorded'
    assert 'data/site-health/latest.json' in workflow
    assert 'scripts/build_freshness_artifact.mjs' in workflow, 'the artifact must be rebuilt with the result'
    assert 'git push' in workflow
    # Publication is best-effort: a read-only token must not turn a successful probe red.
    assert '::warning::' in workflow and 'read-only' in workflow
    # The artifact must be checked against the data the site actually serves.
    assert 'the freshness artifact quotes prediction_date' in workflow, (
        'the probe must compare the served prediction_date against the one the artifact quotes'
    )


def test_pipeline_workflows_rebuild_the_artifact_with_the_data():
    for path in (DAILY, WEEKLY):
        workflow = path.read_text(encoding='utf-8')
        assert 'node scripts/build_freshness_artifact.mjs' in workflow, f'{path.name} must rebuild the artifact'
        assert 'frontend/public/data/freshness.json' in workflow, f'{path.name} must stage the artifact'


def test_status_page_is_not_hidden_from_crawlers():
    routes = load(SITE_ROUTES)
    screens = {screen['path'] for screen in routes.get('appScreens', [])}
    assert '/status' not in screens, '/status is a public trust surface, not an app screen'
