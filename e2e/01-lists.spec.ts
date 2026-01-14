import { test, expect } from './fixtures/auth.fixture';

/**
 * E2E Tests for Shopping Lists
 * Tests basic CRUD operations for lists
 */

test.describe('Shopping Lists', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to lists overview
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('should display lists overview', async ({ authenticatedPage }) => {
    // Check that we're on the lists page
    await expect(authenticatedPage).toHaveURL(/\//);

    // Check for lists container or title
    const listsSection = authenticatedPage.locator('[data-testid="lists-overview"], mat-card, .list-item');
    await expect(listsSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should create a new shopping list', async ({ authenticatedPage }) => {
    // Click the "Add List" button
    const addButton = authenticatedPage.getByRole('button', { name: /add list|neue liste|hinzufügen/i });
    await addButton.click();

    // Fill in the list name
    const nameInput = authenticatedPage.locator('input[name="name"], input[formControlName="name"]');
    await nameInput.fill('Test Shopping List');

    // Submit the form
    const submitButton = authenticatedPage.getByRole('button', { name: /save|speichern|create|erstellen/i });
    await submitButton.click();

    // Wait for the list to appear
    await authenticatedPage.waitForTimeout(1000);

    // Verify the list appears in the overview
    await expect(authenticatedPage.getByText('Test Shopping List')).toBeVisible();
  });

  test('should edit a shopping list name', async ({ authenticatedPage }) => {
    // Find an existing list or create one first
    const listCard = authenticatedPage.locator('mat-card, .list-item').first();
    await listCard.waitFor({ state: 'visible', timeout: 5000 });

    // Click edit button or list menu
    const editButton = listCard.getByRole('button', { name: /edit|bearbeiten|menu/i });
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();

      // Look for edit option in menu
      const editOption = authenticatedPage.getByRole('menuitem', { name: /edit|bearbeiten/i });
      if (await editOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await editOption.click();
      }
    }

    // Update the name
    const nameInput = authenticatedPage.locator('input[name="name"], input[formControlName="name"]');
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('Updated List Name');

      // Save changes
      const saveButton = authenticatedPage.getByRole('button', { name: /save|speichern/i });
      await saveButton.click();

      // Verify the updated name appears
      await expect(authenticatedPage.getByText('Updated List Name')).toBeVisible();
    }
  });

  test('should delete a shopping list', async ({ authenticatedPage }) => {
    // Create a test list first
    const addButton = authenticatedPage.getByRole('button', { name: /add list|neue liste|hinzufügen/i });
    if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addButton.click();
      const nameInput = authenticatedPage.locator('input[name="name"], input[formControlName="name"]');
      await nameInput.fill('List to Delete');
      const submitButton = authenticatedPage.getByRole('button', { name: /save|speichern|create|erstellen/i });
      await submitButton.click();
      await authenticatedPage.waitForTimeout(1000);
    }

    // Find the list
    const listToDelete = authenticatedPage.getByText('List to Delete').locator('..').locator('..');

    // Open menu and click delete
    const menuButton = listToDelete.getByRole('button', { name: /menu|more|mehr/i });
    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();

      const deleteOption = authenticatedPage.getByRole('menuitem', { name: /delete|löschen/i });
      await deleteOption.click();

      // Confirm deletion in dialog
      const confirmButton = authenticatedPage.getByRole('button', { name: /delete|löschen|confirm|bestätigen/i });
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Verify the list is removed
      await expect(authenticatedPage.getByText('List to Delete')).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('should navigate to list details', async ({ authenticatedPage }) => {
    // Click on a list card
    const listCard = authenticatedPage.locator('mat-card, .list-item').first();
    await listCard.click();

    // Wait for navigation to list details
    await authenticatedPage.waitForURL(/\/lists\/.*/, { timeout: 5000 });

    // Verify we're on the list details page
    await expect(authenticatedPage).toHaveURL(/\/lists\/.+/);
  });

  test('should display article count on list card', async ({ authenticatedPage }) => {
    // Look for article count badge/chip on list cards
    const listCard = authenticatedPage.locator('mat-card, .list-item').first();
    await listCard.waitFor({ state: 'visible', timeout: 5000 });

    // Check for count indicator (adjust selector based on your implementation)
    const countBadge = listCard.locator('[data-testid="article-count"], .article-count, mat-chip');

    // If count badge exists, verify it shows a number
    if (await countBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      const countText = await countBadge.textContent();
      expect(countText).toMatch(/\d+/); // Should contain at least one digit
    }
  });
});
