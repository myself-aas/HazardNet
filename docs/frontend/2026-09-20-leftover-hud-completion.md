# Leftover HUD / Phases 1–7 restyle — landed

**Date:** 2026-09-21  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §13–14.5 (console/map), plus uncommitted Phases 1–7 files.  
**Branch:** `arena/01a0bfa7-hazardnet`

This slice **commits** the working-tree restyle that reports for Phases 1–7 described but had not landed, and finishes leftover map HUD anti-patterns (10–11px type, glass, large radii, sub-44 closes).

## HUD (Phase 4 leftover)

| File | Change |
|---|---|
| `LiveMapView.tsx` | Opaque white chrome; toolbar/search/horizon 44h; 12px type floor; 44×44 closes; no `backdrop-blur` / `rounded-2xl` HUD; `z-[var(--z-sticky)]`; radar optional tiles still gated by `lowBandwidth` |
| `Dashboard.tsx` | Console tabs already 44h underline; leftover saved/settings cards square + 12px metadata; `/live` overlay chip stays 11px (explicit, so global `h1` cannot blow up the map) |
| `MapLegendUI.tsx` / `DistrictForecastCard.tsx` / `Map.tsx` / `leaflet-transparent.css` | Opaque HDS popups, 0 radius |
| `ChatBot.tsx` / `CommandPalette.tsx` / `SavedAssessmentsModalUI.tsx` | No glass/scale; 12px floor; 44h controls |

## Also landed (uncommitted Phases 1–7)

Lookup state (`forecastView.ts`, typed `storedPrediction`, `usePrediction`), shared `navigation.ts`, shell (`App.tsx`, `Navbar`, `MenuDrawer`), alerts/district, front door/auth/archive, index.css tokens. BrandPanel copy **not** rewritten (`64`, `<100ms`). National Overview composite **not** restyled.

## Verification

```
npx tsc --noEmit -p frontend/tsconfig.json
./node_modules/.bin/jest --config jest.config.cjs --runInBand \
  frontend/src/components/auth/__tests__/BrandPanel.test.tsx \
  frontend/src/components/__tests__/NavbarOverlayLayering.test.tsx \
  frontend/src/components/__tests__/StoredForecastPanel.test.tsx \
  frontend/src/components/map/__tests__/DistrictForecastCard.test.tsx \
  frontend/src/lib/__tests__/storedPrediction.test.ts \
  frontend/src/lib/__tests__/forecastView.test.ts \
  frontend/src/lib/__tests__/navigation.test.ts \
  frontend/src/pages/__tests__/AlertsPage.test.tsx \
  frontend/src/pages/__tests__/DistrictDetailPage.phase5.test.ts \
  frontend/src/pages/__tests__/Phase6Surface.test.ts \
  frontend/src/pages/__tests__/UploadPage.test.tsx \
  frontend/src/lib/__tests__/phase8Contracts.test.ts
# 12 suites / 81 tests PASS
```

## Integrity held

Stored-only forecasts; `/` vs `/live`; no new photos; alert review unchanged; BrandPanel pins; National Overview composite left as ADR 0012.

## Next (Phase 4 remaining / UX-MAP)

`features/map/` extraction and map/table parity shipped separately. `DistrictDetailPage` god-file split + outlook-before-CSV shipped 2026-09-21 (`frontend/src/components/district/`). See `docs/frontend/2026-09-20-phase-5-implementation-report.md`.
