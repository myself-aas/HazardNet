/**
 * The neutral ramp is NASA's carbon ramp, and it stays that way.
 *
 * Tailwind ships five grey families and this UI had grown into four of them: 4,030 utility
 * classes and 252 hard-coded literals (inline styles, SVG fills, canvas and map layer
 * colours, jsPDF text colours, the PWA manifest). They were consolidated on 2026-09-19 —
 * values first, through `@theme inline`, then names, because impeccable's `gray-on-color`
 * rule reads class names rather than resolved values and reported 233 findings against
 * `slate` that no alias could clear. The measurement behind the mapping, including the two
 * steps that moved further than the ramp, is in docs/design-system/MASTER.md §Neutral ramp.
 *
 * What this file pins: that the migration cannot silently regress. A single new
 * `text-slate-500` is not a styling choice, it is 4.46:1 muted text on a page whose design
 * authority has one neutral ramp in it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const INDEX_CSS = join(SRC, 'index.css');
const DIST_CSS_DIR = join(ROOT, 'frontend/dist/assets');

const UTILITIES =
  '(?:bg|text|border(?:-[tblrsexy])?|ring|divide|from|via|to|fill|stroke|decoration|outline|shadow|accent|caret|placeholder)';
const GREY_FAMILIES = '(?:slate|gray|zinc|neutral|stone)';
const STEPS = '(?:50|100|200|300|400|500|600|700|800|900|950)';

const GREY_CLASS = new RegExp(`${UTILITIES}-${GREY_FAMILIES}-${STEPS}\\b`);
/** Tailwind's slate ramp, in both the forms it reaches the browser in. */
const GREY_HEX = /#(?:f8fafc|f1f5f9|e2e8f0|cbd5e1|94a3b8|64748b|475569|334155|1e293b|0f172a|020617)\b/i;
const GREY_RGB = /\(\s*(?:248, 250, 252|241, 245, 249|226, 232, 240|203, 213, 225|148, 163, 184|100, 116, 139|71, 85, 105|51, 65, 85|30, 41, 59|15, 23, 42|2, 6, 23)\s*\)/;

/** Carbon's own values, which a literal is allowed to be. */
const CARBON_HEX = /#(?:f6f6f6|e3e3e3|d1d1d1|b9b9bb|959599|77777a|58585b|444447|2e2e32|17171b|000000)\b/i;

function walk(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...walk(full, predicate));
    } else if (predicate(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments may explain the migration; they may not be where a class hides. */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('the neutral ramp is carbon', () => {
  it('no component wears a Tailwind grey', () => {
    const files = walk(SRC, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(files.length).toBeGreaterThan(50);
    const offenders = [];
    for (const file of files) {
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          const match = line.match(GREY_CLASS);
          if (match) offenders.push(`${relative(ROOT, file)}:${index + 1} ${match[0]}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('no literal in the app is a Tailwind grey', () => {
    // Inline styles, SVG fills, canvas and map layer colours, jsPDF text colours: none of
    // these go through Tailwind, so none of them are reached by an alias in @theme.
    const files = [
      ...walk(SRC, (name) => /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)),
      join(ROOT, 'frontend/index.html'),
      join(ROOT, 'frontend/public/manifest.json'),
    ];
    const offenders = [];
    for (const file of files) {
      if (!existsSync(file)) continue;
      const isCss = file.endsWith('index.css');
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          // The neutral alias block in index.css is the one place these names are allowed,
          // and the next test pins what it may point at.
          if (isCss && /^\s*--color-(?:slate|gray|zinc|neutral|stone)-/.test(line)) return;
          const hex = line.match(GREY_HEX);
          const rgb = line.match(GREY_RGB);
          const cls = isCss ? null : line.match(GREY_CLASS);
          if (hex || rgb || cls) {
            offenders.push(`${relative(ROOT, file)}:${index + 1} ${hex?.[0] ?? rgb?.[0] ?? cls?.[0]}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('the legacy alias still points at NASA, if anything reaches for it', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    const aliases = [...css.matchAll(/^\s*(--color-(?:slate|gray|zinc|neutral|stone)-\d{2,3}):\s*([^;]+);/gm)];
    expect(aliases.length).toBeGreaterThanOrEqual(55);
    for (const [, key, value] of aliases) {
      expect(value).toMatch(/^var\(--hds-color-carbon-(?:05|10|20|30|40|50|60|70|80|90|black)\)$/);
      expect(key).not.toMatch(/--color-carbon/);
    }
  });

  it('every carbon step a component names is a step NASA publishes', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    const defined = new Set(
      [...css.matchAll(/--color-carbon-([a-z0-9]+):/g)].map((match) => match[1]),
    );
    expect([...defined].sort()).toEqual(
      ['05', '10', '20', '30', '40', '50', '60', '70', '80', '90', 'black'].sort(),
    );
    const used = new Set();
    for (const file of walk(SRC, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))) {
      for (const match of withoutComments(readFileSync(file, 'utf8')).matchAll(
        new RegExp(`${UTILITIES}-carbon-([a-z0-9]+)`, 'g'),
      )) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter((step) => !defined.has(step))).toEqual([]);
  });

  it('the shipped stylesheet resolves carbon to NASA’s token', () => {
    if (!existsSync(DIST_CSS_DIR)) {
      console.warn('[paletteTokens] frontend/dist is not built; skipping the bundle check.');
      return;
    }
    const bundles = readdirSync(DIST_CSS_DIR).filter((name) => name.endsWith('.css'));
    expect(bundles.length).toBeGreaterThan(0);
    const css = bundles.map((name) => readFileSync(join(DIST_CSS_DIR, name), 'utf8')).join('\n');
    expect(css).toMatch(/\.text-carbon-60[^{]*\{color:var\(--hds-color-carbon-60\)\}/);
    expect(css).toMatch(/\.bg-carbon-05[^{]*\{background-color:var\(--hds-color-carbon-05\)\}/);
    // A carbon literal in the bundle is NASA's value, not Tailwind's.
    expect(CARBON_HEX.test(css)).toBe(true);
    expect(css).not.toMatch(GREY_HEX);
  });
});
