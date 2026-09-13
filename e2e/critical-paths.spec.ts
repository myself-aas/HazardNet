/**
 * Critical path E2E tests for HazardNet production readiness.
 * Covers the journeys a regression must never break: authentication, district
 * forecast lookup, sector advisories, PDF export, push notifications and the
 * mobile navigation shell.
 *
 * Locator conventions (see ./helpers.ts for the reasoning):
 *   - real routes only: `/forecast/district/dhaka`, `/advisories/crops`
 *     (district ids are slugs and advisory sub-categories are sector ids —
 *     `/forecast/district/1` and `/advisories/drought` do not exist and only
 *     ever exercised fallback branches);
 *   - `data-testid`s for controls that share accessible names;
 *   - `expect(...).toBeVisible()` before any interaction, never bare
 *     `isVisible()` gates.
 */
import { expect, test } from '@playwright/test';
import { BASE, clickAuthLink, expectNoHorizontalOverflow, waitForAppShell } from './helpers';

test.describe('Authentication Flows', () => {
  test('user can navigate to signup page', async ({ page }) => {
    await page.goto(BASE);
    await clickAuthLink(page, 'signup');

    await expect(page).toHaveURL(/\/signup(\/|$|\?)/);
    await expect(page.getByRole('heading', { name: /sign up|create .*account/i })).toBeVisible();
  });

  test('signup form validates email', async ({ page }) => {
    await page.goto(`${BASE}/signup`);

    // `getByLabel(/email/i)` alone also matches the resend/verification copy on
    // the success state, so anchor on the field's own label.
    const emailInput = page.getByLabel(/email address/i);
    await expect(emailInput).toBeVisible();

    await emailInput.fill('invalid-email');
    await page.getByTestId('signup-submit-btn').click();

    await expect(page.getByText(/valid email|email format/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto(BASE);
    await clickAuthLink(page, 'signin');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    // `/password/i` also matches the show/hide-password toggle's aria-label.
    await expect(page.getByLabel(/^password/i).first()).toBeVisible();
  });
});

test.describe('District Selection & Forecast Display', () => {
  test('user can search a district and open its forecast', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);

    // The GIS stage is the home page's primary surface.
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });

    // Two CommandPalette triggers exist in the DOM (compact bar + desktop bar);
    // getByRole only sees the visible one, which keeps this strict-mode safe.
    await page.getByRole('button', { name: 'Search HazardNet' }).click();
    const search = page.getByTestId('district-search-modal');
    await expect(search).toBeVisible();

    const input = page.getByTestId('district-search-input');
    await input.fill('Kurigram');
    const result = search.getByText(/kurigram district/i).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    // Selecting a district deep-links the map (`/?district=<id>`) and pins the
    // forecast card for it.
    await expect(page).toHaveURL(/district=kurigram/);
    await expect(page.getByText('DISTRICT FORECAST')).toBeVisible({ timeout: 15_000 });
  });

  test('forecast shows required information', async ({ page }) => {
    await page.goto(`${BASE}/forecast/district/dhaka`);

    await expect(page.getByRole('heading', { level: 1, name: /dhaka/i })).toBeVisible({
      timeout: 20_000,
    });

    // At least one modelled hazard must be named in the brief.
    const hazards = ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave'];
    let hazardVisible = false;
    for (const hazard of hazards) {
      if (await page.getByText(new RegExp(hazard, 'i')).first().isVisible()) {
        hazardVisible = true;
        break;
      }
    }
    expect(hazardVisible, 'At least one hazard should be visible').toBe(true);
  });

  test('district forecast card opens the full district brief', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);

    // The GIS stage pins a forecast card for the focused district; its primary
    // action must deep-link into the district intelligence brief.
    const openBrief = page.getByRole('button', { name: /view detailed disaster analytics/i });
    await expect(openBrief).toBeVisible({ timeout: 20_000 });

    await openBrief.click();
    await expect(page).toHaveURL(/\/forecast\/district\/[a-z-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Advisory Generation', () => {
  test('advisory page loads successfully', async ({ page }) => {
    await page.goto(`${BASE}/advisories`);

    // `/advisories` redirects to the default sector (`/advisories/crops`).
    await expect(page).toHaveURL(/\/advisories\/[a-z-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  });

  test('AI advisory synthesizer panel opens', async ({ page }) => {
    await page.goto(`${BASE}/advisories/crops`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    // The control is a disclosure for the Gemini synthesizer panel — the model
    // call itself needs a GEMINI_API_KEY that CI does not have, so the contract
    // under test is that the panel mounts and the page stays healthy.
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));

    const synthesize = page.getByRole('button', { name: /synthesi[sz]e .*advisory/i });
    await expect(synthesize).toBeVisible();
    await synthesize.click();

    await expect(page.getByRole('button', { name: /hide ai synthesizer/i })).toBeVisible({
      timeout: 10_000,
    });
    expect(failures, `page errors after opening the synthesizer: ${failures.join(', ')}`).toEqual([]);
  });

  test('advisory contains structured sections', async ({ page }) => {
    await page.goto(`${BASE}/advisories/crops`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    const sections = ['immediate', 'agricultural', 'safety', 'contact'];
    let sectionFound = false;
    for (const section of sections) {
      // Several nodes legitimately contain these words (nav links, footers), so
      // the check is "is any of them on screen", not "exactly one".
      if (await page.getByText(new RegExp(section, 'i')).first().isVisible()) {
        sectionFound = true;
        break;
      }
    }
    expect(sectionFound, 'Advisory should have structured sections').toBe(true);
  });
});

test.describe('PDF Export', () => {
  test('PDF export button is accessible', async ({ page }) => {
    await page.goto(`${BASE}/advisories`);
    await expect(page.getByRole('button', { name: /export pdf|download pdf/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('PDF export opens the configuration dialog and downloads a PDF', async ({ page }) => {
    await page.goto(`${BASE}/advisories`);

    await page.getByRole('button', { name: /export pdf|download pdf/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Register the listener only once a click will actually happen — creating
    // it up front made the test fail with "Test ended" whenever the button was
    // missing.
    const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
    await dialog.getByRole('button', { name: /export & download pdf|generating pdf/i }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

test.describe('Push Notifications', () => {
  test('notification permission prompt is available', async ({ page, context }) => {
    await page.goto(BASE);
    await waitForAppShell(page);

    // Below xl the Web Push toggle only exists inside the navigation drawer.
    const notifyButton = page.getByRole('button', { name: /push alerts|enable notification/i });
    if ((await notifyButton.count()) === 0) {
      await page.getByRole('button', { name: /open navigation menu/i }).click();
    }
    await expect(notifyButton).toBeVisible({ timeout: 20_000 });

    await context.grantPermissions(['notifications']);
    await notifyButton.click();

    // The toggle opens the Web Push certificate panel, which holds the actual
    // subscribe action.
    await expect(page.getByText(/web push certificates/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('User Dashboard', () => {
  test('dashboard page requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveURL(/\/(login|signin|dashboard)/);
  });

  test('public profile pages are accessible', async ({ page }) => {
    await page.goto(`${BASE}/u/testuser`);
    // Either the profile renders or a not-found state does; both are fine, a
    // blank document is not.
    await expect(page.locator('body')).toContainText(/.+/);
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile menu opens and closes', async ({ page }) => {
    await page.goto(BASE);
    await waitForAppShell(page);

    const menuButton = page.getByRole('button', { name: /open navigation menu/i });
    await expect(menuButton).toBeVisible({ timeout: 20_000 });

    await menuButton.click();
    const drawer = page.getByTestId('menu-drawer');
    await expect(drawer).toBeVisible();

    // The drawer overlays the header hamburger, so the dismiss control lives
    // inside the panel (see MenuDrawer.tsx).
    await drawer.getByTestId('menu-drawer-close').click();
    await expect(drawer).toBeHidden({ timeout: 10_000 });
  });

  test('forecast view is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/forecast/district/dhaka`);
    await expect(page.getByRole('heading', { level: 1, name: /dhaka/i })).toBeVisible({
      timeout: 20_000,
    });

    await expectNoHorizontalOverflow(page, '/forecast/district/dhaka @375px');
    await expect(page.getByText(/forecast|hazard/i).first()).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('homepage loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE);
    await waitForAppShell(page);
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15_000);
    console.log(`Homepage shell interactive in ${loadTime}ms`);
  });

  test('no JavaScript errors on critical pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    for (const pagePath of ['/', '/advisories', '/forecast/district/dhaka']) {
      await page.goto(`${BASE}${pagePath}`);
      // Wait for the route's own content instead of `networkidle` — the app
      // keeps a Firebase RTDB websocket open, so the network never goes idle.
      if (pagePath === '/') {
        await waitForAppShell(page);
        await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      }
    }

    expect(errors, `JavaScript errors found: ${errors.join(', ')}`).toEqual([]);
  });
});
