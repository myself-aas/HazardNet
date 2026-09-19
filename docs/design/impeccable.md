# Impeccable — the vendored design authority and its CI gate

HazardNet's UI is judged by [impeccable](https://github.com/pbakaus/impeccable), a design
skill for agents plus a deterministic detector for UI anti-patterns. It is vendored here
so the judgement is reproducible: the same rules run on a contributor's machine, in this
repository's CI, and in an agent session, and a finding is either fixed or waived with a
written reason. It sits alongside NASA's Horizon Design System, which supplies the
values; impeccable supplies the audit of whether the pages actually wear them.

| | |
| --- | --- |
| Skills (agent guidance, 24 commands) | 4.3.1, vendored at `.agents/skills/impeccable/` |
| Detector binary | `impeccable` 4.1.0 (npm devDependency), engine 0.1.5 (`@impeccable/cli-linux-x64`) |
| Upstream commit | `f2c7051853848826aac2f4646581d62a732155ad` (2026-09-16) |
| Licence | Apache-2.0 — `LICENSE` and `NOTICE.md` are vendored with the skills |
| Detector rules | 61, of which some are advisory (never fail a run) |
| Gate | `npm run check:design` → `scripts/check-design-quality.mjs`, in CI's `verify` job |
| Baseline | `docs/design/impeccable-baseline.json` |
| Suppressions | `.impeccable/config.json` |
| Project design system export | `DESIGN.md` (repo root) |

`.claude/skills/impeccable` is a symlink to `.agents/skills/impeccable`, matching how this
repository already vendors its other skills: real files under `.agents/`, a link from each
harness directory that wants them.

## What the gate scans, and why those two targets

```
node scripts/check-design-quality.mjs            # fail on any finding outside the baseline
node scripts/check-design-quality.mjs --update   # rewrite the baseline after fixing findings
npm run design:detect                            # raw detector over src and dist, for reading
```

1. **`frontend/src`** — what we author. In source mode the detector reads class
   combinations and literal CSS, and every finding carries a file and a line, so it can be
   fixed where it lives. A full scan takes under a second.
2. **`frontend/dist/**/*.html`** — what ships: all 198 prerendered documents. This is the
   only view that sees the rendered result, such as a heading size that exists only after
   prerendering.

The built stylesheet is **not** a target. It is derived from `frontend/src`, and scanning
it makes the detector pair Tailwind utility *definitions* with each other — `.text-slate-100`
sitting next to `.bg-amber-50` in one bundle reports a combination no element ever wears.
Minified JavaScript bundles are not a target either: their string literals match rules
about markup (a bundled `<img` in React's source reads as a broken image), and easing
curves inside third-party libraries are not this product's motion decisions.

Both exclusions were measured, not assumed. On the build produced by the adopting commit:

| Target | Findings | Note |
| --- | --- | --- |
| `frontend/dist/**/*.html` + built CSS | 3,524 | 3,499 of them suppressed or waived below; 25 are utility-definition pairings in the built CSS |
| built CSS alone (`dist/assets/*.css`) | 26 | 24 are Tailwind utility definitions paired with each other |
| JS bundles (`dist/assets/*.js`) | 269 | 243 `gray-on-color` utility definitions, 12 `ai-color-palette`, 7 `border-accent-on-rounded`, 3 `bounce-easing` (library curves), 2 `side-tab`, 2 `broken-image` (React's own source) |
| **the gate's two targets** | **102** | 37 outstanding + 65 waived |

The gate fails when a finding is neither waived nor already listed in the baseline, so the
baseline can only shrink without a commit that says otherwise. Fixing findings is followed
by `npm run check:design:update` in the same commit.

## Suppressions and waivers

Two mechanisms, deliberately kept apart. `.impeccable/config.json` suppresses findings
before they are ever reported (the detector's own mechanism, with a reason per entry);
the baseline's `waivers` accept findings that are reported but not actionable. Every entry
in both names the check that covers the same risk, because a suppression without a
compensating check is a hole rather than a decision.

| Rule | Where suppressed | Why | Covered instead by |
| --- | --- | --- | --- |
| `overused-font` (`inter`) | config, all targets | NASA HDS names Inter as the heading face (`--hds-font-family-heading`). Following nasa.gov is an explicit project directive, so the HDS face outranks a generic distinctiveness heuristic. Body text is Public Sans Web, which the rule does not flag. | `DESIGN.md` typography section; `__tests__/designTypography.test.js` |
| `low-contrast` | config, `frontend/dist/**/*.html` | The detector resolves colours without cascading `@media (prefers-color-scheme)`, so on a built page it pairs light-scheme text with dark-scheme backgrounds. Measured: 3,235 findings, all of them this pairing. | `__tests__/staticShellContrast.test.js`, which resolves each scheme separately and computes WCAG 2.1 ratios |
| `broken-image` | config, `frontend/dist/**/*.html` | Matches the literal string `<img` inside inlined minified JavaScript, not a rendered tag. | `__tests__/imageLedger.test.js` for editorial imagery; the source scan for markup we author |
| `tight-leading` (`0.13x`) | baseline waiver | NASA's composite display tokens declare 100% leading (`--hds-typography-h1-2xl: 700 7.5rem/1`), which the detector divides as 1/7.5. The tokens are vendored verbatim from `data/design/nasa-hds/tokens.json` and `scripts/import_nasa_tokens.mjs --check` fails if they are edited. | `__tests__/designTypography.test.js`: ≥1.3 leading on every body-scale rule we author, tighter leading allowed only in `--hds-*` declarations, and no tight Tailwind leading on elements that wrap |
| `oversized-h1` (`288px`) | baseline waiver | The print sheet sets `h1 { font-size: 18pt }`; the detector converts `pt` as though it were `rem` and reports 288px. The screen h1 is 28px, 32px from 640px. | `__tests__/designTypography.test.js`: point sizes only inside `@media print` or the paper-emulation scopes, and no screen h1 above NASA's 48px ceiling |

The two compensating test files exist because of these suppressions and are the reason the
suppressions are safe. If either test is deleted, the corresponding entry must go with it.

## DESIGN.md and the design-system rules

`DESIGN.md` at the repository root is the portable export of the token system in the
[official DESIGN.md format](https://github.com/google-labs-code/design.md): frontmatter
tokens plus the eight canonical sections. It is an export, not a second source of truth —
the pipeline stays `data/design/nasa-hds/tokens.json` → `scripts/import_nasa_tokens.mjs` →
`frontend/src/styles/nasa-hds.css` → `frontend/src/index.css`, and
`scripts/import_nasa_tokens.mjs --check` in CI is what keeps it honest.

Four detector rules read that file: `design-system-color`, `design-system-font`,
`design-system-radius` and `design-system-font-size`. They are **switched off** for now
(`detector.designSystem.enabled: false` in `.impeccable/config.json`). Turning them on
today would report every off-token Tailwind literal in the application — the slate and
amber ramp that predates the HDS adoption — as several thousand findings at once, which
buries the signal rather than improving it. The plan is to switch them on in the commit
that finishes moving the application's colour usage onto the carbon ramp and the HDS
sequential ramps, so that from then on the gate holds the line instead of describing the
drift.

## What the first audit found

The adoption scan covered all of `frontend/dist`, JavaScript bundles included, before any
fix and before the scope above was chosen. It reported 1,268 findings across 235 built
files. By rule, and what happened to each:

| Finding | Adoption count | Disposition |
| --- | --- | --- |
| `low-contrast` | 494 | 480 were the detector pairing the static shell's dark-scheme text (`#e3e3e3`) with the light-scheme page background. The other 14 were a **real defect**: the caution callout kept its light-mode text colour when dark mode changed its background to `#2e2e32`, giving 1.1:1. Fixed, and now suppressed on built pages with a compensating WCAG test that would have caught it. |
| `gray-on-color` | 254 | Scope reduces this to 33 real usages in `frontend/src`; the rest were utility-definition pairings inside the built CSS and bundles. Outstanding: slate text on amber, sky and rose tints — a second grey ramp and a second accent family, both off-system. |
| `gradient-text` | 199 | **Fixed.** `.brand-gradient-text` and `.brand-accent-text` deleted from `frontend/src/index.css`. Neither was used anywhere; gradient text is decoration that reads as an AI tell. |
| `overused-font` | 199 | 197 were Inter, NASA HDS's own heading face — suppressed with the reason recorded. The remaining two (`font-family: Helvetica`, `font-family: Inter`) are in the built bundle's utility layer. |
| `tight-leading` | 43 | Waived: NASA's composite display tokens declare 100% leading. Compensated by a leading test over the CSS we author. |
| `side-tab` | 20 | 14 were the static shell's 3px callout edge, now 2px per HDS's emphasis-border token. Outstanding: a 4px amber left border on the blog blockquote (`frontend/src/index.css:2029`) and `border-l-4` accents in `BlogArticlePage.tsx` and `DistrictDetailPage.tsx`. |
| `ai-color-palette` | 20 | Outstanding, 8 in scope: purple, violet and indigo headings in seven files. HDS has no violet. |
| `border-accent-on-rounded` | 9 | Outstanding, 1 in scope: `border-b-2` on a rounded element in `DistrictDetailPage.tsx`. |
| `bounce-easing` | 6 | **Fixed**, 1 real: the map's measure-tool hint no longer bounces a pointing emoji; it uses a static international-orange icon. The other five were easing curves and animation names inside bundled third-party libraries, which the scope excludes. |
| `broken-image` | 2 | Both were the literal string `<img` inside minified JavaScript. A third, found by the source scan, is a regular expression in `frontend/src/lib/blogSeo.ts` that audits blog HTML for missing alt text; it is waived in place with an `impeccable-disable-next-line` comment. |
| `oversized-h1` | 0 before, 22 after | Appeared once the static shell declared its dark backgrounds explicitly and the detector began reading the print sheet's `18pt` h1 as `18rem`. Waived, compensated by a test that keeps point sizes inside print scopes and caps the screen h1 at NASA's 48px. |
| `em-dash-overuse` | 16 (advisory) | Advisory rules never change an exit code and are excluded from the gate with `--no-advisory`. Worth a copy edit on the pages it names: `model-performance`, `status`, `hazards/tropical-cyclone`, `model`. |

Re-running the same whole-tree scan after the static-shell fix reports 3,793 findings. The
increase is entirely `low-contrast` (494 → 3,235): the shell now states its dark-scheme
background on the same selectors as its dark-scheme text, which is correct CSS and which
the detector, being blind to `@media`, now pairs against every light-scheme colour on the
page. That single artefact is why `low-contrast` is suppressed on built pages and measured
properly in `__tests__/staticShellContrast.test.js` instead.

Outstanding work is listed finding by finding in `docs/design/impeccable-baseline.json`,
and concentrates in `DistrictDetailPage.tsx` (7), `AnalyticsPage.tsx` (4),
`ForecastDashboard.tsx` (3) and `AdvisoriesPage.tsx` (3).

## Using the skills

`npx impeccable help` lists the 24 commands. The ones that matter here:

- `detect` — the deterministic scan the gate runs. No model, no API key, no browser.
- `audit`, `critique`, `polish` — structured review of a screen or a component.
- `typeset`, `layout`, `colorize` — focused passes on one design dimension.
- `harden`, `adapt` — edge cases, empty states, degraded conditions, responsive behaviour.
- `document` — regenerate `DESIGN.md` from the code (do not let it overwrite the file
  silently; the token pipeline above is the source of truth).

The verbs that drive a browser (`live`, and the screenshot paths of `critique`) need
Chromium. They are unavailable in the sandboxed agent environment this repository is
often edited in, and are not used by the gate.

## Updating the vendored copy

The skills were vendored from a `git clone` of upstream at the commit recorded above,
because the installer's own download endpoint (`impeccable.style`) is unreachable from
that environment; the npm registry is reachable, which is where the detector binary comes
from. To update:

```bash
git clone --depth 1 https://github.com/pbakaus/impeccable /tmp/impeccable
rm -rf .agents/skills/impeccable
cp -r /tmp/impeccable/.claude/skills/impeccable .agents/skills/impeccable
cp /tmp/impeccable/LICENSE /tmp/impeccable/NOTICE.md .agents/skills/impeccable/
npm install --save-dev impeccable@latest
node scripts/check-design-quality.mjs --update   # only if the rule set changed
```

Record the new skill version, CLI version, engine version and upstream commit in the table
at the top of this file. A rule-set change can alter findings without any change to this
repository's UI, which is why the baseline carries the versions it was generated with.
