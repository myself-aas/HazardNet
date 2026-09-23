/**
 * @jest-environment node
 *
 * The SEO foundations: what the build actually serves to a crawler (Phase 8, foundations).
 *
 * The 2026-09-17 audit found a sitemap listing eight URLs of which seven returned 404. The fix
 * was to generate the sitemap *from the build*; the content engine then added 74 more pages, so
 * the same guarantee has to hold for all of them. This suite checks the built output rather than
 * the source, because the source agreeing with itself is exactly what failed before:
 *
 *   - every route in `src/content/generated-routes.json` has a real HTML file;
 *   - each of those files carries its own title, canonical (on the canonical host), a single
 *     robots directive, an `<h1>` and the static body — not the SPA shell;
 *   - the sitemap lists indexable pages and nothing else, and every URL in it exists on disk;
 *   - `robots.txt` points at the sitemap on the canonical host and does not disallow a content
 *     path;
 *   - `public/data/content-index.json` — the committed record of what was published — agrees with
 *     what the build wrote.
 *
 * Guarded on `frontend/dist`: the suite is meaningless before `npm run build`, and a silent pass
 * would be dishonest, so it says so and expects the build to have run.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const frontend = join(repoRoot, 'frontend');
const dist = join(frontend, 'dist');
const CANONICAL_HOST = 'https://www.hazardnet.live';

const built = existsSync(join(dist, 'index.html'));
const maybe = built ? describe : describe.skip;

if (!built) {
  process.stdout.write(
    '\n[seoFoundations] frontend/dist is missing — run `npm run build` in frontend/ to exercise these checks.\n'
  );
}

const readDist = (relative) => readFileSync(join(dist, relative), 'utf8');
const routes = built
  ? JSON.parse(readFileSync(join(frontend, 'src/content/generated-routes.json'), 'utf8')).routes
  : [];
const siteRoutes = JSON.parse(readFileSync(join(frontend, 'src/content/site-routes.json'), 'utf8'));

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fileFor = (path) => join(dist, path === '/' ? 'index.html' : join(path.replace(/^\//, ''), 'index.html'));

/** Mirrors `escapeHtml` in scripts/prerender.mjs — the pages are HTML, so `Cox's Bazar` is
 *  published as `Cox&#39;s Bazar` and the comparison has to expect that. */
const esc = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sitemap = built ? readDist('sitemap.xml') : '';
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = new Set(sitemapLocs.map((loc) => loc.replace(CANONICAL_HOST, '') || '/'));

maybe('the generated pages', () => {
  it('exist as files for every route the engine published', () => {
    const missing = routes.filter((route) => !existsSync(fileFor(route.path)));
    expect(missing.map((route) => route.path)).toEqual([]);
  });

  it('carry their own metadata, not the shell’s', () => {
    for (const route of routes) {
      const html = readDist(join(route.path.replace(/^\//, ''), 'index.html'));
      expect(html).toContain(`<title>${esc(route.title)}</title>`);
      expect(html).toContain(`rel="canonical" href="${CANONICAL_HOST}${route.path}"`);
      const robots = [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]);
      expect(robots).toEqual([route.robots]);
    }
  });

  it('serve real content to a client that never runs JavaScript', () => {
    for (const route of routes) {
      const html = readDist(join(route.path.replace(/^\//, ''), 'index.html'));
      expect(html).toContain('<!--HN_STATIC_START-->');
      expect(html).toContain(`<h1>${esc(route.h1)}</h1>`);
      const body = textOf(html.slice(html.indexOf('<!--HN_STATIC_START-->'), html.indexOf('<!--HN_STATIC_END-->')));
      expect(body.length).toBeGreaterThan(600);
      for (const section of route.sections ?? []) {
        if (section.h2) expect(html).toContain(`<h2>${esc(section.h2)}</h2>`);
      }
      expect(html).toContain('HazardNet is decision support, not an official warning service');
    }
  });

  it('publish structured data that parses on every generated page', () => {
    for (const route of routes) {
      const html = readDist(join(route.path.replace(/^\//, ''), 'index.html'));
      const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      expect(match).not.toBeNull();
      const graph = JSON.parse(match[1]);
      expect(graph['@context']).toBe('https://schema.org');
      expect(graph['@graph'].map((node) => node['@type'])).toEqual(
        expect.arrayContaining(['WebSite', 'Organization', 'WebPage', 'BreadcrumbList'])
      );
    }
  });

  it('says plainly when a district has no outlook instead of implying one', () => {
    const uncovered = routes.filter((route) => route.robots.startsWith('noindex'));
    expect(uncovered.length).toBeGreaterThan(0);
    for (const route of uncovered) {
      const html = readDist(join(route.path.replace(/^\//, ''), 'index.html'));
      expect(html).toContain('carries no row');
      expect(html).not.toContain('outlook (target date');
    }
  });
});

maybe('the sitemap', () => {
  it('lists every indexable generated page and no noindex one', () => {
    for (const route of routes) {
      if (route.sitemap) expect(sitemapPaths.has(route.path)).toBe(true);
      else expect(sitemapPaths.has(route.path)).toBe(false);
    }
  });

  it('points every entry at a page the build actually wrote', () => {
    const broken = sitemapLocs.filter((loc) => !existsSync(fileFor(loc.replace(CANONICAL_HOST, '') || '/')));
    expect(broken).toEqual([]);
  });

  it('stays on the canonical host and produces unique URLs', () => {
    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemapLocs.length).toBe(new Set(sitemapLocs).size);
    for (const loc of sitemapLocs) expect(loc.startsWith(`${CANONICAL_HOST}/`) || loc === `${CANONICAL_HOST}/`).toBe(true);
    expect(sitemap).not.toMatch(/https?:\/\/(?!www\.)hazardnet\.live/);
  });

  it('matches the count the build logged into the content index', () => {
    const index = JSON.parse(readDist('data/content-index.json'));
    expect(index.counts.sitemap_urls).toBe(sitemapLocs.length);
    expect(index.counts.prerendered_html_files).toBeGreaterThan(routes.length);
  });

  it('keeps the hand-written routes in the sitemap too', () => {
    for (const route of siteRoutes.routes) {
      if (route.sitemap) expect(sitemapPaths.has(route.path === '/' ? '/' : route.path)).toBe(true);
    }
    // App screens are prerendered for deep links but must never be advertised.
    for (const screen of siteRoutes.appScreens ?? []) {
      expect(sitemapPaths.has(screen.path)).toBe(false);
    }
  });
});

maybe('robots.txt and the content index', () => {
  it('points at the sitemap on the canonical host and leaves content crawlable', () => {
    const robots = readDist('robots.txt');
    expect(robots).toContain(`Sitemap: ${CANONICAL_HOST}/sitemap.xml`);
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    for (const route of routes) {
      for (const rule of robots.matchAll(/^Disallow: (.+)$/gm)) {
        expect(route.path.startsWith(rule[1].trim())).toBe(false);
      }
    }
  });

  it('describes exactly what was published', () => {
    const index = JSON.parse(readDist('data/content-index.json'));
    const committed = JSON.parse(readFileSync(join(frontend, 'public/data/content-index.json'), 'utf8'));
    expect(index).toEqual(committed);
    expect(index.schema).toBe('hazardnet-content-index/v1');
    expect(index.counts.routes).toBe(routes.length);
    expect(index.unmatched_snapshot_districts).toEqual([]);
    expect(index.inputs.forecast_snapshot.path).toBe('frontend/public/data/forecasts-latest.json');
    expect(index.routes.map((route) => route.path)).toEqual(routes.map((route) => route.path));
    for (const route of index.routes) {
      expect(existsSync(fileFor(route.path))).toBe(true);
    }
  });

  it('ships a 404 page that is the noindex shell', () => {
    const fourOhFour = readDist('404.html');
    expect(fourOhFour).toContain('<div id="root">');
    expect(fourOhFour).toMatch(/<meta name="robots" content="noindex/);
  });

  // An unknown URL is an unbounded space. Serving it the homepage HTML (HTTP 200, canonical and
  // index,follow pointing at `/`) is the classic soft 404: the crawler has to fetch and compare
  // every one of them. Both deployment configs therefore rewrite unmatched paths to the noindex
  // shell, and the shell still boots the SPA so a real-but-unlisted route (a profile URL, an alert
  // id) renders for the visitor.
  it('routes unknown URLs to the noindex shell in both deployment configs, not to the homepage', () => {
    for (const configPath of [join(repoRoot, 'vercel.json'), join(frontend, 'vercel.json')]) {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const catchAll = (config.rewrites ?? []).filter((rewrite) => !rewrite.destination?.includes('.'));
      expect(catchAll).toEqual([]);
      const shells = (config.rewrites ?? []).map((rewrite) => rewrite.destination);
      expect(shells).toContain('/404.html');
      expect(shells).not.toContain('/index.html');
      // …while still excluding dotted paths, so `/.well-known/security.txt` and `/data/*.json`
      // are served as files rather than swallowed by the rewrite.
      for (const rewrite of config.rewrites ?? []) {
        expect(rewrite.source).toContain('.*\\.[a-zA-Z0-9]+$');
      }
    }
    // The shell the rewrite points at is the one that boots the app.
    const fourOhFour = readDist('404.html');
    expect(fourOhFour).toMatch(/<script[^>]+src="\/assets\//);
  });

  it('keeps every generated page below a sane size', () => {
    for (const route of routes) {
      const bytes = statSync(fileFor(route.path)).size;
      expect(bytes).toBeLessThan(200_000);
    }
  });
});
