import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth/AuthLayout'
import { auth } from '../services/firebase'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { PASSWORD_REQUIREMENTS } from '../lib/passwordStrength'

/**
 * Dedicated password-update page — unique URL: /update-password
 * Users land here from the password-reset email link.
 */
export default function UpdatePasswordPage() {
  const code = useMemo(() => new URLSearchParams(window.location.search).get('oobCode'), [])
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false;
    if (!code) { setError('Open the password reset link from your email.'); return; }
    window.history.replaceState({}, '', '/update-password');
    void verifyPasswordResetCode(auth, code).then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setError('This reset link is invalid or expired. Request a new one.'); });
    return () => { cancelled = true; };
  }, [code])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!code || !ready) return setError('A valid password reset link is required.');
    if (!PASSWORD_REQUIREMENTS.every((r) => r.test(password))) return setError('Use at least 8 characters with uppercase, lowercase, a number and a symbol.');
    if (password !== confirmation) return setError('The passwords do not match.')
    setSaving(true)
    try {
      await confirmPasswordReset(auth, code, password)
      setStatus('Your password has been updated. You can now sign in with it.')
      window.setTimeout(() => navigate('/login'), 1400)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update your password.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base sm:text-sm text-slate-900 outline-none transition-all focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40'

  return (
    <AuthLayout
      mode="recovery"
      title="Choose a new password"
      subtitle={ready ? 'Use 8+ characters with uppercase, lowercase, a number and a symbol.' : 'Checking your password reset link…'}
    >
      {error && !ready && <p role="alert">{error} <Link to="/forgot-password">Request a new reset link</Link></p>}
      {status ? (
        <div role="status" className="space-y-4 text-center">
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
            {status}
          </p>
          <Link to="/login" className="font-bold text-amber-800 hover:underline">
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && ready && (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800">
              {error}
            </p>
          )}
          <label className="block text-xs font-bold text-slate-800" htmlFor="new-password">
            New password
            <input
              id="new-password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-bold text-slate-800" htmlFor="confirm-password">
            Confirm new password
            <input
              id="confirm-password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={saving || !ready}
            className="w-full rounded-2xl bg-[#f9a825] py-3.5 text-sm font-extrabold text-slate-900 transition-colors hover:bg-[#d08305] disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
