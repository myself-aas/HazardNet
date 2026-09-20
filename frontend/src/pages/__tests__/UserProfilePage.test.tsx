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
