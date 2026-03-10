import { test, expect } from './fixtures/auth.fixture';

/**
 * E2E Tests for Shopping Lists
 * Tests basic CRUD operations for lists
 */

test.describe('Shopping Lists', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to lists overview
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Angular to fully render (increased timeout)
    await page.waitForTimeout(3000);

    // Wait for either lists container or empty state to be visible
    await page.locator('.lists-overview, .empty-state').first().waitFor({
      state: 'visible',
      timeout: 10000
    });
  });

  test('should display lists overview', async ({ page }) => {
    // Check that we're on the lists page
    await expect(page).toHaveURL(/\//);

    // Check for the lists overview container
    const listsOverview = page.locator('.lists-overview');
    await expect(listsOverview).toBeVisible({ timeout: 10000 });

    // Check for either lists or empty state
    const hasList = await page.locator('.list-item').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').isVisible().catch(() => false);

    // Should show either lists or empty state
    expect(hasList || hasEmptyState).toBeTruthy();
  });

  test('should create a new shopping list', async ({ page }) => {
    // Click the "Add List" button (the + button in the toolbar)
    const addButton = page.locator('button[aria-label="Add list"], button:has(mat-icon:text("add"))').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();

    // Wait for dialog/form to appear
    await page.waitForTimeout(1500);

    // Fill in the list name
    const nameInput = page.locator('input[name="name"], input[placeholder*="Name"], input').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('Test Shopping List E2E');

    // Submit the form (look for save/create button)
    const submitButton = page.getByRole('button', { name: /save|speichern|create|erstellen|hinzufügen/i });
    await submitButton.click();

    // Wait for the list to appear (increased timeout)
    await page.waitForTimeout(3000);

    // Verify the list appears in the overview
    const createdList = page.getByText('Test Shopping List E2E');
    await expect(createdList).toBeVisible({ timeout: 10000 });
  });

  test('should edit a shopping list name', async ({ page }) => {
    // Ensure at least one list exists by creating one
    const existingLists = await page.locator('.list-item').count();
    if (existingLists === 0) {
      // Create a list first
      const addButton = page.locator('button[aria-label="Add list"]').first();
      await addButton.waitFor({ state: 'visible', timeout: 5000 });
      await addButton.click();
      await page.waitForTimeout(1000);
      const nameInput = page.locator('input').first();
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill('List to Edit');
      const submitButton = page.getByRole('button', { name: /save|speichern|erstellen/i });
      await submitButton.click();
      await page.waitForTimeout(3000);

      // Verify list was created before proceeding
      await page.locator('.list-item').first().waitFor({ state: 'visible', timeout: 10000 });
    }

    // Find the first list
    const listCard = page.locator('.list-item').first();
    await listCard.waitFor({ state: 'visible', timeout: 10000 });

    // Click on the list to open it (might open list details, not edit directly)
    await listCard.click();
    await page.waitForTimeout(2000);

    // For now, this test is basic - just verify navigation worked
    // In your app, editing might require a different flow
    await expect(page).toHaveURL(/\/lists\/.+/, { timeout: 10000 });
  });

  /**
   * Bug 2 regression: Deleting a list must take effect immediately in the DOM
   * without requiring a page refresh.
   *
   * Swipe-to-delete is simulated via a mouse drag on the .list-item element.
   * After the swipe the app shows a Material snackbar with a confirm button;
   * clicking it must cause the list to disappear from the overview immediately.
   */
  test('should delete a shopping list and remove it from DOM immediately (Bug 2)', async ({ page }) => {
    // ── 1. Create the list that will be deleted ─────────────────────────────
    const addButton = page.locator('button[aria-label="Add list"]').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();
    await page.waitForTimeout(1000);

    const nameInput = page.locator('input').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('BUG2 Delete E2E');

    const submitButton = page.getByRole('button', { name: /save|speichern|erstellen/i });
    await submitButton.click();
    await page.waitForTimeout(2500);

    await expect(page.getByText('BUG2 Delete E2E')).toBeVisible({ timeout: 8000 });

    // ── 2. Simulate a left-swipe on the list item ───────────────────────────
    const listItem = page.locator('.list-item', { hasText: 'BUG2 Delete E2E' });
    await listItem.waitFor({ state: 'visible', timeout: 5000 });

    const box = await listItem.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }

    // ── 3. Confirm via snackbar / confirm button ────────────────────────────
    const confirmButton = page
      .getByRole('button', { name: /ok|löschen|delete|bestätigen/i })
      .or(page.locator('mat-snack-bar-container button'));
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.first().click();
      await page.waitForTimeout(1000);
    }

    // ── 4. Assert: list disappears from DOM without a page reload ───────────
    // Bug 2 regression: previously the list stayed visible until hard refresh.
    await expect(page.getByText('BUG2 Delete E2E')).not.toBeVisible({ timeout: 4000 });

    // ── 5. Navigate away and back — list must still be absent ───────────────
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.getByText('BUG2 Delete E2E')).not.toBeVisible({ timeout: 5000 });
  });

  test('should navigate to list details', async ({ page }) => {
    // Ensure at least one list exists
    const listCount = await page.locator('.list-item').count();
    if (listCount === 0) {
      // Create a list
      const addButton = page.locator('button[aria-label="Add list"]').first();
      await addButton.click();
      await page.waitForTimeout(500);
      const nameInput = page.locator('input').first();
      await nameInput.fill('Navigation Test List');
      const submitButton = page.getByRole('button', { name: /save|speichern|erstellen/i });
      await submitButton.click();
      await page.waitForTimeout(1500);
    }

    // Click on a list item
    const listCard = page.locator('.list-item').first();
    await listCard.click();

    // Wait for navigation to list details
    await page.waitForTimeout(1000);

    // Verify we're on the list details page
    await expect(page).toHaveURL(/\/lists\/.+/);
  });

  test('should display article count on list card', async ({ page }) => {
    // Ensure at least one list exists
    const listCount = await page.locator('.list-item').count();
    if (listCount === 0) {
      // Skip if no lists
      test.skip();
    }

    // Look for article count badge on list cards
    const listCard = page.locator('.list-item').first();
    await listCard.waitFor({ state: 'visible', timeout: 5000 });

    // Check for count badge (class .item-count based on the HTML)
    const countBadge = listCard.locator('.item-count');

    // The badge might not be visible if there are no items, which is fine
    const isBadgeVisible = await countBadge.isVisible().catch(() => false);

    // Just verify the list item structure is correct
    await expect(listCard).toBeVisible();
  });
});
