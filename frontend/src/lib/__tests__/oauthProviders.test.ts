import {
  AUTH_CALLBACK_PATH,
  SUPPORTED_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
  isOAuthProviderId,
  mapProviderUserMetadata,
  parseOAuthCallbackParams,
  resolveOAuthReturnTo,
  toIdentityViews,
  unlinkedProviders,
} from '../oauthProviders';

describe('oauthProviders — registry completeness', () => {
  it('exposes exactly Google and GitHub (no other providers)', () => {
    expect(SUPPORTED_PROVIDER_IDS).toEqual(['google', 'github']);
  });

  it('gives every provider a label, brand color and Firebase setup docs', () => {
    SUPPORTED_PROVIDER_IDS.forEach((id) => {
      const config = getProvider(id);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.color).toMatch(/^#([0-9a-f]{6})$/i);
      expect(config.setupDocsUrl).toMatch(/^https:\/\/firebase\.google\.com\/docs\//);
      expect(config.developerAppUrl).toMatch(/^https:\/\//);
    });
  });

  it('maps provider ids onto Firebase provider ids', () => {
    expect(getProvider('google').firebaseProviderId).toBe('google.com');
    expect(getProvider('github').firebaseProviderId).toBe('github.com');
  });

  it('validates provider ids', () => {
    expect(isOAuthProviderId('google')).toBe(true);
    expect(isOAuthProviderId('github')).toBe(true);
    expect(isOAuthProviderId('figma')).toBe(false);
    expect(isOAuthProviderId('orcid')).toBe(false);
    expect(isOAuthProviderId('linkedin')).toBe(false);
    expect(isOAuthProviderId('myspace')).toBe(false);
  });
});

describe('oauthProviders — callback parsing', () => {
  it('reads code and next from the query string', () => {
    const parsed = parseOAuthCallbackParams('?code=abc.def&next=%2Fforecast%2Foverview');
    expect(parsed.code).toBe('abc.def');
    expect(parsed.next).toBe('/forecast/overview');
    expect(parsed.error).toBeNull();
  });

  it('reads provider errors and error codes', () => {
    const denied = parseOAuthCallbackParams('?error=access_denied&error_description=User+cancelled');
    expect(denied.error).toBe('access_denied');
    expect(denied.errorDescription).toBe('User cancelled');

    const goTrue = parseOAuthCallbackParams('?error_code=403&error_description=Identity+is+already+linked');
    expect(goTrue.error).toBe('403');
  });
});

describe('oauthProviders — returnTo resolution', () => {
  it('returns the stored destination', () => {
    sessionStorage.setItem('hazardnet.auth.returnTo', '/advisories');
    expect(resolveOAuthReturnTo(null)).toBe('/advisories');
    expect(sessionStorage.getItem('hazardnet.auth.returnTo')).toBeNull();
  });

  it('falls back to the next param then the default', () => {
    expect(resolveOAuthReturnTo('/dashboard')).toBe('/dashboard');
    expect(resolveOAuthReturnTo(null)).toBe('/');
  });

  it('keeps the callback path constant', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
  });
});

describe('oauthProviders — error explanations', () => {
  it('recognizes providers that are not enabled', () => {
    const explanation = describeOAuthError(new Error('OPERATION_NOT_ALLOWED: identity provider not enabled'));
    expect(explanation.hint).toMatch(/Firebase console/);
  });

  it('recognizes account-exists-with-different-credential', () => {
    const err = Object.assign(new Error('account exists'), { code: 'auth/account-exists-with-different-credential' });
    expect(describeOAuthError(err).title).toBe('Email already in use with another sign-in method');
  });

  it('recognizes cancelled authorization', () => {
    expect(describeOAuthError('access_denied').title).toBe('Sign-in cancelled');
  });

  it('recognizes unauthorized domains', () => {
    expect(describeOAuthError('unauthorized_domain').title).toBe('Domain not authorized');
  });

  it('falls back to the raw message', () => {
    expect(describeOAuthError(new Error('boom')).hint).toContain('boom');
    expect(describeOAuthError(undefined).title).toBe('Sign-in could not complete');
  });
});

describe('oauthProviders — metadata mapping', () => {
  it('prefers display_name then full_name then usernames', () => {
    expect(mapProviderUserMetadata({ display_name: 'A', full_name: 'B' }).displayName).toBe('A');
    expect(mapProviderUserMetadata({ full_name: 'B', name: 'C' }).displayName).toBe('B');
    expect(mapProviderUserMetadata({ preferred_username: 'd' }).displayName).toBe('d');
  });

  it('maps avatar candidates across providers', () => {
    expect(mapProviderUserMetadata({ picture: 'p.png' }).avatarUrl).toBe('p.png');
    expect(mapProviderUserMetadata({ avatar_url: 'a.png' }).avatarUrl).toBe('a.png');
  });

  it('handles null metadata safely', () => {
    const seed = mapProviderUserMetadata(null);
    expect(seed.displayName).toBe('User');
    expect(seed.email).toBeNull();
    expect(seed.avatarUrl).toBeNull();
  });
});

describe('oauthProviders — identity views', () => {
  const providerData = [
    { providerId: 'github.com', uid: 'gh-1', email: 'dev@example.com' },
    { providerId: 'password', uid: 'a@b.c', email: 'a@b.c' },
    { providerId: 'facebook.com', uid: 'fb-1', email: 'fb@example.com' },
  ];

  it('normalizes identities and skips providers that are not enabled', () => {
    const views = toIdentityViews(providerData);
    expect(views.map((view) => view.provider)).toEqual(['github', 'email']);
    expect(views[0].email).toBe('dev@example.com');
  });

  it('lists unlinked providers for the connect UI', () => {
    const unlinked = unlinkedProviders(providerData);
    expect(unlinked).toContain('google');
    expect(unlinked).not.toContain('github');
  });
});
