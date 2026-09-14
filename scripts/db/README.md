# Database migrations — single source of truth

This directory is the **only** home for SQL schema migrations (the duplicate
`backend/migrations/001_create_forecasts.sql` — which conflicted on the `id`
column type, SERIAL vs UUID — was removed by the P3 re-audit program, N-4).

Apply order:
1. `001_init_forecasts.sql` — initial forecasts table (Supabase Postgres)
2. `002_forecasts_supabase.sql` — ADR 0002 forecast consolidation schema
   (RLS: public read, service-role write)
3. `003_user_dashboard.sql` — profiles, connectors, avatars storage, public
   profile visibility (RLS: `auth.uid()`-scoped)
4. `003_adm3_spatial_postgis.sql` — ADM3 boundaries / PostGIS spatial helpers
   (independent of the numbered order; safe to apply any time)
5. `004_blog_seo_monetization.sql` — SEO, byline and monetization columns on
   `blog_articles`
6. `005_forecasts_horizons_7_15.sql` — extends forecast horizons
7. `006_blog_articles_rls_authz.sql` — **security fix.** Replaces the
   `blog_articles` write policies, which authorised on the client-supplied
   `author_email` column (any registered user could publish, rewrite or delete
   every article) with ones keyed on `auth.uid()`. Also adds the missing
   superadmin SELECT policy: without it the Blog Studio cannot list its own
   drafts and "Save draft"/"Unpublish" fail with a misleading RLS error.
8. `007_forecasts_meteorological.sql` — adds the eight Open-Meteo
   meteorological columns the weekly notebook emits (`temperature_mean`,
   `temperature_max`, `temperature_min`, `precipitation_mm`, `wind_max_kmh`,
   `dewpoint_mean`, `solar_radiation_mj_m2`, `evapotranspiration_mm`). Before
   this, the Supabase ingest wrote an explicit 15-column INSERT that simply
   omitted them, so every weather value was silently dropped between the CSV
   and the API — no error, just NULLs. Run after `002`.

All files are idempotent (`if not exists` / `drop policy if exists`), so
re-running one is safe.

## Verifying the meteorological columns

`verify_forecasts_meteorological.sql` is the check for `007` (same contract as
the blog verifier above: run it in the Supabase SQL editor, expect FAILs
before, PASSes after). It is read-only, and it deliberately inspects stored
rows through `to_jsonb()` so it reports FAIL instead of erroring on a database
where the columns do not exist yet.

**Apply `007` before the next ingest run.** The Supabase store now names the
eight columns in its INSERT, so on a database without them the ingest fails
outright with `column "temperature_mean" of relation "forecasts" does not
exist` rather than silently dropping the values as it did before.

## Verifying the blog security fix

`verify_blog_articles_rls.sql` is **not** a migration — it is a self-assessing
check you run in the Supabase SQL editor. Run it before `006` (expect FAILs on
the `author_email` rows, which means the database is currently exploitable) and
again after (expect every row to read PASS). It is read-only: every behavioural
probe runs inside a subtransaction that is always rolled back, so it never
creates, alters or deletes a row.

Run migrations in Supabase (SQL editor or `supabase db push`). The forecast
cutover checklist lives in `docs/adr/0002-forecast-consolidation.md`.
