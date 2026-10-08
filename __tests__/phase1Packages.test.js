/**
 * Phase 1 Execution Verification: Decoupled Workspace Packages
 *
 * Verifies that `@hazardnet/design-system` and `@hazardnet/core` are properly structured and
 * export the Apple design tokens, their React Native resolution, and the platform-agnostic
 * forecast/alert contracts.
 *
 * Rewritten for the Apple migration: HDS v2.2 (`HDS_TOKENS`) and Material 3 Expressive
 * (`M3_EXPRESSIVE_TOKENS`) were two of the four parallel design systems this product was
 * carrying. Both are deleted. What this suite now pins is that the ONE surviving system
 * exports a complete, usable contract on both web and native.
 */

import {
  APPLE,
  APPLE_NATIVE,
  APPLE_NATIVE_RADIUS,
  APPLE_NATIVE_TOUCH,
  getSeverityTokenScore,
} from '../packages/design-system/src/index';
import { FORECAST_HORIZONS, severityBin, confidenceBin, canonicalKey } from '../packages/core/src/index';

describe('Phase 1 Workspace Decoupling — @hazardnet/design-system', () => {
  it('exports the Apple token contract the whole product renders from', () => {
    // The single accent, and the two grounds it has to work on.
    expect(APPLE.colors.primary).toBe('#0066cc');
    expect(APPLE.colors.primaryOnDark).toBe('#2997ff');
    // Body copy is 17px in this system, not 16.
    expect(APPLE.type.bodyMd.size).toBe(17);
    // The spec's ladder: 400 body, 500 labels, 600 headlines, 700 display.
    expect(Object.values(APPLE.weights)).toEqual([400, 500, 600, 700]);
    // Exactly one shadow, and it is not for UI.
    expect(APPLE.elevation.flat).toBe('none');
    expect(APPLE.elevation.product).toContain('30px');
    // Full-bleed tiles have no corner radius; the colour change is the divider.
    expect(APPLE.radii.none).toBe(0);
    expect(APPLE.space.section).toBe(96);
  });

  it('exports the dark theme, built from Apple\'s own dark tiles', () => {
    // The spec's dark canvas is OLED black; cards step up through Apple's tiles:
    // tile-1 grouped, tile-2 raised.
    expect(APPLE.dark.canvas).toBe('#000000');
    expect(APPLE.dark.grouped).toBe('#161617');
    expect(APPLE.dark.raised).toBe('#1c1c1e');
    // Action Blue measures 2.68:1 on tile-1 and must never be the dark-surface accent.
    expect(APPLE.dark.action).toBe('#2997ff');
  });

  it('exports the severity data layer with five distinct, labelled levels', () => {
    const levels = Object.keys(APPLE.severity);
    expect(levels).toEqual(['low', 'moderate', 'high', 'veryHigh', 'extreme']);
    // Colour is never the only carrier: every level ships a word too (WCAG 1.4.1).
    for (const level of levels) {
      expect(typeof APPLE.severity[level].label).toBe('string');
      expect(APPLE.severity[level].label.length).toBeGreaterThan(0);
      expect(APPLE.severity[level].text).toMatch(/^#[0-9a-f]{6}$/);
      expect(APPLE.severity[level].onDark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('exports two density tracks cut from the same scale', () => {
    // Same system at two volumes: the editorial surfaces keep the 96px section rhythm,
    // the operational console takes the 40px xl step off the same spacing scale.
    expect(APPLE.track.editorial.sectionBlock).toBe(96);
    expect(APPLE.track.console.sectionBlock).toBe(40);
    expect(APPLE.track.editorial.maxWidth).toBe(980);
    expect(APPLE.track.console.maxWidth).toBe(1280);
  });

  it('resolves the same system into React Native units for mobile and Windows', () => {
    expect(APPLE_NATIVE.colors.primary).toBe(APPLE.colors.primary);
    expect(APPLE_NATIVE.themes.dark.backgroundBase).toBe(APPLE.dark.canvas);
    // Android's 48dp floor is stricter than Apple's 44pt, so a cross-platform
    // control takes the stricter number.
    expect(APPLE_NATIVE_TOUCH.min).toBe(48);
    expect(APPLE_NATIVE_TOUCH.appleMin).toBe(44);
    // The sheet corner is the spec's xl radius (24), the same on web and native, not Material 3's 28.
    expect(APPLE_NATIVE_RADIUS.sheet).toBe(24);
  });

  it('maps severity scores onto the Apple severity set', () => {
    expect(getSeverityTokenScore(0.9).label).toBe('Extreme');
    expect(getSeverityTokenScore(0.1).label).toBe('Low');
    // Out-of-range input is clamped, not rejected: a model returning 1.04 must still alarm.
    expect(getSeverityTokenScore(1.04).label).toBe('Extreme');
    expect(getSeverityTokenScore(Number.NaN).label).toBe('Low');
  });
});

describe('Phase 1 Workspace Decoupling — @hazardnet/core', () => {
  it('exports forecast horizons and binning utilities', () => {
    expect(FORECAST_HORIZONS).toEqual(['7_days', '15_days']);
    expect(severityBin(0.85)).toBe('High');
    expect(confidenceBin(0.90)).toBe('Certain');
  });

  it('canonicalizes district name aliases', () => {
    expect(canonicalKey('Jessore')).toBe('jashore');
    expect(canonicalKey('Chittagong')).toBe('chattogram');
  });
});
