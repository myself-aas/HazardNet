/**
 * @jest-environment node
 *
 * The NASA Horizon Design System integration (`nasa/hds-core`, CC0-1.0).
 *
 * Why a dedicated suite: the design system's whole promise is that the values in the app are
 * NASA's values, and that promise is not observable from a screenshot. It is observable from
 * three artefacts, which is what these tests assert:
 *
 *   1. `data/design/nasa-hds/tokens.json` is a verbatim copy of NASA's token source, and
 *      `frontend/src/styles/nasa-hds.css` is its exact compilation — so a hand-edited token, or
 *      a regenerated file that nobody committed, fails here (an independent twin of
 *      `scripts/import_nasa_tokens.mjs --check`, so the local `npm test` gate catches drift too).
 *   2. Every `var(--hds-*)` the application references actually exists in the compiled sheet.
 *      This is the failure mode that otherwise ships silently: a typo'd token name in a CSS
 *      custom property is not an error anywhere — the property simply becomes invalid and the
 *      element renders with an inherited value.
 *   3. NASA's usage rules are respected where they are mechanically checkable — the brand pair
 *      stays out of the chart palette, the semantic layer resolves to NASA's primitives rather
 *      than to hexes, and the licence/provenance record is present and pinned.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compile,
  indexTokens,
  resolveReferences,
  SOURCE_LICENSE,
  SOURCE_REPO,
  SOURCE_REVISION,
  SOURCE_TAG,
} from '../scripts/import_nasa_tokens.mjs';

const root = join(__dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const tokenSource = JSON.parse(read('data/design/nasa-hds', 'tokens.json'));
const compiled = read('frontend/src/styles', 'nasa-hds.css');
const appCss = read('frontend/src', 'index.css');
const provenance = read('data/design', 'nasa-hds', 'PROVENANCE.md');

/** Every custom property the compiled sheet defines, as a Set of names. */
const definedTokens = new Set([...compiled.matchAll(/^\s+(--hds-[a-z0-9-]+):/gm)].map((m) => m[1]));

describe('NASA token pipeline', () => {
  it('compiles the vendored NASA token source byte-for-byte into the committed stylesheet', () => {
    const expected = compile(tokenSource, { sourceLabel: 'data/design/nasa-hds/tokens.json' });
    expect(compiled).toBe(expected);
  });

  it('is deterministic — two compilations of the same source are identical', () => {
    const once = compile(tokenSource);
    const twice = compile(JSON.parse(JSON.stringify(tokenSource)));
    expect(once).toBe(twice);
  });

  it('compiles every token group the application depends on', () => {
    // 174 properties today; the floor guards against a group silently vanishing from the source.
    expect(definedTokens.size).toBeGreaterThanOrEqual(150);
    for (const name of [
      '--hds-color-nasa-red',
      '--hds-color-nasa-blue',
      '--hds-color-international-orange',
      '--hds-color-carbon-90',
      '--hds-border-radius-default',
      '--hds-border-radius-control',
      '--hds-focus-width',
      '--hds-focus-style',
      '--hds-focus-offset',
      '--hds-layout-max-width',
      '--hds-font-family-heading',
      '--hds-font-family-body',
      '--hds-font-family-code',
      '--hds-typography-h1',
      '--hds-dataviz-series-a-light',
      '--hds-dataviz-seq-orange-60',
    ]) {
      expect(definedTokens).toHaveProperty('size');
      expect(definedTokens.has(name)).toBe(true);
    }
  });

  it('carries NASA’s values, not approximations of them', () => {
    const value = (name) => compiled.match(new RegExp(`^\\s+${name}:\\s*([^;]+);`, 'm'))?.[1];
    expect(value('--hds-color-nasa-red')).toBe('#f64137');
    expect(value('--hds-color-nasa-blue')).toBe('#1c67e3');
    expect(value('--hds-color-international-orange')).toBe('#ea6f24');
    expect(value('--hds-color-carbon-90')).toBe('#17171b');
    expect(value('--hds-border-radius-default')).toBe('0px');
    expect(value('--hds-border-radius-control')).toBe('2px');
    expect(value('--hds-focus-style')).toBe('dashed');
    expect(value('--hds-focus-width')).toBe('1px');
    expect(value('--hds-focus-offset')).toBe('1px');
    expect(value('--hds-layout-max-width')).toBe('1200px');
    expect(value('--hds-spacing-8')).toBe('64px');
  });

  it('resolves composite typography styles instead of emitting dangling references', () => {
    // HDS stores the H1 style as {font-family.heading} … The first version of the generator read
    // the token envelope rather than its value and emitted `400 1rem/1.62` for every style, which
    // is valid CSS and completely wrong. Assert the resolved headline and body styles.
    expect(compiled).toContain(
      "--hds-typography-h1: 700 3rem/1 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;",
    );
    expect(compiled).toMatch(/--hds-typography-metadata: 700 0\.75rem\/1\.75 'Inter'/);
    expect(compiled).toMatch(/--hds-typography-p: 400 1rem\/1\.62 'Public Sans Web'/);
    expect(compiled).not.toMatch(/--hds-typography-[a-z0-9-]+:[^;]*\{[a-z-]+\./);
  });

  it('fails loudly on a source that cannot be resolved', () => {
    const broken = { ...tokenSource, color: { ...tokenSource.color, 'nasa-red': { $value: '{color.nope}', $description: '' } } };
    expect(() => compile(broken)).toThrow(/unresolvable token reference/);

    const circular = { color: { a: { $value: '{color.b}' }, b: { $value: '{color.a}' } } };
    expect(() => resolveReferences('{color.a}', indexTokens(circular))).toThrow(/circular token reference/);

    const missingStyle = { ...tokenSource, typography: { styles: { h1: { $value: { fontSize: '1rem' } } } } };
    expect(() => compile(missingStyle)).toThrow(/typography style `h1` is missing/);
  });

  it('records where the tokens came from, and under which licence', () => {
    expect(provenance).toContain(SOURCE_REPO);
    expect(provenance).toContain(SOURCE_REVISION);
    expect(provenance).toContain(SOURCE_TAG);
    expect(provenance).toContain(SOURCE_LICENSE);
    expect(provenance).toMatch(/CC0 1\.0 Universal/);
    expect(provenance).toMatch(/United States Government/);
    expect(compiled).toContain(SOURCE_LICENSE);
    expect(compiled).toContain(SOURCE_TAG);
  });
});

describe('the application is wired to those tokens', () => {
  it('references only tokens that exist', () => {
    const referenced = new Set([...appCss.matchAll(/var\((--hds-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect(referenced.size).toBeGreaterThan(30);
    const missing = [...referenced].filter((name) => !definedTokens.has(name));
    expect(missing).toEqual([]);
  });

  it('imports the compiled sheet before anything that consumes it', () => {
    const importIndex = appCss.indexOf('@import "./styles/nasa-hds.css"');
    expect(importIndex).toBeGreaterThanOrEqual(0);
    // CSS @import must precede other rules, and the Tailwind import must not come first: the
    // token sheet has to be in the cascade before any utility resolves against it.
    expect(importIndex).toBeLessThan(appCss.indexOf('@import "tailwindcss"'));
  });

  it('maps the semantic layer onto NASA primitives rather than local hexes', () => {
    const semantic = (name) => appCss.match(new RegExp(`^\\s+${name}:\\s*([^;]+);`, 'm'))?.[1];
    // Red means "go somewhere": the primary action colour is NASA red, and the darker step
    // exists precisely so small labels can clear AA (white on bright red is 3.1:1).
    expect(semantic('--primary')).toBe('var(--hn-hds-red)');
    expect(semantic('--primary-strong')).toBe('var(--hn-hds-red-shade)');
    expect(semantic('--accent')).toBe('var(--hn-hds-blue)');
    expect(semantic('--ring')).toBe('var(--hn-hds-ink-soft)');
    expect(semantic('--background')).toBe('var(--hn-hds-surface)');
    expect(semantic('--radius')).toBe('5px'); // Finalized system geometry (see index.css)
  });

  it('keeps NASA’s brand pair out of the chart palette', () => {
    // "Nasa-red … never for dataviz" and "nasa-blue … never for navigation CTAs or dataviz".
    for (const slot of [1, 2, 3, 4, 5]) {
      const value = appCss.match(new RegExp(`^\\s+--chart-${slot}:\\s*([^;]+);`, 'm'))?.[1];
      expect(value).toMatch(/^var\(--hds-dataviz-series-[a-e]-light\)$/);
    }
    expect(appCss).not.toMatch(/--chart-\d:\s*var\(--hn-hds-(red|blue)\)/);
  });

  it('uses the shipped typefaces for body, headings and data', () => {
    // The families NASA's tokens name must be defined locally, or every var()-driven font stack
    // silently falls back to a system font while still looking plausible in a screenshot.
    for (const family of ["'Inter'", "'Public Sans Web'", "'DM Mono'"]) {
      expect(appCss).toContain(`font-family: ${family}`);
    }
    expect(appCss).toContain("--font-sans: var(--hds-font-family-body)");
    expect(appCss).toContain("--font-brand: var(--hds-font-family-heading)");
    expect(appCss).toContain("--font-mono: var(--hds-font-family-code)");
    // …and no reference to the families this migration replaced.
    expect(appCss).not.toMatch(/Noto Sans Variable|Playfair Display/);
  });

  it('squares off corners without touching circles', () => {
    // HDS has exactly two radii; the shadcn scale is mapped onto them.
    expect(appCss).toMatch(/--radius-sm: var\(--hds-border-radius-control\)/);
    expect(appCss).toMatch(/--radius-2xl: var\(--hds-border-radius-default\)/);
    expect(appCss).not.toMatch(/--radius-\w+: calc\(var\(--radius\)/);
    // `rounded-full` is intentionally left alone for avatars and status dots.
    expect(appCss).not.toMatch(/--radius-full:\s*0/);
  });

  it('renders HDS’s dashed focus ring, palette-aware', () => {
    expect(appCss).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*var\(--hds-focus-width\)\s+var\(--hds-focus-style\)\s+var\(--ring\)/,
    );
    expect(appCss).toMatch(/\.leaflet-container :focus-visible[\s\S]{0,120}carbon-30/);
  });

  it('names the NASA palette under NASA’s own names for Tailwind consumers', () => {
    for (const key of ['nasa-red', 'nasa-red-shade', 'nasa-blue', 'nasa-blue-shade', 'nasa-orange', 'carbon-20', 'carbon-90']) {
      expect(appCss).toContain(`--color-${key}: var(`);
    }
  });

  it('takes Dataviz values from HDS while keeping HazardNet’s own hazard ramp', () => {
    // The severity ramp is product semantics, not brand: five hazard levels, not NASA's three
    // status colours. It must survive the restyle intact.
    for (const level of ['low', 'moderate', 'high', 'very-high', 'extreme']) {
      expect(appCss).toContain(`--severity-${level}-surface:`);
    }
    // The warm ramp is NASA's, not a local approximation of it.
    expect(appCss).toMatch(/--hn-amber-500: var\(--hds-color-international-orange\)/);
    expect(appCss).toMatch(/--color-amber-500: var\(--hds-color-international-orange\)/);
  });
});
