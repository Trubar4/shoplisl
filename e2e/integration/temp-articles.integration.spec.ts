/**
 * Firebase Integration Tests for Temporary Article Cleanup
 *
 * These tests directly test Firebase operations without requiring a browser.
 * They can be run automatically by Claude to verify the temp article cleanup logic.
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
  createTestArticle,
  createTestList,
  createItemState,
  generateTempId
} from '../fixtures/test-data';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';

describe('Temporary Article Cleanup - Firebase Integration', () => {
  beforeAll(async () => {
    await setupEmulators();
  });

  beforeEach(async () => {
    await clearEmulators();
  });

  afterAll(async () => {
    await cleanupEmulators();
  });

  it('should create a list with temp article IDs', async () => {
    const ownerContext = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = ownerContext.firestore();

    // Create articles with temp IDs (simulating offline creation)
    const tempId1 = generateTempId();
    const tempId2 = generateTempId();

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    // Add temp article IDs
    list.articleIds = [tempId1, tempId2];
    list.itemStates = {
      [tempId1]: createItemState(tempId1, { isChecked: false }),
      [tempId2]: createItemState(tempId2, { isChecked: false }),
    };

    // Write to Firestore
    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Verify temp IDs are in Firestore
    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).toHaveLength(2);
    expect(data!.articleIds[0]).toMatch(/^temp_/);
    expect(data!.articleIds[1]).toMatch(/^temp_/);
  });

  it('should replace temp IDs with real IDs in Firebase', async () => {
    const ownerContext = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = ownerContext.firestore();

    // Create list with temp IDs
    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    list.articleIds = [tempId];
    list.itemStates = {
      [tempId]: createItemState(tempId, { isChecked: false }),
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Simulate sync: Replace temp ID with real ID
    await updateDoc(listRef, {
      articleIds: [realId],
      itemStates: {
        [realId]: createItemState(realId, { isChecked: false }),
      },
      updatedAt: Timestamp.now(),
    });

    // Verify temp ID is gone and real ID is present
    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).toHaveLength(1);
    expect(data!.articleIds[0]).toBe(realId);
    expect(data!.articleIds[0]).not.toMatch(/^temp_/);
    expect(data!.itemStates[realId]).toBeDefined();
    expect(data!.itemStates[tempId]).toBeUndefined();
  });

  it('should handle multiple temp IDs being replaced', async () => {
    const ownerContext = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = ownerContext.firestore();

    // Create list with multiple temp IDs
    const tempId1 = generateTempId();
    const tempId2 = generateTempId();
    const realId1 = `article_${Date.now()}_1`;
    const realId2 = `article_${Date.now()}_2`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    list.articleIds = [tempId1, tempId2];
    list.itemStates = {
      [tempId1]: createItemState(tempId1, { isChecked: false }),
      [tempId2]: createItemState(tempId2, { isChecked: true }),
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Simulate sync: Replace all temp IDs with real IDs
    await updateDoc(listRef, {
      articleIds: [realId1, realId2],
      itemStates: {
        [realId1]: createItemState(realId1, { isChecked: false }),
        [realId2]: createItemState(realId2, { isChecked: true }),
      },
      updatedAt: Timestamp.now(),
    });

    // Verify all temp IDs are gone
    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.articleIds).toHaveLength(2);
    expect(data!.articleIds.every((id: string) => !id.startsWith('temp_'))).toBe(true);
    expect(data!.itemStates[realId1]).toBeDefined();
    expect(data!.itemStates[realId2]).toBeDefined();
    expect(data!.itemStates[tempId1]).toBeUndefined();
    expect(data!.itemStates[tempId2]).toBeUndefined();
  });

  it('should maintain checked state when replacing temp IDs', async () => {
    const ownerContext = getAuthenticatedContext(TEST_USERS.owner.uid);
    const db = ownerContext.firestore();

    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Test List',
    });

    // Create temp article that is checked
    list.articleIds = [tempId];
    list.itemStates = {
      [tempId]: createItemState(tempId, {
        isChecked: true,
        amount: '2L',
        notes: 'Test notes',
      }),
    };

    const listRef = doc(db, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Replace temp ID, preserving state
    const oldState = list.itemStates[tempId];
    await updateDoc(listRef, {
      articleIds: [realId],
      itemStates: {
        [realId]: {
          ...oldState,
          articleId: realId,
        },
      },
      updatedAt: Timestamp.now(),
    });

    // Verify state is preserved
    const snapshot = await getDoc(listRef);
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(data!.itemStates[realId].isChecked).toBe(true);
    expect(data!.itemStates[realId].amount).toBe('2L');
    expect(data!.itemStates[realId].notes).toBe('Test notes');
  });

  it('should work with shared lists - participant view', async () => {
    const ownerContext = getAuthenticatedContext(TEST_USERS.owner.uid);
    const participantContext = getAuthenticatedContext(TEST_USERS.participant.uid);
    const ownerDb = ownerContext.firestore();
    const participantDb = participantContext.firestore();

    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    // Owner creates list with temp ID
    const list = createTestList({
      ownerId: TEST_USERS.owner.uid,
      name: 'Shared List',
    });

    list.sharedWith = [TEST_USERS.participant.uid];
    list.articleIds = [tempId];
    list.itemStates = {
      [tempId]: createItemState(tempId, { isChecked: false }),
    };

    const listRef = doc(ownerDb, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`);
    await setDoc(listRef, {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Owner syncs and replaces temp ID
    await updateDoc(listRef, {
      articleIds: [realId],
      itemStates: {
        [realId]: createItemState(realId, { isChecked: false }),
      },
      updatedAt: Timestamp.now(),
    });

    // Participant reads list (via owner's path since it's shared)
    const participantSnapshot = await getDoc(
      doc(participantDb, `users-v2/${TEST_USERS.owner.uid}/lists/${list.id}`)
    );
    const participantData = participantSnapshot.data();

    // Participant should see real ID, not temp ID
    expect(participantData).toBeDefined();
    expect(participantData!.articleIds).toHaveLength(1);
    expect(participantData!.articleIds[0]).toBe(realId);
    expect(participantData!.articleIds[0]).not.toMatch(/^temp_/);
  });
});
