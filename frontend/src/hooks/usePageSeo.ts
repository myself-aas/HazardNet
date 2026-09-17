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
import { createHeadManager, type HeadManager } from '../lib/seoHead';
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
  }>;
  faqs?: Array<{ question: string; answer: string }>;
}

const SITE = siteRoutes.site;
const ORIGIN = SITE.origin.replace(/\/$/, '');

const ALL_ROUTES: RouteContent[] = [
  ...(siteRoutes.routes as unknown as RouteContent[]),
  ...((siteRoutes.appScreens ?? []) as unknown as RouteContent[]),
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

function buildSeoHead(route: RouteContent): SeoHead {
  const canonical = canonicalFor(route.path);
  const faqs = route.faqs ?? [];
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
    jsonLd:
      faqs.length > 0
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            '@id': `${canonical}#faq`,
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          }
        : null,
  };
}

/**
 * Applies the metadata for `pathname` for as long as the calling page is
 * mounted. Falls back to a noindex directive for paths with no route entry, so
 * an unknown deep link that the SPA resolves to the 404 page is never indexed
 * as a valid page (soft-404 protection).
 */
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
