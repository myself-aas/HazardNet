# Frontend Design-System Audit — HazardNet Web App
### `/impeccable audit` (skill v4.5.0 · CLI 4.1.0) + Apple/Meta adoption specification

**Date:** 2026-10-02
**Target:** `frontend/` (178 `.tsx`, 52 `.ts`, 4 `.css` → 230 code files · 33 pages · 198 prerendered routes)
**Branch:** `arena/01a0fb7b-hazardnet` @ `73fe9c5`
**Supersedes / extends:** `2026-10-01-frontend-design-system-audit.md`, `2026-09-30-frontend-reaudit.md`, `2026-09-30-frontend-design-audit.md`

---

## 0 · Scope, method and evidence provenance

### What this audit is

A **code-level technical audit** of the HazardNet frontend design system across the five
`/impeccable audit` dimensions (Accessibility, Performance, Responsive, Theming,
Implementation Integrity), followed by **Part II**, a complete numeric specification of what
it would take to adopt the Apple (`apple.com`) and Meta (`meta.com`) frontend UI/UX/layout
systems.

### How the evidence was produced — and what it cannot cover

| # | Step | Tool / command | Evidence produced |
|---|---|---|---|
| 1 | Skill + playbook load | `impeccable@latest context --target frontend/src/App.tsx`; `SKILL.md` v4.5.0, `reference/audit.md` | Rubric (5 × 0–4), P0–P3 severity, allowed command list |
| 2 | Mechanical detector | `impeccable detect frontend/src frontend/dist --no-advisory` | 3,471 raw findings (1 in `src`, 3,470 in `dist`) |
| 3 | Project gates | `npm run check:tokens` · `check:fonts` · `check:design` · `check:bundle` | 99.8 % token compliance; 0 WOFF2; 3,439 outstanding design findings |
| 4 | Contract tests | `npx jest --testPathPattern meridian` | 121 / 121 passing |
| 5 | Static code scan | purpose-written scanner over 230 code files | 40 rules, counts + file:line samples (§5) |
| 6 | Contrast computation | WCAG 2.1 relative-luminance implementation, run against the *real* token values | 17 measured ratios (§5, A11Y-01) |
| 7 | Prerendered-surface audit | jsdom over all 198 `dist/**/*.html` | 1,385 structural findings (§5, INT-04) |
| 8 | Production build | `vite build && prerender` | JS 6,447.9 KB · CSS 247.0 KB · dist 126 MB |
| 9 | Rendered-DOM a11y probe | jsdom against the live dev server | **inconclusive — see limitation below** |

**Limitation, stated plainly (the playbook requires it):** no browser engine could be
installed in this sandbox — `npx playwright install chromium` and the Puppeteer download used
by `impeccable detect --url` both failed on network restrictions, and no system Chrome/
Chromium exists. jsdom also cannot execute the app's ES-module bundle, so the React DOM was
never rendered.

**Consequence:** every finding below is either (a) a **static source fact** (a literal, an
import, a file size), (b) a **computed fact** (a WCAG ratio computed from real token values),
or (c) a **structure fact about the 198 prerendered HTML documents** that a crawler and a
first-paint visitor actually receive. Nothing below is a claim about **computed layout,
paint, gesture behaviour or scroll**. Three audit sub-dimensions therefore stayed untested
and are marked **[UNVERIFIED]** where they appear:

- touch-gesture correctness under synthesized touch (§5 RES-03 — code tells only);
- real rendered contrast of the 196 low-contrast class instances (§5 A11Y-01 — the *token
  values* are measured, the *pairing in situ* is inferred from class names);
- `document.fonts` emptiness at runtime — inferred from 0 `@font-face` + 0 font files + 0
  remote font URLs, not observed in a browser.

Where the prior 2026-10-01 audit rendered the app in a real browser, its rendered findings
are carried forward as prior evidence and cited as such.

---

## 1 · Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | **2** / 4 | ~196 text instances measured below WCAG AA (worst 1.28:1); ~225 buttons with no accessible name; 19/19 images with no `loading` or dimensions. Global `:focus-visible` ring and skip link are correctly in place. |
| 2 | Performance | **1** / 4 | 6,447.9 KB JS shipped; one lazy route chunk is 1,510.1 KB because a 1,484.6 KB JSON is statically imported; **113 MB of unreferenced hero video** in `dist`; **8 concurrent unbounded `requestAnimationFrame → setState` loops**. |
| 3 | Responsive Design | **2** / 4 | 75 sub-44px control heights defeat the base 44px rule; 43 fixed-px widths; 47 horizontal-scroll workarounds; effectively a 2-step breakpoint system (`sm:` 823 vs `md:` 172, `lg:` 200, `xl:` 21). Works on mobile, with systematic edge failures. |
| 4 | Theming | **2** / 4 | 99.8 % palette-family token compliance (real, and genuinely good) **but** 721 raw hex + 113 raw `rgb()` literals in components vs 32 `var(--token)` uses; **dark mode is dead** — 248 `dark:` variants with no activation path; Meridian v3.0 is consumed by 2 of 178 components. |
| 5 | Implementation Integrity | **1** / 4 | Three diverged token sources with contradictory MUST rules; `.hn-btn-*` documented as the component layer has **0 usages**; **0 of the 12 P1 findings in yesterday's audit are fixed**; `check:fonts` is vacuous; the design gate's 3,439 "outstanding" findings are ≥94 % false positives. |
| | **Total** | **8 / 20** | **Poor — major overhaul** |

**Rating band:** 18–20 Excellent · 14–17 Good · 10–13 Acceptable · **6–9 Poor** · 0–5 Critical.

**Delta vs 2026-10-01 (10/20 → 8/20).** Not because the code regressed: it did not change
(`git log` shows one merge commit touching these paths). The two points are the newly
measured facts a code scan can see that a browser pass does not weight — the 113 MB dead
video, the 1,510 KB statically-imported-JSON chunk, and the fact that none of yesterday's
12 P1s were actioned. If anything the missing rendered pass makes this score *conservative*:
it is the score the code alone earns.

---

## 2 · Implementation Integrity Verdict — **FAIL**

**Start here.** The pass/fail question in the playbook is: *does the implementation express a
coherent product-specific system?*

Split verdict:

- **Product-specific content and intent: PASS.** HazardNet's copy, provenance discipline,
  honest-empty-state rule, refusal to invent numbers, bilingual obligation and safety
  framing are genuinely product-specific, unusually rigorous, and internally consistent.
  Nothing here is interchangeable with an unrelated product. This is the strongest part of
  the codebase and it should be protected through any redesign.
- **The design-system layer: FAIL.** The system that is documented is not the system that
  ships, and the gap is not a rounding error.

Verified evidence:

1. **Three sources of truth, contradictory MUST rules.**
   `frontend/src/design-system/tokens.ts` (HDS v2.2: `radii.control: 2`, `card: 16`) ·
   `packages/design-system/src/meridian.ts` + `styles/meridian.css` (HDS v3.0: concentric
   4/8/12/16/24/32, `console` vs `editorial` tracks) · `frontend/src/index.css` (2,772 lines
   containing both). `DESIGN_SYSTEM.md` §5 documents `.hn-btn-primary` with
   "unified 2px radius"; `index.css:161` sets `--hn-radius-control: 8px` and
   `--hn-radius-card: 16px`; `meridian.css` sets `--mrd-radius-*`. A reader of the docs and a
   reader of the CSS learn different systems.

2. **The documented component layer does not exist in code.**
   `DESIGN_SYSTEM.md` §5 presents `.hn-btn-primary`, `.hn-btn-secondary`, `.hn-btn-outline`,
   `.hn-btn-ghost`, `.hn-card`, `.hn-card-elevated` as "reusable global component classes for
   instant reusability across any page." Measured usage across all 178 `.tsx` files:
   **0 instances of any `hn-btn-*` or `hn-card*` class.** This is not drift; the thing the
   documentation is about has no consumers.

3. **Zero remediation of the prior audit's P1s.** All twelve are re-measured as
   **still open** (§7). The `!important` count is still exactly 402. `[lang="bn"]` is still
   used where `:lang(bn)` is required. The `manualChunks` rules are byte-identical. The rAF
   loop is byte-identical.

4. **The gate cannot see what breaks.** `check:design` reports *"3,439 outstanding, 1 waived,
   0 new"* and exits 0. `check:fonts` reports *"0 WOFF2 file(s), 0.00 KiB"* and exits 0 — a
   gate that passes on the exact condition it exists to prevent (`INT-02`). The 7 design
   jest suites (49 tests) and the 121 Meridian contract tests all pass while P1-01…P1-12
   hold, because they assert **token values in a file**, not **the rendered cascade**.

5. **Detector output is structurally unusable.** 3,470 of 3,471 findings live in the
   prerendered static shell, and I verified the mechanism (§6): the shell's
   `@media (prefers-color-scheme: dark)` block is read without media-query cascading, so
   light-scheme foregrounds get paired with dark-scheme backgrounds. ≥94 % are false
   positives, and the *real* failures are not in the gate's output at all.

---

## 3 · Executive Summary

- **Audit Health Score: 8/20 (Poor — major overhaul).**
- **Issues found: P0 · 3 · P1 · 10 · P2 · 9 · P3 · 5 = 27.**
  (P1: THE-01, INT-01…INT-05, PERF-03, PERF-04, A11Y-02, RES-01 ·
  P2: THE-02, RES-02, RES-03, A11Y-03, A11Y-04, INT-06, INT-07, TYPE-01, TYPE-02)
- **Detector: 3,471 raw findings → 1 true positive, 3,470 verified false positives** (§6).
- **Prior audit: 12 P1s → 0 fixed** (§7).

**Top five critical issues**

1. **[P0] PERF-01 — 113 MB of unreferenced hero video is committed to Git and shipped to
   every deployment.** `frontend/public/hero-section/` contains five MP4s totalling
   115,561.3 KB (58.6 MB at 3840×2160 alone). `lib/heroMedia.ts:16` states the constants are
   *"retained but unreferenced — retired from the hero."* They are: zero references outside
   the file that declares them. `dist/` is **126 MB**, of which **113 MB** is dead video.

2. **[P0] PERF-02 — eight concurrent unbounded `requestAnimationFrame → setState` loops.**
   `lib/motion-interpolate.ts:41-46` runs a rAF loop with **no termination condition**; it
   calls `setFrame()` every frame until unmount. `useWebFrame(30)` is called at
   `App.tsx:90` and `App.tsx:241`, plus `Navbar.tsx:223`, `Navbar.tsx:302`,
   `HeroCinematicBackground.tsx:27`, `FrontDoor.tsx:349`, `frontdoor/LiveStatusStrip.tsx:103`,
   `frontdoor/RunVisual.tsx:60`. On `/` that is ~8 loops, each driving a `setState` on a
   component high in the tree, **forever**, to animate a 6-frame (0.2 s) fade-in.

3. **[P0] A11Y-01 — ~196 text instances measured below WCAG AA, worst 1.28:1.** Computed from
   the real token values: `text-carbon-10` `#e3e3e3` on white = **1.28:1** (13 light-mode
   uses), `text-carbon-20` `#d1d1d1` = **1.53:1** (39), `text-carbon-30` `#b9b9bb` =
   **1.96:1** (66), `text-carbon-40` `#959599` = **2.98:1** (58), `text-carbon-50` `#77777a`
   = **4.46:1** (20 — 0.04 short). Apple's own published minimum is 11pt; the codebase ships
   `text-[8px]` (4), `text-[9px]` (8) and `text-[2.2px]` (1).

4. **[P1] THE-01 — dark mode is dead code.** `@custom-variant dark (&:is(.dark *))`
   (`index.css:15`) means every `dark:` utility requires a `.dark` ancestor class. Nothing in
   the application ever sets it: `useMeridianTheme` (`components/meridian/motion.ts:176`) is
   **defined and never imported**, and no `classList.add('dark')` exists anywhere. Result:
   **248 `dark:` variants are inert**, including every `dark:bg-carbon-90` /
   `dark:text-carbon-10` pairing that is the *only* thing making the dark-surface text
   legible.

5. **[P1] INT-01 — Meridian (HDS v3.0) is 1.6 % adopted.** 121 contract tests pass and the
   token layer is machine-verified — and then **87 `mrd-*` class instances exist, in 2 of 178
   component files** (`Navbar.tsx`, `FrontDoor.tsx`). `MIGRATION_PLAN.md` measures 5,289
   legacy instances to migrate.

**Recommended next step.** Do not start the Apple/Meta adoption before P0-01, P0-02 and
INT-02 are closed: the adoption is a *typography and layout* programme, and HazardNet cannot
ship typography at all today (0 font files, 0 `@font-face`, 0 remote URLs — INT-02). Fix the
font pipeline first; everything in Part II downstream of type is otherwise unbuildable.

---

## 4 · Method — step by step

Reproducible from a clean checkout. Node 22.22.3, npm 10.9.8.

```bash
# 1 Skill + playbook (once per session)
npx --yes impeccable@latest context --target frontend/src/App.tsx
#   → NO_PRODUCT_MD (no PRODUCT.md exists); SCOPED_EXISTING_ALLOWED;
#     hasVisualImplementation: true; MANUAL_DETECTOR_REQUIRED

# 2 Install
cd frontend && npm install --no-audit --no-fund          # 1,029 packages
cd ..        && npm install --no-audit --no-fund --ignore-scripts   # 1,483 packages

# 3 Gates
npm run check:tokens   # 288 files · 6,377 palette uses · 99.8 % · PASS
npm run check:fonts    # 0 WOFF2 file(s), 0.00 KiB · PASS (vacuous — INT-02)
npm run check:design   # needs dist; run after step 4

# 4 Build + prerender
cd frontend && npm run build        # vite build + scripts/prerender.mjs → 198 documents

# 5 Detector
npx --yes impeccable@latest detect frontend/src frontend/dist --no-advisory
#   → frontend/src: 1 finding   frontend/dist: 3,470 findings

# 6 Contract tests
npx jest --config jest.config.cjs --rootDir . --testPathPattern meridian
#   → 121 passed

# 7 Measurement (scripts reconstructed in Appendix A)
node scan.mjs          # 40 rules over 230 code files
node contrast.mjs      # WCAG 2.1 ratios from real token values
node static-html.mjs   # jsdom over 198 dist documents
```

**Detector invocation note (per skill Setup):** `impeccable detect` was run **once**, at the
end, over both `frontend/src` and `frontend/dist`, as `MANUAL_DETECTOR_REQUIRED` directs. It
was deliberately not run earlier during analysis.

**Stated deviation:** the skill's Setup asks for `PRODUCT.md`/`DESIGN.md`, which do not exist
in this repository. Per `SCOPED_EXISTING_ALLOWED`, an `audit` is a narrow refinement command
and proceeded on the incumbent implementation as authority. `/impeccable init` is offered as
a follow-up (§12), not a blocker.

---

## 5 · Detailed Findings by Severity

Severity per the playbook: **P0** blocks task completion · **P1** significant difficulty or
WCAG AA violation · **P2** annoyance with workaround · **P3** polish.

---

### P0 — Blocking

#### [P0] PERF-01 · 113 MB of unreferenced hero video is committed, built and deployed

- **Location:** `frontend/public/hero-section/` (5 files, 115,561.3 KB) → copied verbatim to
  `frontend/dist/hero-section/` (113 MB of a 126 MB `dist`)
- **Category:** Performance · Implementation Integrity
- **Evidence:**
  ```
  58,577.1 KB  Hero_Section_hd_3840_2160_30fps.mp4
  25,880.7 KB  Hero_Section_hd_2560_1440_30fps.mp4
  16,161.9 KB  Hero_Section_hd_1920_1080_30fps.mp4
   8,780.1 KB  Hero_Section_hd_1280_720_30fps.mp4
   5,371.7 KB  Hero_Section_sd_960_540_30fps.mp4
  ```
  `frontend/src/lib/heroMedia.ts:16`: *"The local `EARTH_HERO_VIDEO_*` constants below are
  retained but unreferenced…"*. A repo-wide grep for `EARTH_HERO_VIDEO` and `hero-section`
  returns **only** the declarations in `heroMedia.ts` and the comments describing them as
  unreferenced. All five are `git ls-files`-tracked.
- **Impact:** every `npm run build` copies 113 MB; every deployment uploads 113 MB; every
  fresh clone downloads 115 MB; the service worker's precache manifest is inflated; Vercel
  function/deployment size budgets are put at risk. For a product whose stated audience is
  *"a low-end Android, in direct sunlight, sometimes offline"* this is the single most
  expensive defect in the repository.
- **Standard:** — (engineering hygiene); directly contradicts the repo's own edge-first
  contract in `heroMedia.ts:1-18` and the font-payload budget discipline in `check:fonts`.
- **Recommendation:** `git rm --cached` the five files from `public/hero-section/` (keep the
  copies in `frontend/assets/hero-section/`, which is outside `public/` and therefore not
  deployed), delete the five `export const EARTH_HERO_VIDEO_*` lines, and add
  `frontend/public/hero-section/` to `.gitignore`. Add a `check:assets` gate that fails if
  any file in `public/` exceeds 1 MB. **Expected: −113 MB from `dist`, −115 MB from the repo.**
- **Suggested command:** `/impeccable optimize`

#### [P0] PERF-02 · Eight concurrent unbounded rAF → setState loops

- **Location:** `frontend/src/lib/motion-interpolate.ts:41-46`; call sites `App.tsx:90`,
  `App.tsx:241`, `Navbar.tsx:223`, `Navbar.tsx:302`, `HeroCinematicBackground.tsx:27`,
  `pages/FrontDoor.tsx:349`, `components/frontdoor/LiveStatusStrip.tsx:103`,
  `components/frontdoor/RunVisual.tsx:60`
- **Category:** Performance
- **Evidence:** the loop body is
  ```js
  const tick = (now) => {
    if (start === null) start = now;
    const elapsed = (now - start) / 1000;
    setFrame(Math.floor(elapsed * fps));   // ← setState every frame
    raf = requestAnimationFrame(tick);     // ← no completion condition
  };
  ```
  There is no `if (frame > N) return`, no cleanup short of unmount. The only consumer is
  `interpolate(frame, [0, 6], [0, 1], …)` — a **0.2 s** fade. `App.tsx:241` is inside
  `AppContent`, so each `setFrame` re-renders the entire route subtree, including the map,
  charts and district tables, **indefinitely**.
- **Impact:** on the class of device this product is built for (≤2 GB RAM, ≤4 cores — the
  repo's own `useBandwidthMode` thresholds), a permanent 30–60 Hz React render loop is the
  difference between a usable page and a hung tab, and it drains battery on a phone that may
  be the user's only warning device.
- **Standard:** — (performance); the file's own header at line 14 claims *"no layout thrash"*,
  which is true of the *properties animated* and false of the *render cost incurred*.
- **Recommendation:** replace the whole `useWebFrame` mechanism with a CSS keyframe or a
  Framer-Motion transition that terminates. Minimum viable fix: bail out of the loop once
  every registered range has completed —
  `if (elapsed * fps > MAX_FRAME) return;` — and memoize `AppContent`'s subtree. Prefer
  deletion: Remotion exists in this dependency graph only to supply `interpolate` and
  `Easing` (`motion-interpolate.ts:20`), and `remotion` is present in the **main** bundle
  (`dist/assets/index-BFK4sqTm.js`, 420.7 KB).
- **Suggested command:** `/impeccable optimize`

#### [P0] A11Y-01 · ~196 text instances measured below WCAG AA; worst 1.28:1

- **Location:** `text-carbon-10/20/30/40/50` utilities across the component tree; token
  values in `frontend/src/styles/nasa-hds.css:24-34`
- **Category:** Accessibility
- **Evidence** (WCAG 2.1 relative luminance, computed from the real token hex values):
  | Utility | Hex | on `#ffffff` | Light-mode uses | Verdict |
  |---|---|---|---|---|
  | `text-carbon-10` | `#e3e3e3` | **1.28:1** | 13 (of 21, minus 8 `dark:`) | FAIL |
  | `text-carbon-20` | `#d1d1d1` | **1.53:1** | 39 (of 46, minus 7) | FAIL |
  | `text-carbon-30` | `#b9b9bb` | **1.96:1** | 66 (of 76, minus 10) | FAIL |
  | `text-carbon-40` | `#959599` | **2.98:1** | 58 (of 96, minus 38) | FAIL |
  | `text-carbon-50` | `#77777a` | **4.46:1** | 20 (of 21, minus 1) | FAIL by 0.04 |
  | `text-carbon-60` | `#58585b` | 7.09:1 | 907 | AAA ✅ |
  | `text-carbon-70` | `#444447` | 9.71:1 | 370 | AAA ✅ |
  | `text-carbon-80` | `#2e2e32` | 13.52:1 | 350 | AAA ✅ |
  | `text-carbon-90` | `#17171b` | 17.88:1 | 617 | AAA ✅ |

  Size floor, measured: `text-xs` (12px) **1,265 uses** · `text-[11px]` **156** ·
  `text-[10px]` **142** · `text-[10.5px]` **6** · `text-[9px]` **8** · `text-[8px]` **4** ·
  `text-[2.2px]` **1**. Apple's published minimum is **11pt** on iOS/iPadOS and 12pt on
  visionOS [1](https://developer.apple.com/design/human-interface-guidelines/typography);
  Meta's own scale bottoms out at **12px** caption.
  **[UNVERIFIED]** which of the 196 are rendered text vs. icon fills or decorative glyphs —
  e.g. `DisasterDetailModalUI.tsx:534` uses `text-carbon-30` for a `•` separator, which is
  decorative and exempt. The token *ratios* are certain; the *count of violations* is
  ±~40.
- **Impact:** a farmer reading a severity caption at 1.28:1 on a cracked screen in monsoon
  light cannot read it. On a **safety early-warning service** this is the highest-severity
  class of defect the product can carry.
- **Standard:** **WCAG 2.1 SC 1.4.3 Contrast (Minimum) — Level AA**, 4.5:1 normal text,
  3:1 large text. All five rows above fail even the 3:1 non-text threshold except
  `carbon-40` at 2.98:1 (fails by 0.02).
- **Recommendation:** (1) delete `text-carbon-10/20/30` from every non-decorative position —
  a codemod over 118 sites; (2) promote `text-carbon-40` → `text-carbon-60` (7.09:1) except
  where it sits on a dark panel; (3) add a **tint-aware** contrast test — the prior audit
  correctly identified that tokens were "validated on white only" and this is still true;
  (4) enforce a hard 12px floor in ESLint and raise the body floor to 17px per Part II R-01.
- **Suggested command:** `/impeccable colorize`, then `/impeccable typeset`

---

### P1 — Major

#### [P1] THE-01 · Dark mode is dead code — 248 `dark:` variants with no activation path
- **Location:** `index.css:21` (`@custom-variant dark (&:is(.dark *))`);
  `components/meridian/motion.ts:176` (`useMeridianTheme`)
- **Category:** Theming
- **Evidence:** a repo-wide search for `classList.*dark`, `setTheme`, `localStorage.*theme`
  and `documentElement.classList` returns **no code that applies `.dark`**.
  `useMeridianTheme` — a complete theme controller with `system` resolution, a
  `matchMedia('(prefers-color-scheme: dark)')` listener and a `localStorage` setter — has
  **zero importers**. 248 `dark:` utility instances across 230 files therefore never resolve.
- **Impact:** users with a system dark preference get the light theme regardless; and the
  dark-safety net in components (`dark:text-carbon-10` on `dark:bg-carbon-90`) is inoperative,
  so any future dark rollout will expose unreadable text that *looks* already handled.
- **Standard:** — (theming integrity); Meridian ships three complete themes (`light`, `dark`,
  `highContrast`) that no user can reach.
- **Recommendation:** wire `useMeridianTheme` into `App.tsx` (it already exists and is
  correct) — apply `document.documentElement.classList.toggle('dark', resolved === 'dark')`
  and set `color-scheme`. Then run `/impeccable audit` again: expect a new cluster of real
  dark-surface contrast failures that the inert variants have been masking.
- **Suggested command:** `/impeccable polish`

#### [P1] INT-01 · Meridian v3.0 is 1.6 % adopted — verified tokens, unverified usage
- **Location:** `packages/design-system/src/meridian.ts`, `frontend/src/styles/meridian.css`,
  `frontend/src/components/meridian/primitives.tsx`
- **Category:** Implementation Integrity
- **Evidence:** 121 Meridian contract tests pass (`meridianContrast.test.js`,
  `meridianParity.test.js`). But consumption is: `MERIDIAN` imported by **1** of 230 code
  files (`components/meridian/primitives.tsx`); `mrd-*` classes referenced in **2** of 178
  `.tsx` files (`Navbar.tsx`, `FrontDoor.tsx`) for **87 class instances** total, against the
  5,289 legacy instances `MIGRATION_PLAN.md` §0 counts. Meanwhile **721 raw hex literals** and
  **113 raw `rgb()` literals** sit in components versus **32 `var(--token)` uses** — the token
  layer is real and the components do not consume it.
- **Impact:** the 99.8 % figure from `check:tokens` describes **Tailwind palette-family
  aliases** (`bg-carbon-*` → HDS values), which is a genuinely good achievement, but it is
  not the same as components consuming semantic roles. `bg-carbon-*` is a *hue step*, not a
  *role*: nothing stops `bg-carbon-90` being used for both a dark panel and a button, and
  `text-carbon-60` being used for both secondary copy and a disabled label.
- **Standard:** — (design-system integrity)
- **Recommendation:** execute `MIGRATION_PLAN.md` §1.2 (Layer A token bridge) before any
  further surface work: it is the highest-leverage, lowest-risk item in the plan and it is
  where the Apple/Meta adoption in Part II must land. Add a gate that fails on
  `#[0-9a-f]{3,8}` inside `className=` in any `.tsx`.
- **Suggested command:** `/impeccable extract`

#### [P1] INT-02 · No web font is ever loaded — `check:fonts` passes on 0 bytes
- **Location:** `frontend/src/index.css:22-27, 342-383, 852-868, 1352-1395`;
  `scripts/check-font-payload.mjs`
- **Category:** Implementation Integrity · Typography
- **Evidence:** the codebase declares **nine font families** — `Inter`, `Roboto`,
  `Plus Jakarta Sans`, `Instrument Sans`, `Public Sans Web`, `Baloo Da 2`, `DM Mono`,
  `JetBrains Mono`, `Hind Siliguri`, `Noto Sans Bengali`, `Noto Serif Bengali`,
  `Anek Bangla`. Measured: **0 `@font-face` rules**, **0 font files** (`.woff/.woff2/.ttf/.otf`)
  anywhere in `frontend/`, **0 remote font URLs** (no `fonts.googleapis.com`, no
  `fonts.gstatic.com`, no `@fontsource`). Output of the repo's own budget gate:
  ```
  [fonts] 0 WOFF2 file(s), 0.00 KiB
  ```
  and it exits **0**.
- **Impact:** every typographic decision in `DESIGN_SYSTEM.md` §3 and `MERIDIAN.md` §4.2 is
  inert. The product renders in whatever `system-ui`/Segoe/Roboto the device has. The
  bilingual contract fails specifically: `index.css:22-23` sets
  `--font-sans-bn: 'Hind Siliguri', 'Noto Sans Bengali', …` — neither is present, so Bengali
  falls through to a generic `sans-serif`, and `index.css:2768`
  (`body, body * { font-family: var(--font-sans-en); }`) is a Latin stack that also wins over
  the Bengali rule for Bengali text.
- **Standard:** — (contract breach against the repo's own "no remote font URL" and 50 KB
  budget rules, which are honoured so literally that the fonts were never added).
  **[UNVERIFIED]** at runtime: inferred from 0+0+0, not from `document.fonts.size` in a
  browser (the 2026-10-01 audit did observe `document.fonts` empty on all 25 routes).
- **Recommendation:** this is **the gate on Part II**. Subset three faces — display, text,
  Bengali — to WOFF2 under a 50 KB total, add `@font-face` with `font-display: swap`,
  `unicode-range` splits for the Bengali block (U+0980–U+09FF), and **make `check:fonts`
  fail when the count is 0**. Then fix `index.css:2768` (it defeats the Bengali stack) and
  switch `[lang="bn"]` → `:lang(bn)`.
- **Suggested command:** `/impeccable typeset`

#### [P1] PERF-03 · One lazy route chunk is 1,510.1 KB because a 1,484.6 KB JSON is statically imported
- **Location:** `frontend/src/pages/HistoricalCatalogPage.tsx:11-15`
- **Category:** Performance
- **Evidence:**
  ```ts
  import masterEventsData from '../../public/data/historical/events-master.json';
  import vulnerabilityData from '../../public/data/historical/districts-vulnerability.json';
  import trendData from '../../public/data/historical/temporal-trends.json';
  import distributionData from '../../public/data/historical/hazard-distribution.json';
  import catalogData from '../../public/data/historical/hazard-catalog-index.json';  // 1,484.6 KB
  ```
  → `dist/assets/HistoricalCatalogPage-C4WDxqR-.js` = **1,510.1 KB**, larger than
  `vendor-react` (467.7 KB) + `vendor-recharts` (393.1 KB) + `vendor-leaflet` (183.4 KB)
  combined. Total `dist/assets/*.js` = **6,447.9 KB**. Single CSS file = **247.0 KB** on
  every route.
- **Impact:** any visitor to `/archive`, `/history`, `/historical` or `/events` downloads
  1.5 MB of JSON-as-JS on a 2G-class connection. The JSON cannot be cached separately from
  the chunk, cannot be streamed, and is parsed on the main thread.
- **Standard:** — (performance); directly contradicts the "edge-first, low-bandwidth" premise
  stated in `App.tsx` route-splitting comments and `useBandwidthMode`.
- **Recommendation:** move all five to `fetch()` inside the lazy route (or dynamic
  `import()` with a JSON module + `/* webpackIgnore */`-equivalent), so the payload is
  cacheable, streamable and out of the JS graph. Split the single 247 KB CSS per-route or
  per-track. Set a per-chunk budget gate at 300 KB.
- **Suggested command:** `/impeccable optimize`

#### [P1] A11Y-02 · ~225 interactive controls with no accessible name
- **Location:** across the tree; heaviest in `ChatBot.tsx`, `BangladeshSvgMap.tsx`,
  `CommandPalette.tsx`
- **Category:** Accessibility
- **Evidence:** **386 `<button>` elements** versus **161 `aria-label` attributes** across 178
  `.tsx` files. A heuristic scan for `<button` opening tags with neither an `aria-label` nor
  text content on the same line returns **380** (the prior audit found, by rendering,
  **5 unlabeled `<select>`s** and named them — still unfixed). Icon-only buttons are the
  dominant pattern (`MaterialIcon` is imported by 61 files).
- **Impact:** a screen-reader user hears "button, button, button" across the map toolbar, the
  chat launcher, the command palette and the district table controls — on a service whose
  entire value is *which district is under warning*.
- **Standard:** **WCAG 2.1 SC 4.1.2 Name, Role, Value (Level A)**;
  **SC 2.4.6 Headings and Labels (AA)**.
- **Recommendation:** `MeridianButton` already solves this correctly —
  `primitives.tsx` exposes `iconOnly` with a **required-by-contract** `accessibleName` prop
  baked into `.mrd-btn`. Adopting the primitive across the tree closes this finding as a side
  effect of INT-01. Until then, add `eslint-plugin-jsx-a11y` (absent today) to block
  regressions.
- **Suggested command:** `/impeccable harden`

#### [P1] INT-03 · Prerendered first paint contradicts the design system
- **Location:** all 198 `dist/**/*.html` documents; the inline `<style>` block (59
  `.hn-static` rules)
- **Category:** Implementation Integrity · Theming
- **Evidence:** every prerendered document ships its own `<style>` with **20 hard-coded hex
  literals** (`#ffffff #17171b #444447 #0b3d91 #ea6f24 #fce3ca #3b1b00 #58585b #e3e3e3
  #b9b9bb #47da84 #f6f6f6 …`), `border-radius: 0`, and `font-family: "Inter"` — a face the
  app does not ship. Measured across the 198 documents: **197/198** carry all three defects.
  The rationale is in the file (`"values are literals here because this CSS ships before the
  app's stylesheet does"`), which is sound reasoning for *timing* and unsound for *values*:
  the literals could be the same HDS custom properties, since `:root` is available in the
  same document.
- **Impact:** the first thing a slow-connection user and every crawler sees is a **square
  cornered, Inter-named** page in a system that spent `MERIDIAN.md` arguing for concentric
  soft radii and an open-source display face. Then the CSS arrives and the page re-shapes —
  a visible reflow on exactly the connection class the product targets.
- **Standard:** — (design-system integrity)
- **Recommendation:** have `scripts/prerender.mjs` emit the same custom-property references
  (`var(--hds-color-carbon-90)` etc.) with a `:root` fallback block, so the static shell and
  the app can never diverge; delete the literal block. Add a jest test that greps the
  prerenderer output for `#[0-9a-f]{6}`.
- **Suggested command:** `/impeccable polish`

#### [P1] INT-04 · Every prerendered document is missing all four landmark types and the skip link
- **Location:** all 198 `dist/**/*.html`
- **Category:** Accessibility · Implementation Integrity
- **Evidence:** jsdom over 198 documents: **198/198** have no `<main>`, no
  `<header>`/`role="banner"`, no `<footer>`/`role="contentinfo"`, and no skip link.
  `index.html` additionally nests `<nav aria-label="Related pages">` **directly inside
  `<ul>`** (invalid content model). 1/198 (`404.html`) has no `<h1>`.
- **Impact:** the no-JavaScript and pre-hydration experience — which is the *only*
  experience for crawlers and for the first ~2 s on slow connections — has no document
  structure at all: no landmark navigation, no skip path, no contentinfo.
- **Standard:** **WCAG 2.1 SC 1.3.1 Info and Relationships (A)** · **SC 2.4.1 Bypass Blocks (A)**
- **Recommendation:** emit `<header>`, `<main id="main-content">`, `<footer>` and the skip
  link from the prerenderer; move the `<nav>` out of the `<ul>`. The React app already does
  all four correctly (`App.tsx:302-310`) — the static shell needs to match it.
- **Suggested command:** `/impeccable harden`

#### [P1] INT-05 · `check:fonts` is a vacuous gate; `check:design` cannot fail
- **Location:** `scripts/check-font-payload.mjs`; `scripts/check-design-quality.mjs`
- **Category:** Implementation Integrity (governance)
- **Evidence:** `check:fonts` prints `0 WOFF2 file(s), 0.00 KiB` and exits **0** — it passes
  on precisely the condition it exists to catch (INT-02). `check:design` prints
  `3,439 outstanding, 1 waived, 0 new` and exits **0**; §6 below proves ≥94 % of those are
  false positives from a single structural cause, so the remaining ~200 are invisible inside
  the noise. The 7 design jest suites (49 tests) and 121 Meridian contract tests all pass
  while P0-01…P1-04 hold.
- **Impact:** governance that cannot fail is worse than none: it authorises a green CI badge
  on a codebase with 196 measured contrast failures and zero shipped fonts.
- **Standard:** — (process)
- **Recommendation:** (1) `check:fonts` fails if `woff2Count === 0`; (2) add a
  `.impeccable/config.json` with `detector.ignoreFiles: ["frontend/dist"]` and
  `detector.ignoreRules: ["low-contrast"]` for the static shell, so the gate measures `src`
  instead (the CI variant `check:design:source` already sees only **1** finding in `src` —
  that is the number that should be the gate); (3) add `eslint-plugin-jsx-a11y`.
- **Suggested command:** `/impeccable audit` (re-run after the gate is repaired)

#### [P1] RES-01 · 75 sub-44px control heights defeat the documented 44px floor
- **Location:** `h-8` × 44 · `h-9` × 14 · `h-10` × 17, across the tree
  (e.g. `ChatBot.tsx:189, 285, 383`; `DistrictRiskMap.tsx`; `LiveMapView.tsx`)
- **Category:** Responsive Design · Accessibility
- **Evidence:** `index.css:2686-2692` correctly enforces the floor in `@layer base`:
  ```css
  @layer base { button, [role="button"], input[type="submit"], … {
    @apply min-h-[44px] min-w-[44px] touch-manipulation; } }
  ```
  Tailwind **utilities** outrank `@layer base`, so every `h-8` (32px), `h-9` (36px) and
  `h-10` (40px) on a button silently overrides it. Measured: **75 such overrides**. Separately
  `w-8`/`h-8`/`w-9` and `p-1`/`p-1.5`/`p-2` appear **96** and **167** times respectively.
  `MERIDIAN.md` §4.7 states the floor is *"non-negotiable and baked into `.mrd-btn` so it
  cannot be overridden from a call site"* — which is true of `.mrd-btn` (used 87 times) and
  false of the other 299 buttons.
- **Impact:** 32px targets on a phone, in the rain, in a field. Apple's published floor is
  **44×44pt**; WCAG 2.2 SC 2.5.8 is 24×24 CSS px minimum, so most of these are *legal* and
  still *wrong* for this audience.
- **Standard:** WCAG 2.2 **SC 2.5.8 Target Size (Minimum), Level AA** (24px — most pass);
  Apple HIG 44pt (all fail).
- **Recommendation:** move the 44px rule to a place utilities cannot override —
  `min-height: max(44px, …)` on the button base plus an ESLint rule banning `h-8|h-9|h-10`
  on `button`/`[role=button]`. **Note the deliberate conflict:** `MERIDIAN.md` §4.7 also
  specifies a *48px* floor on Android and a *44px compact* console mode; pick one number per
  track and encode it.
- **Suggested command:** `/impeccable adapt`

#### [P1] PERF-04 · 19/19 images ship without `loading="lazy"` or intrinsic dimensions
- **Location:** all 19 `<img>` elements in `.tsx`, including
  `components/HeroImageCarousel.tsx:11,13,14` (three images, no `alt` at all)
- **Category:** Performance · Accessibility
- **Evidence:** `<img` count **19**; with `loading=` **0**; with `width=` **0**. Five
  carousel JPEGs in `public/hero-carousel/` total 812.6 KB (largest 208.4 KB) and are served
  as baseline JPEG — no WebP/AVIF variant exists anywhere in `public/`.
- **Impact:** CLS on every page with an image; ~0.8 MB of un-deferred imagery; the carousel's
  three images are also an **A11Y-02** instance (no `alt`, and they are the page's primary
  visual content).
- **Standard:** WCAG **SC 1.1.1 Non-text Content (A)** for the missing `alt`.
- **Recommendation:** add `loading="lazy" decoding="async"` and explicit `width`/`height` to
  all 19; generate WebP/AVIF derivatives; write `alt` (or `alt=""` + `aria-hidden` for
  decorative) for the carousel trio.
- **Suggested command:** `/impeccable optimize`

---

### P2 — Minor

#### [P2] THE-02 · 14 distinct corner radii and 9 distinct shadow levels
- **Evidence:** `rounded-full` 307 · `rounded-xl` (12px) 175 · `rounded` (4px) 161 ·
  `rounded-lg` (8px) 144 · `rounded-sm` (2px) 106 · `rounded-2xl` (16px) 94 ·
  `rounded-md` (6px) 46 · `rounded-3xl` (24px) 34 · `rounded-[28px]` 13 ·
  `rounded-[20px]` 5 · `rounded-none` 3 · `rounded-[22px]` 2 · `rounded-xs` 1 ·
  `rounded-[36px]` 1. Shadows: `shadow` 79 · `shadow-xs` 76 · `shadow-sm` 49 ·
  `shadow-md` 41 · `shadow-2xl` 22 · `shadow-lg` 20 · **`shadow-[…]` 19** · `shadow-xl` 10 ·
  `shadow-none` 3.
- **Impact:** no geometry system is legible from the markup. Apple uses a concentric family
  derived from padding; Meta uses a 4-step soft family (6/12/16/32 + 100px pill). Nineteen
  hand-written `shadow-[…]` values are, by definition, outside any system.
- **Recommendation:** collapse to the Part II R-08 radius family and R-07 elevation set (3
  levels, ink-tinted). Keep `rounded-full` for avatars, status dots and icon buttons only.
- **Suggested command:** `/impeccable layout`

#### [P2] RES-02 · Effectively a two-step responsive system
- **Evidence:** `sm:` **823** · `md:` **172** · `lg:` **200** · `xl:` **21** · `2xl:` **2**.
  Tailwind defaults put `sm` at 640px, so ~80 % of all responsive intent is a single
  mobile/≥640px switch. Meridian's fluid `clamp()` type scale is defined
  (`meridian.ts` `MERIDIAN_TYPE_SCALE.display1/2/3`) and **consumed by zero components**.
- **Impact:** tablet (768–1023px) is largely unaddressed; the navbar's own breakpoint is
  `xl` (1280px) per `DESIGN_SYSTEM.md` §4, so between 640px and 1280px the chrome and the
  content disagree about which device they are on.
- **Recommendation:** adopt the 3-breakpoint set in Part II R-11 and re-base the navbar
  threshold on the same set.
- **Suggested command:** `/impeccable adapt`

#### [P2] RES-03 · 43 fixed-px widths and 47 horizontal-scroll workarounds **[UNVERIFIED: gestures]**
- **Evidence:** `max-w-[1200px]` 8 · `max-w-[230px]` · `max-w-[240px]` · `ChatBot.tsx:213`
  `w-[480px]` · `DistrictRiskMap.tsx:141` `min-w-[210px]` · `LiveMapView.tsx:1355`
  `w-[320px]` · `min-w-[200px]` 2 · `min-w-[210px]` 1. `overflow-x-auto` /
  `overflow-x-scroll` appears **47** times.
- **Impact:** `w-[480px]` on a 360px viewport is an unconditional overflow. The 47
  `overflow-x-auto` are an honest engineering response to dense tables, but 47 of them is a
  symptom: the console track has no responsive table strategy.
- **Note (per the playbook):** whether the scrollable strips' **drag/scroll gesture works
  under touch** could not be exercised — no browser engine. `touch-action` appears 129 times
  and `touch-manipulation` is set globally on buttons, which is the right precondition, but
  **the gesture itself is untested**.
- **Recommendation:** replace fixed widths with `min()`/`clamp()`; add a responsive table
  strategy (priority columns + a "show all" disclosure) for the console track.
- **Suggested command:** `/impeccable adapt`

#### [P2] A11Y-03 · 75 focus-outline suppressions
- **Evidence:** `outline-none` / `focus:outline-none` / `outline: 0` **75** occurrences.
  Mitigating: a global `:focus-visible` ring **does** exist (`index.css:1297-1301`, HDS 1px
  dashed, carbon-60, 1px offset; plus `meridian.css:663-670` and `.mrd-btn:focus-visible`),
  which is why this is P2 and not P1.
- **Impact:** the ring survives at the global level, so the practical exposure is limited to
  the 75 components that opted out *and* did not opt back in. On dark surfaces
  `index.css:1304-1306` correctly steps the ring to carbon-30.
- **Standard:** WCAG **SC 2.4.7 Focus Visible (AA)** — provisionally met; needs a rendered
  audit to confirm for the 75.
- **Recommendation:** delete all 75 and rely on the global ring; if a component needs a
  custom treatment, pair `focus:outline-none` with an explicit `focus-visible:` replacement.
- **Suggested command:** `/impeccable polish`

#### [P2] A11Y-04 · Reduced motion is a blanket `0.01ms` kill with one correct exception
- **Evidence:** `index.css:1312-1323` applies `animation-duration: 0.01ms !important`,
  `animation-iteration-count: 1 !important`, `transition-duration: 0.01ms !important` to
  `*`, `*::before`, `*::after`. `meridian.css:723-736` repeats the kill **and** correctly
  re-shows `[data-mrd-reveal] { opacity: 1 !important; transform: none !important; }`.
  `useReducedMotion` / `prefers-reduced-motion` appear **39** times in 230 files. The same
  collapse is applied to `html[data-low-bandwidth='true']` (`index.css:1330-1337`) — a
  genuinely good idea.
- **Impact:** the global `animation-iteration-count: 1` kills **loading spinners**: a spinner
  rotates once and freezes, which reads as *hung*, not as *reduced*. That is exactly the
  pattern the playbook calls out as "a global `0.01ms` kill that destroys useful feedback."
  The Meridian block shows the authors already know the correct pattern; the older block
  predates it.
- **Standard:** WCAG **SC 2.3.3 Animation from Interactions (AAA)**; the failure mode is
  against the *spirit* of SC 2.2.1 / state feedback, not a strict violation.
- **Recommendation:** exempt progress indicators —
  `[role="progressbar"], [data-keep-reduced-motion], .hn-spinner { animation-iteration-count: infinite !important; animation-duration: 1s !important; }` — and give reduced-motion users a
  non-animated state-change cue (text or opacity step) in their place.
- **Suggested command:** `/impeccable animate`

#### [P2] INT-06 · Ad-hoc z-index values beside a complete token scale
- **Evidence:** Meridian defines one clean scale (`MERIDIAN_Z`: base 0 → a11y 1100) and it is
  used correctly **31** times (`z-[var(--z-nav)]`, `z-[var(--z-overlay)]`,
  `z-[var(--z-a11y)]`, …). Alongside it: `z-[1200]` ×2 (`DisasterDetailModalUI.tsx:500,605`),
  `z-[3000]` (`NotificationToggleUI.tsx:60`), **`z-[10001]`** (`PWAInstallButton.tsx:39`),
  `z-[9994]` ×2 (`PdfExportButton.tsx:265-266`), plus **51** bare numeric Tailwind z utilities
  (`z-10`…`z-90`).
- **Impact:** `MERIDIAN.md` §4.7 promises *"One z-scale from base to a11y — no ad-hoc 9999"*;
  four sites breach it, and `z-[10001]` outranks the `a11y` layer (1100), so the install
  prompt can paint over the skip link.
- **Recommendation:** codemod the 9 ad-hoc and 51 numeric values onto `--z-*`.
- **Suggested command:** `/impeccable polish`

#### [P2] INT-07 · The entire app shell is `pointer-events: none` by default
- **Location:** `frontend/src/App.tsx:274-275` (root container), with seven
  `pointer-events-auto` re-enabling wrappers at lines 309, 319, 330, 332, 333, 376, 383
- **Category:** Implementation Integrity
- **Evidence:**
  ```tsx
  : 'min-h-screen bg-carbon-05 text-carbon-90 flex flex-col font-sans
     selection:bg-amber-100 selection:text-amber-900 pointer-events-none'
  ```
  Every interactive child then has to opt back in. Nothing in the file records *why*.
- **Impact:** this is a global inversion of the platform default for an unspecified reason.
  Any component added to this tree without an explicit `pointer-events-auto` ancestor is
  **silently inert** — clickable, focusable, and dead, with no error and no build failure.
  It also defeats `cursor` affordances and can interact badly with assistive tech that hit-
  tests. Whatever bug this was working around, the fix should be scoped to that bug.
- **Standard:** — (engineering integrity)
- **Recommendation:** find the element that needed it (almost certainly a full-screen
  decorator — the `/live` map background, the hero canvas, or the FAB), scope
  `pointer-events-none` to that element alone, and remove it from the root. Add a comment
  naming the reason, as every other unusual rule in this codebase correctly does.
- **Suggested command:** `/impeccable harden`

#### [P2] TYPE-01 · Secondary text outnumbers primary text 945 : 617
- **Evidence:** `text-carbon-60` (secondary label) **945** uses · `text-carbon-90` (primary
  ink) **617**. Seven weights in play: `font-bold` **918** · `font-semibold` 384 ·
  `font-medium` 241 · **`font-black` 238** · `font-extrabold` 160 · `font-normal` 21 ·
  `font-light` 1.
- **Impact:** the hierarchy is inverted by usage — the secondary label is the most common
  colour in the product. Four heavy weights (bold/black/extrabold/semibold = 1,700 uses)
  against 21 `font-normal` means emphasis is carried by weight everywhere, so it
  distinguishes nothing. Apple's guidance is explicit: *"In general, avoid light font
  weights… prefer Regular, Medium, Semibold, or Bold"* and the reference systems use at most
  **two** weight levels per page.
- **Recommendation:** adopt the Part II R-01 scale — one display weight (600–650) and one
  text weight (400), with 500 reserved for labels, and 700 only for the hazard signal.
- **Suggested command:** `/impeccable typeset`

#### [P2] TYPE-02 · No negative optical tracking on display type; no display sizes in use
- **Evidence:** tracking utilities: `tracking-tight` 111 · `tracking-wider` 105 ·
  `tracking-wide` 59 · `tracking-widest` 7. **Zero** instances of `tracking-[-Npx]` or
  `tracking-[-Nem]`. Largest sizes: `text-6xl` ×2 · `text-5xl` ×1 · `text-4xl` ×6 ·
  `text-3xl` ×26 · `text-[40px]` ×1.
- **Impact:** this is the most legible single signal that the incumbent system is not
  Apple-like or Meta-like. Both parents define their look with **large type set in tight
  negative tracking** — Apple at −0.022em on 17px body rising to −1.44px at 96px display,
  Meta at −0.02em on a 56px display hero. HazardNet's largest text on most pages is
  `text-3xl`/`text-4xl` with no tracking discipline at all.
- **Recommendation:** R-01. Meridian already defines the correct values
  (`MERIDIAN_TYPE_SCALE` tracking −0.008em → −0.03em); they simply are not consumed.
- **Suggested command:** `/impeccable typeset`

---

### P3 — Polish

| ID | Finding | Evidence | Command |
|---|---|---|---|
| **P3-01** | Section rhythm is ~8px, not ~96–128px | `py-2` (8px) **303** · `py-4` 7 · `py-6` 5 · `py-8` 11 · `py-10` 2 · `py-12` 4 · `py-16` 2 · `py-24` **1**. Gaps collapse at `gap-2` 486 · `gap-1.5` 220 · `gap-3` 172; `gap-8` only 8, `gap-12` **1**. | `/impeccable layout` |
| **P3-02** | 20+ distinct container widths | `max-w-3xl` 22 · `max-w-md` 16 · `max-w-2xl` 12 · `max-w-4xl` 10 · `max-w-sm` 8 · `max-w-[1200px]` 8 · `max-w-xl` 7 · `max-w-7xl` 6 · `max-w-5xl` 6 · `max-w-[900px]` 3 · `max-w-[840px]` 2 · `max-w-[320px]` 4 … | `/impeccable layout` |
| **P3-03** | `will-change` left on at rest | 4 uses; `[data-mrd-reveal]` in `meridian.css:685` carries `will-change: opacity, transform` for the element's whole life, not just the animation. Scoped and defensible, but not the targeted hint the playbook asks for. | `/impeccable optimize` |
| **P3-04** | 3 non-semantic click targets | `<div onClick>` without `role`/`tabIndex` at `Footer.tsx:277`, `PdfExportButton.tsx:265`, `StructuredAdvisoryRenderer.tsx:191`. Keyboard-invisible. | `/impeccable harden` |
| **P3-05** | `text-[2.2px]` | One occurrence. Almost certainly a typo for `2.2rem`. | `/impeccable typeset` |

---

## 6 · Detector adjudication — every finding verified in context

The playbook requires *"Run the bundled detector and verify each finding in context… call out
false positives."*

**Raw output.** `impeccable detect frontend/src frontend/dist --no-advisory`
→ **3,471 anti-patterns**. Split: `frontend/src` = **1**; `frontend/dist` = **3,470**.

**Repo's own gate.** `npm run check:design` → *"198 documents + frontend/src: 3,439
outstanding, 1 waived, 0 new"* → `low-contrast` 3,179 · `overused-font` 197 ·
`tight-leading` 41 · `oversized-h1` 22.

**Verdict: 1 true positive. 3,470 false positives.**

### The false-positive mechanism (proved, not assumed)

The prerendered static shell (`dist/**/*.html`) ships an inline `<style>` whose dark scheme
lives in a media query:

```css
@media (prefers-color-scheme: dark) {
  body { background:#17171b }
  .hn-static             { background:#17171b; color:#e3e3e3 }
  .hn-static .hn-callout { background:#2e2e32; border-left-color:#ea6f24; color:#fce3ca }
  .hn-static .hn-meta    { background:#17171b; border-top-color:#444447; color:#b9b9bb }
  .hn-static .hn-state   { background:#2e2e32; border-color:#58585b; color:#e3e3e3 }
}
```

The detector performs static CSS analysis and **does not cascade media queries**, so it pairs
light-scheme foregrounds with dark-scheme backgrounds. That is exactly how
`#17171b on #17171b` (1.0:1) and `#2e2e32 on #17171b` (1.3:1) are manufactured.

**Disproof.** I computed the *actual* paired ratios from the real values:

| Scheme | Rule | Foreground | Background | Measured | Verdict |
|---|---|---|---|---|---|
| Light | `.hn-static` body | `#17171b` | `#ffffff` | **17.88:1** | AAA |
| Light | `.hn-static p` | `#444447` | `#ffffff` | **9.71:1** | AAA |
| Light | `.hn-lead` | `#17171b` | `#ffffff` | **17.88:1** | AAA |
| Light | `.hn-callout` | `#3b1b00` | `#fce3ca` | **12.65:1** | AAA |
| Light | `.hn-meta` | `#58585b` | `#ffffff` | **7.09:1** | AAA |
| Light | `.hn-state` | `#17171b` | `#ffffff` | **17.88:1** | AAA |
| Light | `.hn-static a` | `#0b3d91` | `#ffffff` | **10.04:1** | AAA |
| Dark | `.hn-static` body | `#e3e3e3` | `#17171b` | **13.93:1** | AAA |
| Dark | `.hn-callout` | `#fce3ca` | `#2e2e32` | **10.93:1** | AAA |
| Dark | `.hn-meta` | `#b9b9bb` | `#17171b` | **9.12:1** | AAA |
| Dark | `.hn-state` | `#e3e3e3` | `#2e2e32` | **10.54:1** | AAA |
| Dark | `.hn-state-unknown` | `#b9b9bb` | `#2e2e32` | **6.90:1** | AA |

**Every one of the 3,179 reported `low-contrast` sites is legible in the scheme it actually
renders in.** The static shell's typography is, on measurement, better than the app it
fronts. This is also why the file's own comment says *"Every rule restates its own background
next to its text colour so the pairing stays legible to a reader (and to a static contrast
checker) that does not cascade media queries"* — an explicit attempt to pre-empt this, which
the detector's engine defeated anyway.

**Consequence for governance (INT-05):** a gate whose output is 94 % noise cannot surface the
~196 *real* contrast failures in §A11Y-01, none of which appear in it. Point the gate at
`frontend/src` (`check:design:source` sees **1** finding there), add
`detector.ignoreFiles: ["frontend/dist"]`, and let the real findings become visible.

### The one true positive

| Rule | Finding | Status |
|---|---|---|
| `overused-font` | `frontend/src/index.css:1362` — `font-family: 'Inter'` | **TRUE as declaration, MISLEADING as rendering.** The face is declared and never loaded (INT-02); the user sees `system-ui`. The fix is not "pick a different face name" — it is "ship a face." |

---

## 7 · Delta vs the 2026-10-01 audit

The 2026-10-01 audit recorded **12 P1 findings**. Re-measured today, byte-for-byte, on the
same commit:

| ID | 2026-10-01 finding | Status 2026-10-02 | Evidence it is unchanged |
|---|---|---|---|
| P1-01 | Cascade-layer inversion: unlayered element rules override Tailwind utilities | **OPEN** | Only two `@layer base` blocks (`index.css:1199`, `2686`); unlayered element rules persist at lines 30, 333, 1407, 1479, 1522, 1546, 2768. `!important` count still **402**. |
| P1-02 | No web font is ever loaded | **OPEN** | 0 `@font-face` · 0 font files · 0 remote URLs · `check:fonts` → `0 WOFF2, 0.00 KiB` |
| P1-03 | Bengali rules never match | **OPEN** | `[lang="bn"]` still at `index.css:37` and `2769-2770`; `:lang(bn)` still absent; `index.css:2768` `body, body * { font-family: var(--font-sans-en) }` still wins |
| P1-04 | Contrast tokens validated on white only | **OPEN** | §A11Y-01: 196 instances below AA; no tint-aware test added |
| P1-05 | Control boundaries fail 3:1, ignore `--input` | **OPEN** | `--input: var(--hn-hds-ink-muted)` = `#77777a` = 4.46:1; unchanged |
| P1-06 | Unlabeled filter `<select>`s | **OPEN** | 386 buttons vs 161 `aria-label`; no `eslint-plugin-jsx-a11y` added |
| P1-07 | Severity is colour-only; 3 of 5 CSS severity levels identical | **OPEN** | `MERIDIAN_SEVERITY` now defines 5 glyphs + ranks (fixed *in the token file*); CSS `--severity-*` still carries the older duplicate values; `meridian.ts` comment records the fix as token-layer only |
| P1-08 | Eager 846 kB gzip from two `manualChunks` rules | **OPEN** | `vite.config.ts` `manualChunks` byte-identical; `vendor-pdf` 842.1 KB + `vendor-firebase` 680.8 KB still in the graph |
| P1-09 | Never-terminating rAF → setState loop | **OPEN** | `motion-interpolate.ts:41-46` byte-identical; now **8** call sites, not 1 |
| P1-10 | Empty state asserts "all clear" without the number | **PARTIAL** | Front door now renders honest em-dashes and failure sentences (`FrontDoor.tsx:29-33`); `/alerts` not re-verified (no rendering available) |
| P1-11 | No component layer; two visual dialects | **OPEN** | `.hn-btn-*`/`.hn-card*` usage still **0**; `components/ui/` still has no Button/Input/Select/Dialog/Badge |
| P1-12 | Three diverged sources of truth; gate measures the wrong thing | **OPEN** | Three token sources intact; gate still reports 3,439 outstanding and exits 0 |

**0 of 12 closed. 1 partial. Merit rollout: 87 `mrd-*` instances in 2 of 178 files.**

This is the most important number in the audit. A design-system programme that produces
audits faster than it produces fixes is not a programme; it is a backlog. **Part II should
not begin until at least P0-01, P0-02 and INT-02 are closed** — those three are days of work
and they unblock everything downstream.

---

## 8 · Patterns & systemic issues

1. **Tokens without components, twice over.** 99.8 % palette compliance and 121 passing
   Meridian contract tests describe a token layer that is genuinely excellent *in isolation*
   and barely consumed: 721 hex literals vs 32 `var()` uses; 87 `mrd-*` instances in 2 files.
   Consistency is currently maintained by convention across 178 files, and convention is what
   decays (P1s THE-01, INT-01).

2. **"Last rule wins" CSS.** 402 `!important`, two `@layer base` blocks in a 2,772-line
   file, six competing font directives (lines 22-27, 342-383, 852-868, 1219-1247, 1352-1395,
   2768-2770), and a `body, body *` universal selector — so the outcome depends on source
   order (P1-01, INT-02).

3. **Documentation describes a system that does not exist.** `DESIGN_SYSTEM.md` §5's
   "reusable global component classes" have zero consumers; `MERIDIAN.md` §4's type scale has
   zero consumers; `MERIDIAN.md` §4.7's "no ad-hoc 9999" is breached four times. The docs are
   not wrong — they are *aspirational documents mistaken for descriptive ones*.

4. **Gates that cannot fail.** `check:fonts` passes on 0 bytes; `check:design` reports 3,439
   findings and exits 0; 49 design tests + 121 contract tests pass while 25 P0–P3 findings
   hold. All assert *values in files*, none assert *rendered behaviour* (INT-05).

5. **Colour and type are decided by hue step, not by role.** `text-carbon-60` is used 945
   times for every secondary meaning in the product — label, meta, caption, disabled,
   placeholder. A role-based system (`labelSecondary`, `labelTertiary`, `separator`) exists
   in Meridian and is unused. This is why the hierarchy inversion in TYPE-01 is invisible to
   the token gate.

6. **Perpetual animation as a default.** 8 rAF loops, **236 component-level
   `transition-all`** utilities plus 3 `transition: all` declarations in `index.css`, 34
   `backdrop-blur` surfaces, and Remotion's `interpolate` in the main bundle to compute a
   6-frame fade (P0-02, R-09.3). *Credit where due:* the **global** transition rule at
   `index.css:2697-2713` gets this right — it names an explicit compositor-safe property list
   — so the discipline exists in one place and is lost in 239 others.

7. **Payload discipline applied to the wrong things.** `check:fonts` enforces a 50 KB budget
   on zero files while 113 MB of video and a 1,484.6 KB JSON pass through unexamined
   (P0-01, P1-PERF-03). The instinct is right; the gate is pointed at the only budget that was
   already met.

8. **Exact-match logic.** `pathname === '/live'`, `[lang="bn"]`, `location.pathname === '/'`.
   Correct for the happy path, wrong for `/live/`, `bn-BD` and trailing slashes
   (P1-03, and the prior audit's P2-01).

---

## 9 · Positive findings — keep and replicate

1. **The token layer is measured, not estimated.** Every contrast claim in `meridian.ts`,
   `tokens.ts` and `DESIGN_SYSTEM.md` that I re-computed is **correct**. `#970002` at 9.06:1,
   `#0b3b95` at 10.13:1, `#17171b` at 17.88:1 — all verified. This is rare and valuable.

2. **121 Meridian contract tests, passing.** `meridianContrast.test.js` and
   `meridianParity.test.js` encode the system's rules as executable assertions, including
   "severity is never colour alone", "severity text clears AA **on its own surface**", and "no
   proprietary typeface and no remote font fetch in either file." That last one is the reason
   INT-02 exists and it is the right contract. **The tests found two real bugs on first run**
   (recorded in `MERIDIAN.md` §6: `#b25600` at 4.46:1 on its own surface, and `#dc2626` text
   on `#fee2e2` at 3.95:1). This is what a design system is supposed to do.

3. **`MERIDIAN_SEVERITY` splits text from marker fill.** The comment records the reasoning:
   `#dc2626` text on `#fee2e2` was 3.95:1 — a real AA failure on the two levels a reader most
   needs to read — so `color` (text, must clear 4.5:1) and `solid` (map fill, 3:1 per
   SC 1.4.11) were separated. That is sophisticated, correct, and safety-relevant.

4. **The dual-primary inversion is a genuinely good decision.** `MERIDIAN_ACTION_INTENT`:
   crimson is reserved for hazard signal only; navigation is the ink pill. The reasoning —
   *"a red button that means 'look at this page' trains the reader to ignore the red that
   means 'your district is under warning'"* — is the product thinking about its users
   rather than about style. **Preserve this through the Apple/Meta adoption** (R-14).

5. **The two-geometry track decision** (`editorial` vs `console`) is the right answer to a
   real problem: 32px corners waste the pixels a 64-district table needs. Neither Apple nor
   Meta has this, because neither ships a data console. Keep it.

6. **Content honesty is excellent.** `FrontDoor.tsx` renders a missing artifact as an em dash
   or as the sentence that says it is missing, never as a zero. `heroMedia.ts` documents a
   black-poster bug including *how* it was verified. `App.tsx` explains the Vercel analytics
   `SyntaxError` in full. This is a codebase that records *why*, and it is the strongest
   asset any redesign must not damage.

7. **Prerendered static shell is a real achievement.** 198 routes with per-route title,
   description, canonical, OG, JSON-LD and substantive text, emitted at build time so no host
   rewrite is needed. The a11y gaps in it (INT-04) are fixable in one file.

8. **The global transition rule names its properties.** `index.css:2697-2713` declares
   `transition-property: color, background-color, border-color, text-decoration-color, fill,
   stroke, opacity, box-shadow, transform` — a compositor-safe list, not `transition: all`,
   with a comment at line 400 stating *"Named transitions — never `transition: all`."* The
   intent is correct and documented. It is then contradicted 239 times elsewhere, but the
   rule itself is the right model to scale from (R-09.3).

9. **Accessibility infrastructure that is already correct:** skip link (`App.tsx:302-310`)
   with `z-[var(--z-a11y)]`, global `:focus-visible` ring with a dark-surface variant,
   `min-h-[44px]` × 213, `touch-manipulation` × 129, `env(safe-area-inset-*)` in the shell,
   `viewport-fit=cover`, `role="status"` + `aria-label` on the route fallback, and
   reduced-motion handling in 39 files.

10. **Bandwidth mode.** `html[data-low-bandwidth='true']` collapsing animation and
   `backdrop-filter` for Data Saver / 2G / ≤2 GB RAM devices is a thoughtful, product-specific
   idea neither parent system has.

---

# PART II — Adopting the Apple and Meta frontend systems

## 10 · What "byte-by-byte" can and cannot mean

Read literally, "byte-by-byte adoption" of `apple.com` and `meta.com` is not achievable, and
it is worth saying precisely why before specifying anything, because three of the four things
that make those sites look the way they do are **not available to be copied**:

| Asset | Owner | Status |
|---|---|---|
| **SF Pro** / SF Pro Display / SF Pro Text / SF Symbols | Apple | Proprietary. Distributed under Apple's own licence for developing Apple-platform apps. Not licensable for a third-party web product. |
| **Optimistic VF** (Display + Text), **Facebook Sans** | Meta | Proprietary. Commissioned from Dalton Maag, never publicly released. Not licensable. |
| Photography, product renders, video, iconography, layout artwork | Apple / Meta | Copyrighted; trade-dress exposure on close imitation. |
| **Methods, metrics, principles** | Public | **Adoptable.** Apple publishes the HIG; both companies' systems are extensively documented and reverse-engineered in public. |

`MERIDIAN.md` §0 already states this correctly: *"Nothing in it is copied from Apple or Meta:
no SF Pro or Optimistic font files, no Apple or Meta artwork, no lifted CSS… What it does take
from them is method."*

**So the achievable target, and the one specified below, is: byte-for-byte adoption of every
measurable parameter** — type scale in px/rem, tracking in em, line-height ratios, spacing
steps, container widths, gutter, corner radii, elevation values, motion durations and
cubic-bézier control points, and component anatomy **— implemented with typefaces and assets
HazardNet is licensed to distribute.**

Two further boundary conditions specific to this product, both of which **override** the
Apple/Meta defaults (R-14):

- **Apple and Meta are consumer-commerce systems; HazardNet is a safety system.** Their
  restraint, their enormous type, their generous whitespace and their colour scarcity all
  *transfer*. Their colour semantics do not: Meta spends its cobalt on the buy funnel and
  Apple spends its blue on interactivity; HazardNet must spend its crimson on hazard only.
- **Neither parent ships Bengali, offline-degraded states, or a 64-district data console.**
  Three requirements here have no parent at all and must be designed, not borrowed.

### Source quality note

The Apple figures below marked **[A]** come from Apple's own published Human Interface
Guidelines. Figures marked **[S]** are aggregated from third-party design-system references
and should be treated as *calibrated approximation*, not Apple/Meta-published values — they
are consistent across multiple independent sources and with the visible sites, but neither
company publishes a web type scale. Meta has no public design-system documentation at
Apple's level of rigour.

---

## R-00 · The gate: fix typography delivery before anything else

**Nothing in Part II is buildable until type ships.** Today HazardNet declares nine families
and loads zero (INT-02).

| Requirement | Value |
|---|---|
| Families | **3 shipped faces** — Display, Text, Bengali — plus a system mono stack. Not 9. |
| Format | WOFF2 only |
| Total budget | **≤ 50 KB** across all faces (the repo's own `check:fonts` budget) |
| Delivery | Same-origin, self-hosted, **no remote font URL** (the repo's existing hard contract — keep it) |
| `@font-face` | `font-display: swap`; `size-adjust` matched to the fallback to kill CLS |
| Subsetting | Latin-basic + Bengali (U+0980–U+09FF) + Bengali digits (U+09E6–U+09EF) as separate `unicode-range` segments so a Latin-only reader never downloads Bengali |
| Fallback stacks | Display: `'Instrument Sans', 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif`<br>Text: `'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`<br>Bengali: `'Hind Siliguri', 'Noto Sans Bengali', 'Baloo Da 2', sans-serif` |
| Structural requirement | A **tighter display face over a larger-x-height text face** — this is the Meta structure, reproduced with licensed faces |
| Gate | `check:fonts` **must fail** when `woff2Count === 0` (INT-05) |
| Cascade fix | delete `index.css:2768` (`body, body * { font-family: var(--font-sans-en) }`) — it defeats the Bengali stack on Bengali text |
| Bengali selector | replace `[lang="bn"]` with **`:lang(bn)`** so `bn-BD`, `bn-IN` and nested elements match (P1-03) |

**Acceptance:** `document.fonts.size >= 3`; `check:fonts` exits 0 with a non-zero payload;
a Bengali string on `/` resolves to the Bengali face; `check:design:source` unchanged.

---

## R-01 · Type scale — the single highest-leverage change

### R-01a · Apple's published scale [A]

Apple's iOS/iPadOS Dynamic Type defaults, which is the canonical Apple scale:

| Style | Size | Weight | Line height | Optical cut |
|---|---|---|---|---|
| Large Title | **34 pt** | Bold | 41 | Display |
| Title 1 | **28 pt** | Regular | 34 | Display |
| Title 2 | **22 pt** | Regular | 28 | Display |
| Title 3 | **20 pt** | Regular | 25 | Display |
| Headline | **17 pt** | Semibold | 22 | Text |
| Body | **17 pt** | Regular | 22 | Text |
| Callout | **16 pt** | Regular | 21 | Text |
| Subhead | **15 pt** | Regular | 20 | Text |
| Footnote | **13 pt** | Regular | 18 | Text |
| Caption 1 | **12 pt** | Regular | 16 | Text |
| Caption 2 | **11 pt** | Regular | 14 | Text |

Apple's published legibility floors [A]:

| Platform | Default | **Minimum** |
|---|---|---|
| iOS, iPadOS | 17 pt | **11 pt** |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

Apple's optical-size rule [A]: **SF Pro Text at ≤19 pt, SF Pro Display at ≥20 pt** — the
display/text split at 20 pt. Apple tracking values [A]: 17 pt → −0.43 px, 28 pt → −0.8 px,
56 pt → −0.28 px (i.e. tracking tightens *upward* from the split, and is roughly −0.025 em at
display sizes, with slightly **positive** tracking at mid sizes: +0.007 em at 28 px,
+0.011 em at 21 px).

Mapping note: Apple's HIG figures are in **points**; on the web 1 pt is conventionally mapped
1:1 to 1 CSS px for type-size purposes. The usable rule is **17 px body** and **11 px
absolute floor**.

### R-01b · Meta's scale [S]

| Role | Face | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| Display Hero | Optimistic Display | **56 px** | 700 | **1.07** | **−0.02em** |
| Display Large | Optimistic Display | **40 px** | 700 | **1.20** | −0.01em |
| Display | Optimistic Display | **32 px** | 600 | **1.25** | −0.01em |
| Heading | Optimistic Display | **24 px** | 600 | 1.33 | 0 |
| Subtitle | Optimistic Text | **20 px** | 600 | 1.40 | 0 |
| Body Large | Optimistic Text | **17 px** | 400 | 1.53 | 0 |
| Body | Optimistic Text | **15 px** | 400 | 1.47 | 0 |
| Body Small | Optimistic Text | **13 px** | 400 | 1.38 | 0 |
| Caption | Optimistic Text | **12 px** | 400 | 1.33 | 0 |
| Button label | Optimistic Text | 15 px | 600 | 1.33 | 0 |

Meta's split is at **24 px** (`MERIDIAN_DISPLAY_SPLIT`, already correct in the token file)
and its body floor is **15–17 px**.

### R-01c · The HazardNet target scale

Meridian already specifies this correctly (`meridian.ts` `MERIDIAN_TYPE_SCALE`). It is
reproduced here as the requirement, with the one change Part II adds — a hard floor and a
`clamp()` on body too:

| Token | Size | Line | Tracking | Weight | Role | Current HazardNet equivalent |
|---|---|---|---|---|---|---|
| `micro` | 0.6875rem / **11 px** | 1.45 | +0.01em | 500 | text | `text-[11px]` ×156 — **at Apple's floor; keep, never below** |
| `caption` | 0.75rem / **12 px** | 1.5 | +0.01em | 500 | text | `text-xs` ×1,265 ✅ but used as *body* |
| `footnote` | 0.8125rem / **13 px** | 1.5 | +0.005em | 400 | text | `text-[13px]` ×32 |
| `subhead` | 0.9375rem / **15 px** | 1.55 | 0 | 400 | text | `text-sm` ×383 |
| `body` | 1.0625rem / **17 px** | 1.6 | 0 | 400 | text | **missing** — `text-base` ×249 is 16px |
| `callout` | 1.125rem / **18 px** | 1.55 | −0.003em | 500 | text | `text-lg` ×89 |
| `title3` | 1.25rem / **20 px** | 1.35 | −0.008em | 600 | display | `text-xl` ×70 |
| `title2` | 1.375rem / **22 px** | 1.3 | −0.011em | 600 | display | `text-[22px]` ×17 |
| `title1` | 1.75rem / **28 px** | 1.2 | −0.015em | 600 | display | `text-[28px]` ×19 |
| `display3` | `clamp(1.875rem, 1.5rem + 1.6vw, 2.5rem)` → **34 px** | 1.12 | −0.02em | 650 | display | `text-3xl` ×26 |
| `display2` | `clamp(2.25rem, 1.6rem + 3vw, 3.5rem)` → **56 px** | 1.06 | −0.025em | 650 | display | `text-4xl` ×6 |
| `display1` | `clamp(2.75rem, 1.8rem + 4.5vw, 4.5rem)` → **72 px** | 1.02 | −0.03em | 680 | display | `text-5xl` ×1, `text-6xl` ×2 |

**Hard rules**

1. **Body is 17 px** — Apple's floor [A], Meta's Body-Large [S], and the right call for a
   5.5″ screen in daylight. Today the most-used size in the product is **12 px** (1,265 uses).
2. **Absolute floor is 11 px** [A]. Delete `text-[8px]` ×4, `text-[9px]` ×8,
   `text-[10px]` ×142, `text-[10.5px]` ×6, `text-[2.2px]` ×1. **Delete or re-role 161 sites.**
3. **Two weights per page, three for the whole product:** 400 (text), 500 (labels/captions),
   600 (display). 700+ is reserved for the hazard signal only. Today: 918 `font-bold` +
   238 `font-black` + 160 `font-extrabold` + 384 `font-semibold` = 1,700 heavy uses against
   21 `font-normal`.
4. **Tracking is negative above the split, neutral below** — already correct in
   `MERIDIAN_TYPE_SCALE`; today **zero** components use negative tracking.
5. **Bengali floor:** size ≥ 15 px, line-height ≥ **1.35** (Meridian's `bengali` constant),
   tracking ≥ 0 (Bengali matras need open tracking; the current `index.css:39` sets
   `line-height: 1.65` which is right, and `.lang-bn` sets `letter-spacing: 0.01em` which is
   right — but neither applies, per R-00).
6. **No `leading` below 1.3 at body scale.** Today `leading-tight` + `leading-[1.x]` appear
   119 times; the detector flags 41 `tight-leading` findings.

**Acceptance:** zero `text-[Npx]` below 11 across `src`; body default 17 px on `/`,
`/alerts`, `/districts/*`; a codemod report showing ≥95 % of the 1,265 `text-xs` uses
re-roled; `check:design:source` reports 0 `tight-leading`.

---

## R-02 · Colour architecture — semantic roles, not hue steps

### Target structure (Apple's model [A], Meta's values [S])

Apple: **semantic system colours** — `label`, `secondaryLabel`, `tertiaryLabel`,
`quaternaryLabel`, `separator`, `opaqueSeparator`, `systemBackground`,
`secondarySystemBackground`, `systemGroupedBackground` — that *auto-adapt* to light/dark/high
contrast. Apple deliberately does not publish fixed hex for these, because they are adaptive
by definition. Meta: a single near-black ink `#1C2B33` on white, a `#F0F2F5` tinted canvas,
one cobalt action colour `#0064E0`, one red badge `#FA383E`.

### HazardNet target — three layers, one consumer surface

**Layer 1 · Primitives** (Meridian's, already correct and measured):

| Token | Value | Measured |
|---|---|---|
| `ink` | `#141A1F` | 17.54:1 white · 16.19:1 canvas · 15.20:1 grouped |
| `inkSoft` | `#4A5560` | 7.61:1 (AAA small text) |
| `inkTertiary` | `#6B7885` | 4.52:1 (**AA, ≥14 px only**) |
| `inkQuaternary` | `#8C98A4` | **decorative/disabled only — never text** |
| `brandCrimson` | `#970002` | 9.06:1 white · 8.37:1 canvas |
| `brandCrimsonDark` | `#7B1D21` | 10.29:1 |
| `brandInk` | `#0D0D0D` | 19.44:1 |
| `blue` | `#1c67e3` | 5.12:1 (AA controls + large text) |
| `blueShade` | `#0b3b95` | 10.13:1 (AAA link text) |
| `canvas` | `#F4F6F8` | — |
| `canvasGrouped` | `#ECEFF2` | — |
| `surface` | `#FFFFFF` | — |
| `hairline` | `#DDE2E7` | — |

**Layer 2 · Semantic roles** — the *only* thing components may name:

`label` · `labelSecondary` · `labelTertiary` · `labelQuaternary` · `separator` ·
`separatorOpaque` · `backgroundBase` · `backgroundGrouped` · `backgroundElevated` ·
`actionInk` · `actionInkForeground` · `actionHazard` · `actionHazardForeground` ·
`actionInteractive` · `actionInteractiveForeground` · `focusRing`

**Hard rules**

1. **Components never name a hue step.** `text-carbon-60` (945 uses) is banned in favour of
   `labelSecondary`. This is the fix for TYPE-01's inverted hierarchy: the reason secondary
   text outnumbers primary 945:617 is that nothing forces the distinction.
2. **Every role resolves per theme.** Three themes: `light`, `dark`, `highContrast`.
   `highContrast` fires automatically on `prefers-contrast: more`. All three already exist in
   `meridian.ts` and are unreachable (THE-01) — wire them.
3. **Tint-aware validation.** Every text role must clear its threshold **on every background
   it may sit on** — white, canvas, grouped, its own status surface, and the dark equivalents.
   `MERIDIAN_CONTRACT_CONTRAST` already encodes 16 such pairs; extend it to cover every
   `surface`/`color` pair in `MERIDIAN_SEVERITY` and every status-tinted card. The prior
   audit's P1-04 ("validated on white only") is still open for this reason.
4. **Status colours are pairs, not values.** `MERIDIAN_SEVERITY` already splits `color`
   (text, ≥4.5:1 on `surface`) from `solid` (map/marker fill, ≥3:1). Roll this out to the
   fourth CSS layer; today `--severity-*` still carries the older unsplit values.
5. **Colour is never the only channel.** 5 severity glyphs (`bar1`…`bar4`, `diamond`) +
   5 ranks + a text label. Already specified; verify rollout on map, legend, table and chart.

**Acceptance:** zero `text-carbon-NN` / `bg-carbon-NN` in components; zero `#[0-9a-f]{3,8}`
inside a `className`; every role defined in all three themes; `meridianContrast.test.js`
extended to cover status surfaces and still passing.

---

## R-03 · Spacing scale

Meta's published grid [S] is an **8 px base** with a 14-step scale:
`1 · 4 · 8 · 10 · 12 · 14 · 16 · 18 · 24 · 32 · 40 · 48 · 64 · 80`.
Apple's web spacing [S] runs `8 · 16 · 24 · 40 · 64 · 96 · 128`.

**HazardNet target** — a single 4 px-based scale, 12 steps:

| Token | Value | Use |
|---|---|---|
| `space-1` | **4 px** | hairline gaps, icon–label |
| `space-2` | **8 px** | tight internal padding, base unit |
| `space-3` | **12 px** | control padding, chip gaps |
| `space-4` | **16 px** | card inner padding, standard grid gap |
| `space-5` | **24 px** | card section spacing, grid gutters |
| `space-6` | **32 px** | section content padding |
| `space-7` | **40 px** | major content block spacing |
| `space-8` | **48 px** | compact section padding |
| `space-9` | **64 px** | standard section padding |
| `space-10` | **80 px** | large section padding |
| `space-11` | **96 px** | major page sections |
| `space-12` | **128 px** | hero areas |

**Delta:** today the distribution collapses at the bottom — `gap-2` (8 px) **486** ·
`gap-1.5` (6 px, off-scale) **220** · `gap-3` 172 · `gap-6` 34 · `gap-8` **8** · `gap-12`
**1**. And `py-2` (8 px) **303** vs `py-16` **2** and `py-24` **1**. The product has no
section rhythm at all; it has *padding*.

**Acceptance:** zero `gap-1.5`/`gap-2.5` (off-scale) in `src`; ≥80 % of section-level vertical
padding ≥ `space-9` (64 px); a documented rhythm where every `<section>` on a page uses one
of `space-9 · space-10 · space-11 · space-12`.

---

## R-04 · Layout grid and container

| Requirement | Value | Source | Current |
|---|---|---|---|
| Editorial container | **980 px** max content width | [S] Apple product pages | 20+ values; `max-w-3xl` (768px) ×22 leads |
| Console container | **1200 px** max | [S] Apple grid pages | `max-w-[1200px]` ×8 — **already correct; make it the only one** |
| Full-bleed bands | Sections extend edge-to-edge; content centred inside | [S] Apple | `App.tsx:333` applies `max-w-[1200px]` to `<main>` for **all** non-`/` routes, so no page can full-bleed |
| Columns | **12**, with a 24 px gutter | [S] | `grid-cols-N` ×271, no gutter token |
| Reading measure | **64 rem** (~1024 px) cap; body measure 60–75 characters | [S] Apple developer | not set |
| Safe area | `env(safe-area-inset-*)` on all fixed chrome | Apple | ✅ already in `App.tsx` |

**Structural change required:** `App.tsx:333` currently hard-codes the container on `<main>`:
```tsx
'flex-1 relative max-w-[1200px] w-full mx-auto px-4 lg:px-8 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:pb-8 pointer-events-auto'
```
Pages must own their own container so a section can break out full-bleed. Replace with a
`<Section>` / `<Container>` primitive pair: `<Section>` is full-bleed and owns the vertical
rhythm; `<Container>` is centred and owns the 980/1200 max-width.

---

## R-05 · Section rhythm — the most visible single difference

| Surface | Desktop | Tablet | Mobile |
|---|---|---|---|
| Hero band | **128 px** top / 96 px bottom | 96 / 64 | 64 / 48 |
| Major page section | **96 px** | 64 | 64 |
| Standard section | **64 px** | 48 | 48 |
| Compact section (console track) | **48 px** | 32 | 32 |
| Between a heading and its first block | **24 px** | 24 | 16 |
| Between cards in a grid | **24 px** | 24 | 16 |

Apple's alternating-band rule [S]: consecutive sections alternate `#ffffff` and `#F5F5F7`
(systemGroupedBackground) so **the canvas change is the separator** — no rules, no borders,
no dividers. Meta uses the same alternating light/dark "walkthrough" cadence [S].

**Delta:** `py-2` (8 px) **303** uses vs `py-24` **1**. Closing this gap is, visually, the
single change that will make the site read as Apple-like.

**Acceptance:** no `<section>` in the app with vertical padding < 48 px; alternation driven by
`backgroundBase` / `backgroundGrouped` tokens, never by `border-b`.

---

## R-06 · Elevation — lift, don't outline

Apple and Meta both build hierarchy from **shadow, not borders**. Meta lifts a white card off
a tinted canvas; Apple alternates canvas tones. HDS v2.2's 1px border on every panel is the
opposite of this and `MERIDIAN.md` §4.4 says so correctly.

**Target — 3 levels, ink-tinted (never pure black):**

| Level | Value | Use |
|---|---|---|
| `console` | `0 1px 2px rgba(20,26,31,0.04)` | dense data surfaces — *"must not look pressable"* |
| `card` | `0 2px 8px rgba(20,26,31,0.06), 0 1px 2px rgba(20,26,31,0.04)` | default card |
| `cardHover` | `0 8px 24px rgba(20,26,31,0.10), 0 2px 6px rgba(20,26,31,0.06)` | interactive card, hover/focus-within |
| `floating` | `0 12px 32px rgba(20,26,31,0.14)` | nav, FAB, floating control bar |
| `modal` | `0 24px 64px rgba(20,26,31,0.22)` | dialogs, sheets |

**Separators** only *inside* a card (`1px solid separator`, hairline), never between cards.

**Delta:** 8 named shadow levels + **19 hand-written `shadow-[…]`** values today. Collapse to
5 (3 + floating + modal), all tokenised.

---

## R-07 · Material — translucency scoped to chrome

Apple's material [S]: translucent, blurred, saturated chrome floating above content.
Meta uses translucency sparingly, on dark immersive moments only.

**Target** (Meridian's, already correct):

| Class | Fill | Blur | Saturation |
|---|---|---|---|
| `.mrd-glass` | 72 % white | 20 px | 1.8 |
| `.mrd-glass-strong` | 88 % white | 20 px | 1.8 |
| `.mrd-glass-dark` | dark canvas @ 72 % | 20 px | 1.8 |

**Hard rule (Meridian's, and correct):** *"surfaces a user reads and acts on stay opaque."*
Glass is for the nav, the map HUD and bottom sheets. **Never** behind a data table.

**Delta:** `backdrop-blur` appears **34** times; `--hn-glass-blur: 14px` exists in
`index.css:186` alongside Meridian's 20 px — a fourth divergence. Pick Meridian's.

**Cost note:** `backdrop-filter` is one of the most expensive compositor operations on a
low-end Android. Cap the number of simultaneously-blurred surfaces at **3**, and disable
under `data-low-bandwidth` (already done in `index.css:1336` — keep that).

---

## R-08 · Corner radii — concentric geometry

Apple's rule: **inner radius = outer radius − padding** (concentric). Meta's family [S]:
`6 px` base, `12 px` media, `16 px` cards, `32 px` hero media, `100 px` pill CTA. Apple's web
system [S] uses **28 px** on cards and product imagery and a **980 px** pill for buttons.

**Target** (Meridian's family, which already encodes both):

| Token | Value | Use |
|---|---|---|
| `xs` | **4 px** | chips, tags, inline badges |
| `sm` | **8 px** | inputs, console controls |
| `md` | **12 px** | media — Meta's image radius |
| `lg` | **16 px** | cards — Meta's card radius |
| `xl` | **24 px** | panels, dialogs |
| `xxl` | **32 px** | feature and hero media |
| `sheet` | **28 px** | bottom sheets, modals |
| `pill` | **9999 px** | CTAs, pills, search fields |

**Concentric rule:** `concentricRadius(outer, padding) = max(0, outer − padding)` — a 24 px
panel with 16 px padding gets an **8 px** inner surface. Meridian implements and tests this.

**Hard rules**
1. **Two tracks, chosen per surface** (Meridian's decision #2, which is correct and has no
   parent): `editorial` → card 16 px / control pill / media 24 px; `console` → card 8 px /
   control 8 px / media 8 px. **The console track never pills a control** — a 64-district
   table with pill controls is unscannable.
2. `rounded-full` is reserved for avatars, status dots and icon buttons.

**Delta:** **14 distinct radius values** today, including `rounded-none` ×3 and
`rounded-[36px]` ×1 against a documented 2 px control radius in `DESIGN_SYSTEM.md` §5. Close
to 8 tokens.

---

## R-09 · Motion

Apple's spring physics; Meta's restrained transitions. Meridian's table is already correct:

| Token | Duration | Curve | Use |
|---|---|---|---|
| `instant` | **120 ms** | `cubic-bezier(0.2,0,0.2,1)` | press states, toggles |
| `fast` | **200 ms** | `cubic-bezier(0.16,1,0.3,1)` | hover, focus, small changes |
| `base` | **320 ms** | `cubic-bezier(0.2,0,0.2,1)` | panels, drawers, routes |
| `slow` | **520 ms** | `cubic-bezier(0.16,1,0.3,1)` | hero and section reveals |
| `ambient` | **14 000 ms** | linear | background motion |
| `spring` | — | `cubic-bezier(0.34,1.56,0.64,1)` | **small values only** — large surfaces wobble |

**Hard rules**

1. **Animate only `opacity`, `transform`, `filter`.** Never `width`, `height`, `top`, `left`.
2. **Kill the rAF loops.** No `requestAnimationFrame` → `setState` for a 0.2 s fade (P0-02).
   Use a CSS keyframe or a Framer-Motion transition that terminates.
3. **Kill the 236 `transition-all` uses.** The *global* rule at `index.css:2697-2713` is
   actually correct — it declares an explicit
   `transition-property: color, background-color, border-color, text-decoration-color, fill,
   stroke, opacity, box-shadow, transform` (a properly compositor-safe list, 150 ms). The
   problem is at the component level: **`transition-all` appears 236 times across `.tsx`**,
   plus three `transition: all` declarations in `index.css:415, 710, 1435` — including one
   whose own comment on line 400 reads *"Named transitions — never `transition: all`."*
   `transition-all` animates layout properties, which is exactly what this rule exists to
   prevent. Codemod all 239 onto the 150/200/320 ms tokens with explicit property lists.
3b. **Retime to the Meridian curve set.** The global rule uses a flat `150ms /
   var(--ease-standard)` for everything; R-09's table wants 120/200/320/520 ms with
   `out`/`standard`/`emphasized` chosen by distance moved, not one duration for all.
4. **Reduced motion turns motion OFF, not down** — but **exempt progress indicators**
   (P2-A11Y-04), and guarantee the fallback is "content is present", never "content is
   invisible." Meridian's `[data-mrd-reveal]` handling is the correct pattern; the older
   `index.css:1312` block needs the spinner exemption.
5. **Delete Remotion from the web runtime.** It supplies `interpolate` and `Easing` only
   (`motion-interpolate.ts:20`) and lands in the main bundle. Keep Remotion for
   `frontend/src/remotion/*` compositions, which is what it is for.

---

## R-10 · Component anatomy — exact specifications

### R-10a · Button

| Property | Editorial track | Console track | Meta reference [S] | Apple reference [S] |
|---|---|---|---|---|
| Height | **48 px** | **44 px** | — | — |
| Min width | **44 px** | 44 px | — | 44×44 pt [A] |
| Radius | **9999 px** (pill) | **8 px** | 100 px pill | 980 px pill |
| Padding | `0 24 px` | `0 16 px` | 12 px 20 px | — |
| Font | 15 px / 600 / text face | 13 px / 600 | 15/600 Optimistic Text | 17 px SF Pro Text |
| Tracking | −0.003em | 0 | — | — |
| Default fill (browse/navigate) | **`actionInk` `#0D0D0D`** | `actionInk` | black ink pill | — |
| Hazard fill | `actionHazard` `#970002` | `actionHazard` | — | — |
| Interactive fill | `actionInteractive` `#1c67e3` | `actionInteractive` | `#0064E0` | `#0071E3` |
| Hover | darken 8 % + `translateY(-1px)` | darken 8 % only | `#0143B5`, `scale(1.1)` | — |
| Press | `scale(0.98)`, 120 ms | `scale(0.98)` | — | — |
| Focus | 3 px `focusRing`, 2 px offset | same | 3 px `hsl(214,89%,52%)` | — |
| Icon-only | **square, 44×44, `accessibleName` required** | same | — | — |

**Note the deviation, and keep it (R-14):** Meta's primary on marketing surfaces is a **black
ink pill** with cobalt reserved for the buy funnel. HazardNet's primary is the **ink pill**
with **crimson reserved for hazard** — structurally the same colour-scarcity discipline,
inverted for a safety reason. Do not "fix" this toward Meta.

### R-10b · Card

| Property | Editorial | Console |
|---|---|---|
| Background | `backgroundElevated` `#FFFFFF` | `#FFFFFF` |
| Radius | **16 px** | **8 px** |
| Shadow | `card` | `console` |
| Border | **none** (lift, don't outline) | `1px solid separator` only where density requires |
| Padding | **24 px** | **16 px** |
| Media radius | `xxl` 32 px (hero) / `md` 12 px (tile) | `sm` 8 px |
| Interactive | `cardHover` shadow on hover **and** `focus-within`; `translateY(-2px)` | **no lift** — never looks pressable |
| `flush` variant | radius clips media, padding 0 | same |

### R-10c · Navigation

Apple's nav [S]: **44 pt** bar height, translucent material over content, **12 px** text,
`systemBackground` at 72–88 % opacity with a hairline separator only once scrolled.

| Property | Target | Current |
|---|---|---|
| Height | **44 px** compact / 56 px expanded | `h-11` (44 px) ×37 ✅ |
| Background | `.mrd-glass-strong` (88 %), hairline appears at scroll > 1 px | `bg-black/25 backdrop-blur-md` over hero → `bg-white/95 backdrop-blur-md` after 80 px |
| Item font | 12 px / 400 (`caption`) | mixed |
| Item hit area | **44 × 44** minimum | `min-h-[44px]` on the logo ✅; menu items unverified |
| Transition to solid | 200 ms `fast` on background + border only | 300 ms — retime |
| Breakpoint | align to R-11 (1024 px), **not** `xl` (1280 px) | `xl` per `DESIGN_SYSTEM.md` §4 |

### R-10d · Input

| Property | Target | Meta ref [S] |
|---|---|---|
| Height | **44 px** (48 px editorial) | — |
| Radius | **8 px** | 8 px |
| Border | `1px solid separatorOpaque` `#CED0D4` | `#CED0D4` |
| Padding | `0 14 px` | 12 px 14 px |
| Font | 15 px / 400 | 15/400 |
| Placeholder | `labelTertiary` `#6B7885` (4.52:1) — **not** `inkQuaternary` | `#8A8D91` |
| Focus | border → `actionInteractive`, **3 px** outer ring, 2 px offset | 3 px `hsl(214,89%,52%)` |
| Error | border + label → `actionHazard`; `aria-describedby` on the message | `hsl(350,87%,55%)` |
| Label | always visible; never placeholder-only | — |

### R-10e · Table (console track)

Dense, flat, **hairline separators inside the card, none between cards**. Row height 44 px
minimum so rows are tappable. Sticky header with `backgroundElevated` at 88 %. Numeric
columns `font-variant-numeric: tabular-nums` + right-aligned. **Responsive strategy required**
— the 47 `overflow-x-auto` sites are the symptom (P2-RES-03): priority columns below 768 px
with a "show all N columns" disclosure that is a real `<button>`.

### R-10f · Severity badge — three channels, always

| Level | Text (`≥4.5:1` on surface) | Fill (`≥3:1`) | Surface | Glyph | Rank |
|---|---|---|---|---|---|
| Low | `#15803d` | `#16a34a` | `#dcfce7` | `bar1` | 1 |
| Moderate | `#9c4b00` | `#ea6f24` | `#fef3c7` | `bar2` | 2 |
| High | `#b91c1c` | `#dc2626` | `#fee2e2` | `bar3` | 3 |
| Very high | `#b91c1c` | `#dc2626` | `#fee2e2` | `bar4` | 4 |
| Extreme | `#991b1b` | `#dc2626` | `#fee2e2` | `diamond` | 5 |

Colour **+** glyph **+** word. Never colour alone (WCAG SC 1.4.1). Radius `xs` 4 px,
padding `2px 8px`, 11 px/500, `tabular-nums`.

---

## R-11 · Responsive — three breakpoints and fluid type

| Name | Range | Behaviour |
|---|---|---|
| Mobile | **0–767 px** | single column; display sizes via `clamp()` floor; console table switches to priority columns |
| Tablet | **768–1023 px** | 2-column grids; compact sections (48 px) |
| Desktop | **≥1024 px** | full layout; 3-column grids; standard sections (96 px) |

**Hard rules**
1. **Type is fluid, not stepped** — `display1/2/3` already use `clamp()`. Extend to `title1`
   and `title2`. Meta and Apple both scale hero type continuously; neither steps it at three
   breakpoints.
2. **Align the nav breakpoint to 1024 px.** `DESIGN_SYSTEM.md` §4 puts it at `xl` (1280 px),
   which leaves 1024–1279 px in the mobile chrome on a desktop viewport.
3. **Remove every fixed px width** (P2-RES-03): `w-[480px]`, `w-[320px]`,
   `max-w-[230px]`, `max-w-[240px]`, `min-w-[200px]`, `min-w-[210px]` → `min()`/`clamp()`.
4. **Touch targets:** 44 px universal floor, **48 px on Android** (Meridian's rule), enforced
   where utilities cannot override it (P1-RES-01).
5. **Text scaling:** verify every page at 200 % root font size. `index.css` uses rem for
   size tokens but 43 fixed-px widths will break first.

---

## R-12 · Accessibility floor — non-negotiable

| Requirement | Standard | Gate |
|---|---|---|
| Body text ≥ 4.5:1; large text (≥18.66 px bold / 24 px) ≥ 3:1; non-text ≥ 3:1 | WCAG 1.4.3 AA | `meridianContrast.test.js` extended to **every** role × background pair |
| Every status pairing validated **on its own tint**, not on white | WCAG 1.4.3 | new test (closes prior P1-04) |
| Control boundaries ≥ 3:1 | WCAG 1.4.11 | new test (closes prior P1-05) |
| Every interactive element has an accessible name | WCAG 4.1.2 A | `eslint-plugin-jsx-a11y` (absent today) |
| Focus always visible, 3 px ring, never removed | WCAG 2.4.7 AA | delete 75 `outline-none` (P2-A11Y-03) |
| Touch target ≥ 44 px (48 px Android) | WCAG 2.5.8 AA + Apple HIG [A] | tokenised, non-overridable |
| Severity never colour-alone | WCAG 1.4.1 A | 5 glyphs + ranks + labels |
| Skip link first in tab order on **every** route, including prerendered HTML | WCAG 2.4.1 A | add to prerenderer (INT-04) |
| Landmarks `<header> <main> <footer>` on every route **and** every prerendered doc | WCAG 1.3.1 A | add to prerenderer (INT-04) |
| Heading order never skips a level; exactly one `<h1>` | WCAG 1.3.1 / 2.4.6 | add to `check:design` |
| Images: `alt` + `width` + `height` + `loading="lazy"` | WCAG 1.1.1 A | 19/19 currently fail |
| Reduced motion OFF, **except** progress indicators | WCAG 2.3.3 | P2-A11Y-04 |
| `prefers-contrast: more` → `highContrast` theme automatically | WCAG 1.4.6 | already in `meridian.ts`; unreachable until THE-01 is fixed |
| Bengali: `lang="bn"` on the Bengali subtree, `size ≥ 15px`, `line-height ≥ 1.35` | — | R-00 |

---

## R-13 · Performance budget

| Metric | Target | Current | Gap |
|---|---|---|---|
| **Total `dist` size** | **≤ 20 MB** | **126 MB** | **−106 MB** |
| Dead assets in `public/` | **0** | 113 MB video | delete (P0-01) |
| Largest single JS chunk | **≤ 300 KB** | **1,510.1 KB** (`HistoricalCatalogPage`) | −1,210 KB |
| Total JS | **≤ 1,200 KB** | 6,447.9 KB | −5,248 KB |
| CSS shipped on first route | **≤ 80 KB** | 247.0 KB | −167 KB |
| Fonts | **≤ 50 KB**, ≥ 3 faces | **0 KB, 0 faces** | +50 KB (R-00) |
| Images | WebP/AVIF, `loading="lazy"`, explicit dimensions | 19/19 non-compliant | P1-PERF-04 |
| Long tasks on main thread at idle | **0** | ~8 permanent rAF loops | P0-02 |
| `backdrop-filter` surfaces mounted at once | **≤ 3** | 34 declarations | audit |
| LCP (Slow 4G, 4× CPU) | **≤ 2.5 s** | not measured | instrument |
| CLS | **≤ 0.1** | not measured | instrument |

**Ordered actions:** (1) delete the video — 106 MB for one `git rm`; (2) move the 5 JSON
imports in `HistoricalCatalogPage.tsx` to `fetch()`; (3) kill the rAF loops; (4) split the
CSS per track; (5) remove Remotion from the web runtime; (6) lazy-load and dimension the 19
images.

---

## R-14 · What must NOT be copied — the HazardNet deltas

These seven items depart from Apple/Meta **on purpose**. Each is a place where the brief, the
audience or the product's function overrides the reference.

1. **Dual-primary inverted for safety.** Meta spends cobalt on the buy funnel; HazardNet
   spends crimson on hazard **only**, and navigation is the ink pill. *"A red button that
   means 'look at this page' trains the reader to ignore the red that means 'your district is
   under warning.'"* **Keep.**
2. **Bengali-first bilingual typography.** Neither parent ships Bengali. Requirements with no
   reference implementation: face subsetting across U+0980–U+09FF, a 1.35 line-height floor,
   ≥15 px minimum, open tracking, and a translation that can reword but never shorten or
   reorder a page.
3. **Two geometry tracks** (`editorial` / `console`). Neither parent ships a 64-district data
   console; 32 px corners waste the pixels the table needs. **Keep.**
4. **Degraded-but-honest offline states.** Neither parent is read in a flooded field with no
   signal. Empty ≠ unknown ≠ failed, rendered as three distinct states, never as a zero. Keep
   and extend (the prior audit's P1-10 is only partially closed).
5. **Severity as three channels.** Neither parent encodes life-safety levels. Keep colour +
   glyph + word.
6. **Legibility floors above the reference.** Apple's floor is 11 pt; on a low-end Android in
   direct sunlight, **12 px should be the practical floor and 17 px the body**. Where Apple
   and Meta can afford 11 px caption text on a Retina display, HazardNet cannot.
7. **Restraint on material and motion.** 3 blurred surfaces maximum and no ambient animation
   on the console track, because the target device cannot afford Apple's material budget.
   Apple's Liquid Glass is a 2025+ Retina-hardware feature; HazardNet's median device is not.

**One open decision for the owner.** Apple and Meta both use **blue** as their single
interactive colour. HazardNet uses NASA blue `#1c67e3` for on-page interaction and crimson
`#970002` for hazard. If the Apple/Meta look is to be adopted *wholesale*, the interactive
blue would need to align with Meta's `#0064E0` / Apple's `#0071E3`. **Recommendation: keep
`#1c67e3`** — it is NASA HDS, it measures 5.12:1 on white, the colour already carries
provenance meaning in this product, and changing it buys nothing the reader can perceive.
Flagged rather than decided, because it is a brand question, not an engineering one.

---

## 11 · Step-by-step migration plan

Each phase is independently shippable and each has an acceptance gate. Phases 0–2 are
prerequisites: **do not start Phase 3 before Phase 1 closes**, because the adoption is a
typography programme.

### Phase 0 — Payload (½ day, −106 MB)
1. `git rm --cached frontend/public/hero-section/*.mp4`; add to `.gitignore`.
2. Delete `EARTH_HERO_VIDEO_*` exports from `heroMedia.ts`.
3. Move the 5 JSON imports in `HistoricalCatalogPage.tsx:11-15` to `fetch()` inside the lazy
   route.
4. Add `scripts/check-assets.mjs`: fail if any `public/` file > 1 MB.
- **Gate:** `du -sh frontend/dist` ≤ 20 MB; largest chunk ≤ 300 KB; both new gates wired into
  CI.

### Phase 1 — Typography delivery (2–3 days) — **the gate on everything downstream**
1. Licence, subset and ship 3 WOFF2 faces (display / text / Bengali) ≤ 50 KB total, with
   `unicode-range` splits.
2. Add `@font-face` blocks; delete the 9-family fiction in `index.css`.
3. **Make `check:fonts` fail on 0 files.**
4. Delete `index.css:2768` (`body, body *`); switch `[lang="bn"]` → `:lang(bn)`.
5. Verify Bengali actually resolves to the Bengali face.
- **Gate:** `document.fonts.size ≥ 3`; `check:fonts` non-vacuous; Bengali renders in the
  Bengali face; prior P1-02 and P1-03 closed.

### Phase 2 — Runtime and cascade (2 days)
1. Replace `useWebFrame` with a terminating CSS/Framer transition; delete all 8 call sites.
2. Remove Remotion from the web runtime (`motion-interpolate.ts` → a local `interpolate`).
3. Move the unlayered element rules (`index.css:30, 333, 1407, 1479, 1522, 1546`) into
   `@layer base`; drive the `!important` count from 402 toward 0.
4. Replace blanket `transition: all` with explicit property lists.
5. Exempt progress spinners from the reduced-motion kill.
- **Gate:** 0 rAF loops at idle; `check:design:source` ≤ 1; prior P1-01, P1-08, P1-09 closed.

### Phase 3 — Token bridge (1 week) — `MIGRATION_PLAN.md` §1.2
1. Alias every Tailwind palette family onto Meridian semantic roles in `@theme inline`.
2. Codemod `text-carbon-NN` / `bg-carbon-NN` → role tokens. **Delete `text-carbon-10/20/30`
   outright** (the 118 sites that fail AA).
3. Collapse radii to 8 tokens; collapse shadows to 5; collapse the z-scale.
4. Ban `#[0-9a-f]{3,8}` inside `className` via ESLint.
- **Gate:** 0 raw hex in `.tsx` classNames; 0 `text-carbon-*`/`bg-carbon-*`; ≤ 8 radius
  values; ≤ 5 shadow values; 0 ad-hoc z-index; **A11Y-01 closed**.

### Phase 4 — Type scale and rhythm (1 week)
1. Land the 12-style scale as Tailwind theme tokens; `clamp()` on `title1`–`display1`.
2. Codemod `text-xs` (1,265) → `footnote`/`caption` by role; body → 17 px.
3. Delete all sub-11 px sizes (161 sites).
4. Introduce `<Section>`/`<Container>`; move the container off `App.tsx:333`; set the
   rhythm (64/96/128 px).
5. Collapse 20+ container widths to 980 (editorial) / 1200 (console).
6. Collapse weights to 400 / 500 / 600 (+700 hazard only).
7. Add display tracking (−0.008em → −0.03em).
- **Gate:** 0 sizes below 11 px; body 17 px on the top 10 routes; every `<section>` ≥ 48 px
  vertical padding; ≥80 % of sections use the rhythm tokens; **TYPE-01 and TYPE-02 closed**.

### Phase 5 — Component layer (2 weeks)
1. Promote `components/meridian/primitives.tsx` to the single component layer: Button,
   ButtonLink, Card, PillTabs, SeverityBadge, ProvenanceNote, SectionHeading, Input, Select,
   Dialog, Table, Sheet, Toast.
2. Bake 44/48 px into `.mrd-btn` so no call site can override it.
3. Roll out per surface, ordered by the `MIGRATION_PLAN.md` §0 density list: map and district
   brief → analytics and alerts → editorial → chrome → auth.
4. Wire `useMeridianTheme`; ship light + dark + highContrast.
5. Add `eslint-plugin-jsx-a11y`.
- **Gate:** `.hn-btn-*` retired; 0 sub-44 px controls; every button named; prior P1-06 and
  P1-11 closed; **THE-01 closed**; dark mode reachable and validated.

### Phase 6 — Prerendered surface (2 days)
1. Emit `<header> <main id="main-content"> <footer>` and the skip link from
   `scripts/prerender.mjs` on all 198 documents.
2. Fix the `<nav>` nested in `<ul>` in `index.html`.
3. Replace the static shell's 20 hard-coded hex literals with the same custom properties and a
   `:root` fallback block; add a `404.html` `<h1>`.
4. Point `check:design` at `frontend/src` (add `detector.ignoreFiles: ["frontend/dist"]`).
- **Gate:** 0/198 documents missing landmarks or skip link; 0 hex literals in prerendered
  `<style>`; **INT-03, INT-04, INT-05 closed**; the gate reports a number it can act on.

### Phase 7 — Content and image pipeline (3 days)
1. WebP/AVIF derivatives for the 5 carousel JPEGs (812.6 KB).
2. `loading="lazy" decoding="async"` + `width`/`height` on all 19 `<img>`.
3. Write `alt` for the 3 carousel images (currently none).
4. Adopt Apple's alternating `#ffffff` / `#F5F5F7` band rhythm on editorial pages.
- **Gate:** 0 images without dimensions or `alt`; LCP and CLS instrumented with budgets.

### Phase 8 — Verify (1 day)
1. Re-run `/impeccable audit` and score all five dimensions.
2. Re-run the detector on `frontend/src` only.
3. Rendered pass in a real browser at 390×844 and 1440×900, plus synthesized touch on the
   scrollable control strips — **the one thing this audit could not do.**
4. Update `DESIGN_SYSTEM.md` to describe the system that now ships, or retire it in favour of
   `MERIDIAN.md`.

**Total: ~7–9 working weeks.** Phases 0–2 (~1 week) close every P0 and are worth doing
regardless of whether the Apple/Meta adoption is approved.

---

## 12 · Recommended actions (impeccable commands, priority order)

1. **[P0] `/impeccable optimize`** — delete 113 MB of unreferenced hero video (PERF-01), move
   the 1,484.6 KB JSON out of the JS graph (PERF-03), kill the 8 rAF loops and Remotion
   (PERF-02), lazy-load and dimension the 19 images (PERF-04).
2. **[P0] `/impeccable typeset`** — ship 3 subset WOFF2 faces ≤ 50 KB, make `check:fonts`
   non-vacuous, fix `body, body *` and `:lang(bn)` (INT-02), then land the 12-style scale with
   a 17 px body and an 11 px floor (A11Y-01, TYPE-01, TYPE-02).
3. **[P1] `/impeccable colorize`** — role-based semantic colour, tint-aware contrast
   validation, delete the 196 sub-AA instances (A11Y-01, prior P1-04/P1-05).
4. **[P1] `/impeccable extract`** — promote `meridian/primitives` to the single component
   layer; retire the documented-but-unused `.hn-btn-*` (INT-01, prior P1-11).
5. **[P1] `/impeccable polish`** — wire `useMeridianTheme` and ship all three themes (THE-01);
   delete the 75 `outline-none` (A11Y-03); collapse the z-scale (INT-06); rebuild the
   prerendered shell on tokens (INT-03).
6. **[P1] `/impeccable adapt`** — 44/48 px non-overridable floor (RES-01), three breakpoints
   and fluid type (RES-02), remove 43 fixed widths and add a responsive table strategy
   (RES-03).
7. **[P2] `/impeccable layout`** — section rhythm 64/96/128 px, 980/1200 containers, 12-column
   24 px-gutter grid, concentric radii (P3-01, P3-02, THE-02).
8. **[P2] `/impeccable animate`** — replace the rAF engine with terminating transitions,
   explicit `transition-property`, spinner-exempt reduced motion (P2-A11Y-04).
9. **[P2] `/impeccable harden`** — name every control (A11Y-02), landmarks and skip link in
   the 198 prerendered documents (INT-04), fix the 3 non-semantic click targets (P3-04).
10. **[P3] `/impeccable audit`** — re-run after Phases 0–7 to verify the score moved.
11. **[P3] `/impeccable polish`** — final quality pass.

**Also offered (not blocking):** `/impeccable init` — this project has no `PRODUCT.md`. The
content, audience and constraints recorded across `README.md`, `PUBLICATION_POLICY.md`,
`MERIDIAN.md` and `FrontDoor.tsx` are unusually well articulated and would make a strong
`PRODUCT.md`; capturing it would stop the next audit from having to re-derive the brief.

---

## Appendix A · Reproducing the measurements

All scans were purpose-written for this audit; the scripts are described here so the numbers
can be re-derived.

| Script | What it does |
|---|---|
| `scan.mjs` | 40 regex rules over 230 code files, per-line, recording `file:line` + snippet. Produces the counts in §5 (hex, rgb, sizes, hit sizes, `outline-none`, z-index, breakpoints, radii, shadows, gaps, `dark:` variants, token vs literal usage…). |
| `contrast.mjs` | WCAG 2.1 relative luminance (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`, `0.2126R + 0.7152G + 0.0722B`) applied to the real values in `styles/nasa-hds.css`. Produces §A11Y-01, §6 and §R-02. |
| `static-html.mjs` | jsdom over all 198 `dist/**/*.html`; checks landmarks, heading order, `alt`, duplicate IDs, invalid nesting, and greps the inline `<style>` for hard-coded hex, zero radii and sub-12 px sizes. Produces INT-03 and INT-04. |
| `a11y-dom.mjs` | jsdom + `runScripts: 'dangerously'` against the live dev server. **Inconclusive** — jsdom cannot execute Vite's ES-module output; the DOM never mounted (26 nodes). Retained in the method table for honesty, not for findings. |

Commands: §4. Environment: Node 22.22.3, npm 10.9.8, `impeccable` CLI 4.1.0 (the skill
document fetched is v4.5.0 — the npm distribution lags the reference).

## Appendix B · Sources

- [Apple Human Interface Guidelines — Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — default/minimum sizes by platform, text styles, Dynamic Type, optical sizes, tracking. **[A]** (primary)
- [Apple HIG — Typography (macOS visual design)](https://developers.apple.com/design/human-interface-guidelines/macos/visual-design/typography/) — macOS built-in text-style table, SF Pro variable/optical sizing, Text ≤19 pt / Display ≥20 pt rule. **[A]** (primary)
- [Apple Design System breakdown (2026)](https://superdesign.dev/blog/apple-design-system) — 17 pt body / 34 pt large title, semantic adaptive colours, 44×44, Liquid Glass. **[S]**
- [Apple design-system reference](https://designmd.me/discover/apple) — 980 px container, 8/16/24/40/64/96/128 spacing, pill radius, alternating `#ffffff`/`#F5F5F7`. **[S]**
- [Apple (España) design system](https://styles.refero.design/style/c9cabb96-32fa-4896-837a-f2497ce1c856) — 80–96 px display, −1.44 px tracking at 96 px, 28 px card radius, 17 px body at −0.022em. **[S]**
- [Meta design-system reference](https://oh-my-design.kr/design-systems/meta) — Meta type table 56 px → 12 px, `#0064E0`, `#1C2B33`, `#CED0D4`, 8 px input radius, 15 px button. **[S]**
- [Meta (Store) design system](https://open-design.ai/plugins/design-system-meta/) — 8 px grid, 14-step spacing scale, Optimistic VF ss01/ss02, pill CTAs, alternating light/dark cadence. **[S]**
- [Meta Design System for React](https://www.shadcn.io/design/meta) — two-tier primary (black ink / cobalt buy flow), 12→64 px Optimistic scale, 100 px pill + 32 px card rounding. **[S]**
- [What font does Facebook use?](https://www.designyourway.net/blog/what-font-does-facebook-use/) — Optimistic and Facebook Sans are proprietary, by Dalton Maag, not publicly available. (confirms R-00)
- [Typography System Guide — iOS & Android](https://alansdead.github.io/typography-system-guide/) — iOS default type styles with line heights; Dynamic Type 12 sizes, AX5 ≈310 %. **[S]**

**[A]** = Apple-published primary source. **[S]** = third-party aggregation, calibrated
approximation. Meta publishes no design-system documentation at Apple's level of rigour, so
every Meta figure here is **[S]**.
