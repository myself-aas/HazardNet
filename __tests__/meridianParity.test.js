/**
 * Meridian TS ↔ CSS parity.
 *
 * packages/design-system/src/meridian.ts is the source of truth for values;
 * frontend/src/styles/meridian.css is how they reach the browser. Two files,
 * one system — so this test fails the build when they drift, which is the
 * failure mode that otherwise ships a web app that does not match its own
 * mobile shells.
 *
 * It parses the CSS rather than snapshotting it, so a formatting change is not
 * a failure and a value change is.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MERIDIAN_PRIMITIVES,
  MERIDIAN_RADII,
  MERIDIAN_SHADOWS,
  MERIDIAN_TOUCH,
  MERIDIAN_MOTION,
  MERIDIAN_Z,
  MERIDIAN_SPACE,
  MERIDIAN_FONTS,
} from '../packages/design-system/src/meridian';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = join(ROOT, 'frontend/src/styles/meridian.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/** Reads a custom property's value from the CSS, or null if it is not declared. */
function cssVar(name) {
  const match = CSS.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

function cssVarHex(name) {
  const value = cssVar(name);
  return value ? value.toLowerCase() : null;
}

describe('Meridian — every primitive the CSS claims exists in the token file', () => {
  const primitives = [
    ['mrd-ink', MERIDIAN_PRIMITIVES.ink],
    ['mrd-ink-soft', MERIDIAN_PRIMITIVES.inkSoft],
    ['mrd-ink-tertiary', MERIDIAN_PRIMITIVES.inkTertiary],
    ['mrd-ink-quaternary', MERIDIAN_PRIMITIVES.inkQuaternary],
    ['mrd-crimson', MERIDIAN_PRIMITIVES.brandCrimson],
    ['mrd-crimson-dark', MERIDIAN_PRIMITIVES.brandCrimsonDark],
    ['mrd-crimson-tint', MERIDIAN_PRIMITIVES.darkCrimsonTint],
    ['mrd-blue', MERIDIAN_PRIMITIVES.blue],
    ['mrd-blue-shade', MERIDIAN_PRIMITIVES.blueShade],
    ['mrd-blue-tint', MERIDIAN_PRIMITIVES.darkBlueTint],
    ['mrd-canvas', MERIDIAN_PRIMITIVES.canvas],
    ['mrd-canvas-grouped', MERIDIAN_PRIMITIVES.canvasGrouped],
    ['mrd-surface', MERIDIAN_PRIMITIVES.surface],
    ['mrd-hairline', MERIDIAN_PRIMITIVES.hairline],
    ['mrd-hairline-strong', MERIDIAN_PRIMITIVES.hairlineStrong],
    ['mrd-dark-canvas', MERIDIAN_PRIMITIVES.darkCanvas],
    ['mrd-dark-grouped', MERIDIAN_PRIMITIVES.darkGrouped],
    ['mrd-dark-surface', MERIDIAN_PRIMITIVES.darkSurface],
    ['mrd-dark-hairline', MERIDIAN_PRIMITIVES.darkHairline],
  ];

  test.each(primitives.map(([n, v]) => [n, v]))('--%s matches the token file', (name, expected) => {
    expect(cssVarHex(name)).toBe(expected.toLowerCase());
  });
});

describe('Meridian — radii parity', () => {
  const radii = [
    ['mrd-radius-xs', MERIDIAN_RADII.xs],
    ['mrd-radius-sm', MERIDIAN_RADII.sm],
    ['mrd-radius-md', MERIDIAN_RADII.md],
    ['mrd-radius-lg', MERIDIAN_RADII.lg],
    ['mrd-radius-xl', MERIDIAN_RADII.xl],
    ['mrd-radius-xxl', MERIDIAN_RADII.xxl],
    ['mrd-radius-sheet', MERIDIAN_RADII.sheet],
  ];

  test.each(radii.map(([n, v]) => [n, v]))('--%s matches the token file', (name, expected) => {
    expect(cssVar(name)).toBe(`${expected}px`);
  });

  test('--mrd-radius-pill is the full-round value', () => {
    expect(cssVar('mrd-radius-pill')).toBe(`${MERIDIAN_RADII.pill}px`);
  });
});

describe('Meridian — spacing parity', () => {
  test.each(Object.entries(MERIDIAN_SPACE).filter(([k]) => Number(k) > 0))(
    '--mrd-space-%s matches the token file',
    (step, value) => {
      expect(cssVar(`mrd-space-${step}`)).toBe(`${value}px`);
    },
  );
});

describe('Meridian — touch parity', () => {
  test('the 44px tap floor in CSS is the 44px tap floor in the token file', () => {
    expect(cssVar('mrd-tap-min')).toBe(`${MERIDIAN_TOUCH.minTarget}px`);
  });

  test.each([
    ['mrd-tap-android', MERIDIAN_TOUCH.minTargetAndroid],
    ['mrd-control-h', MERIDIAN_TOUCH.controlHeight],
    ['mrd-control-h-compact', MERIDIAN_TOUCH.controlHeightCompact],
    ['mrd-fab', MERIDIAN_TOUCH.fabSize],
  ])('--%s matches the token file', (name, expected) => {
    expect(cssVar(name)).toBe(`${expected}px`);
  });
});

describe('Meridian — motion parity', () => {
  test.each([
    ['mrd-duration-instant', MERIDIAN_MOTION.duration.instant],
    ['mrd-duration-fast', MERIDIAN_MOTION.duration.fast],
    ['mrd-duration-base', MERIDIAN_MOTION.duration.base],
    ['mrd-duration-slow', MERIDIAN_MOTION.duration.slow],
    ['mrd-duration-ambient', MERIDIAN_MOTION.duration.ambient],
  ])('--%s matches the token file', (name, expected) => {
    expect(cssVar(name)).toBe(`${expected}ms`);
  });

  test.each([
    ['mrd-ease-out', MERIDIAN_MOTION.ease.out],
    ['mrd-ease-standard', MERIDIAN_MOTION.ease.standard],
    ['mrd-ease-emphasized', MERIDIAN_MOTION.ease.emphasized],
    ['mrd-ease-spring', MERIDIAN_MOTION.ease.spring],
  ])('--%s matches the token file', (name, expected) => {
    expect(cssVar(name)).toBe(expected);
  });
});

describe('Meridian — elevation parity', () => {
  test.each([
    ['mrd-shadow-card', MERIDIAN_SHADOWS.card],
    ['mrd-shadow-card-hover', MERIDIAN_SHADOWS.cardHover],
    ['mrd-shadow-floating', MERIDIAN_SHADOWS.floating],
    ['mrd-shadow-modal', MERIDIAN_SHADOWS.modal],
    ['mrd-shadow-console', MERIDIAN_SHADOWS.console],
  ])('--%s matches the token file', (name, expected) => {
    // Whitespace-normalised: CSS may wrap the value across lines.
    expect((cssVar(name) ?? '').replace(/\s+/g, ' ')).toBe(expected.replace(/\s+/g, ' '));
  });
});

describe('Meridian — z-scale parity', () => {
  test.each(Object.entries(MERIDIAN_Z))('--mrd-z-%s matches the token file', (name, value) => {
    expect(Number(cssVar(`mrd-z-${name.replace(/([A-Z])/g, '-$1').toLowerCase()}`))).toBe(value);
  });
});

describe('Meridian — fonts stay open-source', () => {
  /**
   * Apple's SF Pro and Meta's Optimistic are both proprietary. HazardNet also
   * has a hard "no remote font URL" contract. This asserts neither a banned
   * family nor a remote fetch can enter the stacks.
   */
  const BANNED = ['sf pro', 'san francisco', 'optimistic', 'new york', 'sf compact', 'sf mono'];

  test.each([
    ['display', MERIDIAN_FONTS.display],
    ['text', MERIDIAN_FONTS.text],
    ['mono', MERIDIAN_FONTS.mono],
    ['bengali', MERIDIAN_FONTS.bengali],
    ['bengaliDisplay', MERIDIAN_FONTS.bengaliDisplay],
  ])('%s stack ships no proprietary face', (_name, stack) => {
    const lowered = stack.toLowerCase();
    for (const banned of BANNED) {
      expect(lowered).not.toContain(banned);
    }
  });

  test('the CSS declares no remote font fetch', () => {
    expect(CSS).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
    expect(CSS).not.toMatch(/fonts\.googleapis\.com/i);
    expect(CSS).not.toMatch(/@font-face\s*\{[^}]*url\(\s*['"]?https?:/is);
  });

  test('the CSS font stacks match the token file', () => {
    expect((cssVar('mrd-font-display') ?? '').replace(/\s+/g, ' ')).toBe(
      MERIDIAN_FONTS.display.replace(/\s+/g, ' '),
    );
    expect((cssVar('mrd-font-text') ?? '').replace(/\s+/g, ' ')).toBe(
      MERIDIAN_FONTS.text.replace(/\s+/g, ' '),
    );
  });
});

describe('Meridian — the CSS layer is actually wired in', () => {
  test('index.css imports meridian.css after the NASA layer', () => {
    const indexCss = readFileSync(join(ROOT, 'frontend/src/index.css'), 'utf8');
    const nasaAt = indexCss.indexOf('./styles/nasa-hds.css');
    const meridianAt = indexCss.indexOf('./styles/meridian.css');
    expect(nasaAt).toBeGreaterThan(-1);
    expect(meridianAt).toBeGreaterThan(-1);
    // Last import wins for equal-specificity rules, so Meridian must come after.
    expect(meridianAt).toBeGreaterThan(nasaAt);
  });
});
