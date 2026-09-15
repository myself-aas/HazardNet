/** The only supported social sign-in methods. Email/password is managed separately. */
export type OAuthProviderId = 'google' | 'github';
export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  short: string;
  color: string;
  developerAppUrl: string;
  setupDocsUrl: string;
  scopes?: string;
  note?: string;
}
export const PRIMARY_PROVIDER_IDS: OAuthProviderId[] = ['google', 'github'];
export const SECONDARY_PROVIDER_IDS: OAuthProviderId[] = [];
export const SECONDARY_AFTER_GOOGLE_PROVIDER_IDS: OAuthProviderId[] = ['github'];
const CONFIGS: Record<OAuthProviderId, OAuthProviderConfig> = {
  google: { id: 'google', label: 'Google', short: 'G', color: '#4285F4',
    developerAppUrl: 'https://console.cloud.google.com/apis/credentials',
    setupDocsUrl: 'https://firebase.google.com/docs/auth/web/google-signin' },
  github: { id: 'github', label: 'GitHub', short: 'GH', color: '#24292F',
    developerAppUrl: 'https://github.com/settings/applications/new',
    setupDocsUrl: 'https://firebase.google.com/docs/auth/web/github-auth', scopes: 'user:email' },
};

const unsafePath = (value: string) => [...value].some((c) => c === '\\' || c.charCodeAt(0) <= 32);

export function safeAuthReturnTo(value?: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || unsafePath(value)) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || unsafePath(decoded)) return '/';
    const url = new URL(value, 'https://hazardnet.invalid');
    if (url.origin !== 'https://hazardnet.invalid') return '/';
    if (/^\/(login|signup|sign-up|forgot-password|auth)(\/|$)/.test(url.pathname)) return '/';
    return value;
  } catch { return '/'; }
}
export function getProvider(id: OAuthProviderId): OAuthProviderConfig {
  if (!isOAuthProviderId(id)) throw new Error('Unsupported provider. Use Google or GitHub.');
  return CONFIGS[id];
}

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return Object.prototype.hasOwnProperty.call(CONFIGS, value);
}

/** sessionStorage key holding where to return after a completed OAuth flow. */
export const AUTH_RETURN_TO_KEY = 'hazardnet.auth.returnTo';

/** Default post-auth landing page. */
export const AUTH_DEFAULT_RETURN = '/';

/** Where to send the user after the callback completes (stored returnTo wins). */
export function resolveOAuthReturnTo(nextFromUrl: string | null): string {
  const fallback = safeAuthReturnTo(nextFromUrl);
  try {
    const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    if (stored) return safeAuthReturnTo(stored);
  } catch {
    // sessionStorage unavailable — fall through to the query param/default.
  }
  return fallback;
}

export interface OAuthErrorExplanation {
  title: string;
  hint: string;
  /** True when the fix is enabling the provider in Firebase. */
  providerDisabled: boolean;
}

/** Translate Firebase/provider OAuth errors into actionable guidance. */
export function describeOAuthError(rawError: unknown): OAuthErrorExplanation {
  const message =
    typeof rawError === 'string'
      ? rawError
      : ((rawError as { message?: string })?.message ?? String(rawError ?? ''));

  const text = `${(rawError as { code?: string })?.code ?? ''} ${message}`.toLowerCase();
  if (text.includes('account-exists-with-different-credential') || text.includes('credential-already-in-use')) {
    return { title: 'Use your existing sign-in method', hint: 'Sign in to your existing account first, then connect Google or GitHub in Account & Security. Accounts are not merged automatically.', providerDisabled: false };
  }
  if (text.includes('popup-blocked')) return { title: 'Sign-in popup blocked', hint: 'Allow popups for this site and try again.', providerDisabled: false };
  if (text.includes('requires-recent-login')) return { title: 'Sign in again', hint: 'For your security, sign out and sign in again before changing your account.', providerDisabled: false };

  if (text.includes('operation-not-allowed') || text.includes('not enabled') || text.includes('unsupported provider') || text.includes('provider_')) {
    return {
      title: 'Provider not enabled',
      hint: 'Enable this provider under Authentication → Sign-in method in the Firebase dashboard and paste the client ID/secret from the provider’s developer app.',
      providerDisabled: true,
    };
  }
  if (text.includes('unauthorized-domain') || text.includes('redirect') && (text.includes('uri') || text.includes('url') || text.includes('mismatch'))) {
    return {
      title: 'Redirect URL not allow-listed',
      hint: 'Add the exact callback URL to both the provider’s developer app and Firebase Authentication → Settings → Authorized domains; use the Firebase /__/auth/handler callback in the provider app.',
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
  if (text.includes('popup-closed-by-user') || text.includes('cancelled-popup-request') || text.includes('access_denied') || text.includes('cancelled') || text.includes('canceled')) {
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
      hint: 'Firebase environment variables are missing for this deployment; social sign-in cannot start.',
      providerDisabled: false,
    };
  }
  return {
    title: 'Sign-in could not complete',
    hint: message ? `${message}` : 'Unexpected error during sign-in. Please try again.',
    providerDisabled: false,
  };
}

export interface ProviderIdentityView {
  provider: OAuthProviderId;
  identityId: string;
  email: string | null;
  lastSignInAt: string | null;
}

/** Normalize native Firebase providerData (legacy stored identities remain readable) into linkable/unlinkable views. */
export function toIdentityViews(
  identities: Array<Record<string, unknown>> | null | undefined,
): ProviderIdentityView[] {
  return (identities ?? [])
    .map((identity) => {
      const raw = String(identity.providerId ?? identity.provider ?? '');
      const provider = raw.replace(/\.com$/, '');
      const identityId = String(identity.uid ?? identity.identityId ?? identity.identity_id ?? identity.id ?? '');
      if (!isOAuthProviderId(provider) || !identityId) return null;
      const identityData = (identity.identity_data ?? identity) as Record<string, unknown>;
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
  // An email/password account has no "email" identity in some Firebase
  // configurations; the pool simply lists providers the user can connect.
  return pool.filter((id) => !linked.has(id));
}
