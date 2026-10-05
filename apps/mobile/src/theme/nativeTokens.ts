/**
 * Native-specific implementation values for HazardNet Mobile.
 *
 * Semantic color roles and the type-scale decisions come from Meridian. This
 * file only translates those roles into React Native units and adds layout
 * values that belong to a device shell: touch targets, safe areas and spacing.
 */

import { HDS_NASA_TOKENS, MERIDIAN_RADIUS_ROLES, MERIDIAN_TYPE_SCALE } from '@hazardnet/design-system';

const { spacing } = HDS_NASA_TOKENS;

/**
 * Meridian's web floor is 44 CSS px, Apple's touch-target floor is 44 pt, and
 * Android's is 48 dp. Native controls use the stricter cross-platform 48 unit
 * floor; only the iOS tab-bar row uses Apple's compact 49 pt system height.
 */
export const TOUCH_MIN = 48;
export const TAB_BAR_HEIGHT_IOS = 49;
export const TAB_BAR_HEIGHT_ANDROID = 80;
export const NAV_BAR_HEIGHT = 44;
export const HEADER_LARGE_TITLE_IOS = 34;
export const BOTTOM_SHEET_HANDLE_HEIGHT = 24;

/** Extra hit area around compact, visible controls; it does not change layout. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export const BORDER_WIDTHS = {
  hairline: 1,
  accent: 2,
  ring: 2,
} as const;

export const MOTION = {
  fastMs: 150,
  normalMs: 250,
  slowMs: 350,
  easing: [0.2, 0, 0, 1] as [number, number, number, number],
} as const;

/**
 * Radius roles are shared with the web scale. The native editorial shell uses
 * the same 16-unit card and pill-control roles; the web console can opt into
 * the tighter control radius through its track scope.
 */
export const NATIVE_RADIUS = {
  none: 0,
  chip: MERIDIAN_RADIUS_ROLES.chip,
  control: MERIDIAN_RADIUS_ROLES.control,
  media: MERIDIAN_RADIUS_ROLES.media,
  card: MERIDIAN_RADIUS_ROLES.card,
  sheet: MERIDIAN_RADIUS_ROLES.sheet,
  feature: MERIDIAN_RADIUS_ROLES.feature,
  pill: MERIDIAN_RADIUS_ROLES.pill,
  sheetIndicator: MERIDIAN_RADIUS_ROLES.pill,
} as const;

export { spacing };

/**
 * Do not cap Dynamic Type / Android font scaling. Layout controls must grow
 * with the user's system setting rather than clipping the warning they need
 * to read. React Native's 0 value means no maximum multiplier.
 */
export const NATIVE_FONT_SCALE_MAX = 0;

/**
 * React Native translation of Meridian's named type roles. Display3 is fixed
 * at Apple's 34pt Large Title on native; the web's clamp remains fluid. Body,
 * callout, subhead and caption sizes follow the shared Meridian scale.
 */
const pxFromRem = (value: string): number => {
  const match = /^([\d.]+)rem$/.exec(value);
  return match ? Number(match[1]) * 16 : 0;
};

function nativeRole(name: keyof typeof MERIDIAN_TYPE_SCALE, sizeOverride?: number) {
  const role = MERIDIAN_TYPE_SCALE[name];
  const size = sizeOverride ?? pxFromRem(role.size);
  const weight = role.weight >= 600 ? '600' : role.weight >= 500 ? '500' : '400';
  return {
    size,
    weight,
    lineHeight: Math.round(size * role.line),
    letterSpacing: Number.parseFloat(role.tracking) * size,
  } as const;
}

/** Native role names mapped to the canonical web scale (display3 is fixed at 34pt). */
export const NATIVE_TYPE_ROLE_MAP = {
  displayLarge: 'display3',
  displaySmall: 'title1',
  title1: 'title1',
  title2: 'title2',
  title3: 'title3',
  body: 'body',
  bodyBold: 'body',
  callout: 'callout',
  subhead: 'subhead',
  caption: 'caption',
  metadata: 'caption',
} as const;

export const TYPE_ROLES = {
  displayLarge: nativeRole('display3', 34),
  displaySmall: nativeRole('title1'),
  title1: nativeRole('title1'),
  title2: nativeRole('title2'),
  title3: nativeRole('title3'),
  body: nativeRole('body'),
  bodyBold: { ...nativeRole('body'), weight: '600' as const },
  callout: nativeRole('callout'),
  subhead: nativeRole('subhead'),
  caption: nativeRole('caption'),
  metadata: { ...nativeRole('caption'), weight: '500' as const },
  mono: { size: 13, weight: '400' as const, lineHeight: 20, letterSpacing: 0 },
} as const;

export const SEVERITY_EDGE_WIDTH = 3;
export const CARD_PADDING = 16;
export const SCREEN_H_PADDING = 16;
export const BANNER_HEIGHT = 48;
export const SHEET_CORNER_RADIUS = NATIVE_RADIUS.sheet;
