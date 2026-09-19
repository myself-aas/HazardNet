# The public surface: what lives at `/`, what lives at `/live`

**Status:** in force since 2026-09-18 (PR #29); amended 2026-09-19 by the landing-page redesign
(rules 5, 7, 8 and 9 below — see §3, and the redesign's own audit note in §7) and again on
2026-09-19 by rule 10, which removes every location in this repository's tree from every visitor
surface.
**Enforced by:** `__tests__/publicSurface.test.js`, `__tests__/noRepoPaths.test.js`,
`scripts/check-public-paths.mjs` (CI, after the build), `e2e/critical-paths.spec.ts`
("Editorial front door"), `e2e/smoke.spec.ts`, `scripts/prerender.mjs`.

---

## 1. The two addresses

| | `/` — editorial front door | `/live` — the GIS console |
| --- | --- | --- |
| Job | Say what this platform is, who is behind it, what the last run produced, and where each number can be checked | Show the current outlook on a map, per district, per horizon |
| Renders | `frontend/src/pages/FrontDoor.tsx` | `frontend/src/pages/Dashboard.tsx` (`defaultTab="gis"`, `isFullScreen`) |
| Copy | The `/` entry in `src/content/site-routes.json`, rendered by the page and by the prerenderer | The `/live` entry in the same file |
| Layout | Ordinary document: white masthead, padded `<main>`, footer | Full-bleed: transparent masthead over the map, no footer |
| Live data | The hero run card (`components/frontdoor/RunVisual.tsx`) and the status strip (`components/frontdoor/LiveStatusStrip.tsx`), both reading `/data/freshness.json` and `/data/alerts-latest.json`; the hindcast episode count from `/data/model-performance.json` | Forecast snapshot, map tiles, district cards |
| Languages | English, plus a Bengali editorial block and translated controls (rule 8) | Bengali for the alert cards, the map and the district tables (Phase 5) |
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
React, and the `<head>` metadata `usePageSeo` applies on client-side navigation). Rules 1–9 are about
the front door; rule 10 is about every surface this deployment serves. Rules:

1. **Numbers come from artifacts, never from prose.** The trust strip, the hero run card
   (`RunVisual.tsx`) and the status strip (`LiveStatusStrip.tsx`) read committed files and print the
   file's own values with the run that produced them: the freshness artifact names the coverage the
   snapshot reports (60 of 64 districts at time of writing) and the alert artifact names the assessed
   / withheld / published counts from the run report. A figure with no artifact behind it does not
   appear, and the test suite scans both live panels for a hard-coded figure with a unit attached.
2. **A missing value is never rendered as a zero.** An unreadable artifact produces the sentence
   that says it could not be read (and the panel says the status page will show the same failure); an
   unknown age is an em dash; "no alert published" is stated as a statement about the publisher —
   the page says explicitly that it is not a statement about the weather.
3. **Every product is dated, and the date is read rather than typed.** The knowledge-products
   ledger carries the review date each product's own route carries. Since 2026-09-19 the date cell is
   a reference (`@review-date:/model-performance`) that `scripts/prerender.mjs` and `usePageSeo.ts`
   both resolve against the route table, because `/model-performance`'s `updated` is *derived* — the
   content engine sets it to the newest hindcast report's build date — so a date typed into the ledger
   went stale the first time the Hindcast workflow ran after it was written. It did, on 2026-09-19,
   and the test caught it. `__tests__/publicSurface.test.js` now fails if a cell is a literal date
   rather than a reference, if a reference points at a route this build does not publish, or if either
   renderer stops understanding the reference.
4. **The authority boundary is on the page.** BMD, FFWC, DDM and the 999 hotline are named in the
   copy with links to their portals; the boundary is also in the hero's own note and in each FAQ.
   The test asserts those names, those hosts and that number are present.
5. **No invented imagery, uptime or listings — but the hero may carry a picture of the data.**
   There is no photograph on the front door: no licence-clean satellite or field image ships in this
   repository, an AI-generated illustration presented next to provenance claims would undercut the one
   thing the page is for, and a stock photograph of a flood would date the page to a disaster it is
   not describing. There is no uptime percentage or "users served" figure for the same reason — the
   artifacts do not measure them.

   *Amended 2026-09-19.* The 2026-09-19 review asked for a full-width hero image. What ships instead
   is `RunVisual.tsx`: the last run's own coverage bar, its units per horizon, what it published, the
   age of every artifact this deployment ships, and the run's `honesty` notes verbatim — dated, sourced
   and reproducible from committed files. A visual is allowed on this page only if all four hold: every
   value in it is read from an artifact; the artifact's own build timestamp is printed beside it; it is
   not interactive and not a map (rule 1 of §1 — the map is `/live`); and where an artifact could not be
   read it renders the sentence that says so rather than an empty chart.
6. **The attribution block is not decorative.** Author, role, ORCID, supervisors and institution
   come from `src/content/attribution.json` — the same file the JSON-LD graph and `CITATION.cff` are
   built from — and the prerenderer writes the block into the static HTML for `/`, so it survives
   without JavaScript. The hero's editorial half is rendered from `site-routes.json` for the same
   reason. The citation string itself is marked `translate="no"` and keeps `lang="en"` in both
   languages: a citation a reader cannot paste back into a reference manager is not a citation.
7. **The live status strip states the zero case in words.** `LiveStatusStrip.tsx` is an announced
   region (`role="status"`, `aria-live="polite"`), so a reader who leaves the page open hears it
   change. It prints the alert artifact's level counts, the coverage the last run reported, the count
   of assessed rows and the artifact's own timestamp. Two behaviours are the point of it: when nothing
   is published it says that no alert is published *and* how many assessed rows the publication gate
   withheld, because silence on a hazard platform is read as safety; and when the artifact cannot be
   read it prints no count at all rather than four zeros. `NO_ALERT` gets no chip — the artifact counts
   published rows per level, so a `NO_ALERT: 0` chip would read as "no district is normal", the
   opposite of its meaning, and the per-district normal count the review asked for is not a number any
   artifact carries.
8. **The front door is bilingual; the translation may not outrun the facts.** The editorial copy
   carries a Bengali block (`i18n.bn` on the `/` route in `site-routes.json`) and the page's controls
   and sentences are in `lib/i18n.ts`. Three rules keep the two copies from drifting apart:
   * **English is the structural authority.** `localiseRoute()` merges field by field and section by
     index, so a sentence with no Bengali version renders in English rather than as a gap — a
     translation can reword a page, it cannot shorten or reorder one. The test compares section counts,
     paragraph and bullet counts, link targets, and the ledger's dates and paths.
   * **No number may exist only in the translation.** Bengali digits are normalised and every numeric
     token in the Bengali copy must also appear in the English copy, because the claims and embargo
     gates read English text and a figure introduced only in Bengali would be a figure nothing checked
     (constraint C3 applies in both languages).
   * **The Bengali carries its review status in the data.** The route records `"review":
     "approved-native-speaker"` with `reviewedAt: 2026-09-19` and `reviewedBy: project owner` —
     read and approved by the owner on 2026-09-19, which closed owner Action 6c
     (`docs/ops/owner-actions.md`) for this surface. A draft that has not been read must carry
     `pending-native-speaker` instead, and the front door must not be announced as available in
     Bengali while it does. Deleting the marker fails the build; so does an approval that names no
     date and no reader, because "approved" that nobody can check is not a review.

   Known limits, stated so they are not discovered later: the prerendered static HTML is English, so a
   Bengali reader gets English first paint and Bengali after hydration; the `<head>` metadata and the
   JSON-LD stay English (no `hreflang` alternates are published, and inventing them without a
   Bengali-per-route URL would be wrong); and the long-form knowledge products (`/model`,
   `/methodology`, `/data-sources`) remain English-only by the scope recorded in Phase 5.
9. **Claims the page does not make.** Four claims were in circulation in the review material and in
   earlier drafts, and all four are false in this repository. They are pinned out by test rather than
   by memory: no landslide (the vocabulary is eight classes, `Models/labels.json`, enforced on ingest);
   no MODIS as a live input (the MODIS layers in `scripts/etl/sources.py` serve the archive path and
   `hazard-methodology.json` says they are "not live inputs to the forecast"); the 2,931 archive figure
   is always reported as reported rather than verified, and never as "trained on 2,931 events"; and the
   publication gate is described as the code implements it — automatic at or below the configured
   ceiling (WATCH), a named duty officer above it — never as "a human reviews every warning".
   `hazard-methodology.json` carries the same discipline for BMD and FFWC: the adapters
   (`scripts/etl/bulletins.py`, `scripts/etl/hydrology.py`) exist and are tested, no workflow supplies
   them data, so the source line names the adapter and says no bulletin or river record reaches a run.
10. **No location in this repository's tree appears on a visitor surface.** Added 2026-09-19.

    A reader on a phone during a flood cannot open `scripts/physics_severity.py`. Printed on a page,
    it is not provenance, it is decoration that costs attention and implies an action nobody on that
    surface can take. So the surfaces print only what a reader can act on: a build timestamp, a
    coverage count, a state in words, a label ("Forecast ingest run"), or a URL this site serves
    (`/data/freshness.json`, which resolves on the deployed origin — the leading slash is the whole
    difference). Deletion, not rewording: where a path was the only content of a bullet or a
    paragraph, the bullet or the paragraph went with it; where a sentence made a claim *and* named a
    file, the claim stays and the naming goes ("a parser exists and is tested", not "a parser exists
    (`scripts/etl/bulletins.py`) and is tested").

    This narrows constraint C3 ("every published number is auditable and traceable") on purpose, and
    the narrowing is recorded rather than quietly absorbed. Auditability is unchanged: every artifact
    the pages are built from keeps its provenance fields, and each page links the machine-readable
    copy it was generated from. What changed is that traceability is addressed to the thing that can
    perform it — a script, a CI run, a reviewer with the repository — instead of being printed at a
    reader who cannot follow it.

    The rule is one predicate in one place, applied at four points, because the leak does not always
    come from a literal in a component:

    | Where | What it does |
    | --- | --- |
    | `scripts/lib/public-text.mjs` | The rule: `namesRepoFile()`, `withoutRepoPaths()`, `publishableEntries()`, `findRepoPaths()`, and the tree roots and extensions the pattern is built from. |
    | `frontend/src/lib/publicText.ts` | The browser twin, for values that only exist at render time (the freshness panel's detail rows come from an artifact fetched in the page). `__tests__/publicText.test.js` asserts the two agree on every case, so the rule cannot drift between build and runtime. |
    | `scripts/build_content_engine.mjs` | Applies `withoutRepoPaths()` to the prose it reads out of data files (the hindcast reports name the module that produced a score in `cnn_note`), and fails the build if any generated string still names the tree — including strings interpolated from a loaded archive, which a grep of the source cannot see. |
    | `scripts/check-public-paths.mjs` | Scans every byte of all 198 shipped documents — rendered text, HTML comments, JSON-LD, inline styles — and fails CI on the first path. Run as `npm run check:paths` after the build. |

    `__tests__/noRepoPaths.test.js` covers the half a build scan cannot see: the authored content
    JSON, the freshness artifact's rendered fields, and every component's rendered strings (comments
    and module specifiers stripped).

    Out of scope, deliberately: the committed artifacts under `frontend/public/data/` and
    `data/hindcast/reports/`, whose `artifact`, `inputs.*`, `generated_by`, `source_path` and
    `cnn_note` fields keep their paths — they are the machine-readable copies the pages link to, and
    stripping them would be the one way to make a published number genuinely unauditable. Also out of
    scope: this document and the rest of `docs/`, whose job is to name files.


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

The prerenderer writes the English copy: it has no language dimension, and a Bengali static variant
would need its own URLs and `hreflang` wiring that does not exist. `lib/i18n.ts` resolves the language
on hydration (a stored choice, then `navigator.languages`), writes `document.documentElement.lang`, and
`localiseRoute()` swaps in the Bengali editorial block — so the no-JavaScript view of `/` is the English
one, in the same design, and the Bengali view requires JavaScript.

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

## 7. The 2026-09-19 landing-page review: what was asked, what shipped, what was refused

A design review benchmarked `/` against the front doors of GFDRR, UNDRR and the Red Cross climate
centre and asked for seven things. Four shipped, three were refused, and the refusals are recorded
here because a refusal that is not written down becomes a regression in the next review.

| Asked for | Outcome | Why |
| --- | --- | --- |
| Full-width hero photograph | **Refused; replaced** | Rule 5. `RunVisual.tsx` renders the last run's coverage, outcome, artifact ages and honesty notes instead — a picture that is dated and sourced beats one that is merely large. |
| Live status strip ("⚠ 2 active alerts · 🟡 1 watch · ✓ 61 districts normal") | **Built, with real numbers** | Rule 7. The committed artifact holds zero published alerts, 74 assessed rows and 74 withheld by the publication gate. The strip prints that, including the explanation, rather than the example. |
| Interactive district map on `/` | **Refused** | Rule 1 and §2. `/live` remains canonical; the review re-ran the same question the 2026-09-18 split answered, and the answer did not change. The front door states where the outlook lives and links to it. |
| Bengali front door | **Built, and approved by the owner on 2026-09-19** | Rule 8. The editorial block and the controls are translated; the route now carries `approved-native-speaker` with the date and the reader named, closing owner Action 6c for this surface. |
| Next.js + Tailwind rewrite | **Refused** | The stack is Vite + React with Tailwind v4 on NASA HDS tokens. A framework change would discard `scripts/prerender.mjs`, the content engine, the structured-data builder and five CI gates that read the current tree, to buy nothing a reader can see. |
| "Human reviews every warning" | **Refused; corrected** | Rule 9. `backend/alerts/assess.js` publishes automatically at or below `max_auto_publish_level`. The copy now names the ceiling and the duty-officer rule above it. |
| Landslide, MODIS fire detection, "trained on 2,931 events" | **Refused; corrected** | Rule 9. Eight classes, no landslide; the MODIS layers serve the archive path, not the live tensor; 2,931 is a reported count of archive observations this repository does not redistribute and no deployment loads. |

What shipped with it: `components/frontdoor/LiveStatusStrip.tsx` and `components/frontdoor/RunVisual.tsx`
(both artifact-driven, both covered by `frontend/src/components/frontdoor/__tests__/`), a new
"The current outlook, and where to see it" section on the `/` route, the Bengali editorial block, roughly
seventy new `frontdoor.*` dictionary keys in both languages, an `hds` tone on the shared
`LanguageToggle` (so the toggle is one component rather than two), and eleven new assertions in
`__tests__/publicSurface.test.js` covering rules 7–9.
