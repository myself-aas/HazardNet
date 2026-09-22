#!/usr/bin/env node
/**
 * Compile NASA's design tokens into the CSS custom properties this application consumes.
 *
 * WHY THIS EXISTS
 * ---------------
 * `data/design/nasa-hds/tokens.json` is a verbatim copy of NASA's Horizon Design System token
 * source (`nasa/hds-core`, CC0-1.0 — see `data/design/nasa-hds/PROVENANCE.md`). This script turns
 * that JSON into `frontend/src/styles/nasa-hds.css`, using **NASA's own custom-property names**
 * (`--hds-color-nasa-red`, `--hds-spacing-1-5`, `--hds-typography-h1`), so a value read here can be
 * looked up in NASA's published system and vice versa. Renaming them would break that symmetry for
 * no benefit.
 *
 * DESIGN DECISIONS WORTH KNOWING
 * ------------------------------
 * 1. **Deterministic output.** Keys are emitted in the order they appear in the source; there is no
 *    clock, no version string invented at run time, and no map iteration order to drift. `--check`
 *    is therefore an exact byte comparison against the committed file, exactly like the content
 *    engine's and the model-performance builder's gates.
 * 2. **`typography` entries are resolved, not copied.** HDS stores styles as references
 *    (`{font-size.2xl}`, `{font-family.heading}`); the CSS they generate resolves those into a
 *    `font` shorthand. This script does the same resolution, so `font: var(--hds-typography-h1)`
 *    is valid CSS rather than a dangling reference.
 * 3. **`dataviz` is emitted selectively.** NASA's full chart system is ten sequential ramps plus
 *    twelve-hue categorical sets with per-count assignments — hundreds of properties this app would
 *    never reference. Emitted here: the twelve light and twelve dark categorical hues, and HDS's own
 *    recommended five-series assignment for each mode (`5-items.option-1`), which is what
 *    `--chart-1…5` map onto. Of the sequential ramps only yellow and orange are emitted, because
 *    they back the app's caution/highlight ramp; the rest would be unused properties. HazardNet's
 *    hazard severity ramp stays product-specific and is documented in `docs/design-system/MASTER.md`.
 *    NASA's rules matter here:
 *    `nasa-red` and `nasa-blue` are explicitly *not* for dataviz, which is exactly why the chart
 *    series come from `dataviz.*` rather than from the brand tokens.
 * 4. **Nothing here decides how the site looks.** This file is the *vocabulary*; the mapping from
 *    these tokens onto the application's semantic roles lives in `frontend/src/index.css` and is
 *    documented in `docs/design-system/MASTER.md`.
 *
 * USAGE
 *   node scripts/import_nasa_tokens.mjs                 # write frontend/src/styles/nasa-hds.css
 *   node scripts/import_nasa_tokens.mjs --check         # fail if the committed file differs
 *   node scripts/import_nasa_tokens.mjs --source F --out G
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_REPO = 'nasa/hds-core';
export const SOURCE_REVISION = 'fdc4acf087818fd94e37ea757cf22b2fa473d8bc';
export const SOURCE_TAG = '0.10.0';
export const SOURCE_LICENSE = 'CC0-1.0';

const DEFAULT_PATHS = {
  source: 'data/design/nasa-hds/tokens.json',
  out: 'frontend/src/styles/nasa-hds.css',
};

/** Groups copied straight across: token group → CSS custom-property prefix. */
const SIMPLE_GROUPS = [
  ['color', '--hds-color'],
  ['spacing', '--hds-spacing'],
  ['breakpoint', '--hds-breakpoint'],
  ['line-height', '--hds-line-height'],
  ['letter-spacing', '--hds-letter-spacing'],
  ['font-weight', '--hds-font-weight'],
  ['font-size', '--hds-font-size'],
  ['font-family', '--hds-font-family'],
];

/** Groups whose members are nested one level (`border.width.thin`, `layout.margin.mobile`). */
const NESTED_GROUPS = [
  ['border', '--hds-border'],
  ['focus', '--hds-focus'],
  ['layout', '--hds-layout'],
];

/** HDS key → CSS-safe suffix: `0.5` → `0-5`, `neg-5` stays, `mobile-lg` stays. */
const cssKey = (key) => String(key).replace(/\./g, '-');

/** Groups whose values are unitless numbers rather than pixel lengths. */
const UNITLESS_GROUPS = new Set(['line-height', 'font-weight']);

const isToken = (node) => Boolean(node) && typeof node === 'object' && '$value' in node;

/** Flatten a token group to `[cssSuffix, value, description]` rows, preserving source order. */
function flatten(node, prefix = '') {
  let rows = [];
  if (!node || typeof node !== 'object') return rows;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    const name = prefix ? `${prefix}-${cssKey(key)}` : cssKey(key);
    if (isToken(value)) rows.push([name, value.$value, value.$description ?? null]);
    else rows = rows.concat(flatten(value, name));
  }
  return rows;
}

/** Every leaf token in the document, for reference resolution (`{font-size.2xl}` → `3rem`). */
export function indexTokens(tokens) {
  const index = new Map();
  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return;
    if (isToken(node)) {
      index.set(trail.join('.'), node.$value);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      walk(value, [...trail, key]);
    }
  };
  walk(tokens, []);
  return index;
}

/**
 * Resolve `{a.b.c}` references to their literal values. HDS's own build does this; leaving the
 * braces in place would emit `font: {font-weight.bold} {font-size.xl}` — invalid CSS that fails
 * silently at the browser rather than loudly here.
 */
export function resolveReferences(value, index, seen = new Set()) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{([a-zA-Z0-9.-]+)\}/g, (match, ref) => {
    if (seen.has(ref)) throw new Error(`circular token reference: ${[...seen, ref].join(' → ')}`);
    const target = index.get(ref);
    if (target === undefined) throw new Error(`unresolvable token reference ${match}`);
    if (typeof target === 'string' && target.includes('{')) {
      return resolveReferences(target, index, new Set([...seen, ref]));
    }
    return String(target);
  });
}

/** `{'fontSize': '48px', 'fontWeight': 700, ...}` → a CSS `font` shorthand. */
function fontShorthand(style, index) {
  // No `??` defaults on purpose. A missing reference must fail the build: silently falling back is
  // how this file first emitted `400 1rem/1.62` for NASA's H1 style.
  return {
    family: resolveReferences(style.fontFamily, index),
    size: resolveReferences(style.fontSize, index),
    weight: resolveReferences(style.fontWeight, index),
    lineHeight: resolveReferences(style.lineHeight, index),
    letterSpacing: resolveReferences(style.letterSpacing, index),
  };
}

/**
 * Build the stylesheet. Exported so the test suite can compile fixtures instead of trusting the
 * committed file.
 */
export function compile(tokens, { sourceLabel = `${SOURCE_REPO}@${SOURCE_REVISION}` } = {}) {
  const index = indexTokens(tokens);
  const lines = [];

  lines.push('/*');
  lines.push(' * NASA Horizon Design System — design tokens, as CSS custom properties.');
  lines.push(' *');
  lines.push(' * GENERATED FILE — do not edit. Regenerate with `node scripts/import_nasa_tokens.mjs`.');
  lines.push(` * Source:   ${sourceLabel} (tag ${SOURCE_TAG}), file \`tokens.json\``);
  lines.push(` * Licence:  ${SOURCE_LICENSE} (public domain dedication) — see data/design/nasa-hds/PROVENANCE.md`);
  lines.push(' * Names:    identical to NASA\'s own custom-property names, so a token here can be');
  lines.push(' *           looked up in NASA\'s published design system and vice versa.');
  lines.push(' *');
  lines.push(' * This file is the vocabulary only. The mapping onto HazardNet\'s semantic roles lives in');
  lines.push(' * src/index.css; the reasoning lives in docs/design-system/MASTER.md.');
  lines.push(' */');
  lines.push('');
  lines.push(':root {');

  for (const [group, prefix] of SIMPLE_GROUPS) {
    const rows = flatten(tokens[group]);
    if (rows.length === 0) throw new Error(`token group \`${group}\` is missing or empty`);
    lines.push(`  /* ── ${group} ─────────────────────────────────────────────── */`);
    for (const [name, rawValue, description] of rows) {
      const value = resolveReferences(rawValue, index);
      // Unitless numbers are legal CSS (line-height, font-weight); lengths get their unit.
      const printed = typeof value === 'number' && !UNITLESS_GROUPS.has(group) ? `${value}px` : String(value);
      const comment = description ? ` /* ${String(description).replace(/\*\//g, '*\\/')} */` : '';
      lines.push(`  ${prefix}-${name}: ${printed};${comment}`);
    }
    lines.push('');
  }

  for (const [group, prefix] of NESTED_GROUPS) {
    const rows = flatten(tokens[group]);
    if (rows.length === 0) throw new Error(`token group \`${group}\` is missing or empty`);
    lines.push(`  /* ── ${group} ──────────────────────────────────────────────── */`);
    for (const [name, rawValue, description] of rows) {
      const value = resolveReferences(rawValue, index);
      // Unitless numbers are legal CSS (line-height, font-weight); lengths get their unit.
      const printed = typeof value === 'number' && !UNITLESS_GROUPS.has(group) ? `${value}px` : String(value);
      const comment = description ? ` /* ${String(description).replace(/\*\//g, '*\\/')} */` : '';
      lines.push(`  ${prefix}-${name}: ${printed};${comment}`);
    }
    lines.push('');
  }

  // Composite typography styles, resolved into a usable `font` shorthand plus the tracking value.
  const styles = tokens.typography?.styles;
  if (!styles) throw new Error('token group `typography.styles` is missing');
  lines.push('  /* ── typography (composite styles, references resolved) ──────── */');
  for (const [name, entry] of Object.entries(styles)) {
    // Each style is itself a token: the composite object lives under `$value`. Reading the
    // envelope rather than the value yields fallbacks that look plausible and are wrong.
    const style = isToken(entry) ? entry.$value : entry;
    if (!style || typeof style !== 'object') {
      throw new Error(`typography style \`${name}\` has no $value object`);
    }
    for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']) {
      if (!(key in style)) throw new Error(`typography style \`${name}\` is missing \`${key}\``);
    }
    const { family, size, weight, lineHeight, letterSpacing } = fontShorthand(style, index);
    lines.push(
      `  --hds-typography-${cssKey(name)}: ${weight} ${size}/${String(lineHeight)} ${family};` +
        ` /* ${String(entry.$description ?? '').replace(/\*\//g, '*\\/')} */`,
    );
    lines.push(`  --hds-typography-${cssKey(name)}-letter-spacing: ${letterSpacing};`);
  }
  lines.push('');

  // Breakpoints are emitted as custom properties for documentation and for `@media` via var() is
  // not possible in CSS; the canonical numeric values are also mirrored as Tailwind theme keys in
  // src/index.css, which is where the app actually consumes them.
  // Sequential dataviz ramps: only the two that this product actually consumes.
  // Yellow and orange back the warm "caution / highlight" ramp (see --color-amber-*
  // in src/index.css); the other eight ramps are left unemitted on purpose rather
  // than shipping hundreds of unused properties.
  const seq = tokens.dataviz?.color?.seq;
  if (!seq?.yellow || !seq?.orange) throw new Error('token group `dataviz.color.seq.{yellow,orange}` is missing');
  for (const ramp of ['yellow', 'orange']) {
    lines.push(`  /* ── dataviz · sequential ${ramp} ──────────────────────────── */`);
    for (const [step, token] of Object.entries(seq[ramp])) {
      if (step.startsWith('$')) continue;
      lines.push(`  --hds-dataviz-seq-${ramp}-${cssKey(step)}: ${resolveReferences(token.$value, index)};`);
    }
    lines.push('');
  }

  // Categorical dataviz palette: HDS's recommended assignment per series count and mode.
  const cat = tokens.dataviz?.color;
  if (!cat?.cat) throw new Error('token group `dataviz.color.cat` is missing');
  for (const mode of ['light', 'dark']) {
    const hues = cat.cat[mode];
    lines.push(`  /* ── dataviz · categorical (${mode}) ───────────────────────── */`);
    for (const [key, token] of Object.entries(hues)) {
      if (key.startsWith('$')) continue;
      lines.push(`  --hds-dataviz-cat-${mode}-${cssKey(key)}: ${resolveReferences(token.$value, index)};`);
    }
    const assignment = cat.cat.set?.[mode]?.['5-items']?.['option-1'];
    if (!assignment) throw new Error(`dataviz set \`${mode}.5-items.option-1\` is missing`);
    lines.push(`  /* HDS recommended 5-series assignment (${mode}) — wired to --chart-1…5 in src/index.css */`);
    for (const slot of ['a', 'b', 'c', 'd', 'e']) {
      const token = assignment[slot];
      if (!token) throw new Error(`dataviz set slot \`${slot}\` is missing for ${mode}`);
      lines.push(
        `  --hds-dataviz-series-${slot}-${mode}: ${resolveReferences(token.$value, index)};` +
          ` /* ${String(token.$description ?? '').replace(/\*\//g, '*\\/')} */`,
      );
    }
    lines.push('');
  }

  lines.push('}');
  lines.push('');

  return `${lines.join('\n')}`;
}

function parseArgs(argv) {
  const args = { check: false, source: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '..');
  const args = parseArgs(process.argv.slice(2));
  const source = args.source ? path.resolve(args.source) : path.join(rootDir, DEFAULT_PATHS.source);
  const out = args.out ? path.resolve(args.out) : path.join(rootDir, DEFAULT_PATHS.out);

  if (!existsSync(source)) {
    console.error(`[hds] no token source at ${path.relative(rootDir, source)}`);
    process.exit(1);
  }
  const tokens = JSON.parse(readFileSync(source, 'utf8'));
  const relativeSource = path.relative(rootDir, source).split(path.sep).join('/');
  const css = compile(tokens, { sourceLabel: relativeSource });
  const relativeOut = path.relative(rootDir, out).split(path.sep).join('/');

  const propertyCount = (css.match(/^\s+--hds-/gm) ?? []).length;

  if (args.check) {
    if (!existsSync(out)) {
      console.error(`[hds] --check: no committed stylesheet at ${relativeOut}`);
      process.exit(1);
    }
    if (readFileSync(out, 'utf8') !== css) {
      console.error('[hds] --check: the committed token stylesheet no longer matches its source.');
      console.error('  Run `node scripts/import_nasa_tokens.mjs` and commit the result.');
      process.exit(1);
    }
    console.log(`[hds] --check: ${propertyCount} tokens match ${relativeSource}.`);
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, css);
  const colors = flatten(tokens.color).length;
  const spacing = flatten(tokens.spacing).length;
  console.log(
    `[hds] wrote ${relativeOut} — ${propertyCount} custom properties ` +
      `(${colors} colors, ${spacing} spacing steps, ${Object.keys(tokens.typography.styles).length} typography styles) from ${relativeSource}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
