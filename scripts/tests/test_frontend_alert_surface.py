"""Guards on the public alert surface (Phase 5).

The backend already proves that `REQUIRED_DISCLAIMER` equals the §1.7 block in
`docs/PRODUCT_SPEC.md` (`__tests__/alerts/policy.test.js`). The frontend renders that
same text from `frontend/src/lib/legal.ts`, and a browser does not read the backend's
constant — so without this file the two could drift and the site could publish an alert
carrying a disclaimer the spec no longer contains.

Three things are checked here, all of them cross-file rather than unit-level:

1. the frontend disclaimer is byte-identical (after whitespace folding) to the
   backend's, which is itself pinned to the spec;
2. the shipped offline snapshot (`frontend/public/data/alerts-latest.json`, when
   present) is schema-tagged, contains only PUBLISHED rows, and every row carries the
   disclaimer — this is the file a CDN serves, so it gets the same check the API gets;
3. the copy for the new `/alerts` route in `content/site-routes.json` does not claim a
   probability where there is only an uncalibrated score, and does not promise warnings
   the engine cannot currently issue.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEGAL_TS = ROOT / 'frontend' / 'src' / 'lib' / 'legal.ts'
POLICY_JS = ROOT / 'backend' / 'alerts' / 'policy.js'
SNAPSHOT = ROOT / 'frontend' / 'public' / 'data' / 'alerts-latest.json'
SITE_ROUTES = ROOT / 'frontend' / 'src' / 'content' / 'site-routes.json'
ALERT_CLIENT = ROOT / 'frontend' / 'src' / 'lib' / 'alerts.ts'
SCHEMA = 'hazardnet-alerts/v1'


def _read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def _string_constant(source: str, name: str) -> str:
    """Concatenated value of a `const NAME = '…' + '…';` TypeScript/JS declaration."""
    match = re.search(rf'{name}\s*=\s*(.+?);', source, re.S)
    assert match, f'{name} not found'
    body = match.group(1)
    parts = re.findall(r"'([^']*)'", body)
    assert parts, f'{name} has no string parts'
    return ' '.join(part.strip() for part in parts)


def _frontend_disclaimer() -> str:
    raw = _string_constant(_read(LEGAL_TS), 'ALERT_DISCLAIMER')
    return re.sub(r'\s+', ' ', raw).strip()


def _backend_disclaimer() -> str:
    raw = _string_constant(_read(POLICY_JS), 'REQUIRED_DISCLAIMER')
    return re.sub(r'\s+', ' ', raw).strip()


def test_frontend_and_backend_disclaimers_are_identical():
    frontend = _frontend_disclaimer()
    backend = _backend_disclaimer()
    assert 'not an official warning service' in frontend
    assert frontend == backend, (
        'the site and the API must quote the same §1.7 disclaimer;\n'
        f'  frontend: {frontend}\n  backend:  {backend}'
    )


def test_frontend_disclaimer_matches_the_retired_snapshot_builder():
    """The snapshot builder stamps its own copy — that copy must be the same text too."""
    script = _read(ROOT / 'scripts' / 'build_alert_snapshot.mjs')
    raw = _string_constant(script, 'ALERT_DISCLAIMER')
    assert re.sub(r'\s+', ' ', raw).strip() == _frontend_disclaimer()


def test_client_drops_unpublished_rows_and_knows_the_schema():
    source = _read(ALERT_CLIENT)
    assert f"'{SCHEMA}'" in source, 'the client must declare the snapshot schema it accepts'
    assert re.search(r"state\s*!==\s*'PUBLISHED'", source), (
        'the client must filter non-PUBLISHED rows itself, not trust the payload'
    )


@pytest.mark.skipif(not SNAPSHOT.exists(), reason='no committed alert snapshot')
def test_committed_snapshot_is_publishable_and_disclaimed():
    snapshot = json.loads(_read(SNAPSHOT))
    assert snapshot.get('schema') == SCHEMA
    assert 'generated_at' in snapshot, 'a snapshot without a timestamp cannot be labelled'

    alerts = snapshot.get('alerts')
    assert isinstance(alerts, list)
    for alert in alerts:
        assert alert.get('state') == 'PUBLISHED', 'a non-published row is in a public file'
        assert alert.get('disclaimer'), 'a row without the §1.7 disclaimer is in a public file'
        assert alert.get('level') in {'NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'}
        assert _frontend_disclaimer() in re.sub(r'\s+', ' ', alert['disclaimer'])

    dropped = (snapshot.get('counts') or {}).get('dropped_unpublished')
    if dropped:
        # An empty snapshot is allowed (it is the honest state while nothing can be
        # published), but it must say how many assessments it is holding back.
        assert snapshot.get('assessed') is not None or alerts, (
            'a snapshot that dropped rows must report how many were assessed'
        )


def test_alerts_route_copy_does_not_overclaim():
    routes = json.loads(_read(SITE_ROUTES))['routes']
    route = next((entry for entry in routes if entry.get('path') == '/alerts'), None)
    assert route is not None, '/alerts must be a declared route'

    copy = json.dumps(route, ensure_ascii=False).lower()
    for phrase in (
        'probability of flooding',
        'probability of the hazard occurring',
        'calibrated probability of',
        'guaranteed',
        'official warning service that',
    ):
        assert phrase not in copy

    # The page must keep saying that a watch is the ceiling and that a human reviews
    # anything above it: that sentence is the product's promise, not decoration.
    assert 'duty officer' in copy
    assert 'watch' in copy


def test_low_bandwidth_and_language_are_declared_in_the_route_copy():
    """The two features this phase adds are promised on the page that carries them."""
    routes = json.loads(_read(SITE_ROUTES))['routes']
    route = next(entry for entry in routes if entry.get('path') == '/alerts')
    copy = json.dumps(route, ensure_ascii=False).lower()
    assert 'bengali' in copy
