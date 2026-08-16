import MaterialIcon from "./MaterialIcon";
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { HazardNetBrand } from './HazardNetLogo';
import toast from 'react-hot-toast';

export interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onBackToSignIn?: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  onClose,
  initialEmail = '',
  onBackToSignIn,
}) => {
  const { sendPasswordResetEmail } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Sync initialEmail when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialEmail) setEmail(initialEmail);
      setErrorMsg('');
      setIsSubmitted(false);
    }
  }, [isOpen, initialEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(email.trim());
      setIsSubmitted(true);
      setResendCooldown(30); // 30-second cooldown
      toast.success('Password reset link sent to your email!');
    } catch (err: any) {
      console.error('Password reset error:', err);
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setErrorMsg('No registered HazardNet account was found with this email address.');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Please provide a properly formatted email address.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Too many reset attempts. Please wait a moment before trying again.');
      } else {
        setErrorMsg(err.message || 'Failed to send password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      await sendPasswordResetEmail(email.trim());
      setResendCooldown(30);
      toast.success('A new password reset link has been dispatched.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to resend reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="password-reset-modal-backdrop"
          key="password-reset-modal-backdrop"
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
            id="password-reset-modal-container"
            key="password-reset-modal-content"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] flex flex-col overflow-y-auto text-slate-900 relative"
          >
            {/* Top Amber Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#f9a825] rounded-t-3xl" />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 pt-1">
              <div className="flex items-center gap-2">
                <HazardNetBrand size="sm" />
              </div>
              <button
                id="password-reset-close-btn"
                onClick={onClose}
                aria-label="Close modal"
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content View: Form or Success */}
            {!isSubmitted ? (
              <div className="space-y-4">
                {/* Visual Header Banner */}
                <div className="flex items-start gap-3.5 p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-[#f9a825]/20 border border-[#f9a825]/40 flex items-center justify-center text-lg shrink-0">
                    🔑
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Reset Your Password
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Enter the email address associated with your HazardNet account and we’ll send you a secure link to reset your password.
                    </p>
                  </div>
                </div>

                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-start gap-2"
                  >
                    <span className="text-sm shrink-0"><MaterialIcon name="warning" className="w-4 h-4 inline-block mr-1" /></span>
                    <span>{errorMsg}</span>
                  </motion.div>
                )}

                <form id="password-reset-form" onSubmit={handleResetSubmit} className="space-y-4">
                  <div>
                    <label 
                      htmlFor="password-reset-email" 
                      className="block text-xs font-bold text-slate-800 mb-1.5"
                    >
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <input
                        id="password-reset-email"
                        type="email"
                        required
                        autoFocus
                        placeholder="e.g. user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:border-[#f9a825] focus:ring-1 focus:ring-[#f9a825] transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      We will dispatch an authorized password recovery email via Firebase Authentication.
                    </p>
                  </div>

                  <button
                    id="password-reset-submit-btn"
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full py-3 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 rounded-2xl text-xs font-extrabold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span>Dispatching Reset Email...</span>
                      </>
                    ) : (
                      <>
                        <MaterialIcon name="mail" className="w-4 h-4 inline-block mr-1" />
                        <span>Send Password Reset Link</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Back to Sign In Option */}
                {onBackToSignIn && (
                  <div className="text-center pt-1 border-t border-slate-100">
                    <button
                      id="password-reset-back-to-signin-btn"
                      type="button"
                      onClick={onBackToSignIn}
                      className="text-xs font-bold text-amber-800 hover:text-amber-900 hover:underline inline-flex items-center gap-1.5 cursor-pointer py-1"
                    >
                      <span>←</span>
                      <span>Return to Sign In</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Success Confirmation View */
              <motion.div
                key="password-reset-success-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 text-center py-2"
              >
                <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-2xl shadow-inner text-emerald-600">
                  ✓
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Check Your Inbox
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                    We sent a password reset link to <strong className="text-slate-900 break-all">{email}</strong>.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 text-left text-[11px] text-slate-600 space-y-1.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MaterialIcon name="lightbulb" className="w-4 h-4 inline-block mr-1" />
                    <span>Next steps:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li>Click the secure link in the email to set a new password.</li>
                    <li>If you don't see it within a few minutes, check your <strong>Spam</strong> or <strong>Junk</strong> folder.</li>
                    <li>The reset link remains active for a limited security window.</li>
                  </ul>
                </div>

                {errorMsg && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                    {errorMsg}
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <button
                    id="password-reset-done-btn"
                    type="button"
                    onClick={() => {
                      if (onBackToSignIn) onBackToSignIn();
                      else onClose();
                    }}
                    className="w-full py-2.5 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 rounded-2xl text-xs font-extrabold transition-all shadow-xs cursor-pointer"
                  >
                    {onBackToSignIn ? 'Proceed to Sign In' : 'Done'}
                  </button>

                  <button
                    id="password-reset-resend-btn"
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {resendCooldown > 0
                      ? `Resend link in ${resendCooldown}s`
                      : 'Did not receive it? Resend email'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PasswordResetModal;
