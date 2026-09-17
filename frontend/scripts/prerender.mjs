#!/usr/bin/env node
/**
 * Static prerender for the HazardNet public surface.
 *
 * WHY THIS EXISTS
 * ---------------
 * hazardnet.live is a Vite SPA: `dist/index.html` is an empty shell and every
 * real route (`/about`, `/blogs`, `/login`, `/dashboard`, `/methodology`, …)
 * 404s unless the host applies an SPA rewrite. On 2026-09-17 the production
 * Vercel project was building from `frontend/` (see docs/ops/owner-actions.md
 * §2a-bis), so the root `vercel.json` rewrites never applied and *every*
 * deep link returned Vercel's platform 404 — including `/login` and the whole
 * SEO surface. See docs/audits/2026-09-17-live-surface-audit.md.
 *
 * Emitting a real HTML file per route fixes that in the build output itself,
 * with no host configuration at all:
 *
 *   · deep links resolve from the filesystem (status 200, no rewrite needed)
 *   · crawlers get the title, description, canonical, Open Graph, JSON-LD and
 *     substantive text without executing JavaScript (SEO-05 in the audit)
 *   · users on slow connections get first paint with real copy instead of an
 *     empty shell, and the SPA replaces it as soon as it mounts
 *
 * The committed content lives in src/content/site-routes.json, which the React
 * pages read too — the static copy and the interactive copy cannot drift.
 *
 * USAGE: `node scripts/prerender.mjs` — run automatically by `npm run build`
 * (frontend/package.json) after `vite build`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const distDir = path.join(frontendDir, 'dist');
const contentPath = path.join(frontendDir, 'src', 'content', 'site-routes.json');
const blogIndexPath = path.join(frontendDir, 'public', 'data', 'blog-index.json');

const BUILD_DATE = new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(`[prerender] ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail('dist/ not found — run `vite build` first (this script is wired into `npm run build`).');
}
if (!existsSync(contentPath)) {
  fail(`content file missing: ${path.relative(frontendDir, contentPath)}`);
}

const site = JSON.parse(readFileSync(contentPath, 'utf8'));
const origin = site.site.origin.replace(/\/$/, '');
const template = readFileSync(path.join(distDir, 'index.html'), 'utf8');

/* ────────────────────────────── helpers ────────────────────────────── */

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Canonical URL for a route path: `/` → origin, `/about` → origin/about. */
function canonicalFor(routePath) {
  const clean = routePath.replace(/\/+$/, '');
  return clean === '' ? `${origin}/` : `${origin}${clean}`;
}

function absoluteUrl(maybeRelative) {
  if (!maybeRelative) return null;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${origin}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

// Allow-list: only tag names used by the content JSON. Prevents a malformed
// content file from injecting markup into the prerendered page.
const SAFE_INLINE_TAGS = new Set(['strong', 'em', 'code', 'abbr', 'bdi']);
const ALLOWED_LINK_HOSTS = new Set([
  'github.com',
  'www.hazardnet.live',
  'hazardnet.live',
  'bmd.gov.bd',
  'www.bmd.gov.bd',
  'ffwc.gov.bd',
  'www.ffwc.gov.bd',
  'ddm.gov.bd',
  'www.ddm.gov.bd',
  'open-meteo.com',
  'developers.google.com',
  'earth.google.com',
  'openstreetmap.org',
  'www.openstreetmap.org',
  'data.humdata.org',
]);

/**
 * Minimal, deliberately tiny inline-markup renderer: supports <strong>, <em>,
 * <code>, <abbr> and nothing else. Everything else is escaped, so copy can
 * never smuggle a script or an event handler into the static HTML.
 */
function renderInline(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/&lt;(\/?)([a-z]+)(?: [^&]*?)?&gt;/gi, (match, closing, tag) => {
    const name = tag.toLowerCase();
    if (!SAFE_INLINE_TAGS.has(name)) return match;
    return `<${closing}${name}>`;
  });
}

function renderLinks(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const items = links
    .filter((link) => link && link.href && link.label)
    .map((link) => {
      const external = /^https?:\/\//i.test(link.href);
      if (external) {
        try {
          const host = new URL(link.href).host;
          if (!ALLOWED_LINK_HOSTS.has(host)) return '';
        } catch {
          return '';
        }
        return `<li><a href="${escapeHtml(link.href)}" rel="noopener">${renderInline(link.label)}</a></li>`;
      }
      return `<li><a href="${escapeHtml(link.href)}">${renderInline(link.label)}</a></li>`;
    })
    .filter(Boolean);
  if (items.length === 0) return '';
  return `<nav aria-label="Related pages"><ul>${items.join('')}</ul></nav>`;
}

function renderSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  return sections
    .map((section) => {
      const heading = section.h2 ? `<h2>${renderInline(section.h2)}</h2>` : '';
      const paragraphs = (section.paragraphs ?? [])
        .map((p) => `<p>${renderInline(p)}</p>`)
        .join('');
      const bullets = Array.isArray(section.bullets) && section.bullets.length
        ? `<ul>${section.bullets.map((b) => `<li>${renderInline(b)}</li>`).join('')}</ul>`
        : '';
      const callout = section.callout?.text
        ? `<p class="hn-callout hn-callout--${escapeHtml(section.callout.tone ?? 'info')}">${renderInline(section.callout.text)}</p>`
        : '';
      return `<section>${heading}${paragraphs}${bullets}${callout}${renderLinks(section.links)}</section>`;
    })
    .join('');
}

function renderFaqs(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return '';
  const items = faqs
    .map(
      (faq) =>
        `<details><summary>${renderInline(faq.question)}</summary><p>${renderInline(faq.answer)}</p></details>`
    )
    .join('');
  return `<section aria-label="Frequently asked questions"><h2>Questions and answers</h2>${items}</section>`;
}

/**
 * The fallback body injected into #root. React replaces it on mount, so it is
 * both the no-JavaScript page and the first paint on slow connections.
 */
function renderBody(route) {
  const parts = [
    `<!--HN_STATIC_START-->`,
    `<div class="hn-static">`,
    `<h1>${renderInline(route.h1 ?? route.title)}</h1>`,
    route.standfirst ? `<p class="hn-lead">${renderInline(route.standfirst)}</p>` : '',
    renderSections(route.sections),
    renderFaqs(route.faqs),
    route.updated
      ? `<p class="hn-meta">Content reviewed ${escapeHtml(route.updated)}. HazardNet is decision support, not an official warning service — see the <a href="/methodology">methodology</a> for scope and limitations.</p>`
      : '',
    `<p class="hn-loading" role="status">Loading the interactive HazardNet application…</p>`,
    `</div>`,
    `<!--HN_STATIC_END-->`,
  ];
  return parts.filter(Boolean).join('');
}

/**
 * Replaces the contents of <div id="root">…</div> in the template, tolerating
 * both the fresh `vite build` shell (empty div) and an already-prerendered file
 * (nested markup). A depth counter is used instead of a regex because the
 * static copy contains its own nested elements — a lazy `[\s\S]*?</div>` match
 * would stop at the first inner close tag and corrupt the document.
 */
function injectIntoRoot(html, body) {
  const openTag = html.match(/<div id="root"[^>]*>/i);
  if (!openTag) return null;
  const start = openTag.index + openTag[0].length;

  // Depth-aware scan for the matching </div>.
  let depth = 1;
  let cursor = start;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = start;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        cursor = match.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (depth !== 0) return null;
  return `${html.slice(0, start)}${body}${html.slice(cursor)}`;
}

function jsonLdFor(route) {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: `${origin}/`,
      name: site.site.name,
      description: site.site.defaultDescription,
      inLanguage: site.site.locale,
      publisher: { '@id': `${origin}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: site.site.publisher.name,
      url: site.site.publisher.url,
      logo: site.site.publisher.logo,
      email: site.site.publisher.email,
      areaServed: { '@type': 'Country', name: 'Bangladesh' },
      knowsAbout: [
        'flood early warning',
        'drought monitoring',
        'tropical cyclone risk',
        'agricultural disaster risk reduction',
      ],
    },
  ];

  const pageUrl = canonicalFor(route.path);
  graph.push({
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: route.title,
    description: route.description,
    isPartOf: { '@id': `${origin}/#website` },
    inLanguage: site.site.locale,
    ...(route.updated ? { dateModified: route.updated } : {}),
  });

  if (route.path === '/' || route.path === '/model' || route.path === '/methodology') {
    graph.push({
      '@type': 'SoftwareApplication',
      name: 'HazardNet',
      applicationCategory: 'WeatherApplication',
      operatingSystem: 'Web',
      url: `${origin}/`,
      description: site.site.defaultDescription,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        'Multi-hazard forecasting for Bangladesh (8 hazard classes)',
        '7- and 15-day district outlooks with confidence bins',
        'Dual-track severity (model severity + formula-based physics estimate)',
        'Offline-capable map tiles and PDF export',
      ],
    });
  }

  if (route.path === '/data-sources') {
    graph.push({
      '@type': 'Dataset',
      name: 'HazardNet multi-hazard forecast archive (Bangladesh)',
      description:
        'Per-unit hazard classification and severity forecasts for Bangladesh at 7- and 15-day horizons, derived from Sentinel-1/2, ERA5-Land and Open-Meteo.',
      url: `${origin}/download`,
      spatialCoverage: { '@type': 'Place', name: 'Bangladesh' },
      variableMeasured: ['hazard class', 'severity index', 'confidence bin'],
      creator: { '@id': `${origin}/#organization` },
      isAccessibleForFree: true,
    });
  }

  if (Array.isArray(route.faqs) && route.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${pageUrl}#faq`,
      mainEntity: route.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HazardNet', item: `${origin}/` },
      ...(route.path === '/'
        ? []
        : [{ '@type': 'ListItem', position: 2, name: route.label ?? route.h1 ?? route.path, item: pageUrl }]),
    ],
  });

  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Per-route <head> contents, replacing the shell's placeholder metadata. */
function renderHead(route) {
  const canonical = canonicalFor(route.path);
  const tags = [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${escapeHtml(route.robots ?? 'index,follow')}" />`,
    `<meta name="geo.region" content="BD" />`,
    `<meta name="geo.placename" content="Bangladesh" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.site.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(site.site.publisher.logo)}" />`,
    `<meta property="og:image:width" content="512" />`,
    `<meta property="og:image:height" content="512" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(site.site.publisher.logo)}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLdFor(route))}</script>`,
  ];
  if (Array.isArray(route.keywords) && route.keywords.length > 0) {
    tags.splice(2, 0, `<meta name="keywords" content="${escapeHtml(route.keywords.join(', '))}" />`);
  }
  return tags.join('\n    ');
}

/**
 * Styles for the static fallback. Deliberately close to the app's light theme
 * so a visitor does not see a jarring flash before React mounts.
 */
const STATIC_STYLES = `<style>
  .hn-static{max-width:60rem;margin:0 auto;padding:5.5rem 1.25rem 3rem;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif;color:#0f172a;line-height:1.65}
  .hn-static h1{font-size:1.9rem;line-height:1.2;margin:0 0 .75rem;font-weight:800}
  .hn-static h2{font-size:1.15rem;margin:2rem 0 .5rem;font-weight:700}
  .hn-static p{margin:.6rem 0;color:#334155}
  .hn-static .hn-lead{font-size:1.03rem;color:#1e293b}
  .hn-static ul{margin:.5rem 0 1rem;padding-left:1.15rem;color:#334155}
  .hn-static li{margin:.3rem 0}
  .hn-static a{color:#b45309}
  .hn-static .hn-callout{border-left:3px solid #f9a825;background:#fffbeb;padding:.7rem .9rem;border-radius:.4rem;font-size:.94rem}
  .hn-static .hn-meta{font-size:.8rem;color:#64748b;border-top:1px solid #e2e8f0;padding-top:.9rem;margin-top:2rem}
  .hn-static .hn-loading{font-size:.8rem;color:#94a3b8}
  .hn-static details{border-bottom:1px solid #e2e8f0;padding:.55rem 0}
  .hn-static summary{font-weight:600;cursor:pointer}
  @media (prefers-color-scheme:dark){body{background:#0b1120}.hn-static{color:#e2e8f0}.hn-static p,.hn-static ul,.hn-static li{color:#cbd5e1}.hn-static .hn-callout{background:#1e293b;border-left-color:#f9a825}}
</style>`;

function buildHtml(route) {
  let html = template;

  // Replace the shell metadata wholesale: every tag this script emits is
  // per-route, and the checked-in shell stays generic.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/i, '');
  html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  // The shell ships `robots: noindex,follow` because the SPA rewrite serves it
  // for unknown paths; each prerendered page states its own directive.
  html = html.replace(/<meta\s+name="robots"[^>]*>/i, '');
  html = html.replace('</head>', `  ${renderHead(route)}\n  ${STATIC_STYLES}\n</head>`);

  const withBody = injectIntoRoot(html, renderBody(route));
  if (withBody === null) {
    fail('could not find <div id="root"></div> in dist/index.html');
  }
  return withBody;
}

function writeRoute(route, html, { allowIndex = false } = {}) {
  const clean = route.path.replace(/^\/+|\/+$/g, '');
  if (clean === '') {
    writeFileSync(path.join(distDir, 'index.html'), html);
    return 1;
  }
  if (!allowIndex && !/^[a-z0-9/-]+$/i.test(clean)) return 0;
  const dir = path.join(distDir, clean);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html);
  // Also emit the extension-less sibling Vercel resolves directly
  // (`/about` → about.html) so deep links work even without directory-index
  // handling or an SPA rewrite.
  mkdirSync(path.dirname(path.join(distDir, `${clean}.html`)), { recursive: true });
  writeFileSync(path.join(distDir, `${clean}.html`), html);
  return 2;
}

/* ─────────────────────────── blog articles ─────────────────────────── */
/**
 * Optional: when `public/data/blog-index.json` exists (generated by the blog
 * export script), each published article is prerendered as well, so article
 * URLs are indexable and land in the sitemap. The file is optional by design —
 * a build without it still succeeds and simply omits article pages.
 */
function loadBlogIndex() {
  if (!existsSync(blogIndexPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(blogIndexPath, 'utf8'));
    const articles = Array.isArray(parsed) ? parsed : parsed.articles;
    if (!Array.isArray(articles)) return [];
    return articles.filter((a) => a && a.slug && (a.status ? a.status === 'published' : true));
  } catch (err) {
    console.warn(`[prerender] ignoring unreadable blog index: ${err.message}`);
    return [];
  }
}

function renderArticleBody(article) {
  const published = article.publishedAt ? String(article.publishedAt).slice(0, 10) : null;
  return [
    '<div class="hn-static">',
    `<p class="hn-meta">${article.category ? `${escapeHtml(article.category)} · ` : ''}${
      published ? `Published ${escapeHtml(published)}` : ''
    }</p>`,
    `<h1>${renderInline(article.title)}</h1>`,
    article.excerpt ? `<p class="hn-lead">${renderInline(article.excerpt)}</p>` : '',
    // Article bodies are sanitized rich-text HTML produced by the blog editor
    // (DOMPurify) and reviewed by a superadmin before publishing.
    `<article>${article.contentHtml ?? ''}</article>`,
    '<p class="hn-loading" role="status">Loading the interactive HazardNet application…</p>',
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}

function renderArticleHead(article) {
  const url = `${origin}/blogs/${article.slug}`;
  const image = absoluteUrl(article.ogImageUrl) ?? absoluteUrl(article.coverImageUrl) ?? site.site.publisher.logo;
  return [
    `<title>${escapeHtml(article.metaTitle || article.title)}</title>`,
    `<meta name="description" content="${escapeHtml(article.metaDescription || article.excerpt || '')}" />`,
    `<link rel="canonical" href="${escapeHtml(article.canonicalUrl || url)}" />`,
    `<meta name="robots" content="${article.robotsNoIndex ? 'noindex,follow' : 'index,follow'}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.site.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(article.metaTitle || article.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(article.metaDescription || article.excerpt || '')}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(article.metaTitle || article.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(article.metaDescription || article.excerpt || '')}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    publishedTag('article:published_time', article.publishedAt),
    publishedTag('article:modified_time', article.updatedAt),
    article.authorName ? `<meta property="article:author" content="${escapeHtml(article.authorName)}" />` : '',
    article.category ? `<meta property="article:section" content="${escapeHtml(article.category)}" />` : '',
    (article.tags ?? []).map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}" />`).join('\n    '),
    `<script type="application/ld+json">${JSON.stringify(articleJsonLd(article))}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

function publishedTag(property, value) {
  if (!value) return '';
  return `<meta property="${property}" content="${escapeHtml(String(value))}" />`;
}

function articleJsonLd(article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || '',
    image: absoluteUrl(article.ogImageUrl) ?? absoluteUrl(article.coverImageUrl) ?? site.site.publisher.logo,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
    author: article.authorName ? { '@type': 'Person', name: article.authorName } : { '@type': 'Organization', name: 'HazardNet' },
    publisher: { '@id': `${origin}/#organization` },
    mainEntityOfPage: `${origin}/blogs/${article.slug}`,
    inLanguage: site.site.locale,
  };
}

function buildArticleHtml(article) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/i, '');
  html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="robots"[^>]*>/i, '');
  html = html.replace('</head>', `  ${renderArticleHead(article)}\n  ${STATIC_STYLES}\n</head>`);
  const withBody = injectIntoRoot(html, renderArticleBody(article));
  if (withBody === null) fail('could not find <div id="root"></div> in dist/index.html');
  return withBody;
}

/* ──────────────────────────── sitemap / robots ──────────────────────────── */

function buildSitemap(articleRoutes) {
  const entries = site.routes
    .filter((route) => route.sitemap)
    .map((route) => ({
      loc: canonicalFor(route.path),
      lastmod: route.updated ?? BUILD_DATE,
      changefreq: route.sitemap.changefreq,
      priority: route.sitemap.priority,
    }));

  for (const article of articleRoutes) {
    entries.push({
      loc: `${origin}/blogs/${article.slug}`,
      lastmod: String(article.updatedAt ?? article.publishedAt ?? BUILD_DATE).slice(0, 10),
      changefreq: 'monthly',
      priority: 0.7,
    });
  }

  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n` +
        `    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/* ──────────────────────────────── main ──────────────────────────────── */

const prerendered = [];
for (const route of site.routes) {
  writeRoute(route, buildHtml(route));
  prerendered.push(route.path);
}

for (const screen of site.appScreens ?? []) {
  // App screens (login, dashboard, …) get real files too: they must return
  // 200 and be reachable by direct URL, and they carry a noindex directive.
  const route = { ...screen, sections: [], sitemap: null };
  writeRoute(route, buildHtml(route));
  prerendered.push(`${route.path} (noindex)`);
}

const blogArticles = loadBlogIndex();
for (const article of blogArticles) {
  const clean = `blogs/${String(article.slug).replace(/^\/+|\/+$/g, '')}`;
  if (!/^[a-z0-9/_-]+$/i.test(clean)) {
    console.warn(`[prerender] skipping article with unsafe slug: ${article.slug}`);
    continue;
  }
  const html = buildArticleHtml(article);
  mkdirSync(path.join(distDir, clean), { recursive: true });
  writeFileSync(path.join(distDir, clean, 'index.html'), html);
  writeFileSync(path.join(distDir, `${clean}.html`), html);
  prerendered.push(`/blogs/${article.slug}`);
}

// Sitemap + robots are regenerated so they can never list a URL that the build
// does not actually serve (the 2026-09-17 audit found exactly that: a sitemap
// of eight URLs, seven of which returned 404).
writeFileSync(path.join(distDir, 'sitemap.xml'), buildSitemap(blogArticles));

const robotsSource = path.join(frontendDir, 'public', 'robots.txt');
if (existsSync(robotsSource)) {
  const robots = readFileSync(robotsSource, 'utf8').replace(
    /^Sitemap:.*$/m,
    `Sitemap: ${origin}/sitemap.xml`
  );
  writeFileSync(path.join(distDir, 'robots.txt'), robots);
}

// A 404 route for hosts that honour 404.html (Vercel does). Unknown deep links
// still fall through to the SPA (needed for /blogs/:slug and district pages),
// which marks itself noindex.
writeFileSync(path.join(distDir, '404.html'), template);

console.log(
  `[prerender] ${prerendered.length} routes written (${blogArticles.length} blog articles), ` +
    `sitemap.xml with ${site.routes.filter((r) => r.sitemap).length + blogArticles.length} URLs.`
);
for (const entry of prerendered) console.log(`[prerender]   · ${entry}`);
