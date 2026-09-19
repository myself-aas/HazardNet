import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from '../../components/MaterialIcon';
import Breadcrumbs from '../../components/Breadcrumbs';
import { useAuth } from '../../context/AuthContext';
import {
  BlogArticle,
  deleteArticle,
  listArticles,
  updateArticle,
} from '../../lib/blogArticles';

/**
 * Blog Studio — superadmin article management (dedicated dashboard pages,
 * not popups). Reached at /dashboard/blog; the editor lives at
 * /dashboard/blog/new and /dashboard/blog/edit/:id, and every published
 * article gets its own public URL at /blogs/:slug.
 */
export const BlogStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const author = useMemo(
    () => ({ id: user?.uid ?? null, email: user?.email ?? '', name: user?.displayName ?? 'HazardNet Team' }),
    [user],
  );

  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localDemo, setLocalDemo] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listArticles();
    setArticles(result.data);
    setError(result.error);
    setLocalDemo(result.localDemo);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const togglePublish = async (article: BlogArticle) => {
    if (!user) return;
    setBusyId(article.id);
    const nextStatus = article.status === 'published' ? 'draft' : 'published';
    const result = await updateArticle(
      article.id,
      { status: nextStatus },
      { id: user.uid, email: user.email ?? '', name: user.displayName ?? '' },
    );
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(nextStatus === 'published' ? `Published “${article.title}” at /blogs/${article.slug}` : `Unpublished “${article.title}”`);
    void reload();
  };

  const handleDelete = async (article: BlogArticle) => {
    if (!user) return;
    setBusyId(article.id);
    const result = await deleteArticle(article.id, author);
    setBusyId(null);
    setConfirmingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deleted “${article.title}”`);
    void reload();
  };

  const published = articles.filter((a) => a.status === 'published').length;
  const drafts = articles.length - published;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      <Breadcrumbs />

      {/* Header */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-md relative overflow-hidden space-y-4">
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-nasa-red" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-carbon-60 uppercase tracking-wider">
              <MaterialIcon name="article" className="w-3.5 h-3.5 text-nasa-red-shade" />
              User Dashboard · Content Administration
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-carbon-90 tracking-tight mt-1">Blog Studio</h1>
            <p className="text-xs text-carbon-60 mt-1">
              Create, edit, publish and delete HazardNet blog articles. Signed in as{' '}
              <span className="font-mono font-bold text-carbon-70">{user?.email}</span> (primary superadmin).
            </p>
          </div>
          <Link
            to="/dashboard/blog/new"
            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-nasa-red px-4 py-2.5 text-xs font-black text-carbon-black shadow-md transition-colors hover:bg-nasa-red-shade cursor-pointer"
          >
            <MaterialIcon name="doc" className="w-4 h-4" /> New article
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Total articles', value: articles.length },
            { label: 'Published', value: published },
            { label: 'Drafts', value: drafts },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-carbon-20 bg-carbon-05 px-3.5 py-2.5">
              <p className="font-mono text-lg font-black text-carbon-90">{stat.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-carbon-60">{stat.label}</p>
            </div>
          ))}
        </div>

        {localDemo && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
            Local demo mode — Supabase is not configured, so articles persist in this browser only. Configure Supabase
            for production storage.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-800">
            {error} — verify the blog_articles table exists.
          </p>
        )}
      </div>

      {/* Article table */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl shadow-md overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center" role="status">
            <span className="w-7 h-7 border-[3px] border-carbon-20 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <span className="text-3xl">📝</span>
            <p className="text-sm font-bold text-carbon-80">No articles yet</p>
            <p className="text-xs text-carbon-60">Write the first HazardNet field report or research deep-dive.</p>
            <Link
              to="/dashboard/blog/new"
              className="inline-block rounded-2xl bg-nasa-red px-4 py-2.5 text-xs font-black text-carbon-black shadow-md hover:bg-nasa-red-shade"
            >
              Start writing
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-carbon-10">
            {articles.map((article) => (
              <li key={article.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 hover:bg-carbon-05/60 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                        article.status === 'published'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-carbon-10 text-carbon-60 border-carbon-20'
                      }`}
                    >
                      {article.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-carbon-10 border border-carbon-20 text-carbon-70">
                      {article.category}
                    </span>
                    <span className="text-[10px] font-mono text-carbon-60">
                      /blogs/{article.slug}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-black text-carbon-90 truncate">{article.title}</p>
                  <p className="text-[10px] text-carbon-60 font-medium">
                    Updated {new Date(article.updatedAt || Date.now()).toLocaleDateString()} · {article.authorName}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {article.status === 'published' && (
                    <Link
                      to={`/blogs/${article.slug}`}
                      className="px-2.5 py-1.5 rounded-lg border border-carbon-20 bg-white text-[10px] font-black text-carbon-70 hover:bg-carbon-10"
                      title={`Open /blogs/${article.slug}`}
                    >
                      View
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePublish(article)}
                    disabled={busyId === article.id}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === article.id ? '…' : article.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/blog/edit/${article.id}`)}
                    className="px-2.5 py-1.5 rounded-lg border border-carbon-20 bg-white text-[10px] font-black text-carbon-70 hover:bg-carbon-10 cursor-pointer"
                  >
                    Edit
                  </button>
                  {confirmingId === article.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(article)}
                        disabled={busyId === article.id}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-black hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                      >
                        {busyId === article.id ? 'Deleting…' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="px-2 py-1.5 rounded-lg border border-carbon-20 text-[10px] font-black text-carbon-60 hover:bg-carbon-10 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(article.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-[10px] font-black text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
};

export default BlogStudioPage;
