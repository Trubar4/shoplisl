/**
 * Firebase Integration Tests for Temporary Article Cleanup
 *
 * These tests directly test Firebase operations without requiring a browser.
 * They can be run automatically to verify the temp article cleanup logic.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupEmulators,
  clearEmulators,
  cleanupEmulators,
  getAuthenticatedFirestore,
  getTestFirestore
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
    const { db, userId } = await getAuthenticatedFirestore(TEST_USERS.owner.email);

    // Create articles with temp IDs (simulating offline creation)
    const tempId1 = generateTempId();
    const tempId2 = generateTempId();

    const list = createTestList({
      ownerId: userId,
      name: 'Test List',
    });

    // Add temp article IDs
    list.articleIds = [tempId1, tempId2];
    list.itemStates = {
      [tempId1]: createItemState(tempId1, { isChecked: false }),
      [tempId2]: createItemState(tempId2, { isChecked: false }),
    };

    // Write to Firestore - be explicit about all fields
    const listRef = doc(db, `users-v2/${userId}/lists/${list.id}`);
    await setDoc(listRef, {
      id: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      articleIds: list.articleIds,  // Explicitly use the temp IDs we set
      itemStates: list.itemStates,
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
    const { db, userId } = await getAuthenticatedFirestore(TEST_USERS.owner.email);

    // Create list with temp IDs
    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    const list = createTestList({
      ownerId: userId,
      name: 'Test List',
    });

    list.articleIds = [tempId];
    list.itemStates = {
      [tempId]: createItemState(tempId, { isChecked: false }),
    };

    const listRef = doc(db, `users-v2/${userId}/lists/${list.id}`);

    // Create document - be explicit about all fields
    await setDoc(listRef, {
      id: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      articleIds: list.articleIds,  // Explicitly use the temp IDs we set
      itemStates: list.itemStates,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Verify document was created
    const createdSnapshot = await getDoc(listRef);
    expect(createdSnapshot.exists()).toBe(true);

    // Simulate sync: Replace temp ID with real ID
    // Read current document, modify, write back completely
    const currentDoc = await getDoc(listRef);

    // Verify document exists before accessing data
    if (!currentDoc.exists()) {
      throw new Error('Document does not exist after creation');
    }

    const currentData = currentDoc.data();

    // Explicitly preserve all required fields to avoid permission issues
    await setDoc(listRef, {
      id: currentData.id,
      name: currentData.name,
      color: currentData.color,
      icon: currentData.icon,
      ownerId: currentData.ownerId,
      sharedWith: currentData.sharedWith || [],
      articleIds: [realId],
      itemStates: {
        [realId]: createItemState(realId, { isChecked: false }),
      },
      createdAt: currentData.createdAt,
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
    const { db, userId } = await getAuthenticatedFirestore(TEST_USERS.owner.email);

    // Create list with multiple temp IDs
    const tempId1 = generateTempId();
    const tempId2 = generateTempId();
    const realId1 = `article_${Date.now()}_1`;
    const realId2 = `article_${Date.now()}_2`;

    const list = createTestList({
      ownerId: userId,
      name: 'Test List',
    });

    list.articleIds = [tempId1, tempId2];
    list.itemStates = {
      [tempId1]: createItemState(tempId1, { isChecked: false }),
      [tempId2]: createItemState(tempId2, { isChecked: true }),
    };

    const listRef = doc(db, `users-v2/${userId}/lists/${list.id}`);
    await setDoc(listRef, {
      id: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      articleIds: list.articleIds,
      itemStates: list.itemStates,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Simulate sync: Replace all temp IDs with real IDs
    // Read current document, modify, write back completely
    const currentDoc = await getDoc(listRef);

    if (!currentDoc.exists()) {
      throw new Error('Document does not exist after creation');
    }

    const currentData = currentDoc.data();

    // Explicitly preserve all required fields to avoid permission issues
    await setDoc(listRef, {
      id: currentData.id,
      name: currentData.name,
      color: currentData.color,
      icon: currentData.icon,
      ownerId: currentData.ownerId,
      sharedWith: currentData.sharedWith || [],
      articleIds: [realId1, realId2],
      itemStates: {
        [realId1]: createItemState(realId1, { isChecked: false }),
        [realId2]: createItemState(realId2, { isChecked: true }),
      },
      createdAt: currentData.createdAt,
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
    const { db, userId } = await getAuthenticatedFirestore(TEST_USERS.owner.email);

    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    const list = createTestList({
      ownerId: userId,
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

    const listRef = doc(db, `users-v2/${userId}/lists/${list.id}`);
    await setDoc(listRef, {
      id: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      articleIds: list.articleIds,
      itemStates: list.itemStates,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Replace temp ID, preserving state
    // Read current document, modify, write back completely
    const currentDoc = await getDoc(listRef);

    if (!currentDoc.exists()) {
      throw new Error('Document does not exist after creation');
    }

    const currentData = currentDoc.data();
    const oldState = list.itemStates[tempId];

    // Explicitly preserve all required fields to avoid permission issues
    await setDoc(listRef, {
      id: currentData.id,
      name: currentData.name,
      color: currentData.color,
      icon: currentData.icon,
      ownerId: currentData.ownerId,
      sharedWith: currentData.sharedWith || [],
      articleIds: [realId],
      itemStates: {
        [realId]: {
          ...oldState,
          articleId: realId,
        },
      },
      createdAt: currentData.createdAt,
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
    // Owner creates list with temp ID
    const { db: ownerDb, userId: ownerId } = await getAuthenticatedFirestore(TEST_USERS.owner.email);

    const tempId = generateTempId();
    const realId = `article_${Date.now()}`;

    const list = createTestList({
      ownerId: ownerId,
      name: 'Shared List',
    });

    // Get participant user ID (creates the user in Auth emulator)
    const { userId: participantId } = await getAuthenticatedFirestore(TEST_USERS.participant.email);

    // Switch back to owner for creating the list
    await getAuthenticatedFirestore(TEST_USERS.owner.email);

    list.sharedWith = [participantId];
    list.articleIds = [tempId];
    list.itemStates = {
      [tempId]: createItemState(tempId, { isChecked: false }),
    };

    const listRef = doc(ownerDb, `users-v2/${ownerId}/lists/${list.id}`);
    await setDoc(listRef, {
      id: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      articleIds: list.articleIds,
      itemStates: list.itemStates,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Owner syncs and replaces temp ID
    // Read current document, modify, write back completely
    const currentDoc = await getDoc(listRef);

    if (!currentDoc.exists()) {
      throw new Error('Document does not exist after creation');
    }

    const currentData = currentDoc.data();

    // Explicitly preserve all required fields to avoid permission issues
    await setDoc(listRef, {
      id: currentData.id,
      name: currentData.name,
      color: currentData.color,
      icon: currentData.icon,
      ownerId: currentData.ownerId,
      sharedWith: currentData.sharedWith || [],
      articleIds: [realId],
      itemStates: {
        [realId]: createItemState(realId, { isChecked: false }),
      },
      createdAt: currentData.createdAt,
      updatedAt: Timestamp.now(),
    });

    // Switch to participant to read the list
    await getAuthenticatedFirestore(TEST_USERS.participant.email);
    const db = getTestFirestore();
    const participantSnapshot = await getDoc(
      doc(db, `users-v2/${ownerId}/lists/${list.id}`)
    );
    const participantData = participantSnapshot.data();

    // Participant should see real ID, not temp ID
    expect(participantData).toBeDefined();
    expect(participantData!.articleIds).toHaveLength(1);
    expect(participantData!.articleIds[0]).toBe(realId);
    expect(participantData!.articleIds[0]).not.toMatch(/^temp_/);
  });
});
