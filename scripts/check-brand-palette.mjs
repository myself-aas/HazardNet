#!/usr/bin/env node
/**
 * Brand-palette gate — `npm run check:brand`.
 *
 * Two things drift in a UI this size, and neither shows up in a screenshot:
 *
 *  1. **Hex literals that bypass the token layer.** Tailwind's stock ramps are reachable by
 *     accident (`#3b82f6` is `blue-500`, `#06b6d4` is `cyan-500`), and an inline style or an
 *     SVG `fill` does not go through a class at all. Those values are invisible to a
 *     class-name audit and are the ones that quietly disagree with the logo.
 *  2. **Palette families the token layer never declared.** `frontend/src/index.css`
 *     re-points the families HazardNet uses (carbon, amber, blue, emerald, rose, sky, cyan,
 *     red, orange, yellow, teal, plus the grey families folded onto carbon) at HDS tokens
 *     inside `@theme inline`. `indigo-*`, `violet-*`, `purple-*`, `fuchsia-*`, `pink-*`,
 *     `lime-*` and `green-*` are *not* declared, so they resolve to Tailwind's defaults —
 *     colour with no design authority behind it.
 *
 * What counts as allowed, precisely:
 *   - Tailwind family utilities only when their `--color-<family>-<shade>` token is
 *     declared in `@theme inline`;
 *   - semantic status/severity literals only when included in `ALLOWED_HEX` with a comment
 *     pointing to the test that pins their meaning. Brand colors themselves are referenced
 *     through `var(--mrd-*)`; copying a token's hex into a page still counts as drift.
 *
 * Usage:
 *   node scripts/check-brand-palette.mjs [--scope pages|components|all] [--json] [--report]
 *
 * `--report` always exits 0 and prints the ranked list — use it to see the state of the tree.
 * Without it, the script fails on any finding, which is the ratchet: the allowed-list in
 * `ALLOWED_HEX` covers values that are *data* rather than design (chart series, map layers,
 * hazard severities) and must not grow.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend', 'src');
const INDEX_CSS = join(SRC, 'index.css');

const UTILITIES =
  '(?:bg|text|border(?:-[tblrsexy])?|ring|divide|from|via|to|fill|stroke|decoration|outline|shadow|accent|caret|placeholder)';
const FAMILY = '(?:[a-z]+)';
const SHADE = '(?:50|100|200|300|400|500|600|700|800|900|950)';
const UTILITY_RE = new RegExp(`\\b${UTILITIES}-${FAMILY}-${SHADE}\\b`, 'g');
const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/**
 * Values that are data, not design: the hazard severity scale and the chart series colours
 * carry meaning (SEVERE is red, and a chart needs distinguishable series), so they are
 * allowed to sit outside the brand ramp. Everything here is asserted elsewhere by the
 * map/legend/contrast suites. This list is a floor, not a suggestion — adding to it needs a
 * comment saying which test pins the value.
 */
const ALLOWED_HEX = new Set([
  // The mark's own gradient (frontend/src/design-system/brand/infinity.generated.ts).
  '#0064e0', '#1a7bf5', '#3d93fa',
  // The wordmark's ink.
  '#0f1b26',
  // Severity scale — semantic, asserted by __tests__/meridianContrast.test.js and the map suite.
  '#16a34a', '#f59e0b', '#dc2626', '#dcfce7', '#fef3c7', '#fee2e2',
]);

export function collectDeclaredFamilies(indexCssPath = INDEX_CSS) {
  const families = new Set();
  if (!existsSync(indexCssPath)) return families;
  const text = readFileSync(indexCssPath, 'utf8');
  const theme = text.slice(text.indexOf('@theme inline'));
  for (const match of theme.matchAll(/--color-([a-z]+)-\d{2,3}\s*:/g)) families.add(match[1]);
  return families;
}

export function walk(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      out.push(...walk(full, predicate));
    } else if (predicate(entry)) out.push(full);
  }
  return out;
}

/** Comments may explain the palette; they may not be where a colour hides. */
export function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Scan one file. Returns `{ file, hexes, families }` with the offending values and the line
 * they were found on.
 */
export function scanFile(filePath, { declaredFamilies }) {
  const raw = readFileSync(filePath, 'utf8');
  const text = withoutComments(raw);
  const lines = text.split('\n');

  const hexes = [];
  const families = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(HEX_RE)) {
      const value = match[0].toLowerCase();
      if (ALLOWED_HEX.has(value)) continue;
      hexes.push({ value, line: index + 1, snippet: line.trim().slice(0, 120) });
    }
    for (const match of line.matchAll(UTILITY_RE)) {
      const family = match[0].split('-').slice(-2)[0];
      if (declaredFamilies.has(family)) continue;
      families.push({ value: match[0], line: index + 1, snippet: line.trim().slice(0, 120) });
    }
  });
  return { file: filePath, hexes, families };
}

export function scanTree({ root = SRC, scope = 'all' } = {}) {
  const declaredFamilies = collectDeclaredFamilies();

  const targets = scope === 'pages'
    ? walk(join(root, 'pages'), (name) => /\.tsx?$/.test(name))
    : scope === 'components'
      ? walk(join(root, 'components'), (name) => /\.tsx?$/.test(name))
      : walk(root, (name) => /\.tsx?$/.test(name));

  return targets
    .map((file) => scanFile(file, { declaredFamilies }))
    .filter((result) => result.hexes.length > 0 || result.families.length > 0);
}

function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const flagValue = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : argv[index + 1];
  };
  const scope = flagValue('scope') ?? ['pages', 'components'].find((s) => args.has(`--${s}`)) ?? 'pages';
  const results = scanTree({ scope });

  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    const ranked = results.sort((a, b) =>
      (b.hexes.length + b.families.length) - (a.hexes.length + a.families.length));
    if (ranked.length === 0) {
      process.stdout.write('✅ Every colour resolves to a declared token.\n');
    } else {
      process.stdout.write(`Off-palette colours (scope: ${scope}) — ${ranked.length} file(s)\n\n`);
      for (const result of ranked) {
        const where = result.file.replace(`${ROOT}/`, '');
        const counts = new Map();
        for (const hit of [...result.hexes, ...result.families]) {
          counts.set(hit.value, (counts.get(hit.value) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        process.stdout.write(`  ${where}\n    ${top.map(([v, n]) => `${v}×${n}`).join('  ')}\n`);
      }
      process.stdout.write(`\nFix: map each value onto a declared token (carbon-*/nasa-blue/amber-*/
     emerald-*/rose-*/chart-*) or, for data colours, add it to ALLOWED_HEX with the test
     that pins it. See docs/design-system/MERIDIAN.md.\n`);
    }
  }

  if (args.has('--report')) process.exit(0);
  process.exit(results.length === 0 ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
