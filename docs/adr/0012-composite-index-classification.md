# ADR 0012 — Classifying the composite-index blocks: presentation aggregation, kept and labelled

- **Status:** Accepted (2026-09-19). Closes `[ASK USER] 4` in
  `docs/ops/2026-09-19-advanced-ops-dev-plan.md`.
- **Context:** constraint **C1** (the derived severity index is under publication
  embargo: no index, formula, weights, calibrated thresholds, clusters or
  predictions on visitor surfaces; only the archive's own reported
  `Severity_Index` column may be published, and only labelled as an archive
  field); `scripts/check-severity-embargo.mjs` (the build-time gate that enforces
  it, run by `ci.yml` and by `npm run check:embargo`);
  `frontend/src/components/NationalOverview.tsx` (rendered on `/home/overview`,
  `/forecast/overview` and the analytics surface).

## Context

The embargo gate has two tiers. The `block` tier fails the build on derivation
language — severity-index weights, calibrated thresholds, cluster membership,
research framing. The `review` tier exists because one question cannot be answered
by a regular expression:

> A composite that merely **counts and averages** severity values the product
> already publishes is a presentation aggregation. A composite that **derives a
> new severity value from weights** is the embargoed research output. They look
> identical to a scanner. Only the owner can say which a given block of copy is.

`NationalOverview.tsx` had two such blocks, and the gate had been printing them on
every run since it was written:

| Line | Copy | Computation |
| ---- | ---- | ----------- |
| ~553 | "National Composite Hazard Score Distribution (District Count × Avg Severity Score)" | `compositeScore = districtCount × avgSeverity` over the hazard classes in the telemetry matrix |
| ~745 | "Composite Risk Index = Hazard District Count × Average Severity Score" | the same product, restated as the Top-3 ranking rule |

Unanswered review items are the worst state a gate can be in. They do not fail the
build, so nothing forces a decision; they print on every run, so the output trains
everyone to scroll past them; and the copy stays on a public surface with no
record of whether anybody ever decided it was allowed to be there. That is how a
question stays open forever — and this one had been open since the checker landed.

## Decision

1. **Both blocks are classified `presentation-aggregation`, and they stay.**
   Both factors of the product are already published on the same screen: the
   district count and the average severity are two columns of the telemetry matrix
   printed directly beneath the chart, and the per-district severity values are on
   the map and the district cards. The product re-expresses them for ranking. It
   discloses no weight, no calibrated threshold, no cluster membership and no model
   internal, so it is not the embargoed derived severity index.
2. **The classification is "keep, labelled", and the gate enforces the label.**
   Each block carries a disclosure immediately next to the number, saying what it
   is and what it is not:

   > *Presentation aggregation of the two values this matrix already prints: the
   > district count multiplied by the mean of the per-district severity shown on the
   > map. It ranks hazards by spread × severity; it is not HazardNet's derived
   > severity index, which is withheld from public surfaces.*

3. **The decisions are recorded as data, not as a comment.** The checker exports
   `REVIEW_CLASSIFICATIONS`: one entry per (file, phrase) with `classification`,
   `decided` (2026-09-19), `basis` (the reasoning above, in as many words) and a
   `label` pattern. The gate now reports `classified: 2` and names the decision on
   every run.
4. **A registered phrase that loses its label fails the build.** `LABEL_WINDOW_CHARS`
   (1400) bounds how far the disclosure may sit from the phrase; a missing or
   drifted label escalates the match from `review` to `block` as
   `composite-index-unlabelled`. Verified both ways: the gate passes with the labels
   in place and exits 1 when either one is deleted. The number a visitor reads can
   therefore never be separated from the statement of what it is — not by a
   redesign, not by a copy edit, not by someone tidying "redundant" text.
5. **An unregistered composite phrase is still reported, and the registry can never
   become a blanket allowlist.** A new "composite severity index" anywhere in the
   scanned surfaces appears as an open review item until somebody records a
   decision for it; the entries are matched per file and per phrase, not globally.
6. **Stale entries are reported.** If a classified phrase is withdrawn or reworded,
   the gate says the entry should be removed, so the registry tracks the copy
   instead of accumulating history.

## Not decided here (escalated to the owner)

Classifying the two composite blocks turned up a third thing in the same component
that the gate had never looked at, and it is **not** the same shape:

```
Vulnerability Formula = (Division Avg District Severity × 0.6) + (High Risk Ratio × 0.4)
```

(`NationalOverview.tsx:434`, computed at line ~160.) This one prints **explicit
coefficients**. C1 withholds derived-index weights from public surfaces, so there
are two readings and they have opposite outcomes:

- if 0.6/0.4 are the embargoed index's weights → this is a leak and the
  coefficients must come off the page;
- if they are a presentation-level ranking of two already-published values (a
  division's mean district severity and its high-risk ratio) → keep it, and label
  it the way the composite blocks now are.

The directive this ADR answers was to classify the *composite-index* blocks, so the
gate does not decide this one: a new `review`-tier rule (`weighted-formula`) matches
`<quantity> formula|weighting|coefficients` in visitor copy and reports it on every
run. It does not fail the build. `__tests__/severityEmbargo.test.js` pins the open
list to exactly this one item, so a *second* undecided phrase fails the test rather
than joining the noise — the failure mode that kept the original two open for months.

## Consequences

**What gets better**

- The last open embargo question in the checker is answered, dated and reasoned in
  a place the gate itself reads. `[embargo] PASS … classified: 2` is now a
  statement about a decision, not about an absence of matches.
- Label enforcement makes the classification self-maintaining: the disclosure
  travels with the number, and removing it is a build failure rather than a
  quiet regression.
- The review tier keeps its purpose. It is no longer a list of two known items
  printed forever; anything new on it is genuinely undecided, and the test suite
  notices.

**What it costs**

- Two blocks of copy on the national overview now carry a qualification sentence
  each. That is a small amount of visual weight on a dense dashboard, and it is
  the price of publishing a composite number during an embargo.
- The classification lives in a script, so changing the copy means editing
  `REVIEW_CLASSIFICATIONS` in the same commit. A designer editing a heading will
  hit a red build and a message that explains why — which is the intent, but it is
  friction.
- The decision is scoped to what the copy computes *today*. If either block is ever
  redefined to use weights, a calibrated threshold or a model internal, the
  classification is void and the copy must be withdrawn; the code comments at both
  blocks say so.

**What to watch**

- Before the embargo lifts, the owner should re-read the two blocks against the
  final publication: a presentation aggregation that matches a formula in the
  paper may still be worth rewording so the two are not confusable.
- `weighted-formula` should stop reporting something the day the owner classifies
  the vulnerability formula — either by recording a decision (with a label, as
  here) or by removing the coefficients from the page.
