import { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignUpPage from './pages/SignUpPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { vercelAnalyticsEnabled } from './lib/vercelAnalytics';
import { useHazardNotifications } from './hooks/useHazardNotifications';
import { initializeAttributionCapture } from './services/conversionTracking';
import { RequireSuperAdmin } from './components/blog/RequireSuperAdmin';
import { Toaster } from 'react-hot-toast';

// Route-level code splitting (FE-01): every page is a lazy chunk so the
// initial shell stays small on low-bandwidth networks. Auth screens stay
// eager (first-touch UX); everything else loads on demand.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const Documentation = lazy(() => import('./pages/Documentation'));
const About = lazy(() => import('./pages/About'));
const UseCases = lazy(() => import('./pages/UseCases'));
const DownloadCenter = lazy(() => import('./pages/DownloadCenter'));
const Blogs = lazy(() => import('./pages/Blogs'));
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'));
const BlogStudioPage = lazy(() => import('./pages/dashboard/BlogStudioPage'));
const BlogEditorPage = lazy(() => import('./pages/dashboard/BlogEditorPage'));
const Contact = lazy(() => import('./pages/Contact'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AdvisoriesPage = lazy(() => import('./pages/AdvisoriesPage').then((m) => ({ default: m.AdvisoriesPage })));
const AnalyticsAnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsAnalyticsPage })));
const DistrictDetailPage = lazy(() => import('./pages/DistrictDetailPage').then((m) => ({ default: m.DistrictDetailPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const AlertDetailPage = lazy(() => import('./pages/AlertDetailPage').then((m) => ({ default: m.AlertDetailPage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then((m) => ({ default: m.StatusPage })));
const UserDashboardPage = lazy(() => import('./pages/UserDashboardPage'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'));
const SetPasswordPage = lazy(() => import('./pages/SetPasswordPage'));
const ChatBot = lazy(() => import('./components/ChatBot'));
// Long-form public reference pages. Copy lives in src/content/site-routes.json
// and is prerendered to static HTML at build time (scripts/prerender.mjs).
const ArticlePage = lazy(() => import('./components/ArticlePage'));
// The editorial front door at `/`. Its copy is the `/` entry in the same
// site-routes.json the prerenderer reads; only the live artifact panels are React.
const FrontDoor = lazy(() => import('./pages/FrontDoor'));

/**
 * Generated content pages (Phase 8). The hazard methodology pages, the district outlooks and the
 * season retrospectives are produced by `scripts/build_content_engine.mjs` into
 * `src/content/generated-routes.json`, so their paths depend on the 64-district and 8-hazard lists
 * rather than being written out here one by one. They render through the same long-form page as
 * `/methodology`: `ArticlePage` resolves its copy from the URL, and `usePageSeo` marks a path the
 * engine did not generate `noindex,follow` — so an invented slug such as `/districts/atlantis`
 * gets the unavailable state instead of a page that pretends to be a district outlook.
 */
const GeneratedContentPage: React.FC = () => {
  const { pathname } = useLocation();
  return <ArticlePage path={pathname} />;
};

/** Full-height fallback shown while a lazy route chunk streams in. */
const RouteFallback = () => (
  <div className="w-full min-h-[50vh] flex items-center justify-center" role="status" aria-label="Loading page">
    <span className="w-8 h-8 border-[3px] border-slate-300 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

const AppContent: React.FC = () => {
  const { userProfile } = useAuth();
  useHazardNotifications(userProfile?.homeDistrictId);
  const location = useLocation();

  useEffect(() => {
    initializeAttributionCapture();
  }, []);

  /**
   * `/live` — and only `/live` — is the full-bleed console: transparent navbar over the
   * map, no page padding, no footer. `/` is an editorial page and gets the ordinary
   * document flow (PR #29, "front door" split). `/home`, `/home/overview` and
   * `/forecast/overview` remain valid console deep links, so they keep the full-bleed
   * layout even though they are no longer the canonical address.
   */
  const isHomePage =
    location.pathname === '/live' ||
    location.pathname === '/home' ||
    location.pathname === '/home/overview' ||
    location.pathname === '/forecast/overview';

  // Dedicated full-bleed auth pages (own layout, no navbar/footer/chat).
  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/sign-up' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/update-password' ||
    location.pathname === '/set-password' ||
    location.pathname.startsWith('/auth/');

  return (
    <div
      className={
        isHomePage
          ? 'h-dvh w-full overflow-hidden bg-transparent text-slate-900 flex flex-col font-sans relative pointer-events-none'
          : 'min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900 pointer-events-none'
      }
    >
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          },
        }}
      />

      {/* Skip link (WCAG 2.4.1): first focusable element on every page, so a
          keyboard or screen-reader user can jump past the navbar straight to
          the content. Visible only while focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[9999] focus:rounded-xl focus:bg-slate-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Top Navigation - Upper layer overlay with near-transparent background */}
      {!['/terms', '/privacy'].some((p) => location.pathname.startsWith(p)) && !isAuthPage && (
        <div
          className={`z-[9990] pointer-events-auto w-full ${
            isHomePage ? 'absolute top-0 left-0 right-0' : 'sticky top-0'
          }`}
        >
          <Navbar isTransparent={isHomePage} />
        </div>
      )}

      {/* Main Content Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className={
          isAuthPage
            ? 'flex-1 relative z-10 w-full pointer-events-auto'
            : isHomePage
            ? 'w-full h-full h-dvh overflow-hidden p-0 m-0 pointer-events-auto absolute inset-0 z-0'
            : 'flex-1 relative z-10 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-28 md:pb-8 pointer-events-auto'
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="w-full h-full"
          >
            <Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
              {/* `/` is the editorial front door; the console lives at `/live`. The
                  `/home*` and `/forecast/overview` paths are kept as console deep links
                  because they were published for the whole life of the project. */}
              <Route path="/" element={<FrontDoor />} />
              <Route path="/live" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/forecast/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/forecast/dashboard" element={<Navigate to="/analytics/forecast-dashboard" replace />} />
              <Route path="/forecast/my-districts" element={<Dashboard defaultTab="saved" />} />
              <Route path="/forecast/district/:id" element={<DistrictDetailPage />} />
              <Route path="/forecast/compare" element={<Dashboard defaultTab="compare" />} />
              <Route path="/forecast/settings" element={<Dashboard defaultTab="settings" />} />
              <Route path="/settings" element={<Dashboard defaultTab="settings" />} />
              {/* Public alert surface (Phase 5). The alert id in the path is the
                  engine's own alert id, so a link from an SMS or a Telegram message
                  lands on the exact evidence card it refers to. */}
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/alerts/:id" element={<AlertDetailPage />} />
              <Route path="/advisories" element={<AdvisoriesPage />} />
              <Route path="/advisories/:subCategory" element={<AdvisoriesPage />} />
              <Route path="/analytics" element={<AnalyticsAnalyticsPage />} />
              <Route path="/analytics/:subCategory" element={<AnalyticsAnalyticsPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/use-cases" element={<UseCases />} />
              <Route path="/download" element={<DownloadCenter />} />
              <Route path="/blogs" element={<Blogs />} />
              <Route path="/blogs/:slug" element={<BlogArticlePage />} />
              <Route
                path="/dashboard/blog"
                element={
                  <RequireSuperAdmin>
                    <BlogStudioPage />
                  </RequireSuperAdmin>
                }
              />
              <Route
                path="/dashboard/blog/new"
                element={
                  <RequireSuperAdmin>
                    <BlogEditorPage mode="new" />
                  </RequireSuperAdmin>
                }
              />
              <Route
                path="/dashboard/blog/edit/:id"
                element={
                  <RequireSuperAdmin>
                    <BlogEditorPage mode="edit" />
                  </RequireSuperAdmin>
                }
              />
              <Route path="/docs" element={<Documentation />} />
              {/* Legacy sitemap URL: /documentation was advertised in sitemap.xml
                  while the app only ever served /docs (404 in production). */}
              <Route path="/documentation" element={<Navigate to="/docs" replace />} />
              <Route path="/about" element={<About />} />
              {/* Trust surfaces (E-E-A-T): methodology, model card, data sources, FAQ */}
              <Route path="/methodology" element={<ArticlePage path="/methodology" />} />
              <Route path="/model" element={<ArticlePage path="/model" />} />
              <Route path="/data-sources" element={<ArticlePage path="/data-sources" />} />
              <Route path="/faq" element={<ArticlePage path="/faq" />} />
              {/* Phase 7 observability: what the deployment's own committed artifacts say
                  about the freshness of the data it ships (frontend/public/data/freshness.json). */}
              <Route path="/status" element={<StatusPage />} />
              {/* Phase 8 content engine: hazard-by-hazard methodology, a page per district built
                  from the run this deployment serves, and (when an event archive is loaded)
                  annual retrospectives. All three are prerendered statically at build time. */}
              <Route path="/hazards" element={<GeneratedContentPage />} />
              <Route path="/hazards/:slug" element={<GeneratedContentPage />} />
              <Route path="/districts" element={<GeneratedContentPage />} />
              {/* Phase 9 §8.1 — composed from the committed hindcast reports by the content
                  engine. The route must exist here as well as in the prerendered HTML: the
                  page a visitor reaches by clicking is served by the SPA. */}
              <Route path="/model-performance" element={<GeneratedContentPage />} />
              <Route path="/districts/:id" element={<GeneratedContentPage />} />
              <Route path="/retrospectives" element={<GeneratedContentPage />} />
              <Route path="/retrospectives/:year" element={<GeneratedContentPage />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/signup" element={<SignUpPage />} />
              {/* Legacy sign-up URL — permanently redirected to /signup */}
              <Route path="/sign-up" element={<Navigate to="/signup" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/update-password" element={<UpdatePasswordPage />} />
              <Route path="/set-password" element={<SetPasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              {/* Dedicated per-user dashboard + unique public profile URLs */}
              <Route path="/dashboard" element={<UserDashboardPage />} />
              <Route path="/u/:username" element={<PublicProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Render Footer only on subpages; homepage is a full-screen Google Earth stage */}
      {!isHomePage && !isAuthPage && (
        <div className="pointer-events-auto mt-auto pb-20 md:pb-0">
          <Footer />
        </div>
      )}

      {/* Floating Chat Bot - Render only on subpages */}
      {!isHomePage && !isAuthPage && (
        <div className="pointer-events-auto">
          <Suspense fallback={null}>
            <ChatBot />
          </Suspense>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (5-tab navigation for phones/tablets) */}
      <div className="pointer-events-auto">
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AppContent />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
    {/*
      Vercel Web Analytics loads ONLY where Vercel's edge can serve it:
      `/_vercel/insights/script.js` is a Vercel system route, and on any other
      host an SPA rewrite answers it with index.html, which the browser parses
      as JavaScript and rejects with `SyntaxError: Unexpected token '<'` once
      per page load. See lib/vercelAnalytics.ts for the full story and the
      build-time gate in frontend/vite.config.ts.
    */}
    {vercelAnalyticsEnabled && <Analytics />}
  </ErrorBoundary>
);

export default App;
