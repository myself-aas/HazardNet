/**
 * Blog article data layer for HazardNet.
 *
 * Storage adapters:
 *  - Supabase (production): the `blog_articles` table (SQL + RLS in
 *    docs/blog-admin-setup.md). Writes are restricted by RLS to the primary
 *    superadmin emails; the UI gates on the same allowlist.
 *  - Local demo mode: when Supabase env vars are absent (mock client), articles
 *    persist to localStorage so the studio remains fully explorable. A banner
 *    makes the active mode explicit so demo content is never mistaken for
 *    published production content.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { isPrimarySuperAdmin } from './superadmins';

export type BlogArticleStatus = 'draft' | 'published';

/** FAQ pair — emitted as FAQPage structured data for Google rich results. */
export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Sanitized rich-text HTML produced by the blog editor. */
  contentHtml: string;
  coverImageUrl: string | null;
  category: string;
  tags: string[];
  status: BlogArticleStatus;
  authorId: string | null;
  authorEmail: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /* ── SEO / Google Search Console fields ─────────────────────────────── */
  /** ≤60-char title for SERPs; falls back to title. */
  metaTitle: string;
  /** ≤160-char description for SERPs; falls back to excerpt. */
  metaDescription: string;
  /** Primary keyword the article targets (drives the SEO checklist). */
  focusKeyword: string;
  /** Override the canonical URL when syndicating. */
  canonicalUrl: string;
  /** Social-share image; falls back to cover image. */
  ogImageUrl: string;
  /** Keep the article out of search indexes (e.g. thin/seasonal content). */
  robotsNoIndex: boolean;
  /** FAQ pairs → FAQPage JSON-LD rich results. */
  faqs: BlogFaq[];
  /* ── Editable author details (public byline) ────────────────────────── */
  /** Author role, e.g. "Remote Sensing Specialist". */
  authorTitle: string;
  authorBio: string;
  authorAvatarUrl: string;
  authorWebsite: string;
  /* ── Monetization ───────────────────────────────────────────────────── */
  /** Enables the affiliate disclosure + sponsored rel on outbound links. */
  containsAffiliateLinks: boolean;
  affiliateDisclosure: string;
}

export type BlogArticleDraft = Omit<BlogArticle, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt'> & {
  publishedAt?: string | null;
};

const LOCAL_KEY = 'hazardnet.blog.articles.v1';
const TABLE = 'blog_articles';

export const DEFAULT_AFFILIATE_DISCLOSURE =
  'Disclosure: this article contains affiliate links. If you purchase through them, HazardNet may earn a small commission at no extra cost to you — it keeps our forecasting free for farmers.';

export const isLocalDemoMode = (): boolean => !isSupabaseConfigured;

// ─── slug & content helpers ─────────────────────────────────────────────────

/** URL-safe slug from a title (Bangladesh-friendly: keeps ascii words). */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'article'
  );
}

/** Unique slug: appends -2, -3… when the base slug is already taken. */
export function ensureUniqueSlug(base: string, existingSlugs: string[], ownId?: string): string {
  const taken = new Set(existingSlugs);
  let slug = base;
  let counter = 2;
  while (taken.has(slug)) slug = `${base}-${counter++}`;
  void ownId;
  return slug;
}

/**
 * Sanitize editor HTML: strips script/iframe/embed/object nodes, inline event
 * handlers and javascript: URLs. Applied on save; rendering happens only after
 * this pass. (Only superadmins can author content; this is defense-in-depth.)
 */
export function sanitizeBlogHtml(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.body.querySelectorAll('script,iframe,object,embed,link,style,form').forEach((el) => el.remove());
    doc.body.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && (value.startsWith('javascript:') || value.startsWith('data:text/html'))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

/** Rough reading time from stripped text (200 wpm). */
export function readingTimeMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  return Math.max(1, Math.round(words / 200));
}

export function wordCount(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

// ─── local demo adapter ─────────────────────────────────────────────────────

const readLocal = (): BlogArticle[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as BlogArticle[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocal = (articles: BlogArticle[]): void => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(articles));
  } catch {
    // best effort
  }
};

// ─── row mapping (snake_case <-> camelCase) ─────────────────────────────────

const rowToArticle = (row: Record<string, unknown>): BlogArticle => ({
  id: String(row.id),
  slug: String(row.slug ?? ''),
  title: String(row.title ?? ''),
  excerpt: String(row.excerpt ?? ''),
  contentHtml: String(row.content_html ?? ''),
  coverImageUrl: (row.cover_image_url as string | null) ?? null,
  category: String(row.category ?? 'General'),
  tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  status: row.status === 'published' ? 'published' : 'draft',
  authorId: (row.author_id as string | null) ?? null,
  authorEmail: String(row.author_email ?? ''),
  authorName: String(row.author_name ?? ''),
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
  publishedAt: (row.published_at as string | null) ?? null,
  metaTitle: String(row.meta_title ?? ''),
  metaDescription: String(row.meta_description ?? ''),
  focusKeyword: String(row.focus_keyword ?? ''),
  canonicalUrl: String(row.canonical_url ?? ''),
  ogImageUrl: String(row.og_image_url ?? ''),
  robotsNoIndex: row.robots_noindex === true,
  faqs: Array.isArray(row.faqs) ? ((row.faqs as BlogFaq[]) ?? []).filter((faq) => faq && faq.question) : [],
  authorTitle: String(row.author_title ?? ''),
  authorBio: String(row.author_bio ?? ''),
  authorAvatarUrl: String(row.author_avatar_url ?? ''),
  authorWebsite: String(row.author_website ?? ''),
  containsAffiliateLinks: row.contains_affiliate_links === true,
  affiliateDisclosure: String(row.affiliate_disclosure ?? ''),
});

const articleToRow = (article: BlogArticleDraft | Partial<BlogArticle>) => {
  const row: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  assign('slug', article.slug);
  assign('title', article.title);
  assign('excerpt', article.excerpt);
  assign('content_html', article.contentHtml);
  assign('cover_image_url', article.coverImageUrl ?? null);
  assign('category', article.category);
  assign('tags', article.tags);
  assign('status', article.status);
  assign('author_id', article.authorId ?? null);
  assign('author_email', article.authorEmail);
  assign('author_name', article.authorName);
  assign('published_at', article.publishedAt ?? null);
  assign('meta_title', article.metaTitle);
  assign('meta_description', article.metaDescription);
  assign('focus_keyword', article.focusKeyword);
  assign('canonical_url', article.canonicalUrl);
  assign('og_image_url', article.ogImageUrl);
  if (article.robotsNoIndex !== undefined) assign('robots_noindex', article.robotsNoIndex);
  if (article.faqs !== undefined) assign('faqs', article.faqs);
  assign('author_title', article.authorTitle);
  assign('author_bio', article.authorBio);
  assign('author_avatar_url', article.authorAvatarUrl);
  assign('author_website', article.authorWebsite);
  if (article.containsAffiliateLinks !== undefined) assign('contains_affiliate_links', article.containsAffiliateLinks);
  assign('affiliate_disclosure', article.affiliateDisclosure);
  return row;
};

// ─── public API ─────────────────────────────────────────────────────────────

export interface AuthorContext {
  id: string | null;
  email: string;
  name: string;
}

export interface BlogStoreResult<T> {
  data: T;
  error: string | null;
  localDemo: boolean;
}

const guardAuthor = (author: AuthorContext): string | null => {
  if (!author.email || !isPrimarySuperAdmin(author.email)) {
    return 'Only primary superadmins can manage blog articles.';
  }
  return null;
};

/** All articles (superadmin studio view). */
export async function listArticles(): Promise<BlogStoreResult<BlogArticle[]>> {
  if (isLocalDemoMode()) {
    return {
      data: readLocal().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      error: null,
      localDemo: true,
    };
  }
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message, localDemo: false };
  return { data: (data ?? []).map(rowToArticle), error: null, localDemo: false };
}

/** Published articles for the public blog (newest first). */
export async function listPublishedArticles(): Promise<BlogStoreResult<BlogArticle[]>> {
  if (isLocalDemoMode()) {
    return {
      data: readLocal()
        .filter((a) => a.status === 'published')
        .sort((a, b) => (b.publishedAt || b.createdAt || '').localeCompare(a.publishedAt || a.createdAt || '')),
      error: null,
      localDemo: true,
    };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) return { data: [], error: error.message, localDemo: false };
  return { data: (data ?? []).map(rowToArticle), error: null, localDemo: false };
}

/** Fetch one article by slug (public article page). */
export async function getArticleBySlug(slug: string): Promise<BlogStoreResult<BlogArticle | null>> {
  if (isLocalDemoMode()) {
    return { data: readLocal().find((a) => a.slug === slug) ?? null, error: null, localDemo: true };
  }
  const { data, error } = await supabase.from(TABLE).select('*').eq('slug', slug).maybeSingle();
  if (error) return { data: null, error: error.message, localDemo: false };
  return { data: data ? rowToArticle(data as Record<string, unknown>) : null, error: null, localDemo: false };
}

/** Fetch one article by id (editor). */
export async function getArticleById(id: string): Promise<BlogStoreResult<BlogArticle | null>> {
  if (isLocalDemoMode()) {
    return { data: readLocal().find((a) => a.id === id) ?? null, error: null, localDemo: true };
  }
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message, localDemo: false };
  return { data: data ? rowToArticle(data as Record<string, unknown>) : null, error: null, localDemo: false };
}

/** Create an article (superadmins only). */
export async function createArticle(
  draft: BlogArticleDraft,
  author: AuthorContext,
): Promise<BlogStoreResult<BlogArticle | null>> {
  const denied = guardAuthor(author);
  if (denied) return { data: null, error: denied, localDemo: isLocalDemoMode() };

  const now = new Date().toISOString();
  const article: BlogArticle = {
    ...draft,
    id: crypto.randomUUID?.() ?? `local-${Date.now()}`,
    contentHtml: sanitizeBlogHtml(draft.contentHtml),
    publishedAt: draft.status === 'published' ? (draft.publishedAt ?? now) : null,
    createdAt: now,
    updatedAt: now,
  };

  if (isLocalDemoMode()) {
    const all = readLocal();
    all.push(article);
    writeLocal(all);
    return { data: article, error: null, localDemo: true };
  }
  const { data, error } = await supabase.from(TABLE).insert(articleToRow({ ...draft, authorId: author.id, publishedAt: article.publishedAt })).select('*').single();
  if (error) return { data: null, error: error.message, localDemo: false };
  return { data: rowToArticle(data as Record<string, unknown>), error: null, localDemo: false };
}

/** Update an article (superadmins only). */
export async function updateArticle(
  id: string,
  changes: Partial<BlogArticleDraft>,
  author: AuthorContext,
): Promise<BlogStoreResult<BlogArticle | null>> {
  const denied = guardAuthor(author);
  if (denied) return { data: null, error: denied, localDemo: isLocalDemoMode() };

  const now = new Date().toISOString();

  if (isLocalDemoMode()) {
    const all = readLocal();
    const index = all.findIndex((a) => a.id === id);
    if (index === -1) return { data: null, error: 'Article not found.', localDemo: true };
    const next: BlogArticle = {
      ...all[index],
      ...changes,
      contentHtml: sanitizeBlogHtml(changes.contentHtml ?? all[index].contentHtml),
      publishedAt:
        changes.status === 'published'
          ? (all[index].publishedAt ?? changes.publishedAt ?? now)
          : changes.status === 'draft'
            ? null
            : all[index].publishedAt,
      updatedAt: now,
    };
    all[index] = next;
    writeLocal(all);
    return { data: next, error: null, localDemo: true };
  }
  const row = articleToRow(changes);
  row.updated_at = now;
  if (changes.status === 'published') row.published_at = changes.publishedAt ?? now;
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select('*').single();
  if (error) return { data: null, error: error.message, localDemo: false };
  return { data: rowToArticle(data as Record<string, unknown>), error: null, localDemo: false };
}

/** Delete an article (superadmins only). */
export async function deleteArticle(id: string, author: AuthorContext): Promise<BlogStoreResult<boolean>> {
  const denied = guardAuthor(author);
  if (denied) return { data: false, error: denied, localDemo: isLocalDemoMode() };

  if (isLocalDemoMode()) {
    writeLocal(readLocal().filter((a) => a.id !== id));
    return { data: true, error: null, localDemo: true };
  }
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) return { data: false, error: error.message, localDemo: false };
  return { data: true, error: null, localDemo: false };
}
