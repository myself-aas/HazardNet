/**
 * Resolve a Tailwind theme key to the hex it actually paints, in both themes.
 *
 * Why this exists: `check-contrast.mjs` shipped with a hand-written `resolve()`
 * that understood `carbon-NN`, `white` and `black`. Everything else — every
 * `amber-*`, `emerald-*`, `rose-*`, `severity-*`, `ap-*` class in the product —
 * resolved to `null`, and a null is SKIPPED, not failed. So the gate could
 * report "156 components, no contrast defects" while scoring only the subset of
 * pairs written in the neutral ramp. The colour families are exactly where the
 * alert levels, advisories and doc callouts live, which is where the defects
 * were.
 *
 * The fix is to stop hand-maintaining a subset and read the real graph:
 *
 *   index.css  `--color-amber-50: var(--ap-sev-moderate-surface)`
 *   apple.css  `--ap-sev-moderate-surface: #fffbeb`  (light)
 *              `--ap-sev-moderate-surface: #33260a`  (dark)
 *
 * so `bg-amber-50` is #fffbeb light / #33260a dark, and a gate can finally say
 * something true about `text-amber-900 bg-amber-50`.
 *
 * Handles `var()` indirection to any depth, `color-mix(in srgb, A P%, B)`, the
 * `#rgb` / `#rrggbb` / `rgb()` / `rgba()` literal forms, and alpha suffixes
 * (`bg-amber-50/80`) by compositing over a caller-supplied ground.
 */
import { readFileSync } from 'node:fs';

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Parse `--name: value;` pairs out of a chunk of CSS. */
const declarations = (src) => {
  const out = {};
  for (const m of stripComments(src).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) out[m[1]] = m[2].trim();
  return out;
};

/**
 * Walk CSS into `{ selector, atRule, body }` blocks.
 *
 * Flattening every declaration in the file "last wins" is wrong, and wrong in a
 * way that silently poisons the whole table: `.ap-on-dark` is a CONTEXT (a dark
 * tile dropped into a light page), and it legitimately sets
 * `--ap-action: #ffffff`. Read as a global, that makes every `bg-primary` in
 * the product resolve to white and the gate invents defects that are not there.
 * Only the theme roots may contribute.
 */
function blocks(src) {
  const text = stripComments(src);
  const out = [];
  const stack = [];
  let i = 0;
  let start = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = text.slice(start, i).trim().split('\n').pop().trim() || text.slice(start, i).trim();
      stack.push({ prelude: text.slice(start, i).trim(), at: prelude.startsWith('@'), open: i + 1 });
      start = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top) {
        out.push({
          selector: top.prelude,
          atRule: stack.map((s) => s.prelude).filter((p) => p.startsWith('@')).join(' '),
          body: text.slice(top.open, i),
        });
      }
      start = i + 1;
    }
    i += 1;
  }
  return out;
}

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ([r, g, b]) => `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;

/** Literal colour -> [r,g,b] (alpha is reported separately). */
function parseLiteral(value) {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  if (v === 'white') return { rgb: [255, 255, 255], alpha: 1 };
  if (v === 'black') return { rgb: [0, 0, 0], alpha: 1 };
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return { rgb: [...m[1]].map((c) => parseInt(c + c, 16)), alpha: 1 };
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), alpha: 1 };
  m = /^#([0-9a-f]{8})$/.exec(v);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), alpha: parseInt(m[1].slice(6, 8), 16) / 255 };
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const rgb = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
      const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      return { rgb, alpha: Number.isFinite(a) ? a : 1 };
    }
  }
  return null;
}

/** Split the top-level comma arguments of a function body. */
function splitArgs(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function createResolver({ indexCss, appleCss }) {
  const idx = readFileSync(indexCss, 'utf8');
  const ap = readFileSync(appleCss, 'utf8');

  // Only the theme ROOTS define what a token means for the page as a whole.
  // `:root` is light. Dark is declared twice on purpose — once behind
  // prefers-color-scheme for the pre-hydration paint, once on the explicit
  // [data-theme='dark']/.dark opt-in — and both must agree, so either is a
  // valid source for the dark table.
  const isLightRoot = (sel, at) => /(^|,)\s*:root\s*$/.test(sel) && !at;
  const isDarkRoot = (sel, at) =>
    (/:root:not\(\[data-theme='light'\]\)/.test(sel) && /prefers-color-scheme:\s*dark/.test(at)) ||
    /(^|,)\s*(\[data-theme='dark'\]|\.dark)\s*(,|$)/.test(sel);

  const apLight = {};
  const darkOnly = {};
  for (const b of blocks(ap)) {
    if (isLightRoot(b.selector, b.atRule)) Object.assign(apLight, declarations(b.body));
    else if (isDarkRoot(b.selector, b.atRule)) Object.assign(darkOnly, declarations(b.body));
  }
  // Dark is light-with-overrides, not a separate table.
  const apDark = { ...apLight, ...darkOnly };

  // index.css maps Tailwind theme keys onto those tokens. They live in
  // `@theme inline`, which is a root-level declaration block.
  const theme = {};
  for (const [k, v] of Object.entries(declarations(idx))) if (k.startsWith('--color-')) theme[k] = v;

  const tables = { light: { ...apLight, ...theme }, dark: { ...apDark, ...theme } };

  /** Resolve a CSS value to {rgb, alpha} in a given mode. */
  function evaluate(value, mode, depth = 0) {
    if (depth > 12 || value == null) return null;
    const v = value.trim();

    const lit = parseLiteral(v);
    if (lit) return lit;

    const varM = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
    if (varM) {
      const target = tables[mode][varM[1]];
      if (target !== undefined) return evaluate(target, mode, depth + 1);
      if (varM[2]) return evaluate(varM[2], mode, depth + 1); // declared fallback
      return null;
    }

    const mixM = /^color-mix\(\s*in\s+[\w-]+\s*,\s*([\s\S]+)\)$/.exec(v);
    if (mixM) {
      const args = splitArgs(mixM[1]);
      if (args.length !== 2) return null;
      const parse = (arg) => {
        const pm = /^([\s\S]+?)\s+([\d.]+)%$/.exec(arg.trim());
        return pm ? { colour: pm[1], pct: parseFloat(pm[2]) } : { colour: arg.trim(), pct: null };
      };
      const a = parse(args[0]);
      const b = parse(args[1]);
      const ca = evaluate(a.colour, mode, depth + 1);
      const cb = evaluate(b.colour, mode, depth + 1);
      if (!ca || !cb) return null;
      let pa = a.pct;
      let pb = b.pct;
      if (pa === null && pb === null) pa = pb = 50;
      else if (pa === null) pa = 100 - pb;
      else if (pb === null) pb = 100 - pa;
      const total = pa + pb || 100;
      const wa = pa / total;
      const wb = pb / total;
      // premultiplied, which is what color-mix does with transparent endpoints
      const alpha = ca.alpha * wa + cb.alpha * wb;
      const rgb = [0, 1, 2].map((i) =>
        alpha === 0 ? 0 : (ca.rgb[i] * ca.alpha * wa + cb.rgb[i] * cb.alpha * wb) / alpha,
      );
      return { rgb, alpha };
    }

    return null;
  }

  /** Composite a possibly-translucent colour over an opaque ground. */
  const flatten = (c, groundHex) => {
    if (!c) return null;
    if (c.alpha >= 0.999) return toHex(c.rgb);
    const g = parseLiteral(groundHex) ?? { rgb: [255, 255, 255] };
    return toHex([0, 1, 2].map((i) => c.rgb[i] * c.alpha + g.rgb[i] * (1 - c.alpha)));
  };

  /**
   * Resolve a bare Tailwind colour token (`amber-50`, `carbon-90`, `white`,
   * `ap-label`, `severity-high`) plus an optional `/NN` alpha.
   */
  function token(name, mode, ground = mode === 'dark' ? '#252527' : '#ffffff') {
    const m = /^([a-z0-9-]+?)(?:\/(\d+))?$/.exec(name);
    if (!m) return null;
    const [, base, alphaStr] = m;

    let c = null;
    const themed = tables[mode][`--color-${base}`];
    if (themed !== undefined) c = evaluate(themed, mode);
    if (!c) c = parseLiteral(base);
    if (!c) return null;

    if (alphaStr !== undefined) c = { rgb: c.rgb, alpha: c.alpha * (Number(alphaStr) / 100) };
    return flatten(c, ground);
  }

  return { token, evaluate, flatten, tables, theme };
}

export const relLum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};
