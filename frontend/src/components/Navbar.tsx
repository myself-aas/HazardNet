import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import MaterialIcon from './MaterialIcon';
import CommandPalette from './CommandPalette';
import { useAuth } from '../context/AuthContext';
import { SavedAssessmentsModal } from './SavedAssessmentsModal';
import { MenuDrawer } from './MenuDrawer';
import { HazardNetBrand } from './HazardNetLogo';
import { MenuToggleIcon } from './brand';
import { detectExactPinpointLocation } from '../services/geolocationService';
import { PRIMARY_LINKS, type NavItem } from '../lib/navigation';
import type { AppleThemeName } from './apple/motion';

/**
 * The site header — as little as it can be.
 *
 *   [ HazardNet lockup ]   Home  Forecasts  Alerts  Advice  Learn                         [ ☰ ]
 *
 * That is the whole bar, at every width: the brand on the left; five plain-word links from the `lg` breakpoint up; and
 * ONE control on the right, the menu button. Below `lg` the links disappear and the menu button is all that is left.
 *
 * What used to sit beside it — a locate button, a search icon, a bell, a connectivity badge, Login and Sign up, and (on
 * phones) a hamburger next to the logo — are icon-and-text pairs crowded side by side. They now live in the menu drawer,
 * which has room for them and labels them in words (see MenuDrawer.tsx). Search is still one keystroke away anywhere
 * (Ctrl/Cmd+K) and one tap inside the drawer.
 *
 * Behaviour that is kept: over the front-door hero the bar is transparent with white type until the page scrolls;
 * Escape and every route change close the drawer; overlays are portaled to <body> above the bar (--z-overlay over
 * --z-nav). The command palette is mounted exactly once (it used to be mounted twice, once per layout).
 *
 * The scrolled bar is `bg-white/95` + `text-carbon-80`, and the menu icon paints in `currentColor`. In dark mode the
 * theme layer re-points both halves (`dark.css` §4), which is what fixed the 2026-10-04 report of a hamburger that
 * vanished while scrolling: the bar stayed white while its ink went near-white. The brand lockup follows the theme
 * (`variant="auto"`), except over the hero, where the artwork stays the white wordmark because the hero image is
 * dark in both themes.
 */

interface NavbarProps {
  onSelectDistrict?: (districtId: string) => void;
  onToggleHeatmap?: () => void;
  onToggle3DTilt?: () => void;
  onClearSearch?: () => void;
  onOpenAIDrawer?: () => void;
  onExportReport?: () => void;
  /**
   * Appearance preference and its setter, straight from `useAppleTheme` in App. Optional:
   * without them the bar still renders (tests, storybook), it just has no theme control to hand
   * to the drawer. The bar itself deliberately carries no switch — "one button" is the contract
   * (see the class docstring and NavbarSimplicity.test.tsx) — so the control lives in the drawer
   * with the other preference (language).
   */
  theme?: AppleThemeName;
  onThemeChange?: (theme: AppleThemeName) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSelectDistrict, onToggleHeatmap, theme, onThemeChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const isFrontDoor = location.pathname === '/';
  const [isScrolled, setIsScrolled] = useState(false);

  // Over the front-door hero the bar is transparent; everywhere else (and after 80px of scroll) it is solid.
  useEffect(() => {
    if (!isFrontDoor) {
      setIsScrolled(true);
      return undefined;
    }
    const handleScroll = () => setIsScrolled(window.scrollY > 80);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isFrontDoor]);

  const overHero = isFrontDoor && !isScrolled;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuDrawerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // A route change always closes the drawer (it used to linger across navigations).
  useEffect(() => {
    setIsMenuDrawerOpen(false);
  }, [location.pathname]);

  const handleLocate = async () => {
    setIsLocating(true);
    toast.loading('Detecting location & mapping district…', { id: 'nav-locate' });
    try {
      const result = await detectExactPinpointLocation();
      toast.dismiss('nav-locate');
      if (result.nearestDistrict) {
        if (onSelectDistrict) onSelectDistrict(result.nearestDistrict.id);
        toast.success(
          `Mapped to ${result.nearestDistrict.name} District (${result.nearestDistrict.division} Division)`,
          {
            icon: <MaterialIcon name="location_on" className="h-4 w-4" />,
            duration: 4500,
          },
        );
        navigate(`/?district=${result.nearestDistrict.id}`);
      }
    } catch {
      toast.dismiss('nav-locate');
      toast.error('Could not detect location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleNavigateItem = (item: NavItem) => {
    if (item.extraAction === 'toggleHeatmap' && onToggleHeatmap) onToggleHeatmap();
  };

  const linkClass = (current: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-control px-3 text-ap-caption font-semibold no-underline transition-colors duration-150 ${
      overHero
        ? current
          ? 'bg-white/15 text-white'
          : 'text-white/85 hover:bg-white/10 hover:text-white'
        : current
          ? 'bg-carbon-10 text-carbon-90'
          : 'text-carbon-70 hover:bg-carbon-05 hover:text-carbon-90'
    }`;

  return (
    <>
      <header
        className={`animate-in fade-in sticky top-0 z-[var(--z-nav)] flex h-14 select-none items-center pt-[env(safe-area-inset-top)] duration-300 sm:h-16 ${
          overHero
            ? 'border-b border-white/10 bg-black/25 text-white backdrop-blur-md'
            : 'border-b border-carbon-20 bg-white/95 text-carbon-80 shadow-xs backdrop-blur-md'
        } transition-colors ease-out`}
        data-testid="site-header"
      >
        <div className="mx-auto flex h-full w-full max-w-[1280px] items-center gap-2 px-4 xl:px-8">
          <Link
            to="/"
            className="flex min-h-[44px] shrink-0 items-center no-underline"
            title="HazardNet: multi-hazard early warning for Bangladesh agriculture"
          >
            <HazardNetBrand size="md" variant={overHero ? 'dark' : 'auto'} />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main Navigation">
            {PRIMARY_LINKS.map((link) => {
              const current = link.isCurrent(location.pathname);
              return (
                <Link
                  key={link.id}
                  to={link.path}
                  aria-current={current ? 'page' : undefined}
                  className={linkClass(current)}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* The one control. Its accessible name is part of the e2e contract ("Open navigation menu"). */}
          <button
            type="button"
            onClick={() => setIsMenuDrawerOpen((open) => !open)}
            className={`tap-target -mr-2 ml-auto flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 touch-manipulation ${
              overHero ? 'text-white hover:bg-white/10' : 'text-carbon-90 hover:bg-carbon-10'
            }`}
            aria-label={isMenuDrawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuDrawerOpen}
            aria-haspopup="dialog"
            aria-controls="menu-drawer"
            title={isMenuDrawerOpen ? 'Close menu' : 'Menu'}
          >
            <MenuToggleIcon open={isMenuDrawerOpen} size={26} />
          </button>
        </div>
      </header>

      {/* The one command palette — opened from the drawer's Search row or with Ctrl/Cmd+K. Portaled by the component. */}
      <CommandPalette
        onSelectDistrict={onSelectDistrict}
        hideTrigger
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
      />

      {/*
        Full-screen overlays are portaled to document.body so they escape the header's stacking context: above the
        header (--z-nav), below toasts (--z-toast).
      */}
      {createPortal(
        <SavedAssessmentsModal
          isOpen={isSavedModalOpen}
          onClose={() => setIsSavedModalOpen(false)}
          onSelectDistrict={onSelectDistrict}
        />,
        document.body,
      )}

      {createPortal(
        <MenuDrawer
          isOpen={isMenuDrawerOpen}
          onClose={() => setIsMenuDrawerOpen(false)}
          user={user}
          onOpenProfile={() => navigate('/profile')}
          onOpenAuth={() => navigate('/login')}
          onOpenSearch={() => {
            setIsMenuDrawerOpen(false);
            setIsSearchOpen(true);
          }}
          onLocate={handleLocate}
          isLocating={isLocating}
          onNavigateItem={handleNavigateItem}
          theme={theme}
          onThemeChange={onThemeChange}
        />,
        document.body,
      )}
    </>
  );
};

export default Navbar;
