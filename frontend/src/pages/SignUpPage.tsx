import React, { useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth, UserRolePersona } from '../context/AuthContext';
import { OAuthButtons } from '../components/OAuthButtons';
import { EyeToggleIcon } from '../components/ui/animated-state-icons';
import { AuthLayout } from '../components/auth/AuthLayout';
import MaterialIcon from '../components/MaterialIcon';

/**
 * Dedicated sign-up page — unique URL: /signup  (/sign-up redirects here)
 *
 * Responsive split-screen layout, live password strength + requirements
 * checklist, persona selection, terms consent, social sign-up, and distinct
 * handling of "session ready" vs "email confirmation required".
 */

const PERSONAS: Array<{ value: UserRolePersona; label: string }> = [
  { value: 'smallholder_farmer', label: 'Smallholder Farmer' },
  { value: 'ngo_coordinator', label: 'NGO Disaster Coordinator' },
  { value: 'govt_official', label: 'DAE / Government Extension Officer' },
  { value: 'academic_researcher', label: 'Academic / Climate Researcher' },
  { value: 'commercial_agribusiness', label: 'Commercial Agribusiness' },
];

/** Password strength score 0–4 with live requirement feedback. */
export const scorePassword = (pw: string): number => {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
};

const STRENGTH = [
  { label: 'Too weak', bar: 'bg-rose-500', text: 'text-rose-700' },
  { label: 'Weak', bar: 'bg-orange-500', text: 'text-orange-700' },
  { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-700' },
  { label: 'Good', bar: 'bg-lime-600', text: 'text-lime-700' },
  { label: 'Strong', bar: 'bg-emerald-600', text: 'text-emerald-700' },
];

const Requirement: React.FC<{ met: boolean; children: React.ReactNode }> = ({ met, children }) => (
  <li className={`flex items-center gap-1.5 ${met ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span aria-hidden="true">{met ? '✓' : '○'}</span>
    <span className="text-[11px] font-medium">{children}</span>
  </li>
);

const describeError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = message.toLowerCase();
  if (text.includes('already registered') || text.includes('already exists')) {
    return 'An account already exists with this email. Sign in instead — or reset your password if you forgot it.';
  }
  if (text.includes('password should be at least')) {
    return 'Please choose a password of at least 8 characters.';
  }
  if (text.includes('too many requests') || text.includes('rate limit')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (text.includes('failed to fetch') || text.includes('network')) {
    return 'Network problem while creating your account. Check your connection and retry.';
  }
  if (text.includes('not configured')) {
    return 'Authentication isn’t configured for this deployment yet.';
  }
  return message || 'Sign-up failed. Please try again.';
};

const inputClass =
  'w-full px-4 py-3 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 font-medium transition-all focus:outline-none focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40';

const SignUpPage: React.FC = () => {
  const { signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [persona, setPersona] = useState<UserRolePersona>('smallholder_farmer');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const score = useMemo(() => scorePassword(password), [password]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    if (confirm !== password) errors.confirm = 'Passwords don’t match.';
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
      const result = await signUpWithEmail(email.trim(), password, name.trim(), { userRole: persona });
      if (result === 'confirmation-required') {
        setPendingConfirmation(true);
      } else {
        toast.success('Welcome to HazardNet! Your account is ready.');
        navigate(next, { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <AuthLayout
        mode="signup"
        title="Confirm your email"
        subtitle="One last step before your HazardNet account activates."
      >
        <div className="space-y-5 text-center" data-testid="signup-confirmation">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <MaterialIcon name="mail" className="h-6 w-6" />
          </motion.div>
          <p className="text-sm text-slate-600 leading-relaxed">
            We sent a confirmation link to <strong className="text-slate-900">{email.trim()}</strong>. Open it in your
            inbox to activate your account, then sign in. Check your spam folder if it hasn’t arrived within a few
            minutes.
          </p>
          <Link
            to={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="inline-block rounded-2xl bg-[#f9a825] px-5 py-3 text-sm font-black text-slate-950 shadow-md transition-colors hover:bg-[#d08305]"
          >
            Continue to sign in
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="signup-password">
              Password
            </label>
            <div className="relative">
              <input
                id="signup-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                required
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeToggleIcon isState={showPassword} size={20} duration={0} />
              </button>
            </div>
            {password && (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full ${
                        index < score ? STRENGTH[score].bar : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[10px] font-extrabold ${STRENGTH[score].text}`}>{STRENGTH[score].label}</span>
              </div>
            )}
            {fieldErrors.password && (
              <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="signup-confirm">
              Confirm password
            </label>
            <input
              id="signup-confirm"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(fieldErrors.confirm)}
              className={inputClass}
            />
            {fieldErrors.confirm && (
              <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.confirm}</p>
            )}
          </div>
        </div>

        {password && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
            <Requirement met={password.length >= 8}>8+ characters</Requirement>
            <Requirement met={/[A-Z]/.test(password) && /[a-z]/.test(password)}>Upper &amp; lowercase</Requirement>
            <Requirement met={/\d/.test(password)}>A number</Requirement>
            <Requirement met={/[^A-Za-z0-9]/.test(password)}>A special character</Requirement>
          </ul>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="signup-persona">
            I am a…
          </label>
          <select
            id="signup-persona"
            name="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value as UserRolePersona)}
            className={`${inputClass} cursor-pointer appearance-none`}
          >
            {PERSONAS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-start gap-2.5 cursor-pointer" htmlFor="signup-terms">
            <input
              id="signup-terms"
              name="terms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#f9a825] accent-[#f9a825] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 cursor-pointer"
            />
            <span className="text-[11px] leading-relaxed text-slate-600">
              I agree to the{' '}
              <Link to="/terms" className="font-bold text-amber-800 underline underline-offset-2">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-bold text-amber-800 underline underline-offset-2">
                Privacy Policy
              </Link>
              , including use of my advisory preferences to improve early warnings.
            </span>
          </label>
          {fieldErrors.terms && <p className="mt-1 text-[11px] font-semibold text-rose-700">{fieldErrors.terms}</p>}
        </div>

        <button
          id="signup-page-submit-btn"
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
            'Create account'
          )}
        </button>

        <div className="relative flex items-center justify-center pt-1" aria-hidden="true">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider absolute">
            or sign up with
          </span>
        </div>

        <OAuthButtons />
      </form>

      <p className="text-center text-xs sm:text-[13px] text-slate-600">
        Already have an account?{' '}
        <Link
          to={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-extrabold text-amber-800 hover:text-amber-900 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignUpPage;
