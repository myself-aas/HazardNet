# Codebase Concerns
# Concerns

> Evidence baseline: `df67e529073939344167e298dcc0f7628039bdba`, inspected 2026-09-20. This documents the checkout, not a verified live deployment.
**Evidence:** README intent vs actual code, `package.json`, `frontend/package.json`, `.github/workflows/`, `scripts/db/` vs ADR 0014, `vercel.json`, `audit-exceptions.json`, `HazardNet.md` Phase 7 horizon mismatch, `docs/audits/`, file-size signals from `find`.

## Implemented owner decisions (2026-09-20)
## Intent vs. Reality Divergences

- Handwritten scoring, tensor validation/normalization/cache runtime and TFJS npm dependencies removed. Express and Vercel now share stored-forecast serving.
- Forecast writes use a dedicated Admin transaction; failure is non-success and cannot install uncommitted rows in fallback memory. Provision and staging-test credentials before enabling production ingestion. Other client-SDK services, including the alert engine, are unchanged.
- `firebase-admin` moved to runtime dependencies.
- Public division formula, derived score, ranking and score-based styling removed; known-pattern embargo regression checks now block reintroduction.
- PostgreSQL forecast cutover superseded; conversion endpoint authentication remains unchanged per owner decision.
1. **Mapbox GL vs Leaflet.** README and `.env` template mention Mapbox GL and `VITE_MAPBOX_TOKEN`, but `frontend/package.json` ships `leaflet`, `leaflet.heat`, `leaflet.markercluster` — there is no `mapbox-gl` dependency. README architecture diagram and install guide are out of date.
2. **Horizon claims (ADR 0005 pending).** `HazardNet.md` Phase 7 and the Kaggle forecast notebook implement 10/20/30-day horizons (`HORIZONS = {'10_days':10,'20_days':20,'30_days':30}`), while the canonical backend (`VALID_HORIZONS = ['7_days','15_days']`), the UI (`frontend/src/lib/forecasts.ts` per README), and `test_model_claims.py` enforce 7/15 days. ADR 0005 accepts the expansion but it is not shipped; the Kaggle producer must still output 7/15 or the bridge will reject rows.
3. **INT8 model file is misnamed.** `Models/hazardnet_int8.tflite` exists but is actually FP32. ADR 0007 documents that TFLite CONV_3D kernels require FP32 and INT8 crashes. The server explicitly blocks both filenames at the public static route; however the misnomer can mislead downstream tooling.
4. **PostgreSQL migrations exist but are superseded.** `scripts/db/001…008.sql` describe a Postgres/PostGIS schema, but ADR 0014 names Firestore as the durable forecast store. The README still mentions PostgreSQL in the docker-compose quick start.
5. **In-browser CNN inference (Edge Mode).** README §System Architecture mentions "Edge Mode: TFLite WASM loader + Service Worker", but `frontend/package.json` has no `@tensorflow/tfjs` or TFLite WASM dependency, and the product spec/ADR 0009 says the web app does not run a CNN — it reads stored forecasts. TFLite WASM edge mode is aspirational/removed.
6. **Docker Compose.** README documents `docker-compose up -d --build` but no `docker-compose.yml` or `Dockerfile` exists at the repo root (verified). The docker path is aspirational or lives in a separate deployment repo.

Evidence: `docs/ops/2026-09-20-stored-forecasts.md`, `backend/forecastPersistence.js`, `backend/utils/storedPrediction.js`, `api/predict.js`, `frontend/src/components/NationalOverview.tsx`.
## Technical Debt

## Core Sections (Required)
- **Dual deployment shape (Express + Vercel functions).** API handlers are duplicated between `backend/routes/*.js` (used by the Express server) and `api/*.js` (Vercel serverless entry points). Keeping them in sync is error-prone; the `securityHeadersParity` test exists because drift has happened before.
- **Advisory schema translation in `fetch_kaggle_forecast.py`.** The bridge maps `hazardnet_advisories_latest.csv` onto the canonical schema by hand, including unit-conversion footguns documented at length in the script (`om_temp_2m_k` is Celsius, `om_et_sum_m` is mm, etc.). Once the notebook emits canonical columns directly, this translation should be deleted.
- **Large `HazardNet.md` (≈188 KB).** This single file contains all seven phases of the scientific pipeline as embedded Python code blocks in Markdown. It is excellent narrative but hard to reference/import; the actionable code lives in `training/`, `ml/`, and Kaggle notebooks. Consider splitting per phase.
- **Historical SQL migrations accumulate.** `scripts/db/001_init_forecasts.sql` through `008_hazard_events_postgis.sql` are PostgreSQL-specific but the app uses Firestore. If there is no plan to cut over, they should be moved to `docs/archive/` to avoid onboarding confusion.
- **No strict TypeScript "engines" enforcement.** README says Node 20+ but `package.json` does not declare `engines`.
- **Impeccable/Vercel skill vendor files** under `.agents/skills/` and `agent/skills/` are ~thousands of files; they are vendored agent skill packs but not application code. They add noise to the tree and could be gitignored or submoduled if they are regenerable.
- **Root `venv/` is committed.** `venv/bin/python*` exists in the working tree and appeared in `git log`, and `.gitignore` only excludes `.venv/` (dot-prefixed), not `venv/`. This is a 10+ MB virtualenv in version control and should be gitignored/removed.

### 1) Top Risks (Prioritized)
## Bugs & Issues Found in Code Reading

Static findings are distinguished from live reproduction. Suggested actions below are recommendations, not changes made during discovery.
- None of the sampled source files contained obvious logic bugs. The codebase uses guards (NaN guards, zero-division guards, invalid-band guards, unit conversion notes) and tests specifically target previously-encountered regressions (see docs/ops and docs/audits for a historical record).
- The dual-naming issue for INT8 and horizons is an *accepted, documented* drift, not an unknown bug.

| Severity | Concern | Evidence | Impact | Suggested action |
|---|---|---|---|---|
| High | Alert engine shares client DB and `alerts` collection with owner-scoped user-alert rules | `backend/alerts/store.js`, `backend/db.js`, `firestore.rules` alert match | Engine read/write operations can be denied under checked-in rules; public API behavior is not proven by source-only tests | Test engine record schema and permissions; decide collection/access separation |
| High | Unauthenticated conversion debug/dispatch/reconciliation routes | `backend/routes/conversions.js`, `backend/server.js` | In the Express runtime, debug returns buffered attribution records without an identity/owner check; baseline rate limiting is not authorization | Owner declined auth change (ADR 0014); retain this as accepted exposure, not a remediated issue |
| High | Historical credential exposure acknowledged, rotation not verified | `.env.example`, `docs/audits/2026-09-18-secret-scan-false-negative.md` | Removing secrets from current files does not revoke historical values | Confirm revocation/rotation privately; do not copy secrets into docs |
| Medium | Development/monitoring port disagreement | `backend/server.js`, `frontend/vite.config.ts`, `monitoring/prometheus.yml` | Express binds 3000; Vite proxies/scraper expect 3001 | Centralize port config and test split-dev setup |
## Security Risks

### 2) Technical Debt
1. **Rotated credential history.** `.env.example` explicitly notes: "the real values must be rotated (they exist in git history)". Confirm rotation actually occurred.
2. **CSP parity.** Past drift between `backend/security/csp.js` and `vercel.json` caused ad-network allowlist divergence (documented in `server.js` comments). The `securityHeadersParity` test now gates this.
3. **AI prompt injection surface.** Chat/agent routes accept arbitrary user input and call Gemini with RAG context. `chatPromptBounds.test.js` exists to bound behaviour; confirm prompt-bound tests cover role injection and instruction override.
4. **CSV ingestion.** `csvSafety.js` and CSV injection guards are tested; however any authenticated ingest (BACKEND_API_KEY leak) could write adversarial rows.
5. **Service worker scope.** The offline SW caches forecast snapshots. Confirm cache invalidation logic cannot serve indefinitely-stale data past the prediction window.
6. **Firestore rules surface (`firestore.rules`, 11 KB).** Complex RLS rules warrant targeted testing for blog articles, user dashboards, and forecast reads; `__tests__/firestoreRules.test.js` exists but breadth of coverage should be audited.

| Debt item | Why it exists / known context | Where | Risk if ignored | Suggested fix |
|---|---|---|---|---|
| Multiple generations of intent docs | ADRs and implementation evolved; reason for remaining stale copy is [TODO] | `README.md`, `docs/PRD.md`, `docs/PRODUCT_SPEC.md`, `docs/adr/0003-deploy-topology.md` | Onboarding repeats false shipping claims | Mark superseded text and choose current contract |
| Hardcoded fallback timestamps | Snapshot fallback includes literal `2026-09-16` and current-time ingestion fallback | `backend/forecastStore.js` | Metadata can describe a default instead of real provenance | Use explicit unknown/stale source metadata and test no-snapshot path |
| Checked-in interpreter binaries | Three identical 5,937,672-byte executable blobs are tracked; reason [TODO] | `venv/bin/python`, `venv/bin/python3`, `venv/bin/python3.10` | Nonportable checkout weight; stale interpreter may be used accidentally | Remove from tracking only in a separately approved cleanup; use a recreated virtualenv |
| Duplicate/misnamed model artifact | INT8 artifact is documented as retired/misnamed | `Models/REGISTRY.json`, `Models/hazardnet_int8.tflite`, ADR 0007 | False quantization assumptions | Preserve provenance but remove misleading consumption/copy |
| Large mixed UI modules | Inspection sees map/render/control code in large source files; original motivation [TODO] | `LiveMapView.tsx`, `DistrictDetailPage.tsx`, `Dashboard.tsx` | Large change surface and difficult isolated tests | Extract bounded behavior behind existing tests, not a blind rewrite |
## Performance Bottlenecks & Scaling Risks

Source-marker audit on 2026-09-20: **one** TODO/FIXME/HACK line across tracked JS/MJS/TS/TSX/Python under backend, api, frontend, scripts, training, rag_pipeline, utils, excluding tests, __tests__, public: `frontend/src/services/firebase.ts:29` (“Add SDKs…”). This narrow count is not a debt metric. Test TODOs/coverage limitations are discussed in `TESTING.md`, separately from production debt.
- **Kaggle → GitHub Actions daily pull** is single-threaded per district and bound by GEE task scheduling inside the Kaggle kernel (not the Vercel side). Bridge-side, `fetch_kaggle_forecast.py` is I/O bound and runs in <30 seconds.
- **Firestore forecast reads** are keyed by district+horizon with 64 districts × 2 horizons → tiny documents; not a bottleneck. Bulk heatmap reads fetch 128 rows per request.
- **Serverless function cold starts.** `api/chat/query.js` bundles `rag_pipeline/**` (`vercel.json` `includeFiles`); cold start will be larger than pure API handlers. Predict/forecasts functions are lightweight.
- **Alert fan-out** is capped by `SMS_MAX_PER_RUN` and per-channel rate limits (Telegram/BulkSMS).
- **TFLite conversion.** INT8 quantisation is explicitly unsupported because TFLite CONV_3D requires FP32. The FP32 model fits comfortably under 150 MB edge target per the deployment converter, but is not small for microcontrollers.
- **Bundle size** is monitored by `scripts/check-bundle.mjs`; Leaflet + Recharts + MUI + Framer Motion is a heavy frontend. The low-bandwidth mode swaps raster tiles for vector to mitigate.

### 3) Security Concerns
## High-Churn Files (signals from git)

| Risk | OWASP category | Evidence | Current mitigation | Gap |
|---|---|---|---|---|
| Alert persistence identity/rule mismatch | A01 access control / A05 misconfiguration | `backend/db.js`, `backend/alerts/store.js`, `firestore.rules` | Default-deny rules protect collections; forecasts now have a dedicated Admin writer | Alert engine remains on client SDK; live deployment behavior unverified |
| Unauthenticated conversion diagnostics | A01 access control | `backend/routes/conversions.js` | Baseline API limiter only | Auth/owner checks absent; applies to Express, not evidence of a Vercel handler |
| Dependency risk exceptions | A06 vulnerable components | `audit-exceptions.json`, `scripts/npm-audit-ci.mjs` | Expiring allowlist gate | Recorded exceptions are not a fresh vulnerability audit; re-review before expiry |
| Historical exposed provider credentials | A05 misconfiguration | `.env.example`, secret-scan audit | Placeholders, ignore rules, CI scanner | [TODO] Rotation completion |
| URL query values enter request logs | N/A; sensitive logging risk | `backend/middleware/requestId.js` | UUID request correlation | No query redaction in this middleware; avoid credentials in query strings |
| Broad outbound CSP allowance | A05 hardening consideration | `backend/security/csp.js`, `vercel.json` | CSP, frame denial, HTTPS headers | `connect-src https: wss:` is broad; review supported origins before narrowing |
[TODO] Run `git log --pretty=format: --name-only -n 200 | sort | uniq -c | sort -rn | head -20` to identify high-churn files. Flag the top 5 here.

No live penetration test or dependency vulnerability audit was performed. Existing security gates are evidence of controls, not proof of absence of vulnerabilities.
## Test Coverage Gaps (in test/ directories only — NOT production debt)

### 4) Performance and Scaling Concerns
- E2E coverage for the alert duty-officer review flow (Playwright spec exists [TODO] confirm coverage).
- RAG retrieval relevance tests for the chat/agent routes are not apparent (mostly contract / prompt-bound tests).
- Cross-browser Bengali typography rendering — visual regression is covered by `scripts/qa/design-review.mjs` but not automated per-commit.
- Load tests (`load-tests/`) exist but are not wired into CI.

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---|---|---|---|---|
| Fetch-all-by-horizon and JS dedup | `backend/forecastStore.js` | Visible query shape; no latency measurement | Reads grow with retained forecast history | Latest-snapshot/index strategy and bounded queries |
| Per-process read fallback/caches/limiters | `forecastStore.js`, `middleware/rateLimit.js`, `ai_fallback_engine.js` | State is held in module memory | Cold starts reset cached state; instances may have different read fallbacks | Make durability explicit; use shared state only where required |
| No weather upstream abort | `backend/utils/openMeteo.js` `_fetchUpstream` | Missing timeout in fetch options | Hung upstream extends response time | Add abort deadline and contract tests |
| Sequential provider cascade and notification loop | `backend/utils/ai_fallback_engine.js`, `backend/alerts/notify.js` | Sequential code; no measured bottleneck | Cumulative timeout/delivery latency | Total deadline, bounded concurrency where safe; retain budgets and review gate |

### 5) Fragile/High-Churn Areas

`git rev-parse --is-shallow-repository` returned `true`; `git log -20` exposed only baseline commit `df67e52`. The skill's 90-day churn scan assigned many files one occurrence from the shallow boundary. **No trustworthy high-churn ranking can be inferred.** [TODO] Re-run on complete history before assigning churn-based ownership or risk.

| Area | Why worth care | Churn/size signal | Safe change strategy |
|---|---|---|---|
| `frontend/src/components/LiveMapView.tsx` | Map rendering and controls in a large module | 2,689 lines; churn unknown | Browser/map regression tests and small extraction |
| `frontend/src/pages/DistrictDetailPage.tsx` | Large district data/detail UI | 2,688 lines; churn unknown | Forecast-source and responsive UI tests |
| `frontend/src/pages/Dashboard.tsx` | Dashboard UI/state integration | 1,430 lines; churn unknown | API contract + fallback tests |
| `training/hazardnet_scientific_pipeline.py` | Scientific preprocessing/evaluation contracts | 1,278 lines; churn unknown | Lineage/split/science tests before changes |
| `scripts/auto_forecast.py` | Legacy scientific acquisition/inference path | 1,106 lines; churn unknown | Do not confuse it with current daily publisher; verify pipeline ownership |

Counts above are `wc -l` observations at baseline, not generated-file complexity metrics.

### 6) `[ASK USER]` Questions

All five questions were answered by the owner on 2026-09-20. No discovery intent
questions remain open. Canonical decision record: `docs/adr/0014-codebase-owner-decisions.md`.

| # | Owner decision | Implementation status |
|---|---|---|
| 1 | Approve ADR 0009: replace handwritten inference with stored forecasts | Implemented in both HTTP runtimes; cloud deployment unverified |
| 2 | Ingestion success must guarantee durable persistence | Implemented: commit-before-acknowledgement; live credential verification pending |
| 3 | “Vulnerability Formula” is embargoed research | Withdrawn from division overview; blocking checks added |
| 4 | Supersede PostgreSQL cutover ADR 0002 | ADR superseded; Firestore remains current store |
| 5 | No privileged-auth requirement for conversion endpoints | Proposal declined; existing exposure is an accepted risk, not resolved |

### 7) Evidence

- `backend/db.js`, `backend/forecastStore.js`, `backend/alerts/store.js`, `firestore.rules`
- `backend/routes/predict.js`, `backend/middleware/firebaseAuth.js`
- `frontend/vite.config.ts`, `monitoring/prometheus.yml`, `.env.example`
- `README.md`, `docs/PRODUCT_SPEC.md`, `docs/adr/0009-single-inference-path.md`
- Terminal scan, source marker/line counts, hash checks and gate runs (2026-09-20)

## Intent vs. Reality

| Stated intent / claim | Verified checkout reality |
|---|---|
| Original README advertised Mapbox and browser TFLite/WASM inference | Frontend declares/uses Leaflet; no browser TFLite dependency in manifests; model asset requests are blocked by Express. `/api/predict` now reads stored rows in both Express and Vercel; inline inference is retired. README inference wording has been corrected. |
| Approved ADR 0009 requires a single stored-forecast prediction path | Both adapters now call the shared stored-forecast reader; tensor scorer removed. |
| Historical ADR 0002 claimed a selectable PostgreSQL forecast store was implemented; now superseded by ADR 0014 | Current store is Firestore-only; the named migration/002 schema are absent. `scripts/db/README.md` calls Firestore the production store. |
| Older ADR 0003 describes report-only CSP and Bun packaging | Current production defaults enforce CSP; npm lock/workspaces and npm CI are used (`backend/server.js`, `vercel.json`, `package-lock.json`, CI). |
| PRD/TRD describe calibrated/fused warnings as target capability | Product spec itself records calibration limitations; alert assessment/policy gates distinguish uncalibrated scores. Target requirements are not evidence of a fitted production calibration map. [TODO] Verify current deployed calibration artifact. |
| ADM3 and 10/20/30-day expansion accepted in ADR 0005 | Forecast validators/client contract still support 7/15-day product; README explicitly marks expansion pending. |
| README edge/INT8 story and older ADR wording | Both committed `.tflite` files exist and hash identically: `6b76d7ef2aab8e3f9b661afc21449b6bdf01046de9e061afaa96336287143d1c`; the INT8 filename does not establish quantization. The README ADR link is corrected to `0007-no-int8-bundle.md`. |
| Product spec retains “alert engine does not exist yet” target wording | Same document records implementation; `backend/alerts/` and Vercel alert handlers exist. Deployment permissions/delivery remain unverified. |

## Discovery Workflow Status

- [x] Phase 1: Run scan, read intent documents.
- [x] Phase 2: Investigate all seven documentation areas.
- [x] Phase 3: Populate all seven documents in `docs/codebase/`.
- [x] Phase 4: Documentation/evidence validation completed; all five owner-dependent questions resolved and recorded in ADR 0014. Owner-directed runtime changes are implemented as listed above; remaining cloud/operational verification stays explicit.

The pre-existing standalone map and scan were archived without deleting their historical contents to `docs/audits/codebase-2026-09-18/`; the old map is explicitly labelled superseded. The prior discovery docs were cross-checked for unresolved risks, including conversion endpoint exposure and PostgreSQL ADR drift.

The upstream skill and templates were fetched using GitHub CLI after a direct Python HTTPS download failed. The scan was run from the repository root with output in external scratch storage, deliberately keeping `docs/codebase/` to exactly the seven required Markdown files. Scanner output was cross-checked against source (notably its missed performance harnesses and unusable shallow-history churn ranking).
[ASK USER]
1. Is Mapbox still used anywhere (tile endpoints, styles) or should the README Mapbox references be retired in favour of Leaflet-only?
2. Are the PostgreSQL migrations under `scripts/db/` still planned to be used, or can they be archived?
3. Is Edge/TFJS inference still a roadmap goal (README mentions a WASM loader that isn't in the dependency tree) or should it be removed from the architecture diagram?
4. What is the status of the 10/20/30-day horizon work (Kaggle Phase 7) — is it waiting for a coordinated backend/UI cutover?
5. Is the `venv/` directory at the repo root supposed to be gitignored?
