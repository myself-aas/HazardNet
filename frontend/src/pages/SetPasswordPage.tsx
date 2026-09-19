import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthLayout } from '../components/auth/AuthLayout'
import { useAuth } from '../context/AuthContext'
import MaterialIcon from '../components/MaterialIcon'
import { PASSWORD_REQUIREMENTS, passwordStrength } from '../lib/passwordStrength'
import { auth } from '../services/firebase';
const isSupabaseConfigured = true;

/**
 * Dedicated password-setup page — unique URL: /set-password
 *
 * The final step of the email-verification flow: the user clicks the
 * verification link in their inbox (which opens a session via /auth/callback),
 * lands here, and chooses the password for their new account. Also used when
 * a verified session wants to add a password to a social-only account.
 */

const Requirement: React.FC<{ met: boolean; children: React.ReactNode }> = ({ met, children }) => (
  <li className={`flex items-center gap-1.5 ${met ? 'text-emerald-700' : 'text-carbon-60'}`}>
    <span aria-hidden="true">{met ? '✓' : '○'}</span>
    <span className="text-[11px] font-medium">{children}</span>
  </li>
)

type Phase = 'waiting' | 'ready' | 'done'

export default function SetPasswordPage() {
  const { user, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Give detectSessionInUrl a moment to exchange the emailed verification
  // link, then settle into "ready" (with or without a session).
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setPhase((current) => (current === 'waiting' ? 'ready' : current))
    }, 600)
    if (typeof auth?.authStateReady === 'function') {
      void auth.authStateReady().then(() => {
        if (!cancelled && auth.currentUser) setPhase('ready')
      })
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const strength = passwordStrength(password)
  const allMet = PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Your password must contain at least 8 characters.')
    if (!allMet) return setError('Please satisfy every requirement before continuing.')
    if (password !== confirmation) return setError('The passwords do not match.')
    setSaving(true)
    try {
      await updatePassword(password)
      setPhase('done')
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message.includes('session')
            ? 'Your verification link expired. Request a new link from the sign-up page and try again.'
            : reason.message
          : 'Unable to set your password.',
      )
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-2xl border border-carbon-20 bg-carbon-05 px-4 py-3 text-base sm:text-sm text-carbon-90 outline-none transition-all focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40'

  if (phase === 'done') {
    return (
      <AuthLayout mode="recovery" title="Password saved" subtitle="Your account is fully activated.">
        <div className="space-y-4 text-center" data-testid="set-password-done">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <MaterialIcon name="check" className="h-6 w-6" />
          </motion.div>
          <p className="text-sm text-carbon-60">Taking you to your dashboard…</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      mode="recovery"
      title="Set your password"
      subtitle={
        user
          ? 'Your email is verified. Choose a password to finish securing your account.'
          : 'Finishing email verification…'
      }
    >
      {phase === 'waiting' && !user ? (
        <div className="flex flex-col items-center gap-3 py-6" role="status" data-testid="set-password-waiting">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-carbon-20 border-t-nasa-red" />
          <p className="text-xs text-carbon-60">Verifying your email link…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="set-password-form">
          {!user && phase === 'ready' && (
            <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium text-amber-800">
              We couldn’t detect your verification session. Open the newest link we emailed you — it must be
              opened on this browser — or{' '}
              <Link to="/signup" className="font-extrabold underline underline-offset-2">
                request a fresh link
              </Link>
              .
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-bold text-carbon-80" htmlFor="set-password-input">
              New password
            </label>
            <input
              id="set-password-input"
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          {/* Live strength meter + requirement checklist */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.barClass}`}
                style={{ width: `${(password.length === 0 ? 0 : (strength.score + 1) / 5) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-extrabold ${strength.textClass}`}>{strength.label}</span>
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="text-[11px] font-bold text-carbon-60 hover:text-carbon-70 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
              {PASSWORD_REQUIREMENTS.map((requirement) => (
                <Requirement key={requirement.label} met={requirement.test(password)}>
                  {requirement.label}
                </Requirement>
              ))}
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold text-carbon-80" htmlFor="set-password-confirm">
              Confirm password
            </label>
            <input
              id="set-password-confirm"
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={inputClass}
            />
            {confirmation.length > 0 && confirmation !== password && (
              <p className="mt-1 text-[11px] font-semibold text-rose-700">Passwords don’t match yet.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || (!user && !isSupabaseConfigured)}
            className="w-full rounded-2xl bg-nasa-red py-3.5 text-sm font-extrabold text-carbon-black transition-colors hover:bg-nasa-red-shade disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2"
          >
            {saving ? 'Saving password…' : 'Save password & open my dashboard'}
          </button>

          <p className="text-center text-[11px] text-carbon-60">
            Already set a password?{' '}
            <Link to="/login" className="font-bold text-amber-800 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
