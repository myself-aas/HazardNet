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

import DOMPurify from 'dompurify';
import { db } from '../services/firebase';
import { collection, query, orderBy, getDocs, where, getDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

export const isLocalDemoMode = (): boolean => {
  return typeof window !== 'undefined' && (!db || !('app' in db));
};

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
 * Elements the editor can actually produce (RichTextEditor is contentEditable +
 * execCommand): formatBlock → p/h1–h3/blockquote/pre, bold → b|strong,
 * italic → i|em, underline → u, strikeThrough → s|strike, lists → ul/ol/li,
 * alignment → inline `text-align`, foreColor → font|span, links, inline
 * images, horizontal rule, plus whatever the HTML source view emits.
 *
 * NOTE: this is an ALLOWLIST, and that is load-bearing. DOMPurify's own default
 * allowlist is much wider — it permits `iframe`, `form`, `input`, `style`,
 * `select`, `audio`, `video` and more, so calling `DOMPurify.sanitize` with no
 * config would have RE-ENABLED elements the previous blocklist removed.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'sub', 'sup', 'small', 'big', 'tt', 'nobr', 'font', 'center',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
];

/** Attributes that cannot execute. `id` is safe here: DOMPurify's DOM
 *  clobbering protection (SANITIZE_DOM, on by default) neutralises it. */
const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'target', 'rel', 'width', 'height',
  'class', 'style', 'colspan', 'rowspan', 'align', 'valign', 'dir', 'lang',
  'color', 'size', 'face', 'cite', 'datetime', 'start', 'type', 'id',
  'loading', 'decoding', 'referrerpolicy',
];

/**
 * Inline CSS is required for the editor's alignment and text-colour commands.
 * DOMPurify allows the `style` attribute but does not parse the declarations
 * inside it, so anything able to fetch or execute is dropped here. Every
 * editor command uses plain keyword properties (text-align, color, …), so this
 * costs no functionality.
 */
const UNSAFE_CSS = /(url\s*\(|expression\s*\(|javascript:|vbscript:|@import|behaviou?r\s*:|\\)/i;

/**
 * DOMPurify deliberately permits `data:` URIs on media tags — `img` is in its
 * DATA_URI_TAGS allowlist (the `DATA_URI_TAGS[lcTag]` branch in purify.js),
 * which config cannot narrow. The previous sanitizer blocked `data:text/html`,
 * so this preserves exactly that: image payloads are fine, anything else is
 * dropped rather than left in the document.
 *
 * Detection matches DOMPurify's own test — it compares the RAW value with
 * `indexOf(value, 'data:') === 0`, so a value prefixed with a control or
 * whitespace character never qualifies as a data: URI in the first place and
 * is dropped before this hook matters.
 */
const SAFE_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);/i;

const URI_ATTRS = new Set(['src', 'href', 'xlink:href', 'poster', 'action', 'formaction']);

function sanitizeInlineStyle(value: string): string {
  return value
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration && !UNSAFE_CSS.test(declaration))
    .join('; ');
}

if (!(DOMPurify as unknown as { __hazardnetHooks?: boolean }).__hazardnetHooks) {
  (DOMPurify as unknown as { __hazardnetHooks?: boolean }).__hazardnetHooks = true;

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    // Inline CSS: DOMPurify allows the attribute but does not parse it.
    if (data.attrName === 'style') {
      const safe = sanitizeInlineStyle(data.attrValue);
      if (safe) data.attrValue = safe;
      else data.keepAttr = false;
      return;
    }

    // Non-image data: URIs (e.g. data:text/html smuggling markup).
    if (
      URI_ATTRS.has(data.attrName.toLowerCase()) &&
      data.attrValue.slice(0, 5).toLowerCase() === 'data:' &&
      !SAFE_DATA_URI.test(data.attrValue)
    ) {
      data.keepAttr = false;
    }
  });
}

/**
 * Sanitize editor HTML. Applied on save AND on render (BlogArticlePage), so
 * content already stored is cleaned before it reaches dangerouslySetInnerHTML.
 *
 * Backed by DOMPurify with an explicit allowlist. The previous hand-rolled
 * blocklist was bypassable — `<meta http-equiv="refresh">` was not filtered at
 * all (silent redirect of every reader), `javascript:` survived behind a
 * leading C0 control character (browsers strip those, `startsWith` does not),
 * and `catch { return html }` returned the input UNSANITISED on any error.
 *
 * Fail-closed: if sanitising is impossible this returns '' rather than the
 * original markup. Never return `html` here.
 */
export function sanitizeBlogHtml(html: string): string {
  if (!html) return '';
  // Sanitising needs a DOM. The app is client-only, but fail closed anyway so a
  // future SSR path can never render unsanitised article HTML.
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  try {
    return String(
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        KEEP_CONTENT: true,
        FORBID_ATTR: ['srcdoc', 'formaction', 'action', 'xlink:href', 'xmlns'],
      }),
    );
  } catch {
    return '';
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
  let data: any[] = []; let error = null;
  try {
    const q = query(collection(db, TABLE), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { error = e; }
  if (error) return { data: [], error: String(error), localDemo: false };
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
  let data: any[] = []; let error = null;
  try {
    const q = query(collection(db, TABLE), where('status', '==', 'published'), orderBy('published_at', 'desc'));
    const snap = await getDocs(q);
    data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { error = e; }
  if (error) return { data: [], error: String(error), localDemo: false };
  return { data: (data ?? []).map(rowToArticle), error: null, localDemo: false };
}

/** Fetch one article by slug (public article page). */
export async function getArticleBySlug(slug: string): Promise<BlogStoreResult<BlogArticle | null>> {
  if (isLocalDemoMode()) {
    return { data: readLocal().find((a) => a.slug === slug) ?? null, error: null, localDemo: true };
  }
  let data: any = null; let error = null;
  try {
    const q = query(collection(db, TABLE), where('slug', '==', slug));
    const snap = await getDocs(q);
    if(!snap.empty) data = { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch(e) { error = e; }
  if (error) return { data: null, error: String(error), localDemo: false };
  return { data: data ? rowToArticle(data as Record<string, unknown>) : null, error: null, localDemo: false };
}

/** Fetch one article by id (editor). */
export async function getArticleById(id: string): Promise<BlogStoreResult<BlogArticle | null>> {
  if (isLocalDemoMode()) {
    return { data: readLocal().find((a) => a.id === id) ?? null, error: null, localDemo: true };
  }
  let data: any = null; let error = null;
  try {
    const dSnap = await getDoc(doc(db, TABLE, id));
    if(dSnap.exists()) data = { id: dSnap.id, ...dSnap.data() };
  } catch(e) { error = e; }
  if (error) return { data: null, error: String(error), localDemo: false };
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
  let data: any = null; let error = null;
  try {
    const newRow = articleToRow({ ...draft, authorId: author.id, publishedAt: article.publishedAt });
    const ref = doc(collection(db, TABLE));
    await setDoc(ref, newRow);
    data = { id: ref.id, ...newRow };
  } catch(e) { error = e; }
  if (error) return { data: null, error: String(error), localDemo: false };
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
  let data: any = null; let error = null;
  try {
    await updateDoc(doc(db, TABLE, id), row);
    data = row;
  } catch(e) { error = e; }
  if (error) return { data: null, error: String(error), localDemo: false };
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
  let error = null;
  try {
    await deleteDoc(doc(db, TABLE, id));
  } catch(e) { error = e; }
  if (error) return { data: false, error: String(error), localDemo: false };
  return { data: true, error: null, localDemo: false };
}
