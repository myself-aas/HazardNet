import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from './MaterialIcon';
import CommandPalette from './CommandPalette';
import { useAuth } from '../context/AuthContext';
import { SavedAssessmentsModal } from './SavedAssessmentsModal';
import { UserProfileModal } from './UserProfileModal';
import { NotificationToggle } from './NotificationToggle';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';
import { MenuDrawer } from './MenuDrawer';
import { MenuCloseIcon } from './ui/animated-state-icons';
import { HazardNetLogo, HazardNetBrand } from './HazardNetLogo';
import { detectExactPinpointLocation } from '../services/geolocationService';

interface NavbarProps {
  onSelectDistrict?: (districtId: string) => void;
  onToggleHeatmap?: () => void;
  onToggle3DTilt?: () => void;
  onClearSearch?: () => void;
  onOpenAIDrawer?: () => void;
  onExportReport?: () => void;
  isTransparent?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSelectDistrict,
  onToggleHeatmap,
  onToggle3DTilt,
  onClearSearch,
  onOpenAIDrawer,
  onExportReport,
  isTransparent,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'home' | 'forecasts' | 'advisories' | 'docs' | 'analytics' | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  
  // Close menu on click outside or escape key
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

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 12) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [isLocatingInNavbar, setIsLocatingInNavbar] = useState(false);

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

  const toggleMenu = (menu: 'home' | 'forecasts' | 'advisories' | 'docs' | 'analytics') => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  const isTransparentMode = isTransparent ?? (
    location.pathname === '/' ||
    location.pathname === '/home' ||
    location.pathname === '/home/overview' ||
    location.pathname === '/forecast/overview'
  );

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        ref={headerRef}
        className={`sticky top-0 z-[2000] border-b text-slate-800 transition-all duration-300 select-none h-14 sm:h-16 flex items-center ${
          isTransparentMode
            ? isScrolled
              ? 'bg-white/85 backdrop-blur-2xl border-slate-200/70 shadow-sm shadow-slate-900/5'
              : 'bg-white/60 backdrop-blur-xl border-white/25 shadow-none'
            : isScrolled
            ? 'bg-white/95 backdrop-blur-2xl border-slate-200/80 shadow-md shadow-slate-900/5'
            : 'bg-white/90 backdrop-blur-xl border-slate-200/60 shadow-xs'
        }`}
      >
        {/* Unified Header Bar */}
        <div className="px-3 sm:px-6 w-full relative flex items-center justify-between">
          
          {/*
            COMPACT VIEW LAYOUT (xl:hidden).
            The full desktop bar (brand + 5 nav menus + search + alerts + auth)
            measures ~1180px, so it only fits from the `xl` breakpoint (1280px)
            up. Switching this at `md` (768px) made the sticky header wider than
            the viewport and produced ~250px of page-level horizontal scrolling
            on every tablet-width page (caught by e2e/smoke.spec.ts).
          */}
          <div className="flex xl:hidden items-center justify-between w-full min-w-0">
            {/* Top Left: Hamburger Menu Icon with Layout Transition */}
            <motion.button
              layout
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 450, damping: 25 }}
              onClick={() => setIsMenuDrawerOpen(!isMenuDrawerOpen)}
              className={
                isMenuDrawerOpen
                  ? "tap-target p-2 rounded-xl border backdrop-blur-md shadow-2xs transition-colors flex items-center justify-center shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none bg-amber-500/20 text-amber-900 border-amber-500/50 shadow-xs"
                  : "tap-target p-2 rounded-xl border backdrop-blur-md shadow-2xs transition-colors flex items-center justify-center shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none bg-white/80 hover:bg-white text-slate-800 border-slate-200/80"
              }
              aria-label={isMenuDrawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              title={isMenuDrawerOpen ? 'Close Menu' : 'Open Menu'}
            >
              <MenuCloseIcon size={20} className={isMenuDrawerOpen ? 'text-amber-700' : 'text-slate-800'} duration={0} isState={isMenuDrawerOpen} />
            </motion.button>

            {/* Center: Brand Logo */}
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center"
            >
              <Link
                to="/"
                className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-xl text-slate-900 hover:bg-white/40 transition-all focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
                title="HazardNet"
              >
                <HazardNetBrand size="sm" />
              </Link>
            </motion.div>

            {/* Top Right: Location & Search */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="tap-target p-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-2xs transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                title="Locate me"
                aria-label="Locate me"
              >
                {isLocatingInNavbar ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <MaterialIcon name="person_pin_circle" className="w-4 h-4" />
                )}
              </button>
              <CommandPalette onSelectDistrict={onSelectDistrict} />
            </div>
          </div>

          {/* DESKTOP VIEW LAYOUT (hidden xl:flex) — see the note above: the
              full bar needs ~1180px, so it activates at xl (1280px). */}
          <div className="hidden xl:flex items-center justify-between w-full min-w-0">
            {/* Left Section: Brand & Navigation Menus */}
            <div className="flex items-center gap-2 lg:gap-4 shrink-0">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center justify-center">
                <Link
                  to="/"
                  className="flex items-center justify-center gap-2 px-2.5 py-1.5 hover:bg-white/50 rounded-xl text-slate-900 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
                  title="HazardNet Early Warning System"
                >
                  <HazardNetBrand size="md" />
                </Link>
              </motion.div>

              {/* Desktop Navigation Tabs */}
              <nav className="flex items-center gap-1" aria-label="Main Navigation">
                
                {/* 1. Home */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleMenu('home')}
                    className={`px-3 py-1.5 text-[13.5px] font-medium rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none ${
                      activeMenu === 'home' || location.pathname.startsWith('/home')
                        ? 'bg-teal-600/10 text-teal-900 font-semibold border border-teal-600/30 shadow-2xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
                    }`}
                  >
                    <span>Map</span>
                    <motion.span
                      animate={{ rotate: activeMenu === 'home' ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-slate-500 inline-block"
                    >
                      <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70 ml-1" />
                    </motion.span>
                  </motion.button>
                  <AnimatePresence>
                    {activeMenu === 'home' && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-72 bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50 text-slate-800"
                      >
                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/home/overview'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-teal-50 text-teal-700 group-hover:bg-teal-100 transition-colors shrink-0">
                            <MaterialIcon name="public" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">GIS Overview & Earth Stage</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Interactive 3D Bangladesh hazard map</div>
                          </div>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Forecasts */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleMenu('forecasts')}
                    className={`px-3 py-1.5 text-[13.5px] font-medium rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none ${
                      activeMenu === 'forecasts' || location.pathname.startsWith('/forecast')
                        ? 'bg-teal-600/10 text-teal-900 font-semibold border border-teal-600/30 shadow-2xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
                    }`}
                  >
                    <span>Forecasts</span>
                    <motion.span
                      animate={{ rotate: activeMenu === 'forecasts' ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-slate-500 inline-block"
                    >
                      <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70 ml-1" />
                    </motion.span>
                  </motion.button>
                  <AnimatePresence>
                    {activeMenu === 'forecasts' && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50 text-slate-800"
                      >
                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/forecast/overview'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 group-hover:bg-blue-100 transition-colors shrink-0">
                            <MaterialIcon name="map" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Forecast Overview</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">National risk map & predictions</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/forecast/my-districts'); setActiveMenu(null); if (onToggleHeatmap) onToggleHeatmap(); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors shrink-0">
                            <MaterialIcon name="bookmarks" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">My Saved Districts</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Personalized district watchlist & alerts</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/forecast/district/mymensingh'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors shrink-0">
                            <MaterialIcon name="insights" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">District Tensor Details</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Deep-dive district ML metrics</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/forecast/compare'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors shrink-0">
                            <MaterialIcon name="compare_arrows" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Comparative Matrix</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Side-by-side risk score benchmarking</div>
                          </div>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. Advisories */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleMenu('advisories')}
                    className={`px-3 py-1.5 text-[13.5px] font-medium rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none ${
                      activeMenu === 'advisories' || location.pathname.startsWith('/advisories')
                        ? 'bg-teal-600/10 text-teal-900 font-semibold border border-teal-600/30 shadow-2xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
                    }`}
                  >
                    <span>What to do</span>
                    <motion.span
                      animate={{ rotate: activeMenu === 'advisories' ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-slate-500 inline-block"
                    >
                      <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70 ml-1" />
                    </motion.span>
                  </motion.button>
                  <AnimatePresence>
                    {activeMenu === 'advisories' && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50 text-slate-800"
                      >
                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/crops'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-green-50 text-green-700 group-hover:bg-green-100 transition-colors shrink-0">
                            <MaterialIcon name="agriculture" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Crop Protection</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Flood & heat stress farming guidance</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/livestock'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-orange-50 text-orange-700 group-hover:bg-orange-100 transition-colors shrink-0">
                            <MaterialIcon name="pets" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Livestock & Veterinary</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Cattle shelter & disease mitigation</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/fisheries'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100 transition-colors shrink-0">
                            <MaterialIcon name="water_drop" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Fisheries & Aquaculture</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Inundation risk for aquaculture ponds</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/health-wash'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-rose-50 text-rose-700 group-hover:bg-rose-100 transition-colors shrink-0">
                            <MaterialIcon name="medical_services" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Public Health & WASH</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Waterborne disease prevention</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/seasonal-calendar'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100 transition-colors shrink-0">
                            <MaterialIcon name="event_note" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Seasonal Calendar</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Monsoon & cyclone timing guidance</div>
                          </div>
                        </motion.button>

                        <motion.button
                          whileHover={{ x: 3 }}
                          onClick={() => { navigate('/advisories/emergency-response'); setActiveMenu(null); }}
                          className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group"
                        >
                          <div className="p-2 rounded-xl bg-red-50 text-red-700 group-hover:bg-red-100 transition-colors shrink-0">
                            <MaterialIcon name="emergency" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Emergency Response SOP</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Relief requisition & cluster hotlines</div>
                          </div>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 4. Docs & Knowledge */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleMenu('docs')}
                    className={`px-3 py-1.5 text-[13.5px] font-medium rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none ${
                      activeMenu === 'docs' || location.pathname.startsWith('/docs') || location.pathname.startsWith('/download') || location.pathname.startsWith('/blogs') || location.pathname.startsWith('/about')
                        ? 'bg-teal-600/10 text-teal-900 font-semibold border border-teal-600/30 shadow-2xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
                    }`}
                  >
                    <span>Knowledge</span>
                    <motion.span
                      animate={{ rotate: activeMenu === 'docs' ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-slate-500 inline-block"
                    >
                      <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70 ml-1" />
                    </motion.span>
                  </motion.button>
                  <AnimatePresence>
                    {activeMenu === 'docs' && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50 text-slate-800"
                      >
                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/docs'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition-colors shrink-0">
                            <MaterialIcon name="menu_book" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">System Documentation</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">API specs & methodology</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/upload'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-sky-50 text-sky-700 group-hover:bg-sky-100 transition-colors shrink-0">
                            <MaterialIcon name="cloud_upload" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Upload Sensor & Gauge Data</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Ingest local CSV or raster data</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/download'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-teal-50 text-teal-700 group-hover:bg-teal-100 transition-colors shrink-0">
                            <MaterialIcon name="download" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Download Center</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Export GeoJSON, shapefiles & bulletins</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/blogs'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-violet-50 text-violet-700 group-hover:bg-violet-100 transition-colors shrink-0">
                            <MaterialIcon name="article" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Technical Insights</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Research papers & early warnings</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/about'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition-colors shrink-0">
                            <MaterialIcon name="info" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">About Initiative</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Bangladesh Early Warning Initiative</div>
                          </div>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 5. Analytics */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleMenu('analytics')}
                    className={`px-3 py-1.5 text-[13.5px] font-medium rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none ${
                      activeMenu === 'analytics' || location.pathname.startsWith('/analytics')
                        ? 'bg-teal-600/10 text-teal-900 font-semibold border border-teal-600/30 shadow-2xs'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-slate-900/5'
                    }`}
                  >
                    <span>Analyst tools</span>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md font-mono text-[10px] font-bold tracking-wider border border-amber-300/80">ADMIN</span>
                    <motion.span
                      animate={{ rotate: activeMenu === 'analytics' ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[10px] text-slate-500 inline-block"
                    >
                      <MaterialIcon name="chevron_down" className="w-3 h-3 inline-block opacity-70 ml-1" />
                    </motion.span>
                  </motion.button>
                  <AnimatePresence>
                    {activeMenu === 'analytics' && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-80 bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 p-1.5 z-50 text-slate-800"
                      >
                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/analytics/pipeline-status'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 group-hover:bg-blue-100 transition-colors shrink-0">
                            <MaterialIcon name="hub" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Data Ingestion Pipeline</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Satellite & sensor streams</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/analytics/model-metrics'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors shrink-0">
                            <MaterialIcon name="monitoring" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">AI Model Performance</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">ML accuracy & F1 scores</div>
                          </div>
                        </motion.button>

                        <motion.button whileHover={{ x: 3 }} onClick={() => { navigate('/analytics/historical'); setActiveMenu(null); }} className="w-full p-2.5 text-left flex items-start gap-3 rounded-xl hover:bg-slate-100/90 transition-all cursor-pointer group">
                          <div className="p-2 rounded-xl bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors shrink-0">
                            <MaterialIcon name="history" className="text-lg" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 text-[13.5px]">Historical Hazard Archive</div>
                            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">Decadal flood & cyclone logs</div>
                          </div>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </nav>
            </div>

            {/* Right Section: Action controls & profile */}
            <div className="flex items-center gap-1.5 xl:gap-2 2xl:gap-3 shrink-0">
              
              {/* Map Location Action Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleNavbarLocate}
                disabled={isLocatingInNavbar}
                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow-2xs border border-amber-300/80 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:outline-none"
                title="Detect my location & map to nearest district"
              >
                {isLocatingInNavbar ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <MaterialIcon name="person_pin_circle" className="w-4 h-4" />
                    <span className="hidden xl:inline text-[12px] whitespace-nowrap">Locate Me</span>
                  </>
                )}
              </motion.button>

              {/* Command Palette / Quick Search */}
              <CommandPalette onSelectDistrict={onSelectDistrict} />

              {/* Push / Emergency Notification Toggle */}
              <NotificationToggle />

              {/* Realtime Firebase Sync Badge */}
              <div
                onClick={() => {
                  if (user) {
                    setIsProfileModalOpen(true);
                  } else {
                    navigate('/login');
                  }
                }}
                className="cursor-pointer shrink-0 hidden 2xl:block"
                title="Firebase Realtime Connectivity Status"
              >
                <FirebaseRealtimeStatus variant="badge" />
              </div>
              
              {/* User Dashboard / Auth Action.
                  Signed-out visitors get real <Link> elements rather than a
                  click-handler <button>: /signup was previously unreachable
                  from the primary navigation (registration required typing the
                  URL), and buttons are invisible to crawlers, screen-reader
                  landmark lists and role-based E2E locators. */}
              {user ? (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-xl bg-white/70 hover:bg-white/95 border border-slate-200/80 shadow-2xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
                  title="Open my dashboard"
                  data-testid="navbar-dashboard-btn"
                >
                  {userProfile?.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt=""
                      className="w-7 h-7 rounded-full border border-slate-200 object-cover shadow-xs"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-slate-800 max-w-[100px] truncate">
                    {userProfile?.username
                      ? `@${userProfile.username}`
                      : user?.displayName
                      ? user.displayName.split(' ')[0]
                      : 'Dashboard'}
                  </span>
                </motion.button>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0" data-testid="navbar-auth-links">
                  <Link
                    to="/login"
                    data-testid="navbar-signin-link"
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-950 hover:bg-white/70 border border-transparent hover:border-slate-200/80 transition-all focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    data-testid="navbar-signup-link"
                    className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-slate-950 bg-[#f9a825] hover:bg-[#d08305] shadow-2xs transition-all focus-visible:ring-2 focus-visible:ring-[#f9a825]/60 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Sign up
                  </Link>
                </div>
              )}

            </div>

          </div>

        </div>
      </motion.header>

      <SavedAssessmentsModal
        isOpen={isSavedModalOpen}
        onClose={() => setIsSavedModalOpen(false)}
        onSelectDistrict={onSelectDistrict}
      />


      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSelectDistrict={onSelectDistrict}
      />

      <MenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        user={user}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenAuth={() => navigate('/login')}
        onSelectPage={(page) => {
          if (page.toLowerCase().includes('home')) navigate('/home/overview');
          else if (page.toLowerCase().includes('forecast')) navigate('/forecast/overview');
          else if (page.toLowerCase().includes('advisories')) navigate('/advisories');
          else if (page.toLowerCase().includes('analytics')) navigate('/analytics');
          else if (page.toLowerCase().includes('download')) navigate('/download');
          else if (page.toLowerCase().includes('doc')) navigate('/docs');
        }}
      />
    </>
  );
};

export default Navbar;
