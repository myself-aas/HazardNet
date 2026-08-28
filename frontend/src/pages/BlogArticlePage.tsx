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
      if (result.error) setError(result.error);
      else if (!result.data || result.data.status !== 'published') setNotFound(true);
      else setArticle(result.data);
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
        <span className="w-8 h-8 border-[3px] border-slate-200 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto min-h-[55vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <span className="text-4xl">🧭</span>
        <h1 className="text-xl font-black text-slate-900">Article not found</h1>
        <p className="text-sm text-slate-600 max-w-md leading-relaxed">
          {error
            ? `The article could not be loaded: ${error}`
            : 'This URL does not match a published HazardNet article. It may be a draft, renamed, or removed.'}
        </p>
        <div className="flex items-center gap-2">
          <Link to="/blogs" className="rounded-2xl bg-[#f9a825] px-4 py-2.5 text-xs font-black text-slate-950 shadow-md hover:bg-[#d08305]">
            Browse all articles
          </Link>
          {isPrimarySuperAdmin(user?.email) && (
            <Link to="/dashboard/blog" className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
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

      <article className="bg-white border border-slate-200/90 rounded-3xl shadow-md overflow-hidden">
        {article.coverImageUrl && (
          <img src={article.coverImageUrl} alt={article.title} className="w-full h-48 sm:h-64 object-cover" />
        )}
        <div className="p-6 sm:p-9 space-y-5">
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono font-bold uppercase tracking-wider">
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">{article.category}</span>
            <span className="text-slate-400">{date}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-400">{readingTimeMinutes(article.contentHtml)} min read</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">{article.title}</h1>
          <p className="text-sm text-slate-600 leading-relaxed border-l-4 border-[#f9a825]/60 pl-3">{article.excerpt}</p>

          <div className="flex items-center justify-between gap-3 border-y border-slate-100 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {article.authorAvatarUrl ? (
                <img src={article.authorAvatarUrl} alt="" className="h-10 w-10 rounded-full border border-slate-200 object-cover shrink-0" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                  {(article.authorName || 'H')[0].toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900 truncate">{article.authorName}</p>
                <p className="text-[10px] font-mono text-slate-400 truncate">{article.authorTitle || 'HazardNet Research Team'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Copy article link"
            >
              <MaterialIcon name="share" className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>

          {/* Affiliate disclosure (FTC + Google policy) */}
          {article.containsAffiliateLinks && (
            <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] font-medium leading-relaxed text-sky-900" data-testid="affiliate-disclosure">
              <MaterialIcon name="attach_money" className="mr-1 inline h-3.5 w-3.5" />
              {disclosure}
            </p>
          )}

          {/* Sanitized rich-text body with in-article ad after block 3 */}
          <div className="prose-blog text-slate-700" data-testid="article-body">
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
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
              {article.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Author bio box (E-E-A-T) */}
          {(article.authorBio || article.authorWebsite) && (
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
              {article.authorAvatarUrl ? (
                <img src={article.authorAvatarUrl} alt="" className="h-12 w-12 rounded-full border border-slate-200 object-cover shrink-0" />
              ) : (
                <span className="h-12 w-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
                  {(article.authorName || 'H')[0].toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900">
                  {article.authorName}
                  {article.authorTitle && <span className="ml-1.5 font-mono text-[10px] font-bold text-slate-400">{article.authorTitle}</span>}
                </p>
                {article.authorBio && <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{article.authorBio}</p>}
                {article.authorWebsite && (
                  <a
                    href={article.authorWebsite.startsWith('http') ? article.authorWebsite : `https://${article.authorWebsite}`}
                    target="_blank"
                    rel="noopener nofollow"
                    className="mt-1 inline-block text-[10px] font-black text-amber-700 hover:underline"
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
          <Link to={`/dashboard/blog`} className="text-xs font-black text-slate-500 hover:text-slate-900 hover:underline">
            Manage in Blog Studio →
          </Link>
        )}
      </div>
    </motion.div>
  );
};

export default BlogArticlePage;
