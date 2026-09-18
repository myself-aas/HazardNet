# Phase 5 — Alert UI, bilingual surface, offline + low-bandwidth path

**Dates:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the frontend
half of the deployment plan, plus the two items the Phase 4 close-out explicitly deferred
to Phase 5 — *"the UI, map and PDF export are Phase 5"*.

**Result:** every deliverable in the Phase 5 brief is implemented and tested: a public
alert surface driven by the Phase 4 engine, a bilingual (English/Bengali) UI, a
low-bandwidth and offline path, a WCAG 2.2 AA pass on the new surfaces, and the PDF/CSV
export that Phase 4 left open. `jest` 65 suites / 738 tests pass, `pytest` 432 pass,
`npm run build` prerenders 21 routes with a 16-URL sitemap, and `tsc --noEmit` is clean.

---

## 0. What Phase 5 had to fix (from Phase 4's own close-out)

The Phase 4 report ended with six open items. Three are Phase 5's, and they set this
phase's acceptance criteria:

| Open item (Phase 4) | Phase 5 response |
|---|---|
| "the UI, map and PDF export are Phase 5" | `/alerts`, `/alerts/:id`, the map layer, the district strip, the PDF and CSV exports (§2–§4) |
| No calibration map is fitted → every row is `WATCH`, `WARNING` unreachable | The UI *says* this (§3, §5): an uncalibrated score is never rendered as a probability, and a saturated batch is reported as saturation |
| No subscribers / no gateway credentials | Out of scope (owner Action 5); the surface is built to be correct *before* anything is delivered, so the first real send lands on a working page |

And one item that was not on that list but is a project-killer in the deployment plan:
the guide's decision-record note that *"canvas-only frontend"* is a project-killer for
accessibility. §6 covers what was done about it.

---

## 1. Architecture of the surface

```
                   ┌────────────────────────────────────────────┐
   /api/v1/alerts ─┤                                            │
                   │   lib/alerts.ts  ──> hooks/useAlertsData.ts │──> AlertsPage
/data/alerts-      │   (parse, filter, warn, never throw)       │──> AlertDetailPage
latest.json     ───┤                                            │──> DistrictAlertStrip
                   │   lib/legal.ts    §1.7 disclaimer          │
                   └────────────────────────────────────────────┘
```

New files (all untracked before this phase's commit):

| Area | Files |
|---|---|
| Data + logic | `lib/alerts.ts`, `lib/alertLayer.ts`, `lib/bandwidth.ts`, `lib/alertsCsv.ts`, `lib/legal.ts`, `lib/i18n.ts` |
| React bindings | `hooks/useAlertsData.ts`, `hooks/useBandwidthMode.ts`, `hooks/useI18n.ts`, `hooks/useHazardLabel.ts` |
| Components | `components/alerts/{AlertLevelBadge,AlertCard,AlertFilters,DistrictAlertTable,DataSourceBanner,Disclaimer,EvidenceCard,PolicyPanel,LanguageToggle,DistrictAlertStrip}.tsx` |
| Pages | `pages/AlertsPage.tsx`, `pages/AlertDetailPage.tsx` |
| Node tooling | `scripts/build_alert_snapshot.mjs`, `scripts/rehearse_alert_engine.mjs` |
| Data | `frontend/public/data/alerts-latest.json` |

Modified: `App.tsx` (routes), `Navbar.tsx`, `MenuDrawer.tsx`, `BangladeshSvgMap.tsx`
(alert layer props), `useLeafletMap.ts` (basemap substitution), `index.css`
(low-bandwidth rules), `frontend/public/serviceWorker.js` (alert cache strategy — corrected in Phase 6, see below), `content/site-routes.json`
(`/alerts`), `.github/workflows/daily_forecast.yml` (snapshot build step).

---

## 2. `/alerts` — the public alert surface

**Route:** `/alerts` → `pages/AlertsPage.tsx`, lazy-loaded, prerendered, in the sitemap
with `changefreq: hourly` (alerts change more often than the pages around them).

Structure, in DOM order (which is also the reading order — no absolute-positioned layout):

1. **h1 + standfirst** from `site-routes.json`.
2. **`DataSourceBanner`** — `role="status"`, one of *Live API* / *Offline copy* /
   *Offline snapshot* / *Unavailable*, with the data cutoff, the age in hours and an
   amber warning when the age exceeds the freshness SLO. The distinction between the
   service-worker copy and the committed snapshot is deliberate: they have different ages.
3. **Level legend** — `NO_ALERT` / `WATCH` / `WARNING` / `SEVERE` with a swatch *and* the
   level word *and* a one-line meaning. Colour is never the only signal.
4. **Counts** — how many alerts are published, how many district rows were assessed, in an
   `aria-live="polite"` region so a filter change is announced.
5. **`AlertFilters`** — level, hazard, district search, sort. Labels are real
   `<label for>` elements (`alert-filter-level`, `alert-filter-hazard`,
   `alert-filter-search`), not placeholders.
6. **View switch** — *Cards* / *Text list*, `aria-pressed` on both.
7. **The list** — `AlertCard`s, or `DistrictAlertTable` in the list view.
8. **Map** — the alert layer on the existing vector map (§4).
9. **`PolicyPanel`** — the thresholds in force, the policy version
   (`alert-policy/1.0.0`), and the §1.6 human gate, rendered from the API's own
   `policy` payload when it is reachable.
10. **`Disclaimer`** — the §1.7 block, canonical English, plus the emergency numbers.

**Empty-state honesty.** With no published alerts (today's state — see §3) the page renders:

> 74 district rows were assessed and none could be published: §1.6 requires a model
> version before an alert may be published.

Not "all clear". A failed or blocked run and a quiet day are different facts, and the
surface is built so they cannot be confused.

### The map's text alternative

`DistrictAlertTable` is a real `<table>` with a `<caption>`, `scope="row"` headers, a
focusable `overflow-auto` scroll container (WCAG 1.4.10) and `aria-sort` on the sorted
column. It is not a fallback bolted on afterwards: in low-bandwidth mode it is the default
view, and it is what a screen-reader user gets on any device.

---

## 3. Evidence, not vibes: what the UI refuses to say

The Phase 0 ground-truth audit found the old site presenting an uncalibrated softmax as a
probability. The new surface is written so that this cannot come back through a component:

* **`AlertCard` / `EvidenceCard`** render `confidence.uncalibrated` ("relative
  prioritisation signal, **not a probability**") unless the API explicitly marks the row
  `confidence_kind: 'calibrated_probability'`. Tested in both directions.
* **Every alert carries its provenance**: model version, data cutoff, policy version,
  publication record (who/when/how). A row without them renders the gap, it does not hide it.
* **Unpublishable rows are counted, not dropped silently**: `data-source-banner` reports
  `dropped_unpublished` and the payload's `warnings[]` as a degraded-data note.
* **§1.7 is on every surface** — list, detail, district strip, print variant, CSV's last
  column — and `scripts/tests/test_frontend_alert_surface.py` (new, 6 assertions)
  byte-compares the frontend copy with `backend/alerts/policy.js::REQUIRED_DISCLAIMER`
  and with the copy the snapshot builder stamps.

### The number that is currently zero, and why

`scripts/rehearse_alert_engine.mjs` runs the **real** engine (Phase 4's
`assess → lifecycle → store` path) against the committed forecast snapshot with an
in-memory store:

```
rows=74  assessed=74  published=0  blocked=74  skipped=0
levels: WATCH ×74
blocked reason: "§1.6 requires model version before an alert is published"
```

The engine is not broken — the forecast rows genuinely have `provenance.model_version:
null`, and §1.6 forbids publishing without it. The committed
`frontend/public/data/alerts-latest.json` is therefore **empty by construction**, with
`assessed: 74` and `dropped_unpublished: 74` so the page can explain itself. The
alternative — stamping a version to make the page show alerts — would have been a lie
about provenance, which is the most damaging kind of lie this product can tell.

---

## 4. The map: an alert layer that is not canvas-only

`BangladeshSvgMap` gained four optional props — `alertLevels`, `alertLevelLabels`,
`lowBandwidth`, `legendSlot` — and `lib/alertLayer.ts` builds the layer:

* **keyed by district slug**, containing **only** districts with a published alert; a
  district with no alert keeps its baseline severity colour, and the page says in words
  that *a baseline colour is not an alert*;
* **several alerts in one district collapse to the most serious level**, order-independent
  (tested both ways round);
* **the accessible name states both facts**:
  `"Sunamganj District, Risk: High, Hazard: Flash Flood, Severity: 94%, HazardNet alert: Watch"`
  — the aria-label is assembled step by step, which is exactly the bug the first version
  of this test caught (a comma expression silently dropped every part but the level);
* **`lowBandwidth` skips the pulse/ping decorations** rather than slowing them down.

The static map remains what it always was: real `<SVG>` paths with `role="button"`
markers, keyboard-activatable, with the district table as its text alternative. Nothing
about the alert layer required a canvas.

---

## 5. Bilingual UI (English / Bengali)

`lib/i18n.ts` holds both dictionaries (**137 keys each, 274 strings**; a test asserts
neither dictionary has a missing or orphan key), a `t()` that
falls back to English rather than to a key, and a store that fires listeners.
`useI18n()` binds it to React and writes `<html lang>` on every change
(`en` / `bn-BD`).

What is translated: the whole alert surface, the map legends and controls, the level
names, the confidence caveat, the low-bandwidth controls, the emergency numbers, the
deadline wording. Numbers and dates are **localised, not reformatted** —
`৭৪`, `২৩ সেপ্টেম্বর ২০২৬`, never `9/18/2026`, which is ambiguous in both languages.
Hazard *class* names come from `hooks/useHazardLabel.ts` and are mapped from the model's
eight classes; an unrecognised class is shown verbatim rather than guessed (the
hazard-vocabulary trap from Phase 4, closed again at this layer).

**Scope limit, stated plainly:** the long-form pages (site-routes sections, blog articles)
are English-only. The alert and map surfaces — what a farmer or duty officer reads under
time pressure — are translated. The rest is Phase 8 content work, recorded in
`docs/frontend/ALERT_UI.md` §5.

---

## 6. Low bandwidth and offline

**Decision order** (`lib/bandwidth.ts`, first match wins; an explicit user choice beats
every signal): user toggle → Data Saver → offline → `slow-2g/2g` → `deviceMemory ≤ 2 GB` →
`hardwareConcurrency ≤ 4` (unless reduced motion was explicitly declined) → default.
Unreadable signals are *unknown*, never *slow* (`deviceMemory: 0` is ignored — it means
"not reported").

What it changes:

| Lever | Full | Low bandwidth |
|---|---|---|
| Basemap | Esri imagery / clarity / shaded relief | OpenStreetMap vector raster (`effectiveMapLayer`) |
| Animations | glow circles, ping rings, transitions | none (`index.css` collapses animation/transition/backdrop-filter under `html[data-low-bandwidth='true']`) |
| Default view on `/alerts` | cards | the text table |
| Data fetch | API first, snapshot fallback | `offlineFirst` — the snapshot is read immediately, the API request is skipped rather than waiting out a 6 s timeout |

**Offline:** `frontend/public/serviceWorker.js` registers a dedicated strategy for `/api/v1/alerts` and
`/data/alerts-latest.json` — network-first with a **5 s** timeout, then a labelled cache
response (`X-HazardNet-Stale: 1`, `X-HazardNet-Cached-At`), which `lib/alerts.ts` surfaces
as `source: 'cache'`. The generic shell cache is cache-first; without this rule an
install-day payload could be served as today's alerts.

---

## 7. Accessibility — and the defect the automated pass found

`jest-axe` (new dev dependency) runs axe-core over every new component **in both
languages** — 17 assertions. It failed on the first run, on a real defect:

> `landmark-complementary-is-top-level`: the §1.7 disclaimer was an `<aside>`
> (a complementary landmark) nested inside the evidence card's region.

A nested complementary landmark is not exposed as a top-level landmark, so a
screen-reader user navigating by landmarks would not have found "Disclaimer" where the
page implies it lives. `Disclaimer` now uses `role="note"` with an accessible name —
valid, and the more accurate role for supporting text.

`docs/frontend/ACCESSIBILITY.md` maps each WCAG 2.2 AA criterion to how it is met and
what verifies it, lists the measured contrast ratios for the four level pills
(12.6–15.4 : 1), and — importantly — **lists what the automated pass cannot cover**:
compiled-CSS contrast, a screen-reader walk-through on a real build, the rest of the site,
native-speaker review of the Bengali copy, and PDF/UA tagging. Those are owner actions,
not claims of completion.

---

## 8. Exports

* **PDF** — `/alerts/:id` renders `EvidenceCard` (id `hn-evidence-card`) and exports it
  through the existing shared `utils/pdfExport.ts` (jsPDF + html2canvas-pro). The card is
  the audit trail: model score *and* independent physics score, divergence, agreement,
  the trigger rules that fired, the dataset/policy versions, the publication record, the
  alert key. The print variant carries a compact §1.7 footer so a printed sheet is still a
  compliant surface. (Phases 4's close-out item "PDF export is Phase 5" is closed here.)
* **CSV** — `lib/alertsCsv.ts`: UTF-8 **BOM** (Excel-on-Windows would otherwise mojibake
  Bengali district names), RFC 4180 quoting, values copied **without rounding** — a
  spreadsheet is where a hazard number gets quoted. The last column is the §1.7
  disclaimer, matching the backend's CSV.

---

## 8b. The CI wiring bug, found while closing the phase

The step that was supposed to keep the committed snapshot fresh would never have published
an alert, and its smoke test was green the whole time:

```
daily_forecast.yml → POST /api/v1/alerts/run  {"notify": true}
backend/routes/alerts.js → strips batch.alerts unless include_alerts is set
scripts/build_alert_snapshot.mjs → only understood a top-level alerts[]
                                → wrote an empty snapshot, every night, silently
```

The smoke test passed because its fixture (`alert-run.sample.json`) uses the shape the
builder wanted, not the shape the engine sends — a test proving the wrong thing, which is
the more expensive kind of bug.

Fixed in three layers, each of which would have caught it alone:

1. **The engine now says what it published.** `runAlertEngine` returns
   `published_alerts[]`. It has to: `batch.alerts` are the *pre-persistence* assessments
   (`DRAFT` until stored), so a consumer filtering them for `PUBLISHED` finds nothing even
   on a run that published — the run report is the only layer that knows the final state.
2. **The builder accepts all three producer shapes** (`published_alerts`, `alerts`,
   `batch.alerts`, in that precedence) and **exits 2 on a payload it cannot read**. An
   unreadable payload is an integration error; it must not be indistinguishable from a
   quiet day.
3. **The workflow asks for the rows and checks it got them** (`include_alerts: true`, plus
   a `jq -e` gate that fails the job when the report carries no alert rows), and `ci.yml`
   now smokes the stripped-report refusal and the engine-shape read.

The bug also exposed a wording trap the fix had to solve. With the published list empty,
`dropped_unpublished` is legitimately `0` — so the page, which keyed its empty-state copy
off that number, silently lost the sentence *"74 district rows were assessed and none
could be published"* and fell back to a flat "no alerts are published". Two counters now
exist and are documented: `dropped_unpublished` (list-local) and `not_published` (the
engine's blocked + pending-review + held tally, absent when the payload cannot know it).
The page prefers the second, and a regression test renders exactly the post-fix snapshot
shape.

Tests: `__tests__/alertSnapshot.test.js` (shape precedence, the refusal, the counters),
`__tests__/alertReplay.test.js` (a stamped in-memory run publishes 74 rows and its run
report builds a 74-alert snapshot — the in-memory stamp is a test double, and a companion
test asserts the committed snapshot is still untouched).

## 9. Pipeline wiring

`daily_forecast.yml` gained a step after the publish step:

```
POST /api/v1/alerts/run            → alert-run.json (artifact, uploaded for inspection)
node scripts/build_alert_snapshot.mjs --in alert-run.json
git add frontend/public/data/alerts-latest.json   (conditional: only if it changed)
```

and the job summary prints the level counts. The builder (`build_alert_snapshot.mjs`):
filters to `PUBLISHED`, stamps the canonical disclaimer on any row missing it, carries
`generated_at`/policy/counts/provenance through untouched, and **refuses to overwrite a
non-empty snapshot with an empty one** (exit 3) unless `--allow-empty` is passed — a failed
engine run must never read as "no alerts today". Exit 2 is a missing input.

Because the workflow needs `BACKEND_API_URL` + `HAZARDNET_API_KEY` to reach the engine, the
step logs a notice and skips while they are unset, so the workflow stays green
(owner Action 5e). `npm run alerts:rehearse` / `npm run alerts:snapshot` are the local
equivalents and need no credentials.

---

## 10. Verification

| Check | Command | Result |
|---|---|---|
| Unit + component tests | `./node_modules/.bin/jest` | **65 suites / 738 tests pass** (Phase 4 baseline: 54 / 583) |
| Type check | `npx tsc -p frontend/tsconfig.json --noEmit` | clean |
| Python guard suites | `/tmp/pv2/bin/python -m pytest scripts/tests -q` | **432 passed** (426 baseline; +`test_frontend_alert_surface.py` 6, +1 README horizon guard) |
| Production build | `cd frontend && npm run build` | green: 21 routes prerendered, `sitemap.xml` 16 URLs, `/alerts` present with title/canonical/h1 |
| Cross-surface disclaimer parity | `pytest scripts/tests/test_frontend_alert_surface.py` | 6 passed |
| Engine replay on committed data | `npm run alerts:rehearse` | 74 assessed / 0 published / 74 blocked (§1.6, no model version) |
| Snapshot builder refuses an unreadable payload | `node scripts/build_alert_snapshot.mjs --in unreadable.json` | exit 2, nothing written |

New test suites (11, +155 tests): `lib/__tests__/{i18n,alerts,bandwidth,alertLayer,alertsCsv}.test.ts`,
`components/alerts/__tests__/{AlertsSurface,alertsA11y}.test.tsx`,
`components/__tests__/BangladeshSvgMap.alertLayer.test.tsx`,
`pages/__tests__/AlertsPage.test.tsx`, `__tests__/{alertSnapshot,alertReplay}.test.js`,
plus `scripts/tests/test_frontend_alert_surface.py`.

---

## 11. Findings raised by this phase

1. **README was advertising an unimplemented product.** The pitch claimed 10/20/30-day
   horizons and 507 ADM3 units (ADR 0005) as shipped fact; the ingest contract, the store,
   the API and the site run **64 districts × 7/15 days**. Corrected, and a new guard
   (`test_readme_does_not_advertise_unshipped_horizons`) now fails the build when the
   README advertises a horizon the code cannot produce.
2. **The §1.7 disclaimer existed in three places with no test tying them together.** Now
   one string, three consumers, one cross-surface test.
3. **The nested-landmark accessibility defect** (§7).
4. **A comma-expression bug in the map's aria-label** silently reduced the accessible name
   to the bare level code; caught by the new map test.
5. **The alert-snapshot CI wiring could never have published anything** (§8b), and the
   committed ingest file has no per-row provenance, so §1.6 blocks every row today —
   upstream of the UI, recorded in `docs/codebase/CONCERNS.md` and owner Action 6a.
6. **Saturation is visible, not silent.** Every row landing on `WATCH` is what an
   uncalibrated model + conservative thresholds produce; the page reports it as
   saturation and the policy panel shows the thresholds behind it.

---

## 12. Open items after Phase 5

| # | Item | Owner | Where |
|---|---|---|---|
| 1 | Stamp `model_version` so anything can publish | Owner | Action 6a |
| 2 | Decide whether `/alerts` stays publicly listed while empty | Owner | Action 6b |
| 3 | Native-speaker review of the Bengali copy | Owner | Action 6c |
| 4 | Screen-reader + real-2G-device pass | Owner | Action 6d |
| 5 | Fit a calibration map (unblocks `WARNING`, makes confidence a probability) | Phase 3/9 | Action 4a |
| 6 | Load the event archive (POD/FAR/CSI, hindcast) | Phase 9 | Action 4a |
| 7 | Bengali for the long-form content pages | Phase 8 | `ALERT_UI.md` §5 |
| 8 | Accessibility pass on the rest of the site | Phase 5 follow-up | `ACCESSIBILITY.md` §4 |
| 9 | Alert snapshot CI step has never run end-to-end against a live engine | Owner | Action 5e |

This phase changed no thresholds, no model artefacts and no published numbers. The site
still says what is true: a research decision-support tool, not an official warning
service.

---

## 9. Correction (2026-09-18, Phase 6)

The offline alert strategy described in §5 was originally written into
`frontend/src/serviceWorker.ts`. Nothing imports that file and the app registers
`/serviceWorker.js`, which Vite copies verbatim from `frontend/public/` — so the strategy
**did not ship** and the delivered worker had no alert handling at all. Phase 6 moved the
network-first alert cache, the `X-HazardNet-Stale` labelling and the cacheability rule into
`frontend/public/serviceWorker.js`, deleted the unshipped duplicate, and replaced the
old test with `__tests__/serviceWorker.test.js`, which evaluates the shipped file and drives
its real `fetch` handler (9 tests, including "the built worker equals the source").
