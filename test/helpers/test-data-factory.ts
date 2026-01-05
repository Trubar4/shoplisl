/**
 * Test Data Factory
 *
 * Factory functions for creating test data objects
 * Used in integration tests to set up realistic test scenarios
 */

import { Timestamp } from '@angular/fire/firestore';
import { ShoppingList, Article, ListItemState } from '../../src/app/core/models';

/**
 * Create a test user object
 *
 * @param overrides Partial user properties to override defaults
 */
export function createTestUser(overrides: Partial<{
  id: string;
  email: string;
  displayName: string;
}> = {}) {
  return {
    id: overrides.id || `user_${Date.now()}`,
    email: overrides.email || `test${Date.now()}@example.com`,
    displayName: overrides.displayName || 'Test User',
  };
}

/**
 * Create a test article
 *
 * @param overrides Partial article properties to override defaults
 */
export function createTestArticle(overrides: Partial<Article> = {}): Article {
  const timestamp = Date.now();

  return {
    id: overrides.id || `article_${timestamp}`,
    name: overrides.name || `Test Article ${timestamp}`,
    amount: overrides.amount,
    notes: overrides.notes,
    icon: overrides.icon,
    categoryId: overrides.categoryId,
    departmentId: overrides.departmentId,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    availableInShops: overrides.availableInShops,
    usageCount: overrides.usageCount,
    lastCheckedDate: overrides.lastCheckedDate,
    lastAddedToListDate: overrides.lastAddedToListDate,
    numberOfChecks: overrides.numberOfChecks,
    ownerId: overrides.ownerId || 'owner_1',
    copiedFrom: overrides.copiedFrom,
  };
}

/**
 * Create a test list
 *
 * @param overrides Partial list properties to override defaults
 */
export function createTestList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  const timestamp = Date.now();

  return {
    id: overrides.id || `list_${timestamp}`,
    name: overrides.name || `Test List ${timestamp}`,
    color: overrides.color,
    icon: overrides.icon || '📝',
    shopId: overrides.shopId,
    articleIds: overrides.articleIds || [],
    itemStates: overrides.itemStates || {},
    departmentOrder: overrides.departmentOrder,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    ownerId: overrides.ownerId || 'owner_1',
    sharedWith: overrides.sharedWith || [],
  };
}

/**
 * Create a test item state
 *
 * @param articleId The article ID this state belongs to
 * @param overrides Partial item state properties to override defaults
 */
export function createTestItemState(
  articleId: string,
  overrides: Partial<ListItemState> = {}
): ListItemState {
  return {
    articleId,
    articleName: overrides.articleName,
    isChecked: overrides.isChecked || false,
    amount: overrides.amount || '1',
    notes: overrides.notes,
    addedAt: overrides.addedAt,
    checkedAt: overrides.checkedAt,
    checkedBy: overrides.checkedBy,
    history: overrides.history,
  };
}

/**
 * Create a test shared list with participants
 *
 * @param ownerUser The owner user
 * @param participantUsers Array of participant users
 * @param articles Optional articles to add to the list
 */
export function createTestSharedList(
  ownerUser: { id: string },
  participantUsers: { id: string }[],
  articles: Article[] = []
): ShoppingList {
  const articleIds = articles.map(a => a.id);
  const itemStates: Record<string, ListItemState> = {};

  articles.forEach(article => {
    itemStates[article.id] = createTestItemState(article.id, {
      articleName: article.name,
    });
  });

  return createTestList({
    ownerId: ownerUser.id,
    sharedWith: participantUsers.map(u => u.id),
    articleIds,
    itemStates,
  });
}

/**
 * Create a batch of test articles
 *
 * @param count Number of articles to create
 * @param baseOverrides Base properties applied to all articles
 */
export function createTestArticles(
  count: number,
  baseOverrides: Partial<Article> = {}
): Article[] {
  return Array.from({ length: count }, (_, index) =>
    createTestArticle({
      ...baseOverrides,
      name: `${baseOverrides.name || 'Article'} ${index + 1}`,
    })
  );
}

/**
 * Convert Date to Firestore Timestamp
 * Useful when writing test data to Firestore
 */
export function toFirestoreTimestamp(date: Date = new Date()): Timestamp {
  return Timestamp.fromDate(date);
}

/**
 * Create realistic test data for offline sync scenarios
 *
 * @returns Object with owner, participant, list, and articles
 */
export function createOfflineSyncScenario() {
  const owner = createTestUser({
    id: 'owner_offline_test',
    displayName: 'Owner User',
  });

  const participant = createTestUser({
    id: 'participant_offline_test',
    displayName: 'Participant User',
  });

  const articles = createTestArticles(3, {
    ownerId: owner.id,
  });

  const list = createTestSharedList(owner, [participant], articles);

  return {
    owner,
    participant,
    list,
    articles,
  };
}

/**
 * Create realistic test data for rapid addition scenarios
 *
 * @returns Object with owner, participant, list, and multiple articles
 */
export function createRapidAdditionScenario() {
  const owner = createTestUser({
    id: 'owner_rapid_test',
    displayName: 'Owner User',
  });

  const participant = createTestUser({
    id: 'participant_rapid_test',
    displayName: 'Participant User',
  });

  const existingArticles = createTestArticles(2, {
    ownerId: owner.id,
  });

  const list = createTestSharedList(owner, [participant], existingArticles);

  // Articles to be added rapidly
  const newArticles = createTestArticles(3, {
    ownerId: participant.id,
    name: 'Rapid Article',
  });

  return {
    owner,
    participant,
    list,
    existingArticles,
    newArticles,
  };
}
