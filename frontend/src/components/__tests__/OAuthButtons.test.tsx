import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OAuthButtons } from '../OAuthButtons'
import { useAuth } from '../../context/AuthContext'
import { PRIMARY_PROVIDER_IDS, SECONDARY_PROVIDER_IDS, getProvider } from '../../lib/oauthProviders'

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithOAuth = jest.fn()

const labelButton = (label: string) =>
  screen.getByRole('button', { name: new RegExp(label.replace(/[()]/g, '\\$&'), 'i') })

describe('OAuthButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as unknown as jest.Mock).mockReturnValue({ signInWithOAuth })
  })

  it('renders all seven requested providers with brand buttons', () => {
    render(<OAuthButtons />)
    PRIMARY_PROVIDER_IDS.forEach((id) => {
      expect(labelButton(getProvider(id).label)).toBeInTheDocument()
    })
  })

  it('hides secondary providers until "More sign-in options" is opened', async () => {
    render(<OAuthButtons />)
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /more sign-in options/i }))
    const google = await screen.findByRole('button', { name: /google/i })
    expect(google).toBeInTheDocument()
    SECONDARY_PROVIDER_IDS.forEach((id) => {
      expect(labelButton(getProvider(id).label)).toBeInTheDocument()
    })
  })

  it('starts the OAuth flow for the clicked provider', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    render(<OAuthButtons />)
    fireEvent.click(screen.getByRole('button', { name: /linkedin/i }))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith('linkedin'))
  })

  it('shows actionable guidance when a provider is not enabled', async () => {
    signInWithOAuth.mockRejectedValue(new Error('Unsupported provider: provider is not enabled'))
    render(<OAuthButtons />)
    fireEvent.click(screen.getByRole('button', { name: /discord/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Provider not enabled/)
    expect(alert.textContent).toMatch(/Supabase dashboard/)
    // Buttons re-enable after a failure so the user can retry another provider.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /slack/i })).not.toBeDisabled(),
    )
  })
})
