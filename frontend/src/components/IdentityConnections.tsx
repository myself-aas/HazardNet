import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import ProviderGlyph from './ProviderGlyph'
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
      toast.error(`${getProvider(provider).label}: ${explanation.title} — ${explanation.hint}`, { duration: 5200 })
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
    <div className="bg-carbon-05 border border-carbon-20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProviderGlyph provider="github" className="h-4 w-4" />
          <h4 className="text-xs font-extrabold text-carbon-90 uppercase tracking-wide">
            Connected Accounts & Social Sign-In
          </h4>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-carbon-10 text-carbon-70 border border-carbon-20">
          {linked.length} linked
        </span>
      </div>

      <p className="text-[11px] text-carbon-60 leading-relaxed">
        Link Google or GitHub to sign into this same HazardNet account with any of them.
        Disconnecting removes only the sign-in method — your advisories and saved assessments stay.
      </p>

      {loadError && (
        <p role="alert" className="text-[11px] font-semibold text-rose-700">
          {loadError}
        </p>
      )}

      {linked.length > 0 && (
        <ul className="space-y-1.5" data-testid="linked-identities">
          {linked.map((identity) => {
            const label = identity.provider === 'email' ? 'Email & password' : getProvider(identity.provider).label
            const isLastIdentity = linked.length === 1
            return (
              <li
                key={identity.provider}
                className="flex items-center justify-between gap-3 rounded-lg border border-carbon-20 bg-white p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {identity.provider === 'email' ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-carbon-20 text-[10px] font-black text-carbon-60">
                      @
                    </span>
                  ) : (
                    <ProviderGlyph provider={identity.provider} className="h-5 w-5" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-carbon-80">{label}</p>
                    <p className="truncate text-[10px] text-carbon-60">
                      {identity.email ?? 'Identity linked'}
                      {isLastIdentity && ' — last sign-in method'}
                    </p>
                  </div>
                </div>
                {identity.provider !== 'email' && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(identity.provider as OAuthProviderId)}
                    disabled={unlinking === identity.provider || isLastIdentity}
                    title={
                      isLastIdentity
                        ? 'Add another sign-in method before removing the last one'
                        : `Disconnect ${label}`
                    }
                    className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {unlinking === identity.provider ? 'Removing…' : 'Disconnect'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-carbon-60">Connect another provider</p>
          <div className="flex flex-wrap gap-1.5" data-testid="linkable-providers">
            {available.map((provider) => {
              const config = getProvider(provider)
              return (
                <motion.button
                  key={provider}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLink(provider)}
                  disabled={linking !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-carbon-20 bg-white px-2.5 py-1.5 text-[10px] font-bold text-carbon-70 transition-colors hover:border-carbon-30 hover:bg-carbon-05 disabled:cursor-wait disabled:opacity-60"
                >
                  {linking === provider ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-carbon-30 border-t-carbon-60" />
                  ) : (
                    <ProviderGlyph provider={provider} className="h-3.5 w-3.5" />
                  )}
                  {linking === provider ? 'Connecting…' : config.label}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default IdentityConnections
