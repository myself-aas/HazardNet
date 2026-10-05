# `/profile` — design-system conformance audit

**Date:** 2026-10-06
**Surface:** `https://www.hazardnet.live/profile` → `frontend/src/pages/UserProfilePage.tsx` (763 lines)
**Question asked:** does this page follow our design system?
**Answer:** **Partly.** It is clean at the *token* layer and off-system at the *component, semantic and vocabulary* layers.

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

### F-4 · The page hand-rolls card chrome instead of using the system's — **Medium**

`ap-frosted-panel`, `glass-panel`, `ap-card`: **0 uses**. Every panel is assembled inline from
`border border-carbon-* rounded-sm` and friends.

The values are on-system, so nothing *looks* broken, but the geometry diverges: the page's 12
card containers use `rounded-sm` (**5px**), while the system's own panel recipes set
`--ap-radius-lg` (**11px**) and most page-level cards elsewhere use `rounded-xl`/`2xl`
(**18px**). Side by side with any other page, profile cards are visibly sharper. More
importantly, a retune of the panel recipe will move every other surface and leave this one
behind — which is precisely how the four superseded design systems drifted apart in the first
place.

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

None applied to `/profile` — this is an audit. Recommended order if you want it fixed:

1. **F-1** `id` + `htmlFor` on 8 controls (mechanical, highest value).
2. **F-2** 28 severity-palette chrome uses → neutral + blue accent.
3. **F-3** re-level `h4` → `h2`/`h3`; separately, collapse `PublicProfilePage`'s three `h1`s.
4. **F-4** adopt the system panel recipe for the 12 card containers.
5. **F-5** `focus:` → `focus-visible:`, and use `--ap-focus-ring`.

F-1 and F-3 are testable; a gate for "every form control has an accessible name" would catch
this class across the app, not just here. The equivalent gate for SVG paint (added this turn)
immediately found 101 call sites nobody knew about.

## Suggested verification

```bash
node scripts/check-contrast.mjs        # already clean for this page
node scripts/check-contrast-tree.mjs   # already clean for this page
npm run check:device                   # full design gate set
npx jest                               # 171 suites / 1772 tests
```

Add, if F-1 is fixed: assert that every `input|select|textarea` under `frontend/src/pages`
resolves to an accessible name, via `getByLabelText` or an axe pass.

---

## Executive summary

`/profile` passes every gate this repository currently runs — no raw colours, no contrast or
inversion defects in either theme, no residue from the superseded systems, radii on the Apple
scale. At the **token** layer it conforms.

It diverges at the three layers above that. It builds its cards by hand instead of using the
system's panel recipe, so its corners are 5px where the rest of the product is 11–18px. It
spends the **severity** palette — the project's protected data-encoding layer — on 28 pieces of
ordinary chrome, including a form control whose focus state is amber. And its document
semantics are weak in a way no colour gate can see: a heading outline that jumps `h1` → `h4`,
and eight form fields that have visible labels but no programmatic ones.

The last of those is the one to fix first. It is a settings page where a screen-reader user
cannot tell which field is the phone number.
