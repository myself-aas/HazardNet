# Frontend Design System Audit - All Pages

**Date:** 2026-10-03
**Scope:** `frontend/src` (35 page components, 52 routes, 6,798 colour utilities, 3,951 lines of CSS)
**Second target:** `apps/mobile` (14 native screens, 2,069 lines) + `packages/design-system`
**Method:** static measurement of the working tree plus the repo's own gates. Every number below is reproducible with the command in the appendix.

---

## 0. Design Read

> Reading this as: a **public-interest early-warning console** for **institutional duty officers, agricultural extension staff and farmers in Bangladesh**, with a **trust-first / government-adjacent** language, leaning toward **NASA HDS primitives rendered through the Meridian layer, and a native shell that has already diverged from both**.

**Dials, inferred from the brief rather than the skill's baseline (§1.A / §1.B):**

| Dial | Skill baseline | This project | Why |
|---|---|---|---|
| `DESIGN_VARIANCE` | 8 | **4** | Public-sector / regulated / accessibility-critical row of §1.A. A hazard console is read under time pressure in bad light. Asymmetry that costs legibility is a defect, not a style. |
| `MOTION_INTENSITY` | 6 | **3** | Trust-first row of §1.A. Motion is already implemented at roughly 4-5 (cinematic hero, rAF frame loop, scroll reveals). It should come **down**, not up, for a battery-constrained field app. |
| `VISUAL_DENSITY` | 4 | **7** | This is dense product UI, not a landing page. Cockpit density is correct for the map and district brief; the marketing surfaces should sit at 3-4. |

### 0.1 Out-of-scope declaration (required by §13 of `design-taste-frontend`)

`design-taste-frontend` explicitly excludes **dashboards, data tables, multi-step forms and native mobile**. HazardNet is all four. Reporting honestly:

- The **dashboard, table, chart, map and form surfaces** of this app are not judged against landing-page rules. The correct reference is a real design system, and the repo already reached for one (NASA HDS, vendored with provenance in `data/design/nasa-hds/`). That is the right call and this audit does not ask for it to change.
- The **landing surfaces** - `/`, `/about`, `/use-cases`, `/download`, `/contact`, `/hazards`, `/divisions`, `/privacy`, `/terms`, `/not-found` - **are** in scope for `design-taste-frontend` and `high-end-visual-design`, and are audited as such.
- The **mobile** target is audited against Apple HIG and Material 3 through the `high-end-visual-design` mobile-collapse rules, not against web layout rules.

Where a rule from the skills conflicts with the product (for example, "serif display" or "asymmetric chaos"), the product wins and this audit says so.

---

## 1. Verdict

| Dimension | Score | Summary |
|---|---|---|
| Token **coverage** | **A** | 6,340 palette-family uses, 99.8% resolving to a declared token. Genuinely rare discipline. |
| Token **architecture** | **D** | Four overlapping colour systems, 746 distinct custom properties, three sources of truth for the same semantic role. |
| **Dark mode** | **F** | Auto-activates from the OS, but only **3.7%** of colour utilities have a `dark:` twin. On a phone set to dark, the app renders light surfaces with dark-patched islands. |
| **Cross-platform parity** | **F** | Web and native resolve the *same semantic role* to *different hex values*, and a green parity test asserts the values the web does not ship. |
| **Typography** | **D** | Documented families (Instrument Sans / Plus Jakarta Sans) are not shipped, not declared, and not on disk. Two utility classes are named after fonts they do not use. |
| **Shape consistency** | **C** | 10 radius values in live use; `rounded-full` 295 times against `rounded-control` 22. Native radius scale still pinned to 0/2px while web is 4-32 + pill. |
| **Interaction states** | **C** | 716 `hover:` against 38 `active:`. 151 `title=` tooltips, which are invisible on touch. Loading/empty/error coverage is partial (14 / 11 / 18 of 35 pages). |
| **Motion discipline** | **B** | Reduced-motion is honoured in 23 files and motion stays on `transform`/`opacity`. But four raw scroll listeners survive, `transition-all` is used 186 times, and `lg:min-h-screen` plus auto-playing video trip the mobile viewport and battery rules. |
| **Mobile conversion readiness** | **D** | ~30 of 52 routes have no native counterpart; the core advisory surface has no native screen at all. |
| **Structural health** | **A** | 166 test files, provenance files, documented waivers. The problem is not rigour, it is **too many concurrent systems**. |

**One-line verdict:** the design *engineering* here is well above average and the design *governance* has failed. The app has accumulated four design systems, four font stories and two colour truths, and it is about to carry all of that into a native client that has already picked the wrong side of each split.

---

## 2. What is genuinely strong (keep, do not touch)

1. **Token adoption at the class-name level.** `npm run check:tokens` reports 6,340 palette-family uses at 99.8% resolution, with `indigo`/`purple` left off-system *on purpose and with a written reason* (they are data encodings, not status semantics). That is a better-reasoned exception than most production systems have.
2. **Vendored NASA HDS with provenance.** `data/design/nasa-hds/PROVENANCE.md`, a compiled `nasa-hds.css`, and NASA's own usage rules repeated in `index.css` next to each token ("Never for on-page actions, decoration or dataviz"). Quoting the *rule* beside the *value* is exactly right and is the thing most codebases drop.
3. **Contrast is measured, not estimated.** `#970002` is annotated as 9.1:1 on white; `--mrd-ink-tertiary` at 4.52:1 is annotated "AA, 14px+ only". Someone actually ran the numbers.
4. **44px tap targets are systemic.** Global `min-height/min-width: 44px` on buttons, `.tap-target`, `.touch-target-link`, `touch-action: manipulation`, and `viewport-fit=cover` in `index.html`.
5. **Reduced motion is real, not decorative.** `useReducedMotion()` in `App.tsx`, a global `@media (prefers-reduced-motion: reduce)` block that only zeroes durations, and per-component guards. Motion in this repo uses `transform`/`opacity`, not `top`/`left`.
6. **The Meridian reasoning about crimson is unusually good product thinking** (`meridian.css:475-483`): crimson is reserved for hazard signal, and navigation CTAs take ink so that "crimson means danger" stays true. Keep this argument; it is the strongest design decision in the repo.
7. **Responsive ergonomics work already exists** (Phase 5): peek/half/expanded progressive disclosure, `min()`/`clamp()` widths in the chatbot and map, keyboard-navigable `MapDistrictTable`.
8. **Offline/PWA groundwork** (service worker, tile cache, `useBandwidthMode`, `localStorage`-backed home district) is exactly what the native app needs and is reusable.

---

## 3. Findings

Severity: **P0** ships broken or misleads users on a phone today. **P1** blocks the mobile port. **P2** quality debt. **P3** polish.

### P0-1 - Dark mode is a half-applied patch, and it auto-activates

**Evidence**

- `App.tsx:226` calls `useMeridianTheme()`, which (`components/meridian/motion.ts:176-198`) sets `data-mrd-theme` and toggles `.dark` on `<html>` **from `prefers-color-scheme`** with no user interaction. The return value is discarded, so there is no in-app override.
- `@custom-variant dark (&:is(.dark *, [data-mrd-theme="dark"] *))` (`index.css:24`) means only `dark:` utilities respond.
- Colour utilities with a `dark:` twin: **251 of 6,798 = 3.7%**.
- Files with colour utilities and **zero** `dark:` variants: `pages/Dashboard.tsx` (284 colour utilities), `pages/AdvisoriesPage.tsx` (260), `components/LiveMapView.tsx` (394), `components/DisasterDetailModalUI.tsx` (242), `pages/UserProfilePage.tsx` (214), `components/NationalOverview.tsx` (164).
- **Every single page file has `dark:` count 0** (35 of 35).
- Only three components are dark-paired: `DistrictDetailPanel.tsx` (55% coverage), `map/DistrictForecastCard.tsx` (41%), `WeatherPanel.tsx` (52%).

**Consequence on a phone:** iOS and Android default to dark in the evening. The user opens HazardNet, `<html data-mrd-theme="dark">` is applied, and the app shows a **light page** (`bg-white`, `bg-carbon-05`) with a **dark district panel** nested inside it, and light-on-light text wherever a `dark:text-*` twin exists without a `dark:bg-*` twin. This is not a hypothetical: `DistrictDetailPanel.tsx:60` is `bg-white dark:bg-carbon-90 text-carbon-90 dark:text-carbon-10`, and it is rendered inside `Dashboard.tsx` / `AdvisoriesPage.tsx`, which are 0% dark.

This is the single highest-value fix in the audit and it is cheap: **either** stop auto-applying dark (`useMeridianTheme` defaults to `'light'` until the user opts in), **or** commit to the rollout. Do not ship the current state, because mobile users will see it.

**Recommendation:** ship the "do not auto-apply" stopgap this week (one-line default change plus a persisted `'system'` opt-in in settings, which the native app already has as `AccessibilitySettingsScreen`), then execute Phase 9 of `MIGRATION_PLAN.md` properly.

---

### P0-2 - Web and native disagree about the same semantic colours

**Evidence**

| Semantic role | Web (what ships) | Native (`packages/design-system/src/tokens.ts`) | Third value |
|---|---|---|---|
| Brand crimson | `--hn-brand-red: #970002` (`index.css`), `--mrd-crimson: #970002` | `nasaRed: '#f64137'` | `HDS_TOKENS.primaryRed: '#f64137'`, `primaryRedShade: '#b60109'` |
| NASA blue shade | `#0b3d91` (`styles/nasa-hds.css:21`) | `nasaBlueShade: '#0b3d91'` | `--mrd-blue-shade: #0b3b95`, documented as `#0b3b95` in `DESIGN_SYSTEM.md` |
| Ink | `#0D0D0D` / `#141a1f` | `#17171b` | `#17171b` |
| Card radius | Meridian 4/8/12/16/24/32/pill | `radius: { none: 0, control: 2 }`; `NATIVE_RADIUS` adds `chip: 2, control: 2` | HDS v2.2 "0 default, 2 for controls" |
| Type | system fallback stack | `SF Pro` / `Roboto` | docs claim `Instrument Sans` / `Plus Jakarta Sans` |

The native app's `SEVERE` colour is `colors.nasaRed` = **`#f64137`** (`apps/mobile/src/theme/theme.ts:54`). The web design system explicitly documents that family as usable on **dark grounds only** ("a tint of `#970002` would only reach `3.6:1`", `index.css` Layer 1b). On white, `#f64137` is roughly 3.3:1, below AA for text. So the native app's most safety-critical colour is a web token that the web refuses to use on light.

**Worse: the parity test gives false confidence.** `__tests__/designTokensParity.test.js:17-19` asserts `primaryRedShade === '#b60109'` and `nasaBlueShade === '#0b3b95'` against `frontend/src/design-system/tokens.ts` - a file the web app **does not render from**. The test is green; the web is crimson `#970002`; the phone is `#f64137`.

**Recommendation:** make `packages/design-system/src/tokens.ts` the *only* source of hex, add `meridian.ts` values to it, generate `frontend/src/styles/meridian.css` and `apps/mobile/src/theme/*` from it (they already claim to be mirrors), and change the parity test to fail when a role has two values rather than assert one hard-coded pair.

---

### P0-3 - The documented typography is not the shipped typography

**Evidence**

- `frontend/public/fonts/` contains **only `README.md`**. There are **zero `@font-face` declarations** anywhere in `frontend/src` (`grep -rn "@font-face"` returns nothing).
- The only shipped face is `@fontsource/noto-sans-bengali` (imported at `index.css:5-6`). Bengali is covered; **Latin is not**.
- `index.css:882-884` resolves `--font-sans` to `--hds-font-family-body` = `'Public Sans Web', 'Segoe UI', Roboto, ...`. `Public Sans Web` is not shipped either, so the body text silently becomes **Segoe UI on Windows and Roboto on Android**. `Roboto` is on the skill's banned list, and on a Pixel the console will render in it.
- `DESIGN_SYSTEM.md` §2 Layer 3 documents `--font-sans: 'Plus Jakarta Sans', 'Public Sans Web', 'Noto Sans Bengali'` and a `--font-heading: 'Instrument Sans'` stack. **Neither is declared in the code.** The document is describing a design system that is not in the repository.
- Two classes are named after fonts they do not use: `.font-inter` maps to `'Public Sans Web'` and `.font-montserrat` maps to `--font-brand` (= `'Inter'`) at `index.css:1382-1391`. An engineer following the class name will not get what they expect.
- `--font-sans-en: 'Inter', 'Roboto'` (`index.css:29`) is a *fourth* Latin stack, used by `html, body, button, input, select, textarea` at line 37-38, while `body` is separately set to `--hn-font-sans` at line 361. Two different stacks for the same text nodes, decided by source order.

**Why this matters more for mobile than for web:** native `nativeTokens.ts` declares `TYPE_ROLES` with `fontFamily` resolved to SF Pro / Roboto. If web is "whatever the OS gives us" and native is "SF Pro / Roboto", the product has no type identity at all, and the Bengali/Latin pairing that `DESIGN_SYSTEM.md` §1.4 calls a core principle is only half true on either platform.

**Recommendation:** pick one of two honest positions and make the docs match. Either (a) **system-stack by design** - then say so, delete the fabricated `DESIGN_SYSTEM.md` font table, delete `.font-inter`/`.font-montserrat`, declare on the native side too (`Platform.select` for the *role*, not a family name), or (b) **ship the faces** - a subsetted 50 KiB WOFF2 budget is already specified in `public/fonts/README.md`; finish that job and reuse the same `.ttf` via `expo-font` so both platforms match.

---

### P1-1 - Four design systems in one component tree

**Evidence**

| System | Where | Live? |
|---|---|---|
| NASA HDS (`--hds-*`) | `styles/nasa-hds.css`, 174 tokens | yes, 174 tokens resolve |
| HazardNet HDS v2.2 (`--hn-*`) | `index.css`, 436 custom props | yes |
| Meridian HDS v3.0 (`--mrd-*`) | `styles/meridian.css`, 178 tokens | partly: **108 references in components** |
| shadcn | `@import "shadcn/tailwind.css"` | one import |
| `unlumen-ui/primitives` | `components/unlumen-ui/` | 1 file imports it |
| `components/meridian/primitives` | own primitives | 2 files |

746 distinct custom properties total. `@import` order is load-bearing: NASA first, Meridian last "so it can override it" (`index.css:16-22`). That is a cascade, not a system.

**Dead dependencies** (verified: 0 imports anywhere outside `node_modules`, grep over `*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.cjs`): `@mui/material`, `@emotion/react`, `@emotion/styled`, `@base-ui/react`. They occupy ~40 MB in `node_modules` (`@mui` 17M, `@base-ui` 20M, `@emotion` 2.7M), appear in `npm audit` and Dependabot surface, and inflate the answer to "what does the mobile port have to replace?" by four libraries. `recharts` (12 files), `three`/`react-three-fiber`, `remotion`, `html2canvas`, `jspdf` are all genuinely used - those are port decisions, not deletions.

**Recommendation:** declare the winner. `MIGRATION_PLAN.md` already says Meridian is v3.0 and the old layer retires in Phase 10. Either run that plan or delete the plan. Remove the four dead dependencies today; they cost nothing to remove and they make the port scope look 30% larger than it is.

---

### P1-2 - Shape and radius consistency has broken down

**Evidence** (non-test `pages` + `components`)

| Radius | Uses |
|---|---|
| `rounded-full` | 295 |
| `rounded-xl` | 175 |
| `rounded-lg` | 144 |
| `rounded` (4px) | 140 |
| `rounded-sm` | 106 |
| `rounded-2xl` | 97 |
| `rounded-md` | 47 |
| `rounded-3xl` | 32 |
| `rounded-control` (2px) | 22 |

Ten different radii in live use, with no documented rule mapping radius to component class. Meanwhile `meridian.css` *does* define a coherent scale (`xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32 / pill`) with a stated concentric rule, and only **11** `--mrd-radius-md` references exist. The system exists and is essentially unused.

Concretely: `DESIGN_SYSTEM.md` §5 declares a "unified 2px radius" for buttons, but the app-wide distribution above shows 2px controls (`rounded-control`, 22 uses) are outnumbered 13:1 by pills (`rounded-full`, 295), and `About.tsx:26` opens the page with an explicitly `rounded-sm` badge while the CTA buttons 20 lines below carry **no radius class at all** and simply inherit whatever the global default is. Radius in this codebase is mostly accidental rather than chosen. `components/alerts/LanguageToggle.tsx:36-37` is the only place that pins `rounded-none` explicitly. A `rounded-full` badge beside a `rounded-control` button, with no written rule saying which is which, is precisely the "mixed system with no documented rule" case the skill calls broken.

For native this is worse: `NATIVE_RADIUS` inherits `none: 0, control: 2` plus `chip: 2, control: 2`, so **the native app is still a 2px-radius app while the web is becoming a 12-16px app**. The two apps will look like different products.

**Recommendation:** freeze on the Meridian scale, write the radius-role table (chips/pills/inputs/cards/sheets/modals), codify it in `@theme inline` so `rounded-control` etc. are the only legal names, and update `NATIVE_RADIUS` in the same commit.

---

### P1-3 - The token gate measures class names, so 356 raw hex values bypass it

**Evidence**

- `node scripts/check-token-compliance.mjs` reports **99.8%** compliance. Its own docblock says the methodology counts `<family>-<shade>` occurrences in class names.
- Raw hex literals in non-test `pages` + `components`: **356**, including tailwind stock values that the gate would flag if written as classes: `#ef4444` (red-500) x15, `#f59e0b` (amber-500) x21, `#3b82f6` (blue-500) x6, `#10b981` x8, `#06b6d4` x6, `#f43f5e` (rose-500) x8, `#38bdf8` (sky-400) x8, `#dc2626` x10.
- Also 405 `!important` declarations in `index.css`, including a specificity hack that rewrites a utility per text size: `.text-xs.text-carbon-70, .text-\[11px\].text-carbon-70 { color: var(--hds-color-carbon-80) }` (`index.css:2793-2796`). That is a contrast fix applied by overriding the consumer instead of fixing the token.

**Recommendation:** extend the gate to count hex literals in `className`, `style=`, and `*.tsx` string bodies, and set the same 90% bar. Add the four contrast roles the hack is patching to the token layer as `--text-caption` etc. Then delete the `.text-xs.text-carbon-70` block.

---

### P1-4 - The landing surfaces break the mobile viewport rules

**Evidence**

- `pages/FrontDoor.tsx:385` - the hero is `min-h-[600px] lg:min-h-screen`. On iOS Safari `100vh` is the *largest* viewport; the hero is taller than the visible area and the CTA row sits below the fold until the address bar collapses. Only **10** `dvh`/`svh` usages exist in the whole app, against 15 `100vh`/`h-screen`.
- The same hero runs `HeroCinematicBackground` (video + `BgMesh` + HUD + grade + grain + vignette) with `autoPlay`, plus **three** nested `backdrop-blur` glass panels (`FrontDoor.tsx:402-410`, `style={{ backdropFilter: 'blur(var(--hero-glass-blur))' }}`). The skill's §6.E rule ("never apply blur to scrolling containers - continuous GPU repaints destroy mobile FPS") is violated by a stack of blurs on a 100vh scrolling hero with video underneath. This is a mid-range-Android frame-drop generator and a battery cost on a field device.
- Hero CTA count is **3** (`/live`, `/methodology`, `/model-performance`) - the skill allows 1 primary + 1 secondary.
- The hero also carries a metadata strip (`{label} · HazardNet · {reviewed date}`, `FrontDoor.tsx:401-406`) - a middle-dot masthead plus a version-style eyebrow, both on the §9.F banned list.
- `App.tsx:263` uses `min-h-screen` for the app shell.
- `StatusStrip`, `Dashboard.tsx:756/769` use `h-[calc(100vh-220px)]`.

**Recommendation:** `min-h-[100dvh]` everywhere, hero CTA count to 2, delete the masthead strip, and reduce the hero to **one** blur layer (the text scrim) with the video served at a lower resolution on `data-low-bandwidth="true"` (the hook already exists).

---

### P1-5 - 157 uppercase-tracking micro-labels (eyebrow budget is exceeded)

The skill caps eyebrows at `ceil(sectionCount / 3)`. Two measurements, both over budget:

- **157** instances of `uppercase` combined with `tracking` or a 10-11px size, across `pages` + `components`.
- **12** instances at the strict signature (`uppercase tracking-[0.0xem]`), which is the mechanical pattern §14 tells you to count.

Against ~52 routes that is 12 strict eyebrows for a budget of roughly 17 across the *whole* app, and the 157 broader instances are the same visual move applied to labels instead of headings. Hot spots: `Dashboard.tsx:302,306` (`HazardNet / live`, and a `tracking-[0.12em]` chip), `dashboard/BlogEditorPage.tsx:448`, `components/MenuDrawer.tsx:210`, `components/auth/BrandPanel.tsx:169`.

Every one of them is a small-caps mono label above or beside a heading. On desktop this reads as "technical console" (defensible at `VISUAL_DENSITY: 7`); on a 390px phone it reads as **text that is too small to read**. `text-[10px]`/`text-[11px]` appears **288 times**. With `NATIVE_FONT_SCALE_MAX = 1.5` on the native side, these labels will be the first thing to break layout under Dynamic Type.

**Recommendation:** cap `text-[10px]` and `text-[11px]` at 12px minimum (11px is below the platform legibility floor and the native `TYPE_ROLES.caption` is already 12-13), and cut the eyebrow count by half by demoting the rest to sentence-case labels.

---

### P1-6 - Hover is doing work that touch cannot do

**Evidence**

- `hover:` **716** occurrences; `active:` **38**; `group-hover:` **32**.
- `whileHover` **39** uses in 9 files; `whileTap` **29** in 10 files. No file has `whileHover` without a `whileTap` somewhere, so nothing is entirely static on touch - but the ratio is wrong per component: `About.tsx` has 7 `whileHover` and only 3 `whileTap`, so four of its interactions hover and never press.
- `title="..."` **151** times across 50 files, including icon-only controls: `Dashboard.tsx:369,455,464,484,707,718,729,740,932,1138` are all `title="Close drawer"`, `title="Settings"`, `title="Export PDF"`, `title="Set map stage height to Ultra Tall (850px)"`. A `title` tooltip **never fires on touch** and is not reliably announced by screen readers. `aria-label` is present (0 buttons have `title` without `aria-label`), so this is a discoverability failure, not a WCAG failure.
- One genuine hover-only reveal: `LiveMapView.tsx:2184` is `opacity-0 group-hover:opacity-100` - a map legend control that is **invisible and untappable on a phone**.
- Raw `window.addEventListener('scroll', ...)` survives in four places: `components/Footer.tsx:88`, `components/Navbar.tsx:64`, and twice in `components/meridian/motion.ts` (`:119`, `:147`). All four are `{ passive: true }`, so they are not the catastrophic version, but the skill bans them outright and the two chrome listeners are exactly the ones that will jank a mid-range Android during momentum scroll. Replace with `IntersectionObserver` or a CSS scroll-driven animation on the sentinel element.

**Recommendation:** for every `group-hover:opacity-0` reveal, add `group-focus-within`/always-visible on `max-md:`. Replace `title=` on icon-only controls with a visible label or a tappable popover. Add `:active` press feedback to the primary and secondary buttons (`.hn-btn-*` currently transitions colour only).

---

### P1-7 - Public-sector tables and forms are the mobile weak point

**Evidence**

- `overflow-x-auto` in **31 files / 47 uses**; `<table>` in **17 files / 24 uses**. Horizontal scroll inside a vertically scrolling phone page is the worst affordance for a field user wearing gloves or reading one-handed.
- `components/map/MapDistrictTable.tsx` is the keyboard-accessible fallback for the choropleth - excellent on web, meaningless as the primary mobile pattern.
- Forms: `Contact.tsx` (6 inputs), `UserProfilePage.tsx` (7), `dashboard/BlogEditorPage.tsx` (14), `SignUpPage.tsx` (4). iOS zoom-on-focus is handled globally (`index.css:1792` forces 16px inputs under 768px) - good. But labels: `htmlFor` appears **65** times against a much larger input count, so some fields rely on visual adjacency.
- `components/blog/RichTextEditor.tsx` is a `contentEditable` editor. There is no React Native equivalent; it must stay web/admin-only.

**Recommendation:** convert the two or three highest-traffic tables (`DistrictAlertTable`, division/hazard detail tables) to **card-stack rows** below `md`, and keep `MapDistrictTable` as the desktop/a11y path. This is the single biggest UX win for the mobile port because it removes the need to port table logic at all.

---

### P1-8 - Two icon families, one of them hand-drawn

**Evidence**

- `components/MaterialIcon.tsx` is **923 lines** and **220 `case` branches**, all hand-authored SVG paths, used by **61 files** (20 pages).
- `lucide-react` is imported in **26 files**.
- So the app mixes a bespoke 220-glyph hand-rolled set with Lucide, which the skill bans as the default AI-choice icon set and which the repo's own docs never mention choosing.
- Native side: `screens/more/MoreScreen.tsx` uses **emoji** as row icons (`📷`, `◐`, `🔔`, `◉`, `ⓘ`) while the package already depends on `react-native-svg`. Emoji glyphs render differently on every OEM, cannot be tinted with the theme, and are silent to screen readers as icons. This is the §3.D emoji-policy failure on the platform where it hurts most.

**Recommendation:** pick **one** family. Given 61 files already depend on `MaterialIcon`'s names, the cheapest honest move is: keep the *names*, replace the *bodies* with `@phosphor-icons/react` (or generate the RN equivalents from the same source), and migrate the 26 Lucide files onto it. Then port `MaterialIcon` to a `react-native-svg` component that shares the same name map, so one icon vocabulary serves both platforms. Never ship emoji as an icon on either platform.

---

### P2-1 - Web-only capability inventory (what the port cannot carry)

Measured in `frontend/src`, file counts are files that reference the capability:

| Capability | Files | Native path |
|---|---|---|
| Leaflet / markercluster / heat | 10 | **Web-only.** Native already ships an SVG choropleth (`components/map/BangladeshMap.tsx`) with no basemap; adding a tile map would trade offline capability for parity nobody asked for |
| three.js / react-three-fiber | 2 (21 references) | Drop. The 3D globe has no native equivalent in scope. |
| Remotion (`remotion` imported in frontend) | 12 | Drop. Video composition is a build-time concern. |
| html2canvas / jsPDF | 4 | Replace with `expo-print` + `expo-sharing` |
| Recharts | 12 files | `react-native-svg` charts, or `victory-native` |
| `window.print` / `PrintPreviewModal` | 5 | Drop on native; keep web-only. `PrintPreviewModal.tsx` is 104 colour utilities of print CSS |
| `canvas` | 14 files | Not available; snapshot paths must change |
| `Blob` / `URL.createObjectURL` | 9 / 8 | `expo-file-system` |
| `navigator.*` (including clipboard) | 29 / 12 | `expo-clipboard`, `expo-linking`, `NetInfo` |
| `localStorage` / `sessionStorage` | 19 / 7 | `AsyncStorage` - the native app already uses it; the *keys* (`hazardnet_home_district`, `hazardnet_auto_detect_location`, `shonchay_saved_districts`) must be reconciled, since `shonchay_saved_districts` is a legacy name that leaks a previous brand |
| `contentEditable` rich text | 1 | Web-only |
| `position: fixed` | 17 | Modal/sheet review; native uses `Modal` + `react-native-screens` |

**Dependencies the native app already has** (so these ports are greenfield-free): `react-native-svg` 15.2 (charts, icon glyphs, choropleth), `react-native-maps` is **not** present and, per the map row below, **should not be added**, `expo-file-system` (tile and report caching), `expo-image-picker` (field report photos), `expo-location`, `expo-notifications`, `expo-haptics`, `expo-linking` (OAuth + deep links), `react-native-reanimated` + `gesture-handler` (sheets and swipe), `@shopify/flash-list` (the alert feed), `netinfo` (offline state), `zustand` + `@tanstack/react-query` with an AsyncStorage persister (offline-first data layer). **Missing and needed:** `expo-print` + `expo-sharing` (the PDF/share paths that replace `html2canvas`/`jspdf`/`window.print`), `expo-font` (only if the type decision goes the "ship the faces" way), and a native E2E runner (the repo already writes 166 Jest suites and Playwright specs for web; `.maestro/today-alerts-flow.yaml` exists but `maestro` is not a declared dependency).

**Note the naming debt:** `shonchay_saved_districts` in `pages/Dashboard.tsx` is a persisted key from an earlier product name. It will be ported verbatim into the native app unless it is aliased now.

---

### P2-2 - IA parity: ~30 of 52 routes have no native counterpart

The native shell has 5 tabs (Today, Alerts, Map, Saved, More) and 14 screens. Mapping the web route table to it:

| Web routes | Native screen | Status |
|---|---|---|
| `/live`, `/home`, `/home/overview`, `/forecast/overview` | `MapScreen` | Covered |
| `/alerts`, `/alerts/:id` | `AlertsScreen`, `AlertDetailScreen` | Covered |
| `/forecast/my-districts` | `SavedScreen` | Covered |
| `/upload` | `SubmitReportScreen` | Partial (web has OCR/CSV path in `UploadPage`) |
| `/blogs/:slug`, `/methodology`, `/about`, `/privacy` | `ArticleScreen` + `ARTICLE_INDEX` | Partial |
| `/status` | `DataStatusScreen` | Partial |
| **`/advisories`, `/advisories/:subCategory`** | **none** | **Gap - this is the product's core farmer-facing output** |
| `/forecast/district/:id`, `/districts/:id`, `/divisions/:id` | `SavedPlaceDetailScreen` only | Gap for non-saved districts |
| `/divisions`, `/hazards`, `/hazards/:slug`, `/analytics`, `/retrospectives`, `/archive`, `/historical`, `/events`, `/model-performance`, `/districts` | none | Gap (reference/editorial, low urgency) |
| `/forecast/compare`, `/forecast/settings`, `/settings` | none | Gap |
| `/dashboard`, `/profile`, `/u/:username` | none | Gap (account) |
| `/login`, `/signup`, `/forgot-password`, `/update-password`, `/set-password`, `/auth/callback` | none | Gap (auth) |
| `/`, `/use-cases`, `/download`, `/docs`, `/faq`, `/data-sources`, `/contact`, `/terms` | none | Intentional for some; `/download` should deep-link to the store |

**The advisories gap is the one that matters.** `pages/AdvisoriesPage.tsx` is 1,070 lines and is the farmer-facing output the whole pipeline exists to produce. If the native app cannot show an advisory, the native app is not a HazardNet client, it is a viewer.

Also: the native `MoreScreen` row "Open hazardnet.live in browser" (`MoreScreen.tsx:88`) is an admission that the native shell is smaller than the web app. That is fine as an interim, but it should not become the permanent answer for advisories.

---

### P2-3 - State coverage is partial

| State | Pages with it (of 35) | Notable gaps |
|---|---|---|
| Loading | 14 | `HazardsPage`, `DivisionsPage`, `AdvisoriesPage`, `AnalyticsPage`, `HistoricalCatalogPage` have no skeleton |
| Empty | 11 | `DivisionsPage`, `HazardsPage`, `AdvisoriesPage`, `HazardDetailPage` |
| Error | 18 | `AlertsPage`, `AlertDetailPage`, `Blocks`, `NotFoundPage` |
| Retry affordance | 7 | most error states dead-end |
| `usePageSeo` | 12 | 23 pages set no head from the client; they rely on the prerenderer, so client-side navigations keep the previous title |

Also: `HistoricalCatalogPage` renders a full-page `bg-carbon-90 text-carbon-10` (dark) loading and error state (`:70`, `:74`) inside an otherwise light page - the "random dark section" failure the redesign skill calls a copy-paste accident, and on a dark-OS phone it inverts the wrong way round.

One bright spot on shape: `components/alerts/LanguageToggle.tsx:36-37` is the only pair of components that pins an explicit `rounded-none`, i.e. it declares its shape instead of inheriting one. Everywhere else the radius is whatever the nearest example used.

**Recommendation:** every one of the 35 pages gets four states (loading / empty / error+retry / success) as a checklist item, and `usePageSeo` moves into a route-level wrapper so it cannot be forgotten.

---

### P2-4 - Micro-issues that will be visible on a phone

1. **`footer a::before` tap expansion (`index.css:2774-2790`).** Every footer link grows a centered 44x44 `pointer-events: auto` box. In the footer's wrapped multi-column layout at 390px, adjacent links' hit boxes overlap, so tapping "Privacy" can hit "Terms". The fix is `padding` on the anchor (real hit area), not an overlay pseudo-element.
2. **Em-dashes: 673 in source, 375 in non-test `.tsx`.** Most are legitimate "no data" placeholders (`WeatherPanel.tsx:85-105` renders `'—'` for every absent metric) or comments, but there are also 38 en-dashes. The skill's ban is absolute; the pragmatic revision is: keep `'—'` **only** as the empty-value glyph (it is the correct typographic choice there), and remove it from every prose string, aria-label and heading. Add a lint rule so it cannot come back in copy.
3. **Decorative status dots: 19** instances of `rounded-full bg-<hue>-NNN` used as bullet decoration rather than state. Keep them where they encode severity; delete them in navigation and badges.
4. **15 `md:grid-cols-3` equal-card rows.** Acceptable for reference indexes, banned for feature/marketing rows (`About.tsx:145`, `AnalyticsPage.tsx:131`, `Blogs.tsx:75`).
5. **`theme-color: #000000`** in `index.html` and `--hn-brand-black: #000000` - pure black is banned for surfaces; use `#0b0e11` (`--mrd-dark-canvas`), which is already a token.
6. **`HistoricalCatalogPage`** and `Dashboard` bypass the container: no `max-w` wrapper on the full-bleed map route. Intended for `/live`, not for `/archive`.
7. **`transition-all` 186 times.** `transition-all` animates layout-affecting properties and defeats the "transform/opacity only" rule. Prefer explicit property lists, which the global 150ms block at `index.css:2740` already sets correctly.

---

## 4. Per-page audit

Legend: **Class** = mobile conversion class. **A** = ports to native nearly as-is. **B** = ports with layout work (tables/grids/sheets). **C** = web-only or needs a native rethink.

| Page | Routes | Class | Design-system notes | Mobile blockers |
|---|---|---|---|---|
| `FrontDoor.tsx` | `/` | B | Hero uses `lg:min-h-screen`, 3 CTAs, masthead eyebrow, 3 stacked blurs, video+grain+vignette. Strongest editorial surface in the app; also the heaviest. | Decorative only; suppress on native (onboarding takes its job) |
| `Dashboard.tsx` | `/live` `/home` `/forecast/*` `/settings` | C | 1,290 lines, 284 colour utilities, 0 dark. 18 buttons, 10 `title=` tooltips, `h-[calc(100vh-220px)]`, 2 hscroll toolbar strips, panes + drawers + modals. | Leaflet, choropleth, toolbar overflow, `title` tooltips. Native `MapScreen` is 193 lines - it is a different product. |
| `AdvisoriesPage.tsx` | `/advisories`, `/advisories/:sub` | A | 1,070 lines, 260 colour utilities, 0 dark, 2 `<h1>` in a ternary, 2 tables with `overflow-x-auto`, sticky filter bar. | **No native screen exists.** Highest-priority port. |
| `AlertsPage.tsx` | `/alerts` | B | 4 sections, has loading + empty, 0 dark. Native `AlertsScreen` exists. | Table at small widths; feed is already card-based in native |
| `AlertDetailPage.tsx` | `/alerts/:id` | B | Print/PDF path, `role="status"`, 0 dark. | Print path, share sheet |
| `DistrictDetailPage.tsx` | `/forecast/district/:id` | B | 449 lines, thin wrapper over `DistrictBrief*` components. `overflow-x-auto` on records. | Records table |
| `DivisionDetailPage.tsx` | `/divisions/:id` | B | 637 lines, 2 tables, 3 hscroll regions, `role="alert"` error. | Tables |
| `DivisionsPage.tsx` | `/divisions` | A | 253 lines, no loading/empty state. | None significant |
| `HazardDetailPage.tsx` | `/hazards/:slug` | B | 656 lines, 2 tables, error+retry present in places. | Tables |
| `HazardsPage.tsx` | `/hazards` | B | 312 lines, `md:grid-cols-3` twice, no loading/empty/error. | Grid to stack |
| `HistoricalCatalogPage.tsx` | `/archive` `/history` | B | **Dark loading and error screens inside a light app.** Chart + modal. | Chart lib |
| `AnalyticsPage.tsx` | `/analytics` | C | 208 lines, 15 `motion.*` elements, `md:grid-cols-3`, hscroll tab bar. | Recharts |
| `Contact.tsx` | `/contact` | B | 6 inputs, 3 states present, `overflow-x-auto` tab group, `md`/`lg:grid-cols-3`. | Form + tabs |
| `UseCases.tsx` | `/use-cases` | B | 4 different grid shapes on one page (`1/2/3/4` cols), 13 `hover:`, 9 `motion.*` elements. Best-varied page in the app; over-animated for its content. | Grid to stack |
| `About.tsx` | `/about` | B | 11 `motion.*` elements and **7 `whileHover` against 3 `whileTap`**, so four interactions hover but never press. `rounded-sm` badge at `:26`, `md:grid-cols-3` at `:145`. | Motion density; hover-only feedback |
| `DownloadCenter.tsx` | `/download` | B | 4 links, hscroll tab group, motion. | Store deep links |
| `Blogs.tsx` | `/blogs` | A | Small, `md:grid-cols-3` cards. | Grid |
| `BlogArticlePage.tsx` | `/blogs/:slug` | B | Gradient avatar (`from-amber-500 to-amber-300`), copy-link, toast. | Rich text, share sheet |
| `Documentation.tsx` | `/docs` | A | Simple. | None |
| `Privacy.tsx` / `Terms.tsx` | `/privacy` `/terms` | A | 4-5 `<section>`s, motion wrapper, `usePageSeo` present on both. | None |
| `NotFoundPage.tsx` | `*` | A | Good: 2 CTAs, 44px, states the status in plain language, no filler. | None |
| `StatusPage.tsx` | `/status` | A | 20 lines, delegates to `ArticlePage` + `FreshnessPanel`. | None |
| `LoginPage.tsx` | `/login` | A | 6 hover, 6 focus-visible, no `usePageSeo`. | Auth flow missing on native |
| `SignUpPage.tsx` | `/signup` | A | 4 inputs, 6 focus-visible. | Auth flow missing |
| `ForgotPasswordPage.tsx` | `/forgot-password` | A | 3 buttons, 5 motion. | Auth flow missing |
| `UpdatePasswordPage.tsx` | `/update-password` | A | 2 inputs. | Auth flow missing |
| `SetPasswordPage.tsx` | `/set-password` | A | Firebase, 2 inputs, 4 focus-visible. | Auth flow missing |
| `AuthCallbackPage.tsx` | `/auth/callback` | C | Firebase popup/redirect - mobile uses `expo-linking` deep links instead. | OAuth redirect |
| `UserDashboardPage.tsx` | `/dashboard` | B | 15 imports, storage, motion. | Account IA missing |
| `UserProfilePage.tsx` | `/profile` | B | 755 lines, 7 inputs, 214 colour utilities, 0 dark, `localStorage` home district. | Forms; settings IA differs from native `AccessibilitySettingsScreen` |
| `PublicProfilePage.tsx` | `/u/:username` | A | 3 `<h1>` across branches, firebase reads. | Not in native scope |
| `UploadPage.tsx` | `/upload` | C | File input, `FileReader`. | `expo-image-picker` / `expo-file-system` |
| `dashboard/BlogEditorPage.tsx` | (admin) | C | 14 inputs, `contentEditable` rich text, `localStorage` autosave, super-admin gate. | **Web-only permanently** |
| `dashboard/BlogStudioPage.tsx` | (admin) | C | Same class. | **Web-only permanently** |

---

## 5. Mobile conversion plan (what to change before the port, not after)

Doing these on the web first makes the native port a translation instead of a redesign.

### 5.1 Fix the token contract first (blocking)

1. One source of hex: `packages/design-system/src/tokens.ts`, absorbing Meridian. Generate `meridian.css` and `apps/mobile/src/theme/*` from it. Delete `frontend/src/design-system/tokens.ts` or make it re-export.
2. Rewrite `__tests__/designTokensParity.test.js` to assert **role uniqueness across web CSS and native TS**, not a hard-coded hex pair. Any role with two values fails.
3. Add a **native-only** section to the contract for platform affordances that legitimately differ (SF Symbols vs Material icons, tab bar heights 49/80, `TOUCH_MIN 48` vs `44`) so the differences are *declared* rather than accidental.
4. Set `NATIVE_RADIUS` to the Meridian scale in the same commit as the web radius freeze.

### 5.2 Fix dark mode before shipping to a phone (blocking)

- Stopgap now: `useMeridianTheme` defaults to `'light'`, or gate the system-follow behind an explicit user setting.
- Real fix: Phase 9 of `MIGRATION_PLAN.md`, with a **machine gate** - fail CI when a file with more than N colour utilities has zero `dark:` twins, or better, move to semantic CSS variables (`--surface`, `--surface-elevated`, `--text-primary`) so dark mode is automatic and `dark:` variants stop being needed at all. Given 6,798 colour utilities, variable-swapping is far cheaper than adding 6,500 `dark:` classes. The native app already works this way (`theme.colors.background` etc.) - so **variables also close the web/native gap**.

- **Resolved (pass 2).** Executed as the variable route: `frontend/src/styles/dark.css` re-points the carbon ramp and the semantic roles, and the machine gate exists in the form this finding asked for - a coverage test that fails when a colour family is neither theme-aware nor a declared data encoding (`__tests__/darkTheme.test.js`). See the ledger's P0-1 row.

### 5.3 Screen mapping decisions

| Native screen | Source | Action |
|---|---|---|
| Today | `NationalOverview`, alert strip | Keep |
| Alerts / AlertDetail | `AlertsPage`, `AlertDetailPage` | Keep; port the card, drop the table |
| Map | `Dashboard` (gis tab), `LiveMapView`, `BangladeshSvgMap` | **Native already answers this and the answer is defensible:** `screens/map/MapScreen.tsx` renders `components/map/BangladeshMap.tsx`, a pure `react-native-svg` divisions choropleth with no tile layer and no basemap. That is offline-first by construction and exactly right for a field device on 2G. Do **not** add `react-native-maps` just for parity. Instead treat Leaflet as a **web-only** capability and reduce the web map to the same SVG hazard layer as the tile-free fallback under `data-low-bandwidth="true"`. |
| Saved | `Dashboard` (saved tab), `SavedPlaceDetailScreen` | Keep |
| **Advisories** (new) | `AdvisoriesPage`, `DistrictBriefBody` | **Add.** Tab or Today-section. This is the product. |
| District brief (new) | `DistrictDetailPage` + `components/district/*` | Add as a stack screen from Map and Alerts |
| More | `MoreScreen` | Replace emoji icons; remove "open in browser" once Advisories lands |
| Web-only forever | `dashboard/*`, `UploadPage`, `DownloadCenter`, print/PDF paths | Do not port |

### 5.4 Platform conventions to adopt in the native shell

- **Dynamic Type / font scaling:** respect it up to a declared cap. `NATIVE_FONT_SCALE_MAX = 1.5` exists; apply `maxFontSizeMultiplier` per text role, and make sure the 288 `text-[10px]`/`text-[11px]` web labels do not migrate as sub-12 sizes.
- **Sheets over modals:** the web has seven overlay surfaces (`DisasterDetailModal`, `DisasterDetailModalUI`, `SavedAssessmentsModal`, `SavedAssessmentsModalUI`, `EventReportModal`, `PdfExportConfigModal`, `PrintPreviewModal`) plus `CommandPalette` and `GlideResourcePopover` - the redesign skill's "modals for everything" flag, and the two `*UI` duplicates suggest the modal content was already extracted once for reuse. Native should use bottom sheets for all of them (`ExpressiveBottomSheet` already exists).
- **No bottom tab bar on web, tab bar on native.** `DESIGN_SYSTEM.md` §1.3 says "Zero Mobile Bottom Navigation" as a web decision. That is fine for the webview, but the native shell already uses bottom tabs (`RootNavigator.tsx`) and that is correct for iOS/Android. Update the doc so a future contributor does not delete the tab bar to satisfy it.
- **Haptics:** `expo-haptics` is already a dependency. Wire it to severity escalation, not to every tap.
- **Offline:** the web service worker plus `useTileCache` already cache map tiles and `frontend/public/data/*` payloads. Native has no tiles to cache, so it needs the *payload* half: `expo-file-system` mirroring the freshness/alert JSON with the same max-age semantics `FreshnessPanel` reads on web. Do this before adding any native screen that shows a timestamp, or the two platforms will disagree about what "fresh" means.

### 5.5 Acceptance criteria for the port

1. No page renders a table as its primary content below 768px; every table has a card-stack alternative.
2. No interactive element relies on `hover` or `title` to be discoverable.
3. Every screen has loading, empty, error+retry.
4. Light and dark are both complete, on both platforms, at 100% token parity for semantic roles.
5. Every text role survives the declared font-scale cap without clipping.
6. One icon vocabulary, no emoji, one radius scale, one type scale, one source of hex.

---

## 6. Prioritised backlog

| # | Action | Sev | Effort | Impact |
|---|---|---|---|---|
| 1 | Stop dark mode auto-applying, or complete it | P0 | 1 line / 3 weeks | Removes a shipping visual break on every dark-mode phone |
| 2 | Single source of hex; rewrite the parity test to reject duplicate roles | P0 | 1 week | Fixes web/native colour divergence and the false-green test |
| 3 | Decide the type story (system stacks declared, or ship the subset) and delete `.font-inter` / `.font-montserrat`; correct `DESIGN_SYSTEM.md` §2-3 | P0 | 3 days | Removes three lying documents |
| 4 | Freeze the radius scale on Meridian + `NATIVE_RADIUS`; codify in `@theme inline` | P1 | 3 days | Cross-platform visual identity |
| 5 | `min-h-[100dvh]` everywhere; hero to 2 CTAs; hero to 1 blur layer; drop the masthead strip | P1 | 2 days | iOS viewport + Android frame rate |
| 6 | Extend the token gate to hex literals; kill the 405 `!important` and the `.text-xs.text-carbon-70` hack | P1 | 1 week | Makes the 99.8% number true |
| 7 | Remove `@mui/material`, `@emotion/*`, `@base-ui/react` | P1 | 1 hour | Install size, audit surface, honest port scope |
| 8 | Tappable replacements for the 10 Dashboard `title` tooltips; fix `LiveMapView` hover-only legend control | P1 | 2 days | Controls that work on touch |
| 9 | Card-stack fallback for district/division/alert tables below `md` | P1 | 1 week | Removes the worst mobile pattern and the RN table port |
| 10 | One icon family; retire Lucide; replace native emoji row icons with `react-native-svg` glyphs | P1 | 1 week | Cross-platform icon parity |
| 11 | **Add the Advisories screen to native** | P1 | 2 weeks | Makes the mobile app a real client |
| 12 | Cap `text-[10px]`/`text-[11px]` at 12px minimum | P1 | 2 days | Legibility + Dynamic Type survival |
| 13 | Four-state checklist for all 35 pages; `usePageSeo` into a route wrapper; de-darken `HistoricalCatalogPage` states | P2 | 1 week | Perceived finish |
| 14 | Fix `footer a::before` overlapping hit areas | P2 | 2 hours | Mis-taps in the footer |
| 15 | Em-dash lint rule (keep `'—'` only as the empty-value glyph) | P3 | 2 hours | Copy hygiene |
| 16 | Delete the 19 decorative status dots; de-duplicate the 15 `md:grid-cols-3` marketing rows | P3 | 2 days | Removes the generic-AI signature from the editorial pages |
| 17 | `theme-color: #0b0e11`; replace `bg-black` in the hero | P3 | 1 hour | Token correctness |
| 18 | Alias `shonchay_saved_districts` to `hazardnet.savedDistricts` before the port | P3 | 1 hour | Stops legacy brand name migrating into the native app |

---

## 7. Appendix - evidence commands

```bash
# repo gates as they stand today
node scripts/check-design-quality.mjs --source-only   # 0 outstanding, 1 waived
npm run check:tokens                                   # 303 files, 6340 uses, 99.8%

# dark-mode coverage (251 dark: variants vs 6798 colour utilities = 3.7%)
grep -rno "dark:" frontend/src/pages frontend/src/components | grep -v __tests__ | wc -l
grep -rno "dark:" frontend/src/pages | wc -l            # 0

# raw hex bypassing the class-name gate
grep -rnoE "#[0-9a-fA-F]{6}\b" frontend/src/pages frontend/src/components | grep -v __tests__ | wc -l   # 356

# fonts: zero @font-face, empty public/fonts
grep -rn "@font-face" frontend/src ; ls frontend/public/fonts

# viewport / motion / hover balance
grep -rno "hover:" frontend/src/pages frontend/src/components | grep -v __tests__ | wc -l   # 716
grep -rno "active:" frontend/src/pages frontend/src/components | grep -v __tests__ | wc -l  # 38
grep -rn "100vh\|h-screen\|min-h-screen" frontend/src | wc -l                               # 15

# radius spread
grep -rhoE "rounded(-[a-z0-9]+)?(\[[^]]+\])?" frontend/src/pages frontend/src/components | sort | uniq -c | sort -rn

# web-only capabilities
grep -rl "leaflet" frontend/src | wc -l      # 10
grep -rl "recharts" frontend/src | wc -l     # 12
grep -rl "html2canvas\|jspdf" frontend/src | wc -l

# cross-platform token divergence
grep -n "primaryRed\|nasaRed" packages/design-system/src/tokens.ts frontend/src/design-system/tokens.ts
grep -n "brand-red\|mrd-crimson" frontend/src/index.css frontend/src/styles/meridian.css
grep -n "nasaRed" apps/mobile/src/theme/theme.ts         # severity colour = #f64137 on light
```

---

## 8. Skills applied

- `design-taste-frontend` - §0 brief inference and design read, §1 dials, §2 design-system selection and the one-system rule, §4.4 shape consistency, §4.5 interactive states, §4.7 layout discipline, §6.B reduced motion, §6.E DOM cost, §9 tells, §11 redesign protocol (mode: **redesign - preserve**), §13 out-of-scope declaration, §14 pre-flight matrix.
- `redesign-existing-projects` - scan / diagnose / fix sequence, typography and colour and layout and interactivity and content and component and iconography and code-quality audit lists, fix priority order (fonts, then palette, then states, then layout, then components, then states coverage, then polish).
- `high-end-visual-design` - §2 absolute-zero anti-patterns, §3 mobile-collapse overrides, §5 motion choreography (custom cubic-beziers, no `linear`), §6 performance guardrails (blur only on fixed/sticky, grain only on fixed `pointer-events-none`, z-index discipline), §8 pre-output checklist.

---

## 9. Resolution ledger (implementation pass, 2026-10-03)

Every finding, backlog row and §5.5 acceptance criterion, with its disposition. "Fixed" means code
plus a gate; "deferred" carries the reason and the unblocking condition.

Two passes. **Pass 1** (`2793cd6`, `c5ca219`, `43fe078`): the findings that were code-plus-gate on
the audited surfaces, plus the two audit documents themselves. **Pass 2** (this ledger, `89a92b1`
and the resolution commit): the five items pass 1 deferred by name - dark-mode Phase 9, the radius
freeze, the sub-12px type cap, the card-stack tables and the icon-family decision - each executed
against its own unblocking condition rather than re-analysed.

Gates after pass 2: 159 jest suites / 1,681 tests green (2 suites skipped), `tsc` clean on web and
clean inside `apps/mobile`, `check:tokens` 99.8% with the hex ratchet at 492 literals in 51 files
(unchanged - the new code introduced none), `check:design:source` 0 outstanding, `check:brand`
fully tokenised. Three new gates were added by pass 2: `darkTheme` (30 tests), `tableStack` (8) and
`iconFamily` (11).

### Findings

| Finding | Status | Where / why |
|---|---|---|
| P0-1 dark mode half-applied and auto-activating | **Fixed (Phase 9 shipped)** | `useMeridianTheme` is back to `'system'` and the app is dark-complete underneath it: `frontend/src/styles/dark.css` (imported last from `index.css`) re-points the carbon ramp by role, pins the fills that must stay dark (`bg-carbon-90/80/70`, `bg-white`), re-mixes every status ground over the elevated surface, re-points Leaflet chrome and tiles, and pins print paper white via `hn-paper`. `__tests__/darkTheme.test.js` (30 tests) checks the ramp is complete, that every ink × surface pair clears WCAG, that the print sheet and map controls are pinned, and - the gate that matters for rot - that every colour-utility family used in `frontend/src` is either theme-aware or an explicitly declared data encoding. Completing it as a *layer* rather than by rewriting 6,798 utilities is what made it shippable; that trade is recorded in §5.1 of the theme layer's own header. |
| P0-2 web and native disagree about semantic colours | **Fixed (one source, divergences declared)** | `frontend/src/design-system/tokens.ts` is a re-export shim, so there is one `HDS_TOKENS`; `nasaBlueShade` is `#0b3d91` in the package and in the generated CSS; `__tests__/designTokensParity.test.js` asserts identity, then walks ten real roles across web CSS and the native theme. Four divergences are *declared* with a written reason each (crimson `#970002` vs NASA red `#f64137` on two different grounds; their dark twins; Meridian radii vs the HDS 2px control/sheet pins) and the test fails if a declared exception stops diverging, so none of them can rot. The radius half is now closed (backlog 4: one scale, exceptions removed); reconciling the two reds stays a declared, tested divergence, because they sit on different grounds (crimson ink vs NASA hazard fill). |
| P0-3 documented typography is not shipped typography | **Fixed** | `HDS_TOKENS.families`, `MERIDIAN_FONTS`, `--mrd-font-*`, `--font-*`/`--hn-font-*` and the prerendered shell now resolve to platform faces plus the one bundled webfont (`Noto Sans Bengali`); no stack leads with a family the bundle does not ship. `DESIGN_SYSTEM.md` §2-3 and `MERIDIAN.md` §4.2/§9 were describing the fictional pairing and now describe what ships. `__tests__/nasaTokens.test.js` used to assert the family *names* were present and now asserts they are absent and that each role resolves. |
| P1-1 four design systems in one component tree | **Partially fixed; remainder deferred** | The two contradictions this finding produced were removed (two token files, two type stories). Collapsing the four layers themselves (Meridian, NASA HDS, the Tailwind theme, component CSS) is §5.1's migration and touches the 6,343 palette-family uses that currently resolve through them; doing it in the same pass as a colour reconciliation would put the two changes in each other's blast radius. |
| P1-2 radius consistency | **Fixed (one scale, both platforms)** | `MERIDIAN_RADIUS_ROLES` in the package is the single source: `chip`/`xs` 4 · `control`/`sm` 8 · `media`/`md` 12 · `card`/`lg` 16 · `sheet`/`sheet` 28 · `feature`/`xxl` 32 · `pill`/`pill` 9999. The web role tokens in `index.css` are `var()` references to those steps and `NATIVE_RADIUS` spreads the same object, so nothing retypes a number; the eight native literals and the two `PARITY_EXCEPTIONS` entries for radius are gone. `meridianParity` derives each role token from the CSS value, `designTokensParity` freezes the scale (a new step fails), and `nasaTokens` asserts the reference chain. |
| P1-3 token gate blind to hex literals | **Fixed** | `scripts/check-token-compliance.mjs` now measures raw hex literals too, against `data/design/hex-baseline.json` (492 in 51 files): a file may not gain one. `mapPalette.ts` is the documented pattern for a legitimate home for a data colour. |
| P1-4 landing surfaces break the mobile viewport rules | **Partially fixed** | `min-h-screen` → `min-h-dvh` in seven files (iOS toolbars live inside `100vh`), the hero's `100vh`-derived floor is now `lg:min-h-[100dvh]` behind a 600px phone floor, and the standalone `100vh` in the console's map height is `100dvh`. The remaining items (the masthead strip and the multi-blur hero) are grouped with backlog 5. |
| P1-5 157 uppercase-tracking micro-labels | **Deferred** | No mechanical rule separates a section eyebrow from a dense-console field label, and this repository's console chrome is explicitly outside the skill's remit (§13). A blanket sweep would trade one generic signature for illegible data chrome; the honest fix is per-surface and belongs with backlog 13/16, not with a mechanical sweep. |
| P1-6 hover doing work touch cannot | **Fixed on the audited surfaces; wider sweep deferred** | The map's HUD already re-arms on `onTouchStart`, and the one control whose only affordance was `group-hover:opacity-100` (`View Full Resolution`) is now `opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100`. The remaining 35-page sweep is backlog 8's second half. |
| P1-7 tables and forms on mobile | **Fixed (12 tables + 2 editorial renderers)** | `frontend/src/components/ui/CardStackTable.tsx` renders a table's rows twice from one source: the table at `md`+, one card per row below it, with the first cell promoted to the card heading and the rest as a `<dl>` of label/value pairs, so a screen reader hears the column name with each value. It is used by the landing page and every article page (`CardStackTable`) and by 10 console/page files (`CardStackRows`) - 12 tables plus the two editorial renderers, all of which carried content below md. Six tables stay tables, each ledgered with its reason (the map's table view, two print sheets, an upazila toggle whose default view is already the card grid, and two two-column metadata tables that do not scroll at 320px); the alert table already paired its table with a card list, so only the wider-screen branch remains. `data/design/table-stack-baseline.json` ledgers every `<table>` in `frontend/src` with its status and reason, and `__tests__/tableStack.test.js` fails if a new table appears unledgered, a table count drifts, or a conversion is removed. |
| P1-8 two icon families | **Fixed (one family, both platforms)** | The decision is Lucide, and it is executable rather than aspirational: it is the only icon package `frontend/package.json` declares, and it ships plain SVG path data. `data/design/icon-registry.json` holds the decision (family, one stroke, the size scale, 114 names); `scripts/generate-icon-glyphs.mjs` emits `packages/design-system/src/icons.ts` - name → path data, React-free - which web consumes through `lucide-react` and the native shell through `react-native-svg` in `apps/mobile/src/components/Icon.tsx`. The stroke is set once (`svg.lucide { stroke-width: 1.75 }` on web, `ICON_STROKE` on native), never per call site. The former web emoji/arrow/tick substitutes now use registry icons, including generated Leaflet and snapshot HTML through `iconMarkup`; the WMO weather mapping is typed against registered names. `__tests__/iconFamily.test.js` (13 tests) now AST-scans web runtime literals and also checks imports, generated paths, shared renderer parity and native icon props. `MaterialIcon.tsx` (923 lines, hand-authored) remains frozen legacy with an importer ratchet that may only shrink. |
| P2-1 web-only capability inventory | **Accepted as port input** | It describes what the native shell must re-decide; no web change is implied. §5.4 stays as written. |
| P2-2 IA parity (~30 of 52 routes have no native counterpart) | **Deferred** | A product decision, not a web defect; it is what `docs/MOBILE_AUDIT_AND_REDESIGN.md` exists to schedule. |
| P2-3 state coverage partial | **Fixed** | Backlog 13 shipped: the route wrapper and the four-state checklist for all 35 pages, with the defects it turned up fixed (see row 13). The `RunVisual` motion-gate defect found during the first pass is still covered by `frontend/src/components/**/__tests__`. |
| P2-4 micro-issues visible on a phone | **Partially fixed** | Fixed in this pass: emoji, the hover-only control, `dvh`, the notification-bar colour, pure black in the hero. The rest are itemised in backlog 16 (backlog 12's type floor is now closed). |

### Backlog

| # | Status | Note |
|---|---|---|
| 1 | **Fixed** | Phase 9 shipped as `frontend/src/styles/dark.css` + a 30-test gate; `useMeridianTheme` defaults to `'system'` again and the app is dark-complete underneath it. |
| 2 | **Fixed** | One source of hex; the parity test rejects duplicate roles and forbids stale exceptions. |
| 3 | **Fixed** | `.font-inter`/`.font-montserrat` were already gone; the stacks and both documents now tell the truth. |
| 4 | **Fixed** | One radius scale: `MERIDIAN_RADIUS_ROLES` is the source, web tokens are `var()` references to its steps, `NATIVE_RADIUS` spreads it, and the two radius parity exceptions were removed. Freeze test added. |
| 5 | **Fixed** | `dvh` sweep, the hero's CTA/clamp work and the masthead strip are done (`c1e94fe` removed the strip and left a comment where it sat), and the hero carries exactly one blur layer — the pause control's own — with no chart duplicate. |
| 6 | **Fixed, with a gate** | The contrast hack is gone and 19 malformed declarations were repaired; what remains of the count is scoped and gated rather than aspirational: **print 342 / reduced-motion 7 / low-bandwidth 6 / screen 48**, every screen declaration justified by the inline style it has to beat (0 vendor-inline, 0 unverified). `scripts/check-css-important.mjs` + `data/design/important-baseline.json` (`npm run check:important`) fail on an inert screen flag and hold the counts as a ratchet. The print sheet's 342 need a print/PDF comparison to remove, not a stylesheet reading — that is a separate task. |
| 7 | **Fixed** | `@mui/material`, `@emotion/react`, `@emotion/styled` and `@base-ui/react` had zero imports anywhere in the repository outside `package-lock.json`; they are removed from `frontend/package.json` and `package-lock.json` was regenerated with `npm install --package-lock-only --offline`. The lockfile diff is exactly those four packages and their exclusive transitive tree (594 lines removed, no unrelated churn) — verified with the full jest battery green afterwards. |
| 8 | **Fixed (both halves)** | Web: re-measured control by control, every icon-only control carries an `aria-label`; `title=` attributes are extras on text-labelled controls. Native (`73e9e10`): the map's glyph-only controls became one labelled "Map tools" control that opens `MapToolsSheet`, a bottom sheet of labelled rows — recenter (with the state spelled out) and two switches for divisions and alert markers — so nothing on the native map depends on a glyph's meaning. |
| 9 | **Fixed** | 12 tables across 10 files plus the landing page and the article block render one card per row below `md` through `components/ui/CardStackTable.tsx`; `data/design/table-stack-baseline.json` + `__tests__/tableStack.test.js` keep the ledger honest. The console's Map/Table toggle stays the console's own parity mechanism. |
| 10 | **Fixed (web + native gates)** | One family = Lucide, with a shared registry (`data/design/icon-registry.json` → `packages/design-system/src/icons.ts`) so the same glyph serves web and native; `MaterialIcon` frozen with a shrinking-importer ratchet; native emoji/text glyphs replaced; web runtime literals are AST-gated against emoji and text-glyph substitutes. The icon set has 114 registered names. |
| 11 | **Fixed** | The native Advisories screen landed (`ca834b5`): `/advisories` reads the same `@hazardnet/core` protocol dataset the web page does, so the app shows the farmer-facing output rather than a link to the site. |
| 12 | **Fixed** | 369 authored sub-12px occurrences across 46 files → 0, in all five forms (`text-[Npx]`, `font-size: Npx`, `fontSize: N`, `fontSize={N}`, `fontSize: 'Npx'`); native `metadata` is 12/16 and the tab label is 12. One exception, documented in place: the `DistrictRiskMap` SVG label is 3.4 user units in a `0 0 100 100` viewBox (≈12px at render size), guarded by an `svg-user-units:` marker the gate honours. Four assertions in `designTypography` hold the floor. |
| 13 | **Fixed** | `usePageSeo` moved into a route wrapper (`useRouteSeo` + `<RouteMetadata>` above `<Routes>`, so every route — including generated pages and the 404 — gets a head and unknown slugs stay `noindex`). `data/design/four-state-baseline.json` ledgers all 35 pages against loading / empty / error / success with a per-state evidence string, and `__tests__/fourState.test.js` (7 tests) fails if a page is unledgered, a state's block disappears, a page that reads over the network waives its error state, or a non-retryable state loses its reason. Five cells are recorded as `absent` with what the reader sees instead. Defects fixed while filling it in: `HazardsPage`, `DivisionsPage` and `AnalyticsPage` held loading/error state no branch rendered (and `/hazards` + `/divisions` printed the client's built-in 3,062-event default as data — both now state "no archive is loaded"); `AlertDetailPage` and `BlogArticlePage` rendered an unreadable deployment (or a failed slug read) as "not found"; `AlertsPage`, `Blogs`, `BlogArticlePage`, `HazardDetailPage` and `HistoricalCatalogPage` now carry retries; the two remaining emoji inside state blocks are registry glyphs. `HistoricalCatalogPage`'s loading and error states are no longer dark on a light page. The five cells this row recorded as `absent` were rendered in the 2026-10-04 follow-up (see §12) and the ledger now pins `absent: 0`. |
| 14 | **Fixed** | The overlay `::before` is gone (`c1e94fe`): footer links carry the 44px box themselves, so the tap target and the link are the same rectangle and adjacent links no longer overlap. |
| 15 | **Fixed, with a gate** | `scripts/check-prose-dashes.mjs` (`npm run check:prose`) is the lint rule, and it states the policy it enforces: `'—'` survives only as the empty-value glyph, an en-dash range is allowed, everything else in copy is a finding. It scans `frontend/src`, `apps/mobile/src` and committed data under `frontend/public`, decodes `\u2014`-style escapes so a dash cannot hide in JSON, and names the three files it deliberately does not scan (the quoted situation reports, `robots.txt`, `security.txt`). The generator copy and both content files are fixed and regenerated; `generated-routes.json` is down from 424 em-dashes to 21 placeholder glyphs + ranges, and `content-index.json` regenerates clean. |
| 16 | **Fixed** | `64be867`: 23 decorative dots across 17 files deleted, the severity encoders kept, and the two named three-card rows recomposed. `data/design/decorative-signature-baseline.json` + `__tests__/designSignature.test.js` hold both judgements. |
| 17 | **Fixed** | `theme-color` is `#17171b` (carbon-90 — the audit's `#0b0e11` is not a repo token, and this is the colour the surfaces under it actually use); hero `bg-black/40`/`bg-black/60` are `bg-carbon-90/40`/`bg-carbon-90/60`. |
| 18 | **Fixed** | `hazardnet.savedDistricts` is the written key; `shonchay_saved_districts` is read once so no saved district is lost, and never written again. |

### Residuals after this pass

> **Status note (2026-10-04):** the first three bullets below are closed and the fourth is
> superseded. See §12 for what closed them and §11 for the iconography closeout.

- **Web iconography residual — closed (2026-10-04).** A refreshed TypeScript-AST scan of runtime `.ts`/`.tsx` under `frontend/src` finds **0 emoji/text-glyph candidates in 0 files** (comments and test sources are excluded; legal marks such as ©, ® and ™ remain valid copy). This covers the full frontend, not only the 35 page components: directional and status glyphs were replaced with registered Lucide icons, WMO weather codes now carry typed registry names, and Leaflet/map-export HTML serializes the generated shared path data through `iconMarkup`. The 20/79 figures above this section were historical pre-chatbot measurements and are superseded. `__tests__/iconFamily.test.js` now performs the AST scan and includes 13 passing icon-family checks.
- ~~Five four-state cells are absent~~ **Closed (2026-10-04).** The five cells are rendered states now: the console's district read separates "no stored coverage" (empty) from a retryable read failure (error) through `forecastViewState`; the account dashboard's `profileStatus` separates "no profile document" (empty, with the create action) from a failed read (error, with retry); `/archive` states that the loaded artifacts hold no rows; and a published post with no body copy says so instead of rendering a blank column. `data/design/four-state-baseline.json` records all five with evidence and `__tests__/fourState.test.js` pins `absent: 0`.
- ~~`frontend/public/data/climatic_hazards_summary.json` has no producer in this repository~~ **Closed (2026-10-04).** `scripts/build_climatic_hazards_summary.mjs` derives the artifact from `hazard-catalog-index.json` (the exact 3,062 cleaned rows the archive page reads) plus `hazardnet_forecasts_latest.json`, mapping districts to divisions through the canonical `DISTRICT_REGISTRY`; it runs as the first step of `npm run build:frontend`, `npm run build:events-summary` regenerates it, and `npm run check:events-summary` fails when it drifts. `__tests__/climaticHazardsSummary.test.js` (3 tests) checks the breakdowns sum to the catalog total and that the committed file equals a fresh build. The 3,062 fallback constants in `eventsClient.ts` are gone: an unavailable archive is now an explicit zero/empty sentinel, so a page that shows nothing can no longer be quoting invented numbers.
- ~~The landing audit's three residuals stand~~ **Closed (2026-10-04),** with the one part that genuinely needs hardware moved into a script: the phone hero now carries an evidence pointer inside the first viewport, four 768×1376 portrait renders replace the 354×768 crops, the safe-area arithmetic was verified by driving `--navbar-height` to `calc(3.5rem + 47px)` and measuring the four surfaces move with it, and the notched-device rows live in `docs/audits/2026-10-04-device-verification-script.md`. See §12.

### §5.5 acceptance criteria

1. **No table as primary content below 768px** — **met**. The landing page and every article page
   render through `CardStackTable`; 12 further tables across 10 files render one card per row below `md`.
   The console's Map/Table toggle stays the console's own parity mechanism (the map *is* the phone
   view); the print sheets are print-only; the upazila table is a toggle whose default view is the
   card grid; the two tables left on `/status` are two-column metadata that does not scroll at
   320px. Each of the six is named in the ledger with its reason. `__tests__/tableStack.test.js` holds the
   ledger; `data/design/table-stack-baseline.json` names every remaining `<table>` and its reason.
2. **No interactive element relies on `hover` or `title`** — **met**: zero icon-only controls are
   unnamed; the one hover-only affordance found is visible on touch; `title` remains only as an
   extra hint on labelled controls.
3. **Loading, empty, error+retry on every screen** — **met (2026-10-04)**. Backlog 13 shipped the
   checklist and the defects it surfaced; the five cells it still recorded as `absent` are rendered
   states as of §12, and `__tests__/fourState.test.js` pins `absent: 0` so the claim cannot rot.
4. **Light and dark complete at 100% token parity** — **met by the theme layer**. `dark.css`
   re-points the carbon ramp by role, pins the fills that must stay dark, re-mixes the status
   grounds over the elevated surface, and re-points Leaflet and the native controls; the radius
   scale is one object; every semantic role on both platforms resolves through them. The gate is
   the coverage test, not a promise: any palette family used in `frontend/src` that is neither
   theme-aware nor a declared data encoding fails `darkTheme`.
5. **Every text role survives the font-scale cap** — **met**: the floor is 12px, measured at 0
   authored occurrences below it, with the one documented SVG user-unit exception.
6. **One icon vocabulary, no emoji/glyph substitutes, one radius scale, one type scale, one source of hex** — **all six met and gated**: one icon vocabulary with a shared web/native registry (`iconFamily`); an AST gate against pictographic emoji and UI arrows/checks/shapes in web runtime literals plus registry-name checks for native icons; one radius scale (`meridianParity` + `designTokensParity` freeze); one type scale (`nasaTokens` across the package, the CSS and the prerendered shell); one source of hex (`designTokensParity` + the hex ratchet); and one type-size floor (`designTypography`).

### Not done in this pass, and why it is not hidden

> **Superseded 2026-10-04:** every item this paragraph left open (backlog 5/6/8/11/13/14/15/16 and
> the landing audit's §8 rows) was executed in the follow-up recorded in §12, against the reason its
> row had written. The paragraph is kept because it states the rule the follow-up followed.

Everything above marked "deferred" is a scheduling decision with a reason, not a claim of
completion, and it stays deferred until someone un-defers it by name: backlog 5/6/8/11/13/14/15/16
and the landing audit's own §8 rows. Pass 2 took the five the fourth request named - dark mode
(Phase 9), the radius freeze, the type cap, the card-stack tables and the icon family - and closed
each one against the unblocking condition its ledger row had written. Four unused dependencies were
removed (backlog 7) once it turned out the lockfile could be regenerated offline.

---

## 10. Native design-system follow-up (2026-10-04)

This follow-up adds the Expo product app as a first-class renderer in the audit; it does not
retroactively change the 2026-10-03 web measurements or claim that every web route has a native
counterpart. Native layout, typography and interaction are evaluated as React Native behavior, not
as CSS-pixel parity. The linked Apple design reference is applied as a visual/accessibility lens,
not represented as official HIG certification.

**Implemented in `apps/mobile`:**

- Native light/dark semantic roles now resolve to Meridian; OLED and increased-contrast modes are
  explicit, and warning/information/severe states keep distinct semantic treatment. Native text and
  on-fill status contrast, the shared type roles, and the 48dp control floor are covered by
  `nativeMeridianParity.test.tsx`.
- Large Text and Bold Text preferences affect shared text roles without capping OS text scaling;
  Reduce Motion is read from both the OS and the in-app preference. Safe-area tab geometry and
  labelled controls remain native adaptations, not web layouts ported verbatim.
- Screen-reader names and touch affordances were tightened across map tools, saved-place actions,
  onboarding, alert swipe actions, article links and the foreground notification banner. The banner
  content and its dismiss action are separate targets; external article links expose link semantics.
- Navigation tab labels, More rows and More article titles use locale strings. The generic More-row
  accessibility hint is now translated in English and Bengali (`more.openHint`); hard-coded English
  was removed from that hint. This does not imply that every mobile string or article body is fully
  localized.
- Existing product behavior and destinations were retained; the pass changes semantics and native
  presentation rather than converting the app into a marketing-page template.

**Validation after the follow-up:**

- `npm test -- --runInBand --forceExit`: **164 suites / 1,728 tests passed**.
- `npm --prefix apps/mobile run test:rn -- --runInBand --forceExit`: **11 suites / 82 tests passed** (including the English/Bengali More-row hint regression).
- `npm run lint` and `npx tsc --noEmit -p apps/mobile/tsconfig.json`: both passed.
- `npm run build:frontend`: passed; **99 routes** prerendered. `npm run check:paths`: **198 documents**, no repository-local paths.
- `npm run check:design`: **0 new findings** across source and 198 prerendered documents; the existing baseline still contains **3,236 outstanding** findings (0 waived), with 203 entries now fixed. This is a passing ratchet, not a claim that the detector has no findings.
- `npm run check:tokens`: **99.8%** token resolution, hex count unchanged at 492; `npm run check:fonts`: one Bengali WOFF2 face at **43.31 KiB / 50 KiB**; bundle, brand palette, icon registry, prose and `!important` checks passed.

**Updated 2026-10-04 — what is now automated, and what still needs a device.** Four of those five
were converted where a machine can hold them. `apps/mobile/__tests__/deviceConditions.test.ts` (4
tests) now fails the build when safe-area handling moves out of the shell primitives, when
`allowFontScaling={false}` appears, when text stops going through the shared `Text`, when Reduce
Motion stops being read from the one hook, or when the tab labels and the More-row hint lose either
locale. Native contrast, type roles, the 48dp floor and the Large/Bold preferences were already
pinned by `nativeMeridianParity`. The web side of the same class of check is emulated and measured in
`docs/audits/2026-10-04-device-verification-script.md` §1 (safe-area propagation through
`--navbar-height`, the first viewport on three phone sizes, text scaling at 125% and 150%).

What a machine here genuinely cannot answer is a short, named list, and it is now a script with
expected results rather than a sentence: VoiceOver and TalkBack traversal order, Bengali glyph
shaping under the platform fallback font, notched / gesture-navigation / foldable safe areas, and map
compositing on a 2 GB Android. `docs/audits/2026-10-04-device-verification-script.md` §2 is that
script, with the device matrix to fill in. The app remains a distinct product surface and is not
evidence that the full web route inventory has been ported.

**Mobile localisation is partial and measured, not vague:** 109 of the 191 English keys have Bengali
copy. The navigation chrome (tab labels, screen titles, the generic More-row accessibility hint) is
complete; the remainder is the settings/sheets/report surface listed by key prefix in
`bn.ts`. `deviceConditions.test.ts` pins the translated count so it can only grow.

## 11. Web iconography residual closeout (2026-10-04)

The residual count in §5 was measured before the chatbot simplification and is retained only as historical context. This follow-up re-scanned the current working tree with the TypeScript parser rather than relying on raw Unicode grep, so comments and test descriptions are not mistaken for visible UI. The refreshed scan covers all runtime `.ts`/`.tsx` under `frontend/src` and reports **zero emoji/text-glyph candidates in zero files**; ©, ® and ™ remain legal copy, not icon substitutes.

- Visible page and component affordances now use the registered Lucide family: status checks, sort direction, navigation/external links, contact details, profile attributes, map/export labels, report actions, weather conditions and empty/error states.
- `wmoWeatherCodes` no longer stores emoji; its icon values are a typed subset of the registry. Both compact and detailed weather surfaces render a shared `WeatherIcon` component.
- Leaflet strings and map snapshot markup use `iconMarkup`, which serializes only generated `ICON_PATHS` data. It adds no second package and defines no hand-authored paths.
- The shared registry now contains **114** names. The existing generator produced the paths, and the existing native icon renderer supports the emitted SVG tags.
- `__tests__/iconFamily.test.js` now AST-scans web JSX text, string literals and template segments for emoji/pictographic, directional, check and shape glyphs; it ignores comments/tests and allows legal marks. This sits alongside the existing registered-import, generated-path, stroke/size and native-icon checks.

**Validation after this closeout:**

- `npm run lint` and `npx tsc --noEmit -p apps/mobile/tsconfig.json`: passed.
- `npm run build:frontend`: passed; **99 routes** prerendered. The existing Vite `inlineDynamicImports` deprecation warning remains non-blocking.
- `npm run icons:check`: generated `icons.ts` matches the registry and installed `lucide-react`.
- `npm run check:tokens`: **99.8%** token resolution; raw hex literals remain at the 492-file baseline (**492 literals / 51 files**).
- `npm run check:design`: **0 new findings** across 198 documents plus `frontend/src`; the existing baseline remains 3,236 outstanding (0 waived).
- `npm test -- --runInBand --forceExit`: **164 suites / 1,729 tests passed**.
- `npm --prefix apps/mobile run test:rn -- --runInBand --forceExit`: **11 suites / 82 tests passed**.

This closed the iconography residual. The items it left standing were closed on the same day in the
follow-up recorded in §12.

---

## 12. Residual closeout (2026-10-04)

The three items §9 still carried - five four-state cells, the missing summary artifact, the landing
audit's three residuals - plus the native device-verification note in §10, are closed in this pass.
Each was closed against the reason its own row had written; nothing was re-analysed or waived.

### 12.1 The summary artifact now has a producer

`scripts/build_climatic_hazards_summary.mjs` derives
`frontend/public/data/climatic_hazards_summary.json` from the exact artifacts the archive pages
read:

- `frontend/public/data/historical/hazard-catalog-index.json` - the 3,062 cleaned event rows - is the
  numerator of every count, so the summary and `/archive` cannot disagree;
- divisions are resolved through `backend/utils/advisoryMapper.js`'s `DISTRICT_REGISTRY` (the
  canonical 64-district table), not a second hand-copied map;
- `frontend/public/data/hazardnet_forecasts_latest.json` supplies the coverage counts, so
  `activeForecastsCount` / `forecastDistrictsCount` mean "rows the published run contains" rather
  than the closed 7- and 15-day unit total the API reports;
- the build fails loudly on an unmapped district, a missing date or an empty catalog, so a bad
  artifact cannot be committed quietly.

Current output: **3,062 events · 2000-2026 · 64 districts · 8 divisions · 9 hazards**, hazard and
division breakdowns each summing to 3,062, `topDistricts` in descending order with the district's
division named, a 27-year `yearlyTrend` and a twelve-month `monthlyDistribution`.

Gates and wiring:

- `npm run build:events-summary` regenerates it; `npm run check:events-summary` fails on drift; the
  frontend build runs the generator first, so every deploy ships an artifact matching its own data.
- `__tests__/climaticHazardsSummary.test.js` (3 tests) checks the derived shape on a synthetic
  catalog, checks alias/error handling, and asserts the committed file equals a fresh build of the
  committed catalog.
- The 3,062-event fallback constants in `frontend/src/lib/eventsClient.ts` are deleted. An
  unavailable archive now returns an explicit zero/empty sentinel tagged `source: 'fallback'`, and
  `/hazards` + `/divisions` render their empty state instead of headline numbers nobody measured.
  `__tests__/eventsClient` coverage and the four-state ledger both describe that state.

### 12.2 The five four-state cells are rendered states

| Cell | Was | Is |
|---|---|---|
| `Dashboard` empty | absent - "a zero-count strip" | `uncovered`: the console asked for a district and horizon the published forecast archive has no row for. The district read goes through `fetchStoredPrediction`'s typed reason (`404 → uncovered`), and the panel says which district has no stored coverage while the map and the static baseline stay on screen. |
| `Dashboard` error | absent - "a toast" | `error` with retry: any other failure (offline, rate-limited, server, malformed payload) renders the page's retry control, which re-runs the same district read. |
| account dashboard empty | absent - "no distinct state" | `profileStatus === 'missing'`: signed in with no `profiles/<uid>` row. The page says so and offers "Create my profile", which writes the same seed document a first sign-in would (`ensureProfile`). |
| account dashboard error | absent - "degrades silently" | `profileStatus === 'error'`: the read failed, the page says so and offers retry via `refreshProfile`, and stops rendering a half-filled dashboard as if it were the profile. |
| `/archive` empty | absent | The five artifacts loaded with zero rows: the page states that its archive is empty above the (empty) ranking, charts and catalog. |
| `/blogs/:slug` empty | absent | A published post with no body copy keeps its title, excerpt and byline and states that the body is empty, instead of rendering a blank column. |

`data/design/four-state-baseline.json` carries all six as ledgered states with the evidence string
each one renders, and `__tests__/fourState.test.js` pins `absent: 0` for both the shape counts and
the per-state "who is still missing one" check, so the checklist cannot silently return to "deferred".

### 12.3 The landing audit's three residuals

Detailed in `docs/audits/2026-10-03-landing-live-hero-audit.md` §8 (updated in place). Summary:

- **Proof card above the fold (H-P1-3).** The card stays where it is - after the action, which is
  the page's own hierarchy - and the phone hero now carries one evidence pointer directly under the
  primary CTA that quotes the card's own text, links to it, and is only rendered below `sm`. Measured
  on emulated 390×844 DPR 3: H1 169px, CTA 427px, pointer 583px, proof card 917px - so claim, action
  and one checkable fact all sit in the first viewport. The same measurement at 360×740 and 430×932
  lands inside the fold as well. The phone hero's vertical budget was tightened to pay for it
  (padding 44 → 20px, grid gap 8 → 6, standfirst clamp 3 → 2 lines, CTA gap 28 → 20px); the wide
  layout is untouched.
- **Hero art (L-P2-4).** Four 768×1376 portrait renders of the same scenes ship alongside the
  landscape frames, selected by `@media (max-width: 639px) and (min-resolution: 2dppx)` with the
  original 354×768 crops as the DPR 1 fallback - 1.97 px/CSS px at the 390×844 hero instead of 0.45,
  112-221 KB per slide instead of 124-213 KB for a frame that was 75% cropped away. The prerendered
  head preloads the file the phone paints, and `HeroImageCarousel`'s preload probe now asks which URL
  the viewport will actually paint (`paintedUrl`, resolved through the media-scoped custom property)
  instead of probing the landscape `src` and downloading both. A network trace at 390×844 DPR 3
  requests the four portrait files and no landscape frame.
- **Notched-device arithmetic (V-P1-2).** Verified by propagation rather than by a device: driving
  `--navbar-height` to `calc(3.5rem + 47px)` on an emulated phone moved the hero's top padding
  76 → 123px and the console header's 64 → 111px - exactly the inset, on both surfaces - with no
  horizontal overflow. The rows that genuinely need hardware (notch, gesture navigation, foldable)
  are steps 1 and 9 of `docs/audits/2026-10-04-device-verification-script.md`.

### 12.4 Native device verification, converted where a machine can hold it

`apps/mobile/__tests__/deviceConditions.test.ts` (4 tests) and the script above replace the
open-ended sentence with checks and steps. Automated: safe-area handling confined to the shell
primitives (and the provider at the app root), no `allowFontScaling={false}` anywhere, all text
through the shared `Text` component, Reduce Motion reached from one hook, tab labels and the More-row
hint present in both locales, and the Bengali key count pinned (109 of 191, may only grow). Scripted:
VoiceOver/TalkBack traversal, Bengali shaping on device, safe areas across navigation modes and
foldables, low-end map compositing, and the web safe-area/scaling rows.

### 12.5 Validation after the closeout

- `npm test -- --runInBand --forceExit`: **165 suites / 1,732 tests passed** (includes the new
  `climaticHazardsSummary` suite and the updated four-state gate).
- `npm --prefix apps/mobile run test:rn -- --runInBand --forceExit`: **12 suites / 86 tests passed**
  (includes the new `deviceConditions` suite).
- `npm run lint` and `npx tsc --noEmit -p apps/mobile/tsconfig.json`: both clean.
- `npm run build:frontend`: **99 routes** prerendered; the generated summary artifact is copied into
  `dist/data/`; the phone preload points at the portrait render.
- `npm run check:device` (tokens 99.8% with the hex ratchet unchanged at 492 in 51 files, prose
  dashes clean, `icons:check`, `check:events-summary`, `check:important`): all pass.
- `npm run check:design`: **0 new findings** across 198 documents plus `frontend/src`; the existing
  baseline remains 3,236 outstanding with 203 entries now fixed.
- `npm run check:bundle` PASS (1,354.7 kB gzip), `npm run check:paths` 198 documents clean,
  `npm run check:brand` fully tokenised, `npm run check:fonts` 43.31 KiB / 50 KiB.
- Emulated-device measurements (Chromium, 360×740 / 390×844 / 430×932 DPR 3, `/` and `/live`):
  recorded in `docs/audits/2026-10-04-device-verification-script.md` §1.

### 12.6 What is still open

Nothing in this audit's ledger. Two things are out of its scope and are recorded rather than claimed:

- the mobile translation backlog (82 English keys with no Bengali copy, all outside the navigation
  chrome) and the mobile IA gaps are product/content work scheduled in
  `docs/MOBILE_AUDIT_AND_REDESIGN.md`;
- the hardware rows in the device-verification script are unverified until someone with the listed
  devices fills in its table.

### 12.7 Live-map simplification (2026-10-05)

Not a ledger row of this audit, recorded here because the change removes surfaces the audit's
disciplines exist to police. The live console (`/live`) carried a "+" hazard-actions menu that
opened seventeen options at once and a basemap switcher offering six tile providers; the choice
changed nothing a reader needed and spent their attention on it. Both are gone:

- the map ships a single OpenStreetMap ground (`useLeafletMap.MAP_LAYERS` holds one entry; the
  Esri/CARTO/OpenTopoMap providers, the toolbar chips, the layer-modal provider grid and the
  mini-map switcher in `ui/expand-map.tsx` were deleted with it);
- zoom is Leaflet's native control, already styled at 44px in `index.css`, which had never been
  switched on because zoom lived inside the "+" menu;
- three separate buttons replace the menu — My location, Filters, Overlays — one job each,
  opaque white, 44px targets, the HUD's standing rules;
- deleted with the menu: the "sync live telemetry" action that simulated a satellite handshake,
  the 3D tilt, compass reset, fullscreen toggle and overview reset, and the field-report form
  that said "logged" while persisting nothing — a claim without an artifact, the one thing this
  repository's rules exist to forbid;
- what stays is what HazardNet is for: district polygons and forecasts, hazard layers, horizon
  and search, the table view, and the OSM attribution the map's licence requires. (The offline
  tile store named here at first was itself removed in §12.8 the same day.)

`MapToolbar.test.tsx` pins the absence of a basemap switcher; 1755 tests, the token/prose/
claims/paths/design gates and the build are green.

### 12.8 OSM tile-policy compliance and the second live-map simplification (2026-10-05)

The map started showing OpenStreetMap's "Access blocked" interstitial (osm.wiki/blocked). The
cause was the app, not the servers: `createCachedTileLayer` double-fetched every tile into an
IndexedDB store, and the "Offline Emergency Tile Store" bulk-downloaded all of Bangladesh
(zooms 6-9) plus district packs (zooms 7-11). Both are exactly what the volunteer-run tile
servers' usage policy prohibits. The fix is structural, not a header tweak:

- `frontend/src/services/tileCacheService.ts`, `frontend/src/hooks/useTileCache.ts` and every
  pre-cache entry point were deleted; the map now uses a plain `L.tileLayer` and relies on the
  browser's ordinary HTTP cache, which honours the tile servers' own cache headers;
- the service worker (`frontend/public/serviceWorker.js`) no longer intercepts cross-origin
  tile requests at all and deletes the legacy `hazardnet-tiles-v1` cache on activation, so
  devices that stored tiles shed them on the next visit; `__tests__/serviceWorker.test.js`
  pins both behaviours;
- the Dashboard settings view no longer advertises an offline tile cache; it states the policy
  plainly and keeps only the purge action for app-shell caches.

Two invented-data surfaces died with it, under the same honesty rule as §12.7: the "Doppler
radar" overlay (three hard-coded storm cells labelled 45-52 dBZ that measured nothing) and its
legend, and the popup `onclick` hooks that called a global `window.selectHazardDistrict` no
component registered. The GPS and stored-pin popups were rebuilt to title, coordinates,
accuracy and district, because the previous multi-panel HTML was unreadable at phone widths;
the filter modal is now a bottom sheet with 44px targets; the capture-and-share export modal
became a one-click PNG download; the three control buttons are fixed 48px circles raised above
the bottom pill so they never collide at narrow viewports.

The map palette shrank to what the map draws: `MAP_SENSOR_SITES` is gone, and the heat
gradient kept its shipped colours under the honest name `MAP_HEAT_RAMP`
(`__tests__/mapPalette.test.js` pins the values and the absence of the old groups).

### 12.9 Basemap ground moved from tile.openstreetmap.org to OpenTopoMap (2026-10-05)

Follow-up to §12.8. Making the app compliant did not make the map render: OpenStreetMap's
tile servers were returning their "Access blocked" interstitial to this deployment, because
an earlier build had bulk-downloaded their tiles and the resulting IP block persists — an
enforcement that no code change can lift. Rather than fight a block we cannot clear, the
single basemap moved to OpenTopoMap:

- OpenTopoMap renders OpenStreetMap data on separate infrastructure, needs no API key, and
  is free for on-demand use, so the map renders again immediately;
- tiles are still loaded on demand through a plain `L.tileLayer` and the browser HTTP cache
  only — nothing about the §12.8 compliance work was undone, and no offline/bulk storage
  returned with the new provider;
- attribution keeps the OpenStreetMap copyright ODbL requires and adds the OpenTopoMap style
  credit (CC-BY-SA); the attribution card on `/live`, the layers panel's "Basemap" row, the
  Dashboard storage card, and the `expand-map` mini-map all name the new ground;
- the layer key moved `osmStandard` → `topoMap`; the dark-theme hook `hn-tile-topoMap`
  already existed in `frontend/src/styles/dark.css`, so dark mode needed no new rule.

OpenFreeMap was considered as the primary alternative but ships vector tiles only, which
would have meant adding MapLibre GL and reworking the heat/overlay stack; it stays a
candidate follow-up rather than this change.
