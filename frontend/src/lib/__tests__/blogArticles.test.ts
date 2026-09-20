jest.mock('../../services/firebase', () => ({
  db: {},
}))

import {
  BlogArticle,
  createArticle,
  deleteArticle,
  ensureUniqueSlug,
  getArticleBySlug,
  listArticles,
  listPublishedArticles,
  readingTimeMinutes,
  sanitizeBlogHtml,
  slugify,
  updateArticle,
  wordCount,
} from '../blogArticles';
import { isPrimarySuperAdmin, primarySuperAdminEmails } from '../superadmins';

const SUPER = { id: 'uid-1', email: 'shuvoasifahmed@gmail.com', name: 'Ashif Ahmed Shuvo' } as const;
const OTHER = { id: 'uid-2', email: 'someone@example.com', name: 'Someone Else' } as const;

const baseDraft = {
  slug: 'test-article',
  title: 'Test Article',
  excerpt: 'A test.',
  contentHtml: '<p>Hello <strong>world</strong></p>',
  coverImageUrl: null,
  category: 'General',
  tags: ['test'],
  status: 'draft' as const,
  authorId: 'uid-1',
  authorEmail: SUPER.email,
  authorName: SUPER.name,
  metaTitle: '',
  metaDescription: '',
  focusKeyword: '',
  canonicalUrl: '',
  ogImageUrl: '',
  robotsNoIndex: false,
  faqs: [] as Array<{ question: string; answer: string }>,
  authorTitle: '',
  authorBio: '',
  authorAvatarUrl: '',
  authorWebsite: '',
  containsAffiliateLinks: false,
  affiliateDisclosure: '',
};

describe('superadmins — primary allowlist', () => {
  it('contains exactly the three primary superadmin emails', () => {
    expect(primarySuperAdminEmails).toEqual([
      'shuvo.1807016@bau.edu.bd',
      'shuvoasifahmed@gmail.com',
      'asifahmedshuvo.aas@gmail.com',
    ])
  })

  it('matches case-insensitively and ignores whitespace', () => {
    expect(isPrimarySuperAdmin('shuvo.1807016@bau.edu.bd')).toBe(true)
    expect(isPrimarySuperAdmin('  ShuvoAsifAhmed@GMAIL.com ')).toBe(true)
    expect(isPrimarySuperAdmin('ASIFAHMEDSHUVO.AAS@GMAIL.COM')).toBe(true)
  })

  it('rejects everyone else', () => {
    expect(isPrimarySuperAdmin('admin@hazardnet.live')).toBe(false)
    expect(isPrimarySuperAdmin('shuvoasifahmed@gmail.com.evil.com')).toBe(false)
    expect(isPrimarySuperAdmin('')).toBe(false)
    expect(isPrimarySuperAdmin(null)).toBe(false)
    expect(isPrimarySuperAdmin(undefined)).toBe(false)
  })
})

describe('blogArticles — slugs and content helpers', () => {
  it('slugifies titles into URL-safe slugs', () => {
    expect(slugify('Tracking Jamuna Erosion with Sentinel-2!')).toBe('tracking-jamuna-erosion-with-sentinel-2')
    expect(slugify('  Multiple   spaces &  symbols  ')).toBe('multiple-spaces-symbols')
    expect(slugify('')).toBe('article')
  })

  it('ensures unique slugs against existing articles', () => {
    expect(ensureUniqueSlug('flood', ['flood', 'flood-2'])).toBe('flood-3')
    expect(ensureUniqueSlug('drought', ['flood'])).toBe('drought')
  })

  it('counts words and reading time from rich text', () => {
    expect(wordCount('<p>one two three</p><p>four</p>')).toBe(4)
    expect(readingTimeMinutes('<p>' + 'word '.repeat(400) + '</p>')).toBe(2)
    expect(readingTimeMinutes('<p>short</p>')).toBe(1)
  })

  it('sanitizes dangerous HTML on save/render', () => {
    const dirty = `<p onclick="alert(1)">ok</p><script>alert(2)</script><iframe src="x"></iframe>
      <a href="javascript:alert(3)">link</a><a href="https://hazardnet.live">good</a><img src="data:text/html,<script>">`
    const clean = sanitizeBlogHtml(dirty)
    expect(clean).toContain('<p>ok</p>')
    expect(clean).toContain('https://hazardnet.live')
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('iframe')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('javascript:')
  })
})

describe('blogArticles — local demo store (no Firestore env)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates, lists, publishes, updates and deletes articles', async () => {
    const created = await createArticle(baseDraft, SUPER)
    expect(created.error).toBeNull()
    expect(created.data?.slug).toBe('test-article')
    expect(created.data?.status).toBe('draft')
    expect(created.localDemo).toBe(true)

    const all = await listArticles()
    expect(all.data).toHaveLength(1)
    expect(all.data[0].title).toBe('Test Article')

    const published = await updateArticle(
      created.data!.id,
      { status: 'published', title: 'Renamed Article' },
      SUPER,
    )
    expect(published.error).toBeNull()
    expect(published.data?.status).toBe('published')
    expect(published.data?.publishedAt).toBeTruthy()
    expect(published.data?.title).toBe('Renamed Article')

    const pubList = await listPublishedArticles()
    expect(pubList.data).toHaveLength(1)

    const bySlug = await getArticleBySlug('test-article')
    expect(bySlug.data?.id).toBe(created.data!.id)

    const removed = await deleteArticle(created.data!.id, SUPER)
    expect(removed.data).toBe(true)
    expect((await listArticles()).data).toHaveLength(0)
  })

  it('blocks non-superadmins from every write path', async () => {
    const created = await createArticle(baseDraft, SUPER)
    const denied = await createArticle({ ...baseDraft, slug: 'nope' }, OTHER)
    expect(denied.error).toMatch(/only primary superadmins/i)

    const upd = await updateArticle(created.data!.id, { title: 'Hack' }, OTHER)
    expect(upd.error).toMatch(/only primary superadmins/i)

    const del = await deleteArticle(created.data!.id, OTHER)
    expect(del.error).toMatch(/only primary superadmins/i)

    // store untouched by the denied attempts
    expect((await listArticles()).data).toHaveLength(1)
  })

  it('unpublishing clears the published timestamp', async () => {
    const created = await createArticle({ ...baseDraft, status: 'published' }, SUPER)
    const unpublished = await updateArticle(created.data!.id, { status: 'draft' }, SUPER)
    expect(unpublished.data?.status).toBe('draft')
    expect(unpublished.data?.publishedAt).toBeNull()
    expect((await listPublishedArticles()).data).toHaveLength(0)
  })

  it('reports not-found for unknown slugs', async () => {
    const missing = await getArticleBySlug('does-not-exist')
    expect(missing.data).toBeNull()
    expect(missing.error).toBeNull()
  })

  it('sanitizes content on create and update', async () => {
    const evil = '<p>hi</p><script>alert(1)</script>'
    const created = await createArticle({ ...baseDraft, contentHtml: evil }, SUPER)
    expect(created.data?.contentHtml).not.toContain('script')
    const updated = await updateArticle(created.data!.id, { contentHtml: evil }, SUPER)
    expect(updated.data?.contentHtml).not.toContain('script')
  })

  it('keeps article shape serializable', async () => {
    const created = await createArticle(baseDraft, SUPER)
    const round = JSON.parse(JSON.stringify(created.data)) as BlogArticle
    expect(round.slug).toBe('test-article')
    expect(Array.isArray(round.tags)).toBe(true)
  })
})
