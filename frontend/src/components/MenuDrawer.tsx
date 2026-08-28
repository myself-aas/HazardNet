import React from 'react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import MaterialIcon from './MaterialIcon';
import { NotificationToggle } from './NotificationToggle';
import { HazardNetLogo, HazardNetBrand } from './HazardNetLogo';
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

  const handleDrawerSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await authSignOut();
      toast.success('Signed out securely. Session state cleared.');
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
    docs: true,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const navSections: NavSection[] = [
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
        },
        {
          id: 'my-districts',
          title: 'My Saved Districts',
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
      ],
    },
    {
      id: 'advisories',
      category: 'Sector Risk Advisories',
      icon: 'agriculture',
      items: [
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
        {
          id: 'emergency-response',
          title: 'Emergency Logistics & Requisitions',
          path: '/advisories/emergency-response',
          icon: 'emergency',
          description: 'National SOD 2019 relief & procurement protocols',
        },
      ],
    },
    {
      id: 'analytics',
      category: 'Intelligence & Models',
      icon: 'analytics',
      items: [
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
          icon: 'query_stats',
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
      id: 'docs',
      category: 'Knowledge & Resources',
      icon: 'folder',
      items: [
        {
          id: 'documentation',
          title: 'System Documentation',
          path: '/docs',
          icon: 'description',
          description: 'API specs, methodology & data dictionaries',
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
          description: 'Government, NGO & humanitarian impact',
        },
        {
          id: 'download',
          title: 'Hazard Data Download Center',
          path: '/download',
          icon: 'download',
          description: 'Export GeoJSON, shapefiles & bulletins',
        },
        {
          id: 'blogs',
          title: 'Technical Blogs & Insights',
          path: '/blogs',
          icon: 'rss_feed',
          description: 'Climate research & early warning stories',
        },
        {
          id: 'about',
          title: 'About HazardNet',
          path: '/about',
          icon: 'info',
          description: 'Bangladesh Early Warning Initiative mission',
        },
        {
          id: 'contact',
          title: 'Contact & Support Team',
          path: '/contact',
          icon: 'mail',
          description: '24/7 emergency hotline & technical support',
        },
      ],
    },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[9999]"
            onClick={onClose}
          />

          {/* Navigation Drawer Container */}
          <motion.div
            key="drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed inset-y-0 left-0 z-[10000] w-80 max-w-[85vw] bg-white border-r border-slate-200 shadow-2xl flex flex-col font-sans select-none text-slate-800"
          >
            {/* Drawer Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between shadow-xs shrink-0 border-b border-slate-800">
          <div className="flex flex-col gap-0.5">
            <HazardNetBrand size="md" variant="dark" />
            <p className="text-[10px] text-slate-400 font-medium pl-8 tracking-tight">National Hazard Intelligence Network</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Drawer"
            aria-label="Close Drawer"
          >
            <MaterialIcon name="close" className="text-xl" />
          </button>
        </div>

        {/* User Account & Alert Controls Banner */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => {
              if (user) {
                if (onOpenProfile) onOpenProfile();
              } else {
                if (onOpenAuth) onOpenAuth();
              }
              onClose();
            }}
            className="flex items-center gap-2.5 min-w-0 text-left hover:bg-slate-200/60 p-1.5 rounded-xl transition-colors flex-1"
            title={user ? 'Manage Account & Settings' : 'Sign In'}
          >
            <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs shrink-0">
              {user ? (user.displayName || user.email || 'U')[0].toUpperCase() : 'ID'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">
                {user ? (user.displayName || user.email) : 'Guest User ID'}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {user ? 'Profile & Settings' : 'Tap to sign in or view ID'}
              </p>
            </div>
          </button>

          <div className="shrink-0 flex items-center gap-1.5 pl-1 border-l border-slate-200">
            {user && (
              <button
                type="button"
                onClick={handleDrawerSignOut}
                disabled={isLoggingOut}
                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200/80 transition-colors disabled:opacity-50 cursor-pointer text-xs"
                title="Sign out & clear local state"
                aria-label="Sign out"
              >
                <MaterialIcon name="logout" className="text-base" />
              </button>
            )}
            <NotificationToggle />
          </div>
        </div>

        {/* Realtime Database Status Banner */}
        <div className="px-3 py-2 bg-slate-100/70 border-b border-slate-200">
          <FirebaseRealtimeStatus variant="compact" />
        </div>

        {/* Scrollable Navigation Sections Tree */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
          {navSections.map((section) => {
            const isExpanded = expandedSections[section.id] ?? true;

            return (
              <div key={section.id} className="space-y-1">
                {/* Section Group Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <MaterialIcon name={section.icon} className="text-base text-amber-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 tracking-tight uppercase text-[11px] font-mono">
                      {section.category}
                    </span>
                  </div>
                  <MaterialIcon
                    name={isExpanded ? 'expand_more' : 'chevron_right'}
                    className="text-base text-slate-400 transition-transform"
                  />
                </button>

                {/* Section Items */}
                {isExpanded && (
                  <div className="space-y-1 pl-1">
                    {section.items.map((item) => {
                      const isActive =
                        location.pathname === item.path ||
                        (item.path !== '/' && location.pathname.startsWith(item.path));

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavigate(item.path)}
                          className={`w-full text-left p-2 rounded-xl transition-all flex items-start gap-2.5 font-inter text-[13px] sm:text-[14px] leading-[1.4] ${
                            isActive
                              ? 'bg-teal-50/90 text-teal-700 border border-teal-200/80 shadow-xs font-semibold'
                              : 'hover:bg-slate-100/80 text-slate-700 hover:text-slate-900 border border-transparent font-medium'
                          }`}
                        >
                          <MaterialIcon
                            name={item.icon}
                            className={`text-base shrink-0 mt-0.5 ${
                              isActive ? 'text-teal-600' : 'text-slate-500'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold truncate">{item.title}</span>
                              {item.badge && (
                                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold tracking-[0.08em] shrink-0 ml-1">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className={`text-[11px] leading-[1.3] mt-0.5 truncate ${
                                isActive ? 'text-teal-800/80' : 'text-slate-500 font-normal'
                              }`}>
                                {item.description}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <strong className="text-slate-800">HazardNet</strong>
          </span>
          <button
            onClick={() => handleNavigate('/')}
            className="text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors cursor-pointer"
          >
            Home Stage →
          </button>
        </div>

      </motion.div>
    </>
  )}
</AnimatePresence>
);
};

export default MenuDrawer;
