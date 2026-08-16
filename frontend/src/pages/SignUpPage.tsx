import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { HazardNetBrand } from '../components/HazardNetLogo';

const SignUpPage: React.FC = () => {
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordStrengthLabel = password.length > 12 ? 'Strong' : password.length > 8 ? 'Medium' : password.length > 4 ? 'Weak' : 'Very Weak';
  const passwordStrengthColor = password.length > 12 ? 'bg-emerald-500' : password.length > 8 ? 'bg-amber-500' : password.length > 4 ? 'bg-orange-500' : 'bg-red-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Helper component for Material‑3 style floating label input
  const M3Input = ({ id, type = 'text', label, value, setValue, placeholder }: any) => (
    <div className="relative group mb-5">
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || " "}
        className="peer w-full border-b border-slate-300 bg-transparent py-1.5 text-slate-900 placeholder-slate-400 placeholder-opacity-0 focus:placeholder-opacity-100 focus:border-amber-600 focus:outline-none transition-all duration-300 text-sm font-normal"
      />
      <label
        htmlFor={id}
        className="absolute left-0 -top-3.5 text-slate-500 text-xs font-medium tracking-wide transition-all duration-300 peer-placeholder-shown:top-1.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-500 peer-focus:-top-3.5 peer-focus:text-amber-800 peer-focus:text-xs peer-focus:font-semibold"
      >
        {label}
      </label>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="grid grid-cols-1 lg:grid-cols-2 min-h-screen bg-slate-50"
    >
      {/* Left side - HazardNet Brand Showcase */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-amber-500/10 p-12 border-r border-slate-200 relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-300/30 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-md space-y-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold tracking-wide uppercase">
            AI-Powered Early Warning
          </div>
          <div className="flex justify-center">
            <HazardNetBrand size="xl" />
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Flood and natural disaster forecasting powered by hybrid cognitive AI models and physics-informed hydrology.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4 text-left">
            <motion.div whileHover={{ y: -2 }} className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-2xl font-bold text-slate-900">64</div>
              <div className="text-xs text-slate-500 font-medium">Districts Monitored</div>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-2xl font-bold text-amber-800">7 & 15 Day</div>
              <div className="text-xs text-slate-500 font-medium">Forecast Horizon</div>
            </motion.div>
          </div>
        </div>
      </div>
      {/* Right side - sign‑up form with wrapped container */}
      <div className="flex flex-col items-center justify-center px-6 md:px-12 lg:px-24 py-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-[420px] mx-auto shadow-sm">
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-red-600 text-sm mb-4"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
          <h2 className="text-2xl font-bold mb-6 text-slate-900 tracking-tight">Create Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <M3Input id="name" label="Name" value={name} setValue={setName} placeholder="Enter your full name" />
            <M3Input id="email" type="email" label="Email" value={email} setValue={setEmail} placeholder="Enter your email address" />
            {/* Password input with eye toggle */}
            <div className="relative group mb-5">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                className="peer w-full border-b border-slate-300 bg-transparent py-1.5 pr-8 text-slate-900 placeholder-slate-400 placeholder-opacity-0 focus:placeholder-opacity-100 focus:border-amber-600 focus:outline-none transition-all duration-300 text-sm font-normal"
              />
              <label
                htmlFor="password"
                className="absolute left-0 -top-3.5 text-slate-500 text-xs font-medium tracking-wide transition-all duration-300 peer-placeholder-shown:top-1.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-slate-500 peer-focus:-top-3.5 peer-focus:text-amber-800 peer-focus:text-xs peer-focus:font-semibold"
              >
                Password
              </label>
              {/* Eye icon */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-1 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={showPassword ? "fas fa-eye-slash" : "fas fa-eye"}></i>
              </button>
            </div>
            {/* Password strength meter */}
            {password && (
              <div className="flex items-center space-x-2 pb-2">
                <div className={`h-1.5 flex-1 rounded-full ${passwordStrengthColor}`}></div>
                <span className="text-xs text-slate-600 font-medium">{passwordStrengthLabel}</span>
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="relative overflow-hidden w-full py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-bold text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center shadow-xs"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 mr-2 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              ) : null}
              {loading ? "Creating…" : "Sign Up"}
            </motion.button>
            {/* Google sign‑in button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={signInWithGoogle}
              className="flex items-center justify-center w-full py-2.5 border border-slate-300 bg-white rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <i className="fab fa-google mr-2 text-xs"></i> Continue with Google
            </motion.button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="text-amber-800 hover:text-amber-900 font-semibold hover:underline">Log In</Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default SignUpPage;
