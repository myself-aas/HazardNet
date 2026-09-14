# Codebase Structure

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Top-Level Map
| Path | Role / anchor |
|---|---|
| `frontend/` | npm workspace: pages/components/hooks/lib/context/services, public assets (`frontend/package.json`) |
| `backend/` | Express routes, middleware, Admin access, forecast store, model-service adapter, durable push store |
| `api/` | Dedicated forecasts/ingest/metrics functions plus shared `[...path].js` |
| `model_service/` | Authenticated Python LiteRT server, pinned requirements, real artifact tests |
| `Models/` | Server-managed FP32 weights, labels, preprocessing/normalization and version manifest |
| `rag_pipeline/`, `references/`, `skills/` | Knowledge retrieval/builders and advisory source assets |
| `scripts/` | Data ingest/snapshot/Kaggle, validation/security/build, privacy backfill; `db/` historical SQL/spatial tooling |
| `__tests__/`, `tests/`, `e2e/`, `scripts/tests/`, `load-tests/` | Jest, Node rules emulator suite, Playwright, Python/script contracts, load scenarios |
| `.github/`, `monitoring/` | CI/jobs/operator probe; Prometheus/alerts/Grafana |
| `docs/` | ADRs, ops, audits, map; ADR 0009 supersedes old platform identity |
| `data/`, `backend/data/forecasts/`, `frontend/public/data/` | Data notes, committed forecasts and browser snapshot |
| `.agents/`, `.claude/`, `agent/`, `plugins/` | Agent/support assets, not application runtime entrypoints |

## 2) Entry Points
Browser: `frontend/index.html` → `src/main.tsx` → `src/App.tsx`. Active service worker is `frontend/public/serviceWorker.js`; separate `frontend/src/serviceWorker.ts` remains legacy source.

Node: `npm start` → `backend/server.js` (binds only on direct execution, otherwise exports app). Vercel: dedicated `api/` files and `api/[...path].js` same app. Python: `uvicorn model_service.app:app`. CI: `.github/workflows/*.yml`; scripts invoked from root. `scripts/migrate-firebase-privacy.mjs` is dry-run by default.

## 3) Module Boundaries
| Boundary | Belongs here | Not here |
|---|---|---|
| Browser | UI/input decode/public projections/rules-bound queries | Firebase Admin/server secrets |
| HTTP API | Auth, validation, normalization, envelopes | Model training or arbitrary uploaded weight execution |
| Model service | Checked-in trained artifact invocation | Browser auth/profile writes |
| Store | Trusted persistence and batching | Public UI logic |
| SQL/spatial assets | Historical/reference/optional spatial analytics | Canonical runtime data store |
Observed/import evidence: `backend/server.js`, `model_service/app.py`, `frontend/src/context/AuthContext.tsx`, `backend/forecastStore.js`.

## 4) Naming and Organization Rules
Frontend layer directories with feature subfolders; PascalCase screens/components; `use*` hooks; camelCase utilities; mixed snake/kebab-case scripts. Both Vite and TS alias `@/` to `frontend/src/`. JS backend imports include `.js`, configs needing CommonJS use `.cjs`. Do not infer source patterns from dependencies/dist/generated snapshots.

## 5) Evidence
- `package.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/vite.config.ts`
- `backend/server.js`, `api/[...path].js`, `model_service/app.py`
- `scripts/migrate-firebase-privacy.mjs`, `.github/workflows/ci.yml`, `tests/firestore-rules.test.mjs`
