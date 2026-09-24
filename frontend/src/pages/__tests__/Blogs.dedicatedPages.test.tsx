import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Blogs } from '../Blogs'

jest.mock('../../lib/blogArticles', () => ({
  listPublishedArticles: async () => ({ data: [], error: null, localDemo: true }),
  readingTimeMinutes: () => 5,
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

describe('Blogs index — dedicated article URLs, no popups', () => {
  it('renders the article listing without dialogs and without bundled editorial cards', () => {
    render(
      <MemoryRouter>
        <Blogs />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()
    // No bundled editorial posts: articles come from the live store only.
    expect(document.querySelectorAll('[data-testid^="blog-card-"]').length).toBe(0)
  })
})
