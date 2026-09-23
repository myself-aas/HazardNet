# Database schemas — single source of truth

This directory is the **only** home for SQL schemas and self-host Postgres
modules. HazardNet's production store is **Firebase/Firestore** (forecast
store, profiles, assessments, connectors, blog articles, alerts). The SQL files
here are kept for the self-host spatial/analytics modules that Postgres serves.

Files:

1. `001_init_forecasts.sql` — the original forecasts table shape (Postgres),
   superseded by the Firestore forecast store for production serving.
2. `003_user_dashboard.sql` — the dashboard profile fields (kept for reference
   against the Firestore `profiles` document field names).
3. `003_adm3_spatial_postgis.sql` — ADM3 boundaries / PostGIS spatial helpers
   (independent; safe to apply any time).
4. `004_blog_seo_monetization.sql` — SEO, byline and monetization columns on
   `blog_articles` (reference for the Firestore collection fields).
5. `005_forecasts_horizons_7_15.sql` — extends forecast horizons.
6. `006_blog_articles_rls_authz.sql` — **security reference.** Documents the
   blog write policy hardening (never authorise on a client-supplied column);
   the Firestore equivalent enforcement lives in `firestore.rules`.
7. `007_forecasts_meteorological.sql` — the eight meteorological
   columns the weekly notebook emits (`temperature_mean`, `temperature_max`,
   `temperature_min`, `precipitation_mm`, `wind_max_kmh`, `dewpoint_mean`,
   `solar_radiation_mj_m2`, `evapotranspiration_mm`).
8. `008_hazard_events_postgis.sql` — the historical hazard-event store that backs
   the `w4` prior: `hazard_events`, the 64-row `hazard_event_districts`
   validation snapshot it references, `hazard_event_ingest_runs` (per-run counts
   and the drift against the 2,931 events quoted in `docs/MODEL_CARD.md` §4), two
   aggregate materialized views and the `hazard_event_prior()` recency-weighted
   scoring function. **Requires PostGIS.** Independent of the numbered order;
   safe to apply any time. The tables start **empty by design** — loading is
   `the events ingest step` ; no rows are invented
   and nothing is seeded, because a fabricated history would silently distort a
   district's prior.

All files are idempotent (`if not exists` / `drop policy if exists`), so
re-running one is safe.

## Verifying the historical event store

`verify_hazard_events.sql` is the check for `008` (same contract: run it in the
SQL editor, expect FAILs before, PASSes after). It is read-only and has three
parts: schema (tables, the eight-class CHECK, the `(source, source_record_id)`
unique key, the GiST index, the 64 seeded districts), data quality (coverage,
severity coverage, derived geometry, no future-dated events, aggregates in sync,
the prior function inside `[0,1]`), and the model-card claim — where an empty
store reads **WARN**, not FAIL, because an empty store is the correct state of a
freshly migrated database.

## Blog authorisation

The canonical, enforced blog-authorisation rules are `firestore.rules` at the
repository root (`isBlogSuperadmin()`) and the matching allowlist in
`frontend/src/lib/superadmins.ts`. `006_blog_articles_rls_authz.sql` and
`verify_blog_articles_rls.sql` are the Postgres self-host equivalents of that
same policy.
