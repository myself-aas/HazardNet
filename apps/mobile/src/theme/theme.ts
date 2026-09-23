/**
 * HazardNet native theme.
 *
 * Color values resolved from @hazardnet/design-system tokens. Only tokens
 * that exist in the design system are used; extra native-only alpha/scale
 * values are defined locally.
 */

import { HDS_NASA_TOKENS } from '@hazardnet/design-system';
import { TYPE_ROLES, BORDER_WIDTHS, NATIVE_RADIUS, spacing } from './nativeTokens';

export type ThemeMode = 'light' | 'dark' | 'oled';

export interface Theme {
  mode: ThemeMode;
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
    secondaryAction: string;
    skeleton: string;
    skeletonHighlight: string;
    overlay: string;
    severe: string;
    severeBg: string;
    warning: string;
    warningBg: string;
    watch: string;
    watchBg: string;
    allClear: string;
    allClearBg: string;
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

const { colors } = HDS_NASA_TOKENS;

const SEVERE = colors.nasaRed;
const WARNING = colors.seqOrange50;
const WATCH = colors.seqYellow30;
const CLEAR = colors.activeGreen;

// Pure white — used sparingly for surface-raised on light and text-on-color.
const WHITE = '#ffffff';
const BLACK = '#000000';

// Carbon dark greys (used for dark theme surface). carbon90 is body text on
// light; dark surfaces use the inverse scale.
const CARBON95 = '#0a0a0b'; // true-black OLED page
const CARBON85 = '#232327'; // raised surface variant

// Local alpha tints (derived inline to avoid depending on token names not
// yet present in the design-system package).
const GREEN_TINT_LIGHT = 'rgba(71, 218, 132, 0.10)';
const GREEN_TINT_DARK = 'rgba(71, 218, 132, 0.15)';
const BLUE_TINT_LIGHT = colors.nasaBlueTint;
const BLUE_TINT_DARK = 'rgba(40, 139, 255, 0.25)';
const ORANGE_TINT_LIGHT = '#fae3cc';
const ORANGE_TINT_DARK = 'rgba(217, 106, 0, 0.20)';
const RED_TINT_LIGHT = colors.nasaRedTint;
const RED_TINT_DARK = 'rgba(246, 65, 55, 0.25)';
const YELLOW_TINT_DARK = 'rgba(245, 175, 12, 0.18)';

export const LIGHT_THEME: Theme = {
  mode: 'light',
  colors: {
    background: colors.background,
    surface: colors.carbon05,
    surfaceRaised: WHITE,
    surfaceTint: colors.carbon10,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    textOnColor: WHITE,
    hairline: colors.borderHairline,
    divider: colors.carbon10,
    primaryAction: colors.nasaBlue,
    primaryActionText: WHITE,
    secondaryAction: colors.carbon10,
    skeleton: colors.carbon10,
    skeletonHighlight: WHITE,
    overlay: 'rgba(0,0,0,0.4)',
    severe: SEVERE,
    severeBg: RED_TINT_LIGHT,
    warning: WARNING,
    warningBg: ORANGE_TINT_LIGHT,
    watch: WATCH,
    watchBg: colors.seqYellow10,
    allClear: CLEAR,
    allClearBg: GREEN_TINT_LIGHT,
    bannerInfo: BLUE_TINT_LIGHT,
    bannerWarning: ORANGE_TINT_LIGHT,
    bannerError: RED_TINT_LIGHT,
    bannerSuccess: GREEN_TINT_LIGHT,
  },
  type: TYPE_ROLES,
  spacing,
  borderWidths: BORDER_WIDTHS,
  radius: NATIVE_RADIUS,
};

export const DARK_THEME: Theme = {
  ...LIGHT_THEME,
  mode: 'dark',
  colors: {
    ...LIGHT_THEME.colors,
    background: colors.surfaceDark,         // carbon90
    surface: colors.surfaceRaisedDark,      // carbon80
    surfaceRaised: CARBON85,
    surfaceTint: colors.surfaceDark,
    textPrimary: colors.carbon05,
    textSecondary: colors.carbon40,
    textMuted: colors.carbon50,
    textOnColor: colors.carbon05,
    hairline: colors.carbon80,
    divider: colors.carbon80,
    primaryAction: colors.nasaBlueTint,
    primaryActionText: colors.carbon05,
    secondaryAction: colors.carbon80,
    skeleton: colors.carbon80,
    skeletonHighlight: colors.carbon70,
    overlay: 'rgba(0,0,0,0.7)',
    bannerInfo: BLUE_TINT_DARK,
    bannerWarning: ORANGE_TINT_DARK,
    bannerError: RED_TINT_DARK,
    bannerSuccess: GREEN_TINT_DARK,
    severeBg: RED_TINT_DARK,
    warningBg: ORANGE_TINT_DARK,
    watchBg: YELLOW_TINT_DARK,
    allClearBg: GREEN_TINT_DARK,
  },
};

export const OLED_THEME: Theme = {
  ...DARK_THEME,
  mode: 'oled',
  colors: {
    ...DARK_THEME.colors,
    background: BLACK,
    surface: '#0D0D0D',
    surfaceRaised: '#1A1A1A',
    surfaceTint: '#151515',
    hairline: '#1F1F1F',
    divider: '#151515',
  },
};

export function getTheme(mode: ThemeMode): Theme {
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
