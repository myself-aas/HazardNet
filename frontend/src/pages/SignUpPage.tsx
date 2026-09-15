import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { AuthSocialButtons } from '../components/auth/AuthSocialButtons';
import { UsernameField } from '../components/user/UsernameField';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';
import { validateUsername } from '../lib/username';

/**
 * Dedicated sign-up page — unique URL: /signup  (/sign-up redirects here)
 *
 * Passwordless by design: the user picks a name, a unique username (validated
 * live while typing, with suggestions) and an email address; we then email a
 * verification link. Opening the link verifies the address and opens a
 * session that lands on /set-password where the user chooses their password.
 *
 * Field order follows the product spec: details → prominent "Connect with
 * Google" → compact side-by-side provider icons → email submit.
 */

const inputClass =
  'w-full px-4 py-3 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 font-medium transition-all focus:outline-none focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40';

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = message.toLowerCase();
  if (text.includes('already registered') || text.includes('already exists')) {
    return 'An account already exists with this email. Sign in instead — or reset your password if you forgot it.';
  }
  if (text.includes('too many requests') || text.includes('rate limit')) {
    return 'Too many emails requested — wait a minute and try again.';
  }
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Network problem while creating your account. Check your connection and retry.';
  }
  if (text.includes('not configured')) {
    return 'Authentication isn’t configured for this deployment yet.';
  }
  return message || 'We couldn’t send the verification email. Please try again.';
};

const SignUpPage: React.FC = () => {
  const { sendVerificationEmail, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/';

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Redirect signed-in users immediately to homepage or destination.
  useEffect(() => {
    if (user) {
      navigate(next, { replace: true });
    }
  }, [user, navigate, next]);

  // Countdown ticker for the resend button.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const usernameValidation = validateUsername(username);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Please enter your full name.';
    if (!usernameValidation.valid) errors.username = usernameValidation.message ?? 'Choose a valid username.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!acceptedTerms) errors.terms = 'Please accept the Terms and Privacy Policy to continue.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      // Remember the chosen identity so the callback/bootstrap can apply it.
      try {
        sessionStorage.setItem('hazardnet.signup.pending', JSON.stringify({ name: name.trim(), username }));
      } catch {
        // Best effort only.
      }
      await sendVerificationEmail(email.trim(), {
        nextTo: '/set-password',
        displayName: name.trim(),
        username,
      });
      setPendingVerification(true);
      setResendIn(45);
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setLoading(true);
    setError(null);
    try {
      await sendVerificationEmail(email.trim(), { nextTo: '/set-password' });
      toast.success('Verification link sent again.');
      setResendIn(45);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <AuthLayout
        mode="signup"
        title="Verify your email"
        subtitle="One click away from your HazardNet dashboard."
      >
        <div className="space-y-5 text-center" data-testid="signup-verification-sent">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <MaterialIcon name="mail_check" className="h-6 w-6" />
          </motion.div>
          <div className="space-y-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              We sent a verification link to{' '}
              <strong className="text-slate-900">{email.trim()}</strong>. Open it on this device to
              activate your account and <strong className="text-slate-900">choose your password</strong>.
            </p>
            <p className="text-xs text-slate-500">
              Tip: check your spam folder if it hasn’t arrived within a few minutes.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={resend}
              disabled={resendIn > 0 || loading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              {resendIn > 0 ? `Resend link available in ${resendIn}s` : 'Resend verification link'}
            </button>
            <button
              type="button"
              onClick={() => setPendingVerification(false)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Wrong email? Edit details
            </button>
          </div>
          <Link to="/login" className="inline-block text-[11px] font-bold text-amber-800 hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      mode="signup"
      title="Create your HazardNet account"
      subtitle="Free for farmers, extension officers, NGOs and researchers."
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
              <span>
                {error}{' '}
                {/already exists/i.test(error) && (
                  <Link to="/login" className="font-extrabold underline underline-offset-2">
                    Sign in
                  </Link>
                )}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="signup-name">
            Full name
          </label>
          <input
            id="signup-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="e.g. Ashif Ahmed"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            className={inputClass}
          />
          {fieldErrors.name && <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.name}</p>}
        </div>

        <UsernameField
          id="signup-username"
          value={username}
          onChange={setUsername}
          fullName={name}
          email={email}
          autoFocus
        />
        {fieldErrors.username && (
          <p className="-mt-2 text-[11px] font-semibold text-rose-700">{fieldErrors.username}</p>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="signup-email">
            Email address
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            className={inputClass}
          />
          {fieldErrors.email && <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.email}</p>}
          <p className="mt-1 text-[11px] text-slate-400">
            We’ll email you a verification link to activate the account and set your password.
          </p>
        </div>

        {/* ── Social sign-up first: Google, then compact provider icons ── */}
        <AuthSocialButtons label="Sign up with Google" onSuccess={() => navigate(next, { replace: true })} />

        <div className="relative flex items-center justify-center pt-1" aria-hidden="true">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider absolute">
            or sign up with email
          </span>
        </div>

        <label htmlFor="signup-terms" className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            id="signup-terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#f9a825] cursor-pointer"
          />
          <span className="text-[11px] leading-relaxed text-slate-600">
            I agree to the{' '}
            <Link to="/terms" className="font-bold text-amber-800 hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="font-bold text-amber-800 hover:underline">
              Privacy Policy
            </Link>
            , including weather-data processing for my district.
          </span>
        </label>
        {fieldErrors.terms && <p className="-mt-2 text-[11px] font-semibold text-rose-700">{fieldErrors.terms}</p>}

        <button
          id="signup-page-submit-btn"
          data-testid="signup-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-[#f9a825] hover:bg-[#d08305] text-slate-950 font-extrabold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 focus-visible:ring-offset-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-800 border-t-transparent" />
              Sending verification link…
            </>
          ) : (
            'Create account — email me a verification link'
          )}
        </button>
      </form>

      <p className="text-center text-xs sm:text-[13px] text-slate-600">
        Already have an account?{' '}
        <Link
          to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-extrabold text-amber-800 hover:text-amber-900 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignUpPage;
