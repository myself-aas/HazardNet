# HazardNet Design System — Master Source of Truth

HazardNet's global UI/UX is built on **NASA's Horizon Design System** ([`nasa/hds-core`](https://github.com/nasa/hds-core),
CC0-1.0 — NASA's design system for `*.nasa.gov`). Its tokens are vendored verbatim in
`data/design/nasa-hds/tokens.json`, compiled to CSS custom properties by
`scripts/import_nasa_tokens.mjs`, and mapped onto this application's semantic roles in
`frontend/src/index.css`. Provenance, licence and the regeneration commands are in
`data/design/nasa-hds/PROVENANCE.md`.

The full technical account — what was found, what changed, what the tests caught, and what is
still open — is in [`nasa-hds-integration.md`](./nasa-hds-integration.md).

The earlier local system (derived with the [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
design-intelligence tooling from the query *"agricultural disaster risk monitoring dashboard,
real-time maps & charts"*) is retained in structure — same token layers, same names, same
components — with its **values replaced by NASA's**. Nothing about the component API changed;
what changed is what every token resolves to.

- **Product pattern:** Real-Time / Operations dashboard (live telemetry, maps, charts)
- **Style:** NASA HDS — flat surfaces, 1px rules, square corners, dashed focus rings,
  red = "go somewhere", blue = "do something here"
- **Mode:** Light-first. Dark mode is a future extension (`@custom-variant dark` is wired).

## NASA token layer (Layer 1b)

```
data/design/nasa-hds/tokens.json              vendored NASA token source (CC0-1.0)
        │  node scripts/import_nasa_tokens.mjs
        ▼
frontend/src/styles/nasa-hds.css              --hds-* custom properties, NASA's own names
        │  referenced by
        ▼
frontend/src/index.css  Layer 1b (--hn-hds-*) → Layer 2 (semantic) → Layer 3 (component)
```

`--hds-*` names are identical to NASA's published custom properties, so any value here can be
looked up in NASA's system and vice versa. 174 properties are compiled: colour, spacing,
breakpoints, borders, focus, layout, line-height, letter-spacing, font-weight, font-size,
font-family, 16 composite typography styles, the categorical dataviz palette (light and dark,
plus HDS's recommended five-series assignment) and the yellow/orange sequential ramps.

**The rules travel with the values.** NASA's token descriptions are usage rules, and the ones
that constrain product decisions are enforced in code review and recorded in
`frontend/src/index.css`:

| Token | Rule (NASA's words) | How HazardNet honours it |
| --- | --- | --- |
| `--hds-color-nasa-red` | "Red means 'go somewhere'… never for on-page actions, decorative use, or dataviz." | Every filled primary CTA (`.bg-nasa-red`), error states. Never a chart series, never a map fill. |
| `--hds-color-nasa-blue` | "Blue means 'do something here'… never for navigation CTAs or dataviz." | Controls, toggles, selection borders/rings, info states, the map's on-page toolbars. Never the "Sign up" button. |
| `--hds-color-international-orange` | "For status emphasis or decorative markers… never for primary actions." | The caution/moderate step of the warm ramp and status badges. |
| `--hds-color-active-green` | "Never for branding, decorative backgrounds, or dataviz." | Reserved for active/success states only. |
| `--hds-dataviz-*` | `nasa-red`/`nasa-blue` are barred from dataviz. | `--chart-1…5` come from HDS's categorical set, not from the brand pair. |

### Contrast (measured, not estimated)

Ratios below were computed from the token values (WCAG 2.x relative luminance). They are the
reason for two deliberate deviations from a literal reading of the palette:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `carbon-90` on `carbon-05` (body on page) | 17.4:1 | AAA |
| `carbon-60` on white (muted/caption text) | 7.1:1 | AAA |
| `carbon-50` on white | 4.46:1 | **below AA** → excluded from text roles; borders/icons only |
| white on `nasa-red` (NASA's own button) | 3.1:1 | AA-large only |
| white on `nasa-red-shade` (`--primary-strong`) | 7.0:1 | AA/AAA — used for small-label CTAs |
| `nasa-blue-shade` on white (info/link text) | 9.9:1 | AAA |
| `carbon-20` on white (hairline rules) | 1.4:1 | decorative only, by design |

Because white-on-`nasa-red` fails AA for a 14px bold label, small-label CTAs use
`--primary-strong` (the HDS red shade) rather than the bright red; large/bold labels and
icons may use the bright red exactly as NASA does.

### Neutral ramp (consolidated 2026-09-19)

Every neutral in the application is NASA's carbon ramp. Tailwind ships five grey families
and the UI had grown into four of them — 4,030 utility classes and 252 hard-coded literals —
so the consolidation was done in two moves rather than one, because the detector and the
browser disagree about what a colour is:

1. **Values first.** `@theme inline` in `frontend/src/index.css` re-pointed the
   `slate`/`gray`/`zinc`/`neutral`/`stone` keys at `--hds-color-carbon-*`. One CSS block, no
   component churn, and every grey on screen became NASA's immediately. The alias stays in
   place as a safety net: a component that reaches for `text-slate-500` again still renders
   carbon, and the design gate reports the legacy name.
2. **Names second.** The classes and literals were then renamed onto carbon, because
   impeccable's `gray-on-color` rule reads class names, not resolved values: 233 findings
   before the rename, 0 after. Renaming is a no-op visually once step 1 has landed, which is
   what made 4,030 edits safe to make mechanically.

The mapping is ordinal and was chosen on measured relative luminance, not on name
similarity:

| Tailwind | Hex | Carbon | Hex | Text on white, before → after |
| --- | --- | --- | --- | --- |
| `*-50` | `#f8fafc` | `carbon-05` | `#f6f6f6` | surface |
| `*-100` | `#f1f5f9` | `carbon-10` | `#e3e3e3` | surface |
| `*-200` | `#e2e8f0` | `carbon-20` | `#d1d1d1` | rule, 1.23:1 → 1.53:1 |
| `*-300` | `#cbd5e1` | `carbon-30` | `#b9b9bb` | 1.48:1 → 1.96:1 |
| `*-400` | `#94a3b8` | `carbon-40` | `#959599` | 2.56:1 → 2.98:1 |
| `*-500` | `#64748b` | `carbon-50` | `#77777a` | 4.76:1 → **4.46:1** |
| `*-600` | `#475569` | `carbon-60` | `#58585b` | 7.58:1 → 7.09:1 |
| `*-700` | `#334155` | `carbon-70` | `#444447` | 10.35:1 → 9.71:1 |
| `*-800` | `#1e293b` | `carbon-80` | `#2e2e32` | 14.63:1 → 13.52:1 |
| `*-900` | `#0f172a` | `carbon-90` | `#17171b` | 17.85:1 → 17.88:1 |
| `*-950` | `#020617` | `carbon-black` | `#000000` | 20.17:1 → 21.00:1 |

Two things in that table are decisions rather than arithmetic:

* **The light end is deliberately stronger.** Carbon 05–30 are darker than the slate steps
  they replace, so hairline rules and sunken surfaces gained contrast (1.23:1 → 1.53:1 for
  the 683 `border-*-200` call sites). That is the HDS look — NASA draws a visible 1px rule —
  and it is why the alias could not be tuned per utility: `@theme` maps a colour, not a
  `border-` or `bg-` prefix.
* **`*-500` is the one step that regresses, so it is not aliased for text.** Carbon-50
  measures 4.46:1 on white, below AA, and the table in §Contrast already excludes it from
  text roles. `text-slate-400` (2.56:1) and `text-slate-500` (4.76:1) were the app's two
  muted-text classes, so the 616 sites wearing them on a light surface were rewritten to
  `text-carbon-60` (7.09:1) instead of being aliased. The 12 sites that sit on a dark panel
  kept their step, where carbon measures what slate did (`text-carbon-40` on `carbon-90` is
  5.99:1, as `text-slate-400` on `slate-900` was 6.96:1). Hierarchy is preserved by the step
  from carbon-90/black body text (17.9–21:1) to carbon-60 muted text (7.1:1).

Hard-coded literals moved with the classes: inline styles, SVG fills, canvas and map layer
colours (`LiveMapView`, `useMapSnapshot`, `useMapMeasurements`, `mapPrimitives`), jsPDF text
colours (`pdfExport.ts`, where the 6.5pt dispatch footer is carbon-60 rather than carbon-50
for the same AA reason), `frontend/index.html`'s `theme-color` and the PWA manifest's
`theme_color`. In `index.css` the literals became `var(--hds-color-carbon-*)` so the CSS has
one source of truth; in TypeScript they stayed literals, because canvas and PDF contexts
cannot resolve a custom property. `__tests__/paletteTokens.test.js` fails if a Tailwind
neutral class or literal comes back.

## Token architecture (three layers)

Defined in `frontend/src/index.css`. **Components consume Layer 2/3 only — never raw hex.**

```
Layer 1 · Primitives   --hn-amber-*, --hn-teal-*, --hn-sky-600, --hn-emerald-*,
                       --ease-emphasized/--ease-standard, --duration-fast/base
Layer 2 · Semantic     shadcn core (--background, --card, --primary, --muted-…),
                       status (--success/--warning/--info + -foreground/-surface),
                       severity (--severity-low…extreme + -solid/-surface),
                       surfaces & text (--surface-page/card/sunken/inverse, --text-body/muted/subtle)
Layer 3 · Component    --panel-bg/border/radius/blur/shadow, --control-min-size, --navbar-height
```

All Layer 2/3 tokens are registered in `@theme inline`, so they generate Tailwind utilities:

| Utility example | Token |
| --- | --- |
| `bg-surface-card`, `text-body`, `text-subtle` | surfaces & text roles |
| `bg-severity-high`, `text-severity-extreme`, `bg-severity-moderate-surface` | severity scale |
| `text-success`, `bg-warning-surface`, `bg-info-surface` | status |
| `font-sans`, `font-brand`, `font-mono` | typography |

**Severity ramp** (text values are WCAG AA ≥ 4.5:1 on white; `-solid` for map fills/markers/charts;
`-surface` for tint chips):

| Level | Text | Solid | Surface |
| --- | --- | --- | --- |
| Low | `#15803d` emerald-700 | `#22c55e` | `#dcfce7` |
| Moderate | `#b45309` amber-700 | `#f59e0b` | `#fef3c7` |
| High | `#c2410c` orange-700 | `#f97316` | `#ffedd5` |
| Very high | `#b91c1c` red-700 | `#ef4444` | `#fee2e2` |
| Extreme | `#9f1239` rose-800 | `#e11d48` | `#ffe4e6` |

Legacy `--nasa-*` / `--m3-*` variables are aliased to semantic tokens for backward
compatibility and are **deprecated** — do not use them in new code.

## Typography

| Role | Family | Token | Usage |
| --- | --- | --- | --- |
| Display / brand / headings | **Inter** (`font-brand`, `font-heading`, `font-display`) | `--hds-font-family-heading` | Wordmark, `h1`–`h4`, masthead nav links |
| UI / body | **Public Sans** (`font-sans`) | `--hds-font-family-body` | Body (16px/1.62), nav, buttons, labels, tables |
| Data readouts | **DM Mono** (`font-mono`, tabular numerals) | `--hds-font-family-mono` | Scores, coordinates, telemetry, badges (`.hn-data-readout`, `.hn-badge`) |

These are the three families NASA HDS ships. All are self-hosted through `@fontsource`
(offline-friendly with the service worker); no third-party font request is made. Base body
size is **16px** (`--hds-font-size-xs`); the smallest caption size is **12px** (never below),
and metadata/eyebrows use HDS's `metadata` composite via the `.hn-metadata` utility:
uppercase, 12px, weight 700, track `+0.025em`, line-height 1.75.

Corner radius follows HDS's two values: **0px** for surfaces (cards, panels, modals, the
masthead) and **2px** for small interactive controls (`rounded-control`, `rounded-sm`,
`rounded-md`). `rounded-full` is intentionally untouched — avatars, status dots and circular
icon buttons must stay round. Depth comes from 1px `carbon-20` rules, not shadows; focus
rings are **1px dashed, 1px offset** in `carbon-60` on light surfaces and `carbon-30` on dark
ones (`.hn-surface-dark`, `.leaflet-container`).

Scale (`.hn-*` utilities): wordmark 20–22px/800 · h1 28–32px/700 · h2 22px/700 ·
h3 16–18px/600 · body 16px/400 · nav 14px/500–600 · buttons 14px/600 ·
labels 12–13px/500 · captions 12px/400 · data readouts 13–16px/600 · badges 11px/600 caps.

## Accessibility rules (enforced)

- **Contrast:** body text ≥ 4.5:1. `--primary-foreground` is dark amber `#451a03` on
  amber `#f9a825` (≈8.3:1) — **never put white text on amber**; use
  `bg-amber-400 text-slate-950` instead.
- **Focus:** global `:focus-visible` ring using `--ring` (amber-600, ≥3:1 non-text).
- **Touch targets:** icon-only controls get the `.tap-target` utility (44×44px).
- **Motion:** global `prefers-reduced-motion: reduce` collapses decorative animation
  (radar pings, pulses) to a static snapshot.
- **Zoom:** mobile inputs render at 16px to prevent iOS focus zoom; pinch-zoom stays enabled.
- **No horizontal scroll:** `body { overflow-x: clip }` plus per-component responsive rules.

## Responsive rules

- Mobile-first: test at **320, 375, 414, 768, 1024, 1440px**.
- Full-viewport surfaces use `h-dvh`/`min-h-dvh` (not `h-screen`) so mobile browser
  chrome never crops the map; `viewport-fit=cover` + `env(safe-area-inset-*)` utilities
  (`.pt-safe`, `.pb-safe`, `.pb-safe-bottom`) handle notches and home indicators.
- Grids collapse `grid-cols-1 → sm:/md:/lg:`; wide instrument rows scroll horizontally
  (`overflow-x-auto scrollbar-none touch-scroll`) instead of squeezing.
- Overlays: drawers `w-80 max-w-[85vw]`; chat/modals cap at
  `max-h-[calc(100dvh-3rem)]` with safe-area padding.
- Map popups: `max-width: 88vw` on mobile, 44×44px close button.

## Component conventions

- Panels: `.nasa-glass-panel` (consumes Layer 3 `--panel-*` tokens).
- Icons: SVG/Material Symbols via `MaterialIcon` — **never emoji as icons**.
- Charts: consume `--chart-1…5`; severity series use the severity `-solid` tokens;
  legends/labels never rely on color alone (pair with text/labels).
- Hover/active transitions: 150–300ms on `--ease-standard`/`--ease-emphasized`.

## Known debt / next steps

- Remaining hardcoded `#f9a825 + text-white` combos in secondary components
  (AuthCard, AuthModal, DisasterDetailModalUI, Footer, Map, …) should migrate to
  `bg-amber-400 text-carbon-black` or semantic tokens.
- The warm ramp still wears Tailwind's name: `amber-*` resolves to HDS's yellow and
  international-orange sequences through `@theme`, which puts NASA's values on screen but
  leaves 732 call sites named `amber`. Exposing `seq-orange-*`/`seq-yellow-*` as first-class
  utilities and renaming is the same two-step move the neutral ramp just made.
- State colours are still Tailwind's: `rose-*` (319), `emerald-*` (322), `sky-*` (93),
  `purple-*`/`violet-*`/`indigo-*` (49). HDS offers no ramp for them — one green, one blue
  and a red with a tint and a shade each — so these migrate onto the semantic tokens
  (`--success*`, `--info*`, `--destructive*`, `--severity-*`) by role rather than by shade,
  and the purple family is deleted outright: it is impeccable's `ai-color-palette` finding
  (20 today) and NASA's palette has no violet in it.
- Outstanding design-gate findings after the neutral consolidation: 4 (3 `side-tab`,
  1 `border-accent-on-rounded`). The `designSystem.*` detector rules stay off until the warm
  and state colours land, because they read class names and would report every `amber-*`.
- `--severity-*` should replace bespoke hazard color literals in map layer code.
- Dark mode: add a `.dark` token override block once light theme is fully tokenized.
