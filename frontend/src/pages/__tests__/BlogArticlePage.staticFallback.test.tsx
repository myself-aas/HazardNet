import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BlogArticlePage } from '../BlogArticlePage'
import { getStaticBlogPostBySlug } from '../../lib/staticBlogPosts'

jest.mock('../../lib/blogArticles', () => ({
  getArticleBySlug: async () => ({ data: null, error: null }),
  readingTimeMinutes: () => 6,
  sanitizeBlogHtml: (html: string) => html,
  DEFAULT_AFFILIATE_DISCLOSURE: '',
}))

jest.mock('../../lib/blogSeo', () => ({
  applyAffiliateRel: (html: string) => html,
  buildSeoHead: () => ({
    title: 't',
    description: '',
    keywords: [],
    canonical: '',
    robots: 'index',
    ogType: 'article',
    ogImage: null,
    publishedTime: null,
    modifiedTime: null,
    authorName: '',
    section: null,
    tags: [],
    jsonLd: null,
  }),
  splitContentBlocks: (html: string) => [html],
}))

jest.mock('../../lib/seoHead', () => ({
  useSeoHead: () => undefined,
}))

jest.mock('../../lib/adsense', () => ({
  ADSENSE_SLOT_ARTICLE_INLINE: '',
  ADSENSE_SLOT_ARTICLE_FOOTER: '',
}))
jest.mock('../../components/blog/ads/BlogAdUnit', () => ({
  AdSenseScript: () => null,
  BlogAdUnit: () => null,
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}))

describe('BlogArticlePage — static editorial posts have unique URLs', () => {
  it('renders a shipped post at /blogs/:slug without a dialog', async () => {
    const post = getStaticBlogPostBySlug('offline-haor-basins-sunamganj')
    expect(post).not.toBeNull()

    render(
      <MemoryRouter initialEntries={['/blogs/offline-haor-basins-sunamganj']}>
        <Routes>
          <Route path="/blogs/:slug" element={<BlogArticlePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(post!.title)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('article-body')).toHaveTextContent(/haor basin/i)
    expect(screen.getByRole('link', { name: /view sunamganj on gis map/i })).toHaveAttribute(
      'href',
      '/?district=sunamganj',
    )
  })
})
