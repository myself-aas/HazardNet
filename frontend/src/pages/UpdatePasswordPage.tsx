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
    'mt-1.5 h-12 w-full rounded-sm border border-carbon-20 bg-carbon-05 px-4 py-3 text-base text-carbon-90 outline-none focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40'

  return (
    <AuthLayout
      mode="recovery"
      title="Choose a new password"
      subtitle={ready ? 'Create a new password for your HazardNet account.' : 'Preparing secure password recovery…'}
    >
      {status ? (
        <div role="status" className="space-y-4 text-center">
          <p className="border-l-2 border-nasa-blue bg-white p-4 text-sm font-medium text-carbon-80">
            {status}
          </p>
          <Link to="/login" className="font-bold text-nasa-blue-shade hover:underline">
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="border-l-2 border-nasa-red bg-white p-4 text-sm font-medium text-nasa-red-shade">
              {error}
            </p>
          )}
          <label className="block text-sm font-medium text-carbon-80" htmlFor="new-password">
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
          <label className="block text-sm font-medium text-carbon-80" htmlFor="confirm-password">
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
            className="min-h-[44px] w-full cursor-pointer bg-nasa-red-shade py-3 text-base font-semibold text-white hover:bg-nasa-red disabled:opacity-50 touch-manipulation"
          >
            {saving ? 'Updating password…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
