# ADR 0001 — Backend platform identity & configuration consolidation

- **Status:** Superseded by ADR 0001-r1 (2026-09-19)
- **Context:** Audit findings ARC-01 / SEC-07
- **Deciders:** HazardNet maintainers

> ## Supersession note (2026-09-19)
>
> The direction decided here — Postgres as the system of record for identity
> and relational domain data — has been **reversed**. As of the Firebase
> cutover (2026-09-19), **Firebase is the single database for HazardNet**:
> Authentication (email/password + Google + GitHub), Firestore (profiles,
> assessments, connectors, blog articles, alerts, forecasts), and
> Realtime Database (presence) all live in one Firebase project
> (`hazardnet-aas48424`). `scripts/db/*.sql` remain as self-host/analytics
> schema modules only, and no second database is authorized.
>
> The original decision text is preserved below for the historical record.

## Context (original, 2026-08-28)

The codebase simultaneously threaded **three** backend platforms:

| Concern | Platform at the time | Files at the time |
| --- | --- | --- |
| Auth, profiles, assessments | a second Postgres/Auth vendor | `context/AuthContext.tsx` |
| Forecast storage | Firestore (AI-Studio applet database) | `backend/db.js` (`firebase-applet-config.json`), `api/*` |
| Realtime connectivity status | Firebase RTDB | `frontend/src/services/firebase.ts` |
| *(orphan, removed 2026-08-28)* | Firebase project `hazardnet-live` | (deleted P0-8) |

Every new feature had to guess which backend applied, and two divergent Firebase
project configs were committed.

## Decision (original)

1. One vendor for identity and relational domain data.
2. Firebase kept only for what genuinely needed it at the time (RTDB presence,
   plus the applet Firestore database the weekly Kaggle pipeline wrote to).
3. **One config module:** `frontend/src/lib/config.ts` is the only place a
   Firebase client config literal may exist; per-environment values come from
   `VITE_FIREBASE_*` env vars.
4. No new backend platform may be introduced without a new ADR.

## Consequences (current, post-cutover)

- `services/firebase.ts` imports from `lib/config.ts`; the second config
  literal is gone. A third config must never be re-created.
- Authentication is Firebase Auth with exactly three methods: email/password,
  Google, and GitHub (`oauth-provider-setup.md`).
- Application data (profiles, assessments, connectors, blog articles, alerts,
  forecasts) is stored in Firestore; presence/telemetry in Realtime Database.
- `scripts/db/*.sql` are self-host/analytics schema modules — not a runtime
  store for the web app.
- Deploys must set `VITE_FIREBASE_*` env vars; defaults are convenience-only.
