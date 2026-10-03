# HazardNet Meridian Design System (HDS v3.0)

> Supersedes **HDS v2.2** (`frontend/DESIGN_SYSTEM.md`), which stays in place for
> the surfaces still migrating.
>
> **Source of truth for values:** [`packages/design-system/src/meridian.ts`](../../packages/design-system/src/meridian.ts)
> **Web token layer:** [`frontend/src/styles/meridian.css`](../../frontend/src/styles/meridian.css)
> **Primitives:** [`frontend/src/components/meridian/primitives.tsx`](../../frontend/src/components/meridian/primitives.tsx)
> **Contracts:** [`__tests__/meridianContrast.test.js`](../../__tests__/meridianContrast.test.js) · [`__tests__/meridianParity.test.js`](../../__tests__/meridianParity.test.js)

---

## 0 · Provenance, stated plainly

Meridian is an **original** system. Nothing in it is copied from Apple or Meta:
no SF Pro or Optimistic font files, no Apple or Meta artwork, no lifted CSS, no
scraped imagery. Both companies' typefaces are proprietary and neither is
shipped here; HazardNet additionally has a hard "no remote font URL" contract
and a font payload budget (`npm run check:fonts`), and
`meridianParity.test.js` fails the build if a banned family or a remote fetch
enters the stacks.

What Meridian takes from them is **method** — the principles each publishes as
guidance. Principles are ideas. This document records which ones were taken,
which were refused, and what HazardNet changed.

---

## 1 · The two parents, understood separately

### 1.1 Apple — Human Interface Guidelines

Apple does not ship a token repository. Its system is the HIG plus named
tokens, and it rests on three long-stated principles.

| Principle | What it actually means in practice |
|---|---|
| **Clarity** | Text legible at every size, icons precise, function obvious from the content |
| **Deference** | Chrome recedes; the UI serves the content and never competes with it |
| **Depth** | Layers and motion convey hierarchy — what sits above what, what a gesture will do |

The mechanisms worth extracting:

- **Type scale as named styles, not pixels.** Body 17pt, Large Title 34pt at the
  default size, defined as *names* so Dynamic Type can rescale the whole system.
- **Semantic colour roles that adapt.** `label`, `secondaryLabel`, `separator`,
  `systemBackground` — not hex values. This is what makes dark mode and
  increased contrast free rather than a second design.
- **44×44pt minimum tap target.**
- **Concentric corner radii.** A nested surface's radius is the outer radius
  minus the padding between them, or the corners read as mismatched.
- **Materials.** Translucent, blurred, saturation-boosted layers for chrome that
  floats above content (the 2025 "Liquid Glass" is this idea made structural).
- **Spring motion** that respects Reduce Motion.

### 1.2 Meta — published design language

Meta's public surfaces (meta.com and the Reality Labs commerce pages) share a
recognisable, disciplined system.

- **Display / Text type split.** A display face carries headlines ≥24px with
  tight tracking (−0.01em to −0.03em); a text face with a larger x-height and
  looser tracking carries body. Three core weights: 400 body, 600 emphasis,
  700 display.
- **Ink, not black.** Near-black with a cast (Meta lands around `#1C2B33`)
  rather than `#000`, so large type stays warm at scale.
- **Lift white off grey.** White cards on a tinted canvas, separated by
  ink-tinted shadow rather than borders. Hierarchy comes from layering.
- **A soft media radius family.** ~12px images, 16px cards, 24–32px feature and
  photographic panels, 100px pills for every CTA and chip.
- **Dual primary.** A neutral ink pill for marketing surfaces; the saturated
  brand colour reserved for the transactional flow. **Colour scarcity is the
  navigational signal** — it tells the user which surface they are standing on
  without a word.
- **Alternating light/dark section rhythm** for long editorial pages.
- **Restraint as a scaling discipline.** At a billion users every ornamental
  choice multiplies; default to the minimal, accessible option.

---

## 2 · Why the blend cannot be a straight merge

Both parents are tuned for **calm consumer commerce**. HazardNet is a safety
early-warning system read by:

- Bangladeshi **farmers and extension officers** in a flooded field
- **Agronomists and DRR officers** reviewing a district outlook
- Journalists and reviewers checking **whether a number can be trusted**

…typically on a **low-end Android**, in **direct sunlight**, often in
**Bengali**, sometimes **offline**, over a **poor connection**.

A design system that looks right in a Cupertino product video and a Menlo Park
hardware store is not automatically right for that. So the blend is selective,
and three decisions are HazardNet's own.

---

## 3 · The three decisions that are ours

### 3.1 The dual-primary is inverted for safety

Meta reserves its cobalt for the buy funnel, so a cobalt button tells you where
you are in the flow. Meridian takes the mechanism and **inverts the emphasis**:

| Intent | Colour | Use |
|---|---|---|
| `ink` | near-black pill | **browse, navigate, open the map** ← the default primary |
| `hazard` | brand crimson | **the alert itself — RESERVED** |
| `interactive` | NASA blue | on-page interaction: filters, tabs, links, focus |
| `outline` | hairline | secondary |
| `quiet` | transparent | tertiary, or the cancel half of a destructive pair |

**Why this matters more here than on a store.** Under HDS v2.2 the front door's
"Open the map" CTA was `bg-primary-strong` — crimson. That spent the hazard
colour on a browse action and trained the reader that **crimson means
clickable**. On a warning service that is a safety bug, not a style preference:
the crimson has to still mean something when the district under it is under
warning.

This is enforced in code, not just in prose —
`meridianContrast.test.js` asserts that `actionInk !== actionHazard` in every
theme and that light-theme `actionHazard` *is* the brand crimson, so the
regression fails the build.

### 3.2 Two geometry tracks, not one

Meta's soft radii are right for editorial surfaces and wrong for a 64-district
data console, where 32px corners waste the pixels the table needs. Meridian
surfaces therefore declare a **track**:

| | `editorial` | `console` |
|---|---|---|
| Where | front door, about, methodology, hazards | live map, analytics, alerts table, district console |
| Card radius | 16px | 8px |
| Control radius | pill (9999px) | 8px |
| Media radius | 24px | 8px |
| Section gap | 96px | 32px |
| Elevation | `shadow-card` (lifted) | `shadow-console` (near-flat) |
| Body style | callout (18px) | body (17px) |

Same tokens, two densities, chosen **per surface rather than per component** —
so one card component renders correctly in both without a variant explosion. In
CSS this is the `.mrd-track-console` scope overriding the radius and elevation
custom properties; the tests assert the console track never rounds a control
into a pill and the editorial track keeps it.

### 3.3 Three things neither parent has

Because neither parent needs them.

**Bengali-first bilingual typography.** Bengali glyphs carry a headline bar
(matra) and descend further than Latin, so Latin line-heights clip them.
Meridian applies a size multiplier of 1.06, a line-height floor of **1.65**
(the Latin floor is 1.3), and slightly *open* tracking — Bengali letterforms
crowd when tightened. `meridianContrast.test.js` asserts the Bengali floor
exceeds the Latin body line-height.

**Honest absence.** A missing artifact renders as an em dash or as the sentence
that says it is missing — never as a zero that reads like a real measurement.
This is the repository's existing honesty contract, promoted to a component
(`Figure`, `StateBlock`, `ProvenanceNote`) so it cannot be forgotten.

**Severity is colour + shape + label, never colour alone.** WCAG 1.4.1, plus
the practical case: a colour-blind farmer reading a cracked phone screen in
monsoon light gets the level from the glyph and the word, not the hue. Five
levels, five distinct glyphs, five distinct ranks. `extreme` deliberately breaks
the bar pattern with a filled diamond, so it survives greyscale print where four
bars of increasing height do not.

---

## 4 · Tokens

### 4.1 Colour

**Primitives.** Values only; none of these knows what it is for.

| Token | Value | Measured contrast |
|---|---|---|
| `ink` | `#141A1F` | 17.54:1 on white · 16.19:1 on canvas · 15.20:1 on grouped |
| `inkSoft` | `#4A5560` | 7.61:1 on white (AAA small text) |
| `inkTertiary` | `#6B7885` | 4.52:1 on white (AA — 14px and above only) |
| `inkQuaternary` | `#8C98A4` | decorative and disabled only, never text |
| `brandCrimson` | `#970002` | 9.06:1 on white · 8.37:1 on canvas |
| `brandCrimsonDark` | `#7B1D21` | 10.29:1 on white |
| `brandInk` | `#0D0D0D` | 19.44:1 on white (the pill fill and the wordmark) |
| `blue` | `#1c67e3` | 5.12:1 on white (AA controls and large text) |
| `blueShade` | `#0b3b95` | 10.13:1 on white (AAA link text) |
| `canvas` | `#F4F6F8` | — |
| `canvasGrouped` | `#ECEFF2` | — |
| `surface` | `#FFFFFF` | — |

`ink` is a deliberate blend: Apple and Meta both refuse pure black for text,
Meta lands warm at `#1C2B33`, and HazardNet's own mark is `#0D0D0D`. Meridian
sits between them — faintly cool, keeping the mark's authority while reading
warmer than `#000` at display sizes.

**Semantic roles.** What components consume. Every role resolves per theme, so
dark mode and high contrast required no component changes at all.

`label` · `labelSecondary` · `labelTertiary` · `labelQuaternary` · `separator` ·
`separatorOpaque` · `backgroundBase` · `backgroundGrouped` · `backgroundElevated` ·
`actionInk` · `actionHazard` · `actionInteractive` · `focusRing`

Three themes ship: `light`, `dark`, `highContrast`. `dark` inverts the ink pill
to white-on-dark; `highContrast` also fires automatically from
`prefers-contrast: more`.

### 4.2 Typography

Apple's named styles, Meta's display/text split, Bengali's floor.

| Style | Size | Line | Tracking | Weight | Role |
|---|---|---|---|---|---|
| `micro` | 11px | 1.45 | +0.01em | 500 | text |
| `caption` | 12px | 1.5 | +0.01em | 500 | text |
| `footnote` | 13px | 1.5 | +0.005em | 400 | text |
| `subhead` | 15px | 1.55 | 0 | 400 | text |
| `body` | **17px** | 1.6 | 0 | 400 | text |
| `callout` | 18px | 1.55 | −0.003em | 500 | text |
| `title3` | 20px | 1.35 | −0.008em | 600 | text |
| `title2` | 22px | 1.3 | −0.011em | 600 | text |
| `title1` | 28px | 1.2 | −0.015em | 600 | display |
| `display3` | clamp → 34px | 1.12 | −0.02em | 650 | display |
| `display2` | clamp → 56px | 1.06 | −0.025em | 650 | display |
| `display1` | clamp → 72px | 1.02 | −0.03em | 680 | display |

`body` is **17px, not 16px**. That is Apple's legibility floor and it is the
right call for this audience: a 17px body on a 5.5" screen at arm's length in
daylight is the difference between a readable advisory and a squint.

Display sizes are `clamp()` so the scale is fluid from a 360px phone to a 1440px
monitor with no breakpoint edits.

**Font stacks are open source only, and every family in them is either bundled or a platform
face.** Latin is the platform UI face (`system-ui, -apple-system, 'Segoe UI', Roboto`), data is the
platform mono stack, and Bengali is `'Noto Sans Bengali', 'Hind Siliguri'` — the one webfont this
bundle ships (`@fontsource/noto-sans-bengali`, 400 + 700; `families.bengali` and
`MERIDIAN_FONTS.bengali` both carry it). The instrument/Plus Jakarta/Anek Bangla/Baloo Da 2 names
are gone from the code: none of them was ever bundled, so their only effect was that a machine with
one installed rendered a different product. `frontend/src/styles/meridian.css` mirrors
`MERIDIAN_FONTS` verbatim and `__tests__/meridianParity.test.js` fails if the two drift.

### 4.3 Geometry

Apple's concentric rule over Meta's soft media family.

| Token | Value | Use |
|---|---|---|
| `xs` | 4px | chips, tags, inline badges |
| `sm` | 8px | inputs, console controls |
| `md` | 12px | media — Meta's image radius |
| `lg` | 16px | cards — Meta's card radius |
| `xl` | 24px | panels, dialogs |
| `xxl` | 32px | feature and hero media |
| `pill` | 9999px | CTAs, pills, search fields |
| `sheet` | 28px | bottom sheets (retained from HDS 2.2) |

**Concentric:** `concentricRadius(outer, padding) = max(0, outer − padding)`.
A 24px panel with 16px padding gets an 8px inner surface. Tested.

### 4.4 Elevation

Ink-tinted, not black. A neutral grey shadow reads muddy over a tinted canvas;
tinting it toward the ink colour makes white cards read as *lifted* rather than
outlined. This is what replaces the 1px border HDS v2.2 put on every panel.

`card` · `cardHover` · `floating` · `modal` · `console` (near-flat — dense data
must not look pressable).

### 4.5 Material

Apple's translucency, scoped to **chrome only**.

`.mrd-glass` (72% white, 20px blur, 1.8 saturation) · `.mrd-glass-strong` (88%) ·
`.mrd-glass-dark`.

**The rule:** surfaces a user *reads and acts on* stay opaque. Translucency
behind a data table is a legibility cost with no benefit, and the existing map
card contracts already assert opacity. Glass is for the nav, the map HUD and
bottom sheets.

### 4.6 Motion

Apple's spring physics expressed as web curves.

| | Duration | Curve |
|---|---|---|
| `instant` | 120ms | press states, toggles |
| `fast` | 200ms | hover, focus, small changes |
| `base` | 320ms | panels, drawers, routes |
| `slow` | 520ms | hero and section reveals |
| `ambient` | 14000ms | background motion |

Curves: `out` `cubic-bezier(0.16,1,0.3,1)` · `standard` `cubic-bezier(0.2,0,0.2,1)` ·
`emphasized` `cubic-bezier(0.2,0,0,1)` · `spring` `cubic-bezier(0.34,1.56,0.64,1)`
(small values only — large surfaces wobble).

**Only `opacity`, `transform` and `filter` animate.** Never `width`, `height`,
`top` or `left`, which trigger layout on every frame.

**Reduced motion turns motion OFF, not down.** `[data-mrd-reveal]` is only
hidden when `prefers-reduced-motion: no-preference`; under `reduce` the content
is simply present. Failing open is the correct behaviour — the fallback for
"cannot animate" must be "content is present", never "content is invisible".

### 4.7 Touch and stacking

44px floor, non-negotiable and baked into `.mrd-btn` so it cannot be overridden
from a call site. 48px on Android. 48px CTA height on editorial, 44px compact on
console. One z-scale from `base` to `a11y` — no ad-hoc 9999.

---

## 5 · What is enforced by test, not by convention

| Contract | Test |
|---|---|
| Every text role clears its WCAG threshold on every background it may sit on | `meridianContrast.test.js` |
| The ratios quoted in prose are the real computed ones | `meridianContrast.test.js` |
| All three themes define every semantic role, and label/secondary clear AAA on their own ground | `meridianContrast.test.js` |
| Button foreground clears AA against its own fill in every theme | `meridianContrast.test.js` |
| 44px / 48px tap floors; no control dips below | `meridianContrast.test.js` |
| Severity is never colour alone: 5 glyphs, 5 ranks, extreme breaks the pattern | `meridianContrast.test.js` |
| Severity text clears AA **on its own surface** | `meridianContrast.test.js` |
| The 4-step policy taxonomy stays distinct from the 5-step severity scale | `meridianContrast.test.js` |
| Concentric radii; console tighter than editorial; console never pills a control | `meridianContrast.test.js` |
| Body-scale line-heights ≥ 1.3; display tracking negative, body neutral | `meridianContrast.test.js` |
| Bengali size, line-height floor and open tracking | `meridianContrast.test.js` |
| Dual-primary: ink ≠ hazard in every theme; light hazard *is* the brand crimson | `meridianContrast.test.js` |
| TS tokens and CSS custom properties agree, value by value | `meridianParity.test.js` |
| No proprietary typeface and no remote font fetch in either file | `meridianParity.test.js` |
| `meridian.css` is imported into `index.css` **after** the NASA layer | `meridianParity.test.js` |

---

## 6 · Two bugs the contract tests found on first run

Both were real, and neither was visible by eye.

1. **`moderate` severity text measured 4.46:1 on its own `#fef3c7` surface** —
   under WCAG AA. Darkened `#b25600` → `#9c4b00`, which measures **5.51:1** on
   the surface and 6.14:1 on white.

2. **`high` and `veryHigh` severity text measured 3.95:1 on `#fee2e2`.** This
   one was inherited from HDS v2.2, where the *text* colour and the *map fill*
   colour were the same value (`#dc2626`). They have different jobs: text needs
   4.5:1 (WCAG 1.4.1), a map fill needs 3:1 (WCAG 1.4.11). Meridian splits them
   — text `#b91c1c` (5.30:1), marker fill unchanged. **This was an AA failure on
   the two severity levels a reader most needs to read.**

---

## 7 · Migration status

Meridian is **additive**. The existing NASA-HDS-derived layer in
`frontend/src/index.css` is untouched: 6,386 palette-family uses and several
asserting tests depend on those names, and `npm run check:tokens` still passes
at its ≥90% gate. Meridian adds roles above it; `meridian.css` is imported last
so equal-specificity rules resolve to Meridian.

**Migrated**

- Token layer — `packages/design-system/src/meridian.ts`, `frontend/src/styles/meridian.css`
- Primitives — `Button`, `ButtonLink`, `Card`, `Eyebrow`, `SectionHeading`,
  `SeverityBadge`, `Figure`, `PillTabs`, `ProvenanceNote`, `StateBlock`
- Motion and theme hooks — `useReveal`, `useScrollProgress`, `useScrolledPast`,
  `useMeridianTheme`, `usePrefersReducedMotion`
- Hazard and severity artwork — `frontend/public/hazard-glyphs.svg`,
  `HazardGlyph.tsx`
- Surfaces — the front door hero (type scale, dual-primary CTAs, figures) and
  the navbar (glass chrome)

**Not yet migrated** — the remaining console surfaces (`/live`, analytics,
alerts table), the footer, auth, and the mobile shells. Each is a mechanical
pass once a surface declares its track; the tokens and primitives are ready.

---

## 8 · Using it

```tsx
import { Button, ButtonLink, Card, SectionHeading, SeverityBadge, Figure, ProvenanceNote }
  from './components/meridian/primitives';
import { useReveal } from './components/meridian/motion';
import { HazardGlyph } from './components/meridian/HazardGlyph';

// A console surface declares its track once, at the root.
<div className="mrd-track-console"> … </div>

// The default primary is ink. Crimson is reserved for hazard.
<ButtonLink href="/live" intent="ink" size="lg">Open the map</ButtonLink>

// Severity carries colour + shape + label.
<SeverityBadge level="high" />

// Every figure carries the artifact it was read from.
<Figure value="64" label="Districts covered" source="freshness.json · 2026-10-02T01:00Z" />
```

```css
/* Type, colour and elevation come from roles, never from raw values. */
.title   { composes: mrd-title1; }
.panel   { background: var(--mrd-bg-elevated); box-shadow: var(--mrd-shadow-card); }
.muted   { color: var(--mrd-label-secondary); }
```

---

## 9 · React Native parity

| Web | React Native | Note |
|---|---|---|
| `--mrd-tap-min: 44px` | `minHeight: 44, minWidth: 44` / `hitSlop` | 48 on Android |
| `.mrd-btn-ink` | `<Button intent="ink">` on `Pressable` | keep the dual-primary rule |
| `--mrd-font-text` | the platform UI face - nothing to preload | the Bengali face is the only one that ships |
| `--mrd-font-bengali` | `NotoSansBengali-Regular` | line-height 1.65 floor |
| `.mrd-glass` | `@react-native-community/blur` | chrome only, never behind data |
| `useReveal` | `react-native-reanimated` + `IntersectionObserver` equivalent | fail open under reduce |
| `.mrd-track-console` | a `track` prop on the surface root | not a per-component variant |
