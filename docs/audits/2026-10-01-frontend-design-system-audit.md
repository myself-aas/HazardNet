# Frontend Design-System Audit — HazardNet Web App

**Date:** 2026-10-01 · **Target:** `frontend/` (React 18 · Vite 8 · Tailwind v4 · Leaflet · Framer Motion) · **Branch:** `arena/01a0f7cc-hazardnet` @ `5acfe8f`
**Skill:** Impeccable `SKILL.md` v4.4.0 → `audit` playbook (technical, 5 dimensions) + abridged `critique` lens · **Detector CLI:** `impeccable` 4.1.0 (the skill document is newer than the published CLI, so detector rules may lag)
**Mode (per skill):** *Operate* (hazard monitoring, alerts, district pages) with *Read* surfaces (docs/methodology) and an editorial front door.
**Method line:** single-context run. No sub-agent/Task tool is exposed in this environment, so the critique lens in §11 is **abridged and not dual-agent**; the `audit` playbook itself is a single pass and is not degraded by that. The deterministic detector was run **once**, as the context loader directed.
**Context state:** no `PRODUCT.md` / Impeccable-format `DESIGN.md` exists (`impeccable context` → `NO_PRODUCT_MD`, `EXISTING_VISUAL_SYSTEM`). Per the directive, the incumbent code is treated as design authority; the bespoke `frontend/DESIGN_SYSTEM.md` ("HDS v2.2") is audited **against the code**, not trusted.

> **Evidence tags used below:** **[R]** measured in a real browser (Chromium 153, headless shell) · **[S]** static source analysis · **[C]** computed math (WCAG luminance / CIE) · **[E]** controlled experiment (scratch build, repo untouched) · **[U]** not verified.
> Unlike the two audits of 2026-09-30 (which state *"No browser is available"*), this one rendered the app. Several of their class-count conclusions are recalibrated in §10.

---

## 1. Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|:-----:|-------------|
| 1 | Accessibility | **2** | 205 axe contrast failures rooted in ~5 token pairs; **13 of 14** form controls fail the 3:1 boundary rule; critical `select-name` on filters; Bengali typography selectors never match (`[lang="bn"]` vs `bn-BD`) |
| 2 | Performance | **2** | Every page eagerly loads **846 kB gzip** of JS (jsPDF + Recharts + Firebase) because of two `manualChunks` rules **[E: −32 % bytes, −1.5 s FCP on Slow 4G]**; a never-ending rAF→`setState` loop (~60 React commits/s idle, 36–89 % main-thread busy at 4× CPU); CLS 0.38–0.48 |
| 3 | Responsive Design | **3** | Zero horizontal overflow on 25 routes at 320/390/820/1440 px and at 200 % root font size; weak spots are map-chrome collisions, FAB overlap, 29 % of mobile targets <44 px, no text-size-preference scaling |
| 4 | Theming | **2** | Real token layer (99.8 % family / 98.8 % shade compliance) but **three diverged token sources**, light-only (247 inert `dark:` variants), 698 hex literals in TS, documentation (DESIGN_SYSTEM.md, CSS comments, READMEs) wrong in 14 places |
| 5 | Implementation Integrity | **1** | Unlayered element rules silently override Tailwind utilities (64–100 % on `p/h2/h3`); six competing typography contracts and zero loaded web fonts; documented component classes have **0 consumers**; the design gate baselines 3,439 findings, **94 % of which are false positives** |
| | **Total** | **10 / 20** | **Acceptable (10–13): significant work needed** — foundations are good, the system layer is not coherent |

*Rating bands (playbook):* 18–20 Excellent · 14–17 Good · **10–13 Acceptable** · 6–9 Poor · 0–5 Critical.

---

## 2. Implementation Integrity Verdict — **FAIL** (product-specific content: PASS)

**Question:** does the implementation express a coherent, product-specific system?

* **Pass — the *content/information* system is distinctly HazardNet's.** Provenance-stamped artifacts, SLO ages ("Past SLO, 15.4 d old"), dual-track severity, "a baseline colour is not an alert", emergency numbers (999 / 1090 / 16123), a pending-review banner on the Bengali draft. None of this could be lifted onto another product.
* **Fail — the *visual/implementation* system is not coherent.** Evidence **[R][S]**:
  1. Authored Tailwind classes lose to hidden unlayered CSS (P1-01), so markup does not predict rendering.
  2. Typography is decided by file order and `!important` across six directives; **no web font is ever loaded** (`document.fonts` empty on all 25 routes; `public/fonts/` is empty) (P1-02).
  3. The "design system" has tokens but **no component layer**: `.hn-btn-*` / `.hn-card*` have **0 usages**; `components/ui/` has no Button/Input/Select/Dialog/Badge; `/alerts` renders **29 distinct button recipes across 38 buttons** (P1-11).
  4. Three sources of truth (CSS, `frontend/src/design-system/tokens.ts`, `packages/design-system`) have diverged and give **contradictory MUST rules** (square/hairline vs "soft bento"; 4-step vs 5-step severity) (P1-12).
  5. Decorative HUD chrome claims a telemetry that does not exist ("OPTICAL SENSOR STREAM · 30 FPS") on a site whose thesis is *every figure comes from a named artifact* (P2-13).
* **Detector (deterministic, kept separate from judgement):** 3,477 raw findings → **3,242 disproved in a real browser** (see §8). The real signal the detector *did* surface: the declared `Inter`/`Roboto` stack (`overused-font`), 13 two-pixel left-rule callouts (an intentional HDS pattern), and one decorative sky→indigo gradient card.

---

## 3. Executive Summary

* **Audit Health Score: 10/20 (Acceptable).** Issues: **P0 0 · P1 12 · P2 17 · P3 10 (39 total).**
* **Top issues**
  1. **Cascade inversion + typography incoherence + Bengali selectors** (P1-01/02/03): the system that is *meant* to guarantee consistent, bilingual type does not apply; 8,640 of 8,943 Bengali characters on `/` render in the Latin `Inter` stack.
  2. **Accessibility cluster rooted in a few tokens** (P1-04/05/06/07): tinted-surface status colours (`--success`, `--warning`) were validated on white only; control borders ignore the system's own `--input` token; three of five CSS severity levels are the *same* `#dc2626`.
  3. **Performance** (P1-08/09, P2-05/06): one config edit removes 289 kB from every first load; one hook never stops re-rendering the whole shell.
  4. **State honesty at the edges** (P1-10, P2-11): empty ≠ unknown ≠ failed. `/alerts` can say "quiet period… number of districts assessed is shown above" with no such number.
  5. **Governance** (P1-11/12): documentation, tests and runtime disagree, and the gate cannot see what breaks.
* **Fast wins (hours, measured):** remove two `manualChunks` rules (−32 % transfer, −1.5 s FCP **[E]**); stop `useWebFrame` after its 200 ms fade (idle commits 60 → 0 **[R]**); `[lang="bn"]` → `:lang(bn)` (2 selectors); re-colour one breadcrumb chip (accounts for the largest single block of contrast failures); give three `<select>`s names.
* **Recommended next steps:** §12 (ordered commands). Also run `/impeccable init` to create `PRODUCT.md` (offered per the context directive; not part of the audit command list).

---

## 4. Methodology — step by step

Each step lists what was done and what it produced. Probe scripts lived in `/tmp` (not committed); §16 describes each precisely enough to reproduce, and they can be committed to `scripts/qa/` on request.

| # | Step | Tool / action | Output |
|---|------|---------------|--------|
| 1 | Load skill + playbooks | Fetched `SKILL.md` (v4.4.0), `reference/audit.md`, `reference/critique.md` (incl. heuristics, cognitive-load, persona sections) | Rubric: 5 dimensions scored 0-4, P0-P3, allowed command list |
| 2 | Project context | `npx impeccable context` (root → target selection → rerun from `frontend/`) | No PRODUCT/DESIGN; incumbent visual system is authority |
| 3 | Read prior art | `docs/audits/2026-09-30-*`, `docs/plans/…frontend-refactor.md`, `docs/design/impeccable-baseline.json`, `frontend/DESIGN_SYSTEM.md` | Baseline claims to verify; found missing `DESIGN.md`, `docs/design-system/MASTER.md` |
| 4 | Read the system | All 2,764 lines of `index.css`, `nasa-hds.css`, both `tokens.ts` files, `App.tsx`, Footer, Breadcrumbs, hooks | Cascade, token and typography map |
| 5 | Build & gates | `npm ci`, `vite build` + prerender, `check:tokens/fonts/bundle/design`, `tsc`, 7 design jest suites | All green (49 tests) — green despite defects (see P1-12) |
| 6 | Mechanical detector (once) | `impeccable detect --json frontend/src frontend/dist` | 3,477 findings → adjudicated in §8 |
| 7 | Static scan | 226 TS/TSX files: classes, hex, shades, role-collapse, a11y patterns, deps, dead code | §Appendix A tables |
| 8 | Computed contrast + CVD | Node (WCAG luminance, Machado CVD, CIE ΔE) over the system's own token pairs | §Appendix A |
| 9 | Get a real browser | Offline sandbox: CDNs blocked → `@sparticuz/chromium` from npm, libs unpacked manually; Noto Sans Bengali TTF installed to emulate an Android device | Chromium 153 running |
| 10 | Serve the real app | Repo's own Express backend on :3000 serving prerendered `frontend/dist` + API | Representative data states |
| 11 | Route sweep | 25 routes × {1440, 390} + overflow at {320, 820}; per page: layout, overflow, targets, rendered type/geometry, **axe-core** (wcag2a/aa, 21a/aa, 22aa, best-practice) | 3 JSON datasets |
| 12 | Cascade/Bengali/scaling probes | Compare each `<p>/<h1-4>/<button>` against a neutral `<div>` with identical classes; Bengali mode via `localStorage`; `html{font-size:200%}` | P1-01/03, P2-08 |
| 13 | Interaction probes | Skip link, 40-stop tab walk, dialogs (chat/drawer/palette: Tab×30, Shift+Tab×6, Esc, focus return), route-change focus/scroll/title, reduced motion | P2-02/10 |
| 14 | Focus-ring contrast | Forced `:focus-visible`, transitions off, outline colour composited over the *surrounding* background | Dark-surface 2.96:1 |
| 15 | Static-shell adjudication | App JS blocked, render all prerendered routes, axe + computed h1/leading | Detector false positives |
| 16 | Performance | CDN-like server (brotli, immutable cache); Slow 4G (1.6 Mbps/150 ms) + 4× CPU; 3 runs/variant; React-commit counter via DevTools hook; CLS/LCP | P1-08/09, P2-05 |
| 17 | Config experiment | Scratch `vite` configs (repo untouched): drop 2 rules / drop all manual chunks | −32 % / −45 % |
| 18 | Verification ledger | Re-test every hypothesis; retract what failed | §13 (13 retractions) |

**Environment caveats [U]:** software-rendered headless Chromium (no GPU/touch hardware); the sandbox has no system monospace/Bengali fonts, so *rendered glyph attribution is not used*—only computed font stacks and `document.fonts`; offline (map tiles, Firebase, GA blocked → console noise ignored); the Express backend returns 404 for `/api/v1/events/*` (affects data states, noted where relevant); custom touch gestures (map pinch/pan, BottomSheet drag) were **not** exercised.

---

## 5. Detailed Findings by Severity

Severity per the playbook: **P0** blocks task completion · **P1** significant difficulty or WCAG AA violation · **P2** annoyance with workaround · **P3** polish.

### P0 — Blocking: none.

---

### P1 — Major

#### P1-01 · Cascade-layer inversion: unlayered element rules silently override Tailwind utilities
* **Location:** `frontend/src/index.css:1470–1520` (`h1/h2/h3/p` fixed-px rules), `:1537–1545` (`button, [role=button] …`), `:374–376` (`*{font-family}`), `:2759–2762` (final guard). `@layer base` appears only at `:1191` and `:2678`; ~2,500 lines are unlayered.
* **Category:** Implementation Integrity (Theming)
* **Evidence [R]:** for every element whose `class` asks for a size/weight/leading/tracking utility, computed style was compared with a neutral `<div>` carrying identical classes (9 routes):

| Property | Asked | Overridden |
|---|---:|---:|
| `<p>` font-size | 123 | **79 (64 %)** |
| `<p>` font-weight | 30 | **30 (100 %)** |
| `<p>` letter-spacing | 15 | 15 (100 %) |
| `<p>` line-height | 77 | 34 (44 %) |
| `<h2>` font-size | 33 | **31 (94 %)** |
| `<h3>` font-weight / font-size | 26 / 20 | 26 (100 %) / 12 (60 %) |
| `<h1>` letter-spacing | 8 | 8 (100 %) |
| `<button>` font-weight | 52 | 12 (23 %) |

  Examples: `<p class="font-mono text-xs font-bold …">` wants 12 px/700 → renders **16 px/400**; `<p class="text-base md:text-lg">` never reaches 18 px (responsive variants are dead); `<h3 class="text-sm font-bold">` renders **18 px/600**.
* **Why:** unlayered declarations beat *every* layered rule regardless of specificity; Tailwind utilities live in `@layer utilities`.
* **Impact:** the visual hierarchy is set by hidden global rules, so markup does not predict rendering. Both 2026-09-30 audits counted *classes* (e.g. 303 `text-[10px|11px]`); on `<p>/<h*>` those never render. Any typographic redesign done through classes will silently fail.
* **Standard:** none directly (maintainability; WCAG 1.4.4 indirectly via fixed px — see P2-08).
* **Recommendation:** put all authored element/component CSS into `@layer base` / `@layer components`; keep **one** rem-based scale for `h1–h4/p/button` there; delete the `*` and `body *` font rules; add a regression test that renders a probe and asserts utility precedence (the cascade probe in §16 is 40 lines).
* **Suggested command:** `/impeccable typeset` → `/impeccable document`

#### P1-02 · Typography contract is incoherent and no web font is ever loaded
* **Location:** `index.css:16–33`, `:114–121` (`--hn-font-*` = DM Mono for sans/heading/display/brand/Bengali), `:374–376` (`*` → mono), `:843–861` (`@theme` font keys), `:1370–1394`, `:2759–2762`; `frontend/DESIGN_SYSTEM.md §2–3`; `frontend/public/fonts/README.md`; `scripts/check-font-payload.mjs`.
* **Category:** Implementation Integrity / Theming
* **Evidence:** six directives disagree: (1) DESIGN_SYSTEM.md — 8 families (Plus Jakarta Sans, Instrument Sans, Noto Sans Bengali, Anek Bangla, Baloo Da 2, Noto Serif Bengali…); (2) `:16–21` Inter/Roboto/Hind Siliguri/JetBrains; (3) `--hn-font-*` "strict monospace product-wide"; (4) `@theme` comment Public Sans Web/Inter/DM Mono; (5) element rules `font-family: var(--font-sans|--font-brand)`; (6) the end-of-file "final cascade guard" that wins. **[R]** Rendered (declared first family, by characters): **Inter 92.7 %, DM Mono 7.3 %**; Plus Jakarta/Instrument/Anek/Baloo: **0 %**. **`document.fonts` is empty on all 25 routes**; `public/fonts/` holds only a README; `check:fonts` passes with *"0 WOFF2 file(s), 0.00 KiB"* (vacuous). The README's "metric-matched system stacks" do not exist (no `size-adjust`/`ascent-override` fallbacks).
* **Impact:** the product has no effective typographic identity and no control over Bengali rendering; text falls to whatever the OS provides, differently per device. The detector's `overused-font` (Inter/Roboto) is true as a *declaration* and misleading as a *rendering*.
* **Standard:** —
* **Recommendation:** decide once (system-first is a legitimate edge-first choice) and express it in one `@theme` block + one Bengali stack; delete the other five. The 50 KiB total budget in the README is unlikely to fit Latin + Bengali across several weights — budget per script or use one variable Bengali subset. Make `check:fonts` fail when a family named in the CSS has no source.
* **Suggested command:** `/impeccable typeset`

#### P1-03 · Bengali typography rules never match; `lang`, coverage and aria-labels are inconsistent
* **Location:** `index.css:29–33` and `:2761–2762` (`[lang="bn"]`); `lib/i18n.ts:40` (`languageTag('bn')` → `'bn-BD'`) and `:929`; `components/Navbar.tsx` (untranslated nav); ~80 literal English `aria-label="…"` across components; `About.tsx`, `StatusPage.tsx`, `HazardsPage.tsx` not wired to i18n.
* **Category:** Accessibility (i18n) / Implementation Integrity
* **Evidence [R]** (`localStorage['hazardnet-language']='bn'`):
  * `<html lang="bn-BD">` but the CSS uses exact-match `[lang="bn"]` → **8,640 of 8,943** Bengali characters on `/` render under `Inter`, 298 under `DM Mono`, **5** under `Hind Siliguri` (only the toggle label). The Bengali `line-height:1.65`/tracking never apply; Bengali h1 renders at line-height **1.2** (token floor in `tokens.ts` is 1.35).
  * Coverage by route (Bengali vs untranslated Latin chars): `/` 8,943 vs 1,655 · `/alerts` 1,663 vs 1,553 · `/live` 42 vs 1,023 · `/hazards` 25 vs 3,169 · `/about` **0** vs 2,768 · `/status` **0** vs 6,941. The primary nav ("Home · Forecasts · Alerts · Advisories · Knowledge · Login") stays English everywhere.
  * `lang` is wrong in both directions: `/live` is `lang="bn-BD"` with ~96 % English text; `/about`, `/status`, `/hazards` revert to `lang="en"` although the user chose Bengali.
  * On `/alerts` **81 of 84** `aria-label`s remain English.
* **Impact:** the audience is Bangladeshi farmers and district officers. Screen readers pick a voice from `lang`; English strings marked `bn-BD` are read with a Bengali voice (the exact failure `i18n.ts`'s own header warns about). Bengali conjuncts need more leading than Latin.
* **Standard:** WCAG 3.1.1 Language of Page (A), 3.1.2 Language of Parts (AA), 1.4.12 Text Spacing intent.
* **Recommendation:** `:lang(bn)` (not `[lang="bn"]`) for font stack, `line-height ≥ 1.5`, and heading leading; drive `<html lang>` from the i18n store on every route (or render `lang` on the translated containers); translate nav and `aria-label`s through `t()`; make untranslated routes say so.
* **Suggested command:** `/impeccable typeset` + `/impeccable harden`

#### P1-04 · Colour-contrast failures are systemic: tokens were validated on white, but used on tinted surfaces
* **Location:** `index.css:193–200` (`--success`, `--warning` + surfaces), `:245–252` (severity), `components/Breadcrumbs.tsx:65–69` (amber-700 on amber-50, 11 px), `components/alerts/AlertLevelBadge.tsx:38,44` ("No alert" pill), `components/auth/BrandPanel.tsx:110,223–229` (carbon-60 on carbon-90), `lib/geo.ts:23` + `design-system/tokens.ts:73` (`#7f1d1d`), `pages/HazardDetailPage.tsx` (`meta.color` stock `#3b82f6`).
* **Category:** Accessibility
* **Evidence [R] axe `color-contrast`: 205 nodes on 36 of 49 page×viewport runs.** Dominant pairs (first 4 nodes/page sampled): `#b25600` on `#feebbe` **4.22** (×23, one breadcrumb chip on 14 files) · `#15803d` on `#def2e6` **4.28** (×15, the "No alert" state) · `#58585b` on `#17171b` **2.52** (×12, `/login`) · `#7f1d1d` on `#0e0e10` **1.92** (the **"Extreme" tier** on `/archive`) · `#3b82f6` on `#eff5fe` 3.35 · `#ea6f24` on `#fdf3ed` 2.82 · `#16a34a` on `#ecf7f0` 3.00.
  **[C]** root causes: `--success` on `--success-surface` **4.29**; `--warning` on `--warning-surface` **4.01**; documented "amber-700 5.5:1 on white" is **4.97**; the comment *"text values meet 4.5:1 on white/surfaces"* (`index.css:192`) is false for two of four status families.
* **Impact:** the lowest-severity state ("No alert") and the *highest* (Extreme) are among the least legible labels in the product.
* **Standard:** WCAG 1.4.3 Contrast (Minimum) AA.
* **Recommendation:** tokens must be validated against their own surfaces. Verified replacements **[C]**: warning text `#914500` (already declared as `--color-amber-800`) = **5.54:1** on the warning surface; success text `#166534` = **6.09:1**; severity-as-text `#914500` 6.29 / `#166534` 6.50 / `#b91c1c` 5.69; dark-surface Extreme `#fca5a5` = **10.16:1**; `/login` panel labels `carbon-30` = **9.12:1**. Treat `--severity-*-solid` as **fill-only**.
* **Suggested command:** `/impeccable colorize`

#### P1-05 · Form-control boundaries fail 3:1 and ignore the system's own `--input` token
* **Location:** `index.css:162` (`--input: carbon-50 … control boundaries clear 1.4.11's 3:1`); offending controls: `components/alerts/AlertFilters.tsx` (selects), `pages/Contact.tsx` (4 selects), login password field, `/analytics` search/select.
* **Category:** Accessibility
* **Evidence [R]:** of 14 controls measured on 4 routes, **13 fail**: `/alerts` 3/3 (border `#d1d1d1` on `#fff` = **1.53:1**), `/contact` 6/6 (`#b9b9bb` on `#f6f6f6` = 1.96), `/login` 1/2 (1.53), `/analytics` 3/3 (1.0–1.53). Components hand-roll `border-carbon-20/30` instead of consuming `--input`.
* **Standard:** WCAG 1.4.11 Non-text Contrast AA.
* **Recommendation:** one `Field` primitive (border `--input`, 4.46:1 on white) used by every `input/select/textarea`; add a rendered contrast test (jest-axe cannot do this in jsdom).
* **Suggested command:** `/impeccable polish` (after `/impeccable shape` defines the primitive)

#### P1-06 · Critical `select-name`: unlabeled filter dropdowns
* **Location:** `pages/HazardDetailPage.tsx:531,542` (division/district); `components/HistoricalHazardCatalog.tsx:220,239,387`. (`AlertFilters.tsx` is the correct pattern: `<label htmlFor>`.)
* **Evidence [R]:** axe **critical** `select-name`, 10 nodes on 4 runs (`/hazards/flood`, `/archive`).
* **Impact:** screen-reader users cannot tell what the dropdowns filter.
* **Standard:** WCAG 4.1.2 Name, Role, Value (A); 1.3.1; 3.3.2.
* **Recommendation:** associate a visible `<label>` (or `aria-label`); a shared `Field` fixes it by construction.
* **Suggested command:** `/impeccable harden`

#### P1-07 · Severity is colour-only on maps/legends, and three of five CSS severity levels are identical
* **Location:** `index.css:245–252` (`--severity-high/very-high/extreme-solid` all `#dc2626`; also `--risk-high` = `--risk-critical`), `design-system/tokens.ts:50–82`, `components/map/mapPrimitives.ts`, map markers (SVG `g` with `aria-label` only).
* **Evidence [C]** (CSS token colours `#16a34a / #f59e0b / #ea6f24 / #dc2626`; the legend's exact fills may differ slightly): ΔE (CIE76) between adjacent alert-level colours: warning↔severe **29.7** normal → **14.7** deuteranopia; watch↔warning 27.7 → 16.2; low↔high 122 → **21** (deut) — i.e. ambiguous for ~8 % of men; high vs very-high vs extreme solids: **ΔE 0.0**. `packages/design-system` says *"Do NOT map severities to the 5-step scale"* (policy is 4-step NO_ALERT/WATCH/WARNING/SEVERE) while CSS/TS still declare five.
* **Impact:** a sighted colour-blind user cannot decode marker severity on the map; meaning lives only in `aria-label`.
* **Standard:** WCAG 1.4.1 Use of Color (A).
* **Recommendation:** collapse to the 4-step policy taxonomy; add a second visual channel (glyph/shape/pattern or an always-visible label); keep colours as reinforcement.
* **Suggested command:** `/impeccable colorize`

#### P1-08 · Every page eagerly loads 846 kB gzip because of two `manualChunks` rules
* **Location:** `frontend/vite.config.ts:141–170`.
* **Category:** Performance
* **Evidence [R][E]:** `dist/index.html` modulepreloads 11 files = **3,058 kB raw / 846 kB gzip / 689 kB brotli** — including `vendor-pdf` (842 kB), `vendor-firebase` (681 kB), `vendor-recharts` (393 kB) — on a static About page. The entry imports **one binding** each from `vendor-pdf`/`vendor-recharts` — consistent with a shared helper being swept into the manual chunk (the helper was not individually identified) — which makes the whole chunk a static dependency; the experiment below confirms the rules are the cause. Removing only the `recharts` and `jspdf/html2canvas` rules: **1,825 kB raw / 512 kB gzip (−40 %/−39 %)**; removing manual chunking entirely: **1,677 / 469 kB**. Throttled mobile (Slow 4G, 4× CPU, cold, median of 3): transfer **889 → 600 kB (−32 %)**, load 4.37 → 2.89 s, **FCP/LCP 4.65 → 3.14 s**. The repo's budget (`check-bundle.mjs`) caps the *sum of all chunks* (1,600 kB) and any single chunk; its own comment's "initial < 400 kB" is not enforced.
* **Impact:** first-visit cost on the product's own target network; jsPDF/Recharts/Firebase parsed on pages that never use them.
* **Recommendation:** delete the two rules (or use dependency-aware `advancedChunks`); lazy-init Firebase; add an *initial-graph* budget to `check:bundle`.
* **Suggested command:** `/impeccable optimize`

#### P1-09 · A never-terminating rAF → `setState` loop re-renders the whole shell ~60×/s at idle
* **Location:** `frontend/src/lib/motion-interpolate.ts:30–45` (`useWebFrame`: `tick` calls `setFrame(...)` then `requestAnimationFrame(tick)` forever), used by `App.tsx:90` (`RouteFallback`) and `:241` (`AppContent`, which owns the route tree). `React.memo` count in the codebase: **0**.
* **Evidence [R]** (production build, 4× CPU, 6 s idle after settle): `/about` **60.2 commits/s**, 421 rAF/s, **36 %** main-thread busy; `/alerts` **58.7 commits/s**, **88.6 %** busy (+45 layouts/s, 81 concurrent infinite animations); `/` 9.3 commits/s, 33.5 %. With `prefers-reduced-motion: reduce` the hook returns early: **0 commits/s, 1.3–2.2 % busy** — proving causality.
* **Impact:** battery/thermal cost and jank on low-end Android for an *unchanged page*; the fade it drives lasts 200 ms.
* **Recommendation:** stop the loop when the 6-frame fade completes, or replace with a CSS `opacity` transition (and drop the Remotion runtime from the entry chunk, which exists for this).
* **Suggested command:** `/impeccable optimize` + `/impeccable animate`

#### P1-10 · Safety-critical empty state asserts "all clear" without the number it cites
* **Location:** `pages/AlertsPage.tsx:240–258`, `lib/i18n.ts:86–89`.
* **Evidence [R][S]:** when `source !== 'none'`, no alerts and `suppressed === 0`, the page prints *"Every district HazardNet can forecast is currently below the watch threshold. This is a quiet period, not a coverage gap — the number of districts assessed is shown above"* **even when `data.assessed === null`** (nothing is shown above). The front door, reading the same facts, says *"The alert artifact could not be read, so this panel does not state an outcome."* The message is also set in the card's smallest, greyest text (`text-xs text-carbon-60`).
* **Impact:** conflating *unknown* with *none* is false reassurance in a hazard product.
* **Recommendation:** gate the "quiet period" copy on `assessed > 0` and freshness within SLO; otherwise show the unknown/stale state; promote the status line typographically.
* **Suggested command:** `/impeccable clarify`

#### P1-11 · No component layer: tokens without components, two visual dialects
* **Location:** `index.css:1551–1650` (`.hn-btn-*`, `.hn-card*`); `components/ui/` (Bento, BottomSheet, FAB… — no Button/Input/Select/Dialog/Badge/Card).
* **Evidence [R][S]:** documented component classes: **0 usages** each; `/alerts` has **29 distinct button recipes across 38 buttons** (`/analytics` 18/52, `/advisories` 18/32, `/contact` 11/17); rendered radii on painted elements: **10 distinct values** (0 px 29 %, 8 px 18 %, pill 17 %, **4 px 16 %**, 16 px 12 %, 2 px 4 %…) vs the documented "unified 2 px". Two coexisting dialects, by the code's own words (`LanguageToggle.tsx` `TONES`): "slate/rounded-xl" (alerts, map) vs "HDS/square/hairline" (front door); `/archive` and the auth brand panel are dark islands inside the light shell. shadcn is configured (`components.json`) but no primitives were ever generated.
* **Impact:** every screen re-derives controls; consistency depends on memory, not construction.
* **Recommendation:** decide the dialect (product decision), then build 6 primitives (Button, Field, Badge/Chip, Card, Callout, Dialog on the existing `useDialogBehavior`) and migrate by route.
* **Suggested command:** `/impeccable shape` → `/impeccable layout`

#### P1-12 · Three diverged sources of truth; docs, tests and runtime disagree; the gate measures the wrong thing
* **Location:** `frontend/DESIGN_SYSTEM.md`; `frontend/src/design-system/tokens.ts` (174 lines; consumed once, for spring constants in `BottomSheet.tsx`) vs `packages/design-system/src/tokens.ts` (493 lines, header: *web MUST use `HDS_NASA_TOKENS` — square corners, hairline rules*); `index.css:177` (*"Decision 2026-10-01: soft bento"*); `docs/design/impeccable-baseline.json`; `scripts/check-design-quality.mjs`; `eslint.config.js`.
* **Evidence:** doc-vs-code drift ledger in §9 (14 rows); references to non-existent `DESIGN.md` and `docs/design-system/MASTER.md`. The design gate reports **3,439 outstanding / 1 waived / 0 new**; **3,242 (94 %)** are false positives disproved in a browser (§8) while the real failures (205 axe nodes, 13 control borders) are not in the gate. `check:design:source` (the CI variant) sees **1** finding in `src`. No `eslint-plugin-jsx-a11y`; `jest-axe` runs only in jsdom (cannot compute contrast); `check:fonts` is vacuous; all 7 design suites (49 tests) pass while P1-01…05 hold, because they pin token *values*, not rendered cascade, `:lang()` matching, tinted-surface or control-boundary contrast.
* **Impact:** green CI is not evidence of a coherent system; contributors cannot know which source to trust.
* **Recommendation:** one token source generated to CSS + TS; author `DESIGN.md` from the resolved decisions; waive the detector's disproved rules with documented reasons; add browser-rendered gates (axe contrast, control-boundary, utility-precedence, `:lang` match, initial-graph budget).
* **Suggested command:** `/impeccable document` → `/impeccable audit`

---

### P2 — Minor (fix in next pass)

| ID | Issue | Location / evidence | Standard | Command |
|---|---|---|---|---|
| **P2-01** | **Shell state derived from exact `pathname` breaks on trailing slashes.** The Express static server 301-redirects every prerendered route to its slash form (server log: `GET /login 301 → GET /login/ 200`, likewise `/about`, `/alerts`, `/live` — i.e. the README's self-host path `npm run build && npm start`); `AppContent` compares `=== '/live'`, `=== '/login'` etc. → `/live/` loses the full-bleed console (footer + white navbar appear) and `/login/`, `/signup/` render **two nested `<main id="main-content">`** (axe `landmark-no-duplicate-main`, `landmark-main-is-top-level`, duplicate IDs) plus a double header. [R] Vercel config has no `trailingSlash`/`cleanUrls` and the prerender emits both `x.html` and `x/index.html`, so production likely resolves `/live`, but `/live/` and any self-host deployment hit it. | `App.tsx:254–267, :331`; `Navbar.tsx:311`; `lib/navigation.ts:42–55` | WCAG 4.1.1 (IDs), 1.3.1 | `/impeccable harden` |
| **P2-02** | **No route-change management.** After client-side `/divisions → /divisions/dhaka`: `scrollY` stays **700** (not reset), `document.title` unchanged, focus → `<body>`, no live-region. Titles are generic on `/divisions`, `/divisions/:id`, `/dashboard` (24 of 25 routes have unique titles on direct load). ChatBot dialog returns focus to **`<body>`** after Esc *and* after its Close button (FAB remains in DOM); the mobile drawer returns correctly. | `App.tsx` (no `ScrollRestoration`/focus move); `ChatBot.tsx`; `useDialogBehavior.ts` | WCAG 2.4.2 Page Titled (A), 2.4.3 Focus Order (A) | `/impeccable harden` |
| **P2-03** | **Map chrome collides.** Attribution box (1024×66) overlaps the coordinate readout by **25,854 px²** at 1280/1440/1920 (required Esri attribution is cut mid-sentence); on a 390 px viewport the attribution is a 246×195 white card covering roughly 40 % of the visible map area; hero HUD strings overlap on mobile (3,216 px²). | `LiveMapView.tsx`; `HeroCinematicBackground.tsx:231,260` | licence visibility; WCAG 1.4.10 intent | `/impeccable layout` |
| **P2-04** | **Chat FAB overlaps content.** On 390 px it covers 1,505 px² of the primary CTA ("Open the live map") and the right part of footer buttons (the "GitHub Repository" label is cut off). On 1440×900 the h1 starts at y=698 and the primary CTA at y=942 (below the fold). | `App.tsx` ChatBot mount; `FrontDoor.tsx` | WCAG 2.4.11 (partial) | `/impeccable layout` |
| **P2-05** | **CLS 0.38–0.48 on every page.** The footer renders outside `<Suspense>`; the fallback reserves only `min-h-[50vh]`, so the footer paints mid-viewport and jumps when the route arrives (desktop fast 0.38–0.41; Slow 4G 0.38–0.48; mobile Slow 4G 0.43). Source node: `FOOTER.relative z-10 border-t …`. | `App.tsx:84–126, :375–385` | Core Web Vitals (>0.25 = poor) | `/impeccable optimize` |
| **P2-06** | **Weight beyond the first load.** SW precaches 88 entries = **6.7 MB raw / 1.2–1.5 MB compressed** on first visit (incl. 1.5 MB historical-catalog and 842 kB PDF chunks; ≈484 kB brotli of rarely needed chunks). `public/hero-section/` holds **113 MB of MP4s** (58/26/16/8.6/5.3 MB) though no `<video>` exists in `src` → `dist` is 126 MB. Remotion's studio runtime ships in the entry for a fade. Firebase Installations/Analytics/RTDB long-poll/Google APIs fire on the public landing page. | `public/serviceWorker.js`; `public/hero-section/`; `lib/motion-interpolate.ts` | — | `/impeccable optimize` + `/impeccable distill` |
| **P2-07** | **Targets and focus order.** Of 1,597 non-inline interactive elements on mobile, **462 (29 %) are <44 px** and 215 (13 %) <24 px *by geometry* (axe's spacing-aware `target-size` flags 1 node, a map marker). `/archive` exposes ~90 focusable SVG bars of **2×5 px**; `/alerts` map adds 72 tab stops before the list; axe `nested-interactive` (33 nodes, Leaflet clusters), `scrollable-region-focusable` (7 nodes: wide tables). Doc §4 claims "all interactive ≥44 px". | `HistoricalHazardCatalog.tsx`; `BangladeshSvgMap.tsx`; `LiveMapView.tsx` | WCAG 2.5.8 (AA, 2.2), 2.1.1 | `/impeccable adapt` |
| **P2-08** | **Text does not follow the user's font-size preference.** With `html{font-size:200%}` (browser default font size 32 px): h1/p/button/body stay **32/16/16/16 px** while `.text-sm/.text-xs/.text-lg` double to **28/24/36 px** — small labels end up larger than the page title. Cause: px rules at `index.css:1470–1545`, `body{font-size:16px}`. (Zoom itself is fine: no overflow at 200 %/400 %.) | `index.css` | WCAG 1.4.4 intent | `/impeccable typeset` |
| **P2-09** | **Dark surfaces and theming.** Focus ring is 1 px dashed `carbon-60` = **2.96:1** on the dark hero and `/login` panel (10 controls) though `.hn-surface-dark` (`carbon-30`, 9.1:1) exists; 247 `dark:` variants are inert (no `.dark` toggle, no `prefers-color-scheme`, no dark tokens); `<meta theme-color>` `#000000` vs manifest `#17171b`; `/archive` is a hard-coded dark island. | `index.css:1281`; `index.html:23`; `manifest.json` | WCAG 1.4.11 | `/impeccable colorize` |
| **P2-10** | **Command palette is mounted twice.** `Navbar.tsx:457` and `:521` each render `<CommandPalette>`; Ctrl+K opens **two identical `role=dialog aria-modal` nodes** at the same rect with two inputs. Focus does trap correctly (retracted earlier hypothesis, §13). | `Navbar.tsx:457,521` | WCAG 4.1.2 | `/impeccable harden` |
| **P2-11** | **Failure rendered as zero; slug in the H1.** `/hazards/flood` shows **"0 Historical Records"** while `/api/v1/events/hazard/flood` returned 404 (self-host backend), contradicting `/archive`'s 3,062; the `<h1>` prints `data.hazard` (raw `flood`) instead of `meta.name` ("Flood"); the breadcrumb chip says "Back to **Live GIS**" but links to `/` (the editorial front door). | `HazardDetailPage.tsx:286–301`; `Breadcrumbs.tsx:65–69` | WCAG 2.4.6, 3.3.1 | `/impeccable clarify` |
| **P2-12** | **698 hex literals in TS/TSX (107 distinct, 55 files)**; ~170 are stock-Tailwind values in map/chart/PDF code (`#f59e0b` 30, `#ef4444` 22, `#0284c7` 22, `#3b82f6` 13…) that differ from tokens (CSS "moderate" `#ea6f24` vs JS `#f59e0b`). `HDS_TOKENS` copies are not wired to CSS. | `LiveMapView.tsx` (79), `useMapSnapshot.ts` (42), `DivisionDetailPage.tsx` (42) | — | `/impeccable colorize` |
| **P2-13** | **Decorative claims and over-claims.** Hero HUD text "OPTICAL SENSOR STREAM · 30 FPS", "APEX 35,786 KM", reticles are hard-coded literals (10 px, 50 % white) — the hero is a JPG carousel. `index.html` meta description (fallback for non-prerendered routes) calls the product an "Early Warning System" with "real-time gemini-3.8-live voice conversation", contrary to the README's "not an official warning service" and publication policy; manifest `name` "HazardNet Multi-Hazard AI System". | `HeroCinematicBackground.tsx:231,260`; `index.html:7,9`; `manifest.json` | trust / content integrity | `/impeccable clarify` + `/impeccable distill` |
| **P2-14** | **Click-only controls (static, latent).** `div/tr onClick` with no role/key handler: `NationalOverview.tsx:330,445,756`, `Dashboard.tsx:636`, `ForecastDashboard.tsx:616`, `StructuredAdvisoryRenderer.tsx:191`, `3d-globe.tsx:229`. A runtime scan of 14 initial route states found none reachable, so severity depends on the tab/state. | listed | WCAG 2.1.1 (A) | `/impeccable harden` |
| **P2-15** | **Links distinguished by colour alone** inside text blocks on `/login`, `/signup` (`text-nasa-blue-shade`, underline only on hover). | `LoginPage.tsx`, `SignUpPage.tsx` | WCAG 1.4.1 | `/impeccable polish` |
| **P2-16** | **Motion hygiene.** 81 concurrent infinite animations on `/alerts`; `transition: all` on **1,011** rendered elements (236 `transition-all` classes + CSS); the reduced-motion handler is the global **`0.01ms !important` kill** the playbook flags (`index.css:1304–1316`, `:2708–2722`), which removes state-change feedback instead of providing an alternative. | `index.css`; `AlertsPage`/`AlertCard` | WCAG 2.3.3, 2.2.2 | `/impeccable animate` |
| **P2-17** | **Static shell has no `<main>`.** axe `landmark-one-main` + `region` on all 28 prerendered renders — visible for seconds on slow networks before hydration. | `scripts/prerender.mjs` template | WCAG 1.3.1, 2.4.1 | `/impeccable harden` |

### P3 — Polish

* `heading-order` (footer `<h4>` after `<h2>`) on 37 runs; `image-redundant-alt` (logo `alt="HazardNet"` beside the wordmark) ×43.
* CSS hygiene (`index.css`): 402 `!important`; contradictory Leaflet popup rules (`:571` card radius vs `:639` `border-radius:0 !important`, the later wins); `[class*="card"]` wildcard (`:385`); dead debug-gated keyframes (`cyberPulse`, `radarPing`); `.pb-safe-bottom` (bottom-nav) vs "zero bottom nav"; `.font-montserrat` naming; two identical `/analytics` route declarations; `transition: all` in `.nasa-glass-panel` directly under a comment forbidding it.
* Dead code/deps: 15 unreferenced modules (1,737 LOC; 771-line `motion-navigation-menu.tsx`, 257-line `SEOHead.tsx`); unused `@mui/material`, `@emotion/*`, `@base-ui/react` + a dead `vendor-mui` chunk rule and stale comment; `LazyMotion` with **0** `m.*` components (52 files import full `motion`).
* 183 of 380 `<button>`s lack `type`; 3 `outline-none` without a replacement ring (`RichTextEditor`, `UsernameField`); `window.prompt` ×2 (`RichTextEditor.tsx:112,121`).
* 13 two-pixel left-rule callouts (`border-l-2`) — an HDS pattern with colour+text+role, flagged by the detector's `side-tab`; one decorative `from-sky-500 to-indigo-600` card (`WeatherPanel.tsx:212`).
* Brand: wordmark "Net" `#970002` on black = **2.32:1** (exempt as a logotype; NASA red-tint `#ff5c52` = 6.90:1 if it should read).
* `og:image` is an SVG (`hazardnet-mark.svg`) — major social/messaging scrapers do not render SVG previews.
* `<link rel=modulepreload crossorigin>` for `rolldown-runtime` triggers Chrome's "preload not used" warning on several routes; em-dash density (advisory rule: 11–39 per page on FAQ/status/model-performance).

---

## 6. Patterns & Systemic Issues

1. **"Last rule wins" CSS.** Six font directives, 402 `!important`, a "final cascade guard", two `@layer base` blocks in a 2,764-line unlayered file → outcomes depend on source order (P1-01/02/03, P2-08).
2. **Three truths: doc ≠ code ≠ tests.** DESIGN_SYSTEM.md, three token files, and 49 passing tests describe three different systems (P1-12).
3. **Tokens without components.** The token layer is excellent (99.8 %); the component layer does not exist, so consistency is by convention (P1-11, P2-12).
4. **Tokens validated on one background.** White-only validation → failures on every tinted surface (P1-04/05).
5. **State honesty at the edges.** Empty/unknown/failed are not distinguished (P1-10, P2-11) — the opposite of the product's own provenance ethos, which the front door honours.
6. **Exact-match logic.** `pathname ===`, `[lang="bn"]` — correct for the happy path, wrong for `/live/` and `bn-BD` (P1-03, P2-01).
7. **Perpetual animation.** A rAF→`setState` loop, 81 infinite pulses, `transition:all`, Remotion runtime for a fade (P1-09, P2-16).
8. **Gate blind spots.** The gate checks token *values* and detector output on *compiled HTML*, not rendered behaviour (P1-12).

---

## 7. Positive Findings (keep and replicate)

* **Overflow-proof layouts:** 0 px horizontal overflow on **25 routes × {320, 390, 820, 1440}** and at 200 % root font size **[R]** — rare and valuable.
* **Dialog engineering:** `useDialogBehavior` (Esc, scroll-lock restore, Tab cycle) works for chat, drawer and palette (0/30 Tab escapes, 0/6 Shift+Tab); drawer returns focus correctly; a real skip link (Tab #1 → `<main>` focus) **[R]**.
* **Reduced motion & user control:** hero carousel stops (0 running animations under `reduce`), a "Pause motion" control exists in both modes, a data-saver/"Low-bandwidth mode (auto)" switches to the vector map **[R]**.
* **Honest content design:** provenance/SLO labels, "a baseline colour is not an alert", emergency numbers, a Bengali-draft review banner, `docs/audits/*` with explicit self-corrections.
* **Token discipline:** 99.8 % family / 98.8 % shade compliance; only 17 stock-palette uses (data encodings); spacing is scale-only; 33 lazy routes; one 39 kB-gzip stylesheet; zero web-font payload; prerendered static shells with **0** contrast failures, 30.4 px h1 and ≥1.5 leading **[R]**.
* **Keyboard affordances:** Ctrl+K palette; 72 focusable map regions have a visible stroke-change cue (0.5 → 1.5 px amber); focus rings on light surfaces measure **≥5.5:1** against their surroundings **[R]**.
* **Good form pattern to copy:** `AlertFilters.tsx` (`<label htmlFor>` per select) and the e2e `navigation-a11y.spec.ts` (skip link, `lang`, drawer dialog, 200/400 % zoom).

---

## 8. Detector Adjudication (every finding verified in context)

| Rule | Raw | Verdict | How verified |
|---|---:|---|---|
| `low-contrast` | 3,179 | **False positive** | 28 prerendered renders with app JS blocked: **0** `color-contrast` violations; text `#17171b` on `#ffffff` (≈17.9:1). The footer is `bg-carbon-05` with `carbon-80` links (≈12.7:1), not dark-on-dark |
| `oversized-h1` ("288 px") | 22 | **False positive** | Rendered h1 = **30.4 px** (`1.9rem`) static; 28–32 px in the SPA |
| `tight-leading` ("0.13×") | 41 | **False positive** | Min body leading **1.5** in static shell |
| `overused-font` | 200 | True as *declaration*, misleading as *rendering* | `Inter/Roboto` declared; no `@font-face`, `document.fonts` empty (P1-02) |
| `side-tab` / `border-accent-on-rounded` | 6 / 9 | Real but intentional (13 sites, 2 px, square, HDS callouts) / bundle noise | source grep + context |
| `ai-color-palette` | 8 | Mostly data encodings (hazard-class colours); 1 decorative gradient card | `NationalOverview`, `mapPrimitives`, `WeatherPanel.tsx:212` |
| `gradient-text` | 1 | **False positive** | no `bg-clip-text`/`text-transparent` in `src` |
| `bounce-easing` | 1 | Vendor (framer-motion `backOut`) | compiled `vendor-react` |
| `broken-image` | 4 | **False positive** | regex strings inside compiled JS |
| `em-dash-overuse` | 6 (advisory) | True, trivial | 11/39/23 em-dashes per page |

**Net:** 3,242 of the gate's 3,439 "outstanding" items (**94 %**) are disproved; they are baselined as *debt to fix* instead of waived with reasons.

---

## 9. Documentation-vs-Code Drift Ledger (`frontend/DESIGN_SYSTEM.md`, CSS comments, READMEs)

| # | Claim | Reality |
|--:|---|---|
| 1 | §2–3: 8 font families; Plus Jakarta/Instrument Sans/Anek/Baloo | Inter 92.7 % / DM Mono 7.3 % declared; **0 loaded**; others 0 % |
| 2 | §5: unified 2 px radius | tokens 8/16/28/pill (`index.css:177`); 10 rendered radii; 4 px = 16 % |
| 3 | §6: z-index 1000–1080 | code: 0/10/40/50/60/70/80/400; plus magic 1200–10001 (9 uses) |
| 4 | §5: `.hn-btn-primary` `#b60109`, `.hn-card*` | code `#7B1D21`/`#970002`; **0 consumers** |
| 5 | §6: hero is a looping Earth video | image carousel; **113 MB MP4s unused** |
| 6 | §6: LazyMotion reduces bundle | 0 `m.*` components; 52 full `motion` imports |
| 7 | §1/§4: WCAG AAA/AA for all combinations | 205 axe failures; computed 4.01–4.29 on status surfaces |
| 8 | §4: all interactive ≥44 px | 29 % of mobile targets <44 px |
| 9 | CSS comment `:192`: status text ≥4.5:1 on surfaces | 4.29 / 4.01 |
| 10 | CSS comment `:63`: amber-700 5.5:1 on white | 4.97 |
| 11 | CSS comment `:136`: `--foreground #17171b` | `#0D0D0D` |
| 12 | `README` in `public/fonts`: "metric-matched stacks" | none |
| 13 | References to `DESIGN.md`, `docs/design-system/MASTER.md` | files do not exist |
| 14 | Package header: web MUST use `HDS_NASA_TOKENS` (square, hairline); policy 4-step severity | web adopted soft bento on 2026-10-01; 5-step tokens |

---

## 10. Delta vs the 2026-09-30 audits

| Prior finding | Status | Evidence |
|---|---|---|
| Dialogs: no focus trap / Escape / semantics | **Resolved** (chat, drawer, palette verified); `inert` background still absent (documented residual) | [R] |
| Primary button label 2.14:1 on crimson | **Resolved** (white on `#970002` 9.06:1; no axe hit) | [R][C] |
| Off-system colours (740 uses) | **Resolved** at family+shade level; 698 hex literals remain in TS | [S] |
| No scroll restoration / focus reset | **Open** — scrollY 700→700, focus→body, title unchanged | [R] |
| Form errors unassociated (3 `aria-invalid`, 2 `aria-describedby`) | **Open**, unchanged | [S] |
| Breadcrumbs absent on deep pages | **Open** (12 of 33 pages) | [S] |
| Interactive `<div>` (`StructuredAdvisoryRenderer:191`) | **Open**; ≥6 more found | [S] |
| `transition-all` ×236, no dark mode, `window.prompt` ×2, toast semantics | **Open** | [S][R] |
| "Body copy at 10–11 px", "visual weight uniformly heavy" | **Recalibrated** — only **7.3 %** of rendered characters are <12 px (many `<p text-[10px]>` render at 16 px, P1-01); **≥700-weight text is 14 %** of characters (400 = 58 %) | [R] |
| "Responsive Design unverified (no browser)" | **Now verified** — strong (§7) | [R] |

Newly found by rendering: P1-01/02/03/06/08/09, P2-01/03/05/10 and the idle/CLS/precache numbers.

---

## 11. Design-critique lens (abridged, single-context)

**Nielsen heuristics (0–4):**

| # | Heuristic | Score | Key issue |
|--:|---|:-:|---|
| 1 | Visibility of system status | 3 | Excellent freshness/SLO surfaces; weak: unknown vs none (P1-10), footer jump while loading, no route announcements |
| 2 | Match system / real world | 2 | "SLO", "artifact", "operate run", "Clean Events", "GLIDE Rec.", CRI/MOD tier codes, Bengali partial |
| 3 | User control & freedom | 3 | Pause motion, low-bandwidth, Esc everywhere; chat focus return missing |
| 4 | Consistency & standards | **1** | 29 button recipes, 10 radii, two dialects, nav active-state variants |
| 5 | Error prevention | 2 | Unlabeled selects, unassociated errors, default-submit buttons |
| 6 | Recognition over recall | 2 | Icon-only header actions, map initials (TA/HA/BA/KH), truncated chips |
| 7 | Flexibility & efficiency | 3 | Ctrl+K, deep links, exports (palette mounted twice) |
| 8 | Aesthetic & minimalist | 2 | Front-door HUD chrome and dense status panel vs restrained `/alerts` |
| 9 | Error recovery | 2 | Honest copy, but toasts auto-dismiss/polite, zero-as-failure |
| 10 | Help & documentation | 3 | Docs, FAQ, methodology, status, "how levels are decided" |
| | **Total** | **23/40** | **Acceptable (20–27)** |

**Design-specificity verdict:** *content* is unmistakably HazardNet; the *visual layer* is borrowed (NASA HDS tokens) plus category-interchangeable "space-HUD" decoration (fake telemetry, reticles, cyan glows) that contradicts the product's honesty thesis. The detector agreed only on the font declaration.

**Cognitive load (8-item checklist, `/` first viewport and `/alerts`): 3 failures → moderate.** Failed: *single focus* (decor + status panel + eyebrow + toggle compete), *visual hierarchy* (the status card outweighs the h1; CTA below the desktop fold), *minimal choices* (`/alerts`: 5 filter groups + view toggle + map toggle + hazard chips in one band). Top nav is 5 labels (within ≤5); footer has 27 links in 5 columns.

**Personas (selected for dashboard/data-heavy + mobile):**
* **Alex (power user):** Ctrl+K works, but opens twice; no keyboard path into the `/archive` chart without ~90 tab stops; no `Tab` skip past the 72-stop map on `/alerts`.
* **Sam (screen reader/keyboard/low vision):** unlabeled selects; Bengali labels in English; `lang` mismatch; "No alert"/"Extreme" labels below 4.5:1; focus lost to `<body>` after chat closes and on route change; titles unchanged after navigation.
* **Casey (mobile, slow network):** 846 kB gzip eager + SW precache of ~1.3 MB; FAB covers the primary CTA; attribution card hides roughly 40 % of the map area; ~29 % targets <44 px; 36 % CPU burned at idle.
* **Jordan (first-timer, Bengali reader):** nav and most of the app in English; jargon without definitions; `/alerts` "quiet period" without a number.

**Questions to consider:** Should the front door lead with the h1 + one action and let the honest status card follow? Is a dark HUD the right voice for a product whose strength is plain-spoken provenance? Which single dialect (soft bento or HDS square) is the product?

---

## 12. Recommended Actions (priority order)

1. **[P1] `/impeccable typeset`** — one type contract: delete the 5 losers (`index.css:16–33, 114–121, 374–376, 1370–1394, 2759–2762`), move element rules into `@layer base` with a rem scale, `:lang(bn)` stack and leading ≥1.5, rem-based `body`; make `check:fonts` meaningful.
2. **[P1] `/impeccable harden`** — Bengali coverage and `lang` truth on every route (nav, `aria-label`s), name the 5 `<select>`s, route-change title/focus/scroll, trailing-slash normalisation, palette single-mount, chat focus return, failed-fetch ≠ 0.
3. **[P1] `/impeccable colorize`** — tint-aware status tokens (`#914500` 5.54, `#166534` 6.09), severity text variants, 4-step severity with a non-colour channel, dark-surface ring via `.hn-surface-dark`, JS colours sourced from CSS variables.
4. **[P1] `/impeccable optimize`** — drop the two `manualChunks` rules (−32 % transfer, −1.5 s FCP), end the `useWebFrame` loop, scope SW precache, delete 113 MB of MP4s, lazy-init Firebase, fix CLS (reserve height / defer footer), initial-graph budget.
5. **[P1] `/impeccable shape`** — plan the component layer and choose the dialect (product decision): Button, Field, Badge/Chip, Card, Callout, Dialog.
6. **[P1] `/impeccable document`** — generate `DESIGN.md` from the resolved decisions; retire the 14 drifted claims; unify the three token sources.
7. **[P1] `/impeccable clarify`** — `/alerts` empty/unknown/stale copy gated on data; remove or label decorative telemetry; plain-language replacements for SLO/artifact; fix H1/breadcrumb label and metadata over-claims.
8. **[P2] `/impeccable adapt`** — touch targets (chart bars, markers), focusable scroll regions, rem-based text scaling, mobile attribution strip, FAB placement.
9. **[P2] `/impeccable layout`** — front-door first viewport (h1 + primary CTA above the fold), `/archive` header/chip truncation, map-chrome collisions.
10. **[P2] `/impeccable animate`** — CSS fade instead of rAF/Remotion; cap infinite pulses; replace the `0.01ms` kill with state-preserving reduced-motion alternatives.
11. **[P2] `/impeccable distill`** — remove dead modules/deps/keyframes, the `[class*="card"]` wildcard, and HUD decoration.
12. **[P2] `/impeccable quieter`** — bring the `/archive` and auth dark islands into the product's plain voice (optional).
13. **[P2] `/impeccable critique`** — run the full dual-agent critique after fixes (English and Bengali).
14. **[Final] `/impeccable polish`** — closing pass once the above land.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
> Re-run `/impeccable audit` after fixes to see your score improve.

---

## 13. Verification Ledger — hypotheses I formed and retracted

An audit that reports unverified claims is worse than none. These were tested and **dropped or downgraded**:

| # | Hypothesis | Outcome |
|--:|---|---|
| 1 | `.glass-panel` references undefined `--glass-*` tokens | **Disproved** — defined at `index.css:1185–1188` |
| 2 | Undeclared Tailwind *shades* fall through to stock colours | **Disproved** — 17 stock uses of 1,378 (98.8 % shade-level), all data encodings. (Residual risk: only *used* shades are declared; consider `--color-*: initial`) |
| 3 | The whole product is monospace (`*{font-family}`) | **Disproved** — the end-of-file guard resets to the Inter stack; mono is explicit-class only |
| 4 | Footer is dark with `carbon-80` links (detector) | **Disproved** — `bg-carbon-05` (≈12.7:1) |
| 5 | Detector contrast / 288 px h1 / 0.13× leading | **Disproved** in a real browser (§8) |
| 6 | Command palette lets focus escape | **Disproved** — it traps; the real defect is the duplicate mount (P2-10) |
| 7 | Primary buttons have weak focus rings | **Downgraded** — measured against the *surroundings* (outline sits outside, offset 1 px): ≥5.5:1 on light; **2.96:1 only on dark surfaces** (P2-09) |
| 8 | Print CSS bloats the stylesheet | **Disproved** — 5.8 % (13 kB) |
| 9 | Role-collapsed Tailwind shades make borders vanish (84 static cases) | **Latent** — 2 rendered cases of ~250 bordered+filled elements on 9 routes; 20 dead-hover class pairs remain static-only |
| 10 | Click-only `div`s are keyboard-inaccessible | **Latent** — 7 static sites; none reachable in 14 initial states (P2-14) |
| 11 | `/live` footer / duplicate `<main>` on `/login` are layout bugs | **Re-attributed** — triggered by the `/x`→`/x/` redirect; code-level cause is exact pathname matching (P2-01); hosting-dependent |
| 12 | Skip link has transparent background | **Artifact** — measured mid-150 ms transition; after settling it is `#17171b` on white text |
| 13 | Missing glyph `←` and Latin in "Noto Sans Bengali" | **Sandbox artifacts** — excluded from findings |

---

## 14. Limitations / Untested

* Software-rendered Chromium; **no physical device**; custom **touch gestures** (map pinch/pan, BottomSheet drag, `touch-action`) not exercised — BottomSheet uses framer-motion `drag="y"`; no explicit `touch-action` exists in TSX **[U]**.
* Auth-gated surfaces (`/dashboard`, `/profile`, blog studio), PDF export flows and the print stylesheet were not walked **[U]**.
* `forced-colors`/`prefers-contrast`, screen-reader speech output (NVDA/VoiceOver/TalkBack), and Android system-font rendering of Bengali were not tested **[U]**.
* Production hosting behaviour (Vercel slash handling, headers, CDN compression) is inferred from config, not observed **[U]**.
* The Express backend returns 404 for `/api/v1/events/*`; data states on `/divisions`, `/hazards*` reflect that.
* Single detector run on v4.1.0; skill v4.4.0 rules may differ.

---

## 15. Appendix A — Measurements

**A1. Computed contrast ([C], WCAG 2.x)**

| Pair | Ratio | Note |
|---|---:|---|
| `--success #15803d` on `--success-surface #def2e6` | 4.29 | fails AA small text |
| `--warning #b25600` on `--warning-surface #fbe2d3` | 4.01 | fails |
| `#b25600` on white | 4.97 | docs claim 5.5 |
| severity solids as text: low `#16a34a` / moderate `#f59e0b` / `#ea6f24` on white | 3.30 / **2.15** / 3.09 | fill-only |
| `#7f1d1d` on `#0e0e10` / carbon-90 | **1.92 / 1.78** | "Extreme" tier on dark |
| `carbon-60` on `carbon-90` | 2.52 | `/login` panel |
| `carbon-60` ring on black / `#0d0d0d` | 2.96 / 2.74 | dark hero, auth panel |
| control border `--input` carbon-50 on white | 4.46 | passes; unused |
| `--border` carbon-20 on white | 1.53 | what components use for controls |
| Wordmark "Net" `#970002` on black | 2.32 | logotype (exempt) |
| White on `#970002` / `#7B1D21` / `#1c67e3` | 9.06 / 10.29 / 5.12 | good |

**A2. axe-core (49 successful page×viewport runs):** `color-contrast` 205 nodes/36 runs · `image-redundant-alt` 43 · `heading-order` 39/37 · `nested-interactive` 33/4 · `select-name` **10/4 (critical)** · `scrollable-region-focusable` 7/4 · `link-in-text-block` 6/3 · `landmark-unique` 5/5 · `landmark-main-is-top-level` 4 · `landmark-no-duplicate-main` 4 · `target-size` 1 · `region` 1. (Desktop `/model-performance` axe injection failed once; mobile passed.)

**A3. Rendered type (25 routes, desktop, share of characters):** <11 px 2.5 % · 11–11.99 4.8 % · 12–13.99 35.5 % · 14–15.99 3.3 % · ≥16 53.9 %. Weights: 400 58.3 % · 500 14.9 % · 600 12.7 % · 700 10.0 % · 800 2.3 % · 900 1.7 %.

**A4. Geometry (painted elements, 25 desktop routes):** radii 0 px 29 % · 8 px 18 % · pill 17 % · 4 px 16 % · 16 px 12 % · 2 px 4 % · 50 % 3 % · 28 px 1 %. Elements with `transition: all` 1,011; `backdrop-filter` 36; `will-change` 41.

**A5. Performance.** Eager payload (raw/gzip/brotli kB): baseline 3,058/846/689 → drop 2 rules 1,825/512/434 → no manual chunks 1,677/469/397. Throttled mobile cold load (median of 3): baseline 4,365 ms · 889 kB · FCP/LCP 4.65 s · script 1.58 s · CLS 0.43; drop 2 rules 2,888 ms · 600 kB · 3.14 s; no manual chunks 2,709 ms · 592 kB · 2.94 s. Idle (4× CPU): see P1-09. SW precache: 88 entries, 6,707 kB raw / 1,472 gzip / 1,199 brotli. Static: 226 TS/TSX modules, 60,158 LOC, `index.css` 2,764 lines → one 232 kB (39 kB gz) stylesheet.

**A6. Static counts:** 318 of 418 arbitrary font sizes <12 px (19 distinct sizes) · 1,319 heavy-weight vs 646 light class uses · `font-mono` 646 uses, `font-bengali` 0 · 698 hex literals · 52 index-key lists · `useMemo` 106 / `useCallback` 57 / `React.memo` **0** · `aria-label` 148, `aria-invalid` 3, `aria-describedby` 2 · 1,254 `gap-*` vs 521 `space-*`.

**A7. Bengali ([R], `bn`):** see P1-03. **Text scaling ([R], 200 %):** h1/p/button/body ×1.00; `.text-sm/.text-xs/.text-lg` ×2.00; `.text-[10px|11px]` ×1.00.

---

## 16. Appendix B — Reproduction notes

* **Gates:** `npm ci` · `cd frontend && npm run build` · `npm run check:tokens|check:fonts|check:bundle|check:design` · `npm run lint` (tsc) · `npx jest __tests__/{designTokensParity,designTypography,nasaTokens,paletteTokens,tokenCompliance,staticShellContrast,primaryActionContrast}.test.js`.
* **Detector:** `npx impeccable detect --json frontend/src frontend/dist`.
* **Browser:** Chromium via `@sparticuz/chromium` + `playwright-core`; unpack `bin/al2023.tar.br` and set `LD_LIBRARY_PATH=/tmp/al2023/lib` (the package only does this on AWS); app served by `PORT=3000 node backend/server.js` after `node scripts/copy-dist.mjs`.
* **Cascade probe (P1-01):** for each visible `p, h1–h4, button, a, label, input` with a class matching `text-*|font-*|leading-*|tracking-*`, insert a hidden `<div class=…>` sibling and compare `getComputedStyle` for the requested property.
* **Config experiment (P1-08):** a scratch `vite.config.mjs` importing the repo config and overriding `build.rollupOptions.output.manualChunks`, `outDir` in `/tmp` — the repo is untouched.
* **Idle probe (P1-09):** `window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { inject, onCommitFiberRoot(){commits++} }` installed via `addInitScript`; CDP `Performance.getMetrics` deltas over 6 s at 4× CPU, with and without `reducedMotion: 'reduce'`.
* **Static-shell probe (§8):** route-abort all `*.js`, inject axe, read computed h1/leading.
* **Focus-ring probe (P2-09):** `el.focus({focusVisible:true})` with `*{transition:none!important}`; resolve `outline-color` through a 1×1 canvas (handles `oklab()` + alpha) and composite over the **parent's** effective background.
