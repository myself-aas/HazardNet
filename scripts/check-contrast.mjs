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
import {
  RAMP, LITERAL, PANEL_ALPHA_MIN, CANVAS_DARK,
  relLum, contrast, propOf, isResting, resolve, RESOLVER,
} from './lib/class-resolver.mjs';

const argv = process.argv.slice(2);
const wantsReport = argv.includes('--report');
const wantsJson = argv.includes('--json');
const wantsCssCheck = argv.includes('--check-css');

const APPLE_CSS = 'frontend/src/styles/apple.css';
const INDEX_CSS = 'frontend/src/index.css';
const AA_NORMAL = 4.5;

// RAMP/LITERAL/resolve/contrast live in lib/class-resolver.mjs so this scanner
// and check-contrast-tree.mjs cannot disagree about what a class means.

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

/** The class that actually won `effective()`, for grouping defects by root cause. */
function effectiveCls(classes, prop, mode) {
  let base = null;
  let dark = null;
  for (const cls of classes) {
    if (propOf(cls) !== prop || !isResting(cls)) continue;
    if (resolve(cls, mode) === null) continue;
    if (cls.startsWith('dark:')) dark = cls;
    else base = cls;
  }
  return mode === 'dark' ? dark ?? base : base;
}

/** Every ramp family in index.css that inverts between themes. */
const RAMP_FAMILIES =
  'amber|rose|emerald|blue|sky|cyan|red|green|yellow|orange|teal|indigo|violet|purple|pink|fuchsia|lime|stone|zinc|neutral|slate|gray';
const PROP_RE = 'text|bg|border|fill|stroke|divide|ring';
/** Looks like a Tailwind utility, so a string of them is a class list. */
const CLASSISH =
  /^(?:(?:dark|hover|focus|active|group-hover|focus-within|disabled|sm|md|lg|xl|2xl|motion-safe|motion-reduce|print|first|last|odd|even|aria-[a-z]+|data-\[[^\]]+\]):)*(?:[a-z][a-z0-9]*-)*[a-z0-9[\]().#%/_-]+$/i;
const INVERTING_FILL = new RegExp(
  `^bg-(?:primary|primary-strong|severity-(?:low|moderate|high|very-high|extreme)-solid|(?:${RAMP_FAMILIES})-(?:[5-9]|9[0-5])00)(?:/\\d+)?$`);
const LITERAL_FG = /^text-(?:white|black|carbon-black|carbon-90|ap-black|ap-ink)$/;
/** Fills whose true backdrop is not knowable from the class list. */
const UNKNOWN_GROUND = /^(?:dark:)?bg-(?:transparent|(?:white|black|carbon-black)\/(?:[0-9]|1[0-9]|2[0-5]))$/;

const files = execSync("find frontend/src -name '*.tsx' ! -path '*__tests__*'")
  .toString().trim().split('\n').filter(Boolean);

const problems = [];
const add = (file, line, rule, detail, snippet, pair) =>
  problems.push({ file: file.replace('frontend/src/', ''), line, rule, detail, snippet, ...(pair ? { pair } : {}) });

for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((text, idx) => {
    const line = idx + 1;
    // Class lists are not only written in `className="…"`. Variant maps
    // (`const TONES = { active: 'bg-carbon-90 text-white' }`), ternaries and
    // helper constants hold them too — and that is where the worst defects
    // hid, because the old scanner never looked at them. Read every string
    // literal that is unambiguously a utility class list.
    for (const match of text.matchAll(/[`"']([^`"'<>{}]{3,1200})[`"']/g)) {
      const raw = match[1];
      const classes = raw.split(/\s+/).filter(Boolean);
      const utilities = classes.filter((c) => CLASSISH.test(c)).length;
      if (utilities < 2 || utilities / classes.length < 0.6) continue;
      const snippet = text.trim().slice(0, 72);

      // 1. The ramp already inverts, so a `dark:` arm on a carbon token inverts it twice.
      for (const cls of classes) {
        if (new RegExp(`^dark:(?:${PROP_RE})-(?:carbon|${RAMP_FAMILIES})-`).test(cls)) {
          add(file, line, 'double-inversion', `${cls} re-inverts an already-inverting token`, snippet);
        }
      }

      // 2. Resting ink against its own resting ground, scored in both themes.
      for (const mode of ['light', 'dark']) {
        const fg = effective(classes, 'text', mode);
        const bg = effective(classes, 'bg', mode);
        if (!fg || !bg) continue;
        // A translucent veil (or no fill at all) sits on whatever is behind the
        // element — typically a hero photo or a map tile. The real ground is
        // unknowable from the class list, so scoring it against the page canvas
        // would invent a result. Skip rather than report a number we cannot
        // stand behind; `.ap-on-dark` is how those surfaces declare their ink.
        if (UNKNOWN_GROUND.test(effectiveCls(classes, 'bg', mode) ?? '')) continue;
        const ratio = contrast(fg, bg);
        if (ratio < AA_NORMAL) {
          const pair = `${effectiveCls(classes, 'text', mode)} on ${effectiveCls(classes, 'bg', mode)}`;
          add(file, line, `contrast-${mode}`, `${fg} on ${bg} = ${ratio.toFixed(2)}:1 (AA needs ${AA_NORMAL})`, snippet, pair);
        }
      }

      // 2b. A fill that flips lightness between themes cannot carry a literal
      //     foreground — it will be legible in exactly one of them. Use the
      //     paired token (text-ap-action-fg / text-ap-on-sev) instead.
      const fill = classes.find((c) => INVERTING_FILL.test(c));
      if (fill) {
        const literal = classes.find((c) => LITERAL_FG.test(c));
        if (literal) {
          add(file, line, 'unpaired-fill-foreground',
            `${literal} on ${fill}; use text-ap-action-fg (action) or text-ap-on-sev (severity)`, snippet);
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

  // ── Token-graph invariants. These are the defects that made the scanner
  //    report "all clean" while the product was visibly broken: a ramp that
  //    mixes against a primitive with no dark override is frozen light, and a
  //    semantic token that is never exposed to the utility layer forces call
  //    sites to reach for a primitive that does not invert.
  const idx = readFileSync(INDEX_CSS, 'utf8');

  const frozen = [...idx.matchAll(/--color-([a-z]+-\d+):\s*color-mix\([^;]*var\(--ap-canvas\)/g)].map((m) => m[1]);
  if (frozen.length) {
    failures.push(
      `${frozen.length} ramp step(s) mix against var(--ap-canvas), which has no dark override, ` +
      `so the tint stays light on a dark page — use var(--ap-bg-canvas): ${frozen.slice(0, 4).join(', ')}…`);
  }

  for (const t of ['ap-action', 'ap-action-fg', 'ap-link', 'ap-on-sev']) {
    if (!idx.includes(`--color-${t}:`)) {
      failures.push(`semantic token --color-${t} is not exposed to the utility layer; call sites will reach for a non-inverting primitive`);
    }
  }

  const R = RESOLVER;
  const stuck = [];
  for (const fam of RAMP_FAMILIES.split('|')) {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      const name = `${fam}-${step}`;
      const l = R.token(name, 'light');
      const d = R.token(name, 'dark');
      if (!l || !d) continue;
      if (relLum(l) > 0.5 && relLum(d) > 0.5) stuck.push(name);
    }
  }
  if (stuck.length) {
    failures.push(`${stuck.length} ramp step(s) are light in BOTH themes (they will glare on a dark page): ${stuck.slice(0, 6).join(', ')}…`);
  }

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
