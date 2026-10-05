#!/usr/bin/env node
/**
 * Theme contrast gate — `npm run check:contrast`.
 *
 * The Apple neutral ramp in `frontend/src/styles/apple.css` **inverts**: `--ap-n-05` is
 * `#fafafc` in light and `#252527` in dark, `--ap-n-90` is `#1d1d1f` in light and `#ffffff`
 * in dark. That is what keeps dark mode one design language instead of a second one — but it
 * means a class pair that reads fine in light mode can land at 1.00:1 in dark, and nothing in
 * the type system or the build will say a word about it. The dark-mode sweep that produced
 * this file found 307 such pairs. All of them were invisible to `tsc`, to ESLint, and to the
 * existing token gate, because every individual class was perfectly legal.
 *
 * The three failure modes this encodes, all found in the wild:
 *
 *   1. **Double inversion.** `bg-carbon-10 dark:bg-carbon-80` — the ramp already flips the
 *      base, so the `dark:` arm flips it back. 323 of these existed. The fix is to delete the
 *      `dark:` arm, so the gate now treats any `dark:*-carbon-*` as an error on sight rather
 *      than trying to score it.
 *   2. **Half-inverting pairs.** `bg-carbon-90 text-white` — the ground inverts to white, the
 *      ink does not, and you get white on white. The rule that falls out of this, and the one
 *      worth remembering: *if the background token inverts, the foreground token must come
 *      from an inverting ramp too.* `bg-carbon-90 text-carbon-05` measures 16.1:1 light and
 *      15.9:1 dark; `bg-carbon-90 text-white` measures 15.9:1 light and 1.00:1 dark.
 *   3. **Non-inverting surfaces.** Tailwind's `bg-white` resolves to its own built-in `#fff`,
 *      which is not one of our tokens and never flips. 324 call sites painted a white card in
 *      dark mode under auto-inverting ink. That one is fixed centrally in `apple.css` rather
 *      than at the call sites, which is why `resolve()` below has to model the override.
 *
 * Because fix 3 lives in CSS, this scanner is only honest while it mirrors `apple.css`. The
 * two files have to move together, so the override table is kept in one place at the top and
 * the gate verifies against the real stylesheet (`--check-css`) instead of trusting a comment.
 *
 * Scoring both modes matters. Bumping `text-carbon-40` (2.57:1 light, 2.94:1 dark — below AA
 * in *both*) up to `carbon-50` fixed 70 call sites and broke 2, because those 2 sat on
 * `bg-carbon-80`, an inverted surface where "darker ink" is the wrong direction. A dark-only
 * scan would have shipped them.
 *
 * Flags: `--report` lists every hit and exits 0; `--json` emits machine-readable output;
 * `--check-css` asserts the `apple.css` overrides this file models are actually present.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const wantsReport = argv.includes('--report');
const wantsJson = argv.includes('--json');
const wantsCssCheck = argv.includes('--check-css');

const APPLE_CSS = 'frontend/src/styles/apple.css';
const AA_NORMAL = 4.5;

/** The inverting neutral ramp, read off apple.css lines 54-64 (light) and 259-268 (dark). */
const RAMP = {
  light: { '05': '#fafafc', 10: '#f5f5f7', 20: '#e0e0e0', 30: '#d2d2d7', 40: '#a1a1a6',
           50: '#6e6e73', 60: '#5a5a5d', 70: '#333333', 80: '#272729', 90: '#1d1d1f' },
  dark:  { '05': '#252527', 10: '#272729', 20: '#3a3a3c', 30: '#48484a', 40: '#6e6e73',
           50: '#9a9a9f', 60: '#cccccc', 70: '#e4e4e6', 80: '#f2f2f4', 90: '#ffffff' },
};

/**
 * Literals that are defined once and never flip. `--ap-n-black` is declared a single time, so
 * `bg-carbon-black/NN` is the correct token for a scrim that must stay dark over a photo;
 * `bg-carbon-90/NN` is not, because it inverts to a white veil. Tailwind's `white` likewise
 * never flips, which is why `text-white` is still right on a coloured fill.
 */
const LITERAL = { white: '#ffffff', black: '#000000', 'carbon-black': '#000000' };

/**
 * Overrides applied in apple.css, which Tailwind alone does not express. `bg-white` is a
 * SURFACE and follows the theme. Its alpha variants split by weight: at 40% and above it is a
 * frosted panel and follows the theme; below that it is a highlight drawn over media or a dark
 * ground and stays white. A blanket redirect of every alpha step would have wrecked the hero
 * overlays, so the split is deliberate and the threshold is asserted by --check-css.
 */
const PANEL_ALPHA_MIN = 40;
const CANVAS_DARK = '#252527';

const relLum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

const PROP = /^(?:dark:)?(?:hover:|focus:|active:|group-hover:|disabled:)*(text|bg|border|fill|stroke|divide|ring)-/;
const propOf = (cls) => (PROP.exec(cls) ?? [])[1] ?? null;
/** Only score the resting state; a hover colour is not what the page renders at rest. */
const isResting = (cls) => !/^(?:dark:)?(?:hover|focus|active|group-hover|disabled):/.test(cls);

function resolve(cls, mode) {
  const bare = cls.replace(/^dark:/, '');
  const ramp = RAMP[mode];

  const carbon = /^(?:text|bg|border|fill|stroke|divide|ring)-carbon-(\d{2})(?:\/\d+)?$/.exec(bare);
  if (carbon) return ramp[carbon[1]] ?? null;

  // apple.css: `.bg-white` and the panel-weight alphas resolve to the canvas token in dark.
  if (bare === 'bg-white') return mode === 'dark' ? CANVAS_DARK : '#ffffff';
  const alpha = /^bg-white\/(\d+)$/.exec(bare);
  if (alpha) return mode === 'dark' && Number(alpha[1]) >= PANEL_ALPHA_MIN ? CANVAS_DARK : '#ffffff';

  const lit = /^(?:text|bg|border|fill|stroke)-(white|black|carbon-black)(?:\/\d+)?$/.exec(bare);
  if (lit) return LITERAL[lit[1]];

  return null;
}

/** Effective resting colour for one property in one mode; a `dark:` arm wins in dark. */
function effective(classes, prop, mode) {
  let base = null;
  let dark = null;
  for (const cls of classes) {
    if (propOf(cls) !== prop || !isResting(cls)) continue;
    const value = resolve(cls, mode);
    if (value === null) continue;
    if (cls.startsWith('dark:')) dark = value;
    else base = value;
  }
  return mode === 'dark' ? dark ?? base : base;
}

const files = execSync("find frontend/src -name '*.tsx' ! -path '*__tests__*'")
  .toString().trim().split('\n').filter(Boolean);

const problems = [];
const add = (file, line, rule, detail, snippet) =>
  problems.push({ file: file.replace('frontend/src/', ''), line, rule, detail, snippet });

for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((text, idx) => {
    const line = idx + 1;
    for (const match of text.matchAll(/(?:className|class)\s*=\s*[{]?[`"']([^`"']{3,1200})[`"']/g)) {
      const classes = match[1].split(/\s+/).filter(Boolean);
      const snippet = text.trim().slice(0, 72);

      // 1. The ramp already inverts, so a `dark:` arm on a carbon token inverts it twice.
      for (const cls of classes) {
        if (/^dark:(?:text|bg|border|fill|stroke|divide|ring)-carbon-/.test(cls)) {
          add(file, line, 'double-inversion', `${cls} re-inverts an already-inverting token`, snippet);
        }
      }

      // 2. Resting ink against its own resting ground, scored in both themes.
      for (const mode of ['light', 'dark']) {
        const fg = effective(classes, 'text', mode);
        const bg = effective(classes, 'bg', mode);
        if (!fg || !bg) continue;
        const ratio = contrast(fg, bg);
        if (ratio < AA_NORMAL) {
          add(file, line, `contrast-${mode}`, `${fg} on ${bg} = ${ratio.toFixed(2)}:1 (AA needs ${AA_NORMAL})`, snippet);
        }
      }

      // 3. A scrim built on an inverting token becomes a white veil in dark mode.
      for (const cls of classes) {
        if (/^bg-carbon-90\/\d+$/.test(cls)) {
          add(file, line, 'inverting-scrim', `${cls} inverts to a white veil; use bg-carbon-black/NN`, snippet);
        }
      }
    }
  });
}

/** Assert the CSS this scanner models is actually in the stylesheet. */
function checkCss() {
  if (!existsSync(APPLE_CSS)) return [`${APPLE_CSS} not found`];
  const css = readFileSync(APPLE_CSS, 'utf8');
  const failures = [];
  const selectors = ["[data-theme='dark']", '.dark', ":root:not([data-theme='light'])"];
  // A selector may be followed by `,` (more selectors in the list) or ` {` (end of list),
  // because the hover arm is only emitted for the steps that have hover call sites.
  const declares = (sel) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,{]`).test(css);
  for (const sel of selectors) {
    if (!declares(`${sel} .bg-white`)) failures.push(`missing solid override for ${sel}`);
    if (!declares(`${sel} .bg-white\\/${PANEL_ALPHA_MIN}`)) failures.push(`missing /${PANEL_ALPHA_MIN} panel override for ${sel}`);
  }
  if (/\.bg-white\\\/(?:[0-9]|[12]\d|3\d),/.test(css)) {
    failures.push(`an alpha step below ${PANEL_ALPHA_MIN}% is being redirected; those stay white`);
  }
  if (css.includes(',,')) failures.push('empty selector in a list (",,") — the whole rule is dropped by the parser');
  return failures;
}

if (wantsCssCheck) {
  const failures = checkCss();
  if (failures.length) {
    console.log('apple.css does not match what check-contrast.mjs models:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('✅ apple.css overrides match the scanner model.');
  process.exit(0);
}

if (wantsJson) {
  console.log(JSON.stringify({ total: problems.length, problems }, null, 2));
  process.exit(0);
}

const byRule = {};
for (const p of problems) (byRule[p.rule] ??= []).push(p);

if (problems.length === 0) {
  console.log(`✅ ${files.length} components: no contrast or inversion defects in either theme.`);
  process.exit(0);
}

console.log(`${problems.length} contrast problem(s) across ${files.length} components:\n`);
for (const [rule, hits] of Object.entries(byRule)) {
  console.log(`  ${String(hits.length).padStart(4)}  ${rule}`);
}
console.log();
for (const [rule, hits] of Object.entries(byRule)) {
  console.log(`--- ${rule} ---`);
  for (const h of (wantsReport ? hits : hits.slice(0, 8))) {
    console.log(`  ${h.file}:${h.line}  ${h.detail}`);
    console.log(`      ${h.snippet}`);
  }
  if (!wantsReport && hits.length > 8) console.log(`  …and ${hits.length - 8} more (--report for all)`);
  console.log();
}
process.exit(wantsReport ? 0 : 1);
