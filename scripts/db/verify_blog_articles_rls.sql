-- =============================================================================
-- HazardNet · verify_blog_articles_rls.sql
--
-- Self-assessing verification for the blog_articles authorisation fix.
-- Run it in the Supabase SQL editor TWICE:
--
--   • BEFORE scripts/db/006_blog_articles_rls_authz.sql — expect FAILs. A FAIL
--     on the "author_email" checks means your database is currently vulnerable.
--   • AFTER  it — expect every row to read PASS.
--
-- It is READ-ONLY: part 1 only inspects catalogs, and every behavioural probe
-- in part 2 runs inside a subtransaction that is always rolled back, so no row
-- is ever created, altered or deleted (including on a FAILing database, and
-- even if the role switch is unavailable).
-- =============================================================================


-- =============================================================================
-- PART 1 · Static assertions
-- =============================================================================
with t as (
  select to_regclass('public.blog_articles') as oid
),
pol as (
  select p.*
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'blog_articles'
),
write_pol as (
  select * from pol where cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
),
spoofing as (
  select string_agg(policyname || ' [' || cmd || ']', ', ' order by policyname) as names
  from write_pol
  where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%author_email%'
)
select check_name, status, detail
from (
  -- 1 · the table must exist and have RLS switched on
  select 1 as ord, 'table exists' as check_name,
    case when (select oid from t) is not null then 'PASS' else 'FAIL' end as status,
    coalesce((select oid::text from t), 'public.blog_articles is missing') as detail

  union all
  select 2, 'row level security enabled',
    case when exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'blog_articles' and c.relrowsecurity
    ) then 'PASS' else 'FAIL' end,
    'RLS off means every policy below is ignored and all writes are allowed'

  -- 2 · THE CRITICAL CHECK — no write policy may read a client-supplied column
  union all
  select 3, 'no write policy authorises on author_email',
    case when (select names from spoofing) is null then 'PASS' else 'FAIL' end,
    coalesce('offending: ' || (select names from spoofing),
             'identity comes from auth.uid(), not from the row')

  union all
  select 4, 'write policies restricted to role authenticated',
    case when exists (select 1 from write_pol where roles::text not like '%authenticated%'
                      or roles::text like '%anon%')
         then 'FAIL' else 'PASS' end,
    coalesce((select string_agg(policyname || '→' || roles::text, ', ') from write_pol), 'no write policies')

  union all
  select 5, 'four expected policies present',
    case when (select count(*) from pol) >= 4 then 'PASS' else 'FAIL' end,
    coalesce((select string_agg(policyname, ', ' order by policyname) from pol), 'none')

  -- 3 · the functional bug: drafts must be readable by their author
  union all
  select 6, 'superadmin SELECT policy exists (Studio drafts)',
    case when exists (select 1 from pol where cmd = 'SELECT' and policyname = 'blog_superadmin_read')
         then 'PASS' else 'FAIL' end,
    'without it listArticles() cannot see drafts and save-draft/unpublish fail'

  union all
  select 7, 'public SELECT limited to published',
    case when exists (select 1 from pol where cmd = 'SELECT' and coalesce(qual,'') ilike '%published%')
         then 'PASS' else 'FAIL' end,
    coalesce((select string_agg(policyname || ': ' || coalesce(qual,''), ' | ')
              from pol where cmd = 'SELECT'), 'no SELECT policies')

  -- 4 · the identity helper
  union all
  select 8, 'is_blog_superadmin() is SECURITY DEFINER',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_blog_superadmin' and p.prosecdef
    ) then 'PASS' else 'FAIL' end,
    'it must read auth.users, which the calling role cannot see'

  union all
  select 9, 'is_blog_superadmin() pins search_path',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_blog_superadmin'
        and array_to_string(p.proconfig, ',') like '%search_path=%'
    ) then 'PASS' else 'FAIL' end,
    'an unpinned search_path on a SECURITY DEFINER function is exploitable'

  -- 5 · defence in depth
  union all
  select 10, 'author_email stamp trigger installed',
    case when exists (select 1 from pg_trigger where tgname = 'blog_articles_stamp_author_email')
         then 'PASS' else 'FAIL' end,
    'stamps the real email server-side so the column cannot be spoofed'

  -- 6 · distinguish "RLS refused" from "no table grant" before trusting part 2
  union all
  select 11, 'authenticated role has table privileges',
    case when (select oid from t) is null then 'FAIL'
         when has_table_privilege('authenticated', 'public.blog_articles', 'INSERT')
          and has_table_privilege('authenticated', 'public.blog_articles', 'SELECT')
         then 'PASS' else 'FAIL' end,
    'if this FAILs, part 2 probes are SKIPping for the wrong reason (grants, not policies)'
) s
order by ord;


-- =============================================================================
-- PART 2 · Behavioural proof — does it actually refuse the real attack?
--
-- Impersonates real accounts via the JWT claim mechanism Supabase itself uses
-- (auth.uid() / auth.email() read these settings), then attempts the exact
-- writes the vulnerability allowed. Every attempt is wrapped in a plpgsql
-- subtransaction that ALWAYS ends by raising, so nothing is persisted.
-- =============================================================================
do $$
declare
  super_emails constant text[] := array[
    'shuvo.1807016@bau.edu.bd',
    'shuvoasifahmed@gmail.com',
    'asifahmedshuvo.aas@gmail.com'
  ];
  v_super_uid    uuid;
  v_super_email  text;
  v_other_uid    uuid;
  v_other_email  text;
  v_before       bigint;
  v_after        bigint;
  v_role_ok      boolean;
  v_spoof_email  constant text := 'shuvo.1807016@bau.edu.bd';   -- the address an attacker would claim
  v_slug         text := 'rls-verification-probe-' || replace(gen_random_uuid()::text, '-', '');
begin
  if to_regclass('public.blog_articles') is null then
    raise notice 'SKIP: public.blog_articles does not exist — run the base table DDL first.';
    return;
  end if;

  select count(*) into v_before from public.blog_articles;

  -- A genuine superadmin, if one has signed up.
  select u.id, u.email into v_super_uid, v_super_email
  from auth.users u
  where lower(u.email) = any (super_emails)
  limit 1;

  -- Any other real account — the attacker's starting point.
  select u.id, u.email into v_other_uid, v_other_email
  from auth.users u
  where u.email is not null and lower(u.email) <> all (super_emails)
  limit 1;

  raise notice '---';

  -- ── PROBE 1 · non-superadmin INSERT while claiming a superadmin address ───
  -- This is the exact request the old policies accepted.
  if v_other_uid is null then
    raise notice 'PROBE 1  SKIP    no non-superadmin account exists in auth.users to impersonate';
  else
    v_role_ok := false;
    begin
      perform set_config('role', 'authenticated', true);
      v_role_ok := true;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_other_uid, 'email', v_other_email,
                          'role', 'authenticated')::text, true);

      insert into public.blog_articles (slug, title, status, author_email)
      values (v_slug || '-insert', 'RLS verification probe', 'published', v_spoof_email);

      raise exception 'PROBE_ALLOWED' using errcode = 'P0001';
    exception
      when sqlstate 'P0001' then
        raise notice 'PROBE 1  FAIL    non-superadmin INSERT was ALLOWED while claiming %  ← still vulnerable', v_spoof_email;
      when others then
        if not v_role_ok then
          raise notice 'PROBE 1  SKIP    could not switch to role authenticated (%)', sqlerrm;
        else
          raise notice 'PROBE 1  PASS    INSERT refused [%] %', sqlstate, sqlerrm;
        end if;
    end;
  end if;

  -- ── PROBE 2 · non-superadmin DELETE of a real article ────────────────────
  -- The destructive vector: the old delete policy tested the row's own
  -- author_email, which every genuine article matches.
  if v_other_uid is null then
    raise notice 'PROBE 2  SKIP    no non-superadmin account to impersonate';
  elsif (select count(*) from public.blog_articles) = 0 then
    raise notice 'PROBE 2  SKIP    blog_articles is empty — nothing to attempt to delete';
  else
    v_role_ok := false;
    begin
      perform set_config('role', 'authenticated', true);
      v_role_ok := true;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_other_uid, 'email', v_other_email,
                          'role', 'authenticated')::text, true);

      delete from public.blog_articles
      where id in (select id from public.blog_articles limit 1);

      -- Both exits must RAISE. A subtransaction only restores the role and JWT
      -- claims set above if it ABORTS, so a bare "no rows deleted" path would
      -- leave this session impersonating the attacker for the rest of the run
      -- (and make the residue count below RLS-filtered and meaningless).
      if not found then
        raise exception 'PROBE_NOTHING_MATCHED' using errcode = 'P0002';
      end if;
      raise exception 'PROBE_ALLOWED' using errcode = 'P0001';
    exception
      when sqlstate 'P0002' then
        raise notice 'PROBE 2  PASS    DELETE matched no rows the policy allows (nothing deleted)';
      when sqlstate 'P0001' then
        raise notice 'PROBE 2  FAIL    non-superadmin DELETE succeeded  ← still vulnerable';
      when others then
        if not v_role_ok then
          raise notice 'PROBE 2  SKIP    could not switch to role authenticated (%)', sqlerrm;
        else
          raise notice 'PROBE 2  PASS    DELETE refused [%] %', sqlstate, sqlerrm;
        end if;
    end;
  end if;

  -- ── PROBE 3 · the real superadmin must still be able to write ────────────
  -- Fails loudly if the migration locked out the legitimate user.
  if v_super_uid is null then
    raise notice 'PROBE 3  SKIP    no superadmin account found in auth.users (sign in once, then re-run)';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_super_uid, 'email', v_super_email,
                          'role', 'authenticated')::text, true);

      -- author_email is supplied here on purpose: this probe must answer only
      -- "did the migration lock the legitimate user out?", so it writes the
      -- value the OLD policy also accepted. A PASS before and after isolates
      -- the change.
      insert into public.blog_articles (slug, title, status, author_email)
      values (v_slug || '-super', 'RLS verification probe (superadmin)', 'draft', v_super_email);

      -- Roll back deliberately: the probe must leave no trace.
      raise exception 'PROBE_OK' using errcode = 'P0001';
    exception
      when sqlstate 'P0001' then
        raise notice 'PROBE 3  PASS    superadmin INSERT allowed (%) and rolled back', v_super_email;
      when others then
        raise notice 'PROBE 3  FAIL    superadmin was BLOCKED [%] %  ← the migration is too strict',
          sqlstate, sqlerrm;
    end;
  end if;

  -- ── residue check: part 2 must not have changed the table ────────────────
  -- Drop any impersonation the probes may have left behind, otherwise this
  -- count runs under RLS and a leftover attacker session would hide the very
  -- residue it is meant to detect.
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    raise notice 'PROBE R  WARN    could not reset session role (%) — the count below may be RLS-filtered', sqlerrm;
  end;

  v_after := 0;
  begin
    select count(*) into v_after from public.blog_articles;
    if v_after = v_before then
      raise notice 'PROBE R  PASS    row count unchanged (% before, % after) — probes left no residue',
        v_before, v_after;
    else
      raise notice 'PROBE R  FAIL    row count changed: % → %  ← probes were not rolled back!',
        v_before, v_after;
    end if;
  exception when others then
    raise notice 'PROBE R  SKIP    could not recount rows (%)', sqlerrm;
  end;

  raise notice '---';
  raise notice 'Every probe above is rolled back. No article was created, changed or deleted.';
end
$$;
