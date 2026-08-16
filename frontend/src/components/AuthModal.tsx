import MaterialIcon from "./MaterialIcon";
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UserRolePersona } from '../context/AuthContext';
import { EyeToggleIcon } from './ui/animated-state-icons';
import { HazardNetBrand } from './HazardNetLogo';
import toast from 'react-hot-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup' | 'reset';
  initialEmail?: string;
}

const PERSONA_DESCRIPTIONS: Record<UserRolePersona, { label: string; desc: string }> = {
  smallholder_farmer: {
    label: 'Rural Smallholder Farmer',
    desc: 'Focus on crop safety, localized flash flood & drought alerts, BRRI seed recommendations.',
  },
  ngo_coordinator: {
    label: 'NGO Disaster Coordinator',
    desc: 'Humanitarian relief planning, vulnerable district indices, shelter & WASH mobilization.',
  },
  govt_official: {
    label: 'DAE / Government Extension Officer',
    desc: 'Agricultural extension policy, regional hazard metrics, disaster damage reporting.',
  },
  academic_researcher: {
    label: 'Academic Climate Scientist',
    desc: 'Deep research, 15-channel satellite band parameters, raw TFLite model inference metrics.',
  },
  commercial_agribusiness: {
    label: 'Agro-Business & Supply Manager',
    desc: 'Crop yield forecasting, regional supply chain risk, logistics disruption warnings.',
  },
};

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose, 
  defaultMode = 'signin',
  initialEmail = ''
}) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordResetEmail } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(defaultMode);

  // Form states
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userRole, setUserRole] = useState<UserRolePersona>('smallholder_farmer');
  const [organization, setOrganization] = useState('');
  const [primaryDistrict, setPrimaryDistrict] = useState('');
  const [targetCrops, setTargetCrops] = useState('Boro Paddy, Aman Rice');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Sync mode when modal opens or defaultMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      if (initialEmail) setEmail(initialEmail);
      setErrorMsg('');
      setResetSuccess(false);
    }
  }, [isOpen, defaultMode, initialEmail]);

  // Resend cooldown timer for password reset
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        toast.success('Signed in successfully.');
        onClose();
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName, {
          userRole,
          organization,
          primaryDistrict,
          targetCrops,
        });
        toast.success('Account created successfully!');
        onClose();
      } else if (mode === 'reset') {
        if (!email.trim()) {
          setErrorMsg('Please enter your account email address.');
          setLoading(false);
          return;
        }
        await sendPasswordResetEmail(email.trim());
        setResetSuccess(true);
        setResendCooldown(30);
        toast.success('Password reset instructions sent!');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      const code = err?.code || '';
      if (mode === 'reset') {
        if (code === 'auth/user-not-found') {
          setErrorMsg('No account found with this email address.');
        } else if (code === 'auth/invalid-email') {
          setErrorMsg('Please enter a valid email address.');
        } else if (code === 'auth/too-many-requests') {
          setErrorMsg('Too many requests. Please wait a few moments.');
        } else {
          setErrorMsg(err.message || 'Failed to send reset email. Please try again.');
        }
      } else {
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          setErrorMsg('Incorrect email or password. You can reset your password below.');
        } else if (code === 'auth/user-not-found') {
          setErrorMsg('No user found with this email address.');
        } else if (code === 'auth/email-already-in-use') {
          setErrorMsg('An account with this email already exists. Please sign in instead.');
        } else {
          setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendReset = async () => {
    if (resendCooldown > 0 || loading || !email.trim()) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await sendPasswordResetEmail(email.trim());
      setResendCooldown(30);
      toast.success('Password reset email resent.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to resend reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google.');
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="auth-modal-backdrop"
          key="auth-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            id="auth-modal-content-panel"
            key="auth-modal-content"
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 max-h-[92vh] flex flex-col overflow-y-auto text-slate-900 relative"
          >
            {/* Top Amber Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#f9a825] rounded-t-3xl" />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 pt-1">
              <div className="flex items-center gap-3">
                <HazardNetBrand size="sm" />
              </div>
              <button
                id="auth-modal-close-btn"
                onClick={onClose}
                aria-label="Close modal"
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2"
              >
                <span className="shrink-0"><MaterialIcon name="warning" className="w-4 h-4 inline-block mr-1" /></span>
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {/* PASSWORD RESET SUB-VIEW */}
            {mode === 'reset' ? (
              !resetSuccess ? (
                <div className="space-y-4">
                  {/* Reset Sub-view Info */}
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200/90 rounded-2xl">
                    <div className="w-8 h-8 rounded-xl bg-[#f9a825]/20 flex items-center justify-center text-sm shrink-0 font-bold text-amber-900">
                      🔑
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-extrabold text-slate-900">
                        Password Reset
                      </h4>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Enter your HazardNet account email to receive a password reset link.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="auth-modal-reset-email" className="block text-xs font-bold text-slate-800 mb-1">
                        Account Email Address
                      </label>
                      <input
                        id="auth-modal-reset-email"
                        type="email"
                        required
                        autoFocus
                        placeholder="user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825] focus:ring-1 focus:ring-[#f9a825]"
                      />
                    </div>

                    <button
                      id="auth-modal-reset-submit-btn"
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="w-full py-3 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 rounded-full text-xs font-extrabold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
                  </form>

                  <div className="text-center pt-2 border-t border-slate-100">
                    <button
                      id="auth-modal-back-to-signin-btn"
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setMode('signin');
                      }}
                      className="text-xs font-bold text-amber-800 hover:underline cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                /* Reset Success Confirmation */
                <motion.div
                  key="reset-success-block"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4 text-center py-2"
                >
                  <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner text-emerald-600">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">Email Sent</h4>
                    <p className="text-xs text-slate-600 mt-1">
                      We sent a reset link to <strong className="text-slate-900 break-all">{email}</strong>.
                    </p>
                  </div>

                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-left">
                    Please check your inbox (and spam folder) and follow the instructions in the email to set a new password.
                  </p>

                  <div className="space-y-2 pt-2">
                    <button
                      id="auth-modal-reset-done-btn"
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setResetSuccess(false);
                        setMode('signin');
                      }}
                      className="w-full py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 rounded-full text-xs font-extrabold transition-all shadow-xs cursor-pointer"
                    >
                      Back to Sign In
                    </button>

                    <button
                      id="auth-modal-reset-resend-btn"
                      type="button"
                      onClick={handleResendReset}
                      disabled={resendCooldown > 0 || loading}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-full text-xs font-bold border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
                    </button>
                  </div>
                </motion.div>
              )
            ) : (
              /* SIGN-IN OR SIGN-UP FORM */
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'signup' && (
                    <div>
                      <label htmlFor="auth-modal-fullname" className="block text-xs font-bold text-slate-800 mb-1">Full Name</label>
                      <input
                        id="auth-modal-fullname"
                        type="text"
                        required
                        placeholder="e.g. Md. Abdul Karim"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-modal-email" className="block text-xs font-bold text-slate-800 mb-1">Email Address</label>
                    <input
                      id="auth-modal-email"
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="auth-modal-password" className="block text-xs font-bold text-slate-800">Password</label>
                      {mode === 'signin' && (
                        <button
                          id="auth-modal-forgot-password-btn"
                          type="button"
                          onClick={() => {
                            setErrorMsg('');
                            setResetSuccess(false);
                            setMode('reset');
                          }}
                          className="text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="auth-modal-password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
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

                  {mode === 'signup' && (
                    <>
                      {/* Persona / Role Selection */}
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-xs font-bold text-slate-800">
                          Select Your Persona / Stakeholder Role
                        </label>
                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                          {(Object.keys(PERSONA_DESCRIPTIONS) as UserRolePersona[]).map((roleKey) => {
                            const info = PERSONA_DESCRIPTIONS[roleKey];
                            const isSelected = userRole === roleKey;
                            return (
                              <div
                                key={roleKey}
                                onClick={() => setUserRole(roleKey)}
                                className={`p-2.5 border rounded-2xl cursor-pointer transition-all flex items-start gap-2.5 ${
                                  isSelected
                                    ? 'bg-amber-50 border-[#f9a825] ring-1 ring-[#f9a825]'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-extrabold text-slate-900">{info.label}</span>
                                    {isSelected && <span className="text-xs text-[#d08305] font-bold">Selected</span>}
                                  </div>
                                  <p className="text-[10px] text-slate-600 mt-0.5 leading-snug">{info.desc}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="auth-modal-org" className="block text-xs font-bold text-slate-800 mb-1">Organization / Farm Name (Optional)</label>
                        <input
                          id="auth-modal-org"
                          type="text"
                          placeholder="e.g. DAE Kurigram / BRAC Disaster Desk / Self Farm"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="auth-modal-district" className="block text-xs font-bold text-slate-800 mb-1">Primary District</label>
                          <input
                            id="auth-modal-district"
                            type="text"
                            placeholder="e.g. Kurigram"
                            value={primaryDistrict}
                            onChange={(e) => setPrimaryDistrict(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
                          />
                        </div>
                        <div>
                          <label htmlFor="auth-modal-crops" className="block text-xs font-bold text-slate-800 mb-1">Target Crops</label>
                          <input
                            id="auth-modal-crops"
                            type="text"
                            placeholder="e.g. Boro, Aman, Jute"
                            value={targetCrops}
                            onChange={(e) => setTargetCrops(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825]"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    id="auth-modal-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 rounded-full text-xs font-extrabold transition-all shadow-xs disabled:opacity-50 mt-2 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span>Processing...</span>
                      </>
                    ) : mode === 'signin' ? (
                      'Sign In with Email'
                    ) : (
                      'Create Profile & Sign Up'
                    )}
                  </button>
                </form>

                <div className="relative flex items-center justify-center my-2">
                  <div className="border-t border-slate-200 w-full"></div>
                  <span className="bg-white px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider absolute">
                    Or
                  </span>
                </div>

                {/* Google OAuth Option */}
                <button
                  id="auth-modal-google-btn"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-full text-xs font-bold border border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue with Google</span>
                </button>

                {/* Toggle Mode */}
                <div className="text-center pt-2 text-xs text-slate-600">
                  {mode === 'signin' ? (
                    <p>
                      Don't have an account?{' '}
                      <button
                        id="auth-modal-switch-to-signup"
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setMode('signup');
                        }}
                        className="font-extrabold text-amber-800 hover:underline cursor-pointer"
                      >
                        Sign Up & Select Persona
                      </button>
                    </p>
                  ) : (
                    <p>
                      Already have an account?{' '}
                      <button
                        id="auth-modal-switch-to-signin"
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setMode('signin');
                        }}
                        className="font-extrabold text-amber-800 hover:underline cursor-pointer"
                      >
                        Sign In
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

