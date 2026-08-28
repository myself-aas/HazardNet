import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
const Analytics = () => null;
import store from './store/store';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignUpPage from './pages/SignUpPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import Documentation from './pages/Documentation';
import About from './pages/About';
import UseCases from './pages/UseCases';
import DownloadCenter from './pages/DownloadCenter';
import Blogs from './pages/Blogs';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import NotFoundPage from './pages/NotFoundPage';
import { AdvisoriesPage } from './pages/AdvisoriesPage';
import { AnalyticsAnalyticsPage } from './pages/AnalyticsPage';
import { DistrictDetailPage } from './pages/DistrictDetailPage';
import { useHazardNotifications } from './hooks/useHazardNotifications';
import { initializeAttributionCapture } from './services/conversionTracking';
import ChatBot from './components/ChatBot';
import { Toaster } from 'react-hot-toast';

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

  return (
    <div
      className={
        isHomePage
          ? 'h-screen w-screen overflow-hidden bg-transparent text-slate-900 flex flex-col font-sans relative pointer-events-none'
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

      {/* Top Navigation - Upper layer overlay with near-transparent background */}
      {!['/terms', '/privacy'].some((p) => location.pathname.startsWith(p)) && (
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
        className={
          isHomePage
            ? 'w-full h-full h-screen w-screen overflow-hidden p-0 m-0 pointer-events-auto absolute inset-0 z-0'
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
            <Routes location={location}>
              <Route path="/" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/home/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
              <Route path="/forecast/overview" element={<Dashboard defaultTab="gis" isFullScreen={true} />} />
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
              <Route path="/docs" element={<Documentation />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/sign-up" element={<SignUpPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/update-password" element={<UpdatePasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Render Footer only on subpages; homepage is a full-screen Google Earth stage */}
      {!isHomePage && (
        <div className="pointer-events-auto mt-auto pb-20 md:pb-0">
          <Footer />
        </div>
      )}

      {/* Floating Chat Bot - Render only on subpages */}
      {!isHomePage && (
        <div className="pointer-events-auto">
          <ChatBot />
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (5-tab navigation for phones/tablets) */}
      <div className="pointer-events-auto">
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <Provider store={store}>
    <AuthProvider>
      <Router>
        <AppContent />
        <Analytics />
      </Router>
    </AuthProvider>
  </Provider>
);

export default App;
