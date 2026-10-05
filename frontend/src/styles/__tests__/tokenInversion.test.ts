/**
 * The token graph must invert as a whole, and every fill must own a paired
 * foreground.
 *
 * The defects this pins (2026-10-06):
 *
 *  1. `--ap-canvas: #ffffff` is declared once and never overridden for dark,
 *     because dark overrides the *semantic* `--ap-bg-canvas` instead. 63 ramp
 *     steps across 17 families mixed their tints against the primitive, so
 *     every `-50`…`-400` tint was frozen light and glared on a dark page.
 *
 *  2. The semantic action tier (`--ap-action`, `--ap-action-fg`, `--ap-link`)
 *     existed in apple.css and flipped correctly, but was never exposed to the
 *     utility layer. Call sites had to reach past it for a primitive that does
 *     not invert — which is why filled buttons and inline links failed dark
 *     mode while the stylesheet looked correct.
 *
 *  3. A fill that flips lightness between themes cannot carry a literal
 *     foreground. `bg-carbon-90 text-white` is 16.83:1 in light and 1.00:1 in
 *     dark — the active language in the toggle was white on white. The classes
 *     lived in a `TONES` constant, so a scanner that only read `className="…"`
 *     never saw them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createResolver, contrast } = require('../../../../scripts/lib/token-resolver.mjs');

const ROOT = join(__dirname, '../../../..');
const INDEX_CSS = join(ROOT, 'frontend/src/index.css');
const APPLE_CSS = join(ROOT, 'frontend/src/styles/apple.css');
const R = createResolver({ indexCss: INDEX_CSS, appleCss: APPLE_CSS });

const FAMILIES = [
  'amber', 'rose', 'emerald', 'blue', 'sky', 'cyan', 'red', 'green', 'yellow',
  'orange', 'teal', 'indigo', 'violet', 'purple', 'pink', 'fuchsia', 'lime',
];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const AA = 4.5;

/** Relative luminance, WCAG 2.x. */
const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

describe('token graph inverts between themes', () => {
  it('no ramp step mixes against a primitive with no dark override', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');
    const frozen = [...css.matchAll(/--color-([a-z]+-\d+):\s*color-mix\([^;]*var\(--ap-canvas\)/g)]
      .map((m) => m[1]);
    expect(frozen).toEqual([]);
  });

  it('no ramp step is light in both themes', () => {
    const stuck: string[] = [];
    for (const fam of FAMILIES) {
      for (const step of STEPS) {
        const light = R.token(`${fam}-${step}`, 'light');
        const dark = R.token(`${fam}-${step}`, 'dark');
        if (!light || !dark) continue;
        if (lum(light) > 0.5 && lum(dark) > 0.5) stuck.push(`${fam}-${step}`);
      }
    }
    expect(stuck).toEqual([]);
  });

  it('every tint carries its own ink at AA in both themes', () => {
    const failures: string[] = [];
    for (const fam of FAMILIES) {
      const surface = `${fam}-50`;
      const ink = `${fam}-700`;
      for (const mode of ['light', 'dark'] as const) {
        const ratio = contrast(R.token(ink, mode), R.token(surface, mode));
        if (ratio < AA) failures.push(`${ink} on ${surface} (${mode}) = ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('semantic tier is reachable from the utility layer', () => {
  it.each(['ap-action', 'ap-action-fg', 'ap-link', 'ap-on-sev', 'ap-on-inverse'])(
    '--color-%s is exposed so call sites need not reach for a primitive',
    (token) => {
      expect(readFileSync(INDEX_CSS, 'utf8')).toContain(`--color-${token}:`);
    },
  );
});

describe('every inverting fill has a paired foreground that survives both themes', () => {
  const cases: Array<[string, string]> = [
    ['ap-action-fg', 'primary'],
    ['ap-action-fg', 'blue-600'],
    ['ap-on-sev', 'severity-high-solid'],
    ['ap-on-sev', 'severity-moderate-solid'],
    ['ap-on-sev', 'severity-low-solid'],
    ['ap-on-sev', 'amber-500'],
    ['ap-on-sev', 'rose-600'],
    ['ap-on-inverse', 'carbon-90'],
    ['ap-on-inverse', 'carbon-80'],
  ];
  it.each(cases)('text-%s on bg-%s clears AA in light and dark', (fg, bg) => {
    for (const mode of ['light', 'dark'] as const) {
      expect(contrast(R.token(fg, mode), R.token(bg, mode))).toBeGreaterThanOrEqual(AA);
    }
  });

  it('the literal foregrounds these replaced really were broken', () => {
    // Guards against the pairing being declared "fixed" by a token that quietly
    // stopped inverting: if these ever pass, the premise is gone.
    expect(contrast(R.token('white', 'dark'), R.token('carbon-90', 'dark'))).toBeLessThan(AA);
    expect(contrast(R.token('white', 'dark'), R.token('primary', 'dark'))).toBeLessThan(AA);
  });
});
