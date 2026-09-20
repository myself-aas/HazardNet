# Phase 4 remaining — extraction + map/table parity

**Date:** 2026-09-21  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §5 Phase 4, §4.2, §14.5  
**Slice note:** `docs/frontend/2026-09-20-phase-4-remaining.md`

## What landed

Structure only (not a National Overview restyle). The live-map HUD is no longer one 2.6k-line inline block:

| Module | Role |
| --- | --- |
| `frontend/src/components/map/MapToolbar.tsx` | Layers, forecast horizon, hazards, Map/Table toggle. 44px chips, opaque white. |
| `frontend/src/components/map/MapDistrictTable.tsx` | Captioned district table; same `filteredDistricts` + `handleSelectDistrict`; risk as a word. |
| `frontend/src/components/map/MapLegend.tsx` | Radar reflectivity legend (colour + words, 44×44 dismiss). |
| `frontend/src/components/MapLegendUI.tsx` | Re-export of `MapLegend` as `MapLegendUI`. |
| `frontend/src/components/map/DistrictForecastCard.tsx` | Already extracted; unchanged this slice. |

`LiveMapView` hosts those modules. Table mode keeps the Leaflet container mounted (`hidden`, not unmount) and calls `invalidateSize` when returning to map mode.

## Contracts kept

- Low-bandwidth: `isRadarActive && !lowBandwidth` (heatmap already gated the same way).
- Stored-only forecast copy in the toolbar (`Stored n/64` / `Baseline`).
- Overlay chip `text-[11px]` stays off this HUD (not introduced in the extracted modules).
- BrandPanel 64 / `<100ms` not touched.
- National Overview composite index not restyled (ADR 0012).

## Verification

```
npx tsc -p frontend/tsconfig.json --noEmit
./node_modules/.bin/jest --config jest.config.cjs --runInBand \
  frontend/src/lib/__tests__/phase4HudContracts.test.ts \
  frontend/src/components/map/__tests__/MapDistrictTable.test.tsx \
  frontend/src/components/map/__tests__/MapToolbar.test.tsx \
  frontend/src/components/map/__tests__/MapLegend.test.tsx \
  frontend/src/components/map/__tests__/DistrictForecastCard.test.tsx
npm run check:ux-release
```

- `tsc`: no errors
- Jest: 5 suites, 20 tests passed
- `check:ux-release`: PASS (embargo, claims, Phase 7, stored-only lookup, `/` vs `/live`, no FrontDoor photos)

## Owner still (not this slice)

NVDA/TalkBack, production CWV, native-speaker BN, physical 400% zoom, preview sign-off.
