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

Editorial track. The page is a publication front page, not a dashboard: a headline claim, the live status strip, the eight hazard classes as type-led cards, the published record, the safety framing. One idea per section, 80px rhythm, no card grid as page structure.

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
