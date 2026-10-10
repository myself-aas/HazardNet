import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { hazardPalette } from '@hazardnet/design-system';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../hooks/useI18n';
import { hazardIcon } from '../../hooks/useHazardLabel';

export interface HazardItem {
  slug: string;
  class: string;
  season: string;
  summary?: string;
  physics?: {
    form?: string;
    expr?: string;
    note?: string;
  };
}

interface AppleHazardsBentoProps {
  hazards: HazardItem[];
}

/**
 * Curated Apple Store bento card definitions for Bangladesh's 8 climatic hazard classes.
 * High-fidelity, domain-accurate typography, kicker tags, and custom SVG visual motifs.
 */
interface HazardCardConfig {
  kickerEn: string;
  kickerBn: string;
  taglineEn: string;
  taglineBn: string;
  leadTime: string;
  isDark: boolean;
  renderVisual: () => React.ReactNode;
}

const HAZARD_CONFIGS: Record<string, HazardCardConfig> = {
  'tropical-cyclone': {
    kickerEn: 'COASTAL THREAT · BAY OF BENGAL',
    kickerBn: 'উপকূলীয় ঝুঁকি · বঙ্গোপসাগর',
    taglineEn: 'Wind-driven coastal storm hazard with sustained gusts above 50 km/h and marine surge risk.',
    taglineBn: 'ঘূর্ণিঝড়জনিত সামুদ্রিক জলোচ্ছ্বাস ও ঘণ্টায় ৫০ কিমির বেশি গতিবেগের তীব্র ঝড়ো বাতাস।',
    leadTime: '7 & 15-day multi-horizon · Skill + Physics model',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="cycloneGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="70" r="58" fill="url(#cycloneGlow)" />
        {/* Concentric atmospheric pressure isobars */}
        <circle cx="120" cy="70" r="54" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" strokeOpacity="0.4" />
        <circle cx="120" cy="70" r="42" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
        <circle cx="120" cy="70" r="28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" strokeOpacity="0.8" />
        {/* Spiral arms */}
        <path
          d="M 120 70 C 130 50, 155 45, 175 60 C 190 72, 185 95, 165 105 C 145 115, 115 110, 95 95 C 75 80, 75 55, 95 40 C 115 25, 150 30, 170 50"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeOpacity="0.9"
        />
        <path
          d="M 120 70 C 110 90, 85 95, 65 80 C 50 68, 55 45, 75 35 C 95 25, 125 30, 145 45 C 165 60, 165 85, 145 100"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
        {/* Eye of the storm */}
        <circle cx="120" cy="70" r="6" fill="currentColor" />
        <circle cx="120" cy="70" r="10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
      </svg>
    ),
  },
  flood: {
    kickerEn: 'MONSOON INUNDATION · BASIN-WIDE',
    kickerBn: 'মৌসুমি বন্যা · নদী অববাহিকা',
    taglineEn: 'Riverine and monsoon inundation across the Brahmaputra, Jamuna and Padma floodplains.',
    taglineBn: 'ব্রহ্মপুত্র, যমুনা ও পদ্মা অববাহিকায় মৌসুমি বৃষ্টিপাত ও ব্যাপক প্লাবন।',
    leadTime: 'June–Sept peak · Daily ERA5 & GFS precipitation telemetry',
    isDark: false,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Layered river delta elevation waves */}
        <path
          d="M 10 95 C 45 80, 75 110, 115 95 C 155 80, 185 105, 230 90 L 230 135 L 10 135 Z"
          fill="url(#floodGrad)"
        />
        <path
          d="M 10 95 C 45 80, 75 110, 115 95 C 155 80, 185 105, 230 90"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 10 75 C 50 60, 80 88, 120 72 C 160 58, 190 82, 230 68"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 20 55 C 60 42, 90 65, 130 52 C 170 38, 200 60, 230 48"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeOpacity="0.5"
        />
        {/* Rain vectors */}
        <line x1="60" y1="20" x2="52" y2="35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
        <line x1="110" y1="16" x2="102" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="160" y1="22" x2="152" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
        <line x1="195" y1="18" x2="187" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      </svg>
    ),
  },
  'flash-flood': {
    kickerEn: 'RAPID ONSET · HAOR BASIN',
    kickerBn: 'আকস্মিক বন্যা · হাওর অববাহিকা',
    taglineEn: 'Torrential mountain runoff submerging northeastern boro paddies within hours.',
    taglineBn: 'মেঘালয় ও আসামের পাহাড়ি ঢলে সিলেট-সুনামগঞ্জের হাওরে আকস্মিক পানির প্লাবন।',
    leadTime: 'March–May window · High-intensity burst scoring',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        {/* Mountain elevation profile with torrential descent */}
        <path
          d="M 15 110 L 65 35 L 105 75 L 145 25 L 195 90 L 225 115"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.4"
          strokeLinecap="round"
        />
        {/* Rapid water torrent curve */}
        <path
          d="M 145 25 Q 165 70, 120 85 T 70 120 L 230 120"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 155 35 Q 170 75, 130 90 T 80 125"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
        {/* Surge velocity pulses */}
        <circle cx="145" cy="25" r="4" fill="currentColor" />
        <circle cx="120" cy="85" r="5" fill="currentColor" />
        <circle cx="70" cy="120" r="6" fill="currentColor" />
      </svg>
    ),
  },
  'severe-local-storm': {
    kickerEn: 'CONVECTIVE EXTREME · KALBAISHAKHI',
    kickerBn: 'কালবৈশাখী · তীব্র স্থানীয় ঝড়',
    taglineEn: 'High-shear squall lines, destructive hail, and lightning strikes along pre-monsoon drylines.',
    taglineBn: 'চৈত্র-বৈশাখ মাসের তীব্র ��ালবৈশাখী, শিলাবৃষ্টি ও বজ্রপাত।',
    leadTime: 'Pre-monsoon afternoon hours · Convective CAPE index',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        {/* Convective anvil storm cloud */}
        <path
          d="M 50 70 C 50 50, 70 42, 85 45 C 92 30, 118 25, 138 32 C 150 20, 180 20, 192 38 C 205 40, 215 52, 212 68 C 215 82, 195 90, 180 88 L 60 88 C 45 88, 42 75, 50 70 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.8"
        />
        {/* Electric lightning bolt */}
        <path
          d="M 125 72 L 115 95 L 132 95 L 118 128"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 160 80 L 152 98 L 165 98 L 155 120"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  'heat-wave': {
    kickerEn: 'THERMAL ANOMALY · PRE-MONSOON',
    kickerBn: 'তাপপ্রবাহ · তীব্র গরম',
    taglineEn: 'Extreme temperature anomaly exceeding 36°C with multi-day persistence stressing crops and health.',
    taglineBn: 'টানা কয়েকদিন ৩৬-৪০ ডিগ্রি সেলসিয়াস তাপমাত্রায় খরতাপ ও স্বাস্থ্যঝুঁকি।',
    leadTime: 'March–June pre-monsoon · Exceedance duration scoring',
    isDark: false,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.15" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="70" r="50" fill="url(#sunGlow)" />
        {/* Thermal anomaly ring rays */}
        <circle cx="120" cy="70" r="32" stroke="currentColor" strokeWidth="2" strokeDasharray="6 3" />
        <circle cx="120" cy="70" r="20" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2.5" />
        {/* Heat haze waves */}
        <path d="M 50 115 Q 65 105, 80 115 T 110 115 T 140 115 T 170 115 T 200 115" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
        <path d="M 60 125 Q 75 118, 90 125 T 120 125 T 150 125 T 180 125" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.5" />
      </svg>
    ),
  },
  drought: {
    kickerEn: 'SOIL DEFICIT · BARIND TRACT',
    kickerBn: 'খরা ও পানিশূন্যতা · বরেন্দ্র অঞ্চল',
    taglineEn: 'Prolonged moisture deficit and high evapotranspiration threatening rainfed transplanted aman.',
    taglineBn: 'বৃষ্টির দীর্ঘস্থায়ী ঘাটতি ও শুষ্ক মাটিতে ফসলের মারাত্মক পানিশূন্যতা।',
    leadTime: 'November–April dry season · Inverted precipitation index',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        {/* Hexagonal dry soil fissure network */}
        <path
          d="M 60 45 L 85 30 L 115 45 L 115 75 L 85 90 L 60 75 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="currentColor"
          fillOpacity="0.3"
        />
        <path
          d="M 115 45 L 140 30 L 170 45 L 170 75 L 140 90 L 115 75 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="currentColor"
          fillOpacity="0.2"
        />
        <path
          d="M 85 90 L 110 75 L 140 90 L 140 120 L 110 135 L 85 120 Z"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="currentColor"
          fillOpacity="0.4"
        />
        {/* Crack lines radiating out */}
        <line x1="85" y1="30" x2="90" y2="15" stroke="currentColor" strokeWidth="1.2" />
        <line x1="170" y1="75" x2="195" y2="85" stroke="currentColor" strokeWidth="1.2" />
        <line x1="60" y1="75" x2="40" y2="82" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  'cold-wave': {
    kickerEn: 'WINTER INVERSION · NORTHERN BORDER',
    kickerBn: 'শৈত্যপ্রবাহ · উত্তর জনপদ',
    taglineEn: 'Dense radiation fog, temperature inversions, and sub-10°C minimums endangering winter seedbeds.',
    taglineBn: 'উত্তরাঞ্চলের ঘন কুয়াশা ও তীব্র শীতের শৈত্যপ্রবাহে বোরো বীজতলা ও জনজীবন বিপর্যস্ত।',
    leadTime: 'December–February · Sub-16°C anomaly scoring',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        {/* Crystalline frost geometric snowflake */}
        <line x1="120" y1="20" x2="120" y2="120" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="70" y1="70" x2="170" y2="70" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="85" y1="35" x2="155" y2="105" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="85" y1="105" x2="155" y2="35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* Branching crystal needles */}
        <path d="M 112 40 L 120 48 L 128 40" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M 112 100 L 120 92 L 128 100" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M 90 62 L 98 70 L 90 78" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M 150 62 L 142 70 L 150 78" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="120" cy="70" r="5" fill="currentColor" />
      </svg>
    ),
  },
  fire: {
    kickerEn: 'DRY BIOMASS · AGRICULTURAL RESIDUE',
    kickerBn: 'অগ্নিকাণ্ড · শুষ্ক মৌসুম',
    taglineEn: 'Dry-season biomass ignition and crop residue flare-ups under low humidity and high winds.',
    taglineBn: 'শুষ্ক মৌসুমে ফসলের অবশিষ্টাংশ ও খড়ের গাদায় হঠাৎ অগ্নিকাণ্ডের ঝুঁকি।',
    leadTime: 'February–May dry season · Low relative humidity index',
    isDark: true,
    renderVisual: () => (
      <svg className="w-full h-36" viewBox="0 0 240 140" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="fireGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="75" r="45" fill="url(#fireGlow)" />
        {/* Dynamic flame contour */}
        <path
          d="M 120 25 C 135 50, 160 65, 155 95 C 150 120, 130 125, 120 125 C 110 125, 90 120, 85 95 C 80 70, 105 50, 120 25 Z"
          fill="currentColor"
          fillOpacity="0.75"
        />
        <path
          d="M 120 50 C 130 68, 145 80, 140 102 C 136 118, 126 122, 120 122 C 114 122, 104 118, 100 102 C 96 82, 110 68, 120 50 Z"
          fill="currentColor"
        />
        <circle cx="120" cy="100" r="12" fill="currentColor" fillOpacity="0.9" />
      </svg>
    ),
  },
};

export const AppleHazardsBento: React.FC<AppleHazardsBentoProps> = ({ hazards }) => {
  const { language, t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'shelf' | 'grid'>('shelf');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(280, el.clientWidth * 0.75);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScroll, 350);
  };

  return (
    <div className="space-y-5">
      {/* ── Header control row with Apple Store style navigation ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="ap-caption-strong text-ap-link">{t('frontdoor.products.hazardsEyebrow')}</p>
          <span className="text-ap-label-tertiary hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-xs text-carbon-60 hidden sm:inline">
            {language === 'bn' ? 'অত্যাধুনিক মাল্টি-হ্যাজার্ড ইন্টেলিজেন্স' : 'Next-generation geospatial intelligence'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented view switcher (Shelf vs 2D Bento Grid) */}
          <div className="flex items-center p-0.5 rounded-full bg-carbon-10 border border-carbon-20 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('shelf')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                viewMode === 'shelf'
                  ? 'bg-white text-carbon-90 shadow-xs'
                  : 'text-carbon-60 hover:text-carbon-90'
              }`}
              aria-label="Horizontal shelf view"
            >
              {language === 'bn' ? 'শেল্ফ' : 'Shelf'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-full font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-carbon-90 shadow-xs'
                  : 'text-carbon-60 hover:text-carbon-90'
              }`}
              aria-label="Bento grid view"
            >
              {language === 'bn' ? 'গ্রিড' : 'Grid'}
            </button>
          </div>

          {/* Apple Store circular navigation buttons (active in shelf mode) */}
          {viewMode === 'shelf' && (
            <div className="flex items-center gap-1.5 ml-1">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-carbon-10 border border-carbon-20 text-carbon-70 hover:bg-carbon-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Scroll hazards left"
              >
                <MaterialIcon name="chevron_left" className="text-base" />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-carbon-10 border border-carbon-20 text-carbon-70 hover:bg-carbon-20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Scroll hazards right"
              >
                <MaterialIcon name="chevron_right" className="text-base" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Apple-style Quick Actions Navigation Row ── */}
      <div
        role="navigation"
        aria-label="HazardNet Quick Actions"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5"
      >
        <Link
          to="/alerts"
          className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-ap-canvas border border-black/[0.08] dark:border-white/[0.1] shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 min-h-[56px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-ap-link/10 text-ap-label group-hover:scale-105 transition-transform">
              <MaterialIcon name="notifications_active" className="text-xl" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-ap-label group-hover:text-ap-link transition-colors truncate">
                {language === 'bn' ? 'সক্রিয় সতর্কতা দেখুন' : 'View Active Alerts'}
              </span>
              <span className="block text-xs text-ap-label-secondary truncate">
                {language === 'bn' ? 'রিয়েল-টাইম আর্লি ওয়ার্নিং' : 'Live emergency advisories'}
              </span>
            </div>
          </div>
          <MaterialIcon
            name="arrow_forward"
            className="text-ap-label-tertiary group-hover:text-ap-label group-hover:translate-x-0.5 transition-all text-base shrink-0 ml-2"
          />
        </Link>

        <Link
          to="/contact"
          className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-ap-canvas border border-black/[0.08] dark:border-white/[0.1] shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 min-h-[56px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-ap-link/10 text-ap-label group-hover:scale-105 transition-transform">
              <MaterialIcon name="campaign" className="text-xl" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-ap-label group-hover:text-ap-link transition-colors truncate">
                {language === 'bn' ? 'দুর্যোগ রিপোর্ট করুন' : 'Report Hazard'}
              </span>
              <span className="block text-xs text-ap-label-secondary truncate">
                {language === 'bn' ? 'মাঠ পর্যায়ের তথ্য জমা দিন' : 'Ground-truth field intake'}
              </span>
            </div>
          </div>
          <MaterialIcon
            name="arrow_forward"
            className="text-ap-label-tertiary group-hover:text-ap-label group-hover:translate-x-0.5 transition-all text-base shrink-0 ml-2"
          />
        </Link>

        <Link
          to="/divisions"
          className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-ap-canvas border border-black/[0.08] dark:border-white/[0.1] shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 min-h-[56px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-ap-link/10 text-ap-label group-hover:scale-105 transition-transform">
              <MaterialIcon name="dashboard_customize" className="text-xl" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-ap-label group-hover:text-ap-link transition-colors truncate">
                {language === 'bn' ? 'আঞ্চলিক ড্যাশবোর্ড' : 'Regional Dashboard'}
              </span>
              <span className="block text-xs text-ap-label-secondary truncate">
                {language === 'bn' ? '৮ বিভাগ · ৬৪ জেলার ঝুঁকি' : '8 divisions · 64 districts'}
              </span>
            </div>
          </div>
          <MaterialIcon
            name="arrow_forward"
            className="text-ap-label-tertiary group-hover:text-ap-label group-hover:translate-x-0.5 transition-all text-base shrink-0 ml-2"
          />
        </Link>

        <Link
          to="/live"
          className="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-ap-canvas border border-black/[0.08] dark:border-white/[0.1] shadow-2xs hover:shadow-md hover:border-black/20 dark:hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 min-h-[56px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-ap-link/10 text-ap-label group-hover:scale-105 transition-transform">
              <MaterialIcon name="satellite_alt" className="text-xl" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-ap-label group-hover:text-ap-link transition-colors truncate">
                {language === 'bn' ? 'লাইভ জিআইএস কনসোল' : 'Live GIS Console'}
              </span>
              <span className="block text-xs text-ap-label-secondary truncate">
                {language === 'bn' ? 'ইন্টারেক্টিভ স্যাটেলাইট রাডার' : 'Interactive satellite radar'}
              </span>
            </div>
          </div>
          <MaterialIcon
            name="arrow_forward"
            className="text-ap-label-tertiary group-hover:text-ap-label group-hover:translate-x-0.5 transition-all text-base shrink-0 ml-2"
          />
        </Link>
      </div>

      {/* ── Apple Store Bento Cards Container ── */}
      {viewMode === 'shelf' ? (
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
        >
          {hazards.map((hazard) => {
            const config = HAZARD_CONFIGS[hazard.slug] || HAZARD_CONFIGS['tropical-cyclone'];
            const pal = hazardPalette(hazard.class);
            // Accent per theme: light cards read `text` in light mode and `onDark` in dark mode.
            const hazardVars = {
              '--ap-hazard-accent': config.isDark ? pal.onDark : pal.text,
              '--ap-hazard-accent-dark': pal.onDark,
            } as React.CSSProperties;
            const kicker = language === 'bn' ? config.kickerBn : config.kickerEn;
            const tagline = language === 'bn' ? config.taglineBn : (hazard.summary || config.taglineEn);

            return (
              <Link
                key={hazard.slug}
                to={`/hazards/${hazard.slug}`}
                className={`group flex-shrink-0 w-72 sm:w-80 md:w-96 snap-start flex flex-col justify-between rounded-[28px] p-6 sm:p-7 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 ${
                  config.isDark
                    ? 'bg-carbon-black text-white border border-white/10 shadow-md'
                    : 'bg-ap-grouped text-ap-label border border-ap-hairline shadow-sm'
                }`}
                style={{
                  minHeight: '440px',
                  ...hazardVars,
                }}
              >
                {/* Background ambient radial glow */}
                <div
                  className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-60 bg-[color:var(--ap-hazard-accent)] dark:bg-[color:var(--ap-hazard-accent-dark)]"
                />

                {/* Top Section: Kicker, Title, Description */}
                <div className="relative z-10">
                  <span
                    className="text-xs font-semibold uppercase tracking-wider block mb-1.5 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]"
                  >
                    {kicker}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-inherit">
                      {hazard.class}
                    </h3>
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]"
                      style={{
                        backgroundColor: config.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                      }}
                    >
                      <MaterialIcon name={hazardIcon(hazard.class)} className="text-lg" />
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-xs sm:text-sm leading-relaxed line-clamp-3 ${
                      config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-secondary'
                    }`}
                  >
                    {tagline}
                  </p>
                  <div className={`mt-2 text-xs font-mono tracking-tight ${config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-tertiary'}`}>
                    {config.leadTime}
                  </div>
                </div>

                {/* Middle: Signature Hero Visual Motif */}
                <div className="my-auto py-2 flex items-center justify-center relative z-10 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]">
                  {config.renderVisual()}
                </div>

                {/* Bottom Row: Season context + Apple style round action button */}
                <div className="relative z-10 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`block text-xs uppercase tracking-wider font-semibold ${config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-tertiary'}`}>
                      {language === 'bn' ? 'সক্রিয় মৌসুম' : 'Active window'}
                    </span>
                    <span
                      className={`block text-xs font-medium truncate ${
                        config.isDark ? 'text-ap-on-scrim' : 'text-ap-label'
                      }`}
                    >
                      {hazard.season}
                    </span>
                  </div>

                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-xs ${
                      config.isDark
                        ? 'bg-white/15 text-white group-hover:bg-white group-hover:text-black'
                        : 'bg-black/10 dark:bg-white/15 text-ap-label group-hover:bg-ap-label group-hover:text-ap-canvas'
                    }`}
                    aria-hidden="true"
                  >
                    <MaterialIcon name="arrow_forward" className="text-sm" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* 2D Bento Grid view */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {hazards.map((hazard, index) => {
            const config = HAZARD_CONFIGS[hazard.slug] || HAZARD_CONFIGS['tropical-cyclone'];
            const pal = hazardPalette(hazard.class);
            // Accent per theme: light cards read `text` in light mode and `onDark` in dark mode.
            const hazardVars = {
              '--ap-hazard-accent': config.isDark ? pal.onDark : pal.text,
              '--ap-hazard-accent-dark': pal.onDark,
            } as React.CSSProperties;
            const kicker = language === 'bn' ? config.kickerBn : config.kickerEn;
            const tagline = language === 'bn' ? config.taglineBn : (hazard.summary || config.taglineEn);
            const isWide = index === 0 || index === 1 || index === 6 || index === 7;

            return (
              <Link
                key={hazard.slug}
                to={`/hazards/${hazard.slug}`}
                className={`group flex flex-col justify-between rounded-[28px] p-6 sm:p-7 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ap-primary focus-visible:outline-offset-2 ${
                  isWide ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-1 lg:col-span-1'
                } ${
                  config.isDark
                    ? 'bg-carbon-black text-white border border-white/10 shadow-md'
                    : 'bg-ap-grouped text-ap-label border border-ap-hairline shadow-sm'
                }`}
                style={{
                  minHeight: isWide ? '420px' : '390px',
                  ...hazardVars,
                }}
              >
                {/* Background ambient radial glow */}
                <div
                  className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-60 bg-[color:var(--ap-hazard-accent)] dark:bg-[color:var(--ap-hazard-accent-dark)]"
                />

                {/* Top Section */}
                <div className="relative z-10">
                  <span
                    className="text-xs font-semibold uppercase tracking-wider block mb-1.5 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]"
                  >
                    {kicker}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-inherit">
                      {hazard.class}
                    </h3>
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]"
                      style={{
                        backgroundColor: config.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                      }}
                    >
                      <MaterialIcon name={hazardIcon(hazard.class)} className="text-lg" />
                    </span>
                  </div>
                  <p
                    className={`mt-2 text-xs sm:text-sm leading-relaxed line-clamp-3 ${
                      config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-secondary'
                    }`}
                  >
                    {tagline}
                  </p>
                  <div className={`mt-2 text-xs font-mono tracking-tight ${config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-tertiary'}`}>
                    {config.leadTime}
                  </div>
                </div>

                {/* Middle: Signature Hero Visual Motif */}
                <div className="my-auto py-2 flex items-center justify-center relative z-10 text-[color:var(--ap-hazard-accent)] dark:text-[color:var(--ap-hazard-accent-dark)]">
                  {config.renderVisual()}
                </div>

                {/* Bottom Row */}
                <div className="relative z-10 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`block text-xs uppercase tracking-wider font-semibold ${config.isDark ? 'text-ap-on-scrim-muted' : 'text-ap-label-tertiary'}`}>
                      {language === 'bn' ? 'সক্রিয় মৌসুম' : 'Active window'}
                    </span>
                    <span
                      className={`block text-xs font-medium truncate ${
                        config.isDark ? 'text-ap-on-scrim' : 'text-ap-label'
                      }`}
                    >
                      {hazard.season}
                    </span>
                  </div>

                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-xs ${
                      config.isDark
                        ? 'bg-white/15 text-white group-hover:bg-white group-hover:text-black'
                        : 'bg-black/10 dark:bg-white/15 text-ap-label group-hover:bg-ap-label group-hover:text-ap-canvas'
                    }`}
                    aria-hidden="true"
                  >
                    <MaterialIcon name="arrow_forward" className="text-sm" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Note underneath */}
      <p className="mt-2 text-sm leading-[1.62] text-carbon-70">
        {t('frontdoor.products.hazardsNote')}
      </p>
    </div>
  );
};
