/**
 * Contrast gate for the prerendered static shell.
 *
 * Why this exists: the vendored impeccable detector resolves colours without cascading
 * `@media (prefers-color-scheme)`, so on a built page it pairs light-scheme text with
 * dark-scheme backgrounds and reports a failure on every document. That pairing is
 * suppressed for `frontend/dist/**\/*.html` in .impeccable/config.json, and this file is
 * the check that covers the same risk properly: it reads the generated shell CSS out of
 * frontend/scripts/prerender.mjs, resolves each scheme on its own terms, and computes
 * WCAG 2.1 contrast ratios.
 *
 * It also covers the case the detector cannot see at all: a colour that is declared once
 * in light mode and left alone in dark mode, which is how the shell shipped a callout
 * whose dark background (#2e2e32) met light-mode slate text at 1.1:1.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRERENDER = join(ROOT, 'frontend/scripts/prerender.mjs');

/** Pull the STATIC_STYLES template literal out of the prerender script. */
function staticStyles() {
  const src = readFileSync(PRERENDER, 'utf8');
  const start = src.indexOf('const STATIC_STYLES = `<style>');
  if (start < 0) throw new Error('STATIC_STYLES not found in frontend/scripts/prerender.mjs');
  const end = src.indexOf('</style>`;', start);
  if (end < 0) throw new Error('STATIC_STYLES is not terminated in frontend/scripts/prerender.mjs');
  const cssStart = src.indexOf('<style>', start) + '<style>'.length;
  return src.slice(cssStart, end);
}

const css = staticStyles();

/** Drop CSS comments: a comment block has no braces, so the rule parser would read it
 *  as a very long selector. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split the shell CSS into light-mode rules and dark-mode rules. */
function splitSchemes(text) {
  const darkStart = text.indexOf('@media (prefers-color-scheme:dark)');
  const light = darkStart < 0 ? text : text.slice(0, darkStart);
  const dark = darkStart < 0 ? '' : text.slice(darkStart);
  return { light, dark };
}

/** Parse `selector { decls }` pairs, ignoring at-rule wrappers. */
function parseRules(text) {
  const rules = [];
  // Drop the @media wrapper itself but keep its body.
  const body = text.replace(/@media[^{]*\{/, '').replace(/\}\s*$/, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const selectors = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const decls = {};
    for (const decl of m[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      decls[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
    }
    for (const selector of selectors) rules.push({ selector, decls });
  }
  return rules;
}

const { light, dark } = splitSchemes(stripComments(css));
const lightRules = parseRules(light);
const darkRules = parseRules(dark);

function hex(value) {
  if (!value) return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fg, bg) {
  const a = luminance(hex(fg));
  const b = luminance(hex(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Resolve a scheme: later rules win, so dark-mode declarations override light-mode ones
 * for the same selector. Returns Map<selector, {color, background, fontSize, fontWeight}>.
 */
function resolveScheme(base, override, pageBackground) {
  const map = new Map();
  const put = (rules) => {
    for (const { selector, decls } of rules) {
      const cur = map.get(selector) || {};
      map.set(selector, { ...cur, ...decls });
    }
  };
  put(base);
  put(override);
  map.set('__page__', { background: pageBackground });
  return map;
}

/** Nearest ancestor selector that declares a background, walking up the selector path. */
function effectiveBackground(scheme, selector) {
  const parts = selector.trim().split(/\s+/);
  for (let i = parts.length; i > 0; i -= 1) {
    const candidate = parts.slice(0, i).join(' ');
    const decls = scheme.get(candidate);
    if (decls && decls.background) return decls.background;
  }
  // `body` carries the page background in both schemes.
  const body = scheme.get('body');
  if (body && body.background) return body.background;
  return scheme.get('__page__').background;
}

function inheritedFontSize(scheme, selector) {
  const parts = selector.trim().split(/\s+/);
  for (let i = parts.length; i > 0; i -= 1) {
    const decls = scheme.get(parts.slice(0, i).join(' '));
    if (decls && decls['font-size']) return parseFloat(decls['font-size']);
  }
  return 16;
}

function inheritedFontWeight(scheme, selector) {
  const parts = selector.trim().split(/\s+/);
  for (let i = parts.length; i > 0; i -= 1) {
    const decls = scheme.get(parts.slice(0, i).join(' '));
    if (decls && decls['font-weight']) return parseInt(decls['font-weight'], 10);
  }
  return 400;
}

/** Text that is never visible: the screen-reader-only utility. */
const IGNORED_SELECTORS = ['.hn-static .hn-sr'];

function checkScheme(name, scheme) {
  const failures = [];
  for (const [selector, decls] of scheme) {
    if (selector === '__page__' || IGNORED_SELECTORS.includes(selector)) continue;
    if (!decls.color) continue;
    if (!hex(decls.color)) continue; // a keyword or variable this test does not resolve
    const bg = effectiveBackground(scheme, selector);
    if (!hex(bg)) continue;
    const size = inheritedFontSize(scheme, selector);
    const weight = inheritedFontWeight(scheme, selector);
    // WCAG large text: >= 24px, or >= 18.66px when bold.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;
    const actual = ratio(decls.color, bg);
    if (actual < required) {
      failures.push(
        `${name}: ${selector} — ${decls.color} on ${bg} is ${actual.toFixed(2)}:1, needs ${required}:1`,
      );
    }
  }
  return failures;
}

const lightScheme = resolveScheme(lightRules, [], '#ffffff');
const darkScheme = resolveScheme(lightRules, darkRules, '#17171b');

describe('prerendered static shell contrast', () => {
  it('reads a shell stylesheet that declares both colour schemes', () => {
    expect(lightRules.length).toBeGreaterThan(10);
    expect(darkRules.length).toBeGreaterThan(5);
    // The dark scheme must restate the page background, or a static reader (and a
    // visitor on a partial render) has nothing to pair the dark text colours against.
    expect(darkRules.some((r) => r.selector === 'body' && r.decls.background)).toBe(true);
    expect(darkRules.some((r) => r.selector === '.hn-static' && r.decls.background)).toBe(true);
  });

  it('meets WCAG 2.1 AA in the light scheme', () => {
    expect(checkScheme('light', lightScheme)).toEqual([]);
  });

  it('meets WCAG 2.1 AA in the dark scheme', () => {
    expect(checkScheme('dark', darkScheme)).toEqual([]);
  });

  it('gives every dark-mode surface its own text colour rather than inheriting light-mode slate', () => {
    // Any selector that declares a dark background must also declare a dark-scheme text
    // colour, otherwise it inherits a light-mode colour and becomes unreadable. This is
    // the regression that shipped the callout at 1.1:1.
    const offenders = [];
    for (const { selector, decls } of darkRules) {
      if (!decls.background || selector === 'body') continue;
      const inherited = lightRules.find((r) => r.selector === selector)?.decls?.color;
      if (!decls.color && inherited && hex(inherited)) {
        const value = ratio(inherited, decls.background);
        if (value < 4.5) offenders.push(`${selector}: keeps light-mode ${inherited} on ${decls.background} (${value.toFixed(2)}:1)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the shell on NASA HDS neutrals instead of a second grey ramp', () => {
    // HDS carbon ramp + brand colours, vendored in frontend/src/styles/nasa-hds.css.
    const hds = readFileSync(join(ROOT, 'frontend/src/styles/nasa-hds.css'), 'utf8');
    // Every colour NASA publishes, not just the brand ramp: the carbon neutrals and the
    // sequential dataviz ramps are all HDS tokens, and the shell's caution surfaces come
    // from the orange ramp.
    const hdsColours = new Set(
      [...hds.matchAll(/--hds-[a-z0-9-]+:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase()),
    );
    const used = new Set(
      [...css.matchAll(/(?:color|background|border[^:]*|border-(?:top|bottom|left|right)-color):\s*(#[0-9a-f]{6})/gi)].map(
        (m) => m[1].toLowerCase(),
      ),
    );
    const offSystem = [...used].filter((c) => !hdsColours.has(c));
    expect(offSystem).toEqual([]);
  });
});
