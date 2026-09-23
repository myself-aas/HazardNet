"""Guards for the vulnerability-disclosure surface (Phase 6, SEC-13).

`SECURITY.md` and `frontend/public/.well-known/security.txt` are the two halves of one
promise: a researcher who finds something must be able to reach us, and must be able to tell
that the address is current. An expired `Expires:` field — or a `Canonical:` URL that the
deployment does not actually serve — turns that promise into a dead end, silently, which is
exactly the failure mode these tests exist to catch.

RFC 9116 fields, checked here:

  * `Contact:` — at least one, and the `SECURITY.md` policy names the same address
  * `Expires:` — present, in the future, and not more than a year out (so it gets renewed)
  * `Canonical:` — present, absolute, and pointing at the path this file is served from
  * `Policy:` — an absolute URL to a page that exists in `site-routes.json`

They run without network access and fail with the field name, not a bare assertion.
"""

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SECURITY_TXT = ROOT / 'frontend' / 'public' / '.well-known' / 'security.txt'
SECURITY_MD = ROOT / 'SECURITY.md'
SITE_ROUTES = ROOT / 'frontend' / 'src' / 'content' / 'site-routes.json'
CANONICAL_HOST = 'https://www.hazardnet.live'


def fields(text, name):
    """All values of a `Name:` field, in file order (RFC 9116 allows repeats)."""
    pattern = re.compile(rf'^{re.escape(name)}:\s*(.+?)\s*$', re.MULTILINE | re.IGNORECASE)
    return [match.strip() for match in pattern.findall(text)]


def parse_iso(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def test_security_txt_exists_at_the_standard_path():
    assert SECURITY_TXT.exists(), (
        'security.txt must live at frontend/public/.well-known/security.txt so the build '
        'copies it to /.well-known/security.txt'
    )


def test_security_txt_declares_a_contact():
    text = SECURITY_TXT.read_text(encoding='utf-8')
    contacts = fields(text, 'Contact')
    assert contacts, 'RFC 9116 requires at least one Contact field'
    assert any(contact.startswith('mailto:') for contact in contacts), (
        'at least one Contact must be a mailto: URI'
    )
    assert any(re.match(r'https?://', contact) for contact in contacts), (
        'a second Contact pointing at the advisory form makes reporting possible without email'
    )


def test_security_txt_has_an_expiry_that_has_not_passed_and_is_renewed_yearly():
    text = SECURITY_TXT.read_text(encoding='utf-8')
    expires = fields(text, 'Expires')
    assert len(expires) == 1, f'exactly one Expires field expected, found {expires}'
    expires_at = parse_iso(expires[0])
    now = datetime.now(timezone.utc)
    assert expires_at > now, (
        f'security.txt expired on {expires_at.isoformat()} — an expired file is treated as '
        'absent by scanners and by researchers'
    )
    assert expires_at - now <= timedelta(days=366), (
        f'Expires is {expires_at.date()} — more than a year out, which is how a policy quietly '
        'goes stale. Keep it under a year and renew it.'
    )


def test_security_txt_canonical_points_at_where_it_is_served():
    text = SECURITY_TXT.read_text(encoding='utf-8')
    canonical = fields(text, 'Canonical')
    assert canonical, 'RFC 9116 recommends (and we require) a Canonical field'
    expected = f'{CANONICAL_HOST}/.well-known/security.txt'
    assert canonical[0] == expected, f'Canonical is {canonical[0]!r}, expected {expected!r}'


def test_security_txt_policy_url_is_a_route_the_site_ships():
    text = SECURITY_TXT.read_text(encoding='utf-8')
    policy = fields(text, 'Policy')
    assert policy, 'a Policy field must point at the disclosure policy'
    url = policy[0]
    assert url.startswith(CANONICAL_HOST), f'Policy must be an absolute URL on the canonical host, got {url!r}'
    path = url[len(CANONICAL_HOST):] or '/'
    paths = {route['path'] for route in json.loads(SITE_ROUTES.read_text(encoding='utf-8'))['routes']}
    assert path in paths, f'Policy points at {path}, which is not one of the shipped routes: {sorted(paths)}'


def test_security_txt_prefers_the_languages_we_can_answer_in():
    text = SECURITY_TXT.read_text(encoding='utf-8')
    languages = fields(text, 'Preferred-Languages')
    assert languages, 'Preferred-Languages should say which languages a report may be written in'
    codes = [code.strip() for code in languages[0].split(',')]
    assert 'en' in codes
    assert 'bn' in codes, 'Bengali is a supported product language; a reporter should be able to use it'


def test_security_md_names_the_same_contact_as_security_txt():
    md = SECURITY_MD.read_text(encoding='utf-8')
    text = SECURITY_TXT.read_text(encoding='utf-8')
    contacts = fields(text, 'Contact')
    mailbox = next(contact[len('mailto:'):] for contact in contacts if contact.startswith('mailto:'))
    assert mailbox in md, (
        f'SECURITY.md must name the reporting address {mailbox!r} — the two documents are read '
        'together and must not point at different inboxes'
    )


def test_security_md_states_scope_and_safe_harbour():
    md = SECURITY_MD.read_text(encoding='utf-8').lower()
    for expected in ('in scope', 'out of scope', 'safe harbour'):
        assert expected in md, f'SECURITY.md must have an explicit "{expected}" statement'


def test_security_md_does_not_claim_controls_the_repo_does_not_have():
    """The disclosure page is a security claim too: no unverified assurance language."""
    md = SECURITY_MD.read_text(encoding='utf-8')
    for overclaim in ('fully secure', 'no vulnerabilities', '100% secure', 'unhackable'):
        assert overclaim not in md.lower(), f'SECURITY.md claims {overclaim!r}'


def test_security_md_points_at_the_live_remediation_actions():
    md = SECURITY_MD.read_text(encoding='utf-8')
    assert 'docs/ops/owner-actions.md' in md, (
        'the known open issues (rotation, deployment root, rules validation) are tracked as owner '
        'actions; the disclosure policy should route a reader there rather than imply they are done'
    )
