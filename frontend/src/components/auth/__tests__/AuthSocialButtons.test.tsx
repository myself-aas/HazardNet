import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthSocialButtons } from '../AuthSocialButtons'
import { useAuth } from '../../../context/AuthContext'
import { SECONDARY_AFTER_GOOGLE_PROVIDER_IDS, getProvider } from '../../../lib/oauthProviders'

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
    const google = screen.getByRole('button', { name: /connect with google/i })
    expect(google).toHaveAttribute('data-testid', 'connect-google-btn')
  })

  it('shows every other provider as a compact side-by-side icon row', () => {
    render(<AuthSocialButtons />)
    const iconRow = screen.getByTestId('auth-provider-icons')
    SECONDARY_AFTER_GOOGLE_PROVIDER_IDS.forEach((id) => {
      expect(
        iconRow.querySelector(`button[aria-label="Continue with ${getProvider(id).label}"]`),
      ).not.toBeNull()
    })
  })

  it('places Google before the icon row in DOM order', () => {
    render(<AuthSocialButtons />)
    const google = screen.getByTestId('connect-google-btn')
    const iconRow = screen.getByTestId('auth-provider-icons')
    expect(
      google.compareDocumentPosition(iconRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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
    expect(alert.textContent).toMatch(/Supabase dashboard/)
  })

  it('supports a custom Google label (e.g. sign-up)', () => {
    render(<AuthSocialButtons label="Sign up with Google" />)
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument()
  })
})
