/**
 * Route-level document metadata.
 *
 * `usePageSeo` was called by twelve pages, one import at a time. That is a rule you can forget:
 * a new route ships, its `<head>` keeps the shell title, and the only symptom is a wrong title in
 * a browser tab and a wrong identity for anything that renders JavaScript. Backlog 13's remedy is
 * to move the call into the route layer, which is what this hook is.
 *
 * It runs once for the whole `<Routes>` tree and resolves the *route* rather than the raw URL:
 *
 *   - an exact entry in `site-routes.json` wins (`/about`, `/blogs`, ...);
 *   - otherwise the path is trimmed segment by segment until a *hand-written* route matches, so a
 *     detail URL inherits its index route's metadata (`/alerts/abc-123` → `/alerts`). This is the
 *     aliasing the pages used to spell out by hand (`AlertDetailPage` called
 *     `usePageSeo('/alerts')`), derived now instead of remembered. Trimmed parents are restricted
 *     to hand-written routes on purpose: a generated page has its own entry, and an invented slug
 *     under a generated index (`/districts/atlantis`) must fall through untouched, because that is
 *     what marks it `noindex,follow`.
 *
 * A page may still call `usePageSeo` itself for copy that only it can resolve: `ArticlePage`
 * does, because it needs the hook's *return value* to render. Its effect runs after this one, so
 * the more specific call wins, and the wrapper's job is only to make sure *something* correct is
 * always set.
 */

import { useMemo } from 'react';
import { usePageSeo } from './usePageSeo';
import siteRoutes from '../content/site-routes.json';
import generatedRoutes from '../content/generated-routes.json';

/**
 * Every path the site publishes: the hand-written routes, the app screens (routes that exist in
 * the SPA but not in the sitemap, such as `/status` deep links) and the content engine's generated
 * pages. Reading the same files the prerenderer reads is what keeps a client-side navigation and
 * the static HTML in agreement.
 */
/** The routes a detail URL may inherit metadata from: the hand-written ones. A generated page
 *  (`/districts/bagerhat`, `/hazards/flood`, `/retrospectives/2024`) carries its own entry, so it
 *  never needs to trim - and an invented slug under a generated index (`/districts/atlantis`) must
 *  *not* inherit `/districts`, because inheriting would mark it indexable. It has to fall through
 *  unmodified, which is what sets `noindex,follow`. */
const INHERITABLE_PATHS: string[] = [
  ...(siteRoutes.routes as Array<{ path: string }>).map((route) => route.path),
  ...((siteRoutes.appScreens ?? []) as Array<{ path: string }>).map((route) => route.path),
];

const KNOWN_PATHS: string[] = [
  ...INHERITABLE_PATHS,
  ...(generatedRoutes.routes as Array<{ path: string }>).map((route) => route.path),
];

/**
 * Resolve a URL to the route that owns its metadata.
 *
 * Exported for the test: the trimming rule is the whole behaviour, and getting it wrong is
 * invisible until someone checks a browser tab.
 */
export function resolveSeoPath(
  pathname: string,
  known: string[] = KNOWN_PATHS,
  inheritable: string[] = INHERITABLE_PATHS,
): string {
  const clean = pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
  if (known.includes(clean)) return clean;

  const segments = clean.split('/').filter(Boolean);
  for (let take = segments.length - 1; take > 0; take -= 1) {
    const candidate = `/${segments.slice(0, take).join('/')}`;
    if (inheritable.includes(candidate)) return candidate;
  }
  return clean;
}

export function useRouteSeo(pathname: string): void {
  const path = useMemo(() => resolveSeoPath(pathname), [pathname]);
  usePageSeo(path);
}
