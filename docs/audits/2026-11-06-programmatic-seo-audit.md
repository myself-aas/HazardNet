# Programmatic SEO Audit — hazardnet.live (2026-11-06)

Method: `programmatic-seo` skill (marketingskills v2.1.1) pre-launch checklist applied to the
site's existing template-generated pages (the Phase 8 content engine:
`scripts/build_content_engine.mjs` → `frontend/src/content/generated-routes.json`,
prerendered by `scripts/prerender.mjs`).

## Scale

- **75 generated routes**: 8 hazard methodology pages, 64 district outlook pages,
  retrospectives/validation scorecard, plus index hubs.
- Plus 30 hand-written curated routes and the new `/reports` + `/reports/archive`.

## Checklist results

| Skill check | Result | Evidence |
|---|---|---|
| Unique value per page (not swapped variables) | ✅ | every number composed from committed artifacts per entity; absence stated, never placeholder-filled |
| Unique titles & meta descriptions | ✅ | 75/75 unique titles, 75/75 unique descriptions |
| Proper heading structure | ✅ | one h1 per page; `audit-pages --strict`: 348 documents, 0 findings |
| Schema markup per page | ✅ | district routes carry `structuredData`; hand routes get FAQPage/Dataset/Organization JSON-LD via `SEOHead.tsx` |
| In XML sitemap, crawlable, no conflicting noindex | ✅ | 103 sitemap URLs incl. `/reports*`; generated pages `index,follow` with per-type changefreq; invented slugs fall through to `noindex,follow` |
| Hub-and-spoke internal linking, no orphans | ✅ | `/districts`, `/hazards` hubs; every spoke has a breadcrumb back to its hub; route-layer SEO inherits parent metadata |
| Quality over quantity / no thin pages | ✅ | pages are only generated for entities the data covers; `unmatched_snapshot_districts` is tracked in the routes file; no doorway patterns |
| Clean URL structure (subfolders, not subdomains) | ✅ | `/districts/<id>`, `/hazards/<slug>`, `/reports/<date>` |
| Genuine search-intent match | ✅ | district pages answer "what is the outlook for <district>" with the current run's data |
| Data defensibility | ✅ | proprietary model output over public boundaries; provenance (dataset version, run id, SHA-256) published per run |

## New this branch

- `/reports` and `/reports/archive` follow the same pattern: templated, data-driven, sitemaped,
  unique title/description (lengths fixed after the seo-audit pass), breadcrumbs.

## Recommendations (monitoring, not code)

- Track indexation rate and rankings for the district long tail in Search Console post-launch;
  watch for thin-content warnings if the snapshot coverage ever drops below 64 districts.
- Keep `build_content_engine.mjs --check` in CI so generated pages cannot drift from artifacts.

## Verification

Backend 132/132 suites, frontend 84/84 suites, `tsc` clean on this branch.
