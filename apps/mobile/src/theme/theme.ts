/**
 * HazardNet native theme.
 *
 * Meridian is the semantic source for surfaces, labels, controls and type. The
 * native layer only adds device-specific surface treatment (OLED) and maps
 * HazardNet's four operational alert classes onto the shared severity palette.
 */

import {
  APPLE_NATIVE,
  APPLE_NATIVE_COLORS,
  APPLE_NATIVE_DATAVIZ,
  APPLE_NATIVE_THEMES,
} from '@hazardnet/design-system';
import { TYPE_ROLES, BORDER_WIDTHS, NATIVE_RADIUS, spacing } from './nativeTokens';

export type ThemeMode = 'light' | 'dark' | 'oled';
export type ThemeContrast = 'normal' | 'high';
export type AlertTone = 'severe' | 'warning' | 'watch' | 'allClear';

export interface Theme {
  mode: ThemeMode;
  contrast: ThemeContrast;
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    surfaceTint: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textOnColor: string;
    hairline: string;
    divider: string;
    primaryAction: string;
    primaryActionText: string;
    interactive: string;
    interactiveText: string;
    interactiveOnColor: string;
    dangerAction: string;
    dangerActionText: string;
    secondaryAction: string;
    skeleton: string;
    skeletonHighlight: string;
    overlay: string;
    severe: string;
    severeBg: string;
    severeSolid: string;
    severeOnSolid: string;
    warning: string;
    warningBg: string;
    warningSolid: string;
    warningOnSolid: string;
    watch: string;
    watchBg: string;
    watchSolid: string;
    watchOnSolid: string;
    allClear: string;
    allClearBg: string;
    allClearSolid: string;
    allClearOnSolid: string;
    bannerInfo: string;
    bannerWarning: string;
    bannerError: string;
    bannerSuccess: string;
  };
  type: typeof TYPE_ROLES;
  spacing: typeof spacing;
  borderWidths: typeof BORDER_WIDTHS;
  radius: typeof NATIVE_RADIUS;
}

const WHITE = '#ffffff';
const INK = APPLE_NATIVE_COLORS.inkPrimary;
const { colors: nasaColors } = APPLE_NATIVE;

const LIGHT_ALERTS = {
  severe: {
    label: APPLE_NATIVE_COLORS.severity.extreme.color,
    surface: APPLE_NATIVE_COLORS.severity.extreme.surface,
    solid: APPLE_NATIVE_COLORS.primary,
    onSolid: WHITE,
  },
  warning: {
    label: APPLE_NATIVE_COLORS.severity.moderate.color,
    surface: APPLE_NATIVE_COLORS.severity.moderate.surface,
    solid: APPLE_NATIVE_COLORS.severity.moderate.color,
    onSolid: WHITE,
  },
  watch: {
    label: APPLE_NATIVE_DATAVIZ.seqOrange80,
    surface: APPLE_NATIVE_DATAVIZ.seqYellow10,
    solid: APPLE_NATIVE_DATAVIZ.seqYellow30,
    onSolid: APPLE_NATIVE_DATAVIZ.seqOrange90,
  },
  allClear: {
    label: APPLE_NATIVE_COLORS.severity.low.color,
    surface: APPLE_NATIVE_COLORS.severity.low.surface,
    // Use the darker text role as a fill too: white text on the brighter map
    // solid (#16a34a) misses AA for small labels.
    solid: APPLE_NATIVE_COLORS.severity.low.color,
    onSolid: WHITE,
  },
} as const;

const DARK_ALERTS = {
  severe: {
    label: APPLE_NATIVE_COLORS.primaryOnDark,
    surface: 'rgba(255, 107, 96, 0.16)',
    solid: APPLE_NATIVE_THEMES.dark.action,
    onSolid: APPLE_NATIVE_THEMES.dark.actionForeground,
  },
  warning: {
    label: APPLE_NATIVE_DATAVIZ.seqYellow30,
    surface: 'rgba(245, 175, 12, 0.18)',
    solid: APPLE_NATIVE_DATAVIZ.seqYellow30,
    onSolid: INK,
  },
  watch: {
    label: APPLE_NATIVE_DATAVIZ.seqYellow20,
    surface: 'rgba(255, 203, 71, 0.16)',
    solid: APPLE_NATIVE_DATAVIZ.seqYellow20,
    onSolid: INK,
  },
  allClear: {
    label: APPLE_NATIVE_DATAVIZ.activeGreen,
    surface: 'rgba(71, 218, 132, 0.16)',
    solid: APPLE_NATIVE_DATAVIZ.activeGreen,
    onSolid: INK,
  },
} as const;

function makeTheme(mode: ThemeMode): Theme {
  const dark = mode !== 'light';
  const roles = dark ? APPLE_NATIVE_THEMES.dark : APPLE_NATIVE_THEMES.light;
  const alertRoles = dark ? DARK_ALERTS : LIGHT_ALERTS;
  const oled = mode === 'oled';

  const baseColors: Theme['colors'] = {
    background: oled ? '#000000' : roles.backgroundBase,
    surface: oled ? '#101418' : roles.backgroundElevated,
    surfaceRaised: oled ? '#14191e' : roles.backgroundElevated,
    surfaceTint: oled ? '#0b0e11' : roles.backgroundGrouped,
    textPrimary: roles.label,
    textSecondary: roles.labelSecondary,
    // Meridian's tertiary label is a 14px+ role. Native metadata is 12px, so
    // it deliberately uses the AA/AAA secondary role instead of that weaker tint.
    textMuted: roles.labelSecondary,
    textOnColor: dark ? INK : WHITE,
    hairline: oled ? APPLE_NATIVE_COLORS.darkHairline : roles.separator,
    divider: oled ? APPLE_NATIVE_COLORS.darkHairline : roles.separator,
    // Apple's filled primary is Action Blue, not ink. A black filled button was
    // the previous system's grammar; under one accent it is the same blue the
    // links and the tab bar use.
    primaryAction: roles.action,
    primaryActionText: roles.actionForeground,
    interactive: roles.action,
    interactiveText: roles.action,
    interactiveOnColor: roles.actionForeground,
    dangerAction: roles.action,
    dangerActionText: roles.actionForeground,
    secondaryAction: oled ? '#14191e' : roles.backgroundGrouped,
    skeleton: oled ? '#14191e' : roles.backgroundGrouped,
    skeletonHighlight: oled ? '#1b2128' : roles.backgroundElevated,
    overlay: dark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.40)',
    severe: alertRoles.severe.label,
    severeBg: alertRoles.severe.surface,
    severeSolid: alertRoles.severe.solid,
    severeOnSolid: alertRoles.severe.onSolid,
    warning: alertRoles.warning.label,
    warningBg: alertRoles.warning.surface,
    warningSolid: alertRoles.warning.solid,
    warningOnSolid: alertRoles.warning.onSolid,
    watch: alertRoles.watch.label,
    watchBg: alertRoles.watch.surface,
    watchSolid: alertRoles.watch.solid,
    watchOnSolid: alertRoles.watch.onSolid,
    allClear: alertRoles.allClear.label,
    allClearBg: alertRoles.allClear.surface,
    allClearSolid: alertRoles.allClear.solid,
    allClearOnSolid: alertRoles.allClear.onSolid,
    bannerInfo: dark ? 'rgba(111, 168, 255, 0.16)' : '#e7efff',
    bannerWarning: alertRoles.warning.surface,
    bannerError: alertRoles.severe.surface,
    bannerSuccess: alertRoles.allClear.surface,
  };

  return {
    mode,
    contrast: 'normal',
    colors: baseColors,
    type: TYPE_ROLES,
    spacing,
    borderWidths: BORDER_WIDTHS,
    radius: NATIVE_RADIUS,
  };
}

export const LIGHT_THEME = makeTheme('light');
export const DARK_THEME = makeTheme('dark');
export const OLED_THEME = makeTheme('oled');

function highContrastTheme(mode: ThemeMode): Theme {
  const base = mode === 'light' ? LIGHT_THEME : mode === 'oled' ? OLED_THEME : DARK_THEME;
  const lightRoles = APPLE_NATIVE_THEMES.highContrast;

  if (mode === 'light') {
    return {
      ...base,
      contrast: 'high',
      colors: {
        ...base.colors,
        background: lightRoles.backgroundBase,
        surface: lightRoles.backgroundElevated,
        surfaceRaised: lightRoles.backgroundElevated,
        surfaceTint: lightRoles.backgroundGrouped,
        textPrimary: lightRoles.label,
        textSecondary: lightRoles.labelSecondary,
        textMuted: lightRoles.labelSecondary,
        textOnColor: WHITE,
        hairline: lightRoles.separator,
        divider: lightRoles.separator,
        primaryAction: lightRoles.action,
        primaryActionText: lightRoles.actionForeground,
        interactive: lightRoles.action,
        interactiveText: lightRoles.action,
        interactiveOnColor: lightRoles.actionForeground,
        dangerAction: lightRoles.action,
        dangerActionText: lightRoles.actionForeground,
        secondaryAction: '#ffffff',
        severe: '#7A0001',
        severeSolid: '#7A0001',
        severeOnSolid: WHITE,
        warning: APPLE_NATIVE_DATAVIZ.seqOrange90,
        warningSolid: APPLE_NATIVE_DATAVIZ.seqOrange90,
        warningOnSolid: WHITE,
        watch: APPLE_NATIVE_DATAVIZ.seqOrange90,
        watchSolid: APPLE_NATIVE_DATAVIZ.seqYellow30,
        watchOnSolid: INK,
        allClear: APPLE_NATIVE_COLORS.severity.low.color,
        allClearSolid: APPLE_NATIVE_COLORS.severity.low.color,
        allClearOnSolid: WHITE,
      },
    };
  }

  return {
    ...base,
    contrast: 'high',
    colors: {
      ...base.colors,
      textSecondary: APPLE_NATIVE_COLORS.onDark,
      textMuted: APPLE_NATIVE_COLORS.onDark,
      hairline: '#8A939B',
      divider: '#8A939B',
      interactive: '#8AB8FF',
      interactiveText: '#8AB8FF',
      bannerInfo: 'rgba(138, 184, 255, 0.20)',
    },
  };
}

export function getTheme(mode: ThemeMode, increaseContrast = false): Theme {
  if (increaseContrast) return highContrastTheme(mode);
  switch (mode) {
    case 'dark':
      return DARK_THEME;
    case 'oled':
      return OLED_THEME;
    case 'light':
    default:
      return LIGHT_THEME;
  }
}
