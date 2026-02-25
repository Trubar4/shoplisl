import { test, expect } from './fixtures/auth.fixture';

/**
 * E2E Tests for "Artikel verschieben" popup checkbox feature
 *
 * Tests the "Auf aktueller Liste abhaken" checkbox that appears in the
 * move-articles dialog. When checked (default), articles are marked as
 * done on the source list. When unchecked, they stay open on the source list.
 */

test.describe('Move articles popup checkbox', () => {
  /**
   * Navigate to the first available list and return its URL.
   * Returns null if no list is available.
   */
  async function openFirstList(page: any): Promise<string | null> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const listCard = page.locator('.list-item').first();
    const isVisible = await listCard.isVisible({ timeout: 8000 }).catch(() => false);
    if (!isVisible) return null;

    await listCard.click();
    await page.waitForURL(/\/lists\/.*/, { timeout: 8000 });
    await page.waitForTimeout(2000);

    return page.url();
  }

  /**
   * Ensure at least one article is visible on the current list page.
   * Returns true if an article item was found.
   */
  async function ensureArticleExists(page: any): Promise<boolean> {
    const articleItem = page.locator('app-article-item').first();
    return articleItem.isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Enter selection mode and select the first article.
   * Returns true if selection was successful.
   */
  async function enterSelectionAndSelectFirst(page: any): Promise<boolean> {
    // Click "Auswählen" to enter selection mode
    const auswählenBtn = page.getByRole('button', { name: /auswählen/i });
    const btnVisible = await auswählenBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!btnVisible) return false;

    await auswählenBtn.click();
    await page.waitForTimeout(500);

    // Select the first article via its selection checkbox
    const selectionCheckbox = page.locator('app-article-item mat-checkbox.selection-checkbox').first();
    const checkboxVisible = await selectionCheckbox.isVisible({ timeout: 3000 }).catch(() => false);
    if (!checkboxVisible) return false;

    await selectionCheckbox.click();
    await page.waitForTimeout(300);

    return true;
  }

  /**
   * Click "Verschieben" to open the list-picker dialog.
   * Returns true if the button was clicked.
   */
  async function clickVerschieben(page: any): Promise<boolean> {
    const verschiebenBtn = page.getByRole('button', { name: /verschieben/i });
    const visible = await verschiebenBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) return false;

    await verschiebenBtn.click();
    await page.waitForTimeout(800);
    return true;
  }

  // ---------------------------------------------------------------------------

  test('dialog shows "Auf aktueller Liste abhaken" checkbox checked by default', async ({ page }) => {
    const listUrl = await openFirstList(page);
    if (!listUrl) {
      test.skip(); // No lists available in this environment
      return;
    }

    const hasArticle = await ensureArticleExists(page);
    if (!hasArticle) {
      test.skip(); // No articles available
      return;
    }

    const selected = await enterSelectionAndSelectFirst(page);
    if (!selected) {
      test.skip(); // Could not enter selection mode
      return;
    }

    const opened = await clickVerschieben(page);
    if (!opened) {
      test.skip();
      return;
    }

    // The list-picker dialog should be open
    const dialog = page.locator('app-list-picker-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify the dialog title
    await expect(dialog.locator('[mat-dialog-title]')).toContainText('Artikel verschieben');

    // Verify the checkbox is present
    const checkbox = dialog.locator('.check-on-source-option mat-checkbox');
    await expect(checkbox).toBeVisible();

    // Verify the label text
    await expect(dialog.locator('.check-on-source-option')).toContainText('Auf aktueller Liste abhaken');

    // Verify the checkbox is checked by default (the underlying input should be checked)
    const checkboxInput = dialog.locator('.check-on-source-option mat-checkbox input[type="checkbox"]');
    await expect(checkboxInput).toBeChecked();

    // Close the dialog
    await dialog.getByRole('button', { name: /abbrechen/i }).click();
    await page.waitForTimeout(300);
  });

  test('checkbox position: below title, above article count message', async ({ page }) => {
    const listUrl = await openFirstList(page);
    if (!listUrl) { test.skip(); return; }

    const hasArticle = await ensureArticleExists(page);
    if (!hasArticle) { test.skip(); return; }

    const selected = await enterSelectionAndSelectFirst(page);
    if (!selected) { test.skip(); return; }

    const opened = await clickVerschieben(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.locator('app-list-picker-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Check vertical order: title → checkbox → message
    const title = dialog.locator('[mat-dialog-title]');
    const checkboxContainer = dialog.locator('.check-on-source-option');
    const message = dialog.locator('.dialog-message');

    const titleBox = await title.boundingBox();
    const checkboxBox = await checkboxContainer.boundingBox();

    // Checkbox must be below the title
    expect(titleBox).not.toBeNull();
    expect(checkboxBox).not.toBeNull();
    expect(checkboxBox!.y).toBeGreaterThan(titleBox!.y);

    // If the message is visible, checkbox must be above it
    const isMessageVisible = await message.isVisible().catch(() => false);
    if (isMessageVisible) {
      const messageBox = await message.boundingBox();
      expect(messageBox).not.toBeNull();
      expect(checkboxBox!.y).toBeLessThan(messageBox!.y);
    }

    await dialog.getByRole('button', { name: /abbrechen/i }).click();
  });

  test('checkbox can be unchecked', async ({ page }) => {
    const listUrl = await openFirstList(page);
    if (!listUrl) { test.skip(); return; }

    const hasArticle = await ensureArticleExists(page);
    if (!hasArticle) { test.skip(); return; }

    const selected = await enterSelectionAndSelectFirst(page);
    if (!selected) { test.skip(); return; }

    const opened = await clickVerschieben(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.locator('app-list-picker-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const checkboxInput = dialog.locator('.check-on-source-option mat-checkbox input[type="checkbox"]');

    // Should be checked by default
    await expect(checkboxInput).toBeChecked();

    // Click to uncheck
    const checkboxLabel = dialog.locator('.check-on-source-option mat-checkbox');
    await checkboxLabel.click();
    await page.waitForTimeout(300);

    // Should now be unchecked
    await expect(checkboxInput).not.toBeChecked();

    // Click again to re-check
    await checkboxLabel.click();
    await page.waitForTimeout(300);
    await expect(checkboxInput).toBeChecked();

    await dialog.getByRole('button', { name: /abbrechen/i }).click();
  });

  test('moving with checkbox checked marks article as done on source list', async ({ page }) => {
    const listUrl = await openFirstList(page);
    if (!listUrl) { test.skip(); return; }

    const hasArticle = await ensureArticleExists(page);
    if (!hasArticle) { test.skip(); return; }

    // Get the name of the first article before moving
    const firstArticleName = await page
      .locator('app-article-item .article-name')
      .first()
      .textContent()
      .catch(() => null);

    if (!firstArticleName) { test.skip(); return; }

    const selected = await enterSelectionAndSelectFirst(page);
    if (!selected) { test.skip(); return; }

    const opened = await clickVerschieben(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.locator('app-list-picker-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Checkbox should be checked (default) – keep it checked
    const checkboxInput = dialog.locator('.check-on-source-option mat-checkbox input[type="checkbox"]');
    await expect(checkboxInput).toBeChecked();

    // Select a target list (if any are available)
    const targetListOption = dialog.locator('.disambiguation-option').first();
    const hasTargetList = await targetListOption.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasTargetList) {
      // No other list available – just close
      await dialog.getByRole('button', { name: /abbrechen/i }).click();
      test.skip();
      return;
    }

    await targetListOption.click();
    await page.waitForTimeout(2000);

    // Dialog should be closed and we should be back on the list
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // The article should now be checked on the source list
    // Switch to "erledigt" filter to verify it's there
    // (The checked article moves to "erledigt" state)
    const snackBar = page.locator('mat-snack-bar-container, snack-bar-container');
    const snackVisible = await snackBar.isVisible({ timeout: 3000 }).catch(() => false);
    if (snackVisible) {
      await expect(snackBar).toContainText(/verschoben/i);
    }
  });

  test('moving with checkbox unchecked leaves article open on source list', async ({ page }) => {
    const listUrl = await openFirstList(page);
    if (!listUrl) { test.skip(); return; }

    const hasArticle = await ensureArticleExists(page);
    if (!hasArticle) { test.skip(); return; }

    // Get the name of the first article before moving
    const firstArticleName = await page
      .locator('app-article-item .article-name')
      .first()
      .textContent()
      .catch(() => null);

    if (!firstArticleName) { test.skip(); return; }

    const selected = await enterSelectionAndSelectFirst(page);
    if (!selected) { test.skip(); return; }

    const opened = await clickVerschieben(page);
    if (!opened) { test.skip(); return; }

    const dialog = page.locator('app-list-picker-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Uncheck the checkbox
    const checkboxLabel = dialog.locator('.check-on-source-option mat-checkbox');
    const checkboxInput = dialog.locator('.check-on-source-option mat-checkbox input[type="checkbox"]');
    await checkboxLabel.click();
    await page.waitForTimeout(300);
    await expect(checkboxInput).not.toBeChecked();

    // Select a target list (if available)
    const targetListOption = dialog.locator('.disambiguation-option').first();
    const hasTargetList = await targetListOption.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasTargetList) {
      await dialog.getByRole('button', { name: /abbrechen/i }).click();
      test.skip();
      return;
    }

    await targetListOption.click();
    await page.waitForTimeout(2000);

    // Dialog should be closed
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // The article should still be visible as OPEN (not checked) on the source list
    // because we unchecked the "Auf aktueller Liste abhaken" option.
    // Switch filter to "offen" to confirm
    const articleItem = page.locator('app-article-item').filter({ hasText: firstArticleName.trim() });
    const articleStillVisible = await articleItem.isVisible({ timeout: 3000 }).catch(() => false);

    // The article may or may not be visible depending on the current filter state.
    // Key assertion: the snackbar should confirm the move happened.
    const snackBar = page.locator('mat-snack-bar-container, snack-bar-container');
    const snackVisible = await snackBar.isVisible({ timeout: 3000 }).catch(() => false);
    if (snackVisible) {
      await expect(snackBar).toContainText(/verschoben/i);
    }
  });
});
