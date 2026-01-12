/**
 * Firebase Integration Tests for ArticleIds/ItemStates Consistency
 *
 * These tests verify that articleIds and itemStates stay synchronized
 * across all operations.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupEmulators,
  clearEmulators,
  cleanupEmulators,
  getAuthenticatedContext
} from '../utils/firebase-emulator';
import {
  TEST_USERS,
  createTestList,
  createItemState
} from '../fixtures/test-data';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';

describe('ArticleIds/ItemStates Consistency - Firebase Integration', () => {
  beforeAll(async () => {
    await setupEmulators();
  });

  beforeEach(async () => {
    await clearEmulators();
  });

  afterAll(async () => {
    await cleanupEmulators();
  });

  it('should have matching keys between articleIds and itemStates', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const articleId1 = `article_${Date.now()}_1`;
    const articleId2 = `article_${Date.now()}_2`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    list.articleIds = [articleId1, articleId2];
    list.itemStates = {
      [articleId1]: createItemState(articleId1),
      [articleId2]: createItemState(articleId2),
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();

    const articleIdsSet = new Set(data!.articleIds);
    const itemStatesKeys = new Set(Object.keys(data!.itemStates));

    // Verify both sets have the same elements
    expect(articleIdsSet.size).toBe(itemStatesKeys.size);
    articleIdsSet.forEach(id => {
      expect(itemStatesKeys.has(id)).toBe(true);
    });
    itemStatesKeys.forEach(id => {
      expect(articleIdsSet.has(id)).toBe(true);
    });
  });

  it('should detect when articleIds has an ID not in itemStates', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const articleId1 = `article_${Date.now()}_1`;
    const articleId2 = `article_${Date.now()}_2`;
    const articleId3 = `article_${Date.now()}_3`; // Orphaned in articleIds

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Inconsistent List',
    });

    // Intentionally create inconsistency
    list.articleIds = [articleId1, articleId2, articleId3]; // 3 IDs
    list.itemStates = {
      [articleId1]: createItemState(articleId1),
      [articleId2]: createItemState(articleId2),
      // articleId3 missing from itemStates!
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();

    const articleIdsSet = new Set(data!.articleIds);
    const itemStatesKeys = new Set(Object.keys(data!.itemStates));

    // Detect inconsistency
    const orphanedInArticleIds = Array.from(articleIdsSet).filter(id => !itemStatesKeys.has(id));

    expect(orphanedInArticleIds).toHaveLength(1);
    expect(orphanedInArticleIds[0]).toBe(articleId3);
  });

  it('should detect when itemStates has a key not in articleIds', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const articleId1 = `article_${Date.now()}_1`;
    const articleId2 = `article_${Date.now()}_2`;
    const articleId3 = `article_${Date.now()}_3`; // Orphaned in itemStates

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Inconsistent List',
    });

    // Intentionally create inconsistency
    list.articleIds = [articleId1, articleId2]; // 2 IDs
    list.itemStates = {
      [articleId1]: createItemState(articleId1),
      [articleId2]: createItemState(articleId2),
      [articleId3]: createItemState(articleId3), // Orphaned!
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();

    const articleIdsSet = new Set(data!.articleIds);
    const itemStatesKeys = new Set(Object.keys(data!.itemStates));

    // Detect inconsistency
    const orphanedInItemStates = Array.from(itemStatesKeys).filter(id => !articleIdsSet.has(id));

    expect(orphanedInItemStates).toHaveLength(1);
    expect(orphanedInItemStates[0]).toBe(articleId3);
  });

  it('should repair inconsistencies by removing orphaned entries', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const articleId1 = `article_${Date.now()}_1`;
    const articleId2 = `article_${Date.now()}_2`;
    const articleId3 = `article_${Date.now()}_3`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Inconsistent List',
    });

    // Create inconsistency (both directions)
    list.articleIds = [articleId1, articleId3]; // articleId2 missing here
    list.itemStates = {
      [articleId1]: createItemState(articleId1),
      [articleId2]: createItemState(articleId2), // Orphaned in itemStates
      // articleId3 missing from itemStates
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Repair: Keep only items that exist in both arrays
    const articleIdsSet = new Set(list.articleIds);
    const itemStatesKeys = new Set(Object.keys(list.itemStates));

    const validIds = Array.from(articleIdsSet).filter(id => itemStatesKeys.has(id));
    const repairedItemStates = Object.fromEntries(
      validIds.map(id => [id, list.itemStates[id]])
    );

    await updateDoc(listRef, {
      articleIds: validIds,
      itemStates: repairedItemStates,
      updatedAt: Timestamp.now(),
    });

    // Verify repair
    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).toHaveLength(1); // Only articleId1 is valid
    expect(data!.articleIds[0]).toBe(articleId1);
    expect(Object.keys(data!.itemStates)).toHaveLength(1);
    expect(data!.itemStates[articleId1]).toBeDefined();
  });

  it('should add article with both articleId and itemState', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Add article (both arrays updated atomically)
    const newArticleId = `article_${Date.now()}`;
    await updateDoc(listRef, {
      articleIds: [newArticleId],
      itemStates: {
        [newArticleId]: createItemState(newArticleId),
      },
      updatedAt: Timestamp.now(),
    });

    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).toContain(newArticleId);
    expect(data!.itemStates[newArticleId]).toBeDefined();
  });

  it('should remove article from both articleIds and itemStates', async () => {
    const context = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = context.firestore();

    const articleId1 = `article_${Date.now()}_1`;
    const articleId2 = `article_${Date.now()}_2`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    list.articleIds = [articleId1, articleId2];
    list.itemStates = {
      [articleId1]: createItemState(articleId1),
      [articleId2]: createItemState(articleId2),
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Remove article (both arrays updated atomically)
    const newArticleIds = list.articleIds.filter(id => id !== articleId1);
    const newItemStates = { ...list.itemStates };
    delete newItemStates[articleId1];

    await updateDoc(listRef, {
      articleIds: newArticleIds,
      itemStates: newItemStates,
      updatedAt: Timestamp.now(),
    });

    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).not.toContain(articleId1);
    expect(data!.articleIds).toContain(articleId2);
    expect(data!.itemStates[articleId1]).toBeUndefined();
    expect(data!.itemStates[articleId2]).toBeDefined();
  });
});
