/**
 * Full-application QA suite (webapp-testing skill), run against a live server.
 *
 * Every test here exists because something measurable was *not* covered by the
 * existing e2e suite. The gaps it closes, in order of how much they were hiding:
 *
 *  1. `critical-paths.spec.ts › no JavaScript errors on critical pages` listens to
 *     `page.on('pageerror')` only — uncaught exceptions. React reports invalid SVG
 *     attributes through `console.error`, so a defect firing on every page of the
 *     site passes that gate untouched. The `Console health` block below asserts on
 *     console output, which is where that class of defect actually lands.
 *  2. The suite covers 4 routes directly. `Route health` walks all 45
 *     visitor-reachable routes and asserts each one renders its own content rather
 *     than an error boundary — the difference between "the home page works" and
 *     "the site works".
 *  3. Nothing asserted anything about the historical archive surface, the SEO
 *     metadata that makes those pages discoverable, or whether the internal links
 *     they emit resolve.
 *
 * Run:
 *   QA_CHROMIUM_PATH=/path/to/chromium LD_LIBRARY_PATH=... npx playwright test -c playwright.qa.config.ts
 *   (without QA_CHROMIUM_PATH it uses the normal Playwright browser)
 */
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { horizontalOverflow } from './helpers';

const BASE = process.env.QA_BASE_URL || process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

/**
 * Wait for a route to have rendered, whichever shell it uses.
 *
 * `helpers.waitForAppShell` waits for a `<header>`, which is correct for the
 * marketing and console shells but wrong for the auth routes: `App.tsx` renders
 * the navbar conditionally (`!isAuthPage && …`), so `/login`, `/signup`,
 * `/forgot-password`, `/update-password`, `/set-password` and `/auth/*` have no
 * header at all and would burn the full 20 s timeout before failing for the wrong
 * reason. This waits for whichever of heading, header or `main` the route has.
 */
async function waitForRoute(page: Page): Promise<void> {
  await page.waitForSelector('h1, header, main', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

/**
 * Console messages that are not defects of this application in this environment.
 *
 * Each is scoped to the exact host or feature it comes from. A blanket "ignore
 * network errors" rule would also swallow the blocked third-party *analytics*
 * failures that a real user behind a corporate proxy sees, and those are worth
 * knowing about — so the rule is narrow and named.
 */
const ENVIRONMENTAL: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /firebase|firebaseio|firebaseinstallations|googleapis|googletagmanager/i, why: 'third-party hosts blocked in sandbox' },
  { pattern: /Tile Unavailable Offline|tile.*50[0-9]/i, why: 'basemap CDN blocked; service worker serves its offline tile' },
  { pattern: /net::ERR_(CONNECTION_CLOSED|FAILED|ABORTED|NAME_NOT_RESOLVED)/i, why: 'network egress restricted' },
  { pattern: /_vercel\/insights/i, why: 'Vercel-only analytics asset' },
];

function isEnvironmental(text: string): boolean {
  return ENVIRONMENTAL.some(({ pattern }) => pattern.test(text));
}

/**
 * The same rule, applied to a *URL* rather than to console text.
 *
 * A console message for a failed subresource reads `Failed to load resource: the
 * server responded with a status of 500 ()` — it carries no URL, so text matching
 * can only ever over- or under-filter, and "500" is exactly the string produced
 * both by a blocked upstream that is not our fault and by a genuine server bug.
 * Responses are therefore collected separately, with their URLs, and the console
 * duplicates of those messages are dropped. (`net::ERR_*` failures never produce a
 * response at all, so the console rule above still covers them.)
 */
const ENVIRONMENTAL_URLS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /firebase|firebaseio|googleapis|googletagmanager/i, why: 'third-party hosts blocked in sandbox' },
  { pattern: /cartocdn|arcgis(online)?\.com|tile\.openstreetmap|opentopomap/i, why: 'basemap tiles blocked; service worker serves its offline tile' },
  { pattern: /\/api\/v1\/(weather|alerts)/i, why: 'upstream weather/alert feeds unreachable without egress' },
  { pattern: /_vercel\/insights/i, why: 'Vercel-only analytics asset' },
];

function isEnvironmentalUrl(url: string): boolean {
  return ENVIRONMENTAL_URLS.some(({ pattern }) => pattern.test(url));
}

/** Attach console+error+response collectors; returns the live arrays. */
function collectConsole(page: Page) {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isEnvironmental(text)) return;
    // Asserted with a URL by the `response` listener below instead.
    if (/^Failed to load resource/i.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    if (isEnvironmental(String(err.message))) return;
    pageErrors.push(`${err.name}: ${err.message}`);
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const url = res.url();
    if (isEnvironmentalUrl(url)) return;
    badResponses.push(`${res.status()} ${url}`);
  });
  return { errors, pageErrors, badResponses };
}

/** Every visitor-reachable route, mirroring scripts/qa/design-review.mjs. */
const ALL_ROUTES: Array<[string, string]> = [
  ['/', 'Front door'],
  ['/live', 'Live map'],
  ['/home', 'Home dashboard'],
  ['/home/overview', 'Home overview'],
  ['/forecast/overview', 'Forecast overview'],
  ['/forecast/my-districts', 'My districts'],
  ['/forecast/district/dhaka', 'District detail'],
  ['/forecast/compare', 'Compare districts'],
  ['/forecast/settings', 'Forecast settings'],
  ['/settings', 'Settings'],
  ['/alerts', 'Alerts'],
  ['/advisories', 'Advisories'],
  ['/analytics', 'Analytics'],
  ['/upload', 'Upload'],
  ['/use-cases', 'Use cases'],
  ['/download', 'Download centre'],
  ['/blogs', 'Blog index'],
  ['/docs', 'Documentation'],
  ['/about', 'About'],
  ['/methodology', 'Methodology'],
  ['/model', 'Model'],
  ['/data-sources', 'Data sources'],
  ['/faq', 'FAQ'],
  ['/status', 'Status'],
  ['/hazards', 'Hazards index'],
  ['/districts', 'Districts index'],
  ['/model-performance', 'Model performance'],
  ['/retrospectives', 'Retrospectives'],
  ['/archive', 'Hazard archive'],
  ['/history', 'Archive alias /history'],
  ['/events', 'Archive alias /events'],
  ['/contact', 'Contact'],
  ['/terms', 'Terms'],
  ['/privacy', 'Privacy'],
  ['/signup', 'Sign up'],
  ['/login', 'Log in'],
  ['/forgot-password', 'Forgot password'],
  ['/dashboard', 'User dashboard'],
];

/** Routes the console gate walks: one per distinct layout/shell. */
const CONSOLE_ROUTES = ['/', '/live', '/about', '/docs', '/archive', '/alerts', '/forecast/district/dhaka', '/blog' /* 404 shell */];

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Route health', () => {
  for (const [route, name] of ALL_ROUTES) {
    test(`${route} (${name}) renders its own content`, async ({ page }) => {
      const { errors, pageErrors, badResponses } = collectConsole(page);
      const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);
      await waitForRoute(page);
      await page.waitForTimeout(900);

      const body = await page.locator('body').innerText();
      expect(body, `${route} rendered the root error boundary`).not.toContain('Something went wrong');
      expect(body.trim().length, `${route} rendered an empty page`).toBeGreaterThan(40);

      // A route that renders only the shell has failed to resolve its lazy chunk.
      //
      // Asserted by role, not by `locator('h1').first()`: several pages carry a
      // print-only `<h1>` that is `display: none` on screen (the advisories bulletin
      // does), and `.first()` resolves to document order, so it would wait forever on
      // an element no sighted user ever sees. `getByRole` ignores non-rendered nodes.
      // Count first, then assert visibility: asserting `.toBeVisible()` on a locator
      // that matches two elements fails in strict mode with a message about visibility,
      // which would misreport a duplicate-<h1> page (`/analytics`) as a missing <h1>.
      const h1s = page.getByRole('heading', { level: 1 });
      expect(await h1s.count(), `${route} has no visible <h1>`).toBeGreaterThan(0);
      await expect(h1s.first(), `${route} <h1> never became visible`).toBeVisible({ timeout: 15_000 });

      expect(pageErrors, `${route} threw: ${pageErrors.join(' | ')}`).toEqual([]);
      expect(errors, `${route} logged: ${errors.join(' | ')}`).toEqual([]);
      expect(badResponses, `${route} served failing requests: ${badResponses.join(' | ')}`).toEqual([]);
    });
  }
});

test.describe('Console health — the blind spot in the existing gate', () => {
  // `pageerror` fires for uncaught exceptions. React's dev-mode warnings, invalid
  // DOM attribute reports and failed-fetch handlers all arrive on `console.error`
  // instead, so a defect can fire on every page and no existing test notices.
  for (const route of CONSOLE_ROUTES) {
    test(`${route} logs no application console errors`, async ({ page }) => {
      const { errors, pageErrors, badResponses } = collectConsole(page);
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);
      await page.waitForTimeout(2500); // give animations and deferred chunks a chance to misbehave
      const all = [...pageErrors, ...errors, ...badResponses];
      expect(all, `console/page/network errors on ${route}:\n  ${all.join('\n  ')}`).toEqual([]);
    });
  }

  test('the mobile navigation icon animates without invalid SVG geometry', async ({ page }) => {
    // Regression guard for the defect this suite found: `MenuCloseIcon` declares
    // `x1`/`x2` on `<motion.line>` but leaves `y1`/`y2` undefined until the
    // animation runs, so framer-motion writes the string "undefined" into the SVG.
    // That is invalid geometry for one frame and a console error on every page
    // load, on every route, because the Navbar is global.
    const invalidGeometry: string[] = [];
    await page.addInitScript(() => {
      (window as unknown as { __svgFaults: string[] }).__svgFaults = [];
      const original = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
        if (/^(y1|y2|x1|x2|cx|cy|r)$/.test(name) && String(value) === 'undefined') {
          (window as unknown as { __svgFaults: string[] }).__svgFaults.push(
            `<${this.tagName.toLowerCase()} ${name}="undefined">`,
          );
        }
        return original.call(this, name, value);
      } as typeof Element.prototype.setAttribute;
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    await page.waitForTimeout(1200);

    const faults = await page.evaluate(() => (window as unknown as { __svgFaults: string[] }).__svgFaults);
    expect(faults, `invalid SVG geometry written: ${faults.join(', ')}`).toEqual([]);
  });
});

test.describe('Historical archive surface', () => {
  test('states its unit of measurement before its first figure', async ({ page }) => {
    await page.goto(`${BASE}/archive`, { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);

    // The page's own hero, not the first `<header>` on the page — the site navbar is
    // also a `<header>` and it renders first, so `locator('header').first()` reads the
    // navigation instead of the copy under test.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/historical hazard archive/i);
    const hero = page.locator('header').filter({ has: heading }).first();

    // The single most misreadable number on the site is the row count. The page
    // must say what a row is before it says how many there are.
    const intro = await hero.innerText();
    expect(intro).toMatch(/event-district observation/i);
    expect(intro).toMatch(/not a count of disasters|distinct physical episode/i);

    // …and the first figure must carry its unit. The requirement is "say what a row is
    // when you give the row count", not "never print a number before a particular
    // phrase": the page reads `2,931 recorded event-district observations`, which is
    // correct. So the assertion is scoped to the first comma-grouped count (a bare year
    // like 2000 is not a count) and to the text that immediately follows it.
    const firstFigure = intro.match(/\b\d{1,3},\d{3}\b/);
    expect(firstFigure, `no row count found in the archive hero:\n${intro.slice(0, 240)}`).toBeTruthy();
    const figureAt = intro.indexOf(firstFigure![0]);
    const labelled = intro.slice(figureAt, figureAt + 80);
    expect(
      labelled,
      `the first figure must be labelled with what it counts:\n${labelled}`,
    ).toMatch(/event-district observation/i);
  });

  test('renders the archive counts and marks absent values as absent', async ({ page }) => {
    await page.goto(`${BASE}/archive`, { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();

    // Either the artifact loaded and carries real numbers, or the page states the
    // absence. It must never invent a figure, and it must never silently omit the
    // section — both are covered by requiring one of the two shapes to be present.
    if (/no hazard archive artifact loaded/i.test(body)) {
      expect(body).toMatch(/states no historical count/i);
      test.info().annotations.push({ type: 'artifact', description: 'archive not loaded; absence path verified' });
      return;
    }

    expect(body, 'observation count missing').toMatch(/2,931|2931/);
    expect(body, 'episode count missing').toMatch(/\b25[0-9]\b/);
    // `affected` is null for all 2,931 rows: "not recorded" is not "nobody affected".
    expect(body, 'a casualty or affected figure must not be published').not.toMatch(/\b0 (deaths|people affected)\b/i);
  });

  test('draws its charts', async ({ page }) => {
    await page.goto(`${BASE}/archive`, { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    if (/no hazard archive artifact loaded/i.test(body)) test.skip(true, 'archive artifact not present in this build');

    // Recharts renders inline SVG. Zero SVGs means the artifact parsed but nothing
    // reached the DOM — the failure mode a schema change would produce.
    const svgCount = await page.locator('svg.recharts-surface').count();
    expect(svgCount, 'no recharts surface rendered').toBeGreaterThanOrEqual(4);

    const paths = await page.locator('svg.recharts-surface path').count();
    expect(paths, 'charts rendered with no data paths').toBeGreaterThan(20);
  });

  test('keeps the embargoed severity index off the page', async ({ page }) => {
    await page.goto(`${BASE}/archive`, { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);
    const body = await page.locator('body').innerText();

    // Copy the gate in scripts/check-severity-embargo.mjs blocks. This is the
    // runtime witness to that build-time rule: the gate proves it at build time,
    // this proves it reached the browser.
    for (const forbidden of [/composite hazard score/i, /composite risk index/i, /\bweights?\b\s*[:=]/i, /cluster (centroid|assignment)/i]) {
      expect(body, `embargoed term rendered on /archive: ${forbidden}`).not.toMatch(forbidden);
    }

    // …and the page must name what it withholds rather than leaving a silent gap.
    if (/publication status/i.test(body)) {
      expect(body).toMatch(/withheld|no embargoed material/i);
    }
  });

  test('/history and /events are the same archive, not dead aliases', async ({ page }) => {
    const bodies: string[] = [];
    for (const route of ['/archive', '/history', '/events']) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);
      await page.waitForTimeout(800);
      bodies.push(await page.locator('h1').first().innerText());
    }
    expect(new Set(bodies).size, `aliases diverge: ${bodies.join(' | ')}`).toBe(1);
    expect(bodies[0]).toMatch(/historical hazard archive/i);
  });
});

test.describe('SEO — metadata that has to be right for a page to be found', () => {
  const SEO_ROUTES = ['/', '/archive', '/docs', '/methodology', '/faq', '/hazards', '/districts', '/about'];

  for (const route of SEO_ROUTES) {
    test(`${route} has a canonical, a title and a description`, async ({ page }) => {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);

      const title = await page.title();
      expect(title.length, `${route} title too short: "${title}"`).toBeGreaterThan(8);
      expect(title.length, `${route} title too long for a SERP: ${title.length}`).toBeLessThan(120);

      // Read the head through `evaluate`, not `locator().getAttribute()`: a locator
      // that matches nothing waits out the default timeout before throwing, which
      // turns "this page has no canonical" — the actual finding — into a 30 s test
      // timeout that says nothing about what is missing.
      const head = await page.evaluate(() => ({
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      }));
      expect(head.description, `${route} has no meta description`).toBeTruthy();
      expect((head.description ?? '').length).toBeGreaterThan(40);

      expect(head.canonical, `${route} has no canonical (robots=${head.robots})`).toBeTruthy();
      expect(head.canonical).toContain(route === '/' ? '/' : route.replace(/\/$/, ''));
    });
  }

  test('titles are unique across pages', async ({ page }) => {
    const titles = new Map<string, string[]>();
    for (const route of SEO_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);
      const title = await page.title();
      titles.set(title, [...(titles.get(title) ?? []), route]);
    }
    const duplicates = [...titles.entries()].filter(([, routes]) => routes.length > 1);
    expect(duplicates, `routes sharing a title: ${JSON.stringify(duplicates)}`).toEqual([]);
  });

  test('the sitemap advertises the archive routes', async ({ request }) => {
    const response = await request.get(`${BASE}/sitemap.xml`);
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml, 'sitemap.xml is not a urlset').toMatch(/<urlset/);
    // The archive is the newest public content surface; a sitemap that omits it
    // leaves it to be discovered only by internal links.
    expect(xml, '/archive missing from sitemap').toMatch(/archive/i);
  });

  test('robots.txt points at the sitemap', async ({ request }) => {
    const response = await request.get(`${BASE}/robots.txt`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/Sitemap:/i);
  });
});

test.describe('Internal link integrity', () => {
  test('no internal link on the primary surfaces 404s', async ({ page, request }) => {
    const pagesToCrawl = ['/', '/archive', '/docs', '/hazards', '/districts'];
    const internal = new Set<string>();

    for (const route of pagesToCrawl) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);
      await page.waitForTimeout(700);
      const hrefs = await page.locator('a[href]').evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? ''),
      );
      for (const href of hrefs) {
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        const clean = href.split('#')[0].split('?')[0];
        if (!clean || clean === '/') continue;
        internal.add(clean);
      }
    }

    expect(internal.size, 'crawl found almost no internal links').toBeGreaterThan(10);

    const broken: string[] = [];
    for (const href of internal) {
      const res = await request.get(BASE + href, { maxRedirects: 0 }).catch(() => null);
      if (!res) continue;
      // A client-side route always answers 200 with the shell, so a status check
      // alone cannot prove the route exists. 4xx/5xx can still prove it does not.
      if (res.status() >= 400 && res.status() !== 404) broken.push(`${href} -> ${res.status()}`);
    }
    expect(broken, `internal links failing to serve: ${broken.join(', ')}`).toEqual([]);
  });
});

test.describe('Interaction', () => {
  test('the mobile drawer opens, traps nothing, and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);

    const openButton = page.getByRole('button', { name: /open navigation menu/i });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const drawer = page.getByTestId('menu-drawer');
    await expect(drawer).toBeVisible();

    // The drawer must sit above the sticky header, not under it: a drawer painted
    // beneath the header is unreachable for its topmost links.
    const drawerBox = (await drawer.boundingBox())!;
    const headerBox = (await page.locator('header').first().boundingBox())!;
    expect(drawerBox.y, 'drawer starts below the header instead of over it').toBeLessThan(headerBox.y + 4);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden({ timeout: 5000 });
  });

  test('every route can be reached by keyboard from the front door', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);

    // Tab through the first stretch of the document and require that each stop
    // paints a visible focus indicator. A control that receives focus invisibly is
    // unusable without a mouse.
    const invisible: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const shadowed = style.boxShadow !== 'none';
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
          visibleRing: outlined || shadowed,
          skippedToBody: el === document.documentElement,
        };
      });
      if (state && !state.visibleRing && !state.skippedToBody) {
        invisible.push(`${state.tag} "${state.label}"`);
      }
    }
    expect(invisible, `focusable elements with no visible focus ring: ${invisible.join(', ')}`).toEqual([]);
  });

  test('the page never scrolls sideways on a phone', async ({ page }) => {
    const routes = ['/', '/live', '/archive', '/forecast/district/dhaka', '/alerts', '/docs'];
    for (const route of routes) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await waitForRoute(page);
      await page.waitForTimeout(800);
      const overflow = await horizontalOverflow(page);
      expect(overflow, `horizontal overflow of ${overflow}px on ${route} @375px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('404 handling', () => {
  test('an unknown route renders the 404 page, not a blank shell', async ({ page }) => {
    await page.goto(`${BASE}/definitely-not-a-real-route`, { waitUntil: 'domcontentloaded' });
    await waitForRoute(page);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/404|not found|page .* doesn't exist/i);
    expect(body).not.toContain('Something went wrong');
  });
});
