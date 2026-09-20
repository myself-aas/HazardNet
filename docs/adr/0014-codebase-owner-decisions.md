# ADR 0014 — Owner decisions from codebase discovery

- **Status:** Accepted (2026-09-20).
- **Decision authority:** Project owner's explicit answers to the five discovery questions on 2026-09-20.
- **Supersedes:** ADR 0002's PostgreSQL forecast-store cutover decision.
- **Related:** ADR 0009 (now accepted), ADR 0012 (additional embargo classification).

## Decisions

1. **Approve ADR 0009.** Replace handwritten interactive inference with stored
   forecasts. The batch producer remains the inference source; the HTTP endpoint
   reads district/horizon results and must not fabricate missing fields.
2. **Ingestion success requires durable persistence.** An in-memory update or a
   committed snapshot fallback is not a successful Firestore write. Persistence
   failure must produce an explicit unsuccessful ingestion result, not a success
   row count. Read-side degraded fallbacks remain a separate concern.
3. **The “Vulnerability Formula” is embargoed research.** Withhold its formula,
   weights and derived research output from public surfaces. This resolves the
   third-item question in ADR 0012; it does not revoke that ADR's separate approvals
   for the two labelled presentation aggregations.
4. **Supersede the PostgreSQL forecast cutover.** Firestore remains the current
   application forecast store. ADR 0002 is historical, not an instruction to switch
   stores. This decision does not remove independent PostgreSQL/PostGIS spatial
   tooling or SQL reference schemas under `scripts/db/`.
5. **Do not add privileged authentication to the conversion endpoints as proposed.**
   Leave `/track`, `/dispatch`, `/reconciliation` and `/debug` unchanged. The owner
   declined the suggested auth requirement. This is an accepted access-control
   risk, not a claim that attribution/debug data is safe to expose or an instruction
   to relax any existing controls elsewhere.

## Decision versus implementation

Runtime implementation landed in the working tree on 2026-09-20. This does not
assert a production deployment or a live credentialed Firestore verification.

| Work item | Implemented behavior | Evidence |
|---|---|---|
| Stored-forecast prediction | Shared Express/Vercel reader; tensor scorer removed; UI shows stored provenance and missing fields | `backend/utils/storedPrediction.js`, `api/predict.js`, `frontend/src/components/StoredForecastPanel.tsx` |
| Durable ingestion | Dedicated Admin SDK writer, atomic replacement, memory updated after commit, write failure propagated | `backend/forecastPersistence.js`, `backend/forecastStore.js`, `__tests__/forecastPersistence.test.js`, `__tests__/forecastStore.test.js` |
| Research embargo | Formula, computed division score/ranking removed; known reintroduction patterns blocked | `frontend/src/components/NationalOverview.tsx`, `scripts/check-severity-embargo.mjs`, `__tests__/severityEmbargo.test.js` |
| PostgreSQL ADR supersession | ADR 0002 superseded; no PostgreSQL forecast switch | ADR 0002, current forecast store |
| Conversion auth proposal | Declined; no conversion route/auth change | `backend/routes/conversions.js` unchanged |

## Consequences

Deployment must provision privileged forecast-writer credentials. No write is
acknowledged merely because the snapshot/memory fallback changed. The transaction
limit rejects oversized replacements instead of partially applying them. Reads can
still use committed snapshots and must be interpreted with their producer dates.

See `docs/ops/2026-09-20-stored-forecasts.md` for request contracts, credential setup,
transaction limits, staging verification and remaining alert-store risks.

## Evidence

- Owner's five numbered responses in the codebase-discovery conversation, 2026-09-20.
- `backend/routes/predict.js`, `backend/utils/predictFromStore.js`
- `backend/forecastStore.js`, `backend/db.js`, `firestore.rules`
- `frontend/src/components/NationalOverview.tsx`, `scripts/check-severity-embargo.mjs`
- `backend/routes/conversions.js`, `docs/adr/0002-forecast-consolidation.md`, `docs/adr/0012-composite-index-classification.md`
