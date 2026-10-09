/**
 * Navigation — one source for the header links and the menu drawer.
 *
 * 2026-10 · explicit IA change. This file used to say "labels and paths are the product contract — do not rename
 * without an explicit IA change"; this IS that change. The old labels ("Live map & GIS console", "Active Hazard
 * Bulletins", "Comparative Matrix", "District Model Details" … plus a typo, "validation Validation", and a "9 Perils"
 * badge that contradicted the registered eight hazard classes) were long, technical and written for people who already
 * know the product. The people who open this on a phone in a field do not.
 *
 * The rules now, enforced by `lib/__tests__/navigation.test.ts`:
 *   · every label is ONE or TWO plain words, at most 14 characters, no "&", no jargon;
 *   · no descriptions and no badges — a menu is a list of places, not a paragraph;
 *   · paths are unchanged: every route reachable before is reachable now (the test lists them).
 *
 * Shape: the header shows five `PRIMARY_LINKS`; the drawer shows everything, in four groups, as a two-column grid.
 */

export interface NavItem {
  id: string;
  /** One or two plain words. */
  title: string;
  path: string;
  /** MaterialIcon name. */
  icon: string;
  /** Extra side-effect after navigation (saved districts → heatmap). */
  extraAction?: 'toggleHeatmap';
}

export interface NavSection {
  id: string;
  /** One word. */
  category: string;
  icon: string;
  items: NavItem[];
}

export interface PrimaryLink {
  id: string;
  /** One plain word. */
  label: string;
  path: string;
  isCurrent: (pathname: string) => boolean;
}

/** Exact `/` or prefix match for every other path. */
export function isPathCurrent(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

const startsWithAny = (pathname: string, prefixes: string[]) => prefixes.some((p) => isPathCurrent(pathname, p));

/**
 * The console density track.
 *
 * DESIGN.md §Layout gives the product two tracks — editorial and console — that
 * share one spacing scale and differ only in step. Every route rendering the
 * Dashboard or the analytics page is console; the front door and the content
 * routes stay editorial. `/home`, `/home/overview` and `/forecast/overview`
 * count as console because they are Dashboard deep links, not separate pages.
 *
 * Read this before assuming the attribute does something on screen: it sets
 * --ap-section-block, --ap-section-gap, --ap-card-padding and --ap-track-max,
 * and those four are read only by `.ap-tile`, `.ap-tile-inner` and `.ap-card` —
 * none of which /live or /analytics renders, because both compose with Tailwind
 * utilities instead. This classifier is the prerequisite; making the track
 * visible means moving those pages onto the design system's own card and tile
 * primitives.
 */
const CONSOLE_TRACK_PREFIXES = [
  '/live',
  '/home',
  '/forecast/overview',
  '/forecast/my-districts',
  '/forecast/compare',
  '/forecast/settings',
  '/settings',
  '/analytics',
];

export function isConsoleTrack(pathname: string): boolean {
  return CONSOLE_TRACK_PREFIXES.some((p) => isPathCurrent(pathname, p));
}

/** The five links in the header bar (from the `lg` breakpoint up; below it the menu button is the only control). */
export const PRIMARY_LINKS: PrimaryLink[] = [
  { id: 'home', label: 'Home', path: '/', isCurrent: (p) => p === '/' },
  {
    id: 'forecasts',
    label: 'Forecasts',
    path: '/forecast/overview',
    isCurrent: (p) => startsWithAny(p, ['/forecast', '/live', '/home', '/divisions', '/hazards', '/districts']),
  },
  { id: 'alerts', label: 'Alerts', path: '/alerts', isCurrent: (p) => isPathCurrent(p, '/alerts') },
  { id: 'advice', label: 'Advice', path: '/advisories', isCurrent: (p) => isPathCurrent(p, '/advisories') },
  {
    id: 'learn',
    label: 'Learn',
    path: '/docs',
    isCurrent: (p) =>
      startsWithAny(p, [
        '/docs',
        '/download',
        '/blogs',
        '/about',
        '/analytics',
        '/model-performance',
        '/methodology',
        '/model',
        '/data-sources',
        '/faq',
        '/status',
        '/last-run',
        '/contact',
        '/use-cases',
        '/upload',
        '/archive',
        '/history',
      ]),
  },
];

/** The menu drawer: every destination, four groups, plain words. */
export const DRAWER_SECTIONS: NavSection[] = [
  {
    id: 'explore',
    category: 'Explore',
    icon: 'map',
    items: [
      { id: 'home', title: 'Home', path: '/', icon: 'description' },
      { id: 'live', title: 'Live map', path: '/live', icon: 'public' },
      { id: 'forecasts', title: 'Forecasts', path: '/forecast/overview', icon: 'map' },
      { id: 'alerts', title: 'Alerts', path: '/alerts', icon: 'notifications_active' },
      { id: 'saved', title: 'Saved', path: '/forecast/my-districts', icon: 'bookmark', extraAction: 'toggleHeatmap' },
      { id: 'compare', title: 'Compare', path: '/forecast/compare', icon: 'compare_arrows' },
      { id: 'divisions', title: 'Divisions', path: '/divisions', icon: 'domain' },
      { id: 'districts', title: 'Districts', path: '/districts', icon: 'location_on' },
      { id: 'hazards', title: 'Hazards', path: '/hazards', icon: 'warning' },
    ],
  },
  {
    id: 'advice',
    category: 'Advice',
    icon: 'agriculture',
    items: [
      { id: 'crops', title: 'Crops', path: '/advisories/crops', icon: 'grass' },
      { id: 'livestock', title: 'Livestock', path: '/advisories/livestock', icon: 'pets' },
      { id: 'fisheries', title: 'Fisheries', path: '/advisories/fisheries', icon: 'water' },
      { id: 'health', title: 'Health', path: '/advisories/health-wash', icon: 'health_and_safety' },
      { id: 'calendar', title: 'Calendar', path: '/advisories/seasonal-calendar', icon: 'calendar_month' },
      { id: 'emergency', title: 'Emergency', path: '/advisories/emergency-response', icon: 'emergency' },
    ],
  },
  {
    id: 'data',
    category: 'Data',
    icon: 'analytics',
    items: [
      { id: 'lookup', title: 'Lookup', path: '/upload', icon: 'cloud_upload' },
      { id: 'accuracy', title: 'Accuracy', path: '/model-performance', icon: 'monitoring' },
      { id: 'metrics', title: 'Model metrics', path: '/analytics/model-metrics', icon: 'query_stats' },
      { id: 'pipeline', title: 'Pipeline', path: '/analytics/pipeline-status', icon: 'alt_route' },
      { id: 'history', title: 'History', path: '/analytics/historical', icon: 'history' },
      { id: 'status', title: 'Status', path: '/status', icon: 'monitor_heart' },
    ],
  },
  {
    id: 'learn',
    category: 'Learn',
    icon: 'menu_book',
    items: [
      { id: 'docs', title: 'Docs', path: '/docs', icon: 'description' },
      { id: 'use-cases', title: 'Use cases', path: '/use-cases', icon: 'lightbulb' },
      { id: 'downloads', title: 'Downloads', path: '/download', icon: 'download' },
      { id: 'blog', title: 'Blog', path: '/blogs', icon: 'rss_feed' },
      { id: 'about', title: 'About', path: '/about', icon: 'info' },
      { id: 'contact', title: 'Contact', path: '/contact', icon: 'mail' },
    ],
  },
];
