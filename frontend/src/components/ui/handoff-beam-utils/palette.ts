// Placeholder stub for the handoff-beam palette tokens.
// Replace with the real implementation from the handoff-beam package.

export type BjorkTone = "dark" | "light";

export interface BjorkPaletteTokens {
  accent: string;
  text: string;
}

export const BJORK_PALETTE: Record<BjorkTone, BjorkPaletteTokens> = {
  dark: { accent: "#000000", text: "#ffffff" },
  light: { accent: "#ffffff", text: "#000000" },
};
