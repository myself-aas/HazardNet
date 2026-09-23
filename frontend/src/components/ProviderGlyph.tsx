import React from 'react';
import { OAuthProviderId } from '../lib/oauthProviders';

/**
 * Brand glyphs for the enabled OAuth providers (Google, GitHub), drawn as
 * compact inline SVGs so the sign-in buttons stay dependency-free (no icon
 * font / external requests). Each glyph is designed to read at 16–20px
 * inside a provider button tile.
 */

export interface ProviderGlyphProps {
  provider: OAuthProviderId;
  className?: string;
  size?: number;
}

const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
    <path
      d="M12 10.2v3.7h5.2c-.5 2.4-2.6 3.9-5.2 3.9a6.1 6.1 0 1 1 0-12.2c1.6 0 3 .6 4.1 1.6l2.7-2.7A9.7 9.7 0 0 0 12 2.3a9.7 9.7 0 1 0 0 19.4c5.4 0 9.4-3.8 9.4-9.2 0-.8-.1-1.5-.3-2.3z"
      fill="#4285F4"
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

const GLYPHS: Record<OAuthProviderId, React.FC> = {
  google: GoogleGlyph,
  github: GitHubGlyph,
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
