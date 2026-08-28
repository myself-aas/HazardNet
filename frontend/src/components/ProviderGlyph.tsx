import React from 'react';
import { OAuthProviderId } from '../lib/oauthProviders';

/**
 * Brand glyphs for the OAuth providers, drawn as compact inline SVGs so the
 * sign-in buttons stay dependency-free (no icon font / external requests).
 * Each glyph is designed to read at 16–20px inside a provider button tile.
 */

export interface ProviderGlyphProps {
  provider: OAuthProviderId;
  className?: string;
  size?: number;
}

const LinkedInGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <rect width="24" height="24" rx="4.5" fill="#0A66C2" />
    <circle cx="7.7" cy="8.3" r="1.7" fill="#fff" />
    <path d="M6.3 10.9h2.8v7.2H6.3z" fill="#fff" />
    <path
      d="M11 10.9h2.7v1c.5-.75 1.45-1.25 2.5-1.25 2.1 0 3 1.35 3 3.55v3.9h-2.8v-3.45c0-1.05-.4-1.7-1.25-1.7-.95 0-1.4.65-1.4 1.7v3.45H11z"
      fill="#fff"
    />
  </svg>
);

const GitHubGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <path
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      fill="currentColor"
    />
  </svg>
);

const SlackGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <rect x="6.9" y="3" width="2.5" height="7.6" rx="1.25" fill="#36C5F0" />
    <rect x="13.4" y="13.4" width="2.5" height="7.6" rx="1.25" fill="#2EB67D" />
    <rect x="13.4" y="6.9" width="7.6" height="2.5" rx="1.25" fill="#ECB22E" />
    <rect x="3" y="13.4" width="7.6" height="2.5" rx="1.25" fill="#E01E5A" />
  </svg>
);

const DiscordGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#5865F2" />
    <ellipse cx="9" cy="10.9" rx="1.6" ry="2" fill="#fff" />
    <ellipse cx="15" cy="10.9" rx="1.6" ry="2" fill="#fff" />
    <path
      d="M7.4 14.6c1.7 1.1 3.4 1.5 4.6 1.5s2.9-.4 4.6-1.5"
      fill="none"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const XGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <path
      d="M17.53 3H20.5l-6.49 7.42L21.5 21h-5.9l-4.62-6.04L5.7 21H2.72l6.94-7.93L2.5 3h6.05l4.18 5.53L17.53 3Zm-1.04 16.2h1.64L7.6 4.71H5.85L16.49 19.2Z"
      fill="currentColor"
    />
  </svg>
);

const FigmaGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <circle cx="8" cy="6" r="3.2" fill="#F24E1E" />
    <path d="M11.2 2.8a3.2 3.2 0 0 1 0 6.4z" fill="#A259FF" />
    <circle cx="8" cy="12" r="3.2" fill="#0ACF83" />
    <circle cx="8" cy="18" r="3.2" fill="#14D0A0" />
    <path d="M11.2 14.8a3.2 3.2 0 0 1 0 6.4z" fill="#1ABCFE" />
  </svg>
);

const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <path
      d="M12 10.2v3.7h5.2c-.5 2.4-2.6 3.9-5.2 3.9a6.1 6.1 0 1 1 0-12.2c1.6 0 3 .6 4.1 1.6l2.7-2.7A9.7 9.7 0 0 0 12 2.3a9.7 9.7 0 1 0 0 19.4c5.4 0 9.4-3.8 9.4-9.2 0-.8-.1-1.5-.3-2.3z"
      fill="#4285F4"
    />
  </svg>
);

const MicrosoftGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <rect x="3.5" y="3.5" width="7.9" height="7.9" fill="#F25022" />
    <rect x="12.6" y="3.5" width="7.9" height="7.9" fill="#7FBA00" />
    <rect x="3.5" y="12.6" width="7.9" height="7.9" fill="#00A4EF" />
    <rect x="12.6" y="12.6" width="7.9" height="7.9" fill="#FFB900" />
  </svg>
);

const AppleGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <path
      d="M15.7 12.9c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6 1.8-1 2.4-2c.8-1.1 1.1-2.2 1.1-2.3-.1 0-2.1-.8-2.1-3zM13.8 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"
      fill="currentColor"
    />
  </svg>
);

const OrcidGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#A6CE39" />
    <circle cx="8.2" cy="8.9" r="1.15" fill="#fff" />
    <path d="M7.2 10.7h2v6.4h-2z" fill="#fff" />
    <path
      d="M11 10.7h2.05v.9a2.5 2.5 0 0 1 2.15-1.05c1.75 0 2.65 1.15 2.65 3.15v3.4h-2.1v-3.05c0-1.05-.4-1.6-1.2-1.6-.85 0-1.35.6-1.35 1.65v3H11z"
      fill="#fff"
    />
  </svg>
);

const GLYPHS: Record<OAuthProviderId, React.FC> = {
  linkedin: LinkedInGlyph,
  github: GitHubGlyph,
  slack: SlackGlyph,
  discord: DiscordGlyph,
  twitter: XGlyph,
  figma: FigmaGlyph,
  google: GoogleGlyph,
  microsoft: MicrosoftGlyph,
  apple: AppleGlyph,
  orcid: OrcidGlyph,
};

/** Render one provider's brand glyph inside a square tile. */
export const ProviderGlyph: React.FC<ProviderGlyphProps> = ({ provider, className = '', size }) => {
  const Glyph = GLYPHS[provider];
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={style}
      aria-hidden="true"
    >
      {Glyph ? <Glyph /> : null}
    </span>
  );
};

export default ProviderGlyph;
