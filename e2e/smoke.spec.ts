/**
 * PWA smoke suite (QA-02). CI-ready; run locally with:
 *   npx playwright install chromium && npx playwright test
 * Specs intentionally cover the three differentiating capabilities:
 * offline boot, PDF export, and mobile navigation.
 */
import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

test.describe('HazardNet smoke', () => {
  // This file's tests boot a full SPA several times each, and on a loaded CI runner (four
  // workers, cold caches) the *fixture* setup — browser launch and first paint — was what ran
  // out of the 60 s default. Set the budget for the file rather than per test, so it covers
  // setup as well as the body.
  test.describe.configure({ timeout: 120_000 });

  test('front door renders core UI', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/HazardNet/i);
    // The app shell must render a navigation landmark quickly.
    await expect(page.getByRole('banner').or(page.locator('header')).first()).toBeVisible({
      timeout: 15_000,
    });
    // `/` is the editorial front door; the console is `/live` (PR #29).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('the console boots at /live', async ({ page }) => {
    await page.goto(`${BASE}/live`);
    await waitForAppShell(page);
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
  });

  test('advisory page exposes print/PDF export path', async ({ page }) => {
    await page.goto(`${BASE}/advisories`);
    const printTrigger = page.getByRole('button', { name: /print preview|export pdf/i }).first();
    await expect(printTrigger).toBeVisible({ timeout: 20_000 });
  });

  test('mobile drawer navigation works at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await waitForAppShell(page);

    const menuButton = page.getByRole('button', { name: /open navigation menu/i });
    await expect(menuButton).toBeVisible({ timeout: 15_000 });
    await menuButton.click();

    // The drawer is a real dialog (role="dialog" + aria-modal), which is also
    // what makes it discoverable to assistive tech. A bare `nav` locator used
    // to resolve to the *hidden* desktop navigation and fail.
    const drawer = page.getByTestId('menu-drawer');
    await expect(drawer).toBeVisible();

    // The panel slides in on a spring, so measure only once it has settled —
    // reading the box mid-animation reports a negative x.
    await expect
      .poll(async () => (await drawer.boundingBox())?.x, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(0);

    // Drawer must stay inside the viewport — no sideways page scroll.
    const box = await drawer.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);

    // …and it must be dismissible from inside the panel.
    await drawer.getByTestId('menu-drawer-close').click();
    await expect(drawer).toBeHidden({ timeout: 10_000 });
  });

  test('no horizontal overflow at common widths', async ({ page }) => {
    // Four very different pages: the editorial front door and the console it links to
    // (added with the PR #29 split), the advisory screen (cards, chips, controls) and the
    // generated validation page (tables, added with Phase 9 §8.1 — a wide table is exactly
    // the kind of content that quietly widens a phone page).
    //
    // One page load per route, then four viewport widths measured on the *same* loaded page.
    // That is what the assertion is about — a reflow — and it removes the failure mode CI hit
    // on 2026-09-18: sixteen full navigations inside one test, one of which came back
    // `net::ERR_ABORTED` and burned the whole budget (`Test timeout of 60000ms exceeded`, with
    // no measured overflow reported). `domcontentloaded` stops the navigation waiting on a
    // `load` event these SPA pages fire late, and readiness is asserted explicitly below, on
    // the element the measurement actually needs, before any width is measured.
    for (const path of ['/', '/live', '/advisories', '/model-performance']) {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      // Measure only once the lazy route has rendered. Asserting immediately
      // after `goto` measured an empty shell and reported 0px overflow while
      // the real page scrolled ~285px sideways on a phone. The console at
      // `/live` is the exception to the <h1> wait: its stage is a full-bleed
      // map with no document heading, so its own readiness signal is the map.
      if (path === '/live') {
        await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      }
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        // Let the media queries and any resize listener settle before measuring; a resize
        // that has not been laid out yet measures the previous width's boxes.
        await page.waitForTimeout(150);
        await expectNoHorizontalOverflow(page, `${path} @${width}px`);
      }
    }
  });
});
