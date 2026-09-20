# Phase 7 start — localisation, a11y, performance (2026-09-20)

Phase 6 leftovers in §14.7–14.8 (user dashboard/profile, About/blogs/status inner cards) were restyled in the same change. BrandPanel’s pinned `'<100ms'` / `'64'` stats were **not** rewritten.

## What landed

| Item | Evidence |
|---|---|
| Dashboard / profile / public profile inner cards | 0-radius surfaces, 24px pad via `Card`, 48px inputs, 44px save (`nasa-blue`), 64–96 circular avatars, 16px helper text. Save copy is “No unsaved changes.” / post-save message only — not an optimistic “Saved”. |
| About / blogs / ArticlePage / FreshnessPanel | 16/1.62 body, 12px metadata floor, 0 radius, nasa-blue-shade links, 1/2/3 card grid on blogs. |
| BrandPanel | Comment only. Tests still pin `'<100ms'`. |
| UX-09 Playwright `testMatch` | `playwright.config.ts` now matches `full-app-qa`, `forecast-ux`, and `navigation-a11y`. `playwright.qa.config.ts` still isolates the QA sweep. |
| New browser specs | `e2e/forecast-ux.spec.ts`, `e2e/navigation-a11y.spec.ts` |
| Dictionaries / Intl dates | Already complete (`i18n.test.ts`). `formatDate` documents calendar-component parsing so date-only values do not TZ-shift. |
| Viewport zoom | `frontend/index.html` already has `viewport-fit=cover` and does not set `user-scalable=no`. |
| Service worker | Navigations / `text/html` are not written to `CACHE_NAME`. |
| AT / zoom notes | `docs/frontend/ACCESSIBILITY.md` §5. |

## Explicitly not done (next Phase 7 slices)

- Driven NVDA/TalkBack walkthrough (owner).
- Field CWV (p75 LCP/INP/CLS) on production.
- Native-speaker review of *new* Bengali safety strings (none added this slice).
- 400% zoom on a physical device (Playwright uses CSS `zoom`).

## Integrity

HDS, stored-forecast lookup, `/` vs `/live`, alert engine, and zero new photographs are unchanged.
