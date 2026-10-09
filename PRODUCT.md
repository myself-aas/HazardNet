# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, equally primary — no surface may optimise for one at the expense of
another.

1. **Farmers and rural residents in Bangladesh.** Checking the outlook for their own
   district before planting, spraying, irrigating or harvesting. Typically on a low-end
   Android handset, on 2G/3G, with a small metered data bundle, often in direct sunlight,
   frequently reading in Bangla.
2. **Agricultural extension workers and union parishad officials.** Turning a district
   outlook into an operational decision — which unions to warn, what advisory to issue,
   whether to pre-position anything. Often on shared or older devices, sometimes offline,
   and sometimes needing something they can print and hand out.
3. **Researchers and academic reviewers.** Judging whether the published outputs are sound:
   reading the validation scorecard, the freshness and provenance record, and the stated
   limitations. Reading in English, on desktop, and citing what they read.

## Product Purpose

HazardNet publishes **multi-hazard early outlooks for Bangladesh agriculture**: for all 64
districts, across 8 hazard classes (Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave,
Severe Local Storm, Tropical Cyclone), at 7-day and 15-day horizons, with an advisory tier
(SEVERE / WARNING / WATCH / NORMAL), a severity score and a confidence value per district and
forecast date.

Success means a district-level decision — on a farm, in a parishad office, or in a review —
was made with a better understanding of the week ahead, and made knowing exactly how much to
trust the number.

It exists because the existing alternatives are single-hazard, national-scale, or not
published with their uncertainty attached.

## Positioning

**HazardNet publishes results, and publishes the limits of those results, with equal care.**

Every number carries the record behind it: when it was produced, from what source, how old it
is, and what it does not mean. The confidence value is labelled as what it actually is — an
uncalibrated model softmax, not a probability. The validation scorecard is published alongside
a plain statement of what its counts cannot support. A district a run did not cover says so
rather than showing a zero.

A neighbouring product could copy the hazard classes and the district coverage. The part that
is hard to copy is the discipline: nothing is published without its provenance, and nothing is
smoothed into looking more certain than it is.

## Operating Context

- **Update cadence:** daily, automated — a Kaggle notebook produces the forecasts and a GitHub
  Actions pipeline validates and publishes them.
- **Devices and networks:** low-end Android (≤2 GB RAM, ≤4 cores), 2G/3G, metered data, Data
  Saver on, sometimes offline. This is a design constraint, not a fallback.
- **Languages:** Bangla and English, side by side, in the same interface.
- **Printed artefacts:** district briefs and emergency handouts are generated as PDF and
  printed. The print path is a first-class output, not an afterthought.
- **Reference moments:** the pre-monsoon and monsoon seasons, and the cyclone seasons, when a
  district page is checked daily rather than occasionally.
- **Authority boundary:** HazardNet is **not** an official warning service. Official warnings
  come from the Bangladesh Meteorological Department and the Flood Forecasting and Warning
  Centre. For emergencies, call 999.

## Capabilities and Constraints

**Capabilities**

- Published forecast records (district, hazard class, severity, confidence, horizons, forecast
  date) and the snapshots that serve them.
- Published advisory tiers, at or below each class's configured ceiling, plus run reports.
- A historical hazard catalogue (2000–2026), district vulnerability indices, temporal trend
  reports and GLIDE cross-references.
- A validation scorecard: detection counts against five historical episodes.
- A freshness and provenance record behind every published number.
- Interactive maps, tables and charts over the above.
- PDF/print export of district briefs and emergency handouts.

**Hard constraints**

- **Publication policy (binding):** model code and architecture, dataset collection procedures
  and source composition, training procedures and experiment records, benchmarking methodology
  and sweeps, and severity derivation logic are **research-private and must not be published or
  implied** by the interface. `docs/PUBLICATION_POLICY.md` is the authority.
- **Never invent.** No placeholder model versions, no assumed coverage, no default ages, no
  inferred districts. Absent data is reported as absent.
- **Not an official warning service.** Every surface that could be read as an official warning
  must carry the BMD/FFWC/999 boundary.
- Trained model files in `Models/` are retained unadvertised and are not offered for download.

**Explicitly undecided**

- Alert thresholds in `backend/alerts/policy.js` are placeholders pending Phase 9 validation;
  nearly every district currently lands at WATCH.
- Alert publication is blocked until the ingest pipeline stamps a model version.

## Brand Commitments

- **Name:** HazardNet.
- **Origin:** a Master's thesis project, Department of Agrometeorology, Bangladesh
  Agricultural University. This is stated on the site and must stay true.
- **Voice:** plain, measured, specific. No alarm, no reassurance, no marketing. Says what the
  number is, how old it is, and what it does not mean — including when the honest answer is
  "this run did not cover that district".
- **Legal/proof boundary:** the words "not an official warning service", the BMD/FFWC
  attribution and the 999 instruction are commitments, not boilerplate, and must remain
  legible on every surface that presents a hazard level.
- **Imagery stance (decided 2026-10-09):** the product uses photographic imagery, and every
  generated image is labelled as **illustrative** rather than as a record of a real event. No
  generated image may be presented as documentation of an actual disaster, place or person.

## Evidence on Hand

- Validation scorecard: detection counts against five historical episodes, published **with**
  its stated limitations.
- Historical hazard catalogue: 3,062 catalogued events, 64 districts, 9 hazard types
  (`frontend/public/data/climatic_hazards_summary.json`).
- GLIDE cross-references for catalogued episodes.
- Attribution record: `frontend/src/content/attribution.json`.
- Freshness artefact: `frontend/public/data/freshness.json`.
- Published paper and citation metadata: `CITATION.cff`.

**Absences — future work must not fabricate these.** There are no customer testimonials, no
case studies, no press coverage, no usage or adoption metrics, no pricing, and no operational
deployment claims. There is no photographic record of HazardNet in the field. Any image used
is illustrative unless it is a real, attributable asset already in the repository.

## Product Principles

1. **Publish the number and its limits together.** A figure without its date, source and
   confidence is worse than no figure — it invites a decision the data cannot support.
2. **Absent is reported as absent.** A district, horizon or model version that a run did not
   produce says so, in those words, rather than rendering as zero, dash or blank.
3. **Design for the device people actually have.** Low-end Android, 2G/3G, metered data,
   Bangla-first. If a surface only works on a good connection on a good phone, it does not work.
4. **The warning boundary is never blurred.** HazardNet informs; BMD and FFWC warn.
5. **Reduce the work of deciding.** Every screen exists to shorten the path from "the week
   ahead is uncertain" to a specific action, not to display everything that is known.

## Accessibility & Inclusion

- Target: WCAG 2.1 AA, verified on both the light and dark grounds — the neutral ramp inverts
  between them, so contrast is measured twice.
- The audience includes low-literacy and low-bandwidth readers, and readers in direct
  sunlight. High contrast, large legible type, and no reliance on colour alone to carry a
  severity level.
- Both Bangla and English are first-class; the interface carries both scripts, and Bangla is
  served by a real webfont within a 50 KiB local-font budget.
- `prefers-reduced-motion` and low-bandwidth signals collapse animation and blur; on the
  target devices this is the difference between a usable page and a hung tab.
- Touch targets meet 44 × 44 px. The product is primarily used on a phone.
