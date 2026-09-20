import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  describeOAuthError,
  parseOAuthCallbackParams,
  resolveOAuthReturnTo,
} from '../lib/oauthProviders'

type CallbackPhase = 'exchanging' | 'success' | 'error'
type Explanation = ReturnType<typeof describeOAuthError>

/**
 * Post-auth landing page — unique URL: /auth/callback
 *
 * Sign-in now completes in a popup (Firebase `signInWithPopup`), so this page
 * is a fallback for any direct/redirect visit: it waits for the Firebase auth
 * state, then returns the user to where they were heading.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const params = useMemo(() => parseOAuthCallbackParams(window.location.search), [])

  const [phase, setPhase] = useState<CallbackPhase>(params.error ? 'error' : 'exchanging')
  const [explanation, setExplanation] = useState<Explanation | null>(
    params.error ? describeOAuthError(params.errorDescription ?? params.error) : null,
  )

  const [returnTo, setReturnTo] = useState<string | null>(null)
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

    let unsubscribe: () => void = () => {}

    const fail = (error: unknown) => {
      if (settled.current) return
      settled.current = true
      setExplanation(describeOAuthError(error))
      setPhase('error')
    }

    void auth.authStateReady().then(() => {
      if (!settled.current && auth.currentUser) {
        settled.current = true
        setReturnTo(resolveOAuthReturnTo(params.next))
        setPhase('success')
      }
    })

    try {
      unsubscribe = onAuthStateChanged(auth, (authUser) => {
        if (!authUser) return
        if (settled.current) return
        settled.current = true
        setReturnTo(resolveOAuthReturnTo(params.next))
        setPhase('success')
      })
    } catch (err) {
      // Listener is best-effort; the poll covers the exchange.
    }

    const timeout = window.setTimeout(() => {
      fail(params.error ? new Error(params.errorDescription ?? params.error) : new Error('Timed out waiting for the sign-in session. Please try again.'))
    }, 12000)

    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [phase, params.error, params.errorDescription, params.next])

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

  if (phase === 'exchanging') {
    return (
      <Shell>
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-carbon-20 border-t-nasa-red" />
        <p className="text-sm font-bold text-carbon-80">Completing secure sign-in…</p>
        <p className="text-xs text-carbon-60">Restoring your HazardNet session.</p>
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
        <p className="text-sm font-bold text-carbon-80">Signed in successfully</p>
        <p className="text-xs text-carbon-60">
          Returning you to HazardNet{returnTo && returnTo !== '/' ? ` (${returnTo})` : ''} in {countdown}…
        </p>
        <Link
          to={returnTo && returnTo.startsWith('/') ? returnTo : '/'}
          className="rounded-xl bg-nasa-red px-4 py-2 text-xs font-black text-carbon-black shadow-md transition-colors hover:bg-nasa-red-shade"
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
      <p className="text-sm font-bold text-carbon-80">Sign-in could not complete</p>
      <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-3 text-left">
        <p className="text-xs font-extrabold text-rose-900">{resolved.title}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-rose-800">{resolved.hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/login"
          className="rounded-xl bg-carbon-90 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-carbon-70"
        >
          Back to sign in
        </Link>
        <Link
          to="/"
          className="rounded-xl border border-carbon-20 bg-white px-4 py-2 text-xs font-black text-carbon-70 transition-colors hover:bg-carbon-05"
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
