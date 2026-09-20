import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from './MaterialIcon';
import CommandPalette from './CommandPalette';
import { useAuth } from '../context/AuthContext';
import { SavedAssessmentsModal } from './SavedAssessmentsModal';
import { NotificationToggle } from './NotificationToggle';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';
import { MenuDrawer } from './MenuDrawer';
import { MenuCloseIcon } from './ui/animated-state-icons';
import { HazardNetBrand } from './HazardNetLogo';
import { detectExactPinpointLocation } from '../services/geolocationService';
import { PWAInstallButton } from './PWAInstallButton';
import {
  DESKTOP_LINKS,
  DESKTOP_MENUS,
  isPathCurrent,
  type DesktopMenu,
  type DesktopMenuId,
  type NavItem,
} from '../lib/navigation';

interface NavbarProps {
  onSelectDistrict?: (districtId: string) => void;
  onToggleHeatmap?: () => void;
  onToggle3DTilt?: () => void;
  onClearSearch?: () => void;
  onOpenAIDrawer?: () => void;
  onExportReport?: () => void;
  isTransparent?: boolean;
}

const megaItemClass =
  'w-full min-h-[44px] p-2 text-left flex items-start gap-2 rounded-none hover:bg-carbon-05 transition-colors cursor-pointer group no-underline';

const MegaItem: React.FC<{
  item: NavItem;
  pathname: string;
  onChoose: (item: NavItem) => void;
}> = ({ item, pathname, onChoose }) => {
  const current = isPathCurrent(pathname, item.path);
  return (
    <Link
      to={item.path}
      aria-current={current ? 'page' : undefined}
      onClick={() => onChoose(item)}
      className={megaItemClass}
    >
      <div className="p-2 bg-carbon-05 text-nasa-blue shrink-0">
        <MaterialIcon name={item.icon} className="text-lg" />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-carbon-90 text-base leading-[1.35]">{item.title}</div>
        {item.description && (
          <div className="text-xs text-carbon-60 leading-tight mt-0.5">{item.description}</div>
        )}
      </div>
    </Link>
  );
};

const MegaMenu: React.FC<{
  menu: DesktopMenu;
  active: boolean;
  pathname: string;
  reduceMotion: boolean | null;
  onToggle: () => void;
  onChoose: (item: NavItem) => void;
}> = ({ menu, active, pathname, reduceMotion, onToggle, onChoose }) => {
  const current = menu.isCurrent(pathname);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-haspopup="true"
        aria-current={current ? 'page' : undefined}
        className={`hn-nav-link min-h-[44px] px-3 py-2 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 touch-manipulation ${
          active || current ? 'hn-nav-link-active' : ''
        }`}
      >
        <span>{menu.label}</span>
        {menu.id === 'analytics' && (
          <span className="hn-badge px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300/80">
            ADMIN
          </span>
        )}
        <span
          className={`text-carbon-60 inline-block transition-transform duration-150 ${active ? 'rotate-180' : ''}`}
        >
          <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70" />
        </span>
      </button>
      <AnimatePresence>
        {active && (
          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full left-0 mt-2 ${menu.panelWidthClass} bg-white border border-carbon-20 p-1 z-[var(--z-overlay)] text-carbon-80`}
          >
            {menu.id === 'forecasts' ? (
              <>
                {menu.items.slice(0, 4).map((item) => (
                  <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
                ))}
                <div className="my-1 border-t border-carbon-10" />
                {menu.items.slice(4).map((item) => (
                  <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
                ))}
              </>
            ) : (
              menu.items.map((item) => (
                <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  onSelectDistrict,
  onToggleHeatmap,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const reduceMotion = useReducedMotion();

  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<DesktopMenuId | null>(null);
  const [isLocatingInNavbar, setIsLocatingInNavbar] = useState(false);

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNavbarLocate = async () => {
    setIsLocatingInNavbar(true);
    toast.loading('Detecting location & mapping district...', { id: 'nav-locate' });
    try {
      const result = await detectExactPinpointLocation();
      toast.dismiss('nav-locate');
      if (result.nearestDistrict) {
        if (onSelectDistrict) {
          onSelectDistrict(result.nearestDistrict.id);
        }
        toast.success(
          `Mapped to ${result.nearestDistrict.name} District (${result.nearestDistrict.division} Division)!`,
          { icon: <MaterialIcon name="location_on" className="w-4 h-4" />, duration: 4500 }
        );
        navigate(`/?district=${result.nearestDistrict.id}`);
      }
    } catch (err) {
      toast.dismiss('nav-locate');
      toast.error('Could not detect location.');
    } finally {
      setIsLocatingInNavbar(false);
    }
  };

  const handleMegaChoose = (item: NavItem) => {
    setActiveMenu(null);
    if (item.extraAction === 'toggleHeatmap' && onToggleHeatmap) {
      onToggleHeatmap();
    }
  };

  return (
    <>
      <motion.header
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        ref={headerRef}
        className="sticky top-0 border-b border-carbon-20 bg-white text-carbon-80 select-none h-14 sm:h-16 flex items-center pt-[env(safe-area-inset-top)]"
      >
        <div className="px-4 xl:px-8 w-full relative flex items-center justify-between">
          {/*
            COMPACT VIEW LAYOUT (xl:hidden).
            The full desktop bar (brand + 5 nav menus + search + alerts + auth)
            measures ~1180px, so it only fits from the `xl` breakpoint (1280px)
            up. Switching this at `md` (768px) made the sticky header wider than
            the viewport and produced ~250px of page-level horizontal scrolling
            on every tablet-width page (caught by e2e/smoke.spec.ts).
          */}
          <div className="flex xl:hidden items-center justify-between w-full min-w-0">
            <button
              type="button"
              onClick={() => setIsMenuDrawerOpen(!isMenuDrawerOpen)}
              className="tap-target p-2 rounded-control border border-carbon-20 bg-white text-carbon-90 flex items-center justify-center shrink-0 cursor-pointer touch-manipulation"
              aria-label={isMenuDrawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              title={isMenuDrawerOpen ? 'Close Menu' : 'Open Menu'}
            >
              <MenuCloseIcon
                size={24}
                className="text-carbon-90"
                duration={0}
                isState={isMenuDrawerOpen}
              />
            </button>

            <Link
              to="/"
              className="flex items-center justify-center gap-1.5 px-2 py-1 text-carbon-90 touch-manipulation"
              title="HazardNet"
            >
              <HazardNetBrand size="sm" />
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="tap-target p-2 rounded-control bg-nasa-blue hover:bg-nasa-blue-shade text-white flex items-center justify-center cursor-pointer disabled:opacity-50 touch-manipulation"
                title="Locate me"
                aria-label="Locate me"
              >
                {isLocatingInNavbar ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <MaterialIcon name="person_pin_circle" className="w-6 h-6" />
                )}
              </button>
              <CommandPalette onSelectDistrict={onSelectDistrict} />
            </div>
          </div>

          {/* DESKTOP VIEW LAYOUT (hidden xl:flex) — see the note above: the
              full bar needs ~1180px, so it activates at xl (1280px). */}
          <div className="hidden xl:flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2 shrink-0 min-w-0">
              <Link
                to="/"
                className="flex items-center justify-center gap-2 px-2 py-1 text-carbon-90 shrink-0 touch-manipulation"
                title="HazardNet Early Warning System"
              >
                <HazardNetBrand size="md" />
              </Link>

              <nav className="flex items-center gap-2" aria-label="Main Navigation">
                {DESKTOP_MENUS.map((menu) => (
                  <MegaMenu
                    key={menu.id}
                    menu={menu}
                    active={activeMenu === menu.id}
                    pathname={location.pathname}
                    reduceMotion={reduceMotion}
                    onToggle={() => setActiveMenu((prev) => (prev === menu.id ? null : menu.id))}
                    onChoose={handleMegaChoose}
                  />
                ))}

                {DESKTOP_LINKS.map((link) => {
                  const current = link.isCurrent(location.pathname);
                  return (
                    <Link
                      key={link.id}
                      to={link.path}
                      aria-current={current ? 'page' : undefined}
                      className={`hn-nav-link min-h-[44px] px-3 py-2 flex items-center gap-2 whitespace-nowrap shrink-0 no-underline touch-manipulation ${
                        current ? 'hn-nav-link-active' : ''
                      }`}
                    >
                      <MaterialIcon name={link.icon} className="w-4 h-4" />
                      <span>{link.title}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-control bg-nasa-blue hover:bg-nasa-blue-shade text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-manipulation"
                title="Detect my location & map to nearest district"
              >
                {isLocatingInNavbar ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <MaterialIcon name="person_pin_circle" className="w-4 h-4" />
                    {/* The label is a 2xl-only affordance: the desktop bar carries brand + six nav
                        items + five controls, and at exactly 1280px it has no room for this word.
                        The E2E overflow check in e2e/smoke.spec.ts is the guard — adding any item
                        to this bar must be measured against it. */}
                    <span className="hidden 2xl:inline text-xs whitespace-nowrap">Locate Me</span>
                  </>
                )}
              </button>

              <CommandPalette onSelectDistrict={onSelectDistrict} />
              <NotificationToggle />
              <PWAInstallButton />

              <div
                onClick={() => {
                  if (user) {
                    navigate('/profile');
                  } else {
                    navigate('/login');
                  }
                }}
                className="cursor-pointer shrink-0 hidden 2xl:block"
                title="Firebase Realtime Connectivity Status"
              >
                <FirebaseRealtimeStatus variant="badge" />
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 min-h-[44px] p-1 pl-1.5 pr-2.5 bg-white border border-carbon-20 cursor-pointer touch-manipulation"
                  title="Open my profile"
                  data-testid="navbar-profile-btn"
                >
                  {userProfile?.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt=""
                      className="w-7 h-7 rounded-full border border-carbon-20 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-nasa-blue text-white font-black text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-semibold text-carbon-80 max-w-[100px] truncate">
                    {userProfile?.username
                      ? `@${userProfile.username}`
                      : user?.displayName
                      ? user.displayName.split(' ')[0]
                      : 'Dashboard'}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0" data-testid="navbar-auth-links">
                  <Link
                    to="/login"
                    data-testid="navbar-signin-link"
                    className="min-h-[44px] px-3 py-2 text-sm font-semibold text-carbon-70 hover:text-carbon-black hover:bg-carbon-05 touch-manipulation inline-flex items-center"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    data-testid="navbar-signup-link"
                    className="min-h-[44px] px-6 py-3 text-sm font-semibold text-white bg-nasa-red-shade hover:bg-nasa-red touch-manipulation inline-flex items-center"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/*
        Full-screen overlays are portaled to document.body so they escape this
        header wrapper's stacking context. They used to render inside it — so
        when the header had its own elevated z-index, the sticky header painted
        ON TOP of the profile/saved-assessment modal and its backdrop (the
        mobile "popup overlaps  sit
        above the header (--z-nav) and below toasts (--z-toast).
      */}
      {createPortal(
        <SavedAssessmentsModal
          isOpen={isSavedModalOpen}
          onClose={() => setIsSavedModalOpen(false)}
          onSelectDistrict={onSelectDistrict}
        />,
        document.body
      )}

      {createPortal(
        <MenuDrawer
          isOpen={isMenuDrawerOpen}
          onClose={() => setIsMenuDrawerOpen(false)}
          user={user}
          onOpenProfile={() => navigate('/profile')}
          onOpenAuth={() => navigate('/login')}
          onSelectPage={(page) => {
            if (page.toLowerCase().includes('overview')) navigate('/live');
            else if (page.toLowerCase().includes('front door')) navigate('/');
            else if (page.toLowerCase().includes('alert')) navigate('/alerts');
            else if (page.toLowerCase().includes('forecast')) navigate('/forecast/overview');
            else if (page.toLowerCase().includes('advisories')) navigate('/advisories');
            else if (page.toLowerCase().includes('analytics')) navigate('/analytics');
            else if (page.toLowerCase().includes('download')) navigate('/download');
            else if (page.toLowerCase().includes('doc')) navigate('/docs');
          }}
        />,
        document.body
      )}
    </>
  );
};

export default Navbar;
