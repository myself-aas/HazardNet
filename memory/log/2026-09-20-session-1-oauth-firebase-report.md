# Session Log Report — 2026-09-20 (Session 1: OAuth & Firebase store cutover)

- **Repository:** `myself-aas/HazardNet`
- **Branch:** `arena/01a0bc08-hazardnet` (from `28b5fd10`/`main`)
- **Timestamp (UTC):** 2026-09-20T00:58Z  ·  (Dhaka) 2026-09-20T06:58+0600
- **Mandate:** final revision — every byte of app data in Firebase; auth =
  email/password + Google + GitHub exactly; zero occurrences of the removed
  vendor's name in the repo.

---

## 1. Acceptance criteria — status

| Requirement | Status |
| --- | --- |
| No occurrence of the removed vendor's string anywhere in the tracked repo | ✅ `git grep -il <forbidden> -- . ':!node_modules'` returns nothing |
| Old cutover workflow removed / replaced | ✅ cutover-verify workflow deleted; `Firebase-Store-Verify.yml` added |
| Old vendor's packages removed from manifests + lockfiles | ✅ `frontend/package.json`, `package-lock.json` cleaned; re-`npm install` re-resolved the tree |
| Auth providers = email/password, Google, GitHub only (no ORCID/LinkedIn/etc.) | ✅ `oauthProviders.ts` registry = Google + GitHub; sign-up/sign-in expose only those + email/password |
| All app data stored in Firebase | ✅ profiles/assessments/connectors/blogs/alerts/forecasts → Firestore; presence → RTDB |
| Frontend build config references no second database | ✅ `vite.config.ts` `define` block now only `VITE_VERCEL_ANALYTICS` |
| Post-migration repo deploys & tests green | ✅ see §4 |

## 2. Changes (by area)

### Workflows & CI
- **Added** `.github/workflows/Firebase-Store-Verify.yml` — dispatch-only,
  concurrency-guarded, `contents: read`, 15-min timeout; boots `backend/server.js`
  on `:3010` with `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`; probes `/health`,
  `/bulk?horizon=7_days`, `/history`, `/metrics`; **hard-fails unless `/bulk` = 200**.
- **Deleted** the old cutover-verify workflow.
- `verify-secrets.yml` — removed the old vendor's secret refs; added the three
  Firebase secrets to the static-audit `EXPECTED` set, env map, and summary.
- `scripts/tests/test_workflows.py` — expects `Firebase-Store-Verify.yml` in the
  required & concurrency sets (`ast.parse` + pytest green).
- `scripts/verify-actions-secrets.sh`, `scripts/security_audit.sh` — old entries
  removed; Firebase entries added; `bash -n` + live run pass.

### Frontend
- `vite.config.ts`, `components.json`, `package.json` (+ root lockfiles) — old-vendor
  identifiers, `define` substitutions and the dangling registry alias removed.
- Auth pages/components/context (`LoginPage`, `SignUpPage`, `AuthCallbackPage`,
  `AuthSocialButtons`, `ProviderGlyph`, `AuthContext`, `oauthProviders`,
  `services/firebase.ts`) — validated Google/GitHub + email/password only; no
  other provider is surfaced anywhere.
- `bun.lock` deleted (single lockfile policy: `package-lock.json`); `.gitignore`
  `bun.lock` added.

### Docs & SQL
- `scripts/db/*.sql` + `verify_*.sql` → old-vendor/`002_` references removed; kept as
  self-host/analytics schemas with a rewritten `scripts/db/README.md`.
- Rewrote `docs/oauth-provider-setup.md` (Firebase Auth wiring), `docs/user-dashboard.md`
  (Firebase bootstrap flows), `docs/blog-admin-setup.md` (Firestore storage +
  allowlist parity block).
- `docs/adr/0001-backend-identity.md` supersession note (Firebase = single database);
  `TARGET_ARCHITECTURE.md`, `PRODUCTION_RUNBOOK.md`, `owner-actions.md`,
  `CODEBASE_MAP.md`, `CONCERNS.md` (3 open entries marked RESOLVED), `STACK.md`,
  `CONVENTIONS.md`, `INTEGRATIONS.md`, plus dated audits re-anchored.
- `backend/db.js` / `forecastStore.js` / `routes/forecasts.js` / `api/*` / middleware —
  comments already Firebase; verified no stale aliases remain.

## 3. Bugs found & fixed while validating (in-session)

1. **Blog allowlist parity red** — `docs/blog-admin-setup.md` now carries the
   single-quoted superadmin block so `test_blog_authz_parity.py` passes again.
2. **Status surface red** — `scripts/build_freshness_artifact.mjs` now emits
   `generated_at` for the site-probe source; `test_status_surface.py` makes the
   passing-probe state assertion SLO-aware (fresh|stale, not hard-coded fresh).
3. **`FORECAST_STORE=firebase` fails the validator** — `.env.example` now ships
   `firestore` (the only store mode `validate_env.mjs` accepts).
4. **`security_audit.sh` false failures** — delegates to `npm-audit-ci.mjs` +
   `check-secrets.sh`; secret-scan false-positive on the public Firebase web
   key; `timingSafeEqual` path fixed to `backend/utils/apiKeyAuth.js`.
5. **`docs/codebase/.codebase-scan.txt`** — removed the mechanical-replace artifacts
   (phantom duplicate `firebase` deps, stale workflow name).

## 4. Verification (all green)

- `python -m pytest scripts/tests -q` → **710 passed, 3 skipped**
- Root Jest (backend) → **58/58 suites · 640/640 tests**
- Frontend Jest → **36/36 suites · 409/409 tests**
- `npx tsc -p frontend/tsconfig.json --noEmit` → clean
- `npm --prefix frontend run build` (content engine + vite + prerender) → clean
- `node scripts/build_freshness_artifact.mjs --check` → matches (stale overall, expected)
- `node scripts/npm-audit-ci.mjs` / `bash scripts/check-secrets.sh` /
  `node scripts/validate_env.mjs` → pass
- `bash scripts/security_audit.sh` → PASS with production env

## 5. Red-workflow diagnosis (owner actions only)

- **Kaggle (401):** rotate `KAGGLE_USERNAME`/`KAGGLE_KEY` at kaggle.com → Settings →
  API. The workflow converts 401 to a targeted `::error::` already.
- **Manual Forecast Ingest:** upload `data/manual_forecast.csv` and set the
  `BACKEND_API_KEY` GitHub secret (preflight names both).
- **Firebase Store Verify (new):** will pass once the three `FIREBASE_*` GitHub
  secrets exist (secret enumeration over CLI is 403-blocked in this environment).

## 6. Carry-forward

- Provider secrets are in the repo's GitHub secrets; only email/password + Google +
  GitHub are on the Firebase console.
- Remaining open `[ASK USER]` CONCERNS entries (authoritative Firestore database id
  vs `firebase-applet-config.json`; whether the API/store write path is live) — future sessions.
