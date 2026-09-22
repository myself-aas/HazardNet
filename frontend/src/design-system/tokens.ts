/**
 * HazardNet Global Design System (HDS v2.2) Tokens
 * Shared Token Engine & Cross-Platform Parity Contract (React PWA + React Native / Expo)
 * 
 * Compliant with NASA Horizon Design System (HDS v2.2), WCAG AAA Contrast, and
 * Apple HIG / Android Material 44px touch target standards.
 */

export const HDS_TOKENS = {
  brand: {
    name: 'HazardNet',
    version: '2.2.0',
    platform: 'Multi-Platform (React PWA & React Native)',
  },

  // Color Palette & Semantic Roles
  colors: {
    // NASA HDS Core Brand Colors
    primaryRed: '#f64137',
    primaryRedShade: '#b60109', // 7.0:1 AAA contrast against white
    nasaBlue: '#1c67e3',
    nasaBlueShade: '#0b3b95', // 9.9:1 AAA contrast against white
    nasaOrange: '#ea6f24',
    nasaGreen: '#16a34a',

    // Surfaces & Canvas
    surfaceCanvas: '#f6f6f6',
    surfaceWhite: '#ffffff',
    surfaceSunken: '#e5e5e5',
    surfaceDark: '#0e0e11',
    surfaceDarkCard: '#17171b',

    // Glassmorphism Surfaces (Web + Mobile Backdrop)
    glassLight: 'rgba(255, 255, 255, 0.88)',
    glassDark: 'rgba(14, 14, 17, 0.88)',
    glassBorderLight: 'rgba(23, 23, 27, 0.12)',
    glassBorderDark: 'rgba(255, 255, 255, 0.15)',

    // Ink / Typography Colors
    inkPrimary: '#17171b', // 17.4:1 contrast ratio on canvas
    inkSoft: '#2e2e32',    // 7.1:1 AAA contrast micro-copy
    inkMuted: '#52525b',   // 4.5:1 AA contrast secondary text
    inkInverse: '#f6f6f6',

    // Multi-Hazard Severity Scale (5-Step Agricultural Climate Scale)
    severity: {
      low: {
        label: 'Low / Normal',
        color: '#16a34a',
        surface: '#dcfce7',
        border: '#86efac',
      },
      moderate: {
        label: 'Moderate Advisory',
        color: '#ea6f24',
        surface: '#ffedd5',
        border: '#fdba74',
      },
      high: {
        label: 'High Watch',
        color: '#dc2626',
        surface: '#fee2e2',
        border: '#fca5a5',
      },
      veryHigh: {
        label: 'Very High Warning',
        color: '#b60109',
        surface: '#fee2e2',
        border: '#f87171',
      },
      extreme: {
        label: 'Extreme Critical',
        color: '#7f1d1d',
        surface: '#fecdd3',
        border: '#fda4af',
      },
    },
  },

  // Touch Ergonomics & Component Dimensions
  touch: {
    minTargetSize: 44, // 44px x 44px hit target minimum (WCAG 2.5.8 & Apple HIG)
    fabSize: 60,       // 60px x 60px circular Floating Action Button
    fabIconSize: 32,   // 32px vector icon inside FAB
    headerHeight: 56,  // 56px compact mobile top bar
    bottomSheetSnapMin: 180, // Collapsed bottom sheet height
    bottomSheetSnapMax: 540, // Expanded bottom sheet height
  },

  // Corner Radii & Micro-Surfaces
  radii: {
    sharp: 0,
    control: 2,   // NASA HDS 2px control radius
    card: 16,     // Soft rounded cards (Mobile Bento Grid)
    sheet: 28,    // Glassmorphic drag sheet top corners
    pill: 9999,   // Full rounded badges and action chips
  },

  // Cross-Platform Shadow Definitions
  shadows: {
    flat: 'none',
    card: '0 4px 12px rgba(0, 0, 0, 0.05)',
    elevated: '0 12px 24px -4px rgba(0, 0, 0, 0.12)',
    fab: '0 12px 20px -5px rgba(0, 0, 0, 0.30), 0 6px 12px rgba(28, 103, 227, 0.25)',
  },

  // Bilingual Typography Stacks & Weights
  typography: {
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600, // Standardized weight for buttons and triggers
      bold: 700,
    },
    lineHeights: {
      tight: 1.2,
      heading: 1.3,
      body: 1.62,
      bengali: 1.35, // Mandatory safety floor for Bengali script rendering
    },
    families: {
      sans: "'Plus Jakarta Sans', 'Public Sans Web', 'Noto Sans Bengali', sans-serif",
      heading: "'Instrument Sans', 'Plus Jakarta Sans', 'Anek Bangla', 'Inter', sans-serif",
      display: "'Plus Jakarta Sans', 'Baloo Da 2', sans-serif",
      bengali: "'Noto Sans Bengali', 'Anek Bangla', sans-serif",
      mono: "'DM Mono', monospace",
    },
  },

  // Z-Index Stack Order (Strict Contract)
  zIndex: {
    base: 0,
    mapLayer: 10,
    mapControls: 20,
    stickyHeader: 40,
    bottomSheet: 50,
    modal: 60,
    toast: 70,
    fab: 80,
  },

  // Motion Springs & Easing Specs (Framer Motion + React Native Reanimated)
  motion: {
    springFast: { stiffness: 400, damping: 28 },
    springStandard: { stiffness: 300, damping: 30 },
    springSlow: { stiffness: 200, damping: 32 },
    easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    easeStandard: 'cubic-bezier(0.2, 0, 0.2, 1)',
    durationFastMs: 150,
    durationBaseMs: 300,
  },
} as const;

export type HDSTokenType = typeof HDS_TOKENS;

/**
 * Returns severity token properties based on a numeric score [0.0 - 1.0]
 */
export function getSeverityTokenScore(score: number) {
  if (score >= 0.85) return HDS_TOKENS.colors.severity.extreme;
  if (score >= 0.70) return HDS_TOKENS.colors.severity.veryHigh;
  if (score >= 0.50) return HDS_TOKENS.colors.severity.high;
  if (score >= 0.30) return HDS_TOKENS.colors.severity.moderate;
  return HDS_TOKENS.colors.severity.low;
}

/**
 * Helper to convert HDS tokens into React Native StyleSheets / Inline Style objects.
 */
export function getReactNativeTokenStyle(tokenPath: keyof typeof HDS_TOKENS.colors) {
  return {
    color: HDS_TOKENS.colors[tokenPath],
  };
}
