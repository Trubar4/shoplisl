/**
 * Test Data Fixtures
 *
 * Common test data used across integration and E2E tests
 */

export const TEST_USERS = {
  owner: {
    uid: 'test-owner-uid',
    email: 'owner@test.com',
    password: 'testPassword123',
    displayName: 'Test Owner',
  },
  participant: {
    uid: 'test-participant-uid',
    email: 'participant@test.com',
    password: 'testPassword123',
    displayName: 'Test Participant',
  },
  nonMember: {
    uid: 'test-nonmember-uid',
    email: 'nonmember@test.com',
    password: 'testPassword123',
    displayName: 'Test Non-Member',
  },
};

export const TEST_ARTICLES = {
  milk: {
    name: 'Milk',
    icon: '🥛',
    category: 'Dairy',
    defaultAmount: '1L',
  },
  bread: {
    name: 'Bread',
    icon: '🍞',
    category: 'Bakery',
    defaultAmount: '1 loaf',
  },
  eggs: {
    name: 'Eggs',
    icon: '🥚',
    category: 'Dairy',
    defaultAmount: '12',
  },
  apples: {
    name: 'Apples',
    icon: '🍎',
    category: 'Fruits',
    defaultAmount: '1kg',
  },
};

export const TEST_LISTS = {
  shopping: {
    name: 'Weekly Shopping',
    color: '#FF5722',
    icon: '🛒',
  },
  groceries: {
    name: 'Groceries',
    color: '#4CAF50',
    icon: '🥗',
  },
  household: {
    name: 'Household Items',
    color: '#2196F3',
    icon: '🏠',
  },
};

/**
 * Generate a temporary article ID (simulates offline creation)
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a complete article object for testing
 */
export function createTestArticle(data: Partial<typeof TEST_ARTICLES.milk> & { creatorId: string, id?: string }) {
  return {
    id: data.id || `article_${Date.now()}`,
    name: data.name || 'Test Article',
    icon: data.icon || '📦',
    category: data.category || 'Other',
    defaultAmount: data.defaultAmount || '1',
    creatorId: data.creatorId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a complete list object for testing
 */
export function createTestList(data: Partial<typeof TEST_LISTS.shopping> & { ownerId: string, id?: string }) {
  return {
    id: data.id || `list_${Date.now()}`,
    name: data.name || 'Test List',
    color: data.color || '#757575',
    icon: data.icon || '📝',
    ownerId: data.ownerId,
    sharedWith: [] as string[],
    articleIds: [] as string[],
    itemStates: {} as Record<string, any>,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a list item state object
 */
export function createItemState(articleId: string, options: { isChecked?: boolean; amount?: string; notes?: string } = {}) {
  return {
    articleId,
    isChecked: options.isChecked ?? false,
    amount: options.amount,
    notes: options.notes,
    addedAt: new Date(),
  };
}
