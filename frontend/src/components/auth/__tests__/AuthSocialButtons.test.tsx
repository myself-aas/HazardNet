import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthSocialButtons } from '../AuthSocialButtons'
import { useAuth } from '../../../context/AuthContext'
import { SUPPORTED_PROVIDER_IDS } from '../../../lib/oauthProviders'

jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithOAuth = jest.fn()

describe('AuthSocialButtons — Google + GitHub social sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as unknown as jest.Mock).mockReturnValue({ signInWithOAuth })
  })

  it('renders a button for each enabled provider and nothing else', () => {
    render(<AuthSocialButtons />)
    expect(screen.getByTestId('connect-google-btn')).toBeInTheDocument()
    expect(screen.getByTestId('connect-github-btn')).toBeInTheDocument()
    expect(SUPPORTED_PROVIDER_IDS).toEqual(['google', 'github'])
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
  })

  it('places Google before GitHub in DOM order', () => {
    render(<AuthSocialButtons />)
    const google = screen.getByTestId('connect-google-btn')
    const github = screen.getByTestId('connect-github-btn')
    expect(
      google.compareDocumentPosition(github) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('starts the Google OAuth flow when clicked', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    render(<AuthSocialButtons />)
    fireEvent.click(screen.getByTestId('connect-google-btn'))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith('google'))
  })

  it('starts the GitHub OAuth flow when clicked', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    render(<AuthSocialButtons />)
    fireEvent.click(screen.getByTestId('connect-github-btn'))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith('github'))
  })

  it('surfaces actionable guidance when a provider is not enabled', async () => {
    signInWithOAuth.mockRejectedValue(new Error('OPERATION_NOT_ALLOWED: identity provider not enabled'))
    render(<AuthSocialButtons />)
    fireEvent.click(screen.getByRole('button', { name: /continue with github/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Provider not enabled/)
    expect(alert.textContent).toMatch(/Firebase console/)
  })

  it('supports a custom Google label (e.g. sign-up)', () => {
    render(<AuthSocialButtons googleLabel="Sign up with Google" />)
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument()
  })
})
