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

- `DistrictDetailPage.tsx` is still a ~2.6k-line god file. Many inner cards keep `rounded-2xl/3xl`, 11px captions, purple wells, simulated dispatch, and print-footer 8px. Full Section 3 **order** (h1 → horizon → source/date → outlook → alert → guidance → evidence → charts → export) is only partially applied: the alert strip sits under the title, but the CSV table still precedes the outlook body.
- `AdvisoriesPage` / `StructuredAdvisoryRenderer` / `ThirtyDayTrendChart` / division–hazard editorial grids were out of this slice.
- Phase 6 (front door, archive, auth) is next.

## Definition of done (Phase 5)

- [x] No invented 24h sparkline
- [x] Compound Vulnerability withheld from the chart
- [x] HTML print is the primary export on district + evidence
- [x] Alerts list-first, 44h refresh, 16px degraded banner
- [x] Alert components restyled without changing the data contract
- [x] Typecheck + alert/district Jest suites green
- [ ] Full district page pixel sweep (radius/type on every inner card) — remaining
