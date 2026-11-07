# SEO/GEO Audit — hazardnet.live (2026-11-06)

Method: `seo-geo` skill (opc-skills) workflow — website audit (meta, robots, sitemap, AI bot
access), GEO structure, traditional meta templates — applied to the shipped artifacts.

## Current status

| Check | Status | Evidence |
|---|---|---|
| Title / meta description per route | ✅ | 30 curated + 75 generated routes, all unique; `/reports*` lengths fixed in the seo-audit pass |
| Open Graph (title/description/type/url/image/locale) | ✅ after fix | `SEOHead.tsx`; og:image was 404 — fixed below |
| Twitter Cards (`summary_large_image`, site @HazardNet_BD) | ✅ after fix | `SEOHead.tsx` |
| Canonical per route | ✅ | `canonicalFor` self-referencing |
| JSON-LD (FAQPage, Dataset, Organization, WebPage) | ✅ | injected per route; validate in Rich Results Test in CI/manual |
| robots.txt / AI bot access | ✅ | wildcard allow; search discovery on, training/AI-input opted out via Content-Signal |
| Sitemap | ✅ | 103 URLs incl. generated + `/reports*` |
| H1 with target phrasing, heading hierarchy | ✅ | 348 documents, 0 findings |
| Answer-first structure, lists/tables, short paragraphs | ✅ | reference pages + district/hazard templates |
| Mobile-friendly, no horizontal scroll | ✅ | mobile audit 2026-11-06 |
| llms.txt | ✅ | added in the ai-seo pass |

## Fix applied this pass

- **`/hazardnet-og.png` did not exist** — `og:image` and `twitter:image` 404'd on every share.
  Generated a branded 1424×752 raster OG card (`frontend/public/hazardnet-og.png`) and added
  `og:image:width` / `og:image:height` / `og:image:alt`. Verified it ships in `dist/`.

## GEO recommendations (already satisfied / ongoing)

- Statistics with sources + freshness: every published number carries artifact provenance;
  `/status` and `/last-run` show ages — matches the +37% statistics / freshness guidance.
- FAQPage schema present on FAQ-bearing routes.
- Monitoring: monthly DIY prompt checks or Otterly/Peec for citation rate across engines.

## Verification

`tsc` clean; frontend 84/84 suites (792 tests); production build ships the OG image.
