/**
 * Playwright E2E Test Helpers
 *
 * These helpers are for browser-based E2E tests that the user will run locally.
 * They provide convenient methods for common UI interactions.
 */

import { Page, Locator } from '@playwright/test';

export class TestHelper {
  constructor(private page: Page) {}

  /**
   * Navigate to a specific route
   */
  async goto(path: string = '/'): Promise<void> {
    await this.page.goto(path);
  }

  /**
   * Wait for Angular to be ready
   */
  async waitForAngular(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<void> {
    await this.goto('/login');
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-button"]');
    await this.waitForAngular();
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('[data-testid="logout-button"]');
    await this.waitForAngular();
  }

  /**
   * Create a new list
   */
  async createList(name: string, options: { color?: string; icon?: string } = {}): Promise<void> {
    await this.page.click('[data-testid="create-list-button"]');
    await this.page.fill('[data-testid="list-name-input"]', name);

    if (options.color) {
      await this.page.fill('[data-testid="list-color-input"]', options.color);
    }

    if (options.icon) {
      await this.page.fill('[data-testid="list-icon-input"]', options.icon);
    }

    await this.page.click('[data-testid="save-list-button"]');
    await this.waitForAngular();
  }

  /**
   * Navigate to a list by name
   */
  async openList(listName: string): Promise<void> {
    await this.page.click(`[data-testid="list-item"][data-list-name="${listName}"]`);
    await this.waitForAngular();
  }

  /**
   * Add an article to the current list
   */
  async addArticleToList(articleName: string, amount?: string): Promise<void> {
    await this.page.click('[data-testid="add-article-button"]');
    await this.page.fill('[data-testid="article-search-input"]', articleName);

    // Wait for search results or create new article option
    await this.page.waitForSelector('[data-testid="article-search-results"]');

    // Try to select existing article first
    const existingArticle = this.page.locator(`[data-testid="article-result"][data-article-name="${articleName}"]`);
    const exists = await existingArticle.count() > 0;

    if (exists) {
      await existingArticle.click();
    } else {
      // Create new article
      await this.page.click('[data-testid="create-new-article-button"]');
      await this.page.fill('[data-testid="new-article-name-input"]', articleName);
      await this.page.click('[data-testid="save-new-article-button"]');
    }

    if (amount) {
      await this.page.fill('[data-testid="article-amount-input"]', amount);
    }

    await this.page.click('[data-testid="confirm-add-article-button"]');
    await this.waitForAngular();
  }

  /**
   * Share a list with another user
   */
  async shareList(listName: string, participantEmail: string): Promise<void> {
    await this.openList(listName);
    await this.page.click('[data-testid="list-menu-button"]');
    await this.page.click('[data-testid="share-list-option"]');
    await this.page.fill('[data-testid="share-email-input"]', participantEmail);
    await this.page.click('[data-testid="send-share-button"]');
    await this.waitForAngular();
  }

  /**
   * Get the article count displayed for a list
   */
  async getListArticleCount(listName: string): Promise<number> {
    const countText = await this.page.textContent(
      `[data-testid="list-item"][data-list-name="${listName}"] [data-testid="article-count"]`
    );
    return parseInt(countText || '0', 10);
  }

  /**
   * Check if an article is visible in the current list
   */
  async isArticleInList(articleName: string): Promise<boolean> {
    const article = this.page.locator(`[data-testid="list-article"][data-article-name="${articleName}"]`);
    return await article.isVisible();
  }

  /**
   * Toggle article checked state
   */
  async toggleArticleChecked(articleName: string): Promise<void> {
    await this.page.click(
      `[data-testid="list-article"][data-article-name="${articleName}"] [data-testid="article-checkbox"]`
    );
    await this.waitForAngular();
  }

  /**
   * Remove an article from the current list
   */
  async removeArticleFromList(articleName: string): Promise<void> {
    const article = this.page.locator(`[data-testid="list-article"][data-article-name="${articleName}"]`);
    await article.hover();
    await this.page.click(
      `[data-testid="list-article"][data-article-name="${articleName}"] [data-testid="remove-article-button"]`
    );
    await this.waitForAngular();
  }

  /**
   * Go offline (network simulation)
   */
  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  /**
   * Go online (network simulation)
   */
  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false);
  }

  /**
   * Wait for a specific amount of time
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }
}
