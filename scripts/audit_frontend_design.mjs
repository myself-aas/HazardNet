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

  // Contrast and touch targets: measurable, and the two things a hazard dashboard gets wrong
  // when it grows a design system faster than it grows a test suite.
  // Tailwind v4 emits `oklch()` and `oklab()`, the HDS tokens emit `rgb()`, and a contrast
  // check that understands only one of them reports white-on-white for every dark panel. The
  // first pass of this probe did exactly that; the conversion below is why it no longer does.
  const oklabToRgb = (L, a, b, alpha) => {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const channel = (linear) => {
      const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    };
    return {
      r: channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      g: channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      b: channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      a: alpha,
    };
  };
  const parseColor = (value) => {
    if (!value) return null;
    const rgb = value.match(/rgba?\(([^)]+)\)/);
    if (rgb) {
      const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    const oklch = value.match(/oklch\(([^)]+)\)/);
    if (oklch) {
      const parts = oklch[1].split(/[\s/]+/).filter(Boolean);
      const L = parseFloat(parts[0]);
      const C = parseFloat(parts[1]);
      const H = parseFloat(parts[2]);
      const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
      if ([L, C, H].some(Number.isNaN)) return null;
      const radians = (H * Math.PI) / 180;
      return oklabToRgb(L, C * Math.cos(radians), C * Math.sin(radians), alpha);
    }
    const oklab = value.match(/oklab\(([^)]+)\)/);
    if (oklab) {
      const parts = oklab[1].split(/[\s/]+/).filter(Boolean);
      const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
      const [L, a, b] = parts.slice(0, 3).map(parseFloat);
      if ([L, a, b].some(Number.isNaN)) return null;
      return oklabToRgb(L, a, b, alpha);
    }
    return null;
  };
  const luminance = ({ r, g, b }) => {
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const blend = (front, back) => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  });
  const backgroundOf = (element) => {
    let node = element;
    let result = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    while (node && node !== document.documentElement.parentElement) {
      const parsed = parseColor(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.a > 0) layers.push(parsed);
      node = node.parentElement;
    }
    for (let i = layers.length - 1; i >= 0; i -= 1) result = blend(layers[i], result);
    return result;
  };
  const sampleText = Array.from(document.querySelectorAll('p,li,td,th,h1,h2,h3,h4,a,span,button,label,dd,dt'))
    .filter((element) => {
      if (!visible(element)) return false;
      const text = Array.from(element.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!text.length) return false;
      return parseFloat(getComputedStyle(element).fontSize) > 0;
    });
  const contrast = { checked: 0, belowAA: [], belowAAA: 0, minimum: 21 };
  for (const element of sampleText.slice(0, 900)) {
    const style = getComputedStyle(element);
    const foreground = parseColor(style.color);
    if (!foreground) continue;
    const background = backgroundOf(element);
    const fg = blend(foreground, background);
    const l1 = luminance(fg);
    const l2 = luminance(background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    contrast.checked += 1;
    contrast.minimum = Math.min(contrast.minimum, round(ratio));
    if (ratio < 7) contrast.belowAAA += 1;
    if (ratio < need) {
      contrast.belowAA.push({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || '').trim().slice(0, 50),
        ratio: round(ratio),
        need,
        color: style.color,
        background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
        size: `${size}px/${weight}`,
      });
    }
  }

  const touchTargets = [];
  for (const element of Array.from(document.querySelectorAll('a,button,[role="button"],input,select,textarea'))) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const label = (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40);
    // Inline links inside prose are exempt from the 24x24 rule only in the WCAG 2.2 sense of
    // "in a sentence"; a control a thumb has to hit is not. Flag interactive controls below 24px
    // in either axis, with 44px reported separately as the mobile-comfort target.
    if (rect.width < 24 || rect.height < 24) {
      touchTargets.push({
        tag: element.tagName.toLowerCase(),
        label,
        size: `${round(rect.width)}x${round(rect.height)}`,
        inline: element.tagName === 'A' && element.closest('p,li,td'),
      });
    }
  }

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
    contrast,
    touchTargets,
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

  // A keyboard walk at the widest viewport, on the four routes that carry the header and drawer.
  //
  // Whether a control is *visible when focused* cannot be answered by reading the focused element's
  // own `outline`: a treatment may live on an ancestor (an underline sibling, a wrapper that changes
  // colour). The first version of this probe read only the element and reported ten header controls
  // with "no focus indicator"; the diff-based measurement below showed every one of them draws a
  // visible change, so the naive version was measuring the probe, not the site. Each stop is
  // therefore captured twice — focused and unfocused — and the whole four-level ancestor chain is
  // compared. A stop with no difference anywhere is the finding.
  const FOCUS_PROBE = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const read = (node) => {
      const s = getComputedStyle(node);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor,
        s.borderBottomColor, s.backgroundColor, s.textDecorationLine, s.color].join('|');
    };
    const chain = [read(el)];
    let node = el.parentElement;
    for (let i = 0; i < 3 && node && node !== document.body; i += 1) {
      chain.push(read(node));
      node = node.parentElement;
    }
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
    return { marker: `${el.tagName}|${name}`, tag: el.tagName.toLowerCase(), text: name, focusedChain: chain };
  };
  const FOCUS_UNFOCUSED = (markers) => {
    const read = (node) => {
      const s = getComputedStyle(node);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor,
        s.borderBottomColor, s.backgroundColor, s.textDecorationLine, s.color].join('|');
    };
    const map = {};
    for (const marker of markers) {
      const el = Array.from(document.querySelectorAll('a,button,[role="button"],input,select'))
        .find((candidate) => `${candidate.tagName}|${(candidate.getAttribute('aria-label') || candidate.textContent || '').trim().slice(0, 40)}` === marker);
      if (!el) { map[marker] = null; continue; }
      const chain = [read(el)];
      let node = el.parentElement;
      for (let i = 0; i < 3 && node && node !== document.body; i += 1) {
        chain.push(read(node));
        node = node.parentElement;
      }
      map[marker] = chain;
    }
    return map;
  };

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
        await page.waitForTimeout(90);
        const stop = await page.evaluate(FOCUS_PROBE);
        if (stop) stops.push(stop);
      }
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await page.waitForTimeout(200);
      const unfocused = await page.evaluate(FOCUS_UNFOCUSED, stops.map((stop) => stop.marker));
      focus[route] = stops.map((stop) => {
        const before = unfocused[stop.marker];
        const changed = before ? stop.focusedChain.some((value, index) => value !== before[index]) : null;
        return {
          tag: stop.tag,
          text: stop.text,
          outline: stop.focusedChain[0].split('|').slice(0, 3).join(' '),
          visibleIndicator: changed,
        };
      });
      focus[`${route}#summary`] = {
        stops: focus[route].length,
        withoutIndicator: focus[route].filter((stop) => stop.visibleIndicator === false).map((stop) => `${stop.tag}:${stop.text}`),
      };
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
