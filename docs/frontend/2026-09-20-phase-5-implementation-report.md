# Phase 5 implementation report — district, alerts, evidence

**Date:** 2026-09-20  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §14.6 / Section 3  
**Branch:** `arena/01a0bfa7-hazardnet`

## What shipped

District brief, `/alerts`, `/alerts/:id`, and `components/alerts/*` were restyled to the HDS pixel contract. Alert **data** behaviour from `docs/frontend/ALERT_UI.md` is unchanged (source ladder, uncalibrated wording, table as map text alternative, human-review gate).

### District (`DistrictDetailPage.tsx`)

| Contract | Change |
|---|---|
| H1 28 → 32 | `text-[28px] sm:text-[32px]` |
| Dispatch chrome | 8px → 12px metadata |
| Sticky subnav | Opaque white, `z-sticky`, 44h items, **no** `backdrop-blur` |
| Fake 24h sparkline | Removed `telemetryTrendData`; honest “not recorded” copy |
| Compound Vulnerability | Chart series withheld (UX-11). Trend uses stored `severity_score` only |
| Print HTML primary | `Print brief` → `window.print()`; PDF remains secondary |
| Nested `<main>` | Replaced with a `<div>` (App already owns `main`) |
| Horizon / export | 44h nasa-blue actions |

### Alerts

| Surface | Change |
|---|---|
| `AlertsPage` | List **before** map in the DOM; map 240h / 320h desktop via `order`; Refresh/CSV 44h nasa-blue; degraded notes 16 type + 2px orange edge |
| `AlertDetailPage` | Page h1 28/32; HTML print primary next to PDF |
| `AlertCard` | 16 pad, 0 radius, 1px carbon-20, 44h evidence link, ≥12 type |
| `AlertLevelBadge` | min 24h, 12 type (`sm` no longer 11px), colour **and** word |
| `AlertFilters` | 44h controls, 16px mobile select type |
| `DataSourceBanner` | 16 pad / 16 type, 2px orange edge when stale/none |
| `Disclaimer` | 16 / 1.62, carbon-70; not collapsed |
| `DistrictAlertStrip` | 16 pad, 44h links |
| `DistrictAlertTable` | Mobile stacked `<dl>` cards; desktop `<table>` + caption |
| `EvidenceCard` | 16–24 pad, native `<details>` 44h summary for publication trail |
| `PolicyPanel` | 16 body; 0 radius; 2px orange edge on calibration note |

## Verification

```
npx tsc --noEmit -p frontend/tsconfig.json          # clean
./node_modules/.bin/jest --config jest.config.cjs --runInBand \
  frontend/src/components/alerts/__tests__/AlertsSurface.test.tsx \
  frontend/src/components/alerts/__tests__/alertsA11y.test.tsx \
  frontend/src/pages/__tests__/AlertsPage.test.tsx \
  frontend/src/pages/__tests__/DistrictDetailPage.phase5.test.ts
# 4 suites, 61 tests PASS
```

New assertions:

- `AlertsPage` — list heading precedes map heading; Refresh has `min-h-[44px]`.
- `DistrictDetailPage.phase5.test.ts` — no `telemetryTrendData`, no Compound Vulnerability `dataKey`, HTML print present, no glass sticky, no nested `<main>`.

Existing ALERT_UI honesty tests (disclaimer, uncalibrated ≠ probability, table row headers, source banner) still pass.

## Preserved

- HDS tokens and NASA colour roles.
- Stored-forecast lookup (`/upload`) and `/` vs `/live` split.
- Alert fetch/policy/review contract (`lib/alerts.ts`, `ALERT_UI.md`).
- `features/map/` was **not** extracted.
- Zero new photographs.

## Remaining gaps (not this slice)

- Inner-card pixel leftovers on the brief (some 10.5px badges, mixed radii, purple appendix chrome) were **not** a full HDS sweep.
- Full Section 3 **order** is still partial: alert strip remains under the title (Phase 5 first slice). Outlook now precedes the CSV table (follow-up extract, 2026-09-21).
- Dispatch remains a **UI simulation** (timeout + toast); labeled as such. No live SOP wire.
- `AdvisoriesPage` / `StructuredAdvisoryRenderer` / `ThirtyDayTrendChart` / division–hazard editorial grids were out of this slice.

## Follow-up (2026-09-21) — god-file split + outlook-before-CSV

`DistrictDetailPage.tsx` keeps data/hooks only (~450 lines). JSX lives under `frontend/src/components/district/`:

| Module | Role |
|---|---|
| `DistrictBriefActions` | District switcher + print/export |
| `DistrictBriefHeader` | h1, source/date, published-alert strip |
| `DistrictOutlookCard` | Stored outlook hero |
| `DistrictForecastRecords` | 7/15-day CSV table (text equivalent of the chart) |
| `DistrictBriefBody` | Evidence, guidance, history, ops, appendix |
| `DistrictPrintFooter` | Print running footer |
| `districtBriefUtils` | Shared hazard icon / risk colour |

Page render order: actions → header → **outlook** → **forecast records** → body → print footer.

Phase 5 Jest now concatenates `components/district/` so honesty rules cannot hide in extracted files.

## Definition of done (Phase 5)

- [x] No invented 24h sparkline
- [x] Compound Vulnerability withheld from the chart
- [x] HTML print is the primary export on district + evidence
- [x] Alerts list-first, 44h refresh, 16px degraded banner
- [x] Alert components restyled without changing the data contract
- [x] Typecheck + alert/district Jest suites green
- [ ] Full district page pixel sweep (radius/type on every inner card) — remaining
