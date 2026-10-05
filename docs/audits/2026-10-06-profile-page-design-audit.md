# `/profile` — design-system conformance audit

**Date:** 2026-10-06
**Surface:** `https://www.hazardnet.live/profile` → `frontend/src/pages/UserProfilePage.tsx` (763 lines)
**Question asked:** does this page follow our design system?
**Answer at audit time:** **Partly.** Clean at the *token* layer, off-system at the *component,
semantic and vocabulary* layers — it re-implemented a user-area kit that already existed.
**Status now:** remediated in this branch; see [Change summary](#change-summary). 4 regression
tests added.

A note on method: the live URL could not be inspected directly. `https://www.hazardnet.live/profile`
answers `302 → /login?next=/profile`, so there is no rendered page to read without credentials.
Everything below is from the source that builds that route, plus the repository's own gates run
against it. Line numbers are `frontend/src/pages/UserProfilePage.tsx` unless stated.

---

## Findings

### What already conforms

| Check | Result |
| --- | --- |
| Raw colour literals (hex / `rgb()`) | **0** — every colour goes through a token |
| `check-contrast` (flat, both themes) | clean |
| `check-contrast-tree` (inherited grounds) | clean |
| `check-design-residue` | clean — no superseded-system classes |
| Touch targets | `min-h-[44px]` on 10 controls, at/above the 44px target |
| Radius values | all on the Apple scale (no off-scale `rounded` bare, which 97 other call sites do use) |

So the page is **not** running a second colour system, and it is not where dark mode breaks.
That is the part of "one design system" it already satisfies.

---

### F-1 · No form control on the page has a programmatic label — **High**

8 controls, 8 `<label>` elements, **0 `htmlFor`, 0 `id`**, and the labels are siblings rather
than wrappers. The association is therefore never made.

```
553:  <label className="block text-sm font-semibold …">Display Name</label>
554:  <input type="text" value={displayName} …            ← no id, not wrapped
563:  <label …>Phone Number</label>
574:  <label …>Organization / Department</label>
```

A screen reader announces these as *"edit text, blank"*. Voice control ("click Display Name")
cannot target them, and clicking the label text does not focus the field. This is WCAG 1.3.1
(Info and Relationships) and 4.1.2 (Name, Role, Value), and it is the most serious defect on
the page — it is a settings form whose fields are unnamed.

Fix is mechanical: give each control an `id` and each label a matching `htmlFor`.

### F-2 · 28 uses of the severity palette as page chrome — **High (design-system)**

The standing rule in this project is that severity colour is a **data-encoding layer**, kept
separate from chrome; chrome gets the single blue accent. This page uses the severity ramp for
ordinary furniture:

```
456:  <select className="… border border-amber-300 … focus:outline-none focus:border-amber-500">
```

Counted across the file: `bg-amber-50` ×5, `border-amber-300` ×4, `text-amber-900` ×3,
`border-amber-200` ×3, `bg-amber-100` ×3, `ring-amber-500`, `bg-emerald-100` ×2, and more —
**28 in total**.

Amber is *Moderate severity*. A settings card wearing amber reads as a hazard warning, and a
form control whose resting border is amber and whose **focus** state is a deeper amber means the
focus indicator is built out of the severity vocabulary. This is the same defect class just
fixed on the `/alerts` map, where hover and selection painted amber and made a clicked division
look like a moderate reading. Chrome here should be neutral + the blue accent.

### F-3 · The heading outline skips two levels — **Medium**

```
248:  <h1>  … profile name
332:  <h4>  Use Current Location for District
370:  <h4>  IP & GPS Precise Pinpoint Coordinates
433:  <h4>  Default Home District Preference
495:  <h4>  …
633:  <h4>  …
```

`h1` → `h4`, with no `h2` or `h3`. Heading navigation is the primary way screen-reader users
move through a long page, and this is a 763-line page. The outline currently says every section
is a fourth-level subsection of nothing.

`AlertsPage.tsx` in the same codebase does this correctly (`h1`, `h2`×3, `h3`), so the house
pattern exists and this page simply departs from it. Worth noting while here:
`PublicProfilePage.tsx` has the opposite problem — **three `<h1>`s**.

### F-4 · The page re-implements the user-area kit instead of importing it — **High** *(revised)*

> Revised after the first pass. The original wording blamed `rounded-sm`. The radius was a
> symptom; this is the disease, and it explains F-1, F-2, F-3 and the second toggle design
> at once.

There is a complete, well-built user-area UI kit at
`frontend/src/components/user/dashboard/ui.tsx`. It exports `inputClass`, `Card`, `Field`,
`TextField`, `TextAreaField`, `SelectField`, `NumberField`, `DateField`, `ToggleField` and
`SaveBar`. Every field primitive wires `id` + `htmlFor` for free. `Card` renders a real
`<section>` with an `<h3>`, an `px-6 py-4` header and a `p-6` body, square-cornered.

**Its only importer was `pages/UserDashboardPage.tsx`.**

`components/user/dashboard/ProfileSection.tsx` already edits the profile through that kit —
13 `Card`, 24 `TextField`, 9 `SelectField`, 8 `ToggleField`, 4 `NumberField`, 2 `DateField`,
2 `TextAreaField`, with labels including "Display name" and "Phone number". `UserProfilePage`
hand-rolls the *same fields* off-system.

So `/profile` and `/dashboard` were **two separate implementations of one user-settings
surface**, and `/profile` was the off-system one. That is the mismatch a reader sees. It is
also why the page had no `<label for>` (F-1), a second toggle design, `h4` headings (F-3) and
an amber accent (F-2): none of those decisions were ever made for `/profile`, they were simply
never inherited.

Radius, for the record: the Tailwind scale *is* tokenised — `index.css`'s `@theme inline`
remaps `--radius-sm → --ap-radius-xs` (5px), `md → sm` (8px), `lg → md` (11px) and
`xl`/`2xl`/`3xl` → `--ap-radius-lg` (18px). The kit's `Card` carries **no** radius class, i.e.
square, and the editorial pages agree (FrontDoor 1 rounded use across 14 panels, About 1/9,
Contact 0/7, Alerts 1/9). Square is therefore the correct target for `/profile`, and
`rounded-sm` on *form controls* is correct and was kept — `inputClass` and `LoginPage` both
use it.

### F-5 · Focus is styled with `focus:`, not `focus-visible:`, and is border-only — **Low**

9 sites, e.g. `focus:outline-none focus:border-ap-primary` (558, 569, 580, 592, 602, 612, 623).

Two consequences. The ring appears on **mouse** click as well as keyboard, which Apple's own
system avoids. And the replacement indicator is a 1px border colour change — it satisfies
"something visible happens" (2.4.7) but is weak against WCAG 2.4.11's expectation of a clearly
perceivable indicator, especially at 1px on a light card.

The focus-ring token `--ap-focus-ring` already exists and is what the `/alerts` map now uses.

### F-6 · Two viewport-relative text clamps — **Low / confirm intent**

```
248:  <h1 className="… truncate max-w-[55vw] sm:max-w-[60vw]">
```

A name is truncated at 55% of the **viewport** rather than of its container. On a wide screen
in a narrow column the clamp does nothing; in a short column it truncates a name that had room.
This looks like a fix for an overflow whose real cause was elsewhere. Flagged rather than
asserted — it may be deliberate.

---

### F-7 · The shared breadcrumb bar is off-system on 12 pages — **High** *(found while fixing F-2)*

`components/Breadcrumbs.tsx` is rendered by About, Blogs, BlogArticle, Contact, Documentation,
DownloadCenter, Privacy, Terms, UseCases, UserProfile, BlogEditor and BlogStudio — **12 pages**,
and it is the first element under the header on each.

It carried `rounded-xl` (18px, the only non-square chrome on otherwise-square pages),
`shadow-xs`, and a **`bg-amber-50 / text-amber-700 / border-amber-200` "Live map" button** — the
severity palette spent on navigation chrome, on twelve pages at once. It also had no
`aria-label`, so it was not announced as a breadcrumb, and its current item carried no
`aria-current`.

This is the single highest-reach item in the audit: one 80-line component was leaking the
amber accent onto more pages than `/profile` has sections.

## Open questions / assumptions

1. **I could not see the rendered page.** The route is auth-gated and I have no credentials;
   everything here is read off the source that builds it. Anything that only appears at runtime
   (data-dependent states, long-value overflow, the avatar fallback) is unaudited.
2. **F-6 is a judgement call**, not a defect — it needs the original intent.
3. The live site may lag this branch. The findings describe the current source; if
   `hazardnet.live` is built from an older commit, its `/profile` may differ.
4. I did **not** change `/profile` in this turn. The audit is the deliverable; the fixes are
   scoped below and not yet applied.

## Change summary

**Applied.** The audit pass above was written first; everything below then shipped in the same
branch, with the gates and tests re-run after each step.

`frontend/src/pages/UserProfilePage.tsx`

1. **F-4 / F-1** — imports `TextField`, `SelectField`, `NumberField` from
   `components/user/dashboard/ui` and replaces the 7 hand-rolled text inputs and the
   hand-rolled `<select>`. Each primitive wires `id` + `htmlFor`, so **every control on the
   page now resolves to a visible label**. Target-crops spans two columns; farm size uses
   `NumberField suffix="ha"`.
2. **F-2** — all 13 severity-palette chrome sites moved to the single blue accent or to
   neutrals: persona selection → `bg-ap-primary/8`; location chip and ENABLED pill →
   `bg-ap-primary/10 text-ap-link border-ap-primary`; "Set as Default Home District" and
   "Send reset email" → neutral secondary; the `bg-amber-50/70` home-district card →
   `bg-carbon-05`; "Authenticated" pill → `bg-carbon-10`; the amber info panel → `bg-carbon-05`;
   the dark tile's decorative amber/emerald → `text-ap-on-inverse`.
3. **Severity is now data, and it tracks the datum.** The hazard tile's severity readout was a
   *fixed* `text-rose-300` — a 20% score rendered the same red as a 95% one. It now maps
   through `getSeverityTier()` to one of five tints (`SEVERITY_INK_ON_TILE`) and is tagged
   `data-severity-ink`. This is the one place the severity palette survives on the page, which
   is exactly the protected data-encoding layer, paired with a label and a number per 1.4.1.
4. **F-3** — the five `h4`s become `h2`s, so the outline is `h1 → h2` with no skipped level.
5. **Landmarks** — the four settings panels are now `<section aria-labelledby>` pointing at
   their own heading id. Pure semantics: no class changed, so the pixels are identical.
6. **Radius** — every panel is square, matching the kit's `Card` and the editorial pages;
   `rounded-full` badges keep their pill. Form controls stay `rounded-sm` by convention.
7. Three `bg-white hover:bg-white` no-op hovers → `hover:bg-carbon-05`.

`frontend/src/components/user/dashboard/ui.tsx` *(also affects `/dashboard`)*

8. `Card`'s icon chip `bg-amber-50 text-amber-700` → `bg-ap-primary/10 text-ap-link`.
9. `SaveBar`'s dirty state `border-amber-200 bg-amber-50/95` / `text-amber-800` →
   `border-ap-primary bg-ap-primary/8` / `text-ap-link`.

`frontend/src/components/Breadcrumbs.tsx` *(F-7 — reaches 12 pages)*

10. Dropped `rounded-xl` and `shadow-xs`; the amber "Live map" button became a neutral
    secondary with a 44px hit target and a `focus-visible` ring; added `aria-label="Breadcrumb"`,
    `aria-current="page"` on the trailing item, and `aria-hidden` on the `/` separators.

**Not done, deliberately.** The panels were *not* converted to the kit's `Card`. `Card` is
`p-6` with a `text-lg` header; `/profile` is a dense single settings column at `p-4` / `text-xs`.
Under the project's "two density tracks from one system" rule that difference is legitimate, so
the page keeps its density and takes the kit's tokens, primitives and geometry. Forcing `Card`
would also push its headings to `h3` and re-break the outline fixed in (4).

### Regression cover

Four tests added to `frontend/src/pages/__tests__/UserProfilePage.test.tsx`, one per High
finding, asserting against the rendered DOM rather than the source text:

| test | locks |
|---|---|
| every text control has a programmatic label | F-1 |
| no amber chrome (severity data excluded by `data-severity-ink`) | F-2, F-7 |
| heading outline never skips a level | F-3 |
| square panels, pill badges, controls exempt | F-4 |

The suite also caught a real bug introduced by (3): the test's `geolocationService` mock was
partial, so `getSeverityTier` was `undefined` and the page threw. The mock is now complete.

## Suggested verification

```bash
npm run check:device   # 9 gates — all green
npx jest               # 171 suites / 1776 tests — all green (was 1772)
cd frontend && npm run build
```

A **"every form control has an accessible name"** gate would catch F-1's class across the app
rather than just here, in the same way the SVG-paint gate added earlier immediately surfaced
101 unknown call sites. That is the recommended next gate.

### Still open, app-wide

- **Shadows**: 206 uses across six elevation steps (`shadow-xs` 67, `md` 45, `sm` 40, `lg` 21,
  `2xl` 19, `xl` 11). `DESIGN.md` does not define an elevation scale, so none of these are
  tokenised. Largest remaining un-systematised layer.
- **Radius split**: 617 non-pill uses. The token mapping is sound, but editorial pages are
  square while DownloadCenter is 8/8 rounded — a page-level decision nobody wrote down.
- 101 ledgered raw SVG literals in 14 files; 97 bare `rounded`; font-weight overshoot beyond
  the 300/400/600 that `DESIGN.md` defines.
- `carbon-*` → Apple neutral token rename (~500 sites, zero visual change), to be done last.

## Executive summary

`/profile` passed every gate this repository runs — no raw colours, no contrast or inversion
defects in either theme, no residue from the superseded systems. At the **token** layer it
always conformed. That is why the mismatch was visible to a reader but invisible to CI.

The cause was one level up from tokens. A complete user-area UI kit already existed at
`components/user/dashboard/ui.tsx`, and `/dashboard` edits the profile through it — but
`/profile` re-implemented the same form by hand and imported nothing. Two implementations of
one surface. Everything the eye picked up followed from that single fact: no `<label for>` on
any field, a second toggle design, `h4` headings under an `h1`, panels that disagreed about
corners, and the severity palette spent on ordinary chrome in thirteen places.

The page now imports the kit's field primitives, so every control has a real label; carries
the single blue accent; is square like the kit's `Card` and the editorial pages; and exposes
its settings groups as named landmarks. Severity survives in exactly one place — the hazard
tile's score — where it is genuine data, and it now **tracks the reading** instead of painting
every value the same red.

The most valuable find was incidental. Chasing the last amber pixel led to
`components/Breadcrumbs.tsx`, which is the first element on **12 pages** and was carrying an
amber button, an 18px radius and a shadow onto all of them. One 80-line shared component was
leaking more off-system chrome than `/profile` had in total — a reminder that on a shared-
component codebase, per-page audits find per-page bugs, and the gates are what find the rest.

Four DOM-level regression tests now hold the four High findings shut. Suite: 171 files,
1776 tests, all green; 9 design gates green; build clean.
