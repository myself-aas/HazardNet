import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../apple/primitives';
import { Panel, TextField } from './ui';
import MaterialIcon from '../../MaterialIcon';
import { IdentityConnections } from '../../IdentityConnections';

/**
 * "Account & Security" tab — email change (re-verified by Firebase), password
 * set/change, linked social identities, and the session.
 *
 * Four bordered panels in a row, each with one job, and no bordered thing
 * inside any of them: the two controls that used to be a boxed row inside a
 * boxed panel are now just the panel's closing action. There is no emerald or
 * amber badge either — "Verified" and "Pending verification" are sentences, and
 * a state that only exists as a colour is a state a greyscale printout loses.
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
      toast.success('Verification email sent to your new address. Confirm it to finish the change.');
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
      toast.success('Password reset link sent. Check your inbox.');
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
      toast.error('Sign-out failed. Try again.');
    } finally {
      setSignOutBusy(false);
    }
  };

  const emailVerified = Boolean(user?.emailVerified ?? user?.email_confirmed_at ?? user?.confirmed_at);
  const address = user?.email ?? userProfile?.email ?? '—';

  return (
    <div className="space-y-6">
      <Panel title="Email address" description="Your sign-in address. A change takes effect once you confirm the new inbox.">
        <p className="text-base font-semibold text-carbon-90">{address}</p>
        <p className="mt-1 text-sm leading-[1.62] text-carbon-70">
          {emailVerified
            ? 'Confirmed. This address can recover your account.'
            : 'Not confirmed yet. Check your inbox, or send a new link from the Overview tab.'}
        </p>
        <div className="mt-5 border-t border-carbon-10 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <TextField
              id="account-new-email"
              label="Change email"
              type="email"
              value={newEmail}
              onChange={setNewEmail}
              placeholder="new-address@example.com"
              hint="We email a verification link to the new address; the change completes after you confirm it."
              className="flex-1"
            />
            <Button
              intent="primary"
              size="sm"
              className="shrink-0 sm:mt-7"
              onClick={handleEmailChange}
              disabled={emailBusy || !newEmail.trim()}
            >
              {emailBusy ? 'Sending…' : 'Update email'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Password"
        description={
          passwordProvider === 'social'
            ? 'This account signs in with a social provider. Set a password to also sign in with email.'
            : 'Use a strong, unique password. You can request a new one as often as you like.'
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <Button
            intent="secondary"
            size="sm"
            onClick={handlePasswordReset}
            disabled={resetBusy || !userProfile?.email}
          >
            <MaterialIcon name="key" size={14} />
            {passwordProvider === 'social' ? 'Email me a password-setup link' : 'Email me a password-reset link'}
          </Button>
          <p className="text-sm leading-[1.62] text-carbon-70">
            The link goes to <strong className="font-semibold text-carbon-90">{userProfile?.email ?? 'your inbox'}</strong>.
          </p>
        </div>
      </Panel>

      <Panel title="Connected accounts" description="Sign in with one click using any linked provider.">
        <IdentityConnections />
      </Panel>

      <Panel title="Session" description="Signing out clears this device's local session and cached district preferences.">
        <div className="flex flex-wrap items-center gap-4">
          <Button intent="secondary" size="sm" onClick={handleSignOut} disabled={signOutBusy}>
            <MaterialIcon name="logout" size={14} />
            {signOutBusy ? 'Signing out…' : 'Sign out'}
          </Button>
          <Link to="/live" className="ap-btn ap-btn-secondary">
            Open the live map
          </Link>
        </div>
      </Panel>
    </div>
  );
};

export default AccountSection;
