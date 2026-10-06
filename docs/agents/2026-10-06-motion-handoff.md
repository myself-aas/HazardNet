# Apple-like design and motion: port, review, and handoff

**Date:** 2026-10-06 · **Branch:** `arena/7e20c674-hazardnet` (pushed)
**Work under review:** `7e351a2` · **This report and the briefs:** `29ea7ea`

| Commit | What it is |
| --- | --- |
| `28bca23` | branch base |
| `3d40c97` | hero redesign (earlier task) |
| `1460da3` | user area simplified to one card depth, one kit (earlier task) |
| **`7e351a2`** | **this task: the motion language, ported from HyperFrames and reviewed against apple-design** |

Verification at `7e351a2`: 173 suites / 1800 tests pass, `tsc --noEmit` clean, production build
clean, ESLint 0 errors, and every design gate green (`check:design` 0 new, `check:design:source`
0 new, tokens 100%, contrast, residue, brand, fonts, paths, events, svg-tokens, important, icons).

---

## 1 · The two skills, exactly as invoked

Both were run with the CLI and their **complete** output was redirected to a temp file and read
in full, with relative paths resolved from the supporting-files directory each one provides:

```bash
npx --yes skills use "https://github.com/heygen-com/hyperframes"  --skill "hyperframes-animation" > /tmp/hf-out.txt
#   supporting files: /tmp/skills-use-FAIYyI/hyperframes-animation   (122 files)
npx --yes skills use "https://github.com/emilkowalski/skills"      --skill "apple-design"        > /tmp/apple-design-out.txt
#   supporting files: /tmp/skills-use-fYH00b/apple-design
```

The apple-design run was executed a second time: the sandbox cleared `/tmp` between sessions and
the first capture was gone. Re-running produced 297 lines / 23 KB, read in full (its `SKILL.md`
is a knowledge document, not a script; Apple's WWDC material translated for the web).

**Division of labour between the two skills, as they are written.** HyperFrames is a *production*
vocabulary: one paused GSAP timeline on `window.__timelines`, seeded deterministically, seek-safe.
apple-design is a *review* vocabulary: response, interruptibility, springs, spatial consistency,
materials, preferences, typography. Neither is a drop-in library for this app, and neither was
treated as one.

---

## 2 · What was ported from HyperFrames, and what was refused

This app is a live React SPA with no GSAP. The paused-timeline contract is for scripted render
compositions and cannot apply here, so the port is **values and constraints, expressed on the
existing `--ap-*` tokens**. The full rule text, the value tables and the sources are reproduced in
Extension 5 of `docs/design-system/APPLE.md`; this is the summary.

### Adopted

| HyperFrames rule | Value taken verbatim | Where it now lives |
| --- | --- | --- |
| `press-release-spring` | press `0.96` subtle / `0.92` default, never `<0.85` or `>0.98`; press shorter than release | `.ap-btn` / `.ap-chip` press `0.95` (`--ap-press-scale`, the value DESIGN.md already pins), `.ap-pressable` `0.97` (`--ap-press-scale-soft`), 120ms `--ap-duration-press` |
| `stat-bars-and-fills` | `scaleX` /**never** `width` or `height`; fill `width:100%` + `transform-origin: left center` | `.ap-meter` + `.ap-meter-fill`, driven by `--ap-meter-value` |
| `spring-pop-entrance` | visible by t ≤ 0.5s; stagger `min(0.06, 0.5/ITEMS)`; no full-screen slide | `.ap-enter` / `.ap-enter-drop` (240ms, fade, `-drop` = −4px) and `.ap-stagger` (`min(60ms, 480ms/n) × i`) |
| `anchored-layout-expand` | author the expanded end state, never animate height; collapse faster than open | the connector config field is a transform/opacity `-drop` off its trigger, not a height tween |
| `gsap-easing-and-stagger` | `power3.out` = the standard settle; `back.out` / `elastic` = rare playful register only; overshoot on transforms only, never opacity | `--ap-ease` **is** `power3.out` in cubic-bézier form, so the entrance and the press share one curve; no overshoot anywhere in the shipped system |
| critically damped spring as house default | ζ = 1 | `APPLE_MOTION.springStandard` (320 / 36 / 1) and `AP_SPRING` |
| CSS adapter | finite durations, `animation-fill-mode: both`, stagger by custom property, no hover/scroll triggers | `.ap-enter` uses `both`; `.ap-stagger` uses `--i` / `--n` |

### Refused, with the reason

- **GSAP / a paused timeline.** No dependency is added. The rules' *measurements* survive; the
  runtime they were written for does not apply to a live app.
- **`items × stagger ≤ 0.5s` as a fixed window.** Kept, but self-capping per group (`480ms / n`)
  rather than a constant, so a two-card group and a nine-card group both settle in time.
- **A whole-document theme wipe (`theme-crossfade-morph`).** The safety-critical console must not
  look like a slideshow while it is being read. The minimal, correct version is the existing
  `data-theme` + `colorScheme` flip with the *canvas and static shells* eased (see §3).
- **Any entrance on the command palette.** It is used hundreds of times a day; an animation there
  reads as latency. A test now forbids `ap-enter*` on it.
- **Any motion on the live console's map / analytics / compare view swap.** Data being scanned or
  acted on is where motion actively hinders. A test locks the instant swap.

---

## 3 · The apple-design evaluation, and the six things it changed

The skill was applied as an **evaluator of the completed work**, criterion by criterion. Where it
found a defect, the defect was fixed in the same commit. Verdicts:

| § | Criterion | Verdict on `1460da3` | Fix in `7e351a2` |
| --- | --- | --- | --- |
| 1 | Feedback on pointer-down, never on release | **Pass** | every press role is `:active`; nothing waits for `click` |
| 1 | No artificial latency on the input path | **Pass** | no debounce, timer or transition-delay was found on an input path |
| 3 | Interruptible, animates from the presentation value | **Pass** | interactions are CSS (interruptible by definition); the drag sheet is a spring that re-targets |
| 4 | Spring defaults: damping 1.0 (no overshoot) | **Fail** | seven call sites wrote `stiffness: 350` with damping 25–30, i.e. ζ ≈ 0.67 and an overshoot on every menu that was merely *pressed*. All now route through `AP_SPRING` = `APPLE_MOTION.springStandard` (ζ = 1); a test holds ζ ≥ 1 everywhere except the drag sheet, the icon set's own critically damped variant, and Remotion content |
| 7 | Enter and exit along the same path | **Fail** | the menu drawer slid in over 220ms on a curve of its own and then vanished in a *single frame*. It now leaves by the path it arrived on, on the house spring, and the fourth easing curve is gone |
| 7 | Mirrored easing on reversible transitions | **Fail** | same fix: one spring, both directions |
| 11 | Compositor-friendly properties only | **Fail** | the completeness meter animated `width`, relayouting its row every frame. It is now `scaleX` on a full-width fill |
| 12 | Translucent chrome, scroll edges, no stacked light surfaces | **Pass** | `--ap-frosted-bg` + `backdrop-filter` on the subnav and sticky bar; the sticky bar carries no hard divider; no light-on-light stacking found |
| 12 | Material weight encodes hierarchy | **Partial** | Tailwind `backdrop-blur-*` survives in 12 components outside the token (brief A) |
| 13 | Motion + sound + haptics fire on the same frame | **Not addressed** | no haptics exist yet (brief A, item 3) |
| 14 | `prefers-reduced-motion` is a gentler equivalent, not off | **Pass** | the floor already existed; it now also zeroes the stagger *delay* (a duration floor cannot reach a delay) and keeps the meter's value instead of flattening every bar to full |
| 14 | `prefers-reduced-transparency` | **Fail (absent)** | added as a token-level arm: `--ap-frosted-blur: 0px`, `--ap-frosted-bg` → the opaque canvas, plus a blanket pass for the un-tokenised Tailwind blurs |
| 14 | `prefers-contrast: more` | **Fail (absent)** | added: hairlines re-point at `--ap-label-secondary`, `--ap-elev-hairline` becomes a real border, frosted surfaces go solid |
| 14 | Ease dark↔light theme changes | **Fail** | the flip was one frame. Now eased on the canvas and the large **static** shells only, so no state change lags its own press |
| 15 | Size-specific tracking, leading tracking size inversely | **Pass** | the scale already carries per-size `--ap-tracking-*` and `--ap-leading-*`, with a Bengali extension |
| 16 | Validate inline, not on submit | **Pass** | `Field` / `TextField` render `error` inline at the control |
| 16 | Restraint: decide what *not* to build | **Pass** | the refused list in §2 is the same principle applied |

### The two judgement calls worth recording

1. **No overshoot in the shipped system.** HyperFrames says the critically damped spring is the
   house default and reserves overshoot for the playful register; apple-design says bounce belongs
   only to a gesture that *carried momentum* and is wrong on a menu that merely faded in. Both
   agree, `APPLE_MOTION.springStandard` is already critically damped, and the only momentum-driven
   surface is the mobile drag sheet. So ζ < 1 is now a test failure, not a style preference.
2. **The theme flip is not a cross-fade.** Apple asks for the brightness change to be eased rather
   than abrupt; a document-wide cross-fade would turn the live console into a slideshow. The
   compromise is the canvas plus the static shells. Interactive and state-carrying roles are
   deliberately excluded from that transition list, and a test asserts they stay excluded.

### One behaviour change, and the test it moved

The drawer's exit animation means the panel is still unmounting for ~350ms after close.
`NavbarSimplicity.test.tsx` asserted it was gone synchronously; it now waits, exactly as its
sibling test in the same file already did after a navigation choice. The assertion is unchanged in
strength (`queryByTestId` must return `null`), only in timing. The e2e specs need no edit: they use
auto-waiting `toBeHidden`.

---

## 4 · Files

| Area | Files |
| --- | --- |
| The vocabulary | `frontend/src/styles/apple.css` (§9 roles, §11 entrances, stagger, preferences, theme ease) |
| The tokens | `packages/design-system/src/apple.ts` (`pressScaleSoft`), `frontend/src/components/apple/motion.ts` (`AP_SPRING`) |
| The consumers | `components/user/dashboard/ui.tsx`, `OverviewSection.tsx`, `ConnectorsSection.tsx`, `components/ui/DataState.tsx`, `pages/UserDashboardPage.tsx`, `pages/UserProfilePage.tsx`, `components/MenuDrawer.tsx`, and the six spring call sites |
| The contract | `__tests__/appleMotion.test.js` (15 assertions), `__tests__/appleParity.test.js`, `docs/design-system/APPLE.md` Extension 5 |

---

## 5 · Dispatch to multiple agents

No agent CLI is installed in this sandbox and no agent API key is present in the environment, so
the report is dispatched through the channel that coding agents actually read: **four GitHub
issues, one per agent**, each self-contained with scope, files, acceptance criteria, the gates to
run and the prohibitions. The briefs are also committed under `docs/agents/briefs/` so an agent
pointed at the repository finds them without network access.

| Agent | Brief | Dispatched as |
| --- | --- | --- |
| **A · Materials** (tokenise the glass, materialise it, add the haptic helper) | `docs/agents/briefs/A-materials.md` | [#78](https://github.com/myself-aas/HazardNet/issues/78) |
| **B · Typography** (prove the scale as a test, then use it in the signed-in area) | `docs/agents/briefs/B-typography.md` | [#79](https://github.com/myself-aas/HazardNet/issues/79) |
| **C · Console controls** (a press on every control, and no motion on the data) | `docs/agents/briefs/C-console-controls.md` | [#80](https://github.com/myself-aas/HazardNet/issues/80) |
| **D · Verification** (frame-by-frame review, preference matrix, break attempts) | `docs/agents/briefs/D-verification.md` | [#81](https://github.com/myself-aas/HazardNet/issues/81) |

Issues #78–#81 are the dispatch: each carries its brief verbatim plus the report it came from, so
an agent that only sees the issue tracker has everything it needs, and an agent that only sees the
repository has the same text on disk. Two things are deliberately **not** dispatched: the frozen
console view swap and the rejected list in §2 are constraints on the briefs, not work items.

Every brief carries the same non-negotiables, because they are the ones this task learned the hard
way: only `opacity` and `transform` animate, one duration scale and one curve, no motion on
keyboard-first surfaces or on data being read, no motion without a reduced-motion arm, and no new
`!important`. Each brief names the gate command that proves it.

---

## 6 · Open, and deliberately not done here

- **Haptics (§13).** Nothing in the app pairs a commit with a haptic. Brief A carries it.
- **Twelve components still bypass the frosted token** with Tailwind `backdrop-blur-*`, so the new
  reduced-transparency arm reaches them only through the blanket pass. Brief A tokenises them.
- **`components/ui/motion-navigation-menu.tsx` has no consumers**, and carries a ζ = 0.5 spring. It
  is vendored and orphaned; the gate exempts it by name rather than deleting code this task did not
  own. Worth a separate decision.
- **Playwright cannot run in this sandbox**, so the e2e specs and the frame-by-frame playback the
  apple-design skill asks for (§17) are Brief D's job, in an environment with browsers.
