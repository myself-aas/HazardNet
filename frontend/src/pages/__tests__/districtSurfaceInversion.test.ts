/**
 * Every surface painted on `/forecast/district/:id` must invert between themes.
 *
 * The defect this pins (2026-11-07, 20 AA findings on this one route): the day outlook,
 * the 15-day trajectory and the live snapshot slot all painted cards, chips, `<select>`
 * controls and Recharts tooltips with the arbitrary value `bg-[var(--ap-canvas)]`.
 * `--ap-canvas` is a PRIMITIVE — apple.css §1 declares it `#ffffff` and the dark theme
 * deliberately overrides the *semantic* `--ap-bg-canvas` instead of it — so those
 * surfaces stayed white while the ink on them (`--ap-label`, `--ap-label-secondary`)
 * flipped to #f5f5f7 / #a1a1a6. Measured: 1.09:1 and 2.57:1 in dark, against 16.83:1
 * and 6.87:1 in light. Every heading, date, severity figure and filter label on the
 * route went blank the moment a visitor chose dark.
 *
 * `tokenInversion.test.ts` already knew the primitive never flips; what nothing covered
 * was a component reaching for it through an arbitrary value, a shape neither contrast
 * scanner could resolve at all (see `arbitraryPaint` in `scripts/lib/class-resolver.mjs`).
 * This test measures the route's actual surface tokens through the real token graph, so
 * it fails on ANY non-inverting surface — the one it caught, or the next one invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { createResolver, contrast } = require('../../../../scripts/lib/token-resolver.mjs');

const ROOT = join(__dirname, '../../../..');
const resolver = createResolver({
  indexCss: join(ROOT, 'frontend/src/index.css'),
  appleCss: join(ROOT, 'frontend/src/styles/apple.css'),
});

/** The modules that render `/forecast/district/:id` in its default (day outlook) view. */
const ROUTE_FILES = [
  'frontend/src/pages/DistrictDailyPage.tsx',
  'frontend/src/components/district/Continuous15DayTrajectory.tsx',
  'frontend/src/components/district/DistrictLiveSnapshotSlot.tsx',
];

/** A `--ap-*` token used to PAINT A SURFACE: a `bg-[var(…)]` class or an inline fill. */
const SURFACE_TOKEN = /(?:bg-\[var\((--ap-[a-z0-9-]+)\)|backgroundColor:\s*'var\((--ap-[a-z0-9-]+)\)')/g;

/** A `--ap-*` token used as INK: a `text-[var(…)]` class or an inline `color`. */
const INK_TOKEN = /(?:text-\[var\((--ap-[a-z0-9-]+)\)|(?<![-\w])color:\s*'var\((--ap-[a-z0-9-]+)\)')/g;

/**
 * Surfaces text can sit on. Separators and progress tracks paint colour too, but never
 * carry ink — scoring an ink token against a hairline would invent failures.
 */
const TEXT_BEARING = /^--ap-(?:bg|input)-/;

const AA = 4.5;

const tokensIn = (source: string, pattern: RegExp): string[] => [
  ...new Set([...source.matchAll(pattern)].map((match) => match[1] ?? match[2])),
];

/** `--ap-bg-elevated` → the hex it actually paints in one appearance. */
const paint = (token: string, mode: 'light' | 'dark'): string => {
  const hex: string | null = resolver.token(token.replace(/^--ap-/, ''), mode);
  if (!/^#[\da-f]{6}$/i.test(hex ?? '')) throw new Error(`${token} is not a colour token (resolved to ${hex})`);
  return hex as string;
};

describe.each(ROUTE_FILES)('%s', (file) => {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const surfaces = tokensIn(source, SURFACE_TOKEN);
  const panels = surfaces.filter((token) => TEXT_BEARING.test(token));
  const inks = tokensIn(source, INK_TOKEN);

  test('paints token surfaces and token ink, so this suite cannot pass by matching nothing', () => {
    expect(panels.length).toBeGreaterThan(0);
    expect(inks.length).toBeGreaterThan(0);
  });

  test('every painted surface inverts between light and dark', () => {
    const frozen = surfaces
      .map((token) => ({ token, light: paint(token, 'light'), dark: paint(token, 'dark') }))
      .filter(({ light, dark }) => light.toLowerCase() === dark.toLowerCase())
      .map(({ token, light }) => `${token} paints ${light} in both themes`);
    expect(frozen).toEqual([]);
  });

  test('never paints the non-inverting --ap-canvas primitive', () => {
    expect(surfaces).not.toContain('--ap-canvas');
    expect(source).not.toMatch(/var\(--ap-canvas\)/);
  });

  test('every ink token clears AA on every text-bearing surface, in both themes', () => {
    const failures: string[] = [];
    for (const ink of inks) {
      for (const panel of panels) {
        for (const mode of ['light', 'dark'] as const) {
          const ratio = contrast(paint(ink, mode), paint(panel, mode));
          if (ratio < AA) {
            failures.push(
              `${mode}: ${ink} (${paint(ink, mode)}) on ${panel} (${paint(panel, mode)}) = ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
