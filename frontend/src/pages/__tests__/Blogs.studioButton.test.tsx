import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Blogs } from '../Blogs'
import { useAuth } from '../../context/AuthContext'

// The blog data layer talks to Firestore/localStorage; stub it for the
// gating tests (studio articles list is irrelevant here).
jest.mock('../../lib/blogArticles', () => ({
  listPublishedArticles: async () => ({ data: [], error: null, localDemo: true }),
  readingTimeMinutes: () => 5,
}))

// Stub auth so the studio-button gating can be exercised as any role.
jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const SUPERADMIN_EMAIL = 'shuvoasifahmed@gmail.com'

const mountBlogs = () =>
  render(
    <MemoryRouter>
      <Blogs />
    </MemoryRouter>,
  )

describe('Blogs page — Blog Studio button visibility', () => {
  it('is hidden by default for signed-out visitors', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({ user: null, loading: false })
    mountBlogs()
    expect(screen.queryByTestId('blog-studio-btn')).not.toBeInTheDocument()
    expect(screen.queryByText(/blog studio — write & manage articles/i)).not.toBeInTheDocument()
  })

  it('stays hidden while the auth session is loading', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({ user: null, loading: true })
    mountBlogs()
    expect(screen.queryByTestId('blog-studio-btn')).not.toBeInTheDocument()
  })

  it('is hidden for regular signed-in users', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({
      user: { uid: 'u-9', email: 'farmer@example.com', displayName: 'Regular User' },
      loading: false,
    })
    mountBlogs()
    expect(screen.queryByTestId('blog-studio-btn')).not.toBeInTheDocument()
  })

  it('appears only for the three primary superadmins', () => {
    for (const email of [
      SUPERADMIN_EMAIL,
      'shuvo.1807016@bau.edu.bd',
      'asifahmedshuvo.aas@gmail.com',
    ]) {
      ;(useAuth as unknown as jest.Mock).mockReturnValue({
        user: { uid: 'u-1', email, displayName: 'Super Admin' },
        loading: false,
      })
      const { unmount } = mountBlogs()
      expect(screen.getByTestId('blog-studio-btn')).toHaveTextContent(/blog studio — write & manage articles/i)
      unmount()
    }
  })

  it('matches superadmin emails case-insensitively', () => {
    ;(useAuth as unknown as jest.Mock).mockReturnValue({
      user: { uid: 'u-1', email: '  ShuvoAsifAhmed@GMAIL.com ', displayName: 'X' },
      loading: false,
    })
    mountBlogs()
    expect(screen.getByTestId('blog-studio-btn')).toBeInTheDocument()
  })
})
