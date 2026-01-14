import { test as base, Page } from '@playwright/test';

/**
 * Authentication fixture for ShopLisl E2E tests
 * Provides helper methods for logging in and managing test users
 */

export type AuthFixtures = {
  authenticatedPage: Page;
};

/**
 * Test user credentials
 * These should match test accounts in Firebase
 */
export const TEST_USERS = {
  user1: {
    email: 'test-user-1@shoplisl.test',
    password: 'TestPassword123!',
    displayName: 'Test User 1',
  },
  user2: {
    email: 'test-user-2@shoplisl.test',
    password: 'TestPassword123!',
    displayName: 'Test User 2',
  },
};

/**
 * Extended test with authentication fixture
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to the app
    await page.goto('/');

    // Check if we need to sign in
    const signInButton = page.getByRole('button', { name: /sign in|anmelden/i });
    if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click sign in
      await signInButton.click();

      // Wait for auth dialog/page
      await page.waitForTimeout(1000);

      // Fill in credentials (adjust selectors based on your auth UI)
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill(TEST_USERS.user1.email);
        await page.locator('input[type="password"]').fill(TEST_USERS.user1.password);
        await page.getByRole('button', { name: /sign in|continue|weiter/i }).click();
      }

      // Wait for successful authentication
      await page.waitForTimeout(2000);
    }

    // Provide the authenticated page to the test
    await use(page);

    // Cleanup: sign out after test
    // This is optional - uncomment if needed
    // await signOut(page);
  },
});

/**
 * Helper function to sign in a user
 */
export async function signIn(page: Page, user: typeof TEST_USERS.user1): Promise<void> {
  await page.goto('/');

  const signInButton = page.getByRole('button', { name: /sign in|anmelden/i });
  if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signInButton.click();
    await page.waitForTimeout(1000);

    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill(user.email);
      await page.locator('input[type="password"]').fill(user.password);
      await page.getByRole('button', { name: /sign in|continue|weiter/i }).click();
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Helper function to sign out
 */
export async function signOut(page: Page): Promise<void> {
  // Adjust selector based on your UI
  const userMenu = page.getByRole('button', { name: /user menu|profil/i });
  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await userMenu.click();
    await page.getByRole('button', { name: /sign out|abmelden/i }).click();
    await page.waitForTimeout(1000);
  }
}

export { expect } from '@playwright/test';
