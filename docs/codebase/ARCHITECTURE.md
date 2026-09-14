# Architecture

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Architectural Style
React SPA + direct Firebase client data access, shared Express HTTP runtime, dedicated Vercel forecast functions, and a Python LiteRT service. Scheduled GitHub Actions fetch/ingest external Kaggle outputs. Evidence: `frontend/src/App.tsx`, `backend/server.js`, `api/[...path].js`, `model_service/app.py`, `.github/workflows/`.

Constraints: genuine inputs only; trained artifact provenance; private user data; identical feature-route middleware across deployments. These are owner-approved decisions in ADR 0009, not inferred intentions.

## 2) System Flow
```text
TIFF/JSON → browser shape/finite checks → little-endian binary /api/predict
 → Node tensor validation + normalization → authenticated LiteRT service
 → FP32 model → probability/severity + SHA256 → Node output validation → UI

Kaggle → Actions → authenticated CSV ingest → Admin SDK → Firestore
                  └→ committed snapshot → browser fallback
Browser → Firebase Auth → rules-bound private/public domain collections
```
1. `main.tsx` renders App providers/routes; `UploadPage.tsx` reads actual selected files.
2. `tensorUpload.ts` requires raw NCDHW tensor or ten chronological 15-band TIFF images; rejects missing/nodata values without fabrication.
3. `backend/routes/predict.js` validates, caches and normalizes; `backend/inference.js` sends bounded authenticated binary requests.
4. `model_service/app.py` transposes to NDHWC and runs the checked-in TFLite graph under an interpreter lock. Node verifies model hash and output ranges; no heuristic prediction fallback.
5. Forecast maps separately use `useForecasts.ts` → bulk API → shared parser/store → Firestore. Snapshot/static district fallback remains when live forecasts fail.
6. Profiles/blogs/connectors use direct Firebase browser SDK with `firestore.rules`; backend writes/auth use trusted `backend/admin.js`.

## 3) Layer/Module Responsibilities
| Module | Owns | Does not own | Evidence |
|---|---|---|---|
| Browser | UI, file decode, profile projection, client queries | Server keys or arbitrary model execution | `frontend/src/lib/tensorUpload.ts`, `profilePrivacy.ts` under same directory |
| Express/API | HTTP guards, normalization, model-service orchestration | Model training or fabricated predictions | `backend/server.js`, `backend/inference.js` |
| LiteRT service | Server-managed FP32 graph execution | Public uploads/model replacement | `model_service/app.py` |
| Forecast store | Bounded idempotent Firestore writes and queries | SQL cutover or public browser writes | `backend/forecastStore.js` |
| RAG | Local reference retrieval/provider advisory fallback | Authoritative model classification | `rag_pipeline/index.js`, `backend/utils/ai_fallback_engine.js` |

## 4) Reused Patterns
- Shared app export for Vercel/Express; existing forecast function wrappers share utilities (`api/[...path].js`, `forecastServe.js`).
- Lazy Admin/store/TFJS initialization, resettable forecast singleton; bounded per-process prediction cache (`backend/admin.js`, `forecastStore.js`, `tfjs.js`, `utils/predictionCache.js`).
- Public projection replaces allowlisted fields atomically with private profile edit (`profilePrivacy.ts`); Firestore rules enforce collection ownership.
- Real trained-model failure is explicit; only advisory text and map data have progressive fallback paths.

## 5) Known Architectural Risks
[TODO] Actual Vercel routing/runtime limits and live Firebase rules are unverified. Model service must be deployed separately. Multi-batch forecast publication is replayable but not a globally atomic version swap; concurrent direct writers can race. Advisory caches/rate limits are local; push fanout needs durable jobs at scale. Arbitrary model uploads are not implemented. See audit/runbook.

## 6) Evidence
- `backend/server.js`, `backend/admin.js`, `backend/forecastStore.js`, `backend/inference.js`
- `frontend/src/lib/tensorUpload.ts`, `frontend/src/lib/profilePrivacy.ts`, `frontend/src/hooks/useForecasts.ts`
- `api/[...path].js`, `model_service/app.py`, `firestore.rules`, `vercel.json`
