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
  /**
   * Bengali editorial copy for this route, when it has any (`i18n.bn`).
   *
   * The 2026-09-19 landing-page review extended the Phase 5 translation scope from the
   * alerts and map surfaces to the front door, so the page a Bengali reader lands on first
   * is not an English article with Bengali buttons on it. Long-form copy stays in the route
   * file rather than in the dictionary because `scripts/prerender.mjs` and `usePageSeo`
   * both read the route: one text for the crawler, the no-JavaScript visitor and the
   * hydrated app, in whichever language is being rendered.
   */
  i18n?: { bn?: RouteLocalisation };
}

/** The subset of a route's copy that can be translated. */
export interface RouteLocalisation {
  label?: string;
  h1?: string;
  standfirst?: string;
  sections?: RouteContent['sections'];
  faqs?: RouteContent['faqs'];
  /**
   * Review status of this translation, set on the route rather than inferred.
   *
   * The front door's Bengali block was drafted on 2026-09-19 and approved by the project
   * owner the same day (`approved-native-speaker`), which closed owner Action 6c for this
   * surface. The marker stays in the data — and a test still asserts it — because the next
   * edit to this copy starts a new review clock, and "approved" with no date is a claim
   * nobody can check. `pending-native-speaker` is the value a new draft must carry.
   */
  review?: string;
  /** ISO date the translation was read and approved. */
  reviewedAt?: string;
  /** Who approved it, in words a reader can act on. */
  reviewedBy?: string;
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

/**
 * A table cell written as `@review-date:/model-performance` is a reference to the review date
 * that route carries, not a date anyone typed.
 *
 * The front door's knowledge-product ledger is the case that needs it: `/model-performance`'s
 * `updated` is derived (the content engine sets it to the newest hindcast report's build date),
 * so it moves every time the Hindcast workflow runs and a hand-typed ledger cell goes stale.
 * `scripts/prerender.mjs` resolves the same reference for the static HTML; resolving it here too
 * is what keeps the two views of one page saying the same thing.
 */
const REVIEW_DATE_REF = /^@review-date:(\/\S+)$/;

const REVIEW_DATES = new Map<string, string | null>(ALL_ROUTES.map((route) => [route.path, route.updated ?? null]));

/** Replace every `@review-date:` cell in a route's tables with the date it points at. */
export function resolveReviewDates(route: RouteContent): RouteContent {
  if (!route.sections?.some((section) => section.table)) return route;
  return {
    ...route,
    sections: route.sections.map((section) => {
      if (!section.table) return section;
      return {
        ...section,
        table: {
          ...section.table,
          rows: section.table.rows.map((row) =>
            row.map((cell) => {
              const match = typeof cell === 'string' ? cell.match(REVIEW_DATE_REF) : null;
              // A reference to a route with no review date renders as absent, never as a guess.
              return match ? (REVIEW_DATES.get(match[1]) ?? 'review date not reported') : cell;
            }),
          ),
        },
      };
    }),
  };
}

/** Content for a public page, keyed by its route path (e.g. `/methodology`). */
export function pageContent(pathname: string): RouteContent | undefined {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const route = ALL_ROUTES.find((r) => r.path === normalized);
  return route ? resolveReviewDates(route) : undefined;
}

/** One section of copy, merged field by field so a partial translation cannot punch a hole. */
function mergeSection(
  english: NonNullable<RouteContent['sections']>[number],
  translated: NonNullable<RouteContent['sections']>[number] | undefined,
): NonNullable<RouteContent['sections']>[number] {
  if (!translated) return english;
  return {
    h2: translated.h2 ?? english.h2,
    paragraphs: translated.paragraphs ?? english.paragraphs,
    bullets: translated.bullets ?? english.bullets,
    callout: translated.callout ?? english.callout,
    // Links carry hrefs as well as labels: a translated section that omits them would drop
    // the citation, which is the failure mode `__tests__/publicSurface.test.js` exists to catch.
    links: translated.links ?? english.links,
    table: translated.table ?? english.table,
  };
}

/**
 * Resolve a route's copy for a language.
 *
 * Fallback is field-by-field and index-by-index, mirroring `lib/i18n`'s second rule (never a
 * raw key, never a blank): a Bengali block that translates the standfirst but not the fourth
 * section renders the fourth section in English rather than as an empty heading. The English
 * copy is therefore always the structural authority — a translation can reword a page, it
 * cannot shorten or reorder one by accident.
 */
export function localiseRoute(route: RouteContent, language: string): RouteContent {
  if (language !== 'bn' || !route.i18n?.bn) return route;
  const bn = route.i18n.bn;
  const englishSections = route.sections ?? [];
  const merged: RouteContent = {
    ...route,
    label: bn.label ?? route.label,
    h1: bn.h1 ?? route.h1,
    standfirst: bn.standfirst ?? route.standfirst,
    sections: englishSections.map((section, index) => mergeSection(section, bn.sections?.[index])),
    faqs: (route.faqs ?? []).map((faq, index) => bn.faqs?.[index] ?? faq),
  };
  // The translated table brings its own cells, so the references are resolved again after the
  // merge. Resolution is idempotent — a date no longer matches the reference pattern.
  return resolveReviewDates(merged);
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
