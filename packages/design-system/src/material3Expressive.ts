/**
 * Google Material 3 Expressive UI/UX Tokens for HazardNet
 *
 * Implements Material 3 Expressive Motion, Dynamic Container Radii,
 * Expressive Spring Physics, and Haptic Feedback Profiles.
 */

export const M3_EXPRESSIVE_TOKENS = {
  version: '3.0.0-expressive',

  // Expressive Corner Radii
  containerShape: {
    fullExpressive: 28,  // Hero cards, bottom sheets, prominent dialogs
    semiExpressive: 16,  // Bento grid tiles, list items
    control: 12,         // Filter chips, input fields, secondary buttons
    sharp: 0,            // Map overlays, full-width status banners
    pill: 9999,          // Circular FABs, badges, primary action pills
  },

  // Material 3 Dynamic Color Container Tokens
  containers: {
    primaryContainer: '#fecdd3',
    onPrimaryContainer: '#881337',
    secondaryContainer: '#e0f2fe',
    onSecondaryContainer: '#075985',
    tertiaryContainer: '#fef3c7',
    onTertiaryContainer: '#78350f',
    surfaceContainerLow: '#f8fafc',
    surfaceContainerHigh: '#f1f5f9',
    surfaceContainerHighest: '#e2e8f0',
  },

  // Expressive Spring Curves for React Native Reanimated & Framer Motion
  expressiveSprings: {
    emphasized: {
      mass: 1,
      damping: 22,
      stiffness: 280,
    },
    bouncy: {
      mass: 0.8,
      damping: 18,
      stiffness: 320,
    },
    decelerated: {
      mass: 1.2,
      damping: 32,
      stiffness: 200,
    },
  },

  // Haptic Feedback Patterns for Mobile
  hapticProfiles: {
    selection: 'light',
    chipToggle: 'medium',
    sheetSnap: 'rigid',
    hazardAlert: 'heavy',
    emergencyTrigger: 'warningPattern',
  },

  // Touch Target Standards
  touchTargetFloor: {
    appleHigPt: 44,
    googlePlayDp: 48,
  },
} as const;

export type M3ExpressiveTokenType = typeof M3_EXPRESSIVE_TOKENS;
