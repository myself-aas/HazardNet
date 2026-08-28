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
  createArticle,
  ensureUniqueSlug,
  getArticleById,
  isLocalDemoMode,
  listArticles,
  slugify,
  updateArticle,
} from '../../lib/blogArticles';

/**
 * Full-page blog article editor (dedicated dashboard route, not a popup or
 * inline component): /dashboard/blog/new and /dashboard/blog/edit/:id.
 * Autosaves drafts to localStorage, generates unique slugs, and supports
 * draft/published workflow. Public article URL: /blogs/:slug.
 */

const CATEGORIES = ['Remote Sensing', 'Field Deployment', 'Edge AI', 'Agronomy', 'Research', 'General'];

const inputClass =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 font-medium transition-all focus:outline-none focus:border-[#f9a825] focus:ring-2 focus:ring-[#f9a825]/40';

const autosaveKey = (id: string) => `hazardnet.blog.draft.${id}`;

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
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const loadedRef = useRef(false);

  const author = useMemo(
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
      setLoading(false);
    })();
  }, [mode, id]);

  // Slug follows the title until manually edited
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(title));
  }, [title, slugEdited]);

  // Debounced autosave to localStorage (draft safety net)
  useEffect(() => {
    if (loading || !dirty || !title.trim()) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          autosaveKey(articleId ?? 'new'),
          JSON.stringify({ title, slug, excerpt, category, tags, coverImageUrl, contentHtml, status, at: Date.now() }),
        );
        setLastAutosavedAt(new Date().toLocaleTimeString());
        setDirty(false);
      } catch {
        /* best effort */
      }
    }, 1500);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [articleId, title, slug, excerpt, category, tags, coverImageUrl, contentHtml, status, dirty, loading]);

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
      authorId: author.id,
      authorEmail: author.email,
      authorName: author.name,
    };
  };

  const handleSave = async (nextStatus?: 'draft' | 'published') => {
    const effectiveStatus = nextStatus ?? status;
    const draft = await buildDraft();
    if (!draft) return;
    setSaving(true);
    try {
      if (articleId) {
        const result = await updateArticle(articleId, { ...draft, status: effectiveStatus }, author);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(effectiveStatus === 'published' ? `Published at /blogs/${draft.slug}` : 'Article updated.');
      } else {
        const result = await createArticle({ ...draft, status: effectiveStatus }, author);
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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" role="status">
        <span className="w-8 h-8 border-[3px] border-slate-200 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center">
        <span className="text-3xl">📄</span>
        <h1 className="text-lg font-black text-slate-900">Article unavailable</h1>
        <p className="text-sm text-slate-600">{loadError}</p>
        <Link to="/dashboard/blog" className="rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700">
          Back to Blog Studio
        </Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-5xl mx-auto space-y-5 pb-10">
      <Breadcrumbs />

      {/* Editor header */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-md relative overflow-hidden space-y-3">
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              <MaterialIcon name="doc" className="w-3.5 h-3.5 text-[#d08305]" />
              Blog Studio · {mode === 'new' ? 'New article' : 'Editing'}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mt-1">
              {mode === 'new' ? 'Write a new article' : 'Edit article'}
            </h1>
            {publishedSlug && (
              <Link to={`/blogs/${publishedSlug}`} className="text-[11px] font-bold font-mono text-amber-700 hover:underline">
                Live at /blogs/{publishedSlug} ↗
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/blog"
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-black text-slate-700 hover:bg-slate-100"
            >
              ← All articles
            </Link>
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-[11px] font-black text-slate-800 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#f9a825] text-[11px] font-black text-slate-950 shadow-md hover:bg-[#d08305] disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Publishing…' : status === 'published' ? 'Update & keep live' : 'Publish'}
            </button>
          </div>
        </div>
        <p className="text-[10px] font-mono text-slate-400">
          {dirty ? 'Unsaved changes — autosaving locally…' : lastAutosavedAt ? `Local autosave ${lastAutosavedAt}` : 'Changes autosave locally as you write.'}
          {isLocalDemoMode() && ' · Local demo mode (browser storage only)'}
        </p>
      </div>

      {/* Metadata + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <label htmlFor="blog-title" className="block text-xs font-bold text-slate-800 mb-1.5">Title</label>
              <input
                id="blog-title"
                value={title}
                onChange={(e) => markDirty(setTitle)(e.target.value)}
                placeholder="e.g. Tracking Jamuna river erosion with Sentinel-2 NDWI"
                className={`${inputClass} text-sm font-bold`}
              />
            </div>
            <div>
              <label htmlFor="blog-slug" className="block text-xs font-bold text-slate-800 mb-1.5">
                URL slug <span className="text-slate-400 font-medium">(public page: /blogs/{slug || 'your-slug'})</span>
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
                    className="shrink-0 px-2.5 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Re-generate from title"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="blog-excerpt" className="block text-xs font-bold text-slate-800 mb-1.5">Excerpt / summary</label>
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
        </div>

        {/* Sidebar settings */}
        <aside className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 font-mono">Publishing</h3>
            <div>
              <label htmlFor="blog-status" className="block text-xs font-bold text-slate-800 mb-1.5">Status</label>
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
              <label htmlFor="blog-category" className="block text-xs font-bold text-slate-800 mb-1.5">Category</label>
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
              <label htmlFor="blog-tags" className="block text-xs font-bold text-slate-800 mb-1.5">
                Tags <span className="text-slate-400 font-medium">(comma separated)</span>
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
              <label htmlFor="blog-cover" className="block text-xs font-bold text-slate-800 mb-1.5">Cover image URL</label>
              <input
                id="blog-cover"
                value={coverImageUrl}
                onChange={(e) => markDirty(setCoverImageUrl)(e.target.value)}
                placeholder="https://…/cover.jpg"
                className={inputClass}
              />
              {coverImageUrl && (
                <img src={coverImageUrl} alt="Cover preview" className="mt-2 rounded-xl border border-slate-200 h-28 w-full object-cover" />
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 font-mono">Author</h3>
            <p className="text-xs font-bold text-slate-800">{author.name}</p>
            <p className="text-[11px] font-mono text-slate-500">{author.email}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Articles record the author identity at save time. Only primary superadmins can save or publish.
            </p>
          </div>
        </aside>
      </div>
    </motion.div>
  );
};

export default BlogEditorPage;
