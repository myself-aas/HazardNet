import React, { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode, getRedirectResult } from 'firebase/auth';
import UpdatePasswordPage from '../UpdatePasswordPage';
import AuthCallbackPage from '../AuthCallbackPage';

jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({ confirmPasswordReset: jest.fn(), verifyPasswordResetCode: jest.fn(), getRedirectResult: jest.fn() }));
function mount(page: React.ReactNode) {
  return render(<StrictMode><MemoryRouter><Routes><Route path="/" element={page} />
    <Route path="/dashboard" element={<p>Dashboard destination</p>} /></Routes></MemoryRouter></StrictMode>);
}
beforeEach(() => { jest.resetAllMocks(); sessionStorage.clear(); window.history.replaceState({}, '', '/'); });
it('requires a reset code rather than an existing authenticated session', async () => {
  mount(<UpdatePasswordPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Open the password reset link');
  expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
  expect(confirmPasswordReset).not.toHaveBeenCalled();
});
it('verifies and consumes the reset code using Firebase', async () => {
  window.history.replaceState({}, '', '/update-password?oobCode=one-use');
  jest.mocked(verifyPasswordResetCode).mockResolvedValue('user@example.com');
  jest.mocked(confirmPasswordReset).mockResolvedValue(undefined);
  mount(<UpdatePasswordPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Strong!123' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Strong!123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  await screen.findByText('Your password has been updated. You can now sign in with it.');
  expect(confirmPasswordReset).toHaveBeenCalledWith(expect.anything(), 'one-use', 'Strong!123');
  expect(window.location.search).toBe('');
});
it('expired reset codes keep submission disabled', async () => {
  window.history.replaceState({}, '', '/update-password?oobCode=expired');
  jest.mocked(verifyPasswordResetCode).mockRejectedValue(new Error('expired'));
  mount(<UpdatePasswordPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
  expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
});
it('does not treat an existing session as a completed OAuth callback', async () => {
  jest.mocked(getRedirectResult).mockResolvedValue(null);
  mount(<AuthCallbackPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pending sign-in');
});
it('rejects old magic/PKCE links, even under StrictMode', async () => {
  window.history.replaceState({}, '', '/auth/callback?oobCode=legacy');
  mount(<AuthCallbackPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('no longer supported');
  expect(getRedirectResult).not.toHaveBeenCalled();
});
it('completes an SDK redirect once and returns to a safe local route', async () => {
  window.history.replaceState({}, '', '/auth/callback?next=%2Fdashboard');
  jest.mocked(getRedirectResult).mockResolvedValue({ user: { uid: '1' }, providerId: 'github.com' } as never);
  mount(<AuthCallbackPage />);
  await screen.findByText('Dashboard destination');
  expect(getRedirectResult).toHaveBeenCalledTimes(1);
});
