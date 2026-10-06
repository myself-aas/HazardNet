# Brief B · Typography: prove the scale, then use it in the signed-in area

**For:** a coding agent with repository write access.
**Base:** branch `arena/7e20c674-hazardnet` at `7e351a2` (do not rebase or force-push).
**Read first:** `docs/design-system/APPLE.md` (Type, icons, motion; Extension 5), and this brief.

## Why

Apple's type rules (WWDC 2020, *The Details of UI Typography*) reduce to five claims, and this
system already implements most of them: tracking is size-specific (never one value), leading moves
inversely with size, hierarchy is weight + size + leading **as a set**, the platform font is
default, and layout scales *with* the user's text-size setting. The problem is that this is
**asserted in `apple.css` but never checked**, and the signed-in area is where components were
rewritten most recently, so it is where ad-hoc sizes reappear first.

## Scope

- `frontend/src/styles/apple.css` (§3 type scale, §12 Bengali extension)
- `packages/design-system/src/apple.ts` (the mirrored tokens)
- `frontend/src/components/user/**`, `frontend/src/pages/UserDashboardPage.tsx`,
  `frontend/src/pages/UserProfilePage.tsx`

## Work

1. **Prove the claim, in a test.** A test (extend `__tests__/appleParity.test.js` or add
   `__tests__/appleType.test.js`) that reads `apple.css` and asserts, mechanically:
   - `--ap-tracking-hero` is the most negative and `--ap-tracking-micro-legal` (or the smallest
     size) is not negative, i.e. tracking is monotone in size;
   - every `--ap-tracking-*` has a matching font-size, line-height and (for text roles) a weight
     from the published set `300 / 400 / 600 / 700` (there is no 500);
   - leading moves inversely: the largest size has the tightest ratio of line-height to font-size;
   - `font-optical-sizing: auto` is present on the display roles;
   - the Display/Text boundary is 20px: no `--ap-font-display` role below it and no
     `--ap-font-text` role above it, other than the documented exceptions.
2. **Remove ad-hoc type from the signed-in area.** Replace `text-sm` / `text-xs` / `text-base`
   utilities on reader-facing text in `components/user/**` with the published role classes
   (`.ap-body`, `.ap-caption`, `.ap-fine-print`, …) so a text-size change moves the whole area
   together. Keep the change mechanical and reviewable; do not restructure components.
3. **Make the layout survive a text-size change.** Any spacing that exists *because* of text (a
   gap after a label, a min-height that holds a two-line caption) becomes `rem`/`em` rather than
   `px`. Then check `frontend/src/index.css` for fixed `px` line boxes around text and report the
   ones you leave alone with a reason.
4. **Bengali is part of the scale, not an exception file.** Confirm the §12 extension still holds
   after (2) and (3): matras must not clip, and Bengali gets more room and no negative tracking.

## Acceptance

- The new type test fails on the pre-change tree for each of the five claims above (verify by
  temporarily reverting one token, not by writing a test that passes vacuously).
- `npm run check:design:source` reports **0 new**; `npm run check:design` reports 0 new on the
  document set; `npm run check:tokens`, `check:contrast`, `check:prose` pass.
- `./node_modules/.bin/jest --passWithNoTests` green (173 suites / 1800 tests at `7e351a2`).
- A short table appended to this file: role → tracking → leading → weight, and the one place where
  the claimed rule and the code disagree, with the decision you made.

## Prohibited

- **No font file is added.** SF Pro is *named*, never shipped; the single Bengali WOFF2 face is the
  only downloaded asset and `check:fonts` enforces a 50 KiB budget.
- Do not change the Display/Text 20px boundary that `check:design:source` and the parity suite
  depend on.
- Do not re-space the front door or the hero: they were completed in `3d40c97` under their own
  constraints.
- Do not touch `data/design/*-baseline.json` except by hand for entries this brief owns.
