/**
 * Token graph resolver — restored 2026-10-25 (deleted in the history squash while
 * `frontend/src/styles/__tests__/tokenInversion.test.ts` still required it, and
 * `scripts/lib/class-resolver.mjs` builds on it).
 *
 * What it models: the design system's colour tokens live in TWO stylesheets —
 *
 *   - `frontend/src/index.css`    Tailwind v4 `@theme` / `@theme inline` bridge:
 *                                 `--color-carbon-40: var(--ap-n-40)`,
 *                                 `--color-blue-50: color-mix(in srgb, var(--ap-link) 6%, var(--ap-bg-canvas))`, …
 *   - `frontend/src/styles/apple.css`  the Apple primitives (`--ap-*`), declared in `:root`
 *                                 and INVERTED under three dark contexts:
 *                                 `@media (prefers-color-scheme: dark)` +
 *                                 `[data-theme='dark']` + `.dark`.
 *
 * So a token's value depends on the mode. `createResolver({ indexCss, appleCss })` parses
 * both stylesheets into light/dark declaration maps and resolves `--color-*` → `var()` →
 * `var()` → hex, including `color-mix()` tints. `token(name, mode)` therefore answers the
 * question the inverting-ramp tests ask: "what colour does this utility actually paint in
 * light, and in dark?"
 *
 * This module scores COLOUR ONLY. It knows nothing about utilities; that layer is
 * `scripts/lib/class-resolver.mjs`.
 */

import { readFileSync } from 'node:fs';

/* ───────────────────────────── colour math ───────────────────────────── */

const NAMED = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

/** Parse a CSS <color> into [r, g, b, a] with sRGB channels 0-255. Returns null when the
 *  string is not a colour we can stand behind. */
export function parseColor(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim().toLowerCase();
  if (NAMED[s]) return [...NAMED[s]];

  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)).concat(h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1);
    }
    if (h.length === 6 || h.length === 8) {
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    }
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    return [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]),
    ];
  }
  m = s.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    // OKLCH -> linear sRGB (standard Björn Ottosson matrices).
    const [, L, C, H] = m.map(Number);
    const h = (H * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const mm = m_ ** 3;
    const ss = s_ ** 3;
    const toSrgb = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return [
      toSrgb(+4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss),
      toSrgb(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss),
      toSrgb(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss),
      m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]),
    ];
  }
  return null;
}

/** Relative luminance (WCAG 2.x) of an sRGB channel triple. */
export function relLum(color) {
  const c = Array.isArray(color) ? color : parseColor(color);
  if (!c) return null;
  const lin = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio between two colours. */
export function contrast(a, b) {
  const [la, lb] = [relLum(a), relLum(b)];
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, A p%, B)` — the only colour function the token files use. */
export function mixSrgb(a, b, weightA) {
  const w = weightA ?? 50;
  return [
    Math.round(a[0] * (w / 100) + b[0] * (1 - w / 100)),
    Math.round(a[1] * (w / 100) + b[1] * (1 - w / 100)),
    Math.round(a[2] * (w / 100) + b[2] * (1 - w / 100)),
    a[3] * (w / 100) + b[3] * (1 - w / 100),
  ];
}

/* ───────────────────────────── CSS parsing ───────────────────────────── */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Split a stylesheet into (selectorList, declarationsText) blocks, recording whether the
 * block sits inside `@media (prefers-color-scheme: dark)`. @theme / @theme inline bodies are
 * flattened into a synthetic `:root` context — that is what Tailwind emits them as.
 */
function blocks(css) {
  const out = [];
  let darkMediaDepth = 0;
  const walk = (text) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) return;
      let head = text.slice(i, open).trim();
      // Find the matching close brace.
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@(media|supports)/.test(head)) {
        const wasDark = head.includes('prefers-color-scheme: dark');
        if (wasDark) darkMediaDepth += 1;
        walk(body);
        if (wasDark) darkMediaDepth -= 1;
      } else if (/^@theme/.test(head)) {
        const layers = [];
        collectDeclarations(body, layers);
        for (const item of layers) out.push({ selectors: ':root', ...item, darkMedia: false });
      } else if (/^@/.test(head)) {
        walk(body); // @layer etc.: declarations keep their enclosing selector
      } else if (head.includes(';') || /:root|\.dark|data-theme|^[.,[\]:*a-z]/i.test(head)) {
        // A selector block; `head` may carry trailing declarations from the previous
        // sibling (e.g. `a { … } b {`), so keep only the last selector-ish segment.
        const sel = head.split(';').pop().trim();
        const layers = [];
        collectDeclarations(body, layers);
        for (const item of layers) out.push({ selectors: sel, ...item, darkMedia: darkMediaDepth > 0 });
      }
      i = j;
      // Skip the remainder of the previous declaration text after `}` before the next sel.
      while (i < text.length && /[\s;]/.test(text[i])) i += 1;
    }
  };
  walk(css);
  return out;
}

/** Parse a declaration body of CSS custom properties: --name: value; … */
function collectDeclarations(body, acc) {
  // Split on ';' but not inside parentheses (values may contain color-mix(…)).
  let current = '';
  let depth = 0;
  const parts = [];
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  const decls = {};
  for (const part of parts) {
    const match = part.match(/^\s*(--[A-Za-z0-9-]+)\s*:\s*([\s\S]*?)\s*(?:!important\s*)?$/);
    if (match) decls[match[1]] = match[2];
  }
  if (Object.keys(decls).length) acc.push({ decls });
}

const DARK_SELECTOR = /\[data-theme=['"]dark['"]\]|(^|[^\w])\.dark([^\w]|$)|:root:not\(\[data-theme=['"]light['"]\]\)/;

/** Fold parsed blocks into { light, dark } custom-property maps (dark overlays light). */
function declarationMaps(cssText) {
  const light = {};
  const dark = {};
  for (const block of blocks(stripComments(cssText))) {
    const sels = block.selectors.split(',').map((s) => s.trim());
    // Root-anchored custom-property blocks: `:root`, `html`, plus their pseudo-classed
    // dark variants (`:root:not([data-theme='light'])`, `html.dark`, …).
    const isRootish = (s) => /^(:root|html)(?=$|[:[])/.test(s);
    if (!sels.some(isRootish)) continue;
    const darkSel = sels.some((s) => DARK_SELECTOR.test(s)) || (block.darkMedia && sels.some((s) => s.includes(':not(')));
    for (const [k, v] of Object.entries(block.decls)) {
      (darkSel ? dark : light)[k] = v;
    }
  }
  return { light, dark };
}

/* ───────────────────────────── the resolver ───────────────────────────── */

export function createResolver({ indexCss, appleCss }) {
  const indexText = readFileSync(indexCss, 'utf8');
  const appleText = readFileSync(appleCss, 'utf8');

  // Variable maps: apple.css primitives first, then index.css — the bridge tokens
  // (`--color-*` are utility-facing and live in theme; index.css may also set `--ap-*`).
  const a = declarationMaps(appleText);
  const x = declarationMaps(indexText);
  const vars = {
    light: { ...a.light, ...x.light },
    dark: { ...a.light, ...a.dark, ...x.light, ...x.dark },
  };

  /** theme: every `--color-*` declaration in light/raw form (utility-facing names). */
  const theme = {};
  for (const map of [a.light, x.light]) {
    for (const [k, v] of Object.entries(map)) if (k.startsWith('--color-')) theme[k] = v;
  }

  /** Resolve a raw value string to [r,g,b,a] under one mode's variable map. */
  function evaluate(rawValue, mode, seen = new Set()) {
    if (rawValue == null) return null;
    let value = String(rawValue).trim();

    const mix = value.match(/^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]*)\)$/);
    if (mix) {
      // Split the operand list on top-level commas.
      const inner = mix[1];
      const parts = [];
      let depth = 0;
      let current = '';
      for (const ch of inner) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
        } else current += ch;
      }
      parts.push(current.trim());
      if (parts.length !== 2) return null;
      let [left, right] = parts;
      let weightLeft;
      const wm = left.match(/^([\s\S]*?)\s+([\d.]+)%$/);
      if (wm) {
        left = wm[1];
        weightLeft = Number(wm[2]);
      }
      const a = evaluate(left, mode, seen);
      const b = evaluate(right, mode, seen);
      if (!a || !b) return null;
      return mixSrgb(a, b, weightLeft);
    }

    const vr = value.match(/^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,([\s\S]*))?\)$/);
    if (vr) {
      const [, name, fallback] = vr;
      if (seen.has(name)) return null; // a variable cycle is a defect, not a colour
      seen.add(name);
      const next = vars[mode][name];
      if (next !== undefined) return evaluate(next, mode, seen);
      if (fallback !== undefined) return evaluate(fallback.trim(), mode, seen);
      return null;
    }

    return parseColor(value);
  }

  /**
   * token(name, mode) → '#rrggbb' or null. Looks up, in order: the utility-facing
   * `--color-<name>`, then the primitive names `--ap-<name>` / `--<name>`, then the two
   * CSS colour literals. Tokens with no colour (font stacks, radii, …) answer null.
   */
  function token(name, mode) {
    const candidates = [`--color-${name}` in theme ? theme[`--color-${name}`] : undefined, vars[mode][`--ap-${name}`], vars[mode][`--${name}`]];
    for (const raw of candidates) {
      if (raw === undefined) continue;
      const c = evaluate(raw, mode);
      if (c) return toHex(c);
    }
    // Tailwind's two built-ins, never part of the `--color-*` bridge and — deliberately —
    // never flipped (the `.bg-white` UTILITY is overridden for dark in apple.css; the
    // *colour* white is not. tokenInversion.test.ts asserts literal foregrounds on
    // inverting grounds actually break in dark).
    if (name === 'white') return '#ffffff';
    if (name === 'black') return '#000000';
    return null;
  }

  return { theme, vars, evaluate, token };
}

/** [r,g,b,a] → '#rrggbb' (alpha compositing happens at the utility layer). */
export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
