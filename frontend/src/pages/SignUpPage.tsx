import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { AuthSocialButtons } from '../components/auth/AuthSocialButtons';
import { UsernameField } from '../components/user/UsernameField';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';
import { EyeToggleIcon } from '../components/ui/animated-state-icons';
import { validateUsername } from '../lib/username';
import { PASSWORD_REQUIREMENTS as PW_RULES } from '../lib/passwordStrength';

/**
 * Dedicated sign-up page — unique URL: /signup  (/sign-up redirects here)
 *
 * Creates the account immediately with a name, username, email and password;
 * the profile document (and the verified-email flag after confirmation) is
 * stored in Firestore. Google / GitHub are offered as alternates.
 */

const inputClass =
  'w-full px-4 py-3 text-base sm:text-sm bg-carbon-05 border border-carbon-20 rounded-2xl text-carbon-90 placeholder-carbon-40 font-medium transition-all focus:outline-none focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40';

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: string } | null)?.code ?? '';
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes('email-already-in-use') || text.includes('already exists') || text.includes('already registered')) {
    return 'An account already exists with this email. Sign in instead — or reset your password if you forgot it.';
  }
  if (text.includes('weak-password') || text.includes('password should be at least')) {
    return 'That password is too weak — use at least 6 characters.';
  }
  if (text.includes('invalid-email')) {
    return 'Enter a valid email address.';
  }
  if (text.includes('too many requests') || text.includes('rate limit')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Network problem while creating your account. Check your connection and retry.';
  }
  if (text.includes('operation-not-allowed') || text.includes('operation not allowed')) {
    return 'Email/password sign-up is not enabled on this project yet.';
  }
  return message || 'We couldn’t create your account. Please try again.';
};

const SignUpPage: React.FC = () => {
  const { signUpWithEmail, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/';

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Redirect signed-in users immediately to homepage or destination.
  useEffect(() => {
    if (user) {
      navigate(next, { replace: true });
    }
  }, [user, navigate, next]);

  const usernameValidation = validateUsername(username);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Please enter your full name.';
    if (!usernameValidation.valid) errors.username = usernameValidation.message ?? 'Choose a valid username.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!PW_RULES.every((r) => r.test(password))) {
      errors.password = 'Password needs 8+ characters, upper & lower case, a number and a symbol.';
    }
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
      await signUpWithEmail(email.trim(), password, name.trim(), { username });
      // The auth listener redirects to `next` once the session is set.
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
      mode="signup"
      title="Create your HazardNet account"
      subtitle="Free for farmers, extension officers, NGOs and researchers. Your data is stored in your HazardNet account."
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
          <label className="block text-xs font-bold text-carbon-80 mb-1.5" htmlFor="signup-name">
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
        />
        {fieldErrors.username && (
          <p className="-mt-2 text-[11px] font-semibold text-rose-700">{fieldErrors.username}</p>
        )}

        <div>
          <label className="block text-xs font-bold text-carbon-80 mb-1.5" htmlFor="signup-email">
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
        </div>

        <div>
          <label className="block text-xs font-bold text-carbon-80 mb-1.5" htmlFor="signup-password">
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
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
          {fieldErrors.password && (
            <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.password}</p>
          )}
        </div>

        <label htmlFor="signup-terms" className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            id="signup-terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-carbon-30 accent-nasa-blue cursor-pointer"
          />
          <span className="text-[11px] leading-relaxed text-carbon-60">
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
          className="w-full py-3.5 bg-nasa-red hover:bg-nasa-red-shade text-carbon-black font-extrabold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 focus-visible:ring-offset-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-carbon-80 border-t-transparent" />
              Creating account…
            </>
          ) : (
            'Create my account'
          )}
        </button>

        <div className="relative flex items-center justify-center pt-1" aria-hidden="true">
          <div className="border-t border-carbon-20 w-full" />
          <span className="bg-white px-3 text-[10px] text-carbon-60 font-bold uppercase tracking-wider absolute">
            or continue with
          </span>
        </div>

        {/* ── Social options: Google and GitHub only (Firebase providers) ── */}
        <AuthSocialButtons
          googleLabel="Sign up with Google"
          onSuccess={() => navigate(next, { replace: true })}
        />
      </form>

      <p className="text-center text-xs sm:text-[13px] text-carbon-60">
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
