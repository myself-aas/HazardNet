# ADR 0002 — Consolidate forecast storage from Firestore to Supabase

- **Status:** Proposed (2026-08-28) — execution scheduled as the final P2 step
- **Context:** Audit ARC-01; ADR 0001 declares Supabase the system of record

## Context

Forecasts are written by the weekly Kaggle pipeline (→ Supabase via `DATABASE_URL`)
*and* by the serverless ingest path (→ Firestore via the AI-Studio applet
database). Two stores hold the same domain data with different access rules,
and the frontend reads the Firestore copy. This is the last piece of the
three-backend split.

## Decision (when executed)

1. Adopt the Supabase schema in `scripts/db/002_forecasts_supabase.sql`
   (table `forecasts`, RLS policy: public read, service-role write).
2. Migrate existing Firestore rows with `scripts/migrate-firestore-to-supabase.mjs`
   (dry-run by default; destructive only with `FIRESTORE_TO_SUPABASE_MIGRATION=RUN`).
3. Flip readers: `backend/routes/forecasts.js` GET paths → Supabase; the
   serverless `api/ingest.js` writer → Supabase (pg or supabase-js).
4. Retire: `firebase-applet-config.json`, the Firestore database reference in
   `backend/db.js`, and the `VITE_FIREBASE_FIRESTORE_DATABASE_ID` config slot.
   Firebase RTDB (presence) remains per ADR 0001 until separately migrated.

## Consequences

- One storage engine for all relational domain data; rules live in Supabase RLS.
- The weekly pipeline and the API converge on one write path.
- Frontend forecast reads switch from Firestore SDK queries to the backend API
  (already the case for most consumers via `/api/v1/forecasts`).

## Verification checklist (before closing this ADR)

- [ ] Row counts match post-migration (`select count(*)` vs Firestore snapshot)
- [ ] `/api/v1/forecasts` endpoints return identical JSON shapes
- [ ] Weekly pipeline writes land in Supabase and are visible to the frontend
- [ ] Firestore reads/writes removed from `backend/` and `api/`
