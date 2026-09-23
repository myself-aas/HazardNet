import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthSocialButtons } from '../components/auth/AuthSocialButtons';
import { EyeToggleIcon } from '../components/ui/animated-state-icons';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';
import { parseAuthError } from '../lib/authErrors';

/**
 * Dedicated sign-in page — unique URL: /login
 *
 * Field order: email + password first, then the email submit, then Google and
 * GitHub as one-tap social options beneath a divider. Split-screen on
 * desktop, single column on mobile.
 */

/** Translate email-auth failures into actionable, non-leaky messages. */
const describeError = (err: unknown): string => {
  const parsed = parseAuthError(err);
  // Special case: email not confirmed (custom message not in parseAuthError)
  const text = `${parsed.code} ${parsed.message}`.toLowerCase();
  if (text.includes('email not confirmed') || text.includes('email-not-verified')) {
    return 'Your email address isn’t confirmed yet. Open the confirmation link we sent you, then sign in.';
  }
  return parsed.userMessage;
};

const finePointer =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: fine)').matches
    : false;

const inputClass =
  'h-12 w-full rounded-sm border border-carbon-20 bg-carbon-05 px-4 py-3 text-base text-carbon-90 placeholder-carbon-40 font-medium focus:border-nasa-blue focus:outline-none focus:ring-2 focus:ring-nasa-blue/40';

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
              className="flex items-start gap-2 border-l-2 border-nasa-red bg-white p-4 text-sm font-medium text-nasa-red-shade"
            >
              <span className="shrink-0 mt-0.5">
                <MaterialIcon name="warning" className="w-4 h-4" />
              </span>
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-carbon-80" htmlFor="login-email">
            Email address
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoFocus={finePointer}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-carbon-80" htmlFor="login-password">
              Password
            </label>
            <Link
              id="login-page-forgot-pwd-btn"
              to="/forgot-password"
              className="text-xs font-bold text-nasa-blue-shade hover:text-nasa-blue hover:underline"
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
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-carbon-60 hover:text-carbon-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 cursor-pointer touch-manipulation"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeToggleIcon isState={showPassword} size={20} duration={0} />
            </button>
          </div>
        </div>

        <button
          id="login-page-submit-btn"
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 bg-nasa-red-shade px-6 py-3 text-base font-semibold text-white hover:bg-nasa-red disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2 touch-manipulation"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-carbon-80 border-t-transparent" />
              Signing in…
            </>
          ) : (
            'Sign in with email'
          )}
        </button>
      </form>

      {/* ── Social options: Google and GitHub (Firebase providers) ── */}
      <div className="relative flex items-center justify-center" aria-hidden="true">
        <div className="border-t border-carbon-20 w-full" />
        <span className="bg-white px-3 text-xs text-carbon-60 font-bold uppercase tracking-wider absolute">
          or continue with
        </span>
      </div>
      <AuthSocialButtons onSuccess={() => navigate(next, { replace: true })} />

      <p className="text-center text-xs sm:text-[13px] text-carbon-60">
        New to HazardNet?{' '}
        <Link
          to={next !== '/' ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="font-extrabold text-nasa-blue-shade hover:text-nasa-blue hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
