/**
 * Triage for elements that hang past the right edge of the viewport.
 *
 * `layout-audit.mjs` reports *that* an element's right edge is beyond the viewport
 * but deliberately does not judge it, because there are two very different reasons
 * it can happen:
 *
 *   1. The element sits inside a container with `overflow-x: auto` — a scrollable
 *      table or chip row. The content is reachable; the design is intact. At most a
 *      P3 affordance question ("does it look scrollable?").
 *   2. Nothing above it scrolls and nothing above it clips either — the element is
 *      simply painted off-screen. The content is unreachable at that width. That is
 *      a P1.
 *
 * This script answers which one it is for every hanging element on the affected
 * routes, so the report can state the difference instead of guessing. It also walks
 * the ancestors of each hanging element and records the nearest scrollable one.
 *
 * Usage: node scripts/qa/overflow-triage.mjs --width=375 --out=/tmp/hn-overflow.json
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
const WIDTH = Number(args.width ?? 375);
const OUT = args.out ?? '/tmp/hn-overflow.json';

/** Routes that had at least one hanging element in the 4-viewport layout audit. */
const ROUTES = [
  '/forecast/my-districts', '/forecast/district/dhaka', '/forecast/compare',
  '/forecast/settings', '/settings', '/alerts', '/advisories', '/advisories/flood',
  '/analytics', '/analytics/food-security', '/download', '/blogs', '/status',
  '/model-performance', '/archive', '/history', '/events', '/contact',
];

const PROBE = () => {
  // `closest()` rather than a hand-rolled className walk: SVG elements expose
  // `className` as an SVGAnimatedString, not a string, so a `typeof === 'string'`
  // walk silently skips them and Leaflet's `<g>`/`<path>` markers leak into the
  // results as phantom "unreachable" content. Everything Leaflet makes lives inside
  // `.leaflet-container`, and `closest()` works on SVG nodes too.
  const inMap = (el) => !!(el.closest && el.closest('.leaflet-container'));

  /** Decorative and non-interactive: an empty div used for a glow/blob. */
  const isDecorative = (el) => {
    if (/^(button|a|input|select|textarea|summary|table|img|h[1-6])$/.test(el.tagName.toLowerCase())) return false;
    if (el.getAttribute('role')) return false;
    if (el.tabIndex >= 0) return false;
    if ((el.textContent || '').trim()) return false;
    if (el.getAttribute('aria-label') || el.getAttribute('title')) return false;
    return true;
  };
  // Ancestors included: a child of an `opacity: 0` / `display: none` parent still
  // reports a non-zero rect of its own (see the same note in layout-audit.mjs).
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (parseFloat(style.opacity) === 0) return false;
    }
    return true;
  };
  const isHiddenFromSight = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width <= 1 || r.height <= 1) return true;
    if (style.clipPath !== 'none' && /inset\(50%|circle\(0/.test(style.clipPath)) return true;
    if (style.position === 'absolute' && (r.left < -900 || r.top < -900)) return true;
    return false;
  };
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    cls: typeof el.className === 'string' ? el.className.slice(0, 70) : '',
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 44),
  });

  /** Nearest ancestor that can scroll horizontally, if any. */
  const scrollHost = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return {
          ...describe(n),
          overflowX: style.overflowX,
          scrollWidth: Math.round(n.scrollWidth),
          clientWidth: Math.round(n.clientWidth),
          // Can a reader actually reach the overflowing part?
          reachable: n.scrollWidth > n.clientWidth + 1,
        };
      }
    }
    return null;
  };

  /** Any ancestor that clips (hidden/auto/scroll) without scrolling? */
  const clipper = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.overflowX === 'hidden' || style.overflowX === 'clip') return describe(n);
    }
    return null;
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!isVisible(el) || isHiddenFromSight(el) || inMap(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= window.innerWidth + 1) continue;
    const parent = el.parentElement;
    // Only report the outermost hanging element of a chain.
    if (parent && !inMap(parent) && parent.getBoundingClientRect().right > window.innerWidth + 1) continue;
    const host = scrollHost(el);
    const reachable = host && host.reachable;
    out.push({
      ...describe(el),
      width: Math.round(r.width),
      right: Math.round(r.right),
      overflowHidden: r.right - window.innerWidth,
      scrollableAncestor: host,
      clippedByAncestor: host ? null : clipper(el),
      verdict: reachable ? 'scrollable' : isDecorative(el) ? 'decorative' : host ? 'scroll-host-does-not-scroll' : 'unreachable',
    });
    if (out.length >= 25) break;
  }
  return {
    viewport: window.innerWidth,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hanging: out,
  };
};

async function main() {
  const { chromium } = playwright();
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 812 } });
  const page = await context.newPage();
  const results = [];
  const flush = () => writeFileSync(OUT, JSON.stringify({ base: BASE, width: WIDTH, results }, null, 2));

  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1, header, main', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const r = await page.evaluate(PROBE);
      results.push({ route, ...r });
      const bad = r.hanging.filter((h) => h.verdict === 'unreachable').length;
      const scroll = r.hanging.filter((h) => h.verdict === 'scrollable').length;
      console.log(`${route.padEnd(28)} hanging=${String(r.hanging.length).padStart(2)} scrollable=${scroll} unreachable=${bad}`);
    } catch (err) {
      results.push({ route, error: String(err.message).slice(0, 200) });
      console.log(`${route.padEnd(28)} ERROR ${String(err.message).slice(0, 80)}`);
    }
    flush();
  }

  console.log(`\nwrote ${OUT}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
