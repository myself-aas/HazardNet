import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import MaterialIcon from './MaterialIcon';
import { NotificationToggle } from './NotificationToggle';
import { HazardNetBrand } from './HazardNetLogo';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';

interface NavItem {
  id: string;
  title: string;
  path: string;
  icon: string;
  badge?: string;
  description?: string;
}

interface NavSection {
  id: string;
  category: string;
  icon: string;
  items: NavItem[];
}

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  onSelectDistrict?: (districtId: string) => void;
  onSelectPage?: (page: string) => void;
  activePage?: string;
}

// Framer motion variants for coordinated staggered layout transitions
const containerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.038,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  user,
  onOpenProfile,
  onOpenAuth,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut: authSignOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDrawerSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await authSignOut();
      toast.success('Signed out securely.');
      onClose();
    } catch (err) {
      console.error('Drawer sign out error:', err);
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    maps: true,
    advisories: true,
    analytics: true,
    resources: true,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // Primary 1-Tap Quick Actions
  const quickActions = useMemo(
    () => [
      {
        id: 'quick-home',
        label: 'Live Map',
        path: '/',
        icon: 'public',
        color: 'bg-amber-500 text-slate-950',
      },
      {
        id: 'quick-watchlist',
        label: 'Watchlist',
        path: '/forecast/my-districts',
        icon: 'bookmark',
        color: 'bg-slate-800 text-white',
      },
      {
        id: 'quick-advisories',
        label: 'Advisories',
        path: '/advisories',
        icon: 'agriculture',
        color: 'bg-teal-600 text-white',
      },
      {
        id: 'quick-analytics',
        label: 'Analytics',
        path: '/analytics',
        icon: 'analytics',
        color: 'bg-blue-600 text-white',
      },
      {
        id: 'quick-downloads',
        label: 'Downloads',
        path: '/download',
        icon: 'download',
        color: 'bg-indigo-600 text-white',
      },
      {
        id: 'quick-upload',
        label: 'Upload Data',
        path: '/upload',
        icon: 'cloud_upload',
        color: 'bg-emerald-600 text-white',
      },
    ],
    []
  );

  // Categorized Navigation Tree
  const navSections: NavSection[] = useMemo(
    () => [
      {
        id: 'maps',
        category: 'National Intelligence & Maps',
        icon: 'map',
        items: [
          {
            id: 'overview',
            title: 'GIS Overview & Earth Stage',
            path: '/home/overview',
            icon: 'public',
            description: 'Interactive 3D Bangladesh hazard risk map',
            badge: 'LIVE',
          },
          {
            id: 'my-districts',
            title: 'My Saved Watchlist',
            path: '/forecast/my-districts',
            icon: 'bookmark',
            description: 'Personalized district watchlist & threshold alerts',
          },
          {
            id: 'compare',
            title: 'District Comparative Matrix',
            path: '/forecast/compare',
            icon: 'compare_arrows',
            description: 'Side-by-side risk score & hazard benchmarking',
          },
          {
            id: 'settings',
            title: 'Forecast Preferences & Settings',
            path: '/forecast/settings',
            icon: 'tune',
            description: 'Custom risk thresholds & SMS/email channels',
          },
        ],
      },
      {
        id: 'advisories',
        category: 'Sector Risk Advisories',
        icon: 'agriculture',
        items: [
          {
            id: 'all-advisories',
            title: 'Early Warning Advisory Hub',
            path: '/advisories',
            icon: 'campaign',
            description: 'Consolidated multi-sector early action notices',
            badge: 'NEW',
          },
          {
            id: 'crops',
            title: 'Crop Agriculture Protection',
            path: '/advisories/crops',
            icon: 'grass',
            description: 'Flood & heat stress farming advisories',
          },
          {
            id: 'livestock',
            title: 'Livestock & Veterinary',
            path: '/advisories/livestock',
            icon: 'pets',
            description: 'Cattle shelter & disease mitigation protocols',
          },
          {
            id: 'fisheries',
            title: 'Fisheries & Aquaculture',
            path: '/advisories/fisheries',
            icon: 'water',
            description: 'Inundation risk for aquaculture ponds',
          },
          {
            id: 'health-wash',
            title: 'Public Health & WASH',
            path: '/advisories/health-wash',
            icon: 'health_and_safety',
            description: 'Waterborne disease prevention & clean water',
          },
          {
            id: 'calendar',
            title: 'Seasonal Advisory Calendar',
            path: '/advisories/seasonal-calendar',
            icon: 'calendar_month',
            description: 'Monsoon, flash flood & cyclone timings',
          },
        ],
      },
      {
        id: 'analytics',
        category: 'Intelligence, Models & Analytics',
        icon: 'analytics',
        items: [
          {
            id: 'analytics-hub',
            title: 'Analytics & Risk Index Center',
            path: '/analytics',
            icon: 'query_stats',
            description: 'Composite vulnerability & spatial risk metrics',
          },
          {
            id: 'pipeline',
            title: 'Data Ingestion Pipeline',
            path: '/analytics/pipeline-status',
            icon: 'alt_route',
            description: 'Satellite, weather gauge & sensor feeds',
          },
          {
            id: 'metrics',
            title: 'AI Model Performance',
            path: '/analytics/model-metrics',
            icon: 'monitoring',
            description: 'TensorFlow ML accuracy & F1 scores',
          },
          {
            id: 'historical',
            title: 'Historical Hazard Logs',
            path: '/analytics/historical',
            icon: 'history',
            description: 'Decadal flood & cyclone occurrence archive',
          },
        ],
      },
      {
        id: 'resources',
        category: 'Data, Tools & Resources',
        icon: 'folder',
        items: [
          {
            id: 'download',
            title: 'Download Center & Datasets',
            path: '/download',
            icon: 'download',
            description: 'Export GeoJSON, CSV and situational briefs',
          },
          {
            id: 'upload',
            title: 'Upload Sensor & Gauge Data',
            path: '/upload',
            icon: 'cloud_upload',
            description: 'Ingest local CSV or satellite raster data',
          },
          {
            id: 'use-cases',
            title: 'Sector Use Cases',
            path: '/use-cases',
            icon: 'lightbulb',
            description: 'Institutional disaster workflows & humanitarian response',
          },
          {
            id: 'documentation',
            title: 'System Documentation & API',
            path: '/docs',
            icon: 'description',
            description: 'API specs, methodology & data dictionaries',
          },
          {
            id: 'blogs',
            title: 'Research Bulletins & Blog',
            path: '/blogs',
            icon: 'article',
            description: 'Case studies, methodology deep dives & field updates',
          },
          {
            id: 'about',
            title: 'About HazardNet',
            path: '/about',
            icon: 'info',
            description: 'System architecture, mission & partner network',
          },
          {
            id: 'contact',
            title: 'Operations & Emergency Desk',
            path: '/contact',
            icon: 'support_agent',
            description: 'Reach our 24/7 technical and meteorological desk',
          },
        ],
      },
    ],
    []
  );

  const handleNavigate = useCallback(
    (path: string) => {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(10);
        } catch {
          // ignore vibration error
        }
      }
      navigate(path);
      onClose();
    },
    [navigate, onClose]
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex pointer-events-auto select-none">
          {/* Frosted Backdrop Overlay with Smooth Fade and Blur */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 bg-slate-950/60 cursor-pointer"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel with Layout Transition & Physics-Based Spring Sliding */}
          <motion.div
            key="drawer-panel"
            layout
            initial={{ x: '-100%', opacity: 0.95 }}
            animate={{ x: '0%', opacity: 1 }}
            exit={{ x: '-100%', opacity: 0.95 }}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 32,
              mass: 0.8,
            }}
            drag="x"
            dragConstraints={{ left: -340, right: 0 }}
            dragElastic={{ left: 0.15, right: 0 }}
            onDragEnd={(_, { offset, velocity }) => {
              if (offset.x < -70 || velocity.x < -350) {
                onClose();
              }
            }}
            className="relative z-10 w-84 max-w-[88vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.45)] flex flex-col font-sans text-slate-800 dark:text-slate-100 overflow-hidden"
          >
            {/* Header */}
            <motion.div
              layout="position"
              className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between shadow-xs shrink-0 border-b border-slate-800"
            >
              <div className="flex flex-col gap-0.5">
                <HazardNetBrand size="md" variant="dark" />
                <p className="text-[10px] text-slate-400 font-medium pl-8 tracking-tight">
                  National Hazard Intelligence Network
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title="Close Navigation Menu"
                aria-label="Close Navigation Menu"
              >
                <MaterialIcon name="close" className="text-xl" />
              </motion.button>
            </motion.div>

            {/* Profile & Auth Section */}
            <motion.div
              layout="position"
              className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (user) {
                    if (onOpenProfile) onOpenProfile();
                  } else {
                    if (onOpenAuth) onOpenAuth();
                  }
                  onClose();
                }}
                className="flex items-center gap-2.5 min-w-0 text-left hover:bg-slate-200/60 dark:hover:bg-slate-800/80 p-1.5 rounded-xl transition-colors flex-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title={user ? 'Manage Account & Settings' : 'Sign In'}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs shrink-0">
                  {user ? (user.displayName || user.email || 'U')[0].toUpperCase() : 'ID'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {user ? user.displayName || user.email : 'Guest User'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {user ? 'Profile & Preferences' : 'Tap to sign in or register'}
                  </p>
                </div>
              </motion.button>

              <div className="shrink-0 flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
                {user && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={handleDrawerSignOut}
                    disabled={isLoggingOut}
                    className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-rose-200/80 dark:border-rose-900/60 transition-colors disabled:opacity-50 cursor-pointer text-xs"
                    title="Sign out & clear session"
                    aria-label="Sign out"
                  >
                    <MaterialIcon name="logout" className="text-base" />
                  </motion.button>
                )}
                <NotificationToggle />
              </div>
            </motion.div>

            {/* Realtime Connection Status */}
            <motion.div
              layout="position"
              className="px-3 py-2 bg-slate-100/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800"
            >
              <FirebaseRealtimeStatus variant="compact" />
            </motion.div>

            {/* Scrollable Navigation Tree with Staggered Cascading Animation */}
            <motion.div
              layout
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="flex-1 overflow-y-auto p-3 space-y-4"
            >
              {/* Quick 1-Tap Access Grid */}
              <motion.div variants={itemVariants} layout className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono px-1">
                  Quick Access
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {quickActions.map((action) => {
                    const isQuickActive =
                      action.path === '/'
                        ? location.pathname === '/' || location.pathname === '/home'
                        : location.pathname.startsWith(action.path);

                    return (
                      <motion.button
                        key={action.id}
                        layout
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                        onClick={() => handleNavigate(action.path)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                          isQuickActive
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/50 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center mb-1.5 shadow-xs ${action.color}`}
                        >
                          <MaterialIcon name={action.icon} className="text-base" />
                        </div>
                        <span
                          className={`text-[11px] tracking-tight text-center truncate w-full ${
                            isQuickActive
                              ? 'text-amber-800 dark:text-amber-300 font-bold'
                              : 'text-slate-700 dark:text-slate-300 font-medium'
                          }`}
                        >
                          {action.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>

              {/* Categorized Navigation Sections with Animated Layout Trees */}
              {navSections.map((section) => {
                const isExpanded = expandedSections[section.id] ?? true;

                return (
                  <motion.div
                    key={section.id}
                    layout
                    variants={itemVariants}
                    className="space-y-1 bg-slate-50/80 dark:bg-slate-900/60 p-2 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-2xs"
                  >
                    {/* Section Accordion Trigger */}
                    <motion.button
                      layout="position"
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <div className="flex items-center gap-2">
                        <MaterialIcon
                          name={section.icon}
                          className="text-base text-amber-600 dark:text-amber-400 shrink-0"
                        />
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-tight uppercase font-mono">
                          {section.category}
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 0 : -90 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      >
                        <MaterialIcon
                          name="expand_more"
                          className="text-base text-slate-400"
                        />
                      </motion.div>
                    </motion.button>

                    {/* Animated Collapsible Items Tree */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="section-content"
                          layout
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            layout: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
                            opacity: { duration: 0.18 },
                          }}
                          className="overflow-hidden space-y-1 pt-1"
                        >
                          {section.items.map((item) => {
                            const isActive =
                              item.path === '/'
                                ? location.pathname === '/' || location.pathname === '/home'
                                : location.pathname === item.path ||
                                  (item.path !== '/' &&
                                    location.pathname.startsWith(item.path));

                            return (
                              <motion.button
                                key={item.id}
                                layout="position"
                                whileHover={{ x: 3 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleNavigate(item.path)}
                                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 text-[13px] leading-[1.4] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                                  isActive
                                    ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 shadow-xs font-semibold'
                                    : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent font-medium'
                                }`}
                              >
                                <MaterialIcon
                                  name={item.icon}
                                  className={`text-base shrink-0 mt-0.5 ${
                                    isActive
                                      ? 'text-amber-600 dark:text-amber-400 font-bold'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold truncate">
                                      {item.title}
                                    </span>
                                    {item.badge && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold tracking-wider shrink-0 ml-1">
                                        {item.badge}
                                      </span>
                                    )}
                                  </div>
                                  {item.description && (
                                    <p
                                      className={`text-[11px] leading-[1.3] mt-0.5 truncate ${
                                        isActive
                                          ? 'text-amber-800/80 dark:text-amber-300/80'
                                          : 'text-slate-500 dark:text-slate-400 font-normal'
                                      }`}
                                    >
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Footer */}
            <motion.div
              layout="position"
              className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0"
            >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <strong className="text-slate-800 dark:text-slate-200">
                  HazardNet v1.0
                </strong>
              </span>
              <motion.button
                whileHover={{ x: 2 }}
                onClick={() => handleNavigate('/')}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline transition-colors cursor-pointer"
              >
                Go to GIS Map →
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MenuDrawer;
