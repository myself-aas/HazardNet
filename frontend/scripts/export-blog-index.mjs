#!/usr/bin/env node
/**
 * Export published blog articles to `public/data/blog-index.json`.
 *
 * WHY THIS EXISTS
 * ---------------
 * hazardnet.live is a client-rendered SPA, so a crawler that does not execute
 * JavaScript sees none of the blog. `frontend/scripts/prerender.mjs` renders a
 * static page per article during the build, but it can only do that for the
 * articles it can read at build time — and the articles live in Firestore, not
 * in the repository. This script materialises them into the build.
 *
 * Read-only by design: it uses the *public* Firebase web config (public by
 * design, see frontend/src/lib/config.ts) against the `blog_articles`
 * collection, which firestore.rules allows anyone to read. No credentials, no
 * writes, no admin SDK.
 *
 * USAGE
 *   node scripts/export-blog-index.mjs              # writes the default path
 *   node scripts/export-blog-index.mjs --out /tmp/blog-index.json
 *   node scripts/export-blog-index.mjs --quiet
 *
 * Run it before a production build (`npm run build`) so the prerender step sees
 * the current article set:
 *   npm run blog-index && npm run build
 *
 * Staleness is real: an article unpublished after the last export would still
 * be prerendered from the stale index. That is why the export is an explicit
 * build step and why the generated file is not committed.
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const defaultOut = path.join(frontendDir, 'public', 'data', 'blog-index.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const QUIET = flag('--quiet');
const OUT = valueOf('--out', defaultOut);
const log = (...msg) => {
  if (!QUIET) console.log('[blog-index]', ...msg);
};

// Public-by-design client config; env overrides for other environments.
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'hazardnet-aas48424';
const DATABASE_ID =
  process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  'ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843';
const API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ';

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/blog_articles`;

/** Decode a Firestore REST typed value into a plain JS value. */
function decode(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

const decodeFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));

/** Fields the prerenderer and the blog UI need. Everything else is dropped. */
function projectArticle(fields) {
  const a = {
    slug: fields.slug,
    title: fields.title,
    excerpt: fields.excerpt ?? '',
    contentHtml: fields.contentHtml ?? '',
    category: fields.category ?? '',
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    status: fields.status ?? 'draft',
    coverImageUrl: fields.coverImageUrl ?? null,
    authorName: fields.authorName ?? '',
    authorEmail: fields.authorEmail ?? '',
    createdAt: fields.createdAt ?? null,
    updatedAt: fields.updatedAt ?? null,
    publishedAt: fields.publishedAt ?? null,
    metaTitle: fields.metaTitle ?? '',
    metaDescription: fields.metaDescription ?? '',
    focusKeyword: fields.focusKeyword ?? '',
    canonicalUrl: fields.canonicalUrl ?? '',
    ogImageUrl: fields.ogImageUrl ?? '',
    robotsNoIndex: Boolean(fields.robotsNoIndex),
    containsAffiliateLinks: Boolean(fields.containsAffiliateLinks),
    affiliateDisclosure: fields.affiliateDisclosure ?? '',
    faqs: Array.isArray(fields.faqs)
      ? fields.faqs
          .map((f) => ({ question: f?.question ?? '', answer: f?.answer ?? '' }))
          .filter((f) => f.question && f.answer)
      : [],
  };
  return a;
}

async function fetchAll() {
  const articles = [];
  let pageToken = '';
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(BASE);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', API_KEY);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Firestore read failed: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`
      );
    }
    const payload = await res.json();
    for (const doc of payload.documents ?? []) {
      articles.push(projectArticle(decodeFields(doc.fields ?? {})));
    }
    pageToken = payload.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return articles;
}

function main() {
  return fetchAll()
    .then((all) => {
      const published = all
        .filter((a) => a.slug && a.title && a.status === 'published')
        .sort((x, y) => String(y.publishedAt ?? '').localeCompare(String(x.publishedAt ?? '')));

      log(`read ${all.length} article(s); ${published.length} published`);

      const payload = {
        schema: 'hazardnet-blog-index/v1',
        exportedAt: new Date().toISOString(),
        source: `firestore:${PROJECT_ID}/${DATABASE_ID}/blog_articles`,
        articles: published,
      };

      mkdirSync(path.dirname(OUT), { recursive: true });
      writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
      log(`wrote ${path.relative(frontendDir, OUT)} (${published.length} article(s))`);

      if (published.length === 0) {
        // An empty index is valid — the prerender simply emits no article pages.
        log('no published articles; article prerendering will be a no-op');
      }
    })
    .catch((err) => {
      console.error('[blog-index] export failed:', err.message);
      console.error(
        '[blog-index] the blog will simply not be prerendered — fix connectivity/credentials and re-run before deploying.'
      );
      // Leave no partial/stale artefact behind: a stale index prerenders
      // articles that may since have been unpublished.
      if (existsSync(OUT) && flag('--purge-on-failure')) {
        rmSync(OUT);
        console.error(`[blog-index] removed stale ${path.relative(frontendDir, OUT)}`);
      }
      process.exitCode = 1;
    });
}

main();
