import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/auth/AuthLayout'
import { useAuth } from '../context/AuthContext'

/**
 * Dedicated password-update page — unique URL: /update-password
 * Users land here from the password-reset email link.
 */
export default function UpdatePasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 300)
    return () => window.clearTimeout(timer)
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Your password must contain at least 8 characters.')
    if (password !== confirmation) return setError('The passwords do not match.')
    setSaving(true)
    try {
      await updatePassword(password)
      setStatus('Your password has been updated. You can now sign in with it.')
      window.setTimeout(() => navigate('/login'), 1400)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update your password.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base sm:text-sm text-slate-900 outline-none transition-all focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40'

  return (
    <AuthLayout
      mode="recovery"
      title="Choose a new password"
      subtitle={ready ? 'Create a new password for your HazardNet account.' : 'Preparing secure password recovery…'}
    >
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
          {error && (
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
            className="w-full rounded-2xl bg-nasa-red py-3.5 text-sm font-extrabold text-slate-900 transition-colors hover:bg-nasa-red-shade disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
