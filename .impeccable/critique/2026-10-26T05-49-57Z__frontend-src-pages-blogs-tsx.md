---
target: "Blog (/blogs, /blogs/:slug)"
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/HazardNet/frontend/src/pages/Blogs.tsx"
target_fingerprint: "sha256:e50ae530651d20b2599035df79f6e6341908c5614b9a62ca2b798b5f2525200c"
target_path: /home/user/HazardNet/frontend/src/pages/Blogs.tsx
timestamp: 2026-10-26T05-49-57Z
slug: frontend-src-pages-blogs-tsx
---
# Critique — blog and field reports (`/blogs`, `/blogs/:slug`)

**Target:** `frontend/src/pages/Blogs.tsx, frontend/src/pages/BlogArticlePage.tsx, frontend/src/lib/blogArticles.ts`
**Surface brief:** `.impeccable/surfaces/blog.md`
**Method:** A from source; B from the bundled detector (0 findings across every file in scope), the craft-floor gate and the contrast gate. No render inspection, no sub-agent isolation.

> ⚠️ DEGRADED: single-context (no sub-agent tool exposed; no browser automation available)

## Heuristic score — 31 / 40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 4 |
| 2 | Match between system and real world | 3 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 3 |
| 5 | Error prevention | 4 |
| 6 | Recognition rather than recall | 3 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 3 |
| 9 | Error recovery | 3 |
| 10 | Help and documentation | 3 |

## Design specificity — pass

## Priority issues

**P1 · The article body escapes the type system** — `BlogArticlePage` injects sanitized HTML into `.prose-blog`. That class was rebuilt on tokens in the 2026-10-26 pass, but the markup it wraps is authored in a rich-text editor and carries its own tags, so a heading inside a post is styled by the prose rules rather than by the page's ramp. It is the one place in the product where typography is decided by the content rather than by the system.

**P2 · The index is a list of equal cards** — `/blogs` renders every post with the same footprint, so the newest and the most-consulted look alike, and the date sits in each card's meta row rather than in the reader's line of sight. A Read index ordered by recency should show recency.

**P2 · An article with no cover image opens on a bare title** — The header renders conditionally on `coverImageUrl`; without one the article begins with a title and an excerpt, which is honest but leaves the canvas unanchored compared with the rest of the product.

## Positive findings

- HTML is sanitized on save *and* on render, with js-URL stripping — the right belt-and-braces for user-authored content.
- Reading time is computed from the content rather than typed in.
- The author block, dates and category all render from the record, not from prose.
- `Article not found` is a real state rather than a blank page.

## Not tested

A post at 360px, the editor's output for nested lists and code blocks, and a post with no cover image.

## Correction and closure — 2026-10-26 (fix pass)

**Correction first.** The review's P1 said the article body "escapes the type system" because
`.prose-blog` styles authored HTML. That is half true and the half it names is the harmless half:
`.prose-blog` is an element-selector sheet built on `var(--ap-*)` tokens (h1–h3, p, li, a, pre, code,
blockquote, img, hr), so authored markup is styled *by* the design system, not around it. The real
hole was next to it: `sanitizeInlineStyle` dropped only url/expression/javascript payloads, so an
author could put any `color` — or `background`, `font-size`, `font-family`, `position` — into a post
and the one surface with author-controlled ink was outside the palette and the contrast floor. The
toolbar itself offered five swatches, two of them the same red.

**Closed · P1 (as corrected) · Author ink was outside the design system.**
`frontend/src/lib/blogArticles.ts` now exports `BLOG_TEXT_COLORS` (four values, each ≥ 4.5:1 on the
white article surface) and sanitises inline style against a property allowlist: `text-align`,
`color`, `font-weight`, `font-style`, `text-decoration`. Colours are normalised from `rgb()` or hex
and compared with the closed set; anything else is dropped, including the legacy `<font color>`
attribute, which was the older serialisation of the same command and a hole around the newer one.
`RichTextEditor` renders its swatches from that same exported list. Pinned by two new tests in
`frontend/src/lib/__tests__/blogSanitizer.test.ts` (contrast per swatch; the toolbar cannot offer a
colour the sanitizer drops) plus rewritten accept/reject cases.

**Closed · P2 · The index was a list of equal cards with no date.** The live cards carry the
publication date next to the reading time, the card title is `text-lg` rather than smaller than its
own excerpt, and the CTA reads "Read article" instead of printing `/blogs/<slug>` into the card.

**Closed · P2 · Author chrome on the index.** The header card's `h-1 bg-primary` top stripe (the
decorative bar the earlier pass removed from the rest of the product), the monospace category/meta
row, the uppercase mono "Latest articles" heading and a `hover:transition-all` were removed or set on
tokens.

**Open · P2 · A post with no cover image opens on a bare title.** Unchanged.
