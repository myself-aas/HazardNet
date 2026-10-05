/**
 * Main exports for @hazardnet/design-system.
 *
 * ONE design system: Apple. `apple.ts` is the single source of truth for every colour, type
 * style, radius, spacing step, elevation and motion value in the product; `mapPalette.ts` and the
 * severity and hazard-identity scales inside `apple.ts` are its three declared data-encoding
 * layers; `icons.ts` is the generated glyph set.
 *
 * Removed in the Apple migration — do not reintroduce:
 *   tokens.ts               HDS v2.2 token object        (superseded by apple.ts)
 *   meridian.ts             HDS v3.0 Meridian            (superseded by apple.ts)
 *   material3Expressive.ts  Material 3 Expressive        (a third system; deleted)
 *   useTokens.ts            hooks over the above         (no remaining consumer)
 *
 * `appleNative.ts` resolves the same system into React Native units for apps/mobile and
 * apps/windows, so web and native are one design system rather than two that agree by habit.
 *
 * React is NOT a dependency of this entry point.
 */

export * from './apple';
export * from './appleNative';
export * from './mapPalette';
export * from './icons';
