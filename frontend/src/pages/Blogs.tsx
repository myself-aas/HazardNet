import MaterialIcon from '../components/MaterialIcon';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Breadcrumbs from '../components/Breadcrumbs';
import { BlogArticle, listPublishedArticles, readingTimeMinutes } from '../lib/blogArticles';
import { buildBlogIndexHead } from '../lib/blogSeo';
import { useSeoHead } from '../lib/seoHead';
import { useAuth } from '../context/AuthContext';
import { isPrimarySuperAdmin } from '../lib/superadmins';
import { DataStateEmpty, DataStateError, DataStateLoading } from '../components/ui/DataState';

export const Blogs: React.FC = () => {
  const { user, loading } = useAuth();
  const [liveArticles, setLiveArticles] = useState<BlogArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setArticlesLoading(true);
    setArticlesError(null);
    void listPublishedArticles().then((result) => {
      if (cancelled) return;
      setLiveArticles(result.data ?? []);
      // An empty list and a list that could not be read are different pages: `data: []` with an
      // error means "say it failed", not "there is nothing to show" (audit P2-3).
      setArticlesError(result.error ? String(result.error) : null);
      setArticlesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const indexHead = useMemo(() => buildBlogIndexHead({ origin: window.location.origin }), []);
  useSeoHead(indexHead);

  const showStudioButton = !loading && Boolean(user) && isPrimarySuperAdmin(user?.email);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      <Breadcrumbs />

      <div className="rounded-2xl bg-white border border-carbon-20/90 p-6 md:p-8 space-y-3">
        <h1 className="text-ap-lead sm:text-ap-display-md font-bold leading-tight text-carbon-90 tracking-tight">
          HazardNet AI Blog & Field Deployment Studies
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-carbon-60">Research Insights & Field Reports</span>
          <span className="text-carbon-60">•</span>
          <span className="text-xs text-carbon-60 font-semibold">HazardNet Knowledge Base</span>
        </div>

        <p className="text-carbon-70 text-base leading-[1.62] max-w-[68ch]">
          Technical deep-dives, remote sensing methodologies, field deployment case studies, and low-bandwidth
          engineering notes written by the HazardNet research team. Every article opens on its own page with a unique
          URL.
        </p>

        {showStudioButton && (
          <Link
            to="/dashboard/blog"
            data-testid="blog-studio-btn"
            className="inline-flex min-h-[44px] items-center gap-2 bg-primary px-4 py-2.5 text-base font-semibold text-ap-action-fg hover:bg-primary-strong touch-manipulation"
          >
            <MaterialIcon name="doc" className="w-4 h-4" /> Blog Studio: write & manage articles
          </Link>
        )}
      </div>

      {articlesLoading && <DataStateLoading label="Loading published articles" loader={false} />}

      {!articlesLoading && articlesError && (
        <DataStateError
          title="The article list could not be loaded"
          detail={articlesError}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      )}

      {!articlesLoading && !articlesError && liveArticles.length === 0 && (
        <DataStateEmpty
          title="No articles are published yet"
          body="When the research team publishes one, it appears here with its own page and URL."
        />
      )}

      {liveArticles.length > 0 && (
        <section className="space-y-3" data-testid="live-articles">
          <h2 className="text-base font-bold text-carbon-90">Latest articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveArticles.map((article) => (
              <Link
                key={article.id}
                to={`/blogs/${article.slug}`}
                className="rounded-2xl group bg-white border border-carbon-20/70 p-5 hover:border-carbon-40 transition-colors flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-carbon-05 text-carbon-80 border border-carbon-20 font-semibold">
                      {article.category}
                    </span>
                    <span className="text-carbon-60">
                      {article.publishedAt ? `${article.publishedAt.slice(0, 10)} · ` : ''}
                      {readingTimeMinutes(article.contentHtml)} min read
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-carbon-90 group-hover:text-ap-link leading-snug">
                    {article.title}
                  </h3>
                  <p className="text-base leading-[1.62] text-carbon-70 line-clamp-2">{article.excerpt}</p>
                </div>
                <div className="text-xs text-carbon-60 flex items-center justify-between">
                  <span>{article.authorName}</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-carbon-90 group-hover:text-ap-link">
                    Read article <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
};

export default Blogs;
