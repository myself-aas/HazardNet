# Firebase, deployment and model remediation — 2026-09-14

## Scope and decisions

Owner confirmed Firebase canonical, npm, both Express/Vercel with feature parity,
authoritative model/TIFF/tensor data, public demographic fields, and publishing by
registered users/admins. Decisions are recorded in ADR 0009. Work is on
`arena/01a0a0a6-hazardnet`; nothing was pushed, deployed, or run against live
customer data. This is a substantial remediation pass, **not a claim that every
feature or production environment has been audited exhaustively**.

## Findings and changes

| Area | Source finding | Remediation / verification |
|---|---|---|
| Package/CI | `npm ci` without lock; Node 20 across workflows; firebase-admin dev-only | Root npm lock, remove Bun lock/Supabase runtime packages, Node 22, Admin production dependency; native TFJS retired |
| Workflows | Missing Supabase verifier script; no Firebase server identity; overlapping data writers | Retired Supabase workflow; read-only Firebase verifier; server credential preflight; shared branch-scoped writer concurrency; explicit ref pushes and version-lock updates |
| Local topology | Both servers bound to 3000; Vite proxied itself | Express defaults to env-overridable 3001, Vite 3000 → 3001 |
| Server writes | Rule-denied client SDK forecast writes | Lazy trusted Admin SDK adapter with ADC/secret JSON and explicit database selection |
| Forecast data | Unbounded write batches, non-idempotent random IDs, chunk-level replacement deletion | Deterministic row keys, <=400-write batches, write-before-stale-delete; full replacement passed to store; failure/1014-row weather-preservation tests |
| Parsing | JSON string treated as CSV because it contains commas; physics severity overwrote model fallback | Parse JSON first; explicit severity compatibility then model severity; bounds and ADM3 fields in JSON ingest |
| Profiles | All full private profiles public-readable | Owner-only source docs; allowlisted public demographic projections; atomic update/replace; avatar sync; dry-run-first backfill |
| Connectors | All users could access all configs | Owner-scoped rules, ownership immutable. **Webhook URLs contain secrets**; no live credential scan/rotation performed |
| Blogs | UI superadmin restriction but broad cross-user writes; public drafts | All registered authors may publish their own; author/admin rule enforcement; private drafts; custom-claim moderation; stop writing public auth-email values; migration removes legacy ones |
| Model | JS handwritten logits, no weight loading | Authenticated Python LiteRT executes checked-in FP32 artifact; Node validates hash and outputs; real-artifact tests |
| Uploads | File name only sent; fixed flood/severity fabricated on API failure; fake sample filenames | Decode actual JSON/TIFF values; strict shape/finite/nodata validation; binary request; no fake sample buttons or fallback predictions |
| Prediction cleanup | Cached return skipped tensor disposal | Dispose input on cache hit; clear UI result before new inference; response errors throw |
| Vercel route parity | Only forecast/ingest/metrics handlers existed | Catch-all shares Express guards/routes; /api/health alias; ephemeral upload directory; no native TFJS dependency |
| Push | Process-local subscriptions lost on instance restart; arbitrary endpoints | Private Firestore store, known push-provider HTTPS allowlist, bounded broadcast parallelism, local notification navigation |
| Ingest latency | One sequential AI call per CSV row | Advisory enrichment opt-in and capped at five; normal ingest never waits for hundreds of provider calls |
| Email signup | Verification send was a no-op; callback only waited for a session | Real Firebase email-link send/redeem, cross-device email confirmation, concurrent-exchange deduplication; three regression tests. Provider configuration/delivery still require live verification |
| Auth identity | Unlink method returned without unlinking | Calls Firebase unlink, refuses to remove the last sign-in method |
| Named database | Rule config implicitly targeted default database | Explicit canonical database and checked-in composite query indexes |
| Logging/lint | Query strings logged; four existing lint errors | Strip query strings from request logs; repair errors; remaining warnings tracked below |

## Validation performed

- Initial baseline: **40/42 Jest suites passed, 409/413 tests passed**; TypeScript passed. Python baseline exposed obsolete SQL-adapter assertions and a schema diagnostic mismatch.
- Remediated Jest: **46 suites / 432 tests passed**, with coverage gates enabled. Coverage within configured backend/API/frontend-utils scope: **59.60% statements, 58.62% branches, 60.00% functions, 59.80% lines**. This is not whole-frontend coverage.
- Python pipeline + real-model tests: **36 passed**, including actual TFLite invocation, finite/deterministic probabilities, model hash, HTTP auth and exact input size. Two dependency deprecation warnings.
- TypeScript and production Vite build passed. Bundle check passed (~1127 KiB gzip at measured build); RAG freshness and env checks passed.
- ESLint: **0 errors, 276 warnings**. Existing warning debt is not silently marked fixed.
- Production dependency audit gate passed **without exceptions** after retiring native TFJS and its tar/adm-zip tooling: **0 critical, 0 high, 4 moderate**. Remaining moderate findings concern gaxios/uuid and React Router; no forced major-version migration was attempted.
- Working-tree secret scan passed for tracked files. This is not a history/live-database credential audit and does not certify connector contents safe.
- Shared serverless entry imported as ESM; Jest verifies it exports the same Express app and reaches prediction/chat/advisory/agent validation paths. **No actual Vercel deployment was built or tested.**
- Firebase rules emulator suite is implemented and required in CI, but local execution was **blocked by missing Java**; Java downloads/install were unavailable in the sandbox. Do not claim those authorization tests passed here.
- Playwright browser install was attempted but Chromium download failed. **Browser E2E was not run.** CI remains gated on the browser suite.

See the final command results/session output if later checks change these counts.

## Remaining risks and follow-up

1. **Production rollout is pending:** Firebase rules/indexes/credentials, privacy migration, custom admin claims, model-service deployment and Vercel routing/body/bundle/duration validation. Follow `docs/ops/firebase-model-rollout.md`.
2. **User-supplied model-weight uploads are not implemented.** Current authority is the checked-in FP32 artifact. Agree supported formats, validation/sandboxing, provenance, version approval and storage before enabling arbitrary uploads.
3. **Representative scientific validation is pending.** Ten-image TIFF contract is explicit and intentionally rejects ambiguous files. Confirm it matches actual exported rasters; validate against labeled/reference inference data. Zero-tensor smoke tests are not forecast accuracy evidence.
4. **Rules behavior must pass the emulator/real test-account checks before deployment.** Full old profiles must stop being public. Old public article documents can contain auth email until migration. Existing drafts without author UID require trusted backfill.
5. **Connector secrets may need rotation.** Owner-only storage does not retroactively undo access under broad rules. Provider dispatch (SMS/Slack/WhatsApp/etc.), secret vaulting and OAuth token lifecycle remain separate implementation work. Catalog registration alone is not an integration.
6. **Multi-instance scaling:** forecast replacement is not an atomic published-version swap; direct concurrent writers can race. Firestore latest-by-horizon still scans historical rows. Rate limits, advisory caches and breakers remain process-local. Push fanout may exceed Vercel duration at scale; durable jobs are needed.
7. **Horizon/freshness intent remains unspecified:** archive currently accepts 7/15 days; old monitoring assumes weekly freshness (192h) despite three-hour/hourly jobs. No speculative scientific horizon or SLA change was made.
8. **UI/data consistency and security backlog:** username uniqueness is advisory, not transactionally reserved; legacy SQL docs, Firebase RTDB rules, OAuth setup, large screen components, per-field schema bounds and other domain features need subsequent focused audits.
9. **Dependency risk:** native TFJS and its 14 obsolete exceptions are removed. Four moderate dependency findings remain (gaxios, uuid, react-router and react-router-dom). Review nonbreaking updates and plan the Router major migration separately.

## Evidence

`package.json`, `package-lock.json`, `.github/workflows/`, `backend/admin.js`,
`backend/db.js`, `backend/forecastStore.js`, `backend/inference.js`,
`model_service/app.py`, `model_service/test_model.py`, `firestore.rules`,
`tests/firestore-rules.test.mjs`, `frontend/src/lib/profilePrivacy.ts`,
`frontend/src/lib/tensorUpload.ts`, `frontend/src/pages/UploadPage.tsx`,
`scripts/migrate-firebase-privacy.mjs`, `api/[...path].js`, `vercel.json`.
