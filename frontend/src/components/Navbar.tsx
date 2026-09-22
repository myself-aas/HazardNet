import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from './MaterialIcon';
import CommandPalette from './CommandPalette';
import { useAuth } from '../context/AuthContext';
import { SavedAssessmentsModal } from './SavedAssessmentsModal';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';
import { MenuDrawer } from './MenuDrawer';
import { HazardNetBrand } from './HazardNetLogo';
import { detectExactPinpointLocation } from '../services/geolocationService';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePWAInstall } from '../hooks/usePWAInstall';
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-carbon-90 text-base leading-[1.35]">{item.title}</span>
          {item.badge && (
            <span className="hn-badge px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300/80 text-[10px] font-bold">
              {item.badge}
            </span>
          )}
        </div>
        {item.description && (
          <div className="text-xs text-carbon-60 leading-tight mt-0.5">{item.description}</div>
        )}
      </div>
    </Link>
  );
};

const AlertsMegaMenuContent: React.FC<{
  items: NavItem[];
  pathname: string;
  onChoose: (item: NavItem) => void;
}> = ({ items, pathname, onChoose }) => {
  const {
    isSubscribed,
    loading,
    statusMessage,
    isSupported,
    handleTogglePush,
  } = usePushNotifications();

  return (
    <>
      {items.map((item) => (
        <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
      ))}
      <div className="p-3 bg-carbon-05 border-t border-carbon-20 mt-1">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-carbon-90">
            <MaterialIcon name="notifications_active" className="text-nasa-red text-sm" />
            <span>Browser Push Alerts</span>
          </div>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
              isSubscribed
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-carbon-10 text-carbon-60 border-carbon-20'
            }`}
          >
            {isSubscribed ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <p className="text-[11px] text-carbon-60 leading-normal mb-2">
          Real-time browser notifications for cyclonic surges, floods & emergency bulletins.
        </p>
        {!isSupported ? (
          <div className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
            Web Push is not supported in this browser environment.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleTogglePush}
            disabled={loading}
            className={`w-full py-1.5 px-3 rounded-control text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              isSubscribed
                ? 'bg-white border border-carbon-30 text-carbon-70 hover:bg-carbon-10'
                : 'bg-nasa-red hover:bg-nasa-red-shade text-white shadow-xs'
            }`}
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <MaterialIcon name={isSubscribed ? 'notifications_off' : 'notifications'} className="text-sm" />
            )}
            <span>{loading ? 'Updating...' : isSubscribed ? 'Disable Push Alerts' : 'Enable Push Alerts'}</span>
          </button>
        )}
        {statusMessage && (
          <div className="mt-1.5 text-[10px] text-carbon-70 text-center font-medium">
            {statusMessage}
          </div>
        )}
      </div>
    </>
  );
};

const KnowledgeMegaMenuContent: React.FC<{
  items: NavItem[];
  pathname: string;
  onChoose: (item: NavItem) => void;
}> = ({ items, pathname, onChoose }) => {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const resourceItems = items.filter(
    (it) => it.badge !== 'ADMIN' && !['hindcast', 'historical'].includes(it.id)
  );
  const adminItems = items.filter(
    (it) => it.badge === 'ADMIN' || ['hindcast', 'historical'].includes(it.id)
  );

  return (
    <>
      <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-carbon-50">
        Resources & Insights
      </div>
      {resourceItems.map((item) => (
        <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
      ))}

      {adminItems.length > 0 && (
        <>
          <div className="my-1 border-t border-carbon-10" />
          <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-carbon-50 flex items-center justify-between">
            <span>Analytics & Intelligence</span>
            <span className="hn-badge px-1 py-0.2 bg-amber-100 text-amber-800 border border-amber-300/80 text-[9px] font-bold">
              ADMIN
            </span>
          </div>
          {adminItems.map((item) => (
            <MegaItem key={item.id} item={item} pathname={pathname} onChoose={onChoose} />
          ))}
        </>
      )}

      <div className="p-2.5 bg-carbon-05 border-t border-carbon-20 mt-1 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <div className="text-xs font-semibold text-carbon-90 flex items-center gap-1.5">
            <MaterialIcon name="install_mobile" className="text-nasa-blue text-sm" />
            <span>HazardNet App</span>
          </div>
          <div className="text-[11px] text-carbon-60 truncate">
            {isInstalled ? 'Installed on this device' : 'Install for offline & rapid access'}
          </div>
        </div>
        {!isInstalled && (
          <button
            type="button"
            onClick={() => {
              if (isInstallable) {
                install();
              } else {
                navigate('/download');
                onChoose({ id: 'download', title: 'Download Center', path: '/download', icon: 'download' });
              }
            }}
            className="py-1 px-3 bg-nasa-blue hover:bg-nasa-blue-shade text-white rounded-control text-xs font-semibold shrink-0 cursor-pointer shadow-xs transition-colors"
          >
            Install App
          </button>
        )}
      </div>
    </>
  );
};

const MegaMenu: React.FC<{
  menu: DesktopMenu;
  active: boolean;
  pathname: string;
  reduceMotion: boolean | null;
  isTransparent?: boolean;
  onToggle: () => void;
  onChoose: (item: NavItem) => void;
}> = ({ menu, active, pathname, reduceMotion, isTransparent, onToggle, onChoose }) => {
  const current = menu.isCurrent(pathname);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-haspopup="true"
        aria-current={current ? 'page' : undefined}
        className={`hn-nav-link min-h-[44px] px-2.5 py-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 touch-manipulation transition-colors duration-200 ${
          isTransparent
            ? '!text-white hover:!bg-white/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
            : ''
        } ${active || current ? 'hn-nav-link-active' : ''}`}
      >
        <span>{menu.label}</span>
        <span
          className={`${isTransparent ? 'text-white/80' : 'text-carbon-60'} inline-block transition-transform duration-150 ${active ? 'rotate-180' : ''}`}
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
            {menu.id === 'alerts' ? (
              <AlertsMegaMenuContent items={menu.items} pathname={pathname} onChoose={onChoose} />
            ) : menu.id === 'docs' ? (
              <KnowledgeMegaMenuContent items={menu.items} pathname={pathname} onChoose={onChoose} />
            ) : menu.id === 'forecasts' ? (
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

  const isFrontDoor = location.pathname === '/';
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (!isFrontDoor) {
      setIsScrolled(true);
      return;
    }
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isFrontDoor]);

  const isHeaderTransparent = isFrontDoor && !isScrolled;

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
        className={`sticky top-0 z-[var(--z-nav)] select-none h-14 sm:h-16 flex items-center pt-[env(safe-area-inset-top)] transition-all duration-300 ease-out ${
          isHeaderTransparent
            ? 'bg-black/25 backdrop-blur-md border-b border-white/10 text-white'
            : 'bg-white/95 backdrop-blur-md border-b border-carbon-20 text-carbon-80 shadow-xs'
        }`}
      >
        <div className="px-4 xl:px-8 w-full relative flex items-center justify-between">
          {/*
            COMPACT VIEW LAYOUT (xl:hidden).
            The full desktop bar (brand + 5 nav menus + search + alerts + auth)
            measures ~1180px, so it only fits from the `xl` breakpoint (1280px)
            up. Switching this below `xl` causes horizontal overflow.
          */}
          <div className="flex xl:hidden items-center justify-between w-full min-w-0">
            <button
              type="button"
              onClick={() => setIsMenuDrawerOpen(!isMenuDrawerOpen)}
              className="tap-target min-h-[44px] min-w-[44px] p-2 bg-transparent border-0 flex items-center justify-center shrink-0 cursor-pointer touch-manipulation transition-transform duration-200 hover:translate-x-0.5 active:scale-95"
              aria-label={isMenuDrawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              title={isMenuDrawerOpen ? 'Close Menu' : 'Open Menu'}
            >
              <MaterialIcon
                name={isMenuDrawerOpen ? 'close' : 'menu_open'}
                className={`w-6 h-6 transition-colors duration-200 ${
                  isHeaderTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]' : 'text-carbon-90'
                }`}
              />
            </button>

            <Link
              to="/"
              className="min-h-[44px] h-11 flex items-center justify-center gap-1.5 px-2 py-1.5 text-carbon-90 touch-manipulation"
              title="HazardNet"
            >
              <HazardNetBrand size="sm" variant={isHeaderTransparent ? 'dark' : 'light'} />
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="tap-target min-h-[44px] min-w-[44px] p-2 bg-transparent border-0 flex items-center justify-center cursor-pointer disabled:opacity-50 touch-manipulation group transition-colors duration-200"
                title="Locate me"
                aria-label="Locate me"
              >
                {isLocatingInNavbar ? (
                  <span
                    className={`w-4 h-4 border-2 border-t-transparent animate-spin ${
                      isHeaderTransparent ? 'border-white' : 'border-nasa-blue'
                    }`}
                  />
                ) : (
                  <MaterialIcon
                    name="location_on"
                    className={`w-6 h-6 transition-all duration-200 group-hover:-translate-y-1 ${
                      isHeaderTransparent
                        ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'
                        : 'text-nasa-blue'
                    }`}
                  />
                )}
              </button>
              <CommandPalette onSelectDistrict={onSelectDistrict} isTransparent={isHeaderTransparent} />
            </div>
          </div>

          {/* DESKTOP VIEW LAYOUT (hidden xl:flex) — full bar needs ~1180px, so it activates at xl (1280px). */}
          <div className="hidden xl:flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2 shrink-0 min-w-0">
              <Link
                to="/"
                className="min-h-[44px] h-11 flex items-center justify-center gap-2 px-2 py-1.5 text-carbon-90 shrink-0 touch-manipulation"
                title="HazardNet Early Warning System"
              >
                <HazardNetBrand size="md" variant={isHeaderTransparent ? 'dark' : 'light'} />
              </Link>

              <nav className="flex items-center gap-1" aria-label="Main Navigation">
                {/*
                  Streamlined 5-item desktop navigation architecture:
                  1. Home · 2. Forecasts · 3. Alerts (with Push Alerts embedded) · 4. Advisories · 5. Knowledge (with PWA install & Analytics Admin embedded)
                */}
                {[
                  DESKTOP_MENUS.find((m) => m.id === 'home')!,
                  DESKTOP_MENUS.find((m) => m.id === 'forecasts')!,
                  DESKTOP_MENUS.find((m) => m.id === 'alerts')!,
                  DESKTOP_MENUS.find((m) => m.id === 'advisories')!,
                  DESKTOP_MENUS.find((m) => m.id === 'docs')!,
                ]
                  .filter(Boolean)
                  .map((menu) => (
                    <MegaMenu
                      key={menu.id}
                      menu={menu}
                      active={activeMenu === menu.id}
                      pathname={location.pathname}
                      reduceMotion={reduceMotion}
                      isTransparent={isHeaderTransparent}
                      onToggle={() => setActiveMenu((prev) => (prev === menu.id ? null : menu.id))}
                      onChoose={handleMegaChoose}
                    />
                  ))}
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-control bg-nasa-blue hover:bg-nasa-blue-shade text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 touch-manipulation group shadow-sm transition-all duration-200"
                title="Detect my location & map to nearest district"
              >
                {isLocatingInNavbar ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <MaterialIcon
                      name="location_on"
                      className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-0.5"
                    />
                    <span className="hidden 2xl:inline text-xs whitespace-nowrap">Locate Me</span>
                  </>
                )}
              </button>

              <CommandPalette onSelectDistrict={onSelectDistrict} isTransparent={isHeaderTransparent} />

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
                    className={`min-h-[44px] px-4 py-2 rounded-control font-semibold text-sm shadow-sm touch-manipulation inline-flex items-center justify-center transition-colors duration-200 ${
                      isHeaderTransparent
                        ? 'bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm drop-shadow-sm'
                        : 'bg-nasa-blue hover:bg-nasa-blue-shade text-white'
                    }`}
                  >
                    Login
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
