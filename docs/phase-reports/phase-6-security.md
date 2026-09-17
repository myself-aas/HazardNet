# Phase 6 — the security pass

**Date:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the eight rows
of the CONCERNS §3 security table (the register that named "the Phase 6 security pass"),
the live surface those rows claim to protect, and whatever the audit turned up on the way.

**Headline:** eleven things were wrong; nine are fixed in this change, one is fixed in the
repository but cannot take effect until the site is redeployed (owner Action 7), and one —
**live provider credentials sitting in a tracked file while the CI gate that exists to
catch them reported success** — is documented, cleaned, and blocked from recurring, but
**rotation is an owner action and nothing in this repo can substitute for it** (Action 1).

---

## 1. How the audit was run

| Step | What | Where the evidence lives |
| ---- | ---- | ------------------------ |
| 1 | Read the register: `docs/codebase/CONCERNS.md` §3 (8 rows), and the Phase-5 section that pointed at this pass | `CONCERNS.md` |
| 2 | Read the code each row names: helmet config, CORS allowlist, model-artifact guard, `api/**` handlers, service worker, chat route, CSV writers, Firestore rules, `.github/dependabot.yml`, `security.txt` | this report §3 |
| 3 | Ran the gates that exist: `scripts/check-secrets.sh`, `scripts/npm-audit-ci.mjs` | §2.2, §2.3 |
| 4 | Probed the **live** surface rather than trusting the repository (headers on `www.hazardnet.live`, `/.well-known/security.txt`, sitemap, robots) | §2.1 |
| 5 | Compared the deployed configuration with the committed one (`vercel.json` vs `frontend/vercel.json` vs helmet) | §2.1 |
| 6 | Fixed what the audit found, one finding per change, each with a test that fails without it | §3 |
| 7 | Re-ran everything (jest, pytest, tsc, eslint, build) and recorded the numbers | §4 |

The rule the pass was held to: **a control counts as present when something fails if it is
removed.** Six of the eleven findings were things a repo-reading audit would have marked
"done" (headers declared, limits configured, bounds computed, a validator defined) that no
longer held once the code was actually followed to the deployed path.

---

## 2. Findings

### 2.1 The live surface does not match the repository (critical)

Probe of `https://www.hazardnet.live/` on 2026-09-17/18:

| Header | Live (`main` and this branch both declare these) | `vercel.json` |
| ------ | ---- | ------------- |
| `Content-Security-Policy` | **absent** | enforcing policy, ad allowlist |
| `X-Content-Type-Options` | **absent** | `nosniff` |
| `X-Frame-Options` | **absent** | `DENY` |
| `Referrer-Policy` | **absent** | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | **absent** | locked down |
| `Cross-Origin-Opener-Policy` | **absent** | `same-origin-allow-popups` |
| `Strict-Transport-Security` | `max-age=63072000` | `…; includeSubDomains; preload` |
| `Access-Control-Allow-Origin` | **`*`** on the HTML document | not set by us (Vercel default; harmless for public HTML, wrong as a habit) |

`/.well-known/security.txt` also returns the platform's 404 although the file is in the
repository **and** in `dist/`. Further probes narrowed it down: `/api/metrics` and
`/api/forecasts` both return `X-Vercel-Error: NOT_FOUND` even though both handlers exist on
`main`, while static files under `frontend/public/` (`/serviceWorker.js`,
`/data/forecasts-latest.json`) serve normally. That is the signature of the Vercel project's
**Root Directory** being `frontend/` — the repository root's `vercel.json` and the
root-level `api/**` are outside the deployed tree (the 2026-09-14/15 finding), and this
branch is additionally 14 commits ahead of the `main` that production tracks. Action 7 now
carries that evidence and the two ways to resolve it.

Because both `vercel.json` files now carry a byte-identical policy (asserted by
`__tests__/securityHeadersParity.test.js`), the headers arrive whichever root the project
ends up using — the API functions are the part that needs the root decision.

**Fixed in-repo:** the CSP now has exactly one definition
(`backend/security/csp.js`); both `vercel.json` files carry that string and helmet parses
it (`cspDirectivesFromString()`), so the three deployments cannot drift; the root rewrite
was tightened so dotted paths are never rewritten into the SPA shell; `/.well-known/*` got
its own cache rule. **Delivery is Action 7.** This is the one finding where the repository
is right and the site is wrong.

### 2.2 A security gate that could not see its highest-risk file (critical)

`scripts/check-secrets.sh` (the SEC-07 gate, wired into `ci.yml`) applied its allowlist to
the whole `file:line:match` string. The allowlist legitimately contains the placeholder
token `EXAMPLE` — and `.env.example` contains it in the **path**, so every match inside
that file was discarded before it could be reported:

```
$ bash scripts/check-secrets.sh        # before the fix
✅ Secret scan passed (927 tracked files, 14 patterns).
```

What the file actually contained: `BACKEND_API_KEY` (64 hex), `GEMINI_API_KEY` and
`_BACKUP` (`AQ.…`), `OPENROUTER_API_KEY` (`sk-or-v1-…`), `GROQ_API_KEY` (`gsk_…`),
`HUGGINGFACE_API_KEY` (`hf_…`), `VAPID_PRIVATE_KEY`. Two of those providers had no pattern
at all, and neither `BACKEND_API_KEY` nor `VAPID_PRIVATE_KEY` has a provider prefix, so no
prefix-shaped rule could ever have found them.

**Fixed:** the allowlist is applied to the matched **value** only (the path is never part
of the exemption test); patterns went 14 → 17 (Gemini `AQ.`, OpenRouter `sk-or-v1-`, plus a
generic `*_KEY|*_TOKEN|*_SECRET|*_PASSWORD|*_PRIVATE_KEY|*_WEBHOOK=` assignment rule);
public-by-design exemptions are explicit and narrow (`VITE_` + `AIza`/`vcp_`, and variables
*named* `*_PUBLIC_KEY`/`*_ANON_KEY`); `.env.example` is placeholder-only with a header
saying why; `scripts/tests/test_secret_scan.py` (22 tests) runs the scanner in throwaway
repos and proves a secret in `.env.example` **fails**. Full write-up:
`docs/audits/2026-09-18-secret-scan-false-negative.md`.

**Not fixed by any of that:** the values are in git history. Rotation is Action 1 (which
already listed them) and remains the only real remedy.

### 2.3 The deployed surface had no rate limiting (high)

Every Express limiter lives in `backend/middleware/rateLimit.js`, which runs in the
self-hosted server. Production is Vercel functions (`api/**`), where those middlewares
never execute — so `api/ingest.js`, `api/v1/alerts/*`, the forecast reads, `metrics` and
the weather proxies were all unmetered, and their responses carried none of the hardening
headers (they relied on a `vercel.json` that was not in force — see §2.1).

**Fixed:** `backend/middleware/serverlessGuard.js` — five cost buckets (read 120, alerts
60, ai 20, pipeline 12, metrics 60 per minute), `X-Forwarded-For` (first hop, as set by the
edge) as the key, a ×10 budget for a pipeline request that presents the correct
`BACKEND_API_KEY` — the limiter's job on an already-authorised caller is to bound a runaway
loop, not to ration a chunked backfill (an unset key never earns it: same fail-closed rule
as `apiKeyAuth.js`), 429 + `RateLimit-Limit/Remaining/Reset` + `Retry-After`, a tracked-key
cap so the limiter cannot become its own DoS, and `X-Content-Type-Options`/`Referrer-Policy`
plus `Cache-Control: no-store` unless the endpoint sets its own. Applied to all 13 handlers;
`__tests__/api/serverlessGuard.test.js` drives the real `/api/v1/alerts/policy` handler to
429 and **fails if any `api/**` file is added without the guard**. It is per-instance by
construction — stated in `SECURITY.md` and handed to Action 8 rather than dressed up as a
global quota.

### 2.4 CSV exports could execute on the operator's machine (high)

`historyRowsToCsv()` (server) and `csvCell()` (browser) quoted for RFC 4180 but did not
neutralise a leading `=`, `+`, `-`, `@`, tab or CR — and Excel/LibreOffice/Sheets evaluate
those. District names, reviewer notes and driver labels are all free text, and the alert
export exists precisely so a union parishad office can open the list in a spreadsheet.

**Fixed:** `backend/utils/csvSafety.js` (shared) and the client's `csvCell` prefix such
values with `'`, leave plain numbers — negative included — untouched, and keep quoting;
pinned by `__tests__/csvSafety.test.js` and the client CSV suite (DDE payload case
included).

### 2.5 The service worker cached credentialed responses (medium)

`cache.put` sits below the HTTP cache, so `Cache-Control: no-store` does not stop it. The
alerts API answers a duty officer's `Authorization: Bearer <key>` request with unpublished
rows and reviewer contact details; the generic shell strategy cached **every** 200 GET,
including `/api/**`.

**Fixed — and while fixing it, a bigger one surfaced (§2.10):** the guard lives in
`frontend/public/serviceWorker.js`, the file the app registers and the build copies, and
both network-response cache sites use it (the map-tile cache deliberately does not — it is
public imagery with its own eviction). Pinned by `__tests__/serviceWorker.test.js`, which
evaluates the shipped file and drives its real `fetch` handler.

### 2.6 The chat prompt bounds were decorative (medium)

`backend/routes/chat.js` computed `sanitizedQuery` (3 000 chars) and `safeHistory`
(1 500 chars/message, last 8) for **retrieval**, then built the model prompt from the raw
request body: `…USER QUERY…${query}…` and the raw `conversationHistory.slice(-4)`. A caller
could send a megabyte and it would reach the model — the exact cost/prompt-injection
surface the caps were written for.

**Fixed:** the prompt is assembled from the sanitized values and capped as a whole
(`MAX_PROMPT_CHARS = 12 000`, with the truncation note's own length reserved so the cap
holds even when it says it truncated); the response reports `prompt: { chars, truncated }`
so a client (and the tests) can see the bound was applied. Five tests in
`__tests__/api/chatPromptBounds.test.js` assert on the prompt handed to the engine,
including a 50 kB query and 20 × 5 kB history turns.

### 2.7 Firestore rules compared the wrong field name (medium, and it was also a bug)

The client writes snake_case (`AuthContext.saveAssessment` posts `user_id`;
`updateUserProfile` snake-cases every field), while the rules read camelCase (`userId`).
Consequences: the owner was **denied their own** assessment/alert/connector rows, and
`isValidUserProfile` — defined with great care — never ran on any profile write (ownership
alone gated it), so a profile could carry arbitrarily long free text.

**Fixed:** `ownerOf()`/`isCallerOwned()` accept both spellings, required fields are asserted
present under either spelling, free-text fields are length-bounded, identity fields must
equal the caller, a per-document key budget caps growth, and the profile validator is
actually applied. Thirteen shape checks in `__tests__/firestoreRules.test.js` (including
"every field the client writes to a profile is mentioned in the rules", anchored to the
frontend source so the list cannot rot, and a compile-sanity check that every called helper
is defined). `scripts/tests/test_blog_authz_parity.py` was updated to the helper-based
ownership check rather than the literal string. **Not deploy-verified** — no Java/emulator/
project credentials here → Action 8.

### 2.8 Disclosure surface (medium)

No `SECURITY.md`; `security.txt` existed but nothing checked that its `Expires` had not
passed, that its `Policy` route exists, or that it agrees with the repo about where to
report.

**Fixed:** `SECURITY.md` (scope, safe harbour, acknowledgement/fix targets, the controls
described honestly including the per-instance rate limit) and `__tests__/securityTxt.test.js`
(RFC 9116 fields, expiry inside a year, contact parity with `SECURITY.md`, policy route
present in `site-routes.json`, SPA rewrite cannot swallow dotted paths, redirects do not
shadow the path, dist copy present after a build).

### 2.9 Two hygiene findings that the pass walked into

- **`jest-axe` dependency surface** (carried over from Phase 5): dev-only, not shipped,
  typings added — audited and closed in `CONCERNS.md`.
- **`npm run lint:eslint` failed on a clean checkout**: `eslint.config.js` gave Node globals
  to `scripts/**` but not to `frontend/scripts/**/*.mjs`, so `prerender.mjs` and
  `export-blog-index.mjs` reported 19 `no-undef` errors (`process`, `console`, `URL`,
  `fetch`) plus one genuine unused binding. Fixed (config block for `.mjs` Node globals; the
  dead `cover` removed) — the "0-error policy" step in CI now means what it says.

### 2.10 Phase 5's offline alert strategy never shipped (high)

`frontend/src/serviceWorker.ts` — the file Phase 5 edited, and the file this phase's first
cache-guard patch went into — is **imported by nothing**. The browser registers
`/serviceWorker.js` (`frontend/src/main.tsx`), which Vite copies verbatim from
`frontend/public/`, and that file had no alert handling at all: no network-first strategy,
no labelled `X-HazardNet-Stale` fallback, and an app-shell branch that cached **every** 200
GET. So the documented offline-alert behaviour did not exist in any browser, and the
credential-caching exposure in §2.5 was live in the shipped worker.

**Fixed:** the alert cache (network-first, 5 s timeout, labelled fallback) and
`isCacheableResponse()` now live in `frontend/public/serviceWorker.js`; the unshipped
duplicate is deleted; `__tests__/serviceWorker.test.js` loads **that** file, drives its
`fetch` handler with stubbed `caches`/`fetch`, and asserts the built `dist/serviceWorker.js`
is byte-identical to the source — the check that would have caught this in Phase 5.

---

## 3. Change list

| Area | File | What |
| ---- | ---- | ---- |
| CSP source of truth | `backend/security/csp.js` (new) | canonical policy string, ad allowlist, `cspDirectivesFromString()` for helmet |
| Headers | `vercel.json`, `frontend/vercel.json`, `backend/server.js` | both configs carry the canonical string; helmet parses it; stricter SPA rewrite; `/.well-known` cache rule |
| Serverless | `backend/middleware/serverlessGuard.js` (new), all 13 `api/**` handlers | per-instance rate limits, `RateLimit-*`/`Retry-After`, hardening headers on JSON responses |
| CSV | `backend/utils/csvSafety.js` (new), `backend/utils/forecastServe.js`, `frontend/src/lib/alertsCsv.ts` | formula-injection neutralisation + RFC 4180 quoting, shared by both runtimes |
| Offline | `frontend/public/serviceWorker.js` (shipped), `frontend/src/serviceWorker.ts` deleted | alert network-first cache + `isCacheableResponse()` in the file the browser actually registers |
| Chat | `backend/routes/chat.js` | sanitized prompt + whole-prompt cap + honest response metadata |
| Rules | `firestore.rules` | dual-spelling ownership, validators applied, dead code removed |
| Docs | `SECURITY.md` (new), `docs/audits/2026-09-18-secret-scan-false-negative.md` (new), `docs/codebase/CONCERNS.md`, `docs/ops/owner-actions.md` (Actions 7 + 8, Action 1c note) | disclosure policy, audit record, register updated, owner work handed over |
| Gates | `scripts/check-secrets.sh`, `eslint.config.js`, `frontend/scripts/prerender.mjs` | scan fixed (value-only allowlist, 17 patterns), `.mjs` Node globals, dead binding removed |
| Tests (new) | `__tests__/serviceWorker.test.js` (shipped worker driven by its real fetch handler), `__tests__/api/serverlessGuard.test.js`, `__tests__/api/chatPromptBounds.test.js`, `__tests__/firestoreRules.test.js`, `__tests__/securityTxt.test.js`, `__tests__/securityHeadersParity.test.js`, `__tests__/csvSafety.test.js`, `frontend/src/lib/__tests__/serviceWorkerCache.test.ts`, `scripts/tests/test_secret_scan.py` | one suite per finding, each failing without its fix |

`__tests__/securityHeadersParity.test.js` deserves a note of its own: it asserts the same
policy string across `vercel.json`, `frontend/vercel.json` and the module helmet uses, so
"the CSP was added to a config that is not the one serving production" (the Phase-0 version
of §2.1) cannot happen again silently.

---

## 4. Verification

| Check | Command | Result |
| ----- | ------- | ------ |
| Jest | `./node_modules/.bin/jest` | **72 suites / 812 tests pass** (was 65/738) |
| Pytest | `/tmp/pv2/bin/python -m pytest scripts/tests -q` | **456 passed** (was 434; +22 secret-scan) |
| Types | `npm run lint` (`tsc -p frontend/tsconfig.json --noEmit`) | clean |
| Lint | `npm run lint:eslint` (`eslint .`) | **0 errors** (286 pre-existing warnings), was 19 errors |
| Build | `cd frontend && npm run build` | green — 21 routes prerendered, `dist/.well-known/security.txt` present |
| Secret scan | `bash scripts/check-secrets.sh` | pass, 927 files / 17 patterns — and it now **fails** on the removed values (proved before rewriting the file: 11 hits) |
| Dependency gate | `node scripts/npm-audit-ci.mjs` | pass — 14 accepted install-time advisories, all expiring 2026-12-12 |

Negative proofs (the point of the pass): the old `.env.example` fails the fixed scanner;
`/api/v1/alerts/policy` returns 429 through the real handler; a 50 kB chat query never
reaches the prompt; a 5 kB history message is cut to 1 500; `=cmd|' /C calc'!A0` comes out
of both CSV writers neutralised; a credentialed alerts fetch is never cached; the rules
deny a camelCase-only validator and the shape test fails if the profile validator is
removed from the write statements.

---

## 5. What is still open (all owner-side, none of it pretended away)

| Owner action | Why it cannot be done here |
| ------------ | -------------------------- |
| **Action 1 — rotate the exposed credentials** | Repository edits cannot revoke a key. The values are in history; rotation is the only remedy. |
| **Action 7 — redeploy, then confirm the headers are live** | Nothing in the repo can make a deployment exist. Verification commands are in the action. |
| **Action 8 — validate + deploy the corrected Firestore rules; optional shared rate-limit store** | Needs the Firestore emulator (Java) and project credentials; a global rate limit needs a shared counter (Upstash/KV). |
| Action 5/6 (unchanged) | Alert thresholds and calibration are Phase 9 work; the pipeline still stamps no model version, so nothing publishes — the audit did not change that, and the empty alert list remains the honest state. |

---

## 6. Where the eight CONCERNS §3 rows stand

| Row | Before | After |
| --- | ------ | ----- |
| CSP enforcement | Report-only in code, absent live | One canonical enforcing policy, parity-tested; live delivery = Action 7 |
| CORS allowlist | Fail-closed in production | Unchanged (verified: production without `FRONTEND_ORIGIN` reflects nothing); the live `ACAO: *` on HTML is Vercel's default for static assets, not this code |
| Dependency gate | "`npm audit` non-blocking" | `npm-audit-ci.mjs` fails closed; exceptions carry expiries |
| SECURITY.md / security.txt / Dependabot | security.txt only, unverified | `SECURITY.md` + validity/parity tests; Dependabot Actions-only by documented choice |
| Firestore rules tests | `[TODO]` | 13 shape checks + parity guard; emulator suite is Action 8 |
| Committed Firebase configs | "public-by-design" | Audited at the file level: the scanner now distinguishes public client values from server credentials, and the one file that was *not* public is clean |
| Chat prompt bounds | Caps computed, not enforced | Enforced end to end, pinned by 5 tests |
| Model-artifact guard | 404 list on the Node server | Verified, plus the serverless suite now carries its own hardening headers |
