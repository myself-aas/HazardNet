import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { HazardNetBrand } from '../components/HazardNetLogo'
import { useAuth } from '../context/AuthContext'

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

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <AuthCard title="Choose a New Password">
        <div className="mb-4 flex justify-center"><HazardNetBrand size="md" /></div>
        <p className="mb-5 text-center text-xs leading-relaxed text-slate-600">{ready ? 'Create a new password for your HazardNet account.' : 'Preparing secure password recovery…'}</p>
        {status ? <div role="status" className="space-y-4 text-center"><p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{status}</p><Link to="/login" className="font-bold text-amber-800 hover:underline">Return to sign in</Link></div> : <form onSubmit={submit} className="space-y-4">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">{error}</p>}
          <label className="block text-xs font-bold text-slate-800" htmlFor="new-password">New password<input id="new-password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-amber-500" /></label>
          <label className="block text-xs font-bold text-slate-800" htmlFor="confirm-password">Confirm new password<input id="confirm-password" type="password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-amber-500" /></label>
          <button type="submit" disabled={saving || !ready} className="w-full rounded-xl bg-[#f9a825] py-3 text-xs font-extrabold text-slate-900 transition-colors hover:bg-[#d08305] disabled:opacity-50">{saving ? 'Updating password…' : 'Update password'}</button>
        </form>}
      </AuthCard>
    </div>
  )
}
