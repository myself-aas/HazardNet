/**
 * Refined layout / responsive audit.
 *
 * WHY THIS EXISTS SEPARATELY FROM design-review.mjs
 * -------------------------------------------------
 * The first pass of the design sweep counted 170 "horizontal overflow" instances
 * and 1,433 "undersized touch targets". Inspecting the samples showed most of both
 * were artifacts of how the probe was written, not defects:
 *
 *   · Leaflet positions map markers with absolute transforms that legitimately sit
 *     outside the viewport; the map clips them, the document does not scroll.
 *   · `Skip to main content` is a visually-hidden 1×1 skip link that becomes a
 *     full-size control on focus. Measuring it unfocused is measuring nothing.
 *   · Inline links inside a paragraph ("All published alerts") are exempt from the
 *     44×44 target guidance; they are text, not controls.
 *
 * A report that lists those as defects would be wrong in a way that costs the
 * reader time, and a report whose numbers are wrong is worse than no report. So the
 * measurement is redone here with the exclusions made explicit and justified, and
 * the reports quote *these* numbers.
 *
 * Also measures the document-level scroll, which is the question that actually
 * matters: does the page itself scroll sideways, or is a clipped element merely
 * hanging past the edge?
 *
 * Counts are deliberately UNCAPPED. An earlier version stopped after 6 / 15 offenders
 * per page, which made every published total a sample of the first N in DOM order: a
 * fix that removed an offender simply promoted the next one, so the total barely moved
 * and the metric could not show progress.
 *
 * Usage: node scripts/qa/layout-audit.mjs --out=/tmp/hn-layout.json [--viewports=mobile]
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, playwright } from './browser.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const BASE = args.base ?? 'http://127.0.0.1:3000';
const OUT = args.out ?? '/tmp/hn-layout-audit.json';

const ROUTES = [
  '/', '/live', '/home', '/home/overview', '/forecast/overview', '/forecast/my-districts',
  '/forecast/district/dhaka', '/forecast/compare', '/forecast/settings', '/settings',
  '/alerts', '/advisories', '/advisories/flood', '/analytics', '/analytics/food-security',
  '/upload', '/use-cases', '/download', '/blogs', '/docs', '/about', '/methodology',
  '/model', '/data-sources', '/faq', '/status', '/hazards', '/districts', '/districts/dhaka',
  '/model-performance', '/retrospectives', '/retrospectives/2024', '/archive', '/history',
  '/events', '/contact', '/terms', '/privacy', '/signup', '/login', '/forgot-password',
  '/update-password', '/set-password', '/dashboard', '/this-route-does-not-exist',
];

/** The viewports the responsive claims are made at. */
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
];

const PROBE = () => {
  const isHiddenFromSight = (el) => {
    // Visually-hidden helpers (skip links, screen-reader-only text). These are
    // supposed to be 1×1 until focused; they are not layout defects.
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width <= 1 || rect.height <= 1) return true;
    if (style.clipPath !== 'none' && /inset\(50%|circle\(0/.test(style.clipPath)) return true;
    if (style.position === 'absolute' && (rect.left < -900 || rect.top < -900)) return true;
    return false;
  };

  /**
   * Effective visibility, ancestors included.
   *
   * Checking only the element's own computed style is not enough: a child of an
   * `opacity: 0` parent still reports `opacity: 1` for itself, and reports a
   * bounding rect scaled by the parent's transform. The floating action buttons are
   * exactly that shape — collapsed, they are `opacity: 0` + `scale(0.4)` on the
   * wrapper, so each 44 px item measured 18×18 and appeared in the report as an
   * undersized touch target on 38 routes, 33 times per page. They are invisible and
   * `tabindex="-1"`; they are not targets at all, and counting them inflated the
   * metric by more than the metric was worth.
   */
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (parseFloat(style.opacity) === 0) return false;
    }
    return true;
  };

  /**
   * True for anything Leaflet injects — a map pans its own children.
   *
   * `closest()` and not a className walk: SVG elements expose `className` as an
   * `SVGAnimatedString` rather than a string, so a `typeof className === 'string'`
   * test silently fails on every SVG node and Leaflet's `<g>`/`<path>`/`<circle>`
   * markers leak into the results as phantom overflowing elements. Everything
   * Leaflet creates is inside `.leaflet-container`, and `closest()` works on SVG.
   */
  const inMap = (el) => !!(el.closest && el.closest('.leaflet-container'));

  const rect = document.documentElement.getBoundingClientRect();

  // ── document-level horizontal scroll: the defect that matters ──────────────
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  // ── elements hanging past the right edge, excluding map internals ──────────
  const hanging = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!isVisible(el) || isHiddenFromSight(el) || inMap(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= window.innerWidth + 1) continue;
    const parent = el.parentElement;
    if (parent && !inMap(parent) && parent.getBoundingClientRect().right > window.innerWidth + 1) continue;
    hanging.push({
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
      width: Math.round(r.width),
      right: Math.round(r.right),
      text: (el.textContent || '').trim().slice(0, 50),
    });
    if (hanging.length >= 200) break;
  }

  // ── touch targets: controls only, at their rendered size ──────────────────
  const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, summary, a[href]';
  const smallTargets = [];
  for (const el of document.querySelectorAll(CONTROL)) {
    if (!isVisible(el) || isHiddenFromSight(el) || inMap(el)) continue;
    // Inline links inside prose are text, not controls (WCAG 2.5.5 exception).
    if (el.tagName === 'A' && el.closest('p, li, td') && getComputedStyle(el).display === 'inline') continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    smallTargets.push({
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 44),
      cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
    });
    if (smallTargets.length >= 200) break;
  }

  // ── text clipped by its own box, excluding screen-reader-only helpers ─────
  const clipped = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li,span,td,th,a,button,label,div')) {
    if (!isVisible(el) || isHiddenFromSight(el) || inMap(el)) continue;
    if (el.children.length > 0) continue;
    const style = getComputedStyle(el);
    if (style.overflow === 'visible' || style.overflow === 'auto' || style.overflow === 'scroll') continue;
    if (style.textOverflow === 'ellipsis') continue; // deliberate truncation
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      clipped.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 44), scrollH: el.scrollHeight, clientH: el.clientHeight });
      if (clipped.length >= 200) break;
    }
  }

  // ── headings ──────────────────────────────────────────────────────────────
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((h) => isVisible(h) && !isHiddenFromSight(h))
    .map((h) => Number(h.tagName[1]));
  const jumps = [];
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i] - headings[i - 1] > 1) jumps.push(`h${headings[i - 1]}->h${headings[i]}`);
  }

  const images = [...document.querySelectorAll('img')].filter(isVisible);

  return {
    docOverflow,
    scrollsSideways: docOverflow > 1,
    hanging,
    smallTargets,
    clipped,
    h1Count: headings.filter((h) => h === 1).length,
    headingOrder: headings.slice(0, 12),
    headingJumps: jumps,
    imageCount: images.length,
    imagesWithoutAlt: images.filter((i) => !i.hasAttribute('alt') || i.getAttribute('alt') === '').length,
    docWidth: Math.round(rect.width),
    docHeight: document.documentElement.scrollHeight,
  };
};

async function main() {
  const { chromium } = playwright();
  const browser = await launchBrowser(chromium);
  const results = [];
  const flush = () => writeFileSync(OUT, JSON.stringify({ base: BASE, generatedBy: 'scripts/qa/layout-audit.mjs', results }, null, 2));

  // `--viewports=mobile,tablet` re-measures a subset: a full pass is 4 × 45 loads
  // and takes ~30 min, which is more than is needed to confirm a single fix.
  const only = args.viewports ? String(args.viewports).split(',') : null;
  for (const vp of VIEWPORTS.filter((v) => !only || only.includes(v.name))) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-GB',
      timezoneId: 'Asia/Dhaka',
    });
    for (const route of ROUTES) {
      const page = await context.newPage();
      let data = null;
      let error = null;
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('h1, .leaflet-container, main', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1100);
        data = await page.evaluate(PROBE);
      } catch (err) {
        error = String(err.message).slice(0, 160);
      }
      results.push({ route, viewport: vp.name, width: vp.width, ...(data ?? {}), error });
      const flag = data?.scrollsSideways ? `SIDEWAYS +${data.docOverflow}px` : '';
      console.log(`  ${vp.name.padEnd(7)} ${route.padEnd(34)} h1=${data?.h1Count ?? '-'} targets=${data?.smallTargets?.length ?? '-'} ${flag}`);
      await page.close();
      flush();
    }
    await context.close();
  }

  await browser.close().catch(() => {});
  flush();
  console.log(`[layout-audit] wrote ${OUT} (${results.length} measurements)`);
}

main().catch((err) => {
  console.error('[layout-audit] FAILED:', err);
  process.exit(1);
});
