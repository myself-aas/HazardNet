import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoginPage from '../LoginPage'
import SignUpPage, { scorePassword } from '../SignUpPage'

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const signInWithEmail = jest.fn()
const signUpWithEmail = jest.fn()
const signInWithOAuth = jest.fn()

const mockAuth = () => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue({
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
  })
}

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/" element={<div data-testid="home-probe" />} />
      </Routes>
    </MemoryRouter>,
  )

describe('LoginPage — dedicated /login page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth()
  })

  it('renders the sign-in form, social providers and page links', () => {
    mount('/login')
    expect(screen.getByRole('heading', { name: /sign in to hazardnet/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with linkedin/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup')
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
})

describe('SignUpPage — dedicated /signup page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth()
  })

  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.click(screen.getByLabelText(/i agree to the/i))
  }

  it('renders the sign-up form with persona selection and terms consent', () => {
    mount('/signup')
    expect(screen.getByRole('heading', { name: /create your hazardnet account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/i am a…/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/i agree to the/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login')
  })

  it('blocks submission on mismatched passwords and missing consent', async () => {
    mount('/signup')
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ashif Ahmed' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ng!pass' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/passwords don’t match/i)).toBeInTheDocument()
    expect(screen.getByText(/please accept the terms/i)).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('navigates home after a session-backed sign-up', async () => {
    signUpWithEmail.mockResolvedValue('session')
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByTestId('home-probe')).toBeInTheDocument()
    expect(signUpWithEmail).toHaveBeenCalledWith('a@b.co', 'Str0ng!pass', 'Ashif Ahmed', {
      userRole: 'smallholder_farmer',
    })
  })

  it('shows the email-confirmation state when confirmation is required', async () => {
    signUpWithEmail.mockResolvedValue('confirmation-required')
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByTestId('signup-confirmation')).toHaveTextContent(/a@b.co/i)
    expect(screen.queryByTestId('home-probe')).not.toBeInTheDocument()
  })

  it('maps "already registered" to a sign-in hint', async () => {
    signUpWithEmail.mockRejectedValue(new Error('User already registered'))
    mount('/signup')
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already exists/i)
    expect(within(alert).getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThanOrEqual(2)
  })
})

describe('scorePassword', () => {
  it('scores password strength 0–4', () => {
    expect(scorePassword('')).toBe(0)
    expect(scorePassword('short')).toBe(0)
    expect(scorePassword('longenough1')).toBeGreaterThanOrEqual(2)
    expect(scorePassword('Longenough1!')).toBe(4)
  })
})
