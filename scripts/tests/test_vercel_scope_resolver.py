"""Behavioural tests for scripts/ci/resolve-vercel-scope.sh.

The deploy itself cannot be exercised from the test suite (it needs Vercel
credentials, and the production job is `main`-only), but the part that decides
*which* ids the CLI is given can be, and that is where the 2026-09-14 failure
lived: a stale `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` made `vercel deploy` fail
with a 403 the CLI reports as "Could not retrieve Project Settings"
(docs/audits/2026-09-14-vercel-deploy-403-project-unresolved.md).

`FakeVercel` mirrors the endpoints the resolver probes *and* the refusals the
real API uses, because the resolver's whole job is to tell those apart:

  * revoked token        -> 403 with `invalidToken: true`
  * team-scoped token    -> 403 `forbidden` on /v2/user with **no** such flag
                            (it is not bound to a user, but it still deploys)
  * scope it may not use -> 403 `team_unauthorized`
  * unknown team/slug    -> 404, which the CLI tolerates
  * a matching project   -> 200
"""

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts' / 'ci' / 'resolve-vercel-scope.sh'

# An account token that sees one team, which owns the project.
ACCOUNT_WORLD = {
    'tokens': {'tok_good': {'id': 'usr_owner', 'username': 'owner'}},
    'teams': {'tok_good': [{'id': 'team_real', 'slug': 'aas-core'}]},
    'projects': [{'id': 'prj_real', 'name': 'hazardnet', 'accountId': 'team_real'}],
}


class FakeVercel:
    """Stand-in for api.vercel.com, with the same shape of refusals."""

    def __init__(self, world):
        self.world = world

        class Handler(BaseHTTPRequestHandler):
            def log_message(self_inner, *args):
                pass

            def _send(self_inner, code, payload):
                body = json.dumps(payload).encode()
                self_inner.send_response(code)
                self_inner.send_header('Content-Type', 'application/json')
                self_inner.send_header('Content-Length', str(len(body)))
                self_inner.end_headers()
                self_inner.wfile.write(body)

            def _accessible(self_inner, token, user):
                """Teams the token may act on.

                Distinct from *listing* them: a team-scoped token is routinely
                refused `GET /v2/teams` while still being allowed to work with
                its own team, so the two must not be conflated.
                """
                teams = self.world['teams'].get(token, [])
                if user.get('scoped_team'):
                    teams = [t for t in teams if t['id'] == user['scoped_team']]
                return teams

            def _accessible_ids(self_inner, token, user):
                return {t['id'] for t in self_inner._accessible(token, user)}

            def _known_team(self_inner, value):
                for team_list in self.world['teams'].values():
                    for team in team_list:
                        if value in (team['id'], team['slug']):
                            return team
                return None

            def do_GET(self_inner):  # noqa: N802 — stdlib naming
                url = urlparse(self_inner.path)
                query = parse_qs(url.query)
                token = (self_inner.headers.get('Authorization') or '') \
                    .replace('Bearer ', '').strip()
                user = self.world['tokens'].get(token)

                if user is None:
                    return self_inner._send(403, {'error': {'code': 'forbidden'}})

                invalid = {'error': {'code': 'forbidden', 'invalidToken': True}}
                if user.get('invalid'):
                    return self_inner._send(403, invalid)

                # A token that is not bound to a user answers 403 here — note,
                # without `invalidToken`, which is exactly the distinction the
                # resolver relies on.
                if url.path == '/v2/user':
                    if user.get('scoped_team') or user.get('user_forbidden'):
                        return self_inner._send(403, {'error': {'code': 'forbidden'}})
                    return self_inner._send(200, {'user': {'id': user['id'],
                                                           'username': user['username']}})

                if url.path == '/v2/teams':
                    if user.get('teams_forbidden'):
                        return self_inner._send(403, {'error': {'code': 'forbidden'}})
                    return self_inner._send(200, {'teams': self_inner._accessible(token, user)})

                if url.path.startswith('/v2/teams/'):
                    value = url.path[len('/v2/teams/'):]
                    team = self_inner._known_team(value)
                    if team is None:
                        return self_inner._send(404, {'error': {'code': 'not_found'}})
                    if team['id'] in self_inner._accessible_ids(token, user):
                        return self_inner._send(200, team)
                    return self_inner._send(403, {'error': {'code': 'team_unauthorized'}})

                if url.path.startswith('/v9/projects/'):
                    wanted = url.path[len('/v9/projects/'):]
                    team_param = query.get('teamId', [None])[0]
                    if team_param is not None:
                        team = self_inner._known_team(team_param)
                        if team is None:
                            return self_inner._send(404, {'error': {'code': 'not_found'}})
                        if team['id'] not in self_inner._accessible_ids(token, user):
                            return self_inner._send(403, {'error': {'code': 'team_unauthorized'}})
                        account = team['id']
                    else:
                        account = user['id']

                    for project in self.world['projects']:
                        if project['accountId'] != account:
                            continue
                        if wanted in (project['id'], project['name']):
                            return self_inner._send(200, project)
                    return self_inner._send(404, {'error': {'code': 'not_found'}})

                return self_inner._send(404, {'error': {'code': 'not_found'}})

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.server.server_address[1]
        self._thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self._thread.start()

    @property
    def api(self):
        return f'http://127.0.0.1:{self.port}'

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def vercel():
    fake = FakeVercel(json.loads(json.dumps(ACCOUNT_WORLD)))
    yield fake
    fake.stop()


def run_resolver(vercel, tmp_path, **env_overrides):
    """Run the resolver the way the workflow does, collecting `$GITHUB_ENV`."""
    github_env = tmp_path / 'github_env'
    env = {
        'PATH': os.environ['PATH'],
        'VERCEL_API': vercel.api,
        'VERCEL_ORG_SLUG': 'aas-core',
        'VERCEL_PROJECT_NAME': 'hazardnet',
        'GITHUB_ENV': str(github_env),
    }
    env.update(env_overrides)
    proc = subprocess.run(
        ['bash', str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60
    )
    exported = {}
    if github_env.exists():
        for line in github_env.read_text(encoding='utf-8').splitlines():
            if '=' in line:
                key, value = line.split('=', 1)
                exported[key] = value
    return proc, exported


# ── the reported failure ────────────────────────────────────────────────────

def test_stale_org_and_project_are_resolved_from_the_token(vercel, tmp_path):
    """Both secrets point at a scope the token cannot use."""
    proc, exported = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert exported == {'VERCEL_ORG_ID': 'team_real', 'VERCEL_PROJECT_ID': 'prj_real'}


def test_stale_secrets_are_reported_as_a_notice(vercel, tmp_path):
    proc, _ = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
    )
    assert '::notice::VERCEL_ORG_ID secret (team_stale) is not usable' in proc.stdout
    assert '::notice::VERCEL_PROJECT_ID secret (prj_stale)' in proc.stdout


def test_usable_configured_ids_are_kept(vercel, tmp_path):
    proc, exported = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_real', VERCEL_PROJECT_ID='prj_real',
    )
    assert proc.returncode == 0
    assert exported == {'VERCEL_ORG_ID': 'team_real', 'VERCEL_PROJECT_ID': 'prj_real'}
    assert 'VERCEL_ORG_ID secret' in proc.stdout  # used the secret, not the slug


def test_stale_project_id_alone_falls_back_to_the_name(vercel, tmp_path):
    proc, exported = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_real', VERCEL_PROJECT_ID='prj_gone',
    )
    assert proc.returncode == 0
    assert exported['VERCEL_PROJECT_ID'] == 'prj_real'


def test_team_slug_is_used_when_no_org_secret_is_set(vercel, tmp_path):
    proc, exported = run_resolver(vercel, tmp_path, VERCEL_TOKEN='tok_good')
    assert proc.returncode == 0
    assert exported == {'VERCEL_ORG_ID': 'team_real', 'VERCEL_PROJECT_ID': 'prj_real'}
    assert "resolved org     : team_real (team slug 'aas-core')" in proc.stdout


# ── team-scoped tokens: /v2/user is 403, but the credential is fine ─────────

def test_team_scoped_token_is_not_mistaken_for_an_invalid_one(tmp_path):
    """/v2/user 403 without `invalidToken` is how a team-scoped token answers.

    Treating that as a dead credential would reject a token that deploys fine,
    which is the trap this test exists to prevent.
    """
    vercel = FakeVercel({
        'tokens': {'tok_team': {'id': 'usr_scoped', 'username': 'owner',
                                'scoped_team': 'team_real'}},
        'teams': {'tok_team': [{'id': 'team_real', 'slug': 'aas-core'}]},
        'projects': [{'id': 'prj_real', 'name': 'hazardnet', 'accountId': 'team_real'}],
    })
    try:
        proc, exported = run_resolver(
            vercel, tmp_path, VERCEL_TOKEN='tok_team',
            VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
        )
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert exported == {'VERCEL_ORG_ID': 'team_real', 'VERCEL_PROJECT_ID': 'prj_real'}
    finally:
        vercel.stop()


def test_team_scoped_token_that_cannot_list_teams_still_resolves(tmp_path):
    """Worst case: /v2/user and /v2/teams both refuse, so the slug is the lead."""
    vercel = FakeVercel({
        'tokens': {'tok_team': {'id': 'usr_scoped', 'username': 'owner',
                                'scoped_team': 'team_real', 'teams_forbidden': True}},
        'teams': {'tok_team': [{'id': 'team_real', 'slug': 'aas-core'}]},
        'projects': [{'id': 'prj_real', 'name': 'hazardnet', 'accountId': 'team_real'}],
    })
    try:
        proc, exported = run_resolver(
            vercel, tmp_path, VERCEL_TOKEN='tok_team',
            VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
        )
        assert proc.returncode == 0, proc.stdout + proc.stderr
        # The slug is accepted where an id was expected — verified by probing,
        # not assumed.
        assert exported == {'VERCEL_ORG_ID': 'aas-core', 'VERCEL_PROJECT_ID': 'prj_real'}
    finally:
        vercel.stop()


# ── failure modes must diagnose, not misdirect ──────────────────────────────

def test_revoked_token_is_named_as_such(vercel, tmp_path):
    vercel.world['tokens']['tok_dead'] = {'id': 'usr_x', 'username': 'x', 'invalid': True}
    proc, exported = run_resolver(vercel, tmp_path, VERCEL_TOKEN='tok_dead')
    assert proc.returncode == 1
    assert 'invalid, revoked or expired' in proc.stdout + proc.stderr
    assert exported == {}


def test_unresolvable_project_reports_every_probe(vercel, tmp_path):
    """No scope holds the project: say so, and show what was refused."""
    vercel.world = {
        'tokens': {'tok_good': {'id': 'usr_owner', 'username': 'owner'}},
        'teams': {
            'tok_good': [{'id': 'team_other', 'slug': 'some-other-team'}],
            # A real team the token has no access to — so `team_stale` is
            # refused with 403 rather than the 404 an unknown id would give.
            'tok_someone_else': [{'id': 'team_stale', 'slug': 'old-team'}],
        },
        'projects': [{'id': 'prj_other', 'name': 'unrelated', 'accountId': 'team_other'}],
    }
    proc, exported = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
    )
    assert proc.returncode == 1
    combined = proc.stdout + proc.stderr
    assert 'Could not resolve a Vercel project' in combined
    assert 'visible teams' in combined and 'some-other-team' in combined
    assert 'probes (path | HTTP | error)' in combined       # the diagnostic table
    assert 'team_unauthorized' in combined                  # and the real refusal
    assert exported == {}


def test_project_in_the_tokens_personal_account(vercel, tmp_path):
    """Personal scope must not send `teamId` — a user id is not a team id."""
    vercel.world = {
        'tokens': {'tok_good': {'id': 'usr_owner', 'username': 'owner'}},
        'teams': {'tok_good': []},
        'projects': [{'id': 'prj_personal', 'name': 'hazardnet', 'accountId': 'usr_owner'}],
    }
    proc, exported = run_resolver(
        vercel, tmp_path, VERCEL_TOKEN='tok_good',
        VERCEL_ORG_ID='team_stale', VERCEL_PROJECT_ID='prj_stale',
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert exported == {'VERCEL_ORG_ID': 'usr_owner', 'VERCEL_PROJECT_ID': 'prj_personal'}
