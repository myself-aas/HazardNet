# Landing Page, Live Page and Hero - Deep Audit

**Date:** 2026-10-03
**Scope:** exactly three surfaces.
1. **Hero** - `frontend/src/components/HeroCinematicBackground.tsx` (449 lines) + `HeroImageCarousel.tsx` (121) + the copy block in `pages/FrontDoor.tsx:385-480`.
2. **Landing page** - `/` = `frontend/src/pages/FrontDoor.tsx` (767 lines) + `components/frontdoor/{RunVisual,LiveStatusStrip}.tsx`.
3. **Live page** - `/live` = `frontend/src/pages/Dashboard.tsx` (~780 lines) + `components/LiveMapView.tsx` (~2,400) + `components/map/*`.

**Method:** line-level reading of these files plus static measurement. Every number is reproducible with the appendix commands. **No headless browser is available in this environment**, so anything that depends on looking at the page is marked ANALYTICAL and derived from the CSS/JS maths, not from a screenshot. Contrast figures are computed from the WCAG 2.x relative-luminance formula against the exact values in the source.

**Relationship to the whole-system audit:** `docs/audits/2026-10-03-frontend-design-system-audit.md` (committed `9e2a061`) remains the system-wide baseline. This file supersedes it *for these three surfaces only*, goes deeper, and deliberately does not repeat the four-systems / dark-mode / font findings as new observations. Findings here are new or newly quantified.

---

## 0. Design Read (one per surface, because these are three page kinds)

> Reading the hero as: a **hero banner for a public-interest research platform**, with an **Ethereal Glass / cinematic** language, leaning toward **high-end-visual-design**.
> Reading `/` as: a **landing page that is also a published document**, for **agricultural extension staff and duty officers**, with a **trust-first / government-adjacent** language, leaning toward **design-taste-frontend + redesign-existing-projects**.
> Reading `/live` as: a **dense operational console**, for **the same users under time pressure**, with an **instrument / HUD** language, leaning toward **a real design system (NASA HDS rendered through Meridian)**.

The central problem on these three surfaces is exactly that sentence: **all three are written in the hero's voice.** `/live` earns the cinematic language (it is an instrument). The hero pretends to be one (invented telemetry, see H-P0-1). `/` pays for both.

**Dials, per surface and not per project:**

| Dial | Whole-system audit | Hero | `/` | `/live` | Why the split |
|---|---|---|---|---|---|
| `DESIGN_VARIANCE` | 4 | **4** | **4** | **2** | A console read in bad light gets the lowest variance. The hero may be composed, never asymmetric-fragile. |
| `MOTION_INTENSITY` | 3 | **3** | **2** | **1** | The hero's 5-layer loop is already at ~5 and should come down. `/live` is an instrument panel: motion should be state changes, not atmosphere. |
| `VISUAL_DENSITY` | 7 | **2** | **3** | **8** | The map stage is correct at 8. The landing page is a document at 3 with a 1,367-word body, not a 3 that fits one screen. |

### 0.1 Out-of-scope declaration (required by §13 of `design-taste-frontend`)

`design-taste-frontend` excludes **dashboards, dense product UI, data tables and native mobile**, and HazardNet is all four:

- `/live` is a **dashboard**, and is judged here against instrument-panel ergonomics (touch target, label presence, safe area, theming cost), **not** against landing-page rules such as eyebrow budgets and section rhythm. Where the two conflict the console wins.
- The **hero and `/`** are in scope for `design-taste-frontend` and `high-end-visual-design`, and are audited as such.
- The **native target** is judged against Apple HIG / Material 3 through the mobile-collapse rules, not against web layout rules. Any recommendation that is correct on web and wrong on a phone says so.

---

## 1. Verdict

| Surface | Grade | One line |
|---|---|---|
| **Hero** | **C-** | Still the best-looking screen in the repository and the only place where the product lies: four invented telemetry values are rendered as text, announced to screen readers, unlocalised, and set at 10px in 30% white (2.55:1 at best, 1.09:1 over a bright frame). |
| **Landing page** | **B-** | Honest, dense, well-instrumented, and 2.2 phone screens tall before the reader reaches the primary action; nine navigation landmarks and three equally-weighted primary buttons dilute the one job the page has. |
| **Live page** | **A-** | The strongest surface in the repo (44px targets, Map/Table parity, colour-plus-words everywhere, zero blurred scrollers) sitting on top of **one unmigrated file**: `LiveMapView.tsx` carries 79 raw hex values while every other component on the route carries zero. |

**One-line verdict:** the hero is the only surface that must *lose* features before the port; the live page is the one that should ship almost as-is; the landing page needs its call to action protected from its own thoroughness.

---

## 2. What is genuinely strong on these three surfaces (keep, do not touch)

1. **The live console's touch ergonomics are already at native standard.** `MapToolbar.tsx` chips are `min-h-[44px]` with `aria-pressed` Map/Table parity; `DistrictForecastCard.tsx` is a `role="dialog"` with a 44px peek/half/expanded handle and a `role="meter"` severity bar; `MapLegend.tsx:34-43` is colour **plus words** ("20 dBZ Light", "38 dBZ Moderate", "55+ dBZ Heavy") with `aria-hidden` swatches; `MapDistrictTable.tsx` gives the same selection as a captioned 44px-row table. A native port can lift these decisions verbatim.
2. **The home shell uses `h-dvh`, not `h-screen`.** `App.tsx:318` renders `/live` as `absolute inset-0 h-dvh overflow-hidden` (`h-full h-dvh`), which is the rule most likely to break on a phone browser chrome resize. It is already right.
3. **The prerender is a real slow-connection strategy.** `scripts/prerender.mjs:18-23` and `:236-240`: a static body of real copy is injected into `#root` as the no-JavaScript page and the first paint, so a 3G reader gets the headline and the authority sentence before any bundle. On `/` the LCP is therefore text, not the hero JPEGs (667 KB, L-P2-4). Do not regress this.
4. **Anchor offsets use CSS, not listeners.** `index.css:333/347` define `--navbar-height` (3.5rem / 4rem) and `:352` sets `scroll-padding-top: calc(var(--navbar-height) + 8px)`; `DistrictBriefBody.tsx` uses `scroll-mt-[calc(var(--navbar-height)+8px)]` in 10 places. There is no `window.addEventListener('scroll')` on these three surfaces. (The variable itself is still wrong on notched phones - see V-P1-2 - but the *mechanism* is the right one.)
5. **The hero's pause control is a real control.** `FrontDoor.tsx:390-399`: 44px, `aria-pressed`, named, and it genuinely stops the carousel timer (`HeroImageCarousel.tsx:72-76`, `if (reducedMotion || paused) return undefined`). WCAG 2.2.2 is satisfied and no false affordance is created.
6. **The Bengali path is structural, not a translation bolt-on.** `usePageSeo.localiseRoute` merges the `i18n.bn` block field by field so an untranslated field falls back instead of blanking; `setLanguage` writes `document.documentElement.lang` (`lib/i18n.ts:961`); `:lang(bn)` switches the family in one place (`index.css:50-53`); 86 of 89 `frontdoor.*` keys are translated. The one visible gap is a colour, not a string (L-P2-3).
7. **`/live` has no blurred scroll container.** Measured: `backdrop-blur*` utilities in `Dashboard.tsx` = **0**, in `LiveMapView.tsx` = **0**. The only blur is `.glass-panel` (`index.css:214, 448-456`, `blur(var(--glass-blur)) saturate(1.35)`, `--hn-glass-blur: 14px`) on fixed HUD chips. That is the correct placement.

---

## 3. Findings

### Hero

#### H-P0-1 - The hero's HUD is invented telemetry, rendered as text, announced to screen readers, and unreadable

`HeroCinematicBackground.tsx` renders a "Layer 3: Observatory Telemetry HUD" cluster between DOM position 0 and the `<h1>`, and it is **not** `aria-hidden`:

```
:231   GEO-SYNC · 23°42'N 90°22'E · APEX 35,786 KM
:260   OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE
```

Three problems in one string:

1. **It is a claim the repository cannot support.** The landing page's own test suite has a case literally named `makes none of the claims the repository cannot support` (`pages/__tests__/FrontDoor.test.tsx:132`), which scans `document.body.textContent` for banned vocabulary. The HUD is inside that scan and passes only because the banned list is four regexes. Meanwhile `site-routes.json` says of the platform: "each number on this site traces back to a published record with a forecast date". `APEX 35,786 KM` is a number that traces to nothing. The copy card one element below even prints the run's real, resolvable values (`60 / 64 units`, a dated artifact) - the contrast is the finding.
2. **It is the first thing a screen reader meets on `/`.** DOM order is `HeroCinematicBackground` (`FrontDoor.tsx:387`) then the copy card (`:415`). VoiceOver reads a satellite coordinate before the H1. Nothing about the HUD is exposed to the `aria-hidden` treatment already used deliberately eight lines away for the `OPERATE RUN` chip, the coverage label and the coverage bar.
3. **It cannot be translated or removed by a content edit.** The strings are JSX literals; there is no `hero.hud.*` key in `lib/i18n.ts` (89 `frontdoor.*` keys, none for the HUD) and nothing in `site-routes.json`. Every other visible word on `/` is content; these four are code.

**Contrast, computed (not estimated).** HUD ink is `fontSize: 10`, `fontFamily: DM Mono`, `rgba(255,255,255,0.3)` / `0.5`, over a photo with no scrim, under a `soft-light` grade that does not darken:

| Backdrop pixel | HUD at 30% white | HUD at 50% white |
|---|---|---|
| `#05070e` (brand base) | 2.55:1 | 5.31:1 |
| `#202020` | 2.71:1 | 5.07:1 |
| `#606060` | 1.96:1 | 2.88:1 |
| `#a0a0a0` | 1.38:1 | 1.69:1 |
| `#e0e0e0` | 1.09:1 | 1.15:1 |

At 30% white the HUD **never reaches the 4.5:1 AA floor** - not even on the darkest pixel it can sit on - and drops below 3:1 on any mid-grey. Alpha white on photography cannot be made AA-safe by choosing a different alpha; it needs a scrim.

**Fix (small, reviewable):** wrap the whole Layer 3 cluster in `aria-hidden="true"` (one attribute), then either delete the four invented values or replace them with values the page already fetches - `pages/FrontDoor.tsx` already holds the artifacts for age, coverage and withheld counts. A HUD that prints "FRESHNESS 4 H 12 M · COVERAGE 60/64" is the same composition with the page's own honesty intact. If Layer 3 stays as decoration, add `text-shadow: 0 1px 2px rgba(0,0,0,0.6)` and lift the base alpha to 0.75 (11.19:1 over the brand base) so it is at least legible.

#### H-P1-2 - The hero never enters the cheap mode that the CSS was written for

`index.css:1367-1375` defines a global collapse for constrained devices:

```css
html[data-low-bandwidth='true'] *, … {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
  backdrop-filter: none !important;
}
```

The attribute has exactly one writer, `hooks/useBandwidthMode.ts:84`, and that hook is mounted only by map/alert surfaces (`LiveMapView.tsx:31,93`, `AlertDetailPage.tsx:25`, `AlertsPage.tsx:37`). `main.tsx` calls only `initAnalytics()`. **On `/` the attribute is never set**, so on a 2 GB / 2G Android - the device the mode was built for, per the comment at `index.css:1361-1366` - the landing page still runs:

- a 30 fps rAF loop for 14 seconds (`HeroCinematicBackground.tsx:27`, `useWebFrame(30, 420)`, plus three more frame loops: `FrontDoor.tsx:349` `useWebFrame(30,8)`, `RunVisual.tsx:60` `useWebFrame(30,60)`, `LiveStatusStrip.tsx:103` `useWebFrame(30,10)`),
- two 1100x1100 radial glows blurred at 90px and 100px (`filter: blur(var(--hero-glow-blur-primary|secondary))`),
- an `feTurbulence` grain layer at 0.04 (`HeroCinematicBackground.tsx:419-448`),
- four 1408x768 raster layers driven by a 9600 ms transform transition (`HeroImageCarousel.tsx:102-108`),
- the hero's `backdrop-filter` on two elements (`FrontDoor.tsx:409, 415`), which is precisely what the never-applied rule sets to `none`.

`HeroCinematicBackground`'s own gate is `shouldAnimate = !reduceMotion && !paused && !isTest` (`:27`) - it consults the OS reduced-motion flag and nothing else.

**Second-order effect:** because the HUD uses `opacity: shouldAnimate ? interpolate(…) : 1`, a reduced-motion user gets the invented telemetry at **full** opacity. The accessibility opt-out currently promotes the least-true text on the page.

**Fix:** read the device signals once at boot (`readDeviceSignals()` already exists in `lib/bandwidth.ts`) and set the attribute in `main.tsx`; add `lowBandwidth` to `shouldAnimate`. Two edits, single-digit lines, and it is the largest mobile-only win available on these three surfaces.

#### H-P1-3 - The hero is 2.2 phone screens, and the fast loop that this page needs is below the fold

ANALYTICAL, 390x844 viewport, using the resolved Meridian scale (`styles/meridian.css:154,162-164`): `--mrd-text-display2` resolves to ~37px for the H1, `--mrd-text-caption` 12px, body 16px / 1.62.

| Element (`FrontDoor.tsx`) | Measured height |
|---|---|
| Eyebrow row + language switch (`:405-410`) | ~44px |
| H1, 8 words at 37px / 1.06 | ~120px |
| Standfirst, **70 words** at 16px / 1.62 | ~285px (11 lines) |
| Three `size="lg"` CTAs, all `w-full sm:w-auto` (`:439-459`) | ~160px stacked |
| Authority note, 12px + border (`:467-472`) | ~80px |
| Glass card padding + gaps | ~100px |
| **Hero total** | **~1,695px ≈ 2.2 screens** |

The CTA row does not begin until roughly **y 632px** - below the fold on every 844px-tall phone once browser chrome is subtracted - and the `RunVisual` card (the page's proof-of-honesty, its best content) is entirely below the fold. The header's `min-h-[600px]` floor (`:385`) is itself taller than a landscape phone viewport (~390px), so the hero cannot shrink into landscape either. Text elements in the hero: **7** (eyebrow, H1, standfirst, 3 CTAs, authority note) plus 2 controls, against the skill's budget of 4.

**Fix:** on `<640px`, clamp the standfirst to two lines with the full text expanded by a disclosure control (the detail is already repeated verbatim in the seven sections below - nothing is lost), and demote CTA 2 and 3 to text links. The primary action then lands above y 480 with the proof card visible.

#### H-P1-4 - The single most important sentence on the page sits at the weakest point of its own scrim

`frontdoor.hero.authority` is the sentence that says the platform is not an official warning service and that emergency calls go to 999. It is rendered at `text-xs` (12px) in `text-white/75` (`FrontDoor.tsx:467-472`), at the **bottom** of a card whose scrim is `bg-gradient-to-b from-black/55 to-black/35` (`:415`) - i.e. at the 35% end, where overlap with a bright photo is worst. Computed:

| Photo pixel | white/90 at card top (55%) | white/75 at card top | white/90 at card bottom (35%) | **white/75 at card bottom** |
|---|---|---|---|---|
| `#05070e` | 16.48:1 | 11.33:1 | 16.36:1 | 11.28:1 |
| `#808080` | 9.62:1 | 7.25:1 | 6.60:1 | 5.18:1 |
| `#b0b0b0` | 7.00:1 | 5.46:1 | 4.23:1 | **3.48:1 (fail)** |
| `#e0e0e0` | 5.11:1 | 4.12:1 | 2.85:1 | **2.45:1 (fail)** |

Two of the four shipped frames are bright haze (monsoon storm, flooded fields), so this is a live failure, not a theoretical one. A 12px wordmark of an official hotline at 2.45:1 is a safety defect, not a style preference. Note also that the H1 and standfirst carry `drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]` while this paragraph carries none.

**Fix:** change the card gradient to `from-black/70 to-black/60`. Measured effect on the failing case: **2.45:1 to 6.40:1** over the same `#e0e0e0` pixel, and it changes nothing else on the page.

#### H-P2-5 - Micro-issues in the hero block

- **Dead declarations, twice.** `FrontDoor.tsx:409` and `:415` both carry `backdrop-blur-sm` (8px) *and* an inline `backdropFilter: blur(var(--hero-glass-blur))`; the inline style wins, so the utility is dead weight and the two rules read as contradictory intent. Delete the utility, keep the token.
- **Four raster layers stay resident.** At 1408x768 RGBA each slide's layer is ~4.3 MB of GPU memory; a 1.06 scale over 9,600 ms invites re-rasterisation. Four slides = ~17 MB on a device class that has 2 GB of RAM total. Removing `willChange`/`transform` under reduced motion is already handled; consider `contain: paint` on the carousel wrapper.
- **`isTransparent` is a dead prop.** `Navbar.tsx:40` accepts it and never reads it, which is why `/live` gets a solid white bar over a dark map while `/` gets a transparent one. One prop, two answers, no implementation (see V-P2-6).

### Landing page

#### L-P1-1 - Three equally-weighted primary buttons and three more links to the same destination

The page has one job, stated in its own H1's neighbourhood: open the live map. It currently offers:

- `frontdoor.hero.ctaMap` ("Open the live map"), `intent="ink" size="lg"` (`FrontDoor.tsx:440-448`)
- `frontdoor.hero.ctaMethodology`, `intent="outline" size="lg"` (`:449-457`)
- `frontdoor.hero.ctaScorecard`, `intent="outline" size="lg"` (`:458-466`)

All three are the same visual weight below `sm` (`w-full`), so on a phone the reader sees three stacked full-width buttons and no primary. Two of them leave the conversion funnel entirely (`/methodology`, `/model-performance`). Then `/live` appears three more times (`:441`, `:469`, `:609`) and `/status` four more times. Three equal calls to action is the same as none; the fix is to make `ctaScorecard` a text link inside the section that already argues about validation, and leave two controls in the hero.

**Context for the same finding:** the page body is **1,367 words** (78 hero + 411 section prose + 493 bullets + 105 table cells + 280 FAQ, from `content/site-routes.json`). That is a document, and a good one - but every one of those words sits between the reader and the map. The mobile version of this page should be `headline + one CTA + the strip + the proof card`, with the seven sections as a disclosure.

#### L-P1-2 - Nine navigation landmarks on the landing page

Counted in the DOM (not in source sites):

| Landmark source | Rendered `<nav>` |
|---|---|
| `frontdoor/LiveStatusStrip.tsx:213` ("Alert and map pages") | 1 |
| `FrontDoor.tsx:265-272`, inside `Section`, over 7 sections of which 5 carry links | **5** |
| `FrontDoor.tsx:621-631` (the empty-run alert nav) | 1 |
| `FrontDoor.tsx:656-667` (on-this-page TOC) | 1 |
| `FrontDoor.tsx:748-759` (attribution links) | 1 |
| **Total** | **9** |

The code comment above the first site (`:261-264`) shows the team already met the axe `landmark-unique` rule and solved it **by naming each nav uniquely** - which is the correct fix for the violation and the wrong fix for the reader: VoiceOver's rotor now lists nine "Navigation" regions with five near-identical names, and TalkBack does not expose navigation regions as a rotor category at all, so the `aria-label`s are inert there. Note this is **not** an automated failure - `FrontDoor.test.tsx:178-195` runs axe in both languages and passes. It is an ergonomics finding on a page that already has a working TOC.

**Fix:** keep exactly one `<nav>` (the TOC at `:656`) and render the per-section link rows as a plain `<ul>` under the section's own `<h2>`. The links stay, the landmark noise goes.

#### L-P2-3 - The amber chip is the only non-token colour on `/`, and it sits on the language switch

`FrontDoor.tsx:420` is the single `amber` use on the page: `bg-amber-100 text-amber-900 border-amber-300/80`, the raw stock Tailwind scale, used for the Bengali-draft notice inside the hero card. Everything around it is `hazard-warning` / `carbon-*` / `nasa-blue*` semantics. Consequences: it cannot participate in a dark theme (see the whole-system audit's dark-mode finding - this element is hard-coded light), it is the first thing a Bengali-first reader looks at, and it is one of the 356 raw-hex-equivalent values the class-name token gate cannot see. Fix: map it to the `hazard-warning` family or add a `--mrd-notice-*` triple; do not introduce a fifth generation for one chip.

#### L-P2-4 - 667 KB of landscape hero JPEG, 75% of it cropped off, still soft on a phone, and none of it gated

Measured from `public/hero-carousel/`: `hero-cyclone-orbit.jpg` 1408x768 / 165 KB, `hero-flood-delta.jpg` 1408x768 / 170 KB, `hero-flooded-fields.jpg` 1376x768 / 208 KB, `hero-monsoon-storm.jpg` 1376x768 / 124 KB - **667 KB total**. `HeroImageCarousel.tsx:90-116` renders **all four** as absolutely-positioned divs with `background-image` at mount (the hidden ones at `opacity: 0`), so the phone fetches all four on the landing route whether or not it ever sees slide two.

The frames are the wrong **shape** for the box they fill, which is a geometry problem, not a size problem. In a 390x844 phone viewport with `background-size: cover`, the scale factor is height-driven (`844 / 768 = 1.099`), so a 1408x768 frame is rendered at 1547x844 CSS px:

| Viewport 390x844, `cover` | Value |
|---|---|
| Visible fraction of the frame's width | **25%** (the centre column) |
| Cropped away and never displayed | **75%** - of a 165 KB frame, about **123 KB** |
| Asset density against what the screen shows | 0.91x at DPR 1, **0.45x at DPR 2**, 0.30x at DPR 3 |

So the same asset is simultaneously **mostly discarded** and **under-resolved**: the hero sharpens nothing and wastes three quarters of every download. There is no `image-set()`/`srcset` to serve a portrait crop, no `rel="preload"` / `fetchpriority` anywhere in `src`, `index.html` or `scripts` (verified: zero hits) - and a CSS background inside a React-rendered inline style cannot be picked up by the preload scanner even when it is in the prerendered HTML - and no `low-bandwidth` gate (H-P1-2), so a metered 2G connection pays the same 667 KB as a fibre connection.

Credit where due: the prerender (`scripts/prerender.mjs:236-240`) means the **LCP is text**, so this is not an LCP emergency - it is 667 KB of avoidable data on the audience's data plans, arriving after hydration, of which only ~170 KB is ever visible.

**Fix:** keep the image-free DOM contract (`FrontDoor.test.tsx:142-146` asserts zero `<img>` elements; do not add one), and instead (a) gate the carousel to the first slide when `data-low-bandwidth` is set, (b) ship a portrait crop (about 900x1600) and select it with CSS `image-set()`, which both cuts bytes and fixes the 0.45x density, (c) emit one `<link rel="preload" as="image">` for slide 1 from `usePageSeo`/`prerender`.

### Live page

#### V-P1-1 - The map stage is the last non-token surface on `/live`, and it is the biggest file

Measured raw hex literals:

| File | `#rrggbb` / `#rgb` literals |
|---|---|
| `pages/Dashboard.tsx` | **0** |
| `components/map/MapToolbar.tsx` | **0** |
| `components/map/DistrictForecastCard.tsx` | **0** |
| `components/map/MapLegend.tsx` | 3 (decorative swatches only, see §2) |
| `pages/FrontDoor.tsx` | **0** |
| **`components/LiveMapView.tsx`** | **79** |

This is not the deliberate "data encodings live outside the semantic system" exception that the repo documents for `indigo`/`purple`; the most frequent values are **chrome**: `#ffffff` (14), `#77777a` (10), `#17171b` (7), `#d1d1d1` (5), `#e3e3e3` (3), `#58585b` (3), `#f6f6f6` (2), `#b9b9bb` (2), `#444447` (1). Alongside them are nine stock Tailwind palette hues used inline: `#0284c7` (sky-600, 13 uses), `#e11d48` (rose-600), `#d97706` (amber-600), `#16a34a` (green-600), `#059669`, `#38bdf8` (sky-400), `#f59e0b`, `#ef4444`, `#dc2626` - and **`#7c3aed` (violet-600)**, the exact family the token gate deliberately excludes from the system.

The consequence is not aesthetic. It is that **dark mode, high-contrast mode, the low-bandwidth collapse and the React Native theme all have to be re-derived inside one 2,400-line file**, while every component around it would follow a token change for free. For the port, this is the single largest mechanical cost on the route.

**Fix:** extract the literals into one `components/map/mapPalette.ts` keyed by role (`mapChrome`, `severityRamp`, `radarBands`), import it in `LiveMapView` and in the native map screen, and let the data-ramp entries keep their literal values with a comment - the reasoning is already established in the token docs.

#### V-P1-2 - `--navbar-height` omits the safe-area inset, so four surfaces are mis-offset on notched phones

`index.css:333` sets `--navbar-height: 3.5rem` (and `:347`, `4rem` at `sm`). The actual bar is `Navbar.tsx:126`:

```
flex h-14 … pt-[env(safe-area-inset-top)] … sm:h-16
```

56px of bar **plus** the inset - 103px on a modern iPhone, 82px on a typical notched Android. Every consumer of the variable therefore under-reserves by exactly the inset, and two surfaces bypass the variable with hard-coded numbers instead:

| Consumer | Declared clearance | Real clearance needed | Result |
|---|---|---|---|
| `index.css:352` `scroll-padding-top` | `--navbar-height + 8` = 64px | 111px | anchor jumps land under the bar |
| `DistrictBriefBody.tsx` (10 sites) `scroll-mt-[calc(var(--navbar-height)+8px)]` | 64px | 111px | same |
| `FrontDoor.tsx:385` hero `-mt-14 sm:-mt-16 pt-[100px]` | 100px | 103px | eyebrow row and language switch collide with the bar by a few px |
| `Dashboard.tsx:298` GIS header `p-3 pt-16` | 64px | 103px | the GIS header's status pill sits under the navbar on the app's main console |

Two mechanisms (`env()` in the component, a fixed rem in the variable) for one measurement, on a route whose comment (`Dashboard.tsx:294-297`) explicitly documents the intent as "keeps it clear of the fixed app navbar (3.5rem + breathing room)".

**Fix (one line, four surfaces):** `--navbar-height: calc(3.5rem + env(safe-area-inset-top, 0px))` and `calc(4rem + env(safe-area-inset-top, 0px))` at `:347`, then delete the hard-coded `pt-[100px]`/`pt-16` in favour of the variable. Verify against `MenuDrawer.tsx:123`, which already uses `pt-[max(1rem,env(safe-area-inset-top))]` - the safe-area vocabulary is already in the codebase.

#### V-P1-3 - Nine emoji or bare glyphs ship as icons where a purpose-built SVG set already exists

`components/MaterialIcon.tsx` is 923 lines of hand-authored SVG paths, called 30 times by `LiveMapView.tsx`, 16 by `Dashboard.tsx`, 6 by `FrontDoor.tsx`. It exists so that no surface depends on a ligature font. These nine sites bypass it:

| File:line | Rendered icon |
|---|---|
| `Dashboard.tsx:117` | `icon: '🧹'` - emoji as the *data value* in a hazard-type icon map |
| `Dashboard.tsx:720` | `🖥️ 680px`, `:731` `📐 850px` - emoji inside a size-comparison readout |
| `LiveMapView.tsx:782, 901` | `🌱 Vulnerable Crop:` |
| `LiveMapView.tsx:785, 905, 2074` | `📍` - pin/focus labels and a pre-cache button |
| `LiveMapView.tsx:2058` | `⚡ Pre-cache Bangladesh Core` |
| `LiveMapView.tsx:1530, 1832, 2159` | `➔`, `✓/○`, `✓ High-Res Image Ready` (bare glyphs, same problem) |

Two reasons this matters more for the port than for the web: an emoji is the only "icon" that cannot be sized, weighted, coloured or baseline-aligned by the design system (its metrics come from the OEM font - Apple, Samsung and Google all differ), and `Dashboard.tsx:117` uses one **as a value**, so the hazard-vocabulary mapping itself would need rewriting. Two text glyphs on the other two surfaces have the same smell but are tolerable: `↗` at `FrontDoor.tsx:286` (already `aria-hidden`) and the disclosure `▾` at `DistrictForecastCard.tsx:197` - the latter should become a real chevron because it doubles as the 44px handle's only visual affordance.

**Fix:** replace the nine with `MaterialIcon` names (`cleaning_services`, `desktop_windows`, `straighten`, `eco`, `location_on`, `bolt`, `check_circle`, `arrow_forward`) and delete the emoji entry from the icon map. This also removes the only emoji in the shipped UI, which the taste skill bans outright.

#### V-P2-4 - Glass over a native map: correct on web, wrong in the port

`.glass-panel` (`index.css:448-456`) uses `blur(14px) saturate(1.35)` and is applied to fixed/sticky HUD chips (`Dashboard.tsx` attribution pill, GIS status pill, coords pill). That is the *correct* placement - blur on fixed chrome, never on a scrolling container - and the measurement confirms it: zero `backdrop-blur` utilities in `Dashboard.tsx` and `LiveMapView.tsx`. But in React Native this exact pattern is the one to drop: a `BlurView` layered over a native map view forces an offscreen render pass per frame on Android and is a documented jank source. **Keep the translucency and the hairline ring; drop the blur** in the native map screen, and let the map's own compositing handle it.

#### V-P2-5 - Tooltips on icon-only controls

Measured across the files that make up the route: **85 `<button>` elements, 25 `aria-label` attributes, 26 `title=` attributes** — `LiveMapView` 47 / 12 / 6, `MapToolbar` 11 / 3 / 5, Dashboard 18 / 2 / 10, `DistrictForecastCard` 5 / 4 / 2, `MapLegend` 1 / 1 / 1, `Map` 2 / 1 / 0, `Navbar` 1 / 2 / 2.

**Correction (2026-10-03, resolution pass).** The original finding above read these numbers as "tooltips are the only label on most icon-only controls". A direct audit of every `<button>` element in those files — text content, `aria-label`, `aria-labelledby`, then `title` — finds **zero controls that are both icon-only and unnamed**: each icon-only button carries an `aria-label`, and the `title=` attributes sit on buttons that already have visible text (they are extra hints, not the label). The remaining true statement is the port half: `title` does not exist in React Native, so any hint that only lives in a tooltip has to be re-expressed in the native shell. On the web there is nothing to fix here, and the accessibility work this finding asks for is already done.

#### V-P2-6 - Two full-bleed surfaces, two opposite navbar treatments

`/` gets a transparent bar (`Navbar.tsx` `isFrontDoor = pathname === '/'`) and `/live` gets a solid white one over a dark map, because `isTransparent` is accepted (`Navbar.tsx:40`) and never read. Neither answer is wrong on its own; having both means the native port has to pick one, and whichever it picks will make one of the two web surfaces look like a bug. Decide once, implement the prop or delete it.

---

## 4. Conversion read for native (React Native / Expo)

| Surface | Day-one native screen | Carries over unchanged | Must be re-decided |
|---|---|---|---|
| **Hero** | Do not port it as a component. Port `HomeScreen` = headline + one primary CTA + `LiveStatusStrip` + `RunVisual`. | Copy, `frontdoor.*` keys, the pause semantics, the artifact readers | The 5-layer background, the HUD cluster, the parallax/scale loops, the carousel (or: one static image at 800w) |
| **/ (landing)** | A scrolling `ScrollView` with the strip, the proof card and the FAQ accordion; the seven sections collapsed into a "Read the overview" stack | All 1,367 words via `site-routes.json`, the table (needs a horizontal-scroll or card fallback), the 4 FAQs | Nine nav landmarks become zero; the TOC becomes a sticky segmented control or nothing |
| **/live** | `MapScreen` already exists in `apps/mobile` and, per the native audit, draws an SVG choropleth with no map library. The web's Map/Table parity toggle is the port's whole interaction model on small screens. | `MapToolbar` targets, `MapDistrictCard` disclosure, `MapLegend` colour-plus-words, `MapDistrictTable` fallback, the `hazardnet:action` event vocabulary (becomes a store) | `LiveMapView`'s 79 hex values (extract to `mapPalette`), Leaflet itself, the 14px glass blur, `title` tooltips, `window` custom events |

**Delete before the port, not after:** the Layer 3 HUD cluster, the four-slide carousel (keep one image), `isTransparent`, the amber chip's raw scale, and the nine emoji.

**Ship-early list (already native-grade):** `MapLegend`, `DistrictForecastCard`, `MapToolbar`, `MapDistrictTable`, `LiveStatusStrip` (its `role="status"` becomes a polite announcement), and the whole `frontdoor.*` string table.

**Safe areas:** the only two surfaces in the app that are full-bleed (`/`'s hero and `/live`'s map) are also the two that hard-code their top offset. Fixing `--navbar-height` (V-P1-2) fixes the web and hands the port a single value to translate to `useSafeAreaInsets()`.

---

## 5. Prioritised backlog (small diffs, in order)

| # | Change | Files | Surface | Effort |
|---|---|---|---|---|
| 1 | `aria-hidden` the hero HUD cluster; replace or delete its four invented values | `HeroCinematicBackground.tsx:161-393` | Hero | S |
| 2 | Card scrim `from-black/55 to-black/35` -> `from-black/70 to-black/60` (authority note 2.45:1 -> 6.40:1) | `FrontDoor.tsx:415` | Hero | S |
| 3 | Set `data-low-bandwidth` at boot; add it to `shouldAnimate` | `main.tsx`, `HeroCinematicBackground.tsx:27` | Hero, `/` | S |
| 4 | `--navbar-height: calc(3.5rem + env(safe-area-inset-top, 0px))`; remove `pt-[100px]` / `pt-16` duplicates | `index.css:333,347`, `FrontDoor.tsx:385`, `Dashboard.tsx:298` | Hero, `/live` | S |
| 5 | Collapse the hero to two CTAs, clamp the standfirst on `<sm` | `FrontDoor.tsx:415-466` | Hero, `/` | S |
| 6 | Extract `mapPalette.ts` from the 79 literals in `LiveMapView.tsx` (native reads the same file) | `components/map/` | `/live` | M |
| 7 | Replace the nine emoji/glyph icon sites with `MaterialIcon` | `Dashboard.tsx`, `LiveMapView.tsx` | `/live` | S |
| 8 | Demote the five rendered per-section link navs (one mapped JSX site) to lists; keep the TOC nav | `FrontDoor.tsx:265-272` | `/` | S |
| 9 | Audit the 85 buttons against their 25 `aria-label`s (start with `MapToolbar`: 11 controls / 3 labels) | `map/*`, `LiveMapView.tsx` | `/live` | M |
| 10 | Portrait `image-set()` crop + slide-1 preload + low-bandwidth single-slide gate for the hero images | `HeroImageCarousel.tsx`, `usePageSeo`, `prerender.mjs` | `/` | M |
| 11 | Tokenise the Bengali-draft chip; delete `isTransparent` or implement it | `FrontDoor.tsx:420`, `Navbar.tsx:40` | `/`, `/live` | S |

---

## 6. Appendix - evidence commands

```bash
# H-P0-1: the invented HUD strings and their typography (no aria-hidden anywhere in the cluster)
grep -n "GEO-SYNC\|OPTICAL SENSOR\|fontSize: 10\|DM Mono" frontend/src/components/HeroCinematicBackground.tsx
grep -n "aria-hidden" frontend/src/components/HeroCinematicBackground.tsx     # -> none in Layer 3

# H-P1-2: the attribute has exactly one writer, and no boot-time caller
grep -rn "data-low-bandwidth" frontend/src --include=*.ts --include=*.tsx | grep -v __tests__
grep -rn "useBandwidthMode" frontend/src --include=*.tsx | grep -v __tests__
cat frontend/src/main.tsx

# Hero motion budget: four frame loops on one route
grep -rn "useWebFrame(" frontend/src --include=*.tsx | grep -v __tests__

# H-P1-4: the scrim and the text it fails to protect
grep -n "from-black/55\|text-white/75" frontend/src/pages/FrontDoor.tsx

# L-P1-2: nine nav landmarks (5 come from one JSX site mapped over 7 sections)
grep -n "<nav" frontend/src/pages/FrontDoor.tsx frontend/src/components/frontdoor/LiveStatusStrip.tsx

# L-P2-4: hero asset weight and dimensions
ls -l frontend/public/hero-carousel/
for f in frontend/public/hero-carousel/*.jpg; do python3 -c "
import struct
f='$f'; d=open(f,'rb').read(); i=2
while i<len(d):
    if d[i]!=0xFF: i+=1; continue
    m=d[i+1]
    if m in (0xC0,0xC1,0xC2):
        h,w=struct.unpack('>HH', d[i+5:i+9]); print(f, f'{w}x{h}', f'{len(d)/1024:.0f} KB'); break
    if m in (0xD8,0xD9) or 0xD0<=m<=0xD7: i+=2; continue
    i+=2+struct.unpack('>H', d[i+2:i+4])[0]"; done
grep -rn "preload\|fetchpriority" frontend/scripts frontend/index.html      # -> no hits

# L-P2-4: the cover-geometry test (why a landscape frame is 75% cropped in a portrait box)
python3 -c "
W,H=390,844
for iw,ih in [(1408,768),(1376,768)]:
    s=max(W/iw,H/ih); rw=iw*s
    print(iw,ih,'scale %.3f'%s,'visible %.0f%%'%(100*W/rw),'DPR2 density %.2fx'%(ih/(H*2)))"

# V-P1-1: 79 raw hex values, all in one file
for f in frontend/src/pages/Dashboard.tsx frontend/src/components/LiveMapView.tsx \
         frontend/src/components/map/MapToolbar.tsx frontend/src/components/map/MapLegend.tsx \
         frontend/src/components/map/DistrictForecastCard.tsx frontend/src/pages/FrontDoor.tsx; do
  printf "%-58s %s\n" "$f" "$(grep -oP '#[0-9a-fA-F]{3,8}\b' $f | wc -l)"; done

# V-P1-2: the variable vs the component that has to honour it
grep -n "navbar-height" frontend/src/index.css frontend/src/components/Navbar.tsx frontend/src/components/district/DistrictBriefBody.tsx

# V-P1-3: emoji and glyph icons (python; grep's unicode ranges over-match box-drawing)
python3 -c "
import re
E=re.compile('[\U0001F000-\U0001FAFF\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u2600-\u26FF]')
for f in ['frontend/src/pages/Dashboard.tsx','frontend/src/components/LiveMapView.tsx']:
    for i,l in enumerate(open(f,encoding='utf8').read().split(chr(10)),1):
        if E.search(l): print(f'{f}:{i}: {l.strip()[:80]}')"

# V-P2-5: control inventory (buttons / aria-labels / title attributes) - 85 / 25 / 26
for f in frontend/src/pages/Dashboard.tsx frontend/src/components/LiveMapView.tsx \
         frontend/src/components/map/MapToolbar.tsx; do
  printf "%-52s buttons=%-4s aria=%-4s title=%-4s\n" "$f" \
    "$(grep -c '<button' $f)" "$(grep -c 'aria-label' $f)" "$(grep -c 'title=' $f)"; done

# /live has no blurred scroll container
grep -c "backdrop-blur" frontend/src/pages/Dashboard.tsx frontend/src/components/LiveMapView.tsx

# landing page weight
node -e "const r=require('./frontend/src/content/site-routes.json').routes.find(x=>x.path==='/');
console.log(r.h1.split(/\s+/).length,'word H1;',r.standfirst.split(/\s+/).length,'word standfirst;',r.sections.length,'sections;',r.faqs.length,'FAQs')"
```

---

## 7. Skills applied

- `design-taste-frontend` - §0 design read and dials (per surface), the hero viewport budget, the eyebrow/label budgets, the emoji and glyph bans, the `window`-scroll ban (already clean), the mobile cheap-mode requirement.
- `redesign-existing-projects` - the scan/diagnose/fix protocol, the "keep the stack, small reviewable diffs" constraint, the fix-priority order (typography -> colour -> states -> layout -> components), the requirement to verify a dependency exists before proposing it (`tailwindcss ^4.3.3`, `framer-motion ^13`, `lucide-react ^1.28.0` are all present; no new dependency is proposed anywhere in this document).
- `high-end-visual-design` - mobile collapse below 768px for asymmetric layouts, no `h-screen`, backdrop-blur only on fixed/sticky, no arbitrary z-index, the Ethereal Glass archetype applied to the hero and rejected for the console.

---

## 8. Resolution ledger (implementation pass, 2026-10-03)

Status of every finding and backlog row, so nothing in this document is left ambiguous. "Fixed"
means the fix is in the tree with a test or gate behind it; "deferred" carries the reason and the
condition that would unblock it. The pass was committed as `2793cd6` plus a second commit covering
this ledger; gates at the end of the pass: 1,626 jest tests green (2 suites skipped), `tsc` clean,
`check:tokens` 99.8% with the new hex ratchet, `check:design:source` 0 outstanding, `check:brand`
fully tokenised.

### Findings

| Finding | Status | Where the fix lives |
|---|---|---|
| H-P0-1 invented HUD telemetry | **Fixed** | The four literals (`GEO-SYNC`, coordinates, apex, sensor stream) are deleted; the HUD layer is decoration with `aria-hidden="true"` and no text styles. `__tests__/phase3RemotionHero.test.js` used to assert the strings and now asserts their absence, so restoring them fails the suite. |
| H-P1-2 hero never enters cheap mode | **Fixed** | `applyBandwidthAttribute()` runs from `main.tsx` before first render; the hero's `shouldAnimate` includes `!lowBandwidth`; `useWebFrame` no longer starts a rAF in this mode and pins the end frame, so all four intro loops stop (not just the hero's) without blanking un-gated interpolations; the carousel drops to one slide. |
| H-P1-3 hero is 2.2 phone screens | **Fixed (residual closed 2026-10-04)** | On `<sm` the standfirst clamps behind a `readMore`/`readLess` disclosure (three lines at this pass, two after the 2026-10-04 budget pass) and the hero carries one primary CTA with two text links, which put the primary action at y≈427 on a 390x844 phone. Residual closed on 2026-10-04 without inverting the hierarchy: the card stays after the action, and the phone hero carries one evidence pointer directly under the primary CTA that quotes the card's own text ("This run: {covered} of {expected} districts covered, {published}. Read the proof."), anchors to it (the card now carries `id="front-door-run-visual"`), and renders only below `sm`. Measured on emulated phones: H1 169px, CTA 427px, pointer 583px on 390x844 (443/835 on 430x932), with the card itself at 917px - claim, action and one checkable fact inside the first viewport, and the evidence still unarguable. The phone budget paid for it: hero top padding 44 -> 20px, grid gap 8 -> 6, standfirst clamp 3 -> 2 lines, CTA gap 28 -> 20px; the `sm`-and-up layout is unchanged. |
| H-P1-4 authority sentence at 2.45:1 | **Fixed** | Card scrim is `from-black/70 to-black/60`; worst case over `#e0e0e0` measured 6.40:1. |
| H-P2-5 hero micro-issues | **Fixed** | Dead `backdrop-blur-sm` utilities gone (the pause control's real blur stays); `isTransparent` deleted; the carousel wrapper carries `contain: paint`; four resident raster layers become one under low bandwidth. |
| L-P1-1 three equal CTAs | **Fixed** | One `intent="ink"` primary; methodology and scorecard are underlined text links, and the scorecard keeps its own section below. |
| L-P1-2 nine navigation landmarks | **Fixed** | The five per-section rows, the empty-run alert row, the attribution row and the strip's link row are labelled lists; the page has exactly one `<nav>` (the on-this-page TOC). `FrontDoorLivePanels.test.tsx` now queries the counts list by hook rather than "any `<ul>`". |
| L-P2-3 amber chip off-system | **Fixed** | The Bengali-draft notice is `bg-warning-surface` / `border-warning-border` with `text-carbon-90` — no stock amber remains on `/`. |
| L-P2-4 667 KB of landscape JPEG | **Fixed** | Phones get 354×768 centre crops (`hero-<name>-portrait.jpg`, 31–55 KB) selected by a media query in `styles/hero-media.css` through `var(--hero-slide-<slug>, url(<landscape>))` — one asset per slide per device, zero cover-crop waste, density unchanged at 0.91 px/CSS px; the prerendered head preloads slide 1's two crops with `media` (the landscape URL cannot come from an inline React style and be seen by the preload scanner); low bandwidth keeps one slide. Deliberate deviation: selection is a media query, not `image-set()`, because this is art direction (aspect) rather than density, and `image-set()` cannot guarantee exactly one fetch. **Closed 2026-10-04:** four 768x1376 (9:16) portrait renders of the same scenes now ship as `hero-<name>-portrait-2x.jpg` (112-221 KB), selected by `@media (max-width: 639px) and (min-resolution: 2dppx)` with the 354x768 crops kept as the DPR 1 fallback — 1.97 px/CSS px at the 390x844 hero instead of 0.45, at fewer bytes per slide than the cropped landscape frame. The `(max-width: 639px)` preload now names the 2x file, and `HeroImageCarousel`'s preload probe asks which URL the viewport will paint (`paintedUrl`) instead of probing the landscape `src` and fetching both; a network trace at 390x844 DPR 3 requests the portrait files only. |
| V-P1-1 79 hex literals in the map stage | **Fixed** | `packages/design-system/src/mapPalette.ts`: `MAP_CHROME` references `HDS_NASA_TOKENS` values (not copies), `MAP_INTERACTIVE` / `MAP_RISK_RAMP` / `MAP_SENSOR_SITES` / `MAP_RADAR_BANDS` keep their shipped values as documented data encodings. Deviation from this audit's `components/map/mapPalette.ts` suggestion: the palette lives in the design-system package so the native map screen can import the same object, which is the point of the finding. `__tests__/mapPalette.test.js` fails on any hex literal in `LiveMapView.tsx`, on a chrome value that drifts from its token, or on an unused key. |
| V-P1-2 `--navbar-height` omits the inset | **Fixed** | `index.css:333,347` are `calc(3.5rem + env(safe-area-inset-top, 0px))` / `calc(4rem + …)`; the GIS tab header and the floating panels use `calc(var(--navbar-height)+8px)`; the hero uses `calc(var(--navbar-height)+44px)`. **Strengthened 2026-10-04:** verified by propagation, not by reading the file — driving `--navbar-height` to `calc(3.5rem + 47px)` on an emulated 390x844 viewport moved the hero's top padding 76 -> 123px and the console header's 64 -> 111px (exactly the inset, both surfaces) with no horizontal overflow. The notched / gesture-navigation / foldable rows that still need hardware are steps 1 and 9 of `docs/audits/2026-10-04-device-verification-script.md`. |
| V-P1-3 nine emoji / bare glyphs | **Fixed** | All nine are `MaterialIcon` calls (`desktop_windows` and `straighten` were authored for the size presets); the disclosure caret is `expand_more` rather than `▾`. Nothing in the shipped UI is an emoji. |
| V-P2-4 glass over a native map | **Fixed as a constraint, not as web code** | The web placement was already correct (blur only on fixed/sticky chrome; zero `backdrop-blur` utilities in the console). `apps/mobile` contains no `BlurView`/`expo-blur` import, so the native screens already follow the "translucency and hairline, no blur over the map" rule this finding asks for; it is recorded here so the port does not reintroduce it. |
| V-P2-5 tooltips are the only label | **Not reproducible — corrected in place** | Direct audit of every button in the seven route files: zero controls are both icon-only and unnamed; every icon-only button has an `aria-label` and the `title=` attributes sit on text-labelled controls. The finding text above now records the corrected measurement. The native half stands: anything that lives only in a tooltip must be re-expressed in the port. |
| V-P2-6 two opposite navbar treatments | **Fixed** | `isTransparent` is deleted, so there is one implementation and one rule: the bar is translucent over imagery (`/`) and solid over data (`/live`), decided in `Navbar.tsx` from the route. The native shell inherits that single rule. |

### Backlog rows

| # | Status | Note |
|---|---|---|
| 1 | **Fixed** | HUD is `aria-hidden` and its invented values are deleted. |
| 2 | **Fixed** | Scrim `from-black/70 to-black/60`. |
| 3 | **Fixed** | `data-low-bandwidth` at boot + `shouldAnimate` + `useWebFrame` off-switch. |
| 4 | **Fixed** | `--navbar-height` carries the inset; both hard-coded duplicates are gone. |
| 5 | **Fixed** | One primary CTA + clamp/disclosure on `<sm`. |
| 6 | **Fixed (different location)** | `packages/design-system/src/mapPalette.ts`, so web and native share it. |
| 7 | **Fixed** | Nine sites replaced; two glyphs authored. |
| 8 | **Fixed** | Five per-section navs became lists; the TOC nav is the only one. |
| 9 | **Closed — no fix required** | 85 buttons / 25 `aria-label` / 26 `title=` re-measured control by control: no unlabelled icon-only control exists (see V-P2-5). |
| 10 | **Fixed** | Portrait crops + media-query selection + slide-1 preload + low-bandwidth single slide. |
| 11 | **Fixed** | Chip is on the `hazard-warning` tokens; `isTransparent` deleted (one navbar rule, documented). |

### What this pass did not do on these three surfaces

- **The proof card above the fold on a phone** (H-P1-3 residual): a hierarchy decision, not a
  mechanical one.
- **A ~900×1600 hero asset**: no source pixels exist above 768 vertical; needs a re-render upstream.
- **Hardware verification of the safe-area arithmetic** (V-P1-2): no notched device in this
  environment; the values are derived from `env(safe-area-inset-top)` and asserted only as
  arithmetic.

**All three closed on 2026-10-04** — see the updated rows above and §12 of
`docs/audits/2026-10-03-frontend-design-system-audit.md`. The hierarchy decision was resolved by
adding an evidence pointer rather than moving the card, the hero art was re-rendered at 768x1376
(9:16) and selected by media query, and the safe-area arithmetic was verified by propagation. The
only part of V-P1-2 that still needs hardware (notch, gesture navigation, foldable) is now a scripted
row in `docs/audits/2026-10-04-device-verification-script.md`.
