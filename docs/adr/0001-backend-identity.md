# ADR 0001 — Backend platform identity & configuration consolidation

> **Superseded 2026-09-14:** Firebase is canonical. See [ADR 0009](0009-firebase-model-and-deployment-contract.md). The Supabase cutover instructions below are historical, not an active runbook.

- **Status:** Accepted (2026-08-28)
- **Context:** Audit findings ARC-01 / SEC-07
- **Deciders:** HazardNet maintainers

## Context

The codebase simultaneously wires **three** backend platforms:

| Concern | Platform today | Files |
| --- | --- | --- |
| Auth, profiles, assessments | Supabase (Postgres + Auth) | `frontend/src/lib/supabase.ts`, `context/AuthContext.tsx` |
| Forecast storage | Firestore (AI-Studio applet database) | `backend/db.js` (`firebase-applet-config.json`), `api/*` |
| Realtime connectivity status | Firebase RTDB | `frontend/src/services/firebase.ts` |
| *(orphan, removed 2026-08-28)* | Firebase project `hazardnet-live` | `frontend/src/firebase.ts` — deleted (P0-8) |

Every new feature had to guess which backend applied, and two divergent Firebase
project configs were committed.

## Decision

1. **Supabase is the system of record for identity and relational domain data**
   (users, profiles, assessments, and — after migration — forecasts).
2. **Firebase remains only for what genuinely needs it today:** the RTDB
   presence/telemetry indicator and the applet Firestore database that the
   weekly Kaggle pipeline and serverless functions write to. Both are
   scheduled for consolidation into Supabase (P2) — until then they are
   *explicitly tolerated legacy*, funneled through one config module.
3. **One config module:** `frontend/src/lib/config.ts` is the only place a
   Firebase client config literal may exist; per-environment values come from
   `VITE_FIREBASE_*` env vars. Backend keeps `firebase-applet-config.json`
   (documented legacy; env-first refactor lands with the P2 migration).
4. No new backend platform may be introduced without a new ADR.

## Consequences

- `services/firebase.ts` imports from `lib/config.ts`; the second config
  literal is gone. A third config must never be re-created.
- The P2 forecast migration (Firestore → Supabase) deletes the applet config
  and `firebase-applet-config.json`, collapsing the stack to one platform
  plus RTDB (or Supabase Realtime, decided at migration time).
- Deploys must set `VITE_FIREBASE_*` env vars; defaults are convenience-only.
