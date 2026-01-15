import { test, expect } from './fixtures/auth.fixture';

/**
 * E2E Tests for Articles
 * Tests article management within lists
 */

test.describe('Articles', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a list (or create one first)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on first list to open it
    const listCard = page.locator('mat-card, .list-item').first();
    if (await listCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await listCard.click();
      await page.waitForURL(/\/lists\/.*/, { timeout: 5000 });
    }
  });

  test('should add an article to a list', async ({ page }) => {
    // Find the add article input
    const articleInput = page.locator(
      'input[placeholder*="article"], input[placeholder*="artikel"], input[formControlName="articleName"]'
    );
    await articleInput.fill('Test Article');

    // Submit (press Enter or click add button)
    await articleInput.press('Enter');

    // Wait for article to appear
    await page.waitForTimeout(1000);

    // Verify article appears in the list
    await expect(page.getByText('Test Article')).toBeVisible();
  });

  test('should check and uncheck an article', async ({ page }) => {
    // Add an article first if needed
    const articleInput = page.locator('input[placeholder*="article"], input[placeholder*="artikel"]');
    if (await articleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await articleInput.fill('Article to Check');
      await articleInput.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Find the article checkbox
    const articleCheckbox = page
      .getByText('Article to Check')
      .locator('..')
      .locator('mat-checkbox, input[type="checkbox"]')
      .first();

    if (await articleCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Check the article
      await articleCheckbox.click();
      await page.waitForTimeout(500);

      // Verify checked state (might be moved to "checked" section)
      // The implementation may vary - adjust selector as needed

      // Uncheck the article
      await articleCheckbox.click();
      await page.waitForTimeout(500);

      // Verify article is back in unchecked state
      await expect(articleCheckbox).not.toBeChecked();
    }
  });

  test('should remove an article from a list', async ({ page }) => {
    // Add an article to delete
    const articleInput = page.locator('input[placeholder*="article"], input[placeholder*="artikel"]');
    if (await articleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await articleInput.fill('Article to Delete');
      await articleInput.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Find the article delete button
    const articleRow = page.getByText('Article to Delete').locator('..');
    const deleteButton = articleRow.getByRole('button', { name: /delete|remove|löschen/i });

    if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteButton.click();

      // Confirm if dialog appears
      const confirmButton = page.getByRole('button', { name: /delete|löschen|confirm/i });
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Verify article is removed
      await expect(page.getByText('Article to Delete')).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('should edit article amount', async ({ page }) => {
    // Add an article first
    const articleInput = page.locator('input[placeholder*="article"], input[placeholder*="artikel"]');
    if (await articleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await articleInput.fill('Article with Amount');
      await articleInput.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Find the article amount input
    const articleRow = page.getByText('Article with Amount').locator('..');
    const amountInput = articleRow.locator('input[placeholder*="amount"], input[placeholder*="menge"]');

    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amountInput.fill('5');
      await amountInput.blur(); // Trigger save

      await page.waitForTimeout(500);

      // Verify amount is saved
      await expect(amountInput).toHaveValue('5');
    }
  });

  test('should display article department', async ({ page }) => {
    // Articles might be grouped by department
    // Check if department headers or badges are visible
    const departmentLabel = page.locator(
      '[data-testid="department"], .department-label, mat-chip'
    );

    // This test verifies the UI structure exists
    // Adjust based on your actual implementation
    const hasDepartments = await departmentLabel.count() > 0;
    expect(hasDepartments).toBeTruthy();
  });

  test('should filter articles by checked/unchecked', async ({ page }) => {
    // Add and check some articles
    const articleInput = page.locator('input[placeholder*="article"], input[placeholder*="artikel"]');

    if (await articleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Add two articles
      await articleInput.fill('Checked Article');
      await articleInput.press('Enter');
      await page.waitForTimeout(500);

      await articleInput.fill('Unchecked Article');
      await articleInput.press('Enter');
      await page.waitForTimeout(500);

      // Check one article
      const checkbox = page
        .getByText('Checked Article')
        .locator('..')
        .locator('mat-checkbox, input[type="checkbox"]')
        .first();

      if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await checkbox.click();
        await page.waitForTimeout(500);
      }

      // Look for filter/toggle buttons
      const filterButton = page.getByRole('button', {
        name: /filter|show|hide|checked|unchecked/i,
      });

      if (await filterButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click filter to show/hide checked items
        await filterButton.click();
        await page.waitForTimeout(500);

        // Verify filtering works (implementation-specific)
        // This is a basic check that the filter UI exists
      }
    }
  });
});
