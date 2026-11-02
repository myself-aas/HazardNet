---
surface: districts-divisions
routes:
  - /districts
  - /districts/:id
  - /divisions
  - /divisions/:id
  - /forecast/district/:id
mode: Read
---

# Districts Divisions

## What the visitor is doing

See one district or division: its outlook, its history, its exposure, and where the numbers come from. On `/forecast/district/:id`, first identify the district, dated hazard, seriousness and safe actions.

## Direction

Read track with a console header on the district and division archive pages. The daily district route opens with a short safety boundary, published tier, 64-district selector, and safe actions alongside a continuous 15-day trajectory (`Days 1–15`) showing a `0–100` Severity Index and highlighted Peak Severe Date(s) (with an optional 7-day compact view via `?days=7`, while keeping raw model score and internal fusion reason unexposed). Missing, stale and offline days must never read as safe. The older two-horizon public records remain an explicitly labelled alternate view, not an officer/private-data shortcut.

## Decisions to preserve

- Generated content pages must state that they are generated and from which artifact.

## Mode

`Read` — the visitor understands something; structure for comprehension, then make the reading worth staying in.
