# Brief D · Verification: play it in slow motion and try to break it

**For:** a verification agent with a browser-capable environment.
**Base:** branch `arena/7e20c674-hazardnet` at `7e351a2` (do not rebase or force-push).
**Read first:** `docs/design-system/APPLE.md` Extension 5, `__tests__/appleMotion.test.js`, this brief.

## Why

The apple-design skill's own process rule (`§17`) is that motion has to be reviewed **with fresh
eyes and in slow motion**, because at full speed the frame that is wrong is invisible. Playwright
cannot run in the container where `7e351a2` was authored, so the interaction-level evidence does not
exist yet. Your job is to produce it, and to say plainly what is wrong.

## Scope

Read-only on source. You may add test files, and you may file issues; **do not** change component or
stylesheet behaviour. If you find a defect, write it up with a reproduction and let the owning
agent fix it (a one-line fix is acceptable only with the reasoning in the pull request body).

## Work

1. **Run everything that could not run in the authoring sandbox.**
   - `npx playwright test` (the e2e specs in `e2e/`, including `mobile-responsive.spec.ts`,
     `navigation-a11y.spec.ts`, `critical-paths.spec.ts`) against `npm --prefix frontend run dev`.
   - `npm run check:design:update --dry-run` equivalent (do **not** ratchet): confirm the only
     outstanding entries are baseline ones and that nothing this commit touched appears as new.
2. **The motion checklist, in the live preview, at 375px and desktop, light and dark.** For each
   item: record a 30–60s capture, then step it frame by frame and state the verdict.
   - **Drawer exit** (`MenuDrawer`): it slides in from the right and now slides back out to the
     right on the house spring. Confirm it is gone on the same path, that focus returned to the
     menu button, and that the panel is **not** focusable or clickable while it leaves.
   - **Press feedback**: `.ap-chip` (it had none), an `OptionCard`, a `UsernameField` suggestion
     pill, an `OverviewSection` row. Feedback must be on pointer-*down*, and the label must not
     shift by a pixel when selection lands.
   - **Meter**: change a profile completion field and watch the `ProgressMeter` fill. It must be
     `scaleX` (no layout shift in the row) and must not re-run on unrelated re-renders.
   - **Connector grid**: the arrival must settle as **one beat**, ≤ 480ms in total including the
     last card's delay. Time it; do not eyeball it.
   - **Connector config disclosure**: the field drops in from the Connect button, 240ms, and does
     not animate its height.
   - **Theme flip**: toggle light↔dark and confirm the canvas and the large shells ease rather than
     flash, and that a press in flight is not delayed by the theme transition.
3. **The preference matrix.** With DevTools emulation, for each of
   `prefers-reduced-motion: reduce`, `prefers-reduced-transparency: reduce`, `prefers-contrast: more`
   (and `prefers-color-scheme: dark` crossed with each):
   - no animation runs at all under reduced motion, including the **stagger delays** (a grouped
     arrival must be one frame, not a queue);
   - the completeness meter still shows its **actual** value under reduced motion (a full bar is a
     regression: the fix deliberately does not flatten that transform);
   - no `backdrop-filter` survives reduced transparency, and the frosted surfaces are opaque in
     **both** themes (light-on-light and dark-on-dark are both failures);
   - under increased contrast every hairline is visible and no selected/unselected pair becomes
     indistinguishable.
4. **Try to break the contract.** Attempt, and report the result of each: put an
   absolutely-positioned overlay under the sticky bar and check it still covers the last row;
   navigate to `/dashboard` and `/profile` unauthenticated (both are gated) and confirm no entrance
   is orphaned; thrash the theme toggle 10 times quickly; interrupt the drawer mid-exit by reopening
   it; open the command palette and confirm it **still has no entrance**.

## Deliverable

A verification report appended to this file containing:

- the exact commands and their exit codes;
- a pass/fail line per checklist item with the evidence (capture name and the frame that decides it);
- every defect as **symptom → reproduction → which brief owns it**, filed as an issue and linked;
- a one-paragraph honest statement of what you could not verify and why.

A checklist item with no evidence is reported as **not verified**, not as a pass.
