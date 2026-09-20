# E2E Green + Codebase Audit — 2026-09-13

**Branch:** `arena/01a09b4c-hazardnet` · **Base:** `30964c9`
**Trigger:** the `test-e2e` CI job failed 24 of 44 tests across `chromium-desktop` / `chromium-mobile`.
**Outcome:** **44/44 pass**, and the E2E quarantine (`continue-on-error: true`) is lifted.

---

## 0. Headline

The E2E failures were **not** a test-quality problem. The single largest cause was a
**production white-screen**: every built page threw `ReferenceError: L is not defined`
during chunk evaluation and fell into the root `ErrorBoundary`. That one defect explains
the mass "element was detached from the DOM" and "element not found" failures, because
the app replaced its own DOM tree a moment after mounting.

Fixing it took the suite from **24 failed / 20 passed → 21 failed → 0 failed**. The
remaining failures were a mix of two genuine product defects (registration unreachable
from the navigation; 285 px of horizontal scroll on phones) and genuinely broken test
code (non-existent routes, strict-mode violations, non-waiting `isVisible()` gates).

---

## 1. Findings and fixes

### F1 — 🔴 `leaflet.heat` / `leaflet.markercluster` crash every production build

**Symptom.** `GET /` rendered `<h1>Something went wrong</h1>` — the `ErrorBoundary`
fallback — instead of the GIS stage. Console:

```
ReferenceError: L is not defined
    at /assets/vendor-leaflet-DsQTEtxw.js:1:150385
[ErrorBoundary] Uncaught render error: ReferenceError: L is not defined
```

**Root cause.** Both plugins are pre-ESM builds that mutate the *global* `L` at module
scope:

```js
L.HeatLayer = (L.Layer ? L.Layer : L.Class).extend({ … })      // leaflet.heat
var t = L.MarkerClusterGroup = L.FeatureGroup.extend({ … })    // leaflet.markercluster
```

Rolldown (Vite 8) wraps the `leaflet` package in a **lazily initialised** CommonJS
factory (`var n = t(((e,t) => { … window.L = e … }))`) but emits the plugin bodies as
plain top-level chunk code. Verified against the built chunk: the factory's init call
never runs before offset `150373`, where `L.HeatLayer = …` executes. So `window.L` is
`undefined` at that point.

This is **build-only**. `vite dev` (esbuild pre-bundling) initialises `leaflet` eagerly —
measured `window.L: object`, `L.HeatLayer: function` on the dev server — which is why the
bug was invisible during development and only ever showed up in CI and in deployment.

**Fix.** `frontend/vite.config.ts` → `leafletGlobalShim()`, a build-only `enforce: 'pre'`
plugin that prepends to each plugin module:

```js
import __hazardnetLeaflet from 'leaflet';
void (function (scope) { if (!scope.L) { scope.L = __hazardnetLeaflet; } })(globalThis);
```

Pinning the import inside the plugin module works because Rolldown always emits the
CommonJS init call at the top of an importer's body. Post-fix chunk inspection shows
`r = e(n())` (leaflet init) immediately before `e.L ||= r.default`, at offset 148766 —
ahead of `L.HeatLayer` at 150427.

**Why not a source-level fix.** Two attempts were made and rejected:
- a `lib/leafletGlobal.ts` side-effect module — **Rolldown tree-shook the assignment
  away entirely** (verified: `vendor-leaflet` hash unchanged after adding it);
- aliasing `leaflet` to `dist/leaflet-src.esm.js` — that build has **no default export**
  (named exports only), which would break all five `import L from 'leaflet'` sites.

**Blast radius of the bug.** `/`, `/home`, `/home/overview`, `/forecast/*` — every route
whose chunk graph reaches `LiveMapView` → `useLeafletMap`. In CI this presented as:
navbar elements "detached from the DOM", `district-selector` never appearing, `dhaka`
never rendering.

---

### F2 — 🔴 `/signup` was unreachable from the primary navigation

`grep` for `to="/signup"` outside the auth pages returns only `ForgotPasswordPage`,
`LoginPage`, `PublicProfilePage` and `SetPasswordPage`. The navbar's only auth control
was a `motion.button` with `onClick={() => navigate('/login')}`.

Consequences: registration required typing the URL (or finding a footer link on the login
page); the control was invisible to crawlers, to screen-reader landmark lists, and to any
role-based locator. That is the direct cause of the two 30 s timeouts on
`getByRole('link', { name: /sign up|…/ })` — there was no such link.

**Fix.** `Navbar.tsx`: signed-out visitors now get real `<Link to="/login">Sign in</Link>`
and `<Link to="/signup">Sign up</Link>` (`data-testid="navbar-signin-link"` /
`navbar-signup-link`). Signed-in visitors keep the dashboard button.

`MenuDrawer.tsx`: the compact bar below `xl` has no room for auth links, so the drawer
footer now carries `Sign up free` / `Sign in` links (`drawer-signup-link` /
`drawer-signin-link`).

---

### F3 — 🔴 285–340 px of horizontal scroll on phones (`/advisories`)

The smoke test reported overflow only at 768 px and passed at 320/375 px. **Both were
wrong.** It measured `document.documentElement.scrollWidth` immediately after
`page.goto()`, before the lazy `AdvisoriesPage` chunk had rendered — i.e. it measured an
empty shell.

Measured on the fully rendered page (baseline, before any fix in this branch):

| width | overflow |
|---|---|
| 320 | **340 px** |
| 375 | **285 px** |
| 768 | 251 px |

**Cause.** The phase-filter strip
(`flex … shrink-0 self-start overflow-x-auto`, ~648 px of tabs) was a `shrink-0` flex
item, so it grew its ancestors past the viewport instead of scrolling internally.

**Fix.** `AdvisoriesPage.tsx`: `shrink-0` → `shrink min-w-0 … max-w-full`. One line took
320 px and 375 px to **0**.

---

### F4 — 🟠 Desktop navbar shown from `md` (768 px), needs ~1180 px

Measured requirement of the full desktop bar (brand + 5 menus + search + alerts + auth):

| viewport | navbar right edge | overflow |
|---|---|---|
| 768 | 1019 | 251 px |
| 1024 | 1172 | 148 px |
| 1180 | — | 0 |

**Fix.** `Navbar.tsx`: `flex md:hidden` / `hidden md:flex` → `flex xl:hidden` /
`hidden xl:flex`, plus `min-w-0` on both halves. The compact bar (hamburger, brand,
locate, search) now covers 0–1279 px. Reclaiming the last 11 px at exactly 1280 px after
adding the auth links: right-cluster gap `gap-2 lg:gap-3` → `gap-1.5 xl:gap-2 2xl:gap-3`.

**Trade-off, stated plainly:** 1024–1279 px viewports now get the compact bar instead of
the full nav. The alternative was redesigning the navbar; the measured 1180 px floor
leaves no breakpoint between `md` and `xl` that fits.

---

### F5 — 🟠 The navigation drawer could not be closed from its own control

Once open, the panel (`fixed inset-y-0 left-0 z-[10000] w-80`) covers the header
hamburger in the app shell (`z-[9990]`). The hamburger's `aria-label` flips to
"Close navigation menu", but the click never lands — Playwright logged
`<svg …> from <div class="fixed inset-y-0 left-0 z-[10000] …"> subtree intercepts pointer
events`, retried for 30 s, and timed out. Real users had only the translucent backdrop.

**Fix.** `MenuDrawer.tsx`: an in-panel close button
(`data-testid="menu-drawer-close"`, `aria-label="Close navigation menu"`), `role="dialog"`
+ `aria-modal="true"` + `aria-label="Navigation menu"` on the panel, and Escape-to-close.

---

### F6 — 🟠 20 px overflow on `/forecast/district/:id` at 375 px

The `DAE/BRRI Official Protocol` attribution chip (178 px, `shrink-0`) in the
emergency-advisory bullet row pushed the document to 395 px.

**Fix.** `DistrictDetailPage.tsx`: row gets `flex-wrap`; chip gets
`basis-full sm:basis-auto` so it takes its own line on phones.

---

### F7 — 🟡 Auth pages had no `h1` on mobile and two on desktop

`AuthLayout` rendered the page title as `<h2>`; the only `<h1>` was `BrandPanel`'s
rotating marketing headline, which is `hidden lg:flex`. So `/login` and `/signup` had
**no `h1` below `lg`** and **two above it** — and an `h1` inside an `aria-live="polite"`
carousel re-announces itself as a heading change on every 5.2 s rotation.

**Fix.** `AuthLayout` title → `<h1>`; `BrandPanel` headline → `<p>`. Exactly one `h1` at
every width. Existing `AuthPages.test.tsx` / `BrandPanel.test.tsx` assertions use
`getByRole('heading', …)` / `getByText(…)`, so both still pass.

---

### F8 — 🟡 Test-code defects in `e2e/`

| # | Defect | Consequence |
|---|---|---|
| 1 | `isVisible()` used as a gate | Does **not** auto-wait. On a lazy route it returns `false` before the chunk renders, so the whole `if` body silently never ran ("PDF export triggers download" created a `waitForEvent` promise that nothing could resolve → `Error: page.waitForEvent: Test ended` in 924 ms). |
| 2 | `/forecast/district/1` | District ids are slugs (`dhaka`, `kurigram`). `getDistrictById('1')` misses and `DistrictDetailPage` falls back to `ALL_64_DISTRICTS[0]` = **Kurigram**, so `expect(getByText(/dhaka/i))` could never pass. |
| 3 | `/advisories/drought` | Not a sector id. `AdvisoriesPage` redirects unknown sub-categories to `/advisories/crops`, so the test never touched what it named. |
| 4 | `getByText(/agricultural/i)` | Strict-mode violation: matches both the "Barind Agricultural Drought" footer link and "Department of Agrometeorology, Bangladesh Agricultural…". Same for `/advisory\|advisories\|guidance/i` (5 matches). |
| 5 | `getByRole('dialog').or(locator('nav')).first()` | `.or()` unions in **DOM order**, so `.first()` resolved to the `hidden md:flex` desktop `<nav>` and asserted on a hidden element. |
| 6 | `waitForLoadState('networkidle')` | The app holds a Firebase RTDB websocket open (`wss://…firebaseio.com/.ws`), so the network never goes idle. Used in 3 tests despite a comment elsewhere in the same file warning about exactly this. |
| 7 | Overflow measured before hydration | See F3 — produced false passes. |
| 8 | `getByTestId(…)` on a control that is mounted twice | Two `CommandPalette` instances are rendered (compact bar + desktop bar), so a testid selector matched 2 while `getByRole` — which excludes `display:none` nodes — matched 1. Caught while writing the new district-search test; recorded here because any future testid-only locator on a navbar control will hit it. |

**Fix.** New `e2e/helpers.ts` (shared `BASE`, `clickAuthLink`, `waitForAppShell`,
`expectNoHorizontalOverflow`) and a rewrite of both specs around: real routes, roles +
`data-testid`s, `expect(...).toBeVisible()` before every interaction, and content waits
instead of `networkidle`.

Two tests were also **replaced rather than patched**, because they asserted on things
that do not exist:

- `horizon selector changes forecast data` — the 7/15-day toggle lives in `LiveMapView`'s
  "Exterior Filter Bar", gated on `!isFullScreen && !isHeaderCollapsed`. Every route
  mounts the map with `isFullScreen={true}`, so it renders nowhere (verified: no
  `Next N Days` button on `/` or `/forecast/my-districts`). Replaced with
  `district forecast card opens the full district brief`, which exercises the real
  `onOpenAnalytics → navigate('/forecast/district/:id')` path.
- `user can generate advisory for hazard` — looked for `/generate|view|get advisory/i`;
  the actual control is "Synthesize Gemini Advisory" and it is a *disclosure*
  (`setShowAiSynthesizer`), not a model call. Now asserts the panel opens, the label
  flips to "Hide AI Synthesizer", and no `pageerror` occurs.

`PDF export triggers download` is now a real end-to-end assertion: click → config dialog →
"Export & Download PDF" → `waitForEvent('download')` → `suggestedFilename()` matches
`/\.pdf$/i`. It genuinely renders a PDF (13.6 s desktop / mobile) and passes.

---

### F9 — 🟡 Test hooks added to app code

`data-testid`s added where accessible names are ambiguous or shared:
`signup-submit-btn` (the Google button's `aria-label="Sign up with Google"` also matched
`/sign up|create account/i`), `menu-drawer`, `menu-drawer-close`, `drawer-sign{in,up}-link`,
`navbar-sign{in,up}-link`, `navbar-auth-links`, `navbar-dashboard-btn`,
`district-search-trigger`, `district-search-modal`, `district-search-input`.

---

## 2. Verification ledger (all executed 2026-09-13 on this branch)

Browser access: `cdn.playwright.dev` and `storage.googleapis.com` are unreachable from
this sandbox, so the official Chromium build cannot be downloaded. A Chromium 153
headless shell was extracted from the npm-hosted `@sparticuz/chromium@153.0.0` tarball
(`registry.npmjs.org` *is* reachable) together with its bundled NSS libraries
(`libnss3`/`libnspr4`/`libnssutil3`), and driven through Playwright's `executablePath`.
**405 jest tests, 17 pipeline tests and every gate below ran unmodified.**

| Gate | Command | Result |
|---|---|---|
| **E2E (full suite, run 1)** | `npx playwright test` (44 tests × 2 projects) | **44 passed (52.4 s)** ✅ |
| **E2E (full suite, run 2 — flake check)** | same | **44 passed (59.3 s)** ✅ |
| **E2E baseline (before fixes)** | same, base tree | 24 failed / 20 passed ❌ (matches the CI report) |
| E2E after F1 only | same | 21 failed / 23 passed (isolates F1's contribution) |
| Typecheck | `npm run lint` (`tsc --noEmit`) | clean ✅ |
| ESLint | `npm run lint:eslint` | **0 errors**, 272 warnings (baseline was 273 — one fewer, none new in touched files) ✅ |
| Full jest | `npx jest --ci --coverageThreshold='{}'` | **41 suites / 405 tests pass** ✅ |
| Pipeline scripts + workflow YAML | `pytest scripts/tests -q` | **17/17** ✅ (validates the `ci.yml` edit) |
| Production build | `npm run build` | vite 2.5 s + copy-dist ✅ |
| Bundle budget | `npm run check:bundle` | 1,103.0 kB gzip, PASS ✅ |
| RAG freshness | `npm run check:rag-freshness` | PASS ✅ |
| Secrets scan | `bash scripts/check-secrets.sh` | 723 files, 14 patterns, PASS ✅ |
| Dependency gate | `node scripts/npm-audit-ci.mjs` | PASS, no unlisted high/critical ✅ |
| Backend boot smoke | `node backend/server.js` + curl | `/health` 200, CSP-Report-Only present, `nosniff`, no `x-powered-by`, `/api/v1/forecasts/bulk?horizon=7_days` 200 ✅ |
| Horizontal overflow sweep | `/`, `/login`, `/signup`, `/advisories`, `/forecast/district/dhaka` @ 320/375/768/1024/1280/1440 | **0 px everywhere** ✅ |
| Runtime plugin check | `window.L`, `L.HeatLayer`, `L.markerClusterGroup` on the built app | `object` / `function` / `function` ✅ |

The overflow sweep used a purpose-built detector (outermost element whose border box
crosses the viewport, with clipped subtrees excluded) — it is how F3's false pass and
F4/F6's real offenders were identified.

---

## 3. Review notes — things looked at and deliberately **not** changed

- **`frontend/src/lib/config.ts` hardcoded Firebase config.** Flagged by a naive secret
  scan (`AIzaSy…`). It is documented as ARC-01/SEC-07 and Firebase web configs are
  public-by-design identifiers, not credentials. The file even carries a "do not add more
  literals" warning. Left alone.
- **`.github/secrets.env` is tracked.** It is a template with `REPLACE_WITH_GITHUB_…`
  placeholders and an explicit "anything previously here must be rotated" note. The prior
  reaudit already carries the rotation as an owner action. No live values in the working
  tree (secrets scan clean).
- **272 ESLint warnings.** Almost all `no-explicit-any` / unused imports. The policy is
  0-error, and this branch did not add any. Worth a dedicated cleanup pass, not this one.
- **`networkidle` in `waitForLoadState`.** Removed from the specs, but the underlying
  condition — a permanent RTDB websocket — is by design.

---

## 4. Repo-hygiene observations (no action taken — needs an owner decision)

One-off scripts committed at the repository root: `patch.cjs`, `fix-dash.cjs`,
`update_print_css.cjs`, `test_pdf_export.cjs`, `test_perm.txt`, `.npmrc.bak`,
`audit_temp/web-quality-skills`. None are referenced by `package.json`, CI, or the docs.
Recommend deleting or moving to `scripts/` with a header comment.

`.gitignore` covers `/dist`, `frontend/dist/`, `backend/dist/` but **not**
`test-results/` or `playwright-report/` — both are written by a local `npx playwright
test` run and would be easy to commit by accident.

---

## 5. Residual risks and owner actions

1. **🟠 The `xl` breakpoint trade-off (F4).** 1024–1279 px users get the compact bar. If
   that is unacceptable, the navbar needs a genuine redesign (portal-rendered dropdowns +
   a scrollable nav strip), not a breakpoint tweak.
2. **🟠 `test-e2e` is blocking again.** `continue-on-error: true` is removed, so a red
   E2E run now fails the pipeline. `retries: 2` in CI absorbs runner variance. If the
   suite proves flaky in the GitHub environment specifically, re-quarantine deliberately
   rather than by timeout — the 30 s/`retries: 0` containment is what hid this defect.
3. **🟡 `leafletGlobalShim` is a bundler-interop workaround.** It matches
   `node_modules/(leaflet.heat|leaflet.markercluster)/*.js`. If either dependency is
   upgraded to a real ESM build, the shim becomes dead weight — and if a *new*
   global-`L` plugin is added, it must be added to the regex. The E2E suite is the
   regression net: `no JavaScript errors on critical pages` and
   `.leaflet-container` visibility both fail loudly if this breaks again.
4. **🟡 Carried forward from the prior reaudit:** rotate the leaked credentials
   (Postgres DB password, Codecov token, Vercel token/org/project); confirm `main` branch
   protection requires `verify` + `test-e2e` + `security-audit`; `audit-exceptions.json`
   expires **2026-12-12**.

---

## 6. Change inventory

**Build config:** `frontend/vite.config.ts` (leafletGlobalShim).
**App:** `Navbar.tsx` (breakpoint + auth links), `MenuDrawer.tsx` (dialog semantics, close
control, Escape, auth links), `CommandPalette.tsx` (testids + dialog semantics),
`AuthLayout.tsx` / `BrandPanel.tsx` (heading hierarchy), `AdvisoriesPage.tsx` and
`DistrictDetailPage.tsx` (overflow), `SignUpPage.tsx` (testid).
**Tests:** new `e2e/helpers.ts`; rewritten `e2e/critical-paths.spec.ts`, `e2e/smoke.spec.ts`.
**CI:** `.github/workflows/ci.yml` (quarantine lifted), `playwright.config.ts`
(normal bounds restored).
**Docs:** this file.
