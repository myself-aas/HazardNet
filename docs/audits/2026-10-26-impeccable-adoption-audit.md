# Impeccable adoption + full-surface audit — 2026-10-26

**Scope.** Every route the product ships (108 prerendered routes → 216 HTML documents once
`/x` and `/x/` are counted), every surface stylesheet, and the Impeccable practice set itself:
`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/*.md`, the detector
baseline, and the craft floor expressed as a gate.

**Method.** The repository already had `DESIGN.md`, a detector baseline and a design-quality gate.
This pass added the missing half of the practice — product context, per-surface briefs, the design
metadata sidecar, and the craft floor as executable rules — and then ran the whole set over the
build. Evidence below is reproducible with the commands at the end; nothing here is an impression
where a measurement was available.

| Tool | What it read | Result |
|---|---|---|
| `npx impeccable detect` over `frontend/src` | 335 source files | **0 primary, 0 advisory** |
| `npm run check:design` | source + 216 prerendered documents | **0 outstanding, 0 new, 718 waived** (from 89 outstanding, 695 waived) |
| `npm run check:craft` (new) | 259 `.tsx`/`.ts`/`.css` files | **0 floor violations** (from 41) |
| `npm run audit:pages` (new) | 216 documents | **0 findings** (from 372) |
| `npm run check:device` | tokens, prose, icons, contrast, `!important`, residue, SVG paint | pass |
| `npx jest` | 184 suites | **1968 passing**, 1 skipped |

The design metadata sidecar and per-surface briefs were written from the implementation, not
invented: `DESIGN.md`'s frontmatter is still the single machine-read source, and
`__tests__/appleParity.test.js` (65 assertions) still pins it to `apple.ts` and `apple.css`.

---

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | 216 documents: one `h1`, no heading skips, every image with `alt`, every control named, `<main>` landmark, `lang`, and the safety framing now present in the *prerendered* document, not only after hydration. Zero contrast defects across 162 components in both themes. |
| 2 | Performance | 3 | Batch `setState` work in the console remains a later slice; the map is still the heaviest route. Bundle budget passes. |
| 3 | Theming | 4 | Zero primary detector findings; hex literals down 395 → 223 in 40 files; the map palette, the Remotion theme and the PDF print sheet now resolve to the token module instead of restating hexes. |
| 4 | Responsive Design | 3 | 44px minimum targets enforced by a gate rule; the map's drag/measure gestures are pointer events and were not re-tested on a physical device this pass. |
| 5 | Implementation Integrity | 4 | One system, one accent, one shadow; the pre-Apple "cosmic void" Remotion palette and the amber/cream blog prose palette are gone; 41 craft-floor violations removed; every remaining detector finding is one of four documented waivers. |

**Total: 18/20 — Excellent (minor polish).** The two missing points are both *unmeasured*, not
known-bad: no physical-device gesture pass, and no profiled render trace on the console routes.

---

## What changed

### Context the practice expects and the repo did not have

- **`PRODUCT.md`** — already present and specific (three audiences, the publication policy, the
  undecided alert thresholds). Read and left intact rather than rewritten: it is the authority, and
  this pass had nothing to add to it. `DESIGN.md` now defers to it where the two could drift.
- **`.impeccable/surfaces/*.md`** — one brief per surface (15), each recording the mode the page
  takes: **Persuade** (front door, about/legal), **Operate** (live map, forecast console, alerts,
  auth, account, upload, 404), **Read** (hazards, districts, archive, docs, last-run/status, blog).
- **`.impeccable/design.json`** — schemaVersion 2: colour metadata with synthesised tonal ramps,
  typography metadata for every frontmatter role, elevation, motion, breakpoints, six component
  previews as self-contained HTML/CSS on `var(--ap-*)`, and the narrative pulled from `DESIGN.md`.
- **`DESIGN.md`** — restructured onto the eight recognised body sections (Overview, Colors,
  Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts) with the existing
  prose preserved verbatim under them. `Shapes`, `Components` and `Do's and Don'ts` did not exist
  as sections before, so the component grammars and the prohibitions were only in code and in
  component docblocks. Frontmatter extended with the two faces the product actually uses but never
  declared: `body-bengali` (the shipped Noto Sans Bengali subset) and `data-mono` (the tabular face).

### Gates added, so the practice cannot quietly lapse

- **`scripts/check-craft-floor.mjs`** (`npm run check:craft`, wired into `check:device` and CI) —
  nine rules, one per line of the craft floor that CSS scanning cannot see: a kicker above a
  heading, gradient text, a coloured side stripe above 1px, a zero-offset halo, tracking past
  −0.04em, a decorative blur disc, emoji standing in for an icon, a control under 44px, and a
  stylesheet that never themes the browser's own surfaces. Each rule carries the reason it is a
  defect rather than a taste question. Comments are stripped before scanning, so a docblock that
  warns the next engineer with a ⚠ is not a finding.
- **`scripts/audit-pages.mjs`** (`npm run audit:pages`) — the document audit: one `h1`, no heading
  skips, title/description/canonical, `lang`, `<main>`, `alt`, accessible names, and the safety
  framing on every route that states a level. 216 documents, 0 findings.

### Design-system drift removed

| Where | Before | After |
|---|---|---|
| `.prose-blog` | Tailwind amber/red literals (`#b45309`, `#92400e`, `#fffbeb`, `#78350f`, `#b91c1c`) — a second palette inside an Apple system | `--ap-link`, `--ap-primary-hover`, `--ap-sev-moderate-surface`, `--ap-danger`; ramp steps 28/21/17px |
| Legacy type scale (`index.css` §numbers) | 13/16/18/20/22px, hand-written, off-ramp | restated on `APPLE_TYPE`: 14/17/21/28/44px |
| Remotion theme | "cosmic void" ground `#05070E`, cyan accent `#22D3EE`, its own blues | derived from `APPLE_COLORS` / `APPLE_SEVERITY`; cyan is `--ap-primary-on-dark` |
| Remotion + PDF fonts | `DM Mono`, `Public Sans` (neither shipped nor declared) | `APPLE_FONTS.mono` / `APPLE_FONTS.text` |
| Map palette | `#0066cc`, `#c01f1f`, `#8a5a00`, `#1d7a3e`, `#f5b73d`, sky-blue/amber `rgba()` halos | `APPLE_COLORS` / `APPLE_STATUS` / `APPLE_SEVERITY` / `MAP_INTERACTIVE`, and `color-mix()` for the alpha steps |
| Map layer chips | a second Tailwind palette (`bg-amber-100 text-amber-800 …`) that nothing rendered | hazard identity from `APPLE_HAZARD`; the unused field is gone |
| Print stylesheet | nine `pt` radii and an `8px` colophon scattered through `@media print` | one declared print scale (`--print-*`) at the top of the block |

### Craft-floor violations removed (41 → 0)

- **Kickers above headings (11).** The hazard bento printed an uppercase mechanism label above
  every `<h3>` (`COASTAL THREAT · BAY OF GULF`…) that restated the card's own tagline, and the
  front door carried three `Eyebrow` labels: "Attribution" above the heading *Attribution*, and
  two group labels above content that needed a heading instead. All removed; the two real group
  labels became the `<h3>` of the group they name. The `Eyebrow` primitive has no callers left and
  the unused i18n keys are gone.
- **Coloured side stripes (17).** Every callout in the product — login notices, alert policy
  panels, disclaimer, terms, password flows — carried `border-l-[2px]`. Replaced with a 1px border
  in the same hue on the same surface, so the notice still reads as a notice without the
  generated-callout stripe.
- **Decorative blur discs (5).** Four panels carried an absolutely-positioned, blurred, tinted
  circle behind their content. Removed; the panels are differentiated by hairline and surface.
- **Zero-offset halos (3).** The map legend's dots each carried a colour glow. Removed — the dot is
  already the colour.
- **Sub-44px control (1).** The district sheet's close button was 36px on the one control a thumb
  reaches for; now 44 × 44.
- **Card chrome.** The hazard cards' hover was `-translate-y-1` plus `shadow-2xl`; DESIGN.md puts
  depth on a hairline. Hover now moves the border to the hazard hue.
- **Browser surfaces.** The caret, the native control accent, and the underline offset were the
  only browser surfaces still unthemed; they now take `--ap-primary` and a 0.2em offset.

### The no-JS shell

The prerendered shell is the document a crawler and a no-JS visitor reads. Three fixes:

- It is now `<main class="hn-static">` — the builds had no `main` landmark at all.
- Every static document now closes with the safety framing (not official · BMD/FFWC · 999). It was
  in the hydrated app only.
- `404.html` was the bare template: no heading, no landmark, no shell stylesheet, no safety line.
  It now gets the same shell, with `noindex,follow` and deliberately no canonical URL.

### Detector baseline and waivers

`outstanding` went **89 → 0**; `waived` **695 → 718** as the frontmatter learned the two faces the
product actually uses. Four waivers remain, each naming the check that covers the same risk:

1. `overused-font` — Inter stacks (spec decision; no Latin webfont under the 50 KiB budget).
2. `extreme-negative-tracking` — detector artifact; no declaration below −0.1em exists.
3. `overused-font` (primary font) — same font-budget decision, asserted by `appleParity`.
4. `oversized-h1` — new: 22 hits, all the static shell's sentence-length page titles. Verified the
   claim rather than assuming it: nothing resolves an `h1` to 288px (the app is 32/44px, the shell
   30.4px); the rule fires at ≥72px **and** ≥40 characters, and the detector reports a fallback
   size when it cannot resolve the inline shell block against the linked bundle. The risk the rule
   covers is measured for real by `designTypography.test.js` and `check:contrast`.

---

## Per-surface review

| Surface | Mode | Verdict | Notes |
|---|---|---|---|
| Front door `/` | Persuade | fixed | 3 eyebrows removed, bento kickers + glow discs + hover shadow removed, hazard layers tokenised |
| Live map `/live` | Operate | fixed | legend halos removed, GPS/inspect rings tokenised, cluster chrome on the severity ramp |
| Forecast console `/forecast/*`, `/analytics` | Operate | fixed | chart strokes/fills now `var(--ap-*)`; 19 → 3 raw hexes |
| Alerts & advisories | Operate | fixed | 4 side stripes → 1px borders; zero-alert state unchanged and still designed |
| Hazards `/hazards` | Read | fixed | shell type/h1 ramp; document audit clean |
| Districts & divisions | Read | fixed | division silhouettes tokenised (`--ap-n-30`/`--ap-n-50` with `color-mix`) |
| Archive & history | Read | pass | no findings; chart tooltips already on tokens |
| Docs & methodology | Read | fixed | mono face declared in frontmatter (the `th` mono hits) |
| Last run & status | Read | fixed | shell h1 ramp, safety framing added |
| Blog | Read | fixed | prose palette rebuilt on tokens; ramp steps |
| About & legal | Persuade | fixed | terms/legal side stripes removed; `/documentation` redirect intact |
| Auth | Operate | fixed | 4 notice stripes consolidated; social marks keep provider colour (documented inline) |
| Account & profile | Operate | pass | no findings |
| Upload | Operate | pass | no findings |
| Not found | Operate | fixed | now a real document: heading, landmark, shell styles, safety line, `noindex` |

---

## Remaining debt (deliberate, documented)

- **P3 · Map gesture pass on hardware.** The measure tool and sheet drag use pointer events; they
  were not exercised on a physical Android device in this pass. `adapt` is the next command.
- **P3 · Batch `setState` in the console routes.** Present before this pass; a performance slice,
  not a design defect.
- **P3 · 223 hex literals remain** in 40 files (from 395). Each is either a brand mark (Google's
  blue), a test fixture, a print-only value, or a leaflet/canvas option where `var()` cannot
  resolve. The hex baseline ratchets down as files are touched; nothing may raise a number.
- **P3 · `prefers-contrast: more`** is declared but has no dedicated arm; contrast is already AA+ in
  both themes, so this is polish rather than a gap.

## Reproduce this audit

```bash
npm run build:frontend          # vite build + prerender (108 routes, 216 documents)
npm run check:design            # detector vs docs/design/impeccable-baseline.json
npm run check:craft             # craft floor, 9 rules over frontend/src
npm run audit:pages             # document audit over frontend/dist
npm run check:device            # tokens, prose, icons, contrast, residue, svg paint
npx jest                        # 184 suites
```
