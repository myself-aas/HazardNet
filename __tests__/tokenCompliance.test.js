/**
 * Token-compliance gate for the Tailwind palette families, post-Apple migration.
 *
 * Why this exists: eleven Tailwind palette families (emerald, rose, blue, sky, cyan, red,
 * indigo, yellow, teal, orange, purple) were once undeclared in `@theme inline`, so ~770 uses
 * resolved to Tailwind's stock palette. That is how the app ended up with two blues meaning two
 * different things.
 *
 * The Apple migration closed that hole completely, and tightened the rule. There is now exactly
 * ONE design system, so there is no such thing as an "off-system" family any more — every family
 * Tailwind ships is declared, and every declaration resolves to an Apple token:
 *
 *   · cool families (blue, sky, cyan, indigo, violet, purple) collapse onto the single Action
 *     Blue accent. DESIGN.md §Don'ts: "Don't introduce a second accent color."
 *   · warm and red families (amber, yellow, orange, red, rose, pink, fuchsia) and the greens
 *     (emerald, green, teal, lime) route to the SEVERITY data layer, because in this product
 *     those hues carry hazard meaning rather than decoration.
 *   · the five grey families collapse onto the one Apple neutral ramp.
 *
 * The invariant pinned here is that no declaration may contain a raw colour. A shade is either
 * `var(--ap-*)` or a `color-mix()` whose base is an Apple token — so nobody can re-introduce
 * `--color-blue-500: #3b82f6` and have the compliance count still look green.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_CSS = join(ROOT, 'frontend/src/index.css');

/** Every family the Apple bridge declares. Nothing is left off-system. */
const DECLARED_FAMILIES = [
  'rose', 'red', 'emerald', 'teal', 'blue', 'sky', 'cyan', 'yellow', 'orange',
  'indigo', 'purple', 'violet', 'green', 'lime', 'pink', 'fuchsia', 'amber',
  'slate', 'gray', 'zinc', 'neutral', 'stone',
];

/** Cool families — all of them resolve to the one accent. */
const ACCENT_FAMILIES = ['blue', 'sky', 'cyan', 'indigo', 'violet', 'purple'];

/**
 * The accent is referenced through its SEMANTIC token, not the raw primitive.
 * `--ap-primary` is a fixed #0066cc; Action Blue only reaches 2.68:1 on Apple's
 * dark tiles, so the dark theme re-points `--ap-link` at `--ap-primary-on-dark`.
 * A family pinned to the primitive would therefore be unreadable in dark mode.
 * The alias chain itself is pinned by the `accent alias chain` test below, so
 * naming the semantic tier here loosens nothing.
 */
const ACCENT = '--ap-link';
const APPLE_CSS = join(ROOT, 'frontend/src/styles/apple.css');

/** Families that carry hazard meaning and therefore route to the severity layer. */
const SEVERITY_FAMILIES = [
  'emerald', 'green', 'teal', 'lime', 'amber', 'yellow', 'orange', 'red', 'rose', 'pink', 'fuchsia',
];

/** Every palette family Tailwind ships. */
const ALL_FAMILIES = [...new Set([...DECLARED_FAMILIES, 'carbon', 'chart'])];

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

  test('every declared family shade references an Apple token, never a raw value', () => {
    const offenders = [];
    // Either a bare token reference, or a color-mix() blending two of them — which is how the
    // tint and shade steps are built without inventing a value.
    const BARE = /^var\(--[a-z0-9-]+\)$/;
    const MIX = /^color-mix\(in srgb, var\(--ap-[a-z0-9-]+\) \d+%, var\(--ap-[a-z0-9-]+\)\)$/;
    for (const family of DECLARED_FAMILIES) {
      for (const [key, value] of decls) {
        if (!key.startsWith(`${family}-`)) continue;
        if (!BARE.test(value) && !MIX.test(value)) offenders.push(`${key}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no declaration smuggles in a raw colour', () => {
    const raw = [...decls].filter(([, value]) => /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(value));
    expect(raw.map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  test('each declared family actually has shades declared', () => {
    const missing = DECLARED_FAMILIES.filter(
      (f) => ![...decls.keys()].some((k) => k.startsWith(`${f}-`)),
    );
    expect(missing).toEqual([]);
  });

  test('there is exactly ONE accent: every cool family resolves to Action Blue', () => {
    const wrong = [];
    for (const family of ACCENT_FAMILIES) {
      for (const step of ['500', '600', '700']) {
        const value = decls.get(`${family}-${step}`);
        if (value !== `var(${ACCENT})`) wrong.push(`${family}-${step} -> ${value}`);
      }
      // The tints must still be mixes of the SAME hue, not a second blue.
      for (const step of ['50', '100', '200', '300', '400']) {
        const value = decls.get(`${family}-${step}`) ?? '';
        if (!value.includes(`var(${ACCENT})`)) wrong.push(`${family}-${step} -> ${value}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('hazard-bearing families route to the severity data layer, not to chrome', () => {
    const wrong = [];
    for (const family of SEVERITY_FAMILIES) {
      for (const step of ['500', '600', '700']) {
        const value = decls.get(`${family}-${step}`) ?? '';
        if (!/^var\(--ap-sev-[a-z-]+\)$/.test(value)) wrong.push(`${family}-${step} -> ${value}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('the semantic intent of each family is preserved, not inverted', () => {
    // A family aliased onto the wrong severity would pass every shape check above while
    // quietly turning "all clear" red.
    const expectations = [
      ['emerald-600', '--ap-sev-low'],
      ['green-600', '--ap-sev-low'],
      ['amber-600', '--ap-sev-moderate'],
      ['yellow-600', '--ap-sev-moderate'],
      ['orange-600', '--ap-sev-high'],
      ['red-600', '--ap-sev-very-high'],
      ['rose-600', '--ap-sev-extreme'],
      ['blue-600', ACCENT],
      ['sky-600', ACCENT],
    ];
    const wrong = expectations.filter(([key, token]) => decls.get(key) !== `var(${token})`);
    expect(wrong.map(([k, t]) => `${k} -> expected ${t}, got ${decls.get(k)}`)).toEqual([]);
  });

  test('no family is left off-system', () => {
    const leaked = ALL_FAMILIES.filter(
      (f) => !['carbon', 'chart'].includes(f) && ![...decls.keys()].some((k) => k.startsWith(`${f}-`)),
    );
    expect(leaked).toEqual([]);
  });

  test('the 50/100 steps are surfaces, so a tinted background stays readable', () => {
    expect(decls.get('rose-50')).toBe('var(--ap-sev-extreme-surface)');
    expect(decls.get('red-50')).toBe('var(--ap-sev-very-high-surface)');
    expect(decls.get('emerald-50')).toBe('var(--ap-sev-low-surface)');
    expect(decls.get('amber-100')).toBe('var(--ap-sev-moderate-surface)');
    expect(decls.get('blue-50')).toContain(`var(${ACCENT})`);
  });

  test('accent alias chain: the semantic accent still lands on Action Blue in both themes', () => {
    // Pins the indirection the families depend on. Light must be Action Blue
    // itself; dark must be the lighter on-dark variant, never the same value.
    const apple = readFileSync(APPLE_CSS, 'utf8');
    expect(apple).toMatch(/--ap-link:\s*var\(--ap-primary\)\s*;/);
    expect(apple).toMatch(/--ap-link:\s*var\(--ap-primary-on-dark\)\s*;/);
    expect(apple).toMatch(/--ap-primary:\s*#0066cc\s*;/);
    expect(apple).toMatch(/--ap-primary-on-dark:\s*#2997ff\s*;/);
  });

  test('the five grey families collapse onto the one Apple neutral ramp', () => {
    const wrong = [];
    for (const family of ['slate', 'gray', 'zinc', 'neutral', 'stone']) {
      for (const [tw, ap] of [['50', '05'], ['100', '10'], ['500', '50'], ['900', '90'], ['950', 'black']]) {
        const value = decls.get(`${family}-${tw}`);
        if (value !== `var(--ap-n-${ap})`) wrong.push(`${family}-${tw} -> ${value}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
