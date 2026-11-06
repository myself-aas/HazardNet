---
target: "frontend design system (frontend/src/index.css, design-system package, .impeccable/design.json)"
skill: "ui-ux-pro-max-skill design-system SKILL.md (three-layer token architecture)"
timestamp: 2026-11-06T01:00:00Z
slug: frontend-design-system-skill-audit
---

# Design-system audit — against the design-system skill's token architecture

**Skill criteria applied** (from `ui-ux-pro-max-skill` `.claude/skills/design-system/SKILL.md` +
`references/token-architecture.md`, `references/semantic-tokens.md`):
1. Three-layer tokens: primitive → semantic → component, as CSS variables.
2. Semantic layer must enable theme switching (dark overrides on semantic tokens).
3. No raw hex in components; hardcoded values validated by script.
4. Spacing / typography / radius / shadow / duration scales as tokens.
5. Token purposes documented (design.json + comments).

## Verdict per criterion

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Three-layer structure | **Pass** | `index.css` declares primitive ramps (`--color-blue-*` … built with `color-mix` off `--ap-link`), semantic aliases (`--ap-link`, `--ap-ink`, `--ap-bg-canvas`, `--ap-bg-raised`, `--ap-sev-low…extreme`), Tailwind-mapped component tokens (`--spacing-ap-*`, `--text-ap-*`, `--color-ap-*`); machine-readable source in `.impeccable/design.json` + `packages/design-system` |
| 2 | Semantic dark theming | **Pass** | dark overrides keyed on `[data-theme="dark"]` / `.dark` and `prefers-color-scheme` fallback; contrast gate verifies both themes (169 components clean) |
| 3 | No raw hex in components | **Pass (gate)** | `check-token-compliance.mjs` PASS at baseline (218 hex / 39 files, all pre-existing legacy); this branch added zero new hex (canvas colors resolve via `cssVar()`) |
| 4 | Scales as tokens | **Pass** | spacing scale `--ap-space-xxs…section`, type scale `--ap-type-*` (size/line/track triplets), radius and shadow tokens documented in `design.json` extensions |
| 5 | Documented purposes | **Pass** | `.impeccable/design.json` (colorMeta/typographyMeta/shadows/motion/breakpoints) + inline layer comments |

## Residual observations (not violations of the repo's own gates)

- **Arbitrary pixel values in TSX (~348 sites):** dominated by deliberate 44/48px minimum
  touch targets (a documented rule) and map/chart canvas dimensions; the spacing scale covers
  layout rhythm. Acceptable, but a future tightening could map more of these to tokens.
- **218 baseline hex literals** remain in 39 legacy files (the gate's recorded baseline); the
  trend is flat — no new ones introduced.

## Measured gates (fresh production build)

`audit-pages --strict` PASS (348 documents, 0 findings) · craft-floor PASS (276 files) ·
contrast PASS (169 components, both themes) · token-compliance PASS · design-residue PASS ·
prose-dashes PASS · css-important PASS · `tsc --noEmit` PASS · jest 84/84 suites, 792/792 tests.
