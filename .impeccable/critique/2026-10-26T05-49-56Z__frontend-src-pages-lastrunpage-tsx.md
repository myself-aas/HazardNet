---
target: Last run and status (/last-run, /status)
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/HazardNet/frontend/src/pages/LastRunPage.tsx"
target_fingerprint: "sha256:6c62fe283d944a0d1b4fc4cbec03e3cd513f2a9dfe8c0bbb016db408e60a0138"
target_path: /home/user/HazardNet/frontend/src/pages/LastRunPage.tsx
timestamp: 2026-10-26T05-49-56Z
slug: frontend-src-pages-lastrunpage-tsx
---
# Critique — last run and status (`/last-run`, `/status`)

**Target:** `frontend/src/pages/LastRunPage.tsx, frontend/src/pages/StatusPage.tsx, frontend/src/components/status/FreshnessPanel.tsx, frontend/src/components/frontdoor/RunVisual.tsx`
**Surface brief:** `.impeccable/surfaces/last-run-status.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 34 / 40

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

## Design specificity — pass — the strongest Read surface in the product

## Priority issues

**P2 · The freshness panel has no age scale** — `FreshnessPanel` prints each artifact's age and its SLO as text. There is no scale, so "14h against a 48h SLO" takes arithmetic to judge. One hairline bar with the SLO marked would answer the question the page exists for at a glance — and it is a data graphic, not decoration.

**P2 · English-only, explained in a code comment rather than on the page** — The decision is documented in `StatusPage.tsx` and `docs/ops/STATUS_PAGE.md`, and it is defensible: every value the page prints is an English artifact key. The reader is given no sentence saying so, and on a bilingual product a silent monolingual page reads as an unfinished one.

**P3 · The panel's own failure is a sentence with no retry** — If `freshness.json` cannot be read the page says so — correctly — and offers no way to ask again short of a reload. The front door, reading the same artifact, exposes a retry.

## Positive findings

- No P1: both pages read one artifact, render its own values with the run that produced them, and leave an unreadable value unreadable — an em dash or the sentence that says so — rather than filling it with a zero.
- `published: null` rather than `0` when the alert artifact is unreadable, with the distinction stated on the page.
- The `/last-run` card moved here from the hero without losing a single fact.
- Both pages use the same renderer as the docs, so the safety footer and the typography are not forked.

## Not tested

The pages at 360px, a deliberately stale artifact, and the freshness panel with a partially missing SLO.
