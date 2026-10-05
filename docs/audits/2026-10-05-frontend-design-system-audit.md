# Frontend design-system audit — 2026-10-05

**Scope:** the whole web design system — `packages/design-system/`, `frontend/src/design-system/`,
`frontend/src/styles/`, `frontend/src/index.css`, the component layers under `frontend/src/components/`,
the seven `npm run check:*` design gates, the 74 Jest suites, and the production bundle.
Native (`apps/mobile`, `apps/windows`) is in scope only where it shares a token.

**Method:** the audit framework from
[`agent-skills-audit`](https://clawskills.sh/skills/swader-agent-skills-audit) — two-pass,
six specialist roles (security / performance / UX / DX / edge case / tie-breaker lead), findings
ordered by severity then blast radius, every finding carrying file references, a confidence mark and
a verification test. The design rubric is
[`web-design-pro`](https://clawskills.sh/skills/kjaylee-web-design-pro) (three-tier token hierarchy,
WCAG 2.1 contrast and keyboard nav, Core Web Vitals, fluid `clamp()` / container queries) cross-checked
against [`anti-slop-design`](https://clawskills.sh/skills/kjaylee-anti-slop-design) (generic-AI-aesthetic
anti-patterns) and the review stance of
[`critical-code-reviewer`](https://clawskills.sh/skills/ziad-hsn-critical-code-reviewer). All four are
catalogued in VoltAgent's
[awesome-openclaw-skills · Web & Frontend Development](https://github.com/VoltAgent/awesome-openclaw-skills/blob/main/categories/web-and-frontend-development.md).

**Baseline state at audit time — everything the repo measures is green:**

| Gate | Result |
|---|---|
| `check:tokens` | PASS — 6,536 palette uses, 99.8% compliance, 475 hex literals (baseline 488) |
| `check:design:source` | PASS — 21 outstanding, 0 new |
| `check:brand` | PASS — every colour resolves to a declared token |
| `check:fonts` | PASS — 43.31 KiB / 50.00 KiB, one face |
| `check:prose` | PASS |
| `check:important` | PASS — every `!important` justified |
| `icons:check` | PASS |
| `tsc --noEmit` | PASS — 0 errors |
| Design Jest suites | PASS — 198 tests across 10 suites |
| `vite build` | PASS — 108 routes prerendered |

**That is the point of this audit.** Every automated gate passes, so the findings below are all in
the space the gates do not cover: they measure *token hygiene* (does a colour resolve to a declared
token) and almost never *adoption* (does the product actually use the system), *rendered condition*
(is the ratio true where the pixel lands), or *the shipped artefact* (does the built HTML behave).

---

## Resolution status — updated after the Apple migration

The audit was followed by a decision to delete every dead design system and implement the Apple
system (`npx getdesign@latest add apple`) as the single system across the whole frontend. That
work is done, and it closes most of what is below. The findings are **left as written** — they are
the record of what was true at audit time — with the disposition noted here.

| # | Severity | Status | How |
|---|---|---|---|
| F-01 | HIGH | **Fixed** | Two independent pre-hydration mechanisms: a `prefers-color-scheme` arm in `apple.css` that needs no JavaScript, plus an inline un-deferred boot script in `index.html` that honours an explicit choice disagreeing with the OS. Pinned by 6 tests in `appleParity`. |
| F-02 | HIGH | **Resolved by deletion** | Meridian no longer exists. Its component layer, tokens and stylesheet are gone; `appleParity` asserts the 10 removed paths stay removed. Adoption is now the only option, not a choice. |
| F-03 | HIGH | **Fixed** | One z-index scale, published by the surviving system. |
| F-04 | MEDIUM-HIGH | **Fixed** | Contrast is now measured on **both** grounds — white and parchment `#f5f5f7` — for every text neutral, every severity level and every hazard hue. This also moved the grey floor: carbon-50 `#6e6e73` clears AA on both (5.07 / 4.66) and is the smallest text grey; carbon-40 is non-text only. |
| F-05 | MEDIUM | **Fixed** | `appleParity` reads expected values back out of `DESIGN.md` rather than trusting transcription, and pins the full neutral ramp, all 16 type styles, radii, spacing, severity and motion. |
| F-06 | MEDIUM | **Fixed** | The gate now validates against the document that *is* the design system. |
| F-07 | MEDIUM | **Partly fixed** | The shareable artefacts (Remotion compositions, hero media) are now explicitly classed as *media*, not chrome — content the system does not govern — and that exemption is enforced and justified in `colourDiscipline.test.js` rather than being an unexamined gap. |
| F-08 | MEDIUM | **Fixed** | Both cited sources exist: `DESIGN.md` (the specification) and `docs/design-system/APPLE.md` (HazardNet's four extensions). The stale `MERIDIAN.md` and `MIGRATION_PLAN.md` are deleted. |
| F-09 | LOW-MEDIUM | **Fixed** | The `--hds-*` / `--hn-*` shim is gone: 173 call sites were rewritten to the `--ap-*` tokens they aliased and the 93 alias declarations deleted. CSS shipped dropped from 259 kB to 251 kB. |

**Two defects the migration found that this audit did not**, both caught by new tests rather than
by review:

- The native primary button was drawing **ink black**, not Action Blue — `primaryAction` was wired
  to `roles.label` in `apps/mobile/src/theme/theme.ts`, a leftover grammar from the previous
  system. Caught by `nativeAppleParity`.
- Six components each kept a **private hazard palette** built from Tailwind defaults, and they
  disagreed with one another: "Tropical Cyclone" was `#7c3aed`, `#ef4444` and `#f43f5e` depending
  on the file. Now one solved, contrast-verified palette (`APPLE_HAZARD`), enforced by
  `colourDiscipline`.

**Current state:** 168 web suites / 1730 tests and 12 native suites / 108 tests pass; all six
design gates pass; 435 off-system colour literals reduced to a justified exemption list of
third-party brand marks, cinematic media and one generated asset.

---

## Findings

### F-01 · HIGH · Dark-mode users get a light-painted flash on all 108 prerendered routes

**Confidence:** high. **Blast radius:** every prerendered route, every dark-mode visitor.

The dark theme is keyed exclusively on `[data-mrd-theme='dark']` and `.dark`
(`frontend/src/styles/dark.css:27-28`). That attribute is written in a React effect —
`frontend/src/components/meridian/motion.ts:225-226`:

```ts
root.setAttribute('data-mrd-theme', resolvedTheme);
root.classList.toggle('dark', resolvedTheme === 'dark');
```

The default theme is `'system'` (`motion.ts`, `useMeridianTheme`), so a visitor whose OS is dark
*should* get dark. But:

- `frontend/index.html` has no inline theme-bootstrap script (the only `<script>` is the module entry).
- The 108 prerendered documents carry no `data-mrd-theme` on `<html>`.
- There is **no `prefers-color-scheme` fallback anywhere** — 0 occurrences in `frontend/src/**/*.css`
  and 0 in the built `index-*.css`.

So the sequence for a dark-mode visitor is: fully light page → download and execute the JS →
hydrate → effect runs → snap to dark. The JS payload is **5.3 MB across 15 chunks** (`vendor-pdf`
844 KB, `vendor-firebase` 684 KB, `index` 868 KB). On the stated target device — a low-end Android in
direct sunlight — that flash is not a frame, it is seconds of the wrong page.

This is a Core Web Vitals problem as well as a UX one: the repaint is a layout-stable but
full-viewport colour change after hydration.

**Why no gate caught it:** `darkTheme.test.js` computes contrast for every role and fails on an
unmapped step — it validates the *theme layer*, correctly and thoroughly. Nothing validates *when
the theme is applied*, and nothing inspects the prerendered HTML.

**Fix.** Either is sufficient; the first is cheaper and works with JS disabled:

1. Add a `@media (prefers-color-scheme: dark)` block to `dark.css` that applies the same
   re-pointing when no explicit `data-mrd-theme` is set:
   `@media (prefers-color-scheme: dark) { :root:not([data-mrd-theme='light']) { /* … */ } }`.
   This mirrors the existing `:root:not([data-mrd-theme='dark'])` pattern already used at
   `meridian.css:270`.
2. Or have `scripts/prerender.mjs` inject a blocking inline script that reads `localStorage` plus
   `matchMedia('(prefers-color-scheme: dark)')` and sets the attribute before first paint.

**Verification test:** assert that the built `frontend/dist/index.html` either contains a
theme-bootstrap script or that the built CSS contains a `prefers-color-scheme: dark` block. One
assertion, runs against `dist`, fails closed.

---

### F-02 · HIGH · Meridian's component layer is fully specified and almost entirely unadopted

**Confidence:** high. **Blast radius:** the whole UI surface; this is the root cause of most drift.

`packages/design-system/src/meridian.ts` is 714 lines of carefully reasoned, measured tokens.
`frontend/src/components/meridian/primitives.tsx` implements `Button`, `ButtonLink`, `Card`,
`Eyebrow`, `SectionHeading`, `SeverityBadge`, `Figure`, `PillTabs`, `ProvenanceNote`, `StateBlock`.
`frontend/src/styles/meridian.css` defines 77 `.mrd-*` classes.

Measured adoption across 147 non-test page/component `.tsx` files:

| Layer | Adoption |
|---|---|
| `meridian/primitives` imports | **1 file** — `frontend/src/pages/FrontDoor.tsx:59` |
| `MERIDIAN_*` TS token imports in `frontend/src` | **0** |
| `var(--mrd-text-*)` (the named type scale) | **24** uses, vs **2,441** Tailwind `text-*` utilities |
| `var(--mrd-z-*)` | **0** uses |
| `var(--mrd-tap-min)` | **7** uses, vs **216** `min-h-[44px]` literals |
| Raw `<button>` elements | **372** |
| `.mrd-*` classes never used | **14 of 77** |

The 14 unused classes are not peripheral. They are `.mrd-focusable` (the focus-ring utility),
`.mrd-glass` / `.mrd-glass-strong` / `.mrd-glass-dark` (the entire Apple-derived Material layer),
`.mrd-container` / `.mrd-container-wide` (the two layout tracks), `.mrd-display` / `.mrd-title` /
`.mrd-body` (the type roles), `.mrd-bn` / `.mrd-bn-display` (the Bengali metrics), `.mrd-band-dark`,
`.mrd-rule`, `.mrd-section-tight`.

Several of those capabilities *do* work in the product — Bengali typography is handled at
`index.css:66-72` via `[lang="bn"]`, focus rings via Tailwind `focus-visible:` (156 occurrences) —
but through a second, parallel mechanism. That is the actual finding: the system is not missing,
it is *duplicated*, and the copy the documentation calls canonical is the one nothing imports.

This also explains why every gate is green. `check:tokens` asks "does this colour resolve to a
declared token?" — and it does, because `@theme inline` re-points Tailwind's whole palette onto
NASA carbon (`index.css:990-1047`), which is a genuinely clever containment strategy. But a
`<button className="rounded-lg bg-carbon-90 px-4 py-2 text-sm">` is 100% token-compliant and 0%
design-system. The gate cannot tell the difference.

**Fix.** Do not attempt a 372-button migration. Instead:

1. Add an **adoption ratchet** alongside the existing hex/token baselines: count raw `<button>` and
   `<a className>` call sites per directory, commit the count, fail on increase. Same mechanism as
   `data/design/hex-baseline.json`, same proven ergonomics.
2. Pick the two highest-traffic surfaces (`/live` console, `/alerts`) and migrate those to
   primitives first — they are the surfaces where inconsistency costs the most.
3. Delete or document the 14 unused `.mrd-*` classes. An unused `.mrd-focusable` is worse than no
   `.mrd-focusable`, because it tells the next contributor the focus contract is handled.

**Verification test:** `__tests__/meridianAdoption.test.js` — assert the raw-`<button>` count per
directory is `<=` the committed baseline, and that every `.mrd-*` class defined in `meridian.css`
appears at least once in `frontend/src/**/*.tsx` or is listed in an explicit `unused-pending`
allowlist with a reason.

---

### F-03 · HIGH · Three z-index systems; the canonical one has zero users and conflicts with the one in use

**Confidence:** high. **Blast radius:** every overlay, modal, toast, map HUD and skip link.

| Role | `--z-*` (`index.css:358-365`) | `--mrd-z-*` (`meridian.css:131-142`) | |
|---|---|---|---|
| base | 0 | 0 | ok |
| map | 400 | 400 | ok |
| sticky | **10** | **1020** | conflict |
| nav | **40** | **1030** | conflict |
| overlay | **50** | **1050** | conflict |
| modal | **60** | **1060** | conflict |
| toast | **70** | **1090** | conflict |
| a11y | **80** | **1100** | conflict |

Six of eight role names resolve to two different numbers depending on which namespace you read.

- `--mrd-z-*` is the canonical scale. It is exported as `MERIDIAN_Z` (`meridian.ts:605-618`), it is
  the one pinned by `meridianParity.test.js:151`, and it has **0 usages in the application**.
- `--z-*` is not in the token file and is not parity-tested, and it is the one the app actually
  uses — **30 usages** (`App.tsx:326,333`, `ChatBot.tsx:173,206`, `CommandPalette.tsx:415`,
  `Footer.tsx:190`, `LiveMapView.tsx:1324,1368,1436`, …).
- Underneath both sit **52** bare Tailwind `z-0`…`z-50` utilities and **15** hardcoded arbitrary
  values: `3, 4, 6, 70, 1200, 2000, 3000, 9994, 9999, 10000, 10001`.

The parity test gives false assurance here: it proves `--mrd-z-modal` equals `MERIDIAN_Z.modal`,
which is true and irrelevant, because the modal in the product is stacked by `--z-modal: 60`, or by
`z-50`, or by `z-[9999]`.

**Fix.** Pick one. `--mrd-z-*` has the better value spacing (room between tiers) and is already the
documented scale. Re-point `--z-*` to it — `--z-modal: var(--mrd-z-modal)` — which fixes all 30
existing call sites with no component edits, then ratchet the 15 arbitrary values down.

**Verification test:** extend `meridianParity.test.js` to assert every `--z-*` in `index.css` is a
`var(--mrd-z-*)` reference (exactly the pattern already proven for `--hn-radius-*` at
`meridianParity.test.js:183-195`), plus a source scan that fails on new `z-[<number>]` literals.

---

### F-04 · MEDIUM-HIGH · Contrast is measured against white, but the system renders on a tinted canvas

**Confidence:** high (arithmetic). **Blast radius:** secondary and tertiary text on every card surface.

First, credit where it is due. I recomputed all 14 contrast ratios documented in
`packages/design-system/src/meridian.ts` from the hex values using the WCAG 2.1 relative-luminance
formula. **All 14 reproduce exactly** — 17.54, 16.19, 15.20, 7.61, 4.52, 9.06, 8.37, 10.29, 5.12,
10.13, 17.67, 9.17, 6.93, 8.04. The file's claim that "every contrast ratio in this file is
MEASURED, not estimated" is true. That is rare and worth keeping.

The problem is which pairings get documented. Meridian's stated premise is Meta's "white cards
lifted off a tinted canvas" (`meridian.ts:28`, `:109-112`), and it defines three grounds —
`surface: #FFFFFF`, `canvas: #F4F6F8`, `canvasGrouped: #ECEFF2`. Ratios are documented on `surface`
and on `darkCanvas`. The tinted grounds are measured only for `ink` and `brandCrimson`.

Computed for the undocumented pairings:

| Pairing | Measured | AA small text | Status |
|---|---|---|---|
| `inkTertiary` #6B7885 on `canvas` #F4F6F8 | **4.17:1** | 4.5:1 | **fails** |
| `inkTertiary` #6B7885 on `canvasGrouped` #ECEFF2 | **3.91:1** | 4.5:1 | **fails** |
| `blue` #1c67e3 on `canvasGrouped` #ECEFF2 | **4.44:1** | 4.5:1 | **fails (marginal)** |
| `inkSoft` on `canvas` / `grouped` | 7.02 / 6.59 | 4.5:1 | ok |
| `blue` on `canvas` | 4.73:1 | 4.5:1 | ok |
| white on `blue` / `crimson` / `success` / `warning` | 5.12 / 9.06 / 5.02 / 4.97 | 4.5:1 | ok |
| `darkLabelSecondary` / `darkCrimsonTint` / `darkBlueTint` on `darkSurface` | 7.68 / 5.81 / 6.74 | 4.5:1 | ok |

The token's own comment reads `inkTertiary: '#6B7885', // 4.52:1 on white — AA only; 14px and above`.
That is accurate and also the narrowest possible reading: 4.52 has 0.02 of headroom, and the moment
the same role is painted on the canvas the system was designed around, it is under AA.

Non-text contrast (WCAG 1.4.11, 3:1) for completeness: `hairline` 1.30:1, `hairlineStrong` 1.60:1,
`darkHairline` 1.49:1, `inkQuaternary` 2.94:1 on white. **These are mostly fine** — 1.4.11 exempts
purely decorative separators and disabled controls, and `inkQuaternary` is explicitly documented
"decorative and disabled states only, never text". The one case to check by hand is wherever
`hairline` is the *sole* visual boundary of a text input, which 1.4.11 does cover.

**Fix.** Extend `MERIDIAN_CONTRACT_CONTRAST` to enumerate each text role against all three light
grounds and all three dark grounds, and let the existing `meridianContrast.test.js` fail on the
three rows above. Then either darken `inkTertiary` to clear 4.5:1 on `canvasGrouped` (≈ `#636F7B`)
or add an explicit `inkTertiaryOnCanvas` role.

**Verification test:** `meridianContrast.test.js` — iterate the cartesian product of text roles ×
grounds rather than a hand-written list, assert ≥ 4.5:1, allowlist the documented large-text-only
exceptions by name.

---

### F-05 · MEDIUM · The TS↔CSS mirror claims to be drift-proof; 59% of it is unpinned

**Confidence:** high. **Blast radius:** silent divergence between the token file and what renders.

`frontend/src/styles/meridian.css:5-6` states: *"Mirror of packages/design-system/src/meridian.ts …
`__tests__/meridianParity.test.js` fails if the two drift."*

Measured: `meridian.css` defines **140** unique `--mrd-*` properties. `meridianParity.test.js` pins
**58** of them (19 primitives, 8 radii, 10 spacing steps, 5 touch, 9 motion, 5 shadows, 12 z-scale,
2 font stacks — counting the dynamic `test.each` blocks). **82 are unpinned (59%).**

What is unpinned, grouped:

| Group | Count | Examples |
|---|---|---|
| type scale | 32 | `--mrd-text-*`, `--mrd-leading-*`, `--mrd-tracking-*` (12/12/8) |
| action intent | 8 | `--mrd-action-ink`, `--mrd-action-hazard`, `--mrd-action-interactive` + foregrounds |
| material / glass | 7 | `--mrd-glass-bg`, `--mrd-glass-blur`, `--mrd-glass-saturate`, `--mrd-glass-dark-*` |
| semantic labels | 4 | `--mrd-label`, `--mrd-label-secondary`, `--mrd-label-tertiary`, `--mrd-label-quaternary` |
| backgrounds | 4 | `--mrd-bg-base`, `--mrd-bg-grouped`, `--mrd-bg-elevated`, `--mrd-bg-inverse` |
| focus | 3 | `--mrd-focus-ring`, `--mrd-focus-ring-width`, `--mrd-focus-ring-offset` |
| Bengali | 3 | `--mrd-bn-size-scale`, `--mrd-bn-leading`, `--mrd-bn-tracking` |
| fonts | 3 | `--mrd-font-mono`, `--mrd-font-bengali`, `--mrd-font-bengali-display` |
| separators / on-colours / dark | 6 | `--mrd-separator*`, `--mrd-on-*`, `--mrd-dark-surface-raised` |

The unpinned set is, almost exactly, the **semantic layer** — the roles components are supposed to
consume. The pinned set is the primitive layer. The parity test guards the layer that drifts least.

Note that `--mrd-label` and friends are legitimately declared three times (light / dark /
high-contrast at `meridian.css:205,237,271`), which is why a naive pin is not enough: the test needs
to compare against `MERIDIAN_THEMES[name]`, per theme.

**Fix.** Replace the hand-written arrays with a generated comparison: iterate `MERIDIAN_THEMES`,
`MERIDIAN_TYPE_SCALE`, `MERIDIAN_ACTION_INTENT`, `MERIDIAN_MATERIAL` and `MERIDIAN_BENGALI`, derive
the CSS variable name from the key, and assert. Then add the inverse assertion — every `--mrd-*`
in the CSS must be reachable from a TS export — so a new CSS-only token fails the build.

**Verification test:** the inverse assertion above is the valuable half. It is ~15 lines and it makes
the file header's claim true for the first time.

---

### F-06 · MEDIUM · The automated design gate validates against a document that is not the design system

**Confidence:** high. **Blast radius:** every future design finding is graded against the wrong spec.

`scripts/check-design-quality.mjs` shells out to the `impeccable` detector
(`check-design-quality.mjs:82`), which validates typography against **`DESIGN.md`**. But:

- `DESIGN.md` is a 37 KB Apple-web visual reference. It mentions Meridian **0 times**.
- `frontend/DESIGN_SYSTEM.md:3` names the canonical sources as
  `docs/design-system/MERIDIAN.md` and `packages/design-system/src/meridian.ts`.

Consequences, visible in the current 21 findings:

- **False positive:** `index.css:9` is flagged for `Noto Sans Bengali` — the one face the repo
  deliberately bundles, budgets (`check:fonts`), and names in `MERIDIAN_FONTS.bengali`. The gate
  calls the design system's own font an anti-pattern.
- **Genuine findings buried:** the nine Remotion `Inter` / `Dm Mono` / `Public Sans` uses (F-07) are
  real breaches and sit in the same undifferentiated bucket as the false positive, all 21 absorbed
  into a single "0 new" baseline number.

**Fix.** Point the detector at `docs/design-system/MERIDIAN.md`, or generate a typography stanza for
`DESIGN.md` from `MERIDIAN_FONTS` at build time so the two cannot disagree. Then re-seed the
baseline — it should drop from 21 to ~20, and the remainder should all be real.

**Verification test:** assert that every family named in `MERIDIAN_FONTS` is present in whichever
document the detector reads.

---

### F-07 · MEDIUM · The brand's shareable artefacts are the ones that ignore the type system

**Confidence:** high. **Blast radius:** exported video, exported PDF, exported map snapshot.

The 21 outstanding `design-system-font` findings decompose as:

| File | Lines | Font | Assessment |
|---|---|---|---|
| `remotion/compositions/HazardNetBrandComposition.tsx` | 24, 53 | Inter, Dm Mono | genuine |
| `remotion/compositions/HeroComposition.tsx` | 87, 114 | Inter, Public Sans | genuine |
| `remotion/compositions/LiveStatusComposition.tsx` | 16, 45, 63 | Inter, Dm Mono ×2 | genuine |
| `remotion/compositions/RunVisualComposition.tsx` | 22, 80, 92 | Inter, Dm Mono ×2 | genuine |
| `utils/pdfExport.ts` | 245, 252, 295 | Times New Roman ×2, Dm Mono | genuine |
| `hooks/useMapSnapshot.ts` | 122, 195 | Roboto | genuine |
| `index.css` | 1837, 1844, 1850, 1879, 1899 | Times New Roman | **acceptable** — `@media print` page-margin boxes, a deliberate serif choice for printed handouts |
| `index.css` | 9 | Noto Sans Bengali | **false positive** — see F-06 |

The pattern is that every surface which leaves the browser — the brand video, the PDF handout, the
map snapshot — renders in a typeface the product does not use. `Inter` appears 12 times in
`frontend/src`, all of it in Remotion. The repo went to real trouble to purge Inter from the product
bundle (`index.css:41-46` documents exactly that), and it survived in the brand video.

This is also the one place `anti-slop-design`'s checklist bites: Inter is its first named
anti-pattern, and the product passes while the brand film does not.

**Fix.** Remotion needs explicitly loaded fonts and cannot inherit `system-ui`, so this is a real
constraint, not laziness. Either bundle one licensed display face for video only and declare it in
the token file as `MERIDIAN_FONTS.video`, or switch the compositions to the mono/Bengali faces
already bundled. For `pdfExport.ts`, jsPDF's standard-14 fonts are the constraint — declare
`MERIDIAN_FONTS.pdf = 'Helvetica'` and use it, rather than Times New Roman by default.

---

### F-08 · MEDIUM · Two cited sources of truth do not exist

**Confidence:** certain. **Blast radius:** DX; the evidence for a 4,030-class migration is unreachable.

- **`docs/design-system/MASTER.md` — missing.** Cited three times in `index.css`:
  - `:94` — "Reference: docs/design-system/MASTER.md" for the three-layer token architecture
  - `:176` — "see docs/design-system/MASTER.md §Contrast"
  - `:989` — "Measured pair by pair in docs/design-system/MASTER.md §Neutral ramp"

  The third is the significant one. `index.css:966-988` justifies re-pointing 4,030 neutral utility
  classes and 252 hardcoded literals onto NASA's carbon ramp, citing measured per-step luminance.
  The document holding those measurements is not in the repo.

- **`docs/audits/2026-10-04-frontend-design-system-audit.md` — missing.**
  `frontend/DESIGN_SYSTEM.md:5` links it as "**Latest audit**", and the last line of the same file
  says "See the latest audit report for measured findings". `docs/audits/` contains eleven reports;
  the newest design-system one is `2026-10-03`.

**Fix.** Restore `MASTER.md` or move the neutral-ramp measurement table into `MERIDIAN.md` and
re-point the three comments. Re-point the `DESIGN_SYSTEM.md` link at a report that exists — this
one. Add a link-checker to `check:paths`, which already walks public paths.

---

### F-09 · LOW-MEDIUM · 200 dead custom properties ship to production

**Confidence:** high. **Blast radius:** ~7.5 KB of 266 KB CSS; mostly a comprehension cost.

Of 751 unique custom properties defined across `index.css` and `styles/*.css`, **440 are never
referenced through `var()`** anywhere in the source.

The important distinction — and the reason this is LOW-MEDIUM and not HIGH:

- **226 are `--color-*` inside `@theme inline`** (`index.css:897+`). These are **correctly
  tree-shaken** by Tailwind v4 — I verified `--color-slate-50`, `--color-zinc-950`,
  `--color-stone-50` and `--color-spacesuit` are all absent from the built CSS. They exist as a
  deliberate safety net so a stray `bg-slate-100` lands on NASA carbon instead of Tailwind stock
  (documented at `index.css:966-988`). **Not a defect — a good pattern.**
- **200 are plain `:root` properties outside `@theme`**, and these **do ship**. Verified present in
  `frontend/dist/assets/index-*.css`.

Shipped dead weight by namespace: `--hds-*` 128, `--mrd-*` 28, `--hn-*` 12, `--risk-*` 8,
`--nasa-*` 7, `--hero-*` 4, `--progression-*` 3, `--z-*` 3, `--text-*` 2, `--m3-*` 2,
`--duration-*` 1, `--destructive-*` 1.

Two clusters stand out as more than dead bytes:

- **`--risk-*` (8) and `--progression-bar-*` (3)** are a complete severity colour scale
  (`index.css:270-281`) that duplicates `--severity-*`. Two severity palettes in one stylesheet,
  one of them unreferenced, on a product whose first design rule is "keep severity unambiguous".
- **`--nasa-*` (7) and `--m3-*` (2)** (`index.css:315-323`) are residue from two superseded systems.

**Fix.** Delete the 200, excepting any intentionally public theming API — and if there is such an
API, say so in a comment, because nothing currently marks them. Prefer deletion in one commit over
attrition; the parity tests will catch anything load-bearing.

**Verification test:** a `check:dead-tokens` gate on the same ratchet model as the hex baseline —
count unreferenced non-`@theme` properties, commit the number, fail on increase.

---

### F-10 · LOW-MEDIUM · Two radius systems are imported by the same native components

**Confidence:** high. **Blast radius:** mobile and Windows shells.

`meridian.ts:231-247` states the rule plainly: *"The rule now is one scale (`MERIDIAN_RADII`) plus
these roles, which both platforms read by name … so a phone and a browser cannot disagree about a
corner again."*

But `M3_EXPRESSIVE_TOKENS.containerShape`
(`packages/design-system/src/material3Expressive.ts:11-17`) is still exported and still consumed:

| Role | `MERIDIAN_RADIUS_ROLES` | `M3_EXPRESSIVE_TOKENS.containerShape` |
|---|---|---|
| control | **8** | **12** (`control`) |
| card | 16 | 16 (`semiExpressive`) |
| sheet | 28 | 28 (`fullExpressive`) |
| feature | **32** | **28** (`fullExpressive` reused) |

Consumers importing M3: `apps/mobile/src/components/ExpressiveBentoCard.tsx:30`,
`ExpressiveBottomSheet.tsx:25`, `ExpressiveFloatingControlBar.tsx:36,46`,
`apps/windows/App.windows.tsx`, `apps/windows/src/components/WindowsDesktopOverview.tsx`.
`ExpressiveFloatingControlBar.tsx:46` uses `containerShape.control` → 12px, where the same control
on web is 8px.

Also in that file: `containers.primaryContainer: '#fecdd3'` and eight sibling hex values that are
in no token namespace and are covered by no contrast test.

**Fix.** Re-point `M3_EXPRESSIVE_TOKENS.containerShape` at `MERIDIAN_RADIUS_ROLES` so the names
survive but the numbers unify, and either delete `containers.*` or map it onto Meridian roles.

**Verification test:** extend `designTokensParity.test.js` to assert
`M3_EXPRESSIVE_TOKENS.containerShape.control === MERIDIAN_RADIUS_ROLES.control`, and so on per role.

---

### F-11 · LOW · The display/text split is documented at length and is inert in the bundle

**Confidence:** certain. **Blast radius:** documentation accuracy.

`meridian.ts:22-30` derives a Meta-style "Display / Text type split" as a founding principle, and
`MERIDIAN_DISPLAY_SPLIT = 24` marks the px threshold. But:

```
display: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif
text   : system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif
IDENTICAL: true
```

Two tokens, one value. The split is partially preserved — `MERIDIAN_TYPE_SCALE` does tighten
tracking above 24px (`-0.015em` at `title1` → `-0.03em` at `display1`), which is the half of Meta's
rule that works without a second face. But no font-family distinction can render, and
`MERIDIAN_DISPLAY_SPLIT` is consumed nowhere.

This is a consequence of the correct decision not to ship a proprietary or heavy Latin webfont
(`check:fonts`, 43.31 / 50.00 KiB). The fix is to the documentation, not the fonts.

**Fix.** Collapse to one `MERIDIAN_FONTS.latin`, keep the tracking split, and rewrite the rationale
to say the split is expressed through tracking and weight only. Keep `MERIDIAN_DISPLAY_SPLIT` only
if something starts reading it.

---

### F-12 · LOW · `web-design-pro`'s responsive rubric: fluid sizing is specified, not used

**Confidence:** high. **Blast radius:** breakpoint maintenance cost.

The rubric calls for "replacing breakpoint-heavy CSS with fluid `clamp()` typography and container
queries". Measured:

| Technique | Count |
|---|---|
| `clamp()` in CSS | 3 |
| `@container` rules | **0** |
| `container-type` declarations | **0** |
| `@media (min/max-width)` in CSS | 15 |
| Tailwind responsive variants in TSX | **1,216** |

`MERIDIAN_TYPE_SCALE` defines `clamp()` for `display1`–`display3`, so the fluid scale exists in the
token file and reaches CSS for exactly three roles. Everything below `display3` is a fixed `rem`
resized by 1,216 hand-placed breakpoint variants.

Container queries are the stronger miss here, specifically because of this product's shape: the
`/live` console renders the same card in a sidebar, a grid cell and a full-width panel. That is the
canonical container-query case, and it is currently solved with viewport breakpoints that cannot
know which slot the card is in.

**Fix.** Low priority, high leverage when touched: add `container-type: inline-size` to the console
card wrapper and convert that one component family to `@container`. Treat it as a pattern
demonstration rather than a migration.

---

### F-13 · LOW · ESLint headroom is nearly exhausted and 14 files do not parse

**Confidence:** certain. **Blast radius:** CI will start failing on unrelated work.

`npm run lint:eslint` runs with `--max-warnings 685`. Current: **0 errors, 659 warnings** — 26 left.

| Rule | Count |
|---|---|
| `@typescript-eslint/no-unused-vars` | 435 |
| `@typescript-eslint/no-explicit-any` | 183 |
| `react-hooks/exhaustive-deps` | 24 |
| *(parse failures)* | **14** |
| `no-console` | 3 |

The 14 parse failures matter most: those files are not linted at all, so `react-hooks/exhaustive-deps`
and the rest never run on them. 435 unused vars is also a design-system signal — it is what a
half-finished primitive migration leaves behind (imported `Card`, rendered `<div>`).

**Fix.** Fix the 14 parse errors first, then ratchet `--max-warnings` down as the count falls rather
than leaving a fixed ceiling that only ever gets raised.

---

## What is working, and should not be changed

An audit that only lists defects misrepresents this codebase. Verified good:

1. **Contrast claims are honest.** 14 of 14 documented ratios reproduce exactly from the hex values.
   The "MEASURED, not estimated" claim in `meridian.ts:60` holds.
2. **Dark mode is a theme layer, not 6,500 `dark:` twins.** `dark.css` re-points the palette
   variables the utilities already resolve through. 33 of 34 pages contain zero `dark:` utilities and
   are still fully themed. This is the correct architecture and the reasoning at `dark.css:1-25` is
   exemplary.
3. **The `!important` count is reasoned, not accidental.** 423 total, 393 in `index.css` — but the
   line distribution shows ~330 sit at line 1800+, i.e. inside `@media print`, where overriding
   higher-specificity screen rules genuinely requires the flag. `check-css-important.mjs` goes
   further and fails on *inert* importants. That is a better gate than most codebases have.
4. **Font discipline is enforced, not aspirational.** One 43.31 KiB Bengali face, no remote font
   URL, budget-checked, and the parity test bans proprietary families by name.
5. **The Tailwind palette containment strategy is clever.** Re-pointing `slate`/`gray`/`zinc`/
   `neutral`/`stone` at NASA carbon inside `@theme inline` means a careless `bg-slate-100` still
   renders on-system, and the vars tree-shake away.
6. **`anti-slop-design` scorecard: passes.** 0 purple gradients; 8 distinct radii in genuine use
   (`rounded-full` 299, `xl` 181, `lg` 145, `sm` 105, `2xl` 99, `md` 43, `3xl` 33) rather than one
   uniform corner; Inter kept out of the product bundle; severity encoded as colour + shape + label
   (`primitives.tsx:210`), not colour alone. The use of `system-ui` would trip the skill's
   "no default system fonts" rule, but that is a defensible, documented trade for a 50 KiB font
   budget on low-end Android — the skill's rule assumes a marketing site, not this.
7. **Severity semantics are protected.** The dual-primary inversion — crimson reserved for hazard,
   ink for navigation (`meridian.ts:41-47`) — is the single best decision in the system.

---

## Open questions / assumptions

1. **Is `MASTER.md` deleted or never committed?** If the neutral-ramp measurements exist elsewhere,
   F-08 is a one-line comment fix. If they were never written down, the 4,030-class remap is
   unevidenced and that is more serious than F-08 records.
2. **Are the 200 dead `:root` properties a public theming API?** I assumed not. If embedders
   override `--risk-*`, deletion is breaking.
3. **Is `/live` ever framed in a narrow container?** F-12's priority depends on it.
4. **Does the Remotion output ship to users, or is it internal?** If it is public-facing brand
   material, F-07 moves to MEDIUM-HIGH.
5. **Were the three sub-AA pairings in F-04 accepted deliberately?** Nothing in the repo records a
   waiver, so I treated them as unnoticed.

---

## Change summary

Four themes, in priority order:

1. **Close the gap between the specification and the product** (F-02, F-03). The tokens are
   excellent and almost nothing imports them. Add an adoption ratchet before adding any more tokens.
2. **Make the existing guarantees true** (F-01, F-04, F-05, F-06). Three documents claim a property
   the tests do not enforce — "fails if the two drift" (59% unpinned), "every contrast ratio is
   measured" (measured on white only), "latest audit" (file absent). Each is a small test away from
   being accurate.
3. **Unify the duplicated systems** (F-03, F-09, F-10). Two z-scales, two severity palettes, two
   radius scales. In each case one side has near-zero usage, so unification is re-pointing, not
   migration.
4. **Fix the artefacts that leave the browser** (F-07). Video, PDF and map snapshot are the most
   public surfaces and the least governed.

## Suggested verification

| # | Check | Covers |
|---|---|---|
| 1 | Built `dist/index.html` has a theme bootstrap, or built CSS has a `prefers-color-scheme` block | F-01 |
| 2 | `meridianAdoption.test.js` — raw-`<button>` ratchet + every `.mrd-*` used or allowlisted | F-02 |
| 3 | Every `--z-*` is a `var(--mrd-z-*)` reference; no new `z-[<number>]` literals | F-03 |
| 4 | `meridianContrast.test.js` iterates text roles × all grounds, not a hand-written list | F-04 |
| 5 | Inverse parity assertion — every `--mrd-*` in CSS reachable from a TS export | F-05 |
| 6 | Every `MERIDIAN_FONTS` family present in the document the detector reads | F-06 |
| 7 | Markdown link checker over `docs/**` and `frontend/DESIGN_SYSTEM.md` | F-08 |
| 8 | `check:dead-tokens` ratchet on unreferenced non-`@theme` properties | F-09 |
| 9 | `M3_EXPRESSIVE_TOKENS.containerShape[role] === MERIDIAN_RADIUS_ROLES[role]` | F-10 |
| 10 | ESLint parse-error count must be 0 | F-13 |

---

## Executive summary

HazardNet's design system is, on the evidence, better specified than most production design systems
and less adopted than almost any of them. `meridian.ts` is 714 lines of measured, sourced, honestly
reasoned tokens; I recomputed all 14 of its documented contrast ratios and every one is exact. Seven
design gates, 198 design tests, `tsc` and the production build all pass.

They pass because they measure the right thing imperfectly. The gates ask whether a colour resolves
to a declared token — and it always does, because the Tailwind palette itself was re-pointed onto
the system. They do not ask whether the product uses the system's components, and it does not:
**1 of 147 page/component files imports the Meridian primitives; the named type scale is used 24
times against 2,441 raw Tailwind size utilities; the canonical z-index scale has zero users while a
conflicting, untested one has thirty.**

Three guarantees the repo states in prose are not true in code: the TS↔CSS mirror is 41% pinned, not
drift-proof; contrast is measured on white but rendered on a tinted canvas where three roles fall
under AA; and two cited sources of truth — `MASTER.md`, the "latest audit" — do not exist. One
user-visible defect sits outside every gate: with no `prefers-color-scheme` fallback and the theme
attribute set only after hydration, every dark-mode visitor to all 108 prerendered routes gets a
light-painted page until 5.3 MB of JavaScript loads.

None of this requires redesigning anything. The highest-value next commit is not a new token — it is
an adoption ratchet, on the same proven mechanism as the existing hex baseline, so that the gap
between what this system specifies and what it renders stops widening.
