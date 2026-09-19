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
import { buildJsonLdGraph } from '../src/lib/structuredData.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const distDir = path.join(frontendDir, 'dist');
const contentPath = path.join(frontendDir, 'src', 'content', 'site-routes.json');
const blogIndexPath = path.join(frontendDir, 'public', 'data', 'blog-index.json');
const generatedRoutesPath = path.join(frontendDir, 'src', 'content', 'generated-routes.json');
const attributionPath = path.join(frontendDir, 'src', 'content', 'attribution.json');
const contentIndexPath = path.join(frontendDir, 'public', 'data', 'content-index.json');

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
// Read rather than imported: Node cannot `import` JSON without an import attribute, and this
// script shares the structured-data module with the SPA (which imports it through Vite).
const attribution = JSON.parse(readFileSync(attributionPath, 'utf8'));
const origin = site.site.origin.replace(/\/$/, '');
const template = readFileSync(path.join(distDir, 'index.html'), 'utf8');
const statusArtifact = loadFreshnessArtifact();

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
  // Added with the editorial front door (PR #29): the authority-boundary section
  // links to the bodies that issue Bangladesh's official warnings, and the
  // attribution block links to the author's ORCID record and the university.
  'modmr.gov.bd',
  'www.modmr.gov.bd',
  'orcid.org',
  'bau.edu.bd',
  'csm.bau.edu.bd',
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

/**
 * A section table. Cells are escaped through `renderInline`, so the composed copy can carry
 * emphasis but never markup — the same rule as paragraphs. The wrapper is a plain `<div>`: the
 * static CSS already makes tables full-width, and the React renderer adds the horizontal scroll
 * affordance (`.hn-static` has no client-side navigation to hide a stray column behind).
 */
function renderTable(table) {
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return '';
  const head = table.columns.map((column) => `<th scope="col">${renderInline(column)}</th>`).join('');
  const body = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
    .join('');
  const caption = table.caption ? `<caption>${renderInline(table.caption)}</caption>` : '';
  return `<div class="hn-tablewrap"><table>${caption}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
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
      return `<section>${heading}${paragraphs}${bullets}${renderTable(section.table)}${callout}${renderLinks(section.links)}</section>`;
    })
    .join('');
}

/**
 * The attribution block, injected into the front door's static HTML.
 *
 * `src/content/attribution.json` is the single copy of these facts — the same file the
 * JSON-LD graph and `CITATION.cff` are built from. Rendering it into the static body means
 * a reader with no JavaScript, and a crawler that does not execute any, still sees who
 * wrote this and under whose supervision, instead of only finding it in structured data.
 */
function renderAttribution(person) {
  const author = person.author ?? {};
  const work = person.work ?? {};
  const supervisor = person.supervisor ?? {};
  const coSupervisor = person.coSupervisor ?? {};
  const department = person.department ?? {};
  return [
    '<section aria-labelledby="attribution-heading">',
    '<h2 id="attribution-heading">Attribution</h2>',
    '<p>',
    renderInline(`${author.name ?? ''} (${author.role ?? ''}${author.orcid ? `, ORCID ${author.orcid}` : ''}) — ${work.name ?? ''}.`),
    ` ${renderInline(`${work.type ?? 'Work'}, ${department.name ?? ''}, ${department.university ?? ''}`)}`,
    supervisor.name ? `, supervised by ${renderInline(supervisor.name)} (${renderInline(supervisor.role ?? 'Supervisor')}).` : '.',
    '</p>',
    work.citationText ? `<p class="hn-meta">${renderInline(work.citationText)}</p>` : '',
    (supervisor.url || coSupervisor.url || work.repository)
      ? `<nav aria-label="Project links"><ul>${renderLinks([
          work.repository ? { label: 'Repository', href: work.repository } : null,
          department.url ? { label: 'Institution', href: department.url } : null,
          supervisor.url ? { label: 'Supervisor profile', href: supervisor.url } : null,
          coSupervisor.url ? { label: 'Co-supervisor profile', href: coSupervisor.url } : null,
        ].filter(Boolean))}</ul></nav>`
      : '',
    '</section>',
  ].join('');
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
/**
 * A ledger cell written as `@review-date:/model-performance` is not copy: it is a reference to
 * the review date that route carries, resolved at build time.
 *
 * Why it exists: the front door's knowledge-product ledger lists each product with the date its
 * own page carries, and `/model-performance`'s date is *derived* — `build_content_engine.mjs`
 * sets it to the newest hindcast report's build date. So every time the Hindcast workflow runs,
 * that date moves, and a date typed into the ledger by hand goes stale. The drift is caught by
 * `__tests__/publicSurface.test.js`, but catching it is not the same as not having it: the cell
 * is now read from the same route table the page it describes is built from, in both renderers.
 */
const REVIEW_DATE_REF = /^@review-date:(\/\S+)$/;

let reviewDates = new Map();

function resolveReviewDates(sections) {
  if (!Array.isArray(sections)) return sections;
  return sections.map((section) => {
    if (!section.table || !Array.isArray(section.table.rows)) return section;
    return {
      ...section,
      table: {
        ...section.table,
        rows: section.table.rows.map((row) =>
          row.map((cell) => {
            const match = typeof cell === 'string' ? cell.match(REVIEW_DATE_REF) : null;
            if (!match) return cell;
            // A reference to a route with no review date renders as absent, never as a guess.
            return reviewDates.get(match[1]) ?? 'review date not reported';
          })
        ),
      },
    };
  });
}

function renderBody(route) {
  const parts = [
    `<!--HN_STATIC_START-->`,
    `<div class="hn-static">`,
    `<h1>${renderInline(route.h1 ?? route.title)}</h1>`,
    route.standfirst ? `<p class="hn-lead">${renderInline(route.standfirst)}</p>` : '',
    route.path === '/status' ? renderStatusPanel(statusArtifact) : '',
    // The front door is the page whose job is to say who is behind the numbers, so the
    // attribution block ships in its static HTML rather than only in the hydrated app.
    route.path === '/' ? renderAttribution(attribution) : '',
    renderSections(resolveReviewDates(route.sections)),
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

/**
 * Structured data comes from `src/lib/structuredData.js` — the same module the SPA imports — so
 * the graph a crawler reads in this static HTML and the graph it would see after hydration are
 * produced by one implementation rather than two that agree today and diverge later.
 */
function jsonLdFor(route) {
  return buildJsonLdGraph({ route, site: site.site, attribution });
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
  /* Static fallback shell. Colours, type and shape are NASA Horizon Design System
     tokens: carbon neutrals for text, Public Sans Web for body, Inter for headings,
     1px rules, square corners, 2px on small controls. Values are literals here because
     this CSS ships before the app's stylesheet does, and this document must not name
     the tree it was built from. */
  .hn-static{max-width:60rem;margin:0 auto;padding:5.5rem 1.25rem 3rem;background:#ffffff;font-family:"Public Sans Web","Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:1rem;color:#17171b;line-height:1.62}
  .hn-static h1,.hn-static h2,.hn-static h3,.hn-static summary,.hn-static th{font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif}
  .hn-static h1{font-size:1.9rem;line-height:1.15;letter-spacing:-.02em;margin:0 0 .75rem;font-weight:700}
  .hn-static h2{font-size:1.15rem;line-height:1.35;letter-spacing:-.02em;margin:2rem 0 .5rem;font-weight:700}
  .hn-static p{margin:.6rem 0;color:#444447;overflow-wrap:anywhere}
  .hn-static .hn-lead{font-size:1.03rem;line-height:1.5;color:#17171b}
  .hn-static ul{margin:.5rem 0 1rem;padding-left:1.15rem;color:#444447}
  .hn-static li{margin:.3rem 0}
  .hn-static a{color:#0b3d91}
  .hn-static .hn-callout{border-left:2px solid #ea6f24;background:#fce3ca;color:#3b1b00;padding:.7rem .9rem;border-radius:0;font-size:.94rem}
  .hn-static .hn-meta{font-size:.8rem;line-height:1.75;letter-spacing:.025em;color:#58585b;border-top:1px solid #e3e3e3;padding-top:.9rem;margin-top:2rem}
  .hn-static .hn-meta-line{font-size:.8rem;line-height:1.75;letter-spacing:.025em;color:#58585b}
  .hn-static .hn-tablewrap{overflow-x:auto;margin:.75rem 0 1rem}
  .hn-static table{width:100%;border-collapse:collapse;font-size:.92rem}
  .hn-static li,.hn-static td,.hn-static th{overflow-wrap:anywhere}
  .hn-static caption{text-align:left;font-size:.8rem;line-height:1.75;letter-spacing:.025em;color:#58585b;padding-bottom:.35rem}
  .hn-static th,.hn-static td{border-bottom:1px solid #e3e3e3;padding:.45rem .6rem .45rem 0;text-align:left;vertical-align:top}
  .hn-static th{font-weight:700}
  .hn-static .hn-state{display:inline-block;border:1px solid #b9b9bb;border-radius:2px;background:#ffffff;color:#17171b;padding:.1rem .5rem;font-size:.75rem;font-weight:700;white-space:nowrap}
  .hn-static .hn-state-fresh{border-color:#47da84;background:#f6f6f6;color:#17171b}
  .hn-static .hn-state-stale{border-color:#ea6f24;background:#fce3ca;color:#3b1b00}
  .hn-static .hn-state-failing{border-color:#f64137;background:#fce3ca;color:#b60109}
  .hn-static .hn-state-unknown{border-color:#b9b9bb;background:#f6f6f6;color:#444447}
  .hn-static .hn-reason{display:block;font-weight:400;font-size:.8rem;color:#58585b}
  .hn-static .hn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .hn-static .hn-loading{font-size:.8rem;color:#58585b}
  .hn-static details{border-bottom:1px solid #e3e3e3;padding:.55rem 0}
  .hn-static summary{font-weight:600;cursor:pointer}
  /* Dark scheme. Every rule restates its own background next to its text colour so the
     pairing stays legible to a reader (and to a static contrast checker) that does not
     cascade media queries. Ratios on the stated backgrounds are all >= 4.5:1. */
  @media (prefers-color-scheme:dark){
    body{background:#17171b}
    .hn-static{background:#17171b;color:#e3e3e3}
    .hn-static p,.hn-static ul,.hn-static li{color:#d1d1d1}
    .hn-static .hn-lead{color:#e3e3e3}
    .hn-static a{color:#288bff}
    .hn-static .hn-callout{background:#2e2e32;border-left-color:#ea6f24;color:#fce3ca}
    .hn-static .hn-meta{background:#17171b;border-top-color:#444447;color:#b9b9bb}
    .hn-static .hn-meta-line,.hn-static caption,.hn-static .hn-reason,.hn-static .hn-loading{color:#b9b9bb}
    .hn-static th,.hn-static td{border-bottom-color:#444447}
    .hn-static details{border-bottom-color:#444447}
    .hn-static .hn-state{background:#2e2e32;border-color:#58585b;color:#e3e3e3}
    .hn-static .hn-state-fresh{background:#2e2e32;border-color:#47da84;color:#e3e3e3}
    .hn-static .hn-state-stale{background:#5c2b00;border-color:#ea6f24;color:#fce3ca}
    .hn-static .hn-state-failing{background:#241000;border-color:#f64137;color:#ff5c52}
    .hn-static .hn-state-unknown{background:#2e2e32;border-color:#58585b;color:#b9b9bb}
  }
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

function buildSitemap(articleRoutes, generatedRoutes) {
  const entries = site.routes
    .filter((route) => route.sitemap)
    .map((route) => ({
      loc: canonicalFor(route.path),
      lastmod: route.updated ?? BUILD_DATE,
      changefreq: route.sitemap.changefreq,
      priority: route.sitemap.priority,
    }));

  // Generated pages join the sitemap only when the content engine marked them indexable. A
  // district the run did not cover carries `robots: noindex,follow` and no sitemap entry, so the
  // sitemap can never advertise a page whose only content is a statement that there is no data.
  for (const route of generatedRoutes) {
    if (!route.sitemap) continue;
    entries.push({
      loc: canonicalFor(route.path),
      lastmod: route.updated ?? BUILD_DATE,
      changefreq: route.sitemap.changefreq,
      priority: route.sitemap.priority,
    });
  }

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

/* ───────────────────────── status page data (Phase 7) ───────────────────────── */

/**
 * `/status` is the one public route whose body is data, not prose: the freshness artifact
 * (`frontend/public/data/freshness.json`, built by `scripts/build_freshness_artifact.mjs`)
 * is rendered into the static HTML here, and `FreshnessPanel` renders the same numbers at
 * runtime. A visitor without JavaScript, and a crawler, therefore see the real figures
 * instead of an empty shell — and `__tests__/statusPagePrerender.test.js` asserts that the
 * numbers in dist/ match the committed artifact.
 *
 * When the artifact is absent the page says so in one line. It never falls back to
 * "everything is fine".
 */
function loadFreshnessArtifact() {
  const artifactPath = path.join(frontendDir, 'public', 'data', 'freshness.json');
  if (!existsSync(artifactPath)) return null;
  try {
    return JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch (error) {
    console.warn(`[prerender] freshness artifact is not readable JSON: ${error.message}`);
    return null;
  }
}

const STATE_CLASS = {
  fresh: 'hn-state hn-state-fresh',
  stale: 'hn-state hn-state-stale',
  failing: 'hn-state hn-state-failing',
  missing: 'hn-state hn-state-missing',
  unknown: 'hn-state hn-state-unknown',
};

const STATE_LABEL = {
  fresh: 'Within SLO',
  stale: 'Past SLO',
  failing: 'Checks failing',
  missing: 'No data',
  unknown: 'Unknown',
};

function ageText(hours) {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) return '—';
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} d`;
}

function stateBadge(state) {
  const key = Object.prototype.hasOwnProperty.call(STATE_LABEL, state) ? state : 'unknown';
  return `<span class="${STATE_CLASS[key]}">${STATE_LABEL[key]}</span>`;
}

function renderStatusPanel(artifact) {
  if (!artifact || !Array.isArray(artifact.sources) || artifact.sources.length === 0) {
    return (
      '<section aria-labelledby="hn-status-right-now"><h2 id="hn-status-right-now">Right now</h2>' +
      '<p role="status">The freshness artifact is not present in this build, so this page ' +
      'cannot state the age of the data the deployment ships. ' +
      'That is not a statement that the data is fresh.</p></section>'
    );
  }
  const rows = artifact.sources
    .map((source) => {
      const latest =
        source.prediction_date ??
        (source.generated_at ? `${String(source.generated_at).slice(0, 16).replace('T', ' ')} UTC` : '—');
      return (
        '<tr>' +
        `<th scope="row">${renderInline(source.label ?? source.id)}` +
        (source.reason ? `<span class="hn-reason">${renderInline(source.reason)}</span>` : '') +
        '</th>' +
        `<td>${stateBadge(source.state)}</td>` +
        `<td>${ageText(source.age_hours)}</td>` +
        `<td>${typeof source.slo_hours === 'number' ? `${source.slo_hours} h` : '—'}</td>` +
        `<td>${escapeHtml(String(latest))}</td>` +
        '</tr>'
      );
    })
    .join('');

  const coverage = artifact.coverage;
  const coverageHtml = coverage
    ? '<h3>Coverage of the current run</h3><p>' +
      `${coverage.districts_covered ?? 'unknown'} of ${coverage.districts_expected ?? 'unknown'} districts ` +
      `have a row for at least one horizon, from ${coverage.produced_units ?? 'unknown'} produced ` +
      `district/horizon units — coverage status <strong>${escapeHtml(String(coverage.status ?? 'unreported'))}</strong>.</p>`
    : '';

  const model = artifact.model ?? {};
  const modelHtml =
    '<h3>Model provenance</h3><p>' +
    (model.stamped
      ? `This deployment's rows carry <code>${escapeHtml(String(model.model_version))}</code>.`
      : '<strong>Not stamped.</strong> The ingest pipeline does not yet record a <code>model_version</code> ' +
        'on the rows it produces, so no number on this site claims one, and §1.6 of the product spec blocks ' +
        'automatic publication of anything above <code>WATCH</code> until one exists.') +
    '</p>';

  const probe = (artifact.sources ?? []).find((source) => source.id === 'site_probe');
  const checks = probe?.detail && Array.isArray(probe.detail.checks) ? probe.detail.checks : [];
  const probeHtml =
    '<h3>Last site-health probe</h3>' +
    (checks.length > 0
      ? '<table><caption class="hn-sr">Checks performed by the last published site-health probe run</caption>' +
        '<thead><tr><th scope="col">Check</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead><tbody>' +
        checks
          .map(
            (check) =>
              `<tr><th scope="row">${escapeHtml(String(check.id))}</th><td>${
                check.outcome === 'success' ? 'pass' : `fail (${escapeHtml(String(check.outcome))})`
              }</td><td>${escapeHtml(String(check.detail ?? '—'))}</td></tr>`
          )
          .join('') +
        '</tbody></table>'
      : '<p>No probe result has been published to this checkout, so the live-surface checks are ' +
        '<strong>unknown here</strong> — not passing.</p>');

  const honesty = Array.isArray(artifact.honesty) && artifact.honesty.length > 0
    ? '<h3>What this page is not saying</h3><ul>' +
      artifact.honesty.map((note) => `<li>${renderInline(note)}</li>`).join('') +
      '</ul>'
    : '';

  const builtAt = artifact.built_at ? `${String(artifact.built_at).slice(0, 16).replace('T', ' ')} UTC` : '—';

  return (
    '<section aria-labelledby="hn-status-right-now">' +
    '<h2 id="hn-status-right-now">Right now</h2>' +
    `<p>${renderInline(artifact.what_this_is ?? 'A derived statement about the committed data artifacts this deployment ships.')}</p>` +
    `<p class="hn-meta-line">Derived ${escapeHtml(builtAt)}. ${artifact.overall?.counts?.fresh ?? 0} of ${artifact.sources.length} sources within their SLO.</p>` +
    `<table><caption class="hn-sr">Each data source this deployment ships, its state, its age and the SLO it is measured against.</caption>` +
    '<thead><tr><th scope="col">Source</th><th scope="col">State</th><th scope="col">Age</th>' +
    '<th scope="col">SLO</th><th scope="col">Latest data</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>` +
    coverageHtml +
    modelHtml +
    probeHtml +
    honesty +
    '</section>'
  );
}

/* ──────────────────────── generated content (Phase 8) ──────────────────────── */

/**
 * `src/content/generated-routes.json` is written by `scripts/build_content_engine.mjs` from the
 * forecast snapshot this deployment serves, the authored hazard methodology and the district
 * table. It is required: building without it would publish a site missing 74 of its pages, which
 * is the class of failure the 2026-09-17 audit found (a sitemap listing URLs the build never
 * wrote). `npm run build` regenerates it first, so the pages and the data cannot drift.
 */
function loadGeneratedRoutes() {
  if (!existsSync(generatedRoutesPath)) {
    fail('src/content/generated-routes.json is missing — run `node scripts/build_content_engine.mjs`.');
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(generatedRoutesPath, 'utf8'));
  } catch (error) {
    fail(`src/content/generated-routes.json is not readable JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
    fail('src/content/generated-routes.json contains no routes.');
  }
  return parsed;
}

/**
 * The committed, reviewable inventory of what this build published
 * (`public/data/content-index.json`): routes with their robots directive and sitemap flag, the
 * counts, and the inputs — 8 kB of routing facts instead of the 400 kB of page copy. The
 * site-health probe reads it to check that the deployment still serves what the index claims.
 */
function writeContentIndex(document, prerenderedPaths) {
  const index = {
    schema: 'hazardnet-content-index/v1',
    generated_at: document.generated_at,
    generated_by: document.generated_by,
    origin: document.origin,
    inputs: document.inputs,
    counts: {
      ...document.counts,
      prerendered_html_files: prerenderedPaths.length,
      sitemap_urls:
        site.routes.filter((route) => route.sitemap).length +
        document.routes.filter((route) => route.sitemap).length +
        blogArticleCount,
    },
    unmatched_snapshot_districts: document.unmatched_snapshot_districts ?? [],
    routes: document.routes.map((route) => ({
      path: route.path,
      title: route.title,
      robots: route.robots ?? 'index,follow',
      in_sitemap: Boolean(route.sitemap),
    })),
  };
  const serialised = `${JSON.stringify(index, null, 2)}\n`;
  // Two copies on purpose: `public/data/content-index.json` is the committed, reviewable record
  // of what the site published, and `dist/data/content-index.json` is the copy the deployment
  // actually serves. Vite copies `public/` before this script runs, so without the second write
  // the served index would describe the *previous* build.
  writeFileSync(contentIndexPath, serialised);
  mkdirSync(path.join(distDir, 'data'), { recursive: true });
  writeFileSync(path.join(distDir, 'data', 'content-index.json'), serialised);
}

/* ──────────────────────────────── main ──────────────────────────────── */

/**
 * The canonical host is `www.hazardnet.live`: the apex answers 308 → www, `security.txt`'s
 * Canonical and Policy fields use www, and every canonical tag this build writes uses it. The
 * build refuses to emit an apex canonical rather than shipping two URLs for one page — see
 * docs/ops/SEO_AND_CONTENT.md for the decision and the edge redirect that mirrors it.
 */
const CANONICAL_HOST = 'www.hazardnet.live';
if (new URL(origin).host !== CANONICAL_HOST) {
  fail(`content origin is ${new URL(origin).host} but the canonical host is ${CANONICAL_HOST} — fix src/content/site-routes.json`);
}

const generated = loadGeneratedRoutes();
const blogArticleCount = loadBlogIndex().length;

// Every route this build publishes, so a ledger reference can be resolved against the same
// table the referenced page is rendered from.
reviewDates = new Map(
  [...site.routes, ...(site.appScreens ?? []), ...generated.routes].map((route) => [
    route.path,
    typeof route.updated === 'string' ? route.updated : null,
  ])
);

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

// The content engine's pages (hazard methodology, district outlooks, retrospectives). Each one is
// a real HTML file for the same reason the hand-written routes are: a crawler and a no-JavaScript
// visitor get the full text without executing the SPA.
for (const route of generated.routes) {
  writeRoute(route, buildHtml(route));
  prerendered.push(`${route.path}${/^noindex/.test(route.robots ?? '') ? ' (noindex)' : ''}`);
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
writeFileSync(path.join(distDir, 'sitemap.xml'), buildSitemap(blogArticles, generated.routes));
writeContentIndex(generated, prerendered);

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
  `[prerender] ${prerendered.length} routes written (${blogArticles.length} blog articles, ` +
    `${generated.routes.length} from the content engine), sitemap.xml with ` +
    `${site.routes.filter((r) => r.sitemap).length + generated.routes.filter((r) => r.sitemap).length + blogArticles.length} URLs.`
);
for (const entry of prerendered) console.log(`[prerender]   · ${entry}`);
