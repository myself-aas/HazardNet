/**
 * The front door's small print sits over a photograph, which no token-pair contrast check
 * can measure: `scripts/check-contrast.mjs` compares two resolved colours, and the pixel
 * behind the hero copy is whichever frame the carousel is showing.
 *
 * The design answer is a scrim opaque enough that the *worst possible* photograph still
 * clears 4.5:1. That makes the claim computable: composite the scrim over pure white (the
 * brightest backdrop any image can produce), composite each text tier over that, and check
 * the ratio. `--hero-scrim` and `--hero-text-*` in `frontend/src/index.css` are the
 * contract; this test is what makes weakening them fail instead of merely being argued
 * about in a comment.
 *
 * 2026-10-26 critique, P1 "the hero's small print has no measured contrast".
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'frontend/src/index.css'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/FrontDoor.tsx'), 'utf8');

function rgba(token) {
  const pattern = new RegExp(`--${token}:\\s*rgba?\\(([^)]+)\\)`, 'm');
  const match = CSS.match(pattern);
  if (!match) throw new Error(`--${token} is not declared as an rgba() value in index.css`);
  const parts = match[1].split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4) throw new Error(`--${token} needs four components to composite`);
  const [r, g, b, a] = parts;
  for (const n of [r, g, b]) if (!(n >= 0 && n <= 255)) throw new Error(`--${token} channel out of range`);
  if (!(a >= 0 && a <= 1)) throw new Error(`--${token} alpha out of range`);
  return { rgb: [r, g, b], a };
}

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** Source-over compositing of a single layer onto an opaque backdrop. */
const composite = ({ rgb, a }, backdrop) => rgb.map((c, i) => c * a + backdrop[i] * (1 - a));

const contrast = (fg, bg) => {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// The brightest photograph the carousel can show. Anything darker only helps.
const WHITE_PHOTOGRAPH = [255, 255, 255];

describe('Front door hero — composited contrast over any photograph', () => {
  const surface = composite(rgba('hero-scrim'), WHITE_PHOTOGRAPH);

  test.each([
    ['--hero-text-meta', 'hero-text-meta', 4.5], // 12px authority line
    ['--hero-text-body', 'hero-text-body', 4.5], // 16–18px standfirst
    ['--hero-text-strong', 'hero-text-strong', 4.5], // h1, but the tier must stand alone
  ])('%s clears its floor on the scrim', (token, className, floor) => {
    const ratio = contrast(composite(rgba(token.replace('--', '')), surface), surface);
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(floor);
    // The class is the only thing that applies the token; a tier with no consumer is dead.
    expect(PAGE).toContain(className);
  });

  test('the scrim is opaque enough to make the worst case computable', () => {
    // Below ~0.55 a white photograph pushes the 12px tier under 4.5:1 whatever the text
    // alpha is; this stops a "make the hero feel lighter" change from passing review.
    expect(rgba('hero-scrim').a).toBeGreaterThanOrEqual(0.55);
  });

  test('the hero no longer bakes its text alpha into a utility class', () => {
    // These were the defect: white/75 is 4.79:1 over an *unphotographed* 65% scrim and
    // unmeasurable over a real one. The tiers replaced them. A `hover:` state may brighten
    // (it moves away from the floor), and comments are documentation rather than classes.
    const classes = PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(classes).not.toMatch(/(?<!hover:)text-white\/(?:5\d|6\d|7\d|8\d|9\d)/);
    expect(PAGE).toContain('background: \'var(--hero-scrim)\'');
  });
});
