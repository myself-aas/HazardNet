---
target: "Account (/dashboard, /profile, /u/:username)"
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:frontend/src/pages/UserProfilePage.tsx"
target_fingerprint: "sha256:4efe2849cbd03c0ef8b8b6437393a1308be58212a0a5ae3beef625f5bfd947b1"
target_path: frontend/src/pages/UserProfilePage.tsx
timestamp: 2026-10-26T03-56-30Z
slug: frontend-src-pages-userprofilepage-tsx
---
# Critique — account (`/dashboard`, `/profile`, `/u/:username`)

**Target:** `frontend/src/pages/UserDashboardPage.tsx, frontend/src/pages/UserProfilePage.tsx, frontend/src/pages/PublicProfilePage.tsx`
**Surface brief:** `.impeccable/surfaces/account.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 31 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 3 |

## Design specificity — pass, one hierarchy defect



## Priority issues

**P1 · The public profile's empty and error states set their h1 at card size** — `/u/:username` renders three states with a heading: the found profile (through `PublicProfileCard headingLevel={1}`, correctly set), the missing/offline state and the private state. The last two are `text-lg` (18px) — the size of a card heading and smaller than every other page's h1 (32–44px) — so the page loses its display-level anchor exactly when it is explaining that there is nothing to show.

**P2 · Three load states, three different vocabularies** — The dashboard distinguishes `loading`, `error` and `missing`; the public profile distinguishes `loading`, `found`, `private`, `missing` and `offline`; the private profile page has one `loading` branch. The two profile pages are the same object seen from two sides and should share one state model.

**P2 · The account surface is where the product's voice thins out** — Everywhere else the copy says what it read and when. Here the empty and error states are generic ("Failed to sign out. Please try again."), which is correct but anonymous.

## Positive findings

- The public profile handles private, missing and offline separately rather than as one 404.
- Dashboard separates an unreadable profile row from an absent one.
- Sign-out and password-reset failures are announced, not swallowed.

## Not tested

The profile pages at 360px, the dashboard's empty state for a new account, and the keyboard path through profile settings.
