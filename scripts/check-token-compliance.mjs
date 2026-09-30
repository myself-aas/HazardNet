#!/usr/bin/env node
/**
 * Token-compliance gate.
 *
 * Why this exists: the design system's promise is that colour comes from tokens,
 * not from Tailwind's stock palette. `frontend/src/index.css` re-points the
 * families HazardNet actually uses — carbon, amber, gray, neutral, slate, stone,
 * zinc — at NASA HDS values inside `@theme inline`. Any *other* palette family
 * used in a class name resolves to Tailwind's defaults instead, which is how the
 * app ended up with two blues meaning two different things: `--hds-color-nasa-blue`
 * (#1c67e3) documented as "on-page interaction", and `blue-500` (#3b82f6) used 180
 * times with no declaration behind it.
 *
 * This script counts those uses so the number is reproducible rather than living
 * in a one-off analysis. It is the gate for Session 3 of
 * docs/plans/2026-09-30-frontend-refactor.md.
 *
 * Methodology: a "palette-family use" is an occurrence of `<family>-<shade>` in a
 * source file, where <family> is one of the families below. A use is compliant
 * when `@theme inline` declares `--color-<family>-<shade>`. Compliance is
 * 1 - (undeclared uses / total uses).
 *
 * Note that declaring a family is necessary but not sufficient for good design:
 * mapping `blue-500` onto a token removes the collision only if the token is the
 * colour the design system actually means. The script measures the token layer's
 * coverage, not the semantics.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const INDEX_CSS = join(SRC, 'index.css');

/** The gate from the plan. */
const GATE = Number(process.env.TOKEN_COMPLIANCE_GATE || 90);

/**
 * Every palette family Tailwind ships. A use of any of these that is not
 * declared in `@theme inline` falls through to Tailwind's stock palette.
 */
const TAILWIND_FAMILIES = [
  'carbon', 'amber', 'gray', 'neutral', 'slate', 'stone', 'zinc', 'chart',
  'emerald', 'rose', 'blue', 'sky', 'cyan', 'red', 'indigo', 'yellow',
  'teal', 'orange', 'purple',
];

/**
 * Families the design system has consciously adopted, with HDS values behind them.
 */
const DECLARED_EXPECTED = ['carbon', 'amber', 'gray', 'neutral', 'slate', 'stone', 'zinc', 'chart'];

/**
 * Families left off-system on purpose. Their uses are data encodings rather than
 * status semantics: weather-phenomenon colours and chart series indices. No HDS
 * hue ramp exists for them, and aliasing them onto --accent would render two
 * chart series the same colour. See frontend/DESIGN_SYSTEM.md.
 */
const DELIBERATE_EXCEPTIONS = ['indigo', 'purple'];

/**
 * A CSS custom-property declaration (`  --color-rose-50: ...;`). These are the
 * token layer itself, not uses of it, and must not be counted — otherwise the
 * act of declaring a family inflates the denominator and moves the score.
 */
const CUSTOM_PROP_DECL = /^\s*--[a-z0-9-]+\s*:/;

function readThemeFamilies() {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!block) {
    console.error('[token-compliance] Could not find `@theme inline` in frontend/src/index.css');
    process.exit(2);
  }
  const families = new Set();
  for (const m of block[1].matchAll(/--color-([a-z]+)-\d+/g)) families.add(m[1]);
  return families;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.tsx', '.ts', '.css'].includes(extname(full))) out.push(full);
  }
  return out;
}

const declared = readThemeFamilies();
const files = walk(SRC);

// `<family>-<shade>`; the shade must be numeric so prose like "rose-tinted" and
// identifiers like `blue500` are not counted.
const USE = new RegExp(`\\b(${TAILWIND_FAMILIES.join('|')})-(\\d{2,3})\\b`, 'g');

const total = new Map();
const undeclared = new Map();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (CUSTOM_PROP_DECL.test(line)) continue;
    for (const m of line.matchAll(USE)) {
      const family = m[1];
      total.set(family, (total.get(family) || 0) + 1);
      if (!declared.has(family)) undeclared.set(family, (undeclared.get(family) || 0) + 1);
    }
  }
}

const totalUses = [...total.values()].reduce((a, b) => a + b, 0);
const undeclaredUses = [...undeclared.values()].reduce((a, b) => a + b, 0);
const compliance = totalUses === 0 ? 100 : (100 * (totalUses - undeclaredUses)) / totalUses;

const missing = DECLARED_EXPECTED.filter((f) => !declared.has(f));

console.log(
  `[token-compliance] ${files.length} source files: ${totalUses} palette-family uses, ` +
    `${undeclaredUses} resolving to Tailwind's stock palette.`,
);
console.log(`[token-compliance] compliance ${compliance.toFixed(1)}% (gate >= ${GATE}%)`);

if (missing.length > 0) {
  console.error(`[token-compliance] MISSING from @theme inline: ${missing.join(', ')}`);
}

if (undeclaredUses > 0) {
  const lines = [...undeclared.entries()].sort((a, b) => b[1] - a[1]);
  const deliberate = lines.filter(([f]) => DELIBERATE_EXCEPTIONS.includes(f));
  const unexplained = lines.filter(([f]) => !DELIBERATE_EXCEPTIONS.includes(f));
  if (deliberate.length > 0) {
    console.log(
      `[token-compliance] note: ${deliberate.map(([f, c]) => `${f} x${c}`).join(', ')} ` +
        'left off-system on purpose (data encodings, no HDS hue ramp).',
    );
  }
  if (unexplained.length > 0) {
    console.log(
      `[token-compliance] undeclared families: ${unexplained.map(([f, c]) => `${f} x${c}`).join(', ')}`,
    );
  }
}

if (compliance < GATE) {
  const need = Math.ceil(undeclaredUses - (1 - GATE / 100) * totalUses);
  console.error(
    `[token-compliance] FAIL: ${compliance.toFixed(1)}% is below the ${GATE}% gate. ` +
      `Convert or declare at least ${need} more uses.`,
  );
  process.exit(1);
}

console.log('[token-compliance] PASS: within gate.');
