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
            <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200/90 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-nasa-red/20 flex items-center justify-center text-sm shrink-0 font-bold text-amber-900">
                🔑
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your registered HazardNet email address and we'll send you instructions to reset your password.
              </p>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2"
                >
                  <span className="shrink-0"><MaterialIcon name="warning" className="w-4 h-4 inline-block mr-1" /></span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="forgot-email">
                Registered Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoFocus
                placeholder="user@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-nasa-blue focus:ring-1 focus:ring-nasa-blue transition-all"
              />
            </div>

            <button
              id="forgot-submit-btn"
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 bg-nasa-red text-slate-900 hover:bg-nasa-red-shade font-extrabold rounded-2xl text-xs transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span>Sending Reset Link...</span>
                </>
              ) : (
                'Send Password Reset Link'
              )}
            </button>

            <div className="text-center text-xs text-slate-600 pt-2 space-y-1.5 border-t border-slate-100">
              <p>
                Remembered your password?{' '}
                <Link to="/login" className="text-amber-800 hover:underline font-extrabold">Log In</Link>
              </p>
              <p>
                Need an account?{' '}
                <Link to="/signup" className="text-amber-800 hover:underline font-extrabold">Sign Up</Link>
              </p>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner text-emerald-600">
              ✓
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">Check Your Inbox</h4>
              <p className="text-xs text-slate-600 mt-1">
                We sent a password reset link to <strong className="text-slate-900 break-all">{email}</strong>.
              </p>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left">
              Please check your spam or junk folder if the email does not appear in your primary inbox within 2 minutes.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-2.5 bg-nasa-red hover:bg-nasa-red-shade text-slate-900 rounded-2xl text-xs font-extrabold transition-all shadow-xs cursor-pointer"
              >
                Proceed to Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
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
