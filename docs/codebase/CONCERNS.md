# Codebase Concerns

> **Status of the items below.** The ten `[ASK USER]` questions raised by the initial
> mapping were all answered on 2026-09-30 and the corresponding changes are in the tree.
> Items that were resolved are marked **[RESOLVED — see action taken]**; the remainder
> are still open. Where a resolution removed a risk, the row says so rather than
> disappearing, so the next reader can see what was decided and why.
>
> **Mapping refresh, 2026-09-30 (second pass, commit `deff0d9`).** This pass re-verified
> every claim against the working tree and ran the repo's own commands (`npm ci` → 2513
> packages; `npx jest` with the CI backend arguments → **79 suites passed / 2 skipped, 819
> tests passed / 23 skipped**; `python3 -m pytest scripts/tests -q` → **119 passed**;
> `npm run check:functions` → 6/12; `node scripts/verify_claims.mjs` → 16 claims verified;
> `bash scripts/check-secrets.sh` → passed, 903 files). Three claims from the first pass do
> **not** hold in this checkout and are corrected below: the committed `.env.example`
> (absent — item reopened), `ARCHITECTURE.md`'s description of a live `app/` scaffold (the
> directory is absent; the §1 row records the deletion), and the previously quoted
> suite/test counts (now 79/819). A new open
> finding added by this pass: `packages/core`'s `exports` map advertises three subpaths
> whose files do not exist.

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| **high** | **[RESOLVED — see action taken]** CI `verify` job invoked a test file that did not exist (`__tests__/modelPerformance.test.js`). *Resolution: the suite was deleted intentionally, so the step no longer names it. The `/model-performance` page and its data artifact remain covered by `__tests__/contentEngine.test.js`.* | `.github/workflows/ci.yml` (post-build step now lists 3 suites) | Was: Jest exits non-zero on a named path that matches nothing, turning the build gate red for a reason unrelated to product quality | Closed — the post-build step runs `seoFoundations`, `statusPagePrerender`, `structuredData` only |
| **high** | **[RESOLVED — see action taken]** Documents cited by CI gates were missing (`docs/PUBLIC_SURFACE.md`, `docs/design/impeccable.md`, `.impeccable/config.json`). *Resolution: the gate comments were rewritten to point at what exists — `scripts/lib/public-text.mjs` for the no-repository-path rule (14 call sites updated) and `docs/design/impeccable-baseline.json` for the design waivers. No document was restored.* | `.github/workflows/ci.yml`, `scripts/check-public-paths.mjs`, `frontend/src/lib/publicText.ts`, `scripts/lib/public-text.mjs`, `scripts/check-design-quality.mjs`, `__tests__/staticShellContrast.test.js` | Was: the rules behind two gates were undocumented | Closed — every gate comment now names a file that exists |
| **high** | **[RESOLVED — see action taken]** Two CI gates were silent no-ops (`check:embargo`, `archive:rag:check` printed "script not yet vendored — skipping" and exited 0). *Resolution: both are retired. The npm scripts and their CI steps are gone; `e2e/full-app-qa.spec.ts` now carries the archive severity-index rule at runtime and is in the default Playwright `testMatch`.* | `package.json` (scripts removed), `.github/workflows/ci.yml` (steps removed), `e2e/full-app-qa.spec.ts`, `docs/audits/2026-09-24-rse-ethics-audit.md` | Was: a publication-embargo gate appeared green while checking nothing | Closed — the retired gates no longer exist to mislead |
| **high** | **[RESOLVED — see action taken]** The workflow-guard test suite was missing. *Resolution: `scripts/tests/test_workflows.py` restored with 7 tests covering the bare-Jest-selector, missing-`Models/VERSION.json` and claims-gate properties, plus the `secrets`-in-`if:` and YAML-parse guards. Verified by mutation testing: all 7 mutations of the gates are detected.* | `scripts/tests/test_workflows.py`, `.github/workflows/ci.yml` (new model-version handshake step) | Was: three documented workflow failure modes were untested | Closed — 119 Python tests pass |
| medium | **[RESOLVED — see action taken]** The backend CI job excluded 7–9 existing suites by name. *Resolution: the ignore list is now directory scopes only, so `securityHeadersParity`, `securityTxt`, `nasaTokens`, `freshnessArtifact`, `contentEngine`, `alertSnapshot` and `alertReplay` run on every commit.* | `.github/workflows/ci.yml` (`test-backend` job) | Was: silent coverage loss on every commit | Closed — a guard test now fails if a suite is excluded by name again |
| medium | **No `.env.example`, and the `.gitignore` negation that should protect it is order-defeated.** The first pass marked this resolved by committing a placeholder-only template; the file is not in this tree and not in `HEAD`. `git check-ignore -v .env.example` → `.gitignore:47:.env.*` beats the line-2 `!.env.example` (the *last* matching pattern wins), so `git add .env.example` is silently refused even if the file is recreated. `scripts/validate_env.mjs` only checks the template when present (`node scripts/validate_env.mjs` → exit 0 here) and `scripts/tests/test_secret_scan.py` explicitly treats it as optional, so **no gate notices**. | `.gitignore:2` vs `.gitignore:47`, absence from `HEAD` (`git cat-file -e HEAD:.env.example` fails), `docs/ENVIRONMENT_SECRETS.md` §0 ("`cp .env.example .env`"), `scripts/validate_env.mjs:20-35`, `scripts/tests/test_secret_scan.py:134-160` | Every contributor following the documented setup starts with a missing file; the secret-scan template check is a no-op; the intended negation is dead code | Owner decision: recreate the template and move/adjust the ignore rule (e.g. `!.env.example` **after** `.env.*`, or add `!/.env.example`), or delete the dead negation and update `docs/ENVIRONMENT_SECRETS.md` §0 to say no template ships |
| medium | **`packages/core` export map points at files that do not exist and omits one that is imported.** `exports` declares `./alerts` → `./src/alertLayer.ts`, `./i18n` → `./src/i18n.ts`, `./bandwidth` → `./src/bandwidth.ts`; none of the three files is present in `packages/core/src/` (the same-named modules live in `frontend/src/lib/`). In the other direction, `apps/mobile/src/lib/notifications/notifyAlert.ts` imports `@hazardnet/core/notificationMatcher`, which no export subpath declares. | `packages/core/package.json` (`exports`) vs `ls packages/core/src/`; `apps/mobile/src/lib/notifications/notifyAlert.ts:12` | Invisible today because TS/Vite/Jest/Metro aliases bypass the `exports` map; a strict Node-ESM or Metro-exports consumer resolves these specifiers to missing files | Rename or add the three missing modules (or repoint the subpaths) and declare `./notificationMatcher`; keep the alias-based resolution as a fallback, not the contract |
| medium | Very large single-responsibility-mixed files | `frontend/src/components/LiveMapView.tsx` (2,476 lines), `frontend/src/data/sectorAdvisoriesData.ts` (1,563), `frontend/src/components/district/DistrictBriefBody.tsx` (1,480), `scripts/build_content_engine.mjs` (1,327), `frontend/src/pages/Dashboard.tsx` (1,326) | Review and regression risk concentrated in a handful of files; the map component mixes rendering, measurement, telemetry and map-lifecycle concerns | Split along the seams the tests already imply; add per-file lint budget or a size gate |
| medium | **[RESOLVED — see action taken]** Dead Next.js/v0 scaffold at the repository root. *Resolution: `app/` deleted and the `app/**` entry removed from the ESLint ignore list.* | `app/` (deleted), `eslint.config.js` | Was: misled onboarding into thinking this is a Next.js app | Closed |
| medium | **The documented dev workflow cannot work as written.** `frontend/vite.config.ts` sets `server.port: 3000` with `strictPort: true` and proxies `/api`, `/metrics` and `/health` to `http://127.0.0.1:3001`; `monitoring/prometheus.yml` also scrapes `localhost:3001` — but `backend/server.js` hardcodes `const PORT = 3000` with a "do NOT change or override" comment, so the backend never listens on 3001. Running `npm run dev` produces a backend on :3000 that collides with the Vite dev server on :3000 (strictPort), and in the Vite-only workflow every `/api` call 502s and the app silently serves the static-snapshot fallback. | `backend/server.js` (port block), `frontend/vite.config.ts:107-131`, `monitoring/prometheus.yml:25`, `docs/ENVIRONMENT_SECRETS.md` (backend-on-3001 prose) | A developer following the README sees a working-looking app that never touches the API and never learns why; `npm start` (backend on :3000, serving `frontend/dist`) is the only path that works end-to-end | Decide one port: let the backend read `PORT` (default 3001 in dev) or repoint the Vite proxy to 3000 — owner decision because of the "do NOT change" comment |
| low | **[RESOLVED — see action taken]** The CSP carried an ad-network `script-src` allowlist (5 origins) plus `'unsafe-inline'` for `style-src`. *Resolution: the ad-network allowlist is gone from the single CSP source and both Vercel configs, and the parity test now asserts its absence. `style-src 'unsafe-inline'` is deliberately kept — 162 `style={{…}}` and 69 `style="…"` sites depend on it, and removing it needs a nonce/hash pass this static build cannot do.* | `backend/security/csp.js`, `vercel.json`, `frontend/vercel.json`, `__tests__/securityHeadersParity.test.js` | Was: an allowlist for advertising the site does not carry | Closed for the ad origins; the style-src item is documented debt with a reason |
| low | Root `package.json` declares `"main": "index.js"` but no root `index.js` exists | `package.json` (`main`) vs. repository root | Any consumer treating the workspace root as a package resolves a nonexistent entry | Remove the `main` field (the package is `private: true`) |
| low | `scripts/requirements-pipeline.txt` is missing, so the Python dependency install step relies on its `|| pip install pytest` fallback | `.github/workflows/ci.yml` `test-pipeline-scripts`; file absent | The pipeline test job silently runs with an under-specified dependency set | Commit the requirements file or drop the failing first command |
| low | Committed reference SQL schemas with no runtime driver | `scripts/db/*.sql`, `scripts/db/README.md`; no `pg`/`postgres` dependency in any manifest | Readers may believe a second database is in play | Keep — `scripts/db/README.md` already states production is Firestore |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| `jsonwebtoken` is a declared production dependency with zero imports | Likely left over from an earlier token-verification path; verification now runs through `firebase-admin` | `package.json` (`dependencies`), `backend/middleware/firebaseAuth.js` — `grep -rn jsonwebtoken` over the tree finds only the manifest/lock and docs | Extra install weight on every deploy; a reader assumes JWT verification happens in-repo; a security review has to chase a dependency that does nothing | Remove it, or document why it must stay (e.g. a planned path) |
| Two parallel script-naming conventions in `scripts/` | `snake_case.mjs` predates the `kebab-case.mjs` gate/QA scripts | `scripts/validate_env.mjs` vs `scripts/check-bundle.mjs` | Inconsistent discovery, harder automation, review friction | Adopt one convention for new files and rename opportunistically |
| ESLint rules configured at `warn` under a step named "0-error policy" | Burn-down strategy recorded in `eslint.config.js` ("tighten to `--max-warnings 0` once the legacy count is burned down") | `eslint.config.js`, `.github/workflows/ci.yml` | Warnings accumulate invisibly; `any` and unused vars keep growing | Track the warning count as a metric and ratchet |
| `console.log` in production code despite `no-console` warning | Logging convenience; the rule allows only `warn`/`error`/`info` | 16 occurrences in `backend/`, `api/`, `serverless/`, `utils/` (e.g. `backend/routes/forecasts.js`, `backend/routes/liveVoice.js`) | Unstructured stdout logs; noisy production output | Route through `utils/logger.js` or `console.info` |
| Hardcoded public Firebase config fallbacks | So the app boots without a local `.env` | `frontend/src/lib/config.ts` (API key, project id, app id, measurement id, database URL), `backend/db.js` (Firestore applet DB id) | Credential-shaped literals in source; environment drift if a project is renamed | Keep the values but centralise them in one documented constants module with a comment on rotation |
| Model artifacts retained in-repo while the publication policy excludes them | "Trained model files in `Models/` are retained unadvertised" | `Models/*.tflite`, `README.md`, `backend/server.js` (404 routes) | Any host-config regression exposes research-private artifacts | Keep the explicit 404 routes; add a CI assertion that no host config serves `Models/` |
| Two API implementations (Express + Vercel) with parity maintained by convention | Historical: Vercel is primary, Express is the self-host fallback | `backend/routes/*` vs `serverless/v1/*` | Silent behavioural divergence between deployments | Keep `__tests__/api/serverlessRouting.test.js` and add contract tests that hit both surfaces |
| Snapshot freshness depends on a scheduled workflow pushing to `main` | The site-health probe publishes `data/site-health/latest.json` and `frontend/public/data/freshness.json` | `.github/workflows/site-health.yml` (publishes only when `GITHUB_REF_NAME == main`) | If repository workflow permissions are read-only, the freshness artifact silently stops updating (the step degrades to a warning) | Make the degraded path loud, or publish from a job with guaranteed write access |

### 3) Security Concerns

| Risk | OWASP category | Evidence | Current mitigation | Gap |
|------|----------------|----------|--------------------|-----|
| Information disclosure via raw error strings | A05 (Security Misconfiguration) / A09 | `backend/utils/clientError.js` header documents the 2026-09-17 audit finding (`{ error: err.message }`, `{ detail: dbErr.message }`) | `clientError()` returns generic 5xx messages and logs detail server-side | Coverage depends on every route using the helper; no lint rule enforces it |
| Committed credential-shaped public identifiers | A05 | `frontend/src/lib/config.ts` fallback values | `scripts/check-secrets.sh` allows public Firebase identifiers by pattern; `docs/ENVIRONMENT_SECRETS.md` states `VITE_*` is public by design | The scanner's allowlist is implicit; a real secret with an `AIza` prefix would be treated as public |
| Firestore rules authorisation on client-supplied data | A01 (Broken Access Control) | `firestore.rules` — rules read both `user_id` and `userId` spellings; comments note the old camelCase-only check denied owners and skipped validators | Ownership helper accepts both spellings; validators bound string lengths and key budgets; default-deny global rule | Rules are verified only by `__tests__/firestoreRules.test.js`; no emulator run in CI |
| Missing `.env.example` (reopened 2026-09-30) | A05 | File absent from the tree and from `HEAD`; `git check-ignore -v .env.example` → `.gitignore:47:.env.*`; `docs/ENVIRONMENT_SECRETS.md` §0 instructs `cp .env.example .env` | `scripts/check-secrets.sh` scans the tracked tree (passed: 903 files); no gate requires the template, so nothing fails loudly | A contributor cannot follow §0; the template half of `test_secret_scan.py::test_the_shipped_env_example_is_clean` silently no-ops; the intended `!.env.example` negation is dead code because a later `.env.*` pattern wins |
| CSP `style-src` allows `'unsafe-inline'` | A05 | `vercel.json` CSP; `backend/security/csp.js` | Single CSP source shared by self-host and both Vercel configs; `frame-ancestors 'none'`; HSTS with preload; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` + auth origins. **The ad-network `script-src` allowlist was removed 2026-09-30** (no advertising on the site) and the parity test asserts its absence | `'unsafe-inline'` for styles is still required by 162 `style={{…}}` and 69 `style="…"` sites; removing it needs a nonce/hash pass this static build cannot do — documented in `backend/security/csp.js` |
| Rate limiting and auth on expensive endpoints | A07 (Identification & Authentication Failures) | `backend/middleware/rateLimit.js`, `backend/middleware/firebaseAuth.js`, `backend/server.js` layered limiters | Baseline limiter on `/api`, tighter buckets on AI/predict/alerts; timing-safe `BACKEND_API_KEY` check that fails closed when unset | Limits are per-process in-memory by default. The self-host Express backend is a **confirmed supported deployment target** (2026-09-30), so this is a live concern: a multi-instance self-host deployment would not share counters |
| **[RESOLVED]** Silent gate no-ops for publication embargo / RAG archive | A04 (Insecure Design) — governance | `package.json` and `.github/workflows/ci.yml` (both gates removed 2026-09-30) | The gates no longer exist, so they cannot pass silently; the archive severity-index rule is enforced at runtime by `e2e/full-app-qa.spec.ts`, which is in the default Playwright `testMatch` | None |
| Stored role in Firestore is display-only | A01 | `firestore.rules` comment: "Authorization never reads this document — the backend takes the role from verified token claims" | Authorisation uses token claims, not stored role | A client can still write a misleading role for display purposes |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|--------------|------------------------|
| Very large client bundle surface | `frontend/package.json` (three.js, remotion, leaflet, recharts, mui, emotion, jspdf, html2canvas), `npm run check:bundle` gate | A bundle budget gate exists, implying the payload is actively managed | Landing LCP target < 2.5 s on Bangladesh 3G (PRD §5.4) is at risk as dependencies grow | Keep the map lazy-loaded (already noted in PRD §5.4); audit `remotion`/`three` tree-shaking |
| In-memory rate limiting and in-memory store fallbacks | `backend/middleware/rateLimit.js`, `backend/forecastStore.js` (in-memory fallback), `FORECAST_STORE_MEMORY` / `ALERT_STORE_MEMORY` flags | Works on a single instance | Multi-instance self-host deployments get per-instance counters and divergent fallback state | Use a shared store (Redis) for counters if the self-host path is ever scaled |
| Sequential `await` inside loops | 52 `for (` loops with awaits in `backend/` (e.g. per-row ingestion in `backend/routes/forecasts.js`, per-subscriber sends in `backend/alerts/notify.js`) | Each row/subscriber is processed one at a time | The 128-row daily ingest and the subscriber fan-out grow linearly | Batch Firestore writes (`writeBatch` is already imported in `backend/db.js`); parallelise subscriber sends with a concurrency cap |
| Polling client | `frontend/src/hooks/useForecasts.ts` (`refetchInterval: 5 min`) | Every open client re-fetches the full bulk payload | 64-district × 2-horizon payload on a 5-minute poll across many clients | Move to Firestore realtime listeners (PRD §5.1 names them as the primary path) or lengthen the interval with ETag support |
| Full-district bulk payload | `api/v1/forecasts/[action].js` → `serverless/v1/forecasts/bulk.js` | One payload carries all 64 districts | Bandwidth-constrained clients; `useBandwidthMode` exists as a partial mitigation | Support field projection (`fields` param already exists in `packages/api`) and per-division queries |
| Map tile + marker rendering | `frontend/src/components/LiveMapView.tsx` (2,476 lines), `leaflet.markercluster` | Heavy component loaded for the district map | Low-end mobile devices | Keep lazy-loaded; measure with `apps/mobile/.maestro/perf-scenario.yaml` |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|--------------|----------------------|
| `.github/workflows/ci.yml` | 612 lines, 6 jobs, many inline heredocs; comments now describe guards that exist (`test_workflows.py`), so correctness depends on keeping comment and step in step | Cannot be measured from git history: **this checkout contains a single squashed commit** (`git log` = 1 commit, `deff0d9`, 2026-10-01), so every file shows identical churn of 1 and no 90-day ranking is possible | Change one job at a time; keep the Python workflow-guard tests green; never edit the `secrets` context inside an `if:` |
| `frontend/src/components/LiveMapView.tsx` | 2,476 lines mixing Leaflet lifecycle, measurement, telemetry and rendering; a build-only `leafletGlobalShim` plugin in `frontend/vite.config.ts` exists specifically because this area white-screened in production | Same limitation as above (single-commit history) | Extract pure helpers first; keep the shim plugin and its comment intact until the ESM/Leaflet interop is resolved upstream |
| `backend/alerts/lifecycle.js` | Encodes the publication policy (only WATCH-equivalent may auto-publish; above that requires a named reviewer) | Same limitation as above | Treat as a policy file: any change needs PRD/TRD cross-reference and the `__tests__/alerts/*` suites green |
| `frontend/src/lib/config.ts` | Single source of truth for all client service identifiers with hardcoded fallbacks | Same limitation as above | Change values here only (the file comment names `src/firebase.ts` as the cautionary tale) |
| `scripts/build_content_engine.mjs` | 1,327-line generator whose output is committed and gated (`--check` mode plus a "committed content index matches this build" CI step) | Same limitation as above | Always run the generator and commit its output in the same change |
| `backend/server.js` | Middleware order encodes the security posture (helmet → requestId → CORS → limiters → routes → static → SPA fallback) and contains the model-artifact 404 guards | Same limitation as above | Append, don't reorder; re-run `__tests__/cors.test.js`, `__tests__/api/security.test.js`, `__tests__/securityHeadersParity.test.js` |

> **Churn note:** `git log --oneline` in this checkout returns exactly one commit (`deff0d9`, 2026-10-01 — a squash of the migration branch; the previous pass saw `674c03c`), so the scan's "high-churn files (last 90 days)" section lists every file with a count of 1 and carries no signal. The fragility ranking above is derived from file size, coupling and gate coverage instead.

### 6) `[ASK USER]` Questions

All ten questions raised by the initial mapping were answered on 2026-09-30 and are now
closed. They are recorded here with the answer and the change, because the decisions are
not otherwise visible in the tree.

1. ~~`[ASK USER]`~~ **`__tests__/modelPerformance.test.js` is invoked by the CI post-build step but does not exist — deleted intentionally, or lost?** → *Deleted intentionally.* The step no longer names it. (The `/model-performance` page and its data artifact remain covered by `__tests__/contentEngine.test.js`.)
2. ~~`[ASK USER]`~~ **Should `docs/PUBLIC_SURFACE.md`, `docs/design/impeccable.md` and `.impeccable/config.json` be restored, or the gate comments rewritten?** → *Rewrite the comments.* No document was restored; 14 call sites now point at `scripts/lib/public-text.mjs`, and the design gate points at `docs/design/impeccable-baseline.json`.
3. ~~`[ASK USER]`~~ **Are `check:embargo` / `archive:rag:check` still required or retired?** → *Retired.* Both npm scripts and CI steps removed; `e2e/full-app-qa.spec.ts` now enforces the archive severity-index rule at runtime.
4. ~~`[ASK USER]`~~ **Should `scripts/tests/test_workflows.py` be restored?** → *Yes.* Restored with 7 tests, and the model-version handshake step they describe was added to `ci.yml`.
5. ~~`[ASK USER]`~~ **Should the stale `--testPathIgnorePatterns` entries be removed?** → *Yes.* The list is now directory scopes only; 7 named suites run again.
6. ~~`[ASK USER]`~~ **Should a placeholder-only `.env.example` be committed?** → *Yes — but see item 15: the decision stands and the file is still not in the tree.* (The first pass believed it was committed; the second pass found the `.gitignore` ordering defeats the negation, so the file could never have been added.)
7. ~~`[ASK USER]`~~ **Is advertising still part of the site (CSP ad-network allowlist)?** → *No.* The 5 ad-network origins are removed from the single CSP source and both Vercel configs; the parity test asserts their absence. `style-src 'unsafe-inline'` is kept and documented (162 + 69 inline-style sites).
8. ~~`[ASK USER]`~~ **Is the self-host Express backend still a supported deployment target?** → *Yes.* Documented as a supported target in `STACK.md` §5 and `ARCHITECTURE.md` §1; its in-memory rate limiting and store fallbacks are therefore a live concern, not dead code.
9. ~~`[ASK USER]`~~ **Should the 3 unrun Playwright specs be added to the default `testMatch`?** → *Yes.* `smoke`, `critical-paths` and `mobile-responsive` are now discovered by `playwright.config.ts`.
10. ~~`[ASK USER]`~~ **Can the dead v0/Next.js `app/` scaffold be deleted?** → *Yes.* Deleted, and the `app/**` ESLint ignore entry removed.

**Still open (new, raised by doing the work above):**

11. ~~`[ASK USER]`~~ **`style-src` still allows `'unsafe-inline'` — is the documented reason acceptable?** → *Yes, acceptable.* The reason is recorded in `backend/security/csp.js` (Tailwind ships a stylesheet, but the map and chart layers set inline styles for geometry, and a nonce needs a server render pass this static build does not have). No further CSP work planned.
12. ~~`[ASK USER]`~~ **Do the 7 re-enabled backend suites fail?** → *No.* `node_modules` was installed (`npm ci --legacy-peer-deps --no-audit --no-fund`, 2513 packages) and the CI backend command was run verbatim: **77 suites passed / 2 skipped, 808 tests passed / 23 skipped**. The 7 named suites on their own: **7 suites, 105 tests, 0 failures**. Nothing needed fixing. *(Re-measured 2026-09-30: 79 suites passed / 2 skipped, 819 tests passed / 23 skipped — the two suites added since the first pass account for the difference. The 7 named suites still pass.)*

    A side observation from running it: passing the 7 paths *after* `--testPathIgnorePatterns` silently excluded them (70 suites ran instead of 77) — the exact bug `test_backend_jest_step_has_no_bare_selector` guards against. The selector must come first.

**Still open (new, from running a live instance — see §8):**

13. `[ASK USER]` The forecast store serves **74 of the 128 rows** the PRD claims (60 of 64 districts, only 14 with both horizons) and the data is 355.5 h old against a 192 h SLO. Is the daily Kaggle ingest pipeline still running, and should the public 128-row claim (CLM-005) be qualified until coverage is restored?
14. `[ASK USER]` `model_version` is `null` in the ingest output, which blocks all alert auto-publication above WATCH (§1.6). Is stamping a model version on the ingest path in scope? The model-version handshake gate restored in this change is the natural place to enforce it.

**Still open (raised by the 2026-09-30 second pass):**

15. `[ASK USER]` The `.env.example` question (item 6) was answered "commit the template", but the file is not in the tree and cannot be added without changing `.gitignore` ordering. Should the template be restored (with the ignore rule fixed), or should `docs/ENVIRONMENT_SECRETS.md` §0 stop instructing `cp .env.example .env` and the dead `!.env.example` line be removed?
16. `[ASK USER]` `packages/core` advertises `./alerts`, `./i18n` and `./bandwidth` but ships none of those files, and mobile imports an undeclared `./notificationMatcher`. Should the missing modules be moved into `packages/core` (completing the apparent migration), or should the `exports` map be trimmed to what exists?
17. `[ASK USER]` The dev port conflict (now in §1): the "do NOT change or override" comment on `backend/server.js`'s port makes this an owner call — backend reads `PORT` (3001 in dev) or the Vite proxy moves to 3000?

### 7) Live Deployment State (first observed 2026-09-30 against a running instance; re-measured 2026-09-30 from the committed artifacts)

These are not code defects — the code serves the store faithfully. They are the state of
the *data and the deployed surface*. The first pass measured them against a locally
started instance (Vite dev on :3000 proxying to the Express backend on :3001); this pass
re-derived the same numbers directly from the repository's own published artifacts
(`frontend/public/data/freshness.json`, `frontend/public/data/forecasts-latest.json`,
`backend/data/forecasts/manifest.json`, `data/site-health/latest.json`). The forecast-age
figure moved from 343.6 h to 355.5 h between the two readings — the artifacts are only
rebuilt when the pipeline commits, so age keeps increasing while the ingest stays down.

| Observation | Measured value (re-read 2026-09-30 from the committed artifacts) | Evidence |
|-------------|----------------|----------|
| Forecast rows served | **74** (25 × `7_days`, 49 × `15_days`) against the **128** claimed by PRD REQ-001 / CLAIMS.md CLM-005 — 58% | `frontend/public/data/forecasts-latest.json` (`coverage.produced_units`, `coverage.units_per_horizon`); `backend/data/forecasts/manifest.json` (`row_count: 74`) |
| District coverage | **60 of 64** districts have a row for at least one horizon; only **14** have both | `frontend/public/data/forecasts-latest.json` (`coverage: {districts_covered: 60, districts_expected: 64, status: "partial"}`); `frontend/public/data/freshness.json` |
| Forecast age | **355.5 h** old (`prediction_date` 2026-09-16) against a **192 h** SLO | `frontend/public/data/freshness.json` (`forecast_ingest.age_hours` → 355.5, `forecast_snapshot` → 355.5) |
| Alert snapshot age | **310.4 h** old against a **48 h** SLO | Same (`alert_engine.age_hours`) |
| Published alerts | **0** — and `model_version` is `null` (`provenance.model_version`), so §1.6 blocks all auto-publication above WATCH | `frontend/public/data/forecasts-latest.json` (`provenance`); `GET /api/v1/alerts` (0 alerts, disclaimer present) |
| Site-health probe | **failing**: 2 passed, 5 not passed (`security_headers` failed; `sitemap`, `forecast_data`, `status_page`, `content_pages` skipped) | `data/site-health/latest.json` (`checks[]`), `frontend/public/data/freshness.json` (`site_probe`) |
| Overall published state | `failing` — `fresh: 0, stale: 3, failing: 1, missing: 0` | `frontend/public/data/freshness.json` (`overall`) |

**What this does and does not mean.** The provenance-first design is working: the site
publishes its own degraded state rather than hiding it, reporting absent data as absent
and naming the SLO it missed. The gaps are upstream of this repository — the daily Kaggle
ingest that produces the 128-row CSV is not landing complete, current data. Two
consequences worth acting on:

- The **128-row / 64-district** claim is public copy (CLM-005) and is currently not met by
  the live store. Either the ingest is restored, or the claim is qualified.
- `model_version` being `null` is the same class of problem the restored model-version
  handshake gate addresses, one stage later: the gate proves `Models/VERSION.json` is
  committed and clean, while the ingest pipeline is what has to *stamp* that version onto
  its output. The gate will not catch a null stamp.

### 8) Evidence

- Scan output: `docs/codebase/.codebase-scan.txt` (CODE METRICS, CI/CD PIPELINES, SECURITY & COMPLIANCE, TODO/FIXME/HACK = none found in production source, HIGH-CHURN FILES)
- Terminal evidence, 2026-09-30: `npm ci --legacy-peer-deps --no-audit --no-fund` → added 2513 packages; backend CI jest command → 79 suites passed / 2 skipped, 819 tests passed / 23 skipped (coverage 61.48% statements); frontend CI jest command → 54 suites / 498 tests; `python3 -m pytest scripts/tests -q` → 119 passed; `node scripts/check-vercel-functions.mjs` → 6/12; `node scripts/verify_claims.mjs` → 16 claims verified; `bash scripts/check-secrets.sh` → passed (903 files); `node scripts/validate_env.mjs` → exit 0 with no template check; `npx jest --listTests` → 135 files; `git check-ignore -v .env.example` → `.gitignore:47:.env.*`
- `.github/workflows/ci.yml` (backend ignore list; model-version handshake step; post-build surface checks; design/public-surface gate comments)
- `.github/workflows/site-health.yml`, `.github/workflows/daily_advisory_ingest.yml`, `.github/workflows/verify-secrets.yml`, `.github/workflows/Firebase-Store-Verify.yml`, `.github/workflows/app-releases.yml`
- `scripts/tests/test_workflows.py` (workflow guards; 7 tests, mutation-tested — part of the 119-passing Python suite), `scripts/tests/test_secret_scan.py` (secret-scan regression suite; `.env.example` half conditional on a file that is absent)
- `package.json` (`main: "index.js"` with no root `index.js`; `requirements-pipeline.txt` absent from `scripts/`), `.gitignore` (line 2 `!.env.example` vs line 47 `.env.*`)
- `docs/ENVIRONMENT_SECRETS.md` §0/§2 (variable reference and the `cp .env.example .env` step), `README.md` (repository layout + model-artifact statement)
- `packages/core/package.json` (`exports` map) vs `ls packages/core/src/`; `apps/mobile/src/lib/notifications/notifyAlert.ts:12` (`@hazardnet/core/notificationMatcher` import)
- `frontend/vite.config.ts` (port 3000 + `strictPort` + 3001 proxy), `backend/server.js` (hardcoded 3000), `monitoring/prometheus.yml` (`localhost:3001`)
- `frontend/src/lib/config.ts`, `backend/db.js` (hardcoded fallbacks)
- `backend/utils/clientError.js`, `firestore.rules`, `backend/middleware/rateLimit.js`, `backend/middleware/firebaseAuth.js`
- `backend/security/csp.js`, `vercel.json`, `frontend/vercel.json`, `__tests__/securityHeadersParity.test.js` (CSP source + parity + ad-origin absence)
- `frontend/src/components/LiveMapView.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/district/DistrictBriefBody.tsx`, `frontend/src/data/sectorAdvisoriesData.ts`, `scripts/build_content_engine.mjs` (largest source files)
- `playwright.config.ts` vs `e2e/` (all 6 specs now in the default `testMatch`)
- `scripts/db/README.md` (SQL reference-only status)
- `frontend/public/data/freshness.json`, `data/site-health/latest.json` (the repository's own published freshness/probe artifacts)
- `GET /api/v1/forecasts/bulk`, `GET /api/v1/forecasts/metadata`, `GET /api/v1/alerts` measured against a locally running instance
- `git log --oneline` (single squashed commit — churn signal unavailable)
