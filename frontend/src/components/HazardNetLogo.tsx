import { getSeverityColor } from '../services/geolocationService';
import { useResolvedTheme } from './apple/motion';

/**
 * The brand, as React.
 *
 * Two artworks, both generated from one geometry (`scripts/lib/infinity-geometry.mjs` → `scripts/build-brand-assets.mjs`):
 *
 *   `/hazardnet-mark.svg`        the infinity loop alone — a woven crossing, one gradient from the product's blues.
 *                                 Its gradient holds ≥ 3:1 on white AND on the dark hero, so ONE file serves every
 *                                 surface (there is no inverse variant to keep in step).
 *   `/hazardnet-logo.svg`        the lockup: mark + the "HazardNet" wordmark, for light surfaces.
 *   `/hazardnet-logo-light.svg`  the same lockup with a white wordmark, for dark surfaces.
 *
 * The wordmark is OUTLINED in those files (Figtree 700, SIL OFL 1.1), so the lockup is identical in a header, an
 * e-mail or a PDF and never waits for a font. That is why `HazardNetBrand` is a single <img> with the site name as its
 * alt text, rather than an icon and two spans of live text side by side as it used to be.
 *
 * `variant` defaults to `auto`: the wordmark follows the theme, because a surface that the theme
 * layer re-points (the footer canvas, the menu drawer, a page that turns dark) cannot be matched
 * by one fixed artwork. It was reported from the live site on 2026-10-04: the dark footer with
 * `variant="light"` on it was a dark wordmark on a dark canvas. `auto` swaps the `src` off the
 * resolved theme — one <img>, so the alt text is announced exactly once — while `light`/`dark`
 * stay available for surfaces that are deliberately one or the other in both themes (the hero
 * scrim, the auth brand panel, printed paper).
 *
 * The earlier mark — crimson bars and a near-black arrow — is retired. Crimson survives in the UI as an accent
 * (`nasa-red-*`), but it is no longer the logo, so it can no longer be mistaken for a "severe" status colour there.
 */
const MARK_SRC = '/hazardnet-mark.svg';
const LOCKUP_SRC = { light: '/hazardnet-logo.svg', dark: '/hazardnet-logo-light.svg' } as const;

export interface HazardNetLogoProps {
  className?: string;
  size?: number | string;
  severity?: number;
  /** Render the full lockup (mark + wordmark) instead of the mark alone. */
  showText?: boolean;
  /** @deprecated The wordmark is part of the lockup artwork now; kept so existing callers still type-check. */
  textSizeClass?: string;
  /** `dark` = for dark surfaces, `light` = for light ones, `auto` (default) = follow the theme. */
  variant?: 'light' | 'dark' | 'auto';
}

/** The mark alone. 2:1 — it is as wide as it is tall twice over, so size it by height (`h-6 w-auto`). */
export const HazardNetLogo: React.FC<HazardNetLogoProps> = ({
  className = 'h-6 w-auto',
  size,
  severity,
  showText = false,
  variant = 'auto',
}) => {
  const accent = typeof severity === 'number' ? getSeverityColor(severity) : undefined;
  if (showText) return <HazardNetBrand variant={variant} className={className} />;
  return (
    <span className="inline-flex shrink-0 items-center justify-center leading-none">
      <img
        src={MARK_SRC}
        alt="HazardNet"
        width={120}
        height={60}
        className={`block shrink-0 object-contain ${className}`}
        style={{
          height: size,
          width: size ? 'auto' : undefined,
          filter: accent ? `drop-shadow(0 0 5px ${accent})` : undefined,
        }}
      />
    </span>
  );
};

export interface HazardNetBrandProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** `auto` (default) follows the theme; `light`/`dark` pin one artwork for a fixed surface. */
  variant?: 'light' | 'dark' | 'auto';
  className?: string;
}

/** Height of the lockup per size; width follows (330:60). Responsive: a step up from `sm` breakpoint. */
const LOCKUP_HEIGHT = {
  xs: 'h-5',
  sm: 'h-[22px] sm:h-6',
  md: 'h-6 sm:h-7',
  lg: 'h-8 sm:h-9',
  xl: 'h-10 sm:h-12',
} as const;

/** The full lockup: mark + wordmark, one image, `alt="HazardNet"`. */
export const HazardNetBrand: React.FC<HazardNetBrandProps> = ({ size = 'md', variant = 'auto', className = '' }) => {
  const resolved = useResolvedTheme();
  const artwork = variant === 'auto' ? resolved : variant;
  return (
    <img
      src={LOCKUP_SRC[artwork]}
      alt="HazardNet"
      width={330}
      height={60}
      decoding="async"
      className={`block w-auto max-w-none select-none ${LOCKUP_HEIGHT[size]} ${className}`}
      draggable={false}
    />
  );
};

export default HazardNetLogo;
