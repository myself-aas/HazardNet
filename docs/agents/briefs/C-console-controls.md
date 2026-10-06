# Brief C · Console controls: give the controls a press, and keep the data still

**For:** a coding agent with repository write access.
**Base:** branch `arena/7e20c674-hazardnet` at `7e351a2` (do not rebase or force-push).
**Read first:** `docs/design-system/APPLE.md` Extension 5, and this brief in full.

## Why

The live console is the one surface where motion is frozen by design, and that decision is now
enforced by a test: the map / analytics / compare view swap is an instant `{activeView === 'x' && …}`
mount, with no entrance and no cross-fade. **That stays.** The defect is narrower and it is the
Apple `§1 Response` problem: several *controls* inside those views have no press state at all, so
the console feels dead at the exact moment the reader is reaching for it. Response is on
pointer-down, and it is the foundation everything else in the skill is built on.

## Scope

- `frontend/src/pages/Dashboard.tsx` (the console shell; views around lines 525–572 and 862–920)
- `frontend/src/components/map/**` (rail buttons, toolbar, layers, legend)
- `frontend/src/components/RiskAnalytics.tsx`, `frontend/src/components/DistrictRiskMap.tsx`,
  `frontend/src/components/DistrictDetailPanel.tsx`
- `frontend/src/components/alerts/**` (filter and level controls only, **not** the alert rows)

## Work

1. **Audit every interactive control in scope** and record, for each: does it acknowledge a press
   on pointer-down, and does its selection state change the *size* of its box? Produce the table in
   the pull request body, not in a new doc.
2. **Add the published role, do not invent one:**
   - a pill or a small button → the `.ap-btn` / `.ap-icon-btn` / `.ap-chip` grammar already exists;
   - a cell-sized control (a tile, a selectable layer row) → `.ap-pressable` (`0.97`, the softer dip
     for a grid of cells);
   - a full-width row → `.ap-press-row` (a background step, because scaling a row pulls its edges
     inside the panel);
   - a control whose *state* changes colour on toggle → `.ap-state-transition`, and if the state
     also changes the border **width**, fix the box first: selection must not move the label. The
     `.ap-chip` fix in `apple.css` is the pattern (a stable 1px box, selection deepens the ring).
3. **No entrance may be added to any view or panel that a data update re-renders.** In particular
   `FirebaseRealtimeStatus` polls every 800ms and re-renders 3–4 times a second; nothing in its
   subtree may gain an animation, a transition or a mount-fade. Verify by instrumenting the render
   count, not by reading the code.
4. **Keyboard parity.** Every control you touch must keep its focus ring (`--ap-focus-ring`) and its
   keyboard affordance; a press role is an addition to the focus treatment, never a replacement.
5. **Report, do not guess, on hover.** DESIGN.md documents no hover state except the `.ap-link`
   underline; if a control has a hover *motion* (a translate or a scale on `:hover`), remove it and
   note it in the table. Colour-only hover is allowed where it already exists.

## Acceptance

- `__tests__/appleMotion.test.js` still passes **and** gains an assertion that the console views
  remain an instant swap (it has one; extend it to the controls you touched so a later change
  cannot reintroduce a fade).
- `npm run check:tokens`, `check:contrast`, `check:contrast:css`, `check:residue`,
  `check:design:source` (0 new), `check:important` pass; `icons:check` passes;
  `./node_modules/.bin/jest --passWithNoTests` green (173 suites / 1800 tests at `7e351a2`).
- Verified in the live preview at 375px and desktop widths, light and dark, with the map loaded:
  every control you touched responds on pointer-down, and no map or analytics interaction regressed.

## Prohibited

- Do not animate a chart, a table, an alert row, a map marker or a view swap.
- Do not animate `width`, `height`, `top`, `left`, `margin` or `padding`; `scaleX`/`scaleY` on a
  full-size element is the substitute (`stat-bars-and-fills` in APPLE.md Extension 5).
- Do not add GSAP, Lottie or a second spring library. `AP_SPRING` and the `--ap-*` tokens are the
  only vocabulary.
- Do not touch `npm run check:design:update` or ratchet any baseline.
- Do not reword the four-state evidence strings in `__tests__/fourState.test.js`.
