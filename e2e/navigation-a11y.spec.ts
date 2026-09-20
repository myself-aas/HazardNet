/**
 * Navigation and zoom accessibility (Phase 7). The skip link, language document
 * attribute, and 200%/400% reflow are the defects that a visual restyle most
 * easily reintroduces.
 */
import { expect, test } from '@playwright/test';
import { BASE, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

test.describe('Navigation a11y', () => {
  test.describe.configure({ timeout: 120_000 });

  test('skip link is the first focusable control and reaches main', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content, main').first()).toBeVisible();
  });

  test('document language is set', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang === 'en' || lang === 'bn-BD' || lang === 'bn').toBeTruthy();
  });

  test('mobile drawer is a labelled dialog', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await waitForAppShell(page);
    const menuButton = page.getByRole('button', { name: /open navigation menu/i });
    await expect(menuButton).toBeVisible({ timeout: 15_000 });
    await menuButton.click();
    const drawer = page.getByTestId('menu-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden({ timeout: 10_000 });
  });

  test('200% and 400% zoom do not force horizontal overflow on the front door', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    for (const zoom of [2, 4]) {
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
      }, zoom);
      await page.waitForTimeout(150);
      await expectNoHorizontalOverflow(page, `/ @ zoom ${zoom * 100}%`);
    }
  });

  test('200% zoom does not force overflow on lookup or alerts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of ['/upload', '/alerts']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
      await page.waitForTimeout(150);
      await expectNoHorizontalOverflow(page, `${route} @ zoom 200%`);
      await page.evaluate(() => {
        document.documentElement.style.zoom = '1';
      });
    }
  });

  test('language toggle writes html lang', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);
    const toggle = page.getByTestId('language-toggle').first();
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    const current = await page.locator('html').getAttribute('lang');
    if (current === 'en') {
      const bengali = page.getByRole('button', { name: 'বাংলা' });
      if (await bengali.count()) {
        await bengali.click();
      } else {
        await toggle.click();
      }
      await expect(page.locator('html')).toHaveAttribute('lang', /bn/);
    } else {
      const english = page.getByRole('button', { name: 'English' });
      if (await english.count()) {
        await english.click();
      } else {
        await toggle.click();
      }
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
  });
});
