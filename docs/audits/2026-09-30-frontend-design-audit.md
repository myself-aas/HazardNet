# Frontend Design Audit — HazardNet Web App

**Date:** 2026-09-30
**Skill:** `frontend-design-audit` (mistyhx/frontend-design-audit), Discussion Mode
**Mode:** Local project (source code)

---

## Scope

The entire HazardNet frontend: the application shell, global design tokens, shared
layout, and every page and component.

**Source reviewed (all files read or pattern-scanned):**

- **Application shell** — `frontend/index.html`, `frontend/src/main.tsx`,
  `frontend/src/App.tsx` (routing, layout, skip link, toaster, Suspense)
- **Design system** — `frontend/src/index.css` (2451 lines: Layer 1 primitives,
  Layer 2 semantic tokens, Layer 3 `@theme`), `frontend/src/styles/nasa-hds.css`
  (generated NASA HDS tokens), `frontend/src/design-system/tokens.ts`,
  `frontend/DESIGN_SYSTEM.md`
- **Shared layout** — `Navbar.tsx`, `Footer.tsx`, `MenuDrawer.tsx`,
  `Breadcrumbs.tsx`, `HazardNetLogo.tsx`, `ErrorBoundary.tsx`, `SEOHead.tsx`
- **Dialog primitives** — `ui/BottomSheet.tsx`, plus all 9 `role="dialog"` sites
- **Pages** — all 33 in `frontend/src/pages/` (heading structure, CTAs,
  breadcrumbs, form patterns)
- **Components** — 105 in `frontend/src/components/` and its 13 subdirectories
- **Cross-cutting scans** — accessibility attributes, focus management, type
  scale, spacing scale, touch targets, contrast usage, loading/error/empty
  states, keyboard support

**Interface type:** Data-dense public-safety dashboard + editorial front door,
with an AI assistant, map console, auth flows, and a content/blog system.
Primary users are district-level disaster managers and the Bangladeshi public.

**Limitations:** This is a source-code audit. Rendered contrast ratios are
computed from the token values in `index.css` rather than measured from a
browser, and no live interaction testing was performed. All contrast figures
below are calculated from the documented hex values.

---

## How to Read This Report

Findings are rated on a 0-4 severity scale (4 = users can't complete tasks,
1 = cosmetic only). Each finding references an established usability principle.
Start from the top — the most impactful issues are listed first.

---

### Summary

| Severity | Count |
|----------|-------|
| 4 - Catastrophe | 0 |
| 3 - Major | 9 |
| 2 - Minor | 6 |
| 1 - Cosmetic | 2 |
| **Total findings** | **17** |

### Quick Wins

1. **Add a focus trap + Escape to the shared `BottomSheet`** (Severity 3) — one
   primitive fixes 9 dialogs at once; `MenuDrawer` already has the pattern to copy.
2. **Escape handler on `PdfExportConfigModal`** (Severity 3) — a three-line
   `useEffect`; it is the only dialog with `aria-modal` but no way out.
3. **Swap `text-carbon-40` / `text-carbon-50` for `carbon-60`** (Severity 3) —
   109 mechanical substitutions that the design system's own comments already
   mandate.
4. **Add `<ScrollRestoration />`** (Severity 3) — one line; fixes arriving
   mid-page on every navigation.

---

## Findings

### Severity 3 — Major

---

#### 3.1 No dialog traps focus — Tab escapes into the page behind

- **Principle:** User Control and Freedom (H3), Accessibility (H13)
- **Location:** all 9 `role="dialog"` sites; the shared primitive is
  `frontend/src/components/ui/BottomSheet.tsx:34`
- **Issue:** None of the nine dialogs implements a focus trap. `BottomSheet` —
  the shared primitive — sets `role="dialog"` and `aria-modal="true"`, which
  tells assistive technology that the rest of the page is inert, but nothing
  actually makes it inert. Pressing Tab from the last control in the sheet moves
  focus to the navbar, the map, and the page behind it.
- **User impact:** A screen-reader user inside the event-report form can tab
  straight out into the map behind and activate controls they cannot see,
  submitting a hazard report while believing they are still in the dialog. A
  keyboard user has no signal that they have left the modal. `aria-modal="true"`
  makes this worse than having no attribute: it promises containment the code
  does not deliver.
- **Fix:** Add a focus trap to `BottomSheet` so every consumer inherits it.
  `MenuDrawer.tsx:66-80` already implements the correct shape — an Escape
  handler, focus moved to the close button on open, and focus restored to the
  invoking element on close. Extend that with a `Tab`/`Shift+Tab` interceptor
  that cycles within the sheet, and add `inert` to the app shell while open
  (the codebase already uses `inert` once). Then delete the per-dialog
  duplicates that follow.

---

#### 3.2 `PdfExportConfigModal` has no Escape key handler

- **Principle:** User Control and Freedom (H3)
- **Location:** `frontend/src/components/PdfExportConfigModal.tsx:277`
- **Issue:** This dialog sets `role="dialog"` and `aria-modal` and manages focus
  (two `.focus()` calls), but has no `Escape` handler. Every other dialog in the
  app — `EventReportModal`, `PrintPreviewModal`, `MenuDrawer`, `ChatBot`,
  `CommandPalette` — handles Escape. This one does not.
- **User impact:** A user who opens the export configuration and changes their
  mind must find the close button with the mouse. Escape, the near-universal
  convention for dismissing a dialog, silently does nothing. Users who rely on
  the keyboard are stuck in a modal they cannot leave by the usual route.
- **Fix:** Add the same `useEffect` keydown listener the sibling modals use:
  ```tsx
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  ```

---

#### 3.3 Two dialogs expose no dialog semantics at all

- **Principle:** Accessibility (H13), Structure (H12)
- **Location:** `frontend/src/components/DisasterDetailModal.tsx`,
  `frontend/src/components/SavedAssessmentsModal.tsx`
- **Issue:** Both handle Escape (the disaster modal) but neither sets
  `role="dialog"`, `aria-modal`, or an accessible name. A screen-reader user
  opening the disaster detail gets no announcement that a dialog opened, no
  boundary, and no name — the content simply appears in the reading order.
  `SavedAssessmentsModal` has no Escape handler either.
- **User impact:** Screen-reader users cannot tell they have left the page and
  entered a modal, so they have no mental model of how to get back. Because
  there is no accessible name, the dialog is indistinguishable from page
  content when navigating by landmark or window.
- **Fix:** Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`
  pointing at each dialog's visible title. Prefer `aria-labelledby` over
  `aria-label` so the name matches what sighted users read.

---

#### 3.4 Body text uses greys the design system explicitly forbids for text

- **Principle:** Accessibility (H13), Perceptibility (H14)
- **Location:** 109 sites. Highest-density:
  `components/DistrictRiskMap.tsx:108`, `components/ChatBot.tsx:467`,
  `components/GlideResourcePopover.tsx:93`,
  `components/GroundingIntelligencePanel.tsx:302`,
  `components/FirebaseRealtimeStatus.tsx:135`
- **Issue:** `index.css` documents the rule itself:
  ```
  --hn-hds-ink-muted: var(--hds-color-carbon-50);  /* 4.46:1 on white —
                                    borders/icons only, just under AA for text */
  --hn-hds-ink-soft:  var(--hds-color-carbon-60);  /* 7.1:1 on white —
                                    smallest text gray that clears AA */
  ```
  The codebase nevertheless paints text with:
  - `text-carbon-40` (`#959599`, ≈2.9:1 on white) — **68 sites**, no `dark:` override
  - `text-carbon-50` (`#77777a`, ≈4.46:1 on white) — **41 sites**, no `dark:` override

  A further 66 `text-carbon-30` sites need triage — most are `•` separators,
  which are decorative and fine, but some wrap real content.
- **User impact:** `DistrictRiskMap.tsx:108` renders the map legend's only
  explanation — "Continuous empirical vulnerability ramp based on multi-hazard
  recurrence, frequency, and impacts" — at 2.9:1. Users with low vision, and
  anyone reading on a phone in daylight, cannot read it. `ChatBot.tsx:467`
  renders the AI's provenance line ("Engine: …") at 11px in 4.46:1 grey — the
  one piece of text that tells a user which engine answered, in the hardest
  colour to read.
- **Fix:** Replace `text-carbon-40` → `text-carbon-60` and `text-carbon-50` →
  `text-carbon-60` in the 109 un-overridden sites. `carbon-60` is already the
  documented floor. Where a genuinely lighter tone is wanted for de-emphasis,
  keep `carbon-50` but raise the size to ≥14px so it qualifies as large text at
  3:1 — though the cleaner move is simply to use `carbon-60`.

---

#### 3.5 Body copy is set at 10-11px across the product

- **Principle:** Aesthetic and Minimalist Design (H8), Perceptibility (H14)
- **Location:** 303 uses of `text-[10px]` (146) and `text-[11px]` (157), plus
  9 × `text-[9px]` and 4 × `text-[8px]`. Clustered in `NationalOverview.tsx`
  (13), `DisasterDetailModalUI.tsx` (13), `RiskAnalytics.tsx` (12),
  `DownloadCenter.tsx` (8), `FirebaseRealtimeStatus.tsx` (7)
- **Issue:** The skill's healthy type scale puts captions at 0.75-0.85rem
  (12-13.6px) and body at 0.875-1rem (14-16px). Many of these sizes are used
  for actual prose, not just badge labels:
  `BangladeshSvgMap.tsx:94` (`<p className="text-[11px] text-carbon-60">`),
  `:446` (`<p className="mt-2 text-[10px] leading-snug text-carbon-60">`),
  `ChatBot.tsx:427`, `GroundingIntelligencePanel.tsx:302`. The app also uses 19
  distinct arbitrary font sizes, well past the 4-5 the scale recommends.
- **User impact:** Users must lean in and squint to read explanatory copy on a
  disaster map and in an AI assistant. At 10px, Bengali script — which this
  product ships bilingually — becomes close to illegible, because conjuncts and
  matras need more pixels than Latin at the same nominal size.
- **Fix:** Establish a floor of 12px for labels and 14px for prose. Convert
  `text-[10px]` → `text-xs` (12px) and `text-[11px]` → `text-xs`, and reserve
  `text-[11px]` for nothing. Add an ESLint rule or a design-quality check that
  rejects arbitrary `text-[Npx]` below 12px so this cannot regress.

---

#### 3.6 No scroll restoration or focus reset on route change

- **Principle:** Visibility of System Status (H1), Accessibility (H13)
- **Location:** `frontend/src/App.tsx:236-315` (`AppContent`)
- **Issue:** There is no `ScrollRestoration`, no `window.scrollTo` on pathname
  change, and no focus move to `#main-content` after navigation. `react-router-dom`
  v6 does not do this automatically.
- **User impact:** A user who scrolls halfway down `/districts` and clicks
  through to a district detail arrives at the *middle* of the new page, with no
  indication that the content changed above them. For a keyboard or screen-reader
  user it is worse: focus stays on the link they activated in the old page, so
  the next Tab press moves them through the *previous* page's controls. The app
  already has the anchor target (`<main id="main-content" tabIndex={-1}>`) and
  the skip link pointing at it — the focus move is the missing half.
- **Fix:** Add a `useEffect` on `location.pathname` that scrolls to top and
  moves focus to `#main-content`. Do not use `behavior: 'smooth'` here — an
  instant jump is what users expect on navigation, and smooth scrolling fights
  the focus move.

---

#### 3.7 Form errors are not associated with their fields

- **Principle:** Error Recovery (H9), Accessibility (H13)
- **Location:** app-wide — 71 `<input>` elements, 140 `catch` blocks, but only
  3 `aria-invalid` and 2 `aria-describedby`
- **Issue:** Error messages are rendered but almost never wired to the input
  they describe. There is no `aria-invalid="true"` on the failing field and no
  `aria-describedby` pointing at the message, so a screen reader announces the
  field as valid and never reads the error. There is also no evidence of focus
  moving to the first invalid field on submit.
- **User impact:** A screen-reader user who submits the sign-up form with a
  short password hears "Password, edit text" and nothing else. They cannot
  discover what went wrong or where. Sighted users fare better but still get no
  programmatic link between the red text and the field it belongs to, which
  matters when the form is long.
- **Fix:** For each validated field, render the error with an `id`, set
  `aria-invalid={hasError}` and `aria-describedby={hasError ? errorId : undefined}`
  on the input, and on submit failure call `.focus()` on the first invalid ref.
  `LoginPage`/`SignUpPage` are the highest-traffic place to start.

---

#### 3.8 Breadcrumbs missing on the deepest pages

- **Principle:** Recognition Over Recall (H6), Structure (H12)
- **Location:** `Breadcrumbs` is used in 12 of 33 pages. Absent from
  `DistrictDetailPage`, `AlertDetailPage`, `AdvisoriesPage`, `AlertsPage`,
  `AnalyticsPage`, `HistoricalCatalogPage`, `Dashboard`, `StatusPage`, `UploadPage`
- **Issue:** The app's hierarchy is Division → District → Hazard → Alert, three
  and four levels deep. `Breadcrumbs` exists and is used on the *shallow*
  content pages (About, Blogs, Terms, Privacy) but not on the deep detail pages
  where wayfinding actually matters.
- **User impact:** A user who arrives at `/districts/cox's-bazar` from a shared
  link has no visible path back to the division or the district list. They must
  use the back button — which does not work if they arrived from an external
  link — or reconstruct the URL. On a four-level hierarchy this is the single
  most valuable navigation aid, and it is on the pages that lack it.
- **Fix:** Add `<Breadcrumbs />` to `DistrictDetailPage`, `AlertDetailPage`, and
  `HazardDetailPage` first. They already have the division/district/hazard data
  in scope, so this is composition, not new logic.

---

#### 3.9 An interactive `<div>` with no role, no keyboard path

- **Principle:** Affordances and Signifiers (H11), Accessibility (H13)
- **Location:** `frontend/src/components/StructuredAdvisoryRenderer.tsx:191`
- **Issue:** A `<div>` with `cursor-pointer`, a hover state, and an `onClick`
  that expands an advisory's impact section. It has no `role="button"`, no
  `tabIndex`, and no key handler. (The other two `<div onClick>` sites —
  `Footer.tsx:276` and `PdfExportButton.tsx:265` — are backdrops and
  click-outside catchers, which is a legitimate pattern and not a finding.)
- **User impact:** Keyboard and screen-reader users cannot expand this section
  at all — the content is simply unreachable. Because the div looks like plain
  text until hovered, sighted mouse users also frequently miss that it is
  clickable.
- **Fix:** Replace with a `<button type="button">` styled to fill the container,
  or add `role="button" tabIndex={0}` plus an `onKeyDown` for Enter and Space.
  The `<button>` is strongly preferred: it gets focus, keyboard activation, and
  the correct role for free.

---

### Severity 2 — Minor

---

#### 2.1 Visual weight is uniformly heavy — nothing stands out

- **Principle:** Aesthetic and Minimalist Design (H8), Perceptibility (H14)
- **Location:** app-wide — `bold` ×926, `black` ×240, `extrabold` ×160 versus
  `medium` ×241, `semibold` ×382, `normal` ×21
- **Issue:** 1326 uses of the three heaviest weights against 262 of the lighter
  three. When headings, labels, metric values, and body copy are all bold or
  black, weight stops carrying information.
- **User impact:** Users cannot scan. On `NationalOverview` and `RiskAnalytics`
  — the two densest screens — every text element shouts at the same volume, so
  the eye has nowhere to land first and users read linearly instead of
  scanning.
- **Fix:** Reserve `font-black` for the page `<h1>` only, `font-bold` for
  section `<h2>`/`<h3>`, `font-semibold` for card titles and labels, and
  `font-normal` for body. Demote the majority of the 240 `font-black` uses to
  `font-semibold`.

---

#### 2.2 Border radius uses seven arbitrary values

- **Principle:** Consistency and Standards (H4)
- **Location:** `rounded-[28px]` ×13, `rounded-[20px]` ×5, `rounded-[5px]` ×4,
  `rounded-[6px]` ×2, `rounded-[22px]` ×2, `rounded-[7px]` ×1, `rounded-[36px]` ×1
- **Issue:** `index.css` declares `--radius: 5px` as "Finalized system
  geometry", and a global rule forces `border-radius: 5px` on anything matching
  `[class*="card"]`. Seven other arbitrary radii coexist with it.
- **User impact:** Cards, sheets, and pills have subtly different corner
  geometry, which reads as sloppiness rather than intent. The effect is
  subconscious but cumulative.
- **Fix:** Reduce to two values — `--radius` (5px) for cards and controls, and
  one large value (28px) reserved for bottom sheets and full-bleed overlays
  where the shape is functional. Fold 20/22/36 into one of the two.

---

#### 2.3 Error toasts auto-dismiss and announce politely

- **Principle:** Error Recovery (H9)
- **Location:** `App.tsx:278` (`<Toaster>`), 47 `toast.error` call sites;
  e.g. `IdentityConnections.tsx:64` uses `duration: 5200`
- **Issue:** `react-hot-toast@2.6` defaults to `role="status"` /
  `aria-live="polite"`, and errors are given a finite duration (5.2s in the one
  site that sets it explicitly). The skill's guidance is that errors should
  persist until acknowledged and announce assertively.
- **User impact:** A user who looks away for six seconds loses the only record
  of why their action failed. A screen-reader user may have the message
  interrupted by subsequent polite announcements before it is read.
- **Fix:** Configure the toaster so error toasts use `role="alert"` /
  `aria-live="assertive"` and `duration: Infinity` with an explicit dismiss
  button. Keep success toasts polite and auto-dismissing.

---

#### 2.4 No `prefers-color-scheme` support despite a full dark token set

- **Principle:** Flexibility and Efficiency (H7), Perceptibility (H14)
- **Location:** zero `prefers-color-scheme` matches in `frontend/src` or
  `frontend/public`
- **Issue:** `nasa-hds.css` defines a complete dark palette
  (`carbon-90 #17171b` is documented as "Default background for dark mode"),
  and `BottomSheet` already ships `dark:` variants. But nothing ever activates
  them — there is no `prefers-color-scheme` query and no theme toggle.
- **User impact:** Users who have set their OS to dark mode get a bright white
  page anyway. For a product people check during emergencies at night, that is
  a genuine comfort and battery issue, and the tokens to fix it already exist.
- **Fix:** Either add a `@media (prefers-color-scheme: dark)` block mapping the
  semantic tokens onto the dark HDS values, or add an explicit theme toggle.
  The former is a day's work given the token layer already exists; the latter
  needs persistence.

---

#### 2.5 `BottomSheet` names itself with `aria-label` instead of its visible title

- **Principle:** Accessibility (H13)
- **Location:** `frontend/src/components/ui/BottomSheet.tsx:34`
- **Issue:** `aria-label={title || 'Contextual Information Sheet'}` while a
  visible `<h3>` renders the same title. Speech-input users who say "click
  <title>" will not match, because the accessible name comes from `aria-label`
  and the visible label is a separate node.
- **User impact:** Voice-control users cannot activate the sheet by its visible
  name. Screen-reader users hear the name twice under different computations.
- **Fix:** Give the `<h3>` an `id` and use `aria-labelledby={titleId}`. Keep
  the `aria-label` fallback only for the no-title case.

---

#### 2.6 `text-carbon-30` needs triage — 66 un-overridden sites

- **Principle:** Accessibility (H13)
- **Location:** 66 sites with no `dark:` override; 10 more with one
- **Issue:** `#b9b9bb` on white is ≈1.9:1. Most of the 66 are `•` separators
  and icon strokes, which are decorative and correctly exempt. But some wrap
  real content, and the mix makes it impossible to audit by grep alone.
- **User impact:** Any genuine text among them is effectively invisible to
  low-vision users.
- **Fix:** Audit the 66 and either confirm each is decorative (add
  `aria-hidden="true"` to make that explicit and grep-able) or raise it to
  `carbon-60`.

---

### Severity 1 — Cosmetic

---

#### 1.1 `BottomSheet` drag handle carries `aria-label` with no role

- **Principle:** Affordances and Signifiers (H11)
- **Location:** `frontend/src/components/ui/BottomSheet.tsx:69`
- **Issue:** A `<div aria-label="Drag sheet handle">` with no `role`. A label on
  a generic element is ignored by assistive technology.
- **Fix:** Either drop the label (the handle is decorative; the close button
  and swipe both work) or give it `role="presentation"`. Low stakes, but it is
  dead code that implies an affordance that does not exist.

---

#### 1.2 Responsive badge pattern floors at 10px on mobile

- **Principle:** Aesthetic and Minimalist Design (H8)
- **Location:** `text-[10px] sm:text-xs` in `AdvisoryPanel.tsx:114,118,123`,
  `BangladeshSvgMap.tsx:90,144,168` and elsewhere
- **Issue:** A deliberate responsive choice — 10px on mobile, 12px on desktop —
  but it inverts the usual direction. Mobile screens are the ones held further
  from the eye and more often used outdoors.
- **Fix:** Use `text-xs` (12px) at every breakpoint for badge labels. If space
  is genuinely tight on mobile, shorten the label rather than the type.

---

## Strengths

These are working well and should not be changed without reason.

1. **A real skip link, first in the tab order.** `App.tsx:300-305` renders
   "Skip to main content" as the first focusable element, `sr-only` until
   focused, pointing at `<main id="main-content" tabIndex={-1}>`. Satisfies
   WCAG 2.4.1 and is the single most commonly missed a11y affordance.

2. **Focus rings that follow the design system.** `index.css:989` sets a 1px
   dashed `:focus-visible` outline with HDS offset, and deliberately steps the
   colour up to `carbon-30` on the satellite basemap and other dark surfaces
   where `carbon-60` would vanish. Focus is never removed.

3. **A global `prefers-reduced-motion` override.** `index.css` collapses
   animation and transition durations to 0.01ms and disables smooth scrolling
   for users who ask for it — and the brand loader honours it inside the SVG
   itself. Satisfies H7 and H14.

4. **Touch targets are enforced, not hoped for.** `.tap-target` sets a 44×44px
   minimum from a token, used in 41 places, with 238 further explicit
   `min-h-[44px]`/`h-11` uses.

5. **Every image has an alt attribute.** All 17 `<img>` tags in the codebase
   carry `alt`, including deliberate `alt=""` on decorative brand marks.

6. **Spacing discipline is essentially perfect.** Zero arbitrary `gap-[Npx]`
   values and one arbitrary padding value across 228 scanned files — the app
   uses the Tailwind scale throughout. This is rare and worth protecting.

7. **`MenuDrawer` is the reference dialog implementation.** Escape to close
   (`:66`), focus moved to the close button on open (`:77`), focus restored to
   the invoking element on close (`:80`), `role="dialog"`, `aria-modal`,
   `aria-label`, and `aria-current` on the active nav link. The other eight
   dialogs should be brought up to this standard.

8. **`CommandPalette` is a genuinely good power-user feature.** Cmd/Ctrl+K to
   open, Escape to close, ArrowUp/ArrowDown to move, Enter to select,
   `role="dialog"`. Satisfies H7.

9. **Route-level code splitting with a branded loading state.** Every page is a
   lazy chunk, and the Suspense fallback is the product's own animated mark
   rather than a generic spinner — a wait is spent looking at the brand.

10. **The 404 page follows the design system.** `NotFoundPage.tsx` uses a real
    `<h1>`, `carbon-70` body copy, 44px buttons, and — unusually — visually
    distinguishes its primary CTA (filled red) from its secondary (outlined
    blue). Error pages routinely break the visual language; this one does not.

11. **`aria-current` is wired to visible styling.** Five sites set
    `aria-current="page"`, and `Navbar.tsx:236` pairs it with an
    `hn-nav-link-active` class so the semantic state has a visible counterpart.

12. **Loading, empty, and error states are broadly present.** 216 loading-state
    references, 31 skeleton/shimmer uses, 27 `role="status"` regions, 38 retry
    affordances, and 11 error boundaries. This is well above the norm.

---

## Notes on method

Two negative results from the initial scan turned out to be wrong and were
corrected before being reported:

- A regex for a skip link returned zero matches; reading `App.tsx` showed the
  link exists at line 300 with the text "Skip to main content". Reported as a
  strength instead.
- `text-[2.2px]` in `DistrictRiskMap.tsx:289` looks like a typo but is an SVG
  user unit inside `viewBox="0 0 100 100"`, so it renders at a sensible size.
  Not reported.

Both are recorded here because the audit's value depends on not reporting
findings that are not real.
