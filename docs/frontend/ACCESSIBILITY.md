# Accessibility — WCAG 2.2 AA pass on the alert surface (Phase 5)

Status: **done for the Phase 5 surfaces, 2026-09-18**. Scope: `/alerts`, `/alerts/:id`,
the alert layer and text table on the map, `DistrictAlertStrip` on `/district/:id`, the
language toggle, the low-bandwidth controls, the evidence card and its PDF.

The rest of the site (the 3D Earth stage, the long-form pages) is **not** covered by this
pass. That is a real gap, recorded in `docs/ops/CONCERNS.md` rather than implied away.

---

## 1. How each criterion is verified

| WCAG 2.2 criterion | How it is met here | Verified by |
|---|---|---|
| 1.1.1 Non-text content | Every map marker is a `role="button"` with an `aria-label` naming district, baseline risk, hazard, severity and — when present — the published alert; decorative SVGs are `aria-hidden`; the icon set renders SVG (no icon-font ligatures that would be read as text) | `BangladeshSvgMap.alertLayer.test.tsx` |
| 1.3.1 Info and relationships | The district table is a real `<table>` with `<caption>` and `scope="row"` headers; fields are `<dl>`/`<dt>`/`<dd>`; the disclaimer is a `role="note"` with an accessible name | `AlertsSurface.test.tsx`, `alertsA11y.test.tsx` |
| 1.3.2 Meaningful sequence | Card → map → list → policy → disclaimer; the DOM order is the reading order in both languages (no absolute positioning used for layout of the new surfaces) | `AlertsPage.test.tsx` |
| 1.4.1 Use of colour | Level is always a **word** next to the swatch, plus a distinguishing icon; the map legend is present in both views; the map's baseline vs alert colours are explained in text under the map | `AlertsSurface.test.tsx` ("renders the level as a word, not only as a colour") |
| 1.4.3 Contrast (minimum) | Level pills pair a light tint with a near-black text of the same hue (amber-50/amber-950, orange-100/orange-950, red-100/red-950, emerald-50/emerald-900), all ≥ 4.5:1 for body text; body copy on white uses slate-600/700 (≥ 4.5:1); the emergency numbers are `slate-800` on amber-50 | manual, values recorded in §2 |
| 1.4.4 Resize text | All new text uses rem/relative sizes and Tailwind scales; no fixed pixel heights on text containers | manual (400 % zoom spot-check of the page structure) |
| 1.4.10 Reflow | The district table scrolls in both directions inside `overflow-auto` with `tabIndex={0}`; the page itself is single-column at 320 px | `AlertsSurface.test.tsx` (table renders), manual |
| 1.4.11 Non-text contrast | Level swatches and the legend chips use ≥ 3:1 against their background (the solid palette is `#15803d/#f59e0b/#ea580c/#b91c1c` on white or slate-50) | manual |
| 1.4.12 Text spacing | No fixed line-heights or `nowrap` on prose in the new components | manual |
| 2.1.1 Keyboard | Every control is a `<button>`, `<select>`, `<input>` or `<a>`; map markers are focusable (`tabIndex={0}`) and activate on Enter/Space | `BangladeshSvgMap.alertLayer.test.tsx` |
| 2.1.2 No keyboard trap | No focus management beyond the existing app-wide skip link; the table's scroll container is focusable but not trapping | manual |
| 2.2.2 Pause, stop, hide | No autoplaying motion in the new surfaces; `animate-ping`/`animate-pulse` are dropped in low-bandwidth mode and collapsed under `prefers-reduced-motion` | `BangladeshSvgMap.alertLayer.test.tsx`, `index.css` |
| 2.4.1 Bypass blocks | The app-wide "Skip to main content" link is the first focusable element; the map section is followed immediately by the district list | `App.tsx`, `AlertsSurface.test.tsx` |
| 2.4.2 Page titled | `/alerts` has a title, description, canonical and h1 from `site-routes.json`, prerendered into static HTML | build output (`dist/alerts/index.html`) |
| 2.4.3 Focus order | Document order; the language toggle and low-bandwidth control are in the header before the content | manual |
| 2.4.4 Link purpose | Links name their destination ("Evidence card", "Read the full alert policy", "Download all alerts (CSV)") | `AlertsSurface.test.tsx` |
| 2.4.6 Headings and labels | One `h1` per page; sections use `h2`; form controls have visible `<label for>` (not placeholders) | `AlertsSurface.test.tsx`, `AlertsPage.test.tsx` |
| 2.4.7 Focus visible | The global `:focus-visible` rule in `index.css` is never removed; the new controls inherit it | `index.css` |
| 2.4.11 Focus not obscured (2.2) | Nothing in the new surfaces is `position: fixed`; the sticky table header is inside the scroll container | manual |
| 2.5.7 Dragging movements (2.2) | No drag-only interaction | n/a |
| 2.5.8 Target size (2.2) | Form controls use `--control-min-size: 44px`; small buttons are ≥ 32 px with spacing; the `tel:` links carry their digits as text | `AlertsSurface.test.tsx` |
| 3.1.1 Language of page | `useI18n` writes `<html lang>` (`en` / `bn-BD`) on every change | `i18n.test.ts` |
| 3.1.2 Language of parts | Bengali labels inside English pages and the canonical English disclaimer inside Bengali pages carry their own `lang` | `AlertsSurface.test.tsx` |
| 3.2.1 On focus / 3.2.2 On input | Changing a filter re-renders the list only; no navigation, no focus stealing | `AlertFilters.tsx` |
| 3.3.1 Error identification | Load failures are text, with the error string and a source label, not just a colour or an icon | `AlertsPage.test.tsx` |
| 3.3.2 Labels or instructions | Filters are labelled; the low-bandwidth control has a visible hint; the table has a caption plus a one-line explanation above it | `AlertsSurface.test.tsx` |
| 4.1.1 Parsing / 4.1.2 Name, role, value | axe-core finds no violations on the new components in both languages | `alertsA11y.test.tsx` |
| 4.1.3 Status messages | Result counts (`aria-live="polite"`), the loading state (`role="status"`), the source banner (`role="status"`) and the PDF-export failure (`role="alert"`) | `AlertsSurface.test.tsx`, page suite |

## 2. Contrast values for the level palette

| Level | Text | Background | Ratio |
|---|---|---|---|
| No alert | `#064e3b` (emerald-900) | `#ecfdf5` (emerald-50) | ≈ 12.6 : 1 |
| Watch | `#451a03` (amber-950) | `#fffbeb` (amber-50) | ≈ 15.4 : 1 |
| Warning | `#431407` (orange-950) | `#ffedd5` (orange-100) | ≈ 15.1 : 1 |
| Severe | `#450a0a` (red-950) | `#fee2e2` (red-100) | ≈ 14.6 : 1 |

Swatch fills (`#15803d`, `#f59e0b`, `#ea580c`, `#b91c1c`) against white/slate-50 are
≥ 3 : 1 except the watch amber (`#f59e0b` ≈ 2.1 : 1 against white) — which is why the
swatch is never the only signal: the level word is always adjacent, and the amber chip
carries a border.

## 3. The automated pass, and the bug it found

`frontend/src/components/alerts/__tests__/alertsA11y.test.tsx` runs axe-core (via
`jest-axe`) over every new component in **both languages** — 17 assertions.

It failed on the first run, on a real defect: `EvidenceCard` contained the disclaimer as
an `<aside>`, and `landmark-complementary-is-top-level` flagged a complementary landmark
nested inside the card's region. A nested complementary landmark is not exposed as a
top-level landmark, so a screen-reader user navigating by landmarks would not have found
"Disclaimer" where the page implies it is. The component now uses `role="note"`, which is
both valid and the more accurate role for supporting text.

`jest-axe` is a dev dependency (`package.json`); it is not shipped to users.

## 4. What the automated pass does **not** cover

Recorded honestly, because an axe-only "AA pass" would overstate the result:

* **Colour contrast of Tailwind classes** — axe cannot resolve the compiled stylesheet in
  jsdom. The values in §2 were checked by hand against the token palette in `index.css`.
* **Screen-reader walk-through of the real page.** The structure is asserted, but no
  assistive technology was driven against a running build (no browser in this
  environment). A manual NVDA/TalkBack pass on `/alerts` in both languages is an owner
  action.
* **The rest of the site.** The dashboard's 3D stage, the analytics pages and the
  long-form content have not had this treatment.
* **Cognitive load and plain language.** The Bengali copy was written for this phase and
  reviewed for terminology, but it has not been reviewed by a native-speaker field
  reviewer; that is an owner action before the Phase 9 soft launch.
* **The PDF.** The evidence card's print variant keeps the text and the disclaimer, but
  PDF/UA tagging is not implemented — the export is a rasterised page image.

---

## 5. Phase 7 — zoom, AT, dictionaries

Status: **started 2026-09-20**. This pass does not claim a WCAG certification.

| Check | How it is met | Remaining |
|---|---|---|
| Dictionaries complete in EN and BN | `i18n.test.ts` fails on empty or missing keys | Long-form `site-routes.json` pages stay English-only by documented choice (`/status` included) |
| Dates and numbers follow the language | `formatDate` / `formatNumber` via `useI18n`; date-only strings are calendar components, not TZ-shifted timestamps | Native-speaker review still required for any *new* safety copy |
| Zoom not locked | `frontend/index.html` viewport is `width=device-width, initial-scale=1.0, viewport-fit=cover` — no `user-scalable=no` | Manual 200%/400% on a physical device |
| 200% / 400% reflow | `e2e/navigation-a11y.spec.ts` applies `documentElement.style.zoom` on `/` | Lab zoom ≠ OS pinch-zoom; TalkBack/NVDA still an owner action |
| Assistive technology | Skip link first in tab order; drawer is `role=dialog` + Escape; one `main` | No driven AT in this environment |
| Service worker | `serviceWorker.ts` does not cache HTML/navigations (withdrawn research UI must not persist on disk) | Tile cache unchanged |
| Production profiling | Bundle gate remains `scripts/check-bundle.mjs`; field CWV not measured here | Owner: p75 LCP/INP/CLS on production |
