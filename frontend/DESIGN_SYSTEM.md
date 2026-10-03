# HazardNet Global Design System (HDS v2.2)

> **Official Design System Specification for HazardNet Frontend & React Native Mobile Migration.**  
> Governed by NASA Horizon Design System (HDS) core principles, WCAG AAA accessibility, mobile-first interaction ergonomics, and Bengali + Latin bilingual typography.

---

## 1. Core Principles

1. **Mobile-First Ergonomics**: Every surface, control, and layout is built from mobile viewports up, directly preparing the web codebase for transition to native mobile (React Native / Expo).
2. **Strict Tap Targets**: All interactive elements (buttons, form inputs, navigation links, icons) must satisfy a minimum tap target of `44px × 44px` with `touch-action: manipulation` enabled to eliminate mobile tap latency.
3. **Zero Mobile Bottom Navigation**: HazardNet strictly uses a high-performance, swipe-capable header navigation + full drawer architecture (`MenuDrawer.tsx`) rather than a fixed bottom tab bar.
4. **Bilingual Typography Harmony**: one platform UI face for Latin, and `Noto Sans Bengali` — the single webfont this bundle ships (`@fontsource/noto-sans-bengali`, 400 + 700) — for Bengali, which Latin system faces cannot render. The earlier pairing (`Instrument Sans`, `Plus Jakarta Sans`, `Inter`, `Anek Bangla`, `Baloo Da 2`) was never bundled, so the stacks only rendered differently on machines that happened to have one installed; see P0-3 in `docs/audits/2026-10-03-frontend-design-system-audit.md`.
5. **Rigorous Color & Contrast Semantics**: Powered by NASA HDS tokens. All foreground-on-background combinations meet or exceed WCAG AA (`4.5:1` normal text) and WCAG AAA (`7.0:1` small text/icons).

---

## 2. Token Architecture & Theme Definition

The design system is structured in three clear layers within [`frontend/src/index.css`](file:///g:/HazardNet/WebApp/Github/HazardNet/frontend/src/index.css):

### Layer 1: Primitives (`:root`)
- **Brand palette** (the two colours the mark is painted in — red is primary, ink is secondary):
  - `--hn-brand-red`: `#970002` (brand crimson — the mark's bars. Navigation CTAs, critical alerts)
  - `--hn-brand-red-dark`: `#7B1D21` (the mark's dark crimson. High-contrast CTA fills — `10.3:1` against white)
  - `--hn-brand-ink`: `#0D0D0D` (the mark's near-black — `19.4:1` on white)
- **NASA HDS Palette** (the rest, at NASA's published values):
  - `--hn-hds-red`: `#970002` — routed through `--hn-brand-red`, so the product matches the mark
  - `--hn-hds-red-tint`: `#ff5c52` (deliberately still NASA's: dark grounds need `6.9:1`, and a tint of `#970002` would only reach `3.6:1`)
  - `--hn-hds-red-shade`: `#7B1D21` — routed through `--hn-brand-red-dark`
  - `--hn-hds-blue`: `#1c67e3` (On-page controls, information, interactive triggers)
  - `--hn-hds-blue-shade`: `#0b3b95` (`9.9:1` against white — accessible links)
  - `--hn-hds-surface`: `#f6f6f6` (Application canvas background)
  - `--hn-hds-line`: `var(--hds-color-carbon-20)` (Hairline dividers, card borders)
  - `--hn-hds-ink`: `#0D0D0D` — routed through `--hn-brand-ink` (Primary body text — `19.4:1` on surface)
  - `--hn-hds-ink-soft`: `var(--hds-color-carbon-60)` (`7.1:1` on white — accessible secondary text)

### Layer 2: Semantic Tokens
- `--primary`: Action / Navigation (`--hn-hds-red`, i.e. the brand crimson `#970002`)
- `--primary-strong`: Filled controls that must read as "stronger" (`--hn-hds-red-shade`)
- `--secondary`: Surface sunken controls
- `--accent`: On-page interaction (`--hn-hds-blue`)
- `--destructive`: Danger / Emergency (`--hn-hds-red-shade`)
- `--border`: Semantic hairline (`--hn-hds-line`)

### Layer 2b: Palette Families (`@theme inline`)

Every Tailwind palette family the app uses is declared in `@theme inline` so it
resolves to a HazardNet token instead of Tailwind's stock palette. Declared:
`carbon`, `amber`, `gray`, `neutral`, `slate`, `stone`, `zinc`, `chart`, plus
`rose`, `red`, `emerald`, `teal`, `blue`, `sky`, `cyan`, `yellow`, `orange`.

Shades are aliased by **role, not hue** — 50–200 surfaces, 300–400 borders,
500–600 solid fills, 700–950 text — following the `--success` / `--warning` /
`--info` precedent:

| Family | Surface | Border | Solid | Text |
|---|---|---|---|---|
| `rose`, `red` | `--destructive-surface` | `--destructive-border` | `--destructive` | `--destructive` |
| `emerald` | `--success-surface` | `--success-border` | `--hn-emerald-600` | `--success` |
| `teal` | — | `--hn-teal-500` | `--hn-teal-600` | `--hn-teal-700` |
| `blue`, `sky`, `cyan` | `--info-surface` | `--accent-border` | `--accent` | `--info` |
| `yellow`, `orange` | `--warning-surface` | `--warning-border` | `--hn-amber-500` | `--warning` |

**`indigo` and `purple` are deliberately not declared.** Their uses are data
encodings — weather-phenomenon colours (`NationalOverview.tsx:54-56`) and chart
series indices (`DisasterDetailModalUI.tsx:320`) — not status semantics. No HDS
hue ramp exists for them, and aliasing them onto `--accent` would render two
chart series the same colour. They remain Tailwind stock by choice, not by
oversight.

**Primary action surfaces** use `bg-primary` / `bg-primary-strong`. `bg-nasa-red`
and `bg-nasa-red-shade` resolve to the identical values (`--hn-brand-red` /
`--hn-brand-red-dark`) and survive only on non-action surfaces — status badges,
decorative rules, skeletons and carousel dots — which Session 5 converts to
severity tokens.

Verify with `npm run check:tokens` (gate ≥90%; currently 99.8%) and
`__tests__/tokenCompliance.test.js`, which fails if a declared shade is ever
pointed back at a raw hex.

### Layer 3: Typography Stacks (`@theme inline`)
```css
/* Every family below is either bundled or a platform face. NASA's own 'Public Sans Web' /
   'Inter' / 'DM Mono' are not bundled by this build and are deliberately not aliased here. */
--font-sans: var(--font-sans-en);        /* system-ui, -apple-system, 'Segoe UI', Roboto, … */
--font-heading: var(--hn-font-heading);  /* system-ui, … */
--font-display: var(--hn-font-display);
--font-brand: var(--hn-font-heading);
--font-bengali: var(--hn-font-bengali);  /* 'Noto Sans Bengali', 'Hind Siliguri', sans-serif */
--font-bengali-display: var(--hn-font-bengali-display);
--font-mono: var(--hn-font-mono);        /* ui-monospace, SFMono-Regular, Menlo, … */
```

---

## 3. Typography Guide & Usage Matrix

| Role | Font Family | Tailwind Class | Recommended Usage |
| :--- | :--- | :--- | :--- |
| **Headings (h1–h6)** | Platform UI face | `.font-heading` or native `h1–h6` | Page titles, section headers, dialog titles |
| **Hero / Display** | Platform UI face | `.font-display` | Big metrics, landing page hero statements |
| **Brand Wordmark** | Platform UI face | `.font-brand` | HazardNet logo, primary identity marks |
| **Body & UI** | Platform UI face / Noto Sans Bengali | `.font-sans` | Paragraphs, tables, input fields, badges |
| **Bengali Primary** | Noto Sans Bengali / Hind Siliguri | `.font-bengali` | Bengali locale text, localized hazard alerts |
| **Bengali Display** | Noto Sans Bengali / Hind Siliguri | `.font-bengali-display` | Bengali hero titles, campaign banners |
| **Data / Numbers** | Platform mono stack | `.font-mono` / `.hn-data-readout` | Coordinates, timestamps, severity scores |

*Note: All body-scale typography strictly maintains `line-height >= 1.3` in accordance with `__tests__/designTypography.test.js`.*

---

## 4. Mobile & Touch Target Standards

### Global Rules:
- All `<button>`, `[role="button"]`, and form submission inputs automatically inherit:
  - `min-height: 44px`
  - `min-width: 44px`
  - `touch-action: manipulation`
- Utility class `.tap-target` is available for icon-only buttons or inline links that require the standard 44px hit-box:
  ```html
  <button class="tap-target p-2 rounded-control border border-carbon-20">
    <MenuIcon className="w-5 h-5" />
  </button>
  ```
- **Header Logo Standardization**: The primary logo brand link in both mobile and desktop views is strictly sized to `h-11` / `min-h-[44px]` with `py-1.5 px-2` to clear the 44px tap target gate.
- **Content & Footer Link Touch Expansion (`.touch-target-link`)**: Compact text links in content or footers expand their hit area vertically to 44px via `::before` pseudo-element without stretching font size or breaking tight layout rhythm.
- **Accessible Caption Contrast (> 7:1 WCAG AAA)**: Elements smaller than 14px (`text-xs`, captions, tags) enforce `text-carbon-80` (`#2e2e32`), exceeding the 7:1 WCAG AAA normal text standard on white surfaces.

### Responsive Navigation Threshold:
- Breakpoint threshold for mobile/webview vs desktop is set at `xl` (`1280px`):
  - `< 1280px`: Compact mobile header with branded logo, search, and hamburger trigger to `MenuDrawer.tsx`.
  - `≥ 1280px`: Full expanded horizontal navigation bar.
- Prevents header link wrapping, truncation, and layout collapse between 1024px and 1180px.

---

## 5. Reusable Global Component Classes

Defined in `frontend/src/index.css` for instant reusability across any page:

### Buttons
- **Primary CTA (`.hn-btn-primary`)**:
  - High-contrast red shade (`#b60109`), hover transition, 44px min-height, the `control` radius (`var(--mrd-radius-sm)`, 8px), semibold 600 weight, `-0.01em` tracking.
- **Secondary Action (`.hn-btn-secondary`)**:
  - NASA blue (`#1c67e3`), hover transition to blue shade, 44px min-height, `control` radius, semibold 600 weight, `-0.01em` tracking.
- **Outline Button (`.hn-btn-outline`)**:
  - Crisp border on carbon line, white background, hover fill, `control` radius, semibold 600 weight, `-0.01em` tracking.
- **Ghost Button (`.hn-btn-ghost`)**:
  - Transparent background, hover tint, 44px hit-box, `control` radius, semibold 600 weight, `-0.01em` tracking.

### Button Typography & Font Weight Standardization:
- All buttons and interactive triggers (`button`, `[role="button"]`, `.hn-btn-*`, `.hn-nav-link`) standardize strictly to `font-weight: 600` (Semibold) with subtle `letter-spacing: -0.01em`. This eliminates inconsistent mixes of 600 and 700, making buttons and navigation controls crisp, authoritative, and visually unified.

### Surface & Cards
- **Base Card (`.hn-card`)**:
  - Pure white background, `1px solid var(--hn-hds-line)`, `control` radius (`var(--mrd-radius-sm)`).
- **Elevated Card (`.hn-card-elevated`)**:
  - Subtle 4px soft shadow, hover transition for interactive cards, `card` radius (`var(--mrd-radius-lg)`).

### Footer Architecture & Typography Standardization:
- **Link Color & Weight**: All footer navigation links standardize strictly to Carbon-80 (`#2e2e32`, `text-carbon-80`) with Medium 500 weight (`font-medium`). This prevents inconsistent mixes of carbon-60, carbon-80, and white.
- **Font Size**: Standardized to `13px` (`text-[13px]`) across all 27 footer links for a balanced typographic hierarchy between body text and secondary navigation.
- **Hover Interaction**: Interactive links trigger a global hover state with NASA Red (`#b60109`, `hover:text-nasa-red-shade`) and underline transition (`hover:underline transition-all`).
- **44px Tap Targets**: Every link applies the 44px hit-area rule via `min-h-[44px] inline-flex items-center touch-target-link` and the centered CSS pseudo-element `footer a::before`.
- **Centralized Neutral Layout & Copyright**: The bottom bar uses a Centered Row (`justify-center flex-row flex-wrap items-center`) with a standardized 24px gap (`gap-6`) and `text-center`. All metadata (`© 2026 HazardNet.`, `Privacy`, `Terms`, `Docs`) share a single unified baseline where space allows and wrap cleanly on mobile without a stacked list appearance. All developer and "Built by" credits have been removed for a clean, government-adjacent scientific platform aesthetic.
- **Contrast Safeguard**: Download and action buttons use high-contrast text combinations (`bg-nasa-red text-white font-semibold`) with minimum 5.3:1 contrast ratio.

---

## 6. Motion & Layering System

### Global 150ms Smooth Transitions:
All interactive components (`button`, `[role="button"]`, `a`, `input`, `select`, `textarea`, `.tap-target`, `.hn-btn-*`, `.hn-card-elevated`, `.hn-nav-link`) inherit a global 150ms transition (`150ms var(--ease-standard)`) across background, border, text color, transform, and shadows. Prefers-reduced-motion automatically dials duration to `0.01ms`.

### LazyMotion Integration:
The application root (`frontend/src/App.tsx`) is wrapped with Framer Motion's `LazyMotion`:
```tsx
<LazyMotion features={domAnimation} strict={false}>
  <AppContent />
</LazyMotion>
```
This reduces upfront bundle size while enabling smooth 60fps animations for drawers, dropdowns, and route transitions.

### Z-Index Hierarchy Token Contract:
- `--z-base`: `0`
- `--z-dropdown`: `1000`
- `--z-sticky`: `1020` (Sticky topbars, floating buttons)
- `--z-fixed`: `1030`
- `--z-offcanvas`: `1040`
- `--z-overlay`: `1050` (Drawer panels & backdrops)
- `--z-modal`: `1060` (Dialog modals)
- `--z-popover`: `1070`
- `--z-tooltip`: `1080`

### Unified Icon-Only Floating Action Button (FAB) Pattern:
- **Refined 60×60px Circle**: Primary action button uses a 60×60px circular geometry (`w-[60px] h-[60px] rounded-full`), providing a comfortable tactile footprint that showcases the detailed Bot character while remaining easy to tap.
- **32px Fluent Bot Vector**: Features a 32px Fluent Bot icon (`ic_fluent_bot_24_filled`, `w-8 h-8`, white fill), centered within the button for an instantly recognizable, friendly AI persona.
- **NASA Blue & Deep Layered Shadow**: Standardized to `#1c67e3` NASA Blue with a deep layered drop shadow (`shadow-[0_12px_20px_-5px_rgba(0,0,0,0.3),0_6px_12px_rgba(28,103,227,0.3)]`) and 150ms transform transition on hover/tap.
- **Consolidated Entry Point**: Serves as the single interaction point for AI assistance, opening the modal with full access to both Live Voice and Grounded Text.

### Global Observatory Hero & Dynamic Transparent Header:
- **NASA-Inspired Hero UX**: Features a full-bleed, deep-black background (`bg-black`) with a centered high-resolution Earth rotation video (`object-cover`, `autoPlay`, `loop`, `muted`, `playsInline`) and an inline high-res poster fallback.
- **Cinematic Gradient Overlay**: Vertical gradient (`from-black/35 via-black/55 to-black/85`) darkens the bottom to ground the typography while preserving the celestial vista at the top.
- **Dynamic Header Transition**: The sticky navigation header remains transparent over the hero (`bg-black/25 backdrop-blur-md text-white border-b border-white/10`) with floating borderless icons (`menu_open`, `location_on`, `map_search`). As soon as the user scrolls past 80px, it smoothly transitions (0.3s ease) into a solid white header (`bg-white/95 backdrop-blur-md border-b border-carbon-20 text-carbon-80 shadow-xs`).
- **Sidebar Paper Card Contrast**: The `RunVisual` card maintains a clean Solid White (`#FFFFFF`) background with dark neutral `Carbon-90` text and `#D1D1D1` border to avoid white-on-white text conflicts and maximize informational readability.

---

## 6b. Tables and Icons (2026-10-03)

Two primitives carry the mobile-port decisions this document used to leave to each page. Both are
enforced by test, and both exist so a screen has nothing to re-decide when it is ported.

### Tables

`frontend/src/components/ui/CardStackTable.tsx` renders a table's rows twice from one source: the
`<table>` at `md` and up, and below `md` one card per row - first cell as the card's heading, the
rest as a `<dl>` of label/value pairs, so a screen reader hears the column name with each value.
`CardStackTable` takes `columns`/`rows` (the shape `content/site-routes.json` publishes);
`CardStackRows` is the same phone branch for console tables whose cells are JSX. The phone branch is
never inside a horizontal scroll container. Console panels that are dark in either theme pass
`tone="onDark"`, so a card never inherits near-black ink on a near-black surface.

The two exceptions are deliberate and ledgered: the map's table view (the map *is* the phone view,
reached through the 44px Map/Table toggle), the advisories protocol sheet (print-only), and the
two-column metadata tables on `/status` (they do not scroll at 320px).
`data/design/table-stack-baseline.json` lists every `<table>` in `frontend/src`; a new one, or a
missing conversion, fails `__tests__/tableStack.test.js`.

### Icons

One family. `data/design/icon-registry.json` holds the decision (family, one stroke, the size
scale, the names in use); `scripts/generate-icon-glyphs.mjs` turns it plus the installed
`lucide-react` into `packages/design-system/src/icons.ts` - name to SVG path data, React-free, so
the native shell renders the same glyphs with `react-native-svg`. Stroke is 1.75, set once per
platform (`svg.lucide { stroke-width }` on web, `ICON_STROKE` natively), never at a call site.
No emoji is used as an icon on either platform. `components/MaterialIcon.tsx` is the frozen
hand-authored legacy set: its importers may only shrink. `__tests__/iconFamily.test.js` holds all
of it. See `docs/design-system/MERIDIAN.md` §4.8-4.9 for the full contract.

---

## 7. React Native Parity Mapping

When migrating screens from Web to React Native (`react-native` / `expo`):

| Web / Tailwind | React Native Equivalent | Notes |
| :--- | :--- | :--- |
| `.tap-target` (`44px × 44px`) | `minHeight: 44, minWidth: 44` / `hitSlop` | Follows Apple HIG & Android Material standards |
| `.hn-btn-primary` | Custom `<Button variant="primary">` | Use `Pressable` with `android_ripple` |
| `.font-heading` | `fontFamily: 'InstrumentSans-SemiBold'` | Preload via `expo-font` |
| `.font-bengali` | `fontFamily: 'NotoSansBengali-Regular'` | Bundled OTF/TTF fonts |
| `touch-action: manipulation` | Native default behavior | No 300ms double-tap delay in RN |
| `MenuDrawer.tsx` | `@react-navigation/drawer` | 1:1 conceptual match |
| `LazyMotion` | `react-native-reanimated` | Shared springs & transition timings |
