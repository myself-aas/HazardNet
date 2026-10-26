---
target: Forecast console (/analytics, /settings, /forecast/*)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:frontend/src/pages/AnalyticsPage.tsx"
target_fingerprint: "sha256:e46f2af0f4d9722257b885658a364f2686771dbcfd3226c9454704dfc85fb7e1"
target_path: frontend/src/pages/AnalyticsPage.tsx
timestamp: 2026-10-26T03-56-29Z
slug: frontend-src-pages-analyticspage-tsx
---
# Critique — forecast console (`/analytics`, `/analytics/:subCategory`, `/forecast/compare`, `/forecast/my-districts`, `/forecast/settings`, `/settings`)

**Target:** `frontend/src/pages/AnalyticsPage.tsx, frontend/src/pages/Dashboard.tsx (non-map views)`
**Surface brief:** `.impeccable/surfaces/forecast-console.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 31 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 2 |

## Design specificity — pass



## Priority issues

**P1 · Settings is titled with the map app's heading** — `/settings` is rendered by the console component, which prints "Multi-Hazard AI Classification" as its h1 and "Published district forecasts for agricultural decision support across Bangladesh" as its standfirst. A reader who opened settings to change their district list is told they are looking at the forecast classifier. The heading has to follow the view, not the component.

**P2 · The chart's text alternative is in the component, the reading order is not** — `EmdatComparisonChart` carries `role="img"`, per-marker labels and a `<table>` alternative — better than most charts in the wild. But the table follows the figure, so a screen-reader user hears the image, then the same data, with no statement of what the figure claims. The `caveats` prose exists; it should precede the figure rather than trail it.

**P2 · Two weights for one hierarchy** — Page headings run at `font-extrabold` (800), the console's at `font-black` (900), and `DESIGN.md` declares 700 for display. Three answers to one question.

## Positive findings

- `DataStateLoading/Empty/Error` components give every tab the same three states.
- The comparison figure offers a real `<table>`, not a colour legend alone.
- Empty, error and loaded states each carry their own copy rather than a generic "Something went wrong".

## Not tested

The analytics tabs at 360px, the chart on a screen reader, and the settings form's keyboard order.
