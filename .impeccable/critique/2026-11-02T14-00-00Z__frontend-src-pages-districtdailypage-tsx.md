---
target: district daily briefing (/forecast/district/:id, /districts/:id)
total_score: 38
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
target_identity: "file:frontend/src/pages/DistrictDailyPage.tsx"
target_fingerprint: "sha256:a5ee7df48db51239e7c063d15e698d0e873cb1add65f3f9dc92fcd24fc1b756f"
target_path: frontend/src/pages/DistrictDailyPage.tsx
timestamp: 2026-11-02T14:00:00Z
slug: frontend-src-pages-districtdailypage-tsx
---
# Critique — `/forecast/district/:id` & `/districts/:id` (district briefing)

**Target:** `frontend/src/pages/DistrictDailyPage.tsx` (surface brief `.impeccable/surfaces/districts-divisions.md`, mode **Read**)
**Method:** Playwright headless Chromium audit at 1440×900 desktop and 390×844 mobile across `/forecast/district/kurigram`, `/forecast/district/sylhet`, `/districts/kurigram`, and `/advisories`, paired with source-level Cupertino Precision token, craft-floor, contrast, and Vercel Web Interface Guidelines audits.

## Heuristic score — 38 / 40

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Names dataset run ID, Dhaka `asOf` timestamp, freshness badge, and research-signal disclaimer |
| 2 | Match between system and real world | 4 | Bilingual English/Bangla district names, 5-tier severity badges (`EXTREME`–`NORMAL`), `0–100` Severity Index, and physical weather units (`mm`, `°C`, `km/h`) |
| 3 | User control and freedom | 4 | URL-synced `#daily-district-select` across all 64 districts plus `#daily-day-filter` (`?day=1..15\|peak`) and `?view=published-records` preserve deep links, Back/Forward history, and shareable states |
| 4 | Consistency and standards | 4 | Hairline editorial rhythm, `tabular-nums` alignment across severity indices/probabilities/dates, and canonical `AlertLevelBadge` semantics |
| 5 | Error prevention | 4 | Unknown districts render a direct recovery path to `/live` and `/advisories`; absent snapshots render honest pre-publish availability copy |
| 6 | Recognition rather than recall | 4 | Continuous 15-day trajectory (`Continuous15DayTrajectory`) highlights Peak Severe Date(s) (single peak or multi-day ties) directly alongside daily driver values and safe actions |
| 7 | Flexibility and efficiency | 3 | Fast switching between continuous 15-day default, Day 1–15 / Peak Severe Days filter, 64 districts, and `/districts/:id` continuous 15-day record; keyboard arrow-key scrubbing across days could be added later |
| 8 | Aesthetic and minimalist design | 4 | Zero glassmorphism or decorative chrome; warm parchment/pearl Cupertino surfaces with sharp hairline dividers and calm typographic hierarchy |
| 9 | Help users recognise and recover from errors | 4 | Fetch error and pre-publish states name the missing artifact (`/data/daily-advisories-v1.json`) and link to `/live` and `/status` |
| 10 | Help and documentation | 3 | Inline research-signal note clarifies BMD/FFWC official authority; methodology deep-link sits one click away in the global chrome |

## Design specificity — pass

The page reads as a hydrological and meteorological district briefing rather than a generic SaaS dashboard: the lead sentence states the peak tier, primary hazard, `0–100` Severity Index, and Peak Severe Date(s) in plain language before secondary telemetry appears, while `Continuous15DayTrajectory` keeps all 15 continuous forecast days (`Days 1–15`) paired with physical forcing (`precipMm`, `tempMaxC`, `windMaxKmh`) without exposing internal raw model scores or fusion reason codes.

## Priority issues

None (`0 P0`, `0 P1`). Minor P2 polish opportunity: optional Left/Right arrow-key roving focus across the 15 day rows for power keyboard operators.
