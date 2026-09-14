import React from 'react';
import { act, render } from '@testing-library/react';
import { AuthProvider, useAuth, type AuthContextType } from '../AuthContext';
import { auth } from '../../services/firebase';
import { createUserWithEmailAndPassword, signInWithPopup, linkWithPopup, unlink, sendEmailVerification, verifyBeforeUpdateEmail } from 'firebase/auth';
import { saveProfile } from '../../lib/profilePrivacy';

jest.mock('../../services/firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('../../lib/profilePrivacy', () => ({ saveProfile: jest.fn().mockResolvedValue(undefined) }));
jest.mock('firebase/auth', () => ({
  ...jest.requireActual('firebase/auth'),
  onAuthStateChanged: jest.fn(() => () => {}),
  createUserWithEmailAndPassword: jest.fn(), updateProfile: jest.fn().mockResolvedValue(undefined),
  signInWithPopup: jest.fn(), linkWithPopup: jest.fn(), unlink: jest.fn(),
  sendEmailVerification: jest.fn(), verifyBeforeUpdateEmail: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  ...jest.requireActual('firebase/firestore'), doc: jest.fn(),
  getDoc: jest.fn().mockResolvedValue({ exists: () => true, id: 'user1', data: () => ({ display_name: 'User' }) }),
}));
let context: AuthContextType;
function Probe() { context = useAuth(); return null; }
const current = (providers: string[]) => ({ uid: 'user1', email: 'user@example.com', emailVerified: false,
  displayName: 'User', providerData: providers.map((providerId) => ({ providerId, uid: providerId, email: 'user@example.com' })) });
beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as { currentUser: unknown }).currentUser = current(['google.com']);
  render(<AuthProvider><Probe /></AuthProvider>);
});
it('Google and GitHub sign-in use dedicated SDK provider IDs', async () => {
  await act(async () => { await context.signInWithOAuth('google'); await context.signInWithOAuth('github'); });
  expect(jest.mocked(signInWithPopup).mock.calls.map((call) => call[1].providerId)).toEqual(['google.com', 'github.com']);
});
it('rejects unsupported providers before popup or linking', async () => {
  await expect(context.signInWithOAuth('apple' as never)).rejects.toThrow('Unsupported');
  await expect(context.linkIdentity('microsoft' as never)).rejects.toThrow('Unsupported');
  expect(signInWithPopup).not.toHaveBeenCalled(); expect(linkWithPopup).not.toHaveBeenCalled();
});
it('links GitHub with its minimal email scope', async () => {
  await act(async () => { await context.linkIdentity('github'); });
  expect(linkWithPopup).toHaveBeenCalledWith(auth.currentUser, expect.objectContaining({ providerId: 'github.com' }));
});
it('never unlinks the final supported method, even with a legacy provider', async () => {
  (auth as unknown as { currentUser: unknown }).currentUser = current(['github.com', 'apple.com']);
  await expect(context.unlinkIdentity('github')).rejects.toThrow('at least one supported');
  expect(unlink).not.toHaveBeenCalled();
});
it('can unlink a social method when a password remains', async () => {
  (auth as unknown as { currentUser: unknown }).currentUser = current(['password', 'github.com']);
  await act(async () => { await context.unlinkIdentity('github'); });
  expect(unlink).toHaveBeenCalledWith(auth.currentUser, 'github.com');
});
it('creates password credentials and persists the chosen username, without magic-link signup', async () => {
  jest.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: auth.currentUser } as never);
  await act(async () => { await context.signUpWithEmail('user@example.com', 'Strong!123', 'Farmer', { username: 'farmer' }); });
  expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'user@example.com', 'Strong!123');
  expect(saveProfile).toHaveBeenCalledWith('user1', expect.objectContaining({ display_name: 'Farmer', username: 'farmer' }));
});
it('verification verifies only the current account and does not create a session', async () => {
  await context.sendVerificationEmail('user@example.com');
  expect(sendEmailVerification).toHaveBeenCalledWith(auth.currentUser, { url: `${window.location.origin}/login` });
  await expect(context.sendVerificationEmail('other@example.com')).rejects.toThrow('Sign in');
});
it('email changes wait for verification before touching profile data', async () => {
  await context.changeEmail('new@example.com');
  expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(auth.currentUser, 'new@example.com', expect.any(Object));
  expect(saveProfile).not.toHaveBeenCalled();
});
it('serializes identity changes so concurrent clicks cannot remove both methods', async () => {
  (auth as unknown as { currentUser: unknown }).currentUser = current(['google.com', 'github.com']);
  let release: () => void = () => {};
  jest.mocked(unlink).mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve(auth.currentUser!);
  }));
  await act(async () => {
    const first = context.unlinkIdentity('google');
    await expect(context.unlinkIdentity('github')).rejects.toThrow('already in progress');
    release(); await first;
  });
  expect(unlink).toHaveBeenCalledTimes(1);
});
