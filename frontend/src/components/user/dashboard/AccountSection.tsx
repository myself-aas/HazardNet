import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { Card, Field, inputClass } from './ui';
import MaterialIcon from '../../MaterialIcon';
import { IdentityConnections } from '../../IdentityConnections';

/**
 * "Account & Security" tab — email change (re-verified by Firebase), password
 * set/change, linked social identities, and session controls.
 */

export const AccountSection: React.FC = () => {
  const { user, userProfile, changeEmail, sendPasswordResetEmail, signOut } = useAuth();
  const navigate = useNavigate();
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [passwordProvider, setPasswordProvider] = useState<'unknown' | 'email' | 'social'>('unknown');

  useEffect(() => {
    if (!user) return;
    const identities = (user.providerData ?? []).map((provider: { providerId: string }) => provider.providerId);
    setPasswordProvider(identities.includes('email') ? 'email' : identities.length > 0 ? 'social' : 'unknown');
  }, [user]);

  const handleEmailChange = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast.error('Enter a valid new email address.');
      return;
    }
    setEmailBusy(true);
    try {
      await changeEmail(newEmail.trim());
      toast.success('Verification email sent to your new address — confirm it to finish the change.');
      setNewEmail('');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not start the email change.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!userProfile?.email) return;
    setResetBusy(true);
    try {
      await sendPasswordResetEmail(userProfile.email);
      toast.success('Password reset link sent — check your inbox.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not send the reset link.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutBusy(true);
    try {
      await signOut();
      navigate('/login');
    } catch {
      toast.error('Sign-out failed — try again.');
    } finally {
      setSignOutBusy(false);
    }
  };

  const emailVerified = Boolean(user?.emailVerified ?? user?.email_confirmed_at ?? user?.confirmed_at);

  return (
    <div className="space-y-5">
      {/* Email */}
      <Card title="Email address" subtitle="Your sign-in address. Changes require confirming the new inbox." icon={<MaterialIcon name="mail" size={18} />}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-carbon-05 px-4 py-3">
            <span className="text-sm font-bold text-carbon-80">{user?.email ?? userProfile?.email ?? '—'}</span>
            {emailVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-carbon-05 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-carbon-80">
                <MaterialIcon name="check_badge" size={12} /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-amber-700">
                <MaterialIcon name="mail" size={12} /> Pending verification
              </span>
            )}
          </div>
          <Field label="Change email" htmlFor="account-new-email" hint="We’ll email a verification link; the address updates after you confirm.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="account-new-email"
                type="email"
                placeholder="new-address@example.com"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleEmailChange}
                disabled={emailBusy || !newEmail.trim()}
                className="shrink-0 bg-carbon-90 px-4 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-carbon-80 disabled:opacity-40 cursor-pointer"
              >
                {emailBusy ? 'Sending…' : 'Update email'}
              </button>
            </div>
          </Field>
        </div>
      </Card>

      {/* Password */}
      <Card
        title="Password"
        subtitle={
          passwordProvider === 'social'
            ? 'Your account currently uses social sign-in only — set a password to also sign in with email.'
            : 'Use a strong, unique password. You can change it as often as you like.'
        }
        icon={<MaterialIcon name="key" size={18} />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={resetBusy || !userProfile?.email}
            className="flex items-center gap-2 bg-carbon-90 px-4 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-carbon-80 disabled:opacity-40 cursor-pointer"
          >
            {resetBusy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {passwordProvider === 'social' ? 'Email me a password-setup link' : 'Email me a password-reset link'}
          </button>
          <p className="text-xs leading-relaxed text-carbon-60">
            For security the link goes to <strong>{userProfile?.email ?? 'your inbox'}</strong> and opens the
            set-password page.
          </p>
        </div>
      </Card>

      {/* Linked identities */}
      <Card title="Connected accounts" subtitle="Sign in with one click using any linked provider." icon={<MaterialIcon name="link" size={18} />}>
        <IdentityConnections />
      </Card>

      {/* Session */}
      <Card title="Session" subtitle="Sign out of HazardNet on this device." icon={<MaterialIcon name="logout" size={18} />}>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signOutBusy}
          className="flex items-center gap-2 border border-nasa-red bg-white px-4 py-2.5 text-xs font-extrabold text-nasa-red-shade transition-colors hover:bg-rose-100 disabled:opacity-40 cursor-pointer"
        >
          <MaterialIcon name="logout" size={14} />
          {signOutBusy ? 'Signing out…' : 'Sign out'}
        </button>
      </Card>
    </div>
  );
};
