import { EMAIL_LINK_KEY, isEmailLink, completeEmailLink } from '../lib/emailLink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  describeOAuthError,
  getProvider,
  isOAuthProviderId,
  parseOAuthCallbackParams,
  resolveOAuthReturnTo,
} from '../lib/oauthProviders'

type CallbackPhase = 'exchanging' | 'success' | 'error'
type Explanation = ReturnType<typeof describeOAuthError>

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const callbackUrl = useMemo(() => window.location.href, [])
  const emailLink = useMemo(() => isEmailLink(callbackUrl), [callbackUrl])
  const [emailAddress, setEmailAddress] = useState(() => {
    try { return localStorage.getItem(EMAIL_LINK_KEY) || '' } catch { return '' }
  })
  const [emailInput, setEmailInput] = useState('')
  const params = useMemo(
    () => parseOAuthCallbackParams(window.location.search, window.location.hash),
    [],
  )

  const [phase, setPhase] = useState<CallbackPhase>(params.error ? 'error' : 'exchanging')
  const [explanation, setExplanation] = useState<Explanation | null>(
    params.error ? describeOAuthError(params.errorDescription ?? params.error) : null,
  )

  const [returnTo, setReturnTo] = useState<string | null>(null)
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(3)
  const settled = useRef(false)

  // Clean the URL so a refresh/retry does not replay the code or error params.
  useEffect(() => {
    if (params.code || params.error) {
      window.history.replaceState({}, '', '/auth/callback')
    }
  }, [params.code, params.error])

  useEffect(() => {
    if (phase !== 'exchanging') return

    if (emailLink && !emailAddress) return
    let cancelled = false
    let unsubscribe: () => void = () => {}

    const finish = (sessionUser: unknown) => {
      if (cancelled || settled.current) return
      settled.current = true

      const identities =
        (sessionUser as { identities?: Array<{ provider?: string }> } | null)?.identities ?? []
      const usedProvider = identities
        .map((identity) => identity.provider)
        .find((provider): provider is string => Boolean(provider) && isOAuthProviderId(provider as string))

      setProviderLabel(usedProvider && isOAuthProviderId(usedProvider) ? getProvider(usedProvider).label : null)
      setReturnTo(resolveOAuthReturnTo(params.next))
      setPhase('success')
    }

    const fail = (error: unknown) => {
      if (cancelled || settled.current) return
      settled.current = true
      setExplanation(describeOAuthError(error))
      setPhase('error')
    }

    if (emailLink) {
      void completeEmailLink(emailAddress, callbackUrl).then((user) => {
        window.history.replaceState({}, '', '/auth/callback')
        finish(user)
      }).catch(fail)
      return () => { cancelled = true }
    }

    void auth.authStateReady().then(() => {
      if (auth.currentUser) finish(auth.currentUser)
    })

    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) finish(user)
      })
    } catch (err) {
      // Listener is best-effort; the getSession poll covers the exchange.
    }

    const timeout = window.setTimeout(() => {
      fail(
        params.error
          ? new Error(params.errorDescription ?? params.error)
          : new Error('Timed out waiting for the sign-in session. Please try again.'),
      )
    }, 12000)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [phase, params.error, params.errorDescription, params.next, emailLink, emailAddress, callbackUrl])

  // Auto-return countdown on success.
  useEffect(() => {
    if (phase !== 'success' || !returnTo) return

    if (countdown <= 0) {
      navigate(returnTo.startsWith('/') ? returnTo : '/', { replace: true })
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 800)
    return () => window.clearTimeout(timer)
  }, [phase, returnTo, countdown, navigate])

  if (emailLink && !emailAddress && phase === 'exchanging') {
    return <Shell>
      <h1 className="text-lg font-bold">Confirm your email</h1>
      <p>Enter the address that received this link to finish signing in on this device.</p>
      <form onSubmit={(event) => { event.preventDefault(); setEmailAddress(emailInput.trim()) }}>
        <label>Email address<input type="email" required autoComplete="email" value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)} className="border rounded p-2 m-2" /></label>
        <button type="submit" className="rounded bg-amber-400 p-2">Complete sign-in</button>
      </form>
    </Shell>
  }

  if (phase === 'exchanging') {
    return (
      <Shell>
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#f9a825]" />
        <p className="text-sm font-bold text-slate-800">Completing secure sign-in…</p>
        <p className="text-xs text-slate-500">Verifying the authorization code with your provider.</p>
      </Shell>
    )
  }

  if (phase === 'success') {
    return (
      <Shell>
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700"
        >
          ✓
        </motion.span>
        <p className="text-sm font-bold text-slate-800">
          {providerLabel ? `Signed in with ${providerLabel}` : 'Signed in successfully'}
        </p>
        <p className="text-xs text-slate-500">
          Returning you to HazardNet{returnTo && returnTo !== '/' ? ` (${returnTo})` : ''} in {countdown}…
        </p>
        <Link
          to={returnTo && returnTo.startsWith('/') ? returnTo : '/'}
          className="rounded-xl bg-[#f9a825] px-4 py-2 text-xs font-black text-slate-950 shadow-md transition-colors hover:bg-[#d08305]"
        >
          Continue now
        </Link>
      </Shell>
    )
  }

  const resolved = explanation ?? describeOAuthError(params.errorDescription ?? params.error)
  return (
    <Shell>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-xl text-rose-700">
        ✕
      </span>
      <p className="text-sm font-bold text-slate-800">Sign-in could not complete</p>
      <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-3 text-left">
        <p className="text-xs font-extrabold text-rose-900">{resolved.title}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-rose-800">{resolved.hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/login"
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-slate-700"
        >
          Back to sign in
        </Link>
        <Link
          to="/"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
        >
          Go to home
        </Link>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  )
}
