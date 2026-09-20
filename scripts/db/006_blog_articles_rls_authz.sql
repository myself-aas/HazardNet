-- =============================================================================
-- HazardNet · 006_blog_articles_rls_authz.sql
--
-- FIX (Critical): the blog write policies authorised on a client-supplied
-- column, so any registered user could publish, rewrite or DELETE articles.
--
-- WHAT WAS WRONG
-- --------------
-- docs/blog-admin-setup.md created the write policies as:
--
--     with check (lower(author_email) in ('shuvo.1807016@bau.edu.bd', ...))
--
-- `author_email` is an ordinary column written by the browser
-- (frontend/src/pages/dashboard/BlogEditorPage.tsx assigns it from the
-- signed-in session; frontend/src/lib/blogArticles.ts persists it verbatim).
-- Postgres evaluates the policy against the ROW being written, never against
-- the caller's identity, so the check asked "what did this request claim?"
-- instead of "who is this?".
--
-- Because sign-up is open (frontend/src/context/AuthContext.tsx calls
-- createUserWithEmailAndPassword with no invite gate), any account could send
-- author_email = <a superadmin address> and pass. The delete policy's USING
-- clause tested the SAME column, and every genuine article carries a
-- superadmin value there — so `delete from blog_articles` removed the entire
-- public blog. Realistically: full defacement and destruction.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
--   1. Adds public.is_blog_superadmin() — resolves identity from the JWT's
--      `sub` claim via auth.users, the only unforgeable input available.
--   2. Replaces all three write policies with that function. No policy reads
--      author_email again.
--   3. Fixes a second, functional bug found while writing this: the only
--      SELECT policy was `status = 'published'`, but the Blog Studio lists ALL
--      rows (listArticles has no status filter) and createArticle returns the
--      row it just inserted. Drafts were therefore invisible to their own
--      author, so "Save draft" and "Unpublish" could not work. Adds a
--      superadmin SELECT policy.
--   4. Stamps author_email server-side on every end-user write, so the column
--      can never be spoofed again — it becomes an accurate audit/byline field.
--
-- DEPLOY ORDER
-- ------------
-- Run AFTER the base table exists (docs/blog-admin-setup.md) and after
-- scripts/db/004_blog_seo_monetization.sql. Idempotent — safe to re-run.
-- Verify with scripts/db/verify_blog_articles_rls.sql.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0 · Preconditions — fail with an explanation, not a bare error
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.blog_articles') is null then
    raise exception
      'public.blog_articles does not exist. Create it first: run the table DDL in docs/blog-admin-setup.md, then scripts/db/004_blog_seo_monetization.sql, then re-run this file.';
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 1 · Identity, resolved from the JWT — the allowlist lives in exactly one
--     place now. Keep in sync with frontend/src/lib/superadmins.ts
--     (scripts/tests/test_blog_authz_parity.py enforces that).
-- ---------------------------------------------------------------------------
create or replace function public.is_blog_superadmin()
returns boolean
language sql
stable
security definer              -- reads auth.users, which the caller cannot see
set search_path = ''          -- fully-qualified body; no search_path hijacking
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) in (
        'shuvo.1807016@bau.edu.bd',
        'shuvoasifahmed@gmail.com',
        'asifahmedshuvo.aas@gmail.com'
      )
  );
$$;

comment on function public.is_blog_superadmin() is
  'True when the JWT subject (auth.uid()) belongs to a primary HazardNet blog superadmin. Resolves the email from auth.users at call time, so it is immune to client-supplied columns and to stale JWT email claims.';

-- Postgres grants EXECUTE to PUBLIC by default; be explicit so the write
-- policies produce a clean RLS violation for signed-out callers rather than a
-- "permission denied for function" error.
revoke all on function public.is_blog_superadmin() from public;
grant execute on function public.is_blog_superadmin() to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2 · Drop the vulnerable policies
--     (old names, plus a couple of plausible alternates from partially
--      migrated databases, so no permissive policy is left behind)
-- ---------------------------------------------------------------------------
drop policy if exists "blog_superadmin_write"  on public.blog_articles;
drop policy if exists "blog_superadmin_update" on public.blog_articles;
drop policy if exists "blog_superadmin_delete" on public.blog_articles;
drop policy if exists "blog_superadmin_insert" on public.blog_articles;
drop policy if exists "blog_superadmin_read"   on public.blog_articles;
drop policy if exists "blog_published_public_read" on public.blog_articles;


-- ---------------------------------------------------------------------------
-- 3 · Correct policies
-- ---------------------------------------------------------------------------

-- Public blog: anyone may read PUBLISHED articles.
create policy "blog_published_public_read"
  on public.blog_articles for select
  to anon, authenticated
  using (status = 'published');

-- Blog Studio: a superadmin may read everything, including their own drafts.
-- (SELECT policies are OR'd, so this widens nothing for the public.)
create policy "blog_superadmin_read"
  on public.blog_articles for select
  to authenticated
  using (public.is_blog_superadmin());

-- Writes: identity comes from the JWT, never from the row.
create policy "blog_superadmin_insert"
  on public.blog_articles for insert
  to authenticated
  with check (public.is_blog_superadmin());

create policy "blog_superadmin_update"
  on public.blog_articles for update
  to authenticated
  using (public.is_blog_superadmin())
  with check (public.is_blog_superadmin());

create policy "blog_superadmin_delete"
  on public.blog_articles for delete
  to authenticated
  using (public.is_blog_superadmin());


-- ---------------------------------------------------------------------------
-- 4 · Defence in depth — author_email can no longer be spoofed
--
--     Authz no longer reads this column, so a bad write here is no longer a
--     privilege escalation. This keeps it truthful anyway: it is shown in the
--     UI as "Publisher account (permissions)" and is useful for auditing.
--     Only end-user writes are stamped; service-role backfills are untouched.
-- ---------------------------------------------------------------------------
create or replace function public.blog_articles_stamp_author_email()
returns trigger
language plpgsql
security definer              -- must be able to call auth.uid()/auth.email():
                              -- an invoker-rights trigger would run as
                              -- `authenticated` and fail with "permission
                              -- denied for schema auth" on any deployment
                              -- where that role lacks USAGE on the auth
                              -- schema — which would break publishing too.
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_email := lower(coalesce(auth.email(), ''));
  end if;
  return new;
end;
$$;

drop trigger if exists blog_articles_stamp_author_email on public.blog_articles;
create trigger blog_articles_stamp_author_email
  before insert or update on public.blog_articles
  for each row execute function public.blog_articles_stamp_author_email();


-- ---------------------------------------------------------------------------
-- 5 · Make sure RLS is actually on (a table with RLS disabled ignores every
--     policy above and allows all writes)
-- ---------------------------------------------------------------------------
alter table public.blog_articles enable row level security;


-- ---------------------------------------------------------------------------
-- 6 · Self-check — aborts the migration if any write policy still trusts a
--     client-supplied column. Runs last, so a failure rolls the whole thing back.
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(p.policyname || ' (' || p.cmd || ')', ', ')
    into bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename  = 'blog_articles'
    and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
        ilike '%author_email%';

  if bad is not null then
    raise exception 'ABORTED: write policies still authorise on author_email: %', bad;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'blog_articles'
      and policyname = 'blog_superadmin_read'
  ) then
    raise exception 'ABORTED: blog_superadmin_read was not created (Blog Studio drafts would stay invisible).';
  end if;

  raise notice 'OK: blog_articles write policies no longer reference author_email.';
end
$$;
