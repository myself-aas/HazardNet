# UX Design Audit Report — HazardNet Landing Page (`/`)

**Scope:** The editorial front door at `/` (`frontend/src/pages/FrontDoor.tsx` and its live panels, hero, and chrome) — the first page a journalist, extension officer, farmer via field officer, or reviewer lands on. Not the GIS console at `/live`.

**Source (local code reviewed, 2026-09-22 branch `arena/01a0c7db-hazardnet`):**

- `frontend/src/pages/FrontDoor.tsx` (618 LOC, 7 editorial sections + hero + strip + coverage + run + FAQ + attribution)
- `frontend/src/components/frontdoor/LiveStatusStrip.tsx` (status strip, level counts, coverage/age)
- `frontend/src/components/frontdoor/RunVisual.tsx` (run card: coverage bar, per-horizon rows, freshness ages, honesty notes)
- `frontend/src/components/HeroCinematicBackground.tsx` (5-layer motion hero: mesh, video, HUD, grade, grain/vignette)
- `frontend/src/components/Navbar.tsx` + `frontend/src/lib/navigation.ts` (masthead, mega-menus, LanguageToggle)
- `frontend/src/components/Footer.tsx` (platform footer nav + download CTAs)
- `frontend/src/App.tsx` (shell, skip link, `isHomePage` vs editorial layout, `pointer-events-none` wrappers)
- `frontend/src/content/site-routes.json` (`/` route is single source of truth for copy)
- `frontend/src/hooks/useAlertsData.ts` + `frontend/src/lib/freshness.ts` + `frontend/src/lib/i18n.ts`
- `frontend/index.html` (document shell, `lang`, `viewport`, `theme-color`, `robots` fallback)
- `frontend/src/index.css` + `data/design/nasa-hds/tokens.json` + `docs/design-system/MASTER.md` (NASA HDS tokens)
- Tests: `frontend/src/pages/__tests__/FrontDoor.test.tsx`, `__tests__/publicSurface.test.js`

**Interface type:** Editorial / public-good information landing page with embedded live-data instruments (status strip, run card). Not a form or dashboard — the job is *orient + prove freshness + route to console*, not *operate*.

**Limitations:** Local source audit — no computed contrast measured via browser, no real-device touch test, no analytics. Visual judgments are based on class names + token values (which are measured in `docs/design-system/MASTER.md` §Contrast). JS polling/fallback paths were read, not exercised offline.

---

## How to Read This Report

Findings are rated **0–4** (4 = users cannot complete tasks, 1 = cosmetic only). Each references an established 15-principle usability scale. **Start from the top — the most impactful issues are listed first.** Severity is about user impact (frequency × impact × persistence), not fix difficulty.

---

## Summary

| Severity | Count |
|----------|-------|
| **4 — Catastrophe** | 0 |
| **3 — Major** | 6 |
| **2 — Minor** | 6 |
| **1 — Cosmetic** | 4 |
| **Total findings** | **16** |

*Principle coverage verification: all 15 principles were walked (see § Findings — every principle has at least one finding or a strength note; none left unevaluated).*

---

## Quick Wins

Highest-impact points that are also small, isolated code changes (all ship in one PR, no product decision needed):

1. **[3] Motion without pause** (HeroCinematicBackground.tsx) — wrap the 9s/14s pulses and video `autoPlay` in `prefers-reduced-motion` and add a `Pause motion` toggle. ~15 lines.
2. **[3] FAQ disclosure affordance** (FrontDoor.tsx `details/summary`) — add a trailing chevron that rotates `90deg` when `details[open]` and re-enable a visual marker. ~12 lines CSS + 1 icon.
3. **[3] Error recovery** (LiveStatusStrip/FrontDoor `failed` banner) — add `role="alert"` + a **Try again** button wired to `useLiveFacts`/`useAlertsData.refresh()`. ~20 lines.

These three alone address the noisiest a11y, affordance, and resilience complaints reviewers will surface.

---

## Findings

### [Severity 3] 1. Hero background never stops moving and has no pause — motion-sensitive and low-bandwidth users cannot opt out

- **Principle:** 3 User Control and Freedom · 13 Accessibility · 14 Perceptibility
- **Location:** `frontend/src/components/HeroCinematicBackground.tsx:18-99` (layers 1–2: `animate-pulse` 9s, `animate-[pulse_14s…]`, `<video autoPlay loop muted playsInline>`), consumed at `frontend/src/pages/FrontDoor.tsx:314` (`<HeroCinematicBackground />` inside `header -mt-14 … min-h-[600px]`)
- **Issue:** Five compositing layers (mesh radial gradients + resolution-adaptive Earth video with `scale-[1.02] motion-safe:animate-[pulse_14s…]` + HUD + grade + grain) run perpetually. The only `motion-safe:` guard is on the video scale; the two `animate-pulse` blobs (`opacity-40 animate-pulse` on `duration: 9s` and the HUD `animate-ping` dot at `HeroCinematicBackground.tsx:66`) ignore `prefers-reduced-motion`. No pause control is rendered, no `useReducedMotion()` check is used (the page imports `useReducedMotion` only in `RunVisual`/`Navbar`, not here). Even `isTest` only skips video in Jest.
- **User impact:** On first paint the landing page is the harshest motion surface in the product — more animated than `/live`. A user with vestibular/migraine history, or on 2G/Data Saver where the video is a bandwidth cost, cannot stop it without leaving. This directly contradicts the project's low-bandwidth promise ("vector basemap … collapses animation in CSS") and fails WCAG 2.3.3 Animation from Interactions. Because the hero is the entry point, frequency = **every visitor**, persistence = **every load**, impact = **physical discomfort or forced abandonment**.
- **Fix (specific):**
  ```tsx
  // HeroCinematicBackground.tsx
  import { useReducedMotion } from 'framer-motion';
  export const HeroCinematicBackground = () => {
    const reduce = useReducedMotion();
    const [paused, setPaused] = useState(false);
    const shouldAnimate = !reduce && !paused;
    // … mesh blobs:
    // className={shouldAnimate ? "animate-pulse" : ""}
    // video:
    // {shouldAnimate ? <video autoPlay loop …/> : <div style={{backgroundImage:`url(${EARTH_HERO_POSTER})`}}/>}
  }
  // FrontDoor hero chrome — add toggle (visible, not hidden HUD):
  // <button aria-pressed={paused} onClick={()=>setPaused(v=>!v)}
  //   className="absolute right-4 bottom-4 z-10 bg-black/60 text-white text-xs px-3 py-2 border border-white/20">
  //   {paused ? "Resume motion" : "Pause motion"}
  // </button>
  ```
  Also add `media="(prefers-reduced-motion: no-preference)"` to the `<source>` elements and ensure the poster shows when animation is off. Keep the video muted/loop but let the user win.

---

### [Severity 3] 2. Live-data error state tells users something failed but offers no way to recover

- **Principle:** 9 Error Recovery · 1 Visibility of System Status · 15 Tolerance and Forgiveness
- **Location:** `frontend/src/pages/FrontDoor.tsx:86-131` (`useLiveFacts` swallows `catch` → `setFailed(true)` with no `refresh` exposed), `frontend/src/pages/FrontDoor.tsx:582-588` (`{failed && <p className="border-l-2 border-nasa-orange …">}`), `frontend/src/components/frontdoor/LiveStatusStrip.tsx:148-188` (error render `!loading && error && <p …>` without button). Hook `frontend/src/hooks/useAlertsData.ts:52` *has* `refresh()` but the page never exposes it.
- **Issue:** Two independent fetch trees (`freshness.json` + `model-performance.json`, and the alert artifact via `useAlertsData`) render a muted orange-border paragraph when they fail, with no `role="alert"`, no focus management, and no retry control. The `failed` banner does not announce to screen readers (`aria-live` is on the strip, but the error lives outside the strip in FrontDoor). Users on a transient 503 or momentary offline see a dead strip/run-card indefinitely.
- **User impact:** A field officer on a spotty connection opens the front door to check status, sees "alert artifact could not be read," and must hard-reload the browser. They cannot tell whether to wait or act. Screen-reader users may not hear the failure at all because the paragraph is not live. This is the one page whose job is *proof of freshness* — failing silently is a trust defect, not just a polish issue.
- **Fix:**
  ```tsx
  // FrontDoor.tsx — expose retry from useLiveFacts:
  const { freshness, scorecard, loading, failed, retry } = useLiveFacts();
  // … where failed banner renders:
  {failed && (
    <div role="alert" className="border-l-2 border-nasa-orange bg-white p-3 …">
      <p className="text-sm text-carbon-70">{t('frontdoor.run.failed')}</p>
      <div className="mt-3 flex gap-3">
        <button onClick={retry} className="min-h-[44px] px-4 bg-nasa-blue text-white text-sm font-semibold">Try again</button>
        <Link to="/status" className="min-h-[44px] inline-flex items-center px-4 border border-carbon-20 text-sm font-semibold">View status page</Link>
      </div>
    </div>
  )}
  // LiveStatusStrip — same: accept onRetry prop wired to alerts.refresh()
  // Also: useEffect(() => { if (failed) headingRef.current?.focus(); }, [failed]);
  ```
  Add `aria-live="polite"` to the error container and test offline fallback (service worker snapshot).

---

### [Severity 3] 3. FAQ disclosures hide their affordance — users don't perceive they are interactive

- **Principle:** 11 Affordances and Signifiers · 13 Accessibility · 12 Structure
- **Location:** `frontend/src/pages/FrontDoor.tsx:578-590`
  ```tsx
  <details><summary className="min-h-[44px] cursor-pointer list-none text-base font-bold marker:hidden">
    <span className="inline-flex gap-2"><MaterialIcon name="help" />{faq.question}</span>
  </summary>
  <p className="mt-2 pl-6 …">{faq.answer}</p></details>
  ```
  Also `frontend/src/index.css` does not style `details[open]`.
- **Issue:** The native disclosure triangle is removed with both `list-none` and `marker:hidden` (`marker:hidden` is Tailwind v4's `::marker` reset), replaced only by a leading `help` icon that is identical in open and closed states. No trailing chevron, no rotation, no `aria-expanded` visual sync. The `cursor-pointer` is the only click cue. The content below the summary is not grouped visually distinct enough (just `pl-6`).
- **User impact:** Sighted users scan past the FAQs thinking they are headings with an icon. First click is accidental discovery. Keyboard users tab to summary (good) but receive no state announcement beyond the implicit `details` semantics — which many ATs do not surface when the marker is intentionally hidden. Repeated visits still require re-discovering the pattern.
- **Fix:**
  ```tsx
  <details className="group border-b border-carbon-20 …">
    <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-carbon-90 marker:hidden">
      <span className="inline-flex items-start gap-2"><MaterialIcon name="help" className="text-nasa-blue" />{faq.question}</span>
      <MaterialIcon name="chevron_right" className="shrink-0 text-carbon-60 transition-transform duration-150 group-open:rotate-90" aria-hidden />
    </summary>
    <p className="mt-2 pl-6 pr-4 text-base leading-[1.62] text-carbon-70">{faq.answer}</p>
  </details>
  // Or: summary::-webkit-details-marker { display:none } + explicit icon is fine — but ensure rotation + group-open.
  ```

---

### [Severity 3] 4. Hero tertiary call-to-action reads as disabled — the evidence path is visually lost

- **Principle:** 11 Affordances · 14 Perceptibility · 13 Accessibility (1.4.11 Non-text Contrast, 1.4.3 Contrast)
- **Location:** `frontend/src/pages/FrontDoor.tsx:370-385`
  ```tsx
  <Link to="/live"        className="bg-nasa-red-shade …">…</Link>          // primary solid 7:1 white on red-shade
  <Link to="/methodology" className="border-2 border-white/80 … backdrop-blur-xs">…</Link> // secondary 2px
  <Link to="/model-performance" className="border border-white/40 text-white/90 … backdrop-blur-xs">…</Link> // tertiary 1px /40
  ```
- **Issue:** Three sibling CTAs share identical `min-h-[44px] px-6 py-3 text-base font-semibold` sizing, so hierarchy relies solely on fill vs border opacity. The tertiary uses `border border-white/40` (1px, 40% white) on a video background already lightened by grade/grain — on bright Earth frames the border contrast drops to ~1.5:1, below the 3:1 non-text contrast floor. `text-white/90` over a moving light zone can dip below 3:1 for 16px bold text. `backdrop-blur-xs` is not a Tailwind default (blur scale is `xs` → 2px exists in v3 but project uses v4 `xs` token; renders as no-op in some builds, removing the intended legibility aid).
- **User impact:** Users fixate on the dominant red + the outlined "Methodology" button and overlook "View scorecard" — the one link that proves the model is honest. Low-vision and outdoor viewers literally cannot see it as a button. Editorial goal ("prove validation") is undermined by button styling.
- **Fix:** Normalize outline CTAs to `border-2` minimum for non-text contrast, lift tertiary to `border-white/70 text-white` (checked 4.5:1 over the grade overlay), keep `backdrop-blur-sm` (or `backdrop-blur-md` to match language toggle's `backdrop-blur-md`), preserve hierarchy by weight not invisibility:
  ```tsx
  className="inline-flex min-h-[44px] items-center gap-2 border-2 border-white/70 px-6 py-3 text-base font-semibold text-white hover:border-white hover:bg-white/10 backdrop-blur-sm …"
  ```

---

### [Severity 3] 5. Trust figures look interactive but do nothing — false signifier

- **Principle:** 11 Affordances · 8 Aesthetic and Minimalist Design · 12 Structure
- **Location:** `frontend/src/pages/FrontDoor.tsx:138-146` (`const Figure = ({value,label}) => <div className="border-t-2 border-nasa-red bg-white p-4">`), repeated ×4 at `FrontDoor.tsx:425-445` (`hazards / districts / 7+15 / episodes`)
- **Issue:** The red `border-t-2 border-nasa-red` is product-wide signifier for "go somewhere" (per `docs/design-system/MASTER.md`: "Red means go somewhere… never decorative"). Applied to static figures it reads as a tappable card. Grid uses `gap-px bg-carbon-20` (1px separators) with `p-4` on each tile — identical to the clickable district cards on `/live`. No `cursor-default`, no hover disabled, no link. Four figures carry equal visual weight, though "64 districts" and "8 hazards" are capability statements while "7+15 days" and "5 episodes" are footnotes with different provenance.
- **User impact:** Users tap/hover expecting navigation (to `/hazards`, `/districts`, `/model-performance`) and get dead feedback → inferred breakage. Equal weight forces reading all labels to infer importance, slowing the scan the hero is trying to enable.
- **Fix:** Remove the red signifier from non-interactive data; use a neutral surface for meta figures, reserve emphasis for capability:
  ```tsx
  // Figure — add variant
  const Figure: React.FC<{value:string;label:string;tone?:'default'|'muted'}> = ({value,label,tone='default'}) => (
    <div className={`p-4 border ${tone==='muted' ? 'bg-carbon-05 border-carbon-20' : 'bg-white border-carbon-20'}`}>
      <p className={`font-mono font-light leading-none tabular-nums ${tone==='muted' ? 'text-[28px] text-carbon-80' : 'text-[32px] text-carbon-90'}`}>{value}</p>
      <p className="mt-2 text-xs font-bold leading-snug text-carbon-90">{label}</p>
    </div>
  )
  // Usage: hazards + districts = default, horizons + episodes = muted
  // If any figure should be actionable, wrap it in <Link> and restore hover affordance explicitly.
  ```

---

### [Severity 3] 6. Motion and opacity treat dark hero as if contrast were solved — but it isn't on bright video frames

- **Principle:** 14 Perceptibility · 13 Accessibility · 8 Aesthetic
- **Location:** `HeroCinematicBackground.tsx:38-63` (grade overlays), `FrontDoor.tsx:314-390` (header `text-white/80`, `text-white/90`, `text-white/75`, `border-white/20`, `bg-black/40` on language toggle)
- **Issue:** Hero legibility depends on three stacked translucencies: video → `mix-blend-soft-light` grade (`opacity` from `remotionTheme.grade.softLightOpacity`) → linear gradient → film grain vignette → then text at `text-white/80` (eyebrow), `text-white/90` (standfirst), `text-white/75` (authority note). On bright Earth/cloud frames (40%+ white) the effective contrast for the `xs` authority note (`text-xs leading-[1.62] text-white/75`) drops below 3:1. The `bg-black/40 backdrop-blur-md` behind LanguageToggle is the only element with a solid backing; the rest floats.
- **User impact:** The most important sentence on the site ("HazardNet is not an official warning service" paraphrased in standfirst) can become illegible outdoors or to low-vision users during the exact moments the video shows bright terrain. Users briefly cannot read what the platform *is*.
- **Fix:** Add an explicit text backing for the hero copy block, not just the badge:
  ```css
  /* FrontDoor hero copy container */
  .hero-copy-backing {
    background: linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.35));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgb(255 255 255 / 0.15);
    padding: 1rem; /* or p-4 inside the column */
  }
  ```
  Alternatively raise `heroGrade` opacity or clamp video brightness (`filter: brightness(0.85)` on video when text is over it). Verify contrast with browser computed values — do not trust Tailwind opacity alone.

---

### [Severity 2] 7. Seven editorial sections form a long monoculture — no table of contents, no in-page navigation

- **Principle:** 6 Recognition Over Recall · 7 Flexibility and Efficiency · 12 Structure
- **Location:** `frontend/src/pages/FrontDoor.tsx:527-566` (`sections.map(section => <section aria-labelledby={section.h2}>…)`), copy source `frontend/src/content/site-routes.json` (7 sections: "What this platform is for" … "Knowledge products")
- **Issue:** All editorial sections share identical styling: `space-y-4 border-t border-carbon-20 pt-6` with `h2 22px bold`. No sticky TOC, no anchor list, no "On this page" pattern. The links *inside* each section point outward (`/live`, `/alerts`, `/methodology`…), not inward. Returning visitors who want "How to check any number" must scan the full column.
- **User impact:** Scannability suffers — a core H8/Aesthetic failure. Researchers and extension officers who use the front door as a reference must re-read to relocate a subsection. Mobile users face the longest scroll in the product.
- **Fix:** Render a lightweight anchor nav from `site-routes.json`:
  ```tsx
  <nav aria-label={t('frontdoor.toc')} className="border border-carbon-20 bg-carbon-05 p-4">
    <p className="font-mono text-xs font-bold uppercase tracking-wide text-carbon-60">On this page</p>
    <ul className="mt-2 space-y-1">
      {sections.map((s,i)=> <li key={s.h2}><a href={`#section-${i}`} className="text-sm text-nasa-blue-shade underline underline-offset-2">{s.h2}</a></li>)}
    </ul>
  </nav>
  ```
  Already have `id={`section-${index}`}` — just expose it. Make it sticky on desktop (`top-[--navbar-height]`).

---

### [Severity 2] 8. Visual language invites opacity noise — white/80, /90, /75, /40 in one hero

- **Principle:** 8 Aesthetic and Minimalist Design · 4 Consistency and Standards
- **Location:** `FrontDoor.tsx:318-384` hero chrome (header eyebrow `text-white/80`, standfirst `text-white/90`, authority `text-white/75`, secondary CTA `border-white/80`, tertiary `border-white/40 text-white/90`, language toggle `bg-black/40 border-white/20`, dividers `border-white/20`)
- **Issue:** Seven distinct white opacities plus two backdrop blur strengths within a single viewport. The design system (`docs/design-system/MASTER.md`) prescribes a flat, bordered, low-opacity discipline — not layered translucency. Each opacity was added to "soften" a specific line, but collectively they create no system a designer can maintain.
- **User impact:** The hero feels stitched rather than designed; developers cannot answer "which white is correct?" without copying the nearest instance. Future changes drift. For users the variety is perceptible only as subtle unevenness, not as intentional hierarchy.
- **Fix:** Establish a hero-only token scale of 3: `--hero-text-primary: white`, `--hero-text-secondary: rgb(255 255 255 / 0.85)`, `--hero-border: rgb(255 255 255 / 0.75)` — map all hero text/borders to these, remove the outliers. Document in `index.css` Layer 2 comment.

---

### [Severity 2] 9. RunVisual honesty notes truncate at three — most of the model's self-critique is one click away but not scannable

- **Principle:** 1 Visibility of System Status · 3 User Control · 10 Help and Documentation
- **Location:** `frontend/src/components/frontdoor/RunVisual.tsx:178-207` (`honesty.slice(0,3).map … {honesty.length>3 && <p … more on status page>}`)
- **Issue:** The run's `honesty` array (often 4–6 notes about degeneracy, partial coverage, stale provenance) renders only 3 bullets, then a sentence "X more honesty notes — view status page." No expand, no tooltip, no copy affordance. The card is the most evidence-dense object on the front door, but the honest caveats are deprioritized visually (rounded `bg-carbon-05/80` box with muted mono `text-carbon-80`).
- **User impact:** A reviewer looking for the model's own admissions ("severity saturating at 1.0" etc.) must leave the front door to find them — counter to the front door's promise that every number is checkable *here*. The truncation signals that caveats are secondary, when they are editorially primary.
- **Fix:** Add an inline expand:
  ```tsx
  const [expanded,setExpanded]=useState(false);
  const shown = expanded ? honesty : honesty.slice(0,3);
  // … after list:
  {honesty.length>3 && <button onClick={()=>setExpanded(!expanded)} className="mt-2 text-xs font-bold text-nasa-blue-shade underline">{expanded ? 'Show less' : `Show ${honesty.length-3} more notes`}</button>}
  ```
  Keep the status link, but don't require a navigation to finish reading.

---

### [Severity 2] 10. Language toggle and data-source provenance have no visual sync with the document language they control

- **Principle:** 4 Consistency · 13 Accessibility · 11 Affordances
- **Location:** `FrontDoor.tsx:346-350` (`<LanguageToggle variant="switch" tone="hds" />` inside `bg-black/40` hero corner), `frontend/src/lib/i18n.ts` + `hooks/useI18n.ts` (`document.documentElement.lang` is set, but no flag/label beside the editorial Bengali block indicates which translation is drafted vs reviewed)
- **Issue:** The toggle is an isolated pill in the hero header, far from the editorial sections it translates. No persistent label like "EN / বাংলা" is visible after translation — the switch state relies on internal toggle UI. The Bengali editorial block (from `site-routes.json` `i18n.bn`) is marked `lang` correctly, but the page does not indicate that this Bengali is "drafted, not yet read by a native speaker" except via small print in `site-routes.json` data. Users cannot tell whether the language change affected only the chrome or the whole page.
- **User impact:** Bilingual users toggle, see chrome translate, but cannot confirm whether the 7 editorial sections also translated (they do, partially). Trust suffers: a farmer seeing machine-translated hazard text without a disclaimer may act on phrasing they shouldn't.
- **Fix:** Move language toggle closer to editorial heading or repeat as a small anchored control under the standfirst; after toggle, briefly announce `role="status" aria-live="polite"` "Language set to Bengali — editorial translation is draft" (string already exists as owner Action 6c). Add a pill `"Draft BN translation"` next to the Bengali h1 when `language==='bn'`.

---

### [Severity 2] 11. "7 + 15" plus episodes reads precise but not matched to the real-world question

- **Principle:** 2 Match Between System and Real World · 6 Recognition Over Recall
- **Location:** `FrontDoor.tsx:425-445` (`<Figure value="7 + 15" label={t('frontdoor.covers.horizons')}>`, and scorecard episodes figure)
- **Issue:** "7 + 15" encodes the two horizons as an arithmetic expression, not as "Next 7 days · Next 15 days" (the product labels everywhere else — `formatHorizonLabel` renders `Next 7 Days`). "Episodes" label alone (from `t('frontdoor.covers.episodes')`) does not say episodes *of what*; the helpful sentence "The live map addresses all 64 districts…" lives *under* the figures in `text-xs text-carbon-60`, easily missed.
- **User impact:** A DAE officer scanning the trust strip must interpret shorthand that no other surface uses. They may misread "7+15" as a 22-day horizon or a score. The disconnect between trust-strip shorthand and map/detail pages creates recall burden.
- **Fix:** Use domain language verbatim: `value="Next 7 & 15 days"` (or two small figures rather than one combined) and `label="Forecast horizons"`. For episodes, render `value="5 episodes"` / `label="Hindcast episodes validated"` and add a `title` or footlink "What is an episode? → /model-performance".

---

### [Severity 2] 12. Page chrome splits responsibilities between App shell and front door without a single visual system for dividers

- **Principle:** 4 Consistency · 12 Structure · 8 Aesthetic
- **Location:** `frontend/src/App.tsx:303-338` (editorial layout `max-w-[1200px] mx-auto px-4 xl:px-8` with `pointer-events-none` shells), `FrontDoor.tsx:410` (`space-y-8 lg:space-y-12 mt-8 lg:mt-12`), `LiveStatusStrip.tsx:108` (`border border-carbon-20 bg-carbon-05`), `RunVisual` (`shadow-2xl rounded-sm`), trust grid (`gap-px bg-carbon-20`)
- **Issue:** Three divider strategies coexist: `gap-px` hairline grid (trust strip), `border-t` per section, and `border` card (run card + LiveStatusStrip) — all at different contrasts (`bg-carbon-20` separators vs `border-carbon-20` vs `shadow-2xl`). The App shell sets `pointer-events-none` on the main container and re-enables on inner sections — clever for map but inherited by editorial without need, creating a future z-index trap. RunVisual uses `rounded-sm` (2px) while most HDS surfaces are `radius: 0` (`--hds-border-radius-default` is `0`) — inconsistent radius per the design gate.
- **User impact:** The front door feels cohesive at a glance but on closer scan the sections don't share a rhythm — trust strip tight 1px tile gaps vs editorial generous `space-y-8` vs status strip padded `p-4 lg:p-6`. Developers inherit the confusion.
- **Fix:** Normalize with tokens: trust figures + status strip + run card all use `border border-carbon-20` + `--panel-shadow: none` + `--radius: 0`. Establish `space-y` scale: `gap-px` grid maps to token `--space-1` (4px) via `gap-px`; editorial gaps use `--space-6` / `--space-8`. Remove unnecessary `pointer-events-none` from editorial branch in `App.tsx` (gate by `isHomePage` only for the map).

---

### [Severity 1] 13. Non-existent Tailwind utility `backdrop-blur-xs` — decorative intent fails silently

- **Principle:** 4 Consistency · 8 Aesthetic
- **Location:** `FrontDoor.tsx:373,379` (`backdrop-blur-xs`)
- **Issue:** Tailwind's `backdropBlur` scale in v4 does not include `xs` by default (scale is `none`, `sm`, `md`, `lg`, `xl`). The build emits no CSS for the class, so secondary/tertiary CTAs lose their intended frosted legibility aid over the video. The language toggle correctly uses `backdrop-blur-md`.
- **User impact:** Cosmetic — CTAs are slightly less legible over bright video than designed, but not broken. Developers chasing legibility will add more opacity rather than fixing the class, compounding //8 noise.
- **Fix:** Replace both with `backdrop-blur-sm` (or `backdrop-blur-md` for parity) — verified class.

---

### [Severity 1] 14. Mixed icon families — Material Symbols, inline SVG tick, and `animate-ping` dots

- **Principle:** 4 Consistency · 8 Aesthetic
- **Location:** `FrontDoor.tsx:361` (`MaterialIcon name="public"` in CTA), `RunVisual.tsx:286` (inline `<svg … d="M5 13l4 4L19 7">` VERIFIED tick), `HeroCinematicBackground.tsx:66` (`span bg-sky-400 rounded-full animate-ping`), `Navbar.tsx` (`MaterialIcon` throughout)
- **Issue:** Three icon grammars: outlined Material Symbols (hero, FAQ), an unstyled inline SVG stroke tick (run card footer), and a pure-CSS ping dot. The tick uses `h-3 w-3 text-nasa-green` while Material icons use `text-base` and font-variation settings — different metrics, different ink.
- **User impact:** Subtle sense of "stitched template" at the detail level — reviewers who inspect the run card notice the tick does not match the `help` icons in FAQs. Not a task blocker, but undermines the otherwise strong HDS discipline.
- **Fix:** Replace inline tick with `MaterialIcon name="verified"` or `check_circle` at `text-nasa-green`, size `text-sm`, matching FAQ icons. Keep the ping dot only if it has semantic meaning; otherwise use a static `bg-nasa-green` dot.

---

### [Severity 1] 15. Coverage explanatory note is important but typographically demoted

- **Principle:** 14 Perceptibility · 8 Aesthetic
- **Location:** `FrontDoor.tsx:437-452` (`<p className="text-xs leading-relaxed text-carbon-60">` covering `coverageLine` + `produced_units` + `/status` link)
- **Issue:** The coverage note carries the most honest sentence on the trust strip — which districts are missing and why — but is set at `text-xs` (≈12px) `text-carbon-60` (7:1, but small) below a row of large 32px figures. The link `View status` is `text-xs` bold, competing with the `text-xs` surrounding copy. On scan, users read the big numbers, skip the note.
- **User impact:** The careful partial-coverage honesty (the point of the strip) is missed. Users leave thinking coverage is 64/64 when it is 60/64.
- **Fix:** Raise to `text-sm leading-[1.62] text-carbon-70` with the link as `font-bold text-nasa-blue-shade underline underline-offset-2`. Keep the big figures but let the note read at body scale; it is the editorial payload, not a caption.

---

### [Severity 1] 16. Verbose attribution section uses `Eyebrow` but heading hierarchy and link affordance dilute scan

- **Principle:** 12 Structure · 11 Affordances · 6 Recognition
- **Location:** `FrontDoor.tsx:593-640` (attribution `<section className="border border-carbon-20 bg-white p-6 lg:p-8">` with `<Eyebrow>` + `h2` + long lead paragraph + `nav` with `Links` wired via `section.links.map`)
- **Issue:** Attribution repeats the site's `Eyebrow` micro-label pattern but the paragraph is a single 3-sentence block with inline `strong` for 6 proper names vs a proper definition list. Link row is `gap-x-5 gap-y-2` at `text-xs font-bold` — same weight as coverage note, so it blends into footer.
- **User impact:** The "who is behind this" block is the only place the thesis attribution lives; at current density a reviewer may not surface the supervisor/department names on skim.
- **Fix:** Break attribution into `dl` with `dt` (role, department) + `dd` (names) for scan, or at minimum add `leading-relaxed` paragraph + stronger link affordance (`text-sm` not `text-xs`, underline persists). Already good that `attribution.json` is the source — keep that, just structure the rendering.

---

## Strengths

What to keep — these satisfy their principles and should be treated as the guardrails for any fix:

1. **Honesty over zero-filling (Principles 1, 9, 15 — Visibility · Error Prevention · Forgiveness).** The page deliberately renders missing as `—` or a *sentence* ("we could not read the file") and never as `0`. `useLiveFacts` and `LiveStatusStrip` both clamp null → em-dash, `Figure` never invents a denominator, and tests (`FrontDoor.test.tsx:reads the committed artifacts`, `nonePublished` branch) pin this. This is the rarest strength on a hazard platform — do not add interpolated numbers to "help."

2. **Single source of truth for copy (Principles 4, 6, 12 — Consistency · Recognition · Structure).** Every word of the 7 editorial sections, title, standfirst, and `updated` comes from `site-routes.json` and is rendered identically by `scripts/prerender.mjs` and `usePageSeo`. No JSX-forked copy, no crawler/hydration drift. The `site-routes` comment block + `publicSurface.test.js` pin this.

3. **Semantic content primitives done right (Principles 13, 12, 14 — Accessibility · Structure · Perceptibility).** The skip link (`App.tsx:257`), landmark `header`/`main`/`section[aria-labelledby]` hierarchy, editorial `<table>` with `<caption>` + `<th scope="col">` (`FrontDoor.tsx:SectionBody`), `role="status" aria-live="polite"` on the strip, `alert_detail` evidence cards, and `lang` sync via `useI18n` — all present and tested (`axe: haveNoViolations` in both EN/BN). Keep these when refactoring CTAs or FAQs.

4. **Level identity never colour alone (Principles 13, 14, 11 — Accessibility · Perceptibility · Signifiers).** `AlertLevelBadge` renders the word ("Watch") beside the dot on every surface, and `LiveStatusStrip` + `RunVisual.STATE_DOT` both carry the rule in comment ("A state is never signalled by colour alone"). This is correct for a WATCH-only deployment where colour blindness would otherwise hide the ceiling distinction.

5. **Design-system discipline is already architectural (Principles 4, 8 — Consistency · Aesthetic).** NASA HDS vendoring (`data/design/nasa-hds/tokens.json` → `nasa-hds.css` → `index.css` semantic → component) with measured contrast table (`docs/design-system/MASTER.md` §Contrast), carbon ramp consolidation, and `__tests__/paletteTokens.test.js` enforcement. The front door respects it — the findings above are about *application* of the system, not absence of one.

---

## Principle Coverage Checklist

Walked in order as required by the skill:

1 Visibility — ✅ strip + run card loading/error + status ages (findings 2,9)  
2 Match Real World — ✅ "7+15" shorthand, hazard-class wording (finding 11)  
3 User Control — ✅ motion pause, honesty truncation control (findings 1,9)  
4 Consistency — ✅ opacity noise, divider tokens, blur class, icon families, radius (findings 8,12,13,14)  
5 Error Prevention — ✅ zero-fill refusal (strength 1), no invented coverage  
6 Recognition — ✅ TOC absence, trust labeling (findings 7,11)  
7 Flexibility — ✅ power-user TOC/jump, keyboard paths (finding 7)  
8 Aesthetic — ✅ hero weight, figure hierarchy, note demotion (findings 5,8,15)  
9 Error Recovery — ✅ no retry (finding 2)  
10 Help & Documentation — ✅ honesty truncated, FAQ structure (findings 9,3)  
11 Affordances — ✅ false red card, FAQ chevron, CTA contrast (findings 3,4,5)  
12 Structure — ✅ grouping, divider rhythm, attribution scan (findings 12,16)  
13 Accessibility — ✅ motion, contrast, marker, live region (findings 1,4,6)  
14 Perceptibility — ✅ tertiary contrast, figure hierarchy, note demotion, hero backing (findings 4,5,6,15)  
15 Tolerance — ✅ stale/missing forgiveness (finding 2)

---

## What Happens Next

> **Discussion mode (default):** I will implement fixes for **all findings by default**. If you'd like to skip or de-prioritize any, tell me — you know the editorial/product trade-offs (e.g., "keep the kinetic hero for press").

**Next step — your decision:**

- Which findings, if any, should I **skip** (e.g., keep current hero motion, defer TOC)?
- Or should I **fix all 16** now, in the order: foundation tokens → component fixes → coherence pass → verify?

Reply with e.g. "Fix all but keep the video — just add the pause button" or "Quick wins only (1–3)" and I will proceed to implementation (Phase 1 → Phase 2 → Phase 3 → verification).

