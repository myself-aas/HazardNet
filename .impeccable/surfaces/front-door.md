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
  purpose and audiences → what to do with an outlook → forecast vs alert →
  severity / alert levels / confidence (three different things; confidence is an
  uncalibrated softmax score, never a probability) → how it works and when it updates →
  validation and checking any number → access, languages, and when something is missing.
  The Knowledge products table, the official record and Take part were kept verbatim.
- There is no Bengali draft badge. `site-routes.json` records the Bengali as
  `approved-native-speaker` by the project owner on 2026-09-19; rendering the opposite
  was a false claim. Copy changed after that date follows the `lib/i18n.ts` rule:
  it starts as `pending-native-speaker` until the owner re-reads it, and the
  `reviewedAt` date is not moved by anyone else.
- Error copy never interpolates a raw loader/store error value. It names what is
  unknown (unknown is not zero) and the recovery (reload, Try again, status page).
- Reader-facing labels do not leak implementation vocabulary: "deployment",
  "deterministic weather window", "hindcast", bare "assessed rows" and unexplained
  "artifacts" are gone from the chrome; where "artifacts" survives it is glossed as
  published data files. New prose passes `check:prose` (no em-dash punctuation).
- The methodology hero link names its destination ("Read the methodology"); a
  "how a forecast is produced" promise would contradict the publication policy.
