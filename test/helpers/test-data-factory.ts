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

  const article: any = {
    id: overrides.id || `article_${timestamp}`,
    name: overrides.name || `Test Article ${timestamp}`,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    ownerId: overrides.ownerId || 'owner_1',
  };

  // Only include optional fields if they're defined
  if (overrides.amount !== undefined) article.amount = overrides.amount;
  if (overrides.notes !== undefined) article.notes = overrides.notes;
  if (overrides.icon !== undefined) article.icon = overrides.icon;
  if (overrides.categoryId !== undefined) article.categoryId = overrides.categoryId;
  if (overrides.departmentId !== undefined) article.departmentId = overrides.departmentId;
  if (overrides.availableInShops !== undefined) article.availableInShops = overrides.availableInShops;
  if (overrides.usageCount !== undefined) article.usageCount = overrides.usageCount;
  if (overrides.lastCheckedDate !== undefined) article.lastCheckedDate = overrides.lastCheckedDate;
  if (overrides.lastAddedToListDate !== undefined) article.lastAddedToListDate = overrides.lastAddedToListDate;
  if (overrides.numberOfChecks !== undefined) article.numberOfChecks = overrides.numberOfChecks;
  if (overrides.copiedFrom !== undefined) article.copiedFrom = overrides.copiedFrom;

  return article as Article;
}

/**
 * Create a test list
 *
 * @param overrides Partial list properties to override defaults
 */
export function createTestList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  const timestamp = Date.now();

  const list: any = {
    id: overrides.id || `list_${timestamp}`,
    name: overrides.name || `Test List ${timestamp}`,
    icon: overrides.icon || '📝',
    articleIds: overrides.articleIds || [],
    itemStates: overrides.itemStates || {},
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    ownerId: overrides.ownerId || 'owner_1',
    sharedWith: overrides.sharedWith || [],
  };

  // Only include optional fields if they're defined
  if (overrides.color !== undefined) list.color = overrides.color;
  if (overrides.shopId !== undefined) list.shopId = overrides.shopId;
  if (overrides.departmentOrder !== undefined) list.departmentOrder = overrides.departmentOrder;

  return list as ShoppingList;
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
  const itemState: any = {
    articleId,
    isChecked: overrides.isChecked || false,
    amount: overrides.amount || '1',
  };

  // Only include optional fields if they're defined
  if (overrides.articleName !== undefined) itemState.articleName = overrides.articleName;
  if (overrides.notes !== undefined) itemState.notes = overrides.notes;
  if (overrides.addedAt !== undefined) itemState.addedAt = overrides.addedAt;
  if (overrides.checkedAt !== undefined) itemState.checkedAt = overrides.checkedAt;
  if (overrides.checkedBy !== undefined) itemState.checkedBy = overrides.checkedBy;
  if (overrides.history !== undefined) itemState.history = overrides.history;

  return itemState as ListItemState;
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
