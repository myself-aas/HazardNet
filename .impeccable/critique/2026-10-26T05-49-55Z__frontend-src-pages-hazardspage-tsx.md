---
target: Hazards (/hazards)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/HazardsPage.tsx"
target_fingerprint: "sha256:4cdb44ee45e83dcbd8c344e44e1b04d5311a1eecdb35d502b6ac401443806509"
target_path: /home/user/HazardNet/frontend/src/pages/HazardsPage.tsx
timestamp: 2026-10-26T05-49-55Z
slug: frontend-src-pages-hazardspage-tsx
---
# Critique — hazards and hazard detail (`/hazards`, `/hazards/:slug`)

**Target:** `frontend/src/pages/HazardsPage.tsx, frontend/src/pages/HazardDetailPage.tsx`
**Surface brief:** `.impeccable/surfaces/hazards.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 29 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match between system and real world | 2 |
| 3 | User control and freedom | 4 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 2 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 4 |

## Design specificity — pass, but the page makes a claim the product does not keep

## Priority issues

**P1 · The page sells nine hazard classes; the platform scores eight** — `HAZARDS_CATALOG` in `HazardsPage.tsx` carries nine entries — the eight climatic classes plus Earthquake — and the standfirst calls them "the 9 primary disaster perils". The engine's own set is eight: `frontend/src/content/hazard-methodology.json` has flood, flash-flood, tropical-cyclone, drought, heat-wave, cold-wave, fire and severe-local-storm, and `frontend/src/lib/hazardPalette.ts` states the exclusion in a comment ("Earthquake is deliberately not one of the eight: the documented set is climatic"). The front door's copy says "one of eight classes". So the one page whose job is to explain the classes is the one page whose count disagrees with the model, the palette and the front door. On a surface that publishes warnings, a taxonomy error is a claim error.

**P2 · The taxonomy is written down twice** — `HazardsPage.tsx` has `HAZARDS_CATALOG` and `HazardDetailPage.tsx` has `ALL_HAZARD_PILLS`; both carry slug, name and icon, and both include Earthquake. Two hand-maintained lists of the same taxonomy is how the count above drifted. The catalogue should be one module — `hazard-methodology.json` already exists — with the card grid and the pill row both reading it.

**P2 · The record counts mix two kinds of measurement** — Each card prints `totalHistoricalEvents` from the events summary and a share computed against it. For Earthquake the archive contributes events the model cannot score, so its share of a climatic archive reads as a hazard-class statistic. The number is real; the frame around it is not.

## Positive findings

- The card grid carries the real per-hazard numbers, and the chart beneath it plots the archive honestly.
- Each class links to a detail page with definition, vulnerable zones, triggers and season — the explanation a warning service owes.
- Loading, empty and error are distinct `DataState*` components rather than one spinner.
- The page states that the archive spans 2000–2026, so a count has a denominator.

## Not tested

The cards at 360px, the chart's screen-reader path, and `/hazards/:slug` for a class with no methodology entry.

## Closure — 2026-10-26 (fix pass)

**Closed · P1 · The page sold nine hazard classes while the platform scores eight.**
The catalogue in `HazardsPage.tsx` now carries `modelled: false` on the Earthquake entry, and both
figures on the page are derived from that flag (`modelledCount`, `archiveOnlyCount`) rather than
typed in. The h1 is `Hazards of Bangladesh`; the lede says "the eight climatic classes the hazard
model scores, and earthquake — tracked in the 2000–2026 archive but outside the model". The
Earthquake card's chip reads `Archive only · not modelled`, its warning row reads `Not modelled`
instead of `0 active`, and its share of the archive is suppressed rather than computed against an
archive it is not part of. `data/design/four-state-baseline.json` carries the new success evidence.

**Closed · P2 · The record counts mixed two kinds of measurement.** Same mechanism: a class the
model does not score reports no share (`percentage: null`), so no number on the page implies it is
part of the modelled set.

**Closed · P2 · A three-tile stat row led the page.** The header's boxed tiles are gone; the page
opens on its h1, a sentence, and one flat row of key figures (`components/ui/KeyFigures.tsx`,
`<dl>` with tabular mono values and secondary-ink labels). The same primitive replaced the identical
row on `/divisions`.

**Open · P2 · The taxonomy is written down twice.** `HAZARDS_CATALOG` here and `ALL_HAZARD_PILLS` in
`HazardDetailPage.tsx` still hold the same slug/name/icon triple. Both now agree on the split, but a
single module reading `frontend/src/content/hazard-methodology.json` is still the shape this should
take.

**Verified:** `npx tsc -p frontend/tsconfig.json --noEmit` exit 0; `check:craft` clean over 260 files;
`npx jest` 186 suites / 1988 passing; `designSignature` and `fourState` ledgers updated rather than
waived.
