import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from '../components/MaterialIcon';
import Breadcrumbs from '../components/Breadcrumbs';
import { AdSenseScript, BlogAdUnit } from '../components/blog/ads/BlogAdUnit';
import { BlogArticle, DEFAULT_AFFILIATE_DISCLOSURE, getArticleBySlug, readingTimeMinutes, sanitizeBlogHtml } from '../lib/blogArticles';
import { applyAffiliateRel, buildSeoHead, splitContentBlocks } from '../lib/blogSeo';
import { useSeoHead } from '../lib/seoHead';
import { ADSENSE_SLOT_ARTICLE_FOOTER, ADSENSE_SLOT_ARTICLE_INLINE } from '../lib/adsense';
import { useAuth } from '../context/AuthContext';
import { isPrimarySuperAdmin } from '../lib/superadmins';
import { getStaticBlogPostBySlug, type StaticBlogPost } from '../lib/staticBlogPosts';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Lift a shipped editorial post onto the same article shape the studio uses. */
const staticPostToArticle = (post: StaticBlogPost): BlogArticle => {
  const iso = new Date(post.date).toISOString();
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.summary,
    contentHtml: post.content.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''),
    coverImageUrl: null,
    category: post.category,
    tags: post.tags,
    status: 'published',
    authorId: null,
    authorEmail: '',
    authorName: post.author,
    createdAt: iso,
    updatedAt: iso,
    publishedAt: iso,
    metaTitle: post.title.slice(0, 60),
    metaDescription: post.summary.slice(0, 160),
    focusKeyword: post.tags[0] ?? '',
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
  };
};

/** Neutral head applied while the article loads (replaced once it resolves). */
const LOADING_HEAD = {
  title: 'HazardNet',
  description: '',
  keywords: [] as string[],
  canonical: '',
  robots: 'noindex, nofollow',
  ogType: 'website' as const,
  ogImage: null,
  publishedTime: null,
  modifiedTime: null,
  authorName: '',
  section: null,
  tags: [] as string[],
  jsonLd: null,
};

/**
 * Public blog article page — every article gets a unique, shareable URL:
 * /blogs/:slug.
 *
 * This page is the monetized surface: Google AdSense (script injected here
 * only) places an in-article unit between paragraphs and a footer unit after
 * the body. Full SEO metadata (title, description, OG/Twitter, canonical,
 * robots, Article + FAQ JSON-LD) is applied to the document head for Google
 * Search Console. Affiliate articles show a disclosure and outbound links are
 * tagged rel="sponsored nofollow".
 */
export const BlogArticlePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [article, setArticle] = useState<BlogArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError(null);
    void (async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const result = await getArticleBySlug(slug);
      if (cancelled) return;
      if (result.data && result.data.status === 'published') {
        setArticle(result.data);
      } else {
        const staticPost = getStaticBlogPostBySlug(slug);
        if (staticPost) {
          setArticle(staticPostToArticle(staticPost));
        } else if (result.error) {
          setError(result.error);
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const seoHead = useMemo(() => {
    if (!article) return null;
    return buildSeoHead(article, { origin: window.location.origin, path: `/blogs/${article.slug}` });
  }, [article]);
  useSeoHead(seoHead ?? LOADING_HEAD);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" role="status">
        <span className="w-8 h-8 border-[3px] border-carbon-20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto min-h-[55vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <span className="text-4xl">🧭</span>
        <h1 className="text-xl font-black text-carbon-90">Article not found</h1>
        <p className="text-sm text-carbon-60 max-w-md leading-relaxed">
          {error
            ? `The article could not be loaded: ${error}`
            : 'This URL does not match a published HazardNet article. It may be a draft, renamed, or removed.'}
        </p>
        <div className="flex items-center gap-2">
          <Link to="/blogs" className="bg-nasa-red px-4 py-2.5 text-xs font-black text-white hover:bg-nasa-red-shade">
            Browse all articles
          </Link>
          {isPrimarySuperAdmin(user?.email) && (
            <Link to="/dashboard/blog" className="border border-carbon-20 bg-white px-4 py-2.5 text-xs font-black text-carbon-70 hover:bg-carbon-05">
              Open Blog Studio
            </Link>
          )}
        </div>
      </motion.div>
    );
  }

  const date = new Date(article.publishedAt || article.createdAt || Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const relatedDistrict = getStaticBlogPostBySlug(article.slug)?.relatedDistrict;

  const copyLink = async () => {
    const url = `${window.location.origin}/blogs/${article.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Article link copied', { duration: 1800 });
    } catch {
      toast.success(url, { duration: 4000 });
    }
  };

  // Split the sanitized body into top-level blocks so an ad unit can be
  // interleaved after the third block (native in-article placement).
  const bodyHtml = sanitizeBlogHtml(article.contentHtml);
  const blocks = splitContentBlocks(bodyHtml);
  const firstChunk = blocks.slice(0, 3).join('');
  const secondChunk = blocks.slice(3).join('');
  const disclosure = article.affiliateDisclosure || DEFAULT_AFFILIATE_DISCLOSURE;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-3xl mx-auto space-y-6 pb-10">
      <AdSenseScript />
      <Breadcrumbs />

      <article className="bg-white border border-carbon-20/90 overflow-hidden">
        {article.coverImageUrl && (
          <img src={article.coverImageUrl} alt={article.title} className="w-full h-48 sm:h-64 object-cover" />
        )}
        <div className="p-6 sm:p-9 space-y-5">
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold uppercase tracking-wider">
            <span className="px-2.5 py-1 rounded-sm bg-amber-50 border border-amber-200 text-amber-900">{article.category}</span>
            <span className="text-carbon-60">{date}</span>
            <span className="text-carbon-30">•</span>
            <span className="text-carbon-60">{readingTimeMinutes(article.contentHtml)} min read</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-carbon-90 tracking-tight leading-tight">{article.title}</h1>
          <p className="text-sm text-carbon-60 leading-relaxed border-l-4 border-nasa-blue/60 pl-3">{article.excerpt}</p>

          <div className="flex items-center justify-between gap-3 border-y border-carbon-10 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {article.authorAvatarUrl ? (
                <img src={article.authorAvatarUrl} alt="" className="h-10 w-10 rounded-full border border-carbon-20 object-cover shrink-0" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-white font-black text-xs flex items-center justify-center shrink-0">
                  {(article.authorName || 'H')[0].toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-black text-carbon-90 truncate">{article.authorName}</p>
                <p className="text-xs font-mono text-carbon-60 truncate">{article.authorTitle || 'HazardNet Research Team'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 inline-flex items-center gap-1.5 border border-carbon-20 px-3 py-1.5 text-xs font-black text-carbon-60 hover:bg-carbon-10 cursor-pointer"
              title="Copy article link"
            >
              <MaterialIcon name="share" className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>

          {/* Affiliate disclosure (FTC + Google policy) */}
          {article.containsAffiliateLinks && (
            <p className="border border-sky-200 bg-carbon-05 px-4 py-3 text-xs font-medium leading-relaxed text-sky-900" data-testid="affiliate-disclosure">
              <MaterialIcon name="attach_money" className="mr-1 inline h-3.5 w-3.5" />
              {disclosure}
            </p>
          )}

          {/* Sanitized rich-text body with in-article ad after block 3 */}
          <div className="prose-blog text-carbon-70" data-testid="article-body">
            {/* Content authored exclusively by allowlisted superadmins and
                sanitized on save + render (scripts/handlers/js-URLs stripped).
                Affiliate articles additionally get rel="sponsored nofollow". */}
            <div dangerouslySetInnerHTML={{ __html: article.containsAffiliateLinks ? applyAffiliateRel(firstChunk) : firstChunk }} />
            <BlogAdUnit
              slot={ADSENSE_SLOT_ARTICLE_INLINE}
              format="fluid"
              inArticle
              label="Advertisement"
              className="my-6 not-prose"
            />
            {secondChunk && (
              <div dangerouslySetInnerHTML={{ __html: article.containsAffiliateLinks ? applyAffiliateRel(secondChunk) : secondChunk }} />
            )}
          </div>

          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-carbon-10">
              {article.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-sm bg-carbon-10 border border-carbon-20 text-xs font-bold text-carbon-60">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {relatedDistrict && (
            <Link
              to={`/?district=${relatedDistrict}`}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-carbon-90 text-white text-xs font-extrabold hover:bg-carbon-80 transition-all"
            >
              <MaterialIcon name="satellite_alt" className="w-4 h-4" /> View {relatedDistrict} on GIS Map
            </Link>
          )}

          {/* Author bio box (E-E-A-T) */}
          {(article.authorBio || article.authorWebsite) && (
            <div className="flex items-start gap-3 bg-carbon-05 border border-carbon-10 p-4">
              {article.authorAvatarUrl ? (
                <img src={article.authorAvatarUrl} alt="" className="h-12 w-12 rounded-full border border-carbon-20 object-cover shrink-0" />
              ) : (
                <span className="h-12 w-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-white font-black text-sm flex items-center justify-center shrink-0">
                  {(article.authorName || 'H')[0].toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-black text-carbon-90">
                  {article.authorName}
                  {article.authorTitle && <span className="ml-1.5 font-mono text-xs font-bold text-carbon-60">{article.authorTitle}</span>}
                </p>
                {article.authorBio && <p className="mt-1 text-xs leading-relaxed text-carbon-60">{article.authorBio}</p>}
                {article.authorWebsite && (
                  <a
                    href={article.authorWebsite.startsWith('http') ? article.authorWebsite : `https://${article.authorWebsite}`}
                    target="_blank"
                    rel="noopener nofollow"
                    className="mt-1 inline-block text-xs font-black text-amber-700 hover:underline"
                  >
                    {article.authorWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* End-of-article ad */}
          <BlogAdUnit slot={ADSENSE_SLOT_ARTICLE_FOOTER} format="rectangle" label="Advertisement" className="not-prose" />
        </div>
      </article>

      <div className="flex items-center justify-between gap-3">
        <Link to="/blogs" className="text-xs font-black text-amber-800 hover:underline">← All articles</Link>
        {isPrimarySuperAdmin(user?.email) && (
          <Link to={`/dashboard/blog`} className="text-xs font-black text-carbon-60 hover:text-carbon-90 hover:underline">
            Manage in Blog Studio →
          </Link>
        )}
      </div>
    </motion.div>
  );
};

export default BlogArticlePage;
