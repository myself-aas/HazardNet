/**
 * Token-compliance gate for the off-system palette families.
 *
 * Why this exists: eleven Tailwind palette families (emerald, rose, blue, sky,
 * cyan, red, indigo, yellow, teal, orange, purple) were never declared in
 * `@theme inline`, so all ~770 of their uses resolved to Tailwind's stock
 * palette. That is how the app ended up with two blues meaning two different
 * things: `--hds-color-nasa-blue` (#1c67e3) is documented as on-page
 * interaction, while `blue-500` (#3b82f6) was used 180 times with nothing
 * behind it. Session 3 of docs/plans/2026-09-30-frontend-refactor.md declared
 * them, mapping each shade to the token for its ROLE rather than its hue.
 *
 * The scan script (`npm run check:tokens`) measures the resulting percentage.
 * This test pins the invariant that makes that percentage meaningful: every
 * declared family shade must reference a `var(--token)`, never a raw hex.
 * Without it, someone could re-declare `--color-blue-500: #3b82f6` and the
 * count would look compliant while the collision came straight back.
 *
 * The second half pins the two deliberate exceptions. indigo and purple are
 * left off-system because their uses are data encodings — weather-phenomenon
 * colours and chart series indices — with no HDS hue ramp behind them, and
 * aliasing them onto --accent would render two chart series the same colour.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_CSS = join(ROOT, 'frontend/src/index.css');

/** Families Session 3 declared. */
const DECLARED_FAMILIES = [
  'rose', 'red', 'emerald', 'teal', 'blue', 'sky', 'cyan', 'yellow', 'orange',
];

/** Left off-system on purpose — data encodings, no HDS hue ramp. */
const EXCEPTIONS = ['indigo', 'purple'];

/** Every palette family Tailwind ships. */
const ALL_FAMILIES = [
  'carbon', 'amber', 'gray', 'neutral', 'slate', 'stone', 'zinc', 'chart',
  'emerald', 'rose', 'blue', 'sky', 'cyan', 'red', 'indigo', 'yellow',
  'teal', 'orange', 'purple',
];

function readThemeBlock() {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const block = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!block) throw new Error('Could not find `@theme inline` in frontend/src/index.css');
  return block[1];
}

/** Every `--color-<family>-<shade>: <value>;` declaration in the theme block. */
function readColorDeclarations() {
  const decls = new Map();
  for (const m of readThemeBlock().matchAll(/--color-([a-z]+)-(\d+)\s*:\s*([^;]+);/g)) {
    decls.set(`${m[1]}-${m[2]}`, m[3].trim());
  }
  return decls;
}

describe('token compliance — off-system palette families', () => {
  const decls = readColorDeclarations();

  test('every declared family shade references a token, never a raw value', () => {
    const offenders = [];
    for (const family of DECLARED_FAMILIES) {
      for (const [key, value] of decls) {
        if (!key.startsWith(`${family}-`)) continue;
        // A compliant declaration delegates to the semantic layer. A raw hex,
        // rgb()/hsl() or colour keyword would mean a stock value pasted back in.
        if (!/^var\(--[a-z0-9-]+\)$/.test(value)) offenders.push(`${key}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('each declared family actually has shades declared', () => {
    const missing = DECLARED_FAMILIES.filter(
      (f) => ![...decls.keys()].some((k) => k.startsWith(`${f}-`)),
    );
    expect(missing).toEqual([]);
  });

  test('rose/red map to destructive, emerald/teal to success, blue/sky/cyan to accent', () => {
    // Spot-check the semantic intent rather than the whole table: a family
    // aliased onto the wrong semantic token would pass the shape checks above
    // while quietly inverting meaning.
    const expectations = [
      ['rose-500', '--destructive'],
      ['red-600', '--destructive'],
      ['emerald-700', '--success'],
      ['teal-600', '--hn-teal-600'],
      ['blue-500', '--accent'],
      ['sky-600', '--info'],
      ['cyan-500', '--accent'],
      ['yellow-700', '--warning'],
      ['orange-500', '--hn-amber-500'],
    ];
    const wrong = expectations.filter(([key, token]) => decls.get(key) !== `var(${token})`);
    expect(wrong.map(([k, t]) => `${k} -> expected ${t}`)).toEqual([]);
  });

  test('indigo and purple stay off-system (documented data-encoding exceptions)', () => {
    const leaked = ALL_FAMILIES.filter(
      (f) => EXCEPTIONS.includes(f) && [...decls.keys()].some((k) => k.startsWith(`${f}-`)),
    );
    expect(leaked).toEqual([]);
  });

  test('surface and border roles use the new tints, not the solid tokens', () => {
    // The ~110 rose/red surface and border shades had no token before Session 3
    // and would otherwise collapse onto the solid destructive colour.
    expect(decls.get('rose-50')).toBe('var(--destructive-surface)');
    expect(decls.get('rose-300')).toBe('var(--destructive-border)');
    expect(decls.get('emerald-50')).toBe('var(--success-surface)');
    expect(decls.get('blue-300')).toBe('var(--accent-border)');
    expect(decls.get('orange-300')).toBe('var(--warning-border)');
  });
});
