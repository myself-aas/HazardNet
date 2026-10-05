/** Cross-platform Meridian contracts for the Expo implementation. */

import React from 'react';
import { StyleSheet } from 'react-native';
import {
  MERIDIAN_PRIMITIVES,
  MERIDIAN_SEVERITY,
  MERIDIAN_THEMES,
  contrastRatio,
} from '@hazardnet/design-system';
import { render, screen, act } from '../src/test/test-utils';
import { Text as MeridianText } from '../src/design-system/Text';
import { BUTTON_HEIGHTS } from '../src/design-system/Button';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { DARK_THEME, LIGHT_THEME, OLED_THEME, getTheme } from '../src/theme/theme';
import { NATIVE_FONT_SCALE_MAX, TYPE_ROLES, TOUCH_MIN } from '../src/theme/nativeTokens';
import { useSettingsStore } from '../src/state/settingsStore';

const STATUS_ROLES = [
  ['severe', 'severeBg', 'severeSolid', 'severeOnSolid'],
  ['warning', 'warningBg', 'warningSolid', 'warningOnSolid'],
  ['watch', 'watchBg', 'watchSolid', 'watchOnSolid'],
  ['allClear', 'allClearBg', 'allClearSolid', 'allClearOnSolid'],
] as const;

function ThemeAndTextProbe() {
  const { theme } = useTheme();
  return (
    <>
      <MeridianText testID="native-body" role="body">Alert details</MeridianText>
      <MeridianText testID="native-secondary" role="caption" color="textMuted">Updated just now</MeridianText>
      <MeridianText testID="theme-label" role="metadata">{theme.colors.textPrimary}</MeridianText>
    </>
  );
}

function flatStyle(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

function resetPreferences() {
  useSettingsStore.setState({
    theme: 'light',
    largeText: false,
    boldText: false,
    increaseContrast: false,
  });
}

function renderThemeProbe() {
  return render(<ThemeAndTextProbe />, {
    wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
  });
}

describe('native Meridian theme parity', () => {
  beforeEach(resetPreferences);

  it('maps common light/dark roles to the shared Meridian palettes', () => {
    expect(LIGHT_THEME.colors.background).toBe(MERIDIAN_THEMES.light.backgroundBase);
    expect(LIGHT_THEME.colors.surface).toBe(MERIDIAN_THEMES.light.backgroundElevated);
    expect(LIGHT_THEME.colors.textPrimary).toBe(MERIDIAN_THEMES.light.label);
    expect(LIGHT_THEME.colors.interactive).toBe(MERIDIAN_THEMES.light.actionInteractive);
    expect(LIGHT_THEME.colors.primaryAction).toBe(MERIDIAN_THEMES.light.actionInk);
    expect(LIGHT_THEME.colors.dangerAction).toBe(MERIDIAN_THEMES.light.actionHazard);

    expect(DARK_THEME.colors.background).toBe(MERIDIAN_THEMES.dark.backgroundBase);
    expect(DARK_THEME.colors.surface).toBe(MERIDIAN_THEMES.dark.backgroundElevated);
    expect(DARK_THEME.colors.textPrimary).toBe(MERIDIAN_THEMES.dark.label);
    expect(DARK_THEME.colors.interactive).toBe(MERIDIAN_THEMES.dark.actionInteractive);
    expect(DARK_THEME.colors.primaryAction).toBe(MERIDIAN_THEMES.dark.actionInk);
    expect(DARK_THEME.colors.dangerAction).toBe(MERIDIAN_THEMES.dark.actionHazard);

    expect(OLED_THEME.colors.background).toBe('#000000');
    expect(OLED_THEME.colors.textPrimary).toBe(MERIDIAN_THEMES.dark.label);
  });

  it.each([
    ['light', LIGHT_THEME],
    ['dark', DARK_THEME],
    ['OLED', OLED_THEME],
    ['light high contrast', getTheme('light', true)],
    ['dark high contrast', getTheme('dark', true)],
  ] as const)('%s keeps status ink and filled labels readable', (_label, theme) => {
    for (const [labelRole, _surfaceRole, fillRole, onFillRole] of STATUS_ROLES) {
      const colors = theme.colors;
      expect(contrastRatio(colors[labelRole], colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors[onFillRole], colors[fillRole])).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(theme.colors.primaryActionText, theme.colors.primaryAction)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.dangerActionText, theme.colors.dangerAction)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.interactiveText, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps severe status tied to the shared severity source and the hazard action role', () => {
    expect(LIGHT_THEME.colors.severe).toBe(MERIDIAN_SEVERITY.extreme.color);
    expect(LIGHT_THEME.colors.severeBg).toBe(MERIDIAN_SEVERITY.extreme.surface);
    expect(LIGHT_THEME.colors.dangerAction).toBe(MERIDIAN_PRIMITIVES.brandCrimson);
    expect(LIGHT_THEME.colors.primaryAction).not.toBe(LIGHT_THEME.colors.dangerAction);
  });
});

describe('native Meridian type, targets and accessibility settings', () => {
  beforeEach(resetPreferences);

  it('translates named body and callout roles from the shared 17/18px scale', () => {
    expect(TYPE_ROLES.body.size).toBe(17);
    expect(TYPE_ROLES.body.lineHeight).toBe(27);
    expect(TYPE_ROLES.callout.size).toBe(18);
    expect(TYPE_ROLES.caption.size).toBe(12);
    expect(NATIVE_FONT_SCALE_MAX).toBe(0);
    expect(Object.values(BUTTON_HEIGHTS).every((height) => height >= TOUCH_MIN)).toBe(true);
  });

  it('applies the Large Text and Bold Text preferences while leaving system scaling uncapped', () => {
    renderThemeProbe();
    expect(flatStyle('native-body').fontSize).toBe(17);
    expect(flatStyle('native-body').fontWeight).toBe('400');
    expect(screen.getByTestId('native-body').props.maxFontSizeMultiplier).toBe(0);

    act(() => {
      useSettingsStore.getState().setLargeText(true);
      useSettingsStore.getState().setBoldText(true);
    });

    expect(flatStyle('native-body').fontSize).toBeCloseTo(20.4);
    expect(flatStyle('native-body').fontWeight).toBe('600');
    expect(flatStyle('native-secondary').fontSize).toBeCloseTo(14.4);
  });

  it('applies the Increase Contrast preference to the native theme roles', () => {
    renderThemeProbe();
    expect(flatStyle('native-body').color).toBe(MERIDIAN_THEMES.light.label);

    act(() => useSettingsStore.getState().setIncreaseContrast(true));
    expect(flatStyle('native-body').color).toBe(MERIDIAN_THEMES.highContrast.label);
  });
});
