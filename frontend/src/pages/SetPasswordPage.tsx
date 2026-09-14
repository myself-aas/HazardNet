import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AuthLayout } from '../components/auth/AuthLayout'
import { useAuth } from '../context/AuthContext'
import MaterialIcon from '../components/MaterialIcon'
import { PASSWORD_REQUIREMENTS, passwordStrength } from '../lib/passwordStrength'


/** Add/change a password for an authenticated account. Email verification never creates a session. */

const Requirement: React.FC<{ met: boolean; children: React.ReactNode }> = ({ met, children }) => (
  <li className={`flex items-center gap-1.5 ${met ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span aria-hidden="true">{met ? '✓' : '○'}</span>
    <span className="text-[11px] font-medium">{children}</span>
  </li>
)

type Phase = 'waiting' | 'ready' | 'done'

export default function SetPasswordPage() {
  const { user, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!loading) setPhase('ready'); }, [loading]);

  const strength = passwordStrength(password)
  const allMet = PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!user) return setError('Sign in before setting a password.')
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
            ? 'Sign out and sign in again before changing your password.'
            : reason.message
          : 'Unable to set your password.',
      )
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base sm:text-sm text-slate-900 outline-none transition-all focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40'

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
          <p className="text-sm text-slate-600">Taking you to your dashboard…</p>
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
          ? 'Add or update the password for your signed-in account.'
          : 'Sign in before setting a password.'
      }
    >
      {phase === 'waiting' && !user ? (
        <div className="flex flex-col items-center gap-3 py-6" role="status" data-testid="set-password-waiting">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#f9a825]" />
          <p className="text-xs text-slate-500">Checking your session…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="set-password-form">
          {!user && phase === 'ready' && (
            <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium text-amber-800">
              You need a signed-in session to set a password. Please{' '}
              <Link to="/login" className="font-extrabold underline underline-offset-2">
                sign in
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
            <label className="block text-xs font-bold text-slate-800" htmlFor="set-password-input">
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
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
                className="text-[11px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
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
            <label className="block text-xs font-bold text-slate-800" htmlFor="set-password-confirm">
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
            disabled={saving || !user}
            className="w-full rounded-2xl bg-[#f9a825] py-3.5 text-sm font-extrabold text-slate-950 transition-colors hover:bg-[#d08305] disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 focus-visible:ring-offset-2"
          >
            {saving ? 'Saving password…' : 'Save password & open my dashboard'}
          </button>

          <p className="text-center text-[11px] text-slate-400">
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
