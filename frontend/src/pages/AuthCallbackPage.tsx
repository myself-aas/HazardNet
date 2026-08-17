import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 600)
    return () => window.clearTimeout(timer)
  }, [navigate])

  return <div className="flex min-h-[50vh] items-center justify-center text-sm font-semibold text-slate-600">Completing secure sign-in…</div>
}
