import { useState } from 'react'
import { useAuth, type OAuthProvider } from '../context/AuthContext'

const providers: Array<{ id: OAuthProvider; label: string; icon: string }> = [
  { id: 'google', label: 'Google', icon: 'G' },
  { id: 'github', label: 'GitHub', icon: 'GH' },
  { id: 'microsoft', label: 'Microsoft', icon: 'MS' },
  { id: 'apple', label: 'Apple', icon: 'A' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'in' },
  { id: 'discord', label: 'Discord', icon: 'D' },
  { id: 'slack', label: 'Slack', icon: 'S' },
  { id: 'twitter', label: 'X / Twitter', icon: 'X' },
  { id: 'orcid', label: 'ORCID', icon: 'iD' },
]

export function OAuthButtons() {
  const { signInWithOAuth } = useAuth()
  const [active, setActive] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleProvider = async (provider: OAuthProvider) => {
    setActive(provider)
    setError(null)
    try {
      await signInWithOAuth(provider)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not start ${provider} sign-in.`)
      setActive(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={active !== null}
            onClick={() => handleProvider(provider.id)}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            aria-label={`Continue with ${provider.label}`}
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-extrabold text-slate-700">{active === provider.id ? '…' : provider.icon}</span>
            {provider.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">Social buttons require the matching provider to be enabled in your Supabase Auth settings. ORCID uses Supabase&apos;s custom OIDC provider configuration.</p>
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
    </div>
  )
}
