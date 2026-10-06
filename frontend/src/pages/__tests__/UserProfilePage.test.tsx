import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserProfilePage } from '../UserProfilePage'
import { useAuth } from '../../context/AuthContext'

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

// The editor imports the avatar field, which imports the shared Firebase client; jsdom cannot
// parse `import.meta.env`, so the client is stubbed the same way AuthPages.test.tsx does it.
jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }))
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

const signedIn = (overrides: Record<string, unknown> = {}) => ({
  user: { uid: 'u-1', email: 'a@b.co', displayName: 'Ashif', photoURL: null, providerData: [] },
  userProfile: { displayName: 'Ashif', username: 'ashif_ahmed' },
  loading: false,
  updateUserProfile: jest.fn(),
  refreshProfile: jest.fn(),
  signOut: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  checkUsernameAvailability: jest.fn().mockResolvedValue(true),
  ...overrides,
})

const renderPage = (overrides: Record<string, unknown> = {}) => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue(signedIn(overrides))
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

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
    renderPage()

    expect(screen.getByTestId('user-profile-page')).toBeInTheDocument()
    // Both the page header (h1) and the public card (h2) name the account.
    expect(screen.getByRole('heading', { level: 1, name: /ashif/i })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /ashif/i }).length).toBeGreaterThan(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /public page/i })).toHaveAttribute(
      'href',
      '/u/ashif_ahmed',
    )
  })
})

/**
 * Regression cover for the /profile design-system work of 2026-10-06.
 *
 * The page used to be a second implementation of the editor that /dashboard already rendered: its
 * own hand-rolled square inputs, its own switch, its own amber chrome, a panel inside a card inside
 * a page, and two controls for each of signing out and going to the dashboard. These lock it onto
 * the shared kit (`components/user/dashboard/ui`) and onto one card depth.
 *
 * A note on why the old radius assertion is gone rather than kept: it selected
 * `[class*="border-carbon-20"]` and required no `rounded-*` on any non-control. Moving the panels to
 * `.ap-card` — the system's own card — would have made that pass vacuously, because the panels no
 * longer carry `border-carbon-20` at all. A green run on a selector that matches nothing is not
 * evidence, so the panel assertions below target the card role and the nesting directly.
 */
describe('UserProfilePage — design-system conformance', () => {
  it('gives every text control a programmatic label', () => {
    const { container } = renderPage()
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, textarea'),
    ).filter((el) => !['hidden', 'file'].includes(el.getAttribute('type') ?? ''))

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
    const amber = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="text-amber"], [class*="bg-amber"], [class*="border-amber"]'),
    ).filter(
      (el) => !el.hasAttribute('data-severity-ink'),
    )
    expect(amber.map((el) => el.className)).toEqual([])
  })

  it('keeps every panel at one card depth, with nothing boxed inside it', () => {
    const { container } = renderPage()

    const panels = Array.from(container.querySelectorAll<HTMLElement>('.ap-card'))
    expect(panels.length).toBeGreaterThan(0)

    // A card inside a card is the nesting this pass removed, and a panel that is
    // not named by a heading is a group a screen reader cannot announce.
    expect(panels.filter((el) => el.parentElement?.closest('.ap-card')).map((el) => el.className)).toEqual([])
    expect(
      panels.filter((el) => !el.getAttribute('aria-labelledby') && !el.querySelector('h2')).length,
    ).toBe(0)

    // Inside a panel the only bordered elements are controls (a button, an input
    // with its own hairline) or a single-edge divider. A bordered, filled box in
    // there is the panel-in-a-panel that made this surface read as nested cards.
    const INTERACTIVE = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'])
    const boxed = panels.flatMap((panel) =>
      Array.from(panel.querySelectorAll<HTMLElement>('[class*="border"]')).filter((el) => {
        if (INTERACTIVE.has(el.tagName)) return false
        const cls = ` ${String(el.className)} `
        const allSides = /\sborder(-2|-4)?\s/.test(cls)
        return allSides && cls.includes('bg-white')
      }),
    )
    expect(boxed.map((el) => el.className)).toEqual([])
  })

  it('uses the published input role — no hand-rolled square fields left', () => {
    const { container } = renderPage()
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, textarea'),
    ).filter((el) => !['hidden', 'file'].includes(el.getAttribute('type') ?? ''))

    expect(controls.length).toBeGreaterThan(0)
    const legacy = controls.filter(
      (el) => /rounded-sm/.test(el.className) && /border-carbon-20/.test(el.className),
    )
    expect(legacy.map((el) => el.outerHTML.slice(0, 90))).toEqual([])
    expect(controls.filter((el) => /(^|\s)ap-input(\s|$)/.test(el.className)).length).toBeGreaterThan(0)
  })

  it('offers one sign-out and one way back to the dashboard', () => {
    renderPage()
    // There were two of each: one inside the security panel and one in the
    // action footer, one panel link and one footer button.
    expect(screen.getAllByRole('button', { name: /sign out/i })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /^dashboard$/i })).toHaveLength(1)
  })
})
