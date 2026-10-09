# HazardNet — Visual System

**Status:** active · **Notional direction:** Apple · **Build path:** code
**Applies to:** every surface that ships from `hazardnetbd.work` (108 prerendered routes).

This is the authority for the visual layer. Primitives, shared components, and route-level
compositions all derive from the tokens here. Where a page's own brief conflicts with this
document, the brief wins for that page only; it does not amend the system.

This document governs appearance. It deliberately says nothing about forecasting, model
architecture, training data, benchmarking, or severity derivation — those are research-private
under `docs/PUBLICATION_POLICY.md`. Nothing here implies a capability the product does not have.

---

## 1. The world

HazardNet is read in daylight, outdoors, on cheap Android phones, often by someone who has
walked to a neighbour's house to check a screen. Sometimes it is read at a desk by a researcher
comparing seasons. The same screen serves both.

Apple's language suits this because it is a language of **restraint under load**: large quiet
surfaces, one idea per screen, type doing the structural work, colour reserved for meaning.
That maps onto our problem. A hazard level is not decoration — it is the one thing on the screen
that must survive glare, a cracked screen, and a glance.

**What we take from Apple:** the neutral ramp, the label hierarchy, the tint system, generous
vertical rhythm, deep and specific shadows, type as the primary hierarchy device.

**What we do not take:** Apple's marketing gestures. No full-bleed product theatre, no
scroll-choreographed reveals, no oversized display type floating in empty space. We are a
public instrument, not a product launch.

---

## 2. Grounds

Two grounds, both first-class. Light is the default ground for reading; dark is the default
ground for night and for low-light outdoor use. Neither is a decoration of the other.

Surfaces are Apple's neutral ramp, expressed as an **auto-inverting scale**: a token inverts to
its counterpart when the ground flips, so a component written once is correct on both grounds.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--hn-bg` | `#FFFFFF` | `#000000` | Page ground |
| `--hn-surface` | `#FFFFFF` | `#1C1C1E` | Cards, panels, sheets |
| `--hn-surface-2` | `#F5F5F7` | `#2C2C2E` | Recessed panels, table stripes, wells |
| `--hn-surface-3` | `#EEEDF3` | `#3A3A3C` | Inputs on a raised surface |

Text is Apple's label ramp:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--hn-text` | `#1D1D1F` | `#F5F5F7` | Body, headings |
| `--hn-text-2` | `#6E6E73` | `#98989F` | Secondary, labels, captions |
| `--hn-muted` | `#86868B` | `#8E8E93` | Tertiary, metadata, axes |

**Tinted surfaces** — hazard bands, callouts, banners — tint the ground rather than painting a
flat block. Secondary text inside a tinted surface is tinted *from that hue*, never greyed. This
is the rule most often broken and the one that decides whether a band looks designed.

**Separators** are hairlines: `rgba(0,0,0,0.10)` on light, `rgba(255,255,255,0.12)` on dark.
One pixel. A visible grey rule between sections is a defect.

---

## 3. Colour

Colour carries **meaning only**. If a colour does not indicate state, severity, or interactivity,
it should be neutral.

Severity is a closed, ordered ramp. Each level owns one hue, and the hue is never reused for
anything else anywhere in the product.

| Level | Light | Dark | Bangla |
|---|---|---|---|
| Severe | `#D70015` | `#FF453A` | মারাত্মক |
| High | `#FF9500` | `#FF9F0A` | উচ্চ |
| Moderate | `#AF8300` | `#FFD60A` | মধ্যম |
| Low | `#007A33` | `#30D158` | স্বল্প |
| Minimal / none | `#6E6E73` | `#98989F` | সর্বনিম্ন |

The light values are darkened against Apple's defaults — this is a deliberate divergence, and the
reason is in §7.

**One accent.** Interactive chrome uses Apple system blue — `#0071E3` on light, `#2997FF` on
dark — and nothing else. No secondary accent, no brand gradient, no colour-used-for-personality.

**Fills** are translucent so they sit correctly on any ground:
`rgba(0,0,0,0.04 / 0.08 / 0.16)` on light, `rgba(255,255,255,0.06 / 0.12 / 0.20)` on dark.

**Depth** is a soft, offset shadow — never a zero-offset halo, never a hard block offset.
`0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.10)` is the raised card; lower steps drop the
second layer. Shadows fade on dark, where elevation reads through surface lightness instead.

---

## 4. Type

**The honest stack.** We do not ship a Latin webfont. Our total self-hosted font budget is
**50 KiB**, and Bengali (which has no platform substitute and is a first-class language here)
takes **43.3 KiB** of it. That leaves no room for a credible Latin face, and a bad subset is
worse than none.

So Latin resolves through the platform stack — `-apple-system, BlinkMacSystemFont, "SF Pro Text",
"Segoe UI", Roboto, sans-serif`. This is not a fallback: it is the same decision Apple's own
site makes, and on the devices our users hold it renders SF Pro or a close System Sans. Bengali
resolves through the self-hosted face, which is metrically matched to the stack's x-height so
Bangla and English copy can sit on the same line without the Bangla reading as a different
product.

**Scale.** One family. Body 17px/1.47. Headings step in obvious jumps — 48 / 40 / 32 / 24 / 20 —
with tracking tightening as size grows, floored at `-0.03em`. Display type caps at 6rem.

**Measure** is 65–75 characters for prose. Wide screens earn wider margins, not longer lines.
Headings balance their wraps; a heading ending in one stranded word is a defect.

**Numbers** in tabular contexts — forecasts, levels, comparisons — are `font-variant-numeric:
tabular-nums` and never reflow between updates.

**Bangla** is not a translation layer. It sets at a slightly larger size and looser line-height
than its English counterpart, because the script's ascenders and matras need the room. Any
component that fits English but clips Bangla is broken.

---

## 5. Layout

A 12-column grid, 20px gutters, content capped at **1280px** and centred with fluid side margins.
Breakpoints at 734px, 1068px, and 1440px — Apple's own, chosen because our analytics show that
is where real devices actually cluster.

**Vertical rhythm** comes from a single spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
Section separation is generous — 96px on desktop, 64px on mobile. Within a section, related
things sit 8–12px apart; unrelated things sit 48px or more apart. Space above a heading exceeds
space below it, so a heading belongs to what follows it.

**Cards are not the default container.** Content flows on the ground and is separated by spacing
and alignment. A card earns its place when it groups something that must travel together — a
hazard card, a map panel, a data table. Cards are never nested inside cards.

---

## 6. Motion

One authored moment per screen. Everything else is a state change.

Entrances run 480–680ms on an exponential ease-out, starting from an already-visible default —
never from invisible. Hover and press are 200ms and 120ms. If the user has asked for reduced
motion, everything resolves to its end state instantly; nothing is removed, nothing is hidden.

**This product has a hard constraint that overrides aesthetics: a hazard level must be readable
the instant the screen paints.** No level, threshold, or warning animates in. No severity colour
transitions on load. Motion is for navigation and disclosure, never for the reading of a warning.

---

## 7. Accessibility — binding, not aspirational

This section is not negotiable and is enforced by `npm run check:contrast`, which gates the build.

- **WCAG 2.1 AA** on *both* grounds, for text, controls, focus rings, and graphical objects.
- **Body text ≥ 4.5:1, large text ≥ 3:1.** Verified against the token pairs, not estimated.
- **44 × 44px** minimum touch and pointer target, including icon buttons and table row controls.
- **Colour never carries meaning alone.** Every severity level ships a text label and a shape cue.
  This is why the light severity hues are darkened below Apple's defaults — the stock light
  palette cannot reach 4.5:1 against white, and the divergence is the fix, not a preference.
- Visible focus on every interactive element, in both grounds, never removed for tidiness.
- Bangla and English are both first-class; neither is a fallback rendering of the other.
- Usable at 200% zoom and at 320px width.

---

## 8. Safety framing

Every surface that presents a hazard level, forecast, or advisory carries, in the same viewport
and without interaction:

1. that HazardNet is **not an official warning service**;
2. the standing authority — **BMD / FFWC** — as the source of official warnings;
3. the emergency number **999**.

This is a layout requirement, not a footnote. A design that makes these legible only after
scrolling has failed, regardless of how it scores elsewhere.

---

## 9. Imagery

Photographic imagery is used where it carries information a diagram cannot: the front door, and
the headers of major sections. Every image is **illustrative**.

Imagery documents no actual disaster, place, person, or event. No generated or stock image is
captioned, placed, or written about as though it depicts a real flood, a real river, or a real
farmer. Any image that could be read that way is labelled as illustrative at the point of use, or
is not used.

Images carry correct intrinsic dimensions to prevent layout shift, responsive sources, and alt
text that conveys the image's information — or empty alt where the image is genuinely decorative.

---

## 10. Browser surfaces

The parts of the page we did not draw still carry the system. Text selection, the caret, custom
scrollbars, focus rings, underline offset, and tabular numerals all ship with browser defaults
that belong to no design system, and all are themed from the palette here. It is the cheapest
signal that a page was built rather than assembled.

---

## 11. Reference

Authoritative Apple values live in `frontend/src/styles/apple.css`. Verification:

```bash
npm run check:tokens    # no raw values outside the token set
npm run check:contrast  # WCAG AA, both grounds, every component
npm run check:contrast:css
```
