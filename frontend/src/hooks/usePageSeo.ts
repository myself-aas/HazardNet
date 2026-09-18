/**
 * Per-route document metadata for the SPA.
 *
 * `scripts/prerender.mjs` already writes the correct <head> into every static
 * HTML file, so this hook exists for the *client-side navigation* case: when a
 * visitor moves from `/` to `/methodology` without a full page load, the title,
 * description, canonical and robots directives must follow. Without it the tab
 * keeps the shell title and any crawler that renders JavaScript sees the wrong
 * page identity.
 *
 * Content comes from the same src/content/site-routes.json the prerenderer
 * reads, so the two can never disagree. FAQ pages additionally publish FAQPage
 * structured data (the static HTML ships the full @graph; this keeps the
 * rich-result payload alive after a client-side transition).
 */

import { useEffect, useMemo } from 'react';
import siteRoutes from '../content/site-routes.json';
import generatedRoutes from '../content/generated-routes.json';
import attribution from '../content/attribution.json';
import { createHeadManager, type HeadManager } from '../lib/seoHead';
import { buildJsonLdGraph } from '../lib/structuredData.js';
import type { SeoHead } from '../lib/blogSeo';

interface RouteContent {
  path: string;
  label?: string;
  title: string;
  description: string;
  keywords?: string[];
  robots?: string;
  h1?: string;
  standfirst?: string;
  updated?: string;
  sections?: Array<{
    h2?: string;
    paragraphs?: string[];
    bullets?: string[];
    callout?: { tone?: string; text?: string };
    links?: Array<{ label: string; href: string }>;
    /** Phase 9 §8.1: the validation page publishes tables composed by the content engine. */
    table?: { caption?: string; columns: string[]; rows: string[][] };
  }>;
  faqs?: Array<{ question: string; answer: string }>;
}

/**
 * Extra fields the content engine writes (Phase 8). They are not rendered by this hook — they
 * exist so the structured-data builder can describe the page accurately (breadcrumb trail, the
 * place a district page is about, a dataset the page documents).
 */
interface RouteSeoExtras {
  breadcrumb?: Array<{ name: string; path?: string }>;
  structuredData?: {
    place?: Record<string, unknown>;
    dataset?: {
      kind: 'event-archive' | 'forecast' | 'hindcast-validation';
      name?: string;
      temporalCoverage?: string;
    };
  };
}

type RouteWithExtras = RouteContent & RouteSeoExtras;

const SITE = siteRoutes.site;
const ORIGIN = SITE.origin.replace(/\/$/, '');

/**
 * The hand-written routes plus the content engine's generated pages (`generated-routes.json`,
 * written by scripts/build_content_engine.mjs). Merging them here means a client-side navigation
 * to `/hazards/…`, `/districts/…` or `/retrospectives/…` updates the title, canonical, robots
 * directive and JSON-LD exactly as the prerendered HTML already has them — otherwise the SPA
 * would keep the shell's metadata on every generated page.
 */
const ALL_ROUTES: RouteWithExtras[] = [
  ...(siteRoutes.routes as unknown as RouteWithExtras[]),
  ...((siteRoutes.appScreens ?? []) as unknown as RouteWithExtras[]),
  ...(generatedRoutes.routes as unknown as RouteWithExtras[]),
];

/** Content for a public page, keyed by its route path (e.g. `/methodology`). */
export function pageContent(pathname: string): RouteContent | undefined {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return ALL_ROUTES.find((route) => route.path === normalized);
}

export function canonicalFor(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized === '' || normalized === '/') return `${ORIGIN}/`;
  return `${ORIGIN}${normalized}`;
}

function buildSeoHead(route: RouteWithExtras): SeoHead {
  const canonical = canonicalFor(route.path);
  return {
    title: route.title,
    description: route.description,
    keywords: route.keywords ?? [],
    canonical,
    robots: route.robots ?? 'index,follow',
    ogType: 'website',
    ogImage: SITE.publisher.logo,
    publishedTime: null,
    modifiedTime: route.updated ?? null,
    authorName: SITE.publisher.name,
    section: route.label ?? null,
    tags: route.keywords ?? [],
    // The full @graph from the shared builder (src/lib/structuredData.js) — the same module
    // scripts/prerender.mjs calls, so hydration cannot replace a richer graph with a poorer one.
    jsonLd: buildJsonLdGraph({ route, site: SITE, attribution }),
  };
}

export function usePageSeo(pathname: string): RouteContent | undefined {
  const route = useMemo(() => pageContent(pathname), [pathname]);
  const manager: HeadManager = useMemo(() => createHeadManager(document), []);

  useEffect(() => {
    const head = route
      ? buildSeoHead(route)
      : {
          title: 'Page not found — HazardNet',
          description: 'This page does not exist on HazardNet.',
          keywords: [],
          canonical: canonicalFor(pathname),
          robots: 'noindex,follow',
          ogType: 'website' as const,
          ogImage: SITE.publisher.logo,
          publishedTime: null,
          modifiedTime: null,
          authorName: SITE.publisher.name,
          section: null,
          tags: [],
          jsonLd: null,
        };
    return manager.apply(head);
  }, [manager, route, pathname]);

  return route;
}
