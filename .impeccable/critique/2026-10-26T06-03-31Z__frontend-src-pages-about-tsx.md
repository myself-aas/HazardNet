---
target: About, legal and adoption (/about, /contact, /use-cases, /terms, /privacy, /download)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/About.tsx"
target_fingerprint: "sha256:20eece0640469dd7b8c46c938861121f3e6e9590b92d4274482208237cbffa66"
target_path: /home/user/HazardNet/frontend/src/pages/About.tsx
timestamp: 2026-10-26T06-03-31Z
slug: frontend-src-pages-about-tsx
---
# Critique — about, legal and adoption (`/about`, `/contact`, `/use-cases`, `/terms`, `/privacy`, `/download`)

**Target:** `frontend/src/pages/About.tsx`, `frontend/src/pages/Contact.tsx`, `frontend/src/pages/UseCases.tsx`, `frontend/src/pages/Terms.tsx`, `frontend/src/pages/Privacy.tsx`, `frontend/src/pages/DownloadCenter.tsx`
**Surface brief:** `.impeccable/surfaces/about-legal.md`
**Mode:** Persuade — the visitor decides whether to trust the product, or reads the binding terms.
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the design-quality gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 31 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match between system and real world | 4 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 4 |

## Design specificity — pass, once the second palette is gone

The words are specific and load-bearing: the partner block states in one sentence that HazardNet has *no*
partnership, endorsement or data-sharing agreement with BMD, FFWC or DDM, and `/about` states its inference path as
"server-side batch pipeline; no in-browser model execution" rather than implying a live model. That kind of sentence is
why a visitor would believe the rest. What was not specific was the visual language: this surface ran its own amber
palette, its own focus ring and its own hover motion, so it read as a different product that happened to share the copy.

## Priority issues

**P1 · A second accent colour ran the whole adoption track.** `/use-cases` was built on Tailwind amber — banner tints, badge fills, icon tiles, a full-width CTA panel, an `amber-500` active state on the `/contact` form switcher, `amber-600`/`amber-200` as the input focus ring, and amber as the link colour in the contact footer. The product's accent is `primary` (blue); its severity scale is `--ap-sev-*`. Amber as a third role meant the same page could show "warning" and "brand" in the same hue, and none of it followed the dark-mode tokens: `bg-amber-50` stays a pale cream on a dark surface.

**P2 · The legal pages were set smaller than their own body copy.** `/privacy` headings were `text-sm` (14px) over 16px paragraphs; `/terms` used `text-ap-tagline`, the same size class as a caption. On the two pages where a reader scans for a clause, the clause titles were the smallest thing on the page — the ramp inverted. There were also no anchors, so no clause could be linked to.

**P2 · `/about` opened with two primary buttons and a third in a different shape.** "Explore Regional Use Cases" and "Download Offline Software" were both `bg-primary`; "GitHub Repository" was a `rounded-full` bordered pill while the other two were rectangles. Three actions, no hierarchy, two radii, one message: the reader has to guess which one the page wants. The hero card also lifted on hover (`whileHover={{ y: -2 }}`) — motion on a static heading block that promised an interaction which does not exist — and its four "impact stats" were the hero-metric template again, complete with a `whileHover` scale.

**P2 · The contact form announced its errors somewhere else.** `validate()` produces a good sentence per missing field ("Add your name or role so the report can be attributed"), the summary is `role="alert"`, and no field carries `aria-invalid` or `aria-describedby`. A screen-reader user heard a list appear and was left standing in the field they were editing, several controls away from it. The summary now takes focus on error; wiring each control to the message is still open.

## Positive findings

- The safety framing is real on all six routes: `/contact` opens with "This is not an emergency channel and it is not monitored around the clock" and the 999 instruction, and `/about` names the authorities it defers to without claiming a relationship.
- `/contact` never posts to a server it does not own: it prepares an issue or a mailto and shows you exactly what will be sent before you send it. That is the honest version of a contact form on a static platform.
- `/download` states each channel's requirements and provenance rather than leading with a button.
- The legal pages carry an effective date and cross-link each other, and both link back to `/contact` for a real remedy.
- `/use-cases` carries per-division exposure numbers and a selected-division detail rather than generic marketing copy.

## Not tested

The three `/contact` forms end to end (they prepare an issue or a mailto; nothing is submitted), the `/download` channel links, and all six routes at 360px.

## Closure — 2026-10-26 (fix pass, same session)

**Closed · P1 · The second accent.** `/use-cases` now draws every amber and emerald role from the system: `--ap-sev-moderate-surface` / `--ap-sev-moderate` for the warning surface and its marker, `--ap-sev-low` / `--ap-sev-low-surface` for the low-severity ticks, `carbon-90` for text on those surfaces (so dark mode inherits the dark surface instead of a cream one). `/contact` takes the system focus ring (`focus:border-ap-primary focus:ring-ap-primary`), its form switcher active state is `bg-primary text-ap-action-fg`, its hotline tiles use the moderate-severity tokens, and its footer links are `text-ap-link`. One accent, one severity scale.

**Closed · P2 · The inverted legal ramp.** Both `/privacy` and `/terms` set their section headings at `text-lg sm:text-xl` with `tracking-tight` — two steps above body copy, on nine headings between them. Section anchors are still open.

**Closed · P2 · `/about`'s action row and hero.** One primary ("Explore Regional Use Cases"), one secondary bordered ("Download Offline Software"), one tertiary text link (GitHub), all on `rounded-full` at `min-h-[44px]`. The hero no longer lifts on hover; the four impact figures are a `<dl>` on hairlines with the model count stated as "8 modelled" — the same eight the hazards page now reports.

**Closed · P3 · `/contact`'s internal links.** Two `/methodology` and `/data-sources` links were raw `<a href>` — a full document reload out of a single-page app, and a lost scroll position. Both are `<Link to>` now. (`/.well-known/security.txt` stays an anchor: it is a file.)

**Open · P2 · Per-field error wiring on `/contact`.** The summary receives focus on error; the ten inputs still do not carry `aria-invalid` / `aria-describedby`. The validator already returns one message per field, so the mapping exists — it needs an id per control and a pass over each of the three forms.

**Open · P2 · `/contact`'s form switcher is a pressed-button group, not a tab set.** `aria-pressed` on three buttons that swap one form region is understandable but not the pattern the console uses. Given the console's tab strip now carries the full WAI-ARIA tab contract, this should follow it when the forms are next touched.

**Open · P2 · Legal pages have no in-page contents.** Nine clauses on `/terms` with no anchors and no contents block. Same finding as `docs-methodology`, same remedy, and worth doing for both at once.
