import {
  AUTH_CALLBACK_PATH,
  PRIMARY_PROVIDER_IDS,
  SECONDARY_PROVIDER_IDS,
  buildOAuthRedirectTo,
  describeOAuthError,
  getProvider,
  isOAuthProviderId,
  mapProviderUserMetadata,
  parseOAuthCallbackParams,
  toIdentityViews,
  unlinkedProviders,
} from '../oauthProviders';

describe('oauthProviders — registry completeness', () => {
  it('exposes the six primary providers (zoom removed)', () => {
    expect(PRIMARY_PROVIDER_IDS).toEqual([
      'linkedin',
      'github',
      'slack',
      'discord',
      'twitter',
      'figma',
    ]);
  });

  it('keeps the legacy providers as secondary options', () => {
    expect(SECONDARY_PROVIDER_IDS).toContain('google');
    expect(SECONDARY_PROVIDER_IDS).toContain('orcid');
  });

  it('gives every provider a label, brand color and setup docs', () => {
    [...PRIMARY_PROVIDER_IDS, ...SECONDARY_PROVIDER_IDS].forEach((id) => {
      const config = getProvider(id);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.color).toMatch(/^#([0-9a-f]{6})$/i);
      expect(config.setupDocsUrl).toMatch(/^https:\/\/supabase\.com\/docs\//);
      expect(config.developerAppUrl).toMatch(/^https:\/\//);
    });
  });

  it('validates provider ids', () => {
    expect(isOAuthProviderId('figma')).toBe(true);
    expect(isOAuthProviderId('zoom')).toBe(false); // removed from the registry
    expect(isOAuthProviderId('myspace')).toBe(false);
  });
});

describe('oauthProviders — redirect URL construction', () => {
  it('builds the plain callback URL by default', () => {
    expect(buildOAuthRedirectTo('https://www.hazardnet.live')).toBe(
      `https://www.hazardnet.live${AUTH_CALLBACK_PATH}`,
    );
  });

  it('appends a next destination when provided', () => {
    expect(buildOAuthRedirectTo('https://hazardnet.live/', '/advisories?tab=2')).toBe(
      'https://hazardnet.live/auth/callback?next=%2Fadvisories%3Ftab%3D2',
    );
  });

  it('omits next when it equals the default landing page', () => {
    expect(buildOAuthRedirectTo('https://x.dev', '/')).toBe('https://x.dev/auth/callback');
  });
});

describe('oauthProviders — callback parsing', () => {
  it('reads code and next from the query string', () => {
    const parsed = parseOAuthCallbackParams('?code=abc.def&next=%2Fforecast%2Foverview');
    expect(parsed.code).toBe('abc.def');
    expect(parsed.next).toBe('/forecast/overview');
    expect(parsed.error).toBeNull();
    expect(parsed.implicitHash).toBe(false);
  });

  it('reads provider errors and goTrue error codes', () => {
    const denied = parseOAuthCallbackParams('?error=access_denied&error_description=User+cancelled');
    expect(denied.error).toBe('access_denied');
    expect(denied.errorDescription).toBe('User cancelled');

    const goTrue = parseOAuthCallbackParams('?error_code=403&error_description=Identity+is+already+linked');
    expect(goTrue.error).toBe('403');
  });

  it('detects implicit-flow hash payloads', () => {
    const parsed = parseOAuthCallbackParams('', '#access_token=token&provider_token=t');
    expect(parsed.implicitHash).toBe(true);
    expect(parsed.code).toBeNull();
  });
});

describe('oauthProviders — error explanations', () => {
  it('recognizes disabled providers', () => {
    const explanation = describeOAuthError(new Error('Unsupported provider: provider is not enabled'));
    expect(explanation.providerDisabled).toBe(true);
    expect(explanation.hint).toMatch(/Supabase dashboard/);
  });

  it('recognizes redirect URL mismatches', () => {
    expect(describeOAuthError('invalid redirect_uri').title).toBe('Redirect URL not allow-listed');
  });

  it('recognizes cancelled authorization', () => {
    expect(describeOAuthError('access_denied').title).toBe('Sign-in cancelled');
  });

  it('recognizes already-linked identities', () => {
    expect(describeOAuthError('Identity is already linked').title).toBe('Account already connected');
  });

  it('recognizes unconfigured Supabase', () => {
    expect(describeOAuthError(new Error('Supabase is not configured')).title).toBe(
      'Authentication unavailable',
    );
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
    expect(mapProviderUserMetadata({ twitter_profile_image_url: 't.png' }).avatarUrl).toBe('t.png');
  });

  it('handles null metadata safely', () => {
    const seed = mapProviderUserMetadata(null);
    expect(seed.displayName).toBe('User');
    expect(seed.email).toBeNull();
    expect(seed.avatarUrl).toBeNull();
  });
});

describe('oauthProviders — identity views', () => {
  const identities = [
    {
      provider: 'github',
      identity_id: 'id-1',
      identity_data: { email: 'dev@example.com' },
      last_sign_in_at: '2026-01-01T00:00:00Z',
    },
    { provider: 'email', identity_id: 'id-2', identity_data: { email: 'a@b.c' } },
    { provider: 'figma', identity_id: 'id-3', identity_data: {} },
  ];

  it('normalizes identities and skips non-registry providers', () => {
    const views = toIdentityViews(identities);
    expect(views.map((view) => view.provider)).toEqual(['github', 'figma']);
    expect(views[0].email).toBe('dev@example.com');
  });

  it('drops entries without an identity id', () => {
    expect(toIdentityViews([{ provider: 'slack' }])).toEqual([]);
  });

  it('lists unlinked providers for the connect UI', () => {
    const unlinked = unlinkedProviders(identities);
    expect(unlinked).toContain('linkedin');
    expect(unlinked).toContain('slack');
    expect(unlinked).toContain('discord');
    expect(unlinked).toContain('twitter');
    expect(unlinked).not.toContain('github');
    expect(unlinked).not.toContain('figma');
  });
});
