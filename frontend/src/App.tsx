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
const UserDashboardPage = lazy(() => import('./pages/UserDashboardPage'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'));
const SetPasswordPage = lazy(() => import('./pages/SetPasswordPage'));
const ChatBot = lazy(() => import('./components/ChatBot'));

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

  const isHomePage =
    location.pathname === '/' ||
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
        /* Above every overlay (modals sit at z-[10001]+; the old default 9999
           let profile-save toasts render behind the modal backdrop). */
        containerStyle={{ zIndex: 10050 }}
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          },
        }}
      />

      {/* Top Navigation - Upper layer overlay with near-transparent background.
          z-40 keeps the sticky header above page content but BELOW the page
          overlays (disaster detail z-[1200]+, print preview, chat, modals) —
          it used to be z-[9990], which trapped every modal rendered inside
          <main> underneath the header, so popups visually collided with it. */}
      {!['/terms', '/privacy'].some((p) => location.pathname.startsWith(p)) && !isAuthPage && (
        <div
          className={`z-40 pointer-events-auto w-full ${
            isHomePage ? 'absolute top-0 left-0 right-0' : 'sticky top-0'
          }`}
        >
          <Navbar isTransparent={isHomePage} />
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={
          isAuthPage
            ? 'flex-1 relative w-full pointer-events-auto'
            : isHomePage
            ? 'w-full h-full h-dvh overflow-hidden p-0 m-0 pointer-events-auto absolute inset-0'
            : 'flex-1 relative max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 lg:p-8 pb-28 md:pb-8 pointer-events-auto'
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
              <Route path="/" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/forecast/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/forecast/dashboard" element={<Navigate to="/analytics/forecast-dashboard" replace />} />
              <Route path="/forecast/my-districts" element={<Dashboard defaultTab="saved" />} />
              <Route path="/forecast/district/:id" element={<DistrictDetailPage />} />
              <Route path="/forecast/compare" element={<Dashboard defaultTab="compare" />} />
              <Route path="/forecast/settings" element={<Dashboard defaultTab="settings" />} />
              <Route path="/settings" element={<Dashboard defaultTab="settings" />} />
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
              <Route path="/about" element={<About />} />
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
