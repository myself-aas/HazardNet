# HazardNet Design System — Master Source of Truth

Derived with the [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
design-intelligence tooling (design-system query: *"agricultural disaster risk monitoring
dashboard, real-time maps & charts"*), adapted to HazardNet's existing brand.

- **Product pattern:** Real-Time / Operations dashboard (live telemetry, maps, charts)
- **Style:** Light glassmorphism ("mission control") — frosted panels, layered depth
- **Mode:** Light-first. Dark mode is a future extension (`@custom-variant dark` is wired).

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

| Role | Family | Usage |
| --- | --- | --- |
| Display / brand | **Playfair Display Variable** (`font-brand`) | Wordmark, `h1`/`h2` page & section titles |
| UI / body / data | **Noto Sans Variable** (`font-sans`) | Body (16px base), nav, buttons, labels, `h3` card titles |
| Data readouts | **JetBrains Mono** (`font-mono`, tabular numerals) | Scores, dates, telemetry, badges (`.hn-data-readout`, `.hn-badge`) |

Fonts are self-hosted via `@fontsource-variable/*` (offline-friendly with the service
worker). JetBrains Mono remains CDN-loaded. Base body size is **16px**; the smallest
caption size is **12px** (never below).

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
  `bg-amber-400 text-slate-950` or semantic tokens.
- `--severity-*` should replace bespoke hazard color literals in map layer code.
- Dark mode: add a `.dark` token override block once light theme is fully tokenized.
