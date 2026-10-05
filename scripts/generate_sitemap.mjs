/**
 * scripts/generate_sitemap.mjs
 *
 * Generates frontend/public/sitemap.xml including all 64 district permalinks
 * and published archive routes (TASK-013, TRD §7.8).
 */

import fs from 'node:fs';
import path from 'node:path';

const DISTRICT_IDS = [
  'kurigram', 'rangpur', 'gaibandha', 'nilphamari', 'dinajpur', 'panchagarh', 'thakurgaon', 'lalmonirhat',
  'rajshahi', 'bogra', 'sirajganj', 'pabna', 'naogaon', 'natore', 'chapainawabganj', 'joypurhat',
  'mymensingh', 'netrokona', 'jamalpur', 'sherpur',
  'sylhet', 'sunamganj', 'habiganj', 'moulvibazar',
  'dhaka', 'gazipur', 'narayanganj', 'tangail', 'kishoreganj', 'manikganj', 'munshiganj', 'narsingdi',
  'faridpur', 'gopalganj', 'madaripur', 'rajbari', 'shariatpur',
  'khulna', 'satkhira', 'bagerhat', 'jessore', 'jhenaidah', 'magura', 'narail', 'chuadanga', 'kushtia', 'meherpur',
  'barisal', 'bhola', 'jhalokati', 'patuakhali', 'pirojpur', 'barguna',
  'chattogram', 'coxsbazar', 'cumilla', 'feni', 'noakhali', 'lakshmipur', 'chandpur', 'brahmanbaria',
  'khagrachhari', 'rangamati', 'bandarban'
];

const STATIC_ROUTES = [
  { loc: '/', lastmod: '2026-09-29', changefreq: 'daily', priority: '1.0' },
  { loc: '/advisories', lastmod: '2026-09-29', changefreq: 'daily', priority: '0.9' },
  { loc: '/archive', lastmod: '2026-09-29', changefreq: 'daily', priority: '0.85' },
  { loc: '/methodology', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.9' },
  { loc: '/model', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.9' },
  { loc: '/validation', lastmod: '2026-09-29', changefreq: 'weekly', priority: '0.85' },
  { loc: '/data-sources', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.8' },
  { loc: '/faq', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.8' },
  { loc: '/blogs', lastmod: '2026-09-29', changefreq: 'weekly', priority: '0.7' },
  { loc: '/analytics', lastmod: '2026-09-29', changefreq: 'weekly', priority: '0.7' },
  { loc: '/download', lastmod: '2026-09-29', changefreq: 'weekly', priority: '0.7' },
  { loc: '/use-cases', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.7' },
  { loc: '/about', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.6' },
  { loc: '/contact', lastmod: '2026-09-29', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/platform', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/hazards', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/districts', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/forecasts', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/alerts-and-advisories', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/archive', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/data-and-api', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/docs/verification', lastmod: '2026-10-05', changefreq: 'monthly', priority: '0.6' },
  { loc: '/privacy', lastmod: '2026-09-29', changefreq: 'yearly', priority: '0.3' },
  { loc: '/terms', lastmod: '2026-09-29', changefreq: 'yearly', priority: '0.3' }
];

export function generateSitemapXml(origin = 'https://www.hazardnet.live') {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const route of STATIC_ROUTES) {
    xml += `  <url>\n    <loc>${origin}${route.loc}</loc>\n    <lastmod>${route.lastmod}</lastmod>\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>\n  </url>\n`;
  }

  for (const districtId of DISTRICT_IDS) {
    xml += `  <url>\n    <loc>${origin}/district/${districtId}</loc>\n    <lastmod>2026-09-29</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }

  xml += '</urlset>\n';
  return xml;
}

const targetPath = path.resolve(process.cwd(), 'frontend', 'public', 'sitemap.xml');
const xmlContent = generateSitemapXml();
fs.writeFileSync(targetPath, xmlContent, 'utf8');
console.log(`[sitemap] Wrote ${STATIC_ROUTES.length + DISTRICT_IDS.length} URLs to ${targetPath}`);
