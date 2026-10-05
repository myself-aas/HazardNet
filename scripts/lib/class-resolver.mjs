/**
 * Tailwind utility class -> hex, for whichever theme is being scored.
 *
 * Extracted so the flat scanner (check-contrast.mjs) and the JSX-tree scanner
 * (check-contrast-tree.mjs) cannot drift apart. They disagreeing about what
 * `bg-white` means in dark is exactly the kind of gap that let 240 defects
 * through while the gate printed a green tick.
 */
import { createResolver } from './token-resolver.mjs';

const APPLE_CSS = 'frontend/src/styles/apple.css';
const INDEX_CSS = 'frontend/src/index.css';

/** The inverting neutral ramp, read off apple.css lines 54-64 (light) and 259-268 (dark). */
const RAMP = {
  light: { '05': '#fafafc', 10: '#f5f5f7', 20: '#e0e0e0', 30: '#d2d2d7', 40: '#a1a1a6',
           50: '#6e6e73', 60: '#5a5a5d', 70: '#333333', 80: '#272729', 90: '#1d1d1f' },
  dark:  { '05': '#252527', 10: '#272729', 20: '#3a3a3c', 30: '#48484a', 40: '#6e6e73',
           50: '#9a9a9f', 60: '#cccccc', 70: '#e4e4e6', 80: '#f2f2f4', 90: '#ffffff' },
};

/**
 * Literals that are defined once and never flip. `--ap-n-black` is declared a single time, so
 * `bg-carbon-black/NN` is the correct token for a scrim that must stay dark over a photo;
 * `bg-carbon-90/NN` is not, because it inverts to a white veil. Tailwind's `white` likewise
 * never flips, which is why `text-white` is still right on a coloured fill.
 */
const LITERAL = { white: '#ffffff', black: '#000000', 'carbon-black': '#000000' };

/**
 * Overrides applied in apple.css, which Tailwind alone does not express. `bg-white` is a
 * SURFACE and follows the theme. Its alpha variants split by weight: at 40% and above it is a
 * frosted panel and follows the theme; below that it is a highlight drawn over media or a dark
 * ground and stays white. A blanket redirect of every alpha step would have wrecked the hero
 * overlays, so the split is deliberate and the threshold is asserted by --check-css.
 */
const PANEL_ALPHA_MIN = 40;
const CANVAS_DARK = '#252527';

const relLum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

const PROP = /^(?:dark:)?(?:hover:|focus:|active:|group-hover:|disabled:)*(text|bg|border|fill|stroke|divide|ring)-/;
const propOf = (cls) => (PROP.exec(cls) ?? [])[1] ?? null;
/** Only score the resting state; a hover colour is not what the page renders at rest. */
const isResting = (cls) => !/^(?:dark:)?(?:hover|focus|active|group-hover|disabled):/.test(cls);


const RESOLVER = createResolver({ indexCss: INDEX_CSS, appleCss: APPLE_CSS });

export function resolve(cls, mode) {

  const bare = cls.replace(/^dark:/, '');
  const ramp = RAMP[mode];

  const carbon = /^(?:text|bg|border|fill|stroke|divide|ring)-carbon-(\d{2})(?:\/\d+)?$/.exec(bare);
  if (carbon) return ramp[carbon[1]] ?? null;

  // apple.css: `.bg-white` and the panel-weight alphas resolve to the canvas token in dark.
  if (bare === 'bg-white') return mode === 'dark' ? CANVAS_DARK : '#ffffff';
  const alpha = /^bg-white\/(\d+)$/.exec(bare);
  if (alpha) return mode === 'dark' && Number(alpha[1]) >= PANEL_ALPHA_MIN ? CANVAS_DARK : '#ffffff';

  const lit = /^(?:text|bg|border|fill|stroke)-(white|black|carbon-black)(?:\/\d+)?$/.exec(bare);
  if (lit) return LITERAL[lit[1]];

  // Everything else goes through the real token graph. Arbitrary values
  // (`text-[#fff]`, `bg-[var(--x)]`) and gradients are left unscored on
  // purpose: the first is already caught by the hex-literal ratchet, and a
  // gradient has no single ground to score against.
  const named = /^(?:text|bg|border|fill|stroke|divide|ring)-([a-z][a-z0-9-]*(?:\/\d+)?)$/.exec(bare);
  if (named) {
    const ground = mode === 'dark' ? CANVAS_DARK : '#ffffff';
    return RESOLVER.token(named[1], mode, ground);
  }

  return null;
}

export { RAMP, LITERAL, PANEL_ALPHA_MIN, CANVAS_DARK, relLum, contrast, propOf, isResting, RESOLVER, APPLE_CSS, INDEX_CSS };
