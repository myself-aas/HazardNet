import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoginPage from '../LoginPage'
import SignUpPage from '../SignUpPage'
import SetPasswordPage from '../SetPasswordPage'

jest.mock('../../services/firebase', () => ({
  auth: {},
  db: {},
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithEmail = jest.fn()
const signUpWithEmail = jest.fn()
const updatePassword = jest.fn()
const signInWithOAuth = jest.fn()
const checkUsernameAvailability = jest.fn()

const mockAuth = (overrides: Record<string, unknown> = {}) => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue({
    user: null,
    userProfile: null,
    signInWithEmail,
    signUpWithEmail,
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

  it('renders the sign-in form, Google + GitHub buttons and page links', () => {
    mount('/login')
    expect(screen.getByRole('heading', { name: /sign in to hazardnet/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByTestId('connect-google-btn')).toBeInTheDocument()
    expect(screen.getByTestId('connect-github-btn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup')
  })

  it('orders fields per spec: email → password → sign in → social options', () => {
    const { container } = mount('/login')
    const email = screen.getByLabelText(/email address/i)
    const password = screen.getByLabelText(/^password/i)
    const submit = screen.getByRole('button', { name: /^sign in with email$/i })
    const google = screen.getByTestId('connect-google-btn')
    expect(orderOf(email, password)).toBe(true)
    expect(orderOf(password, submit)).toBe(true)
    expect(orderOf(submit, google)).toBe(true)
    void container
  })

  it('shows only Google and GitHub as social options', () => {
    mount('/login')
    expect(screen.queryByRole('button', { name: /orcid/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /linkedin/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apple/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /microsoft/i })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^sign in with email$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn’t match/i)
  })

  it('navigates home after a successful email sign-in', async () => {
    signInWithEmail.mockResolvedValue(undefined)
    mount('/login')
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'correct-horse' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in with email$/i }))
    expect(await screen.findByTestId('home-probe')).toBeInTheDocument()
  })

  it('starts the Google flow when Continue with Google is clicked', async () => {
    signInWithOAuth.mockResolvedValue(undefined)
    mount('/login')
    fireEvent.click(screen.getByTestId('connect-google-btn'))
    await screen.findByTestId('connect-google-btn')
    expect(signInWithOAuth).toHaveBeenCalledWith('google')
  })
})

describe('SignUpPage — email/password account creation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth()
    sessionStorage.clear()
  })

  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ashif_ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.click(screen.getByLabelText(/i agree to the/i))
  }

  it('renders the sign-up form with username, password, Google/GitHub and terms', () => {
    mount('/signup')
    expect(screen.getByRole('heading', { name: /create your hazardnet account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByTestId('username-field')).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/i agree to the/i)).toBeInTheDocument()
    expect(screen.getByTestId('connect-google-btn')).toBeInTheDocument()
    expect(screen.getByTestId('connect-github-btn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login')
  })

  it('shows only Google and GitHub as social options', () => {
    mount('/signup')
    expect(screen.queryByRole('button', { name: /orcid/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /linkedin/i })).not.toBeInTheDocument()
  })

  it('sanitizes the username while typing (lowercase, letters/digits/underscore only)', () => {
    mount('/signup')
    const usernameInput = screen.getByLabelText(/username/i)
    fireEvent.change(usernameInput, { target: { value: 'Ashif Ahmed!92' } })
    expect((usernameInput as HTMLInputElement).value).toBe('ashifahmed92')
    fireEvent.change(usernameInput, { target: { value: 'ok@User__' } })
    expect((usernameInput as HTMLInputElement).value).toBe('okuser__')
  })

  it('blocks submission without consent and does not create an account', async () => {
    mount('/signup')
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'ashif_ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.click(screen.getByRole('button', { name: /create my account/i }))
    expect(await screen.findByText(/please accept the terms/i)).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('creates the account and navigates home', async () => {
    signUpWithEmail.mockResolvedValue('session')
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create my account/i }))
    expect(await screen.findByTestId('home-probe')).toBeInTheDocument()
    expect(signUpWithEmail).toHaveBeenCalledWith('a@b.co', 'Str0ng!pass', 'Ashif Ahmed', {
      username: 'ashif_ahmed',
    })
  })

  it('surfaces errors when sign-up fails', async () => {
    signUpWithEmail.mockRejectedValue(new Error('Account already exists'))
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create my account/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })
})

describe('SetPasswordPage — password setup', () => {
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
