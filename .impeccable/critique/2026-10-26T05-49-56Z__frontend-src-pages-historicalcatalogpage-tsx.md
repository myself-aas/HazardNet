---
target: Archive and history (/archive, /model-performance)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/HistoricalCatalogPage.tsx"
target_fingerprint: "sha256:2104a396ca270fe3f448bb30dd91ab7327797fe9ce5f954232035843a15241ff"
target_path: /home/user/HazardNet/frontend/src/pages/HistoricalCatalogPage.tsx
timestamp: 2026-10-26T05-49-56Z
slug: frontend-src-pages-historicalcatalogpage-tsx
---
# Critique — archive and history (`/archive`, `/history`, `/historical`, `/events`, `/retrospectives`, `/model-performance`)

**Target:** `frontend/src/pages/HistoricalCatalogPage.tsx, frontend/src/pages/GeneratedContentPage.tsx`
**Surface brief:** `.impeccable/surfaces/archive-history.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 31 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 4 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 4 |

## Design specificity — pass

## Priority issues

**P1 · The catalogue speaks in monospace** — `HistoricalCatalogPage` sets its supporting copy, its filter labels and its table in `font-mono`, so the whole page reads as a terminal printout. The craft floor is explicit that monospace belongs to code, parameters and measurement rather than to a page's voice: the figures here *are* measurements and earn tabular figures, but the labels around them do not.

**P2 · A wide table on a phone with no sign it can scroll** — The event table sits in a scroll container with no edge fade, no scroll hint and no stacked fallback — although the repository already ships `CardStackTable` for exactly this case.

**P2 · Six routes, one page, three names** — `/archive`, `/history`, `/historical` and `/events` all render this component, while the heading and the content model call it a catalogue. The aliases are deliberate; the identity is not settled, so the copy hedges between "archive", "catalogue" and "history" within one viewport.

## Positive findings

- Every figure uses `tabular-nums` — the only Read surface in the product that does.
- Filters, counts and the table read from one loaded artifact, so the numbers agree.
- The page states the 2000–2026 span and the event count, giving every row a context.

## Not tested

The table at 360px and at 125% text, keyboard traversal of the filters, and the empty-archive state.

## Correction and closure — 2026-10-26 (fix pass)

**Correction first.** The review's P1 said "the catalogue speaks in monospace" and that the page
"reads as a terminal printout". That was written from structural recon and it overstates what the
file does. Checked line by line, `font-mono` in `HistoricalCatalogPage.tsx` was on the figures
(`64`, `3,062`, `70`, the baseline values) and on the correlation matrix — measurements, which is
what monospace is for, and the one Read surface in the product that pairs it with `tabular-nums`.
The single non-figure use was a caption.

**Closed · P1 (as corrected) · The page's own caption was set in monospace.** The
`2000 to 2026 · general summary stats` caption is now body type at `text-xs text-carbon-60`; the
figures and the matrix keep their monospace and their tabular figures. What remains open from the
original finding is a judgement, not a defect: whether a reader would rather see the correlation
matrix as a chart than as a table.

**Open · P2 · A wide table on a phone with no sign it can scroll.** The correlation matrix is
`hidden md:block` with a stacked card list below `md`, so it is already the two-branch pattern; the
event table is the one still inside a scroll container without an affordance.

**Open · P2 · Six routes, one page, three names.** Copy still hedges between archive, catalogue and
history within one viewport. Renaming is a content decision, not a design fix.
