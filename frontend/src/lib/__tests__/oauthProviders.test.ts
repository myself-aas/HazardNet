import {
  PRIMARY_PROVIDER_IDS,
  SECONDARY_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
  isOAuthProviderId,
  toIdentityViews,
  unlinkedProviders,
} from '../oauthProviders';

describe('oauthProviders — registry completeness', () => {
  it('supports only Google and GitHub', () => {
    expect(PRIMARY_PROVIDER_IDS).toEqual(['google', 'github']);
    expect(SECONDARY_PROVIDER_IDS).toEqual([]);
  });

  it('gives every provider a label, brand color and setup docs', () => {
    [...PRIMARY_PROVIDER_IDS, ...SECONDARY_PROVIDER_IDS].forEach((id) => {
      const config = getProvider(id);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.color).toMatch(/^#([0-9a-f]{6})$/i);
      expect(config.setupDocsUrl).toMatch(/^https:\/\/firebase\.google\.com\/docs\//);
      expect(config.developerAppUrl).toMatch(/^https:\/\//);
    });
  });

  it('validates provider ids', () => {
    expect(isOAuthProviderId('figma')).toBe(false);
    expect(isOAuthProviderId('zoom')).toBe(false); // removed from the registry
    expect(isOAuthProviderId('myspace')).toBe(false);
  });
});

describe('oauthProviders — error explanations', () => {
  it('recognizes disabled providers', () => {
    const explanation = describeOAuthError(new Error('Unsupported provider: provider is not enabled'));
    expect(explanation.providerDisabled).toBe(true);
    expect(explanation.hint).toMatch(/Firebase dashboard/);
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

  it('recognizes unconfigured Firebase', () => {
    expect(describeOAuthError(new Error('Firebase is not configured')).title).toBe(
      'Authentication unavailable',
    );
  });

  it('falls back to the raw message', () => {
    expect(describeOAuthError(new Error('boom')).hint).toContain('boom');
    expect(describeOAuthError(undefined).title).toBe('Sign-in could not complete');
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
    expect(views.map((view) => view.provider)).toEqual(['github']);
    expect(views[0].email).toBe('dev@example.com');
  });

  it('drops entries without an identity id', () => {
    expect(toIdentityViews([{ provider: 'slack' }])).toEqual([]);
  });

  it('lists unlinked providers for the connect UI', () => {
    const unlinked = unlinkedProviders(identities);
    expect(unlinked).toEqual(['google']);
    expect(unlinked).not.toContain('github');
    expect(unlinked).not.toContain('figma');
  });
});
