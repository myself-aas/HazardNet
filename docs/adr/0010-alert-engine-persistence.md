# ADR 0010 — Alert-engine persistence: self-host Postgres for lifecycle + audit, Firestore stays the forecast store

- **Status:** Proposed (2026-09-17) — Phase 4 dependency; nothing is built on it yet.
- **Context:** deployment plan Phase 4 (alert state machine, HITL review, audit trail, idempotency);
  `docs/PRODUCT_SPEC.md` §1.3/§1.6; ADR 0002 (forecast consolidation — Firestore as forecast store);
  `docs/PRODUCT_SPEC.md` §5.8 (provenance); the 2026-09-17 Firestore rules findings (SEC-02/SEC-05)

## Context

Phase 4 introduces the first **stateful, transactional workflow** in HazardNet: an alert moves
`DRAFT → PENDING_REVIEW → PUBLISHED → UPDATED → EXPIRED/ALL_CLEAR`, with a reviewer identity, a
reason on rejection, before/after values on every mutation, and an evidence snapshot frozen at
publication time. That is an audit-log-with-workflow problem, not a cache.

Today's storage:

| Store | Holds | Notes |
| ----- | ----- | ----- |
| Firestore (`backend/db.js`, `backend/forecastStore.js`) | `forecasts` collection — append-only, district/horizon keyed, read-only to clients | Works; ADR 0002 keeps it |
| self-host Postgres | `blog_articles` (RLS per ADR 0006 of the blog setup) + the cutover tooling already in `scripts/db/` | Already deployed, already the identity for content |
| Committed snapshot (`frontend/public/data/forecasts-latest.json`) | the forecast the site serves when the API is unreachable | ADR 0008 |
| Firestore rules | per-collection access control | Hand-tuned; two authorization defects found on 2026-09-17 |

## Decision

1. **Forecasts stay where they are.** No migration. The `forecasts` collection is append-only,
   keyed by `(district_id, horizon, prediction_date)`, and read-mostly — SQL buys nothing it needs.
   ADR 0002 stands.
2. **Alert lifecycle + audit go to self-host Postgres**, in a new `alerts` schema with
   `alerts`, `alert_reviews`, `alert_audit` tables and (when server-side geometry is actually needed)
   the PostGIS extension. Reasons, in order of weight:
   - **Transactions across rows.** Publishing = insert alert version + append audit row + flip the
     previous version to `UPDATED` + enqueue notifications. One transaction, or the audit trail lies.
     Firestore's batched writes cover most of this but cannot express "publish iff the reviewer
     still holds the `alert.review` role and the evidence snapshot is unchanged" without optimistic
     concurrency the client then has to re-implement.
   - **The audit trail must be queryable and append-only by construction.** `INSERT`-only grants,
     `created_at`/`actor`/`before`/`after` columns, and SQL views for "who published what, when"
     are boring and provable. `firestore.rules` would need to express the same guarantees per
     collection, and this codebase already demonstrates (SEC-02/SEC-05, 2026-09-17) how easily that
     drifts.
   - **One reviewer identity model.** Postgres is already the identity used for content authorization;
     the alert gate should not invent a second one.
   - **PostGIS without a new service.** IF containment (which ADM3 unit / district contains a report's
     coordinates) is needed server-side, it is available in the same database. Postgres's PostGIS is
     standard; there is no premium tier requirement.
3. **Geospatial work is deferred, not assumed.** v1 alerts do not need PostGIS: district/upazila
   containment can be resolved from the committed HDX COD-AB boundaries (ADR 0005) in the client or
   in a lookup table. PostGIS enters when the first *server-side* spatial join or aggregate appears —
   e.g. "all reports inside a union", "severity raster clipped to a district". **Trigger:** the first
   endpoint whose answer requires geometry computed in the database rather than in the app.
4. **Rules of the road for whoever writes the schema** (carried from the 2026-09-17 findings, so the
   new tables cannot repeat them):
   - RLS on every table, default-deny; the allowlist for review actions is the
     `frontend/src/lib/superadmins.ts` list, mirrored into a role/claim check, and
     `scripts/tests/test_blog_authz_parity.py` is extended to cover the new tables in the same change.
   - No policy may authorize on a client-supplied column (the `author_email` defect class).
   - `SECURITY DEFINER` helpers pin `search_path`; identity comes from the JWT (`auth.uid()`).
   - Every mutation writes an audit row in the same transaction; exports of an alert carry the
     evidence snapshot's model version and data cutoff.
5. **Nothing is deleted from Firestore as part of this.** If alerts later subsume some forecast
   storage, that is a separate ADR with a migration plan (expand → migrate → contract).

## Consequences

- Phase 4 gets transactional review/audit semantics without touching the forecast path, so the
  daily pipeline and the site keep working unchanged while the alert engine is built.
- The project gains a second database to operate — mitigated by the fact that Postgres is already in
  the stack for content, so this is a second *schema*, not a second vendor.
- Backup/PITR, migration tooling (Alembic-style expand/migrate/contract, as the deployment plan
  Step 20 specifies) and CI database tests become requirements for Phase 4, not optional extras.
- The disclosure posture improves for free: `alert_audit` makes "we said X, at time T, because Y"
  answerable to a duty officer, a journalist or an auditor — which is the point of the HITL rule.

## Verification

- Phase 4 acceptance: a publish attempt by a non-reviewer is rejected at the database (not the UI);
  every state transition has exactly one audit row; a rejected alert stores its reason and feeds the
  Phase 3 feedback set; re-running a publish with the same idempotency key has no double effect.
- Falsified if: alerts are built with no audit requirement, or a second service (e.g. Redis queues)
  is added to hold state that belongs in these tables.
