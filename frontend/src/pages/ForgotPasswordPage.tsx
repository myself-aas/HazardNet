import MaterialIcon from "../components/MaterialIcon";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthLayout } from '../components/auth/AuthLayout';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { sendPasswordResetEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(email.trim());
      setIsSubmitted(true);
      toast.success('Password reset email sent!');
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setError('No registered account was found with this email.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email format.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <AuthLayout
        mode="recovery"
        title="Reset your password"
        subtitle="Enter your registered email and we'll send you a secure reset link."
      >

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-l-2 border-nasa-orange bg-white p-4">
              <p className="text-base leading-[1.62] text-carbon-70">
                Enter your registered HazardNet email address and we'll send you instructions to reset your password.
              </p>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  role="alert"
                  className="flex items-start gap-2 border-l-2 border-nasa-red bg-white p-4 text-sm font-medium text-nasa-red-shade"
                >
                  <span className="shrink-0"><MaterialIcon name="warning" className="w-4 h-4 inline-block mr-1" /></span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-carbon-80" htmlFor="forgot-email">
                Registered Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoFocus={
                  typeof window !== 'undefined' &&
                  typeof window.matchMedia === 'function' &&
                  window.matchMedia('(pointer: fine)').matches
                }
                placeholder="user@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-12 w-full rounded-sm border border-carbon-20 bg-carbon-05 px-4 py-3 text-base text-carbon-90 placeholder-carbon-40 font-medium focus:border-nasa-blue focus:outline-none focus:ring-2 focus:ring-nasa-blue/40"
              />
            </div>

            <button
              id="forgot-submit-btn"
              type="submit"
              disabled={loading || !email.trim()}
              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 bg-nasa-red-shade px-6 py-3 text-base font-semibold text-white hover:bg-nasa-red disabled:opacity-50 touch-manipulation"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-carbon-90" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span>Sending Reset Link...</span>
                </>
              ) : (
                'Send Password Reset Link'
              )}
            </button>

            <div className="text-center text-xs text-carbon-60 pt-2 space-y-1.5 border-t border-carbon-10">
              <p>
                Remembered your password?{' '}
                <Link to="/login" className="text-nasa-blue-shade hover:underline font-extrabold">Log In</Link>
              </p>
              <p>
                Need an account?{' '}
                <Link to="/signup" className="text-nasa-blue-shade hover:underline font-extrabold">Sign Up</Link>
              </p>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-carbon-20 bg-carbon-05 text-xl text-carbon-80">
              ✓
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-carbon-90">Check Your Inbox</h4>
              <p className="text-xs text-carbon-60 mt-1">
                We sent a password reset link to <strong className="text-carbon-90 break-all">{email}</strong>.
              </p>
            </div>

            <p className="text-xs text-carbon-60 bg-carbon-05 border border-carbon-20 p-3 text-left">
              Please check your spam or junk folder if the email does not appear in your primary inbox within 2 minutes.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="min-h-[44px] w-full cursor-pointer bg-nasa-red-shade px-6 py-3 text-base font-semibold text-white hover:bg-nasa-red touch-manipulation"
              >
                Proceed to Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="min-h-[44px] w-full cursor-pointer border border-carbon-20 bg-carbon-05 px-6 py-3 text-base font-semibold text-carbon-70 hover:bg-carbon-10 touch-manipulation"
              >
                Enter a different email
              </button>
            </div>
          </div>
        )}
      </AuthLayout>
    </motion.div>
  );
};

export default ForgotPasswordPage;
