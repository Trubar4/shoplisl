import { Page, BrowserContext } from '@playwright/test';

/**
 * Network helper for simulating offline/online scenarios
 */

/**
 * Simulate going offline
 */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  // Also dispatch offline event to the page
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

/**
 * Simulate going online
 */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  // Also dispatch online event to the page
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
}

/**
 * Check if page is offline
 */
export async function isOffline(page: Page): Promise<boolean> {
  return await page.evaluate(() => !navigator.onLine);
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page, timeout: number = 2000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Mock Firebase responses for testing
 */
export async function mockFirebaseResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: any
): Promise<void> {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Block Firebase requests (for offline testing)
 */
export async function blockFirebaseRequests(page: Page): Promise<void> {
  await page.route('**/*firestore*/**', (route) => route.abort());
  await page.route('**/*firebase*/**', (route) => route.abort());
}

/**
 * Unblock all routes
 */
export async function unblockAllRequests(page: Page): Promise<void> {
  await page.unroute('**/*');
}
