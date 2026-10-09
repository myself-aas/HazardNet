# Frontend design-system audit — 2026-10-09 (Impeccable `audit`)

**Scope:** the web design system — `frontend/src` (197 `.tsx`, 132 `.ts`, 4 stylesheets /
4,323 lines CSS), the shipped artefact `frontend/dist` (108 prerendered routes), the token
layer `packages/design-system/`, `DESIGN.md`, and the ten `npm run check:*` design gates.
Native (`apps/mobile`, `apps/windows`) is out of scope.

**Command:** `/impeccable audit` — a **code-level** audit. Issues are documented for other
commands to fix; nothing in this pass was changed.

**Method and its one hard limit.** Every claim below is reproduced by a command in this repo
or by a controlled experiment recorded in §Verification log. What could **not** be done:
**no browser engine is available in this environment** (no Chromium/Playwright browser
binary, and the Playwright CDN is unreachable from the sandbox). So rendered truth —
tab order, keyboard traps, live-region behaviour, real contrast at the pixel, frame rate,
horizontal overflow at 375/768/1440, and **synthesised touch gestures** — was not exercised.
Where a dimension normally requires a viewport, this audit reports what the code can prove
and marks the remainder **UNVERIFIED** rather than guessing. The repo's own
`scripts/audit_frontend_design.mjs` (which drives a real browser) is the follow-up that
closes that gap; it needs `PLAYWRIGHT_CHROMIUM_PATH`.

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | **3** | Clickable `<div>` expander with no role/tabIndex/keyboard handler (WCAG 2.1.1, Level A) |
| 2 | Performance | **2** | Landing route eagerly preloads **713.5 kB gzip / 2.45 MB raw** — 1.8× the project's own documented <400 kB initial-shell target; no gate measures it |
| 3 | Theming | **3** | Full token adoption + mechanically verified dual theme, but type scale is locked in `px` and 395 hex literals sit outside the tokens by exemption |
| 4 | Responsive Design | **3** | Breakpoints, touch floor and scroll containment are all sound; 5 controls declare sizes the global 44 px floor silently overrides |
| 5 | Implementation Integrity | **3** | Coherent, deliberate, one-system codebase — but **65 of 89 detector findings (73%) are a tool bug, not product debt** |
| **Total** | | **14/20** | **Good — address weak dimensions** |

**Rating bands**: 18-20 Excellent · 14-17 Good · 10-13 Acceptable · 6-9 Poor · 0-5 Critical

---

## Implementation Integrity Verdict

**PASS — but the instrument is lying to you.**

The implementation expresses a coherent, product-specific system. Evidence: `check:residue`
confirms **one** design system (4 stylesheets, 161 components, no residue) after three dead
systems were deleted; `check:tokens` reports **5,634 palette-family uses with 0 resolving to
Tailwind's stock palette (100.0 % compliance)**; `check:brand` confirms every colour resolves
to a declared token; `check:contrast` verifies 161 components against **both** grounds in
**both** themes with no inversion defects; and nearly every non-obvious CSS rule carries a
comment naming the measurement and the audit ID that produced it. This is not a system that
drifted — it is one that was deliberately built and is deliberately enforced.

The failure is in the measuring instrument. The design-quality baseline
(`docs/design/impeccable-baseline.json`, regenerated 2026-10-08) reports **89 outstanding
findings**, and this audit reproduced that number exactly (`check:design`: 89 outstanding,
695 waived, **0 new**). On verification in context, **65 of those 89 — 73 % — are false
positives**, produced by the detector reading the print stylesheet and mis-converting `pt`
as `rem`. Details and the proof in §P1-3 and the Verification log.

The consequence is not cosmetic: the baseline is a *ratchet* ("`outstanding` may only shrink
without a commit that explains why it grew"), and 73 % of the ratchet is measuring a bug in
the detector rather than the product. Real drift is currently indistinguishable from noise.

---

## Executive Summary

- **Audit Health Score: 14/20 (Good)** — no P0 defects; the two weak dimensions are
  Performance (2) and Implementation Integrity (3, for instrumentation reasons).
- **Issues found: 0 × P0, 3 × P1, 3 × P2, 5 × P3.**
- **Top issues:**
  1. **P1** The marketing landing route eagerly preloads PDF-generation, charting and
     Firebase vendors — **713.5 kB gzip / 2.45 MB raw** against a documented <400 kB
     initial-shell target — for an audience explicitly stated to be on low-end Android and
     2G/3G. `check:bundle` passes because it budgets per-chunk and whole-app, never per-route.
  2. **P1** A content control is a bare clickable `<div>`: no role, no `tabIndex`, no
     keyboard handler (WCAG 2.1.1 Level A).
  3. **P1** 73 % of the design-quality baseline is detector artifact from the print
     stylesheet, so the integrity ratchet is not measuring the product.
- **Every automated gate passes** — `check:tokens`, `check:contrast`, `check:contrast:css`,
  `check:design`, `check:brand`, `check:important`, `check:residue`, `check:svg-tokens`,
  `check:prose`, `icons:check`, `check:bundle`, `check:events-summary`. As the 2026-10-05
  audit observed, that means the findings live in the space the gates do not cover.

---

## Detailed Findings by Severity

### [P1] Landing route eagerly preloads 713.5 kB gzip (2.45 MB raw) of JS

- **Location:** `frontend/dist/index.html` — 17 `<link rel="modulepreload">` tags; entry chunk
  `assets/index-_jt1gcRs.js` statically imports `vendor-pdf`, `vendor-firebase`,
  `vendor-recharts`. Chunking config: `frontend/vite.config.ts:196-216` (`manualChunks`).
- **Category:** Performance
- **Impact:** A first-time visitor to `/` — a marketing page — downloads PDF-generation and
  charting libraries before the hero can paint. `frontend/src/lib/bandwidth.ts` states the
  audience plainly: *"Bangladeshi farmers, union parishad offices and volunteers on low-end
  Android hardware, often on 2G/3G with a small data bundle."* On that device this is the
  difference between a usable first visit and an abandoned one, and it is metered data spent
  on code the visitor will probably never execute.

  Measured, per `dist/index.html`:

  | Chunk | gzip | raw |
  |---|---:|---:|
  | `vendor-pdf` (jsPDF + html2canvas-pro) | 233.9 kB | 842.1 KB |
  | `vendor-firebase` | 198.2 kB | 680.8 KB |
  | `vendor-react` (React + router + framer-motion) | 145.4 kB | 468.5 KB |
  | `vendor-recharts` | 98.9 kB | 392.4 KB |
  | 13 smaller chunks | 37.1 kB | 91.8 KB |
  | **Total eager** | **713.5 kB** | **2.45 MB** |
  | `index-*.css` | 40.1 kB | 244.9 KB |

  `vendor-pdf` + `vendor-recharts` alone are **332.8 kB gzip (47 %)** of the eager payload
  for two features no landing-page visitor has invoked yet.
- **Why no gate caught it:** `scripts/check-bundle.mjs` sets `BUDGETS = { singleChunk:
  800 * 1024, total: 1600 * 1024 }` and sums **every `.js` file in `dist/assets`** — 1,360.5 kB
  gzip, which passes. Its own header comment says *"Initial-shell target < 400 kB"*. That
  target is **documented and unenforced**: the gate never inspects a route's preload set, so
  the one budget that describes what a visitor actually waits on is a comment.
- **Standard:** Core Web Vitals — LCP / TBT on the stated target device class.
- **Recommendation:** (a) Add a route-scoped budget to `check-bundle.mjs`: parse
  `dist/index.html`, sum gzip over the `modulepreload` + entry graph, fail above 400 kB.
  (b) Make the PDF and chart paths dynamic — `frontend/src/hooks/useMapSnapshot.ts:2`
  (`import html2canvas from 'html2canvas-pro'`) and `frontend/src/utils/pdfExport.ts:1-2`
  are top-level static imports; convert both to `await import(...)` inside the export
  handlers, which drops `vendor-pdf` out of the entry graph entirely. (c) Defer `vendor-recharts`
  behind the already-lazy routes that need it.
- **Trace note (honest caveat):** the static import *edge* into the entry chunk is confirmed
  by reading the built `index-_jt1gcRs.js`; the specific source module that pulls
  `vendor-pdf` in was **not** isolated by grep (no eager `frontend/src` file statically
  imports `pdfExport`/`EvidenceCard`/`LiveMapView`). Confirm with
  `rollup-plugin-visualizer` before editing — the fix (dynamic import) is correct
  regardless of which module is the carrier.
- **Suggested command:** `/impeccable optimize`

---

### [P1] Content expander is a bare clickable `<div>` — no keyboard path

- **Location:** `frontend/src/components/StructuredAdvisoryRenderer.tsx:191`
  (`<div … onClick={() => setImpactExpanded(true)}>` — no `role`, no `tabIndex`, no
  `onKeyDown`). Second instance: `frontend/src/components/PdfExportButton.tsx:265`, a
  click-outside backdrop `<div onClick={… setIsOpenMenu(false)}>` with no `Escape` handler
  (P2 — the trigger button can toggle it closed, so it is recoverable).
- **Category:** Accessibility
- **Impact:** The impact block is real content revealed by an interaction. A keyboard-only or
  switch-device user cannot reach it: the element is not focusable, is not announced as a
  control, and has no key handler. Screen-reader users are told it is a text container.
- **WCAG:** **2.1.1 Keyboard (Level A)** and **4.1.2 Name, Role, Value (Level A)**.
- **Recommendation:** Make it a `<button type="button">` with `aria-expanded` and
  `aria-controls` on the region it reveals — the file already has a correct native `<button>`
  at line 167, so this is a local inconsistency, not a pattern. Add an `Escape` handler to the
  `PdfExportButton` backdrop.
- **Suggested command:** `/impeccable harden`

---

### [P1] 73 % of the design-quality baseline is a detector bug, not product debt

- **Location:** `docs/design/impeccable-baseline.json` (89 `outstanding`, 695 `waived`,
  generated 2026-10-08); detector run over `frontend/src` + `frontend/dist/**/*.html`.
- **Category:** Implementation Integrity
- **Impact:** The baseline is a ratchet — `outstanding` may only shrink. 65 of its 89 entries
  can never be fixed in product code, so the ratchet is pinned permanently and, worse,
  **genuine new drift would land in a list that is already 73 % noise** and be waved through
  as "known". The team's own `design:detect` gate is spending its credibility on a tool bug.

  Breakdown, all verified in context:

  | Rule | Count | Verdict |
  |---|---:|---|
  | `tight-leading` | 43 | **False positive** — print-stylesheet artifact |
  | `oversized-h1` | 22 | **False positive** — `pt`→`rem` misparse (18pt → "288px") |
  | `design-system-font` | 24 | 7 print/PDF artifact; 8 use declared tokens absent from `DESIGN.md`; 9 media/print exemptions |
- **Proof (see Verification log):** the detector reads `@media print { h1 { font-size: 18pt;
  line-height: 1.3 } }` from `frontend/src/index.css:1400` and reports a **288 px** h1 with
  **0.13×** leading. Changing `18pt` → `20pt` moved the report to **320 px**; deleting the
  `@media print` block made both findings vanish. The real values are 1.9 rem / 30.4 px at
  `line-height: 1.15` (`.hn-static h1`) and 28 px→32 px at `line-height: 1.2` (`.hn-h1, h1`).
- **Recommendation:** (a) Move the print sheet out of the detector's targets, or scan
  `frontend/src` only and keep the `dist` target for markup-level rules. (b) Re-baseline so
  the ratchet starts from the real count (≈24, of which ≈8 are actionable). (c) Add a
  regression test asserting the built CSS contains no `h1` font-size ≥ 100 px, so the artifact
  cannot silently return as a "finding" the team learns to ignore.
- **Suggested command:** `/impeccable document` (reconcile spec↔code, then re-baseline)

---

### [P2] The 44 px touch floor silently overrides declared sizes, and its escape hatch is unused

- **Location:** `frontend/src/index.css:2681-2684`
  (`button:not([data-compact-target="true"]), [role="button"]:not([data-compact-target="true"])
  { min-height: 44px; min-width: 44px; }`, deliberately outside `@layer` so utilities cannot
  shrink it) vs. `data-compact-target` used **0 times** in the codebase.
- **Category:** Responsive Design / Implementation Integrity
- **Impact:** Five controls declare compact sizes that can never take effect —
  `ui/expand-map.tsx:334,345,356` (`w-7 h-7` = 28 px, the map's zoom/recenter cluster),
  `DistrictDetailPanel.tsx:101` (`w-8 h-8` = 32 px),
  `DisasterDetailModalUI.tsx:671` (`w-9 h-9` + `min-h-[36px]` = 36 px). Accessibility is
  *not* harmed — `min-height`/`min-width` clamp `height`/`width`, so users get a compliant
  44 px target. What is harmed is **legibility of the code**: the class list is a lie, and the
  map control cluster renders as three 44 px circles at `gap-1` (4 px) instead of the compact
  28 px cluster the author specified. Either the design wants compact controls — in which case
  they must opt out — or the compact classes are dead code. Both readings are drift.
- **Recommendation:** Decide per control. For the map cluster, either add
  `data-compact-target="true"` **and** an explicit accessible name plus ≥28 px spacing, or
  delete the `w-7 h-7` classes and accept 44 px. Remove the unused escape hatch if no control
  legitimately needs it, so the next author is not misled.
- **Suggested command:** `/impeccable adapt`

---

### [P2] No component is memoised — `React.memo` used 0 times across 197 components

- **Location:** `frontend/src/**` — 0 × `React.memo`, vs. 142 × `useMemo` and 49 ×
  `useCallback`.
- **Category:** Performance
- **Impact:** Value-level memoisation is present and healthy; **component-level** re-render
  boundaries are not. On the dashboard and analytics surfaces — maps, Recharts figures, and
  live status panels updating together — any parent state change re-renders every child
  subtree. On the stated target hardware (≤2 GB RAM, ≤4 cores, per `lib/bandwidth.ts`) this
  shows up as dropped frames during interaction.
- **Recommendation:** Memoise the leaf-heavy, expensive-to-render components first —
  `DistrictRiskMap`, `LiveMapView`, `EmdatComparisonChart`, `MultiHazardDistributionChart`,
  `TemporalTrendChart` — and the design-system primitives. **UNVERIFIED:** no profiler run was
  possible, so this is a structural gap rather than a measured regression; profile with the
  React DevTools profiler before and after.
- **Suggested command:** `/impeccable optimize`

---

### [P2] `DESIGN.md` typography declares one face; the system ships four stacks

- **Location:** `DESIGN.md` `typography:` block (Inter only) vs.
  `frontend/src/styles/apple.css:133-134` —
  `--ap-font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;`
  and `--ap-font-bengali: 'Noto Sans Bengali', 'Hind Siliguri', sans-serif;` — plus the
  `@font-face` at `index.css:14-20` and the print faces (`"Times New Roman"`).
- **Category:** Theming / Implementation Integrity
- **Impact:** The mono and Bengali stacks are **first-class declared tokens**, correctly used
  through `var(--ap-font-mono)` / `var(--ap-font-bengali)`. The code is right; the
  specification is incomplete. Because `design-system-font` validates against `DESIGN.md`,
  every correct use of a declared token is reported as an anti-pattern — 8 of the 24 findings
  (`sfmono-regular` ×7 for table headers, `Noto Sans Bengali` ×1). The Bengali face is not
  optional: it is a Bangladesh-facing product with Bengali UI, and it is budgeted at 43.3 KiB
  of the 50 KiB local-font allowance.
- **Recommendation:** Add `mono`, `bengali` and a `print` face to `DESIGN.md` typography, and
  record the Remotion/PDF faces as media exemptions (consistent with the existing F-07
  disposition that classed Remotion compositions and hero media as *media, not chrome*).
  That resolves the 8 token findings legitimately and lets the remaining 16 be waived with a
  reason that names the medium.
- **Suggested command:** `/impeccable document`

---

### [P3] Two textareas remove the focus outline with no replacement

- **Location:** `frontend/src/components/blog/RichTextEditor.tsx:234` and `:247`
- **Category:** Accessibility
- **Impact:** `outline-none` with no `focus:` / `focus-visible:` companion removes the only
  visible focus indicator on two text inputs. The caret still moves, so the impact is
  limited, but a keyboard user loses the confirm that focus is in the editor.
- **WCAG:** 2.4.7 Focus Visible (Level AA)
- **Recommendation:** Add a `focus-visible:ring-*` treatment, or rely on the browser default.
  (Context: 57 `className` blocks contain `outline-none`; **55 pair it with a focus variant** —
  this is a 2-element slip, not a pattern.)
- **Suggested command:** `/impeccable polish`

---

### [P3] The type scale is locked in `px`, so the user's font-size preference does nothing

- **Location:** `frontend/src/styles/apple.css:147` (`--ap-type-display-hero-size: 56px`),
  `:179-180` (`--ap-type-body-md-size: 17px`), and the rest of the scale.
- **Category:** Theming
- **Impact:** A visitor who raises their browser's default font size gets no change; text only
  grows via full-page zoom. Full-page zoom satisfies **WCAG 1.4.4 Resize Text (Level AA)**, so
  this is a quality issue rather than a violation — but it costs the low-vision audience the
  cheapest accommodation available.
- **Recommendation:** Express the scale in `rem` (or add a `rem` alias layer) and keep `px`
  only for hairlines and optical adjustments.
- **Suggested command:** `/impeccable typeset`

---

### [P3] Exported map snapshots fall back to Roboto

- **Location:** `frontend/src/hooks/useMapSnapshot.ts:122` and `:195` —
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Category:** Theming
- **Impact:** Two occurrences. Map snapshots rendered for export use a generic stack rather
  than `var(--ap-font-text)`, so exported images can differ typographically from the app.
  Cosmetic and off the critical path.
- **Recommendation:** Use the system text token where the snapshot pipeline allows it.

---

### [P3] Dead CSS and dead size declarations

- **Location:** `apple.css:489` — a `[data-theme='dark'] .bg-white\/92` override for a variant
  **never used** in code; `DisasterDetailModalUI.tsx:671` — `min-h-[36px]` overridden by the
  44 px floor.
- **Category:** Implementation Integrity
- **Impact:** Negligible at runtime; each is a small trap for the next reader.
- **Recommendation:** Delete both.

---

### [P3] No `loading="lazy"` on images

- **Location:** `frontend/src/**` — 0 uses.
- **Category:** Performance
- **Impact:** Low: only 17 `<img>` elements exist, and they are avatars and the wordmark; the
  hero uses CSS `background-image` by design (`HeroImageCarousel.tsx:11` documents why the
  hero carries no `<img>`). This is listed only so it is not "missing" from a later pass.
- **Recommendation:** Add `loading="lazy"` + explicit `width`/`height` to below-fold avatars.

---

## Verification log

Everything above rests on a command or an experiment that can be rerun.

**Reproduced gates (all PASS):**

```
check:tokens       333 files · 5,634 palette uses · 0 stock-palette · 100.0 % · 395 hex in 46 files
check:design       216 documents + frontend/src: 89 outstanding, 695 waived, 0 new
check:contrast     161 components: no contrast or inversion defects in either theme
check:contrast:css apple.css overrides match the scanner model
check:important    every !important has a reason to exist
check:residue      one design system: 4 stylesheets, 161 components, no residue
check:svg-tokens   no new raw SVG paint; 101 known literals in 14 files
check:brand        every colour resolves to a declared token
check:prose        no em-dash or en-dash in reader-facing copy
icons:check        icons.ts matches the registry and installed lucide-react
check:bundle       TOTAL (gzip) 1360.5 kB — within budget
check:events-summary  3,062 committed catalog rows match
```

**The `oversized-h1` / `tight-leading` false positives** — four controlled experiments against
`frontend/dist/hazards/flood.html`, each isolating one variable:

| Variant | Result |
|---|---|
| Inline `.hn-static h1` → `12px / line-height: 2` | Still reports "288px h1", "0.13x" → **not** reading the inline shell rule |
| External stylesheet `<link>` removed | Both findings disappear → source is the external CSS |
| Print `h1` `font-size: 18pt` → `20pt` | Reports **"320px h1"** → confirms `pt` parsed as `rem` (20 × 16) |
| Whole `@media print` block deleted | Both findings disappear → confirmed origin |

Corroborating: `grep 288px` over `dist/assets` returns nothing; the built CSS sizes
`.hn-h1, h1` at 28 px → 32 px with `line-height: 1.2`, and the inline shell sets
`.hn-static h1` at 1.9 rem with `line-height: 1.15`.

**The `-0.58em` waiver (673 of 695 waivers)** — verified, not assumed: `-0.58em` appears
**nowhere** in `frontend/src` or the built CSS. Real tracking runs **−0.015 em … +0.012 em**
(`--ap-type-display-hero-track` … `--ap-type-caption-track`). The waiver's stated reason holds.

**`bg-white` in dark mode** — checked and **not** reported. `apple.css:461-530` remaps
`bg-white` and its `/40 /60 /70 /80 /90 /92 /95` variants to `var(--ap-bg-canvas)` under
`[data-theme='dark']` and `.dark`. The uncovered variants used in code are `/10 /15 /20`;
inspection of all call sites (`Navbar`, `CommandPalette`, `WeatherPanel`,
`AppleHazardsBento`) shows these are translucent **hover tints and scrims over dark and hero
surfaces**, where a light tint over dark is the intent — remapping them to the canvas colour
would break them. Verified intentional.

**Also checked and found clean — deliberately *not* reported as issues:**

- **Images:** all 17 `<img>` elements carry `alt` (an earlier line-based grep suggested 12
  missing; multi-line JSX and comments were the false matches). `UserDashboardPage.tsx:210`
  correctly uses `alt=""` for a decorative avatar beside the user's name.
- **Touch gestures:** **0** `onPointerDown/Move/Up` handlers anywhere. The only mouse handlers
  are hover and activity tracking (`LiveMapView.tsx:1407,1481`) and a
  `preventDefault` for text selection (`RichTextEditor`). Maps use Leaflet, the globe uses
  drei `OrbitControls` (both native touch), and all four sliders are native
  `<input type="range">`. `touch-action: manipulation` is set in 7 rules. **UNVERIFIED:**
  no engine was available to synthesise touch, so this is a code-level reading only.
- **Fixed widths:** an initial scan suggested 44; a corrected regex (excluding `min-w-`/`max-w-`)
  found **5** true fixed widths ≥ 100 px, of which 4 are `lg:`-gated and the fifth is a 280 px
  donut that fits a 320 px viewport. Not an issue.
- **Horizontal overflow:** `overflow-x: clip` on `html`/`body` is paired with **47** intentional
  `overflow-x-auto` regions. `EmdatComparisonChart` scrolls horizontally below 860 px rather
  than shrinking axis labels below the legibility floor — a documented, deliberate
  WCAG 1.4.4 / 1.4.10 trade-off, not a defect.
- **Heading structure:** exactly **1 `<h1>`** per prerendered route (checked across
  `index`, `hazards/flood`, `dashboard`, `analytics`).
- **`will-change`:** 3 uses only — disciplined, not the blanket overuse this check looks for.
- **`prefers-reduced-motion`:** the global `0.01ms` collapse at `index.css:1235` is **followed
  by an intentional alternative** at `:1244-1249` — `[role="progressbar"]`,
  `[data-keep-reduced-motion]` and `.hn-spinner` are restored to `animation-duration: 1s`
  `infinite`, so loaders keep signalling progress instead of freezing at 0.01 ms. This is the
  behaviour the audit looks for, not the anti-pattern. **Positive finding.**
- **Landmarks and skip link:** `<main id="main-content" tabIndex={-1}>`, `<header>`, `<nav>`,
  `<footer>`, and a "Skip to main content" link (`App.tsx:328`).

---

## Patterns & Systemic Issues

1. **The gates measure token hygiene; they do not measure what a visitor waits on.**
   `check:bundle` sums every chunk in `dist` and passes at 1,360.5 kB gzip while the landing
   route ships 713.5 kB gzip eagerly — 1.8× the <400 kB initial-shell target written in the
   gate's own header. `check:tokens` reports 100 % compliance while the type scale ignores the
   user's font-size preference. Both are correct measurements of the wrong thing.
2. **A detector that reads print CSS will report print CSS.** Its two largest rule buckets
   (65 findings) come from `@media print`. Any future target list that includes a stylesheet
   with a print block will reproduce this.
3. **Escape hatches that are never used become traps.** `data-compact-target` exists
   specifically so compact controls can opt out of the 44 px floor, and has zero users — so
   five controls carry size classes that cannot take effect.
4. **Specification lag, not code drift.** The mono, Bengali and print faces are correctly
   tokenised in `apple.css` but undeclared in `DESIGN.md`, so the spec-vs-code gate reports
   correct code as violations. This is the one place where the documented system is behind the
   built one.

---

## Positive Findings

- **One design system, genuinely.** `check:residue` confirms 4 stylesheets and 161 components
  with no residue after three dead systems were deleted. The migration comment at the top of
  `index.css` names each removed system and forbids reintroduction.
- **100 % palette-token compliance** — 5,634 uses, zero resolving to Tailwind's stock palette.
- **Dual-theme contrast is machine-verified, not eyeballed.** `check:contrast` evaluates 161
  components against **both** backgrounds in **both** themes; `check:contrast:css` asserts the
  override table still matches the scanner model, so the two files cannot silently diverge.
- **A systemic contrast guard.** `index.css:2689` promotes `carbon-40` (2.57:1) and
  `carbon-50` to `carbon-60` (6.87:1) in light mode unless inside an explicit dark container —
  a whole class of defects prevented by construction rather than by review.
- **Reduced motion is handled with judgement**, not with a global kill (see Verification log).
- **Low-bandwidth mode is a first-class design input.** `lib/bandwidth.ts` derives a
  recommendation from `saveData`, `effectiveType`, `deviceMemory`, `hardwareConcurrency` and
  online state, with a user override that always wins, and the CSS collapses animation *and*
  `backdrop-filter` on that signal. This is rare and correct.
- **Pre-hydration theming is solved twice over** — a `prefers-color-scheme` arm that needs no
  JavaScript, plus an inline boot script that honours an explicit choice. The prior audit's
  F-01 white-flash defect is genuinely closed.
- **Documentation lives next to the decision.** Nearly every non-obvious rule carries the
  measured ratio and the audit ID that produced it, including where a rule was *removed* and
  why (e.g. the retired `::before` touch-target overlay, which overlapped in the footer's
  wrapped layout — a hit area larger than its target is correctly called a bug).
- **Waivers are honest and falsifiable.** Each names the check that covers the same risk, and
  the 673-item `-0.58em` waiver was confirmed correct on inspection.
- **Code splitting is real:** 35 `lazy()` route boundaries.
- **Semantic markup is the default:** only 2 clickable non-interactive elements in 197 files;
  218 `aria-label` and 41 `aria-labelledby` uses.

---

## Recommended Actions

1. **[P1] `/impeccable optimize`** — Cut the landing route's eager payload from 713.5 kB gzip
   toward the documented <400 kB target: convert `useMapSnapshot.ts:2` and `pdfExport.ts:1-2`
   to dynamic imports, defer `vendor-recharts`, and add a route-scoped budget to
   `check-bundle.mjs` so the target is enforced rather than commented.
2. **[P1] `/impeccable harden`** — Replace the clickable `<div>` at
   `StructuredAdvisoryRenderer.tsx:191` with a `<button>` carrying `aria-expanded` /
   `aria-controls`; add an `Escape` handler to the `PdfExportButton.tsx:265` backdrop.
3. **[P1] `/impeccable document`** — Reconcile `DESIGN.md` typography with the shipped stacks
   (mono, Bengali, print/media exemptions), keep the print sheet out of the detector's
   targets, and re-baseline so the ratchet measures the product instead of a `pt`→`rem`
   misparse.
4. **[P2] `/impeccable adapt`** — Resolve the 44 px floor against the compact map/detail
   controls: opt out with `data-compact-target="true"` where compact is intended, otherwise
   delete the size classes that cannot take effect.
5. **[P3] `/impeccable typeset`** — Move the type scale from `px` to `rem` so the user's
   font-size preference is honoured.
6. **`/impeccable polish`** — Final pass: restore focus rings on the two `RichTextEditor`
   textareas, drop the unused `bg-white/92` override and the overridden `min-h-[36px]`.

**Before any of these:** run `scripts/audit_frontend_design.mjs` against a real browser
(`PLAYWRIGHT_CHROMIUM_PATH`) to close the UNVERIFIED gaps — tab order, keyboard traps,
measured overflow at 375/768/1440, and synthesised touch gestures on the map and sliders.

---

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.
