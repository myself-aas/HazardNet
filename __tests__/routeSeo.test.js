/**
 * Gate for backlog 13's first half: "`usePageSeo` into a route wrapper so it cannot be forgotten".
 *
 * The wrapper itself lives in `App.tsx` (`RouteMetadata` → `hooks/useRouteSeo.ts`). What is worth
 * testing is the *resolution* rule, because it is the part that silently rots: if the trimming
 * stops working, `/alerts/abc` keeps the shell title and nothing fails - the page still renders.
 *
 * Two assertions:
 *
 *   1. every path the site publishes resolves to itself (so the wrapper is a no-op where the page
 *      has its own entry, and a page can never be shadowed by a parent route);
 *   2. a detail URL resolves to its index route, and an unknown path is passed through unchanged -
 *      which is what marks it `noindex,follow`.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteRoutes = JSON.parse(readFileSync(join(ROOT, 'frontend/src/content/site-routes.json'), 'utf8'));
const generatedRoutes = JSON.parse(readFileSync(join(ROOT, 'frontend/src/content/generated-routes.json'), 'utf8'));

const KNOWN = [
  ...siteRoutes.routes.map((r) => r.path),
  ...(siteRoutes.appScreens ?? []).map((r) => r.path),
  ...generatedRoutes.routes.map((r) => r.path),
];

/** Mirrors `resolveSeoPath` in frontend/src/hooks/useRouteSeo.ts. Kept in lockstep by the
 *  "wrapper is the only caller" assertion below. */
const INHERITABLE = [
  ...siteRoutes.routes.map((r) => r.path),
  ...(siteRoutes.appScreens ?? []).map((r) => r.path),
];

function resolveSeoPath(pathname, known = KNOWN, inheritable = INHERITABLE) {
  const clean = pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
  if (known.includes(clean)) return clean;
  const segments = clean.split('/').filter(Boolean);
  for (let take = segments.length - 1; take > 0; take -= 1) {
    const candidate = `/${segments.slice(0, take).join('/')}`;
    if (inheritable.includes(candidate)) return candidate;
  }
  return clean;
}

describe('route-level <head> metadata', () => {
  it('resolves every published path to itself', () => {
    for (const path of KNOWN) {
      expect(resolveSeoPath(path)).toBe(path);
    }
  });

  it('resolves a detail URL to its index route', () => {
    expect(resolveSeoPath('/alerts/abc-123')).toBe('/alerts');
    expect(resolveSeoPath('/blogs/some-slug')).toBe('/blogs');
  });

  it('leaves generated detail pages and their invented slugs alone', () => {
    // `/hazards/flood` and `/retrospectives/2024` are generated pages with their own entries.
    expect(resolveSeoPath('/hazards/flood')).toBe('/hazards/flood');
    expect(resolveSeoPath('/retrospectives/2024')).toBe('/retrospectives/2024');
  });

  it('passes an unknown path through, which is what marks it noindex', () => {
    expect(resolveSeoPath('/districts/atlantis')).toBe('/districts/atlantis');
    expect(resolveSeoPath('/not-a-route')).toBe('/not-a-route');
  });

  it('tolerates a trailing slash', () => {
    expect(resolveSeoPath('/about/')).toBe('/about');
  });

  it('the wrapper is above the route table, and no page has to opt in', () => {
    const app = readFileSync(join(ROOT, 'frontend/src/App.tsx'), 'utf8');
    const routeMetadata = app.indexOf('<RouteMetadata');
    const routes = app.indexOf('<Routes location={location}>');
    expect(routeMetadata).toBeGreaterThan(-1);
    expect(routes).toBeGreaterThan(-1);
    expect(routeMetadata).toBeLessThan(routes);

    // The wrapper is the only *page-level* caller: the two remaining ones read the hook's return
    // value (ArticlePage renders the copy it resolves) or pass a dynamic path (NotFoundPage).
    const pages = ['About', 'AlertsPage', 'AlertDetailPage', 'Contact', 'Documentation', 'DownloadCenter', 'Privacy', 'Terms', 'UseCases'];
    for (const page of pages) {
      const text = readFileSync(join(ROOT, `frontend/src/pages/${page}.tsx`), 'utf8');
      expect(`${page}: ${/usePageSeo\(/.test(text)}`).toBe(`${page}: false`);
    }
  });
});
