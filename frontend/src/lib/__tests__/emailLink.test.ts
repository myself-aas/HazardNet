import { sendEmailLink, completeEmailLink, EMAIL_LINK_KEY } from '../emailLink';
import { sendSignInLinkToEmail, signInWithEmailLink } from 'firebase/auth';
jest.mock('../../services/firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ sendSignInLinkToEmail: jest.fn(), signInWithEmailLink: jest.fn(), isSignInWithEmailLink: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });
test('actually requests Firebase email link; callback does not contain email', async () => {
  await sendEmailLink('farmer@example.com');
  expect(sendSignInLinkToEmail).toHaveBeenCalledWith({}, 'farmer@example.com', {
    url: `${window.location.origin}/auth/callback?next=%2Fset-password`, handleCodeInApp: true,
  });
  expect(localStorage.getItem(EMAIL_LINK_KEY)).toBe('farmer@example.com');
});
test('does not claim email sent when Firebase rejects it', async () => {
  jest.mocked(sendSignInLinkToEmail).mockRejectedValueOnce(new Error('provider disabled'));
  await expect(sendEmailLink('farmer@example.com')).rejects.toThrow('provider disabled');
  expect(localStorage.getItem(EMAIL_LINK_KEY)).toBeNull();
});
test('redeems link once for concurrent callers and clears pending email', async () => {
  localStorage.setItem(EMAIL_LINK_KEY, 'farmer@example.com');
  jest.mocked(signInWithEmailLink).mockResolvedValue({ user: { uid: 'farmer' } } as never);
  const first = completeEmailLink('farmer@example.com', 'https://example.com/?oobCode=test');
  const second = completeEmailLink('farmer@example.com', 'https://example.com/?oobCode=test');
  await expect(first).resolves.toEqual({ uid: 'farmer' });
  await second;
  expect(signInWithEmailLink).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(EMAIL_LINK_KEY)).toBeNull();
});
