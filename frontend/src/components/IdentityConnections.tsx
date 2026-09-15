import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import ProviderGlyph from './ProviderGlyph'
import { useAuth } from '../context/AuthContext'
import {
  OAuthProviderId,
  PRIMARY_PROVIDER_IDS,
  SECONDARY_PROVIDER_IDS,
  describeOAuthError,
  getProvider,
  toIdentityViews,
} from '../lib/oauthProviders'

/**
 * Connected accounts management: shows every provider identity linked to the
 * signed-in Firebase user and lets them connect more (linkIdentity popup
 * flow) or disconnect existing ones (unlinkIdentity). Users can combine,
 * a Google identity with a GitHub identity on one account.
 */
export const IdentityConnections: React.FC = () => {
  const { user, linkIdentity, unlinkIdentity } = useAuth()
  const [linked, setLinked] = useState<ReturnType<typeof toIdentityViews>>([])
  const [linking, setLinking] = useState<OAuthProviderId | null>(null)
  const [unlinking, setUnlinking] = useState<OAuthProviderId | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) return
    try {
      setLoadError(null)
      const views = toIdentityViews(user.providerData as unknown as Array<Record<string, unknown>>)
      setLinked(views)
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
      await reload();
      setLinking(null);
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      toast.error(`${getProvider(provider).label}: ${explanation.title} — ${explanation.hint}`, { duration: 5200 })
      setLinking(null)
    }
  }

  const handleUnlink = async (provider: OAuthProviderId) => {
    setUnlinking(provider)
    try {
      await unlinkIdentity(provider)
      toast.success(`Disconnected ${getProvider(provider).label}.`)
      // Refresh identities from the auth context user (context reloads on
      // USER_UPDATED events); optimistically drop the local row too.
      setLinked((views) => views.filter((view) => view.provider !== provider))
    } catch (reason) {
      const explanation = describeOAuthError(reason)
      toast.error(`${getProvider(provider).label}: ${explanation.title} — ${explanation.hint}`, { duration: 5200 })
    } finally {
      setUnlinking(null)
    }
  }

  if (!user) return null

  const available = [...PRIMARY_PROVIDER_IDS, ...SECONDARY_PROVIDER_IDS].filter((p) => !linked.some((identity) => identity.provider === p));
  const supportedCount = user.providerData.filter((p) => ['password', 'google.com', 'github.com'].includes(p.providerId)).length;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProviderGlyph provider="github" className="h-4 w-4" />
          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
            Connected Accounts & Social Sign-In
          </h4>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {linked.length} linked
        </span>
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed">
        Link Google or GitHub to sign into this same HazardNet account
        with any of them. Disconnecting removes only the sign-in method — your advisories and saved assessments stay.
      </p>

      {loadError && (
        <p role="alert" className="text-[11px] font-semibold text-rose-700">
          {loadError}
        </p>
      )}

      {linked.length > 0 && (
        <ul className="space-y-1.5" data-testid="linked-identities">
          {linked.map((identity) => {
            const config = getProvider(identity.provider)
            const isLastIdentity = supportedCount <= 1
            return (
              <li
                key={identity.identityId}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <ProviderGlyph provider={identity.provider} className="h-5 w-5" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{config.label}</p>
                    <p className="truncate text-[10px] text-slate-500">
                      {identity.email ?? 'Identity linked'}
                      {isLastIdentity && ' — last sign-in method'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlink(identity.provider)}
                  disabled={unlinking !== null || linking !== null || isLastIdentity}
                  title={
                    isLastIdentity
                      ? 'Add another sign-in method before removing the last one'
                      : `Disconnect ${config.label}`
                  }
                  className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unlinking === identity.provider ? 'Removing…' : 'Disconnect'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Connect another provider</p>
          <div className="flex flex-wrap gap-1.5" data-testid="linkable-providers">
            {available.map((provider) => {
              const config = getProvider(provider)
              return (
                <motion.button
                  key={provider}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLink(provider)}
                  disabled={linking !== null || unlinking !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {linking === provider ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  ) : (
                    <ProviderGlyph provider={provider} className="h-3.5 w-3.5" />
                  )}
                  {linking === provider ? 'Redirecting…' : config.label}
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
