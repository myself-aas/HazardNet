/**
 * Forecast UX (Phase 7). Pins the stored-forecast lookup and the `/` vs `/live`
 * split so a visual restyle cannot restore raster upload or treat idle as
 * “unavailable”.
 */
import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

test.describe('Forecast UX', () => {
  test.describe.configure({ timeout: 120_000 });

  test('front door is editorial and does not host the map', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
  });

  test('console at /live hosts the map', async ({ page }) => {
    await page.goto(`${BASE}/live`);
    await waitForAppShell(page);
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
  });

  test('lookup starts idle and never offers raster upload', async ({ page }) => {
    await page.goto(`${BASE}/upload`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('stored-forecast-idle')).toBeVisible();
    await expect(page.getByTestId('stored-forecast-idle')).not.toContainText(/unavailable/i);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /upload raster|choose file|run inference/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /load stored forecast/i })).toBeVisible();
  });

  test('lookup does not overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${BASE}/upload`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page, '/upload @360px');
  });
});
