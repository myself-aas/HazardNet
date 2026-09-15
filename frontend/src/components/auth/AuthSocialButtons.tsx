import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import ProviderGlyph from '../ProviderGlyph'
import {
  OAuthProviderId,
  SECONDARY_AFTER_GOOGLE_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
} from '../../lib/oauthProviders'

/**
 * Google-first social sign-in block for the auth pages.
 *
 * Order (per product spec): immediately after the email + password fields the
 * prominent "Continue with Google" button appears, followed by a compact row
 * of side-by-side circular icons for every other provider. The classic email
 * submit button sits below a divider.
 */

/** Circular brand icon button for the secondary providers. */
const ProviderIconButton: React.FC<{
  provider: OAuthProviderId
  active: OAuthProviderId | null
  onPick: (provider: OAuthProviderId) => void
}> = ({ provider, active, onPick }) => {
  const config = getProvider(provider)
  const busy = active === provider
  return (
    <button
      type="button"
      disabled={active !== null}
      onClick={() => onPick(provider)}
      aria-label={`Continue with ${config.label}`}
      title={config.note ? `${config.label} — ${config.note}` : `Continue with ${config.label}`}
      className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 cursor-pointer"
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      ) : (
        <span className="h-5 w-5 transition-transform group-hover:scale-110">
          <ProviderGlyph provider={provider} />
        </span>
      )}
    </button>
  )
}

export function AuthSocialButtons({
  label = 'Connect with Google',
  onSuccess,
}: {
  label?: string
  onSuccess?: () => void
}) {
  const { signInWithOAuth } = useAuth()
  const [active, setActive] = useState<OAuthProviderId | null>(null)
  const [failure, setFailure] = useState<{ provider: string; title: string; hint: string } | null>(null)

  const handleProvider = async (provider: OAuthProviderId) => {
    setActive(provider)
    setFailure(null)
    try {
      await signInWithOAuth(provider)
      onSuccess?.()
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      setFailure({ provider: getProvider(provider).label, ...explanation })
      setActive(null)
    }
  }

  return (
    <div className="space-y-3" data-testid="auth-social-buttons">
      {/* ── Primary: Connect with Google ──────────────────────────────── */}
      <button
        type="button"
        disabled={active !== null}
        onClick={() => handleProvider('google')}
        data-testid="connect-google-btn"
        aria-label={label}
        className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:shadow-md disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 focus-visible:ring-offset-2 cursor-pointer"
      >
        {active === 'google' ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        ) : (
          <span className="h-5 w-5 transition-transform group-hover:scale-110">
            <ProviderGlyph provider="google" />
          </span>
        )}
        {active === 'google' ? 'Connecting to Google…' : label}
      </button>

      {/* ── Secondary providers: compact side-by-side icons ───────────── */}
      <div className="flex items-center justify-center gap-2" data-testid="auth-provider-icons">
        {SECONDARY_AFTER_GOOGLE_PROVIDER_IDS.map((provider) => (
          <ProviderIconButton key={provider} provider={provider} active={active} onPick={handleProvider} />
        ))}
      </div>

      <p className="text-center text-[10px] text-slate-400">
        Fast, one-tap sign-in — no password needed with social accounts.
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
