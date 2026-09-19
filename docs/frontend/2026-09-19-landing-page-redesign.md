# The landing-page redesign: a data-derived hero, a live strip, a bilingual front door

**Date:** 2026-09-19
**Branch:** `arena/01a0b8a7-hazardnet`
**Scope:** `/` only — its layout, its live panels, its copy, its languages, and the contract in
`docs/PUBLIC_SURFACE.md` that holds it.
**Not in scope:** the console at `/live` (unchanged), the framework (still Vite + React), and any
change to what the pipeline computes.

---

## 1. The decision

A design review supplied on 2026-09-19 benchmarked `/` against the front doors of GFDRR, UNDRR and
the Red Cross climate centre and asked for a seven-section page: a photograph-led hero, a live status
strip, a district map, a "how it works" block, the knowledge products, the authority boundary and a
footer. It also supplied numbers for those sections and a stack recommendation.

Four questions went to the owner before anything was built, because two of the requests contradicted
a contract this repository already enforces by test:

| Question | Answer |
| --- | --- |
| Redesign scope | Full seven-section redesign, amending `docs/PUBLIC_SURFACE.md` and its tests where they conflict |
| Hero visual | A **data-derived** visual — not a photograph, not a map, not generated art |
| District map on `/` | **No.** `/live` stays canonical |
| Bengali | Translate the front door too, not just the alert and map surfaces |

The review's own numbers were checked against the repository before use, and four of them were false.
§4 records them, because the alternative was shipping a better-looking page that lied.

## 2. What changed

| Surface | Before | After |
| --- | --- | --- |
| Hero | Headline, standfirst, three CTAs, authority note | The same, with the hero's right column carrying `RunVisual.tsx` — the last run drawn from its own artifacts |
| Live state | Two panels below the trust strip: artifact ages, published alerts | A `role="status"` strip directly under the hero (`LiveStatusStrip.tsx`) for the glance, and the published-alert record below it; artifact ages moved into the hero card, so no fact is rendered twice |
| Sections | Six | Seven: "The current outlook, and where to see it" is new and states the `/`–`/live` split from the page itself |
| Publication rule | "requires human review above its automatic-publishing level" | Names the ceiling (WATCH), the duty-officer rule above it, and what a run that stamps no model version does |
| Languages | English, with Bengali on the alert and map surfaces | Bengali editorial block on the `/` route plus ~70 `frontdoor.*` dictionary keys; a `LanguageToggle` in the hero |
| Contract | `PUBLIC_SURFACE.md` rules 1–6 | Rule 5 amended (a data-derived visual is allowed, invented imagery still is not), rules 7–9 added |

Files: `frontend/src/pages/FrontDoor.tsx`, `frontend/src/components/frontdoor/{RunVisual,LiveStatusStrip}.tsx`
(new), `frontend/src/lib/i18n.ts`, `frontend/src/hooks/usePageSeo.ts` (`localiseRoute`),
`frontend/src/components/alerts/LanguageToggle.tsx` (an additive `tone` prop),
`frontend/src/content/site-routes.json`, `frontend/src/content/hazard-methodology.json`,
`__tests__/publicSurface.test.js`, `frontend/src/components/frontdoor/__tests__/` (new),
`docs/PUBLIC_SURFACE.md`, `docs/ops/owner-actions.md`.

## 3. The two live panels

Both take their numbers through props; neither contains a figure of its own, and a test scans both
sources for a hard-coded number with a unit attached.

**`RunVisual.tsx` — the hero card.** Coverage of the last run as a labelled bar with the value in text
beside it (the bar is `aria-hidden`, so nothing nameless is handed to a screen reader), the units per
horizon, what the run published, every artifact this deployment ships with its state in words next to
its dot, and the run's own `honesty` notes verbatim — three of them, with the count of the rest and a
link to `/status`. It prints the artifact's `built_at` and `generated_by`. When the freshness artifact
cannot be read it says so and prints nothing else: no empty axes, no zeroed bar.

**`LiveStatusStrip.tsx` — the glance.** An announced region (`role="status"`, `aria-live="polite"`)
carrying the artifact's level counts, the coverage the run reported, the assessed-row count and the
artifact's own timestamp, then either the top published alerts as permalinks or the zero case in words.
`NO_ALERT` deliberately gets no chip: the artifact counts *published rows* per level, so a
`NO_ALERT: 0` chip would read as "no district is normal" — the opposite of its meaning — and the
per-district normal count the review asked for is not a number any artifact here carries.

Today, on the committed artifacts, that means the strip reads: no alert published, 60/64 districts
covered (partial), 74 rows assessed, 74 withheld by the publication gate, generated 2026-09-17. The
review's example — "2 active alerts · 1 watch · 61 districts normal" — describes a state this
deployment has never been in.

## 4. Claims the review supplied that the repository cannot support

| Claim | What the repository says |
| --- | --- |
| "2 active alerts · 61 districts normal" | `alerts-latest.json` holds zero published alerts, 74 assessed, 74 `not_published`; `freshness.json` explains why in its own `honesty` notes (no `model_version`, so nothing above WATCH can publish) |
| Landslide among the hazards | The vocabulary is eight classes (`Models/labels.json`, enforced on ingest). There is no landslide class |
| MODIS in the pipeline | MODIS NDVI/EVI and LST adapters exist in `scripts/etl/sources.py` for the **archive** path and are not inputs to the live tensor; `hazard-methodology.json` already said so, and now says it in the source lines too. MODIS/VIIRS active fire is not ingested at all |
| "Human reviews every warning" | `backend/alerts/assess.js` publishes automatically at or below `max_auto_publish_level` (WATCH) and requires a named duty officer above it |
| "Trained on 2,931 events" | 2,931 is a count of archive observations from third-party records this repository does not redistribute, and no deployment loads it (`event_archive: null`). The copy keeps reporting it as reported rather than verified |
| BMD/FFWC "ingested as text" | The adapters exist and are tested (`scripts/etl/bulletins.py`, `scripts/etl/hydrology.py`), but no workflow supplies them data, so nothing published derives from a bulletin or a river record. The three source lines that claimed otherwise now say both halves |
| Next.js + Tailwind | Refused. Tailwind v4 on NASA HDS tokens is already here; a framework change would discard `scripts/prerender.mjs`, the content engine, the structured-data builder and the gates that read this tree, for nothing a reader can see |

The first six are pinned by test (`__tests__/publicSurface.test.js`, "claims the front door does not
make"), because a correction that lives only in a change report is a correction that gets undone.

## 5. The bilingual front door

`localiseRoute()` in `usePageSeo.ts` merges the route's `i18n.bn` block over the English field by
field and section by index. The consequence is deliberate: **English is the structural authority** — a
translation can reword a page but cannot shorten, reorder or drop part of one, and a missing sentence
renders in English rather than as a hole. Three tests hold that: structure mirroring (section, paragraph,
bullet and FAQ counts, link targets, ledger dates and paths), a numeric-subset check (Bengali digits are
normalised, and no number may exist only in the translation, because the claims and embargo gates read
English text), and the review marker.

Known limits, recorded rather than discovered later:

* The prerendered static HTML is English. The prerenderer has no language dimension, and a Bengali
  static variant would need per-language URLs and `hreflang` wiring that does not exist. A Bengali
  reader therefore gets an English first paint and Bengali after hydration — which also means the
  no-JavaScript view of `/` is the English one.
* `<head>` metadata and the JSON-LD stay English.
* The long-form knowledge products (`/model`, `/methodology`, `/data-sources`) remain English-only, per
  the Phase 5 scope decision.
* The Bengali was drafted on 2026-09-19 and **approved by the project owner the same day**. The route
  records it — `"review": "approved-native-speaker"`, `reviewedAt`, `reviewedBy` — and a test fails if
  an approval carries no date or no named reader, or if the marker is deleted.

## 6. Measured

| Gate | Result |
| --- | --- |
| `tsc -p frontend/tsconfig.json --noEmit` | clean |
| `eslint .` | 0 errors, 286 warnings (unchanged — the new files add none) |
| `jest` | 88 suites, 1012 tests, all passing (`publicSurface` 11 → 23; +12 component tests) |
| `pytest scripts/tests` | 566 passed, 3 skipped |
| `check:embargo` | PASS |
| `check:claims` | PASS (77 sources, 20 registered values) |
| `check:bundle` | PASS, 1207.7 kB gzip |
| Derived artifacts | `generated-routes.json`, `content-index.json` and the prerendered `dist/` regenerated by `npm run build:frontend` |

Not run here: the Playwright suites (no browser in this environment). `e2e/critical-paths.spec.ts`
("Editorial front door") was read instead: its six assertions — h1 visible, no Leaflet container on `/`,
author, institution, citation string, "Published alerts" visible, and the "open the live map" CTA —
all still hold, and no suite toggles the language before loading `/`, so the Bengali first-paint path
cannot make them flake.

## 7. A stale date the redesign caught, and the fix

The Hindcast workflow re-ran on this branch (the hardened push step from the same day's CI work,
committing regenerated reports) and bumped `/model-performance`'s review date to 2026-09-19. That
route's `updated` is derived — `build_content_engine.mjs` sets it to the newest report's build date —
while the front door's knowledge-product ledger carried a date someone had typed. The ledger test
failed, which is the test doing its job, and it would have failed on `main` after any hindcast run.

Rather than retype the date, the ledger's date column became a reference: `@review-date:/model-performance`,
resolved against the route table by `scripts/prerender.mjs` for the static HTML and by `usePageSeo.ts`
for the hydrated app (and again after `localiseRoute()`, because the Bengali block brings its own
cells). Both renderers print the route's own date, a reference to an unpublished route fails the build,
and a route with no review date renders as "review date not reported" rather than as a guess. The
front door's ledger can now move only when the page it describes moves.

## 8. Open

1. ~~**Owner Action 6c** — native-speaker review of the Bengali block and the `frontdoor.*` strings.~~
   **Closed 2026-09-19**: the owner read and approved the translation, and the route carries the
   approval with its date and reader. Action 6c stays open for the Phase 5 alert and map strings,
   which this review did not cover.
2. **Owner Action 6a** — a stamped `model_version`. The strip's zero case is honest, but it is a
   description of a publisher that cannot publish; the page gets more useful the day that changes.
3. The static HTML remains English-only. If the front door is ever announced in Bengali to a
   Bengali-first audience, prerendering a `/bn/` variant (or `hreflang` alternates) becomes worth the
   routing work — it is not worth inventing half of it now.
