# React performance audit — `vercel-react-best-practices`

**Date:** 2026-10-06
**Skill:** [`vercel-labs/agent-skills` · `vercel-react-best-practices`](https://github.com/vercel-labs/agent-skills),
read in full — 12 rules, the ones that applied are named per finding below.
**Scope:** the web app's hot paths — the entry module graph, the front-door hero, the live map.
`apps/mobile` and `apps/windows` are out of scope (they do not run this runtime), and the Remotion
compositions are out of scope deliberately: their frame loops *are* the product.
**Method:** read each rule, then grep the codebase for the shape it describes rather than reading
for style. Every finding below was reproduced before it was changed and re-measured after; the
five changes that guard a behaviour carry a test that fails when the change is reverted, and that
was checked by reverting it (four deliberate reversions, five failing tests).

**Baseline at audit time:** commits up to `0b6ff88`; 182 Jest suites / 1889 tests green; `tsc`
clean; 13/13 design and budget gates green; production build clean.

---

## Change summary

| # | Rule | Where | What changed | Measured |
|---|---|---|---|---|
| 1 | `bundle-barrel-imports` (CRITICAL) | `lib/motion-interpolate.ts` | `Easing` no longer comes from the `remotion` package root | entry chunk **174.2 → 117.9 KiB gzip** (−32%), raw 884 → 700 KiB; total 1408.5 → 1352.3 KiB |
| 2 | `rerender-split-combined-hooks`, `rerender-memo`, `rendering-hoist-jsx` | `HeroCinematicBackground.tsx` | the frame loop moved into a leaf (`HeroMeshGlow`); static layers hoisted; the carousel memoised | 420 frames of animation now re-render **one** node, not the whole backdrop |
| 3 | `rerender-derived-state-no-effect`, `js-cache-function-results`, `js-hoist-regexp` | `HeroImageCarousel.tsx` | slide lists are module constants; the probe URL is cached; the fall-forward is derived during render instead of in a third effect | preload probes: 4 per **render** → 4 per **mount**; style reads: per render → once per page load |
| 4 | `rerender-move-effect-to-event` | `pages/FrontDoor.tsx` | the page's arrival is the design system's `.ap-enter` CSS entrance, not `useWebFrame(30, 8)` + `interpolate` | the front door no longer imports the motion bridge at all; the page root no longer re-renders the page |
| 5 | `js-hoist-regexp`, `rendering-hoist-jsx` | `LiveMapView.tsx` → `hooks/useLeafletMap.ts` | basemap attribution decoded once at module load; the pin glyph de-duplicated into one constant | 2 RegExp literals + 2 passes over 170 chars per map render → 0 |
| 6 | `js-cache-function-results` | `lib/heroMedia.ts` | already correct — now pinned by test | poster data URIs are module constants, one call site |
| 7 | dead weight | `lib/heroMedia.ts`, `vite.config.ts` | five unreferenced `EARTH_HERO_VIDEO_*` exports deleted; the 113 MB × 2 MP4 trees documented and kept out of `dist/` | build output contains no `.mp4`; 226 MB never ships |

---

## Finding 1 — the entry chunk was paying for the Remotion studio `Easing`

**Rule:** `bundle-barrel-imports` — "import directly from the source module, never from the barrel
root; a barrel pulls in the whole graph for one symbol."

`frontend/src/lib/motion-interpolate.ts` is the web app's bridge to Remotion's animation maths. It
imported both of the things it needs from the package root:

```ts
import { interpolate, Easing } from 'remotion';
```

`remotion`'s root is the Studio runtime. One named import from it does not tree-shake to one
function — the entry chunk went from the app's own code to 884 KiB raw / 174.2 KiB gzip, and the
largest single contributor after React and Firebase was a studio runtime the web app cannot use.

**Fix.** The package ships a supported React-free entry, `remotion/no-react`, and it exports
`interpolate` — but **not** `Easing` (verified against the installed `remotion@4.0.529`: the
runtime namespace and `no-react.d.ts` agree, so `import { Easing } from 'remotion/no-react'` is a
`TS2305` compile error, not a runtime gamble).

So `Easing` is now a local port, `frontend/src/lib/easing.ts` (123 lines) — `Easing.bezier`, the
same React-Native-derived solver Remotion uses, transcribed from `remotion/dist/cjs/bezier.js`,
plus `Easing.linear`. The only export surface is the two members the app uses, and the module is
free of React, so the compiler is the guarantee: a missing member is an error, not a silent pull of
the heavy package.

A reimplementation of an animation curve is only acceptable if it is provably the same curve, so
`lib/__tests__/easing.test.ts` compares it against the real package it replaces:

| Evidence | Result |
|---|---|
| 8 curves × 1001 samples vs `remotion`'s own `Easing.bezier` | max absolute difference **0** |
| `Easing.linear` vs the package's | **0** |
| input clamping, endpoint pinning, monotonicity | asserted |
| x control points outside `[0, 1]` | throws, with the original's message |
| the four web files' import graph | no `from 'remotion'`; only `motion-interpolate` touches `remotion/no-react` |

And the shipped artefact, checked in `dist/assets/index-*.js`: `getInputProps`, `registerRoot`,
`delayRender` and `Internals` appear **0** times. What remains is `remotion/no-react`'s
`interpolate` and its internals (`remotionShouldExtendRight` is part of the interpolation
algorithm, not the studio).

| | before | after |
|---|---|---|
| entry chunk, gzip | 174.2 KiB | **117.9 KiB** |
| entry chunk, raw | 884 KiB | **700 KiB** |
| whole app, gzip | 1408.5 KiB | **1352.3 KiB** |
| budget (`singleChunk` 800 KiB, `total` 1600 KiB) | pass | pass |

This is also why `LiveStatusStrip`'s spring became a bezier: `Easing.spring({ damping: 200 })` was
the one call site that needed a spring, and the critically-damped spring it produced is exactly the
house decelerate curve, so `Easing.bezier(0.16, 1, 0.3, 1)` is the same motion with one fewer
concept in the port.

## Finding 2 — the hero's animation re-rendered the hero

**Rules:** `rerender-split-combined-hooks`, `rerender-memo`, `rendering-hoist-jsx`.

`HeroCinematicBackground` was a single component holding the frame loop *and* the whole backdrop
tree. `useWebFrame(30, 420)` counts to 420, so every one of the 420 frames of the mesh's breathing
animation re-rendered:

* the four-slide carousel, its four style objects and its four computed background strings,
* the poster wrapper,
* the soft-light wash and the grade node,

to move one blurred circle. On the 2 GB Android devices this page is explicitly built for
(`docs/audits/2026-10-03-landing-live-hero-audit.md` §2), that is ~14 seconds of needless work per
visit, and it is invisible in any gate the repository runs.

**Fix.** Three changes, none of them visible on screen:

1. `HeroMeshGlow` is a leaf component that owns the frame loop. State lives where it is consumed:
   a frame re-renders the glow and nothing else, and the exported backdrop renders once per
   `paused` change.
2. The three static layers (photograph wrapper, wash, grade) are module-level elements instead of
   being rebuilt each render. They have no props and no state — the Remotion contract's "no
   constants" rule is about *animated* values, and a layer that never animates has no frame to
   interpolate from.
3. The carousel is `memo`ed, because the hero's pause control re-renders the backdrop.

**Guard:** `components/__tests__/HeroCinematicBackground.renders.test.tsx` runs the **real** frame
loop on fake timers with the carousel mocked, counts its renders, and asserts it renders once while
the glow keeps moving. Reverting the fix — putting the loop back in the parent, which is exactly
what the old shape was — fails two of its three tests. The third asserts the structural half: the
file has exactly one `useWebFrame(` call site and it sits inside `HeroMeshGlow`.

## Finding 3 — the carousel rebuilt its own inputs every render

**Rules:** `rerender-derived-state-no-effect`, `js-cache-function-results`, `js-hoist-regexp`.

Four distinct costs in one 240-line component, all of them the same mistake — a value that is a
property of the page computed as if it were a property of the render:

| Cost | Was | Is |
|---|---|---|
| the slide lists | `lowBandwidth ? IMAGES.slice(0, 1) : IMAGES` — a fresh array each render, so the preload `useEffect` re-ran each render: 4 `Image()` probes and 4 more requests, in the one mode where requests are least affordable | module constants `ALL_SLIDES` / `LOW_BANDWIDTH_SLIDES`; the effect runs once per mode |
| the painted URL probe | `getComputedStyle(document.documentElement)` — a forced style resolution — per slide, per call | a module-level `Map`; one read per slide per page load |
| the slide's CSS custom-property name and background string | `split`/`replace` per slide per render | precomputed in the `Slide` record at module load |
| the fall-forward past a failed slide | a third `useEffect` watching `failed`/`index` and calling `setIndex`: render → effect → render | `firstUsable(images, failed, index)`, derived during render — same fall-forward, one fewer pass, no drift when two slides fail at once |

**Guard:** four new tests in `components/__tests__/HeroImageCarousel.test.tsx` (10 total). Each was
checked by reverting its fix: dropping the derived fall-forward, removing the URL cache, and
restoring the per-render `.slice()` each fail their own test and nothing else.

## Finding 4 — the front door faded itself in with eight re-renders

**Rule:** `rerender-move-effect-to-event` (and its cousin, "do not drive what the compositor can
drive from React state").

`FrontDoor` opened with:

```tsx
const frame = useWebFrame(30, 8);
const reduceMotion = useReducedMotion();
…
opacity: interpolate(frame, [0, 8], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1), … })
```

Eight rAF ticks of React state to fade one wrapper in — and the wrapper is the *page*. Each tick
re-rendered the entire front door: the hero, the backdrop, the carousel, and the live-fact hooks
that read the committed artifacts, plus a `will-change` layer on the page root for 267 ms.

**Fix.** The root carries `.ap-enter`, the design system's entrance from `apple.css` §11 — 240 ms
of `--ap-ease`, `both` fill, running on the compositor where React never sees it. Reduced motion is
already handled where it belongs: `index.css` collapses every animation duration under
`prefers-reduced-motion`, and `both` leaves the page at its final state, so the page still arrives
without the fade.

`pages/FrontDoor.tsx` no longer imports `useWebFrame`, `interpolate`, `Easing` or
`useReducedMotion` — the whole motion bridge is gone from the page, and a new test in
`pages/__tests__/FrontDoor.test.tsx` asserts both halves: the root element has `ap-enter`, and the
module (comments stripped) never names the motion bridge again.

## Finding 5 — the map decoded its attribution while rendering

**Rules:** `js-hoist-regexp`, `rendering-hoist-jsx`.

The live map renders thousands of markers, and in the middle of that JSX it decoded the basemap
attribution:

```tsx
{MAP_LAYERS[activeLayer]?.attribution?.replace(/&copy;/g, '©').replace(/&mdash;/g, '—') || 'Map data © OpenStreetMap contributors'}
```

Two RegExp literals allocated and two passes over a 170-character string, on every render,
including the renders the marker and tile effects trigger — for two strings that cannot change.

**Fix.** The decode moved to the module that owns the data, `hooks/useLeafletMap.ts`, as
`attributionFor(key)` over a module-level `ATTRIBUTION_TEXT` table built at load. `LiveMapView`
calls it. The `/g` flag is safe to hoist: `String.prototype.replace` resets `lastIndex`, so a
shared global regex cannot carry state.

In the same file, the 260-character crosshair glyph inside the two location pins was written out
twice, verbatim; it is now one `PIN_GLYPH_SVG` constant interpolated into both templates, so the
two pins cannot drift apart.

**Guard:** `hooks/__tests__/mapAttribution.test.ts` (6 tests): the entities are decoded for every
layer, the ODbL credits and the boundary disclaimer survive, the fallback is the OSM credit, and
the map's render path contains no `attribution?.replace` and no `/(&copy|&mdash);/`.

## Finding 6 — the poster data URIs (already correct, now recorded)

`js-cache-function-results` describes the poster: a 2.5 kB inline SVG encoded twice — once with `#`
escaped for HTML attributes, once percent-encoded for CSS `url()`. Both are module-level constants
and the encode is a single call site at load, which is right — but nothing said so, and a future
edit could move a call into a component without any test noticing. Two tests now do:
`lib/__tests__/heroMedia.test.ts` asserts that the two forms are one picture in two escapings
(exact string relationship), and that `encodeForCssDataUri` has exactly one call site, on a
module-scope `export const`.

## Finding 7 — dead video weight

Five MP4s (SD 960×540 through 4K, 113 MB) sit in `frontend/public/hero-section/`, and an identical
tree — same five files, same sha256s, verified 2026-10-06 — sits in `frontend/assets/hero-section/`,
which holds nothing else. Nothing in `src/` names any of them.

The five `EARTH_HERO_VIDEO_*` exports in `lib/heroMedia.ts` were the last reference, and they had
no importer, no test and no script; they were deleted, with a pointer note in their place. That is
the whole change to the code: one unreferenced constant is not a spare part, it is a thing the next
reader has to check.

The files stay on disk, and the two mechanisms that keep them out of a deployment are verified:

* `excludeUnreferencedHeroVideos()` in `frontend/vite.config.ts` deletes `dist/hero-section` after
  Vite copies `public/` — confirmed: `frontend/dist` contains **no** `.mp4` and no `hero-section/`.
* the service worker's precache manifest ignores `**/hero-section/*.mp4`, which is the other way
  those files would have shipped (it walks `public/` before the plugin runs).

**Not addressed, deliberately:** the 226 MB the two trees occupy in git. Those blobs are already in
history, so deleting the files at the tip would not make a clone any smaller; reclaiming that space
needs a history rewrite, which is the repository owner's call rather than a build config's. The
reasoning is recorded in the plugin's header so it is not rediscovered as a bug.

---

## Rules read and deliberately not applied

| Rule | Why not here |
|---|---|
| `rerender-use-ref-transient-values` | The one animation that must paint per frame (the mesh glow) *is* rendered — a ref would freeze it. The rule is for values that must not trigger layout, and this one causes none. |
| `rerender-lazy-state-init` | No `useState` in the app is initialised with a compute worth deferring; the two candidates (`HeroImageCarousel`'s index and failure set) are scalars and a `Set`. |
| `rerender-dependencies` | The map's Leaflet effects key on refs and deliberately omits them from their dependency arrays. Changing those arrays restarts tile layers and marker groups mid-flight; that is a behaviour change, not a perf fix, and it is out of scope for this pass. |
| `rendering-conditional-render` | The repo already uses explicit ternaries and `? :` over `&&` in every place the rule names; no `count && <X />` shape was found. |
| React Compiler / `useMemo` on trivial values | Not adopted: the app's wins here were structural (import graph, render boundary), and memoising cheap expressions adds indirection without a measurable frame. |

## Verification

| Check | Result |
|---|---|
| `tsc -p frontend/tsconfig.json --noEmit` | clean |
| `jest` (full) | **182 suites / 1889 tests** — all pass; 3 new suites, 21 new tests |
| Mutation check of the new guards | 4 deliberate reversions, every one caught (5 failing tests) |
| `vite build` | clean; 3565 modules; no `.mp4` in `dist/` |
| `check:bundle` | PASS — largest chunk 236.0 KiB gzip (budget 800), total 1352.3 KiB (budget 1600) |
| 13 gates (`check:tokens`, `check:brand`, `check:contrast`, `check:contrast:css`, `check:important`, `check:residue`, `check:svg-tokens`, `check:prose`, `icons:check`, `check:fonts`, `check:design`, `check:design:source`, `check:bundle`) | **13/13 PASS** |
| `eslint` | 0 errors, 659 warnings (cap 685) — the four new files produce none |
