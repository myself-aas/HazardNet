import { GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { createSocialProvider } from '../firebaseProviders';
import { safeAuthReturnTo, resolveOAuthReturnTo, AUTH_RETURN_TO_KEY, describeOAuthError, toIdentityViews } from '../oauthProviders';

it('uses the dedicated Firebase SDK providers with minimal scopes', () => {
  expect(createSocialProvider('google')).toBeInstanceOf(GoogleAuthProvider);
  const github = createSocialProvider('github');
  expect(github).toBeInstanceOf(GithubAuthProvider);
  expect(github.getScopes()).toEqual(['user:email']);
});
it.each(['facebook', 'phone', 'anonymous', 'emailLink', 'microsoft', 'apple', 'linkedin', 'twitter', 'slack', 'discord', 'figma', 'orcid', 'password', '__proto__'])('rejects unsupported provider %s at runtime', (id) => {
  expect(() => createSocialProvider(id)).toThrow('Unsupported provider');
});
it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/%2fevil.test', '/%5cevil.test', '/%0aevil', '/login', '/auth/callback', '/%'])('rejects unsafe return target %s', (path) => {
  expect(safeAuthReturnTo(path)).toBe('/');
});
it('preserves valid local destinations and consumes stored values safely', () => {
  expect(safeAuthReturnTo('/dashboard?tab=profile')).toBe('/dashboard?tab=profile');
  sessionStorage.setItem(AUTH_RETURN_TO_KEY, '//evil.test');
  expect(resolveOAuthReturnTo('/dashboard')).toBe('/');
  expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
});
it('reads native Firebase identities and excludes retired providers', () => {
  expect(toIdentityViews([{ providerId: 'github.com', uid: 'gh1', email: 'dev@example.com' },
    { providerId: 'password', uid: 'email1' }, { providerId: 'apple.com', uid: 'apple1' }]))
    .toEqual([{ provider: 'github', identityId: 'gh1', email: 'dev@example.com', lastSignInAt: null }]);
});
it.each(['auth/account-exists-with-different-credential', 'auth/credential-already-in-use'])('explains %s without silently merging accounts', (code) => {
  expect(describeOAuthError({ code }).hint).toContain('not merged automatically');
});
it('explains popup cancellation and authorized-domain configuration', () => {
  expect(describeOAuthError({ code: 'auth/popup-closed-by-user' }).title).toBe('Sign-in cancelled');
  expect(describeOAuthError({ code: 'auth/unauthorized-domain' }).hint).toContain('Authorized domains');
});
