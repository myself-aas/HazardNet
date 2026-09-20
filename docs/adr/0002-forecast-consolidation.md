# ADR 0002 — Consolidate forecast storage from Firestore to Postgres

- **Status:** Accepted (2026-08-28) — **expand phase implemented 2026-09-12**; cutover flip pending ops (credentials)
- **Context:** Audit ARC-01; ADR 0001 declares Postgres the system of record

## Context

Forecasts are written by the weekly Kaggle pipeline (→ Postgres via `DATABASE_URL`)
*and* by the serverless ingest path (→ Firestore via the AI-Studio applet
database). Two stores hold the same domain data with different access rules,
and the frontend reads the Firestore copy. This is the last piece of the
three-backend split.

## Decision (when executed)

1. Adopt the Postgres schema in `scripts/db/002_forecasts_postgres.sql`
   (table `forecasts`, RLS policy: public read, service-role write).
2. Migrate existing Firestore rows with `scripts/migrate-firestore-to-postgres.mjs`
   (dry-run by default; destructive only with `FIRESTORE_TO_POSTGRES_MIGRATION=RUN`).
3. Flip readers: `backend/routes/forecasts.js` GET paths → Postgres; the
   serverless `api/ingest.js` writer → Postgres (pg or firebase-js).
4. Retire: `firebase-applet-config.json`, the Firestore database reference in
   `backend/db.js`, and the `VITE_FIREBASE_FIRESTORE_DATABASE_ID` config slot.
   Firebase RTDB (presence) remains per ADR 0001 until separately migrated.

## Execution — expand phase (2026-09-12, code half)

The cutover was executed expand→migrate→contract. The **expand** step is merged
into the code so that the actual flip is a pure ops action (no code change):

- **Single access layer:** `backend/forecastStore.js` — every forecast
  read/write in `backend/` and `api/` now goes through `getForecastStore()`.
  `FORECAST_STORE` selects the implementation (`firestore` default |
  `postgres`), fixed at first call; `getForecastStoreMode()` exposes the
  selection; `resetForecastStore()` is the test hook. Consumers:
  `backend/routes/forecasts.js` (POST `/update`, GET `/`, GET `/bulk`),
  `api/forecasts.js`, `api/ingest.js`. No consumer imports `backend/db.js`
  anymore; that module survives only as the store's Firestore implementation
  (and the migration script's source reader) until the contract step.
- **Byte-compatible API:** the Postgres implementation coerces pg's string
  numerics and `Date` objects back to the exact Firestore row shape (numbers as
  JS numbers, `target_date`/`prediction_date` as `YYYY-MM-DD` strings,
  `created_at` as ISO string, `district_id` as number) — verified by
  `__tests__/forecastStore.test.js` (16 tests: mode selection incl. fail-loud
  without `DATABASE_URL`, Firestore latest-per-district grouping + batch
  replace, Postgres `DISTINCT ON` query, delete+insert transaction with
  rollback on failure, upsert-only append, row-shape parity, and the
  `getLatestPredictionDate` freshness probes on both implementations — added
  with backlog 5's monitoring gauge).
- **Schema:** `scripts/db/002_forecasts_postgres.sql` extended to the notebook's
  dual-track columns (`model_severity`, `physics_severity`, `division`,
  `pcode`), with idempotent `alter table … add column if not exists` guards and
  a `forecasts_horizon_idx` index. Upsert conflict key:
  `(district_id, horizon, hazard_type, target_date, prediction_date)`.
- **Migration:** `scripts/migrate-firestore-to-postgres.mjs` reads and writes
  the dual-track fields.
- **Fail-loud wiring:** `backend/server.js` logs a problems-level config error
  when `FORECAST_STORE=postgres` but `DATABASE_URL` is unset;
  `.github/workflows/weekly_forecast.yml` passes
  `FORECAST_STORE: ${{ vars.FORECAST_STORE || 'firestore' }}` +
  `DATABASE_URL: ${{ secrets.DATABASE_URL }}` (no-ops until activated).
- **Env documentation:** root `.env.example` and `frontend/.env.example`
  enumerate all runtime env vars incl. the cutover set.

## Ops runbook (migrate + flip — executing 2026-09-12; requires Postgres credentials)

**Credential protocol (least exposure):** the self-host Postgres connection
string enters only transient `DATABASE_URL` env vars on single commands —
never a file, never a commit, never echoed. The GitHub side is set directly
as the repo secret `DATABASE_URL` via `gh secret set` (not persisted
locally). Rotate the database password in the Firebase console afterwards
if desired.

0. **Hand-off:** owner provides the connection string; agent runs the steps.
1. **Apply the schema** — either the Postgres SQL editor with
   `scripts/db/002_forecasts_postgres.sql`, or the agent applies it over pg
   (idempotent — safe on a partially-migrated database).
2. **Verify the schema:** `DATABASE_URL=… node scripts/verify-postgres-cutover.mjs`
   (ADR checklist as code: 15-column schema, 10/20/30 CHECK, unique key,
   indexes, RLS + public-read policy, row report). Automated equivalent:
   the **Postgres cutover verify** workflow (`.github/workflows/
   postgres-cutover-verify.yml`, manual dispatch) runs the checklist against
   the `DATABASE_URL` secret **and** boots the backend in postgres mode
   for the live API smoke — usable from any branch, no local env needed.
3. **Migrate** (Firestore is expected empty — the pipeline never successfully
   wrote): `node scripts/migrate-firestore-to-postgres.mjs` (dry-run), then
   `FIRESTORE_TO_POSTGRES_MIGRATION=RUN …` if rows exist. Legacy 7/15-era
   rows are skipped and reported, never migrated (ADR 0005 CHECK).
4. **Flip the flags:** `gh secret set DATABASE_URL` + `gh variable set
   FORECAST_STORE --body postgres` (workflow), and set `DATABASE_URL` +
   `FORECAST_STORE=postgres` in the Vercel project env (dashboard — no agent
   access) and any backend runtime.
5. **Live smoke** with `FORECAST_STORE=postgres node backend/server.js`:
   `/health` 200, `/api/v1/forecasts/bulk?horizon=10_days` 200,
   `/metrics` 200 with the freshness gauge absent-or-set (store state),
   `/history` 200.
6. **Contract step (after the checklist passes):** delete the store's
   Firestore branch, `backend/db.js`, `firebase-applet-config.json`, and the
   `VITE_FIREBASE_FIRESTORE_DATABASE_ID` slot.

## Consequences

- One storage engine for all relational domain data; rules live in Postgres RLS.
- The weekly pipeline and the API converge on one write path.
- Frontend forecast reads switch from Firestore SDK queries to the backend API
  (already the case for most consumers via `/api/v1/forecasts`).
- Until the flip, the two implementations coexist behind the store interface;
  new forecast features must code against `forecastStore.js`, never
  `backend/db.js` directly.

## Verification checklist (before closing this ADR)

- [x] `/api/v1/forecasts` endpoints return identical JSON shapes across both
      implementations (store-level row parity asserted in
      `__tests__/forecastStore.test.js`; route responses verified unchanged by
      the existing `forecastsUpdate`/`ingest` suites + live smoke test)
- [x] Ingest writes land through the store in both modes (transaction/rollback
      and upsert paths unit-tested; postgres mode wired end-to-end — live smoke
      with a dummy `DATABASE_URL` fails loud with the pg error, proving the
      path is active)
- [ ] `scripts/db/002_forecasts_postgres.sql` applied in Postgres
      (runbook step 1; verified by `scripts/verify-postgres-cutover.mjs`)
      — **2026-09-19: neither file is in the repository**, and neither is
      `scripts/migrate-firestore-to-postgres.mjs` (runbook step 3). The
      `Postgres-cutover-verify` workflow used to invoke the missing verifier and
      failed every dispatch with `Cannot find module`; it now preflights the three
      paths and names them. Writing them, or retiring this workflow and striking
      these references, is `docs/ops/owner-actions.md` Action 14.
- [ ] Migration executed / confirmed unnecessary (Firestore expected empty;
      dry-run reports the count — runbook step 3)
- [ ] `FORECAST_STORE=postgres` + `DATABASE_URL` set in backend/Vercel/workflow;
      weekly pipeline writes land in Postgres and are visible to the frontend (ops)
- [ ] Contract step: Firestore reads/writes removed from `backend/` and `api/`
      (delete the firestore branch, `backend/db.js`, `firebase-applet-config.json`)
