---
name: HazardNet
description: Bangladesh hazard nowcasting and archive. NASA's Horizon Design System, applied to an operations surface: flat white cards on a carbon-05 page, 1px rules, square corners, dashed focus rings, red means "go somewhere" and blue means "do something here".

# The tokens below are a portable export, not a second source of truth. The pipeline is
#   data/design/nasa-hds/tokens.json   (vendored from nasa/hds-core, CC0-1.0)
#     -> node scripts/import_nasa_tokens.mjs
#   frontend/src/styles/nasa-hds.css   (--hds-*, NASA's own names, generated: do not edit)
#     -> referenced by
#   frontend/src/index.css             (--hn-hds-* and the shadcn-compatible semantic layer)
# If a value changes upstream, regenerate and update this file in the same commit.
# Reasoning and the token-by-token usage rules: docs/design-system/MASTER.md.
colors:
  # Brand
  nasa-red: "#f64137"                 # "go somewhere": navigation CTAs, error/emergency. Never on-page actions, decoration or dataviz.
  nasa-red-tint: "#ff5c52"            # hover, error highlight
  nasa-red-shade: "#b60109"           # button hover, error text on light surfaces (7.0:1 on white)
  nasa-blue: "#1c67e3"                # "do something here": controls, list markers, table headers, info
  nasa-blue-tint: "#288bff"           # active elements, dark-scheme links
  nasa-blue-shade: "#0b3d91"          # link and info text on light surfaces (9.9:1 on white)
  international-orange: "#ea6f24"     # status emphasis and decorative markers. Never a primary action.
  active-green: "#47da84"             # active/fresh state. Never branding, backgrounds or dataviz.

  # Carbon neutrals (the only grey ramp; no slate, no zinc)
  carbon-05: "#f6f6f6"                # page background
  carbon-10: "#e3e3e3"                # sunken surface, table rules
  carbon-20: "#d1d1d1"                # hairline borders, dividers
  carbon-30: "#b9b9bb"                # stronger hairline, disabled outlines
  carbon-40: "#959599"                # icons and non-text marks only
  carbon-50: "#77777a"                # borders/icons; 4.46:1 on white, just under AA for text
  carbon-60: "#58585b"                # smallest text grey that clears AA (7.1:1 on white)
  carbon-70: "#444447"                # secondary body text
  carbon-80: "#2e2e32"                # dark-scheme raised surface
  carbon-90: "#17171b"                # body text on light, page ground on dark
  carbon-black: "#000000"             # maximum-contrast outlines and focus rings
  spacesuit-white: "#ffffff"          # cards, inputs, maximum-contrast text on dark

  # Sequential ramps used for caution surfaces and hazard shading (dataviz tokens)
  seq-yellow-10: "#feebbe"
  seq-yellow-20: "#ffcb47"
  seq-yellow-30: "#f5af0c"
  seq-orange-10: "#fce3ca"            # caution fill; text on it is seq-orange-90
  seq-orange-50: "#d96a00"
  seq-orange-60: "#b25600"            # 5.5:1 on white, caution text
  seq-orange-80: "#5c2b00"
  seq-orange-90: "#3b1b00"            # text on seq-orange-10
  seq-orange-100: "#241000"           # dark-scheme caution fill; nasa-red-tint reads 6.0:1 on it

typography:
  display:
    fontFamily: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(4rem, 12vw, 7.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.05em"
  h1:
    fontFamily: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(2rem, 6vw, 3rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  h2:
    fontFamily: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.02em"
  h3:
    fontFamily: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.125rem, 2.5vw, 1.375rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h4:
    fontFamily: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Public Sans Web', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.62
    letterSpacing: "normal"
  intro:
    fontFamily: "'Public Sans Web', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  metadata:
    fontFamily: "'Public Sans Web', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.75
    letterSpacing: "0.025em"
  number-lg:
    fontFamily: "'DM Mono', Consolas, Courier, monospace"
    fontSize: "clamp(4rem, 12vw, 7.5rem)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.05em"
  code:
    fontFamily: "'DM Mono', Consolas, Courier, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.1em"

rounded:
  none: "0px"        # HDS default: cards, buttons, modals, tables, header and footer are square
  control: "2px"     # the only radius in the system: checkboxes, radios, selects, text inputs, chips

spacing:
  xs: "4px"          # --hds-spacing-0-5: compact table cell padding, sub-link gaps
  sm: "8px"          # --hds-spacing-1: tightest content relationship, inside one component
  md: "12px"         # --hds-spacing-1-5: cell padding, button block padding, list marker gaps
  base: "16px"       # --hds-spacing-2: default sibling spacing
  lg: "20px"         # --hds-spacing-2-5: list item separation, inline button padding
  xl: "24px"         # --hds-spacing-3: section separation inside a component area
  2xl: "32px"        # --hds-spacing-4: component separation on mobile and tablet
  3xl: "48px"        # --hds-spacing-6: component separation on desktop
  4xl: "64px"        # --hds-spacing-8: section padding for major layout blocks
  5xl: "72px"        # --hds-spacing-9: component separation on widescreen

components:
  button-primary:
    backgroundColor: "{colors.nasa-red}"
    textColor: "{colors.spacesuit-white}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.nasa-red-shade}"
    textColor: "{colors.spacesuit-white}"
  button-secondary:
    backgroundColor: "{colors.nasa-blue}"
    textColor: "{colors.spacesuit-white}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-outline:
    backgroundColor: "{colors.spacesuit-white}"
    textColor: "{colors.nasa-blue-shade}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.spacesuit-white}"
    textColor: "{colors.carbon-90}"
    rounded: "{rounded.none}"
    padding: "24px"
  link:
    textColor: "{colors.nasa-blue-shade}"
  callout-caution:
    backgroundColor: "{colors.seq-orange-10}"
    textColor: "{colors.seq-orange-90}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  table-header:
    backgroundColor: "{colors.carbon-05}"
    textColor: "{colors.carbon-90}"
    typography: "{typography.metadata}"
  chip-state:
    backgroundColor: "{colors.spacesuit-white}"
    textColor: "{colors.carbon-90}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
---

# HazardNet design system

## Overview

HazardNet publishes Bangladesh hazard nowcasts, district outlooks and a verified event
archive. Its visual system is NASA's Horizon Design System (`nasa/hds-core`, CC0-1.0),
vendored as tokens and mapped onto this application's semantic roles without renaming
anything: a `--hds-*` value here can be looked up in NASA's published system and vice
versa. The look that follows from NASA's own rules is flat and legible rather than
decorative — white cards on a carbon-05 page, hairline rules instead of shadows, square
corners, and colour reserved for meaning.

Two constraints shape every screen. First, this is an operations surface: a visitor may
be reading it during a flood, on a low-end phone, on a poor connection, in Bengali.
Second, most of what it shows is measured or modelled data under an embargo policy, so
nothing on a public surface may be decorated in a way that could be read as an
observation or a forecast.

The token pipeline, the semantic mapping and the reasoning are in
[`docs/design-system/MASTER.md`](docs/design-system/MASTER.md). This file is the portable
export for design-aware tooling; it does not replace those documents.

## Colors

Colour carries meaning, and NASA's rules for what each colour means are enforced here
rather than treated as advice:

- **NASA red `#f64137`** — "go somewhere". Filled primary actions that navigate, and
  error/emergency states. Never an on-page action, never decoration, never a chart series
  or a map fill.
- **NASA blue `#1c67e3`** — "do something here". Controls, toggles, selection rings, list
  markers, table headers, informational states, the map's on-page toolbars. Never a
  navigation CTA, never dataviz. On light surfaces, text and links use the shade
  `#0b3d91` (9.9:1 on white).
- **International orange `#ea6f24`** — status emphasis and decorative markers, including
  the caution step of the warm ramp. Never a primary action. Decorative uses are exempt
  from the 3:1 minimum; text uses is not.
- **Active green `#47da84`** — fresh/active/confirmed state only.
- **Carbon neutrals** — the single grey ramp. There is no slate, zinc, grey or neutral
  ramp alongside it. `carbon-90` is body text on light and the page ground on dark;
  `carbon-60` is the smallest grey that clears AA for text (7.1:1 on white); `carbon-50`
  and lighter are for borders and icons, not words.
- **Sequential yellow and orange ramps** — caution surfaces and hazard shading. On
  `seq-orange-10` the text colour is `seq-orange-90`, never a neutral grey.

Text on a tinted surface takes a darker shade of that surface's own hue. Grey on colour
reads washed out and is the single most common defect this system has to fight.

Dark scheme is a media-query extension of the same tokens (`carbon-90` ground,
`carbon-10` text, `nasa-blue-tint` links, `carbon-80` raised surfaces). Every surface that
changes background in dark mode restates its text colour in the same block; a colour
declared only in light mode is a contrast bug waiting for a dark-scheme visitor.

## Typography

Three families, all self-hosted from `@fontsource` packages so no visitor request leaves
this origin: **Inter** for headings and display, **Public Sans Web** for body text,
**DM Mono** for numbers, code and identifiers. NASA's tokens name these families exactly,
and the `@font-face` aliases in `frontend/src/index.css` exist so that
`var(--hds-font-family-body)` resolves.

The scale is NASA's: display and h1/h2 are fluid `clamp()` targets with 100%–106% leading
and negative tracking; body is 1rem at 1.62; intro is 1.125rem at 1.5; metadata, captions
and figcaptions are 0.75rem at 1.75 with 0.025em tracking. Tight leading belongs to
display and number styles only. Anything a person reads in paragraphs stays at 1.3 or
above, and 1.5–1.62 is the norm.

Numbers are set in DM Mono so that columns of figures align and so a value reads as a
measurement rather than as prose.

## Layout

Container max-width 1200px (NASA's `desktop-lg`), site margins 16px below desktop and
32px at desktop and above, grid gutters 4px on mobile, 16px from tablet, 24px at
widescreen. Breakpoints: 640 / 880 / 1024 / 1200 / 1400 / 1920.

Spacing comes from the scale in the frontmatter and never from an arbitrary value. The
scale's own documentation says what each step is for: 8px relates elements inside one
component, 16px separates siblings, 24px separates sections inside a component area,
32–48px separates components, 64px pads a major layout block.

Operations screens are dense by nature. Density is achieved with the 4px and 12px steps
inside components and hairline rules between rows, not by shrinking type below 12px or by
dropping leading below 1.3.

## Elevation & Depth

NASA's system has no shadow scale, and this product adds none. Depth is expressed three
ways only: surface value (`spacesuit-white` card on `carbon-05` page, `carbon-10` for a
sunken well), a 1px `carbon-20` hairline, and — for the one thing that must float above
the page, the map's popups and panels — a single short shadow. Anything that needs a
shadow to be understood is a layout problem.

Focus is a 1px dashed `carbon-black` ring at 1px offset, per NASA's focus tokens. It is
never removed, never replaced by a colour change alone, and never drawn in a tint that
disappears on a tinted surface.

## Shapes

Corners are square. `--hds-border-radius-default` is 0px and applies to cards, buttons,
modals, tables, headers and footers; `--hds-border-radius-control` is 2px and applies only
to small interactive controls (checkbox, radio, select, text field, chip). Pills built
from `rounded-full` are not part of this system: a state chip is a 2px-radius rectangle
with a 1px border in the state's hue.

Borders are 1px for structure (card, input, table rule) and 2px for emphasis (button
outline, chip outline, an accent edge). There is no 3px or 4px border anywhere; a thick
coloured edge on one side of a card is the most recognisable tell of unconsidered UI, and
NASA's own components do not use one.

## Components

- **Primary button** — NASA red, white label, square, 12px/24px padding, hover to
  `nasa-red-shade`. Navigates or commits; never toggles something in place.
- **Secondary and outline buttons** — NASA blue, or white with a 2px blue outline and
  `nasa-blue-shade` label. On-page actions.
- **Card** — white on the carbon-05 page, 1px `carbon-20` rule, square, 24px padding. No
  card inside a card: a nested grouping becomes a hairline-divided section or a table.
- **Link** — `nasa-blue-shade`, underlined in body copy, with the URL appended in DM Mono
  on the printed emergency handout.
- **Caution callout** — `seq-orange-10` fill, `seq-orange-90` text, 2px
  international-orange left edge, square corners.
- **Table** — `carbon-05` header row in the metadata style, 1px `carbon-10` row rules,
  repeating `thead` on every printed page, tabular figures in DM Mono.
- **State chip** — 1px border in the state hue, 2px radius, `carbon-90` label on
  `carbon-05`/white; caution states use the orange ramp pair; a failing state on a dark
  surface uses `nasa-red-tint` on `seq-orange-100` (6.0:1).

Motion uses `--ease-emphasized: cubic-bezier(0.2, 0, 0, 1)` and
`--ease-standard: cubic-bezier(0.2, 0, 0.2, 1)` at 150ms and 300ms. Both decelerate.
Nothing bounces, springs, pulses or loops: an animation on an operations surface
either explains a change of state or it is noise.

## Do's and Don'ts

**Do**

- Take every colour, size, gap and radius from a token. If a value is not in the scale,
  the scale is wrong or the value is wrong; decide which, in the open.
- Keep red for navigation and errors, blue for on-page interaction, orange for status.
- Use the carbon ramp for every grey, and `carbon-60` or darker for any text.
- Give tinted surfaces text in a darker shade of their own hue.
- Restate text colour wherever dark mode restates a background.
- Set figures in DM Mono, right-aligned in tables, with the unit in the column header.
- Let a hairline do the work a shadow is usually asked to do.

**Don't**

- Don't introduce a second grey ramp (slate, zinc, gray, neutral) or a second accent
  family (purple, violet, indigo, cyan-on-dark). Both are off-system and both read as
  unconsidered.
- Don't gradient a heading, a metric or any text. Solid colours only.
- Don't round a card, a button or a modal, and don't put a thick accent border on a
  rounded element.
- Don't wrap a card in a card.
- Don't bounce, pulse or loop motion, and don't animate layout properties.
- Don't set body copy tighter than 1.3 leading, or below 12px, or grey on a tint.
- Don't decorate a public surface with imagery or styling that could be read as an
  observation, a measurement or a forecast — see `docs/PUBLIC_SURFACE.md`.
