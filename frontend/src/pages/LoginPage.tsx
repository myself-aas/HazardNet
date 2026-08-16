import MaterialIcon from "../components/MaterialIcon";
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthCard } from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';
import { HazardNetBrand } from '../components/HazardNetLogo';
import { PasswordResetModal } from '../components/PasswordResetModal';
import { EyeToggleIcon } from '../components/ui/animated-state-icons';

const LoginPage: React.FC = () => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password. You can reset your password using the link below.');
      } else if (code === 'auth/user-not-found') {
        setError('No registered user found with this email.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
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
      <AuthCard title="Sign In">
        <div className="flex justify-center mb-2">
          <HazardNetBrand size="md" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-xs font-bold text-slate-800 mb-1.5" htmlFor="login-page-email">
              Email Address
            </label>
            <input
              id="login-page-email"
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825] focus:ring-1 focus:ring-[#f9a825] transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800" htmlFor="login-page-password">
                Password
              </label>
              <button
                id="login-page-forgot-pwd-btn"
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input
                id="login-page-password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825] focus:ring-1 focus:ring-[#f9a825] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeToggleIcon isState={showPassword} size={20} duration={0} />
              </button>
            </div>
          </div>

          <button
            id="login-page-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-extrabold rounded-2xl text-xs transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <span>Signing In...</span>
              </>
            ) : (
              'Sign In with Email'
            )}
          </button>

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider absolute">
              Or
            </span>
          </div>

          <button
            id="login-page-google-btn"
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-2xl text-xs font-bold border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continue with Google</span>
          </button>

          <div className="text-center text-xs text-slate-600 pt-2 space-y-1">
            <p>
              Don't have an account?{' '}
              <Link to="/sign-up" className="font-extrabold text-amber-800 hover:underline">
                Sign Up
              </Link>
            </p>
          </div>
        </form>
      </AuthCard>

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        initialEmail={email}
      />
    </motion.div>
  );
};

export default LoginPage;
