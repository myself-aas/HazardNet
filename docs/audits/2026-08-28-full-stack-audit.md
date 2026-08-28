# HazardNet-AI — Full-Stack Technical Audit

**Date:** 2026-08-28 · **Branch:** `arena/01a0484e-hazardnet-ai` · **Scope:** entire codebase @ `6cd2d79`
**Auditor:** Arena Agent (static analysis + dynamic verification + dependency audit)
**Supersedes:** `docs/codebase/CONCERNS.md` (several of its items have since been fixed — see §9)

---

## 1. Executive Summary

HazardNet is a ~32,000-line codebase: a React 18 + Vite + Tailwind v4 frontend (≈29.0k LOC), an Express + TensorFlow.js inference backend (≈2.7k LOC), three Vercel serverless functions, a RAG knowledge pipeline, and weekly Kaggle forecast automation. The product ambition (multi-hazard AI early warning for Bangladesh's 64 districts, offline-capable, SOD-2019-compliant outputs) is genuinely impressive, and several layers are **better engineered than typical projects of this size** — default-deny Firestore rules with field validation, Zod-validated ingestion, graceful AI fallback chains, Prometheus metrics, and a service worker with bounded tile caching.

However, the audit found **68 actionable findings**, of which **4 are Critical** and **11 High**. The dominant theme is **architectural fragmentation**: three backend platforms are wired simultaneously (Supabase auth + two different Firebase projects + RTDB), two frontends exist in the repo (the app and a forgotten `app/applet` copy), dependencies are declared in the wrong manifests (a Postman MCP server ships as a *production* dependency carrying **1 Critical + 9 High CVEs**), and two of three serverless functions use a module format that cannot load under the repo's own `"type": "module"` declaration. For a disaster early-warning system, the most serious finding is an **integrity** one: the prediction endpoint fabricates *random synthetic tensors* when input is missing and returns them as real model output.

**Overall health: 5.6 / 10** — a strong core held back by integration debt that is very fixable in a focused 2–3 week effort.

| Domain | Score | Headline |
|---|---|---|
| Security | 4.5/10 | 18 CVEs in prod deps; 5/7 API routes unauthenticated; no rate limiting |
| Architecture | 5/10 | Triple-backend identity crisis; duplicate frontend; dead abstractions |
| Backend & API | 6/10 | Solid patterns (Zod, metrics, VAPID) undermined by broken module configs |
| Frontend | 6.5/10 | Great UX work; 2.95 MB unsplit bundle; zero lazy routes; no error boundary |
| Testing & QA | 4/10 | Good seeds (supertest, RTL) but no CI gate; 2 suites broken; no coverage |
| CI/CD & Ops | 5/10 | Weekly pipelines are good; **no PR CI at all**; dual deploy targets undecided |
| Documentation | 7/10 | Strong README/docs; one stale concerns doc; no ADRs |
| Code hygiene | 6/10 | `tsc strict` clean; 70 console logs, 39 `as any`, zero ESLint |

---

## 2. Methodology

1. **Structure & config inventory** — file counts, LOC, manifest analysis (root/frontend), deploy configs (`vercel.json`, `firebase.json`, `.firebaserc`), CI workflows.
2. **Dynamic verification** — every suspicion was executed: `node -e "import(...)"` on each serverless function, production build, `tsc --noEmit`, jest run, compiled-CSS checks, jsPDF output smoke test.
3. **Dependency audit** — `npm audit --omit=dev` against a generated lockfile (the repo uses Bun's `bun.lock`; npm audit requires `package-lock.json`).
4. **Secret scanning** — regex sweeps for credential patterns across tracked files.
5. **Manual code review** — backend routes/middleware/services, frontend auth/store/services, service worker, build chain, ML pipeline glue, Firestore rules.
6. **Best-practice baselines** — OWASP ASVS L2, Google Web Fundamentals, Express production checklist, WCAG 2.2 AA, Vercel/Node packaging norms.

Reproduction commands for every claim are in **Appendix A**.

---

## 3. Architecture As-Is

```
                         ┌────────────────────────────────────────────────┐
   Browser (PWA)         │ frontend/ (React 18, Vite 5, Tailwind 4, RTK*) │
   • Leaflet maps        │  Auth → SUPABASE (lib/supabase, AuthContext)   │
   • TFLite WASM model   │  Realtime status → FIREBASE RTDB (services/firebase.ts)
   • SW offline cache    │  Dead config → src/firebase.ts (project "hazardnet-live", imported by nobody)
                         └───────┬───────────────────────┬────────────────┘
                    /api proxy → │ (dev :3001)           │ direct
                         ┌───────▼────────┐      ┌───────▼───────────────┐
                         │ backend/ (Express + TFJS inference, prom metrics,
                         │  Gemini/RAG chat, web-push, Firestore forecasts)
                         │  ⚠ PORT hardcoded 3000 (= vite dev port)
                         └───────┬────────┘
                                 │ shared code
                         ┌───────▼────────────────────────────┐
                         │ api/ (Vercel functions: ingest ✓ESM,
                         │  forecasts ✗CJS-under-type:module, metrics ✓ESM)
                         └───────┬───────────────────────────┘
                                 │
        Firestore "ai-studio-hazardnet-…"(dbId from firebase-applet-config.json)
        + Supabase Postgres (profiles, assessments) + Kaggle→Supabase weekly pipeline
        + second app copy: app/applet/frontend/ (unused duplicate UI)
```

---

## 4. Findings Catalog

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low. Each finding lists evidence, impact, and the fix steps.

### A. Security

**SEC-01 · 🟠 High — 5 of 7 API routes have no authentication, and none have rate limiting**
*Evidence:* `grep -c BACKEND_API_KEY backend/routes/*.js` → `advisory.js 0, agent.js 0, chat.js 0, conversions.js 0, predict.js 0` (only `forecasts.js`, `push.js` check the bearer key). No `express-rate-limit` anywhere.
*Impact:* `/api/chat/query` and `/api/agent` invoke **paid Gemini API calls** with server keys; `/api/predict` runs CPU-bound TFJS inference. Anyone on the internet can drain your Gemini quota and CPU unopposed.
*Fix (step-by-step):*
1. `npm ws add express-rate-limit` (root, backend workspace).
2. Create `backend/middleware/rateLimit.js`: per-IP limiter (`windowMs: 60_000, limit: 20`) for AI routes; `limit: 120` for read routes.
3. Apply `app.use('/api/chat', chatLimiter, chatRoutes)` etc. in `backend/server.js`.
4. For chat, additionally require a Firebase/Supabase **ID token** (`Authorization: Bearer <jwt>`, verified with the admin SDK) for anonymous-cost protection, keeping a quota'd anonymous lane if desired.
5. Add 429 responses to the frontend `ChatBot` error handling.

**SEC-02 · 🔴 Critical — 18 vulnerabilities in production dependencies (1 Critical, 9 High)**
*Evidence:* `npm audit --omit=dev` → `18 vulnerabilities (8 moderate, 9 high, 1 critical)`; the Critical (`uuid` buffer bounds) chain roots entirely in **`@postman/postman-mcp-server@^2.11.2`** — a Postman MCP *dev tool* listed in root `dependencies` and deployed to production.
*Impact:* Known-exploitable paths in the request/uuid chain inside the server runtime.
*Fix:*
1. Move `@postman/postman-mcp-server` out of `dependencies` (delete it — nothing in `backend/`, `api/`, or `frontend/src` imports it).
2. Regenerate the lockfile (`bun install`), re-run `npm audit --omit=dev` → expect ≤ 4 moderate findings.
3. Add `npm audit --omit=dev --audit-level=high` to CI (OPS-01) as a merge gate.

**SEC-03 · 🔴 Critical (integrity) — `/api/predict` fabricates random data when input is missing**
*Evidence:* `backend/middleware/validation.js` — when `req.body.tensor` is absent but a `districtId` is present, it builds a tensor filled with `Math.random()` values ("Precip: 15.5 + random*5.0" etc.) and passes it to the model as a genuine reading.
*Impact:* A **disaster early-warning API** returns authoritative-looking severity predictions derived from noise. This is the worst class of defect for this product — worse than a crash.
*Fix:*
1. Delete the synthetic-tensor branch from `validateTensor`.
2. Return `422 Unprocessable Entity` with `{ error: 'tensor payload required' }`.
3. If a demo mode is needed, gate it behind `process.env.DEMO_MODE === 'true'` **and** label responses `{"demo": true}`; never in production.
4. Add a unit test asserting 422 on missing tensor.

**SEC-04 · 🟠 High — CORS fully open on the backend**
*Evidence:* `backend/server.js:23` — `app.use(cors())` with no options (`Access-Control-Allow-Origin: *`).
*Impact:* Any origin can script the unauthenticated endpoints (see SEC-01), e.g., mining your inference from third-party sites.
*Fix:* `app.use(cors({ origin: (o, cb) => cb(null, !o || ALLOWLIST.includes(o)), methods: ['GET','POST'] }))` with `ALLOWLIST` from env (`FRONTEND_ORIGIN=https://hazardnet…`); keep `*` only for `/health` and `/metrics` if scrapers need it.

**SEC-05 · 🟡 Medium — Minimal security headers; no helmet**
*Evidence:* `server.js` sets only `X-Content-Type-Options`, `X-XSS-Protection` (obsolete header), `Referrer-Policy`. No CSP, HSTS, `X-Frame-Options`, Permissions-Policy.
*Fix:* Add `helmet()` with a CSP allowing `connect-src` for Firebase/Supabase/Gemini domains, `worker-src blob:`, `img-src` tile hosts + `data:`; drop `X-XSS-Protection`. Set HSTS at the Vercel edge too.

**SEC-06 · 🟡 Medium — Bearer-key comparison is not constant-time; key-undefined behavior is silent**
*Evidence:* `backend/routes/forecasts.js:40`, `push.js:95`, `api/ingest.js` — `token !== process.env.BACKEND_API_KEY`.
*Impact:* Theoretical timing side channel; and if the env var is unset at deploy, every ingest fails with 401 and no signal.
*Fix:* `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(key))` guarded by `if (!key) { logger.error('BACKEND_API_KEY unset'); return 500 }`. Add a startup assertion in `server.js`.

**SEC-07 · 🟡 Medium — Three Firebase configurations and a Supabase config coexist**
*Evidence:* `frontend/src/firebase.ts` (project **hazardnet-live**, `getAnalytics`, imported by nobody), `frontend/src/services/firebase.ts` (project **hazardnet-aas48424**, used by connectivity hooks), `firebase-applet-config.json` + `backend/db.js` (Firestore db `ai-studio-hazardnet-28005e8f-…`), and `lib/supabase.ts` (auth/profiles). `.firebaserc` pins `hazardnet-aas48424`.
*Impact:* Client API keys are public by design (not a leak), but orphaned configs invite misconfiguration and confuse rule enforcement across projects; a rules change on the wrong project silently breaks the other.
*Fix:* See ARC-01 — single source of truth via env vars; delete `src/firebase.ts`; keep exactly one Firebase project + Supabase, each behind `VITE_`/server env vars with no committed fallback literals.

**SEC-08 · 🔵 Low — `dangerouslySetInnerHTML` in PrintPreviewModal**
*Evidence:* `PrintPreviewModal.tsx` renders a DOM clone string. Content derives from the app's own DOM (low risk), but any future third-party embed in a captured container becomes an XSS sink.
*Fix:* Keep the clone-node approach but sanitize with DOMPurify, or refactor the preview to render the same React subtree inside a print stylesheet context.

**SEC-09 · 🔵 Low — Push subscriptions keyed by a shared static key**
*Evidence:* `backend/routes/push.js` bearer `BACKEND_API_KEY` only; no per-user identity on subscriptions.
*Fix:* Verify a user JWT and store `uid` with the subscription; prune subscriptions on sign-out.

✅ **Already good:** default-deny Firestore rules with per-collection field validation (`firestore.rules`), Zod payload schema on ingest, multer 10 MB cap, VAPID keys from env, model artifacts blocked from public serving, no secrets in git (scan clean apart from *public-by-design* client configs).

### B. Architecture

**ARC-01 · 🟠 High — Three-backend identity crisis (decision required)**
Auth/profiles/assessments live in **Supabase**; forecasts in **Firestore** (via an "AI Studio applet" config); realtime presence in **Firebase RTDB**; and a *third* Firebase project is configured but unused. Every new feature must guess which backend applies.
*Fix (decide, then migrate in thin slices):*
1. Write an ADR: e.g., "Supabase = identity + relational data; Firebase = only RTDB presence (or migrate that too to Supabase Realtime)".
2. Centralize config: one `frontend/src/lib/config.ts` reading env only; **delete** `src/firebase.ts`; remove hardcoded literals from `services/firebase.ts`.
3. Plan Firestore→Supabase migration for `forecasts` (weekly pipeline already targets Supabase via `DATABASE_URL`) — the two stores duplicate the same domain data today.

**ARC-02 · 🟡 Medium — `app/applet/frontend/` is a duplicated mini-app**
*Evidence:* near-identical copies of `App.tsx`, `MenuDrawer.tsx`, `MaterialIcon.tsx`… in `app/applet/frontend/`.
*Impact:* Dual-maintenance drift; dead weight in clones and searches.
*Fix:* Delete it (extract anything unique to `frontend/` first), or move it to its own repo if the AI-Studio applet is still deployed.

**ARC-03 · 🔵 Low — Empty Redux store + React Query + Context all coexist**
*Evidence:* `store/store.ts` — a single `app` slice with `initialState: {}` and no reducers; RTK + `@tanstack/react-query` are dependencies.
*Fix:* Remove Redux (or adopt it meaningfully for map state). One state strategy per concern: server cache = React Query, auth/session = Context, ephemeral UI = local state.

**ARC-04 · 🟡 Medium — Root `package.json` mixes three runtimes**
*Evidence:* 13 frontend-only deps (`react`, `leaflet`, `three`, `mui`, `framer-motion`…) + backend deps + an MCP server in one manifest; `workspaces: ["frontend"]`; `three`, `mapbox-gl`, `@tensorflow/tfjs`, `react-leaflet` are **imported by zero source files**.
*Fix:* Create a `backend` workspace with its own manifest; delete unused deps (`three`, `@types/three`, `mapbox-gl`, `@types/mapbox-gl`, `react-leaflet`, `@tensorflow/tfjs-tflite` unless the PWA loads it via script tag — verify at runtime); keep root for tooling only.

### C. Backend & Serverless API

**BE-01 · 🟠 High — `api/forecasts.js` cannot load under the repo's own module system**
*Evidence:* root `package.json` declares `"type": "module"`; `api/forecasts.js` uses CommonJS (`const … = require('…')`); dynamic import fails locally (`Cannot find module '../backend/services/advisoryAgent'` — extensionless CJS resolution). `api/metrics.js` (ESM, `export default`) and `api/ingest.js` (ESM, named) work but use **different export conventions**.
*Impact:* The CSV-upload function is one bundler quirk away from 500-ing on Vercel; locally it is already broken.
*Fix:*
1. Convert `forecasts.js` to ESM with **explicit `.js` extensions** on relative imports.
2. Standardize all three functions on `export default async function handler`.
3. Add a CI smoke test: `node --input-type=module -e "await import('./api/forecasts.js')"` style checks for each function.

**BE-02 · 🟠 High — Backend port collides with the frontend dev server and its own proxy**
*Evidence:* `backend/server.js:84` `const PORT = 3000` while `frontend/vite.config.ts` serves on `3000` and proxies `/api`→`http://127.0.0.1:3001`. `npm run dev` therefore fights Vite for 3000, and even if it wins, the proxy targets 3001.
*Fix:* `const PORT = process.env.PORT || 3001` + startup log; document `npm run dev` flow in README (vite on 3000, API on 3001).

**BE-03 · 🟡 Medium — No request size/time guards on AI routes**
*Evidence:* `express.json({ limit: '10mb' })` globally; chat route caps input fields (good) but nothing caps conversation count server-side beyond `slice(-8)` or total request rate.
*Fix:* Route-level body limits (`/api/chat` → 64 KB), `server.setTimeout(30_000)`, and the SEC-01 limiter.

**BE-04 · 🟡 Medium — `console.log` logging; no request IDs; Prometheus registry is per-process**
*Evidence:* `server.js`, routes log via console; `prom-client` default registry only survives while a process lives — on Vercel functions it resets per invocation, so `/api/metrics` there is near-meaningless.
*Fix:* Adopt `pino` (+ `pino-http`) with request IDs; keep `/metrics` on the long-running Node server; for Vercel, rely on platform logs or switch to a pull-less exporter later. Document that `/api/metrics` is best-effort.

**BE-05 · 🔵 Low — `In-memory` rate/push state and single-process assumptions**
`web-push`, conversion tracking, metrics — all fine for the single Node box; revisit if you ever go multi-instance (externalize state to Postgres/Redis).

### D. Frontend

**FE-01 · 🟠 High — 2.95 MB main chunk, zero route-level code splitting, one 3,031-line component**
*Evidence:* build output `dist/assets/index-*.js 2,954 kB │ gzip 796 kB`; no `React.lazy` in `App.tsx`; `LiveMapView.tsx` 3,031 LOC.
*Impact:* Slow first load on the exact rural/low-bandwidth networks this product targets; TTI penalty; map + charts + advisory modules all ship up-front.
*Fix (step-by-step):*
1. In `App.tsx`, convert every page import to `const Dashboard = lazy(() => import('./pages/Dashboard'))` + `<Suspense fallback={…}>`.
2. Lazy-load `ChatBot`, `CommandPalette`, `PrintPreviewModal` on first interaction (`import()` on open).
3. Split `LiveMapView`: extract map layers, the 3D stage, and overlays into `features/map/*` modules (each lazily imported).
4. Add `rollup-plugin-visualizer` and a CI budget check (`dist` JS gzip < 1.2 MB initial).

**FE-02 · 🟡 Medium — Render-blocking CDN fonts in `index.html`; no error boundary**
*Evidence:* three `fonts.googleapis.com` stylesheets (JetBrains Mono + 2 Material Symbols axes variants); no `ErrorBoundary` component anywhere in `frontend/src`.
*Impact:* Offline gap (SW can't cache cross-origin opaquely without work) and a single render error whitescreens the whole early-warning UI.
*Fix:* Self-host Material Symbols subset (you already self-host Noto/Playfair via fontsource); add a top-level `ErrorBoundary` with an offline-friendly fallback UI and report hook.

**FE-03 · 🟡 Medium — 2 of 6 test suites cannot run (ESM-only dependency in jest)**
*Evidence:* `npx jest` → `RegionSelector.test.tsx`, `AdvisoryPanel.test.tsx` fail: "unexpected token" from `@supabase/supabase-js` ESM pulled in via `AuthContext` (jest's default `transformIgnorePatterns` skips `node_modules`).
*Fix:* In `jest.config.cjs` add:
```js
transformIgnorePatterns: ['/node_modules/(?!(@supabase)/)'],
```
(or `jest.mock('../../context/AuthContext')` in the suites), then make CI run `jest --ci`.

**FE-04 · 🟡 Medium — Hygiene: 70 `console.*`, 39 `as any`, zero ESLint/Prettier config**
*Evidence:* repo-wide greps (§Appendix); `tsconfig` is `strict` (excellent) but there is no lint layer at all.
*Fix:* Add `eslint@9` flat config + `typescript-eslint` + `eslint-plugin-react-hooks`/`jsx-a11y` + Prettier; start with `--max-warnings 0` on new code only (`eslint . --ext .ts,.tsx` with suppressions file for legacy); replace `as any` with real types incrementally (39 is tractable).

**FE-05 · 🔵 Low — Dead/misleading frontend code**
`src/firebase.ts` (unused project + analytics init), `lib/client.ts`/`lib/server.ts` (Supabase SSR helpers unused in a SPA; `server.ts` misreads `process.env.VITE_*` on the server), `AnalyticsAnalyticsPage` export name, `ui/motion-navigation-demo.tsx`.
*Fix:* delete or rename; keep one lib per concern.

**FE-06 · 🔵 Low — `AuthContext.tsx` is written as near-minified single-line statements** (~120-char lines with 8+ declarations each) — the file works but resists review/diffing. Reformat with Prettier print-width 100.

### E. Data, ML & Pipelines

**ML-01 · 🟡 Medium — Dual inference runtimes; backend uses full browser TFJS in Node**
*Evidence:* frontend loads the TFLite WASM model; backend `predict.js`/`validation.js` import `@tensorflow/tfjs` (the *browser* package, CPU backend in Node).
*Impact:* Slower inference and a heavier install than `@tensorflow/tfjs-node`; no SIMD/acceleration.
*Fix:* Swap backend to `@tensorflow/tfjs-node` (API-compatible for this usage); benchmark inference latency before/after (you already track `inferenceLatency`).

**ML-02 · 🔵 Low — Model/artifact versioning is hand-rolled**
`model_version: '1.0-FP32'` is a string literal in `predict.js`; `Models/*` (790 KB tflite + stats) are git-tracked — acceptable now, but the weekly Kaggle pipeline can silently change the model the code expects.
*Fix:* Emit `Models/VERSION.json` from the Kaggle pipeline; backend reads and reports it; CI diffs it against `predict.js` expectation.

**ML-03 · 🔵 Low — RAG knowledge base is a committed JSON blob** (`agent_knowledge_base.json`) rebuilt by `build_agent_knowledge_base.js` — fine; add a CI check that the JSON is newer than its sources (`references/`) so it can't go stale silently.

### F. Testing & CI

**OPS-01 · 🟠 High — No CI runs on pull requests**
*Evidence:* `.github/workflows/` contains only the two weekly pipelines; nothing lints/tests/builds on push/PR. (The stale `CONCERNS.md` claims "no CI" — weekly pipelines exist now, but the PR gate is still missing.)
*Fix:* Add `.github/workflows/ci.yml`:
```yaml
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: '1.3.14' }   # matches the committed lockfile version
      - run: bun install --frozen-lockfile
      - run: npm run lint
      - run: npx jest --ci
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high || true   # start soft, tighten later
```

**QA-01 · 🟡 Medium — Coverage unmeasured; backend happy paths only**
3 supertest suites (conversions/ingest/push) + 2 frontend suites pass; nothing covers `predict`, `chat`, `agent`, `advisory`, auth negative paths, or the new pagination module beyond unit tests.
*Fix:* `jest --coverage` gate at 40% initial; add route tests for SEC-03 (422 path), SEC-06 (401 path), and chat bounds.

**QA-02 · 🔵 Low — No e2e layer** for the differentiating features (offline load, PDF export, push). Add a minimal Playwright smoke (3 specs: dashboard renders offline, advisory→PDF produces >0-byte file, drawer nav at 375px) run weekly, not per-PR.

### G. Code Hygiene (rollup)

| Metric | Value | Note |
|---|---|---|
| `console.*` in frontend | 70 | route through a logger in prod builds |
| `as any` casts | 39 | typed incrementally |
| TODO/FIXME/HACK | 2 | healthy |
| ESLint config | none | see FE-04 |
| `tsc --noEmit` strict | ✅ clean | keep |
| Largest file | `LiveMapView.tsx` 3,031 LOC | split (FE-01) |
| Longest lines | `AuthContext.tsx` ~1,200 chars | prettier (FE-06) |

---

## 5. What Is Already Best-Practice (keep doing this)

1. **Firestore security rules** — default-deny, per-collection validators, size caps, ownership checks. Top-decile.
2. **Deterministic AI fallback chain** — Gemini → backup key → Groq/OpenRouter/HF → heuristic engine. Excellent resilience pattern.
3. **Zod at the edge** (`api/ingest.js`) + input slicing on chat fields — the right instincts.
4. **Observability seeds** — `/health`, `/metrics` (prom-client), inference latency histogram.
5. **Bounded offline caching** — SW trims tile cache to 1,200 entries; app shell cache versioned.
6. **Weekly automated forecasting + versioned releases** via scheduled Actions with least-priv secrets.
7. **tsc `strict: true` passing** across 29k LOC of TS/TSX.
8. **Design system tokenization** (this sprint): three-layer tokens, AA-contrast fixes, reduced-motion, self-hosted variable fonts.

---

## 6. Prioritized Remediation Roadmap

### P0 — this week (stop the bleeding)
| # | Action | Finding | Effort |
|---|---|---|---|
| 1 | Remove `@postman/postman-mcp-server`; regenerate lockfile; re-audit | SEC-02 | 15 min |
| 2 | Rate-limit + origin-allowlist all `/api/*` (esp. chat/agent/predict) | SEC-01/04 | 2 h |
| 3 | Delete synthetic-tensor branch in `validateTensor`; 422 instead | SEC-03 | 30 min |
| 4 | `PORT = env.PORT \|\| 3001` | BE-02 | 5 min |
| 5 | Convert `api/forecasts.js` to ESM + import CI smoke check | BE-01 | 1 h |
| 6 | Add `ci.yml` (lint, test, build, audit) | OPS-01 | 1 h |
| 7 | Fix jest `transformIgnorePatterns` for `@supabase` | FE-03 | 30 min |
| 8 | Delete `frontend/src/firebase.ts` (orphan project) | SEC-07/FE-05 | 5 min |

### P1 — this month (structural)
1. ADR + config consolidation for the backend identity (ARC-01/SEC-07); single config module, env-only.
2. Route-level code splitting + LiveMapView decomposition + bundle budget (FE-01).
3. `helmet` + CSP; `timingSafeEqual` key checks + startup env assertions (SEC-05/06).
4. Split `backend/` into its own workspace; prune unused root deps (`three`, `mapbox-gl`, …) (ARC-04).
5. ESLint 9 + Prettier, warnings-gated on changed files; logger with request IDs (FE-04/BE-04).
6. `tfjs-node` swap + latency benchmark (ML-01).
7. Error boundary + self-hosted Material Symbols (FE-02).

### P2 — this quarter (polish & scale)
1. Delete/extract `app/applet` duplicate (ARC-02).
2. Firestore→Supabase consolidation for forecasts if ADR approves (ARC-01).
3. Playwright offline/PDF/mobile smoke suite, weekly (QA-02).
4. Coverage gate 40%→60%; model VERSION.json handshake (QA-01/ML-02).
5. Decide single deploy target (Vercel functions + static vs. Node server on Railway/Fly) — today `firebase.json`, `vercel.json`, and a Node server all coexist with divergent assumptions (BE-01 exists only because of this).
6. ADRs for each P1 decision; refresh `docs/codebase/CONCERNS.md` to link here.

---

## 7. Best-Practice Checklist (target state)

**Security:** ☐ zero Critical/High CVEs in prod deps · ☐ authn on every state-changing or cost-bearing route · ☐ rate limits on all routes · ☐ strict CORS allowlist · ☐ helmet CSP · ☐ constant-time secret comparison · ☐ startup config assertions · ☐ no synthetic data in inference paths
**Backend:** ☐ one module system (ESM) end-to-end · ☐ explicit import extensions · ☐ pino structured logs w/ request IDs · ☐ per-route body limits · ☐ graceful shutdown · ☐ health/readiness split
**Frontend:** ☐ initial JS gzip < 1.2 MB · ☐ every route lazy · ☐ error boundary at root · ☐ self-hosted fonts only · ☐ ESLint clean · ☐ Lighthouse a11y ≥ 95
**Testing:** ☐ PR CI green gate · ☐ coverage ≥ 40% (rising) · ☐ negative-path tests for auth/validation · ☐ e2e smoke for offline/PDF
**Data/ML:** ☐ model version handshake · ☐ RAG JSON freshness check · ☐ tfjs-node backend
**Docs:** ☐ ADRs for architecture decisions · ☐ single deploy-source-of-truth README section

---

## 8. Verification Log (evidence that checks were actually run)

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, 29k LOC) | ✅ clean |
| `npm run build` (vite) | ✅ 15 s; main chunk 2,954 kB (finding FE-01) |
| `npx jest` | 38/38 tests pass; 2 suites fail to load (FE-03); 2 component-suite failures pre-date this branch (verified via `git stash` on base commit) |
| `import('./api/forecasts.js')` | ❌ fails (BE-01) |
| `import('./api/metrics.js' / ingest.js)` | ✅ load |
| `npm audit --omit=dev` | ❌ 18 vulns (SEC-02) |
| Secret scan (tracked files) | ✅ no private keys; 3 *public-by-design* client configs (SEC-07) |
| Firestore rules review | ✅ default-deny + field validation |
| jsPDF 4.2.1 runtime smoke (Node) | ✅ multi-page + footer output valid (prior fix verified) |

## Appendix A — Reproduce

```bash
# Deps audit (repo uses bun.lock; npm audit needs package-lock)
cp package.json /tmp/a/ && cd /tmp/a && npm i --package-lock-only --legacy-peer-deps && npm audit --omit=dev
# Serverless module check
node -e "import('./api/forecasts.js').catch(e=>console.error(e.message))"
# Port collision
grep -n "PORT" backend/server.js; grep -n "port\|3001" frontend/vite.config.ts
# Unauthenticated routes
grep -rc "BACKEND_API_KEY" backend/routes/*.js
# Synthetic tensor
sed -n '20,60p' backend/middleware/validation.js
# Bundle
npm run build && ls -la frontend/dist/assets/*.js
```
