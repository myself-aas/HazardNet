/**
 * Design + accessibility review crawler (web-design-reviewer skill, Step 2).
 *
 * Emits a machine-readable result set that every number in
 * docs/reviews/*web-design-review*.md is generated from, so no claim in those
 * reports is a hand-copied measurement. Checks map to the skill's
 * references/visual-checklist.md sections 1-8.
 *
 * Usage:
 *   node scripts/qa/design-review.mjs                      # full sweep, 2 viewports
 *   node scripts/qa/design-review.mjs --viewports=core     # desktop only (quick)
 *   node scripts/qa/design-review.mjs --shots=/tmp/shots    # where PNGs go
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { launchBrowser, playwright, isIgnored, isIgnoredRequest } from './browser.mjs';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const BASE = args.base ?? 'http://127.0.0.1:3000';
const SHOTS = args.shots ?? '/tmp/hn-design-shots';
const OUT = args.out ?? '/tmp/hn-design-review.json';

/**
 * Every visitor-reachable route, with one concrete parameter per dynamic segment.
 *
 * Deliberately excluded, with the reason, so the coverage claim in the report is
 * checkable rather than aspirational:
 *   · /dashboard/blog*  — RequireSuperAdmin; renders a sign-in wall without a
 *     super-admin session, which the auth review covers instead.
 *   · /auth/callback    — consumes a one-time OAuth code; meaningful only mid-flow.
 *   · /u/:username      — no public profile exists in this dataset to resolve.
 */
const ROUTES = [
  { path: '/', name: 'Front door', core: true },
  { path: '/live', name: 'Live map', core: true },
  { path: '/home', name: 'Home dashboard', core: true },
  { path: '/home/overview', name: 'Home overview' },
  { path: '/forecast/overview', name: 'Forecast overview', core: true },
  { path: '/forecast/my-districts', name: 'My districts' },
  { path: '/forecast/district/dhaka', name: 'District detail', core: true },
  { path: '/forecast/compare', name: 'Compare districts' },
  { path: '/forecast/settings', name: 'Forecast settings' },
  { path: '/settings', name: 'Settings' },
  { path: '/alerts', name: 'Alerts', core: true },
  { path: '/advisories', name: 'Advisories', core: true },
  { path: '/advisories/flood', name: 'Advisories · flood' },
  { path: '/analytics', name: 'Analytics', core: true },
  { path: '/analytics/food-security', name: 'Analytics · food security' },
  { path: '/upload', name: 'Upload', core: true },
  { path: '/use-cases', name: 'Use cases', core: true },
  { path: '/download', name: 'Download centre', core: true },
  { path: '/blogs', name: 'Blog index', core: true },
  { path: '/docs', name: 'Documentation', core: true },
  { path: '/about', name: 'About', core: true },
  { path: '/methodology', name: 'Methodology', core: true },
  { path: '/model', name: 'Model', core: true },
  { path: '/data-sources', name: 'Data sources', core: true },
  { path: '/faq', name: 'FAQ', core: true },
  { path: '/status', name: 'Status', core: true },
  { path: '/hazards', name: 'Hazards index', core: true },
  { path: '/districts', name: 'Districts index', core: true },
  { path: '/districts/dhaka', name: 'Generated district page', core: true },
  { path: '/model-performance', name: 'Model performance', core: true },
  { path: '/retrospectives', name: 'Retrospectives', core: true },
  { path: '/retrospectives/2024', name: 'Retrospective year' },
  { path: '/archive', name: 'Hazard archive (new)', core: true },
  { path: '/history', name: 'Archive alias · /history' },
  { path: '/events', name: 'Archive alias · /events' },
  { path: '/contact', name: 'Contact', core: true },
  { path: '/terms', name: 'Terms', core: true },
  { path: '/privacy', name: 'Privacy', core: true },
  { path: '/signup', name: 'Sign up', core: true },
  { path: '/login', name: 'Log in', core: true },
  { path: '/forgot-password', name: 'Forgot password' },
  { path: '/update-password', name: 'Update password' },
  { path: '/set-password', name: 'Set password' },
  { path: '/dashboard', name: 'User dashboard', core: true },
  { path: '/this-route-does-not-exist', name: '404 page', core: true },
];

const VIEWPORTS = {
  mobile: { width: 375, height: 812, label: 'Mobile 375px', deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, label: 'Tablet 768px', deviceScaleFactor: 1 },
  desktop: { width: 1280, height: 800, label: 'Desktop 1280px', deviceScaleFactor: 1 },
  wide: { width: 1920, height: 1080, label: 'Wide 1920px', deviceScaleFactor: 1 },
};

/**
 * Viewport selection.
 *
 * `--viewports=<name>` runs exactly one, which is how the sweep is actually
 * executed: a serverless Chromium kept alive across four viewports × 45 routes
 * dies before it reaches the last one, and a single process per viewport both
 * survives and keeps the result files independent. `full` remains for a machine
 * with a normal browser.
 */
const viewportMode = args.viewports ?? 'full';
const SELECTED =
  viewportMode === 'full'
    ? ['mobile', 'tablet', 'desktop', 'wide']
    : viewportMode.split(',').map((name) => {
        if (!VIEWPORTS[name]) throw new Error(`unknown viewport "${name}" (have: ${Object.keys(VIEWPORTS).join(', ')})`);
        return name;
      });

// ── in-page probes ───────────────────────────────────────────────────────────

/**
 * Layout/interaction measurements that need the live DOM.
 *
 * Kept as one evaluated function so a page is measured in a single CDP round trip;
 * splitting these into several calls would let the page change between them.
 */
function collectMetrics() {
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /** Elements sticking out past the right edge of the viewport. */
  const overflowing = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1) {
      // Only report the outermost such element; a nested child inherits the parent's
      // overflow and would otherwise appear as a second, unrelated defect.
      const parent = el.parentElement;
      if (parent && parent.getBoundingClientRect().right > window.innerWidth + 1) continue;
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 90)) || '',
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        text: (el.textContent || '').trim().slice(0, 60),
      });
      if (overflowing.length >= 8) break;
    }
  }

  /** Interactive elements below the 44x44 touch-target floor (WCAG 2.5.5 guidance). */
  const smallTargets = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"]')) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Inline links inside a sentence are exempt: the 44px floor is for controls.
    const isInlineLink = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    if (isInlineLink) continue;
    if (rect.width < 44 || rect.height < 44) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 50),
      });
      if (smallTargets.length >= 12) break;
    }
  }

  /** Text nodes whose content is taller than their clipped box. */
  const clipped = [];
  for (const el of document.querySelectorAll('h1, h2, h3, h4, p, li, span, td, th, a, button, label')) {
    if (!visible(el)) continue;
    if (el.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'A') continue;
    const style = getComputedStyle(el);
    if (style.overflow === 'visible') continue;
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 50),
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      });
      if (clipped.length >= 6) break;
    }
  }

  /** Smallest computed body-text size actually rendered. */
  let bodyMinFont = 99;
  let bodyMinSample = '';
  for (const el of document.querySelectorAll('p, li, td, .hn-body, .text-sm, .text-xs')) {
    if (!visible(el) || !el.textContent.trim()) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < bodyMinFont) {
      bodyMinFont = size;
      bodyMinSample = (el.textContent || '').trim().slice(0, 40);
    }
  }

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible)
    .map((h) => Number(h.tagName[1]));

  const images = [...document.querySelectorAll('img')].filter(visible);
  const imgNoAlt = images.filter((i) => !i.hasAttribute('alt')).length;

  return {
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    overflowing,
    smallTargets,
    clipped,
    bodyMinFont: bodyMinFont === 99 ? null : bodyMinFont,
    bodyMinSample,
    h1Count: headings.filter((h) => h === 1).length,
    headingOrder: headings.slice(0, 14),
    headingJumps: headings.filter((h, i) => i > 0 && h - headings[i - 1] > 1).length,
    imageCount: images.length,
    imgNoAlt,
    overflowHiddenOnHtmlOrBody:
      getComputedStyle(document.body).overflowX === 'hidden' ||
      getComputedStyle(document.documentElement).overflowX === 'hidden',
    docHeight: document.documentElement.scrollHeight,
  };
}

/** Keyboard focus visibility probe: shift Tab once and read the focus ring. */
function collectFocusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return { focused: false };
  const style = getComputedStyle(el);
  const outlineWidth = parseFloat(style.outlineWidth) || 0;
  const hasRing =
    (style.outlineStyle !== 'none' && outlineWidth > 0) ||
    style.boxShadow !== 'none' ||
    style.borderColor !== style.backgroundColor;
  return {
    focused: true,
    tag: el.tagName.toLowerCase(),
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
    outlineWidth,
    outlineStyle: style.outlineStyle,
    boxShadow: style.boxShadow === 'none' ? 'none' : style.boxShadow.slice(0, 60),
    hasRing,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

  const { chromium } = playwright();
  const results = [];

  const routes = ROUTES.filter((r) => (args.routes === 'core' ? r.core : true));
  console.log(`[design-review] ${routes.length} routes × ${SELECTED.length} viewports = ${routes.length * SELECTED.length} loads`);

  /**
   * Flush after every page.
   *
   * The first run of this script lost 45 completed mobile measurements because
   * the result file was written once, at the end, and the browser died before
   * the end. A review harness that can silently lose its own evidence is worse
   * than no harness: the numbers in the report would come from whatever
   * happened to survive.
   */
  const flush = () =>
    writeFileSync(
      OUT,
      JSON.stringify({ base: BASE, viewports: SELECTED, generatedBy: 'scripts/qa/design-review.mjs', results }, null, 2),
    );

  // A fresh browser periodically, so a slow leak cannot silently degrade the
  // measurements taken later in the sweep (contrast and layout are read from a
  // live render, and a straining browser is not the browser users have).
  const RESTART_EVERY = 25;
  let browser = await launchBrowser(chromium);

  for (const viewportName of SELECTED) {
    const viewport = VIEWPORTS[viewportName];

    // Routes still to measure for this viewport. Driven as a queue so that a
    // browser recycle resumes where it left off instead of skipping the rest.
    let queue = [...routes];
    let sinceRestart = 0;
    let context;

    const openContext = async () => {
      context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        reducedMotion: 'no-preference',
        locale: 'en-GB',
        timezoneId: 'Asia/Dhaka',
      });
    };
    await openContext();

    while (queue.length) {
      // Recycle the browser before its memory ceiling turns into a crash that
      // would be indistinguishable from a page defect.
      if (sinceRestart >= RESTART_EVERY) {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        browser = await launchBrowser(chromium);
        await openContext();
        sinceRestart = 0;
      }
      sinceRestart += 1;
      const route = queue.shift();
      const consoleErrors = [];
      const consoleWarnings = [];
      const pageErrors = [];
      const failedRequests = [];
      const responseStatuses = [];

      const page = await context.newPage();
      page.on('console', (msg) => {
        const text = msg.text();
        if (isIgnored(text)) return;
        if (msg.type() === 'error') consoleErrors.push(text.slice(0, 300));
        else if (msg.type() === 'warning') consoleWarnings.push(text.slice(0, 200));
      });
      page.on('pageerror', (err) => pageErrors.push(String(err.message).slice(0, 300)));
      page.on('requestfailed', (req) => {
        if (isIgnoredRequest(req.url())) return;
        failedRequests.push({
          url: req.url().replace(BASE, '').slice(0, 120),
          reason: req.failure()?.errorText ?? 'unknown',
        });
      });
      page.on('response', (res) => {
        const url = res.url();
        if (!url.startsWith(BASE)) return;
        if (res.status() >= 400) responseStatuses.push({ url: url.replace(BASE, '').slice(0, 120), status: res.status() });
      });

      let metrics = null;
      let axe = null;
      let focus = null;
      let textHead = '';
      let errorBoundary = false;
      let status = 'ok';

      try {
        const response = await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (response && !response.ok() && response.status() !== 404) status = `http-${response.status()}`;

        // Readiness is signalled by the route's own content, not by `networkidle`:
        // the app holds a Firebase RTDB websocket open, so the network never goes
        // idle and every route would pay the full timeout (measured: ~40 s/route
        // with `networkidle`, ~2 s/route without). The short settle afterwards
        // lets lazy chunks paint their first chart frame before axe measures
        // contrast against a half-rendered page.
        await page.waitForSelector('h1, .leaflet-container, main', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1200);

        textHead = (await page.locator('body').innerText().catch(() => '')).slice(0, 1200);
        errorBoundary = /Something went wrong/i.test(textHead);

        metrics = await page.evaluate(collectMetrics);

        await page.keyboard.press('Tab');
        await page.waitForTimeout(120);
        focus = await page.evaluate(collectFocusState);

        await page.addScriptTag({ content: axeSource });
        axe = await page.evaluate(async () => {
          try {
            const r = await window.axe.run(document, {
              resultTypes: ['violations'],
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
            });
            return r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.length,
              sample: v.nodes[0]?.target?.join(' ').slice(0, 110) ?? '',
              wcag: (v.tags ?? []).filter((t) => t.startsWith('wcag')).join(','),
            }));
          } catch (e) {
            return [{ id: 'axe-crashed', impact: 'critical', help: String(e.message).slice(0, 160), nodes: 0, sample: '', wcag: '' }];
          }
        });

        const shotName = `${viewportName}${route.path.replace(/[^a-z0-9]+/gi, '_') || '_root'}`;
        await page.screenshot({ path: join(SHOTS, `${shotName}.png`) });
        if (route.core) {
          await page.screenshot({ path: join(SHOTS, `${shotName}__full.png`), fullPage: true }).catch(() => {});
        }
      } catch (err) {
        const message = String(err.message ?? err);
        status = `crashed: ${message.slice(0, 160)}`;
        await page.screenshot({ path: join(SHOTS, `FAIL_${viewportName}${route.path.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => {});

        // A dead browser reports the same crash for every remaining route. Detect
        // it by its own wording and replace the browser, so the queue continues
        // rather than recording 30 identical fictional page failures.
        if (/Target closed|browser has been closed|Protocol error|Connection closed|crash/i.test(message)) {
          await browser.close().catch(() => {});
          browser = await launchBrowser(chromium);
          await context.close().catch(() => {});
          await openContext().catch(() => {});
          sinceRestart = 0;
          console.log(`  ${viewportName} ${route.path} — browser recycled (${message.slice(0, 60)})`);
        }
      }

      results.push({
        route: route.path,
        name: route.name,
        viewport: viewportName,
        viewportWidth: viewport.width,
        status,
        errorBoundary,
        textHead,
        metrics,
        focus,
        axe,
        consoleErrors,
        consoleWarnings: consoleWarnings.slice(0, 5),
        pageErrors,
        failedRequests,
        responseStatuses,
      });

      const flag = errorBoundary ? 'BOUNDARY' : status === 'ok' ? '' : status;
      console.log(
        `  ${viewportName.padEnd(7)} ${route.path.padEnd(34)} axe=${axe?.length ?? '-'} err=${consoleErrors.length + pageErrors.length} ${flag}`,
      );
      await page.close();
      flush();
    }
    await context.close().catch(() => {});
  }

  await browser.close().catch(() => {});
  flush();
  console.log(`[design-review] wrote ${OUT} (${results.length} measurements)`);
}

main().catch((err) => {
  console.error('[design-review] FAILED:', err);
  process.exit(1);
});
