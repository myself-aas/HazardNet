import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'
import ProviderGlyph from './ProviderGlyph'
import {
  OAuthProviderId,
  PRIMARY_PROVIDER_IDS,
  SECONDARY_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
} from '../lib/oauthProviders'

/**
 * Social sign-up/sign-in buttons for every configured OAuth provider.
 *
 * Clicking a button starts Supabase's redirect OAuth flow (PKCE): the browser
 * goes to the provider and returns to /auth/callback, which completes the
 * exchange and routes the user back where they started. Each provider must be
 * enabled with its client ID/secret in Supabase → Authentication → Providers
 * (docs/oauth-provider-setup.md); until then Supabase answers with a clear
 * "provider is not enabled" error which is surfaced here with setup guidance.
 */

const Button: React.FC<{
  provider: OAuthProviderId
  active: OAuthProviderId | null
  onPick: (provider: OAuthProviderId) => void
  wide?: boolean
}> = ({ provider, active, onPick, wide }) => {
  const config = getProvider(provider)
  const busy = active === provider
  return (
    <button
      type="button"
      disabled={active !== null}
      onClick={() => onPick(provider)}
      className={`group flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[11px] font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-xs disabled:cursor-wait disabled:opacity-60 ${wide ? 'w-full' : ''}`}
      aria-label={`Continue with ${config.label}`}
      title={config.note ? `${config.label} — ${config.note}` : `Continue with ${config.label}`}
    >
      {busy ? (
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      ) : (
        <ProviderGlyph provider={provider} className="h-5 w-5 transition-transform group-hover:scale-110" />
      )}
      <span className="truncate">{busy ? 'Redirecting…' : config.label}</span>
    </button>
  )
}

export function OAuthButtons() {
  const { signInWithOAuth } = useAuth()
  const [active, setActive] = useState<OAuthProviderId | null>(null)
  const [failure, setFailure] = useState<{ provider: string; title: string; hint: string } | null>(null)
  const [showMore, setShowMore] = useState(false)

  const handleProvider = async (provider: OAuthProviderId) => {
    setActive(provider)
    setFailure(null)
    try {
      await signInWithOAuth(provider)
      // On success the browser leaves the page; nothing else to do.
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      setFailure({ provider: getProvider(provider).label, ...explanation })
      setActive(null)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2" data-testid="oauth-primary-providers">
        {PRIMARY_PROVIDER_IDS.map((provider) => (
          <Button key={provider} provider={provider} active={active} onPick={handleProvider} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((value) => !value)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-[10px] font-bold text-slate-500 transition-colors hover:text-slate-800"
        aria-expanded={showMore}
      >
        {showMore ? 'Fewer sign-in options' : 'More sign-in options'}
        <span className={`transition-transform ${showMore ? 'rotate-180' : ''}`}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {showMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2" data-testid="oauth-secondary-providers">
              {SECONDARY_PROVIDER_IDS.map((provider) => (
                <Button key={provider} provider={provider} active={active} onPick={handleProvider} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px] leading-relaxed text-slate-500">
        Social sign-in runs through Supabase Auth. Each provider must be enabled with its client ID/secret in the
        Supabase dashboard (Authentication → Providers) — see{' '}
        <a
          href="https://github.com/myself-aas/HazardNet/blob/main/docs/oauth-provider-setup.md"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-amber-700 underline-offset-2 hover:underline"
        >
          the provider setup guide
        </a>
        . ORCID uses a custom OIDC provider configuration.
      </p>

      <AnimatePresence>
        {failure && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"
          >
            <p className="font-extrabold">
              {failure.provider}: {failure.title}
            </p>
            <p className="mt-0.5 font-medium leading-relaxed">{failure.hint}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
