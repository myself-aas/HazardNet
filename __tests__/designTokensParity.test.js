/**
 * Web <-> native token parity: one source, one value per role, declared exceptions.
 *
 * What this file used to be: three hard-coded hex assertions (`primaryRedShade`, `nasaBlueShade`,
 * `inkPrimary`) against `frontend/src/design-system/tokens.ts` - a 179-line copy of the package's
 * `HDS_TOKENS` that no component rendered from. It was green in exactly the state the whole-system
 * audit calls P0-2: the web drew danger as `#970002`, the phone drew SEVERE as `#f64137`, and the
 * test asserted the copy rather than the contract. See
 * `docs/audits/2026-10-03-frontend-design-system-audit.md` §3 P0-2 and §5.1.
 *
 * What it asserts now:
 *   1. one source       - the web path and the package export the same object, so a future
 *                         "just copy it into frontend/" cannot pass;
 *   2. one value/role   - each role below resolves identically across web CSS and the native
 *                         theme, or it appears in PARITY_EXCEPTIONS with a reason;
 *   3. no stale rows    - a declared exception whose two sides now agree fails the suite, so
 *                         fixing a divergence forces the row to be deleted;
 *   4. platform facts   - the differences that are real per platform (44pt vs 48dp touch, the
 *                         native-only radius pins) are declared as facts, not smuggled in as
 *                         parity.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HDS_TOKENS, HDS_NASA_TOKENS, getSeverityTokenScore } from '@hazardnet/design-system';
import * as webTokens from '../frontend/src/design-system/tokens';
import { NATIVE_RADIUS, TOUCH_MIN } from '../apps/mobile/src/theme/nativeTokens';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_SRC = join(ROOT, 'frontend/src');
const WEB_CSS = ['index.css', 'styles/nasa-hds.css', 'styles/meridian.css']
  .map((file) => readFileSync(join(FRONTEND_SRC, file), 'utf8'))
  .join('\n');

const cssVar = (name) => {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(WEB_CSS);
  return match ? match[1].trim() : null;
};

const normalise = (value, numeric) => {
  if (value === null || value === undefined) return value;
  if (numeric) return Number.parseFloat(String(value));
  return String(value).toLowerCase();
};

/**
 * A role is only parity-checkable if both sides can be read programmatically. `web` is a custom
 * property name; `native` is the value the native theme actually resolves (the package's
 * canonical NASA set, or `NATIVE_RADIUS` from `apps/mobile`).
 */
const ROLES = [
  { id: 'ink.primary', web: 'hds-color-carbon-90', native: () => HDS_NASA_TOKENS.colors.carbon90 },
  { id: 'surface.sunken', web: 'hds-color-carbon-10', native: () => HDS_NASA_TOKENS.colors.carbon10 },
  { id: 'hairline', web: 'hds-color-carbon-20', native: () => HDS_NASA_TOKENS.colors.carbon20 },
  { id: 'ink.secondary', web: 'hds-color-carbon-70', native: () => HDS_NASA_TOKENS.colors.carbon70 },
  { id: 'blue.interactive', web: 'hds-color-nasa-blue', native: () => HDS_NASA_TOKENS.colors.nasaBlue },
  { id: 'blue.shade', web: 'hds-color-nasa-blue-shade', native: () => HDS_NASA_TOKENS.colors.nasaBlueShade },
  { id: 'danger.brand', web: 'hn-brand-red', native: () => HDS_NASA_TOKENS.colors.nasaRed },
  { id: 'danger.brandDark', web: 'hn-brand-red-dark', native: () => HDS_NASA_TOKENS.colors.nasaRedShade },
  { id: 'radius.control', web: 'hn-radius-control', native: () => NATIVE_RADIUS.control, numeric: true },
  { id: 'radius.sheet', web: 'hn-radius-sheet', native: () => NATIVE_RADIUS.sheetIndicator, numeric: true },
];

/**
 * Divergences that are real, understood, and NOT yet reconciled. Each row records both sides
 * exactly: change either side and the test tells you to update or delete the row. An empty object
 * here is the goal.
 */
const PARITY_EXCEPTIONS = {
  'danger.brand': {
    web: '#970002',
    native: '#f64137',
    why: 'Two different grounds, two different reds. The web reserves the mark crimson #970002 for navigation and error on light surfaces (it is the only red that clears AA there, and the Meridian argument for keeping crimson off on-page actions is documented in index.css). Native uses NASA red #f64137 for SEVERE on dark grounds, where #970002 would fall to roughly 3:1. Owner action: either split the role into severeOnLight/severeOnDark in the package and have both platforms pick per mode, or re-derive the native SEVERE ramp from the web crimson.',
  },
  'danger.brandDark': {
    web: '#7B1D21',
    native: '#b60109',
    why: 'Same split as danger.brand, one step darker: the web shade is the mark crimson darkened for hover/pressed on light; the native shade is NASA red darkened for error text on white.',
  },
  'radius.control': {
    web: '8px',
    native: 2,
    why: 'Meridian control radius (8px) versus the HDS 2px control shape the native theme pins. Deliberate for now - the phone follows HDS geometry - but it is the visible reason the two products do not look like one product. Owner action: freeze one scale (audit backlog item 4).',
  },
  'radius.sheet': {
    web: '28px',
    native: 2,
    why: 'Meridian sheet radius (28px) versus the native sheetIndicator pin (2px). Same decision as radius.control, same backlog item.',
  },
};

describe('HazardNet token parity contract', () => {
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

  test('every declared role resolves on both sides', () => {
    for (const role of ROLES) {
      const web = cssVar(role.web);
      const native = role.native();
      expect({ id: role.id, web: web === null ? 'MISSING' : 'ok', native: native === undefined ? 'MISSING' : 'ok' })
        .toEqual({ id: role.id, web: 'ok', native: 'ok' });
    }
  });

  test('each role has one value across web and native, or a declared exception', () => {
    const undeclared = [];
    for (const role of ROLES) {
      const web = normalise(cssVar(role.web), role.numeric);
      const native = normalise(role.native(), role.numeric);
      if (web === native) continue;
      if (!(role.id in PARITY_EXCEPTIONS)) undeclared.push(`${role.id}: web ${web} vs native ${native}`);
    }
    expect(undeclared).toEqual([]);
  });

  test('declared exceptions match reality, and cannot go stale', () => {
    const stale = [];
    for (const role of ROLES) {
      const web = normalise(cssVar(role.web), role.numeric);
      const native = normalise(role.native(), role.numeric);
      if (web === native) {
        if (role.id in PARITY_EXCEPTIONS) stale.push(`${role.id} now agrees (${web}) - delete its exception`);
        continue;
      }
      const declared = PARITY_EXCEPTIONS[role.id];
      if (!declared) continue; // reported by the previous test
      const declaredWeb = normalise(declared.web, role.numeric);
      const declaredNative = normalise(declared.native, role.numeric);
      if (declaredWeb !== web || declaredNative !== native) {
        stale.push(`${role.id}: declared web ${declaredWeb}/native ${declaredNative} but observed web ${web}/native ${native}`);
      }
      expect(typeof declared.why).toBe('string');
      expect(declared.why.length).toBeGreaterThan(40);
    }
    expect(stale).toEqual([]);
  });

  test('platform differences are declared facts, not parity', () => {
    expect(HDS_TOKENS.touch.minTargetSize).toBe(44);
    expect(HDS_TOKENS.touch.minTargetSizeAndroid).toBe(48);
    expect(TOUCH_MIN).toBe(48);
    expect(HDS_TOKENS.touch.fabSize).toBe(60);
    expect(HDS_TOKENS.touch.fabIconSize).toBe(32);
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
