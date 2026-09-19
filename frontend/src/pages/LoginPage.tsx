import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthSocialButtons } from '../components/auth/AuthSocialButtons';
import { EyeToggleIcon } from '../components/ui/animated-state-icons';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';

/**
 * Dedicated sign-in page — unique URL: /login
 *
 * Field order follows the product spec: email + password inputs first, then
 * the prominent "Connect with Google" button, then a compact side-by-side row
 * of circular icons for the other providers, and finally the classic email
 * submit beneath a divider. Split-screen on desktop, single column on mobile.
 */

/** Translate email-auth failures into actionable, non-leaky messages. */
const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials') || text.includes('wrong-password') || text.includes('invalid-credential')) {
    return 'That email and password combination doesn’t match. Check for typos or reset your password below.';
  }
  if (text.includes('email not confirmed')) {
    return 'Your email address isn’t confirmed yet. Open the confirmation link we sent you, then sign in.';
  }
  if (text.includes('user not found')) {
    return 'No account exists for this email yet. Create one below — it takes a minute.';
  }
  if (text.includes('too many requests') || text.includes('rate limit')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Network problem while signing in. Check your connection and retry.';
  }
  if (text.includes('not configured')) {
    return 'Authentication isn’t configured for this deployment yet.';
  }
  return message || 'Sign-in failed. Please try again.';
};

const inputClass =
  'w-full px-4 py-3 text-base sm:text-sm bg-carbon-05 border border-carbon-20 rounded-2xl text-carbon-90 placeholder-carbon-40 font-medium transition-all focus:outline-none focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40';

const LoginPage: React.FC = () => {
  const { signInWithEmail, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(next, { replace: true });
    }
  }, [user, navigate, next]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      mode="login"
      title="Sign in to HazardNet"
      subtitle="Access district forecasts, saved assessments and your advisory feed."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              role="alert"
              aria-live="polite"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2"
            >
              <span className="shrink-0 mt-0.5">
                <MaterialIcon name="warning" className="w-4 h-4" />
              </span>
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="block text-xs font-bold text-carbon-80 mb-1.5" htmlFor="login-email">
            Email address
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-carbon-80" htmlFor="login-password">
              Password
            </label>
            <Link
              id="login-page-forgot-pwd-btn"
              to="/forgot-password"
              className="text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-carbon-60 hover:text-carbon-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeToggleIcon isState={showPassword} size={20} duration={0} />
            </button>
          </div>
        </div>

        {/* ── Social sign-in first: Google, then compact provider icons ── */}
        <AuthSocialButtons onSuccess={() => navigate(next, { replace: true })} />

        <div className="relative flex items-center justify-center pt-1" aria-hidden="true">
          <div className="border-t border-carbon-20 w-full" />
          <span className="bg-white px-3 text-[10px] text-carbon-60 font-bold uppercase tracking-wider absolute">
            or sign in with email
          </span>
        </div>

        <button
          id="login-page-submit-btn"
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full py-3.5 bg-nasa-red hover:bg-nasa-red-shade text-carbon-black font-extrabold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-carbon-80 border-t-transparent" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="text-center text-xs sm:text-[13px] text-carbon-60">
        New to HazardNet?{' '}
        <Link
          to={next !== '/' ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="font-extrabold text-amber-800 hover:text-amber-900 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
