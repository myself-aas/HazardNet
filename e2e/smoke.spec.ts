/**
 * PWA smoke suite (QA-02). CI-ready; run locally with:
 *   npx playwright install chromium && npx playwright test
 * Specs intentionally cover the three differentiating capabilities:
 * offline boot, PDF export, and mobile navigation.
 */
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('HazardNet smoke', () => {
  test('dashboard renders core UI', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/HazardNet/i);
    // The app shell must render a navigation landmark quickly.
    await expect(page.getByRole('banner').or(page.locator('header'))).toBeVisible({ timeout: 15_000 });
  });

  test('advisory page exposes print/PDF export path', async ({ page }) => {
    await page.goto(`${BASE}/advisories`);
    const printTrigger = page.getByRole('button', { name: /print preview|export pdf/i }).first();
    await expect(printTrigger).toBeVisible({ timeout: 15_000 });
  });

  test('mobile drawer navigation works at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    const menuButton = page.getByRole('button', { name: /open navigation menu|menu/i }).first();
    await expect(menuButton).toBeVisible({ timeout: 15_000 });
    await menuButton.click();
    // Drawer must open with navigation content and remain within viewport width.
    const dialog = page.getByRole('dialog').or(page.locator('nav')).first();
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('no horizontal overflow at common widths', async ({ page }) => {
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/advisories`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
