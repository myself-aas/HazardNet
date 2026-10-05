import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import MaterialIcon from './MaterialIcon';
import { HazardNetBrand } from './HazardNetLogo';
import { MenuToggleIcon } from './brand';
import { LanguageToggle } from './alerts/LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { DRAWER_SECTIONS, isPathCurrent, type NavItem } from '../lib/navigation';
import type { AppleThemeName } from './apple/motion';
import { useDialogBehavior } from '../hooks/useDialogBehavior';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { usePWAInstall } from '../hooks/usePWAInstall';

/**
 * The menu drawer — the one place everything else went.
 *
 * It used to be a header of four icon buttons (brand, bell, person, close) over four collapsed accordions, each
 * with a count badge, over a status badge and a "HazardNet" footer line: dense, and the person icon and the bell
 * competed with the close button for the same corner. Now, top to bottom:
 *
 *   brand · close
 *   Search                          one wide row (opens the command palette)
 *   Locate · Alerts · Install       three plain tiles: icon over ONE word
 *   English | বাংলা
 *   System | Light | Dark          appearance — the theme follows the OS by default, so the
 *                                  control that overrides it lives with the other preference
 *   Explore / Advice / Data / Learn two-column grids of one-or-two-word links, icon beside word, nothing hidden
 *   Sign in · Sign up               (or: your name · Sign out)
 *
 * Every link is a real <Link>, so middle-click, long-press and screen-reader link lists all work. The panel slides in
 * from the right, where the menu button is. Contract kept for the tests: role="dialog", `data-testid="menu-drawer"`,
 * `menu-drawer-close`, `drawer-signin-link`, `drawer-signup-link`, portaled by the Navbar onto `--z-overlay`, with the
 * backdrop as its previous sibling.
 */

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  onSelectDistrict?: (districtId: string) => void;
  /** @deprecated Links navigate themselves now; kept so existing callers still type-check. */
  onSelectPage?: (page: string) => void;
  activePage?: string;
  /** Open the command palette (the header no longer has a search icon). */
  onOpenSearch?: () => void;
  onLocate?: () => void;
  isLocating?: boolean;
  /** Side-effects that ride on a navigation (the saved-districts heatmap). */
  onNavigateItem?: (item: NavItem) => void;
  /** Current appearance preference (`system` follows the OS). Omit to hide the control. */
  theme?: AppleThemeName;
  onThemeChange?: (theme: AppleThemeName) => void;
}

const tileClass =
  'flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-carbon-20 bg-white px-2 py-2.5 text-ap-caption font-semibold text-carbon-90 transition-colors duration-150 hover:bg-carbon-05 disabled:opacity-60 touch-manipulation cursor-pointer';

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  user,
  onOpenProfile,
  onOpenSearch,
  onLocate,
  isLocating = false,
  onNavigateItem,
  theme,
  onThemeChange,
}) => {
  const location = useLocation();
  const { signOut: authSignOut } = useAuth();
  const reduceMotion = useReducedMotion();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const { isSubscribed, isSupported, loading: pushLoading, statusMessage, handleTogglePush } = usePushNotifications();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  // Focus is trapped and Escape closes (shared with the other dialogs).
  useDialogBehavior({ isOpen, onClose, containerRef: drawerPanelRef, initialFocusRef: closeButtonRef });

  const handleSignOut = async () => {
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

  if (!isOpen) return null;

  const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();
  const showInstall = isInstallable && !isInstalled;

  return (
    <>
      <motion.div
        key="drawer-backdrop"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 h-dvh bg-carbon-black/40 z-[var(--ap-z-overlay)]"
        onClick={onClose}
        {...({ inert: true } as Record<string, unknown>)}
      />

      <motion.div
        key="drawer-panel"
        id="menu-drawer"
        ref={drawerPanelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        data-testid="menu-drawer"
        initial={reduceMotion ? { x: 0 } : { x: '100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="fixed inset-y-0 right-0 z-[var(--ap-z-overlay)] flex w-full max-w-[380px] select-none flex-col overflow-hidden border-l border-carbon-20 bg-white font-sans text-carbon-80"
      >
        {/* brand · close — the only two things in the header row */}
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <HazardNetBrand size="sm" />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            data-testid="menu-drawer-close"
            aria-label="Close navigation menu"
            title="Close menu"
            className="tap-target -mr-2 flex cursor-pointer items-center justify-center rounded-full text-carbon-90 transition-colors duration-150 hover:bg-carbon-10 touch-manipulation"
          >
            <MenuToggleIcon open size={26} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {/* Search — one wide row */}
          <button
            type="button"
            onClick={() => onOpenSearch?.()}
            data-testid="district-search-trigger"
            className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-2xl border border-carbon-30 bg-carbon-05 px-4 text-left text-ap-caption font-semibold text-carbon-70 transition-colors duration-150 hover:bg-carbon-10 touch-manipulation"
          >
            <MaterialIcon name="map_search" className="h-5 w-5 shrink-0 text-carbon-90" />
            <span className="flex-1">Search</span>
            <kbd className="hidden rounded-md border border-carbon-30 bg-white px-1.5 py-0.5 font-sans text-xs font-semibold text-carbon-60 sm:inline">
              Ctrl K
            </kbd>
          </button>

          {/* Three plain tiles: icon over one word */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLocate?.();
              }}
              disabled={isLocating}
              aria-busy={isLocating || undefined}
              className={tileClass}
            >
              <MaterialIcon name="location_on" className="h-6 w-6 text-ap-link" />
              <span>Locate</span>
            </button>
            <button
              type="button"
              onClick={handleTogglePush}
              disabled={!isSupported || pushLoading}
              aria-pressed={isSubscribed}
              aria-busy={pushLoading || undefined}
              title={!isSupported ? 'Not supported in this browser' : undefined}
              className={tileClass}
            >
              <MaterialIcon
                name={isSubscribed ? 'notifications_active' : 'notifications'}
                className={`h-6 w-6 ${isSubscribed ? 'text-ap-link' : 'text-carbon-90'}`}
              />
              <span>Alerts</span>
              <span
                aria-hidden="true"
                className={`-mt-1 text-xs font-medium ${isSubscribed ? 'text-ap-link' : 'text-carbon-60'}`}
              >
                {isSubscribed ? 'On' : 'Off'}
              </span>
            </button>
            {showInstall ? (
              <button type="button" onClick={install} className={tileClass}>
                <MaterialIcon name="install_mobile" className="h-6 w-6 text-ap-link" />
                <span>Install</span>
              </button>
            ) : (
              <Link to="/download" onClick={onClose} className={`${tileClass} no-underline`}>
                <MaterialIcon name="download" className="h-6 w-6 text-carbon-90" />
                <span>Apps</span>
              </Link>
            )}
          </div>
          {statusMessage && <p className="-mt-3 text-center text-xs text-carbon-60">{statusMessage}</p>}

          <LanguageToggle variant="switch" tone="slate" className="w-full [&>button]:flex-1" />

          {/* Appearance. Rendered only when the shell wires it up (App → Navbar → here), so a
              drawer rendered bare in a test does not grow a control that does nothing. The
              options are self-describing, like the language pair above, and the group carries an
              accessible name of its own. */}
          {theme && onThemeChange && (
            <ThemeToggle theme={theme} onChange={onThemeChange} className="w-full [&>button]:flex-1" />
          )}

          {/* Everything else: four groups, two columns, nothing collapsed */}
          {DRAWER_SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`drawer-${section.id}`}>
              <h2
                id={`drawer-${section.id}`}
                className="mb-1.5 px-1 text-xs font-bold uppercase tracking-[0.08em] text-carbon-60"
              >
                {section.category}
              </h2>
              <ul className="grid grid-cols-2 gap-1.5">
                {section.items.map((item) => {
                  const isActive = isPathCurrent(location.pathname, item.path);
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.path}
                        onClick={() => {
                          onNavigateItem?.(item);
                          onClose();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex min-h-[48px] items-center gap-2.5 rounded-xl px-3 text-ap-caption no-underline transition-colors duration-150 touch-manipulation ${
                          isActive
                            ? 'bg-blue-50 font-bold text-blue-700'
                            : 'font-semibold text-carbon-80 hover:bg-carbon-05'
                        }`}
                      >
                        <MaterialIcon
                          name={item.icon}
                          className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-ap-link' : 'text-carbon-60'}`}
                        />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Account */}
        <div className="shrink-0 border-t border-carbon-20 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {user ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onOpenProfile?.();
                  onClose();
                }}
                className="flex min-h-[48px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors duration-150 hover:bg-carbon-05 touch-manipulation"
                title="Profile"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-ap-action-fg">
                  {initial}
                </span>
                <span className="truncate text-ap-caption font-semibold text-carbon-90">Profile</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isLoggingOut}
                className="min-h-[48px] cursor-pointer rounded-xl px-4 text-ap-caption font-semibold text-carbon-70 transition-colors duration-150 hover:bg-carbon-05 disabled:opacity-50 touch-manipulation"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/login"
                data-testid="drawer-signin-link"
                onClick={onClose}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-primary text-ap-caption font-semibold text-ap-action-fg no-underline transition-colors duration-150 hover:bg-primary-strong touch-manipulation"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                data-testid="drawer-signup-link"
                onClick={onClose}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-carbon-30 text-ap-caption font-semibold text-carbon-90 no-underline transition-colors duration-150 hover:bg-carbon-05 touch-manipulation"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default MenuDrawer;
