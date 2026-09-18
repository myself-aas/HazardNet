# The public surface: what lives at `/`, what lives at `/live`

**Status:** in force since 2026-09-18 (PR #29).
**Enforced by:** `__tests__/publicSurface.test.js`, `e2e/critical-paths.spec.ts` ("Editorial front door"),
`e2e/smoke.spec.ts`, `scripts/prerender.mjs`.

---

## 1. The two addresses

| | `/` — editorial front door | `/live` — the GIS console |
| --- | --- | --- |
| Job | Say what this platform is, who is behind it, what the last run produced, and where each number can be checked | Show the current outlook on a map, per district, per horizon |
| Renders | `frontend/src/pages/FrontDoor.tsx` | `frontend/src/pages/Dashboard.tsx` (`defaultTab="gis"`, `isFullScreen`) |
| Copy | The `/` entry in `src/content/site-routes.json`, rendered by the page and by the prerenderer | The `/live` entry in the same file |
| Layout | Ordinary document: white masthead, padded `<main>`, footer | Full-bleed: transparent masthead over the map, no footer |
| Live data | Artifact panels (`/data/freshness.json`, `/data/alerts-latest.json`, `/data/model-performance.json`) | Forecast snapshot, map tiles, district cards |
| Indexing | `index,follow`, sitemap priority 1.0, `changefreq: daily` | `index,follow`, sitemap priority 0.9, `changefreq: daily` |

`/home`, `/home/overview` and `/forecast/overview` still render the console. They were published
for the whole life of the project and are kept as deep links; `/live` is the canonical address and
the one the sitemap, the navigation and the front door link to.

## 2. Why they are separate

The 2026-09-18 benchmark audit (fifteen professional hazard and climate references: UN, Red Cross,
WMO, UNEP, GFDRR, UNDRR, UNDP, RIMES, UNESCO, ReliefWeb, World Bank, NASA Science, Esri, NASA
Earthdata) judged the live surface against one standard: **every element dated, sourced and
attributable**. A map-first root fails that standard in a specific way — it answers "where?" before
it has answered "who is telling me this, from what, dated when, and how would I know if it stopped
working?" — and its answer to the last question was nothing at all, because the instruments of
provenance (the status page, the validation scorecard, the model card, the data-source ledger)
were three clicks away and undated on arrival.

Splitting the two surfaces lets each do one job properly. The console keeps every behaviour it had
(the split is a routing change, not a rewrite); the front door is where the claims are made and
immediately evidenced.

## 3. What the front door may and may not say

The copy is the `site-routes.json` `/` entry — one text, rendered three ways (static HTML, hydrated
React, and the `<head>` metadata `usePageSeo` applies on client-side navigation). Rules:

1. **Numbers come from artifacts, never from prose.** The trust strip and the run panels read
   committed files and print the file's own values with the run that produced them: the freshness
   artifact names the coverage the snapshot reports (60 of 64 districts at time of writing) and the
   alerts panel names the assessed / held / published counts from the run report. A figure with no
   artifact behind it does not appear.
2. **A missing value is never rendered as a zero.** An unreadable artifact produces the sentence
   that says it could not be read (and the panel says the status page will show the same failure); an
   unknown age is an em dash; "no alert published" is stated as a statement about the publisher —
   the page says explicitly that it is not a statement about the weather.
3. **Every product is dated.** The knowledge-products ledger carries the review date each product's
   own route carries, and `__tests__/publicSurface.test.js` fails the build when the two disagree.
4. **The authority boundary is on the page.** BMD, FFWC, DDM and the 999 hotline are named in the
   copy with links to their portals; the boundary is also in the hero's own note and in each FAQ.
   The test asserts those names, those hosts and that number are present.
5. **No invented imagery, uptime or listings.** There is no photograph on the front door: no
   licence-clean satellite or field image ships in this repository, and an AI-generated illustration
   presented next to provenance claims would undercut the one thing the page is for. Where an image
   would sit, the page states the fact and links to the console that draws the real data. There is no
   uptime percentage or "users served" figure for the same reason — the artifacts do not measure
   them.
6. **The attribution block is not decorative.** Author, role, ORCID, supervisors and institution
   come from `src/content/attribution.json` — the same file the JSON-LD graph and `CITATION.cff` are
   built from — and the prerenderer writes the block into the static HTML for `/`, so it survives
   without JavaScript. The hero's editorial half is rendered from `site-routes.json` for the same
   reason.

## 4. Deep links

*District links were published as `/?district=<id>`* (search results, SMS, Telegram, bookmarks).
The front door detects that query string and redirects to `/live?district=<id>`, preserving every
other parameter. `e2e/critical-paths.spec.ts` pins the redirect.

## 5. How the static page is produced

`scripts/prerender.mjs` writes `/index.html` and `/live/index.html` from the same
`site-routes.json` the app reads: `<head>` metadata, JSON-LD `@graph`, canonical, the copy, the
FAQ `<details>` and — for `/` only — the attribution block. Both pages are in `sitemap.xml`.
The static stylesheet was moved onto the NASA token values with the rest of the restyle, so the
no-JavaScript view is the same design, not a fallback that predates it.

External links in section copy are only rendered when their host is in `ALLOWED_LINK_HOSTS`
(`scripts/prerender.mjs`). That check is silent by design, so
`__tests__/publicSurface.test.js` walks every external link in every route and fails when a host is
missing from the list — otherwise a citation would appear in the app and vanish from the HTML that
crawlers read.

## 6. Related documents

* [`docs/frontend/front-door-and-console-split.md`](frontend/front-door-and-console-split.md) — the
  change report: what moved, what was measured, what is still open.
* [`docs/design-system/MASTER.md`](design-system/MASTER.md) — the design system the front door is
  built from, including the HDS colour rules ("red = go somewhere", "blue = do something here").
* [`docs/audits/2026-09-17-live-surface-audit.md`](audits/2026-09-17-live-surface-audit.md) — the
  earlier live-surface audit whose findings shaped this surface.
* [`docs/ops/SEO_AND_CONTENT.md`](ops/SEO_AND_CONTENT.md) — how the copy, sitemap and structured
  data are kept in one place.
