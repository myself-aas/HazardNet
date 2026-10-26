---
target: Not found (*)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:frontend/src/pages/NotFoundPage.tsx"
target_fingerprint: "sha256:50946e887211f5af091cc06483419016cdd356465dec434dd54a1deb76221a95"
target_path: frontend/src/pages/NotFoundPage.tsx
timestamp: 2026-10-26T03-56-30Z
slug: frontend-src-pages-notfoundpage-tsx
---
# Critique — not found (`*`)

**Target:** `frontend/src/pages/NotFoundPage.tsx`
**Surface brief:** `.impeccable/surfaces/not-found.md` · mode chosen by the brief
**Method:** A from source; B from the bundled detector (0 findings on every file in scope), the craft-floor gate (0 violations / 259 files) and the contrast gate (162 components clean in both themes). No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 30 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 2 |
| 2 | Match between system and real world | 2 |
| 3 | User control and freedom | 4 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 4 |
| 10 | Help and documentation | 3 |

## Design specificity — below the rest of the product



## Priority issues

**P1 · A developer's status line is addressed to the visitor** — The card prints `Status: 404 HTTP / Client Router Unmatched` in monospace, in a bordered box, above the two actions. "Client Router Unmatched" is this repository's internal vocabulary; it means nothing to a farmer who mistyped a district slug, and the monospace box dresses it as a console message. What the reader needs is the one thing the page already knows: the path they asked for does not exist.

**P1 · The two actions are two different components** — Home is a bare `bg-primary` rectangle with no radius; Live map is a `rounded-full` outline pill. They sit side by side as a pair, so the difference reads as a bug rather than as hierarchy.

**P2 · No language, no safety line, no way back to the thing they wanted** — Every other page is bilingual through `useI18n`; this one is hard-coded English. It also omits the safety framing the rest of the product carries, and offers no search or links to the most likely destinations (alerts, districts, docs).

## Positive findings

- `noindex,follow` is applied by `usePageSeo` for an unmatched path — a soft 404 cannot be indexed.
- The brand mark anchors the page rather than an empty shell.
- Two exits, both 44px.

## Not tested

The page at 360px, and the path a screen reader takes through the status box.
