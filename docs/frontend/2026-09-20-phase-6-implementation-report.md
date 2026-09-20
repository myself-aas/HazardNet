# Phase 5 leftovers + Phase 6 implementation report

**Date:** 2026-09-20  
**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §14.6 leftovers, then §14.3 / §14.7 / §14.8 (Phase 6)  
**Branch:** `arena/01a0bfa7-hazardnet`

## Phase 5 leftover — district inner cards

`DistrictDetailPage.tsx` inner surfaces were still using `rounded-2xl/3xl`, `text-[8–11px]`, purple/rose/emerald wells, decorative blur, and card shadows.

| Contract | Change |
|---|---|
| Type floor | All `text-[8px]`–`text-[11px]` → `text-xs` (12px) |
| Surface radius | `rounded-3xl/2xl/xl/lg` stripped from cards; status dots keep `rounded-full` |
| Colour wells | Purple/rose/emerald/sky wells → carbon + NASA roles |
| Glass | Decorative `blur-3xl` blob removed |
| Print footer | 8px → 12px metadata floor |

Honesty rules from Phase 5 (no fake sparkline, Compound Vulnerability withheld, HTML print primary, opaque sticky, one `<main>`) are unchanged.

## Phase 6 — front door, archive, auth

### Front door (`FrontDoor`, `LiveStatusStrip`, `RunVisual`)

- Eyebrows 12px (`tracking-[0.025em]`), no 10px type.
- Hero pad 24/32; page rhythm 32/48.
- H1 28 → 32 → 48; standfirst 16/1.62.
- Primary CTA: 44h, **nasa-red-shade + white**.
- Secondary methodology: 2px nasa-blue.
- Section body 16/1.62; FAQ summaries 44h.
- Strip zero-case copy 16/1.62 (safety-critical).
- RunVisual artifact rows 16; honesty notes 12/1.62.
- **No new photographs.** `RunVisual` remains the hero.

### Auth (`AuthLayout`, `BrandPanel`, login/signup/recovery pages)

- AuthLayout: looping gradient shimmer **removed**; static 2px nasa-red rule; card radius 0, no shadow; h1 28/32; subtitle 16; back link 44h.
- App still does not wrap auth in a second `<main>` (Phase 3).
- Inputs: 48h, 16px, 2px radius.
- Submit: 44h, nasa-red-shade + **white** (not `text-carbon-black` on nasa-red).
- Errors: 14–16, 0 radius, 2px left nasa-red.
- `autoFocus` only when `pointer: fine`.
- Password toggle 44×44.
- Social buttons 44h, 16 type.
- BrandPanel: aurora/floating glyphs removed; typographic panel; stats/carousel copy preserved for existing tests.

### Archive, legal, 404

- `HazardArchivePage`: 0 radius, no sky wells, 12px chart ticks, h1 28/32.
- Privacy/Terms: 16/1.62, 65ch measure, 0 radius, nasa-blue-shade links. Navbar remains (back path exists).
- `NotFoundPage`: h1 28, body 16, two 44h links (home, live).

## Verification

```
npx tsc --noEmit -p frontend/tsconfig.json
./node_modules/.bin/jest --config jest.config.cjs --runInBand \
  frontend/src/pages/__tests__/DistrictDetailPage.phase5.test.ts \
  frontend/src/pages/__tests__/Phase6Surface.test.ts \
  frontend/src/pages/__tests__/FrontDoor.test.tsx \
  frontend/src/pages/__tests__/AuthPages.test.tsx \
  frontend/src/components/auth/__tests__/BrandPanel.test.tsx \
  frontend/src/components/frontdoor/__tests__/FrontDoorLivePanels.test.tsx
```

## Preserved

- HDS tokens, stored-forecast lookup, `/` vs `/live`.
- Alert publication/review and conversion-auth unchanged.
- Zero new photographs.
- BrandPanel carousel headlines and `<100ms` stat (tests pin them). That millisecond figure remains an **invented metric** — visual restyle only; copy change needs a test update.

## Remaining gaps (not this slice)

- User dashboard / profile / blog studio (`§14.7` account tables).
- About / docs / blogs / status inner cards (`§14.8` remainder).
- BrandPanel still advertises “edge inference &lt;100ms”.
- District page is still a ~2.5k-line god file; some simulated dispatch copy remains.
- Phase 7 (BN / AT / perf) not started.
