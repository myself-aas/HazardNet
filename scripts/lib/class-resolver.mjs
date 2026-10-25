/**
 * Class → colour resolver — restored 2026-10-25 (deleted in the history squash while
 * `scripts/check-contrast.mjs` and `scripts/check-contrast-tree.mjs` still imported it;
 * both are in the `check:device` chain).
 *
 * This is the layer that turns a Tailwind utility into the hex it actually paints, in one
 * mode. It deliberately knows THREE things, because the real defects lived in the gaps
 * between them:
 *
 *   1. The token graph (via `./token-resolver.mjs`): `--color-*` → `var(--ap-*)` → hex,
 *      with the Apple ramp inverting between light and dark.
 *   2. The apple.css DARK utility overrides, scraped from the stylesheet itself (never
 *      hardcoded): `[data-theme='dark'] .bg-white { background-color: var(--ap-bg-canvas) }`,
 *      the `.bg-white\/NN` panel steps, and their `@media (prefers-color-scheme: dark)`
 *      mirrors. `npm run check:contrast -- --check-css` asserts this model stays honest.
 *   3. Alpha composition: `bg-x/60` paints `rgba(X, 0.6)`, and the scanner can only score
 *      it composited over the page canvas (`CANVAS_DARK` in dark). Veils too translucent to
 *      stand behind (`white/0`–`white/25`, transparent) are skipped by the callers.
 *
 * Exports the shared contract both contrast scanners import (they must not disagree about
 * what a class means): RAMP, LITERAL, PANEL_ALPHA_MIN, CANVAS_DARK, relLum, contrast,
 * propOf, isResting, resolve, RESOLVER.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createResolver, parseColor, relLum, contrast, toHex, mixSrgb } from './token-resolver.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export { relLum, contrast };

/** The resolver every consumer shares: one parse of both stylesheets. */
export const RESOLVER = createResolver({
  indexCss: join(ROOT, 'frontend/src/index.css'),
  appleCss: join(ROOT, 'frontend/src/styles/apple.css'),
});

/** Ramp families whose steps invert between themes (kept for the flat scanner's regexes). */
export const RAMP =
  'amber|rose|emerald|blue|sky|cyan|red|green|yellow|orange|teal|indigo|violet|purple|pink|fuchsia|lime|stone|zinc|neutral|slate|gray';

/**
 * CSS colour literals the token graph does not model — Tailwind built-ins and keywords.
 * `white`/`black` here are the COLOURS, never theme-flipped; the dark flip of the *utility*
 * `bg-white` lives in the override map below and comes from the stylesheet.
 * `Object.keys(LITERAL)` also feeds the tree walker's family list: omitting `white` is what
 * let self-painted white panels hide from the JSX walk.
 */
export const LITERAL = {
  white: '#ffffff',
  black: '#000000',
  transparent: null,
};

/** Composite a colour with alpha over the page canvas, one mode. */
const compositeOver = (color, canvas) =>
  toHex([
    color[0] * color[3] + canvas[0] * (1 - color[3]),
    color[1] * color[3] + canvas[1] * (1 - color[3]),
    color[2] * color[3] + canvas[2] * (1 - color[3]),
  ]);

/** The page canvas by mode — what `/NN` alphas are scored against. */
const canvasFor = (mode) => parseColor(RESOLVER.token('bg-canvas', mode)) ?? parseColor(mode === 'dark' ? '#000000' : '#ffffff');

/** The dark canvas hex, exported because the scanners report against it. */
export const CANVAS_DARK = RESOLVER.token('bg-canvas', 'dark');

/* ─────────── apple.css dark utility overrides, scraped from the stylesheet ─────────── */

const DARK_CTX = /\[data-theme=['"]dark['"]\]|\.dark\b|:root:not\(\[data-theme=['"]light['"]\]\)/;

function darkUtilityOverrides() {
  const css = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map();
  // Walk blocks, tracking @media (prefers-color-scheme: dark) like the token resolver does.
  const walk = (text, inDarkMedia) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) return;
      const head = text.slice(i, open).split('}').pop().split(';').pop().trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') depth -= 1;
        j += 1;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@/.test(head)) {
        walk(body, inDarkMedia || head.includes('prefers-color-scheme: dark'));
      } else if (head.includes('.')) {
        // Per-selector shape check: after the dark-context prefix, the selector must be
        // exactly ONE bare utility (optionally with one pseudo-class). This deliberately
        // excludes scoped lockups like `[data-theme='dark'] .hn-paper .bg-white { #ffffff }`
        // — the paper/print surface is *supposed* to stay white in dark.
        for (const sel of head.split(',')) {
          const m = sel.trim().match(
            /^(?:\[data-theme=['"]dark['"]\]\s+|\.dark\s+|:root:not\(\[data-theme=['"]light['"]\]\)\s+)?\.((?:bg|text|border)-[a-zA-Z0-9-]+(?:\\\/\d{1,3})?)(?::[a-z-]+)?$/,
          );
          if (!m) continue;
          const decl = body.match(/background-color:\s*([^;]+)/);
          if (!decl) continue;
          const darkCtx = DARK_CTX.test(sel) || (inDarkMedia && sel.includes(':not('));
          if (darkCtx || inDarkMedia) map.set(m[1].replace('\\/', '/'), decl[1].trim());
        }
      }
      i = j;
      while (i < text.length && /[\s;}]/.test(text[i])) i += 1;
    }
  };
  walk(css, false);
  return map;
}

/** Utility → raw CSS value it paints in dark (from apple.css), e.g. 'bg-white/40' → 'color-mix(…)'. */
const DARK_OVERRIDES = darkUtilityOverrides();

/**
 * The smallest alpha step apple.css redirects onto the dark canvas — panels below it stay
 * actually white in dark. Derived: it is the smallest `.bg-white\/NN` override present
 * (currently 40), and `check:contrast --check-css` asserts the file still says so.
 */
export const PANEL_ALPHA_MIN = Math.min(
  ...[...DARK_OVERRIDES.keys()]
    .map((k) => k.match(/^bg-white\/(\d{1,3})$/))
    .filter(Boolean)
    .map((m) => Number(m[1])),
  100,
);

/* ─────────── the shared contract ─────────── */

/** `text-carbon-40` → 'text'; `dark:divide-carbon-10` → 'divide'; non-colour classes → null. */
export function propOf(cls) {
  const base = cls.split(':').pop();
  const m = base.match(/^(text|bg|border|fill|stroke|divide|ring)(?:-[trblxy]|(?=-))-/);
  return m ? m[1] : null;
}

const STATE_VARIANTS = /^(?:hover|focus(?:-visible|-within)?|active|visited|disabled|enabled|checked|indeterminate|required|invalid|valid|placeholder|selection|marker|file|backdrop|group-(?:hover|focus|active)|peer-[a-z]+|aria-[a-z-]+|data-.*)$/;

/** True when no interactive/state variant gates the class. `dark:` and breakpoints still
 *  count as resting — they describe the theme/viewport, not a moment in the interaction. */
export function isResting(cls) {
  const parts = cls.split(':');
  return parts.slice(0, -1).every((v) => !STATE_VARIANTS.test(v));
}

/** Strip variant prefixes; return the bare utility. */
const bare = (cls) => cls.split(':').pop();

/**
 * resolve(cls, mode) → hex the utility paints in that mode, or null when the class is not a
 * colour utility this model can stand behind (arbitrary values, typo'd tokens, non-colour
 * props resolve to null and are skipped by the scanners).
 */
export function resolve(cls, mode) {
  const base = bare(cls);
  const prop = propOf(cls);
  if (!prop) return null;

  const rest = base.slice(prop.length + 1); // 'white/60', 'carbon-40', 'severity-high-solid'
  const alphaMatch = rest.match(/^(.*)\/(\d{1,3})$/);
  const name = alphaMatch ? alphaMatch[1] : rest;
  const alpha = alphaMatch ? Number(alphaMatch[2]) / 100 : 1;

  // 1. The stylesheet's own dark overrides win (`bg-white`, `bg-white/40`, …).
  if (mode === 'dark') {
    const raw = DARK_OVERRIDES.get(`${prop}-${rest}`);
    if (raw) {
      const c = RESOLVER.evaluate(raw, 'dark');
      if (c) return compositeOver(c, canvasFor('dark'));
    }
  }

  // 2. Literals and the token graph.
  let hex;
  if (name === 'white' || name === 'black') hex = LITERAL[name];
  else hex = RESOLVER.token(name, mode);
  if (!hex) return null;

  // 3. Alpha composition over the ground the veil actually works against: dark-family
  //    scrims (`bg-black/40`, `bg-carbon-black/60`…) exist to darken imagery, so the score
  //    is against black in BOTH modes; every other alpha composites over the mode's page
  //    canvas (apple.css' own white-panel overrides already redirected dark to it).
  const c = parseColor(hex);
  if (!c) return null;
  c[3] = alpha;
  const ground = name === 'black' || name === 'carbon-black' ? parseColor('#000000') : canvasFor(mode);
  return compositeOver(c, ground);
}
