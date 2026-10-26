---
target: Districts and divisions (/districts, /divisions)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/DistrictDetailPage.tsx"
target_fingerprint: "sha256:a624fb25bce4498c694ef61745c8efc5b9800966468804e1078c64d063d6f36b"
target_path: /home/user/HazardNet/frontend/src/pages/DistrictDetailPage.tsx
timestamp: 2026-10-26T05-49-56Z
slug: frontend-src-pages-districtdetailpage-tsx
---
# Critique — districts and divisions (`/districts`, `/districts/:id`, `/divisions`, `/divisions/:id`, `/forecast/district/:id`)

**Target:** `frontend/src/pages/DivisionsPage.tsx, frontend/src/pages/DistrictDetailPage.tsx, frontend/src/components/district/*`
**Surface brief:** `.impeccable/surfaces/districts-divisions.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 30 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 3 |

## Design specificity — pass; the district page is the most complete surface in the product and the least composed

## Priority issues

**P1 · The brief is a stack of every component the console owns** — `DistrictDetailPage` renders `DistrictBriefActions`, `DistrictBriefHeader`, `DistrictOutlookCard`, `DistrictForecastRecords`, `DistrictBriefBody` and `DistrictPrintFooter` inside one `max-w-7xl` column. `DistrictBriefBody` alone runs past 680 lines and pulls in advisory, grounding, weather, history and appendix panels. The reader's question on this route is "what is coming to my district" — and that answer, the outlook card, is one card among six. The information architecture follows the components rather than the decision.

**P2 · A three-tile stat row is the hero-metric template** — `DivisionsPage` opens with a 2×2/3-up grid: **8** Divisions, **64** Districts and a recorded-event count with the accent colour. That is the floor's hero-metric template — big number, small label, three across — on a Read surface whose job is to let someone find their division. Two of the three numbers are constants of Bangladesh that the reader already knows.

**P2 · Body copy is set in secondary ink** — Paragraphs run at `text-carbon-60` (secondary label) through the brief body, including section intros. On a Read surface the running text should be primary ink, with secondary reserved for metadata; at this size the page reads as annotation rather than text.

## Positive findings

- The district brief carries its provenance: forecast record, advisories, a grounding panel and a print footer.
- `overflow-x-hidden` plus `min-w-0` on the container, so a wide chart cannot widen the document.
- `max-w-prose` on the long paragraphs — the measure is right where it is applied.
- The print footer exists at all, which most product pages never get.

## Not tested

The brief at 360px, the print sheet, and a district with no stored coverage.

## Closure — 2026-10-26 (fix pass)

**Closed · P2 · The hero-metric template on `/divisions`.** The three boxed tiles that opened
`DivisionsPage` (8 / 64 / recorded events) are now one flat row of key figures from
`components/ui/KeyFigures.tsx` — a `<dl>` with tabular mono values, secondary-ink labels, and the
live number marked as the row's emphasis. Two constants of Bangladesh no longer arrive at the visual
weight of live data.

**Open · P1 · The brief is a stack of every component the console owns.** Unchanged, and
deliberately so. Reordering `DistrictDetailPage` around the reader's question ("what is coming to my
district") means moving the outlook card above the actions, header, records and body panels — a
structural change to the most complete surface in the product, with its own print sheet and its own
tests. It is the next wave's first item, not a tail-end edit.

**Open · P2 · Body copy is set in secondary ink.** Unchanged in the brief. The same finding was
closed on the two renderers this pass touched (`ArticlePage`, `/blogs`), where body copy moved from
`text-carbon-60` to `text-carbon-80`/`-70`; the district brief's 41 `text-carbon-60` uses are still
to be triaged into labels (correct) and prose (not).
