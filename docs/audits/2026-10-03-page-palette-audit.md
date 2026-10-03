# Page palette conformance audit — 2026-10-03

## Request

> Several pages don't follow our finalized global color palette that are used in our brand logo
> and text of HazardNet. Fix them, for designing inspiration strictly follow www.apple.com.

## Design approach

Used Apple's public site as **visual inspiration, not an asset or CSS source**: calm neutral
surfaces, focused hierarchy, purposeful color, clear controls and enough whitespace for the
content to lead. No Apple artwork, font files, screenshots, remote assets or copied CSS were
introduced. Color authority remains the committed HazardNet system in
`frontend/src/styles/meridian.css` and `frontend/src/index.css`:

- **Ink and carbon** for reading, tables and page furniture.
- **HazardNet blue / ink** for interaction and reading; **crimson** remains the urgency
  signal rather than a category decoration.
- **Amber and green** retain their warning/success roles.
- Hazard identity is categorical data, so hazard maps, badges and chart fills use the existing
  `--chart-1…5` HDS series tokens, not brand-action colors or a page-local rainbow.

This follows the repo's documented dual-primary rule: browsing stays neutral; semantic color is
scarce and carries meaning. Hazard severity remains encoded by label and icon as well as color.

## Pages corrected

| Page | Before | Change |
|---|---|---|
| `frontend/src/pages/Dashboard.tsx` | Map chrome had its own pale gray, black-ish text, gray caption and hand-picked green live dot. | Replaced with carbon surface/text tokens and the existing `emerald-600` success token. |
| `frontend/src/pages/DivisionDetailPage.tsx` | A local nine-hazard hex map (red, cyan, indigo, purple, orange) plus Tailwind blue/orange chart literals and raw chart furniture. | Removed duplicate map; hazard identity now uses the shared semantic palette, chart data uses `--chart-*`, and chart furniture uses Meridian surface / ink / hairline / shadow tokens. Axis labels are 12 px. |
| `frontend/src/pages/HazardDetailPage.tsx` | A second copy of the rainbow hazard map and raw blue/cyan chart fills. | Uses the shared palette and tokenized hazard surface / border; charts use semantic hazard or chart colors and shared furniture tokens. Axis labels are 12 px. |
| `frontend/src/pages/HazardsPage.tsx` | Third copy of local hazard colors and un-tokenized chart treatments. | Removed local hexes; uses shared hazard roles, the approved chart series and Meridian tooltip/axis tokens. Axis labels are 12 px. |
| `frontend/src/pages/DivisionsPage.tsx` | Hard-coded blues/cyans and hand-picked gray tooltip styling. | Uses the design-system chart series and Meridian chart furniture. Axis labels remain at the 12 px minimum. |
| `frontend/src/pages/AdvisoriesPage.tsx` | Emergency-contact tag used the undeclared `indigo-*` family and 10.5 px type. | Switched to the declared HazardNet blue surface/text/border roles; raised the label to 12 px. |
| `frontend/src/pages/dashboard/BlogEditorPage.tsx` | SERP sample used Google-specific blue/gray literals. | Preserved the familiar blue-link convention with HazardNet's declared blue; secondary text now uses the carbon role. |

## Implementation and regression protection

- `frontend/src/lib/hazardPalette.ts` is the one source for hazard identity colors; unknown hazards
  fall back to neutral rather than inventing a hue.
- `scripts/check-brand-palette.mjs` / `npm run check:brand` scans every route page for raw hex
  literals and undeclared Tailwind palette families. `__tests__/brandPalette.test.js` pins the
  same rule in Jest, and `.github/workflows/ci.yml` runs it.
- `frontend/src/lib/__tests__/hazardPalette.test.ts` pins all semantic mappings and derived
  tint/border behavior.

**Result:** `npm run check:brand` passes with 0 route-page findings. All targeted off-palette
colors are replaced with existing system tokens; no new palette values were added.
