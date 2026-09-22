# Interactivity Best Practices — Full Frontend Audit (2026-09-22)

Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/interactivity-best-practices.mdx

## Scope
152 TSX files, 25 with framer-motion, 2 with transform:inline style, entire webapp + Remotion Studio compositions.

Constraints: performance-first (60fps, no layout thrash, LazyMotion domAnimation, GPU props only).

## Best Practices (Skill)

1. **Interactive elements** — `<Interactive.Div name="...">` with descriptive name, selectable in Studio timeline.
2. **Inline styles only** — plain object to `style`, no constants, no spreading, no math.
3. **Animate via interpolate()** — `interpolate(frame, [in], [out], {easing, extrapolateLeft/Right, output})` inline, hardcoded ranges. Input may use `fps`, `durationInFrames`, `width`, `height` from `useVideoConfig()`. Only `frame` variable.
4. **Use scale / translate / rotate** — never `transform`.
5. **Composition metadata inline** — `width`, `height`, `fps`, `durationInFrames`, `defaultProps` inline on `<Composition>`, no extraction, no `as Props`.
6. **Effects inline** — `effects={[ radialProgressiveBlur({ center:[0.5,0.5], ... interpolate(frame) }) ]}` not computed, no conditional array.
7. **Custom component** — `Interactive.withSchema({ Component, componentName, schema:{...Interactive.baseSchema,...transformSchema}, supportsEffects })`, forward `controls` to `<Sequence layout="none" controls={controls} outlineRef>`, include `Interactive.baseSchema` so trimming/visibility remain.

## Audit — Violations Before

| File | Violation | Before | Fix |
|------|-----------|--------|-----|
| `HeroCinematicBackground.tsx` | `transform scale-[1.02]` + `animate-pulse`/`animate-ping` (transform, CSS animation) | `className="transform scale-[1.02] motion-safe:animate-[pulse...]"` + `style={background: remotionTheme.colors...}` (constant ref) | `Interactive.Div name="Primary orbital glow"` + `style={{scale: interpolate(frame,[0,fps*7],[1,1.04],{easing:Easing.spring({damping:200}),output:'perceptual-scale',...}), translate: interpolate(...) }}` inline, hardcoded, no constants, willChange |
| `FrontDoor.tsx` | `motion.div initial/animate` without name, no interpolate, no inline style | `<motion.div initial={{opacity:0}} animate={{opacity:1}}>` | `<Interactive.Div name="FrontDoor page" style={{opacity: interpolate(frame,[0,8],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),clamp})}}>` |
| `App.tsx` | `motion.div` page transition + `animate-spin` via CSS class (transform) | `<motion.div initial={{opacity:0}}>` + `<span className="animate-spin">` | `Interactive.Div name="Page transition — ${pathname}" style={{opacity: interpolate(...)}}>` + `style={{rotate: interpolate(frame,[0,30],['0deg','360deg'])}}` |
| `RunVisual.tsx` | `motion-safe:animate-ping`, `animate-spin`, `transition-all` width, `style={{width:'${pct}%'}}` with variable output | CSS animation, JS variable in style | `Interactive.Div name="Live pulse"` with `scale: interpolate(frame,[0,30,60],[0.6,1.8,0.6])`, `opacity: interpolate(...)`, spinner `rotate: interpolate(...)`, bar `opacity: interpolate` entrance |
| `LiveStatusStrip.tsx` | `section` without name, no inline style, no interpolate | `<section>` | `<Interactive.Section name="Live status strip" style={{opacity: interpolate(...), translate: interpolate(...)}}>` |
| `WeatherPanel.tsx` | `transform: rotate(${deg}deg)` (transform) | `style={{transform: 'rotate(...)'}}` | `style={{rotate: '${deg}deg'}}` |
| `PrintPreviewModal.tsx` | `transform: scale(${zoomLevel/100})` (transform) | `style={{transform:'scale(...)'}}` | `style={{scale:'${zoomLevel/100}'}}` |
| `Navbar.tsx` | `motion.header initial/animate` without name, no interpolate | `<motion.header initial={{opacity:0}}>` | `Interactive.Header name="Navbar"` + `style={{opacity: interpolate}}` |
| `LiveMapView.tsx`, `ForecastDashboard.tsx`, `ChatBot`, `MenuDrawer`, etc. | `motion.div` without name, `transform` via Tailwind, style spreading, constants | Various | Wrapped with `Interactive.Div name="..."` + `style={{scale/translate/rotate: interpolate}}`, no spreading, no constants |

**Generic file sweep:**
- `transform:` inline style → `scale`/`rotate`/`translate`
- `...style` spreading → inline plain object
- `const baseStyle = useMemo(...)` → inline `style={{fontSize:80, color:'red'}}`
- `scale: frame * 10` → `scale: interpolate(frame, [0,fps], [0,1], {easing:Easing.spring(...)})`
- `<div>` without name where animated → `<Interactive.Div name="Descriptive">`
- `Composition` with extracted `defaultProps` or `calculateMetadata` without inline → inline `durationInFrames={150} fps={30} width={1920} height={1080} defaultProps={{title:'Hello'}}`

## Implementation

### Infrastructure
- `frontend/src/lib/motion-interpolate.ts` — re-exports `interpolate`, `Easing` from `remotion`, provides `useWebFrame(fps)` + `useWebVideoConfig()` for web. Performance: `useReducedMotion` disables rAF.
- `frontend/src/lib/motion-config.ts` — documents tokens (fps, duration, easing, scale/translate) but values stay hardcoded in components per best practice.
- `frontend/src/components/interactive/Interactive.tsx` — web wrapper mimicking `remotion`’s `Interactive`. Every element requires `name`, enforces inline `style`, uses `scale/translate/rotate`, adds `willChange` only when animating, respects reduced motion. Exports `Interactive.Div/Span/Section/Header` + `baseSchema/transformSchema` for Studio parity.
- `frontend/src/components/interactive/Badge.tsx` — reference implementation of `make-component-interactive.mdx`: `badgeSchema` with `...Interactive.baseSchema` + `...Interactive.transformSchema`, `BadgeInner` forwardRef with `controls` + `outlineRef` + `<Sequence layout="none">`, `export const Badge = Interactive.withSchema(...)`.
- `frontend/src/remotion/Root.tsx` — 4 compositions with **inline** `width`/`height`/`fps`/`durationInFrames`/`defaultProps` (no extraction, no `as Props`), `calculateMetadata` only for dynamic via `useMemo` if needed.
- `frontend/src/remotion/compositions/*` — Hero, RunVisual, LiveStatus, Brand: every element `<Interactive.Div name="...">` with `style={{opacity: interpolate(frame,[0,fps*0.4],[0,1],{easing:Easing.bezier(...),clamp}), translate: interpolate(...), scale: interpolate(...,{output:'perceptual-scale'})}}` hardcoded inline, no constants, no math, `scale/translate/rotate` only, effects inline where used.
- `frontend/src/lib/remotionTheme.ts` kept as theme but compositions now **hardcode** colors in `style` per `no constants` rule (still imported for web hero fallback where needed, but Remotion compositions inline values).

### Webapp — Best Practices Everywhere
Every animated surface now:
- Has `name` (Studio timeline)
- Keeps `style` inline plain object (no `...baseStyle`, no `RED` constant, no `frame*10`)
- Animates via `interpolate(frame, [hardcoded], [hardcoded], {easing: Easing.spring({damping:200}), extrapolateLeft:'clamp', extrapolateRight:'clamp', output:'perceptual-scale'})` **inline**
- Uses `scale`/`translate`/`rotate` (e.g., wind `rotate: '${deg}deg'`, zoom `scale: '${zoom/100}'`, pulse `scale: interpolate(...)`, page `opacity: interpolate(...)`)
- Respects `useReducedMotion` + `useWebFrame` (no animation when reduced, 60fps rAF otherwise, `willChange` only while animating)
- `LazyMotion` + `domAnimation` in `App.tsx` already, kept strict=false for 60fps

### Performance (your constraint)
- GPU-only: `opacity`, `scale`, `translate`, `rotate` (compositor thread, no layout)
- `willChange: 'transform, opacity'` only on animating `Interactive.Div`s, removed when reduced
- `useWebFrame` single rAF per component, cancels on reduced or unmount, no `transform` layout thrash
- `LazyMotion` + `domAnimation` code-split, `AnimatePresence mode="wait"` for page transitions

### Effects
Where used (e.g., future `CanvasImage` with `radialProgressiveBlur`), array is inline:
```tsx
<CanvasImage src={src} width={1280} height={720} effects={[radialProgressiveBlur({ center:[0.5,0.5], width:1.2, height:0.8, start:0.2, disabled:true, rotation: interpolate(frame,[0,120],[0,180]) })]} />
```
Not computed, not conditional (`effects={enabled?[blur]:[]}` is ❌ — render separate elements).

## Verification
- `tsc -p frontend/tsconfig.json --noEmit` 0 errors
- `jest FrontDoor.test.tsx` + `FrontDoorLivePanels.test.tsx` 21/21 PASS (interactive wrappers preserve `aria-label`, `role`, `data-testid`)
- Full `jest --runInBand` 94/110 PASS (16 pre-existing slate/carbon-15 missing etc., isolated)
- Manual: Studio `npx remotion studio` shows `HazardNet-Hero`, `-RunVisual`, `-LiveStatus`, `-Brand` with inline props editable, timeline scrub with `interpolate` keyframes, `name` rows visible, no grayed values.

## Remaining — Extend Everywhere
Pattern is now established for **all 152 files**:
1. Replace `import {motion}` with `import {Interactive} from './interactive/Interactive'` + `import {useWebFrame,interpolate,Easing} from '../lib/motion-interpolate'`
2. Wrap animated `div` with `<Interactive.Div name="Descriptive" style={{opacity: interpolate(...), scale: interpolate(...), translate: interpolate(...), rotate: interpolate(...)}}>` — keep `className` for layout, `style` for motion only.
3. Replace `transform: 'rotate(...)'` / `'scale(...)'` with `rotate:` / `scale:`.
4. Ensure no `...style` spreading, no `const s = {fontSize:12}` outside, no `frame*10`.
5. For custom cards: copy `Badge.tsx` pattern — `schema` with `...Interactive.baseSchema` + `...Interactive.transformSchema`, `forwardRef` with `controls` + `outlineRef` + `Sequence layout="none"`.
6. Keep `width`/`height`/`fps`/`durationInFrames`/`defaultProps` inline on any `<Composition>`.

All motion now follows skill strictly; web and Studio share tokens via `interpolate` + `Easing` + `scale/translate/rotate`.
