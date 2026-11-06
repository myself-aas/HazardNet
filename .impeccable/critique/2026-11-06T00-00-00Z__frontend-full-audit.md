---
target: "entire frontend (frontend/src, 276 files)"
total_score: null
max_score: null
na_heuristics: []
p0_count: 0
p1_count: 0
target_identity: "branch arena/5accd1b5-hazardnet"
timestamp: 2026-11-06T00:00:00Z
slug: frontend-full-audit
---

# Full-frontend audit — 2026-11-06

**Method:** repo's own measured gates, run against a fresh production build, plus the full
frontend jest suite (84 suites). No render inspection (no browser available in this sandbox).

## Gate results

| Gate | Result |
|---|---|
| `audit-pages.mjs --strict` (built dist, 348 documents) | 0 findings |
| `check-craft-floor.mjs` (276 files) | no floor violations |
| `check-contrast.mjs` | 169 components clean in both themes |
| `check-design-residue.mjs` | 4 stylesheets, 172 components, no residue (after fix below) |
| `check-css-important.mjs` | every `!important` justified |
| `check-prose-dashes.mjs` | clean after fixes below (only exempt source-data files skipped) |
| `tsc --noEmit` (frontend) | clean |
| frontend jest suite | 788 passed; 4 failures, all pre-existing on clean checkout (see below) |

## Findings fixed in this pass

1. **Raw hex colors in `ReportTemplate.tsx`** (16 occurrences, token-compliance) — replaced with
   design-system severity ramp variables (`var(--ap-sev-*)`, `var(--ap-link)`, tokenized
   Tailwind palette vars) for tier fills, tier text and chart palette.
2. **Em-dash punctuation in new report pages** (`ReportsPage`, `ReportsArchivePage`) and in the
   `build_daily_report.mjs` generated copy — reworded per the prose-dash policy (em-dash survives
   only as the empty-value glyph); seeded report regenerated.
3. **Undeclared `--ap-sev-medium` in `DivisionDetailPage.tsx`** (design-residue, 4 reads) — mapped
   to the declared `var(--ap-sev-moderate)`.
4. **`FooterResponsive.test.tsx`** pinned the old back-to-top offset — updated to the raised
   `bottom-[max(5.75rem,…)]` position from the chat-bar overlap fix.

## Pre-existing issues — RESOLVED 2026-11-06

- **`FrontDoor.test.tsx` / `LastRunPage.test.tsx`** hardcoded "61 advisories/alerts" while the
  committed alert snapshot publishes 64. Both tests now derive the expected count from
  `alerts-latest.json` (the same bytes the page reads), including the Bengali-digit assertion via
  `toBengaliNumerals`, so they cannot drift from the artifact again. Full frontend suite: 84/84
  suites, 792/792 tests pass.
- **`check-token-compliance.mjs`** flags on `ChatBot.tsx` (3) and `handoff-beam*` (21) closed:
  a `cssVar()` runtime resolver was added to `handoff-beam-utils/palette.ts` (canvas `fillStyle`
  cannot parse `var()`, so colors are resolved from design tokens at runtime with CSS-keyword
  fallbacks, never raw hex), and all hex literals in the three files now reference
  `--color-*`/`--ap-*` tokens. Gate result: `hex literals: 218 in 39 files (baseline 218 in 39) — PASS`.

## Not tested

Real-browser render inspection (Playwright audit script) — no browser binary reachable from this
sandbox; all findings above come from the static gates and jsdom tests.
