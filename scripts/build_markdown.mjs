#!/usr/bin/env node
/**
 * Build-time Markdown generator for "Markdown for Agents" content negotiation.
 *
 * Generates clean, formatting-stripped Markdown files from the structured content
 * in `site-routes.json` and `generated-routes.json`. These files are served by
 * the Express server when a request includes `Accept: text/markdown`, allowing
 * AI agents to consume content without parsing dense HTML.
 *
 * USAGE: `node scripts/build_markdown.mjs` — run automatically by `npm run build`
 * after `vite build` and `scripts/prerender.mjs`.
 *
 * See: https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..', 'frontend');
const distDir = path.join(frontendDir, 'dist');
const markdownDir = path.join(distDir, 'markdown');
const contentPath = path.join(frontendDir, 'src', 'content', 'site-routes.json');
const generatedRoutesPath = path.join(frontendDir, 'src', 'content', 'generated-routes.json');
const blogIndexPath = path.join(frontendDir, 'public', 'data', 'blog-index.json');
const attributionPath = path.join(frontendDir, 'src', 'content', 'attribution.json');

function fail(message) {
  console.error(`[build-markdown] ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail('dist/ not found — run `vite build` first.');
}
if (!existsSync(contentPath)) {
  fail(`content file missing: ${path.relative(frontendDir, contentPath)}`);
}

const site = JSON.parse(readFileSync(contentPath, 'utf8'));
const attribution = JSON.parse(readFileSync(attributionPath, 'utf8'));

// Ensure markdown output directory exists
mkdirSync(markdownDir, { recursive: true });

/* ──────────────────────────── helpers ──────────────────────────── */

/**
 * Strip inline HTML tags from text, keeping the content.
 * The structured content may contain <strong>, <em>, <code>, <abbr>, <bdi> tags.
 */
function stripInlineHtml(text) {
  if (!text) return '';
  return String(text).replace(/<\/?([a-z]+)(?: [^>]*?)?>/gi, '');
}

/**
 * Estimate token count (rough: 1 token ≈ 4 characters for English).
 * Used for the x-markdown-tokens response header.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Convert a table object to Markdown table format.
 */
function tableToMarkdown(table) {
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return '';

  const lines = [];
  if (table.caption) {
    lines.push(`**${stripInlineHtml(table.caption)}**`, '');
  }

  // Header row
  const header = table.columns.map((col) => stripInlineHtml(col));
  lines.push('| ' + header.join(' | ') + ' |');

  // Separator row
  lines.push('| ' + header.map(() => '---').join(' | ') + ' |');

  // Data rows
  for (const row of table.rows) {
    const cells = row.map((cell) => stripInlineHtml(cell));
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Convert links array to Markdown list.
 */
function linksToMarkdown(links) {
  if (!Array.isArray(links) || links.length === 0) return '';

  const items = links
    .filter((link) => link && link.href && link.label)
    .map((link) => `- [${stripInlineHtml(link.label)}](${link.href})`);

  return items.length > 0 ? items.join('\n') : '';
}

/**
 * Convert sections array to Markdown.
 */
function sectionsToMarkdown(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return '';

  const parts = [];

  for (const section of sections) {
    if (section.h2) {
      parts.push(`## ${stripInlineHtml(section.h2)}`, '');
    }

    if (Array.isArray(section.paragraphs)) {
      for (const p of section.paragraphs) {
        parts.push(stripInlineHtml(p), '');
      }
    }

    if (Array.isArray(section.bullets) && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        parts.push(`- ${stripInlineHtml(bullet)}`);
      }
      parts.push('');
    }

    if (section.callout?.text) {
      parts.push(`> ${stripInlineHtml(section.callout.text)}`, '');
    }

    if (section.table) {
      const tableMd = tableToMarkdown(section.table);
      if (tableMd) {
        parts.push(tableMd, '');
      }
    }

    const linksMd = linksToMarkdown(section.links);
    if (linksMd) {
      parts.push('**Related pages:**', '', linksMd, '');
    }
  }

  return parts.join('\n').trim();
}

/**
 * Convert FAQs array to Markdown.
 */
function faqsToMarkdown(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return '';

  const parts = ['## Questions and answers', ''];

  for (const faq of faqs) {
    parts.push(`### ${stripInlineHtml(faq.question)}`, '');
    parts.push(stripInlineHtml(faq.answer), '');
  }

  return parts.join('\n');
}

/**
 * Convert attribution object to Markdown.
 */
function attributionToMarkdown(person) {
  const author = person.author ?? {};
  const work = person.work ?? {};
  const supervisor = person.supervisor ?? {};
  const department = person.department ?? {};

  const parts = ['## Attribution', ''];

  let attributionLine = `${author.name ?? ''} (${author.role ?? ''}${author.orcid ? `, ORCID ${author.orcid}` : ''}) — ${work.name ?? ''}.`;
  attributionLine += ` ${work.type ?? 'Work'}, ${department.name ?? ''}, ${department.university ?? ''}`;

  if (supervisor.name) {
    attributionLine += `, supervised by ${supervisor.name} (${supervisor.role ?? 'Supervisor'}).`;
  } else {
    attributionLine += '.';
  }

  parts.push(attributionLine);

  if (work.citationText) {
    parts.push('', stripInlineHtml(work.citationText));
  }

  return parts.join('\n');
}

/**
 * Generate Markdown for a route.
 */
function generateRouteMarkdown(route) {
  const parts = [];

  // YAML frontmatter
  parts.push('---');
  parts.push(`title: "${route.title.replace(/"/g, '\\"')}"`);
  parts.push(`description: "${route.description.replace(/"/g, '\\"')}"`);
  if (route.updated) {
    parts.push(`updated: "${route.updated}"`);
  }
  parts.push('---');
  parts.push('');

  // H1
  parts.push(`# ${stripInlineHtml(route.h1 ?? route.title)}`, '');

  // Standfirst
  if (route.standfirst) {
    parts.push(`*${stripInlineHtml(route.standfirst)}*`, '');
  }

  // Attribution for front door
  if (route.path === '/') {
    parts.push(attributionToMarkdown(attribution), '');
  }

  // Sections
  const sectionsMd = sectionsToMarkdown(route.sections);
  if (sectionsMd) {
    parts.push(sectionsMd, '');
  }

  // FAQs
  const faqsMd = faqsToMarkdown(route.faqs);
  if (faqsMd) {
    parts.push(faqsMd, '');
  }

  // Footer
  if (route.updated) {
    parts.push(`---`, '');
    parts.push(`*Content reviewed ${route.updated}. HazardNet is decision support, not an official warning service — see the [methodology](/methodology) for scope and limitations.*`);
  }

  return parts.join('\n').trim() + '\n';
}

/**
 * Generate Markdown for a blog article.
 */
function generateArticleMarkdown(article) {
  const parts = [];

  // YAML frontmatter
  parts.push('---');
  parts.push(`title: "${(article.metaTitle || article.title).replace(/"/g, '\\"')}"`);
  parts.push(`description: "${(article.metaDescription || article.excerpt || '').replace(/"/g, '\\"')}"`);
  if (article.publishedAt) {
    parts.push(`published: "${String(article.publishedAt).slice(0, 10)}"`);
  }
  if (article.authorName) {
    parts.push(`author: "${article.authorName.replace(/"/g, '\\"')}"`);
  }
  parts.push('---');
  parts.push('');

  // Title
  parts.push(`# ${stripInlineHtml(article.title)}`, '');

  // Metadata
  const meta = [];
  if (article.category) meta.push(article.category);
  if (article.publishedAt) meta.push(`Published ${String(article.publishedAt).slice(0, 10)}`);
  if (meta.length > 0) {
    parts.push(`*${meta.join(' · ')}*`, '');
  }

  // Excerpt
  if (article.excerpt) {
    parts.push(`*${stripInlineHtml(article.excerpt)}*`, '');
  }

  // Content - strip HTML tags to get plain text
  if (article.contentHtml) {
    // Basic HTML to text conversion
    let text = article.contentHtml
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    parts.push(text);
  }

  return parts.join('\n').trim() + '\n';
}

/**
 * Write markdown file for a route.
 */
function writeMarkdownFile(routePath, content) {
  const clean = routePath.replace(/^\/+|\/+$/g, '') || 'index';
  const filePath = path.join(markdownDir, `${clean}.md`);

  // Ensure parent directory exists for nested routes
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, content);
  return filePath;
}

/* ──────────────────────────── main ──────────────────────────── */

let written = 0;

// Site routes from site-routes.json
for (const route of site.routes) {
  const md = generateRouteMarkdown(route);
  writeMarkdownFile(route.path, md);
  written++;
}

// App screens (login, dashboard, etc.) - these are noindex but still get markdown
for (const screen of site.appScreens ?? []) {
  const route = { ...screen, sections: [], sitemap: null };
  const md = generateRouteMarkdown(route);
  writeMarkdownFile(route.path, md);
  written++;
}

// Generated routes (hazards, districts, etc.)
if (existsSync(generatedRoutesPath)) {
  const generated = JSON.parse(readFileSync(generatedRoutesPath, 'utf8'));
  if (Array.isArray(generated.routes)) {
    for (const route of generated.routes) {
      const md = generateRouteMarkdown(route);
      writeMarkdownFile(route.path, md);
      written++;
    }
  }
}

// Blog articles
if (existsSync(blogIndexPath)) {
  try {
    const blogIndex = JSON.parse(readFileSync(blogIndexPath, 'utf8'));
    const articles = Array.isArray(blogIndex) ? blogIndex : blogIndex.articles;
    if (Array.isArray(articles)) {
      for (const article of articles) {
        if (article && article.slug && (article.status ? article.status === 'published' : true)) {
          const md = generateArticleMarkdown(article);
          writeMarkdownFile(`/blogs/${article.slug}`, md);
          written++;
        }
      }
    }
  } catch (err) {
    console.warn(`[build-markdown] ignoring unreadable blog index: ${err.message}`);
  }
}

console.log(`[build-markdown] ${written} markdown files written to ${path.relative(frontendDir, markdownDir)}/`);
