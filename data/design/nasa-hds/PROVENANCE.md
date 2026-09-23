# NASA design tokens — where these came from

This directory holds a **verbatim copy** of NASA's own design-token source, plus the record of
exactly which revision it came from. It is vendored rather than fetched at build time because a
build that reaches the network to style a page is a build that fails offline, and because a design
system whose values can change under a commit is not a design system.

| Field | Value |
| --- | --- |
| Source repository | [`nasa/hds-core`](https://github.com/nasa/hds-core) — NASA's **Horizon Design System**, the CSS-only design system NASA maintains for `*.nasa.gov` sites |
| Source file | `tokens.json` (the repo's own token source of truth; `src/scss/_hds-tokens.scss` and `src/scss/base/_custom-properties.scss` are generated from it) |
| Revision | commit [`fdc4acf087818fd94e37ea757cf22b2fa473d8bc`](https://github.com/nasa/hds-core/commit/fdc4acf087818fd94e37ea757cf22b2fa473d8bc) (2026-09-13), tag `0.10.0` |
| Retrieved | 2026-09-18 |
| Licence | **CC0-1.0** — the repository's `LICENSE.md`: *"As a work of the United States Government, the software is not subject to copyright protection within the United States. NASA waives copyright and related rights in this software worldwide through the CC0 1.0 Universal Public Domain Dedication."* Vendoring is therefore permitted without conditions; the attribution above is recorded because provenance matters even when it is not required. |
| Bundled typefaces | Inter 3.019 and DM Mono 1.000, SIL Open Font License 1.1 (per the same `LICENSE.md`). Public Sans is not bundled by HDS; it is installed here from `@fontsource-variable/public-sans` (also OFL). |

## What is taken, and what is not

**Taken** (every group the generator reads): `color`, `spacing`, `breakpoint`, `border`, `focus`,
`layout`, `line-height`, `letter-spacing`, `font-weight`, `font-size`, `font-family`, `typography`.

**Not taken:** `dataviz` — HDS's chart palettes. HazardNet's charts carry a *hazard severity* ramp
whose meaning is product-specific (documented in `docs/design-system/MASTER.md` §Severity); adopting
NASA's dataviz palette would either collide with it or force the severity scale to change meaning.
The group is left in the vendored file so the copy stays verifiable against its source, and the
generator deliberately skips it.

**Also not taken:** HDS's compiled component CSS (`.usa-*`, `.hds-*`), its USWDS dependency, and its
palette system. This repository is a React/Tailwind application, not a USWDS site; it adopts NASA's
*tokens* — the values and the rules attached to them — and not NASA's stylesheet.

## The rules the tokens carry, which this project honours

NASA's token descriptions are not comments; they are usage rules, and adopting the values without
them would be adopting the look and not the system. The three that constrain product decisions here:

1. **"Red means 'go somewhere'."** `nasa-red` is for actions that navigate (primary buttons) and for
   error/emergency states. *"Never for on-page actions, decorative use, or dataviz."*
2. **"Blue means 'do something here'."** `nasa-blue` is for on-page interaction: controls, list
   markers, table headers, info states. *"Never for navigation CTAs or dataviz."*
3. **`international-orange` is a secondary accent** for status emphasis and decorative markers,
   *"never for primary actions"*, and `active-green` is for active/confirmation states, *"never for
   branding, decorative backgrounds, or dataviz."*

HazardNet keeps its own severity ramp (five levels, one hue per level) because hazard severity is
the product's core semantic — a five-step scale NASA's three-colour status set does not express. The
ramp is *derived from* these primitives rather than invented beside them, and the derivation is
recorded in `docs/design-system/MASTER.md`.

## Regenerating

```bash
node scripts/import_nasa_tokens.mjs            # rewrite frontend/src/styles/nasa-hds.css
node scripts/import_nasa_tokens.mjs --check    # CI: fail if the committed CSS differs
node scripts/import_nasa_tokens.mjs --source ./tokens.json --out /tmp/tokens.css
```

The vendored file is never edited by hand. To move to a newer HDS revision, replace
`tokens.json`, update the table above, regenerate, and commit — the diff is then reviewable as a
design change rather than hidden in a dependency bump.
