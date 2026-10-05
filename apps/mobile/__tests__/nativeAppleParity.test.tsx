/**
 * Native ↔ web parity for the Apple design system.
 *
 * Successor to `nativeMeridianParity.test.tsx`. The job is narrow and important:
 * `appleNative.ts` is a *translation* of `apple.ts` into React Native's dialect
 * (numbers instead of `px`, absolute line heights instead of ratios, `System`
 * instead of a font stack). A translation is allowed to change the units. It is
 * not allowed to change the values.
 *
 * So almost nothing here is a hard-coded expectation: each assertion reads the
 * web token and the native token and demands they agree. The handful of real
 * literals are the places where native deliberately diverges, and each one is
 * commented with why — those are the rules, and they are pinned so the
 * divergence stays a decision rather than an accident.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import {
  APPLE,
  APPLE_COLORS,
  APPLE_NEUTRAL,
  APPLE_RADII,
  APPLE_SPACE,
  APPLE_TYPE,
  APPLE_TOUCH,
  APPLE_MOTION,
  APPLE_SEVERITY,
  APPLE_NATIVE,
  APPLE_NATIVE_COLORS,
  APPLE_NATIVE_RADIUS,
  APPLE_NATIVE_SPACE,
  APPLE_NATIVE_TYPE,
  APPLE_NATIVE_TOUCH,
  APPLE_NATIVE_MOTION,
  APPLE_NATIVE_THEMES,
  contrastRatio,
} from '@hazardnet/design-system';
import { render, screen, act } from '../src/test/test-utils';
import { Text as AppleText } from '../src/design-system/Text';
import { BUTTON_HEIGHTS } from '../src/design-system/Button';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { DARK_THEME, LIGHT_THEME, OLED_THEME, getTheme } from '../src/theme/theme';
import {
  NATIVE_FONT_SCALE_MAX,
  NATIVE_TYPE_ROLE_MAP,
  TYPE_ROLES,
  TOUCH_MIN,
} from '../src/theme/nativeTokens';
import { useSettingsStore } from '../src/state/settingsStore';

const SEVERITY_LEVELS = ['low', 'moderate', 'high', 'veryHigh', 'extreme'] as const;

function ThemeAndTextProbe() {
  const { theme } = useTheme();
  return (
    <>
      <AppleText testID="native-body" role="body">Alert details</AppleText>
      <AppleText testID="native-secondary" role="caption" color="textMuted">Updated just now</AppleText>
      <AppleText testID="theme-label" role="metadata">{theme.colors.textPrimary}</AppleText>
    </>
  );
}

function flatStyle(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

function resetPreferences() {
  useSettingsStore.setState({ theme: 'light', largeText: false, boldText: false });
}

beforeEach(() => {
  resetPreferences();
});

describe('appleNative is a translation of apple, not a second system', () => {
  describe('colour', () => {
    it('takes every surface and ink straight from the web tokens', () => {
      expect(APPLE_NATIVE_COLORS.surfaceWhite).toBe(APPLE_COLORS.canvas);
      expect(APPLE_NATIVE_COLORS.surfaceSunken).toBe(APPLE_COLORS.canvasParchment);
      expect(APPLE_NATIVE_COLORS.surfaceRaised).toBe(APPLE_COLORS.surfacePearl);
      expect(APPLE_NATIVE_COLORS.surfaceBlack).toBe(APPLE_COLORS.surfaceBlack);
      expect(APPLE_NATIVE_COLORS.inkPrimary).toBe(APPLE_COLORS.ink);
      expect(APPLE_NATIVE_COLORS.inkSoft).toBe(APPLE_NEUTRAL['60']);
      expect(APPLE_NATIVE_COLORS.inkMuted).toBe(APPLE_NEUTRAL['50']);
      expect(APPLE_NATIVE_COLORS.inkDisabled).toBe(APPLE_NEUTRAL['40']);
    });

    it('carries the three dark tiles across unchanged, so dark mode is one language', () => {
      expect(APPLE_NATIVE_COLORS.surfaceTile1).toBe(APPLE_COLORS.surfaceTile1);
      expect(APPLE_NATIVE_COLORS.surfaceTile2).toBe(APPLE_COLORS.surfaceTile2);
      expect(APPLE_NATIVE_COLORS.surfaceTile3).toBe(APPLE_COLORS.surfaceTile3);
    });

    it('ships exactly one accent, in the web system\u2019s three grounds', () => {
      expect(APPLE_NATIVE_COLORS.primary).toBe(APPLE_COLORS.primary);
      expect(APPLE_NATIVE_COLORS.primaryOnDark).toBe(APPLE_COLORS.primaryOnDark);
      expect(APPLE_NATIVE_COLORS.primaryFocus).toBe(APPLE_COLORS.primaryFocus);
      expect(APPLE_NATIVE_COLORS.onPrimary).toBe(APPLE_COLORS.onPrimary);
    });

    it('has no second accent hiding in the native palette', () => {
      // Every non-severity colour must be a surface, an ink, a hairline, a glass
      // material, or the one accent. A stray brand hue would show up here.
      const accents = new Set<string>([
        APPLE_COLORS.primary,
        APPLE_COLORS.primaryOnDark,
        APPLE_COLORS.primaryFocus,
      ]);
      const chrome = Object.entries(APPLE_NATIVE_COLORS)
        .filter(([key, value]) => typeof value === 'string' && !key.startsWith('glass'))
        .map(([, value]) => value as string);
      const saturated = chrome.filter((hex) => {
        const m = /^#([0-9a-f]{6})$/i.exec(hex);
        if (!m) return false;
        const n = parseInt(m[1], 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        return Math.max(r, g, b) - Math.min(r, g, b) > 24;
      });
      expect(saturated.filter((hex) => !accents.has(hex))).toEqual([]);
    });

    it('mirrors all five severity levels from the web severity scale', () => {
      for (const level of SEVERITY_LEVELS) {
        expect(APPLE_NATIVE_COLORS.severity[level].color).toBe(APPLE_SEVERITY[level].text);
        expect(APPLE_NATIVE_COLORS.severity[level].surface).toBe(APPLE_SEVERITY[level].surface);
        expect(APPLE_NATIVE_COLORS.severity[level].onDark).toBe(APPLE_SEVERITY[level].onDark);
        expect(APPLE_NATIVE_COLORS.severity[level].label).toBe(APPLE_SEVERITY[level].label);
      }
    });

    it('keeps a word on every severity level, so native never encodes by colour alone', () => {
      for (const level of SEVERITY_LEVELS) {
        expect(APPLE_NATIVE_COLORS.severity[level].label.length).toBeGreaterThan(0);
      }
      const labels = SEVERITY_LEVELS.map((l) => APPLE_NATIVE_COLORS.severity[l].label);
      expect(new Set(labels).size).toBe(SEVERITY_LEVELS.length);
    });
  });

  describe('geometry', () => {
    it('uses Apple\u2019s radii, renamed by role but never re-valued', () => {
      expect(APPLE_NATIVE_RADIUS.xs).toBe(APPLE_RADII.xs);
      expect(APPLE_NATIVE_RADIUS.control).toBe(APPLE_RADII.sm);
      expect(APPLE_NATIVE_RADIUS.chip).toBe(APPLE_RADII.md);
      expect(APPLE_NATIVE_RADIUS.card).toBe(APPLE_RADII.lg);
      expect(APPLE_NATIVE_RADIUS.sheet).toBe(APPLE_RADII.lg);
      expect(APPLE_NATIVE_RADIUS.feature).toBe(APPLE_RADII.lg);
    });

    it('invents no radius outside the web scale', () => {
      const allowed = new Set<number>([...Object.values(APPLE_RADII), 0, 9999]);
      for (const value of Object.values(APPLE_NATIVE_RADIUS)) {
        expect(allowed.has(value)).toBe(true);
      }
    });

    it('reuses the 4/8/12/17/24/32/48/80 spacing scale verbatim', () => {
      for (const step of Object.keys(APPLE_SPACE) as (keyof typeof APPLE_SPACE)[]) {
        expect(APPLE_NATIVE_SPACE[step]).toBe(APPLE_SPACE[step]);
      }
    });
  });

  describe('type', () => {
    it('resolves the face through RN\u2019s System alias rather than shipping SF Pro', () => {
      // DESIGN.md sanctions the platform UI face; RN maps `System` to SF on iOS
      // and Roboto on Android. Bundling a font file would be the wrong answer.
      expect(APPLE_NATIVE_TYPE.families.text).toBe('System');
      expect(APPLE_NATIVE_TYPE.families.display).toBe('System');
      expect(JSON.stringify(APPLE_NATIVE_TYPE.families)).not.toMatch(/SF-?Pro/i);
    });

    it('carries every named web style across at the same size, weight and tracking', () => {
      const names = Object.keys(APPLE_TYPE) as (keyof typeof APPLE_TYPE)[];
      expect(names.length).toBeGreaterThanOrEqual(16);
      for (const name of names) {
        const web = APPLE_TYPE[name];
        const native = APPLE_NATIVE_TYPE.scale[name];
        expect(native).toBeDefined();
        expect(native.fontSize).toBe(web.size);
        expect(native.letterSpacing).toBe(web.tracking);
        expect(native.fontWeight).toBe(String(web.weight));
      }
    });

    it('resolves ratio line heights into absolute ones without rounding drift', () => {
      for (const name of Object.keys(APPLE_TYPE) as (keyof typeof APPLE_TYPE)[]) {
        const web = APPLE_TYPE[name];
        const native = APPLE_NATIVE_TYPE.scale[name];
        expect(native.lineHeight).toBe(Math.round(web.size * web.line));
        // And the resolved value must still be within half a pixel of the ratio.
        expect(Math.abs(native.lineHeight / native.fontSize - web.line)).toBeLessThan(0.02);
      }
    });

    it('keeps the four-weight set, with no 500', () => {
      const weights = new Set(
        Object.values(APPLE_NATIVE_TYPE.scale).map((s) => s.fontWeight),
      );
      expect([...weights].sort()).toEqual(
        [...new Set(Object.values(APPLE_TYPE).map((s) => String(s.weight)))].sort(),
      );
      expect(weights.has('500' as never)).toBe(false);
    });

    it('still reads body at 17', () => {
      expect(APPLE_NATIVE_TYPE.scale.body.fontSize).toBe(17);
      expect(APPLE_NATIVE_TYPE.scale.body.fontSize).toBe(APPLE_TYPE.body.size);
    });
  });

  describe('ergonomics and motion', () => {
    it('raises the touch floor to 48 on purpose, and remembers Apple\u2019s 44', () => {
      // The one deliberate divergence in geometry: Android's Material floor is
      // 48dp, so the shared minimum is the stricter of the two.
      expect(APPLE_NATIVE_TOUCH.min).toBe(48);
      expect(APPLE_NATIVE_TOUCH.appleMin).toBe(APPLE_TOUCH.min);
      expect(APPLE_NATIVE_TOUCH.min).toBeGreaterThanOrEqual(APPLE_TOUCH.min);
      expect(TOUCH_MIN).toBeGreaterThanOrEqual(APPLE_TOUCH.min);
    });

    it('presses with the web system\u2019s scale, not a bespoke one', () => {
      expect(APPLE_NATIVE_MOTION.pressScale).toBe(APPLE_MOTION.pressScale);
      expect(APPLE_NATIVE_MOTION.pressScale).toBe(0.95);
    });

    it('uses the same durations and the same curve, as RN control points', () => {
      expect(APPLE_NATIVE_MOTION.fastMs).toBe(APPLE_MOTION.duration.press);
      expect(APPLE_NATIVE_MOTION.normalMs).toBe(APPLE_MOTION.duration.base);
      expect(APPLE_NATIVE_MOTION.easing).toEqual([0.25, 0.1, 0.25, 1]);
    });

    it('settles rather than bounces', () => {
      expect(APPLE_NATIVE_MOTION.spring).toEqual(APPLE_MOTION.springStandard);
      const { damping, stiffness } = APPLE_NATIVE_MOTION.spring as { damping: number; stiffness: number };
      // Critically damped or over-damped: damping >= 2*sqrt(stiffness * mass=1).
      expect(damping).toBeGreaterThanOrEqual(2 * Math.sqrt(stiffness) - 0.001);
    });
  });

  describe('themes', () => {
    it('builds light from the light web tokens', () => {
      const t = APPLE_NATIVE_THEMES.light;
      expect(t.backgroundBase).toBe(APPLE_COLORS.canvas);
      expect(t.backgroundGrouped).toBe(APPLE_COLORS.canvasParchment);
      expect(t.label).toBe(APPLE_COLORS.ink);
      expect(t.action).toBe(APPLE_COLORS.primary);
      expect(t.focusRing).toBe(APPLE_COLORS.primaryFocus);
    });

    it('builds dark from Apple\u2019s own dark tiles, not from inverted light', () => {
      const t = APPLE_NATIVE_THEMES.dark;
      expect([
        APPLE_COLORS.surfaceTile1,
        APPLE_COLORS.surfaceTile2,
        APPLE_COLORS.surfaceTile3,
        APPLE_COLORS.surfaceBlack,
      ]).toContain(t.backgroundBase);
      expect(t.action).toBe(APPLE_COLORS.primaryOnDark);
      expect(t.label).toBe(APPLE_COLORS.bodyOnDark);
    });

    it('treats highContrast as pushed-light, never as darker dark', () => {
      const t = APPLE_NATIVE_THEMES.highContrast;
      expect(t.backgroundBase).toBe(APPLE_COLORS.canvas);
      expect(t.label).toBe(APPLE_COLORS.surfaceBlack);
      expect(contrastRatio(t.label, t.backgroundBase)).toBeGreaterThanOrEqual(15);
    });

    it('clears AA for body and AAA-for-large on every theme', () => {
      for (const [name, t] of Object.entries(APPLE_NATIVE_THEMES)) {
        for (const ground of [t.backgroundBase, t.backgroundGrouped, t.backgroundElevated]) {
          expect(`${name}:label:${contrastRatio(t.label, ground) >= 4.5}`).toBe(`${name}:label:true`);
          expect(`${name}:second:${contrastRatio(t.labelSecondary, ground) >= 4.5}`).toBe(`${name}:second:true`);
        }
        expect(`${name}:action:${contrastRatio(t.action, t.backgroundBase) >= 4.5}`).toBe(`${name}:action:true`);
        expect(`${name}:onAction:${contrastRatio(t.actionForeground, t.action) >= 4.5}`).toBe(`${name}:onAction:true`);
      }
    });

    it('keeps the focus ring visible against its own ground', () => {
      for (const [name, t] of Object.entries(APPLE_NATIVE_THEMES)) {
        expect(`${name}:${contrastRatio(t.focusRing, t.backgroundBase) >= 3}`).toBe(`${name}:true`);
      }
    });
  });

  describe('the aggregate', () => {
    it('exposes the same shape the web aggregate does', () => {
      expect(APPLE_NATIVE.colors).toBe(APPLE_NATIVE_COLORS);
      expect(APPLE_NATIVE.radii).toBe(APPLE_NATIVE_RADIUS);
      expect(APPLE_NATIVE.spacing).toBe(APPLE_NATIVE_SPACE);
      expect(APPLE_NATIVE.typography).toBe(APPLE_NATIVE_TYPE);
      expect(APPLE_NATIVE.motion).toBe(APPLE_NATIVE_MOTION);
      expect(APPLE_NATIVE.themes).toBe(APPLE_NATIVE_THEMES);
    });

    it('declares itself part of the Apple system', () => {
      expect(APPLE_NATIVE.brand.system).toBe('Apple');
      // The web aggregate intentionally carries no brand block — it is the
      // system, not a product. Native names the product it dresses.
      expect(APPLE).not.toHaveProperty('brand');
      expect(APPLE_NATIVE.brand.platform).toBe('HazardNet');
    });
  });
});

describe('the app layer actually consumes those tokens', () => {
  it('renders body text at the Apple body size', () => {
    render(<ThemeProvider><ThemeAndTextProbe /></ThemeProvider>);
    expect(flatStyle('native-body').fontSize).toBe(APPLE_NATIVE_TYPE.scale.body.fontSize);
  });

  it('resolves every native type role to the Apple style it is mapped to', () => {
    // The native shell keeps its own role names, but NATIVE_TYPE_ROLE_MAP is the
    // contract that says which Apple style each one means. This is the assertion
    // that stops a role quietly drifting to a near-miss size.
    const roles = Object.keys(TYPE_ROLES) as (keyof typeof TYPE_ROLES)[];
    expect(roles.sort()).toEqual(Object.keys(NATIVE_TYPE_ROLE_MAP).sort());
    for (const role of roles) {
      const apple = APPLE_NATIVE_TYPE.scale[NATIVE_TYPE_ROLE_MAP[role]];
      expect(`${role}:size:${TYPE_ROLES[role].size}`).toBe(`${role}:size:${apple.fontSize}`);
      expect(`${role}:weight:${TYPE_ROLES[role].weight}`).toBe(`${role}:weight:${apple.fontWeight}`);
      expect(`${role}:line:${TYPE_ROLES[role].lineHeight}`).toBe(`${role}:line:${apple.lineHeight}`);
    }
  });

  it('sizes every button at or above the native touch floor', () => {
    for (const [name, height] of Object.entries(BUTTON_HEIGHTS)) {
      expect(`${name}:${(height as number) >= APPLE_NATIVE_TOUCH.min}`).toBe(`${name}:true`);
    }
  });

  it('resolves each app theme to the matching Apple native theme', () => {
    expect(LIGHT_THEME.colors.background).toBe(APPLE_NATIVE_THEMES.light.backgroundBase);
    expect(LIGHT_THEME.colors.textPrimary).toBe(APPLE_NATIVE_THEMES.light.label);
    expect(LIGHT_THEME.colors.primaryAction).toBe(APPLE_NATIVE_THEMES.light.action);
    expect(DARK_THEME.colors.background).toBe(APPLE_NATIVE_THEMES.dark.backgroundBase);
    expect(DARK_THEME.colors.textPrimary).toBe(APPLE_NATIVE_THEMES.dark.label);
    expect(DARK_THEME.colors.primaryAction).toBe(APPLE_NATIVE_THEMES.dark.action);
    // OLED is the one native-only ground: true black, for emissive panels. It is
    // still an Apple surface, not a fourth palette.
    expect(OLED_THEME.colors.background).toBe(APPLE_COLORS.surfaceBlack);
    expect(OLED_THEME.colors.primaryAction).toBe(APPLE_NATIVE_THEMES.dark.action);
  });

  it('switches ground when the stored preference changes', () => {
    render(<ThemeProvider><ThemeAndTextProbe /></ThemeProvider>);
    const light = screen.getByTestId('theme-label').props.children;
    act(() => { useSettingsStore.setState({ theme: 'dark' }); });
    expect(screen.getByTestId('theme-label').props.children).not.toBe(light);
  });

  it('never caps Dynamic Type, because clipping a hazard warning is not an option', () => {
    // RN reads 0 as "no maximum multiplier". A non-zero value here would mean a
    // user with large text set could have the warning truncated.
    expect(NATIVE_FONT_SCALE_MAX).toBe(0);
  });

  it('builds a theme for every mode the app offers', () => {
    for (const mode of ['light', 'dark', 'oled'] as const) {
      expect(`${mode}:${getTheme(mode) !== undefined}`).toBe(`${mode}:true`);
    }
  });
});
