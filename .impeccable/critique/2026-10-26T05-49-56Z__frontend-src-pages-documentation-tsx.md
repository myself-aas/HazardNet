---
target: Docs and methodology (/docs, /methodology, /faq)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/Documentation.tsx"
target_fingerprint: "sha256:b23bf0213037f0aabfaefd46cd306c61d6d44b95e8415ff9badeb7d7409b576e"
target_path: /home/user/HazardNet/frontend/src/pages/Documentation.tsx
timestamp: 2026-10-26T05-49-56Z
slug: frontend-src-pages-documentation-tsx
---
# Critique — docs and methodology (`/docs`, `/docs/:slug`, `/methodology`, `/model`, `/data-sources`, `/faq`)

**Target:** `frontend/src/pages/Documentation.tsx, frontend/src/components/ArticlePage.tsx`
**Surface brief:** `.impeccable/surfaces/docs-methodology.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 30 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition rather than recall | 4 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 4 |

## Design specificity — pass on content, weak on composition

## Priority issues

**P1 · Seventy-five documents are each a stack of identical cards** — `ArticlePage` renders the header, then every section as `<section className="border border-carbon-20 rounded-2xl bg-white p-6">`, then the FAQ as another card and the safety footer as a third. A document with eight sections is nine bordered boxes of equal weight, so reading order is carried by the text alone and there is no hierarchy above the paragraph. That is the floor's "cards are the lazy container", multiplied by every document the platform publishes.

**P2 · The running text is secondary ink and the headings are body-sized** — Paragraphs are `text-carbon-60`; section headings are `text-lg` (18px) inside a 65ch column. On a Read surface that puts body and heading within 2px of each other in perceived weight, so the whole document sits at the visual volume of a settings page.

**P2 · There are no in-page contents** — `/docs` lists topics, but a long article has no contents, no section anchors and no previous/next. A reader arriving from search lands mid-document in 1,500 words of methodology with no way to see its shape.

## Positive findings

- The copy lives in `site-routes.json`, so the prerendered HTML and the hydrated page are the same words — the failure this renderer exists to prevent.
- Every document closes with the safety framing and the BMD/FFWC/999 statement.
- Tables go through `CardStackTable`, which stacks on a phone instead of scrolling sideways.
- `break-words` on paragraphs and bullets: the truth-set citations carry full URLs and do not overflow a 375px screen.

## Not tested

The documents at 360px, a screen reader's pass over the FAQ disclosures, and the `/docs` index with every topic loaded.

## Closure — 2026-10-26 (fix pass)

**Closed · P1 · Seventy-five documents were each a stack of identical cards.** `ArticlePage` renders
one document column now: the header is a plain h1 / meta / lede block, sections are separated by
`divide-y divide-carbon-20` instead of each sitting in its own bordered white card, the FAQ is a
hairline-separated disclosure list, and the safety framing is a `border-t` note rather than a
fourth card. The `max-w-4xl` container became `max-w-3xl` with a 68ch measure on the prose itself.

**Closed · P2 · Body and headings sat within 2px of each other.** Section headings are
`text-xl sm:text-2xl` (20/24px) with `tracking-tight`; body copy moved from `text-carbon-60` to
`text-carbon-80`, the standfirst to `text-lg text-carbon-70`. The bullet and FAQ glyphs
(`amber-600`, a Tailwind literal outside the system) are `text-carbon-40` now.

**Open · P2 · No in-page contents.** A long article still has no contents, no section anchors and no
previous/next. The renderer has the section list in scope, so a contents block is a small addition —
it is deferred, not dismissed.

**Verified:** `npx jest` 186 suites / 1988 passing, including `tableStack` (the `CardStackTable`
branch is untouched) and `fourState`.
