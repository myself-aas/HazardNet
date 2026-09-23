import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import MaterialIcon from './MaterialIcon';
import { NotificationToggle } from './NotificationToggle';
import { HazardNetBrand } from './HazardNetLogo';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';
import { DRAWER_SECTIONS, isPathCurrent } from '../lib/navigation';

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
  const reduceMotion = useReducedMotion();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
      return () => {
        document.body.style.overflow = previousOverflow;
        lastFocusRef.current?.focus?.();
      };
    }
    return undefined;
  }, [isOpen]);

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 h-dvh bg-carbon-90/40 z-[var(--z-overlay)]"
            onClick={onClose}
            {...({ inert: true } as Record<string, unknown>)}
          />

          <motion.div
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            data-testid="menu-drawer"
            initial={reduceMotion ? { x: 0 } : { x: '-100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { x: 0, opacity: 0 } : { x: '-100%' }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-y-0 left-0 z-[var(--z-overlay)] w-full max-w-[320px] bg-white border-r border-carbon-20 flex flex-col font-sans select-none text-carbon-80 overflow-hidden menu-container"
          >
            <div className="px-4 flex items-center justify-between shrink-0 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
              <div className="flex items-center gap-2">
                <HazardNetBrand size="sm" variant="dark" />
              </div>
              <div className="flex items-center gap-2">
                <NotificationToggle variant="icon" />
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      if (onOpenProfile) onOpenProfile();
                    } else {
                      if (onOpenAuth) onOpenAuth();
                    }
                    onClose();
                  }}
                  className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 flex items-center justify-center transition-colors touch-manipulation"
                  title={user ? 'Profile' : 'Sign In'}
                >
                  {user ? (
                    <span className="font-bold text-sm text-carbon-80">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </span>
                  ) : (
                    <MaterialIcon name="person" className="text-[24px] text-carbon-80" />
                  )}
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  data-testid="menu-drawer-close"
                  aria-label="Close navigation menu"
                  title="Close menu"
                  className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 flex items-center justify-center transition-colors touch-manipulation"
                >
                  <MaterialIcon name="close" className="text-[24px] text-carbon-80" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {DRAWER_SECTIONS.map((section) => {
                const isExpanded = expandedSections[section.id] ?? false;

                return (
                  <div key={section.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className={`w-full min-h-[44px] flex items-center justify-between px-4 py-2 transition-colors touch-manipulation ${
                        isExpanded ? 'bg-carbon-05' : 'hover:bg-carbon-05'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MaterialIcon name={section.icon} className="text-[12px] text-carbon-80" />
                        <span className="text-base font-semibold text-carbon-90 leading-[1.35]">
                          {section.category}
                        </span>
                      </div>
                      <div className="hn-badge bg-carbon-90 text-white px-2 py-0.5 min-w-[24px] text-center">
                        {section.items.length}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                          animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                          exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-4 pl-4 py-1 border-l border-carbon-20 space-y-1 my-1">
                            {section.items.map((item) => {
                              const isActive = isPathCurrent(location.pathname, item.path);

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleNavigate(item.path)}
                                  aria-current={isActive ? 'page' : undefined}
                                  className={`w-full min-h-[44px] flex items-center justify-between py-2 px-2 transition-colors touch-manipulation ${
                                    isActive
                                      ? 'bg-carbon-05 font-semibold text-carbon-90'
                                      : 'hover:bg-carbon-05 font-medium text-carbon-80'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <MaterialIcon
                                      name={item.icon}
                                      className={`text-[13px] ${isActive ? 'text-carbon-90' : 'text-carbon-80'}`}
                                    />
                                    <span className="text-base leading-[1.35]">{item.title}</span>
                                  </div>
                                  {item.badge && (
                                    <span className="hn-badge bg-carbon-10 text-carbon-90 px-1.5 py-0.5 font-bold">
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

            <div className="p-4 flex flex-col gap-4 shrink-0 mt-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!user && (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/signup"
                    data-testid="drawer-signup-link"
                    onClick={onClose}
                    className="w-full min-h-[44px] py-3 bg-nasa-red-shade hover:bg-nasa-red text-white text-base font-semibold text-center touch-manipulation inline-flex items-center justify-center"
                  >
                    Sign up free
                  </Link>
                  <Link
                    to="/login"
                    data-testid="drawer-signin-link"
                    onClick={onClose}
                    className="w-full min-h-[44px] py-3 border border-carbon-20 hover:bg-carbon-05 text-carbon-80 text-base font-semibold text-center touch-manipulation inline-flex items-center justify-center"
                  >
                    Sign in
                  </Link>
                </div>
              )}
              <FirebaseRealtimeStatus variant="compact" />
              <div className="flex items-center justify-between text-xs font-mono text-carbon-80">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-nasa-green" />
                  <strong className="text-carbon-90">HazardNet</strong>
                </span>
                {user && (
                  <button
                    type="button"
                    onClick={handleDrawerSignOut}
                    disabled={isLoggingOut}
                    className="min-h-[44px] text-nasa-red-shade hover:text-nasa-red font-bold transition-colors disabled:opacity-50 touch-manipulation"
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
