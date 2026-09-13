"""Blog authorisation parity guards.

The superadmin allowlist is declared in three places, and drift between them
is a security bug in either direction:

  * frontend/src/lib/superadmins.ts        — the UI gate
  * scripts/db/006_blog_articles_rls_authz.sql — the RLS enforcement + trigger
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


def test_all_expected_files_exist():
    for path in (SUPERADMINS_TS, MIGRATION, SETUP_DOC, VERIFY_SQL):
        assert path.exists(), f'missing {path.relative_to(ROOT)}'


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
