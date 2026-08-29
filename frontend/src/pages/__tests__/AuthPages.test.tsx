import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoginPage from '../LoginPage'
import SignUpPage from '../SignUpPage'
import SetPasswordPage from '../SetPasswordPage'

// SetPasswordPage reads the real Supabase client (import.meta.env is
// unavailable under the CJS jest transform); stub the module.
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  isSupabaseConfigured: false,
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithEmail = jest.fn()
const sendVerificationEmail = jest.fn()
const updatePassword = jest.fn()
const signInWithOAuth = jest.fn()
const checkUsernameAvailability = jest.fn()

const mockAuth = (overrides: Record<string, unknown> = {}) => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue({
    user: null,
    userProfile: null,
    signInWithEmail,
    signUpWithEmail: jest.fn(),
    sendVerificationEmail,
    signInWithOAuth,
    updatePassword,
    checkUsernameAvailability,
    ...overrides,
  })
  checkUsernameAvailability.mockResolvedValue(true)
}

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/" element={<div data-testid="home-probe" />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-probe" />} />
      </Routes>
    </MemoryRouter>,
  )

const orderOf = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('LoginPage — dedicated /login page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth()
  })

  it('renders the sign-in form, Google-first social block and page links', () => {
    mount('/login')
    expect(screen.getByRole('heading', { name: /sign in to hazardnet/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByTestId('connect-google-btn')).toBeInTheDocument()
    expect(screen.getByTestId('auth-provider-icons')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup')
  })

  it('orders fields per spec: email → password → Google → provider icons → email submit', () => {
    const { container } = mount('/login')
    const email = screen.getByLabelText(/email address/i)
    const password = screen.getByLabelText(/^password/i)
    const google = screen.getByTestId('connect-google-btn')
    const icons = screen.getByTestId('auth-provider-icons')
    const submit = screen.getByRole('button', { name: /^sign in$/i })
    expect(orderOf(email, password)).toBe(true)
    expect(orderOf(password, google)).toBe(true)
    expect(orderOf(google, icons)).toBe(true)
    expect(orderOf(icons, submit)).toBe(true)
  })

  it('preserves the ?next destination in the sign-up link', () => {
    mount('/login?next=/advisories')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/signup?next=%2Fadvisories',
    )
  })

  it('shows a friendly message for invalid credentials', async () => {
    signInWithEmail.mockRejectedValue(new Error('Invalid login credentials'))
    mount('/login')
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn’t match/i)
  })

  it('navigates home after a successful email sign-in', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    mount('/login')
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'correct-horse' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByTestId('home-probe')).toBeInTheDocument()
  })

  it('starts the Google flow when Connect with Google is clicked', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    mount('/login')
    fireEvent.click(screen.getByTestId('connect-google-btn'))
    await screen.findByTestId('connect-google-btn')
    expect(signInWithOAuth).toHaveBeenCalledWith('google')
  })
})

describe('SignUpPage — verification-link flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth()
    sessionStorage.clear()
  })

  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ashif_ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByLabelText(/i agree to the/i))
  }

  it('renders the sign-up form with username field, Google-first socials and terms', () => {
    mount('/signup')
    expect(screen.getByRole('heading', { name: /create your hazardnet account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByTestId('username-field')).toBeInTheDocument()
    expect(screen.getByLabelText(/i agree to the/i)).toBeInTheDocument()
    expect(screen.getByTestId('connect-google-btn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login')
  })

  it('places Google before the email submit button', () => {
    const { container } = mount('/signup')
    const google = screen.getByTestId('connect-google-btn')
    const submit = screen.getByRole('button', { name: /create account/i })
    expect(orderOf(google, submit)).toBe(true)
  })

  it('sanitizes the username while typing (lowercase, letters/digits/underscore only)', () => {
    mount('/signup')
    const usernameInput = screen.getByLabelText(/username/i)
    fireEvent.change(usernameInput, { target: { value: 'Ashif Ahmed!92' } })
    expect((usernameInput as HTMLInputElement).value).toBe('ashifahmed92')
    fireEvent.change(usernameInput, { target: { value: 'ok@User__' } })
    expect((usernameInput as HTMLInputElement).value).toBe('okuser__')
  })

  it('blocks submission without consent and does not send verification', async () => {
    mount('/signup')
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ashif_ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/please accept the terms/i)).toBeInTheDocument()
    expect(sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('sends a verification link and shows the check-your-inbox state', async () => {
    sendVerificationEmail.mockResolvedValue(undefined)
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByTestId('signup-verification-sent')).toBeInTheDocument()
    expect(sendVerificationEmail).toHaveBeenCalledWith('a@b.co', {
      nextTo: '/set-password',
      displayName: 'Ashif Ahmed',
      username: 'ashif_ahmed',
    })
    expect(screen.getByText(/a@b\.co/i)).toBeInTheDocument()
  })

  it('surfaces errors when the verification email cannot be sent', async () => {
    sendVerificationEmail.mockRejectedValue(new Error('already registered'))
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })
})

describe('SetPasswordPage — password setup after email verification', () => {
  const verifiedUser = { id: 'u-1', email: 'a@b.co', email_confirmed_at: new Date().toISOString() }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth({ user: verifiedUser })
  })

  it('renders the password setup form with a strength checklist', async () => {
    mount('/set-password')
    expect(await screen.findByTestId('set-password-form')).toBeInTheDocument()
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/at least one number/i)).toBeInTheDocument()
  })

  it('rejects mismatched passwords without calling updatePassword', async () => {
    mount('/set-password')
    const form = await screen.findByTestId('set-password-form')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different1!' } })
    fireEvent.click(within(form).getByRole('button', { name: /save password/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('saves the password and routes to the dashboard', async () => {
    updatePassword.mockResolvedValue(undefined)
    mount('/set-password')
    const form = await screen.findByTestId('set-password-form')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.click(within(form).getByRole('button', { name: /save password/i }))
    expect(await screen.findByTestId('set-password-done')).toBeInTheDocument()
    expect(updatePassword).toHaveBeenCalledWith('Str0ng!pass')
  })
})
