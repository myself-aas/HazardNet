import MaterialIcon from "../components/MaterialIcon";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { AdSenseScript, BlogAdUnit } from '../components/blog/ads/BlogAdUnit';
import { BlogArticle, listPublishedArticles, readingTimeMinutes } from '../lib/blogArticles';
import { buildBlogIndexHead } from '../lib/blogSeo';
import { useSeoHead } from '../lib/seoHead';
import { ADSENSE_SLOT_BLOG_INDEX } from '../lib/adsense';
import { useAuth } from '../context/AuthContext';
import { isPrimarySuperAdmin } from '../lib/superadmins';
import { STATIC_BLOG_POSTS, staticBlogPostPath } from '../lib/staticBlogPosts';

export const Blogs: React.FC = () => {
  const { user, loading } = useAuth();
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [liveArticles, setLiveArticles] = useState<BlogArticle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listPublishedArticles().then((result) => {
      if (!cancelled && !result.error) setLiveArticles(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexHead = useMemo(() => buildBlogIndexHead({ origin: window.location.origin }), []);
  useSeoHead(indexHead);

  const showStudioButton = !loading && Boolean(user) && isPrimarySuperAdmin(user?.email);

  const filteredPosts = STATIC_BLOG_POSTS.filter(
    (post) => filterCategory === 'All' || post.category === filterCategory
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <AdSenseScript />
      <Breadcrumbs />

      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden space-y-3">
        <div className="absolute top-0 left-0 w-full h-1 bg-nasa-red"></div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-extrabold bg-amber-50 text-amber-900 border border-amber-300 uppercase tracking-wider shadow-2xs">
            Research Insights & Field Reports
          </span>
          <span className="text-carbon-30">•</span>
          <span className="text-xs text-carbon-60 font-semibold">HazardNet Knowledge Base</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-carbon-90 tracking-tight">
          HazardNet AI Blog & Field Deployment Studies
        </h1>
        <p className="text-carbon-60 text-xs md:text-sm leading-relaxed max-w-3xl">
          Technical deep-dives, remote sensing methodologies, field deployment case studies, and edge WebAssembly optimizations written by the HazardNet research team. Every article opens on its own page with a unique URL.
        </p>

        {showStudioButton && (
          <Link
            to="/dashboard/blog"
            data-testid="blog-studio-btn"
            className="inline-flex items-center gap-2 rounded-2xl bg-carbon-90 px-4 py-2.5 text-xs font-black text-white shadow-md transition-colors hover:bg-carbon-70"
          >
            <MaterialIcon name="doc" className="w-4 h-4" /> Blog Studio — write & manage articles
          </Link>
        )}
      </div>

      {liveArticles.length > 0 && (
        <section className="space-y-3" data-testid="live-articles">
          <h2 className="text-sm font-black text-carbon-90 uppercase tracking-wider font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Latest articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveArticles.map((article) => (
              <Link
                key={article.id}
                to={`/blogs/${article.slug}`}
                className="group bg-white border border-emerald-200/70 rounded-3xl p-5 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">{article.category}</span>
                    <span className="text-carbon-60">{readingTimeMinutes(article.contentHtml)} min read</span>
                  </div>
                  <h3 className="text-sm font-black text-carbon-90 group-hover:text-amber-900 leading-snug">{article.title}</h3>
                  <p className="text-xs text-carbon-60 line-clamp-2">{article.excerpt}</p>
                </div>
                <div className="text-[10px] font-mono text-carbon-60 flex items-center justify-between">
                  <span>{article.authorName}</span>
                  <span className="font-black text-carbon-90 group-hover:text-amber-900">Read → /blogs/{article.slug}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <BlogAdUnit slot={ADSENSE_SLOT_BLOG_INDEX} format="horizontal" label="Advertisement" className="not-prose" />

      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
        {['All', 'Remote Sensing', 'Field Deployment', 'Edge AI', 'Agronomy'].map((cat) => (
          <motion.button
            key={cat}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 cursor-pointer ${
              filterCategory === cat
                ? 'bg-nasa-red text-carbon-black font-black shadow-md shadow-amber-500/20'
                : 'bg-white text-carbon-70 border border-carbon-20/90 hover:bg-carbon-05 hover:border-carbon-30 shadow-2xs'
            }`}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="static-blog-grid">
        <AnimatePresence>
          {filteredPosts.map((post) => (
            <motion.article
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              key={post.id}
              whileHover={{ y: -4 }}
            >
              <Link
                to={staticBlogPostPath(post.slug)}
                data-testid={`blog-card-${post.slug}`}
                className="bg-white border border-carbon-20/90 rounded-3xl p-6 shadow-sm hover:border-amber-400/80 hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-5 group relative overflow-hidden h-full no-underline"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="px-2.5 py-1 rounded-lg font-extrabold bg-carbon-10 text-carbon-80 border border-carbon-20/80 group-hover:bg-amber-100 group-hover:border-amber-200 transition-colors">
                      {post.category}
                    </span>
                    <span className="text-carbon-60 font-medium">{post.readTime}</span>
                  </div>

                  <h2 className="text-base font-black text-carbon-90 group-hover:text-amber-900 transition-colors leading-snug">
                    {post.title}
                  </h2>

                  <p className="text-xs text-carbon-60 leading-relaxed line-clamp-3 font-normal">
                    {post.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-carbon-10 flex items-center justify-between text-[11px] text-carbon-60">
                  <span className="font-medium text-carbon-60 font-mono">/blogs/{post.slug}</span>
                  <span className="font-black text-carbon-90 group-hover:text-amber-900 transition-colors flex items-center gap-1">
                    <span>Read Full Article</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </span>
                </div>
              </Link>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default Blogs;
