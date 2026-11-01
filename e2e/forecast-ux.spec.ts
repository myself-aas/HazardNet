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

  test('daily district link fails honestly without an approved run, in English and Bangla', async ({ page }) => {
    // The built frontend in CI has no daily artifact or API runtime. Explicitly
    // answer both reads so this checks the UI contract, not Vite's 502/HTML fallback.
    await page.route('**/api/v1/advisories?*', (route) => route.fulfill({
      status: 503, contentType: 'application/json', body: '{"error":"no approved daily run"}',
    }));
    await page.route('**/data/daily-advisories-v1.json', (route) => route.fulfill({ status: 404 }));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${BASE}/forecast/district/kurigram`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: /Kurigram district outlook/i }))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Daily outlook unavailable' })).toBeVisible();
    await expect(page.getByText(/Unknown does not mean safe/)).toBeVisible();
    await expect(page.locator('#daily-outlook-days')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, '/forecast/district/kurigram @360px');

    const toggle = page.getByTestId('language-toggle');
    await toggle.getByRole('button', { name: 'বাংলা' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn-BD');
    await expect(page.getByRole('heading', { name: 'দিনভিত্তিক পূর্বাভাস পাওয়া যায়নি' })).toBeVisible();
    await expect(page.locator('#daily-outlook-days')).toHaveCount(0);
  });

  test('lookup district and horizon are keyboard reachable', async ({ page }) => {
    await page.goto(`${BASE}/upload`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    // The lookup <section> is also named with “District …”, so getByLabel(/district/)
    // is ambiguous. Target the labelled controls by id.
    const district = page.locator('#lookup-district');
    await district.focus();
    await expect(district).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#lookup-horizon')).toBeFocused();
  });
});
