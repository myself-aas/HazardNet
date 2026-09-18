import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useCallback, useDeferredValue, useTransition, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import MaterialIcon from './MaterialIcon';
import { ALL_64_DISTRICTS, ALL_8_DIVISIONS } from '../data/bangladeshDistricts';
import { detectExactPinpointLocation } from '../services/geolocationService';

export interface SearchItem {
  id: string;
  title: string;
  category: 'Hazard Report' | 'Location' | 'Hazard Profile' | 'Documentation';
  subtitle: string;
  badge?: string;
  actionPath: string;
  districtId?: string;
  openReport?: boolean;
  isAutoLocate?: boolean;
}

// 1. Hazard Reports Database
const HAZARD_REPORT_ITEMS: SearchItem[] = [
  {
    id: 'report-sylhet',
    title: 'Sylhet Flash Flood Emergency Alert & Impact Report',
    category: 'Hazard Report',
    subtitle: 'Pre-monsoon Haor surge +2.1m over danger level • 142k households affected • Early harvest advisory active',
    badge: 'Flash Flood • High Risk',
    actionPath: '/?district=sylhet&report=true',
    districtId: 'sylhet',
    openReport: true,
  },
  {
    id: 'report-sunamganj',
    title: 'Sunamganj Haor Basin Inundation & Crop Loss Report',
    category: 'Hazard Report',
    subtitle: 'Critically inundated low-lying Boro paddy fields • Submersible embankment monitoring',
    badge: 'Flash Flood • Critical',
    actionPath: '/?district=sunamganj&report=true',
    districtId: 'sunamganj',
    openReport: true,
  },
  {
    id: 'report-kurigram',
    title: 'Kurigram Jamuna Riverine Flood & Evacuation Alert',
    category: 'Hazard Report',
    subtitle: 'Monsoon river stage peak • 85,000 m³/s discharge rate • Active shelter deployment in Sadar & Nageshwari',
    badge: 'Monsoon Flood • High Risk',
    actionPath: '/?district=kurigram&report=true',
    districtId: 'kurigram',
    openReport: true,
  },
  {
    id: 'report-satkhira',
    title: 'Satkhira Coastal Category 3 Cyclone & Surge Impact Report',
    category: 'Hazard Report',
    subtitle: 'Coastal polder overtopping • 145 km/h wind gusts • Shrimp gher & salt bed protection emergency mode',
    badge: 'Tropical Cyclone • Severe',
    actionPath: '/?district=satkhira&report=true',
    districtId: 'satkhira',
    openReport: true,
  },
  {
    id: 'report-coxsbazar',
    title: 'Cox\'s Bazar Coastal Storm Surge & High Wave Warning',
    category: 'Hazard Report',
    subtitle: 'Bay of Bengal tropical depression • +3.2m surge crest • Maritime vessel suspension & shelter readiness',
    badge: 'Tropical Cyclone • High Risk',
    actionPath: '/?district=coxsbazar&report=true',
    districtId: 'coxsbazar',
    openReport: true,
  },
  {
    id: 'report-rajshahi',
    title: 'Rajshahi Barind Agricultural Drought Severity Assessment',
    category: 'Hazard Report',
    subtitle: 'Extreme drought conditions in the Barind Tract • Alternate wetting & drying irrigation active',
    badge: 'Drought • Severe',
    actionPath: '/?district=rajshahi&report=true',
    districtId: 'rajshahi',
    openReport: true,
  },
  {
    id: 'report-panchagarh',
    title: 'Panchagarh Sub-Himalayan Cold Snap & Crop Freeze Report',
    category: 'Hazard Report',
    subtitle: 'Night minimum temp 6.2°C • 18 hrs/day dense fog • Boro seedbed polythene cover advisory',
    badge: 'Cold Wave • High Risk',
    actionPath: '/?district=panchagarh&report=true',
    districtId: 'panchagarh',
    openReport: true,
  },
  {
    id: 'report-netrokona',
    title: 'Netrokona Haor Basin Submergence & Relief Dispatch Report',
    category: 'Hazard Report',
    subtitle: 'Dhanu river overflow • 32,000 hectares Boro crop at risk • Mobile water purification deployed',
    badge: 'Flash Flood • High Risk',
    actionPath: '/?district=netrokona&report=true',
    districtId: 'netrokona',
    openReport: true,
  },
  {
    id: 'report-sirajganj',
    title: 'Sirajganj Jamuna Bank Erosion & Embankment Warning',
    category: 'Hazard Report',
    subtitle: 'High river flow velocity • Char community evacuation • Emergency sandbag reinforcement',
    badge: 'Monsoon Flood • High Risk',
    actionPath: '/?district=sirajganj&report=true',
    districtId: 'sirajganj',
    openReport: true,
  },
  {
    id: 'report-bogra',
    title: 'Bogra Kalbaishakhi Pre-Monsoon Squall Damage Assessment',
    category: 'Hazard Report',
    subtitle: 'Peak gust speed 98 km/h • Crop lodging & fruit shedding • Electrical distribution grid inspection',
    badge: 'Severe Storm • Moderate',
    actionPath: '/?district=bogra&report=true',
    districtId: 'bogra',
    openReport: true,
  },
];

// 2. Locations Database (64 Districts, 8 Divisions, Geographical Belts)
const AUTO_LOCATE_ITEM: SearchItem = {
  id: 'auto-locate-user-district',
  title: 'Map My Current District & Location',
  category: 'Location',
  subtitle: 'Auto-detect your precise GPS or IP position and map to corresponding Bangladesh district',
  badge: 'GPS / IP Auto-Detect',
  actionPath: '/',
  isAutoLocate: true,
};

const SPECIFIC_LANDMARK_ITEMS: SearchItem[] = [AUTO_LOCATE_ITEM];

const DISTRICT_SEARCH_ITEMS: SearchItem[] = ALL_64_DISTRICTS.map((d) => ({
  id: `loc-district-${d.id}`,
  title: `${d.name} District`,
  category: 'Location',
  subtitle: `${d.division} Division • ${d.mainCrop} • Baseline ${d.risk} Risk`,
  badge: d.hazardType,
  actionPath: `/?district=${d.id}`,
  districtId: d.id,
}));

const DIVISION_SEARCH_ITEMS: SearchItem[] = ALL_8_DIVISIONS.map((div) => ({
  id: `loc-div-${div.id}`,
  title: `${div.name} Division`,
  category: 'Location',
  subtitle: `Capital: ${div.capital} • ${div.districtCount} Districts • Primary Hazard: ${div.primaryHazard}`,
  badge: `${(div.avgSeverity * 100).toFixed(0)}% Avg Severity`,
  actionPath: `/?district=${div.capital.toLowerCase()}`,
  districtId: div.capital.toLowerCase(),
}));

const REGION_BELT_ITEMS: SearchItem[] = [
  {
    id: 'loc-haor',
    title: 'Northeastern Haor Basin Region',
    category: 'Location',
    subtitle: 'Sylhet, Sunamganj, Netrokona, Kishoreganj • Flash flood prone wetland depression',
    badge: 'Haor Belt',
    actionPath: '/?district=sunamganj',
    districtId: 'sunamganj',
  },
  {
    id: 'loc-barind',
    title: 'Northwestern Barind Tract Region',
    category: 'Location',
    subtitle: 'Rajshahi, Naogaon, Nawabganj, Bogra • High elevation red clay soil prone to agricultural drought',
    badge: 'Barind Belt',
    actionPath: '/?district=rajshahi',
    districtId: 'rajshahi',
  },
  {
    id: 'loc-coastal',
    title: 'Southern Coastal Belt & Polder Enclosures',
    category: 'Location',
    subtitle: 'Satkhira, Khulna, Bagerhat, Barguna, Cox\'s Bazar • Saline water intrusion & cyclone surge belt',
    badge: 'Coastal Zone',
    actionPath: '/?district=satkhira',
    districtId: 'satkhira',
  },
  {
    id: 'loc-cht',
    title: 'Chittagong Hill Tracts & Mountain Corridors',
    category: 'Location',
    subtitle: 'Rangamati, Bandarban, Khagrachhari • Steep terrain prone to monsoon landslides & flash runoff',
    badge: 'Hill Tracts',
    actionPath: '/?district=chittagong',
    districtId: 'chittagong',
  },
];

// 3. Hazard Profiles Database
const HAZARD_PROFILE_ITEMS: SearchItem[] = [
  {
    id: 'hazard-flashflood',
    title: 'Flash Flood Hazard Profile',
    category: 'Hazard Profile',
    subtitle: 'Rapid pre-monsoon water surge in April-May in Haor Basin with sharp SAR backscatter drop',
    badge: 'Sylhet & Sunamganj',
    actionPath: '/analytics',
  },
  {
    id: 'hazard-monsoonflood',
    title: 'Monsoon Riverine Flood Profile',
    category: 'Hazard Profile',
    subtitle: 'Broad river overflow in July-August along Jamuna/Padma floodplain with high SAR VV/VH loss',
    badge: 'Kurigram & Sirajganj',
    actionPath: '/analytics',
  },
  {
    id: 'hazard-cyclone',
    title: 'Tropical Cyclone & Saline Storm Surge Profile',
    category: 'Hazard Profile',
    subtitle: 'Category 1-3 coastal storm systems in May & Oct-Nov with wind shear & wave inundation',
    badge: 'Satkhira & Cox\'s Bazar',
    actionPath: '/analytics',
  },
  {
    id: 'hazard-drought',
    title: 'Barind Agricultural Drought Profile',
    category: 'Hazard Profile',
    subtitle: 'Subsurface soil moisture depletion & high LST affecting Aus/Aman transplanting',
    badge: 'Rajshahi & Naogaon',
    actionPath: '/analytics',
  },
  {
    id: 'hazard-coldwave',
    title: 'Winter Cold Wave & Fog Profile',
    category: 'Hazard Profile',
    subtitle: 'Sub-Himalayan temperature drops below 10°C causing Boro seedbed chilling injury',
    badge: 'Rangpur & Panchagarh',
    actionPath: '/analytics',
  },
  {
    id: 'hazard-storm',
    title: 'Convective Kalbaishakhi Squall Profile',
    category: 'Hazard Profile',
    subtitle: 'Pre-monsoon convective storm cells producing high wind gusts (>90km/h) & hail',
    badge: 'Bogra & Dinajpur',
    actionPath: '/analytics',
  },
];

// 4. Documentation Database
const DOCUMENTATION_ITEMS: SearchItem[] = [
  {
    id: 'doc-architecture',
    title: 'Dual-Head Multi-Task Neural Network Architecture',
    category: 'Documentation',
    subtitle: 'Combined Softmax classification head + continuous physical severity regression head',
    badge: 'Model Core',
    actionPath: '/docs',
  },
  {
    id: 'doc-tflite',
    title: 'FP32 TFLite WebAssembly Inference Engine',
    category: 'Documentation',
    subtitle: 'In-browser SIMD-accelerated execution on your device',
    badge: 'Wasm Engine',
    actionPath: '/docs',
  },
  {
    id: 'doc-channels',
    title: '15 Multispectral Satellite Band Specification',
    category: 'Documentation',
    subtitle: 'Sentinel-1 SAR VV/VH, Sentinel-2 L2A (10-20m), ERA5-Land reanalysis tensor',
    badge: 'Satellite Tensor',
    actionPath: '/docs',
  },
  {
    id: 'doc-ingestion',
    title: 'GeoTIFF / Raster Tile Ingestion Pipeline',
    category: 'Documentation',
    subtitle: 'Upload multi-channel GeoTIFF tiles for live model evaluation & severity mapping',
    badge: 'Raster Ingestion',
    actionPath: '/upload',
  },
  {
    id: 'doc-mitigation',
    title: 'Agronomic Early Warning & 72-hr Advisory Engine',
    category: 'Documentation',
    subtitle: 'Automated mitigation advice for crop preservation across 8 hazard categories',
    badge: 'Mitigation',
    actionPath: '/docs',
  },
  {
    id: 'doc-paper',
    title: 'HazardNet Publication & Research Data',
    category: 'Documentation',
    subtitle: 'Peer-reviewed publication, dataset baseline comparisons, and model validation metrics',
    badge: 'Publication',
    actionPath: '/about',
  },
];

const SEARCH_DATABASE: SearchItem[] = [
  ...SPECIFIC_LANDMARK_ITEMS,
  ...HAZARD_REPORT_ITEMS,
  ...DISTRICT_SEARCH_ITEMS,
  ...DIVISION_SEARCH_ITEMS,
  ...REGION_BELT_ITEMS,
  ...HAZARD_PROFILE_ITEMS,
  ...DOCUMENTATION_ITEMS,
];

interface CommandPaletteProps {
  onSelectDistrict?: (districtId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onSelectDistrict }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Hazard Report' | 'Location' | 'Hazard Profile' | 'Documentation'>('All');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const [isPending, startTransition] = useTransition();

  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close dropdown on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Global Keyboard listener (Cmd+K / Ctrl+K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside listener to dismiss search popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter items based on deferred query & category
  const filteredItems = useMemo(() => {
    return SEARCH_DATABASE.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const q = deferredQuery.toLowerCase().trim();
    if (!q) return matchesCategory;

    const matchesQuery =
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      (item.badge && item.badge.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q) ||
      (item.districtId && item.districtId.toLowerCase().includes(q));

    return matchesCategory && matchesQuery;
    });
  }, [deferredQuery, selectedCategory]);

  // Handle item execution
  const handleSelectItem = useCallback(async (item: SearchItem) => {
    setIsOpen(false);
    setQuery('');

    if (item.isAutoLocate) {
      toast.loading('Detecting location & mapping district...', { id: 'locate-toast' });
      try {
        const result = await detectExactPinpointLocation();
        toast.dismiss('locate-toast');
        if (result.nearestDistrict) {
          if (onSelectDistrict) {
            onSelectDistrict(result.nearestDistrict.id);
          }
          toast.success(
            `Mapped to ${result.nearestDistrict.name} District (${result.nearestDistrict.division} Division)!`,
            { icon: <MaterialIcon name="my_location" className="w-4 h-4 inline-block mr-1" />, duration: 4000 }
          );
          navigate(`/?district=${result.nearestDistrict.id}`);
        }
      } catch (err) {
        toast.dismiss('locate-toast');
        toast.error('Location detection failed.');
      }
      return;
    }

    if (item.districtId && onSelectDistrict) {
      onSelectDistrict(item.districtId);
    }

    navigate(item.actionPath);
  }, [navigate, onSelectDistrict]);

  // Keyboard navigation within search input
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelectItem(filteredItems[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Keep active item in view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <>
      {/* Dynamic Search Icon Button in Top Menu Bar */}
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        /* 44×44 touch target on the compact (touch) bar. At ≥xl the trigger
           lives in the full desktop bar, which measured ~1180px before this
           target existed — a 44px min-width there pushed it to 1287px and
           overflowed the viewport at exactly 1280 (e2e/smoke.spec.ts). The
           desktop bar is cursor-driven, so it keeps the natural icon width.
           Utilities (not .tap-target) so the xl: variant reliably overrides. */
        className="relative min-w-[44px] min-h-[44px] xl:min-w-0 p-2 rounded-xl bg-white/40 hover:bg-white/70 active:bg-white/90 border border-slate-200/50 text-slate-800 hover:text-slate-950 backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95 shadow-2xs flex items-center justify-center group shrink-0"
        title="Search HazardNet (Ctrl+K)"
        aria-label="Search HazardNet"
        data-testid="district-search-trigger"
      >
        <MaterialIcon name="search" className="text-lg text-slate-800 group-hover:text-slate-950 transition-all duration-200 group-hover:scale-110" />

        {/* Dynamic Active Pulse Indicator */}
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nasa-red opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-nasa-red border border-white"></span>
        </span>
      </button>

      {/* Global Command Palette Search Modal.
          Portaled to document.body so the overlay escapes the sticky header
          wrapper's stacking context (z-40) and dims the whole page — but the
          trigger button above stays inline: the navbar renders two palette
          triggers (compact bar + desktop bar) and each must stay inside its
          `hidden xl:flex` / `xl:hidden` container so exactly one is visible
          per breakpoint (e2e strict-mode locators rely on that). */}
      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="command-palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-12 sm:pt-20 px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <motion.div
              key="command-palette-modal"
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Search HazardNet"
              data-testid="district-search-modal"
              initial={{ opacity: 0, scale: 0.94, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden text-slate-800 flex flex-col max-h-[85vh]"
            >
              {/* Header / Search Input */}
            <div className="relative flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
              <MaterialIcon name="search" className="text-xl text-nasa-red-shade ml-1 shrink-0" />

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                data-testid="district-search-input"
                aria-label="Search districts, hazards and documents"
                placeholder="Search 64 districts, hazard reports, profiles, or docs..."
                className="w-full pl-3 pr-10 py-1.5 bg-transparent text-slate-900 placeholder-slate-400 text-sm font-medium focus:outline-none"
                autoFocus
              />

              {query ? (
                <button
                  onClick={() => {
                    setQuery('');
                    setSelectedIndex(0);
                    inputRef.current?.focus();
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors text-xs font-mono font-bold"
                  title="Clear search"
                >
                  <MaterialIcon name="close" className="text-sm" />
                </button>
              ) : (
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[10px] font-mono text-slate-500 hover:text-slate-900 transition-colors"
                >
                  ESC
                </button>
              )}
            </div>

            {/* Category Filter Tabs */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none shrink-0">
              <span className="text-slate-400 font-mono text-[10px] uppercase font-bold mr-1">Filter:</span>
              {(['All', 'Hazard Report', 'Location', 'Hazard Profile', 'Documentation'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    startTransition(() => {
                      setSelectedCategory(cat);
                      setSelectedIndex(0);
                    });
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-nasa-red text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {cat === 'Hazard Report' ? 'Reports' : cat === 'Location' ? 'Locations' : cat === 'Hazard Profile' ? 'Hazards' : cat === 'Documentation' ? 'Docs' : 'All'}
                </button>
              ))}
              <span className="ml-auto text-[10px] font-mono text-slate-500 hidden sm:inline-block">
                {filteredItems.length} match{filteredItems.length === 1 ? '' : 'es'}
              </span>
            </div>

            {/* Search Results List */}
            <div ref={listRef} className="overflow-y-auto p-3 space-y-1.5 flex-1 max-h-[50vh]">
              {filteredItems.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-xs space-y-2">
                  <p className="font-bold text-slate-900 text-base">No results found for "{query}"</p>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto">
                    Try searching for <span className="text-slate-800 font-semibold">"Kurigram"</span>, <span className="text-slate-800 font-semibold">"Sylhet Report"</span>, <span className="text-slate-800 font-semibold">"Flash Flood"</span>, or <span className="text-slate-800 font-semibold">"TFLite"</span>.
                  </p>
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${
                        isSelected
                          ? 'bg-amber-50 border-amber-300 text-slate-900 shadow-sm'
                          : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">{item.title}</span>
                            {item.badge && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-100 text-[#ad6d04] border border-amber-200 shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-slate-100 border border-slate-200 text-slate-600">
                          {item.category}
                        </span>
                        <span className="text-nasa-red-shade text-xs font-mono font-bold">SELECT</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Keyboard Hints */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500 gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 text-slate-800">UP/DOWN</kbd> Navigate</span>
                <span><kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 text-slate-800">ENTER</kbd> Select</span>
                <span><kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-200 text-slate-800">ESC</kbd> Close</span>
              </div>
              <span className="font-brand font-black text-slate-900 hidden sm:inline">Hazard<span className="text-nasa-red-shade">Net</span> Search</span>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      , document.body)}
    </>
  );
};

export default CommandPalette;
