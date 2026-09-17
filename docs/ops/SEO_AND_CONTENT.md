# SEO and the content engine (Phase 8)

**What this document is:** how HazardNet's public content is generated, what a search engine is
told about it, which parts are automated, and which parts are owner actions that no repository
change can perform.

**Why it exists:** the 2026-09-17 audit found the site's search surface was worse than absent — a
sitemap listing eight URLs of which seven returned 404, canonical tags on a host the deployment did
not use, and no page that answered the question a district officer actually types ("is there flood
risk in my district this week"). A stale sitemap is caught by the probe; duplicate hosts and thin
content are not, because no test can see what a search engine already indexed. So the rules are
written down here and enforced by tests where they can be.

---

## 1. The canonical host is `www.hazardnet.live` (decided 2026-09-18)

| Signal | Value |
| --- | --- |
| `<link rel="canonical">` on every prerendered page | `https://www.hazardnet.live/…` |
| `sitemap.xml` entries | `https://www.hazardnet.live/…` |
| `robots.txt` `Sitemap:` line | `https://www.hazardnet.live/sitemap.xml` |
| `/.well-known/security.txt` `Canonical` + `Policy` | `https://www.hazardnet.live/…` |
| `og:url`, JSON-LD `@id`s | `https://www.hazardnet.live/…` |
| Apex `https://hazardnet.live` | redirects to www, `permanent: true` (both `vercel.json` copies) |

Why www and not the apex: the apex was *already* redirecting to www (HTTP 308) because of a
domain-level setting in the Vercel project, the shipped `security.txt` already named www, and
`site-routes.json` already used www as its origin. Every other choice would have meant changing
shipped artifacts to match a redirect. **The decision is now in the repository, not only in the
dashboard:** both `vercel.json` files carry the host redirect, and
`__tests__/securityHeadersParity.test.js` fails if one of them loses it.

**Unknown URLs go to the `noindex` shell, not to the homepage.** Both `vercel.json` files rewrite
unmatched paths to `/404.html` (the shell that boots the SPA and carries `noindex,follow`). Until
Phase 8 they rewrote to `/index.html`, which meant `https://www.hazardnet.live/anything-at-all`
answered 200 with the homepage's title, canonical and `index,follow` — a soft 404 over an unbounded
URL space. `__tests__/seoFoundations.test.js` now asserts both configs, and
`__tests__/securityTxt.test.js` keeps the dotted-path exclusion so `/.well-known/security.txt` and
`/data/*.json` are still served as files.

The build refuses to emit an apex canonical: `frontend/scripts/prerender.mjs` compares the
content origin against `CANONICAL_HOST` and exits non-zero, so a one-character edit to
`src/content/site-routes.json` cannot silently publish a second host.

> **Owner action 10** covers the parts that still need the dashboard: verifying the property in
> Google Search Console and Bing Webmaster Tools (DNS verification for the apex + www so both are
> attributed to one property) and submitting the sitemap. See `docs/ops/owner-actions.md`.

## 2. What is generated, and from what

`scripts/build_content_engine.mjs` composes the site's reference and outlook pages. It is the only
producer of `frontend/src/content/generated-routes.json` (committed, reviewable) and of
`frontend/public/data/content-index.json` (committed inventory of what was published).

| Surface | Route | Composed from |
| --- | --- | --- |
| Hazard reference index | `/hazards` | the hazard list + the current run's per-class counts |
| Hazard methodology (×8) | `/hazards/<slug>` | authored prose in `src/content/hazard-methodology.json` + the current run |
| District index | `/districts` | the app's 64-district table + the run's coverage stamp |
| District outlook (×64) | `/districts/<id>` | the snapshot row(s) for that district + its static baseline |
| Season retrospectives | `/retrospectives`, `/retrospectives/<year>` | the loaded event archive (**not generated** until one is loaded) |
| District history sections | inside `/districts/<id>` | the same archive |

Rules the engine follows, each one enforced:

1. **Nothing is hand-written twice.** The prose lives in
   `frontend/src/content/hazard-methodology.json`; every number comes from a committed artifact.
2. **A formula published on a page is executed against the code that computes it.**
   `scripts/tests/test_content_engine.py` evaluates each hazard's `expr` against
   `scripts/physics_severity.py` for a grid of driver vectors. If the physics changes and the copy
   does not, the build fails.
3. **A district the run did not cover is never presented as a forecast.** Those pages carry
   `noindex,follow`, are absent from the sitemap, and say in the standfirst that the run carried no
   row for them.
4. **No invented history.** With no archive loaded, the history section states that no archive is
   loaded and quotes the model card's 2,931-event claim as *reported, not verified*. With an archive
   loaded, the count is the archive's own and the drift against the claim is printed beside it.
5. **The pages and the coverage stamp cannot disagree.** The engine's
   `districts_with_outlook` must equal `coverage.districts_covered` from the snapshot the site
   serves (asserted in pytest).

### Editing the content

```bash
# 1. edit the authored prose (never the generated file)
$EDITOR frontend/src/content/hazard-methodology.json

# 2. regenerate; --check fails if the committed pages stop matching the committed inputs
node scripts/build_content_engine.mjs
node scripts/build_content_engine.mjs --check

# 3. rebuild the site (this runs step 2 first): dist/ picks up the new pages, sitemap and the
#    content index, and prerenders every route to static HTML
cd frontend && npm run build
```

Adding a **new hazard class** is deliberately not a copy-paste job: the class must exist in
`scripts/physics_severity.HAZARD_CLASSES`, and adding it to the eight-class vocabulary is a model
change (§5.4 of the product spec), not an editorial one.

A **new hand-written page** still belongs in `src/content/site-routes.json`, which the SPA and the
prerenderer both read. That file is the source of truth for its 17 routes and is not generated.

## 3. Structured data

One implementation — `frontend/src/lib/structuredData.js` — builds the JSON-LD graph for both
consumers: `scripts/prerender.mjs` (Node ESM) writes it into the static HTML, and
`frontend/src/hooks/usePageSeo.ts` applies it after a client-side navigation. They cannot drift:
`__tests__/structuredData.test.js` compares the graph in `dist/` against what the renderer produces
for the same route, field for field.

| Node | Where | Notes |
| --- | --- | --- |
| `WebSite` | every page | `@id` `https://www.hazardnet.live/#website` |
| `Organization` | every page | publisher, `areaServed: Bangladesh`, `founder` → the author, `member` → supervisors |
| `Person` ×3 | every page | the author (ORCID, GitHub, LinkedIn, X) and both supervisors, from `src/content/attribution.json` |
| `WebPage` | every page | per-route name/description, `dateModified` from the route, `about` on district pages |
| `SoftwareApplication` | `/`, `/model`, `/methodology` | the platform itself |
| `Dataset` (forecast) | `/data-sources`, `/download` | the published snapshot, free, licence = site terms |
| `Dataset` (event archive) | retrospectives + district pages **when an archive is loaded** | temporal coverage from the archive; **no `license`, no `distribution`** — the archive is compiled from third-party sources and is not redistributed here |
| `FAQPage` | every route with FAQs | the same questions the page shows |
| `BreadcrumbList` | every page | derived from the route, e.g. HazardNet → District outlooks → Bhola |

The attribution block is data (`src/content/attribution.json`) because it is published in three
places — the JSON-LD, the site's citation text, and the repository's `CITATION.cff` — and a name or
an ORCID that appears differently in two of them is a credibility problem, not a typo.

## 4. Loading the event archive (why the retrospectives are absent)

`docs/MODEL_CARD.md` §4 quotes **2,931 events (2000–2025)** as the data behind the historical
prior. That archive is not in this repository, so no page may state a historical count:
`/retrospectives` is not generated at all, and every district page says so in one sentence.

To publish the history sections and the retrospectives, three commands (also documented in
`data/events/README.md`):

```bash
python -m etl.cli events --input <raw-export.csv> --export-json data/events/hazardnet-events.json
node scripts/build_content_engine.mjs --events data/events/hazardnet-events.json
cd frontend && npm run build
```

The export is the loader's own normalised output (`hazardnet-events-export/v1`) — the same rows
`--emit-sql` loads into PostGIS — so a row the loader would reject cannot reach a page. The file is
**not committed** (`data/events/.gitignore`): the archive is assembled from third-party records
with their own terms, and a stale committed copy would be quoted by the pages as current. Whether
to publish a redistribution at all is **owner action 12**.

## 5. What runs automatically

| Trigger | What it does |
| --- | --- |
| `npm run build` (Vercel, CI, local) | regenerates the routes, prerenders every route to static HTML, rewrites `sitemap.xml` + `robots.txt`, writes `content-index.json` into `public/` and `dist/` |
| `daily_forecast.yml` / `weekly_forecast.yml` | after refreshing the snapshot: rebuild the content pages and commit them **with** the data they describe |
| `ci.yml` → *Code Quality & Build* | `--check` on the content engine and the freshness artifact, then the post-build suites (`seoFoundations`, `statusPagePrerender`, `structuredData`) against `dist/` |
| `site-health.yml` (every 30 min) | every sitemap URL resolves (parallel, no sampling), and a sample of generated pages is served **with its prerendered body** rather than the SPA shell |
| `scripts/tests/test_content_engine.py` | formulas match the physics module; no page claims a count it did not read; the district pages agree with the coverage stamp |
| `__tests__/seoFoundations.test.js` | every generated route has a real HTML file, its own canonical on the canonical host, one robots directive, an `<h1>`, a static body, and a sitemap entry that exists |

**Known cost, stated rather than hidden:** the generated routes are imported by the SPA
(`usePageSeo`) so that a client-side navigation renders the same page the static HTML already
served. That puts the content in a lazily-loaded chunk — measured 2026-09-18: the shared
`usePageSeo` chunk is 409 kB raw / **38.6 kB gzip**, against 55 kB / ~14 kB before Phase 8 for
`site-routes.json`. The alternative (per-route fetches) removes the weight but reintroduces a
flash between the prerendered text and the hydrated page. If the chunk grows past the bundle
budget in `npm run check:bundle`, the fix is per-route JSON fetched by the route component, not
trimming the content.

## 6. Owner actions this phase created

| # | Action | Why it cannot be a repository change |
| --- | --- | --- |
| 10 | Verify `hazardnet.live` + `www` in Google Search Console and Bing Webmaster Tools; submit `https://www.hazardnet.live/sitemap.xml`; watch the first 28 days of coverage | verification is a DNS/HTML token only the domain owner can place; the sitemap cannot be submitted without the property |
| 11 | Request listings/citations from the named stakeholder portals (DDM, BMD, FFWC, ReliefWeb, HDX/OCHA, EM-DAT, FAO, GEE, BAU department pages, GitHub's repository page, Vercel/Open-Meteo/Leaflet/OSM/Sentinel/Landsat/ERA5-Land data-provider pages) | each is an outbound request from the author, with a form or an editor, and none of them can be "done" by code |
| 12 | Decide whether to publish the event archive (and if so, where — Kaggle/Zenodo with a DOI), then load it per §4 | redistribution terms belong to the sources and the author |

Nothing in this repository claims any of the three has happened. When they do, record the outcome
in `docs/ops/owner-actions.md` so the claim is auditable.

## 7. What to check when something looks wrong

| Symptom | First check | Then |
| --- | --- | --- |
| A district page shows no outlook | the snapshot's `coverage.districts_covered` vs `districts` in `content-index.json` | if the run was partial, that is honest; if the district table changed, run `node scripts/build_content_engine.mjs` and look at `unmatched_snapshot_districts` |
| The sitemap and the site disagree | `node scripts/build_content_engine.mjs --check` | the build regenerates both, so a mismatch means a stale `dist/` — rebuild |
| A page's canonical points at the apex | `grep -r "hazardnet.live" frontend/src/content/site-routes.json` | the build fails on an apex origin, so this means a hand-edited `dist/` |
| Search Console reports "Duplicate, Google chose a different canonical" | confirm both hosts serve the same HTML | the apex redirect is in both `vercel.json` files; check the Vercel project's *Domains* tab still redirects (owner action 10) |
| The retrospectives 404 | they only exist when an archive is loaded | see §4; the routes are absent by design, not broken |
| A garbage URL returns 200 | expected: the rewrite serves `/404.html`, whose body is `noindex,follow` | confirm the meta is there (`curl -s https://www.hazardnet.live/xyz | grep robots`); the SPA still boots for real-but-unlisted routes |
| Search Console reports "Crawled – currently not indexed" for district pages | those four `noindex` districts, or the run simply not covering the district | §4 — this is the intended state, not a defect |
