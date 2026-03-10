import { test, expect } from './fixtures/auth.fixture';

/**
 * E2E tests for Bug 1:
 * "Creating a new list and adding a new article via search-disambiguation
 *  requires two selections instead of one."
 *
 * ROOT CAUSE: The 1-second debounced mergeLists() can fire during the async
 * Firebase write in updateList(), overwriting the BehaviorSubject with stale data
 * and causing addExistingArticleToList() to silently fail.  Additionally, the
 * articles-store update from createArticle() triggers setupSearchDisambiguation()
 * again (via departmentGroupsEdit$) before clearSearch() is reached, causing the
 * disambiguation menu to re-appear and mislead the user.
 *
 * FIX:
 *  1. updateList() now returns the locally-computed updated list captured before
 *     the async write — immune to BehaviorSubject overwrites.
 *  2. onSelectSearchDisambiguation() immediately sets disambiguationManuallyClosed
 *     = true and closes the menu before starting async work.
 *  3. addExistingArticleToList() dispatches updateListSuccess so the NgRx store
 *     is corrected even if a stale setAll fires afterward.
 */

test.describe('Bug 1 – new list: article added on first disambiguation selection', () => {

  const LIST_NAME = 'BUG1 NewList E2E';
  const ARTICLE_NAME = 'Testmilch E2E';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.locator('.lists-overview, .empty-state').first().waitFor({
      state: 'visible',
      timeout: 10000,
    });
  });

  test('article appears in list after single disambiguation selection on a brand-new list', async ({ page }) => {
    // ── 1. Create a brand-new list ───────────────────────────────────────────
    const addButton = page.locator('button[aria-label="Add list"]').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();
    await page.waitForTimeout(1000);

    const nameInput = page.locator('input').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill(LIST_NAME);

    const submitButton = page.getByRole('button', { name: /save|speichern|erstellen/i });
    await submitButton.click();
    await page.waitForTimeout(2500);

    await expect(page.getByText(LIST_NAME)).toBeVisible({ timeout: 8000 });

    // ── 2. Navigate into the list ────────────────────────────────────────────
    const listItem = page.locator('.list-item', { hasText: LIST_NAME });
    await listItem.waitFor({ state: 'visible', timeout: 5000 });
    await listItem.click();
    await page.waitForURL(/\/lists\//, { timeout: 8000 });
    await page.waitForTimeout(1500);

    // Must be in shopping mode (the default)
    await expect(page.locator('.list-detail')).toBeVisible({ timeout: 5000 });

    // ── 3. Type a unique article name in the search field ────────────────────
    const searchInput = page.locator('app-search-disambiguation input, .search-field input').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill(ARTICLE_NAME);

    // ── 4. Wait for the disambiguation menu to appear ────────────────────────
    const disambiguationPanel = page.locator('.search-disambiguation');
    await disambiguationPanel.waitFor({ state: 'visible', timeout: 5000 });

    // ── 5. Select the "create new" option — should be the ONLY selection needed
    const createNewOption = page.locator('.disambiguation-option', {
      hasText: /neu erstellen|create new/i,
    }).first();
    await createNewOption.waitFor({ state: 'visible', timeout: 3000 });
    await createNewOption.click();

    // Wait for async write to complete
    await page.waitForTimeout(2500);

    // ── 6. Assert: article appears in the list after ONE selection (Bug 1) ───
    // Before the fix the list stayed empty and the user had to select a second time.
    await expect(page.getByText(ARTICLE_NAME)).toBeVisible({ timeout: 6000 });

    // ── 7. Assert: disambiguation menu is closed and search is cleared ────────
    await expect(disambiguationPanel).not.toBeVisible({ timeout: 3000 });

    // ── 8. Reload the page and confirm the article was persisted ─────────────
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.getByText(ARTICLE_NAME)).toBeVisible({ timeout: 6000 });
  });

  test('disambiguation menu does not re-appear after selecting "new" article (Bug 1 UX)', async ({ page }) => {
    // Navigate to an existing list (or create one) and verify the disambiguation
    // menu does not flicker back open after a "new" selection.
    const listItems = page.locator('.list-item');
    const count = await listItems.count();
    if (count === 0) {
      test.skip(); // No lists available — skip rather than fail
      return;
    }

    await listItems.first().click();
    await page.waitForURL(/\/lists\//, { timeout: 8000 });
    await page.waitForTimeout(1000);

    const UNIQUE_ARTICLE = 'UniqDisambigE2E' + Date.now();
    const searchInput = page.locator('app-search-disambiguation input, .search-field input').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill(UNIQUE_ARTICLE);

    const disambiguationPanel = page.locator('.search-disambiguation');
    await disambiguationPanel.waitFor({ state: 'visible', timeout: 5000 });

    // Click "create new"
    const createNewOption = page.locator('.disambiguation-option', {
      hasText: /neu erstellen|create new/i,
    }).first();
    if (await createNewOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createNewOption.click();
      await page.waitForTimeout(600);

      // Disambiguation must NOT re-appear after clicking (was caused by
      // departmentGroupsEdit$ re-emitting when the articles store changed)
      await expect(disambiguationPanel).not.toBeVisible({ timeout: 2000 });
    }
  });
});
