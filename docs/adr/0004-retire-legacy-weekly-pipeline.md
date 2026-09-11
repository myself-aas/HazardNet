# ADR 0004 — Retire the legacy `weekly_hazardnet` pipeline

- **Status:** Accepted (2026-09-12)
- **Context:** Deployment-verification audit 2026-09-12 (`docs/audits/2026-09-12-deployment-verification.md` §3.2); ADR 0003 deploy topology
- **Deciders:** HazardNet maintainers

## Context

`.github/workflows/weekly_hazardnet.yml` ("Weekly HazardNet Pipeline (Kaggle ->
Firestore -> Firebase Hosting)", Sundays 00:00 UTC) was the original weekly
pipeline. It is broken at three independent layers and duplicates the repaired
`weekly_forecast.yml`:

1. **Empirically failing**: all 4 runs on `main` concluded `failure` (3 scheduled
   + 1 manual, 2026-08-16 → 2026-09-06). The latest run died at *Set up Python*
   (`cache: 'pip'` requires a requirements file the repo does not have).
2. **Missing scripts**: even past setup, steps 6–7 invoke
   `scripts/poll_and_download.py` and `scripts/update_firestore.py`, which do
   not exist anywhere in the repo (verified by grep; `scripts/` contains only
   `.mjs` build scripts and `db/`). Step 9 (`npm ci`) would also fail — the
   repo has no `package-lock.json` (bun.lock is the lockfile).
3. **Contradicts accepted ADR 0003**: step 10 deploys to Firebase Hosting
   (`projectId: hazardnet-app`), a project referenced nowhere else in the repo
   (`.firebaserc` default is `hazardnet-aas48424`). ADR 0003 designates Vercel
   as the one canonical production path and freezes Firebase Hosting as
   legacy-applet-only ("do not add new hosting there").

Its only unique functions versus `weekly_forecast.yml` — a direct
firebase-admin Firestore write and a Firebase Hosting deploy — are superseded:
forecast ingest goes through the tested `POST /api/v1/forecasts/update` route
(timing-safe `BACKEND_API_KEY`, per-row validation, advisory generation), and
frontend deploys happen via Vercel Git integration.

## Decision

1. **Delete** `.github/workflows/weekly_hazardnet.yml`. Do not recreate it;
   the canonical weekly pipeline is `weekly_forecast.yml` (repaired
   2026-09-12, see the audit §3.1).
2. Do not resurrect the missing Python scripts — the API ingest route is the
   single supported write path to the forecast store (and, per ADR 0002, both
   converge on Supabase after the cutover).
3. The `FIREBASE_SERVICE_ACCOUNT` secret is no longer referenced by any
   workflow; it may be removed from repo secrets (keep only if used for
   manual applet operations).

## Consequences

- One Sunday pipeline remains (02:00 UTC): version bump → Kaggle notebook →
  CSV → API ingest → tests → GitHub Release. No more duplicate Kaggle kernel
  pushes or double Firestore writes from the 00:00 UTC run.
- Until this deletion merges to `main`, the workflow may still appear in the
  Actions tab; it can be disabled manually there (workflow page → ⋯ → Disable
  workflow). An API disable attempt on 2026-09-12 returned 403 (token scope).
- Reverting is possible from git history if ever needed, but any revival must
  first comply with ADR 0003 (no new Firebase Hosting) and use the API ingest
  route rather than direct service-account writes.

## Verification checklist

- [x] No references to `poll_and_download.py`, `update_firestore.py`,
      `hazardnet-app`, or `FIREBASE_SERVICE_ACCOUNT` remain outside this ADR
      and the audit trail
- [x] `weekly_forecast.yml` covers the full pipeline end-to-end (audit §3.1)
- [x] All 4 historical runs documented as failures (GitHub Actions API,
      2026-09-12)
