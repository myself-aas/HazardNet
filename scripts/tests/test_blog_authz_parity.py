"""Blog authorisation parity guards.

The superadmin allowlist is declared in three places, and drift between them
is a security bug in either direction:

  * frontend/src/lib/superadmins.ts        — the UI gate
  * scripts/db/006_blog_articles_rls_authz.sql — the RLS enforcement + trigger
  * firestore.rules                        — the Firestore implementation's gate
  * docs/blog-admin-setup.md               — the reference SQL operators copy

Too narrow in the SQL and the real owner is locked out of their own blog; too
wide and someone keeps write access to the public site after being removed.

These tests also pin the invariant that actually caused the Sept 2026
vulnerability: no `blog_articles` policy may authorise on a client-supplied
column.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SUPERADMINS_TS = ROOT / 'frontend' / 'src' / 'lib' / 'superadmins.ts'
MIGRATION = ROOT / 'scripts' / 'db' / '006_blog_articles_rls_authz.sql'
SETUP_DOC = ROOT / 'docs' / 'blog-admin-setup.md'
VERIFY_SQL = ROOT / 'scripts' / 'db' / 'verify_blog_articles_rls.sql'
FIRESTORE_RULES = ROOT / 'firestore.rules'

EMAIL_RE = re.compile(r"'([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})'")


def _emails_from_ts(path: Path) -> set[str]:
    """Emails inside the PRIMARY_SUPERADMIN_EMAILS readonly array."""
    text = path.read_text(encoding='utf-8')
    start = text.index('PRIMARY_SUPERADMIN_EMAILS')
    # The array literal ends at the `] as const` that follows it.
    end = text.index('] as const', start)
    return {e.lower() for e in EMAIL_RE.findall(text[start:end])}


def _emails_from_sql(path: Path) -> set[str]:
    return {e.lower() for e in EMAIL_RE.findall(path.read_text(encoding='utf-8'))}


def _emails_from_firestore_rules(path: Path) -> set[str]:
    """Emails inside the isBlogSuperadmin() allowlist array."""
    text = path.read_text(encoding='utf-8')
    start = text.index('function isBlogSuperadmin')
    end = text.index(']', text.index('[', start))
    return {e.lower() for e in EMAIL_RE.findall(text[start:end])}


def test_all_expected_files_exist():
    for path in (SUPERADMINS_TS, MIGRATION, SETUP_DOC, VERIFY_SQL, FIRESTORE_RULES):
        assert path.exists(), f'missing {path.relative_to(ROOT)}'


def test_firestore_allowlist_matches_frontend():
    """The app writes blog articles through Firestore, so firestore.rules is a
    live enforcement point — not documentation. Drift here is a security bug."""
    ts = _emails_from_ts(SUPERADMINS_TS)
    rules = _emails_from_firestore_rules(FIRESTORE_RULES)
    assert rules, 'could not parse a superadmin allowlist out of firestore.rules'
    assert rules == ts, (
        'superadmin allowlist drift between superadmins.ts and firestore.rules.\n'
        f'  frontend only: {sorted(ts - rules)}\n'
        f'  rules only:    {sorted(rules - ts)}'
    )


def test_firestore_blog_writes_require_superadmin():
    """Regression guard for the 2026-09-17 finding: blog writes were granted to
    any authenticated user, so any signed-up account could publish or delete
    public content."""
    text = FIRESTORE_RULES.read_text(encoding='utf-8')
    block = text[text.index('match /blog_articles'):]
    block = block[: block.index('}', block.index('allow'))]
    assert 'isBlogSuperadmin()' in block, 'blog_articles writes are not gated on the superadmin allowlist'
    assert 'create, update, delete: if isSignedIn()' not in block, (
        'blog_articles writes are still granted to any signed-in user'
    )


def test_firestore_connectors_are_owner_scoped():
    """Regression guard: user_connectors granted read/write to any signed-in
    user, exposing every account's connector config to every other account."""
    text = FIRESTORE_RULES.read_text(encoding='utf-8')
    block = text[text.index('match /user_connectors'):]
    block = block[: block.index('\n    }')]

    # Phase 6 moved the comparison into the `isCallerOwned()` helper (which accepts both
    # the client's `user_id` and the SQL mirror's `userId`), so the assertion is on the
    # helper *and* its use here — a literal `request.auth.uid` no longer appears in the
    # block itself, and the old check failed on the fix rather than on a regression.
    assert 'isCallerOwned(existing())' in block, 'user_connectors reads do not check ownership'
    assert 'isCallerOwned(incoming())' in block, 'user_connectors writes do not check ownership'
    helper = text[text.index('function isCallerOwned'):]
    helper = helper[: helper.index('}')]
    assert 'request.auth.uid' in helper, 'isCallerOwned does not compare against the caller'
    owner_helper = text[text.index('function ownerOf'):]
    owner_helper = owner_helper[: owner_helper.index('}')]
    assert "'user_id' in data" in owner_helper and "'userId' in data" in owner_helper, (
        'ownerOf must accept both ownership spellings (the client writes user_id)'
    )
    assert 'allow read, write: if isSignedIn();' not in block, (
        'user_connectors still grants read/write to any signed-in user'
    )


def test_migration_allowlist_matches_frontend():
    ts = _emails_from_ts(SUPERADMINS_TS)
    sql = _emails_from_sql(MIGRATION)
    assert ts, 'could not parse any superadmin emails from superadmins.ts'
    assert sql == ts, (
        'superadmin allowlist drift between superadmins.ts and the RLS migration.\n'
        f'  frontend only: {sorted(ts - sql)}\n'
        f'  sql only:      {sorted(sql - ts)}'
    )


def test_documented_sql_matches_migration():
    doc = _emails_from_sql(SETUP_DOC)
    sql = _emails_from_sql(MIGRATION)
    assert doc == sql, (
        'docs/blog-admin-setup.md and the migration disagree on the allowlist.\n'
        f'  doc only: {sorted(doc - sql)}\n'
        f'  sql only: {sorted(sql - doc)}'
    )


def test_migration_never_authorises_on_author_email():
    """The exact defect: a policy that tests a column the client controls."""
    text = MIGRATION.read_text(encoding='utf-8')

    # Comments explain the bug at length, so only inspect executable lines.
    code = '\n'.join(
        line for line in text.splitlines() if not line.lstrip().startswith('--')
    )

    offenders = []
    for match in re.finditer(
        r'create policy\s+"?([\w]+)"?.*?;', code, re.IGNORECASE | re.DOTALL
    ):
        body = match.group(0)
        if 'author_email' in body.lower():
            offenders.append(match.group(1))

    assert not offenders, (
        'blog_articles policies must not reference author_email (client-supplied): '
        f'{offenders}'
    )


def test_migration_keeps_the_superadmin_select_policy():
    """Drafts are unreadable without it, which breaks the Blog Studio."""
    text = MIGRATION.read_text(encoding='utf-8')
    assert re.search(
        r'create policy\s+"?blog_superadmin_read"?', text, re.IGNORECASE
    ), 'blog_superadmin_read is missing — save-draft/unpublish would fail again'


@pytest.mark.parametrize(
    'needle',
    [
        'security definer',   # must read auth.users
        "set search_path = ''",  # SECURITY DEFINER without a pinned path is unsafe
        'auth.uid()',         # identity from the JWT, not the row
    ],
)
def test_migration_uses_hardened_identity_helper(needle):
    text = MIGRATION.read_text(encoding='utf-8').lower()
    assert needle.lower() in text, f'migration is missing: {needle}'
