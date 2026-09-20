import React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // Escape closes the drawer. The panel covers the header hamburger at
  // phone/tablet widths, so keyboard and assistive-tech users need an explicit
  // dismiss path that does not depend on hitting the backdrop.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const navSections: NavSection[] = [
    {
      id: 'maps',
      category: 'National Maps',
      icon: 'map',
      items: [
        { id: 'live', title: 'Live Map & GIS Console', path: '/live', icon: 'public', badge: '3D' },
        { id: 'front-door', title: 'Overview (front door)', path: '/', icon: 'description' },
        { id: 'divisions', title: '8 Divisions Analytics', path: '/divisions', icon: 'domain', badge: 'New' },
        { id: 'hazards', title: 'Climatic Hazards Matrix', path: '/hazards', icon: 'warning', badge: '9 Perils' },
        { id: 'alerts', title: 'Alerts', path: '/alerts', icon: 'notifications_active' },
        { id: 'my-districts', title: 'Saved Districts', path: '/forecast/my-districts', icon: 'bookmark' },
        { id: 'compare', title: 'Compare Districts', path: '/forecast/compare', icon: 'compare_arrows' },
      ],
    },
    {
      id: 'advisories',
      category: 'Sector Advisories',
      icon: 'agriculture',
      items: [
        { id: 'crops', title: 'Crop Agriculture', path: '/advisories/crops', icon: 'grass', badge: 'New' },
        { id: 'livestock', title: 'Livestock & Vet', path: '/advisories/livestock', icon: 'pets' },
        { id: 'fisheries', title: 'Fisheries', path: '/advisories/fisheries', icon: 'water' },
        { id: 'health-wash', title: 'Public Health', path: '/advisories/health-wash', icon: 'health_and_safety' },
        { id: 'calendar', title: 'Seasonal Calendar', path: '/advisories/seasonal-calendar', icon: 'calendar_month' },
        { id: 'emergency-response', title: 'Emergency Logistics', path: '/advisories/emergency-response', icon: 'emergency' },
      ],
    },
    {
      id: 'analytics',
      category: 'Intelligence & Models',
      icon: 'analytics',
      items: [
        { id: 'pipeline', title: 'Data Pipeline', path: '/analytics/pipeline-status', icon: 'alt_route' },
        { id: 'metrics', title: 'Model Performance', path: '/analytics/model-metrics', icon: 'query_stats' },
        { id: 'historical', title: 'Historical Logs', path: '/analytics/historical', icon: 'history' },
      ],
    },
    {
      id: 'docs',
      category: 'Resources',
      icon: 'folder',
      items: [
        { id: 'documentation', title: 'Documentation', path: '/docs', icon: 'description' },
        { id: 'hazard-methodology', title: 'Hazard Methodology', path: '/hazards', icon: 'menu_book' },
        { id: 'district-outlooks', title: 'District Outlooks', path: '/districts', icon: 'location_on' },
        { id: 'status', title: 'System Status', path: '/status', icon: 'monitor_heart' },
        { id: 'upload', title: 'Forecast Lookup', path: '/upload', icon: 'cloud_upload' },
        { id: 'use-cases', title: 'Use Cases', path: '/use-cases', icon: 'lightbulb' },
        { id: 'download', title: 'Download Center', path: '/download', icon: 'download' },
        { id: 'blogs', title: 'Technical Blogs', path: '/blogs', icon: 'rss_feed' },
        { id: 'about', title: 'About HazardNet', path: '/about', icon: 'info' },
        { id: 'contact', title: 'Contact Support', path: '/contact', icon: 'mail' },
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
            className="fixed inset-0 bg-carbon-90/20 backdrop-blur-sm z-[10001]"
            onClick={onClose}
          />

          {/* Navigation Drawer Container */}
          <motion.div
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            data-testid="menu-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed inset-y-0 left-0 z-[10002] w-80 max-w-[85vw] bg-gradient-to-b from-[#e8e4e1] to-[#cfd1c4] rounded-r-3xl shadow-2xl flex flex-col font-sans select-none text-carbon-80 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="px-6 py-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <HazardNetBrand size="sm" variant="dark" />
              </div>
              <div className="flex items-center gap-2">
                <NotificationToggle variant="icon" />
                <button
                  onClick={() => {
                    if (user) {
                      if (onOpenProfile) onOpenProfile();
                    } else {
                      if (onOpenAuth) onOpenAuth();
                    }
                    onClose();
                  }}
                  className="tap-target w-11 h-11 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
                  title={user ? 'Profile' : 'Sign In'}
                >
                  {user ? (
                    <span className="font-bold text-sm text-carbon-80">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </span>
                  ) : (
                    <MaterialIcon name="person" className="text-[20px] text-carbon-80" />
                  )}
                </button>
                {/*
                  In-panel dismiss control. The header hamburger sits under this
                  panel (z-[10002]) once the drawer is open, so without this the
                  only way out was tapping the translucent backdrop — no visible
                  close affordance and nothing keyboard reachable.
                */}
                <button
                  onClick={onClose}
                  data-testid="menu-drawer-close"
                  aria-label="Close navigation menu"
                  title="Close menu"
                  className="w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                >
                  <MaterialIcon name="close" className="text-[20px] text-carbon-80" />
                </button>
              </div>
            </div>

            {/* Scrollable Navigation Sections Tree */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {navSections.map((section) => {
                const isExpanded = expandedSections[section.id] ?? false;

                return (
                  <div key={section.id} className="space-y-1">
                    {/* Category Header (Top-level item style) */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-full transition-all ${
                        isExpanded ? 'bg-black/5 shadow-sm' : 'hover:bg-black/5'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <MaterialIcon name={section.icon} className="text-[22px] text-carbon-80" />
                        <span className="text-[15px] font-medium text-carbon-90">
                          {section.category}
                        </span>
                      </div>
                      <div className="bg-carbon-90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
                        {section.items.length}
                      </div>
                    </button>

                    {/* Sub-items */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-7 pl-6 py-2 border-l border-carbon-90/10 space-y-1 my-1">
                            {section.items.map((item) => {
                              const isActive =
                                location.pathname === item.path ||
                                (item.path !== '/' && location.pathname.startsWith(item.path));

                              return (
                                <button
                                  key={item.id}
                                  onClick={() => handleNavigate(item.path)}
                                  className={`w-full flex items-center justify-between py-2.5 px-4 rounded-full transition-all ${
                                    isActive ? 'bg-black/5 font-semibold text-carbon-90' : 'hover:bg-black/5 font-medium text-carbon-70'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <MaterialIcon
                                      name={item.icon}
                                      className={`text-[18px] ${isActive ? 'text-carbon-90' : 'text-carbon-60'}`}
                                    />
                                    <span className="text-[14px]">{item.title}</span>
                                  </div>
                                  {item.badge && (
                                    <span className="text-[10px] bg-black/10 text-carbon-80 px-1.5 py-0.5 rounded-md font-bold">
                                      {item.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="p-6 flex flex-col gap-4 shrink-0 mt-auto">
              {/* Signed-out visitors: registration must be reachable from the
                  primary navigation. The compact header bar below xl has no
                  room for auth links, so the drawer is their entry point. */}
              {!user && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/signup"
                    data-testid="drawer-signup-link"
                    onClick={onClose}
                    className="w-full py-3 rounded-2xl bg-nasa-red hover:bg-nasa-red-shade text-carbon-black text-[13px] font-extrabold text-center shadow-2xs transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                  >
                    Sign up free
                  </Link>
                  <Link
                    to="/login"
                    data-testid="drawer-signin-link"
                    onClick={onClose}
                    className="w-full py-3 rounded-2xl border border-carbon-90/15 hover:bg-black/5 text-carbon-80 text-[13px] font-bold text-center transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                  >
                    Sign in
                  </Link>
                </div>
              )}
              <FirebaseRealtimeStatus variant="compact" />
              <div className="flex items-center justify-between text-[11px] font-mono text-carbon-60">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <strong className="text-carbon-80">HazardNet</strong>
                </span>
                {user && (
                   <button
                     onClick={handleDrawerSignOut}
                     disabled={isLoggingOut}
                     className="text-rose-600 hover:text-rose-700 font-bold transition-colors disabled:opacity-50"
                   >
                     Sign Out
                   </button>
                )}
              </div>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MenuDrawer;
