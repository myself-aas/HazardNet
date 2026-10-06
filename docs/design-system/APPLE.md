# The HazardNet design system

> **Status:** shipped. One system, everywhere.
> **Specification:** [`DESIGN.md`](../../DESIGN.md) at the repository root — installed with
> `npx getdesign@latest add apple`, byte-identical to `apple/DESIGN.md`, and **not edited by us**.
> **Tokens:** `packages/design-system/src/apple.ts` · **CSS:** `frontend/src/styles/apple.css`
> **Native:** `packages/design-system/src/appleNative.ts`

This document covers what the specification does not: the five places HazardNet *extends* the
system, and why each extension exists. For anything else — a colour, a type style, a radius, a
spacing step — `DESIGN.md` is the answer and this file will not repeat it.

---

## The rule

There is one design system. A component may not invent a colour, a radius, a type size, a shadow
or a duration. If a value is needed and the system does not publish it, the system gets the value
— not the component.

This is enforced, not asked for:

| Gate | What it blocks |
|---|---|
| `__tests__/appleParity.test.js` | `apple.ts` drifting from `DESIGN.md`, or `apple.css` from `apple.ts`. 61 assertions, including contrast *measured* rather than asserted. |
| `__tests__/colourDiscipline.test.js` | Any source file carrying a colour the system does not publish, outside a short, justified exemption list. |
| `apps/mobile/__tests__/nativeAppleParity.test.tsx` | `appleNative.ts` diverging from `apple.ts`. A translation may change the units, never the values. |
| `__tests__/darkTheme.test.js` | A second accent appearing in the dark scope; any dark-mode text that stops clearing AA. |
| `__tests__/appleMotion.test.js` | A component animating layout properties, inventing a duration or curve, animating a keyboard-driven surface, or shipping a transition with no reduced-motion arm. |
| `npm run check:tokens` · `check:design:source` · `check:brand` · `check:prose` · `check:important` · `check:fonts` | Token compliance, stray literals, unjustified `!important`, font budget. |

### What was removed

Four systems used to coexist. All four are gone, and `appleParity` asserts they stay gone:

```
packages/design-system/src/meridian.ts            HDS v3.0 Meridian
packages/design-system/src/tokens.ts              HDS v2.2
packages/design-system/src/material3Expressive.ts Material 3
packages/design-system/src/useTokens.ts
frontend/src/styles/{meridian,dark,nasa-hds,brand}.css
frontend/src/components/meridian/primitives.tsx
frontend/src/design-system/tokens.ts
```

The `--hds-*` / `--hn-*` compatibility shim that briefly aliased the old token names onto Apple
roles is also gone: all 173 call sites were rewritten to the `--ap-*` tokens they aliased, so the
indirection had no remaining readers. `frontend/src/index.css` imports exactly two stylesheets,
`apple.css` and `hero-media.css`, and that is asserted too.

---

## Extension 1 · Dark mode

**Why:** the product is read at night, during events, on phones. Removing it was not an option.

**How it stays one system:** the dark arm is built from Apple's own dark tiles — `#272729`,
`#2a2a2c`, `#252527` and true black — rather than from inverted light values. It is the same
language at a different time of day, not a second theme with its own opinions.

Dark mode paints **before hydration** by two independent mechanisms, because either one alone
leaves a visible flash:

1. `apple.css` carries a `prefers-color-scheme: dark` arm scoped to documents not already marked
   light. This needs no JavaScript and so works on all 108 prerendered routes.
2. An inline, un-deferred boot script in `frontend/index.html` reads the stored preference and
   applies it to `<html>` before first paint. This is what honours an *explicit* choice that
   disagrees with the OS — the case CSS alone cannot express.

The boot script writes exactly the three things the runtime theme code writes
(`data-theme`, the `dark` class, `style.colorScheme`), so hydration is a no-op rather than a
second repaint.

---

## Extension 2 · Severity — "how bad"

**Why:** a hazard platform has to say how dangerous something is, and Apple's specification has
no opinion about that. Apple's single-accent rule governs **chrome** — links, buttons, nav. It
does not govern data.

Five levels, published in `APPLE_SEVERITY`:

| Level | Text / solid | Surface | On dark |
|---|---|---|---|
| Low | `#1d7a3e` | `#e8f5ed` | `#4ad66d` |
| Moderate | `#8a5a00` | `#fdf3e0` | `#f5b73d` |
| High | `#b3400f` | `#fdeee7` | `#ff8a5b` |
| Very high | `#c01f1f` | `#fdebeb` | `#ff6b60` |
| Extreme | `#8b0f3a` | `#fbe9ef` | `#ff7eb6` |

Every level is measured as text, as a fill, and on dark, against **both** light grounds — white
and parchment `#f5f5f7`. Measuring only on white was a real defect: greys and colours lose
roughly 8% of their ratio on the off-white canvas the product actually uses.

**Colour is never the only signal.** Every level carries a `label` and an icon alongside the hue,
per WCAG 1.4.1.

---

## Extension 3 · Hazard identity — "what kind"

**Why:** severity and hazard type are orthogonal. A flood can be low or extreme, and both
encodings appear at once, so they must never be confusable with each other or with chrome.

This extension exists because the alternative was already in the codebase and was worse: six
components each declared a private hazard palette out of Tailwind defaults, and they disagreed.
"Tropical Cyclone" was simultaneously `#7c3aed`, `#ef4444` and `#f43f5e` depending on which file
you were reading.

Eight classes, published in `APPLE_HAZARD`:

| Hazard | Text | On dark |
|---|---|---|
| Flood | `#496dab` | `#7b97c6` |
| Flash flood | `#357882` | `#30b9cf` |
| Tropical cyclone | `#a03dd1` | `#b582ce` |
| Drought | `#846b39` | `#cf9a30` |
| Heat wave | `#a75b2f` | `#d68251` |
| Cold wave | `#184962` | `#9bc1d4` |
| Severe storm | `#b1488e` | `#d199be` |
| Fire | `#ca3a2f` | `#c68580` |

Every value was **solved for, not chosen**, against four simultaneous constraints:

1. ≥ 5.0:1 on white and ≥ 4.6:1 on parchment, as text
2. ≥ 4.8:1 on the *lightest* dark tile `#2a2a2c` — the binding case, which then clears on tile 1,
   tile 3 and pure black
3. ≥ 22 CIELAB ΔE from every other hazard in the same mode, so eight categories stay separable
4. ≥ 24 ΔE from the chrome accent, so a hazard hue can never be mistaken for a control

Saturation is capped well below neon: these sit inside editorial layouts, not on a dashboard.
`APPLE_HAZARD_ALIASES` resolves the display names the app uses (including the two spellings of
flood and of storm) onto the eight keys.

---

## Extension 4 · Two density tracks

**Why:** the same system has to serve an editorial front door and an operational console. One
spacing rhythm cannot do both — the front door needs air, and `/live` needs to fit a map, a
timeline and a district table on one screen.

Both tracks share **identical tokens**: the same type scale, the same radii, the same single blue
accent, the same motion. Only the spacing step differs:

- **Editorial surfaces** take the full 80px tile rhythm from the specification.
- **`/live`** takes a tighter step off the same scale.

This is one system at two densities, not two systems. A component moved between tracks changes
its padding and nothing else.

---

## Type, icons, motion

**Type** is the platform UI face: `SF Pro Display` / `SF Pro Text` named first, `system-ui` and
the rest of the stack behind them. **No SF Pro font file is shipped** — that is asserted. The
Display/Text boundary is 20px, the weight set is `300 / 400 / 600 / 700` (there is no 500), and
body is 17px. Bengali is an extension in §12 of `apple.css`: matras clip at Latin leading, so
Bengali gets more room and no negative tracking.

**Icons** are stroked, bound to `currentColor`, and generated into `packages/design-system/src/icons.ts`.

**Motion** has one documented interaction — press is `scale(0.95)` — plus the extension in
Extension 5 below. There is no documented hover state except the `.ap-link` underline. Shadows are
near-absent by design — one product shadow, and it is not used on UI.

---

## Extension 5 · Motion

**Why:** the specification documents exactly one interaction — press is `scale(0.95)` — and no
durations, easings or entrances. Something has to carry the moments the product actually has: a
surface that appears rather than being present on load (`@keyframes ap-enter` / `ap-enter-drop`),
a control that acknowledges a press, a state change that would otherwise land in a single frame,
and the finger-tracked sheets in the mobile app. Without published roles for those, every call
site writes its own duration and curve, which is how one system ends up with five of each.

**What is NOT allowed is as much of the extension as what is.** Honouring the premise that most
moments should not animate at all:

- **Keyboard-initiated surfaces do not animate.** The command palette opens with no tween, and a
  regression test enforces it. It is used hundreds of times a day; an entrance there reads as
  latency, not polish.
- **Functional data does not animate for style.** The live console's map/analytics/compare view
  swap, the alert list, and every chart are static. Data the reader is scanning or acting on is
  the one place motion actively hinders.
- **No hover motion and no bounce on UI.** Overshoot is the mobile sheet's critically damped
  spring (`APPLE_MOTION.springStandard`), which settles without overshoot by construction; no
  cubic-bezier in the web stylesheet may overshoot.
- **Only `opacity` and `transform` animate** (`APPLE_MOTION.animatableProps`). A width/height/top/
  left tween is a layout animation: the completeness meter is `scaleX` on a full-width fill for
  exactly this reason, not a `width` transition.

**The roles** (`apple.css` §9 and §11, tokens in `packages/design-system/src/apple.ts` →
`APPLE_MOTION`):

| Role | Class | Use it for | Values |
|---|---|---|---|
| Press | `.ap-btn`, `.ap-icon-btn`, `.ap-chip`, `.ap-pressable` | A control acknowledging a press | `scale(0.95)` pills, `scale(0.97)` option cells, `--ap-duration-press` (120ms), `--ap-ease` |
| Press (row) | `.ap-press-row` | A full-width row, where scaling would pull its edges inside the panel | background step, 120ms `--ap-ease` |
| State change | `.ap-state-transition` | A tone/border swap that would otherwise be a jump cut | colours only, `--ap-duration-base` (240ms) `--ap-ease` |
| Entrance | `.ap-enter`, `.ap-enter-drop` | A surface appearing: a state block, a route body, a disclosure hanging off its trigger | 240ms `--ap-ease`, fade; `-drop` adds −4px |
| Group entrance | `.ap-stagger` | N children arriving as ONE beat | `--i` / `--n` per child, delay `min(60ms, 480ms/n) × i` |
| Value | `.ap-meter` + `--ap-meter-value` | A progress/completeness fill | `scaleX`, 240ms; **not** a motion role — the custom property carries data |
| Sheet drag | `APPLE_MOTION.springStandard` (native only) | A sheet following a finger | critically damped: stiffness 320, damping 36, mass 1 |

**Reduced motion is a floor, not a switch-off.** §11 floors every duration and delay, keeps the
meter's value intact (reset the transform there and every reduced-motion reader gets a full bar),
and keeps colour state changes, which carry meaning and are not motion.

---

## Where colour may come from outside the system

`colourDiscipline.test.js` holds a short exemption list. Each entry needs a reason of a specific
kind; "it was easier" is not one.

- **Third-party brand marks** — `ProviderGlyph.tsx`, `oauthProviders.ts`, `connectors.ts`. A
  Google "G" in the wrong blue is wrong, and the same goes for Slack, Discord and GitHub.
- **Cinematic media** — `heroMedia.ts`, `remotionTheme.ts`, the Remotion compositions, the WebGL
  globe. These are *content*, the same category as a photograph. The system governs the chrome
  around media, not the pixels inside it. (The hero background left this list on 2026-10-06: its
  colour is `lib/heroGrade.ts`, a token it reads like any other component.)
- **Generated assets** — `infinity.generated.ts` is produced by a script, not authored.

The test also asserts every exempt file *still* carries off-system colour, so a file cannot sit on
the list holding permission it no longer uses.
