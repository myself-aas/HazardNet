# Database migrations — single source of truth

This directory is the **only** home for SQL schema migrations (the duplicate
`backend/migrations/001_create_forecasts.sql` — which conflicted on the `id`
column type, SERIAL vs UUID — was removed by the P3 re-audit program, N-4).

Apply order:
1. `001_init_forecasts.sql` — initial forecasts table (Supabase Postgres)
2. `002_forecasts_supabase.sql` — ADR 0002 forecast consolidation schema
   (RLS: public read, service-role write)

Run in Supabase (SQL editor or `supabase db push`). The forecast cutover
checklist lives in `docs/adr/0002-forecast-consolidation.md`.
