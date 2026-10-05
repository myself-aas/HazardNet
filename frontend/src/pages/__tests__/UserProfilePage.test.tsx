import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserProfilePage } from '../UserProfilePage'
import { useAuth } from '../../context/AuthContext'

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../components/IdentityConnections', () => () => null)
jest.mock('../../components/FirebaseRealtimeStatus', () => ({
  FirebaseRealtimeStatus: () => null,
}))
jest.mock('../../services/geolocationService', () => ({
  detectExactPinpointLocation: jest.fn(),
  findNearestDistrict: jest.fn(),
  isValidLatLng: () => false,
  isValidCoordinate: () => false,
  // The hazard tile colours its severity reading by tier, so the mock has to
  // answer this too — a partial mock of a module the component reads from is
  // how the page ends up throwing only under test.
  getSeverityTier: (severity: number) => (severity >= 0.8 ? 'extreme' : 'moderate'),
}))
jest.mock('../../data/disasterDetails', () => ({
  getGranularDisasterData: () => null,
}))

describe('UserProfilePage — dedicated /profile URL', () => {
  it('redirects signed-out visitors to /login?next=/profile', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({
      user: null,
      userProfile: null,
      loading: false,
      updateUserProfile: jest.fn(),
      signOut: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/login" element={<div data-testid="login-probe" />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('login-probe')).toBeInTheDocument()
    expect(screen.queryByTestId('user-profile-page')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders as a page (not a modal) for a signed-in user', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({
      user: { uid: 'u-1', email: 'a@b.co', displayName: 'Ashif', photoURL: null, providerData: [] },
      userProfile: { displayName: 'Ashif', username: 'ashif_ahmed' },
      loading: false,
      updateUserProfile: jest.fn(),
      signOut: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<UserProfilePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('user-profile-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ashif/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /public page \/u\/ashif_ahmed/i })).toHaveAttribute(
      'href',
      '/u/ashif_ahmed',
    )
  })
})

/**
 * Regression cover for the /profile design-system audit (2026-10-06).
 *
 * The page used to hand-roll the same form that `components/user/dashboard/ui`
 * already renders on /dashboard — a second implementation of one surface. That
 * duplication, not the stray border-radius, is what produced the visible
 * mismatch: unlabelled inputs, a second toggle design, an amber accent on a
 * blue-accent product. These lock the page onto the shared kit.
 */
describe('UserProfilePage — design-system conformance', () => {
  const signIn = () =>
    (useAuth as unknown as jest.Mock).mockReturnValue({
      user: { uid: 'u-1', email: 'a@b.co', displayName: 'Ashif', photoURL: null, providerData: [] },
      userProfile: { displayName: 'Ashif', username: 'ashif_ahmed' },
      loading: false,
      updateUserProfile: jest.fn(),
      signOut: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    })

  const renderPage = () => {
    signIn()
    return render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<UserProfilePage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('gives every text control a programmatic label', () => {
    const { container } = renderPage()
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, textarea'),
    ).filter((el) => el.getAttribute('type') !== 'hidden')

    expect(controls.length).toBeGreaterThan(0)

    const unlabelled = controls.filter((el) => {
      // an aria-label is an acceptable alternative to a visible <label for>
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
      const id = el.getAttribute('id')
      return !id || !container.querySelector(`label[for="${id}"]`)
    })

    expect(unlabelled.map((el) => el.outerHTML.slice(0, 90))).toEqual([])
  })

  it('exposes its sections as landmarks with no skipped heading levels', () => {
    const { container } = renderPage()

    // h1 -> h4 used to skip two levels, so screen-reader outline mode showed
    // the settings groups as sub-sub-items of nothing.
    const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName[1]),
    )
    expect(levels[0]).toBe(1)
    levels.slice(1).forEach((level, i) => {
      expect(level - Math.min(...levels.slice(0, i + 1))).toBeLessThanOrEqual(1)
    })
  })

  it('keeps the single blue accent — no amber chrome', () => {
    const { container } = renderPage()
    // Severity keeps its hue: it is a documented data encoding, not chrome,
    // and it is always paired with a label and a number (WCAG 1.4.1).
    const amber = Array.from(container.querySelectorAll<HTMLElement>('[class*="amber"]')).filter(
      (el) => !el.hasAttribute('data-severity-ink'),
    )
    expect(amber.map((el) => el.className)).toEqual([])
  })

  it('uses one radius language: square panels, pill badges', () => {
    const { container } = renderPage()
    // Form controls are rounded-sm product-wide (see dashboard/ui inputClass
    // and LoginPage); panels and buttons are square. The bug was panels that
    // disagreed with each other, which read as two design systems on one page.
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="border-carbon-20"]'),
    ).filter((el) => !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
    const rounded = panels.filter(
      (el) => /\brounded(-sm|-md|-lg|-xl)?\b/.test(el.className) && !/rounded-full/.test(el.className),
    )
    expect(rounded.map((el) => el.className)).toEqual([])
  })
})
