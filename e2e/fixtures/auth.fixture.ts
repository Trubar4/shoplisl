import { test as base, expect as baseExpect, Page } from '@playwright/test';

/**
 * E2E Test Fixture with Auto-Login
 *
 * Enables test mode in the app to bypass Google Sign-In
 */

export const test = base.extend({
  page: async ({ page }, use) => {
    // Enable test mode before navigating to app
    await page.addInitScript(() => {
      (window as any).E2E_TEST_MODE = true;
    });

    await use(page);
  },
});

export const expect = baseExpect;
