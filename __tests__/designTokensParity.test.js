/**
 * Legacy HDS compatibility aliases and native radius/touch facts.
 *
 * This suite deliberately does not claim that legacy NASA color aliases are the
 * palette rendered by the native app. Native Meridian semantic-theme parity is
 * tested in `apps/mobile/__tests__/nativeMeridianParity.test.tsx`; the hazard
 * exceptions recorded here became obsolete when native theme roles moved to
 * Meridian.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HDS_TOKENS,
  HDS_NASA_TOKENS,
  MERIDIAN_RADII,
  MERIDIAN_RADIUS_ROLES,
  getSeverityTokenScore,
} from '@hazardnet/design-system';
import * as webTokens from '../frontend/src/design-system/tokens';
import { NATIVE_RADIUS, TOUCH_MIN } from '../apps/mobile/src/theme/nativeTokens';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');
const WEB_CSS = ['index.css', 'styles/nasa-hds.css', 'styles/meridian.css']
  .map((file) => readFileSync(join(FRONTEND_SRC, file), 'utf8'))
  .join('\n');

/**
 * Reads a custom property, following `var(--other)` references.
 */
const cssVar = (name) => {
  let value = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(WEB_CSS)?.[1]?.trim() ?? null;
  for (let hop = 0; hop < 4 && value; hop += 1) {
    const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    if (!reference) break;
    value = new RegExp(`--${reference[1].slice(2)}\\s*:\\s*([^;]+);`).exec(WEB_CSS)?.[1]?.trim() ?? null;
  }
  return value;
};

const normalise = (value, numeric) => {
  if (value === null || value === undefined) return value;
  if (numeric) return Number.parseFloat(String(value));
  return String(value).toLowerCase();
};

/**
 * Legacy compatibility roles compare CSS aliases to the canonical HDS package values. `native`
 * names the value in that token package, not the native semantic theme. Radius rows do read the
 * actual native adapter.
 */
const COMPATIBILITY_ROLES = [
  { id: 'ink.primary', web: 'hds-color-carbon-90', native: () => HDS_NASA_TOKENS.colors.carbon90 },
  { id: 'surface.sunken', web: 'hds-color-carbon-10', native: () => HDS_NASA_TOKENS.colors.carbon10 },
  { id: 'hairline', web: 'hds-color-carbon-20', native: () => HDS_NASA_TOKENS.colors.carbon20 },
  { id: 'ink.secondary', web: 'hds-color-carbon-70', native: () => HDS_NASA_TOKENS.colors.carbon70 },
  { id: 'blue.interactive', web: 'hds-color-nasa-blue', native: () => HDS_NASA_TOKENS.colors.nasaBlue },
  { id: 'blue.shade', web: 'hds-color-nasa-blue-shade', native: () => HDS_NASA_TOKENS.colors.nasaBlueShade },
  { id: 'radius.chip', web: 'hn-radius-chip', native: () => NATIVE_RADIUS.chip, numeric: true },
  { id: 'radius.control', web: 'hn-radius-control', native: () => NATIVE_RADIUS.control, numeric: true },
  { id: 'radius.card', web: 'hn-radius-card', native: () => NATIVE_RADIUS.card, numeric: true },
  { id: 'radius.sheet', web: 'hn-radius-sheet', native: () => NATIVE_RADIUS.sheet, numeric: true },
];

describe('HazardNet legacy token compatibility', () => {
  test('the web path and the package are the same token object', () => {
    // The whole point of P0-2: there is one `HDS_TOKENS`, not a package copy and a web copy.
    expect(webTokens.HDS_TOKENS).toBe(HDS_TOKENS);
    expect(webTokens.HDS_NASA_TOKENS).toBe(HDS_NASA_TOKENS);
  });

  test('the package agrees with itself about a role', () => {
    // HDS_TOKENS and HDS_NASA_TOKENS are both exported from the same file; the same role must not
    // have two values there. (nasaBlueShade did: #0b3b95 against #0b3d91.)
    expect(HDS_TOKENS.colors.nasaBlueShade).toBe(HDS_NASA_TOKENS.colors.nasaBlueShade);
    expect(HDS_TOKENS.colors.primaryRedShade).toBe(HDS_NASA_TOKENS.colors.nasaRedShade);
    expect(HDS_TOKENS.colors.primaryRed).toBe(HDS_NASA_TOKENS.colors.nasaRed);
    expect(HDS_TOKENS.colors.surfaceCanvas).toBe(HDS_NASA_TOKENS.colors.carbon05);
  });

  test('every compatibility role resolves on both sides', () => {
    for (const role of COMPATIBILITY_ROLES) {
      const web = cssVar(role.web);
      const native = role.native();
      expect({ id: role.id, web: web === null ? 'MISSING' : 'ok', native: native === undefined ? 'MISSING' : 'ok' })
        .toEqual({ id: role.id, web: 'ok', native: 'ok' });
    }
  });

  test('every legacy compatibility role is identical across CSS and the token package', () => {
    const divergences = [];
    for (const role of COMPATIBILITY_ROLES) {
      const web = normalise(cssVar(role.web), role.numeric);
      const packageValue = normalise(role.native(), role.numeric);
      if (web !== packageValue) divergences.push(`${role.id}: CSS ${web} vs HDS token ${packageValue}`);
    }
    expect(divergences).toEqual([]);
  });

  test('platform differences are declared facts, not parity', () => {
    expect(HDS_TOKENS.touch.minTargetSize).toBe(44);
    expect(HDS_TOKENS.touch.minTargetSizeAndroid).toBe(48);
    expect(TOUCH_MIN).toBe(48);
    expect(HDS_TOKENS.touch.fabSize).toBe(60);
    expect(HDS_TOKENS.touch.fabIconSize).toBe(32);
  });

  test('radius is frozen on the Meridian scale, on both platforms', () => {
    // Backlog item 4: the web role tokens derive from `MERIDIAN_RADII`, the phone spreads
    // `MERIDIAN_RADIUS_ROLES`, and nothing re-types a number. This is the assertion that used to
    // be an exception row: the phone pinned `control`/`chip` to 2px while the web used 8-28px.
    expect(NATIVE_RADIUS.chip).toBe(MERIDIAN_RADIUS_ROLES.chip);
    expect(NATIVE_RADIUS.control).toBe(MERIDIAN_RADIUS_ROLES.control);
    expect(NATIVE_RADIUS.card).toBe(MERIDIAN_RADIUS_ROLES.card);
    expect(NATIVE_RADIUS.sheet).toBe(MERIDIAN_RADIUS_ROLES.sheet);
    expect(NATIVE_RADIUS.sheetIndicator).toBe(MERIDIAN_RADIUS_ROLES.pill);
    expect(MERIDIAN_RADIUS_ROLES).toEqual({
      chip: MERIDIAN_RADII.xs,
      control: MERIDIAN_RADII.sm,
      media: MERIDIAN_RADII.md,
      card: MERIDIAN_RADII.lg,
      sheet: MERIDIAN_RADII.sheet,
      feature: MERIDIAN_RADII.xxl,
      pill: MERIDIAN_RADII.pill,
    });
  });

  test('Multi-hazard severity scale contains all 5 agricultural levels', () => {
    const severity = HDS_TOKENS.colors.severity;
    expect(severity.low).toBeDefined();
    expect(severity.moderate).toBeDefined();
    expect(severity.high).toBeDefined();
    expect(severity.veryHigh).toBeDefined();
    expect(severity.extreme).toBeDefined();
  });

  test('getSeverityTokenScore returns appropriate token for scores', () => {
    expect(getSeverityTokenScore(0.95)).toEqual(HDS_TOKENS.colors.severity.extreme);
    expect(getSeverityTokenScore(0.75)).toEqual(HDS_TOKENS.colors.severity.veryHigh);
    expect(getSeverityTokenScore(0.55)).toEqual(HDS_TOKENS.colors.severity.high);
    expect(getSeverityTokenScore(0.35)).toEqual(HDS_TOKENS.colors.severity.moderate);
    expect(getSeverityTokenScore(0.15)).toEqual(HDS_TOKENS.colors.severity.low);
  });

  test('no family stack leads with a face the bundle does not ship', () => {
    // P0-3: the documented families (Instrument Sans, Plus Jakarta Sans, Anek Bangla, Baloo Da 2,
    // Inter) were never bundled. A stack may only lead with a shipped family or a platform face,
    // otherwise a machine that happens to have the font installed renders a different product.
    const allowedLeaders = new Set(['system-ui', '-apple-system', 'blinkmacsystemfont', "'noto sans bengali'", 'ui-monospace', 'sfmono-regular']);
    const offenders = [];
    for (const [name, stack] of Object.entries(HDS_TOKENS.typography.families)) {
      const leader = String(stack).split(',')[0].trim().replace(/"/g, "'").toLowerCase();
      if (!allowedLeaders.has(leader)) offenders.push(`${name}: ${leader}`);
    }
    expect(offenders).toEqual([]);
  });

  test('the Bengali stack is the shipped family and keeps its line-height floor', () => {
    expect(HDS_TOKENS.typography.lineHeights.bengali).toBeGreaterThanOrEqual(1.3);
    expect(HDS_TOKENS.typography.families.bengali).toContain('Noto Sans Bengali');
  });
});
