# AI SEO (AEO/GEO/LLMO) Audit — hazardnet.live (2026-11-06)

Method: `ai-seo` skill (marketingskills v2.12.0) core workflow — AI visibility audit
(bot access, extractability, machine-readable files, schema) applied to the static artifacts
the deployment ships. No live AI-platform querying from this sandbox; citation-rate measurement
(Otterly/Peec/Profound or DIY monthly prompt checks) remains a recurring manual task.

## Findings

### Bot access & discovery — pass, with a deliberate policy note
- `robots.txt` uses one wildcard allow (`User-agent: *` + `Allow: /`) — per the skill, an
  allowlist of named crawlers would silently exclude agent search APIs; this is correct.
- `Content-Signal: ai-train=no, search=yes, ai-input=no` — search-discovery crawlers
  (OAI-SearchBot, PerplexityBot, Claude-SearchBot, etc.) are allowed; model training and
  AI-input are explicitly opted out. The skill's rule: training controls are separate from
  discovery controls — this matches.
- Auth/app surfaces (`/dashboard`, `/u/`, `/upload`, …) are disallowed and noindex — correct.

### Extractability — pass
- All public pages are **prerendered to static HTML** at build time (`scripts/prerender.mjs`),
  so agents and crawlers read real content without executing JS.
- Semantic structure: one h1 per route (348 documents, 0 findings from `audit-pages --strict`),
  landmark elements, labelled controls (a11y gate green).
- FAQPage + Dataset + Organization JSON-LD injected per route by `SEOHead.tsx`.
- Copy follows the 40–60-word answer-block pattern on reference pages (ArticlePage sections).

### Machine-readable files — gap fixed this pass
- **Added `/llms.txt`** (`frontend/public/llms.txt`): product definition, disclaimer,
  key links, data-provenance pointers (daily snapshot + alerts JSON URLs), and the
  robots/content-signal policy — the file the skill recommends for non-Google engines.
  No Google ranking claim is made for it (Google: no AI files required).
- No `/pricing.md` — N/A, HazardNet is a free public service.
- `/okf/` bundle: skipped — emerging Google-backed experiment, no confirmed AI-search signal.

### Authority / presence — recommendations (not code)
- Freshness signals exist site-wide (`/status`, `/last-run`, freshness artifact) — good.
- Third-party presence (Wikipedia/Reddit/press) is outside this repo's control; track
  citation mix with a monitoring tool per the skill's monitoring section.

## Verification

`llms.txt` is a static public asset; frontend build copies `public/` to `dist/` unchanged.
Backend suite 132/132, frontend 84/84 suites green on this branch.
