import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProviderGlyph from '../ProviderGlyph';
import { PRIMARY_PROVIDER_IDS, describeOAuthError, getProvider, type OAuthProviderId } from '../../lib/oauthProviders';

export function AuthSocialButtons({ label = 'Continue with Google', onSuccess, disabled = false }: {
  label?: string; onSuccess?: () => void; disabled?: boolean;
}) {
  const { signInWithOAuth } = useAuth();
  const [active, setActive] = useState<OAuthProviderId | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof describeOAuthError> | null>(null);
  const connect = async (provider: OAuthProviderId) => {
    if (disabled || active) return;
    setActive(provider);
    setFailure(null);
    try { await signInWithOAuth(provider); onSuccess?.(); }
    catch (error) { setFailure(describeOAuthError(error)); }
    finally { setActive(null); }
  };
  return <div className="space-y-3" data-testid="auth-social-buttons">
    {PRIMARY_PROVIDER_IDS.map((provider) => <button key={provider} type="button"
      data-testid={`connect-${provider}-btn`} disabled={disabled || active !== null}
      onClick={() => void connect(provider)}
      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500">
      <ProviderGlyph provider={provider} />
      {active === provider ? `Connecting to ${getProvider(provider).label}…` : provider === 'google' ? label : 'Continue with GitHub'}
    </button>)}
    {failure && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
      <p className="font-bold">{failure.title}</p><p>{failure.hint}</p>
    </div>}
  </div>;
}
