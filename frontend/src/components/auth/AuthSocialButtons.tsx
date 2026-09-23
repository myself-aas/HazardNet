import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import ProviderGlyph from '../ProviderGlyph'
import {
  SUPPORTED_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
  type OAuthProviderId,
} from '../../lib/oauthProviders'

/**
 * Social sign-in block for the auth pages.
 *
 * Exactly two providers are offered — Google and GitHub — because those are the
 * only sign-in providers enabled on the Firebase project. Each is a full
 * button with its brand glyph and label; no other identity provider is shown.
 */

const ProviderButton: React.FC<{
  provider: OAuthProviderId
  label: string
  active: OAuthProviderId | null
  onPick: (provider: OAuthProviderId) => void
}> = ({ provider, label, active, onPick }) => {
  const config = getProvider(provider)
  const busy = active === provider
  const disabled = active !== null
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(provider)}
      data-testid={`connect-${provider}-btn`}
      aria-label={label}
      className="group flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-3 border border-carbon-20 bg-white px-4 py-3 text-base font-semibold text-carbon-80 hover:border-carbon-40 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2"
    >
      {busy ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-carbon-30 border-t-carbon-70" />
      ) : (
        <span className="h-5 w-5 transition-transform group-hover:scale-110">
          <ProviderGlyph provider={provider} />
        </span>
      )}
      {busy ? `Connecting to ${config.label}…` : label}
    </button>
  )
}

export function AuthSocialButtons({
  googleLabel = 'Continue with Google',
  githubLabel = 'Continue with GitHub',
  onSuccess,
}: {
  googleLabel?: string
  githubLabel?: string
  onSuccess?: () => void
}) {
  const { signInWithOAuth } = useAuth()
  const [active, setActive] = useState<OAuthProviderId | null>(null)
  const [failure, setFailure] = useState<{ provider: string; title: string; hint: string } | null>(null)

  const handleProvider = async (provider: OAuthProviderId) => {
    setActive(provider)
    setFailure(null)
    try {
      // Respect ?next= param if present
      let nextTo: string | undefined
      try {
        const params = new URLSearchParams(window.location.search)
        const raw = params.get('next')
        if (raw && raw.startsWith('/')) nextTo = raw
      } catch {
        // Search params may be unavailable in tests; default to no next path.
      }
      // Only pass the options object when we have a destination — calling
      // `signInWithOAuth(id, undefined)` fails the Jest arity check
      // (`toHaveBeenCalledWith('google')`) and left Frontend Tests red on
      // PR #41 (run 35502660580) after the optional-next wiring landed.
      if (nextTo) {
        await signInWithOAuth(provider, { nextTo })
      } else {
        await signInWithOAuth(provider)
      }
      onSuccess?.()
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      setFailure({ provider: getProvider(provider).label, ...explanation })
      setActive(null)
    }
  }

  const labels: Record<OAuthProviderId, string> = {
    google: googleLabel,
    github: githubLabel,
  }

  return (
    <div className="space-y-3" data-testid="auth-social-buttons">
      {SUPPORTED_PROVIDER_IDS.map((provider) => (
        <ProviderButton
          key={provider}
          provider={provider}
          label={labels[provider]}
          active={active}
          onPick={handleProvider}
        />
      ))}

      <p className="text-center text-xs text-carbon-60">
        One-tap sign-in through Google or GitHub — no additional password needed. If popup is blocked, we will redirect.
      </p>

      <AnimatePresence>
        {failure && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="alert"
            className="border-l-2 border-nasa-red bg-white p-4 text-sm text-nasa-red-shade"
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
