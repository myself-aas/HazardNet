import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from '../../components/MaterialIcon';
import Breadcrumbs from '../../components/Breadcrumbs';
import RichTextEditor from '../../components/blog/RichTextEditor';
import { useAuth } from '../../context/AuthContext';
import {
  BlogArticleDraft,
  BlogFaq,
  createArticle,
  ensureUniqueSlug,
  getArticleById,
  isLocalDemoMode,
  listArticles,
  slugify,
  updateArticle,
} from '../../lib/blogArticles';
import { effectiveMetaDescription, effectiveMetaTitle, seoScore } from '../../lib/blogSeo';

/**
 * Full-page blog article editor (dedicated dashboard route, not a popup or
 * inline component): /dashboard/blog/new and /dashboard/blog/edit/:id.
 *
 * Everything is editable: content (rich text), SEO metadata (SERP title &
 * description with Google preview, focus keyword, canonical, OG image,
 * robots, FAQ rich results), the author byline (name, title, bio, avatar,
 * website) and monetization (affiliate flag + disclosure). Superadmin-only.
 */

const CATEGORIES = ['Remote Sensing', 'Field Deployment', 'Edge AI', 'Agronomy', 'Research', 'General'];

const inputClass =
  'w-full px-3.5 py-2.5 bg-carbon-05 border border-carbon-20 text-xs text-carbon-90 placeholder-carbon-40 font-medium transition-all focus:outline-none focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/40';

const autosaveKey = (id: string) => `hazardnet.blog.draft.${id}`;

const SeoCheckRow: React.FC<{ passed: boolean; label: string; advice: string }> = ({ passed, label, advice }) => (
  <li className="flex items-start gap-2" title={advice}>
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-black ${
        passed ? 'bg-emerald-100 text-carbon-80' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {passed ? '✓' : '!'}
    </span>
    <span className={`text-xs leading-relaxed ${passed ? 'text-carbon-60 line-through decoration-carbon-30' : 'font-semibold text-carbon-70'}`}>
      {label}
    </span>
  </li>
);

export const BlogEditorPage: React.FC<{ mode: 'new' | 'edit' }> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [articleId, setArticleId] = useState<string | null>(mode === 'edit' ? (id ?? null) : null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  // SEO fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [robotsNoIndex, setRobotsNoIndex] = useState(false);
  const [faqs, setFaqs] = useState<BlogFaq[]>([]);

  // Editable author details
  const [authorName, setAuthorName] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [authorBio, setAuthorBio] = useState('');
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState('');
  const [authorWebsite, setAuthorWebsite] = useState('');

  // Monetization
  const [containsAffiliateLinks, setContainsAffiliateLinks] = useState(false);
  const [affiliateDisclosure, setAffiliateDisclosure] = useState('');

  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const [showSeoTips, setShowSeoTips] = useState(true);
  const autosaveTimer = useRef<number | null>(null);
  const loadedRef = useRef(false);

  const signedInAuthor = useMemo(
    () => ({ id: user?.uid ?? null, email: user?.email ?? '', name: user?.displayName ?? 'HazardNet Team' }),
    [user],
  );

  // Load existing article (edit mode)
  useEffect(() => {
    if (mode !== 'edit' || !id || loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      const result = await getArticleById(id);
      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Article not found.');
        setLoading(false);
        return;
      }
      const article = result.data;
      setArticleId(article.id);
      setTitle(article.title);
      setSlug(article.slug);
      setSlugEdited(true);
      setExcerpt(article.excerpt);
      setCategory(article.category);
      setTags(article.tags.join(', '));
      setCoverImageUrl(article.coverImageUrl ?? '');
      setContentHtml(article.contentHtml);
      setStatus(article.status);
      setPublishedSlug(article.status === 'published' ? article.slug : null);
      setMetaTitle(article.metaTitle ?? '');
      setMetaDescription(article.metaDescription ?? '');
      setFocusKeyword(article.focusKeyword ?? '');
      setCanonicalUrl(article.canonicalUrl ?? '');
      setOgImageUrl(article.ogImageUrl ?? '');
      setRobotsNoIndex(article.robotsNoIndex ?? false);
      setFaqs(article.faqs ?? []);
      setAuthorName(article.authorName ?? '');
      setAuthorTitle(article.authorTitle ?? '');
      setAuthorBio(article.authorBio ?? '');
      setAuthorAvatarUrl(article.authorAvatarUrl ?? '');
      setAuthorWebsite(article.authorWebsite ?? '');
      setContainsAffiliateLinks(article.containsAffiliateLinks ?? false);
      setAffiliateDisclosure(article.affiliateDisclosure ?? '');
      setLoading(false);
    })();
  }, [mode, id]);

  // Default the author byline from the signed-in superadmin (editable).
  useEffect(() => {
    if (mode === 'new' && user && !authorName) {
      setAuthorName(user.displayName ?? 'HazardNet Team');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mode]);

  // Slug follows the title until manually edited
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(title));
  }, [title, slugEdited]);

  // Debounced autosave to localStorage (draft safety net)
  const autosavePayload = JSON.stringify({
    title, slug, excerpt, category, tags, coverImageUrl, contentHtml, status,
    metaTitle, metaDescription, focusKeyword, canonicalUrl, ogImageUrl, robotsNoIndex, faqs,
    authorName, authorTitle, authorBio, authorAvatarUrl, authorWebsite,
    containsAffiliateLinks, affiliateDisclosure,
  });
  useEffect(() => {
    if (loading || !dirty || !title.trim()) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(autosaveKey(articleId ?? 'new'), JSON.stringify({ ...JSON.parse(autosavePayload), at: Date.now() }));
        setLastAutosavedAt(new Date().toLocaleTimeString());
        setDirty(false);
      } catch {
        /* best effort */
      }
    }, 1500);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [articleId, autosavePayload, dirty, loading, title]);

  const markDirty = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  const buildDraft = async (): Promise<BlogArticleDraft | null> => {
    if (!title.trim()) {
      toast.error('Add a title before saving.');
      return null;
    }
    if (!contentHtml.trim() || !contentHtml.replace(/<[^>]*>/g, '').trim()) {
      toast.error('Write some content before saving.');
      return null;
    }
    const existing = await listArticles();
    const others = existing.data.filter((a) => a.id !== articleId).map((a) => a.slug);
    const finalSlug = ensureUniqueSlug(slug || slugify(title), others);
    if (finalSlug !== slug) setSlug(finalSlug);
    return {
      slug: finalSlug,
      title: title.trim(),
      excerpt: excerpt.trim() || `${contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}…`,
      contentHtml,
      coverImageUrl: coverImageUrl.trim() || null,
      category,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      status,
      authorId: signedInAuthor.id,
      // author_email is the security/permission identity (RLS-checked); the
      // public byline is fully editable via the author fields below.
      authorEmail: signedInAuthor.email,
      authorName: authorName.trim() || signedInAuthor.name,
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      focusKeyword: focusKeyword.trim(),
      canonicalUrl: canonicalUrl.trim(),
      ogImageUrl: ogImageUrl.trim(),
      robotsNoIndex,
      faqs: faqs.filter((faq) => faq.question.trim() && faq.answer.trim()),
      authorTitle: authorTitle.trim(),
      authorBio: authorBio.trim(),
      authorAvatarUrl: authorAvatarUrl.trim(),
      authorWebsite: authorWebsite.trim(),
      containsAffiliateLinks,
      affiliateDisclosure: affiliateDisclosure.trim(),
    };
  };

  const handleSave = async (nextStatus?: 'draft' | 'published') => {
    const effectiveStatus = nextStatus ?? status;
    const draft = await buildDraft();
    if (!draft) return;
    setSaving(true);
    try {
      if (articleId) {
        const result = await updateArticle(articleId, { ...draft, status: effectiveStatus }, signedInAuthor);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(effectiveStatus === 'published' ? `Published at /blogs/${draft.slug}` : 'Article updated.');
      } else {
        const result = await createArticle({ ...draft, status: effectiveStatus }, signedInAuthor);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setArticleId(result.data?.id ?? null);
        navigate(`/dashboard/blog/edit/${result.data?.id}`, { replace: true });
        toast.success(effectiveStatus === 'published' ? `Published at /blogs/${draft.slug}` : 'Draft saved.');
      }
      setStatus(effectiveStatus);
      setDirty(false);
      setPublishedSlug(effectiveStatus === 'published' ? draft.slug : null);
      try {
        localStorage.removeItem(autosaveKey(articleId ?? 'new'));
      } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  };

  const seo = useMemo(
    () =>
      seoScore({
        id: articleId ?? 'preview',
        slug: slug || 'preview-slug',
        title,
        excerpt,
        contentHtml,
        coverImageUrl: coverImageUrl || null,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        status,
        authorId: null,
        authorEmail: '',
        authorName,
        createdAt: '',
        updatedAt: '',
        publishedAt: null,
        metaTitle,
        metaDescription,
        focusKeyword,
        canonicalUrl,
        ogImageUrl,
        robotsNoIndex,
        faqs,
        authorTitle,
        authorBio,
        authorAvatarUrl: '',
        authorWebsite: '',
        containsAffiliateLinks,
        affiliateDisclosure,
      }),
    [articleId, slug, title, excerpt, contentHtml, coverImageUrl, category, tags, status, authorName, metaTitle, metaDescription, focusKeyword, canonicalUrl, ogImageUrl, robotsNoIndex, faqs, authorTitle, authorBio, containsAffiliateLinks, affiliateDisclosure],
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" role="status">
        <span className="w-8 h-8 border-[3px] border-carbon-20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center">
        <span className="text-3xl">📄</span>
        <h1 className="text-lg font-black text-carbon-90">Article unavailable</h1>
        <p className="text-sm text-carbon-60">{loadError}</p>
        <Link to="/dashboard/blog" className="bg-carbon-90 px-4 py-2.5 text-xs font-black text-white hover:bg-carbon-70">
          Back to Blog Studio
        </Link>
      </div>
    );
  }

  const serpTitle = effectiveMetaTitle({ metaTitle, title });
  const serpDescription = effectiveMetaDescription({ metaDescription, excerpt, contentHtml });
  const serpUrl = `hazardnet.live › blogs › ${slug || 'your-slug'}`;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-6xl mx-auto space-y-5 pb-10">
      <Breadcrumbs />

      {/* Editor header */}
      <div className="bg-white border border-carbon-20/90 p-5 relative overflow-hidden space-y-3">
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-nasa-red" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-carbon-60 uppercase tracking-wider">
              <MaterialIcon name="doc" className="w-3.5 h-3.5 text-nasa-red-shade" />
              Blog Studio · {mode === 'new' ? 'New article' : 'Editing'}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-carbon-90 tracking-tight mt-1">
              {mode === 'new' ? 'Write a new article' : 'Edit article'}
            </h1>
            {publishedSlug && (
              <Link to={`/blogs/${publishedSlug}`} className="text-xs font-bold font-mono text-amber-700 hover:underline">
                Live at /blogs/{publishedSlug} ↗
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/blog"
              className="px-3.5 py-2 border border-carbon-20 bg-white text-xs font-black text-carbon-70 hover:bg-carbon-10"
            >
              ← All articles
            </Link>
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="px-3.5 py-2 border border-carbon-30 bg-white text-xs font-black text-carbon-80 hover:bg-carbon-10 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={saving}
              className="px-4 py-2 bg-nasa-red text-xs font-black text-white hover:bg-nasa-red-shade disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Publishing…' : status === 'published' ? 'Update & keep live' : 'Publish'}
            </button>
          </div>
        </div>
        <p className="text-xs font-mono text-carbon-60">
          {dirty ? 'Unsaved changes — autosaving locally…' : lastAutosavedAt ? `Local autosave ${lastAutosavedAt}` : 'Changes autosave locally as you write.'}
          {isLocalDemoMode() && ' · Local demo mode (browser storage only)'}
        </p>
      </div>

      {/* Content + sidebars */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-4">
          {/* Core content */}
          <div className="bg-white border border-carbon-20/90 p-5 space-y-4">
            <div>
              <label htmlFor="blog-title" className="block text-xs font-bold text-carbon-80 mb-1.5">Title</label>
              <input
                id="blog-title"
                value={title}
                onChange={(e) => markDirty(setTitle)(e.target.value)}
                placeholder="e.g. Tracking Jamuna river erosion with Sentinel-2 NDWI"
                className={`${inputClass} text-sm font-bold`}
              />
            </div>
            <div>
              <label htmlFor="blog-slug" className="block text-xs font-bold text-carbon-80 mb-1.5">
                URL slug <span className="text-carbon-60 font-medium">(public page: /blogs/{slug || 'your-slug'})</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="blog-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    markDirty(setSlug)(slugify(e.target.value));
                  }}
                  placeholder="auto-generated-from-title"
                  className={`${inputClass} font-mono`}
                />
                {slugEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlugEdited(false);
                      setSlug(slugify(title));
                    }}
                    className="shrink-0 px-2.5 py-2 border border-carbon-20 text-xs font-black text-carbon-60 hover:bg-carbon-10 cursor-pointer"
                    title="Re-generate from title"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="blog-excerpt" className="block text-xs font-bold text-carbon-80 mb-1.5">Excerpt / summary</label>
              <textarea
                id="blog-excerpt"
                value={excerpt}
                onChange={(e) => markDirty(setExcerpt)(e.target.value)}
                rows={2}
                placeholder="One or two sentences shown on the blog index and shares (auto-generated if empty)."
                className={`${inputClass} resize-y`}
              />
            </div>
          </div>

          <RichTextEditor value={contentHtml} onChange={markDirty(setContentHtml)} />

          {/* ── SEO & Google Search Console ───────────────────────────── */}
          <div className="bg-white border border-carbon-20/90 p-5 space-y-4" data-testid="seo-panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-carbon-90 font-mono flex items-center gap-1.5">
                <MaterialIcon name="search" className="w-4 h-4 text-nasa-red-shade" /> SEO &amp; Google Search Console
              </h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-black ${
                  seo.score >= 80 ? 'bg-carbon-05 text-carbon-80' : seo.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-white text-nasa-red-shade'
                }`}
                data-testid="seo-score"
              >
                SEO score {seo.score}%
              </span>
            </div>

            {/* Google SERP preview */}
            <div className="border border-carbon-20 bg-carbon-05 p-4" data-testid="serp-preview">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-carbon-60">Google result preview</p>
              <p className="truncate text-xs text-[#4d5156] leading-none mb-1">{serpUrl}</p>
              <p className="text-[15px] leading-snug text-[#1a0dab] font-medium truncate">{serpTitle || 'Your SEO title appears here'}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#4d5156] line-clamp-2">
                {serpDescription || 'Your meta description appears here — write 120–160 characters that make searchers click.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="blog-meta-title" className="block text-xs font-bold text-carbon-80 mb-1.5">
                  SEO title <span className={metaTitle.length > 60 ? 'text-rose-600' : 'text-carbon-60 font-medium'}>({metaTitle.length}/60)</span>
                </label>
                <input
                  id="blog-meta-title"
                  value={metaTitle}
                  onChange={(e) => markDirty(setMetaTitle)(e.target.value)}
                  maxLength={70}
                  placeholder="Defaults to the article title"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="blog-focus-keyword" className="block text-xs font-bold text-carbon-80 mb-1.5">Focus keyword</label>
                <input
                  id="blog-focus-keyword"
                  value={focusKeyword}
                  onChange={(e) => markDirty(setFocusKeyword)(e.target.value)}
                  placeholder="e.g. flood forecasting Bangladesh"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="blog-meta-description" className="block text-xs font-bold text-carbon-80 mb-1.5">
                Meta description <span className={metaDescription.length > 160 ? 'text-rose-600' : 'text-carbon-60 font-medium'}>({metaDescription.length}/160)</span>
              </label>
              <textarea
                id="blog-meta-description"
                value={metaDescription}
                onChange={(e) => markDirty(setMetaDescription)(e.target.value)}
                rows={2}
                maxLength={180}
                placeholder="Defaults to the excerpt — the snippet Google shows under your title."
                className={`${inputClass} resize-y`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="blog-canonical" className="block text-xs font-bold text-carbon-80 mb-1.5">Canonical URL <span className="text-carbon-60 font-medium">(optional)</span></label>
                <input
                  id="blog-canonical"
                  value={canonicalUrl}
                  onChange={(e) => markDirty(setCanonicalUrl)(e.target.value)}
                  placeholder="https://hazardnet.live/blogs/…"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label htmlFor="blog-og-image" className="block text-xs font-bold text-carbon-80 mb-1.5">Social share image (og:image) <span className="text-carbon-60 font-medium">(optional)</span></label>
                <input
                  id="blog-og-image"
                  value={ogImageUrl}
                  onChange={(e) => markDirty(setOgImageUrl)(e.target.value)}
                  placeholder="Defaults to the cover image"
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <label htmlFor="blog-noindex" className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                id="blog-noindex"
                type="checkbox"
                checked={robotsNoIndex}
                onChange={(e) => markDirty(setRobotsNoIndex)(e.target.checked)}
                className="h-4 w-4 rounded border-carbon-30 accent-nasa-blue cursor-pointer"
              />
              <span className="text-xs font-semibold text-carbon-60">
                Hide from search engines <span className="font-mono text-xs text-carbon-60">(meta robots: noindex, follow)</span>
              </span>
            </label>

            {/* FAQ builder → FAQPage rich results */}
            <div className="border border-carbon-20 p-4 space-y-3" data-testid="faq-builder">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-carbon-80 flex items-center gap-1.5">
                  <MaterialIcon name="faq" className="w-4 h-4 text-nasa-red-shade" /> FAQ section
                  <span className="text-xs font-medium text-carbon-60">(emits FAQPage schema → Google rich results)</span>
                </p>
                <button
                  type="button"
                  onClick={() => markDirty(setFaqs)([...faqs, { question: '', answer: '' }])}
                  className="border border-carbon-20 px-2.5 py-1.5 text-xs font-black text-carbon-70 hover:bg-carbon-10 cursor-pointer"
                >
                  + Add question
                </button>
              </div>
              {faqs.length === 0 && (
                <p className="text-xs text-carbon-60">3–5 concise Q&amp;As targeting “People also ask” queries works best.</p>
              )}
              {faqs.map((faq, index) => (
                <div key={index} className="space-y-2 bg-carbon-05 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={faq.question}
                      onChange={(e) => markDirty(setFaqs)(faqs.map((f, i) => (i === index ? { ...f, question: e.target.value } : f)))}
                      placeholder={`Question ${index + 1} — e.g. How accurate is satellite flood forecasting?`}
                      className={inputClass}
                      aria-label={`FAQ question ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => markDirty(setFaqs)(faqs.filter((_, i) => i !== index))}
                      className="shrink-0 border border-nasa-red p-2 text-rose-500 hover:bg-white cursor-pointer"
                      aria-label={`Remove FAQ ${index + 1}`}
                    >
                      <MaterialIcon name="delete" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={faq.answer}
                    onChange={(e) => markDirty(setFaqs)(faqs.map((f, i) => (i === index ? { ...f, answer: e.target.value } : f)))}
                    rows={2}
                    placeholder="Concise answer (40–90 words is the sweet spot for featured snippets)."
                    className={`${inputClass} resize-y`}
                    aria-label={`FAQ answer ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {/* Live SEO checklist */}
            <div>
              <button
                type="button"
                onClick={() => setShowSeoTips((v) => !v)}
                aria-expanded={showSeoTips}
                className="flex w-full items-center justify-between px-1 py-1.5 text-xs font-black text-carbon-60 hover:text-carbon-90 cursor-pointer"
              >
                <span>SEO checklist ({seo.passedCount}/{seo.checks.length} passed · {seo.wordCount} words)</span>
                <span aria-hidden="true">{showSeoTips ? '▾' : '▸'}</span>
              </button>
              {showSeoTips && (
                <ul className="mt-2 space-y-1.5 bg-carbon-05 p-3.5" data-testid="seo-checklist">
                  {seo.checks.map((check) => (
                    <SeoCheckRow key={check.id} passed={check.passed} label={check.label} advice={check.advice} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar settings */}
        <aside className="space-y-4">
          <div className="bg-white border border-carbon-20/90 p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-carbon-90 font-mono">Publishing</h3>
            <div>
              <label htmlFor="blog-status" className="block text-xs font-bold text-carbon-80 mb-1.5">Status</label>
              <select
                id="blog-status"
                value={status}
                onChange={(e) => markDirty(setStatus)(e.target.value as 'draft' | 'published')}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="draft">Draft (not public)</option>
                <option value="published">Published (live at /blogs/{slug || '…'})</option>
              </select>
            </div>
            <div>
              <label htmlFor="blog-category" className="block text-xs font-bold text-carbon-80 mb-1.5">Category</label>
              <select
                id="blog-category"
                value={category}
                onChange={(e) => markDirty(setCategory)(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="blog-tags" className="block text-xs font-bold text-carbon-80 mb-1.5">
                Tags <span className="text-carbon-60 font-medium">(comma separated)</span>
              </label>
              <input
                id="blog-tags"
                value={tags}
                onChange={(e) => markDirty(setTags)(e.target.value)}
                placeholder="SAR, Cyclone, Satkhira"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="blog-cover" className="block text-xs font-bold text-carbon-80 mb-1.5">Cover image URL</label>
              <input
                id="blog-cover"
                value={coverImageUrl}
                onChange={(e) => markDirty(setCoverImageUrl)(e.target.value)}
                placeholder="https://…/cover.jpg"
                className={inputClass}
              />
              {coverImageUrl && (
                <img src={coverImageUrl} alt="Cover preview" className="mt-2 border border-carbon-20 h-28 w-full object-cover" />
              )}
            </div>
          </div>

          {/* Editable author byline */}
          <div className="bg-white border border-carbon-20/90 p-5 space-y-3" data-testid="author-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-carbon-90 font-mono">Author byline</h3>
              <button
                type="button"
                onClick={() => {
                  markDirty(setAuthorName)(signedInAuthor.name);
                  setDirty(true);
                }}
                className="rounded-sm px-2 py-1 text-xs font-black text-amber-700 hover:bg-amber-50 cursor-pointer"
                title="Reset display name to your account name"
              >
                Use my profile
              </button>
            </div>
            <div>
              <label htmlFor="blog-author-name" className="block text-xs font-bold text-carbon-80 mb-1">Display name</label>
              <input
                id="blog-author-name"
                value={authorName}
                onChange={(e) => markDirty(setAuthorName)(e.target.value)}
                placeholder="e.g. Dr. M. Rahman"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="blog-author-title" className="block text-xs font-bold text-carbon-80 mb-1">Title / role</label>
              <input
                id="blog-author-title"
                value={authorTitle}
                onChange={(e) => markDirty(setAuthorTitle)(e.target.value)}
                placeholder="e.g. Remote Sensing Specialist"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="blog-author-bio" className="block text-xs font-bold text-carbon-80 mb-1">Short bio</label>
              <textarea
                id="blog-author-bio"
                value={authorBio}
                onChange={(e) => markDirty(setAuthorBio)(e.target.value)}
                rows={2}
                maxLength={280}
                placeholder="One or two sentences shown under the article (E-E-A-T signal for Google)."
                className={`${inputClass} resize-y`}
              />
            </div>
            <div>
              <label htmlFor="blog-author-avatar" className="block text-xs font-bold text-carbon-80 mb-1">Avatar URL</label>
              <input
                id="blog-author-avatar"
                value={authorAvatarUrl}
                onChange={(e) => markDirty(setAuthorAvatarUrl)(e.target.value)}
                placeholder="https://…/author.jpg"
                className={`${inputClass} font-mono`}
              />
              {authorAvatarUrl && (
                <img src={authorAvatarUrl} alt="Author preview" className="mt-2 h-12 w-12 rounded-full border border-carbon-20 object-cover" />
              )}
            </div>
            <div>
              <label htmlFor="blog-author-website" className="block text-xs font-bold text-carbon-80 mb-1">Website / profile link</label>
              <input
                id="blog-author-website"
                value={authorWebsite}
                onChange={(e) => markDirty(setAuthorWebsite)(e.target.value)}
                placeholder="https://linkedin.com/in/…"
                className={`${inputClass} font-mono`}
              />
            </div>
            <p className="bg-carbon-05 p-2.5 text-xs leading-relaxed text-carbon-60">
              Publisher account (permissions): <span className="font-mono font-bold text-carbon-60">{signedInAuthor.email || 'signed-out'}</span> — only
              primary superadmins can save; the public byline above is fully editable.
            </p>
          </div>

          {/* Monetization */}
          <div className="bg-white border border-carbon-20/90 p-5 space-y-3" data-testid="monetization-panel">
            <h3 className="text-xs font-black uppercase tracking-wider text-carbon-90 font-mono">Monetization</h3>
            <label htmlFor="blog-affiliate" className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                id="blog-affiliate"
                type="checkbox"
                checked={containsAffiliateLinks}
                onChange={(e) => markDirty(setContainsAffiliateLinks)(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-carbon-30 accent-nasa-blue cursor-pointer"
              />
              <span className="text-xs font-semibold leading-relaxed text-carbon-60">
                Contains affiliate links
                <span className="block text-xs font-medium text-carbon-60">
                  Shows a disclosure notice and tags outbound links rel=&quot;sponsored nofollow&quot; (Google policy).
                </span>
              </span>
            </label>
            <textarea
              id="blog-affiliate-disclosure"
              value={affiliateDisclosure}
              onChange={(e) => markDirty(setAffiliateDisclosure)(e.target.value)}
              rows={3}
              placeholder="Affiliate disclosure shown at the top of the article…"
              className={`${inputClass} resize-y`}
              aria-label="Affiliate disclosure text"
            />
            <p className="text-xs leading-relaxed text-carbon-60">
              AdSense runs automatically on the blog pages once{' '}
              <span className="font-mono">VITE_ADSENSE_CLIENT</span> is configured.
            </p>
          </div>
        </aside>
      </div>
    </motion.div>
  );
};

export default BlogEditorPage;
