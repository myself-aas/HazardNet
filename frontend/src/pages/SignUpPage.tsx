import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { AuthSocialButtons } from '../components/auth/AuthSocialButtons';
import { UsernameField } from '../components/user/UsernameField';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';
import { PASSWORD_REQUIREMENTS } from '../lib/passwordStrength';
import { safeAuthReturnTo } from '../lib/oauthProviders';
import { validateUsername } from '../lib/username';

/** Email/password registration with optional Google or GitHub sign-in. */

const inputClass =
  'w-full px-4 py-3 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 font-medium transition-all focus:outline-none focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40';

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = message.toLowerCase();
  if (text.includes('email-already-in-use') || text.includes('already registered') || text.includes('already exists')) {
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
  const { signUpWithEmail, sendVerificationEmail, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = safeAuthReturnTo(rawNext);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Redirect signed-in users immediately to homepage or destination.
  useEffect(() => {
    if (user && !loading && !pendingVerification) {
      navigate(next, { replace: true });
    }
  }, [user, navigate, next, loading, pendingVerification]);

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
    if (!PASSWORD_REQUIREMENTS.every((r) => r.test(password))) errors.password = 'Use at least 8 characters with uppercase, lowercase, a number and a symbol.';
    if (password !== confirmation) errors.confirmation = 'Passwords do not match.';
    if (!acceptedTerms) errors.terms = 'Please accept the Terms and Privacy Policy to continue.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email.trim(), password, name.trim(), { username });
      setPassword('');
      setConfirmation('');
      try { await sendVerificationEmail(email.trim()); }
      catch { setError('Your account was created, but the verification email could not be sent. Use Resend below.'); }
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
      await sendVerificationEmail(email.trim());
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
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="space-y-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Your password is set. Verify the email address{' '}
              <strong className="text-slate-900">{email.trim()}</strong>. Open it on this device to
              verify your address. Your password is already set.
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
            <Link to="/dashboard" className="text-sm font-bold text-amber-800">Continue to dashboard</Link>
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
            aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'signup-name-error' : undefined}
            className={inputClass}
          />
          {fieldErrors.name && <p id="signup-name-error" className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.name}</p>}
        </div>

        <UsernameField
          id="signup-username" externalError={fieldErrors.username}
          value={username}
          onChange={setUsername}
          fullName={name}
          email={email}
          autoFocus
        />


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
            aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
            className={inputClass}
          />
          {fieldErrors.email && <p id="signup-email-error" className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.email}</p>}
          <p className="mt-1 text-[11px] text-slate-400">
            Create your password below. We’ll also send an email to verify your address.
          </p>
        </div>

        <label className="block text-xs font-bold text-slate-800" htmlFor="signup-password">Password
          <input id="signup-password" type="password" required autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputClass} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined} />
        </label>
        <p className="text-xs text-slate-500">At least 8 characters, uppercase and lowercase letters, a number and a symbol.</p>
        {fieldErrors.password && <p id="signup-password-error" role="alert" className="text-xs text-rose-700">{fieldErrors.password}</p>}
        <label className="block text-xs font-bold text-slate-800" htmlFor="signup-confirmation">Confirm password
          <input id="signup-confirmation" type="password" required autoComplete="new-password" value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)} className={inputClass} aria-invalid={Boolean(fieldErrors.confirmation)} aria-describedby={fieldErrors.confirmation ? 'signup-confirmation-error' : undefined} />
        </label>
        {fieldErrors.confirmation && <p id="signup-confirmation-error" role="alert" className="text-xs text-rose-700">{fieldErrors.confirmation}</p>}

        <label htmlFor="signup-terms" className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            id="signup-terms" aria-invalid={Boolean(fieldErrors.terms)} aria-describedby={fieldErrors.terms ? 'signup-terms-error' : undefined}
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
        {fieldErrors.terms && <p id="signup-terms-error" className="-mt-2 text-[11px] font-semibold text-rose-700">{fieldErrors.terms}</p>}

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
              Creating account…
            </>
          ) : (
            'Create account with email'
          )}
        </button>
      </form>
      <p className="text-center text-xs text-slate-500">Or continue with Google or GitHub. Accept the terms above first.</p>
      <AuthSocialButtons label="Sign up with Google" disabled={!acceptedTerms || loading} onSuccess={() => navigate(next, { replace: true })} />
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
