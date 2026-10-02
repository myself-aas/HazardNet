/**
 * Meridian contrast contract.
 *
 * Every text role against every background it may sit on, at the WCAG 2.1
 * threshold it must clear. This test exists because a contrast regression on a
 * hazard warning page is not a cosmetic bug: it is a warning someone cannot read.
 *
 * The ratios are computed here from the same primitives the shipped tokens
 * resolve to, so editing a colour in meridian.ts and breaking a ratio fails the
 * build rather than shipping.
 */

import {
  MERIDIAN_CONTRACT_CONTRAST,
  MERIDIAN_PRIMITIVES,
  MERIDIAN_THEMES,
  MERIDIAN_TOUCH,
  MERIDIAN_SEVERITY,
  MERIDIAN_ALERT_LEVELS,
  MERIDIAN_TRACK,
  contrastRatio,
  concentricRadius,
  MERIDIAN_TYPE_SCALE,
  MERIDIAN_BENGALI,
  MERIDIAN_DISPLAY_SPLIT,
} from '../packages/design-system/src/meridian';

describe('Meridian — contrast contract (WCAG 2.1)', () => {
  test.each(MERIDIAN_CONTRACT_CONTRAST.map((c) => [`${c.note}: ${c.fg} on ${c.bg}`, c]))(
    '%s',
    (_label, contract) => {
      const actual = contrastRatio(contract.fg, contract.bg);
      expect(actual).toBeGreaterThanOrEqual(contract.min);
    },
  );

  test('every contract declares a threshold at or above WCAG AA', () => {
    for (const contract of MERIDIAN_CONTRACT_CONTRAST) {
      expect(contract.min).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('contrastRatio matches the published WCAG worked examples', () => {
    // Black on white is 21:1 by definition.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    // White on white is 1:1.
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Order of arguments must not matter.
    expect(contrastRatio('#970002', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#970002'),
      10,
    );
  });

  test('the documented brand ratios in the token comments are the real ones', () => {
    // These are quoted in MERIDIAN.md and in code comments. If a primitive
    // moves, the prose is wrong, so pin the numbers the prose claims.
    expect(contrastRatio(MERIDIAN_PRIMITIVES.brandCrimson, '#ffffff')).toBeCloseTo(9.06, 1);
    expect(contrastRatio(MERIDIAN_PRIMITIVES.brandCrimsonDark, '#ffffff')).toBeCloseTo(10.29, 1);
    expect(contrastRatio(MERIDIAN_PRIMITIVES.ink, '#ffffff')).toBeCloseTo(17.54, 1);
    expect(contrastRatio(MERIDIAN_PRIMITIVES.ink, MERIDIAN_PRIMITIVES.canvas)).toBeCloseTo(16.19, 1);
    // Two different inks, deliberately: `ink` (#141A1F) is body text, `brandInk`
    // (#0D0D0D) is the pill fill and the wordmark. They measure differently.
    expect(contrastRatio('#ffffff', MERIDIAN_PRIMITIVES.brandInk)).toBeCloseTo(19.44, 1);
    expect(contrastRatio(MERIDIAN_PRIMITIVES.brandInk, '#ffffff')).toBeCloseTo(19.44, 1);
  });
});

describe('Meridian — themes resolve every role', () => {
  const roles = [
    'label',
    'labelSecondary',
    'labelTertiary',
    'labelQuaternary',
    'separator',
    'separatorOpaque',
    'backgroundBase',
    'backgroundGrouped',
    'backgroundElevated',
    'actionInk',
    'actionInkForeground',
    'actionHazard',
    'actionHazardForeground',
    'actionInteractive',
    'actionInteractiveForeground',
    'focusRing',
  ];

  test.each(['light', 'dark', 'highContrast'])('%s theme defines every semantic role', (name) => {
    const theme = MERIDIAN_THEMES[name];
    expect(theme).toBeDefined();
    for (const role of roles) {
      expect(typeof theme[role]).toBe('string');
      expect(theme[role]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test('every theme label clears AAA against its own background', () => {
    for (const theme of Object.values(MERIDIAN_THEMES)) {
      expect(contrastRatio(theme.label, theme.backgroundBase)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(theme.label, theme.backgroundElevated)).toBeGreaterThanOrEqual(7);
    }
  });

  test('every theme secondary label clears AAA against its own background', () => {
    for (const theme of Object.values(MERIDIAN_THEMES)) {
      expect(contrastRatio(theme.labelSecondary, theme.backgroundBase)).toBeGreaterThanOrEqual(7);
    }
  });

  test('button foreground clears AA against its own fill in every theme', () => {
    for (const theme of Object.values(MERIDIAN_THEMES)) {
      expect(contrastRatio(theme.actionInkForeground, theme.actionInk)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.actionHazardForeground, theme.actionHazard)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.actionInteractiveForeground, theme.actionInteractive),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Meridian — touch ergonomics', () => {
  test('the tap floor is at least the Apple HIG / WCAG 2.5.8 minimum', () => {
    expect(MERIDIAN_TOUCH.minTarget).toBeGreaterThanOrEqual(44);
  });

  test('the Android floor is at least the Material 3 minimum', () => {
    expect(MERIDIAN_TOUCH.minTargetAndroid).toBeGreaterThanOrEqual(48);
  });

  test('no control height dips below the tap floor', () => {
    expect(MERIDIAN_TOUCH.controlHeight).toBeGreaterThanOrEqual(MERIDIAN_TOUCH.minTarget);
    expect(MERIDIAN_TOUCH.controlHeightCompact).toBeGreaterThanOrEqual(MERIDIAN_TOUCH.minTarget);
  });
});

describe('Meridian — severity is never colour alone (WCAG 1.4.1)', () => {
  test('every severity level carries a glyph and a text label', () => {
    for (const [key, level] of Object.entries(MERIDIAN_SEVERITY)) {
      expect(level.glyph).toEqual(expect.any(String));
      expect(level.label.length).toBeGreaterThan(0);
      expect(typeof level.rank).toBe('number');
      expect(key).toBeDefined();
    }
  });

  test('the five levels have five distinct shape cues and five distinct ranks', () => {
    const glyphs = Object.values(MERIDIAN_SEVERITY).map((l) => l.glyph);
    const ranks = Object.values(MERIDIAN_SEVERITY).map((l) => l.rank);
    expect(new Set(glyphs).size).toBe(5);
    expect(new Set(ranks).size).toBe(5);
  });

  test('extreme breaks the bar pattern, so it survives greyscale', () => {
    // Four bars of increasing height are indistinguishable in greyscale print.
    // Extreme is a filled diamond — different silhouette, not just different hue.
    expect(MERIDIAN_SEVERITY.extreme.glyph).toBe('diamond');
    for (const key of ['low', 'moderate', 'high', 'veryHigh']) {
      expect(MERIDIAN_SEVERITY[key].glyph).toMatch(/^bar\d$/);
    }
  });

  test('severity text colours clear AA on their own surfaces', () => {
    for (const level of Object.values(MERIDIAN_SEVERITY)) {
      expect(contrastRatio(level.color, level.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the 4-step policy taxonomy stays distinct from the 5-step severity scale', () => {
    // Collapsing these two is a data-integrity bug: policy levels are what gets
    // published, severity is what the model scored.
    expect(MERIDIAN_ALERT_LEVELS).toEqual(['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']);
    expect(MERIDIAN_ALERT_LEVELS.length).toBe(4);
    expect(Object.keys(MERIDIAN_SEVERITY).length).toBe(5);
  });
});

describe('Meridian — geometry', () => {
  test('concentric radius subtracts padding and never goes negative', () => {
    // Apple's rule: inner = outer − padding, floored at 0.
    expect(concentricRadius(24, 16)).toBe(8);
    expect(concentricRadius(16, 12)).toBe(4);
    expect(concentricRadius(8, 16)).toBe(0);
  });

  test('both tracks exist and the console track is tighter than editorial', () => {
    expect(MERIDIAN_TRACK.editorial).toBeDefined();
    expect(MERIDIAN_TRACK.console).toBeDefined();
    expect(MERIDIAN_TRACK.console.cardRadius).toBeLessThan(MERIDIAN_TRACK.editorial.cardRadius);
    expect(MERIDIAN_TRACK.console.sectionGap).toBeLessThan(MERIDIAN_TRACK.editorial.sectionGap);
  });

  test('the console track never rounds a control into a pill', () => {
    // Dense data controls must not adopt the editorial pill: it wastes the
    // horizontal space a table row needs.
    expect(MERIDIAN_TRACK.console.controlRadius).toBeLessThan(9999);
  });

  test('the editorial track keeps the pill CTA that is its signature', () => {
    expect(MERIDIAN_TRACK.editorial.controlRadius).toBe(9999);
  });
});

describe('Meridian — typography', () => {
  test('every named style declares size, line-height, tracking, weight and role', () => {
    for (const [name, style] of Object.entries(MERIDIAN_TYPE_SCALE)) {
      // One style at a time so a failure names the style that broke.
      expect([name, typeof style.size]).toEqual([name, 'string']);
      expect([name, style.line > 0]).toEqual([name, true]);
      expect([name, typeof style.tracking]).toEqual([name, 'string']);
      expect([name, style.weight > 0]).toEqual([name, true]);
      expect([name, ['text', 'display'].includes(style.role)]).toEqual([name, true]);
    }
  });

  test('every body-scale style keeps line-height at or above 1.3', () => {
    // __tests__/designTypography.test.js asserts the same floor for the app;
    // the token layer must not be able to undercut it.
    for (const [name, style] of Object.entries(MERIDIAN_TYPE_SCALE)) {
      if (style.role === 'display') continue;
      expect([name, style.line >= 1.3]).toEqual([name, true]);
    }
  });

  test('tracking is negative above the display split and neutral below it', () => {
    // Meta's rule: tighten only at display sizes, where letters optically spread.
    const sizes = Object.entries(MERIDIAN_TYPE_SCALE);
    for (const [name, style] of sizes) {
      const tracking = parseFloat(style.tracking);
      if (style.role === 'display') {
        expect([name, 'display tracking must be negative', tracking < 0]).toEqual([
          name,
          'display tracking must be negative',
          true,
        ]);
      } else if (name === 'body' || name === 'subhead') {
        expect([name, 'body tracking must be neutral', tracking]).toEqual([
          name,
          'body tracking must be neutral',
          0,
        ]);
      }
    }
  });

  test('the display split is documented where Meta places it', () => {
    expect(MERIDIAN_DISPLAY_SPLIT).toBe(24);
  });

  test('Bengali gets a larger size, a taller line-height and open tracking', () => {
    // Bengali carries a headline bar (matra) and descends further than Latin, so
    // Latin line-heights clip it.
    expect(MERIDIAN_BENGALI.sizeScale).toBeGreaterThan(1);
    expect(MERIDIAN_BENGALI.lineHeightFloor).toBeGreaterThanOrEqual(1.3);
    expect(parseFloat(MERIDIAN_BENGALI.tracking)).toBeGreaterThanOrEqual(0);
  });

  test('Bengali line-height floor is well above the Latin floor', () => {
    expect(MERIDIAN_BENGALI.lineHeightFloor).toBeGreaterThan(MERIDIAN_TYPE_SCALE.body.line);
  });
});

describe('Meridian — dual-primary is enforced in the contract, not just the prose', () => {
  test('the ink and hazard actions are different colours in every theme', () => {
    // If they ever converge, the navigational signal is gone and the reserved
    // colour stops meaning anything.
    for (const theme of Object.values(MERIDIAN_THEMES)) {
      expect(theme.actionInk).not.toBe(theme.actionHazard);
      expect(theme.actionHazard).not.toBe(theme.actionInteractive);
    }
  });

  test('the hazard action is the brand crimson in light theme', () => {
    // Crimson is spent on hazard and on nothing else. This is the assertion that
    // fails if someone points --mrd-action-hazard at a navigation colour.
    expect(MERIDIAN_THEMES.light.actionHazard).toBe(MERIDIAN_PRIMITIVES.brandCrimson);
  });
});
