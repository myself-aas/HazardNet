---
target: front door (/)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:frontend/src/pages/FrontDoor.tsx"
target_fingerprint: "sha256:dc06f5188819a028417ab8e1952a2bf55f7f1862e6d48b6f5431ac67651a754f"
target_path: frontend/src/pages/FrontDoor.tsx
timestamp: 2026-10-26T03-37-17Z
slug: frontend-src-pages-frontdoor-tsx
---
# Critique — `/` (front door)

**Target:** `frontend/src/pages/FrontDoor.tsx` (surface brief `.impeccable/surfaces/front-door.md`, mode **Persuade**)
**Method:** Assessment A from source and the committed audit record; Assessment B from the bundled detector, the craft-floor gate and the contrast gate. No browser automation and no sub-agent tool were available in this session — the render was not inspected, and the two assessments ran sequentially in one context.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 32 / 40

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Live strip, artifact ages, coverage line, loading and failure states, each naming its source |
| 2 | Match between system and real world | 4 | District, hazard class, horizon and Bangla are the readers' vocabulary, not the schema's |
| 3 | User control and freedom | 3 | Language toggle, expandable standfirst, every route reachable; no in-page filtering to control |
| 4 | Consistency and standards | 3 | One primary action holds; the `Figure` band mixes live measurements with a fixed constant |
| 5 | Error prevention | 3 | Missing values render as em dashes or a sentence, never as a fabricated zero |
| 6 | Recognition rather than recall | 4 | Every figure is followed by the artifact it was read from |
| 7 | Flexibility and efficiency | 3 | Direct paths to map, methodology, scorecard, last run; no shortcuts worth adding |
| 8 | Aesthetic and minimalist design | 2 | The hero spends the first viewport on chrome and link targets; the answer sits below it |
| 9 | Help users recognise and recover from errors | 4 | The failure banner names the failure and offers retry plus `/status` |
| 10 | Help and documentation | 4 | Methodology, docs, status and last run are all in-path |

## Design specificity — pass

Covered name, this page is not interchangeable. The hero answers "who is telling me this,
dated when, and how would I know if it stopped working" rather than "where", and the GIS
console it used to be lives at `/live`. The provenance band, the run record and the
hazard registry are the product's honesty constraint rendered as structure. The photograph
is a real world, not a stock flood.

## Priority issues

**P1 · The first viewport on a 390px phone is navigation, not the answer.** Between the
language switch and the live strip the reader passes: the h1, a two-line clamped standfirst
plus its read-more control, the primary action, three text links at 44px minimum height, and
the evidence pointer at 44px — each `min-h-[44px]`, each its own line at that width. The
page's own thesis ("what is published at the moment of this read") starts below the fold by
more than a viewport. Evidence: the JSX's stacked `min-h-[44px]` blocks and the mobile-only
`sm:hidden` evidence pointer; not visually confirmed (no browser).

**P1 · The hero's small print has no measured contrast.** The authority line is
`text-xs text-white/75` over `bg-carbon-black/65` over a photograph, and the standfirst is
`text-white/90` at `text-base`. The comment above the scrim records a hand measurement
(6.40:1 at `to-black/60`) from 2026-10; today's surface is a flat 65% scrim and
`scripts/check-contrast.mjs` measures token pairs, not composited pixels over imagery. Body
copy at 4.5:1 is a floor item, and nothing in CI can currently fail this.

**P2 · Three depth signals on one panel.** The hero card carries a 1px `border-white/15`,
`backdrop-filter: blur(var(--hero-glass-blur))` and two arbitrary text shadows
(`drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`, `drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`) whose
`rgba()` values are not tokens. The scrim already separates text from the image; the blur and
the shadows are decoration layered on a solved problem.

**P2 · Figures are set without tabular numerals.** `Figure` renders measured counts in
`text-ap-*` sizes but no `font-variant-numeric: tabular-nums`, and one slot holds the string
`7 & 15 days`. The label beside it is precise ("Forecast horizons, in days, from one
deterministic weather window"), so the constant is honestly framed — the register, not the
claim, is the defect.

**P3 · A sentence set as a data label.** `frontdoor.run.aside` is
`font-mono text-xs uppercase tracking-wider text-carbon-60` around "read from the committed
artifacts on every load". Monospace is for data; this is prose in a data costume.

## Positive findings

- The banned eyebrow is gone from the hero and the section headings carry their own weight.
- One primary action, in the action colour; hazard crimson is reserved for hazard meaning.
- Empty, loading, failed and no-alert states all exist, and the failure offers a real recovery.
- Safety framing closes the static shell, so the no-JS document carries it too.
- Detector: 0 findings on the page and its `components/frontdoor/` children.

## Minor observations

- `drop-shadow` at 0.8 alpha on white text is strong enough to read as a third outline on
  subpixel-antialiased displays.
- The three text links share a row at `sm` and stack at base; the wrap order changes the
  emphasis between breakpoints.
- `/last-run` is reachable twice on mobile (text link and evidence pointer) and once on
  desktop; the duplication is deliberate but untested for a screen reader's link list.

## Not tested

Render at 360px, 390px, 768px and 1440px; 125% text scaling; keyboard traversal of the hero;
the reveal motion; the photograph's real luminance under the scrim.
