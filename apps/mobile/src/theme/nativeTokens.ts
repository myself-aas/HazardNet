/**
 * Native-specific implementation values for HazardNet Mobile.
 *
 * Semantic colour roles and the type-scale decisions come from the Apple design system
 * (`packages/design-system/src/appleNative.ts`). This
 * file only translates those roles into React Native units and adds layout
 * values that belong to a device shell: touch targets, safe areas and spacing.
 */

import { APPLE_NATIVE, APPLE_NATIVE_RADIUS, APPLE_NATIVE_TYPE } from '@hazardnet/design-system';

const { spacing } = APPLE_NATIVE;

/**
 * Apple's touch-target floor is 44 pt, and
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
 * Radius roles are the Apple scale, shared with the web. The native editorial shell uses
 * the same 16-unit card and pill-control roles; the web console can opt into
 * the tighter control radius through its track scope.
 */
export const NATIVE_RADIUS = {
  none: 0,
  chip: APPLE_NATIVE_RADIUS.chip,
  control: APPLE_NATIVE_RADIUS.control,
  media: APPLE_NATIVE_RADIUS.media,
  card: APPLE_NATIVE_RADIUS.card,
  sheet: APPLE_NATIVE_RADIUS.sheet,
  feature: APPLE_NATIVE_RADIUS.feature,
  pill: APPLE_NATIVE_RADIUS.pill,
  sheetIndicator: APPLE_NATIVE_RADIUS.pill,
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
 * callout, subhead and caption sizes follow the shared Apple scale.
 */
/**
 * Native type roles, resolved from the Apple scale.
 *
 * The native shell keeps its own role NAMES (displayLarge, subhead, metadata…) because that is
 * the vocabulary a React Native screen reads in, but every value behind them is an Apple style —
 * so a "title2" on iOS is the same 21pt tagline as on the web, not a near-miss.
 *
 * `APPLE_NATIVE_TYPE.scale` has already done the rem→pt and ratio→absolute conversions, so this
 * is a straight lookup rather than a second unit system.
 */
function nativeRole(name: keyof typeof APPLE_NATIVE_TYPE.scale, sizeOverride?: number) {
  const role = APPLE_NATIVE_TYPE.scale[name];
  const size = sizeOverride ?? role.fontSize;
  const scaled = size / role.fontSize;
  return {
    size,
    weight: role.fontWeight,
    lineHeight: Math.round(role.lineHeight * scaled),
    letterSpacing: role.letterSpacing * scaled,
  } as const;
}

/** Native role names mapped onto the canonical Apple scale. */
export const NATIVE_TYPE_ROLE_MAP = {
  displayLarge: 'displayMd',
  displaySmall: 'lead',
  title1: 'lead',
  title2: 'tagline',
  title3: 'bodyStrong',
  body: 'body',
  bodyBold: 'bodyStrong',
  callout: 'body',
  subhead: 'captionStrong',
  caption: 'caption',
  metadata: 'finePrint',
  /** The mono readout is caption-sized; only the family differs. */
  mono: 'caption',
} as const;

export const TYPE_ROLES = {
  displayLarge: nativeRole('displayMd'),
  displaySmall: nativeRole('lead'),
  title1: nativeRole('lead'),
  title2: nativeRole('tagline'),
  title3: nativeRole('bodyStrong'),
  body: nativeRole('body'),
  bodyBold: nativeRole('bodyStrong'),
  callout: nativeRole('body'),
  subhead: nativeRole('captionStrong'),
  caption: nativeRole('caption'),
  metadata: nativeRole('finePrint'),
  // Resolved from the Apple scale like every other role — the mono *family* is
  // applied by the Text component; the metrics stay on-scale so a mono figure
  // and the caption beside it sit on the same baseline.
  mono: nativeRole('caption'),
} as const;

export const SEVERITY_EDGE_WIDTH = 3;
export const CARD_PADDING = 16;
export const SCREEN_H_PADDING = 16;
export const BANNER_HEIGHT = 48;
export const SHEET_CORNER_RADIUS = NATIVE_RADIUS.sheet;
