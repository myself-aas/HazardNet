/**
 * HazardNet OAuth provider registry (single source of truth).
 *
 * Social sign-up/sign-in is powered by Firebase Auth. Exactly two social
 * providers are enabled on the project, plus email/password:
 *
 *   · Google — GoogleAuthProvider
 *   · GitHub — GithubAuthProvider
 *
 * No other provider (ORCID, LinkedIn, Microsoft, Apple, Slack, …) may be
 * shown on any auth surface. If another provider is enabled in the Firebase
 * console, it is intentionally not surfaced here.
 */

/** Firebase OAuth provider ids exposed by HazardNet. */
export type OAuthProviderId = 'google' | 'github';

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
  /** Firebase setup guide for this provider. */
  setupDocsUrl: string;
  /** Human-readable way to identify the Firebase provider id. */
  firebaseProviderId: string;
}

/** Every provider the Firebase console has enabled, in UI order. */
export const SUPPORTED_PROVIDER_IDS: OAuthProviderId[] = ['google', 'github'];

const CONFIGS: Record<OAuthProviderId, OAuthProviderConfig> = {
  google: {
    id: 'google',
    label: 'Google',
    short: 'G',
    color: '#4285F4',
    developerAppUrl: 'https://console.cloud.google.com/apis/credentials',
    setupDocsUrl: 'https://firebase.google.com/docs/auth/web/google-signin',
    firebaseProviderId: 'google.com',
  },
  github: {
    id: 'github',
    label: 'GitHub',
    short: 'GH',
    color: '#24292F',
    developerAppUrl: 'https://github.com/settings/developers',
    setupDocsUrl: 'https://firebase.google.com/docs/auth/web/github-auth',
    firebaseProviderId: 'github.com',
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

/** Path that reported provider results when a redirect flow was still in use. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

export interface OAuthCallbackParams {
  /** Authorization code present on a provider redirect (legacy flows). */
  code: string | null;
  /** OAuth error code (?error=access_denied…) or Firebase error_code. */
  error: string | null;
  errorDescription: string | null;
  /** Intended destination carried through the flow (?next=…). */
  next: string | null;
}

/** Parse a provider/Firebase redirect query string into callback params. */
export function parseOAuthCallbackParams(
  search: string,
): OAuthCallbackParams {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
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
}

/** Translate Firebase/provider OAuth errors into actionable guidance. */
export function describeOAuthError(rawError: unknown): OAuthErrorExplanation {
  const message =
    typeof rawError === 'string'
      ? rawError
      : ((rawError as { message?: string } | null)?.message ?? String(rawError ?? ''));
  const code =
    typeof rawError === 'object' && rawError !== null
      ? String((rawError as { code?: string }).code ?? '')
      : '';

  const text = `${code} ${message}`.toLowerCase().replace(/_/g, '-');

  if (text.includes('account-exists-with-different-credential')) {
    return {
      title: 'Email already in use with another sign-in method',
      hint: 'An account already exists with this email under a different provider. Sign in with the original method first, then link this account from your dashboard.',
    };
  }
  if (text.includes('popup-closed-by-user') || text.includes('popup blocked') || text.includes('popup-blocked')) {
    return {
      title: 'Sign-in window closed',
      hint: 'The sign-in popup was closed or blocked before finishing. Allow popups for this site and try again.',
    };
  }
  if (text.includes('operation-not-allowed') || text.includes('operation not allowed')) {
    return {
      title: 'Provider not enabled',
      hint: 'Enable this provider under Authentication → Sign-in method in the Firebase console, then configure its client ID/secret.',
    };
  }
  if (text.includes('invalid-credential') && (text.includes('provider') || text.includes('idp'))) {
    return {
      title: 'Provider configuration mismatch',
      hint: 'The client ID/secret configured in the Firebase console does not match the provider’s developer app. Re-check both.',
    };
  }
  if (text.includes('access-denied') || text.includes('access_denied') || text.includes('cancelled') || text.includes('canceled')) {
    return {
      title: 'Sign-in cancelled',
      hint: 'Authorization was cancelled at the provider. Try again when you are ready.',
    };
  }
  if (text.includes('unauthorized-domain') || text.includes('unauthorized domain')) {
    return {
      title: 'Domain not authorized',
      hint: 'Add this site’s domain to Authentication → Settings → Authorized domains in the Firebase console.',
    };
  }
  if (text.includes('too many requests') || text.includes('rate limit') || text.includes('quota')) {
    return {
      title: 'Too many attempts',
      hint: 'Wait a minute and try signing in again.',
    };
  }
  if (text.includes('network') || text.includes('failed to fetch')) {
    return {
      title: 'Network problem',
      hint: 'Check your connection and try again.',
    };
  }
  return {
    title: 'Sign-in could not complete',
    hint: message ? `${message}` : 'Unexpected error during sign-in. Please try again.',
  };
}

export interface ProviderProfileSeed {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/**
 * Map Firebase provider user metadata onto a profile seed. Providers disagree
 * on field names (full_name vs name, avatar_url vs picture …); take the first
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
    avatarUrl: first(['avatar_url', 'picture', 'photo_url', 'profile_image_url']),
  };
}

/** A single provider identity linked to the signed-in account. */
export interface ProviderIdentityView {
  provider: OAuthProviderId | 'email';
  identityId: string;
  email: string | null;
}

/**
 * Normalize a Firebase `providerData` array (UserInfo[]) into identity views.
 * Firebase reports `google.com`, `github.com` and `password` provider ids.
 */
export function toIdentityViews(
  providerData: Array<{ providerId: string; uid?: string; email?: string | null }> | null | undefined,
): ProviderIdentityView[] {
  return (providerData ?? [])
    .map((info) => {
      const providerId = String(info?.providerId ?? '');
      const identityId = String(info?.uid ?? '');
      let provider: ProviderIdentityView['provider'] | null = null;
      if (providerId === 'google.com') provider = 'google';
      else if (providerId === 'github.com') provider = 'github';
      else if (providerId === 'password') provider = 'email';
      else return null;
      if (!identityId) return null;
      return {
        provider,
        identityId,
        email: typeof info?.email === 'string' ? info.email : null,
      } satisfies ProviderIdentityView;
    })
    .filter((view): view is ProviderIdentityView => view !== null);
}

/** Providers with no linked identity yet (candidates for "Connect"). */
export function unlinkedProviders(
  providerData: Array<{ providerId: string }> | null | undefined,
  pool: OAuthProviderId[] = [...SUPPORTED_PROVIDER_IDS],
): OAuthProviderId[] {
  const linked = new Set(toIdentityViews(providerData).map((view) => view.provider));
  return pool.filter((id) => !linked.has(id));
}
