# Phase 4 remaining — map module extraction (done)

**Date:** 2026-09-21  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §5 Phase 4, §4.2 `features/map/`, §14.5  
**Report:** `docs/frontend/2026-09-21-phase-4-remaining-report.md`

HUD chrome is HDS (44h tools, 12px type, opaque, no glass). This remaining slice was **structure**, not another restyle.

## Contracts (landed)

1. Toolbar, legend, and table bridge live in `frontend/src/components/map/` (plan name `features/map/` — folder not renamed).
2. Summary-first mobile already in `Dashboard` GIS view; Leaflet stays mounted on Map/Table toggle (`hidden` + `invalidateSize`).
3. Map/table parity: captioned `MapDistrictTable` uses `filteredDistricts` and the same `handleSelectDistrict`.
4. Low-bandwidth: optional raster (heatmap, radar) still skipped via `!lowBandwidth`.
5. National Overview composite index not restyled (ADR 0012).

## Out of scope

BrandPanel stats, stored-only HTTP, `/` vs `/live`, new photographs, alert publication.
