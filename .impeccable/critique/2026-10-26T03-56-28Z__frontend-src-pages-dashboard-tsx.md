---
target: Live map console (/live)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:frontend/src/pages/Dashboard.tsx"
target_fingerprint: "sha256:a498812d576505e25d3b14ac9b819885e4c356d51ca10cd2364fbade8190b457"
target_path: frontend/src/pages/Dashboard.tsx
timestamp: 2026-10-26T03-56-28Z
slug: frontend-src-pages-dashboard-tsx
---
# Critique — live map (`/live`, `/home`, `/home/overview`, `/forecast/overview`)

**Target:** `frontend/src/pages/Dashboard.tsx`
**Surface brief:** `.impeccable/surfaces/live-map.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 28 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 2 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 3 |

## Design specificity — pass, with reservations



## Priority issues

**P1 · The tab strip lies to assistive technology** — `role="tablist"` wraps five `role="tab"` buttons that have no `aria-controls`, no `role="tabpanel"` to point at, and no arrow-key handling (the only `ArrowLeft`/`ArrowRight` in the file are decorative icons in unrelated blocks). A screen reader announces a tab interface and then finds nothing to switch between, and the keyboard user gets a row of plain buttons. Either implement the WAI-ARIA tabs pattern (ids, panels, roving tabindex, arrows) or drop the roles and let them be buttons — the current middle is the one state that is worse than both.

**P1 · The toolbar animates everything and scales under the pointer** — Every control in the console header and tab strip carries `transition-all duration-200`, and the action buttons add `hover:scale-[1.02] active:scale-98`. `transition-all` includes layout properties, so the browser cannot composite the change; scaling the control itself makes a dense toolbar breathe whenever the pointer crosses it. On an Operate surface where the map is the work, motion should mark state changes, not pointer travel.

**P2 · The page's h1 is written in the model's vocabulary** — The visible heading is "Multi-Hazard AI Classification" and the fullscreen variant's is "Live map: multi-hazard situational awareness". The first names the pipeline, not the visitor's task — an extension officer opens this to see which districts are at risk today. The h1 is also `font-black` (900) while `DESIGN.md` declares 700 as the display weight.

**P2 · Counts are set without tabular numerals** — Saved-count in the tab label, coverage and district counts all render in a proportional face, so the digits shift width as the values change. Zero occurrences of `tabular-nums` in any Operate page.

## Positive findings

- `sr-only` h1 in the fullscreen variant, so the map still has a document heading.
- Stored-forecast empty and error are distinct states (`uncovered` vs `error`), with a retry.
- 44px minimums on every toolbar control, `touch-manipulation` on the interactive ones.
- The title block floats on the map with a scrim rather than a card, and the scrim is `pointer-events-none`.

## Not tested

The map at 360px, the tab strip's keyboard path, pinch and drag under touch, and the perceived cost of the toolbar transitions on a low-end Android device.
