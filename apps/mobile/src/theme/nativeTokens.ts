/**
 * Native-specific design tokens for HazardNet Mobile.
 *
 * Color values come from @hazardnet/design-system/tokens. These tokens add
 * mobile-only layout/spacing/typography values: 44pt/48dp minimum touch targets,
 * native type scale mapped to SF Pro / Roboto roles, safe-area-aware spacing.
 */

import { HDS_NASA_TOKENS } from '@hazardnet/design-system';

const { colors, spacing, radius } = HDS_NASA_TOKENS;

/** Minimum touch-target size per platform HIG. */
export const TOUCH_MIN = 48; // dp/pt — Android requires 48dp; iOS 44pt, but we use 48 to be safe on both.
export const TAB_BAR_HEIGHT_IOS = 49;
export const TAB_BAR_HEIGHT_ANDROID = 80; // Material 3 bottom navigation
export const NAV_BAR_HEIGHT = 44;
export const HEADER_LARGE_TITLE_IOS = 56;
export const BOTTOM_SHEET_HANDLE_HEIGHT = 24;

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

export const NATIVE_RADIUS = {
  ...radius,
  chip: 2,
  control: 2,
  sheetIndicator: 2,
} as const;

export { colors, spacing };

export const NATIVE_FONT_SCALE_MAX = 1.5;

/**
 * Typography roles (mapped to SF Pro on iOS, Roboto on Android at runtime).
 * We declare numeric sizes/weights/line-heights here; the platform font
 * family is applied via the Text primitive's Platform.select().
 */
export const TYPE_ROLES = {
  displayLarge: { size: 34, weight: '700' as const, lineHeight: 40, letterSpacing: -0.5 },
  displaySmall: { size: 28, weight: '700' as const, lineHeight: 34, letterSpacing: -0.3 },
  title1: { size: 22, weight: '700' as const, lineHeight: 28, letterSpacing: 0 },
  title2: { size: 20, weight: '600' as const, lineHeight: 25, letterSpacing: 0 },
  title3: { size: 17, weight: '600' as const, lineHeight: 22, letterSpacing: -0.2 },
  body: { size: 16, weight: '400' as const, lineHeight: 22, letterSpacing: -0.1 },
  bodyBold: { size: 16, weight: '600' as const, lineHeight: 22, letterSpacing: -0.1 },
  callout: { size: 15, weight: '400' as const, lineHeight: 21, letterSpacing: 0 },
  subhead: { size: 14, weight: '500' as const, lineHeight: 19, letterSpacing: 0 },
  caption: { size: 12, weight: '400' as const, lineHeight: 16, letterSpacing: 0 },
  metadata: { size: 11, weight: '500' as const, lineHeight: 14, letterSpacing: 0.5 },
  mono: { size: 13, weight: '400' as const, lineHeight: 18, letterSpacing: 0 },
} as const;

export const SEVERITY_EDGE_WIDTH = 3;
export const CARD_PADDING = 16;
export const SCREEN_H_PADDING = 16;
export const BANNER_HEIGHT = 48;
export const SHEET_CORNER_RADIUS = 0; // NASA HDS: no rounded corners on sheets
