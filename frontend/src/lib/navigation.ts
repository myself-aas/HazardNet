/**
 * Shared navigation metadata for the masthead mega-menus and the mobile
 * drawer. Labels and paths are the product contract — do not rename or
 * retarget without an explicit IA change.
 */

export interface NavItem {
  id: string;
  title: string;
  path: string;
  icon: string;
  description?: string;
  badge?: string;
  /** Extra side-effect after navigation (desktop forecasts → heatmap). */
  extraAction?: 'toggleHeatmap';
}

export interface NavSection {
  id: string;
  category: string;
  icon: string;
  items: NavItem[];
}

export type DesktopMenuId = 'home' | 'forecasts' | 'advisories' | 'docs' | 'analytics';

export interface DesktopMenu {
  id: DesktopMenuId;
  label: string;
  /** Width class for the mega-menu panel (288–320px). */
  panelWidthClass: 'w-72' | 'w-80';
  items: NavItem[];
  isCurrent: (pathname: string) => boolean;
}

export interface DesktopLink extends NavItem {
  isCurrent: (pathname: string) => boolean;
}

/** Exact `/` or prefix match for every other path. */
export function isPathCurrent(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const DESKTOP_MENUS: DesktopMenu[] = [
  {
    id: 'home',
    label: 'Home',
    panelWidthClass: 'w-72',
    isCurrent: (pathname) =>
      pathname === '/' ||
      pathname === '/live' ||
      pathname.startsWith('/home') ||
      pathname === '/forecast/overview',
    items: [
      {
        id: 'overview',
        title: 'Overview',
        path: '/',
        icon: 'description',
        description:
          'What this platform is for, what the last run produced, and where every number can be checked',
      },
      {
        id: 'live',
        title: 'Live map & GIS console',
        path: '/live',
        icon: 'public',
        description: 'Interactive 3D Bangladesh hazard map',
      },
    ],
  },
  {
    id: 'forecasts',
    label: 'Forecasts',
    panelWidthClass: 'w-80',
    isCurrent: (pathname) => pathname.startsWith('/forecast'),
    items: [
      {
        id: 'forecast-overview',
        title: 'Forecast Overview',
        path: '/forecast/overview',
        icon: 'map',
        description: 'National risk map & predictions',
      },
      {
        id: 'my-districts',
        title: 'My Saved Districts',
        path: '/forecast/my-districts',
        icon: 'bookmarks',
        description: 'Personalized district watchlist & alerts',
        extraAction: 'toggleHeatmap',
      },
      {
        id: 'district-tensor',
        title: 'District Tensor Details',
        path: '/forecast/district/mymensingh',
        icon: 'insights',
        description: 'Deep-dive district ML metrics',
      },
      {
        id: 'compare',
        title: 'Comparative Matrix',
        path: '/forecast/compare',
        icon: 'compare_arrows',
        description: 'Side-by-side risk score benchmarking',
      },
      {
        id: 'divisions-analytics',
        title: 'Divisions Analytics',
        path: '/divisions',
        icon: 'public',
        description: '8 Administrative Divisions with aggregate multi-hazard analytics',
      },
      {
        id: 'hazards-matrix',
        title: 'Hazards Matrix',
        path: '/hazards',
        icon: 'warning',
        description: '9 Climatic perils with historical trends (2000–2026)',
      },
    ],
  },
  {
    id: 'advisories',
    label: 'Advisories',
    panelWidthClass: 'w-80',
    isCurrent: (pathname) => pathname.startsWith('/advisories'),
    items: [
      {
        id: 'crops',
        title: 'Crop Protection',
        path: '/advisories/crops',
        icon: 'agriculture',
        description: 'Flood & heat stress farming guidance',
      },
      {
        id: 'livestock',
        title: 'Livestock & Veterinary',
        path: '/advisories/livestock',
        icon: 'pets',
        description: 'Cattle shelter & disease mitigation',
      },
      {
        id: 'fisheries',
        title: 'Fisheries & Aquaculture',
        path: '/advisories/fisheries',
        icon: 'water_drop',
        description: 'Inundation risk for aquaculture ponds',
      },
      {
        id: 'health-wash',
        title: 'Public Health & WASH',
        path: '/advisories/health-wash',
        icon: 'medical_services',
        description: 'Waterborne disease prevention',
      },
      {
        id: 'seasonal-calendar',
        title: 'Seasonal Calendar',
        path: '/advisories/seasonal-calendar',
        icon: 'event_note',
        description: 'Monsoon & cyclone timing guidance',
      },
      {
        id: 'emergency-response',
        title: 'Emergency Response SOP',
        path: '/advisories/emergency-response',
        icon: 'emergency',
        description: 'Relief requisition & cluster hotlines',
      },
    ],
  },
  {
    id: 'docs',
    label: 'Knowledge',
    panelWidthClass: 'w-80',
    isCurrent: (pathname) =>
      pathname.startsWith('/docs') ||
      pathname.startsWith('/download') ||
      pathname.startsWith('/blogs') ||
      pathname.startsWith('/about'),
    items: [
      {
        id: 'documentation',
        title: 'System Documentation',
        path: '/docs',
        icon: 'menu_book',
        description: 'API specs & methodology',
      },
      {
        id: 'upload',
        title: 'District Forecast Lookup',
        path: '/upload',
        icon: 'cloud_upload',
        description: 'Read published district and horizon results',
      },
      {
        id: 'download',
        title: 'Download Center',
        path: '/download',
        icon: 'download',
        description: 'Export GeoJSON, shapefiles & bulletins',
      },
      {
        id: 'blogs',
        title: 'Technical Insights',
        path: '/blogs',
        icon: 'article',
        description: 'Research papers & early warnings',
      },
      {
        id: 'about',
        title: 'About Initiative',
        path: '/about',
        icon: 'info',
        description: 'Bangladesh Early Warning Initiative',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    panelWidthClass: 'w-80',
    isCurrent: (pathname) => pathname.startsWith('/analytics'),
    items: [
      {
        id: 'pipeline',
        title: 'Data Ingestion Pipeline',
        path: '/analytics/pipeline-status',
        icon: 'hub',
        description: 'Satellite & sensor streams',
      },
      {
        id: 'hindcast',
        title: 'Hindcast Validation',
        path: '/model-performance',
        icon: 'monitoring',
        description: 'Four historical episodes, with limits',
      },
      {
        id: 'historical',
        title: 'Historical Hazard Archive',
        path: '/analytics/historical',
        icon: 'history',
        description: 'Decadal flood & cyclone logs',
      },
    ],
  },
];

/** Top-level masthead links that are not dropdowns. */
export const DESKTOP_LINKS: DesktopLink[] = [
  {
    id: 'alerts',
    title: 'Alerts',
    path: '/alerts',
    icon: 'notifications_active',
    isCurrent: (pathname) => pathname.startsWith('/alerts'),
  },
  {
    id: 'divisions',
    title: 'Divisions',
    path: '/divisions',
    icon: 'public',
    isCurrent: (pathname) => pathname.startsWith('/divisions'),
  },
  {
    id: 'hazards',
    title: 'Hazards',
    path: '/hazards',
    icon: 'warning',
    isCurrent: (pathname) => pathname.startsWith('/hazards'),
  },
];

/** Mobile drawer tree — labels/paths unchanged from MenuDrawer. */
export const DRAWER_SECTIONS: NavSection[] = [
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
