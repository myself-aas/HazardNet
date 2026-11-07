---
surface: daily-reports
routes:
  - /reports
  - /reports/:date
  - /reports/archive
mode: Read
---

# Daily reports

## What the visitor is doing

Read a dated, reproducible summary of the published daily advisory snapshot; compare the
published counts and scores without mistaking forecasts for observed impacts or official
warnings.

## Direction

Read track. Keep a narrow prose measure beside a wider analysis canvas, with a generated table
of contents on wide screens and a collapsible one on phones. Pair every chart with units, a
caption and an accessible tabular alternative. Tables remain readable at 360px and in print.

## Decisions to preserve

- The archive entry and report date identify the report. An interactive analysis may use only
a snapshot whose run ID matches that report; never substitute a newer run for an archived one.
- State the generation time, run and dataset provenance wherever the report presents results.
  Missing artifacts remain missing and explain the recovery path.
- Analysis is descriptive of the published rows. Do not imply independent observations,
  statistical significance, prediction probability or model calibration. Severity is not an
  observed impact; advisory tiers are not official warnings.
- Keep the BMD / FFWC authority boundary and emergency number 999 in the first viewport.
- Keep the presentation quiet and typographic: one accent for interaction, no decorative
  cards, no color-only encoding, no invented values or claims.
- Include concise method notes, a data-quality/coverage table, FAQs and direct links to the
  report archive; printing must preserve the source context and report tables.

## Mode

`Read` — the visitor understands something; structure for comprehension, then make the reading
worth staying in.
