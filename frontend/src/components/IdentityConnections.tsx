import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import ProviderGlyph from './ProviderGlyph'
import { Button } from './apple/primitives'
import { useAuth } from '../context/AuthContext'
import {
  describeOAuthError,
  getProvider,
  toIdentityViews,
  unlinkedProviders,
  type OAuthProviderId,
} from '../lib/oauthProviders'

/**
 * Connected accounts management: shows every provider identity linked to the
 * signed-in Firebase user and lets them connect Google/GitHub (linkWithPopup)
 * or disconnect an existing one (unlink). Email/password is shown as the
 * built-in "email" method.
 *
 * The block renders ROWS, not a card. It used to draw its own bordered,
 * rounded-xl box with its own uppercase heading and its own emerald "Connected"
 * pill, which is why one screen had a panel inside a card inside a page — and
 * why the unlink action had to improvise with rose, the severity vocabulary,
 * for a control that is not a hazard reading. It now assumes the caller's
 * `Panel` for grouping and uses the system's destructive grammar: the one
 * Action Blue, with the word "Disconnect" carrying the meaning.
 */
export const IdentityConnections: React.FC = () => {
  const { user, linkIdentity, unlinkIdentity, refreshProfile } = useAuth()
  const [linked, setLinked] = useState<ReturnType<typeof toIdentityViews>>([])
  const [linking, setLinking] = useState<OAuthProviderId | null>(null)
  const [unlinking, setUnlinking] = useState<OAuthProviderId | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) return
    try {
      setLoadError(null)
      setLinked(toIdentityViews(user.providerData))
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Could not load connected accounts.')
    }
  }, [user])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleLink = async (provider: OAuthProviderId) => {
    setLinking(provider)
    try {
      await linkIdentity(provider)
      await refreshProfile()
      toast.success(`Connected ${getProvider(provider).label}.`)
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      toast.error(`${getProvider(provider).label}: ${explanation.title}. ${explanation.hint}`, { duration: 5200 })
    } finally {
      setLinking(null)
    }
  }

  const handleUnlink = async (provider: OAuthProviderId) => {
    setUnlinking(provider)
    try {
      await unlinkIdentity(provider)
      toast.success(`Disconnected ${getProvider(provider).label}.`)
      await refreshProfile()
      setLinked((views) => views.filter((view) => view.provider !== provider))
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      toast.error(`${getProvider(provider).label}: ${message}`, { duration: 5200 })
    } finally {
      setUnlinking(null)
    }
  }

  if (!user) return null

  const available = unlinkedProviders(user.providerData)

  return (
    <div className="space-y-4">
      <p className="text-sm leading-[1.62] text-carbon-70">
        Link Google or GitHub to sign into this same HazardNet account with any of them. Disconnecting removes only
        the sign-in method. Your advisories and saved assessments stay.
      </p>

      {loadError && (
        <p role="alert" className="text-sm font-semibold text-ap-link">
          {loadError}
        </p>
      )}

      {linked.length > 0 && (
        <ul className="divide-y divide-carbon-10 border-t border-carbon-10" data-testid="linked-identities">
          {linked.map((identity) => {
            const label = identity.provider === 'email' ? 'Email & password' : getProvider(identity.provider).label
            const isLastIdentity = linked.length === 1
            return (
              <li key={identity.provider} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {identity.provider === 'email' ? (
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-carbon-05 text-sm font-bold text-carbon-70"
                    >
                      @
                    </span>
                  ) : (
                    <ProviderGlyph provider={identity.provider} className="h-6 w-6" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-carbon-90">{label}</p>
                    <p className="truncate text-xs text-carbon-60">
                      {identity.email ?? 'Identity linked'}
                      {isLastIdentity && ' · last sign-in method'}
                    </p>
                  </div>
                </div>
                {identity.provider !== 'email' && (
                  <Button
                    intent="secondary"
                    size="sm"
                    onClick={() => handleUnlink(identity.provider as OAuthProviderId)}
                    disabled={unlinking === identity.provider || isLastIdentity}
                    title={
                      isLastIdentity
                        ? 'Add another sign-in method before removing the last one'
                        : `Disconnect ${label}`
                    }
                  >
                    {unlinking === identity.provider ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-2 border-t border-carbon-10 pt-4">
          <p className="text-sm font-semibold text-carbon-80">Connect another provider</p>
          <div className="flex flex-wrap gap-2" data-testid="linkable-providers">
            {available.map((provider) => {
              const config = getProvider(provider)
              return (
                <Button
                  key={provider}
                  intent="secondary"
                  size="sm"
                  onClick={() => handleLink(provider)}
                  disabled={linking !== null}
                >
                  {linking === provider ? (
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-carbon-30 border-t-carbon-60"
                    />
                  ) : (
                    <ProviderGlyph provider={provider} className="h-3.5 w-3.5" />
                  )}
                  {linking === provider ? 'Connecting…' : `Connect ${config.label}`}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default IdentityConnections
