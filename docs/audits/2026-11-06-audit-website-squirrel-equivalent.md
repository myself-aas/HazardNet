# Website audit — hazardnet.live (2026-11-06)

Method: `audit-website` skill (squirrelscan v2.9). The `squirrel` CLI binary is not installable
from this sandbox (its download host is unreachable and it is not on npm), so the audit was
executed with the repository's own measured gates — covering the same categories the skill
lists (SEO, technical, security, accessibility, performance proxies, content) — against a
fresh production build served locally, plus the full jest suite.

## Result: all green, no errors to fix

| Category | Check | Result |
|---|---|---|
| Technical/SEO | `audit-pages --strict` (348 docs: titles, one h1, robots, sitemap) | PASS, 0 findings |
| Crawl | robots.txt, sitemap.xml (103 URLs), llms.txt, canonicals, JSON-LD graph | PASS; `/`, `/reports`, `/reports/archive`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/hazardnet-og.png`, data JSON all return 200 in preview |
| Security | `_headers` security headers, workflow secret-safety check, `!important` audit | PASS |
| Performance proxies | bundle-size gate, public-path bounds, craft floor | PASS |
| Accessibility | contrast both themes (169 components), craft floor, a11y suites | PASS |
| Content | prose-dash policy, design residue, token compliance (no raw-hex drift) | PASS |
| Build & types | production build, `tsc --noEmit` | PASS |
| Tests | full jest run | 218/218 suites, 2348 passed / 1 skipped |
| Social/AI cards | og:image raster card (1424×752, dims+alt meta), twitter:* tags, llms.txt | PASS (fixed on this branch) |

## Not run here (environment-limited, not "clean-skipped")

- The scored `squirrel audit https://www.hazardnet.live --format llm --level full` crawl and
  live Core Web Vitals timing — run where the squirrel CLI is installed and signed in.
