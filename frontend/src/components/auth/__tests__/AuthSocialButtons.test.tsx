import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthSocialButtons } from '../AuthSocialButtons'
import { useAuth } from '../../../context/AuthContext'

jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithOAuth = jest.fn()

describe('AuthSocialButtons — Google-first social sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as unknown as jest.Mock).mockReturnValue({ signInWithOAuth })
  })

  it('renders the prominent Connect-with-Google button first', () => {
    render(<AuthSocialButtons />)
    const google = screen.getByRole('button', { name: /continue with google/i })
    expect(google).toHaveAttribute('data-testid', 'connect-google-btn')
  })

  it('renders exactly two full-width social buttons, in policy order', () => {
    render(<AuthSocialButtons />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Continue with Google', 'Continue with GitHub']);
  })

  it('disables all sign-in methods when consent/submission is pending', () => {
    render(<AuthSocialButtons disabled />)
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    fireEvent.click(screen.getByTestId('connect-github-btn'));
    expect(signInWithOAuth).not.toHaveBeenCalled();
  })

  it('starts the Google OAuth flow when clicked', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    render(<AuthSocialButtons />)
    fireEvent.click(screen.getByTestId('connect-google-btn'))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith('google'))
  })

  it('surfaces actionable guidance when a provider is not enabled', async () => {
    signInWithOAuth.mockRejectedValue(new Error('Provider is not enabled'))
    render(<AuthSocialButtons />)
    fireEvent.click(screen.getByRole('button', { name: /continue with github/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Provider not enabled/)
    expect(alert.textContent).toMatch(/Firebase dashboard/)
  })

  it('supports a custom Google label (e.g. sign-up)', () => {
    render(<AuthSocialButtons label="Sign up with Google" />)
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument()
  })
})
