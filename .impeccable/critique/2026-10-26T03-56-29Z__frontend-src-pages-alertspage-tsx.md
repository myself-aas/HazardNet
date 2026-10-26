---
target: Alerts and advisories (/alerts, /advisories)
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:frontend/src/pages/AlertsPage.tsx"
target_fingerprint: "sha256:1c158fa9964caa4f9f658e6e423013343b71d170196dd8a636bcbf015d129b32"
target_path: frontend/src/pages/AlertsPage.tsx
timestamp: 2026-10-26T03-56-29Z
slug: frontend-src-pages-alertspage-tsx
---
# Critique — alerts and advisories (`/alerts`, `/alerts/:id`, `/advisories`, `/advisories/:subCategory`)

**Target:** `frontend/src/pages/AlertsPage.tsx, frontend/src/pages/AlertDetailPage.tsx, frontend/src/pages/AdvisoriesPage.tsx`
**Surface brief:** `.impeccable/surfaces/alerts-advisories.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 33 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 4 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 4 |
| 5 | Error prevention | 4 |
| 6 | Recognition rather than recall | 4 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 4 |

## Design specificity — strong pass



## Priority issues

**P1 · The provenance numbers jitter as they load** — The source banner prints the load time, the data cutoff and the age against the 48h SLO, and the count beside each level changes as data arrives. None of it uses tabular numerals, so every one of those numbers changes width on refresh — on the one surface whose entire argument is that its numbers can be trusted and checked. This is a systemic Operate finding: 0 pages use `tabular-nums`.

**P2 · The policy panel is a reference manual inside a task surface** — `AlertLevelLadder` and `PolicyPanel` sit in the alert list's flow. They are the right content — the ceiling in force, the thresholds, the human gate — but a reader scanning today's warnings scrolls past a specification to reach the second alert. A disclosure with the ceiling restated in one line keeps both the honesty and the scan.

**P3 · The empty state's only action is a link away** — When the API and the snapshot both fail, the page says so and links to `/status`. There is no retry on this surface, although the underlying hook exposes one and the front door already uses it.

## Positive findings

- Four rules are stated at the top of the file and all four are visible in the markup: provenance, a table alternative for the map, colour never alone, and the human gate.
- The degradation ladder API → snapshot → unavailable has distinct copy at each step.
- CSV export of the alerts a reader is looking at.
- The confidence sentence says out loud that the score is not a probability.

## Not tested

The alert table at 360px with 64 districts, the filter row under touch, and a screen reader's pass over the policy panel.
