import { BlogArticle } from '../blogArticles'
import {
  buildBlogIndexHead,
  buildSeoHead,
  effectiveMetaDescription,
  effectiveMetaTitle,
  seoScore,
  splitContentBlocks,
} from '../blogSeo'

const article = (overrides: Partial<BlogArticle> = {}): BlogArticle => ({
  id: 'a-1',
  slug: 'satellite-flood-forecasting',
  title: 'Satellite Flood Forecasting in Bangladesh',
  excerpt: 'How satellite powers 7-day flood outlooks for the Jamuna basin.',
  contentHtml:
    '<p>Satellite flood forecasting saves crops. ' +
    'word '.repeat(650) +
    '</p><h2>Methods</h2><p>More detail <a href="/blogs/other">internal</a> <a href="https://example.org">external</a>.</p><h3>Validation</h3><img src="x.jpg" alt="chart">',
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  category: 'Remote Sensing',
  tags: ['flood', 'sar'],
  status: 'published',
  authorId: 'u1',
  authorEmail: 'shuvoasifahmed@gmail.com',
  authorName: 'Ashif Ahmed Shuvo',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  publishedAt: '2026-08-01T00:00:00Z',
  metaTitle: 'Satellite Flood Forecasting in Bangladesh — satellite Guide',
  metaDescription:
    'How satellite signal powers 7-day flood outlooks for the Jamuna basin, with severity thresholds and field validation across Gaibandha districts.',
  focusKeyword: 'flood forecasting',
  canonicalUrl: '',
  ogImageUrl: '',
  robotsNoIndex: false,
  faqs: [{ question: 'How accurate is it?', answer: 'MAE 0.038 on severity.' }],
  authorTitle: 'Remote Sensing Lead',
  authorBio: 'Leads HazardNet field validation.',
  authorAvatarUrl: 'https://cdn.example.com/author.jpg',
  authorWebsite: 'https://linkedin.com/in/example',
  ...overrides,
})

describe('effectiveMeta* fallbacks', () => {
  it('falls back to title/excerpt and truncates', () => {
    const bare = article({ metaTitle: '', metaDescription: '' })
    expect(effectiveMetaTitle(bare)).toBe(bare.title)
    expect(effectiveMetaDescription(bare)).toBe(bare.excerpt)

    const long = article({ metaTitle: 'x'.repeat(80) })
    expect(effectiveMetaTitle(long).length).toBeLessThanOrEqual(60)
  })
})

describe('buildSeoHead', () => {
  it('builds the full head payload with Article + FAQ JSON-LD', () => {
    const head = buildSeoHead(article(), { origin: 'https://hazardnet.live' })
    expect(head.title).toContain('Satellite Flood Forecasting')
    expect(head.title.endsWith('| HazardNet')).toBe(true)
    expect(head.robots).toBe('index, follow')
    expect(head.canonical).toBe('https://hazardnet.live/blogs/satellite-flood-forecasting')
    expect(head.ogImage).toBe('https://cdn.example.com/cover.jpg')
    expect(head.publishedTime).toBe('2026-08-01T00:00:00.000Z')

    const graph = (head.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph']
    const types = graph.map((node) => node['@type'])
    expect(types).toContain('Article')
    expect(types).toContain('FAQPage')

    const faq = graph.find((node) => node['@type'] === 'FAQPage') as { mainEntity: unknown[] }
    expect(faq.mainEntity).toHaveLength(1)
  })

  it('honours canonical override, og image and noindex', () => {
    const head = buildSeoHead(
      article({
        canonicalUrl: 'https://syndicated.example/post/1',
        ogImageUrl: 'https://cdn.example.com/og.png',
        robotsNoIndex: true,
      }),
      { origin: 'https://hazardnet.live' },
    )
    expect(head.canonical).toBe('https://syndicated.example/post/1')
    expect(head.ogImage).toBe('https://cdn.example.com/og.png')
    expect(head.robots).toBe('noindex, follow')
  })

  it('skips FAQPage schema when no FAQs exist', () => {
    const head = buildSeoHead(article({ faqs: [] }))
    const graph = (head.jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph']
    expect(graph.map((node) => node['@type'])).not.toContain('FAQPage')
  })

  it('builds the blog index head', () => {
    const head = buildBlogIndexHead({ origin: 'https://hazardnet.live' })
    expect(head.canonical).toBe('https://hazardnet.live/blogs')
    expect(head.ogType).toBe('website')
    expect(head.jsonLd).toMatchObject({ '@type': 'Blog' })
  })
})

describe('seoScore', () => {
  it('scores a fully optimized article highly', () => {
    const result = seoScore(article())
    expect(result.wordCount).toBeGreaterThan(600)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.checks.every((check) => check.passed || ['image-alt'].includes(check.id))).toBe(true)
  })

  it('fails the keyword checks when the focus keyword is missing', () => {
    const result = seoScore(article({ focusKeyword: 'drought', contentHtml: '<p>short</p>' }))
    const keywordChecks = result.checks.filter((check) => ['title-keyword', 'keyword-early', 'slug-keyword'].includes(check.id))
    expect(keywordChecks.every((check) => !check.passed)).toBe(true)
    expect(result.score).toBeLessThan(50)
  })

  it('detects subheadings, links and alt text', () => {
    const result = seoScore(article())
    expect(result.checks.find((check) => check.id === 'subheadings')?.passed).toBe(true)
    expect(result.checks.find((check) => check.id === 'internal-links')?.passed).toBe(true)
    expect(result.checks.find((check) => check.id === 'external-links')?.passed).toBe(true)
    expect(result.checks.find((check) => check.id === 'image-alt')?.passed).toBe(true)
  })
})

describe('splitContentBlocks', () => {
  it('splits sanitized html into top-level blocks', () => {
    const blocks = splitContentBlocks('<p>one</p><h2>head</h2><ul><li>x</li></ul>')
    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toMatch(/<h2>/)
  })

  it('returns the raw html when DOM parsing is unavailable', () => {
    expect(splitContentBlocks('')).toEqual([])
  })
})

