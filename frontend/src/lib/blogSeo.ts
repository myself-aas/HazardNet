/**
 * SEO engine for the HazardNet blog — Google Search Console–first metadata.
 *
 * Pure functions (fully unit-tested):
 *   · buildSeoHead      — title/meta/OG/Twitter/robots/canonical + JSON-LD
 *                         (@graph: Article + FAQPage) for an article
 *   · buildBlogIndexHead — the /blogs index metadata
 *   · seoScore          — on-page checklist (keyword coverage, lengths,
 *                         links, subheadings, FAQ rich-result opportunity)
 *   · splitContentBlocks — top-level HTML blocks, used to place in-article
 *                         ads between paragraphs
 *   · applyAffiliateRel  — rewrites external links to rel="sponsored nofollow
 *                         noopener" per Google's affiliate guidelines
 */

import type { BlogArticle } from './blogArticles';

export interface SeoHead {
  title: string;
  description: string;
  keywords: string[];
  canonical: string;
  robots: string;
  ogType: 'article' | 'website';
  ogImage: string | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  authorName: string;
  section: string | null;
  tags: string[];
  /** JSON-LD @graph payload (Article + FAQPage) — stringified by the head manager. */
  jsonLd: Record<string, unknown> | null;
}

export const DEFAULT_AFFILIATE_DISCLOSURE =
  'Disclosure: this article contains affiliate links. If you purchase through them, HazardNet may earn a small commission at no extra cost to you — it keeps our forecasting free for farmers.';

const SITE_NAME = 'HazardNet';
const SITE_ORIGIN_FALLBACK = 'https://hazardnet.live';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function effectiveMetaTitle(article: Pick<BlogArticle, 'metaTitle' | 'title'>): string {
  const base = (article.metaTitle || article.title || '').trim();
  return base.length <= 60 ? base : `${base.slice(0, 57)}…`;
}

export function effectiveMetaDescription(
  article: Pick<BlogArticle, 'metaDescription' | 'excerpt' | 'contentHtml'>,
): string {
  const base = (article.metaDescription || article.excerpt || stripHtml(article.contentHtml) || '').trim();
  return base.length <= 160 ? base : `${base.slice(0, 157)}…`;
}

export function effectiveOgImage(article: Pick<BlogArticle, 'ogImageUrl' | 'coverImageUrl'>): string | null {
  return article.ogImageUrl || article.coverImageUrl || null;
}

/** Build the complete head payload for an article page. */
export function buildSeoHead(
  article: BlogArticle,
  options: { origin?: string; path?: string } = {},
): SeoHead {
  const origin = (options.origin || SITE_ORIGIN_FALLBACK).replace(/\/$/, '');
  const path = options.path || `/blogs/${article.slug}`;
  const canonical = article.canonicalUrl?.trim() || `${origin}${path}`;
  const date = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString() : null);

  const author: Record<string, unknown> = { '@type': 'Person', name: article.authorName || SITE_NAME };
  if (article.authorTitle) author.jobTitle = article.authorTitle;
  if (article.authorBio) author.description = article.authorBio;
  if (article.authorWebsite) author.url = article.authorWebsite.startsWith('http') ? article.authorWebsite : `https://${article.authorWebsite}`;

  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: effectiveMetaTitle(article),
      description: effectiveMetaDescription(article),
      ...(effectiveOgImage(article) ? { image: [effectiveOgImage(article)] } : {}),
      datePublished: date(article.publishedAt || article.createdAt),
      dateModified: date(article.updatedAt || article.publishedAt || article.createdAt),
      author,
      publisher: { '@type': 'Organization', name: SITE_NAME },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      ...(article.category ? { articleSection: article.category } : {}),
      ...(article.tags.length > 0 ? { keywords: article.tags.join(', ') } : {}),
    },
  ];

  if (article.faqs && article.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: article.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  return {
    title: `${effectiveMetaTitle(article)} | ${SITE_NAME}`,
    description: effectiveMetaDescription(article),
    keywords: [...article.tags, ...(article.focusKeyword ? [article.focusKeyword] : [])],
    canonical,
    robots: article.robotsNoIndex ? 'noindex, follow' : 'index, follow',
    ogType: 'article',
    ogImage: effectiveOgImage(article),
    publishedTime: date(article.publishedAt || article.createdAt),
    modifiedTime: date(article.updatedAt || article.publishedAt || article.createdAt),
    authorName: article.authorName || SITE_NAME,
    section: article.category || null,
    tags: article.tags,
    jsonLd: { '@context': 'https://schema.org', '@graph': graph },
  };
}

/** Head payload for the /blogs index page. */
export function buildBlogIndexHead(options: { origin?: string } = {}): SeoHead {
  const origin = (options.origin || SITE_ORIGIN_FALLBACK).replace(/\/$/, '');
  return {
    title: `HazardNet Blog — Agri-Climate Research & Field Reports | ${SITE_NAME}`,
    description:
      'Deep-dives on satellite-based hazard forecasting, SAR remote sensing, edge AI deployment and agronomy field studies across Bangladesh’s 64 agricultural districts.',
    keywords: ['HazardNet blog', 'agri-climate research', 'remote sensing', 'Bangladesh agriculture', 'early warning'],
    canonical: `${origin}/blogs`,
    robots: 'index, follow',
    ogType: 'website',
    ogImage: null,
    publishedTime: null,
    modifiedTime: null,
    authorName: SITE_NAME,
    section: null,
    tags: [],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: `${SITE_NAME} Blog`,
      url: `${origin}/blogs`,
      description: 'Agri-climate research, remote sensing methodology and field deployment reports.',
    },
  };
}

// ─── On-page SEO score ──────────────────────────────────────────────────────

export interface SeoCheck {
  id: string;
  label: string;
  passed: boolean;
  advice: string;
}

export interface SeoScoreResult {
  checks: SeoCheck[];
  score: number;
  passedCount: number;
  wordCount: number;
}

function keywordPresent(haystack: string, keyword: string): boolean {
  if (!keyword) return false;
  return haystack.toLowerCase().includes(keyword.toLowerCase());
}

/** On-page SEO checklist mirroring what Google Search Console rewards. */
export function seoScore(article: BlogArticle): SeoScoreResult {
  const text = stripHtml(article.contentHtml);
  const words = text ? text.split(' ').length : 0;
  const keyword = (article.focusKeyword || '').trim();
  const lowerHtml = article.contentHtml.toLowerCase();
  const subheadings = (article.contentHtml.match(/<h[23][\s>]/gi) ?? []).length;
  const internalLinks = (article.contentHtml.match(/href="[^"]*(\/blogs|\/advisories|\/docs|\/analytics)[^"]*"/gi) ?? []).length;
  const externalLinks = (article.contentHtml.match(/href="https?:\/\//gi) ?? []).length;
  const imagesWithoutAlt = (article.contentHtml.match(/<img(?![^>]*\balt=)[^>]*>/gi) ?? []).length;
  const first100Words = text.split(' ').slice(0, 100).join(' ');
  const slugKebab = article.slug.replace(/-/g, ' ');

  const checks: SeoCheck[] = [
    {
      id: 'title-length',
      label: 'SEO title between 30–60 characters',
      passed: effectiveMetaTitle(article).length >= 30 && effectiveMetaTitle(article).length <= 60,
      advice: 'Google truncates titles past ~60 characters. Aim for 30–60.',
    },
    {
      id: 'title-keyword',
      label: keyword ? `Focus keyword “${keyword}” in the SEO title` : 'Focus keyword set and present in the SEO title',
      passed: Boolean(keyword) && keywordPresent(effectiveMetaTitle(article), keyword),
      advice: 'Set a focus keyword and include it in the SEO title.',
    },
    {
      id: 'slug-keyword',
      label: keyword ? `Focus keyword in the URL slug` : 'URL slug readable',
      passed: keyword ? keywordPresent(slugKebab, keyword) : article.slug.length > 3,
      advice: 'Keep the slug short and contain the keyword (e.g. /blogs/satellite-flood-forecasting).',
    },
    {
      id: 'meta-description',
      label: 'Meta description between 120–160 characters',
      passed:
        effectiveMetaDescription(article).length >= 120 && effectiveMetaDescription(article).length <= 160,
      advice: 'Write a compelling 120–160 character summary — Google often shows it verbatim.',
    },
    {
      id: 'excerpt',
      label: 'Excerpt / summary written',
      passed: article.excerpt.trim().length > 40,
      advice: 'The excerpt powers cards, shares and fallback meta description.',
    },
    {
      id: 'cover-image',
      label: 'Cover / social share image set',
      passed: Boolean(effectiveOgImage(article)),
      advice: 'Articles with images earn higher click-through from search and social.',
    },
    {
      id: 'content-length',
      label: 'At least 600 words of content',
      passed: words >= 600,
      advice: `Currently ${words} words — comprehensive guides rank better.`,
    },
    {
      id: 'keyword-early',
      label: keyword ? 'Focus keyword appears in the first 100 words' : 'Focus keyword in the intro',
      passed: Boolean(keyword) && keywordPresent(first100Words, keyword),
      advice: 'Mention the focus keyword naturally in the opening paragraph.',
    },
    {
      id: 'subheadings',
      label: 'Two or more H2/H3 subheadings',
      passed: subheadings >= 2,
      advice: 'Structure long content with subheadings — they win featured snippets.',
    },
    {
      id: 'internal-links',
      label: 'At least one internal link',
      passed: internalLinks >= 1,
      advice: 'Link to related HazardNet pages (/blogs, /advisories, district pages).',
    },
    {
      id: 'external-links',
      label: 'At least one authoritative external link',
      passed: externalLinks >= 1,
      advice: 'Cite sources (Copernicus, NASA, DAE) to build topical trust.',
    },
    {
      id: 'image-alt',
      label: 'All images have alt text',
      passed: imagesWithoutAlt === 0,
      advice: 'Alt text is required for accessibility and image search.',
    },
    {
      id: 'faq',
      label: 'FAQ section added (rich-result opportunity)',
      passed: (article.faqs?.length ?? 0) >= 1,
      advice: 'FAQs emit FAQPage structured data — prime real estate on Google.',
    },
  ];

  const passedCount = checks.filter((check) => check.passed).length;
  return { checks, score: Math.round((passedCount / checks.length) * 100), passedCount, wordCount: words };
}

// ─── Content block splitting (for in-article ad placement) ──────────────────

/**
 * Split sanitized article HTML into top-level blocks (paragraph, heading,
 * list, …) so ad units can be interleaved between them in React.
 */
export function splitContentBlocks(html: string): string[] {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html ? [html] : [];
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return Array.from(doc.body.children)
      .map((el) => el.outerHTML)
      .filter((block) => block.replace(/<[^>]*>/g, '').trim().length > 0 || /<img|<hr/i.test(block));
  } catch {
    return html ? [html] : [];
  }
}

// ─── Affiliate link compliance ──────────────────────────────────────────────

/**
 * Mark every external link in the body as sponsored (Google affiliate
 * guideline: rel="sponsored"; nofollow keeps link equity honest; noopener for
 * safety with target=_blank). Internal links are left untouched.
 */
export function applyAffiliateRel(html: string, internalOrigin?: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const origin = (internalOrigin || window.location.origin || '').replace(/\/$/, '');
    doc.body.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const isInternal =
        href.startsWith('/') ||
        href.startsWith('#') ||
        (origin.length > 0 && (href.startsWith(origin) || href.startsWith(`${origin}/`)));
      if (isInternal) return;
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'sponsored nofollow noopener');
    });
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}
