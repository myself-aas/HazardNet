import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Blogs } from '../Blogs'
import { STATIC_BLOG_POSTS } from '../../lib/staticBlogPosts'

jest.mock('../../lib/blogArticles', () => ({
  listPublishedArticles: async () => ({ data: [], error: null, localDemo: true }),
  readingTimeMinutes: () => 5,
}))

jest.mock('../../lib/adsense', () => ({
  ADSENSE_CLIENT: '',
  ADSENSE_SLOT_BLOG_INDEX: '',
  ADSENSE_SLOT_ARTICLE_INLINE: '',
  ADSENSE_SLOT_ARTICLE_FOOTER: '',
  isAdSenseConfigured: false,
  isAdSenseDevMode: false,
  requestAdFill: jest.fn(),
  injectAdSenseScript: () => null,
}))
jest.mock('../../components/blog/ads/BlogAdUnit', () => ({
  AdSenseScript: () => null,
  BlogAdUnit: () => null,
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

describe('Blogs index — dedicated article URLs, no popups', () => {
  it('links every editorial post to /blogs/:slug and never opens a dialog', () => {
    render(
      <MemoryRouter>
        <Blogs />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()

    STATIC_BLOG_POSTS.forEach((post) => {
      const card = screen.getByTestId(`blog-card-${post.slug}`)
      expect(card).toHaveAttribute('href', `/blogs/${post.slug}`)
      expect(card).toHaveTextContent(post.title)
    })
  })
})
