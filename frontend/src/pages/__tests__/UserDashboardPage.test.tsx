import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import UserDashboardPage from '../UserDashboardPage'
import { useAuth } from '../../context/AuthContext'

/**
 * Design-system regression cover for /dashboard, the sibling of the /profile suite.
 *
 * The dashboard is where the nesting was worst: a card header whose top half was a black band, a
 * bordered sidebar of tab buttons, a bordered card per section, bordered stat tiles, and a
 * bordered connector grid inside a bordered card. These assertions describe the target state rather
 * than the old one, so they keep holding as the panels change: one card depth, a real tablist, one
 * accent, no severity colour used as chrome, and every control labelled.
 */

jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }))
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../lib/connectors', () => ({
  CONNECTOR_CATALOG: [],
  CONNECTOR_CATEGORIES: [],
  fetchUserConnectors: jest.fn().mockResolvedValue([]),
  saveUserConnector: jest.fn(),
}))
jest.mock('../../services/geolocationService', () => ({
  detectExactPinpointLocation: jest.fn(),
  findNearestDistrict: jest.fn(),
  isValidLatLng: () => false,
  isValidCoordinate: () => false,
  getSeverityTier: () => 'moderate',
}))

const signedIn = (overrides: Record<string, unknown> = {}) => ({
  user: { uid: 'u-1', email: 'a@b.co', displayName: 'Ashif', photoURL: null, providerData: [] },
  userProfile: {
    displayName: 'Ashif',
    username: 'ashif_ahmed',
    email: 'a@b.co',
    userRole: 'smallholder_farmer',
    district: 'Rangpur',
    profileVisibility: 'public',
  },
  loading: false,
  profileStatus: 'ready',
  updateUserProfile: jest.fn(),
  refreshProfile: jest.fn(),
  ensureProfile: jest.fn(),
  fetchUserAssessments: jest.fn().mockResolvedValue([]),
  sendVerificationEmail: jest.fn(),
  signOut: jest.fn(),
  changeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  linkIdentity: jest.fn(),
  unlinkIdentity: jest.fn(),
  checkUsernameAvailability: jest.fn().mockResolvedValue(true),
  ...overrides,
})

const renderDashboard = (path = '/dashboard', overrides: Record<string, unknown> = {}) => {
  ;(useAuth as unknown as jest.Mock).mockReturnValue(signedIn(overrides))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<UserDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('UserDashboardPage — structure', () => {
  it('announces its sections as a real tablist, with one selected tab and a labelled panel', () => {
    renderDashboard()

    const tablist = screen.getByRole('tablist', { name: 'Dashboard sections' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)

    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-label', 'Overview')
  })

  it('starts at h1 and never skips a heading level', () => {
    const { container } = renderDashboard('/dashboard?tab=profile')
    // The page used to hand its section titles to a card that rendered `<h3>`, so the outline ran
    // h1 → h3 with no h2 anywhere.
    const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName[1]),
    )
    expect(levels[0]).toBe(1)
    expect(levels).toContain(2)
    levels.slice(1).forEach((level, i) => {
      expect(level - Math.min(...levels.slice(0, i + 1))).toBeLessThanOrEqual(1)
    })
  })
})

describe('UserDashboardPage — design-system conformance', () => {
  it('keeps one card depth: no card inside a card, nothing boxed inside a panel', () => {
    const { container } = renderDashboard('/dashboard?tab=account')

    const panels = Array.from(container.querySelectorAll<HTMLElement>('.ap-card'))
    expect(panels.length).toBeGreaterThan(0)
    expect(panels.filter((el) => el.parentElement?.closest('.ap-card')).map((el) => el.className)).toEqual([])

    const INTERACTIVE = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'])
    const boxed = panels.flatMap((panel) =>
      Array.from(panel.querySelectorAll<HTMLElement>('[class*="border"]')).filter((el) => {
        if (INTERACTIVE.has(el.tagName)) return false
        const cls = ` ${String(el.className)} `
        return /\sborder(-2|-4)?\s/.test(cls) && cls.includes('bg-white')
      }),
    )
    expect(boxed.map((el) => el.className)).toEqual([])
  })

  it('renders the linked accounts as rows, not as a panel inside a panel', () => {
    const { container } = renderDashboard('/dashboard?tab=account')
    // IdentityConnections used to draw its own bordered, rounded-xl box with its own heading, which
    // is why the dashboard showed a card inside a card on this tab.
    const identity = container.querySelector('[data-testid="linked-identities"]')
    if (identity) {
      const rows = Array.from(identity.querySelectorAll<HTMLElement>('li'))
      expect(rows.every((row) => !/border(-carbon| -)/.test(row.className))).toBe(true)
    }
    expect(container.querySelectorAll('.ap-card .ap-card')).toHaveLength(0)
  })

  it('keeps severity out of the chrome — no amber, rose or emerald accents', () => {
    const { container } = renderDashboard()
    // Attribute-selector prefixes, not substrings: `[class*="rose"]` would match `max-w-prose`.
    const CHROME_ACCENT = [
      'text-amber', 'bg-amber', 'border-amber',
      'text-rose', 'bg-rose', 'border-rose',
      'text-emerald', 'bg-emerald', 'border-emerald',
    ]
      .map((prefix) => `[class*="${prefix}"]`)
      .join(', ')
    const chrome = Array.from(container.querySelectorAll<HTMLElement>(CHROME_ACCENT)).filter(
      (el) => !el.hasAttribute('data-severity-ink'),
    )
    expect(chrome.map((el) => el.className)).toEqual([])
  })

  it('gives every text control in the profile tab a programmatic label', () => {
    const { container } = renderDashboard('/dashboard?tab=profile')
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, textarea'),
    ).filter((el) => !['hidden', 'file'].includes(el.getAttribute('type') ?? ''))

    expect(controls.length).toBeGreaterThan(0)
    const unlabelled = controls.filter((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
      const id = el.getAttribute('id')
      return !id || !container.querySelector(`label[for="${id}"]`)
    })
    expect(unlabelled.map((el) => el.outerHTML.slice(0, 90))).toEqual([])
  })

  it('wears the published control roles: ap-input fields and ap-btn actions', () => {
    const { container } = renderDashboard('/dashboard?tab=profile')
    const fields = Array.from(
      container.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]), select, textarea'),
    )
    expect(fields.filter((el) => /(^|\s)ap-input(\s|$)/.test(el.className)).length).toBeGreaterThan(0)
    // The old square, hairline, hand-padded input is gone.
    expect(
      fields.filter((el) => /rounded-sm/.test(el.className) && /border-carbon-20/.test(el.className)),
    ).toEqual([])
  })
})
