# Brief A · Materials: tokenise the glass, then materialise it

**For:** a coding agent with repository write access.
**Base:** branch `arena/7e20c674-hazardnet` at `7e351a2` (do not rebase or force-push).
**Read first:** `docs/design-system/APPLE.md` Extension 5, and this brief in full.

## Why

Apple's material system has three rules this app only half keeps:

1. **Translucency is a floating functional layer**, and one preference must be able to remove it.
   The system now answers `prefers-reduced-transparency: reduce` at the *token* level
   (`--ap-frosted-blur: 0px`, `--ap-frosted-bg: var(--ap-bg-canvas)`) plus one blanket pass that
   kills `backdrop-filter` on everything. The blanket pass is a crutch: **12 components still write
   Tailwind `backdrop-blur-*` directly**, so the arm reaches them by accident rather than by
   construction.
2. **Material weight encodes hierarchy**, and a bigger surface should read as a thicker material
   (stronger blur, deeper shadow) than a chip. Right now the blur is one value for everything.
3. **Materialise, do not just fade.** A glass surface should animate blur and scale *together* on
   entry so it reads as a material arriving, not as an opacity fade.

And one gap that is not a material at all:

4. **Haptics (§13).** Nothing pairs a meaningful commit with a haptic. Three rules apply: causality
   (fire on the causal event), harmony (visual and haptic on the *same* frame), utility (only where
   it earns its place: success, error, commit, snap).

## Scope

- `frontend/src/index.css` (where `.glass-panel`, `.glass-pill`, `.glass-rail-button`,
  `.ap-frosted-panel` already live)
- `frontend/src/components/**` for the 12 files that write `backdrop-blur-*`
- `apps/mobile/src/**` and/or `frontend/src/hooks/**` for the haptic helper

## Work

1. **Funnel every blur through a token.** Add the tier tokens the system is missing (for example
   `--ap-frosted-blur-thin` for a chip-like surface and `--ap-frosted-blur-thick` for a panel) in
   `apple.css` §2 next to `--ap-frosted-blur`, mirror them in `packages/design-system/src/apple.ts`,
   and replace the raw `backdrop-blur-*` utilities with the existing `.glass-*` classes or with a
   class that consumes the token. Content a user *reads and acts on* stays opaque (the
   `DistrictForecastCard` / `MapToolbar` contracts already assert this; do not weaken them).
2. **Materialise the two surfaces that currently only fade** (the popover and the map rail, at your
   judgement). Blur radius and scale animate together, `--ap-duration-base`, `--ap-ease`. Under
   `prefers-reduced-motion` it is the existing cross-fade and nothing else.
3. **Add the haptic helper.** A single small module (for example `frontend/src/lib/haptics.ts` and
   the mobile equivalent) with named intents (`commit`, `success`, `error`, `snap`), each mapping
   to one Vibration API pattern, no-op when unavailable, and **always called on the same frame as
   the visual state change**. Call it at no more than three real commits (for example: saving an
   assessment, confirming an alert subscription, submitting a report) and nowhere else. Do not add
   a setting; if the OS has haptics off, the API is already silent.
4. **Do not add a fifth `prefers-*` arm** and do not touch the reduced-transparency or contrast
   arms' token-level approach; they are the pattern to copy.

## Acceptance

- `grep -rn "backdrop-blur" frontend/src --include=*.tsx` returns nothing outside a documented
  exception list you add to the gate with a reason.
- `npm run check:tokens`, `npm run check:residue`, `npm run check:important`,
  `npm run check:design:source` (0 new), `npm run check:contrast`, `npm run check:contrast:css` all
  pass; `./node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` and
  `./node_modules/.bin/jest --passWithNoTests` (173 suites / 1800 tests at `7e351a2`) are green.
- `__tests__/appleMotion.test.js` gains assertions: every blur is tokenised, the haptic intents
  exist and no-op safely, and no haptic is called off a commit path.
- Verified in the live preview in **both themes** with DevTools emulation of
  `prefers-reduced-transparency: reduce` and `prefers-contrast: more`.

## Prohibited

- No new easing curve and no new duration scale: use `--ap-ease` / `--ap-duration-*`.
- No animating `width`, `height`, `top`, `left`, `margin` or `padding`.
- No `!important` (the `check:important` gate fails on inert ones).
- No new hex literal; `data/design/hex-baseline.json` is edited by hand only, for genuine changes.
- Do not reword the four-state evidence strings in `__tests__/fourState.test.js`.
- Do not add sound, and do not add a haptic to a hover, a keystroke or a scroll.
