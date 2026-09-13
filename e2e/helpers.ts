/**
 * Shared helpers for the HazardNet E2E suite.
 *
 * The suite previously failed wholesale because of three avoidable patterns:
 *
 *  1. `locator.isVisible()` used as a *gate*. It does not auto-wait, so on a
 *     lazily-hydrated route it returns false before the chunk has rendered and
 *     the whole `if` body silently never runs (or, worse, a dangling
 *     `waitForEvent` rejects with "Test ended"). Every precondition here uses
 *     `expect(...).toBeVisible()`, which retries.
 *  2. Ambiguous locators. `getByText(/agricultural/i)` and friends resolve to
 *     several nodes and blow up with a strict-mode violation. Prefer roles,
 *     `data-testid`s and `.first()`.
 *  3. `waitForLoadState('networkidle')`. The app holds a Firebase Realtime
 *     Database websocket open, so the network is never idle and the wait burns
 *     the whole test timeout. Wait for the content instead.
 */
import { expect, type Page } from '@playwright/test';

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';

/**
 * The full desktop navigation bar only renders from Tailwind's `xl` breakpoint
 * (1280px) because it measures ~1180px. Below that the compact bar is shown and
 * the auth links live inside the navigation drawer, so tests that start from
 * the home page must open it first.
 */
export async function clickAuthLink(page: Page, kind: 'signin' | 'signup'): Promise<void> {
  // The header is eager (not lazy), so once it is on screen the auth links are
  // rendered too and `isVisible()` below is a meaningful branch rather than a
  // race against hydration.
  await waitForAppShell(page);

  const navbarLink = page.getByTestId(`navbar-${kind}-link`);
  if (await navbarLink.isVisible()) {
    await navbarLink.click();
    return;
  }

  await page.getByRole('button', { name: /open navigation menu/i }).click();
  const drawer = page.getByTestId('menu-drawer');
  await expect(drawer).toBeVisible();
  await drawer.getByTestId(`drawer-${kind}-link`).click();
}

/** Horizontal overflow of the document, in CSS pixels. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

/**
 * Deterministic "the shell is up" wait: the sticky header is rendered eagerly,
 * so its presence means React has mounted and the router has resolved.
 */
export async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.locator('header').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Assert the page never scrolls sideways. A single overflowing element anywhere
 * in the tree is a real mobile defect, so this is intentionally strict.
 */
export async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const overflow = await horizontalOverflow(page);
  expect(overflow, `horizontal overflow on ${context}`).toBeLessThanOrEqual(1);
}
