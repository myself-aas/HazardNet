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
