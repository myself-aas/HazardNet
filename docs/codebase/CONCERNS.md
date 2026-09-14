# Codebase Concerns

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Top Risks (Prioritized)
| Priority | Current risk | Evidence / action |
|---|---|---|
| High | Production privacy rollout pending; prior full profiles/connectors were overbroad | Deploy/test `firestore.rules`, backfill with `scripts/migrate-firebase-privacy.mjs`; review exposure and rotate secrets as warranted |
| High | Model service not deployed; arbitrary model uploads not supported | `model_service/app.py`, `backend/inference.js`; configure service, approve separate uploaded-model contract |
| High | Rules/browser/deployed routing verification incomplete | Local Java/browser download blockers; `tests/firestore-rules.test.mjs`, `playwright.config.ts` and CI must run |
| Medium | Forecast multi-batch publication can be partial; historical reads grow | `backend/forecastStore.js`; versioned atomic publication/serialization and indexed latest view remain follow-up |
| Medium | Push jobs can exceed Vercel duration; local rate limits/circuits | `backend/routes/push.js`, `backend/middleware/rateLimit.js`; durable worker/shared quota strategy needed |

Original client-SDK write denial, missing npm lock, local port collision, fake upload results and broad new-rule authorization are remediated in source; do not describe them as deployed fixes until rollout is verified.

## 2) Technical Debt
Large screens: DistrictDetailPage 2345 lines, Dashboard 1381, AdvisoriesPage 1068 at initial scan. Extract with browser/component coverage. Duplicate service-worker sources remain; only public worker is registered. Historical Supabase/Mapbox/browser-model prose remains in old guides with supersession notices. Username uniqueness is still query-based rather than transactionally reserved. No complete application-only TODO count is asserted; agent/vendor assets distort repository aggregates.

## 3) Security Concerns
Connector URLs may carry credentials; no live inventory/rotation done. Profiles now have allowlisted public projection, but existing data needs backfill/coordinated rules rollout. Old article auth-email values need migration. Custom claims—not editable roles or email UI checks—grant moderation. Native TFJS/exceptions were removed; four moderate JS dependency findings remain. [TODO] RTDB policies, complete field bounds, serverless error redaction and effective live permissions.

## 4) Performance and Scaling Concerns
Bounded batches and idempotency reduce write-limit/replay issues but do not make full-dataset publication atomic. Latest-by-horizon still scans historical matches. Binary inference is 2.46MB before transport, normalization/caching serializes tensors; benchmark real traffic. AI circuits/caches/rate limits are per-process. Push fanout uses ten parallel deliveries but no durable queue. Freshness alert remains weekly-oriented pending explicit SLA.

## 5) Fragile/High-Churn Areas
Local git is shallow with one initial baseline commit; no defensible 90-day churn ranking. [TODO] Fuller history. Complexity signals: large frontend screens, build-only Leaflet plugin shim, coordinated profile migration, Admin credentials and dual routing. Use production-build/browser tests plus rules emulator; do not rely on mocks to prove authorization.

## 6) `[ASK USER]` Questions
Resolved: Firebase canonical; both deployment surfaces; npm; genuine model/input authority; registered authors/admins; demographic-public/credential-private intent (ADR 0009).

1. [ASK USER] Should users upload their own model weights, or only data for the server-managed FP32 model? Arbitrary model uploads require format, provenance, version approval and sandboxing decisions.
2. [ASK USER] Confirm the public field allowlist in `frontend/src/lib/profilePrivacy.ts`; full birth date, gender, contact details, exact location and income were conservatively excluded.
3. [ASK USER] What forecast horizons and freshness SLA should replace—or retain—the current 7/15-day validation and weekly-oriented 192h alert? Model authority alone did not answer this.

## 7) Evidence
- `docs/adr/0009-firebase-model-and-deployment-contract.md`, `docs/audits/2026-09-14-firebase-remediation.md`
- `firestore.rules`, `backend/forecastStore.js`, `backend/routes/push.js`, `frontend/src/lib/profilePrivacy.ts`
- `model_service/app.py`, `frontend/vite.config.ts`, `monitoring/alerts.yml`
