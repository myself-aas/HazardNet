# Frontend Re-Audit — HazardNet Web App

**Date:** 2026-09-30
**Supersedes:** `2026-09-30-frontend-design-audit.md` (15-principle pass)
**Skills applied (4):**

| Skill | Lens | Output |
|---|---|---|
| `frontend-design-audit` | 15 usability principles, 0-4 severity | 17 findings, re-confirmed below |
| `frontend-design` | First-viewport budget, default density, chrome-is-not-content | new findings |
| `design-review` | Visual polish: layout, type, colour, hierarchy, consistency, states, responsive | new findings |
| `design-auditor` | 12 weighted categories → 3 grades; AI-slop detection; WCAG contrast; token compliance | grades + compliance % |

---

## Limitations

**No browser is available in this environment.** Playwright has no installed
browsers, the Chromium CDN is blocked, and there is no root access to install a
system browser. Consequently:

- **`design-review` is only partially executable.** It specifies screenshot-driven
  review across viewports. Every finding below is derived from source code and
  computed contrast, not from rendered output. Visual findings that depend on
  seeing the page — actual line length, overflow, truncation behaviour, layout
  collapse at 768px, real hover/focus rendering — are marked **[unverified]**.
- Contrast ratios are **computed** from token hex values, not sampled from pixels.
- Responsive quality is scored from the presence of breakpoint utilities
  (`sm:`/`md:`/`lg:`), `viewport-fit=cover`, and `env(safe-area-inset-*)` usage —
  not from rendering at those widths.

This is a material gap and the report should be re-run in a browser-capable
environment before any visual change ships.

---

## Grades

Scored against `design-auditor`'s 12 weighted categories.

| Grade | Result | Gate | Verdict |
|---|---|---|---|
| **Design** (weighted aggregate) | **65 / 100 → D** | ≥ B | **FAIL** |
| **AI Slop** (inverted) | **A** | — | **PASS** |
| **Accessibility** (WCAG) | **C** | ≥ A | **FAIL** |

### Category breakdown

| # | Category | Weight | Score | Driver |
|---|---|---|---|---|
| 1 | Visual Hierarchy | 10% | 62 | 1326 heavy weights vs 262 light; 9 radii; primary red spent on badges |
| 2 | Typography | 8% | 58 | 303 sub-11px uses incl. prose; 19 arbitrary sizes; line-height excellent |
| 3 | Colour & Contrast | 8% | **42** | 2.14:1 primary button; 1.96:1 body copy; 150 low-contrast greys; 740 off-system colours |
| 4 | Spacing & Layout | 8% | **88** | Zero arbitrary spacing values across 228 files |
| 5 | Interaction States | 10% | 65 | hover ×576 but `active:` ×24; no focus traps; 236 `transition-all` |
| 6 | Navigation & IA | 8% | 62 | Breadcrumbs absent on deepest pages; no route-change focus; diagnostics on dashboard |
| 7 | Responsive Design | 8% | 75 | *Unverified — no browser.* Patterns present |
| 8 | Accessibility / WCAG | 12% | 58 | No focus traps; errors unassociated; contrast failures. Strong foundations |
| 9 | Motion & Animation | 5% | 70 | `prefers-reduced-motion` honoured globally; `ease-in` ×5; easing tokens unused |
| 10 | Content & Microcopy | 5% | **90** | No vague CTAs, no buzzwords, no invented fallbacks |
| 11 | AI Slop Indicators | 8% | **92** | No generic hero, no stock gradient, no 3-col grid, no pricing table |
| 12 | Performance as Design | 5% | 78 | Route-level code splitting; branded loader; 1424.6 kB gzip within budget |
| — | Coherence bonus | 5% | 82 | One shadow rule, one documented line-height, layered token architecture |

### Token compliance

| Metric | Value | Gate |
|---|---|---|
| Palette-family class uses | 6188 | — |
| Uses of families with **no** token mapping | **740 (12.0%)** | 0 |
| **Compliance** | **88.0%** | ≥ 90% |

Families resolving to raw Tailwind defaults rather than HDS tokens:
`emerald` ×222, `rose` ×219, `blue` ×177, `sky` ×58, `cyan` ×18, `red` ×15,
`indigo` ×8, `yellow` ×8, `teal` ×6, `orange` ×5, `purple` ×4.

Correctly tokenised: `carbon` ×4848, `amber` ×598, `gray`, `neutral`, `slate`,
`stone`, `zinc` — all remapped to `--hds-*` values in `@theme inline`.

---

## Findings

Severity follows `frontend-design-audit`'s 0-4 scale. Lens tags show which skill
surfaced each finding.

### Severity 4 — Catastrophe

None. No finding blocks task completion outright.

### Severity 3 — Major

---

#### 3.1 Primary action button label renders at 2.14:1

- **Lens:** design-review (High), design-auditor (WCAG), frontend-design-audit H13
- **Location:** `frontend/src/pages/Dashboard.tsx:640` and 11 further sites
- **Issue:** `bg-nasa-red … text-carbon-black` — near-black text on the brand
  crimson. Computed contrast **2.14:1**. The design system already defines the
  correct pairing one layer up: `--primary-foreground: var(--hn-hds-white)`,
  which is **9.06:1**.
- **User impact:** The "Pin Selected District" button — the primary action on the
  user's dashboard — has a label that is effectively unreadable. Users with low
  vision cannot use it at all; everyone else squints. Because the button is
  filled and high-contrast in shape, it reads as *the* obvious action, which
  makes the illegible label more frustrating, not less.
- **Fix:** Replace `text-carbon-black` with `text-white` (or `text-primary-foreground`)
  on all 12 red-ground sites. This is a 12-line mechanical change with a 4.2×
  contrast improvement.

---

#### 3.2 Body copy at 1.96:1 on the Dashboard

- **Lens:** design-review (High), design-auditor (WCAG), frontend-design-audit H13/H14
- **Location:** `frontend/src/pages/Dashboard.tsx:630`
- **Issue:** `<p className="text-xs sm:text-sm text-carbon-30 leading-relaxed font-normal line-clamp-2">`
  — explanatory prose in `carbon-30` (`#b9b9bb`) = **1.96:1** on white. It is also
  `line-clamp-2`, so the truncated remainder is unreachable.
- **User impact:** The only explanation of what the map panel does is invisible to
  low-vision users and strained for everyone else. `line-clamp-2` compounds it:
  even a sighted user who wants the full sentence cannot get it.
- **Fix:** `text-carbon-30` → `text-carbon-60` (7.09:1) and remove `line-clamp-2`
  or add a "show more" affordance.

---

#### 3.3 Developer diagnostics occupy the Dashboard's default surface

- **Lens:** frontend-design (first-viewport budget, density), frontend-design-audit H8
- **Location:** `frontend/src/pages/Dashboard.tsx:765-790`, and the
  "ServiceWorker Cache Engine" / "GIS Satellite Map Tile Cache" / "Granular Data
  Report" panels elsewhere in the file
- **Issue:** The user-facing Dashboard exposes a map-stage height control in raw
  pixel buttons — `📐 850px`, `Compact`, `Standard`, `Tall`, `Dynamic` — with
  `title` tooltips like "Set map stage height to Ultra Tall (850px)". Elsewhere it
  surfaces ServiceWorker cache and GIS tile-cache diagnostics.
  `frontend-design` is explicit: *"Put rare, advanced, destructive, diagnostic,
  history, and provider controls in a menu, disclosure, focused dialog, or later
  step."* A user choosing their map height in pixels is not a product decision.
- **User impact:** The repeat user's primary surface — the one they return to
  daily to check their districts — spends its first viewport on cache internals
  and pixel-precise stage sizing. The saved-districts list, which is the actual
  job, is pushed below the fold behind configuration chrome.
- **Fix:** Move stage-height into a disclosure ("Map options") or persist it as a
  preference with a single toggle. Move the cache/tile diagnostics behind a
  "Diagnostics" disclosure or into `/status`. Restore the first viewport to:
  where you are, your saved districts, and one next action.

---

#### 3.4 Emoji used as a UI icon

- **Lens:** frontend-design (icon rules), design-review (component consistency)
- **Location:** `frontend/src/pages/Dashboard.tsx:768` (`📐 850px`)
- **Issue:** `📐` renders as a platform-dependent emoji glyph, inconsistent in
  weight and style with the 225 `MaterialIcon` uses across 59 files.
  `frontend-design` bans emoji icons outright; `design-review` flags mixed icon
  families as Medium.
- **User impact:** The height control looks like a different product from the rest
  of the dashboard. Emoji also render at wildly different sizes and colours across
  Windows/macOS/Android, so the control's visual weight is unpredictable.
- **Fix:** Use `<MaterialIcon name="straighten" />` — or better, delete the control
  per 3.3.

---

#### 3.5 No dialog traps focus

- **Lens:** frontend-design-audit H3/H13 *(carried forward, re-confirmed)*
- **Location:** all 9 `role="dialog"` sites; shared primitive
  `frontend/src/components/ui/BottomSheet.tsx:34`
- **Issue:** `BottomSheet` sets `aria-modal="true"` but nothing makes the
  background inert. Tab walks out of the modal.
- **User impact:** A screen-reader user in the event-report form can tab into the
  map behind and activate controls they cannot see. `aria-modal` promises
  containment the code does not deliver, which is worse than omitting it.
- **Fix:** Lift `MenuDrawer.tsx:66-80`'s pattern (Escape, focus-in, focus-return)
  into `BottomSheet` and add a Tab cycle interceptor plus `inert` on the shell.

---

#### 3.6 `PdfExportConfigModal` has no Escape handler

- **Lens:** frontend-design-audit H3 *(carried forward)*
- **Location:** `frontend/src/components/PdfExportConfigModal.tsx:277`
- **Fix:** Add the `useEffect` keydown listener the sibling modals already use.

---

#### 3.7 Two dialogs expose no dialog semantics

- **Lens:** frontend-design-audit H13/H12 *(carried forward)*
- **Location:** `DisasterDetailModal.tsx`, `SavedAssessmentsModal.tsx`
- **Fix:** Add `role="dialog"`, `aria-modal`, and `aria-labelledby` pointing at
  each visible title.

---

#### 3.8 Body text uses greys the design system forbids for text

- **Lens:** design-auditor (WCAG + token compliance), frontend-design-audit H13
  *(carried forward, now quantified)*
- **Location:** 150 sites — `text-carbon-40` ×68, `text-carbon-50` ×41 (both
  without `dark:` override), plus `text-carbon-30` prose at 3.2 above
- **Issue:** `index.css:92-93` documents the rule itself — `carbon-50` is
  *"borders/icons only, just under AA for text"* and `carbon-60` is the
  *"smallest text gray that clears AA"*. The code paints text with both anyway.
- **Fix:** `carbon-40`/`carbon-50` → `carbon-60` at the 109 un-overridden sites.

---

#### 3.9 Body copy set at 10-11px

- **Lens:** frontend-design-audit H8/H14 *(carried forward)*, design-review (typography)
- **Location:** 303 uses of `text-[10px]` (146) and `text-[11px]` (157), plus
  9 × `text-[9px]` and 4 × `text-[8px]`
- **Fix:** Floor of 12px for labels, 14px for prose. `text-[10px]`/`text-[11px]`
  → `text-xs`.

---

#### 3.10 No scroll restoration or focus reset on route change

- **Lens:** frontend-design-audit H1/H13 *(carried forward)*
- **Location:** `frontend/src/App.tsx:236-315`
- **Fix:** `useEffect` on `location.pathname` → scroll to top and focus
  `#main-content` (the anchor target already exists).

---

#### 3.11 Form errors are not associated with their fields

- **Lens:** frontend-design-audit H9/H13 *(carried forward)*
- **Location:** app-wide — 71 inputs, 140 catch blocks, 3 `aria-invalid`,
  2 `aria-describedby`
- **Fix:** `id` + `aria-describedby` + `aria-invalid` per field; focus the first
  invalid ref on submit failure.

---

#### 3.12 `window.prompt` used for link/image URL entry

- **Lens:** frontend-design (never use browser dialogs)
- **Location:** `frontend/src/components/blog/RichTextEditor.tsx:112,121`
- **Issue:** `window.prompt('Link URL (https://…)')` and
  `window.prompt('Image URL (https://…)')`.
- **User impact:** `window.prompt` is blocked or styled inconsistently across
  browsers, cannot be styled to match the product, is not focus-trapped, and on
  some mobile browsers does not appear at all — leaving the editor silently
  broken. It also cannot show validation feedback for a malformed URL.
- **Fix:** A small inline dialog or popover with a labelled input and validation.
  The app already has `BottomSheet` and `GlideResourcePopover` to compose from.

---

#### 3.13 Off-system colours: 740 uses across 11 families

- **Lens:** design-auditor (token compliance), design-review (semantic colour)
- **Location:** app-wide; heaviest in map and chart components
- **Issue:** `emerald`, `rose`, `blue`, `sky`, `cyan`, `red`, `indigo`, `yellow`,
  `teal`, `orange`, `purple` are **not declared in `@theme inline`**, so they
  resolve to Tailwind's stock palette. The consequence is semantic collision:
  `--hds-color-nasa-blue: #1c67e3` is documented as *"do something here — on-page
  interaction"*, while `blue-500` is `#3b82f6` and is used 177 times. Two blues,
  two meanings. Likewise `red-500` (`#ef4444`) vs `nasa-red` (`#970002`).
- **User impact:** Colour stops being a reliable signal. A user who learns that
  crimson means "primary action" meets Tailwind red on error states and Tailwind
  rose on destructive buttons, and the mapping they built breaks.
- **Fix:** Map the families that carry meaning to semantic tokens
  (`rose`→`destructive`, `emerald`→`success`, `blue`→`accent`/`info`), and either
  delete or tokenise the rest. This is the single change that moves token
  compliance from 88% to the 90% gate.

---

### Severity 2 — Minor

---

#### 2.1 236 uses of `transition-all`

- **Lens:** frontend-design (explicit ban), design-review (transitions)
- **Issue:** *"Never `transition-all` — list the properties that actually
  change."* `transition-all` animates layout-triggering properties
  (`width`, `height`, `padding`, `box-shadow`) alongside `opacity`/`transform`,
  which causes jank and can animate properties the designer never intended.
- **Fix:** Replace with explicit property lists. In most of these sites the
  intent is colour only: `transition-colors`. This is mechanically scriptable.

---

#### 2.2 Nine distinct border-radius values, three on one card

- **Lens:** design-review (component consistency), frontend-design-audit H4
- **Location:** `rounded-full` ×291, `rounded-xl` ×175, `rounded` ×170,
  `rounded-lg` ×146, `rounded-sm` ×106, `rounded-2xl` ×84, `rounded-md` ×53,
  `rounded-3xl` ×34, `rounded-none` ×3. Worst case:
  `Dashboard.tsx:660` uses `rounded-lg sm:rounded-[20px] md:rounded-[28px]` —
  three radii on a single card across breakpoints.
- **Fix:** Reduce to a documented scale. `index.css` already declares
  `--radius: 5px` as "Finalized system geometry"; enforce it and add one large
  value for sheets.

---

#### 2.3 `active:` (pressed) state on only 24 elements

- **Lens:** design-review (interaction design), frontend-design-audit H1
- **Issue:** `hover:` ×576, `focus:` ×72, `disabled:` ×64, but `active:` ×24.
  Pressed feedback is largely absent.
- **User impact:** On touch devices there is no pressed acknowledgement, so users
  cannot tell whether a tap registered — a direct `visibility of system status`
  failure on the primary input method.
- **Fix:** Add `active:` treatments to the shared button patterns rather than
  per-site.

---

#### 2.4 Line length is essentially unconstrained

- **Lens:** design-review (typography) — **[unverified, no browser]**
- **Location:** 1 `max-w-prose` and 2 `ch`-unit constraints across the app;
  page containers run to `max-w-[1200px]`
- **Issue:** design-review's guidance is 50-75 characters per line for body text.
  Full-width prose at 1200px runs well past that.
- **User impact:** On the editorial surfaces (Blogs, Documentation, About,
  Terms, Privacy) long lines force the eye to track too far and lose the return
  sweep. **[Unverified — needs a browser to confirm actual measure.]**
- **Fix:** Apply a measure constraint (`max-w-[68ch]`) to prose containers on
  content pages. Leave data tables and dashboards full-width.

---

#### 2.5 Primary red spent on status badges rather than actions

- **Lens:** frontend-design (every element earns a job), design-review (colour consistency)
- **Location:** `Dashboard.tsx` — "Live GIS", "Cloud Sync", "GIS Map",
  "Dynamic", "ServiceWorker Cache Engine", "GIS Satellite Map Tile Cache"
- **Issue:** 76 `bg-nasa-red` uses, most of them badges. The HDS rule attached to
  the token reads *"Never for on-page actions, decorative use, or dataviz."*
- **User impact:** The accent loses its emphasis function — when crimson appears
  on six badges in one panel it no longer signals "the primary action", so the
  actual primary action stops standing out.
- **Fix:** Reserve crimson for the one primary action per surface. Status badges
  should use the severity tokens that already exist
  (`severity-*`, `success`, `warning`, `info`).

---

#### 2.6 `space-x-*`/`space-y-*` used 500 times where `gap-*` is preferred

- **Lens:** frontend-design (use `gap-*` in flex/grid)
- **Issue:** 500 uses of the discouraged pattern against 1182 `gap-*` uses.
  `space-*` applies margin to all but the first child, which breaks when children
  wrap or are conditionally rendered, and does not work in grid.
- **Fix:** Mechanical migration. Low visual impact, real robustness gain.

---

#### 2.7 Error toasts auto-dismiss and announce politely

- **Lens:** frontend-design-audit H9 *(carried forward)*
- **Location:** `App.tsx:278`; `IdentityConnections.tsx:64` uses `duration: 5200`
- **Fix:** `role="alert"` + `aria-live="assertive"` + persist until dismissed for
  errors; keep success polite and auto-dismissing.

---

#### 2.8 No `prefers-color-scheme` support despite a full dark token set

- **Lens:** frontend-design-audit H7/H14 *(carried forward)*
- **Issue:** `nasa-hds.css` defines a complete dark palette and `BottomSheet`
  ships `dark:` variants, but nothing activates them.
- **Fix:** A `@media (prefers-color-scheme: dark)` block mapping semantic tokens
  onto the dark HDS values, or an explicit toggle with persistence.

---

#### 2.9 Hardcoded hex in class strings

- **Lens:** design-auditor (token compliance)
- **Location:** `text-[#ad6d04]` ×8, `[#ea6f24]` ×5, `text-[#5d6668]` ×4,
  `text-[#101416]` ×4, `border-[#d9dedd]` ×3, `bg-[#f8f9f7]` ×3,
  `text-[#7a8384]` ×2, **`text-[#ff0000]` ×2**
- **Issue:** `#ad6d04` is a brown hover state on the crimson primary button — a
  hardcoded colour that also breaks the palette. `text-[#ff0000]` is the *old*
  brand red, now inconsistent with the new `#970002` token after this session's
  branding change.
- **Fix:** Replace with tokens. `#ad6d04` should be `hover:bg-nasa-red-shade`.

---

#### 2.10 `BottomSheet` names itself with `aria-label` over a visible title

- **Lens:** frontend-design-audit H13 *(carried forward)*
- **Fix:** `aria-labelledby` pointing at the `<h3>`.

---

#### 2.11 `text-carbon-30` needs triage — 66 un-overridden sites

- **Lens:** design-auditor (WCAG) *(carried forward)*
- **Fix:** Audit and either mark decorative (with `aria-hidden`) or raise to
  `carbon-60`.

---

#### 2.12 Visual weight is uniformly heavy

- **Lens:** frontend-design-audit H8/H14 *(carried forward)*
- **Location:** `bold` ×926, `black` ×240, `extrabold` ×160 vs `medium` ×241,
  `semibold` ×382, `normal` ×21
- **Fix:** Reserve `font-black` for the page `<h1>` only; demote the majority of
  the 240 uses to `font-semibold`.

---

#### 2.13 `ease-in` used on 5 transitions; easing tokens barely used

- **Lens:** frontend-design (motion rules)
- **Issue:** *"Enter/exit with ease-out, never `ease-in`."* 5 `ease-in` uses.
  Separately, `--ease-emphasized` and `--ease-standard` are defined but used only
  9 times against 14 raw `ease-*` utilities.
- **Fix:** Flip `ease-in` → `ease-out`; route through the shared tokens.

---

### Severity 1 — Cosmetic

---

#### 1.1 `bg-primary` never used; `bg-nasa-red` used 76 times

- **Lens:** design-review (semantic colour)
- **Issue:** The semantic `primary` token exists and maps to the brand crimson,
  but zero sites use it as a background. Components reach past the semantic layer
  to the palette token.
- **Fix:** Migrate `bg-nasa-red` → `bg-primary` so the semantic layer is the one
  place "primary action" is defined.

---

#### 1.2 30 inline `<svg>` icons alongside 225 `MaterialIcon` uses

- **Lens:** design-review (icon style)
- **Fix:** Route the `ui/` primitives' inline SVGs through `MaterialIcon` or a
  shared icon component, so there is one family and one size-per-context rule.

---

#### 1.3 `BottomSheet` drag handle carries `aria-label` with no role

- **Lens:** frontend-design-audit H11 *(carried forward)*
- **Fix:** Drop the label or add `role="presentation"`.

---

#### 1.4 Responsive badge pattern floors at 10px on mobile

- **Lens:** frontend-design-audit H8 *(carried forward)*
- **Fix:** `text-[10px] sm:text-xs` → `text-xs` at all breakpoints.

---

#### 1.5 111 eyebrow labels

- **Lens:** frontend-design (no eyebrow under a title)
- **Issue:** 111 `uppercase` + `tracking-widest/wider` labels, plus 40
  `text-xs uppercase`. Not all are eyebrows under titles — many are legitimate
  small-caps data-field labels — but the density is high enough to need triage.
- **Fix:** Audit for the pattern "eyebrow directly above an `<h2>`/`<h3>`" and
  delete those; keep standalone field labels.

---

#### 1.6 `Saved ({count})` count in a section heading

- **Lens:** frontend-design (no count over content already on screen)
- **Location:** `Dashboard.tsx:676`
- **Fix:** The list is immediately below; the count is redundant. Drop it or keep
  it only when the list is collapsed.

---

## Corrections to my own first-pass reading

Recorded because an audit that reports things that are not real is worse than no
audit. Three initial readings were wrong and were corrected against the source:

1. **"15 competing primary CTAs on the Dashboard."** Wrong. Grepping
   `bg-nasa-red` in `Dashboard.tsx` returned 15 hits, but reading the context
   showed most are `<span>` status badges, not buttons. The real finding is 2.5
   (crimson spent on badges), not CTA competition.
2. **"A skip link is missing."** Wrong — it exists at `App.tsx:300`. My first
   regex required "skip" and "content" to be adjacent. It is a strength.
3. **"`text-[2.2px]` is a typo."** Wrong — it is an SVG user unit inside
   `viewBox="0 0 100 100"`. Not a finding.

Also **not** findings, having checked: the 4 `linear-gradient` uses are functional
hero scrims, not stock gradient backgrounds; the 15 "X districts" counts are data
   content in a disaster-intelligence product, not chrome; and 5 `<div>` sites
   with `text-2xl font-black tabular-nums` are large metric *values*, not
   mis-marked headings.

---

## Strengths

1. **Zero AI-slop signals in copy or structure.** No generic hero with centred
   text over a gradient, no stock gradients (4 uses, all functional scrims), no
   3-column feature grid, no pricing table, no testimonials, no vague CTAs
   ("Get Started"/"Learn More" = 0), and buzzword density effectively zero
   ("transform" ×48 is all `willChange: 'transform'`). This is the hardest thing
   to fake and the app does not fake it.

2. **Zero invented content.** No `|| "No description yet."` fallbacks anywhere —
   the `chrome-is-not-content` rule is followed exactly. Empty fields render
   empty.

3. **Spacing discipline is essentially perfect.** Zero arbitrary `gap-[Npx]`
   values and one arbitrary padding across 228 files. This is rare and is the
   reason Spacing & Layout scores 88.

4. **A layered, documented token architecture.** `nasa-hds.css` (generated, NASA
   values preserved) → `index.css` Layer 1 primitives → Layer 2 semantic →
   Layer 3 `@theme`. NASA's own usage rules are repeated in the comments on
   purpose. The contrast figures in those comments are measured, not estimated.

5. **One line-height, applied consistently.** `--hds-typography-p: 400 1rem/1.62`
   is honoured at ~172 sites (`leading-relaxed` ×92, `leading-[1.62]` ×80), inside
   design-review's 1.5-1.7 band. Headings sit at 1.1-1.3.

6. **`prefers-reduced-motion` honoured globally *and* inside the SVG asset.** The
   global CSS override collapses animation, and the brand loader's keyframes opt
   out inside the SVG itself — so the preference survives even when the asset is
   used standalone.

7. **A real skip link, first in the tab order**, pointing at a `tabIndex={-1}`
   `<main>` target.

8. **HDS-spec dashed `:focus-visible` rings**, stepping up to `carbon-30` on the
   satellite basemap where `carbon-60` would vanish. Focus is never removed.

9. **Touch targets enforced** via a `.tap-target` token (44×44px) at 41 sites,
   plus 238 explicit `min-h-[44px]`/`h-11` uses.

10. **All 17 `<img>` tags carry `alt`**, including deliberate `alt=""` on
    decorative brand marks.

11. **`MenuDrawer` is the reference dialog** — Escape, focus-in, focus-return,
    `role="dialog"`, `aria-modal`, `aria-label`, `aria-current` with visible
    styling. Five other dialogs should be brought up to it.

12. **`CommandPalette` is a genuinely good power-user feature** — Cmd/Ctrl+K,
    Escape, arrows, Enter, `role="dialog"`, and no animation (as specified).

13. **The front door respects the first-viewport budget.** Exactly 3 visible CTAs
    (`ctaMap`, `ctaMethodology`, `ctaScorecard`) — the maximum the skill allows —
    6 icons, 1 card. The hero is an asymmetric cinematic composition, not a
    centred-text-over-gradient template.

14. **Route-level code splitting with a branded loader.** Every page is a lazy
    chunk; the Suspense fallback is the product's own animated mark.

15. **The 404 page follows the design system**, with a real `<h1>`, `carbon-70`
    body copy, and a visually distinct primary vs secondary CTA.

16. **Loading, empty, and error states are broadly present** — 216 loading-state
    references, 31 skeletons, 27 `role="status"`, 38 retry affordances, 11 error
    boundaries.

17. **No browser dialogs except two** — `window.alert` ×0, `window.confirm` ×0,
    `window.prompt` ×2 (finding 3.12).

---

## Recommended order of work

Ordered by impact-per-unit-risk, per `design-auditor`'s fix-session rules
(max 30 fixes per session; structural changes need a decision, cosmetic ones are
auto-fix).

**Session 1 — contrast (auto-fix, ~170 sites, no structural risk)**
3.1 `text-carbon-black`→`text-white` on red (12) · 3.2 carbon-30→carbon-60 prose ·
3.8 carbon-40/50→carbon-60 (109) · 2.9 hardcoded hex → tokens

**Session 2 — dialog correctness (structural, one primitive)**
3.5 focus trap in `BottomSheet` · 3.6 Escape on `PdfExportConfigModal` ·
3.7 dialog semantics on the two bare modals · 2.10 `aria-labelledby`

**Session 3 — token compliance (mechanical, moves 88% → 90%+)**
3.13 map `rose`/`emerald`/`blue` to semantic tokens · 1.1 `bg-nasa-red`→`bg-primary` ·
1.2 route inline SVGs through `MaterialIcon`

**Session 4 — typography and density (mechanical, wide diff)**
3.9 sub-11px floor · 2.12 weight demotion · 2.1 `transition-all` → explicit ·
2.2 radius scale · 2.6 `space-*` → `gap-*`

**Session 5 — first-viewport restructure (structural, needs a decision)**
3.3 diagnostics off the Dashboard · 2.5 crimson reserved for the primary action ·
1.5/1.6 eyebrow and count triage

**Session 6 — navigation and motion**
3.10 route-change focus/scroll · 3.11 form error association · 3.12 replace
`window.prompt` · 2.3 `active:` states · 2.13 easing

**Deferred pending a browser:** 2.4 line length, and all of Responsive Design
(category 7, currently scored 75 unverified).
