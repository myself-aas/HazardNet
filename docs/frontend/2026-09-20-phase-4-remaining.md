# Phase 4 remaining — map module extraction (started)

**Date:** 2026-09-21  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §5 Phase 4, §4.2 `features/map/`, §14.5  
**Depends on:** leftover HUD restyle landed.

HUD chrome is now HDS (44h tools, 12px type, opaque, no glass). This remaining slice is **structure**, not another restyle.

## Remaining contracts

1. Extract toolbar, legend, selected-district summary, and table bridge out of `LiveMapView.tsx` into `frontend/src/components/map/` (plan name `features/map/` — do not move modules only to rename the folder).
2. Summary-first mobile already in `Dashboard` GIS view; keep Leaflet mounted on selection.
3. Map/table parity: a non-map district list equivalent for the same selection (RegionSelector exists; wire captioned table as the text alternative).
4. Low-bandwidth: optional raster (heatmap, radar) already skipped in `useLeafletMap` / LiveMapView; keep that gate.
5. Do **not** restyle National Overview composite index (ADR 0012).

## This start

- Source contract: `frontend/src/lib/__tests__/phase4HudContracts.test.ts` — HUD must not reintroduce `backdrop-blur` or sub-12px HUD labels in `LiveMapView.tsx`.
- Extraction of toolbar JSX is the next coding step (not this start commit if it would mix with the leftover restyle).

## Out of scope

BrandPanel stats, stored-only HTTP, `/` vs `/live`, new photographs, alert publication.
