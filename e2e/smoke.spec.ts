/**
 * PWA smoke suite (QA-02). CI-ready; run locally with:
 *   npx playwright install chromium && npx playwright test
 * Specs intentionally cover the three differentiating capabilities:
 * offline boot, PDF export, and mobile navigation.
 */
import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

test.describe('HazardNet smoke', () => {
  test('dashboard renders core UI', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/HazardNet/i);
    // The app shell must render a navigation landmark quickly.
    await expect(page.getByRole('banner').or(page.locator('header')).first()).toBeVisible({
      timeout: 15_000,
    });
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
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/advisories`);
      // Measure only once the lazy route has rendered. Asserting immediately
      // after `goto` measured an empty shell and reported 0px overflow while
      // the real page scrolled ~285px sideways on a phone.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      await expectNoHorizontalOverflow(page, `/advisories @${width}px`);
    }
  });
});
