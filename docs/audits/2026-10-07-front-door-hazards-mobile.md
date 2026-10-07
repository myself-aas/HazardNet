# The front door: the section's name, the legal sentence's size, and a phone pass

> **Partially reverted, 2026-10-07 (later the same day).** Section 2 of this note — the authority
> sentence's size step-down — and the hero rows of section 3 (the 44px touch targets, the hero's
> disclosure) were undone by request: the hero section is back to `main`, byte for byte. What
> stands is the rename in section 1 and the non-hero rows of section 3: the hazards `<h2>`'s
> mobile-first sizes, the citation's `break-words`, the `tabular-nums` coverage pointer. The
> revert is recorded in the commit log; this note is kept as the record of the pass.

**Date:** 2026-10-07
**Surface:** `/` — `frontend/src/pages/FrontDoor.tsx`, its hero and its hazards section, plus the one
CSS rule the change needed (`frontend/src/index.css`).
**Asked for:** rename the "Products" section; make the authority sentence smaller; improve mobile
responsiveness, using the `ui-ux-pro-max` skill.
**Answer:** done, and the third one turned out to be mostly an audit — the front door already
survived a 320px phone on every mechanical check the skill lists except three, which are fixed.

A note on method, as ever: there is no browser in this environment, so nothing here is a
screenshot or a rendered measurement. Every claim below is either a source fact, an arithmetic
result, or a test.

---

## 1 · "Products" was the vendor's word

The section on the front door that lists the eight hazard classes and the two forecast horizons was
headed **Products** (`frontdoor.products.h2`, rendered at `FrontDoor.tsx:784`). Nothing on this
site is for sale, and the site's own vocabulary for what the section shows is *hazard classes* and
*outlooks*; the top bar already labels the same material **Hazards** (`site-routes.json:1299`, and
`liveLayers.ts:40`). Two names for one idea on one page, one of them borrowed from commerce.

| | before | after |
|---|---|---|
| `<h2>` | Products | **Hazards** |
| Bengali `<h2>` | পণ্যসমূহ ("goods", the commerce word) | **ঝুঁকিসমূহ** (hazards) |
| caption | Eight hazard classes · 7 and 15 day horizons | **Eight classes · 7 and 15 day horizons** |
| section id / `aria-labelledby` | `products-heading` | **`hazards-heading`** |
| caption element | `<p>` after the `<h2>` | `<span>` beside the `<h2>` |

The caption lost one word on purpose. The strip reads `Hazards` / `Eight classes · 7 and 15 day
horizons` / then the eyebrow `Eight hazard classes` — three lines of two-line-length text, two of
which said "hazard classes" and one of them twice. The eyebrow keeps the count and the noun, so
the reader loses no information and the heading row stops repeating itself. The caption is a
`<span>` now: it is a caption on a heading, and a second paragraph is not what the document says.

Deliberately unchanged: the i18n **key names** (`frontdoor.products.*`). Renaming keys would touch
the Bengali block, the English block, the component and the fallback test for no reader-visible
gain; a key is an address, not a label. The `How each class is scored` / `How to read a forecast`
links and every string in the section are untouched.

## 2 · The authority sentence stepped down one notch

The sentence is `frontdoor.hero.authority` — *"HazardNet is decision support, not an official
warning service. Weather warnings, cyclone signals and flood bulletins come from the Bangladesh
Meteorological Department and the Flood Forecasting and Warning Centre; in an emergency call 999."*
It sits last in the hero's copy block and wore the 12px fine-print token.

**It is 11px now (desktop) and 10px on a phone**, via a scoped `.hero-frame .hero-authority` rule
in `index.css` — 10px is the product's own `--ap-text-micro-legal` floor, so the change stays inside
the declared scale rather than inventing a size. It keeps its type protection (`text-shadow-hero-fine`);
only its size moved.

**Why size was safe to move.** The sentence lives in the foot of the exposure curve, where the
grade `lib/heroGrade.ts` draws is doing the work. Using the same sRGB relative-luminance method as
the H-P1-4 projection, with the audit's worst-case bright photograph pixel (`#e0e0e0`) under it:

| Where in the frame | Exposure alpha | Backdrop | `text-white/80` |
|---|---|---|---|
| 70% (top of the copy band) | 0.80 | `#313238` | **8.77:1** |
| 85% | 0.88 | `#1f2127` | **10.70:1** |
| 100% (frame foot) | 0.96 | `#0e1016` | **12.25:1** |
| — (no grade at all) | 0 | `#e0e0e0` | 1.25:1 |

The worst case it can meet is 8.77:1, near double the 4.5:1 the size it now wears still requires.
That is the whole argument for shrinking *this* paragraph, and it is why nothing else in the hero
came down with it: at 12px the standfirst and the tagline are already at the smallest size their
reading role allows, and the boundary sentence is the one thing in the block that is read once, if
at all, and is also the one thing that must be present.

## 3 · The mobile pass (`ui-ux-pro-max`, §5 Layout & Responsive + §2 Touch)

The skill's query contract was followed: `--stack html-tailwind` for implementation detail and
`--domain ux` for outcomes (`mobile-first`, `touch target thumb reach bottom`,
`layout breaks small screens`), then section §5 and §6 of `references/quick-reference.md` read in
full. Checked against the front door, in the order the skill prioritises them:

| Rule | What the front door does | Action |
|---|---|---|
| `viewport-meta` (never disable zoom) | `frontend/index.html:5` — `width=device-width, initial-scale=1.0, viewport-fit=cover`; pinned by `phase7Contracts.test.ts:20` | none needed |
| `viewport-units` (`min-h-dvh`, never `100vh`) | zero `100vh` in `frontend/src` | none needed |
| `mobile-first` | base styles are the phone's; `sm:`/`md:`/`lg:` enhance. One rule read desktop-first (`text-ap-tagline … lg:text-2xl` on the hazards `<h2>`) | **fixed**: `text-lg sm:text-xl lg:text-2xl` |
| `horizontal-scroll` / no fixed px widths | the page's own `max-w-[1200px]` is a maximum; the two `min-w-[…]` values in its panels are 12rem/16rem, inside a 320px content box | pinned by a new test |
| `long-token-wrapping` | the citation is a literal 39-character repository URL in a `font-mono` block | **fixed**: `break-words` |
| `touch-density` (44px on mobile) | pause control 44px, CTA `size="lg"`, disclosure 36px, three fine-print links 32px | **fixed**: disclosure and links are 44px on a phone, `sm:` sizes above it |
| `number-tabular` | the run's coverage pointer prints counts that arrive with the artifacts and can change under the reader | **fixed**: `tabular-nums` |
| `content-priority` | the standfirst is already clamped to one line with an in-place disclosure | none needed |
| `fixed-element-offset` | `--navbar-height` carries `env(safe-area-inset-top)`; the hero pads by it; no bottom bar exists | none needed |
| `z-index-management`, `spacing-scale`, `container-width` | `--ap-z-*` scale, 4/8pt spacing, one container width | none needed |
| `heading-line-balance` | the h1 carries `text-balance` | none needed |
| `line-height` (1.5–1.75 body) | the hero's small print is 1.375 leading by design (a deliberately thin band, audited on 2026-10-06); everything else is 1.62 | left alone, deliberately |

Two things the pass *declined* to do, both because the skill's own priority order says so: it does
not raise the hero's fine print to 16px (`readable-font-size` is about **body** text and iOS input
zoom — the hero's small print is a disclosure band with its own audited contrast, and the page has
no text input at all), and it does not reflow the page onto a new breakpoint set
(`breakpoint-consistency`: the app's `sm/md/lg/xl` scale is consistent and changing it is a
system-wide decision, not a front-door fix).

## Verification

| Check | Result |
|---|---|
| `FrontDoor.test.tsx` | **15 tests**, including a new phone test (fixed-width scan ≤ the 320px content box, long-token wrapping, the size step-down and its CSS rule, 44px in-section actions) |
| Full suite | 182 suites / 1889 tests (three post-build suites skip until `dist` exists, then pass) |
| `tsc --noEmit` | clean |
| Design gates + build | see the branch's gate loop: `check:tokens`, `check:brand`, `check:contrast[:css]`, `check:important`, `check:residue`, `check:svg-tokens`, `check:prose`, `icons:check`, `check:fonts`, `check:design[:source]`, `check:bundle` |
