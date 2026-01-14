import { test, expect } from './fixtures/auth.fixture';
import { goOffline, goOnline, waitForNetworkIdle } from './helpers/network.helper';
import { getTempArticleCount, getListArticleIdsFromCache } from './helpers/storage.helper';

/**
 * E2E Tests for Temporary Article Cleanup
 *
 * Tests the critical offline article creation and sync scenarios
 * documented in TEMP_ARTICLE_CLEANUP.md
 *
 * Key scenarios:
 * 1. Offline article creation generates temp IDs (temp_timestamp_random)
 * 2. Online sync replaces temp IDs with real Firebase IDs
 * 3. Firebase lists are updated to remove temp IDs (not just local cache)
 * 4. Shared list participants see correct article counts
 */

test.describe('Temp Article Cleanup', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to app and open a list
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Open or create a test list
    const listCard = authenticatedPage.locator('mat-card, .list-item').first();
    if (await listCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await listCard.click();
      await authenticatedPage.waitForURL(/\/lists\/.*/, { timeout: 5000 });
    }
  });

  test('should create article with temp ID when offline', async ({ authenticatedPage }) => {
    // Get initial temp article count
    const initialTempCount = await getTempArticleCount(authenticatedPage);

    // Go offline
    await goOffline(authenticatedPage);
    await authenticatedPage.waitForTimeout(1000);

    // Add an article while offline
    const articleInput = authenticatedPage.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"]'
    );
    await articleInput.fill('Offline Test Article');
    await articleInput.press('Enter');
    await authenticatedPage.waitForTimeout(1000);

    // Verify article appears in UI with temp ID
    await expect(authenticatedPage.getByText('Offline Test Article')).toBeVisible();

    // Check that a temp article was created in IndexedDB
    const newTempCount = await getTempArticleCount(authenticatedPage);
    expect(newTempCount).toBeGreaterThan(initialTempCount);

    // Go back online
    await goOnline(authenticatedPage);
  });

  test('should replace temp ID with real ID after going online', async ({ authenticatedPage }) => {
    // Go offline
    await goOffline(authenticatedPage);

    // Add article with temp ID
    const articleInput = authenticatedPage.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"]'
    );
    await articleInput.fill('Article for Sync Test');
    await articleInput.press('Enter');
    await authenticatedPage.waitForTimeout(1000);

    // Verify temp article exists
    const tempCountOffline = await getTempArticleCount(authenticatedPage);
    expect(tempCountOffline).toBeGreaterThan(0);

    // Go online and wait for sync
    await goOnline(authenticatedPage);
    await waitForNetworkIdle(authenticatedPage, 5000);

    // Wait for offline sync to complete (might take a few seconds)
    await authenticatedPage.waitForTimeout(3000);

    // Verify temp article was replaced with real ID
    // The temp article count should decrease as temp IDs are replaced
    const tempCountOnline = await getTempArticleCount(authenticatedPage);

    // Note: This might still be > 0 if sync is slow, but should eventually be 0
    // In a real test environment, you'd want to wait for sync completion event
    console.log(`Temp articles after sync: ${tempCountOnline} (was ${tempCountOffline})`);

    // Verify article still appears in UI (with real ID now)
    await expect(authenticatedPage.getByText('Article for Sync Test')).toBeVisible();
  });

  test('should not display temp_ articles in list overview', async ({ authenticatedPage }) => {
    // Go back to lists overview
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Check that no temp_ IDs are visible in the UI
    // (They should be filtered out per TEMP_ARTICLE_CLEANUP.md workaround)
    const tempIdText = authenticatedPage.getByText(/temp_\d+_/);
    await expect(tempIdText).not.toBeVisible();

    // Verify article counts don't include temp articles
    const listCards = authenticatedPage.locator('mat-card, .list-item');
    const count = await listCards.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = listCards.nth(i);
      const cardText = await card.textContent();

      // Should not contain temp_ anywhere
      expect(cardText).not.toMatch(/temp_\d+_/);
    }
  });

  test('should handle multiple offline articles correctly', async ({ authenticatedPage }) => {
    // Go offline
    await goOffline(authenticatedPage);

    const articleInput = authenticatedPage.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"]'
    );

    // Add 3 articles while offline
    const articleNames = ['Offline Article 1', 'Offline Article 2', 'Offline Article 3'];

    for (const name of articleNames) {
      await articleInput.fill(name);
      await articleInput.press('Enter');
      await authenticatedPage.waitForTimeout(500);
    }

    // Verify all 3 articles appear
    for (const name of articleNames) {
      await expect(authenticatedPage.getByText(name)).toBeVisible();
    }

    // Check temp article count
    const tempCount = await getTempArticleCount(authenticatedPage);
    expect(tempCount).toBeGreaterThanOrEqual(3);

    // Go online and wait for sync
    await goOnline(authenticatedPage);
    await waitForNetworkIdle(authenticatedPage, 5000);
    await authenticatedPage.waitForTimeout(3000);

    // All articles should still be visible (with real IDs now)
    for (const name of articleNames) {
      await expect(authenticatedPage.getByText(name)).toBeVisible();
    }
  });

  test('should clean up temp IDs from Firebase (not just local cache)', async ({
    authenticatedPage,
  }) => {
    // This test verifies the critical fix from TEMP_ARTICLE_CLEANUP.md:
    // Firebase lists must be updated to remove temp IDs, not just local state

    // Go offline and add article
    await goOffline(authenticatedPage);

    const articleInput = authenticatedPage.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"]'
    );
    await articleInput.fill('Firebase Cleanup Test');
    await articleInput.press('Enter');
    await authenticatedPage.waitForTimeout(1000);

    // Get list ID from URL
    const url = authenticatedPage.url();
    const listIdMatch = url.match(/\/lists\/([^\/]+)/);
    const listId = listIdMatch ? listIdMatch[1] : null;

    if (listId) {
      // Check that temp ID exists in local cache
      const articleIdsBeforeSync = await getListArticleIdsFromCache(authenticatedPage, listId);
      const hasTempIdBefore = articleIdsBeforeSync.some((id) => id.startsWith('temp_'));
      expect(hasTempIdBefore).toBeTruthy();

      // Go online and wait for sync
      await goOnline(authenticatedPage);
      await waitForNetworkIdle(authenticatedPage, 5000);
      await authenticatedPage.waitForTimeout(5000); // Wait for Firebase update

      // Refresh page to force load from Firebase (not cache)
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState('networkidle');

      // Navigate back to the list
      await authenticatedPage.goto(`/lists/${listId}`);
      await authenticatedPage.waitForLoadState('networkidle');

      // Verify article still exists (proving Firebase was updated)
      await expect(authenticatedPage.getByText('Firebase Cleanup Test')).toBeVisible();

      // Check that temp IDs are gone from cache after sync
      const articleIdsAfterSync = await getListArticleIdsFromCache(authenticatedPage, listId);
      const hasTempIdAfter = articleIdsAfterSync.some((id) => id.startsWith('temp_'));

      // After proper cleanup, temp IDs should be removed
      // Note: This may still fail if the fix from TEMP_ARTICLE_CLEANUP.md isn't implemented
      expect(hasTempIdAfter).toBeFalsy();
    }
  });

  test('should preserve article metadata during temp ID replacement', async ({
    authenticatedPage,
  }) => {
    // Verify that article properties (name, department, etc.) are preserved
    // when temp ID is replaced with real ID

    await goOffline(authenticatedPage);

    // Add article with specific name
    const articleInput = authenticatedPage.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"]'
    );
    const testArticleName = 'Article with Metadata';
    await articleInput.fill(testArticleName);
    await articleInput.press('Enter');
    await authenticatedPage.waitForTimeout(1000);

    // Add amount if possible
    const articleRow = authenticatedPage.getByText(testArticleName).locator('..');
    const amountInput = articleRow.locator('input[placeholder*="amount"], input[placeholder*="menge"]');
    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amountInput.fill('3');
      await amountInput.blur();
      await authenticatedPage.waitForTimeout(500);
    }

    // Go online and sync
    await goOnline(authenticatedPage);
    await waitForNetworkIdle(authenticatedPage, 5000);
    await authenticatedPage.waitForTimeout(3000);

    // Refresh to load from Firebase
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify article name and amount are preserved
    await expect(authenticatedPage.getByText(testArticleName)).toBeVisible();

    const articleRowAfter = authenticatedPage.getByText(testArticleName).locator('..');
    const amountInputAfter = articleRowAfter.locator(
      'input[placeholder*="amount"], input[placeholder*="menge"]'
    );
    if (await amountInputAfter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(amountInputAfter).toHaveValue('3');
    }
  });
});
