/**
 * Mobile responsiveness suite (2026-09-17).
 *
 * Locks in the two fixes from the mobile UX pass plus the ui-ux-pro-max
 * pre-delivery contract ("Tested on 375px (small phone)… no horizontal
 * scroll… fixed elements must not obscure content"):
 *
 *  1. Every public route renders its shell and never scrolls sideways at
 *     375px (small phone) and 768px (tablet).
 *  2. The AI Advisor is full-screen on phones and does not sit under the
 *     sticky header (the old top-12 window overlapped the h-14 header band).
 *  3. Overlays portaled out of the navbar (menu drawer, command palette)
 *     cover the header instead of sliding beneath it.
 *
 * Runs in both playwright projects (chromium-desktop + chromium-mobile);
 * the explicit setViewportSize calls make the width deterministic either way.
 */
import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

/** Public routes that must render the app shell (header + main). */
const PUBLIC_ROUTES = [
  '/',
  '/home/overview',
  '/forecast/overview',
  '/advisories',
  '/analytics',
  '/blogs',
  '/docs',
  '/download',
  '/about',
  '/contact',
  '/use-cases',
  '/upload',
];

test.describe('Mobile responsiveness @375px', () => {
  for (const width of [375, 768]) {
    test(`no horizontal scroll on public routes @${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      for (const route of PUBLIC_ROUTES) {
        await page.goto(`${BASE}${route}`);
        await waitForAppShell(page);
        // Lazy route chunks paint after the shell; wait for real content.
        await page.waitForTimeout(400);
        await expectNoHorizontalOverflow(page, `${route} @${width}px`);
      }
    });
  }

  test('AI advisor opens as a full-screen sheet that clears the header', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // The advisor only renders on subpages (not the full-screen map home).
    await page.goto(`${BASE}/advisories`);
    await waitForAppShell(page);

    const fab = page.getByRole('button', { name: /open ai advisor chat/i });
    await expect(fab).toBeVisible({ timeout: 15_000 });
    await fab.click();

    const chat = page.getByRole('dialog', { name: /hazardnet ai advisor chat/i });
    await expect(chat).toBeVisible();

    // Full-screen sheet: spans the viewport width and starts at the very top,
    // so no slice of the page header is half-covered behind it. The sheet
    // enters on a spring (scale 0.85→1 with overshoot), so poll until the
    // geometry has settled instead of sampling mid-animation.
    await expect
      .poll(
        async () => {
          const b = await chat.boundingBox();
          if (!b) return false;
          return Math.abs(b.x) <= 0.5 && b.width >= 374 && b.y <= 1 && b.y >= -1;
        },
        { timeout: 10_000 }
      )
      .toBe(true);

    // …and it is dismissible.
    await chat.getByRole('button', { name: /close assistant/i }).click();
    await expect(chat).toBeHidden({ timeout: 10_000 });
    // The header must be fully visible again afterwards.
    await expect(page.locator('header').first()).toBeVisible();
  });

  test('menu drawer paints above the sticky header, not beneath it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/advisories`);
    await waitForAppShell(page);

    await page.getByRole('button', { name: /open navigation menu/i }).click();
    const drawer = page.getByTestId('menu-drawer');
    await expect(drawer).toBeVisible();

    // Wait for the slide-in spring to settle (visible() can resolve while the
    // panel is still off-screen at x < 0).
    await expect
      .poll(async () => (await drawer.boundingBox())?.x, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(-0.5);

    // The portaled drawer (z-[10002]) must stack above the header (z-40):
    // compare paint order via elementFromPoint at the header's center.
    const above = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return false;
      const r = header!.getBoundingClientRect();
      const el = document.elementFromPoint(
        r.left + r.width / 2,
        Math.max(r.top + 4, 8)
      );
      return !!el?.closest('[data-testid="menu-drawer"]');
    });
    expect(above, 'drawer backdrop should cover the header').toBe(true);

    await drawer.getByTestId('menu-drawer-close').click();
    await expect(drawer).toBeHidden({ timeout: 10_000 });
  });

  test('command palette covers the header while open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/advisories`);
    await waitForAppShell(page);

    await page.getByTestId('district-search-trigger').first().click();
    const palette = page.getByTestId('district-search-modal');
    await expect(palette).toBeVisible({ timeout: 10_000 });

    const above = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return false;
      const r = header!.getBoundingClientRect();
      const el = document.elementFromPoint(
        r.left + r.width / 2,
        Math.max(r.top + 4, 8)
      );
      // The palette overlay (any fixed element that is not the header bar).
      return !!el && !el.closest('header');
    });
    expect(above, 'palette overlay should dim the header').toBe(true);
  });

  test('primary icon controls meet the 44px touch-target minimum', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/advisories`);
    await waitForAppShell(page);

    const size = await page
      .getByTestId('district-search-trigger')
      .first()
      .evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    expect(size.w, 'search trigger width').toBeGreaterThanOrEqual(44);
    expect(size.h, 'search trigger height').toBeGreaterThanOrEqual(44);
  });
});
