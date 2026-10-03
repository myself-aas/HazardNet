# Meridian Rollout Plan — migrating HazardNet's entire frontend

> **Status:** Phase 0 complete. Phases 1–10 planned.
> **Design system:** [`MERIDIAN.md`](./MERIDIAN.md) · tokens `packages/design-system/src/meridian.ts` · CSS `frontend/src/styles/meridian.css`
> **Method note:** Meridian is original. It applies principles Apple and Meta publish as
> guidance; it contains no Apple or Meta CSS, artwork, logos or typefaces. Nothing in this
> plan involves reproducing a third-party frontend.

---

## 0 · Measured starting point

Numbers below were counted on the working tree, not estimated.

| Metric | Value |
|---|---|
| `.tsx` files in `frontend/src` | **178** |
| Files still using `carbon-*` / `nasa-*` classes | **123** (69%) |
| Total `carbon-*` / `nasa-*` class instances | **5,289** |
| Files already on Meridian | 2 surfaces (`FrontDoor.tsx`, `Navbar.tsx`) + 3 primitive modules |
| Test files that assert on styling or DOM structure | **12** |
| Mobile / Windows shells (`apps/`) | **54** `.tsx` |

### The five highest-density surfaces

| Instances | File | Track |
|---|---|---|
| 400 | `components/district/DistrictBriefBody.tsx` | console |
| 309 | `components/LiveMapView.tsx` | console |
| 217 | `components/DisasterDetailModalUI.tsx` | console |
| 212 | `pages/Dashboard.tsx` | console |
| 196 | `pages/AdvisoriesPage.tsx` | editorial |

### Where the 5,289 instances actually are

| Count | Class | Meridian role it maps to |
|---|---|---|
| 945 | `text-carbon-60` | `--mrd-label-secondary` |
| 824 | `border-carbon-20` | `--mrd-separator` |
| 617 | `text-carbon-90` | `--mrd-label` |
| 419 | `bg-carbon-05` | `--mrd-bg-grouped` |
| 370 | `text-carbon-70` | `--mrd-label-secondary` |
| 350 | `text-carbon-80` | `--mrd-label` |
| 244 | `bg-carbon-10` | `--mrd-bg-grouped` |
| 121 / 117 | `bg-carbon-90` / `bg-carbon-80` | `--mrd-bg-inverse` |
| 114 | `text-nasa-red-shade` | **needs a decision, see §1.3** |
| 106 | `text-nasa-blue-shade` | `--mrd-action-interactive` |

Three classes (`text-carbon-60`, `border-carbon-20`, `text-carbon-90`) are **45% of all
instances**. Any plan that does not handle those three mechanically is a plan to hand-edit
2,400 call sites.

---

## 1 · The central technical decision: bridge, don't rewrite

### 1.1 Why a codemod, not a manual pass

5,289 instances across 123 files is roughly 40–60 hours of hand-editing, during which the
repo is either broken or visually inconsistent, and every edit is a chance to change a
contrast ratio nobody re-measures. It also produces a diff nobody can review.

So the migration runs in **two mechanical layers**, then a manual layer for the residue:

```
Layer A  token bridge     (CSS only — zero component edits, instant, reversible)
Layer B  class codemod    (scripted, per-family, gated, per-directory)
Layer C  component pass   (manual — only where structure must change)
```

### 1.2 Layer A — the token bridge (highest leverage, lowest risk)

The old layer already resolves through CSS custom properties. `text-carbon-60` →
`--hds-color-carbon-60`. **Re-pointing the carbon ramp at Meridian roles changes all 5,289
instances at once without touching a single component.**

Concretely, in `meridian.css`, appended after the existing `@theme inline` mapping:

```css
/* Layer A — bridge. Old family names keep working; their VALUES become Meridian's.
   This is the same move HDS 2.2 made when it re-pointed Tailwind's grey families
   at NASA's carbon ramp. Reversible by deleting this block. */
@theme inline {
  --color-carbon-05: var(--mrd-bg-grouped);      /* was #f6f6f6 */
  --color-carbon-10: var(--mrd-bg-grouped);
  --color-carbon-20: var(--mrd-separator);       /* was #e3e3e3 */
  --color-carbon-30: var(--mrd-separator-opaque);
  --color-carbon-60: var(--mrd-label-secondary); /* was #959599 — 4.46:1, under AA */
  --color-carbon-70: var(--mrd-label-secondary);
  --color-carbon-80: var(--mrd-label);
  --color-carbon-90: var(--mrd-label);
  --color-nasa-blue: var(--mrd-action-interactive);
  --color-nasa-blue-shade: var(--mrd-action-interactive);
}
```

**What this buys immediately:** dark mode and high contrast start working on surfaces that
have not been migrated, because the old class names now resolve through adaptive roles.

**It does not, by itself, fix contrast — and the reason matters for how Phase 1 is scoped.**
The carbon ramp measured against white:

| Step | Value | On white | Verdict |
|---|---|---|---|
| `carbon-40` | `#959599` | 2.98:1 | below AA **on a light ground** |
| `carbon-50` | `#77777a` | 4.46:1 | below AA **on a light ground** |
| `carbon-60` | `#58585b` | **7.09:1** | **AAA** — the workhorse is already fine |
| `carbon-70` | `#444447` | 9.71:1 | AAA |
| `carbon-80` | `#2e2e32` | 13.52:1 | AAA |
| `carbon-90` | `#17171b` | 17.88:1 | AAA |

`text-carbon-60` is the single most-used text class in the codebase (945 instances) and it
already clears AAA. The classes that measure below AA on white — `text-carbon-50` (21) and
`text-carbon-40` (96) — are **not automatically failures**: this codebase uses the light
end of the ramp for text on dark grounds, where those same values pass comfortably. Of the
96 `text-carbon-40` sites, only 12 carry a dark background on the same element; the rest
inherit one from a parent.

So Phase 1 must **classify** those 117 sites rather than assume them broken. The bridge
still re-points them at an adaptive role, which is the correct outcome either way — but
claiming a fixed number of "accessibility fixes" up front would be inventing a number the
measurement does not support.

**Gate for Layer A:** `npm run check:tokens`, `__tests__/paletteTokens.test.js`,
`__tests__/primaryActionContrast.test.js`, `__tests__/staticShellContrast.test.js`,
`npm run check:design` (must stay at 0 new), plus a visual diff of `/`, `/live`, `/alerts`.

**Rollback:** delete the block. Nothing else references it.

### 1.3 The one family that needs a human decision: `text-nasa-red-shade` (114)

This cannot be codemoded, because the answer differs per call site and the difference is
the whole point of the dual-primary rule. Each of the 114 must be classified:

| If the crimson is marking… | Then it becomes |
|---|---|
| an actual hazard, alert, severity or error | `--mrd-action-hazard` (stays crimson) |
| a navigation CTA or "go here" link | `--mrd-action-ink` or `--mrd-action-interactive` |
| decoration, a rule, an icon accent | `--mrd-label-tertiary` or removed |

Mechanically: `grep -rn "text-nasa-red-shade" frontend/src --include=*.tsx`, then decide
each. Expect roughly 60/40 hazard-vs-navigation. **This is the phase that most changes how
the product reads**, and it is the one that cannot be automated.

### 1.4 Layer B — the class codemod

Once Layer A has made the values correct, Layer B renames classes to roles so the codebase
stops depending on a ramp it no longer owns. A codemod, not a person:

```
scripts/migrate_to_meridian.mjs
  --family carbon|nasa|amber|emerald
  --dir frontend/src/components/map
  --dry-run | --write
  --report /tmp/codemod-report.json
```

Rules it encodes:

1. **Pure 1:1 renames** (`text-carbon-90` → `text-[color:var(--mrd-label)]`) applied
   automatically.
2. **Context-sensitive renames flagged, not applied.** A `border-carbon-20` on a card that
   Meridian says should have *no* border (lift, not frame) is reported for human review
   rather than silently converted.
3. **Never touches a file whose test asserts a class name.** The 12 files in §3 are read
   first; matches are skipped and listed.
4. **Idempotent and reviewable.** Emits a per-file diff and a JSON report; `--dry-run` first,
   always.
5. **Per-directory, never repo-wide.** One PR per directory so a reviewer sees 200 changes,
   not 5,000.

### 1.5 Layer C — component pass

Only where *structure* must change, not just colour: replacing a bordered panel with a
lifted card, swapping a bespoke badge for `SeverityBadge`, converting a row of buttons into
`PillTabs`. Estimated at ~30 files, concentrated in the console.

---

## 2 · Phases

Sequenced by **risk-adjusted value**: start where the token bridge pays off most and the
tests are thinnest, and leave the surfaces with structural test assertions until the codemod
is proven.

### Phase 1 — Token bridge + codemod infrastructure
**Scope:** `meridian.css` bridge block · `scripts/migrate_to_meridian.mjs` · report format.
**Steps:**
1. Add the Layer A bridge block; run the full gate suite; screenshot `/`, `/live`, `/alerts`,
   `/districts/bogra` at 360 / 768 / 1440.
2. Write the codemod with `--dry-run` and the skip-list behaviour from §1.4.
3. Dry-run it repo-wide; publish the report as `docs/design-system/MIGRATION_REPORT.md`.
   This report *is* the remaining backlog, generated rather than guessed.

**Gate:** 0 new design findings · all 12 styling tests green · visual diff reviewed.
**Exit criteria:** every remaining instance classified in the report.
**Effort:** 1 day. **Risk:** low — reversible by deleting one CSS block.

### Phase 2 — Console core: the map and the district brief
**Scope:** `LiveMapView.tsx` (309), `DistrictBriefBody.tsx` (400), `DistrictDetailPanel.tsx`
(112), `components/map/*`, `DistrictForecastCard.tsx`.
**Why first:** 821 instances, the densest surfaces, and the place the `console` track
either proves itself or does not. Also the highest-traffic authenticated surface.

**Steps:**
1. Wrap the console root in `.mrd-track-console`; delete per-component radius overrides.
2. Codemod `frontend/src/components/map` and `components/district` per-directory.
3. Manual: replace bordered panels with lifted cards; route severity through `SeverityBadge`
   so colour+shape+label is guaranteed rather than remembered.
4. **Preserve opacity on surfaces carrying data.** The existing map-card contracts assert
   this and Meridian agrees: glass is for chrome, never behind a table.

**Gate:** `MapLegend`, `MapToolbar`, `MapDistrictTable`, `DistrictForecastCard` tests green ·
`primaryActionContrast` green · 44px audit on every control · visual diff at 3 widths.
**Effort:** 3–4 days. **Risk:** medium — highest test density.

### Phase 3 — Console analytics and alerts
**Scope:** `Dashboard.tsx` (212), `DisasterDetailModalUI.tsx` (217), `AdvisoriesPage.tsx`
(196), `AlertsPage.tsx`, `RiskAnalytics.tsx`, `NationalOverview.tsx`, all chart surfaces.
**Steps:**
1. Codemod per-directory.
2. Convert filter/tab rows to `PillTabs` (real tablist semantics, arrow-key navigable).
3. **Chart colours stay on the NASA dataviz ramp.** NASA forbids brand red/blue in dataviz
   and the values are asserted by legend tests. Meridian does not change this.
4. `indigo` and `purple` stay off-system — they are data encodings, and `check:tokens`
   documents them as deliberate.

**Gate:** `AlertsPage`, `Phase6Surface`, `alertsA11y` green · chart legend tests green ·
`check:tokens` ≥ 90%.
**Effort:** 3 days. **Risk:** medium.

### Phase 4 — Editorial surfaces
**Scope:** `FrontDoor` remainder, `About`, `UseCases`, `HazardsPage`, `HazardDetailPage`
(121), `HistoricalCatalogPage`, `Documentation`, `ArticlePage`, `Blogs`.
**Steps:**
1. Apply the `editorial` track: soft radii, pill CTAs, 96px section rhythm, alternating
   dark bands.
2. Adopt `SectionHeading` (eyebrow + title + standfirst) so vertical rhythm is identical
   everywhere rather than per-page.
3. Apply scroll reveal via `useReveal` — opt-in, and failing **open** under reduced motion
   so content is never hidden behind an animation that will not run.
4. Prose measure: cap reading columns at ~68ch. Long-form Bengali advisory copy at
   `--mrd-bn-leading` (1.65).

**Gate:** `designTypography` green (it enforces the ≥1.3 body-leading floor and bans
`leading-none` on wrapping elements — it already caught one of my own regressions) ·
prerender output unchanged in structure · `check:paths` 0.
**Effort:** 3 days. **Risk:** low.

### Phase 5 — Chrome: nav, footer, drawers, modals, command palette
**Scope:** `Navbar` remainder, `Footer.tsx` (107), `MenuDrawer`, `BottomSheet`,
`CommandPalette`, `FloatingControlBar`, `ChatBot`, all modals.
**Steps:**
1. Nav is already on `.mrd-glass`. Extend to the drawer and the map HUD — **chrome only**.
2. Footer: 107 instances, all links. Standardise to `--mrd-label-secondary`, 44px hit area,
   and the concentric radius rule for nested groupings.
3. Modal and sheet radii from `--mrd-radius-xl` / `--mrd-radius-sheet`; elevation from
   `--mrd-shadow-modal`.
4. Focus management audit: every modal traps focus, restores it on close, and shows
   `--mrd-focus-ring`. `useDialogBehavior.test.tsx` already covers part of this.

**Gate:** `NavbarOverlayLayering`, `useDialogBehavior`, `FrontDoorLivePanels` green ·
keyboard-only pass through nav → drawer → modal → palette.
**Effort:** 2–3 days. **Risk:** low–medium (z-index and focus are easy to break quietly).

### Phase 6 — Auth and account
**Scope:** `LoginPage`, `SignUpPage`, `ForgotPasswordPage`, `SetPasswordPage`,
`UpdatePasswordPage`, `UserProfilePage` (155), `UserDashboardPage`, `PublicProfilePage`,
`components/auth/*`, `components/user/*`.
**Steps:**
1. Editorial track, single-column, one primary action per screen — the ink pill.
2. **No crimson anywhere in auth.** It is the surface where a red button most reads as
   "something is wrong", which is exactly the confusion the dual-primary exists to prevent.
3. `UserProfilePage` at 155 instances is the largest auth surface — codemod then review.
4. Forms: 44px minimum, `--mrd-separator-opaque` borders (control boundaries must clear
   WCAG 1.4.11's 3:1), error text at `--mrd-action-hazard` **plus** an icon, never colour alone.

**Gate:** `AuthPages`, `AuthSocialButtons`, `BrandPanel`, `UserProfilePage` green ·
`passwordStrength` green · screen-reader pass on every field and error.
**Effort:** 2–3 days. **Risk:** low.

### Phase 7 — Motion and interaction layer
**Scope:** all `Interactive.*` uses, `motion-config.ts`, `motion-interpolate.ts`, Remotion
compositions.
**Steps:**
1. Route durations and curves through `MERIDIAN_MOTION` instead of inline values.
2. Enforce the compositor rule: only `opacity`, `transform`, `filter` animate. Audit for
   `width`/`height`/`top`/`left` animations and convert them.
3. **No overshoot anywhere.** `check:design` bans bounce-easing and the reason holds on a
   hazard surface — a control that wobbles past its resting place reads as indecisive.
4. Reduced-motion audit: every animation has an off state, and no content is hidden behind
   one.
5. Remotion compositions (`HeroComposition`, `LiveStatusComposition`, `RunVisualComposition`)
   take Meridian tokens via `remotionTheme.ts` so exported video matches the app.

**Gate:** `phase2MotionComponents`, `phase3RemotionHero` green · Lighthouse perf ≥ baseline ·
manual reduced-motion pass with the OS setting on.
**Effort:** 2 days. **Risk:** low.

### Phase 8 — Assets
**Scope:** `public/hazard-glyphs.svg` (done), hero media, OG images, PWA icons, loaders.
**Steps:**
1. Original vector artwork only. The 13 glyphs are `currentColor` so one file serves light,
   dark and greyscale print.
2. Hero: the existing Remotion-rendered `Hero_Section_*.mp4` ladder stays; re-render with
   Meridian tokens rather than replacing it.
3. No stock disaster photography. The existing rationale stands and is worth keeping: a
   stock flood image dates the page to a disaster it is not describing.
4. Respect the font payload budget — `npm run check:fonts` currently reports 0 WOFF2 /
   0 KiB, and the "no remote font URL" contract is enforced by `meridianParity.test.js`.

**Gate:** `check:fonts` · `check:paths` · `heroMedia` test green.
**Effort:** 2 days. **Risk:** low.

### Phase 9 — Dark mode and high contrast rollout
**Scope:** app-wide.
**Why last:** dark mode is only honest once every surface resolves through roles. Shipping
a theme toggle while 123 files still hard-code `bg-white` produces a half-dark app, which is
worse than no dark mode.

**Steps:**
1. Wire `useMeridianTheme` into the shell; persist to `localStorage`; default to `system`.
2. Replace hard-coded `bg-white` / `text-white` with `--mrd-bg-elevated` / `--mrd-on-elevated`.
3. `prefers-contrast: more` already maps to the high-contrast theme — verify, don't rebuild.
4. Audit the map tiles and Leaflet chrome, which do not inherit CSS custom properties.
5. Test all three themes × 3 viewports × reduced-motion on/off.

**Gate:** `staticShellContrast` green · axe clean in all three themes · no `bg-white` outside
the theme layer.
**Effort:** 3 days. **Risk:** medium — highest chance of a surface missed.

**Status: shipped (2026-10-03).** Steps 1, 3, 4 and 5 are done as written. Step 2 was executed as
the variable route the audit recommended instead of a per-file sweep: `frontend/src/styles/dark.css`
(imported last from `index.css`) re-points the carbon ramp by role, pins the fills that must stay
dark, re-mixes the status grounds, and re-points Leaflet, the popups and the native controls;
`PrintPreviewModal` marks its paper `hn-paper` so it stays white in either theme. The gate is
`__tests__/darkTheme.test.js` (30 tests), whose coverage test fails on any colour family used in
`frontend/src` that is neither theme-aware nor a declared data encoding - the machine gate §5.2 of
the audit asked for. `useMeridianTheme` is back to `'system'`.

Two decisions worth carrying forward from it:

- **Fills and inks are separate roles.** `text-carbon-90` (615 uses) must go light in a dark theme;
  `bg-carbon-90` chrome (a dark console panel) must stay dark. They cannot share one ramp position,
  which is why the theme layer pins the fills rather than re-pointing every step twice.
- **Status grounds are a role, not a shade.** Rose/red/emerald/blue/sky/yellow/orange are
  role-aliased, so one `color-mix(… over --mrd-bg-elevated)` per role covers every 50-200 step;
  per-shade dark rules would be 7 x 8 dead-end rules.

### Phase 10 — Retire the old layer
**Scope:** `--nasa-*` aliases, legacy `--hn-*` names, the HDS 2.2 doc.
**Steps:**
1. Only after 0 remaining `carbon-*`/`nasa-*` instances (the Phase 1 report tracks this).
2. Delete the bridge block, then the aliases, one commit each.
3. Update `frontend/DESIGN_SYSTEM.md` to point at `MERIDIAN.md`; keep it as a historical
   record rather than deleting it — the reasoning in it is still useful.
4. Bump `@hazardnet/design-system` and update the RN parity table.

**Gate:** full suite · `check:tokens` · build + prerender.
**Effort:** 1 day. **Risk:** medium — deleting tokens breaks things at runtime, not compile time.

### Phase 9.1 — one icon vocabulary and the phone table (`done`, 2026-10-03)

Two cross-platform decisions the audit deferred (backlog 10 and 9) and this pass closed:

- **Icons.** One family: `lucide-react` on web, `react-native-svg` on native, and a *generated*
  shared registry between them (`data/design/icon-registry.json` →
  `packages/design-system/src/icons.ts`, built by `scripts/generate-icon-glyphs.mjs`; native
  component `apps/mobile/src/components/Icon.tsx`). One stroke (1.75), one size scale, no emoji on
  either platform. `components/MaterialIcon.tsx` is frozen with a shrinking-importer ratchet.
- **Tables.** `components/ui/CardStackTable.tsx` gives every content table a card stack below
  `md`; `data/design/table-stack-baseline.json` ledgers the tables that remain, with reasons.
  This is also the cheapest possible answer to the RN port: the phone card *is* the native list
  row, so a ported screen has nothing to translate.
- The type floor is 12px on both platforms, and `MERIDIAN_RADIUS_ROLES` is one object both
  platforms spread. Gates: `iconFamily`, `tableStack`, `designTypography`.

### Phase 11 (parallel) — React Native and Windows shells
**Scope:** `apps/mobile`, `apps/windows` — 54 `.tsx`.
Runs in parallel from Phase 3 onward, since the token source is shared:
`minHeight/minWidth: 44` (48 Android), `expo-font` preload of the open-source stacks
**including the Bengali faces**, `track` as a prop on the surface root rather than a
per-component variant, `react-native-reanimated` mirrors of the web curves, and the
dual-primary rule intact.

---

## 3 · Risk register — the 12 files that assert on styling

These fail if a class name changes. The codemod must read them first and skip matches.

| File | What it protects |
|---|---|
| `__tests__/paletteTokens.test.js` | bans `slate/gray/zinc/neutral/stone`; allows only carbon's own values |
| `__tests__/tokenCompliance.test.js` | declared palette shades must not point back at raw hex |
| `__tests__/designTypography.test.js` | ≥1.3 body leading; no `leading-none` on wrapping elements; h1 ≤ 48px |
| `__tests__/nasaTokens.test.js` | vendored NASA values are byte-for-byte |
| `__tests__/primaryActionContrast.test.js` | primary action contrast |
| `__tests__/staticShellContrast.test.js` | prerendered shell contrast |
| `__tests__/designTokensParity.test.js` | HDS 2.2 token values and severity scale |
| `components/__tests__/NavbarOverlayLayering.test.tsx` | z-index layering |
| `pages/__tests__/AlertsPage.test.tsx` | alerts surface structure |
| `pages/__tests__/DistrictDetailPage.phase5.test.ts` | district brief structure |
| `pages/__tests__/Phase6Surface.test.ts` | surface contracts |
| `pages/__tests__/StatusPage.test.tsx` | status surface |

**Known constraint:** `designTokensParity.test.js` pins HDS 2.2 values
(`primaryRedShade === '#b60109'`, `version === '2.2.0'`). Phase 10 must update that test in
the same commit that retires the layer, or the build breaks.

---

## 4 · Audit layer (from the `ux-audit` pattern)

Run per phase, not just at the end.

- **L1 static** — `tsc` · `jest` · `check:tokens` · `check:design` · `check:paths` · `check:fonts`
- **L2 visual** — screenshots at 360 / 768 / 1440, light and dark, reduced-motion on and off;
  diff against the previous phase
- **L3 dynamic** — keyboard-only pass, screen-reader pass, Lighthouse, and a real low-bandwidth
  pass (this product's audience is on a poor connection; a design that needs 4G to look right
  is the wrong design for it)

---

## 5 · Definition of done

- [ ] 0 remaining `carbon-*` / `nasa-*` class instances (tracked by the Phase 1 report)
- [ ] Every surface declares a track: `editorial` or `console`
- [ ] Crimson appears **only** on hazard, severity, alert and error
- [ ] Every interactive element clears 44px (48 on Android)
- [ ] All three themes pass axe with no contrast violations
- [ ] Reduced motion turns animation off, and hides nothing
- [ ] Severity is colour + shape + label everywhere
- [ ] `check:design` at 0 new findings; `check:tokens` ≥ 90%
- [ ] Full suite green except the known pre-existing `advisoryPipeline` failure
- [ ] Mobile shells match on the shared token source

---

## 6 · Sequencing summary

| Phase | What | Effort | Risk |
|---|---|---|---|
| 1 | Token bridge + codemod | 1d | low |
| 2 | Console core (map, district) | 3–4d | medium |
| 3 | Analytics + alerts | 3d | medium |
| 4 | Editorial surfaces | 3d | low |
| 5 | Chrome (nav, footer, modals) | 2–3d | low–med |
| 6 | Auth + account | 2–3d | low |
| 7 | Motion | 2d | low |
| 8 | Assets | 2d | low |
| 9 | Dark mode + high contrast | 3d | medium |
| 10 | Retire old layer | 1d | medium |
| 11 | RN / Windows (parallel) | 4d | medium |

**~26–29 working days** for one engineer. Phase 1 comes first because one reversible CSS
block gives every unmigrated surface dark-mode and high-contrast adaptivity at once, and
because the codemod dry-run it produces turns the remaining 5,289 instances into a counted,
classified backlog instead of an estimate.
