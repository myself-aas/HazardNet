/**
 * HazardNet OAuth provider registry (single source of truth).
 *
 * Social sign-up/sign-in is powered by Supabase Auth: the browser is
 * redirected to the provider, and Supabase exchanges the authorization code
 * (PKCE) server-side. The client never handles provider credentials — each
 * provider only needs its client ID/secret configured once in the Supabase
 * dashboard (see docs/oauth-provider-setup.md).
 *
 * Supported here (Supabase provider ids):
 *   linkedin, github, slack, discord, twitter (X), figma
 * plus google, microsoft, apple and a custom OIDC "orcid" provider.
 */

/** Supabase OAuth provider ids used by HazardNet. */
export type OAuthProviderId =
  | 'google'
  | 'github'
  | 'microsoft'
  | 'apple'
  | 'linkedin'
  | 'discord'
  | 'slack'
  | 'twitter'
  | 'figma'
  | 'orcid';

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  /** Button label. */
  label: string;
  /** Compact label for chips/badges. */
  short: string;
  /** Brand color (glyph tile / accents). */
  color: string;
  /** Where the user creates the developer app (client id/secret). */
  developerAppUrl: string;
  /** Supabase setup guide for this provider. */
  setupDocsUrl: string;
  /** Extra OAuth scopes to request (space separated; Supabase defaults apply when empty). */
  scopes?: string;
  /** Setup caveat surfaced in the UI/docs. */
  note?: string;
}

/** The seven headline providers, in UI order. */
export const PRIMARY_PROVIDER_IDS: OAuthProviderId[] = [
  'linkedin',
  'github',
  'slack',
  'discord',
  'twitter',
  'figma',
];

/** Additional providers kept from the previous sign-in screen. */
export const SECONDARY_PROVIDER_IDS: OAuthProviderId[] = ['google', 'microsoft', 'apple', 'orcid'];

const CONFIGS: Record<OAuthProviderId, OAuthProviderConfig> = {
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    short: 'in',
    color: '#0A66C2',
    developerAppUrl: 'https://www.linkedin.com/developers/apps/new',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-linkedin',
    scopes: 'openid profile email',
    note: 'Enable the "Sign In with LinkedIn using OpenID Connect" product on the LinkedIn app.',
  },
  github: {
    id: 'github',
    label: 'GitHub',
    short: 'GH',
    color: '#24292F',
    developerAppUrl: 'https://github.com/settings/applications/new',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-github',
    scopes: 'read:user user:email',
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    short: 'S',
    color: '#4A154B',
    developerAppUrl: 'https://api.slack.com/apps?new_app=1',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-slack',
    scopes: 'users:read email',
    note: 'The Slack app needs the "Sign in with Slack" user scope set enabled.',
  },
  discord: {
    id: 'discord',
    label: 'Discord',
    short: 'D',
    color: '#5865F2',
    developerAppUrl: 'https://discord.com/developers/applications',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-discord',
    scopes: 'identify email',
    note: 'Add the Supabase callback URL under OAuth2 → Redirects in the Discord developer portal.',
  },
  twitter: {
    id: 'twitter',
    label: 'X (Twitter)',
    short: 'X',
    color: '#0F1419',
    developerAppUrl: 'https://developer.x.com/en/portal/dashboard',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-twitter',
    note: 'Configure "OAuth 2.0" user authentication; X email access requires an approved developer account.',
  },
  figma: {
    id: 'figma',
    label: 'Figma',
    short: 'F',
    color: '#F24E1E',
    developerAppUrl: 'https://www.figma.com/developers/',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-figma',
  },
  google: {
    id: 'google',
    label: 'Google',
    short: 'G',
    color: '#4285F4',
    developerAppUrl: 'https://console.cloud.google.com/apis/credentials',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-google',
  },
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    short: 'MS',
    color: '#00A4EF',
    developerAppUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-azure',
  },
  apple: {
    id: 'apple',
    label: 'Apple',
    short: '',
    color: '#000000',
    developerAppUrl: 'https://developer.apple.com/account/resources/identifiers/list/serviceId',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-apple',
  },
  orcid: {
    id: 'orcid',
    label: 'ORCID',
    short: 'iD',
    color: '#A6CE39',
    developerAppUrl: 'https://orcid.org/developer-tools',
    setupDocsUrl: 'https://supabase.com/docs/guides/auth/social-clients/auth-orcid',
    note: 'Configured as a custom OIDC provider in Supabase.',
  },
};

export function getProvider(id: OAuthProviderId): OAuthProviderConfig {
  return CONFIGS[id];
}

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return Object.prototype.hasOwnProperty.call(CONFIGS, value);
}

/** sessionStorage key holding where to return after a completed OAuth flow. */
export const AUTH_RETURN_TO_KEY = 'hazardnet.auth.returnTo';

/** Default post-auth landing page. */
export const AUTH_DEFAULT_RETURN = '/';

/** Path Supabase redirects back to after the provider authorization screen. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Build the redirectTo URL handed to Supabase (must be allow-listed in the dashboard). */
export function buildOAuthRedirectTo(origin: string, nextTo?: string): string {
  const base = `${origin.replace(/\/$/, '')}${AUTH_CALLBACK_PATH}`;
  if (!nextTo || nextTo === AUTH_DEFAULT_RETURN) return base;
  return `${base}?next=${encodeURIComponent(nextTo)}`;
}

export interface OAuthCallbackParams {
  /** PKCE authorization code present on a successful provider redirect. */
  code: string | null;
  /** OAuth error code (?error=access_denied…) or GoTrue error_code. */
  error: string | null;
  errorDescription: string | null;
  /** Intended destination carried through the flow (?next=…). */
  next: string | null;
  /** True when Supabase returned an implicit-flow hash fragment instead of a code. */
  implicitHash: boolean;
}

/** Parse the Supabase/provider redirect query (and implicit-flow hash). */
export function parseOAuthCallbackParams(
  search: string,
  hash: string = '',
): OAuthCallbackParams {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const hashQuery = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(hashQuery);
  const hasImplicitToken = hashParams.has('access_token') || hashParams.has('error');
  const pick = (source: URLSearchParams, ...names: string[]): string | null => {
    for (const name of names) {
      const value = source.get(name);
      if (value) return value;
    }
    return null;
  };
  return {
    code: pick(params, 'code'),
    error: pick(params, 'error', 'error_code'),
    errorDescription: pick(params, 'error_description', 'error_description'),
    next: pick(params, 'next'),
    implicitHash: hasImplicitToken,
  };
}

/** Where to send the user after the callback completes (stored returnTo wins). */
export function resolveOAuthReturnTo(nextFromUrl: string | null): string {
  const fallback = nextFromUrl && nextFromUrl.startsWith('/') ? nextFromUrl : AUTH_DEFAULT_RETURN;
  try {
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    if (stored && stored.startsWith('/')) {
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      return stored;
    }
  } catch {
    // sessionStorage unavailable — fall through to the query param/default.
  }
  return fallback;
}

export interface OAuthErrorExplanation {
  title: string;
  hint: string;
  /** True when the fix is enabling the provider in Supabase. */
  providerDisabled: boolean;
}

/** Translate Supabase/provider OAuth errors into actionable guidance. */
export function describeOAuthError(rawError: unknown): OAuthErrorExplanation {
  const message =
    typeof rawError === 'string'
      ? rawError
      : ((rawError as { message?: string })?.message ?? String(rawError ?? ''));

  const text = message.toLowerCase();

  if (text.includes('not enabled') || text.includes('unsupported provider') || text.includes('provider_')) {
    return {
      title: 'Provider not enabled',
      hint: 'Enable this provider under Authentication → Sign In / Up → Providers in the Supabase dashboard and paste the client ID/secret from the provider’s developer app.',
      providerDisabled: true,
    };
  }
  if (text.includes('redirect') && (text.includes('uri') || text.includes('url') || text.includes('mismatch'))) {
    return {
      title: 'Redirect URL not allow-listed',
      hint: 'Add the exact callback URL to both the provider’s developer app and Supabase Authentication → URL Configuration → Redirect URLs.',
      providerDisabled: false,
    };
  }
  if (text.includes('already linked') || text.includes('identity already')) {
    return {
      title: 'Account already connected',
      hint: 'That provider identity is already linked to an account. Sign in with it, or connect a different provider from Profile → Connected Accounts.',
      providerDisabled: false,
    };
  }
  if (text.includes('state') || text.includes('nonce') || text.includes('expired')) {
    return {
      title: 'Sign-in session expired',
      hint: 'The authorization attempt was too old or replayed. Start the sign-in again.',
      providerDisabled: false,
    };
  }
  if (text.includes('access_denied') || text.includes('cancelled') || text.includes('canceled')) {
    return {
      title: 'Sign-in cancelled',
      hint: 'Authorization was cancelled at the provider. Close this dialog and try again.',
      providerDisabled: false,
    };
  }
  if (text.includes('email') && (text.includes('confirm') || text.includes('exists'))) {
    return {
      title: 'Email already registered',
      hint: 'An account already exists with this email. Sign in with the original method first, then link this provider from Profile → Connected Accounts.',
      providerDisabled: false,
    };
  }
  if (text.includes('not configured') || text.includes('supabase is not configured')) {
    return {
      title: 'Authentication unavailable',
      hint: 'Supabase environment variables are missing for this deployment; social sign-in cannot start.',
      providerDisabled: false,
    };
  }
  return {
    title: 'Sign-in could not complete',
    hint: message ? `${message}` : 'Unexpected error during sign-in. Please try again.',
    providerDisabled: false,
  };
}

export interface ProviderProfileSeed {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/**
 * Map provider user metadata onto a profile seed. Providers disagree on
 * field names (full_name vs name, avatar_url vs picture …); take the first
 * non-empty candidate per slot.
 */
export function mapProviderUserMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ProviderProfileSeed {
  const meta = metadata ?? {};
  const first = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    displayName:
      first(['display_name', 'full_name', 'name', 'preferred_username', 'user_name', 'username']) ??
      'User',
    email: first(['email']),
    avatarUrl: first(['avatar_url', 'picture', 'profile_image_url', 'twitter_profile_image_url']),
  };
}

export interface ProviderIdentityView {
  provider: OAuthProviderId;
  identityId: string;
  email: string | null;
  lastSignInAt: string | null;
}

/** Normalize a Supabase user identities array into linkable/unlinkable views. */
export function toIdentityViews(
  identities: Array<Record<string, unknown>> | null | undefined,
): ProviderIdentityView[] {
  return (identities ?? [])
    .map((identity) => {
      const provider = String(identity.provider ?? '');
      const identityId = String(identity.identity_id ?? identity.id ?? '');
      if (!isOAuthProviderId(provider) || !identityId) return null;
      const identityData = (identity.identity_data ?? {}) as Record<string, unknown>;
      return {
        provider: provider as OAuthProviderId,
        identityId,
        email: typeof identityData.email === 'string' ? identityData.email : null,
        lastSignInAt: typeof identity.last_sign_in_at === 'string' ? identity.last_sign_in_at : null,
      } satisfies ProviderIdentityView;
    })
    .filter((view): view is ProviderIdentityView => view !== null);
}

/** Providers with no linked identity yet (candidates for "Connect"). */
export function unlinkedProviders(
  identities: Array<Record<string, unknown>> | null | undefined,
  pool: OAuthProviderId[] = [...PRIMARY_PROVIDER_IDS, ...SECONDARY_PROVIDER_IDS],
): OAuthProviderId[] {
  const linked = new Set(toIdentityViews(identities).map((view) => view.provider));
  // An email/password account has no "email" identity in some Supabase
  // configurations; the pool simply lists providers the user can connect.
  return pool.filter((id) => !linked.has(id));
}
