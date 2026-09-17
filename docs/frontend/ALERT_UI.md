# The alert surface — frontend contract (Phase 5)

Status: **implemented 2026-09-18** (Phase 5). Covers `/alerts`, `/alerts/:id`, the
alert strip on `/district/:id`, the alert layer on the vector map, the bilingual UI, the
low-bandwidth/offline path and the PDF/CSV exports.

This document is the contract the code is written against. Where it says "must", there is
a test that fails when the rule is broken; the test file is named next to each rule.

---

## 1. Where alert data comes from

```
        ┌──────────────────────────────┐
        │ /api/v1/alerts (live API)    │  network-first, 5 s timeout in the SW
        └───────────────┬──────────────┘
                        │ fails / offline / Data Saver
                        ▼
        ┌──────────────────────────────┐
        │ /data/alerts-latest.json     │  committed snapshot (schema hazardnet-alerts/v1)
        └───────────────┬──────────────┘
                        │ fails
                        ▼
        ┌──────────────────────────────┐
        │ source: 'none'               │  the page says "unavailable" and still renders
        └──────────────────────────────┘
```

`frontend/src/lib/alerts.ts` implements the ladder and **never throws**. It returns a
`source` that every surface renders honestly:

| `source` | Meaning | Banner copy |
|---|---|---|
| `api` | Live response from `/api/v1/alerts` | "Live API" + data cutoff + age |
| `cache` | The service worker answered from its offline cache (`X-HazardNet-Stale: 1`) | "Offline copy" + when it was fetched |
| `snapshot` | The file committed with this deployment | "Offline snapshot" + generation date |
| `none` | Nothing reachable | "Unavailable" + the error |

The distinction between `cache` and `snapshot` is deliberate: they have completely
different ages, and a page that called both "offline data" would be hiding which copy the
reader is holding.

Tests: `frontend/src/lib/__tests__/alerts.test.ts` ("prefers the live API…", "falls back to
the snapshot…", "downgrades a service-worker-labelled stale response"), 
`frontend/src/components/alerts/__tests__/AlertsSurface.test.tsx` (banner copy).

### What is never rendered

* **Rows that are not `PUBLISHED`.** The client re-filters even though the snapshot
  builder already filtered: a public artefact must not depend on one of two filters
  working. The number of dropped rows is reported to the user rather than swallowed.
* **An unknown level.** `parseAlertsPayload` refuses the row and records a warning;
  it never coerces `"EMERGENCY"` into a colour.
* **A number without its provenance.** Every card shows the model version, the data
  cutoff and the policy version behind the alert.

### §1.7 disclaimer

`frontend/src/lib/legal.ts::ALERT_DISCLAIMER` is the single copy used by the list, the
detail page, the district strip and the PDF. `scripts/tests/test_frontend_alert_surface.py`
asserts it is identical to `backend/alerts/policy.js::REQUIRED_DISCLAIMER` (which
`__tests__/alerts/policy.test.js` pins to the §1.7 block in `docs/PRODUCT_SPEC.md`) and to
the copy in `scripts/build_alert_snapshot.mjs`. Three surfaces, one string, one test that
fails when they drift.

When the API supplies its own `disclaimer` field, it is used verbatim — the API is the
authority for the alerts it published — and the canonical text is the fallback.

---

## 2. Confidence is not a probability

Every alert carries a model score (`confidence`). No calibration map is fitted, so the
score is a softmax output used as a relative priority signal, and the UI must say so.

The rule, implemented in `AlertCard` and `EvidenceCard`:

* render `alerts.confidence.uncalibrated*` **unless**
  `evidence.model.confidence_published === 'calibrated_probability'` (or the row-level
  `confidence_kind` says the same);
* only then render probability wording.

Tests: `AlertsSurface.test.tsx` ("says out loud that an uncalibrated score is not a
probability", "switches to probability wording only when the API says it is calibrated").

---

## 3. Routes and layout

| Route | Component | Notes |
|---|---|---|
| `/alerts` | `pages/AlertsPage.tsx` | Public, prerendered, in the sitemap (`changefreq: hourly`) |
| `/alerts/:id` | `pages/AlertDetailPage.tsx` | The evidence card; the id is the engine's own alert id, so an SMS/Telegram link lands on the exact card |
| `/district/:id` | `pages/DistrictDetailPage.tsx` | `DistrictAlertStrip` shows this district's alert above the forecast cards |
| `/` (home) | `components/Navbar.tsx` | "Alerts" is a plain link, not a dropdown menu |

`site-routes.json` holds the `/alerts` metadata (title, description, h1, standfirst,
three sections). It is written by hand, read by `usePageSeo`, `prerender.mjs`, the sitemap
and the tests — so the static HTML, the client-side navigation and the sitemap cannot
disagree.

The route copy is guarded by `scripts/tests/test_frontend_alert_surface.py`
("the alerts route copy does not overclaim"): it may not promise a probability, and it
must keep saying that a duty officer reviews anything above a watch.

---

## 4. The evidence card and the PDF

`components/alerts/EvidenceCard.tsx` renders the audit trail (model severity, independent
physics severity, divergence, agreement, publication record, alert key) and is the PDF
export target: `id="hn-evidence-card"`, exported through the shared
`utils/pdfExport.ts` (jsPDF + html2canvas-pro). No canvas-only charts, no `position:
fixed` decoration — html2canvas rasterises what a person can see.

The printed variant renders the compact §1.7 footer (`variant="print"`), so a sheet on a
notice board carries the disclaimer even without the on-screen block.
Tests: `AlertsSurface.test.tsx` ("keeps the disclaimer in the print variant").

The CSV export (`lib/alertsCsv.ts`) writes a UTF-8 BOM (Excel on Windows otherwise
mojibakes Bengali district names) and RFC 4180 escaping, and copies values without
rounding: the file is evidence, and a spreadsheet is where a hazard number gets quoted.
Tests: `frontend/src/lib/__tests__/alertsCsv.test.ts`.

---

## 5. Bilingual UI

`lib/i18n.ts` (137 keys per language — 274 strings — plus the store) and
`hooks/useI18n.ts` (React binding). `components/alerts/LanguageToggle.tsx` is the control.

Rules:

1. **`<html lang>` follows the language.** Screen readers pick a voice from it.
2. **A missing translation falls back to English, never to the key.** Both dictionaries
   are asserted complete, so this is a safety net rather than a state the UI reaches.
3. **Numbers and dates follow the language**: Bengali digits (`৭৪`), long-form dates
   ("২৩ সেপ্টেম্বর ২০২৬") — never `9/18/2026`, which is ambiguous in both languages.
4. **Hazard class names are data, not prose.** `hooks/useHazardLabel.ts` maps the model's
   eight classes to Bengali; an unmapped class is shown verbatim rather than guessed.
5. **English text inside a Bengali page is marked `lang="en"`** (the §1.7 disclaimer is
   canonical English).

Tests: `frontend/src/lib/__tests__/i18n.test.ts`, `AlertsSurface.test.tsx`.

**Scope limit, stated rather than hidden:** the long-form content pages
(`site-routes.json` sections, blog articles) remain English-only. The alert and map
surfaces — the ones a farmer or a duty officer reads under time pressure — are
translated. Translating the reference pages is Phase 8 content work.

---

## 6. Low-bandwidth and offline

`lib/bandwidth.ts` decides, `hooks/useBandwidthMode.ts` wires it, `index.css` honours it.

Decision order (first match wins; an explicit user choice wins over everything):

| Signal | Mode | Reason code |
|---|---|---|
| user toggle on / off | chosen | `user-enabled` / `user-disabled` |
| `navigator.connection.saveData` | low | `save-data` |
| offline (`navigator.onLine === false`) | low | `offline` |
| `effectiveType` `slow-2g`/`2g` | low | `slow-connection` |
| `deviceMemory ≤ 2` GB | low | `low-memory` |
| `hardwareConcurrency ≤ 4` and motion not requested | low | `few-cores` |
| otherwise | full | `default` |

Unreadable signals are treated as *unknown*, never as slow (`deviceMemory: 0` is ignored).

What low-bandwidth mode changes:

* **Basemap**: `useLeafletMap` substitutes the street basemap for the Esri imagery layers
  (`effectiveMapLayer`). Raster imagery per tile-per-zoom-level is the heaviest asset the
  dashboard loads and the likeliest thing to leave a grey grid on a 2G connection.
* **Animations**: `html[data-low-bandwidth="true"]` collapses animations, transitions and
  backdrop filters in CSS, so components that never read the hook are still cheap. The
  vector map additionally skips its glow circles and ping rings.
* **Default view**: `/alerts` opens on the text table, which is the cheapest view that
  still answers "is my district at risk".
* **Data**: `loadAlerts({ offlineFirst: true })` skips the API request entirely rather
  than waiting up to 6 s for a timeout.

The service worker (`serviceWorker.ts`) gives `/api/v1/alerts` and
`/data/alerts-latest.json` their own **network-first** strategy with a 5 s timeout and a
labelled cache fallback (`X-HazardNet-Stale: 1`). The generic shell cache is cache-first
and would otherwise serve an install-day payload as if it were today's forecast.

Tests: `frontend/src/lib/__tests__/bandwidth.test.ts`,
`frontend/src/pages/__tests__/AlertsPage.test.tsx` ("opens on the text table…",
"turns the mode on by itself on a low-end device").

---

## 7. The map layer and its text alternative

`components/BangladeshSvgMap.tsx` gained three optional props: `alertLevels`,
`alertLevelLabels`, `lowBandwidth` (plus `legendSlot` for the shared legend).

* The layer (`lib/alertLayer.ts::buildAlertLevelLayer`) is keyed by district **slug** and
  contains **only** districts with a published alert. A district with no alert keeps the
  static baseline colour, and the page says so — a baseline colour is not an alert.
* Several alerts in one district collapse to the **most serious** level, independent of
  arrival order.
* Each marker's accessible name states the baseline risk *and* the published alert level.
* `components/alerts/DistrictAlertTable.tsx` is the map's text alternative: a real
  `<table>` with a `<caption>` and `scope="row"` headers, sortable with `aria-sort`, and
  the primary view in low-bandwidth mode.

Tests: `frontend/src/components/__tests__/BangladeshSvgMap.alertLayer.test.tsx`,
`frontend/src/lib/__tests__/alertLayer.test.ts`.

---

## 8. Snapshot generation

```
.github/workflows/daily_forecast.yml
  ├─ POST /api/v1/alerts/run                → alert-run.json (engine output)
  ├─ node scripts/build_alert_snapshot.mjs  → frontend/public/data/alerts-latest.json
  └─ git commit (same commit as the forecast data)
```

`scripts/build_alert_snapshot.mjs` rules:

1. only `PUBLISHED` rows survive (same filter as the client);
2. the §1.7 disclaimer is stamped on any row missing it;
3. `generated_at`, the policy copy, the counts and each row's provenance are carried
   through untouched;
4. it **refuses to replace a non-empty snapshot with an empty one** (exit 3) unless
   `--allow-empty` is passed — a failed engine run must not read as "all clear".

`scripts/rehearse_alert_engine.mjs` runs the **real** engine offline against the committed
forecast snapshot with an in-memory store. It is how CI and a developer machine exercise
the alert path without a hosted backend or Firestore, and it deliberately does not invent
provenance: with today's snapshot (`provenance.model_version: null`) all 74 rows come out
`publication_blocked` — §1.6 requires a model version — and the script says so.

```bash
npm run alerts:rehearse   # /tmp/alert-run.json
npm run alerts:snapshot   # rebuild frontend/public/data/alerts-latest.json
```

Tests: `__tests__/alertSnapshot.test.js`, `__tests__/alertReplay.test.js`.

---

## 9. Failure modes this surface is designed for

| Failure | What the user sees |
|---|---|
| API 500, snapshot present | "Offline snapshot, generated <date>" + amber staleness if > 48 h |
| API + snapshot unreachable | "Alert data could not be loaded" + the error string + the last forecast the device has |
| Engine ran, nothing publishable (no model version) | "N district rows were assessed and none could be published: §1.6 requires a model version…" — never "all clear" |
| Browser offline with a cached payload | "Offline copy … may be older than the live service" |
| Payload contains DRAFT rows | They are dropped, and the dropped count is shown as a degraded-data note |
| Payload carries no disclaimer | Canonical text is rendered and the payload is flagged |
| Bengali selected, string missing | English string (and the test suite fails before that ships) |
