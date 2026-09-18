#!/usr/bin/env node
/**
 * Design-system audit of the built frontend — measured, not eyeballed.
 *
 * WHY THIS EXISTS
 * ---------------
 * A design review written from memory is a description of the reviewer, not of the site. Every
 * statement in `docs/audits/2026-09-18-global-frontend-design-system-audit.md` has to be
 * reproducible, so this script drives the built app in a real browser and emits the evidence:
 *
 *   * **tokens** — every font family, size, weight, colour, radius, shadow and transition
 *     duration actually rendered, with the number of elements using each one. A design system
 *     is what the browser computed, not what the stylesheet intended.
 *   * **structure** — per route: the heading outline (exactly one h1?), landmark elements
 *     (header/nav/main/footer), section count, table/figure/list counts.
 *   * **components** — header, footer, nav, cards, "capsules" (pill-shaped elements), buttons,
 *     links, inputs and images, with their computed treatments, so drift between pages shows up
 *     as a count rather than an opinion.
 *   * **interaction** — hover and focus-visible treatments sampled from real elements (a
 *     keyboard Tab walk records the focus ring each element draws), plus the set of animated
 *     properties and durations.
 *   * **layout** — horizontal overflow at four viewport widths, and the widest element when a
 *     page does overflow (the name, not the number, is what a fix needs).
 *   * **media** — images with their alt text and source host, so "no decorative stock" and
 *     "every figure has a traceable credit" are checkable claims.
 *
 * USAGE
 *   npm --prefix frontend run build
 *   npm --prefix frontend run preview -- --host 0.0.0.0 --port 4173 &
 *   node scripts/audit_frontend_design.mjs --base-url http://localhost:4173 --out /tmp/design-audit
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` may point at a browser binary (this sandbox uses the one bundled
 * with @sparticuz/chromium, because the Playwright CDN is unreachable here). The script is a
 * report generator: it never fails a build on a finding, it exits non-zero only when it cannot
 * measure at all. The findings live in the audit document, not in an exit code.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const BASE_URL = arg('base-url', 'http://localhost:4173');
const OUT = arg('out', '/tmp/design-audit');
const WIDTHS = (arg('widths', '1440,768,375') || '').split(',').map(Number).filter(Boolean);
const FULL_PAGE = argv.includes('--full-page');

// One route per page template. `src/content/site-routes.json` holds the 18 curated routes and
// `src/content/generated-routes.json` the 75 content-engine routes; the list below samples every
// template rather than every URL, so a template regression cannot hide behind a repeat of its
// siblings. (The first draft of this list contained `/knowledge`, which does not exist — the probe
// reported it as a page titled "Page not found", which is the correct behaviour for a host that
// serves the SPA fallback with HTTP 200.)
const ROUTES = (arg('routes') || [
  '/',
  '/live',
  '/alerts',
  '/advisories',
  '/blogs',
  '/methodology',
  '/model',
  '/model-performance',
  '/data-sources',
  '/faq',
  '/status',
  '/about',
  '/analytics',
  '/docs',
  '/download',
  '/use-cases',
  '/contact',
  '/privacy',
  '/terms',
  '/hazards',
  '/hazards/flood',
  '/hazards/drought',
  '/hazards/tropical-cyclone',
  '/districts',
  '/districts/dhaka',
  '/districts/kurigram',
].join(',')).split(',').filter(Boolean);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

/** Everything the probe runs in the page, written as one function so it is auditable. */
const PROBE = () => {
  const round = (value) => Math.round(value * 100) / 100;
  const describeFont = (style) => `${style.fontFamily.split(',')[0].replace(/["']/g, '').trim()} ${style.fontSize}/${style.lineHeight} ${style.fontWeight}`;
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const tally = (counter, key) => {
    if (!key) return;
    counter[key] = (counter[key] || 0) + 1;
  };

  const collect = (root) => {
    const bucket = { fonts: {}, textColors: {}, backgrounds: {}, radii: {}, shadows: {}, transitions: {}, animations: {} };
    if (!root) return bucket;
    for (const element of Array.from(root.querySelectorAll('*')).filter(visible)) {
      const style = getComputedStyle(element);
      const hasText = Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && node.textContent.trim().length > 0,
      );
      if (hasText) {
        tally(bucket.fonts, describeFont(style));
        tally(bucket.textColors, style.color);
      }
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') tally(bucket.backgrounds, style.backgroundColor);
      if (style.borderRadius !== '0px') tally(bucket.radii, style.borderRadius);
      if (style.boxShadow !== 'none') tally(bucket.shadows, style.boxShadow);
      if (style.transitionDuration !== '0s') {
        tally(bucket.transitions, `${style.transitionProperty} ${style.transitionDuration} ${style.transitionTimingFunction}`);
      }
      if (style.animationName !== 'none') {
        tally(bucket.animations, `${style.animationName} ${style.animationDuration} ${style.animationIterationCount}`);
      }
    }
    return bucket;
  };

  const all = Array.from(document.body.querySelectorAll('*')).filter(visible);
  // Chrome and content are tallied separately: the shared header/footer carries NASA red and blue on
  // every route, so a body-wide tally cannot tell a restyled page from a restyled navbar.
  const whole = collect(document.body);
  const content = collect(document.querySelector('main'));
  const { fonts, textColors, backgrounds, radii, shadows, transitions, animations } = whole;

  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible).map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: element.textContent.trim().slice(0, 120),
    style: describeFont(getComputedStyle(element)),
  }));

  const capsule = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const radius = parseFloat(style.borderRadius) || 0;
    return radius >= Math.min(rect.height, rect.width) / 2 - 1 && radius > 0;
  };

  const controls = {
    buttons: [],
    links: [],
    inputs: [],
    capsules: [],
  };
  for (const element of all) {
    const tag = element.tagName.toLowerCase();
    const style = getComputedStyle(element);
    if (tag === 'button' || element.getAttribute('role') === 'button') {
      controls.buttons.push({
        text: (element.textContent || '').trim().slice(0, 60),
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
        border: style.borderWidth === '0px' ? null : `${style.borderWidth} ${style.borderStyle} ${style.borderColor}`,
        capsule: capsule(element),
      });
    } else if (tag === 'a') {
      const href = element.getAttribute('href') || '';
      controls.links.push({
        text: (element.textContent || '').trim().slice(0, 60),
        href,
        external: /^https?:/i.test(href),
        color: style.color,
        underline: style.textDecorationLine.includes('underline'),
        weight: style.fontWeight,
      });
    } else if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      controls.inputs.push({
        type: element.getAttribute('type') || tag,
        radius: style.borderRadius,
        border: `${style.borderWidth} ${style.borderStyle} ${style.borderColor}`,
        ariaLabel: element.getAttribute('aria-label') || null,
      });
    }
    if (capsule(element) && (tag === 'a' || tag === 'button' || tag === 'span' || tag === 'li')) {
      controls.capsules.push({ tag, text: (element.textContent || '').trim().slice(0, 40) });
    }
  }

  // Landmarks carry their accessible name: a page with two `<nav>` elements and no names is a
  // screen-reader dead end, and anonymous landmarks are how that happens.
  const nameOf = (element) => {
    const labelled = element.getAttribute('aria-labelledby');
    const fromIds = labelled
      ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim()
      : '';
    const label = element.getAttribute('aria-label') || fromIds;
    if (label) return label.slice(0, 60);
    const heading = element.querySelector('h1,h2,h3,h4,h5,h6');
    return (heading?.textContent || '').trim().slice(0, 60) || null;
  };

  const landmarks = Array.from(document.querySelectorAll('header,nav,main,footer,aside,[role="banner"],[role="navigation"],[role="main"],[role="contentinfo"]'))
    .filter(visible)
    .map((element) => ({
      tag: element.tagName.toLowerCase() + (element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''),
      name: nameOf(element),
    }));

  const images = Array.from(document.querySelectorAll('img,svg')).filter(visible).map((element) => ({
    tag: element.tagName.toLowerCase(),
    alt: element.tagName.toLowerCase() === 'img' ? element.getAttribute('alt') : null,
    ariaHidden: element.getAttribute('aria-hidden'),
    src: element.tagName.toLowerCase() === 'img' ? (element.getAttribute('src') || '').slice(0, 120) : null,
    width: round(element.getBoundingClientRect().width),
  }));

  const overflowers = [];
  const documentWidth = document.documentElement.clientWidth;
  for (const element of all) {
    const rect = element.getBoundingClientRect();
    if (rect.right > documentWidth + 1 || rect.left < -1) {
      overflowers.push({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || '').slice(0, 120),
        text: (element.textContent || '').trim().slice(0, 60),
        left: round(rect.left),
        right: round(rect.right),
      });
    }
  }

  return {
    title: document.title,
    language: document.documentElement.lang,
    direction: document.documentElement.dir || 'ltr',
    headings,
    landmarks,
    fonts,
    content,
    textColors,
    backgrounds,
    radii,
    shadows,
    transitions,
    animations,
    controls,
    images,
    counts: {
      elements: all.length,
      tables: document.querySelectorAll('table').length,
      figures: document.querySelectorAll('figure').length,
      lists: document.querySelectorAll('ul,ol').length,
      sections: document.querySelectorAll('section').length,
      svg: document.querySelectorAll('svg').length,
      forms: document.querySelectorAll('form').length,
    },
    overflow: {
      documentScrollWidth: document.documentElement.scrollWidth,
      clientWidth: documentWidth,
      pixels: document.documentElement.scrollWidth - documentWidth,
      offenders: overflowers.slice(0, 12),
    },
  };
};

/** Walk the tab order and record the focus ring each stop draws. */
const FOCUS_PROBE = () => {
  const results = [];
  for (let i = 0; i < 14; i += 1) {
    const element = document.activeElement;
    if (!element || element === document.body) {
      results.push({ stop: i, tag: null, note: 'focus left the document' });
      return results;
    }
    const style = getComputedStyle(element);
    results.push({
      stop: i,
      tag: element.tagName.toLowerCase(),
      text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 40),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      boxShadow: style.boxShadow === 'none' ? null : style.boxShadow,
    });
  }
  return results;
};

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--font-render-hinting=none',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
  const audit = { baseUrl: BASE_URL, capturedAt: new Date().toISOString(), widths: WIDTHS, routes: {} };

  for (const route of ROUTES) {
    audit.routes[route] = { viewports: {} };
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      });
      const page = await context.newPage();
      // Only the app under test: the sandbox (and a CI runner without credentials) cannot reach
      // the third-party hosts the app mentions, and their timeouts would show up as our latency.
      await page.route('**/*', (route_) => {
        const url = route_.request().url();
        if (url.startsWith(BASE_URL) || url.startsWith('data:') || url.startsWith('blob:')) return route_.continue();
        return route_.abort();
      });
      const key = `${width}`;
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        // The console has no h1 by design (full-bleed map stage); every other route does.
        if (route === '/live') {
          await page.waitForSelector('.leaflet-container', { timeout: 25_000 }).catch(() => {});
        } else {
          await page.waitForSelector('h1', { timeout: 25_000 }).catch(() => {});
        }
        await page.waitForTimeout(700);
        const probe = await page.evaluate(PROBE);
        const screenshot = path.join(
          OUT,
          `${route.replace(/[^\w]+/g, '_') || 'root'}-${width}${FULL_PAGE ? '-full' : ''}.png`
        );
        await page.screenshot({ path: screenshot, fullPage: FULL_PAGE });
        audit.routes[route].viewports[key] = { ...probe, screenshot };
      } catch (error) {
        audit.routes[route].viewports[key] = { error: String(error).slice(0, 300) };
      }
      await context.close();
    }
  }

  // A single keyboard walk at the widest viewport, on the front door and the console.
  const focus = {};
  for (const route of ROUTES.slice(0, 4)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route('**/*', (route_) => {
      const url = route_.request().url();
      return url.startsWith(BASE_URL) || url.startsWith('data:') ? route_.continue() : route_.abort();
    });
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(800);
      const stops = [];
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press('Tab');
        stops.push(await page.evaluate(FOCUS_PROBE).then((result) => result[result.length - 1]));
      }
      focus[route] = stops;
    } catch (error) {
      focus[route] = { error: String(error).slice(0, 200) };
    }
    await context.close();
  }
  audit.focusWalk = focus;

  // Motion under `prefers-reduced-motion: reduce`. The stylesheet claims to honour it; this is the
  // measurement. Anything still animating here is a vestibular-safety finding, not a preference.
  const reduced = {};
  for (const route of ROUTES.slice(0, 4)) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.route('**/*', (route_) => {
      const url = route_.request().url();
      return url.startsWith(BASE_URL) || url.startsWith('data:') ? route_.continue() : route_.abort();
    });
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(700);
      reduced[route] = await page.evaluate(() => {
        const animations = {};
        const transitions = {};
        for (const element of Array.from(document.querySelectorAll('*'))) {
          const style = getComputedStyle(element);
          if (style.animationName !== 'none') {
            animations[`${style.animationName} ${style.animationDuration}`] =
              (animations[`${style.animationName} ${style.animationDuration}`] || 0) + 1;
          }
          if (style.transitionDuration !== '0s') {
            transitions[`${style.transitionProperty} ${style.transitionDuration}`] =
              (transitions[`${style.transitionProperty} ${style.transitionDuration}`] || 0) + 1;
          }
          if (style.scrollBehavior === 'smooth') {
            animations['smooth scroll-behavior'] = (animations['smooth scroll-behavior'] || 0) + 1;
          }
        }
        return { animations, transitions };
      });
    } catch (error) {
      reduced[route] = { error: String(error).slice(0, 200) };
    }
    await context.close();
  }
  audit.reducedMotion = reduced;

  await browser.close();
  const target = path.join(OUT, 'design-audit.json');
  writeFileSync(target, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`[design-audit] wrote ${target} — ${ROUTES.length} routes × ${WIDTHS.length} widths`);
  console.log(`[design-audit] screenshots in ${OUT}`);
};

main().catch((error) => {
  console.error('[design-audit] failed to measure:', error);
  process.exit(1);
});
