# The front-door split: `/` becomes editorial, the console moves to `/live`

**Date:** 2026-09-18
**Branch:** `arena/01a0afa0-hazardnet`
**Scope:** information architecture, copy, prerender/SEO surface, navigation, E2E contracts.
**Not in scope:** the design-token restyle (shipped earlier on this branch, PR #29) and any change to
what the console *computes*.

---

## 1. The decision

The benchmark audit supplied on 2026-09-17 (fifteen professional hazard/climate references, from
UN OCHA and the Red Cross to WMO, UNEP, GFDRR, UNDRR, RIMES, ReliefWeb, NASA Science and NASA
Earthdata) measured the live surface against one standard: **every element dated, sourced and
attributable**. Against that bar the root had a structural problem, not a styling one — it opened on
a map, so the first answers a visitor got were about *where*, and the answers to "who built this,
from what, dated when, and how would I know if it broke?" were either three clicks away or absent.

Two options were put to the owner. **Option B — a fully editorial front door with the GIS console at
`/live` — was chosen explicitly.** This report records what that took and what it cost.

## 2. What changed

| Surface | Before | After |
| --- | --- | --- |
| `/` | `Dashboard defaultTab="gis" isFullScreen` | `FrontDoor` (`frontend/src/pages/FrontDoor.tsx`) |
| `/live` | — | the console, unchanged: `Dashboard defaultTab="gis" isFullScreen` |
| `/home`, `/home/overview`, `/forecast/overview` | the console | still the console (published deep links, kept) |
| `isHomePage` (transparent masthead, full-bleed `<main>`, suppressed footer) | matched `/`, `/home*`, `/forecast/overview` | matches `/live`, `/home*`, `/forecast/overview` — **not `/`** |
| Navbar "Home" dropdown | one item → `/home/overview` | two items: Overview → `/`, Live map & GIS console → `/live` |
| Navbar transparency fallback, mobile drawer item, footer "GIS Live Map" | `/home/overview`, `/` | `/live` |
| `/?district=<id>` | the map | forwarded to `/live?district=<id>` (every other query parameter preserved) |
| `site-routes.json` | 17 routes | 18: `/` rewritten as the editorial entry, `/live` added (`appShell: true`, sitemap 0.9, `changefreq: daily`) |
| Static stylesheet (`prerender.mjs` `STATIC_STYLES`) | pre-restyle palette (`#f9a825` callout, `#b45309` links, system fonts) | NASA token values (`#ea6f24` callout border on `#fce3ca`, `#0b3d91` links, Inter/Public Sans stack, `#17171b` dark mode) |
| Attribution block | React-only | `renderAttribution()` writes it into the static HTML of `/` from `src/content/attribution.json` |
| `ALLOWED_LINK_HOSTS` | 16 hosts | + `modmr.gov.bd`, `orcid.org`, `bau.edu.bd`, `csm.bau.edu.bd` (the authority-boundary and attribution links) |
| ChatBot floating action button + send control | HDS red | HDS blue (`bg-nasa-blue`, `hover:bg-nasa-blue-shade`, white text): both *do something here*. Red stays for "go somewhere". |
| Desktop toolbar "Locate me" | red with an amber border and amber focus ring | blue with the HDS dashed focus ring, matching the compact bar's locate control |

Files touched: `frontend/src/pages/FrontDoor.tsx` (new, 577 lines), `App.tsx`, `components/{Navbar,MenuDrawer,Footer,ArticlePage,ChatBot}.tsx`, `content/site-routes.json`, `scripts/prerender.mjs`, `e2e/{critical-paths,smoke}.spec.ts`, `__tests__/publicSurface.test.js` (new), `docs/PUBLIC_SURFACE.md` (new), `README.md`, `frontend/public/data/content-index.json` + `frontend/src/content/generated-routes.json` (build stamps).

## 3. The front door, in one screen

1. **Hero** — the page's `<h1>`, the mandate standfirst, and three routes out: *Open the live map*
   (red: it goes somewhere), *How a forecast is produced* and *Read the validation scorecard* (blue
   outline: they stay on the site). A note under the buttons states the authority boundary and names
   999.
2. **What this deployment covers** — four figures, each with the artifact it was read from
   (8 hazard classes from `hazard-methodology.json`; 64 districts from `bangladeshDistricts.ts`;
   the 7/15-day horizons; the hindcast episode count from `model-performance.json`), plus the
   coverage the last snapshot actually reports.
3. **The last run, and the last published alerts** — two artifact panels. The freshness panel prints
   per-source states and ages with the artifact's `built_at`; the alerts panel prints the run's
   assessed / held / published counts and says in the same breath that "no published alert" is a
   statement about the publisher, not about the weather.
4. **Copy from `site-routes.json`** — what the platform is for, how a forecast is produced, how to
   check any number, the dated knowledge-products ledger, the official record (BMD / FFWC / DDM /
   999), and how to take part.
5. **Direct answers** (three FAQs) and the **attribution block** (author, ORCID, supervisors,
   institution, citation text — all from `attribution.json`).

## 4. Evidence

Verified on this branch after the change (2026-09-18):

| Gate | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | 0 errors |
| `npx eslint` on the seven touched components | 0 errors, 12 pre-existing warnings |
| `npm test` | **82 suites / 953 tests passed** (was 81 / 942; +1 suite, +11 tests) |
| `npx playwright test` (desktop + Pixel 7) | **54 passed** (was 46; +8 front-door/console contracts) |
| `node scripts/build_content_engine.mjs --check` | 75 routes match their inputs |
| `node scripts/import_nasa_tokens.mjs --check` | 174 tokens match |
| `node scripts/build_model_performance.mjs --check` | 5 episodes match their reports |
| `node scripts/build_freshness_artifact.mjs --check` | artifact matches its inputs (overall `unknown`) |
| `npm run check:bundle` | PASS — 1182.2 kB gzip (was 1169.7) |
| Horizontal overflow | 0 px on `/`, `/live`, `/advisories`, `/model-performance` at 320/375/768/1280 |
| Prerender | `/index.html` → h1 "A forecast you can check, not just read"; `/live/index.html` → h1 "The live hazard map"; both in `sitemap.xml`; the attribution block is present in the static `/` body |
| Deep links | `/?district=kurigram` → `/live?district=kurigram` (asserted in E2E) |
| Console behaviour | district search → forecast card → district brief, PDF export, mobile drawer, offline shell: unchanged, all covered by the same E2E journeys as before |

Screenshots: `/home/user/frontdoor-desktop.png` (full page), `/home/user/frontdoor-mobile.png`
(390 × 844), `/home/user/live-console-desktop.png`.

## 5. Decisions that a reader should be able to challenge

* **No photograph.** There is no licence-clean satellite or field image in this repository, and an
  AI-generated illustration placed beside provenance claims would undercut the page's purpose. The
  hero is typographic, and the page links to the console that draws the *real* data. This is the one
  prescription of the audit (`real imagery`) that is deliberately not satisfied yet; satisfying it
  needs an image with a traceable licence, not a generator.
* **No uptime, no usage counters.** The artifacts do not measure them. The page states what it can
  prove and links to `/status`.
* **The alert-level badge palette stays as it is.** `AlertLevelBadge` maps four alert levels onto its
  own colours; the design system records that NASA's three-colour status set cannot express five
  hazard severities, and the alert ladder is a fourth scale with its own tests. It is a documented
  exception, not an oversight.
* **Developer-facing source strings are shown on purpose.** Each figure names the file it came from
  (`source: src/content/hazard-methodology.json`). On an early-warning page aimed at agronomists and
  reviewers, "which file?" is the question that turns a claim into something checkable.

## 6. Still open

1. **Red-as-control audit, partial.** A DOM census (`getComputedStyle(...).backgroundColor ===
   rgb(246,65,55)` over eight routes) found **46 elements** carrying HDS red: 16 anchors (correct —
   red means "go somewhere"), 12 buttons and 18 decorative spans/divs. The two navbar locate controls
   and the ChatBot controls were fixed in this change; the remaining button-level cases
   (`View Detailed Disaster Analytics` on `/live`, the `64 Districts` filter on `/alerts`,
   `Download CSV` on a district page) need a case-by-case read of whether the control navigates or
   acts. Method and census are reproducible with the script described in this section.
2. **Bengali parity for the front door.** The alert surface is bilingual; the front door is
   English-only, like `/status`. That is a documented status quo, not a decision that has been made
   well — a Bengali reader landing on `/` gets no language toggle.
3. **Imagery** (§5, first bullet).
4. **The `/status` signals** named in the earlier live-surface audit (uptime probe, certificate
   expiry) remain owner actions; nothing on this page claims them.
