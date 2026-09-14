import { GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getProvider, isOAuthProviderId } from './oauthProviders';

export function createSocialProvider(id: string) {
  if (!isOAuthProviderId(id)) throw new Error('Unsupported provider. Use Google or GitHub.');
  const provider = id === 'google' ? new GoogleAuthProvider() : new GithubAuthProvider();
  for (const scope of (getProvider(id).scopes ?? '').split(' ').filter(Boolean)) provider.addScope(scope);
  if (id === 'google') provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
