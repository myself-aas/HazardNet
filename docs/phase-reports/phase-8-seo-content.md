# Phase 8 — SEO and the content engine: the model's own numbers, on a page, for every district

**Date:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the phase the deployment
plan reserved for the part of the project a search engine — and a district officer — can see.

**Headline:** the public surface grew from 17 hand-written reference pages to **96 prerendered
HTML files / 87 sitemap URLs** covering every hazard class and all 64 districts, composed at build
time from the same forecast snapshot the deployment serves and from one authored copy file. No page
states a number that was not read from a committed artifact: where the 2,931-event archive would
have to be, the pages say it is not loaded. Nine new tests pin the copy to the code it describes,
including one that *executes* each published physics formula against `scripts/physics_severity.py`.

---

## 1. What the phase had to produce

| Requirement (from the phase directive) | What it required | Before |
| --- | --- | --- |
| Working `sitemap.xml`, valid `robots.txt` | a sitemap generated from what the build actually writes, on one canonical host | sitemap generated from the 17 hand-written routes (Phase 0 fix); anything new would have to be added by hand |
| Canonical host: pick apex or www | a decision, in the repository, enforced at build time | www was used by canonicals/security.txt, and the apex redirect lived only in a Vercel project setting |
| SSR content on all public pages | every public route readable without JavaScript | true for the 17 routes; the new content had no routes at all |
| Content engine: per-hazard methodology posts | one page per class, from authored prose + the current run | did not exist |
| Content engine: district hazard profiles from the 2,931-event archive | district pages, honestly framed while that archive is out-of-repo | did not exist |
| Content engine: annual retrospectives validated against the model | yearly pages, with the hindcast requirement stated | did not exist |
| Structured data: `WebSite`, `Organization`, `Dataset`, `FAQPage`, `BreadcrumbList` | correct, non-drifting, honest | partial: an inline builder in the prerenderer only, no `Person`s, no archive dataset, two-item breadcrumbs, and no parity with the SPA |
| Distribution: Search Console / Bing / listings | owner actions, recorded as such | did not exist |

## 2. What was built

### 2.1 The content engine (`scripts/build_content_engine.mjs` → `frontend/src/content/generated-routes.json`)

74 routes from three inputs — the committed forecast snapshot, `src/content/hazard-methodology.json`
(authored prose + the machine-checkable physics expressions) and the app's own 64-district table:

* `/hazards` + eight methodology pages: what the model labels, the cross-check formula, the drivers,
  the confidence semantics (`uncalibrated_model_softmax`), the class's **stated limits**, its inputs,
  and the current run's count for that class with the five highest districts;
* `/districts` + 64 outlook pages: the run's hazard class, severity, confidence, physics cross-check
  and divergence per horizon; the static baseline the map falls back to; the history section; and
  three FAQs (what the severity means, why there might be no outlook, how current the page is);
* `/retrospectives` + one page per year, **only when an archive is loaded**, plus district history
  sections — with the archive's own counts and the drift against the model card's claim printed
  beside them.

District name reconciliation is explicit (`Chittagong`→`chattogram`, `Comilla`→`cumilla`,
`Jessore`→`jessore`, `Maulvibazar`, `Netrakona`, `Nawabganj`, `Brahamanbaria`): a fuzzy match could
attach a forecast row to the wrong district, so anything the map does not cover is reported as
`unmatched_snapshot_districts` instead of being guessed. With the current snapshot the engine
publishes **60 of 64** outlook pages, exactly the coverage the snapshot's own stamp reports.

### 2.2 The prerenderer, sitemap and canonical host (`frontend/scripts/prerender.mjs`)

* renders every generated route to `dist/<path>/index.html` (+ the extension-less sibling), each
  with its own title, description, canonical, **one** robots directive, Open Graph/Twitter tags, the
  static body, and JSON-LD;
* builds `sitemap.xml` from the route lists — hand-written **and** generated — including only
  entries the engine marked indexable, so the four districts the run did not cover are absent rather
  than advertised;
* writes `public/data/content-index.json` (committed) **and** the identical `dist/data/…` copy, so
  the served inventory can never describe the previous build;
* refuses to build if the content origin is not `www.hazardnet.live` (the canonical-host decision,
  enforced where it is cheap);
* keeps `robots.txt` regenerated with the sitemap line rewritten to the canonical origin, and
  `404.html` as the `noindex` shell.

Both `vercel.json` copies now carry the apex→www redirect (`permanent: true`), asserted by
`__tests__/securityHeadersParity.test.js`; `docs/ops/SEO_AND_CONTENT.md` §1 records why www won.

### 2.3 Structured data (`frontend/src/lib/structuredData.js`, shared)

One module builds the graph for the prerenderer (Node ESM) and for `usePageSeo` (the SPA), so
hydration cannot replace a rich graph with a poorer one. Nodes: `WebSite`, `Organization` (with
`founder` → the author and `member` → both supervisors), three `Person`s from
`src/content/attribution.json` (ORCID as `@id`, GitHub/LinkedIn/X in `sameAs`), `WebPage` (with
`about` = the district on district pages), `SoftwareApplication` (platform routes), `Dataset` for the
forecast snapshot, `Dataset` for the historical archive **only when one was loaded** (no `license`,
no `distribution` — the archive is third-party and not redistributed here), `FAQPage`, and a
per-route `BreadcrumbList` (HazardNet → District outlooks → Bhola). The co-supervisor node carries
no `name`: the repository knows only the BAU profile URL, and inventing a name would be inventing a
fact.

### 2.4 Citation and identity

`CITATION.cff` (CFF 1.2.0) makes the repository citable from GitHub's *Cite this repository* button,
naming the thesis, the author's ORCID and the department; the same data feeds the site's JSON-LD.

### 2.5 The archive bridge

`python -m etl.cli events --export-json …` (`hazardnet-events-export/v1`) writes the loader's own
normalised rows — the same ones the SQL loads — plus `claimed_total`, `ingested` and `drift`, and
`data/events/README.md` documents the three-command path from a raw export to published history.
`data/events/.gitignore` keeps the file untracked, and a test asserts no archive JSON is ever
committed.

### 2.6 Automation

`npm run build` regenerates the pages first; CI runs `--check` on both derived artifacts, then the
post-build suites against `dist/`, then a **clock-blind comparison of the committed content index
against the index this build produced** (the rewrite moves `generated_at` on every build, so
`git status` cannot be the gate); the site-health probe verifies **all 87 sitemap URLs in parallel
(no sampling)** and probes a sample of generated pages for their prerendered bodies, publishing the
new `content_pages` check through the Phase 7 result pipeline.

The daily and weekly pipelines now run the **full build** (`npm run build:frontend`) rather than the
engine alone. They previously ran `node scripts/build_content_engine.mjs` and then staged
`frontend/public/data/content-index.json` — a file only the prerenderer writes, so the staging was
a no-op and a coverage change would have left the committed inventory describing the previous run.
The daily job therefore installs the workspace (`npm ci` at the root, cached) before it builds.

## 3. Findings

0. **A synthetic fixture was sitting in the ingest path.** `scripts/tests/make_fixture_csv.py`
   defaulted to `backend/data/forecasts/hazardnet_forecasts_latest.csv` — the committed CSV the ETL
   and the site read — so running it once with no arguments replaced 74 real forecast rows with 128
   synthetic ones ("Kurigram / TestDivision"). Exactly that had happened in the working tree before
   this phase. The helper now defaults to `/tmp` and **refuses** to write under
   `backend/data/forecasts/` without `--force`; the committed CSV was restored and the phase commit
   carries no synthetic data.
1. **The canonical host was a dashboard fact, not a repository fact** — now declared, enforced by
   the build, and mirrored by a redirect in both configs.
2. **A generated sitemap can still lie if it is built from the wrong list** — the build now derives
   it from the same route list it renders, and a test checks every `<loc>` has a file.
3. **The snapshot and the app disagreed on eight district names.** Silent non-matching would have
   turned eight covered districts into "no outlook" pages; the engine maps them explicitly and
   reports leftovers.
4. **A `jessore` alias pointed at a district id that does not exist** (`jashore` is the *name*; the
   id is `jessore`) — caught by the alias test asserting every target is a real id. Removed.
5. **The district parser silently truncated `Cox's Bazar`** to `Cox` (escaped apostrophe in the
   TypeScript source) — a city of 2.8 million would have lost its outlook page. Parser fixed and
   pinned.
6. **`content-index.json` was written only to `public/`**, so the copy Vite had already copied into
   `dist/` described the previous build. Both copies are now written.
7. **The two JSON-LD producers could diverge** — one module now serves both, with a field-for-field
   parity test against the built HTML.
8. **"25 units at 7 days and 49 at 15 days" looked like swapped horizon labels.** It is not: every
   `7_days` row has `target_date − prediction_date = 7` and every `15_days` row has `15`, so the
   labels are correct and the run genuinely produced fewer short-horizon units (60 of 64 districts
   carry at least one row). Because "60 of 64" alone invites the reader to assume both horizons,
   every district page and the district index now state the per-horizon counts and say that a
   district can appear at one horizon and not the other. The published copy says "7-day outlook",
   not "7 days outlook" (the labels are used as counts elsewhere, so both forms are kept).
9. **Unknown URLs answered 200 with the indexable homepage.** Both `vercel.json` files rewrote every
   unmatched path to `/index.html`, so `/anything-at-all` served the homepage's title, canonical and
   `index,follow` — a soft 404 over an unbounded URL space. The rewrite now lands on `/404.html`,
   the `noindex,follow` shell that still boots the SPA (so unlisted-but-real routes such as profile
   URLs keep working), and `__tests__/seoFoundations.test.js` asserts both configs while
   `__tests__/securityTxt.test.js` keeps the dotted-path exclusion.
10. **The committed snapshot's `source` label names the retired Kaggle path** while the ingest
   manifest names the Actions pipeline. The rows are identical (74 rows, same districts, horizons,
   hazards, severities and `prediction_date` — verified), so this is a provenance label, not a data
   difference: `scripts/build_forecast_snapshot.mjs` fell back to `kaggle kernels output …` whenever
   `SNAPSHOT_SOURCE` was unset, which is the case for a local rebuild. The fallback now says the
   producer was never declared; the committed file still carries the old label and is recorded here
   rather than silently rewritten.

## 4. Verification

| Gate | Result |
| --- | --- |
| `npx jest --ci` (root + frontend) | **79 suites / 903 tests pass** (was 76/856; +47 tests: contentEngine 18, structuredData 12, seoFoundations 15, plus two redirect-parity cases in securityHeadersParity) |
| `pytest scripts/tests` (via `/tmp/pv2`) | **516 pass** (was 481; +35 in `test_content_engine.py`) |
| `tsc --noEmit` (`npm run lint`) | clean |
| `eslint .` | 0 errors (pre-existing warnings only) |
| `npm run build` (frontend) | green: 96 prerendered routes, sitemap 87 URLs, content index written to `public/` and `dist/` |
| `node scripts/build_content_engine.mjs --check` | passes on the committed file; fails on a perturbed input |
| `scripts/check-secrets.sh`, `npm-audit-ci`, `check:bundle` | pass |
| Probe additions | `xargs -P 8` verification of all 87 sitemap URLs; generated-page sample checked for `HN_STATIC_START` |
| Honesty checks | no district page states a history count without an archive; the archive dataset node carries no licence/distribution; the four uncovered districts are `noindex` and out of the sitemap |

## 5. What Phase 8 deliberately does not do

* **It does not publish the historical archive.** The 2,931-event compilation is not in this
  repository; the pages say so. Loading or publishing it is owner Action 12.
* **It does not claim any discovery work.** Search Console and Bing verification/submission is owner
  Action 10, the portal listings and citations are Action 11. No submission, listing or backlink is
  asserted anywhere in the repository.
* **It does not hindcast.** "Validated against the model" needs a hindcast over historical weather;
  the retrospectives state the requirement and publish no skill number.
* **It does not remove the bundle cost.** The generated routes ride in a lazy chunk measured at
  38.6 kB gzip; the alternative (per-route fetches) is documented, not silently taken.
* **It does not fix the deployment.** Production is still stale (owner Action 7), so none of the new
  pages are live yet.

## 6. Owner prerequisites

| # | Action | Why it is not a repository change |
| --- | --- | --- |
| 10 | Verify the domain in Google Search Console + Bing Webmaster Tools, submit the sitemap, watch 28 days of coverage | DNS/HTML verification and submission belong to the domain owner |
| 11 | Request listings/citations from the named portals (DDM, BMD, FFWC, ReliefWeb, HDX, EM-DAT, FAO, GEE, BAU, data providers) | Outbound requests from the author; each is reviewed by a human editor |
| 12 | Decide the event archive's fate (load privately / publish with a DOI / leave out) | Redistribution terms belong to the sources and the author |
| 7 | Fix the deployment root so the new pages actually ship | Pre-existing, P0 — everything built here is invisible until it is done |

## 7. Files

**New:** `scripts/build_content_engine.mjs` · `frontend/src/content/hazard-methodology.json` ·
`frontend/src/content/attribution.json` · `frontend/src/content/generated-routes.json` (generated,
committed) · `frontend/public/data/content-index.json` (generated, committed) ·
`frontend/src/lib/structuredData.js` + `.d.ts` · `CITATION.cff` · `data/events/README.md` +
`.gitignore` · `docs/ops/SEO_AND_CONTENT.md` · `scripts/tests/test_content_engine.py` ·
`__tests__/contentEngine.test.js` · `__tests__/structuredData.test.js` ·
`__tests__/seoFoundations.test.js` · this report.

**Modified:** `scripts/build_forecast_snapshot.mjs` (undeclared-producer fallback) ·
`scripts/tests/make_fixture_csv.py` (refuses to overwrite a committed artifact) ·
`frontend/scripts/prerender.mjs` · `frontend/src/hooks/usePageSeo.ts` ·
`frontend/src/App.tsx` · `frontend/src/components/{Footer,MenuDrawer}.tsx` ·
`frontend/package.json` · `scripts/etl/cli.py` (`--export-json`) · both `vercel.json` ·
`.github/workflows/{ci,daily_forecast,weekly_forecast,site-health}.yml` ·
`__tests__/securityHeadersParity.test.js` · `README.md` · `docs/PRODUCT_SPEC.md` ·
`docs/codebase/CONCERNS.md` · `docs/architecture/TARGET_ARCHITECTURE.md` · `data/README.md` ·
`docs/ops/owner-actions.md`.
