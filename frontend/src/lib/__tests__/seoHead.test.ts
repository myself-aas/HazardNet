/**
 * @jest-environment jsdom
 */
import { createHeadManager } from '../seoHead'
import { buildSeoHead } from '../blogSeo'
import { BlogArticle } from '../blogArticles'

const article: BlogArticle = {
  id: 'a-1',
  slug: 'sar-guide',
  title: 'SAR Guide',
  excerpt: 'SAR basics for flood mapping.',
  contentHtml: '<p>body</p>',
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  category: 'Remote Sensing',
  tags: ['sar'],
  status: 'published',
  authorId: null,
  authorEmail: 'shuvoasifahmed@gmail.com',
  authorName: 'Ashif',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  publishedAt: '2026-08-01T00:00:00Z',
  metaTitle: 'SAR Guide',
  metaDescription: 'SAR basics for flood mapping.',
  focusKeyword: '',
  canonicalUrl: '',
  ogImageUrl: '',
  robotsNoIndex: false,
  faqs: [],
  authorTitle: '',
  authorBio: '',
  authorAvatarUrl: '',
  authorWebsite: '',
  containsAffiliateLinks: false,
  affiliateDisclosure: '',
}

describe('createHeadManager', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.title = 'HazardNet'
  })

  it('applies title, meta, canonical, OG, twitter and JSON-LD', () => {
    const manager = createHeadManager(document)
    const cleanup = manager.apply(buildSeoHead(article, { origin: 'https://hazardnet.live' }))

    expect(document.title).toMatch(/^SAR Guide \| HazardNet$/)
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'SAR basics for flood mapping.',
    )
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://hazardnet.live/blogs/sar-guide',
    )
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain('SAR Guide')
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://cdn.example.com/cover.jpg',
    )
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    const jsonLd = document.head.querySelector('script[type="application/ld+json"]')
    expect(jsonLd?.textContent).toContain('"@type":"Article"')

    cleanup()
  })

  it('cleans up created tags and restores the previous title', () => {
    const manager = createHeadManager(document)
    const cleanup = manager.apply(buildSeoHead(article, { origin: 'https://hazardnet.live' }))
    cleanup()
    expect(document.title).toBe('HazardNet')
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull()
  })

  it('restores a pre-existing meta description', () => {
    const original = document.createElement('meta')
    original.name = 'description'
    original.content = 'site-wide description'
    document.head.appendChild(original)

    const manager = createHeadManager(document)
    const cleanup = manager.apply(buildSeoHead(article, { origin: 'https://hazardnet.live' }))
    expect(original.getAttribute('content')).not.toBe('site-wide description')
    cleanup()
    expect(original.getAttribute('content')).toBe('site-wide description')
  })
})
