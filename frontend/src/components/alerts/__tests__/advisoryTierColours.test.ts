/**
 * The advisory tier colour must follow the theme when the browser paints it.
 *
 * `ADVISORY_TIER_COLOURS` is `APPLE_SEVERITY[*].text` — the arm solved for a LIGHT
 * ground, and correct there (4.07–7.14:1 against the #e0e0e0 progress track). Painted
 * through an inline style it is a literal, so in dark mode the same hex landed on the
 * #424245 track at 1.06–1.86:1: the severity bar and the peak-day border on
 * `/forecast/district/:id` were effectively invisible. `ADVISORY_TIER_COLOUR_VARS` is the
 * same mapping through `--ap-sev-*`, which apple.css §6 re-solves onto
 * `APPLE_SEVERITY[*].onDark` in dark — 3.59–5.59:1 on the track, 6.10–9.50:1 on the card.
 *
 * WCAG 1.4.11 asks 3:1 of a graphical object; these bars are data encodings, so they are
 * held to it. The hex map is kept for the consumers that cannot resolve a `var()`
 * (canvas drawing, SVG presentation attributes, Leaflet path options).
 */
import { join } from 'node:path';
import { APPLE_COLORS, APPLE_DARK, APPLE_SEVERITY, contrastRatio } from '@hazardnet/design-system';
import { ADVISORY_TIER_COLOURS, ADVISORY_TIER_COLOUR_VARS } from '../AlertLevelBadge';

const { createResolver } = require('../../../../../scripts/lib/token-resolver.mjs');

const ROOT = join(__dirname, '../../../../..');
const resolver = createResolver({
  indexCss: join(ROOT, 'frontend/src/index.css'),
  appleCss: join(ROOT, 'frontend/src/styles/apple.css'),
});

/** Tier → the severity level it sits on, in both the hex and the token spelling. */
const TIERS = [
  ['EXTREME', 'extreme', 'extreme'],
  ['SEVERE', 'veryHigh', 'very-high'],
  ['WARNING', 'high', 'high'],
  ['WATCH', 'moderate', 'moderate'],
  ['NORMAL', 'low', 'low'],
  ['NO_ALERT', 'low', 'low'],
] as const;

/** Non-text contrast: WCAG 1.4.11. */
const NON_TEXT_AA = 3;

describe('advisory tier colours', () => {
  test('the CSS-variable map covers exactly the tiers the hex map does', () => {
    expect(Object.keys(ADVISORY_TIER_COLOUR_VARS).sort()).toEqual(Object.keys(ADVISORY_TIER_COLOURS).sort());
  });

  test.each(TIERS)('%s points at --ap-sev-%s, and the stylesheet flips it to the onDark arm', (tier, level, token) => {
    expect(ADVISORY_TIER_COLOURS[tier]).toBe(APPLE_SEVERITY[level].text);
    expect(ADVISORY_TIER_COLOUR_VARS[tier]).toBe(`var(--ap-sev-${token})`);

    // The stylesheet, not this file, is the authority on what the token paints.
    expect(resolver.token(`sev-${token}`, 'light')).toBe(APPLE_SEVERITY[level].text.toLowerCase());
    expect(resolver.token(`sev-${token}`, 'dark')).toBe(APPLE_SEVERITY[level].onDark.toLowerCase());
  });

  test.each(TIERS)('%s clears 3:1 on a dark ground through the token, and fails it through the hex', (tier, level) => {
    const darkTrack = APPLE_DARK.separatorOpaque;
    const darkCard = APPLE_COLORS.surfaceTile2;

    // Through `var(--ap-sev-*)`: the dark arm of the same severity.
    expect(contrastRatio(APPLE_SEVERITY[level].onDark, darkTrack)).toBeGreaterThanOrEqual(NON_TEXT_AA);
    expect(contrastRatio(APPLE_SEVERITY[level].onDark, darkCard)).toBeGreaterThanOrEqual(NON_TEXT_AA);

    // Through the hex: the light arm, frozen. This is the measurement that made the
    // severity bar disappear in dark mode — it is asserted so it cannot come back.
    expect(contrastRatio(APPLE_SEVERITY[level].text, darkTrack)).toBeLessThan(NON_TEXT_AA);

    // Light mode never depended on the token: the hex already cleared on the light track.
    expect(contrastRatio(APPLE_SEVERITY[level].text, APPLE_COLORS.hairline)).toBeGreaterThanOrEqual(NON_TEXT_AA);
  });
});
