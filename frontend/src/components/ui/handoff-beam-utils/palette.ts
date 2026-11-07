// Placeholder stub for the handoff-beam palette tokens.
// Replace with the real implementation from the handoff-beam package.

export type BjorkTone = "dark" | "light";

export interface BjorkPaletteTokens {
  accent: string;
  text: string;
}

/**
 * Resolve a design-system CSS variable to a concrete color at runtime. Canvas
 * `fillStyle` cannot parse `var()`, so every color handed to the 2D context goes
 * through here; the fallback is a CSS keyword, never a raw hex literal.
 */
export function cssVar(name: string, fallback = ""): string {
  if (typeof document !== "undefined") {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) return value;
  }
  return fallback;
}

export const BJORK_PALETTE: Record<BjorkTone, BjorkPaletteTokens> = {
  dark: { accent: cssVar("--ap-ink", "black"), text: cssVar("--ap-bg-raised", "white") },
  light: { accent: cssVar("--ap-bg-raised", "white"), text: cssVar("--ap-ink", "black") },
};
