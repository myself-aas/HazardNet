/**
 * Leading gate for type we author.
 *
 * Why this exists: impeccable's `tight-leading` rule is waived on built pages
 * (docs/design/impeccable-baseline.json) because NASA's own composite display tokens
 * declare 100% leading — `--hds-typography-h1-2xl: 700 7.5rem/1` — which the detector
 * reads as 0.13x. The waiver is only safe if something still enforces leading where it
 * matters, which is body-scale type. This file is that something.
 *
 * The typographic rule it encodes is the one NASA's scale itself follows: display and
 * number styles (24px and up) may sit at 1.0–1.15, everything a person reads in
 * paragraphs stays at 1.3 or above.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const AUTHORED_CSS = [join(SRC, 'index.css')];
/** The single token stylesheet. Was styles/nasa-hds.css before the Apple migration. */
const GENERATED_CSS = join(SRC, 'styles/apple.css');
const PRERENDER = join(ROOT, 'frontend/scripts/prerender.mjs');

const PX_PER_REM = 16;
/**
 * At or above this, type is display/number scale and may lead tightly. Below it, bold
 * type joins the exemption at WCAG's own large-text threshold (18.66px at 700+), which is
 * where a wordmark or a metric sits: one line, heavy, and unreadable if it ever wrapped.
 */
const DISPLAY_PX = 24;
const LARGE_BOLD_PX = 18.66;
const MIN_BODY_LEADING = 1.3;

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Flatten at-rule wrappers so their bodies are parsed as ordinary rules. */
function flattenAtRules(text) {
  return text.replace(/@(?:media|supports|layer)[^{]*\{/g, '').replace(/\}\s*$/g, '');
}

function parseRules(text) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const selectors = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@'));
    const decls = {};
    for (const decl of m[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      decls[decl.slice(0, idx).trim().toLowerCase()] = decl.slice(idx + 1).trim();
    }
    for (const selector of selectors) rules.push({ selector, decls });
  }
  return rules;
}

function toPx(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  let m = /^([\d.]+)px$/.exec(v);
  if (m) return parseFloat(m[1]);
  m = /^([\d.]+)rem$/.exec(v);
  if (m) return parseFloat(m[1]) * PX_PER_REM;
  m = /^([\d.]+)em$/.exec(v);
  if (m) return parseFloat(m[1]) * PX_PER_REM;
  m = /^([\d.]+)%$/.exec(v);
  if (m) return parseFloat(m[1]) / 100; // percentage leading is a multiplier
  m = /^([\d.]+)$/.exec(v);
  if (m) return parseFloat(m[1]); // unitless: a multiplier
  return null; // normal, var(), calc(), keywords — not resolvable here
}

/**
 * Leading multiplier for a rule. Unitless and percentage values are already multipliers;
 * absolute values are divided by the rule's own font size.
 */
function leadingOf(decls) {
  const raw = decls['line-height'];
  if (!raw) return null;
  const value = toPx(raw);
  if (value === null) return null;
  const unitless = /^[\d.]+$/.test(raw.trim()) || /%$/.test(raw.trim());
  if (unitless) return value;
  const size = toPx(decls['font-size']);
  if (!size) return null;
  return value / size;
}

function staticShellCss() {
  const src = readFileSync(PRERENDER, 'utf8');
  const start = src.indexOf('const STATIC_STYLES = `<style>');
  const end = src.indexOf('</style>`;', start);
  if (start < 0 || end < 0) throw new Error('STATIC_STYLES not found in prerender.mjs');
  const cssStart = src.indexOf('<style>', start) + '<style>'.length;
  return src.slice(cssStart, end);
}

describe('leading on type we author', () => {
  it.each([
    ['frontend/src/index.css', readFileSync(AUTHORED_CSS[0], 'utf8')],
    ['the prerendered static shell', staticShellCss()],
  ])('%s keeps body-scale leading at or above 1.3', (_label, text) => {
    const rules = parseRules(flattenAtRules(stripComments(text)));
    const offenders = [];
    for (const { selector, decls } of rules) {
      const leading = leadingOf(decls);
      if (leading === null) continue;
      const size = toPx(decls['font-size']) ?? PX_PER_REM;
      const weight = parseInt(decls['font-weight'] ?? '400', 10) || 400;
      // Display and number scale may lead tightly; so may large bold type (WCAG's own
      // large-text threshold), which is a single line by definition.
      if (size >= DISPLAY_PX || (size >= LARGE_BOLD_PX && weight >= 700)) continue;
      if (leading < MIN_BODY_LEADING) {
        offenders.push(`${selector} — font-size ${size}px at line-height ${leading.toFixed(2)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only ever leads tightly inside the Apple token declarations, never as an applied style', () => {
    const text = stripComments(readFileSync(GENERATED_CSS, 'utf8'));
    const rules = parseRules(text);
    const offenders = [];
    for (const { selector, decls } of rules) {
      for (const [prop, value] of Object.entries(decls)) {
        // Only leading is in scope. apple.css is no longer a token-only file — it also
        // carries the component layer — so a bare `border: 0` or `opacity: 0.4` must not
        // be read as a line-height of 0.
        const isLeading = prop === 'line-height' || /^--ap-leading-/.test(prop) || /^--[a-z-]*leading/.test(prop);
        if (!isLeading) continue;
        const leading = toPx(value);
        if (leading === null || leading >= MIN_BODY_LEADING) continue;
        // Every sub-1.3 value in this file must be an --ap-* token declaration, i.e. one of
        // the 16 named Apple styles transcribed from DESIGN.md. Several of them legitimately
        // lead tight (hero is 1.07, display-lg 1.1, button-large 1.0) because they are
        // single-line display type. An APPLIED rule leading that tightly would be a real
        // defect — it would squash a paragraph — so the token/applied distinction is the test.
        if (!prop.startsWith('--ap-')) {
          offenders.push(`${selector} { ${prop}: ${value} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps point sizes inside print and paper-emulation scopes', () => {
    // impeccable's `oversized-h1` rule is waived on built pages because the detector
    // converts the print stylesheet's `h1 { font-size: 18pt }` as though `pt` were `rem`
    // and reports a 288px heading. The waiver only holds if point sizes never leak into
    // ordinary screen rules, so that is what this asserts. Points are legitimate in
    // `@media print` and in the scopes that render paper on screen for the PDF export and
    // the print preview (.pdf-capture-mode, .print-preview-rendered-body, .print-*).
    const text = readFileSync(AUTHORED_CSS[0], 'utf8');
    const stripped = stripComments(text);
    const offenders = [];
    // Walk the file tracking brace depth, remembering every depth at which an
    // `@media print` block opened, so a declaration is only "screen" when no print
    // block is currently open.
    let depth = 0;
    const printDepths = [];
    let pending = '';
    let selector = '';
    for (const token of stripped.split(/([{}])/)) {
      if (token === '{') {
        depth += 1;
        if (/@media\s+print/.test(pending)) printDepths.push(depth);
        selector = pending.trim();
        pending = '';
      } else if (token === '}') {
        depth -= 1;
        while (printDepths.length && printDepths[printDepths.length - 1] > depth) printDepths.pop();
        selector = '';
        pending = '';
      } else {
        // Declarations belong to the rule that `selector` opened.
        if (printDepths.length === 0 && /font-size:\s*[\d.]+pt/.test(token)) {
          const paperScope = /pdf-capture-mode|print-preview-rendered-body|\.print-/;
          if (!paperScope.test(selector)) {
            offenders.push(`${selector.slice(-60)} { ${token.trim().slice(0, 60)}`);
          }
        }
        pending = token;
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never sets a screen h1 larger than NASA\'s own h1 ceiling', () => {
    // --hds-font-size-2xl (3rem / 48px) is NASA's h1; 7.5rem is reserved for display and
    // number styles. A screen h1 above 48px would be the real version of the finding the
    // detector reports in print points.
    const text = stripComments(readFileSync(AUTHORED_CSS[0], 'utf8'));
    const rules = parseRules(flattenAtRules(text)).filter((r) => /(^|[\s,])h1([\s,{:]|$)/.test(r.selector));
    expect(rules.length).toBeGreaterThan(0);
    const oversized = [];
    for (const { selector, decls } of rules) {
      const size = toPx(decls['font-size']);
      if (size === null) continue;
      if (/print/i.test(selector)) continue;
      if (size > 48) oversized.push(`${selector} — ${decls['font-size']} (${size}px)`);
    }
    expect(oversized).toEqual([]);
  });

  it('does not put tight Tailwind leading on elements that wrap', () => {
    // `leading-none` on a single-line metric is correct; on a paragraph it is not.
    const tight = /leading-(?:none|tight|\[0?\.?\d+\]|\[1\])/;
    const wrappingTags = ['p', 'li', 'dd', 'blockquote', 'figcaption', 'td', 'th', 'label'];
    // Display scale (24px and up) and anything that cannot wrap are exempt: tight leading
    // is wrong on body copy, not on a headline or a single-line metric.
    const displayScale = /\btext-(?:[2-9]xl)\b|\btext-\[(?:2[4-9]|[3-9]\d|\d{3,})px\]/;
    const singleLine = /\btruncate\b|\bwhitespace-nowrap\b|\bline-clamp-1\b/;
    const offenders = [];

    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.tsx')) {
          const text = readFileSync(full, 'utf8');
          const re = /<(\w+)([^>]*?)>/gs;
          let m;
          while ((m = re.exec(text)) !== null) {
            const [, tag, attrs] = m;
            if (!wrappingTags.includes(tag)) continue;
            if (!tight.test(attrs)) continue;
            if (displayScale.test(attrs) || singleLine.test(attrs)) continue;
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(`${relative(ROOT, full)}:${line} <${tag}> with ${attrs.match(tight)[0]}`);
          }
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});

/**
 * The legibility floor (backlog item 12 of the 2026-10-03 design-system audit).
 *
 * 293 utilities and 68 inline styles shipped between 9px and 11px: uppercase meta labels, popup
 * captions, badge text and chart annotations. Below 12px, the browser's own minimum-font-size
 * settings start overriding the design, and a phone at arm's length in daylight - the actual
 * reading condition for a hazard advisory - loses the text entirely. 12px is the floor this
 * system chose (it is also where iOS Dynamic Type's smallest supported step lands after scaling).
 *
 * The check is deliberately blunt: no authored type below the floor, anywhere, in any form -
 * Tailwind arbitrary values, inline style objects, or CSS declarations. Print stylesheets are out
 * of scope (they are measured in points and printed on paper).
 */
describe('typography floor', () => {
  // Cupertino Precision's caption role is 11px (DESIGN.md §Typography), so the floor is 11.
  const TYPE_FLOOR_PX = 11;
  const EXCLUDED_DIRS = new Set(['__tests__', 'node_modules']);

  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir)) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.(tsx?|css)$/.test(full)) out.push(full);
    }
    return out;
  };

  const stripPrintBlocks = (css) => css.replace(/@media\s+print\s*\{[\s\S]*?\n\}/g, '');

  test('no arbitrary Tailwind type below the floor', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (!/\.tsx?$/.test(file)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      // `svg-user-units:` marks a size measured in an SVG viewBox rather than in screen pixels.
      // The marker states the conversion and protects the element it documents (the className
      // sits on the declaration's last line, so the marker covers a small block).
      let documentedUntil = -1;
      for (const [index, line] of lines.entries()) {
        if (line.includes('svg-user-units:')) documentedUntil = index + 4;
        if (index <= documentedUntil) continue;
        for (const match of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
          if (Number(match[1]) < TYPE_FLOOR_PX) {
            offenders.push(`${relative(ROOT, file)}:${index + 1}: text-[${match[1]}px]`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no inline fontSize below the floor, in any of its forms', () => {
    const offenders = [];
    const forms = [
      /fontSize:\s*['"]?(\d+(?:\.\d+)?)/g, // fontSize: 11 / '11px'
      /fontSize=\{(\d+(?:\.\d+)?)\}/g, // JSX: <XAxis fontSize={11} />
      /font-size:\s*(\d+(?:\.\d+)?)px/g, // popup HTML built as a string
    ];
    for (const file of walk(SRC)) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const form of forms) {
        for (const match of source.matchAll(form)) {
          if (Number(match[1]) < TYPE_FLOOR_PX) {
            offenders.push(`${relative(ROOT, file)}: ${match[0].trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no CSS declaration below the floor, outside print styles', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (!file.endsWith('.css')) continue;
      if (file === GENERATED_CSS) continue; // NASA's compiled values are upstream's
      const css = stripPrintBlocks(readFileSync(file, 'utf8'));
      for (const match of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        if (Number(match[1]) < TYPE_FLOOR_PX) offenders.push(`${relative(ROOT, file)}: font-size ${match[1]}px`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the native type scale and the tab bar respect the same floor', () => {
    const nativeTokens = readFileSync(join(ROOT, 'apps/mobile/src/theme/nativeTokens.ts'), 'utf8');
    for (const match of nativeTokens.matchAll(/size:\s*(\d+(?:\.\d+)?)/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(TYPE_FLOOR_PX);
    }
    const navigator = readFileSync(join(ROOT, 'apps/mobile/src/navigation/RootNavigator.tsx'), 'utf8');
    for (const match of navigator.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(TYPE_FLOOR_PX);
    }
  });
});
