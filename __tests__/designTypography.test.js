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
const GENERATED_CSS = join(SRC, 'styles/nasa-hds.css');
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

  it('only ever leads tightly inside NASA\'s vendored tokens, never as an applied style', () => {
    const text = stripComments(readFileSync(GENERATED_CSS, 'utf8'));
    const rules = parseRules(text);
    const offenders = [];
    for (const { selector, decls } of rules) {
      for (const [prop, value] of Object.entries(decls)) {
        const leading = toPx(value);
        if (leading === null || leading >= MIN_BODY_LEADING) continue;
        // Every sub-1.3 value in this file must be a --hds-* token declaration, which is
        // NASA's published vocabulary. An applied rule here would mean the file was edited
        // by hand, which scripts/import_nasa_tokens.mjs would overwrite.
        if (!prop.startsWith('--hds-')) {
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
