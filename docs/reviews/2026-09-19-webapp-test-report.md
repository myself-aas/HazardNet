# HazardNet — whole-application test report

**Date:** 2026-09-19 (Asia/Dhaka) · **Subject:** `arena/01a0b62e-hazardnet` @ `5b4687d` + working-tree changes
**Method:** `webapp-testing` skill (Playwright, live server, explicit waits, screenshots on failure, console capture)
**Companion document:** `docs/reviews/2026-09-19-web-design-review.md` (design review, phase 1). This report is the *second* pass: it tests behaviour, not appearance, and it re-tests every appearance claim with an independent method where the two disagree.

---

## 1. What was tested, and how

Nothing in this report is inferred from reading code. Every claim names the command that produced it
and the artefact it lives in.

| # | Layer | Coverage | Artefact |
|---|-------|----------|----------|
| 1 | **Route health** — HTTP status, error boundary, non-empty body, visible `<h1>`, `pageerror`, `console.error`, failing app responses | 45 visitor-reachable routes @1280 | `e2e/full-app-qa.spec.ts`, `/tmp/hn-e2e-4.json` |
| 2 | **Console health** — application vs environment console errors, app vs API responses | 45 routes @1280 | `/tmp/hn-console-health.json` |
| 3 | **Accessibility** — axe-core 4.9.1 full ruleset, per rule, per node, with screenshots | 45 routes × 4 viewports = 180 loads; per-node detail on a 10-route sample | `/tmp/hn-review-{mobile,tablet,desktop,wide}.json`, `/tmp/hn-a11y-detail.json`, `/tmp/hn-a11y-shots/` |
| 4 | **Layout / responsive** — document scroll, elements past the viewport edge, touch-target size, text clipping, heading order, image `alt` | 45 routes × 4 viewports = 180 loads, plus a 375 px overflow triage on the 18 routes with edge overflow | `/tmp/hn-layout-audit.json`, `/tmp/hn-overflow-375.json` |
| 5 | **Interaction** — mobile drawer, keyboard traversal, focus indicators, 375 px overflow, soft-404 | suite | `/tmp/hn-e2e-4.json` |
| 6 | **Discoverability** — titles, canonicals, meta description, sitemap, robots, internal link integrity | suite + registry inspection | `/tmp/hn-e2e-4.json`, `frontend/public/data/content-index.json` |

### 1.1 Environment

| | |
|---|---|
| Browser | Chromium **153.0.8010.0** (`@sparticuz/chromium` via `playwright-core` 1.63.0, `QA_CHROMIUM_PATH=/tmp/chromium`) |
| App | Vite 8.3.0 dev server, `0.0.0.0:3000`; Express backend `0.0.0.0:3001`; `NODE_ENV=development`, `CSP_ENFORCE=false` |
| Runner | `QA_CHROMIUM_PATH=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023/lib npx playwright test -c playwright.qa.config.ts` (workers 1, retries 0) |
| Network | Sandbox has **no general egress**: `firebase*`, `googletagmanager`, basemap tile CDNs, and the upstream weather/alert feeds are unreachable. `registry.npmjs.org` and `pypi.org` **are** reachable (§5.3 proves this matters). |

### 1.2 What is deliberately excluded, and why

These are excluded from every count in this report. A test report whose numbers include the
sandbox's own network blocks is worse than no report — the same reasoning that made
`scripts/qa/layout-audit.mjs` necessary (it re-measures what `design-review.mjs` over-counted).

| Excluded | Reason |
|---|---|
| `/dashboard/blog*` | Super-admin surface behind an auth wall; no credentials in this environment. |
| `/auth/callback` | One-time OAuth code exchange; not reachable without a provider round-trip. |
| `/u/:username` | No profile is resolvable in the seedless dev database. |
| Leaflet map internals, the 1×1 skip link, inline prose links | Legitimately outside their container / not controls (WCAG 2.5.5 exception). Encoded in `layout-audit.mjs`. |
| Blocked third-party hosts, basemap tiles, upstream weather/alert feeds | Environment, not application. Recorded separately in §6. |

---

## 2. Results at a glance

| Area | Result | Verdict |
|---|---|---|
| Route health, 45 routes | **45/45 render their own content**; 4 routes have **no `<h1>` at all** | App defects: 1 class, 4 routes |
| Console health, 45 routes @1280 | **4 application console errors total — all four are the same `/download` defect**; 0 elsewhere | 1 app defect + environmental noise |
| Accessibility (axe, 180 loads) | 12 rule types; `color-contrast` 2,388 nodes, `button-name` 340 critical nodes, `nested-interactive` 970 nodes | App defects, systemic |
| Focus indicators | **6 navbar controls have no visible focus indicator** (source-mapped) | App defect, WCAG 2.4.7 |
| Layout / responsive | **0 of 180 pages scroll sideways**; 0 touch-target or clipping problems that survive the exclusions except `/alerts` | 1 app defect |
| Headings | 4 routes with **zero `<h1>`** (first heading `h4`), 1 route with two `<h1>` | App defect |
| Discoverability | 7 registered routes do not apply their metadata in the SPA (shell defaults, including `noindex`); prerendered production HTML is correct | App defect, bounded (§5.4) |
| Content trust | `/download` queries `registry.npmjs.org/hazardnet` and `pypi.org/pypi/hazardnet/json` → **both 404** (resolved 2026-09-19 — ADR 0011: lookups removed, page states what is distributed) | App defect — **fixed** |
| Resilience | Every upstream failure renders a complete page | Passing, with caveats (§6) |

### 2.1 Suite run history (kept because the corrections are part of the evidence)

| Run | Result | What changed between runs |
|---|---|---|
| 1 | 53 passed / 15 failed | First execution ever. 2 failures were harness defects, 2 were environment false-positives |
| 2 | 55 passed / 13 failed | Harness: role-based `<h1>` assertion, page-scoped archive hero, URL-based environment filtering (§4.1–4.3) |
| 3 | 56 passed / 12 failed | Harness: basemap host filter (`arcgisonline.com`), `evaluate`-based head reads, count-based `<h1>` check |
| 4 | 57 passed / 11 failed | Harness: archive ordering assertion rewritten to test the real requirement (§4.5) — every remaining failure an application defect |
| **5 (current)** | **61 passed / 7 failed** | After the OP-1 remediation (design report §10): the `<h1>` ×4, `/analytics` duplicate, 7-route metadata, duplicate titles and focus-indicator failures are gone. The 7 that remain are 2 root causes, both owner decisions: `422 /api/predict` (6 tests) and the npm/PyPI 404s on `/download` (1 test) |

---

## 3. Method: how the gaps in the existing gate were found

The repository already had a Playwright suite (`e2e/critical-paths.spec.ts`, 4 routes). It did not
catch the defect that this pass found first, and the reason is structural:

> `critical-paths.spec.ts › no JavaScript errors on critical pages` listens to `page.on('pageerror')`
> only. That event fires for **uncaught exceptions**. React reports invalid DOM/SVG attributes through
> **`console.error`**. So a defect that fires on every page of the site — which is exactly what the
> `MenuCloseIcon` defect did, 2 errors per render — passes that gate untouched.

`e2e/full-app-qa.spec.ts` was written to close that class of gap, and it adds:

1. console/`pageerror`/failed-response capture, with environment filtering **by URL** rather than by
   message text (§4.2 explains why that distinction is load-bearing);
2. route health for all 45 routes rather than 4;
3. the historical-archive surface, SEO metadata, and internal-link integrity, none of which any
   existing test touched;
4. interaction checks (mobile drawer, 12-stop keyboard traversal with focus-indicator assertions),
   375 px overflow, and soft-404 handling.

---

## 4. Corrections to the test harness itself

Two of the 15 failures in the first full run were **defects in the tests, not the application**. Both
are recorded here rather than quietly fixed, because a suite that mis-measures is the thing this
report is supposed to detect.

### 4.1 `locator('h1').first()` measured a print-only heading

`/advisories` failed with *"has no `<h1>`"*. It has two: a **print-only** bulletin heading
(`<div class="print-only">`, `display: none` on screen, `getBoundingClientRect().width === 0`) that
comes first in document order, and the real visible `<h1>Sectoral Hazard Directives & Emergency
Protocols` (770 px wide).

`page.locator('h1').first()` resolves in **document order**, so the assertion waited 15 s on an
element no sighted user ever sees. Fixed by asserting by role —
`page.getByRole('heading', { level: 1 })` — which ignores non-rendered nodes. This is also the more
correct assertion: it tests what assistive technology and users can reach.

### 4.2 `Failed to load resource` carries no URL

The first run failed `/forecast/district/dhaka` for two `500` responses caused by the **blocked
upstream weather feed**, not by application code. The console message is literally
`Failed to load resource: the server responded with a status of 500 ()` — no URL, no host. Any
text-based filter is therefore forced to choose between missing real 500s and excusing fake ones.

Fixed by collecting failing responses from `page.on('response')`, which does carry the URL, filtering
`/api/v1/(weather|alerts)` and the tile/firebase hosts there, and dropping the URL-less console
duplicates. The suite can now distinguish "the app returned 500" from "the app's upstream was
unreachable" — and it keeps the 422 from `/api/predict` (a real defect) while dropping the 500.

### 4.3 The archive unit-of-measurement assertion read the wrong `<header>`

The test asserted that `/archive` states its unit of measurement before its first figure, by reading
`page.locator('header').first().innerText()`. The first `<header>` in the DOM is the **site navbar**,
which renders before the page content. The copy it was looking for is present and correct
(`HazardArchivePage.tsx:175`, `:178-179`). Fixed by scoping to the header that contains the page's
`<h1>`, and the assertion now also checks the *ordering* it claims to check.

### 4.5 An over-strict ordering assertion on the archive hero

The archive test also demanded that the unit phrase appear **before any digit** in the hero. The page
actually reads:

> Historical hazard archive — **2,931 recorded event-district observations** from 2000 to 2025 …

which is correct: the number is labelled by the noun that follows it. The assertion was rewritten to
test the real requirement — the first comma-grouped count must be accompanied by what it counts — and
passes (verified by running that single test in isolation after correction, 1 passed).

*(Recorded rather than quietly fixed: three of the harness defects in this pass were assertions that
encoded a plausible-but-wrong rule, which is the failure mode that makes a suite untrustworthy.)*

### 4.4 Coverage consequences

A fourth harness gap is not a bug but a blind spot worth naming: the design sweep's
"focus ring" metric checked the **first** focusable element on each page (a skip link or a link that
does have a ring). It reported 0/180 problems. The keyboard **traversal** test in this suite, which
walks 12 stops, found 6 controls with no indicator at all. §5.2 is the result.

---

## 5. Defects found (application)

Severity follows the phase-1 report's matrix: **P1** = functionality or access broken, **P2** =
degrades UX or trust, **P3** = cosmetic.

### 5.1 [P1] Four routes had no `<h1>` at all — the page outline started at `h4`  ·  **FIXED**

| Route | `<h1>` in DOM | First heading | Viewports |
|---|---|---|---|
| `/live` | 0 | `H4` "Dhaka District DHAKA" | all 4 |
| `/home` | 0 | `H4` "Dhaka District DHAKA" | all 4 |
| `/home/overview` | 0 | `H4` "Dhaka District DHAKA" | all 4 |
| `/forecast/overview` | 0 | `H4` "Dhaka District DHAKA" | all 4 |

Not "hidden" — absent. Verified twice by independent methods:
`document.querySelectorAll('h1').length === 0` after a 5 s settle at 1280 px, and the 4-viewport
heading census (`h1Count: 0`, `headingOrder: [3, 4]`).

**Why it is P1, not P2:** a page with no `h1` has no accessible name for its main region in the
reading order, screen-reader users land in an `h4` with no context, and search engines index the
`h4` text as the page's primary heading. The five affected routes are the four most-used dashboard
views.

**Evidence:** `/tmp/hn-layout-audit.json` (all four viewports), `/tmp/hn-e2e-2.json` (route health),
`/tmp/h1check.cjs` transcript.

### 5.2 [P1] Six navigation controls had no visible focus indicator  ·  **FIXED**

Keyboard traversal from `/` reports `outline: none` **and** `box-shadow: none` on:

| Control | Source |
|---|---|
| Home, Forecasts, Advisories, Knowledge, Analytics (all `hn-nav-link`) | `frontend/src/components/Navbar.tsx:234, 297, 387, 505, 589` |
| "Locate Me" | `frontend/src/components/Navbar.tsx:678` |

`frontend/src/index.css:813` defines a global `:focus-visible` outline. These six elements then apply
`focus-visible:outline-none` **without** supplying a replacement ring, so they are the only controls
on the page that erase the app's own indicator. Sibling controls that do it correctly exist two
hundred lines away (`.tsx:184`, `:218` use `focus-visible:ring-2 focus-visible:ring-nasa-blue/60`),
so the fix is a pattern already in the file, not an invention.

Computed-style transcript (fresh page, 12 `Tab` presses): the skip link and Search button show
`dashed 1px`/`dashed 3px` outlines; the six above show `none 3px`.
**Evidence:** `/tmp/seo_nav.cjs` transcript; screenshot `/tmp/hn-focus-nav.png`.

### 5.3 [P1] `/download` offers software that is not published (external 404s)  ·  ~~**copy fixed, 404s open**~~  **RESOLVED 2026-09-19 (ADR 0011)**

> **Resolution.** The owner decided HazardNet is *not* published to npm or PyPI and that the page must
> stop querying the registries. Both lookups are removed from
> `frontend/src/lib/downloadChannels.ts` / `frontend/src/hooks/useReleaseChannels.ts` — removed, not
> feature-flagged off — so `/download` now issues **zero** external requests by default and the four
> console errors recorded below cannot recur. Each channel states what *is* distributed (GitHub
> Release assets on the product repository, or "release pipeline prepared" until one exists) instead of
> rendering a `pip install` / `npm install` command with a version no registry can supply. Live GitHub
> Releases lookups are opt-in (`VITE_DOWNLOAD_LIVE_RELEASES=true`); the root `package.json` carries
> `"private": true` so `npm publish` from this repository fails outright. See
> `docs/adr/0011-distribution-without-package-registries.md`. The findings below are the evidence that
> led to that decision and are kept as recorded.

`/download` requests `https://registry.npmjs.org/hazardnet` and
`https://pypi.org/pypi/hazardnet/json`; both return **404**. This is the *only* application console
error on the entire site (4 occurrences, one route) and it is **not** an environment artefact, because
the same sandbox gets `200` from `https://registry.npmjs.org/react` and
`https://pypi.org/pypi/requests/json` (checked with `curl -o /dev/null -w '%{http_code}'`).

Either the packages are unpublished or the page points at the wrong coordinates. Against the
standing "100 % trust" requirement, a download page that silently 404s its own package metadata is a
P1: the user cannot tell whether the software exists.

**Evidence:** `/tmp/dl404.cjs` transcript, `/tmp/hn-console-health.json` (`/download appErrors=4`).

### 5.4 [P2] Seven registered routes did not apply their metadata inside the SPA  ·  **FIXED**

`/docs`, `/about`, `/contact`, `/privacy`, `/terms`, `/use-cases`, `/download` render with the shell's
defaults: `<title>HazardNet</title>`, **no** `link[rel=canonical]`, and
`<meta name="robots" content="noindex,follow">`.

**Scope, stated precisely** — this is where a careless report would overclaim:

| Surface | Behaviour | Verdict |
|---|---|---|
| Registry (`site-routes.json`) | all 7 carry correct `index,follow` titles and descriptions; 19/19 routes are sitemap-flagged | **Correct** |
| Prerendered HTML (production, direct load) | `prerender.mjs` writes per-route HTML from the registry — 98 files at the last build; `index.html:20` is a deliberate `noindex` safety default that the prerender overwrites (`index.html:18`) | **Correct** |
| Hydrated SPA, direct load | serves the shell defaults for these 7 routes | **Defect** |
| Hydrated SPA, client-side navigation | navigating `/faq` → `/docs` replaces the FAQ title and canonical with the shell default | **Defect** |

The 18 registered routes that *do* call `usePageSeo` (e.g. `/faq`, `/methodology`, `/status`,
`/blogs`) are correct in both paths, so the registry is not the problem: seven page components never
consume it. The user-visible consequences are a stale browser tab, a wrong title in link previews and
analytics for in-app navigation, and — for any crawler that executes JavaScript rather than reading
the served HTML — a `noindex` directive that the registry never intended.

The suite caught it downstream as
`titles are unique across pages: [["HazardNet", ["/docs","/about"]]]`, because on the dev server both
routes present the shell title. Direct-load comparison across 11 routes: 7 shell-default, 4 correct.

**Evidence:** `/tmp/spa_seo.cjs` transcript (11 direct loads + the `/faq` → `/docs` click path);
`frontend/src/hooks/usePageSeo.ts`; `frontend/src/content/site-routes.json`; `frontend/scripts/prerender.mjs`.

### 5.5 [P2] Contrast and control-labelling defects (systemic, from axe)

Full detail and the 21-selector list are in the phase-1 report §3.1; the counts here are the
180-load census:

| Rule | Impact | Routes | Nodes | Where it comes from |
|---|---|---|---|---|
| `color-contrast` | serious | 45 | **2,388** | `.hover\:bg-amber-100 > span` (20 routes), `a[href$="download"] > span` (5), `text-slate-400` at 10.5–11 px (≈2.6:1) |
| `button-name` | **critical** | 5 | **340** | `div[title="Report Field Hazard Incident"] > .cursor-pointer` — 17 nodes/route |
| `nested-interactive` | serious | 5 | **970** | same component family |
| `heading-order` | moderate | 26 | 107 | `.space-y-3:nth-child(1) > h4` skips a level |
| `svg-img-alt` | serious | 3 | 88 | 8 of them on `/archive` — the new charts have no accessible name |
| `select-name` | **critical** | 2 | 16 | `/forecast/district/dhaka` has an unnamed `<select>` |
| `label` | **critical** | 1 | 4 | unlabelled inputs |
| `landmark-*` (`unique`, `main-is-top-level`, `no-duplicate-main`, `one-main`) | moderate | 7–9 | 1–36 | duplicated `<main>` landmarks |
| `scrollable-region-focusable` | serious | 10 | 22 | `overflow-x-auto` regions not reachable by keyboard |

One component (`frontend/src/components/ui/floating-action-button.tsx:102,110` — icon-only, no
`aria-label`, 15×15, nested inside a clickable `div[title]`) accounts for the critical `button-name`
row, the `nested-interactive` row, and part of the touch-target row. Fixing that one file removes
**1,310** failing nodes.

**Evidence:** `/tmp/hn-a11y-detail.json` (per-node targets, 10-route sample),
`/tmp/hn-a11y-shots/a11y_*.png` (10 screenshots), `/tmp/hn-summary.json`.

### 5.6 [P2] `/alerts` — 131 px of filter controls were unreachable at 375 px  ·  **FIXED**

Measured at 375 px: the filter row is **465 px wide in a 375 px viewport**; its parent
(`div.relative.z-10.flex`) is 293 px wide with `scrollWidth: 463`; the card above it
(`div.w-full.bg-white.rounded-2xl`) is **`overflow-x: hidden`**, so the overflow is clipped with no
scrollbar and no keyboard path. `body { overflow-x: clip }` is why the document-level "does it scroll
sideways" metric stays at a healthy 0 and hides this.

The chip group at `left: 41 → right: 504` holds "All / Flash Flood / Monsoon Flood / Tropical Cyclone
/ Drought". Only the first two chip groups are reachable; the trailing 131 px is not.

Source: `frontend/src/components/BangladeshSvgMap.tsx:100` — the row is `flex flex-wrap`, but its
parent is `flex-col` with `items-start` in the mobile branch, so the row sizes to **content**
(463 px) instead of the card (327 px), and `flex-wrap` never gets a chance to wrap.

**Fix verified at the DOM level** (no source edit made): adding `w-full sm:w-auto` to the row and
`min-w-0` to the inner `overflow-x-auto` scroller takes the row from 463 px → 293 px, clears
`cardClipped`, and brings every chip inside the viewport.

```
BEFORE {"rowW":463,"rowRight":504,"cardClipped":true, "chips":[ok, false]}
FIX    {"rowW":293,"rowRight":334,"cardClipped":false,"chips":[ok, ok]}
```

**Evidence:** `/tmp/hn-overflow-375.json`, `/tmp/fixtest.cjs` transcript.

### 5.7 [P2] Undersized touch targets on mobile, from a small set of components  ·  **measured, open**

Count across 45 mobile loads: **703** (per-page caps removed in the OP-1 pass; the previous figure of
512 was a capped sample). The distribution is systematic, not random — the same handful of components
repeats on every page. The FAB entry that this report previously listed first has since been fixed
(44×44, labelled) and is no longer the dominant contributor; what remains is the footer/utility set:

| Count | Control | Size | Note |
|---|---|---|---|
| 38 | FAB icon buttons | **15×15** | also unlabelled (5.5) |
| 37 | wordmark link | 154×40 | 40 px < 44 px |
| 28 | "Download Software & Apps" | 190×36 | |
| 27 | "Continue with GitHub" | 25×40 | |
| 26 | "Privacy" / "Terms" footer links | **41×16 / 35×16** | 16 px tall |
| 24 | "Feedback" | 91×33 | |
| 18 | FAQ `<summary>` | 301×20 | 20 px tall |

44 px is the WCAG 2.5.5 (AAA) target and the phase-1 report's bar; 24 px is the AA (2.5.8)
minimum, which the `16 px`-tall footer links also fail.

**Evidence:** `/tmp/hn-layout-audit.json` (mobile pass), `/tmp/hn-summary.json`.

### 5.8 [P2] `/api/predict` still returns 422 for every caller (carried from phase 1)

Confirmed by this pass independently: `apiErrors=1` on 6 routes, 20 × `422` in the 4-viewport sweep.
`backend/routes/predict.js` requires a tensor payload; `Dashboard.tsx:317` posts
`{districtId, risk}` and `UploadPage.tsx:108` posts `{rasterName, districtId}`. Both swallow the
error and fall back to a hardcoded 8-class prior, so the UI shows a plausible forecast that no model
produced.

**Evidence:** `/tmp/hn-console-health.json`, `backend/routes/predict.js`; phase-1 report §3.5 (no `<h1>`) and §4.7 (bare 4xx/5xx reaching the browser).

---

## 6. Environment-caused failures (not application defects)

Recorded because they are indistinguishable from application failures in a plain console scrape, and
because the *way* the app survives them is itself a finding.

| Symptom | Root cause | Count |
|---|---|---|
| `500 /api/v1/weather` | `TypeError: fetch failed` at `backend/utils/openMeteo.js:199` ← `:404` ← `weather.js:26` (no egress) | 17 |
| `504 /api/v1/alerts` | upstream alert ingest unreachable | — |
| `504 (Tile Unavailable Offline)` | basemap CDN blocked; service worker serves its offline tile | 3,611 |
| `ERR_FAILED` / `ERR_CONNECTION_CLOSED` / `Failed to fetch` | Firebase, Firestore, Google Tag Manager blocked | 639 / 526 / 181 |

**Resilience finding:** all 45 routes render complete content with every upstream unreachable —
`0/45` error boundaries across both full runs. That is a genuine strength and should be preserved
deliberately (the offline-tile path in particular). The caveat is that failures are visible only in
the console: `/forecast/district/dhaka` shows no user-facing indication that its weather panel is
degraded.

---

## 7. Coverage gaps

| Gap | Why it matters |
|---|---|
| No authenticated session (`/dashboard/blog*`, Supabase/Firestore writes) | The largest untested surface. Requires a test account or seeded local auth. |
| No visual regression baseline | Screenshots exist (`/tmp/hn-design-shots/`) but nothing compares them run-to-run. |
| Interactions are sampled, not exhaustive | Drawer open/close, keyboard traversal, and overflow are covered; filter/tab/upload flows are not asserted beyond rendering. |
| No load/perf budget measured locally | `check:bundle` **is** wired into CI (`ci.yml:504`, after `npm run build`), but this pass never ran a production build (`frontend/dist` does not exist in the sandbox), so no bundle number is quoted here. |
| No cross-browser run | Single Chromium build (153) only. Firefox/WebKit unaffected by anything in this report. |
| Native mobile browsers | Out of scope for Playwright (skill limitation). |

---

## 8. Recommendations

**Fix before anything else, in this order** (each is a single-file change, all verified above):

1. `frontend/src/components/Navbar.tsx:234,297,387,505,589,678` — replace `focus-visible:outline-none`
   with `focus-visible:ring-2 focus-visible:ring-nasa-blue/60` (the pattern already used at `:184`).
2. Add `<h1>`s to `/live`, `/home`, `/home/overview`, `/forecast/overview` (the pages currently start
   at `h4`); merge `/analytics`'s two `<h1>`s into one.
3. `frontend/src/pages/…DownloadPage` — either fix the npm/PyPI coordinates or stop querying the
   registries and say plainly what is published.
4. Make the seven routes in §5.4 consume the registry via `usePageSeo` — the same fix as `/archive` (phase-1 report §6.2) — so that client-side navigation can never leave a `noindex` shell in place.
5. `frontend/src/components/BangladeshSvgMap.tsx:100` — `w-full sm:w-auto` + `min-w-0`
   (DOM-verified in §5.6).
6. `frontend/src/components/ui/floating-action-button.tsx:102,110` — add `aria-label`, raise to
   44×44, flatten the nested clickable `div` (clears 1,310 axe nodes).

**Then, as gates (the reason this pass exists):**

- **Run the CI `verify` job's commands locally.** This pass fixed **3 real type errors**
  (`frontend/src/lib/forecasts.ts` duplicate key; `Breadcrumbs items` vs `customItems` ×2) that
  survived a whole review pass. `ci.yml:388` already gates `tsc`, eslint, `check:embargo`,
  `archive:check`, `archive:rag:check` and `check:bundle` — the branch had simply never been pushed,
  so nothing ran. The fix is discipline plus branch protection, not a new workflow. (Corrected from an
  earlier draft that wrongly claimed no type gate existed.)
- Add the gates that genuinely do not exist: axe (§5.5), `console.error`/failed-response assertions in
  the E2E job (the existing 4-route spec is blind to them), the 0-sideways-scroll invariant, and a
  production-mode smoke test — §5.4 shows dev-mode measurement can misstate production behaviour in
  both directions.
- Run `e2e/full-app-qa.spec.ts` on push. It found 15 failures where the existing 4-route suite found
  0, and it is the only gate that reads `console.error`.
- Add an axe gate at a fixed threshold, failing on **new** critical/serious node counts rather than
  on any violation, so the existing backlog does not block merges while regressions do.
- Keep `scripts/qa/layout-audit.mjs` in the loop for the 0-sideways-scroll invariant: it is cheap
  (4 viewports) and it is the only measurement that survived contact with Leaflet.

---

## 9. Reproduce

```bash
# from /home/user/HazardNet — app must be running on :3000 (Vite) and :3001 (API)

# 1. functional suite (route health, console, archive, SEO, links, interaction, 404)
QA_CHROMIUM_PATH=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023/lib \
  npx playwright test -c playwright.qa.config.ts

# 2. 45-route console health at 1280
LD_LIBRARY_PATH=/tmp/al2023/lib node /tmp/console-sweep.cjs     # → /tmp/hn-console-health.json

# 3. layout + responsive census, 4 viewports
LD_LIBRARY_PATH=/tmp/al2023/lib node scripts/qa/layout-audit.mjs --out=/tmp/hn-layout-audit.json

# 4. per-node axe evidence + screenshots
LD_LIBRARY_PATH=/tmp/al2023/lib node scripts/qa/a11y-detail.mjs --out=/tmp/hn-a11y-detail.json

# 5. overflow triage: is content past the edge reachable?
LD_LIBRARY_PATH=/tmp/al2023/lib node scripts/qa/overflow-triage.mjs --width=375 --out=/tmp/hn-overflow-375.json
```

**Artefacts referenced by this report**

| Path | Contents |
|---|---|
| `/tmp/hn-e2e-4.json`, `/tmp/hn-e2e-run4.log` | Playwright JSON + log for the final suite run (**57 passed / 11 failed**) |
| `/tmp/hn-console-health.json` | 45-route console sweep (app vs API errors, per route) |
| `/tmp/hn-layout-audit.json` | 180 layout measurements (documented exclusions) |
| `/tmp/hn-a11y-detail.json`, `/tmp/hn-a11y-shots/` | Per-node axe violations + 10 screenshots |
| `/tmp/hn-overflow-375.json` | Reachability triage for every element past the 375 px edge |
| `/tmp/hn-focus-nav.png` | Navbar with keyboard focus on a control that shows no indicator |
| `/tmp/hn-review-{mobile,tablet,desktop,wide}.json`, `/tmp/hn-summary.json` | The 4-viewport design sweep aggregate |

*Method note: interaction tests assert on rendered, reachable state only — every count in this report
excludes the classes listed in §1.2, and every number was produced by a command named above.*
