---
surface: front-door
routes:
  - /
mode: Persuade
---

# Front Door

## What the visitor is doing

Decide whether HazardNet is the thing they need, and act: open the live map, open their district, or read the last run.

## Direction

Editorial track. The page is a publication front page, not a dashboard: a headline claim, the live status strip, the eight hazard classes as a type-led index, the published record, the safety framing. One idea per section, 80px rhythm, no card grid as page structure.

## Decisions to preserve

- The hero is the claim plus the reading, never a product tour.
- Every figure links to the surface that makes it checkable.
- Safety framing (not official / BMD-FFWC / 999) sits in the first viewport.

## Mode

`Persuade` — the visitor decides and acts; design carries the argument.

## Decision log — 2026-10-28 clarify rewrite

The owner chose the rewrite variant of `clarify` (editorial copy included, the route's
metadata remains the single source of product truth). Durable constraints from that pass:

- The editorial sections follow the reader's order of questions, not the system's:
  what to do with an outlook → purpose, audiences and the current outlook → forecast
  vs alert → severity / alert levels / confidence (three different things; confidence
  is an uncalibrated softmax score, never a probability) → how it works and when it
  updates → validation and checking any number → access, languages, and when something
  is missing. The Knowledge products table, the official record and Take part were kept
  verbatim.
- There is no Bengali draft badge for the Bengali that ships. `site-routes.json`
  records it as `approved-native-speaker` by the project owner on 2026-09-19; rendering
  the opposite was a false claim. Copy changed after that date follows the
  `lib/i18n.ts` rule: it starts as `pending-native-speaker` until the owner re-reads
  it, and the `reviewedAt` date is not moved by anyone else. The 2026-10-28 Bengali
  editorial sections/FAQs are therefore held out as empty objects in `i18n.bn` (English
  fallback at render); only previously approved Bengali sections ship. Restore the
  held-out Bengali from commit `005802b` only after the owner review that moves
  `reviewedAt`.
- Error copy never interpolates a raw loader/store error value. It names what is
  unknown (unknown is not zero) and the recovery (reload, Try again, status page).
- Reader-facing labels do not leak implementation vocabulary: "deployment",
  "deterministic weather window", "hindcast", bare "assessed rows" and unexplained
  "artifacts" are gone from the chrome; where "artifacts" survives it is glossed as
  published data files. New prose passes `check:prose` (no em-dash punctuation).
- The methodology hero link names its destination ("Read the methodology"); a
  "how a forecast is produced" promise would contradict the publication policy.

## Decision log — 2026-10-28 critique

Snapshot: `.impeccable/critique/2026-10-28T04-38-09Z__frontend-src-pages-frontdoor-tsx.md`
(28/40, 1 P0, 5 P1, degraded single-context). Owner decisions applied to PR #109:

- **P0 wording is a merge blocker when it overstates freshness.** “Live”/“real-time”
  requires a named pipeline and latency bound; daily-run publication must say
  “published” / “last published” / the dated run instead. The bento quick action now
  reuses the existing published-alerts labels.
- **Action before coverage/provenance.** “Start here” renders immediately after the
  live verdict, with the one-line district-coverage summary beside its heading. The
  full coverage figures, alert record and hazard registry remain below it.
- **Bento replacement is deferred, not a merge criterion.** Decide it later by purpose:
  bento for discovery/browsing, a hazard index for scanning at a glance. Keep the
  current bento only if evidence shows it gets readers to the action pathway fastest;
  otherwise a later `distill` replaces it.
- **New Bengali editorial sections are held out** until the owner review described above.

## Decision log — 2026-10-28 polish

The polish pass worked from the 28/40 critique snapshot above and left the two owner
scope decisions intact: the bento is not replaced here, and no held-out Bengali editorial
section or FAQ was restored.

- **The status strip arrives visible and speaks in states, not diagnostics.** Its frame
  fade from transparent is gone; the loader's raw `error` string is never rendered. A
  recovered snapshot read can still carry that diagnostic, so readable counts are not
  contradicted by an alarm panel. The unreadable and no-ledger states keep their own
  localised sentences, each with a 44px Try-again target, and unknown still never renders
  as zero.
- **The hero labels its synthetic scenery and stops buying it all up front.** The authority
  small print says “Hero imagery is illustrative.” Normal motion mounts the active and
  next carousel frames first, then later frames progressively; reduced motion mounts only
  the still frame it shows; low-bandwidth still keeps slide one only.
- **Editorial finish follows the reading measure.** Route paragraphs, bullets and callouts
  are held to 72ch, with the data table as the deliberate wider exception. The contents
  box is named “Guide to the sections below” because it indexes the explanatory sections,
  not every block on the page. Link colour and mono/uppercase styling are reserved for
  links, labels and numbers rather than prose or errors.
- **The deferred bento received affordance polish only.** Shelf/Grid are 44px toggles with
  `aria-pressed`, shelf scroll controls have Bengali accessible names, the quick actions no
  longer create a second navigation landmark, and the vendor-style “next-generation”
  tagline is gone. The discovery-versus-scanning replacement decision remains open.
- **New Bengali in this pass is short chrome only** (the hero image note, the contents
  label and two shelf scroll labels) and joins the owner spot-check list. It does not move
  `reviewedAt` and does not alter the editorial holdout.

## Decision log — 2026-10-28 distill

This pass resolves the deferred bento question by the surface's own purpose: the visitor
is deciding and acting, so the hazard registry is for scanning, not browsing a product
shelf. It removes complexity without rewriting the clarified editorial argument or
restoring any held-out Bengali section/FAQ.

- **The bento is replaced by `HazardIndex`.** Removed: Shelf/Grid modes and their state,
  the horizontal shelf and scroll buttons, four quick-action cards repeating hero/strip
  destinations, eight bespoke SVG motifs, English lead-time/telemetry strings, the
  duplicate header/note and their dead i18n keys. Kept: all eight class links, localized
  class names, active-window data, and the methodology file's own summaries. The bespoke
  Bengali card taglines were not carried over: they duplicated the methodology record with
  divergent thresholds, and one contained corrupted replacement characters. In Bengali,
  the names and active-window label localize; the methodology summary/season render as
  explicitly `lang="en"` fallback until that source record is localized and reviewed.
- **The hero no longer animates an invisible layer.** The orbital-glow mesh and its
  420-frame loop sat behind the opaque poster/carousel, so the normal render paid for
  motion nobody could see. The backdrop is now photograph → grade → vignette, and the
  carousel is the hero's only motion. The illustrative label, pause control, reduced-motion
  and low-bandwidth paths remain.
- **Two supporting groups were un-carded, not deleted.** Coverage figures are now a ruled
  stats row, and the two forecast horizons are linked rows followed by text links. The
  figures, horizon descriptions and destinations are unchanged.
- **What distill did not remove:** the status verdict and its honest states, the promoted
  action section, coverage/provenance, the published-alert record, all 11 editorial
  sections, blog, 8 FAQs, attribution, safety framing, or the progressive hero carousel.
  Those are the decision path and evidence record, not decoration.

## Decision log — 2026-10-28 mobile typeset and spacing

This pass changes responsive presentation only. It does not rewrite copy, reorder sections,
change status semantics, restore held-out Bengali, or revive the bento.

- **Phone text must be allowed to shrink and wrap.** The verdict no longer carries a fixed
  `16rem` minimum inside the padded status strip. Front-door section headings share one
  shrinkable, balanced, breakable treatment and use the type token's tracking rather than a
  tighter Latin-only step that is wrong for Bengali conjuncts.
- **Nested padding is a phone-width budget.** The run and attribution panels use 16px on
  phones before returning to their wider desktop padding, the contents guide and callouts
  use 14px, and hazard/horizon rows reclaim width from their phone gutters and icons. The
  hero reserves 80px at the bottom on phones so the pinned 44px pause control cannot sit
  over the authority line.
- **Scanning groups form two columns before they stack.** Coverage figures read as a
  two-by-two block on phones. In the status strip, district and assessed metadata share a
  two-column row, the updated timestamp takes the full next row, and the alert/map actions
  form two columns before returning to the desktop inline layout at `sm`.
- **Safety and recovery prose does not become fine print on a phone.** The hero authority
  line, strip loading/error sentences, section asides, hazard seasons and horizon
  descriptions use 14px below `sm` before returning to the compact 12px treatment where
  the wider layout can carry it. District links in both published-alert lists and the run
  panel's closing links are 44px targets.
- **The tests pin layout contracts, not a rendered phone.** jsdom cannot prove real line
  breaks or overflow, so the added assertions cover the former failure modes mechanically:
  no fixed verdict measure, rem widths included in the 320px scan, balanced shrinkable
  headings, two-column phone groups, reserved hero-control space, and 44px alert links.
  Real browser widths, Bengali line breaking and low-end Android rendering still need a
  device pass when a browser is available.
