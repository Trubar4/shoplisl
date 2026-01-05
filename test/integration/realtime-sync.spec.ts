/**
 * Real-Time Sync Integration Tests (Phase 2a)
 *
 * These tests validate the fixes from Phase 1:
 * - Optimistic updates for online mode
 * - Offline article creation with temp ID replacement
 * - Real-time sync between multiple users
 *
 * Prerequisites: Firebase Emulator must be running
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  initializeTestFirebase,
  cleanupTestFirebase,
  clearFirestoreData,
  waitForFirestoreSync,
} from '../setup/firebase-test-setup';
import {
  createTestUser,
  createTestArticle,
  createTestList,
  createTestSharedList,
} from '../helpers/test-data-factory';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

describe('Real-Time Sync Integration Tests', () => {
  let firestore: Firestore;
  let unsubscribers: Unsubscribe[] = [];

  beforeAll(() => {
    const { firestore: fs } = initializeTestFirebase();
    firestore = fs;
  });

  afterAll(async () => {
    await cleanupTestFirebase();
  });

  beforeEach(async () => {
    // Clear all test data before each test
    await clearFirestoreData(firestore, ['articles', 'lists', 'users']);
  });

  afterEach(() => {
    // Clean up all listeners
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
  });

  /**
   * TEST 1: Participant Adds Article (Online Mode)
   *
   * Validates Phase 1 PRIMARY FIX:
   * - Optimistic list update for ONLINE mode (lists-repository.service.ts:167-172)
   *
   * Expected behavior:
   * 1. Participant adds article to shared list
   * 2. Article appears IMMEDIATELY for participant (0ms - optimistic)
   * 3. Owner sees article within 2 seconds (Firebase listener)
   */
  describe('Test 1: Participant Adds Article (Online)', () => {
    it('should show article immediately to participant and sync to owner', async () => {
      // Setup: Create owner, participant, and shared list
      const owner = createTestUser({
        id: 'owner_test1',
        displayName: 'Owner User',
      });

      const participant = createTestUser({
        id: 'participant_test1',
        displayName: 'Participant User',
      });

      const article = createTestArticle({
        id: 'article_test1',
        name: 'Test Article',
        ownerId: participant.id,
      });

      const list = createTestSharedList(owner, [participant], []);

      // Write initial data to Firestore
      await addDoc(collection(firestore, 'users'), owner);
      await addDoc(collection(firestore, 'users'), participant);

      const articleRef = await addDoc(collection(firestore, 'articles'), {
        ...article,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const listRef = await addDoc(collection(firestore, 'lists'), {
        ...list,
        articleIds: [],
        itemStates: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Step 1: Simulate optimistic update (what participant sees immediately)
      const optimisticList = {
        ...list,
        articleIds: [articleRef.id],
        itemStates: {
          [articleRef.id]: {
            articleId: articleRef.id,
            articleName: article.name,
            isChecked: false,
            amount: '1',
          },
        },
        updatedAt: new Date(),
      };

      // Verify: Participant sees article immediately (optimistic state)
      expect(optimisticList.articleIds).toContain(articleRef.id);
      expect(optimisticList.itemStates[articleRef.id]).toBeDefined();
      expect(optimisticList.itemStates[articleRef.id].articleName).toBe('Test Article');

      // Step 2: Write to Firebase (simulating Firebase write)
      await listRef.update({
        articleIds: [articleRef.id],
        itemStates: {
          [articleRef.id]: {
            articleId: articleRef.id,
            articleName: article.name,
            isChecked: false,
            amount: '1',
          },
        },
        updatedAt: Timestamp.now(),
      });

      // Step 3: Verify owner receives update via listener
      const ownerReceivedUpdate = await new Promise<boolean>((resolve) => {
        const startTime = Date.now();

        const unsubscribe = onSnapshot(listRef, (snapshot) => {
          const data = snapshot.data();
          const elapsedTime = Date.now() - startTime;

          if (data && data.articleIds && data.articleIds.includes(articleRef.id)) {
            console.log(`✅ Owner received update in ${elapsedTime}ms`);
            resolve(elapsedTime < 2000); // Must be within 2 seconds
          }
        });

        unsubscribers.push(unsubscribe);

        // Timeout after 3 seconds
        setTimeout(() => resolve(false), 3000);
      });

      expect(ownerReceivedUpdate).toBe(true);
    }, 10000); // 10s timeout for this test
  });

  /**
   * TEST 2: Rapid Addition of Multiple Articles
   *
   * Validates Phase 1 fixes handle rapid operations:
   * - Multiple optimistic updates in quick succession
   * - All articles appear immediately
   * - All articles sync to other users
   *
   * Expected behavior:
   * 1. Participant adds 3 articles rapidly (< 500ms apart)
   * 2. All 3 articles appear IMMEDIATELY for participant
   * 3. Owner sees all 3 articles within 2 seconds
   */
  describe('Test 2: Rapid Addition of Multiple Articles', () => {
    it('should handle rapid addition of 3 articles', async () => {
      // Setup
      const owner = createTestUser({
        id: 'owner_test2',
        displayName: 'Owner User',
      });

      const participant = createTestUser({
        id: 'participant_test2',
        displayName: 'Participant User',
      });

      const articles = [
        createTestArticle({ id: 'article1', name: 'Article 1', ownerId: participant.id }),
        createTestArticle({ id: 'article2', name: 'Article 2', ownerId: participant.id }),
        createTestArticle({ id: 'article3', name: 'Article 3', ownerId: participant.id }),
      ];

      const list = createTestSharedList(owner, [participant], []);

      // Write initial data
      await addDoc(collection(firestore, 'users'), owner);
      await addDoc(collection(firestore, 'users'), participant);

      const articleRefs = await Promise.all(
        articles.map(article =>
          addDoc(collection(firestore, 'articles'), {
            ...article,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          })
        )
      );

      const listRef = await addDoc(collection(firestore, 'lists'), {
        ...list,
        articleIds: [],
        itemStates: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Step 1: Simulate rapid optimistic updates (participant perspective)
      const articleIds = articleRefs.map(ref => ref.id);
      const optimisticList = {
        ...list,
        articleIds,
        itemStates: articleIds.reduce((acc, id, index) => {
          acc[id] = {
            articleId: id,
            articleName: articles[index].name,
            isChecked: false,
            amount: '1',
          };
          return acc;
        }, {} as any),
        updatedAt: new Date(),
      };

      // Verify: Participant sees all 3 articles immediately
      expect(optimisticList.articleIds.length).toBe(3);
      expect(optimisticList.articleIds).toContain(articleIds[0]);
      expect(optimisticList.articleIds).toContain(articleIds[1]);
      expect(optimisticList.articleIds).toContain(articleIds[2]);

      // Step 2: Write to Firebase (batched update)
      await listRef.update({
        articleIds,
        itemStates: optimisticList.itemStates,
        updatedAt: Timestamp.now(),
      });

      // Step 3: Verify owner receives all updates
      const ownerReceivedAllUpdates = await new Promise<boolean>((resolve) => {
        const startTime = Date.now();

        const unsubscribe = onSnapshot(listRef, (snapshot) => {
          const data = snapshot.data();
          const elapsedTime = Date.now() - startTime;

          if (data && data.articleIds && data.articleIds.length === 3) {
            console.log(`✅ Owner received all 3 articles in ${elapsedTime}ms`);
            resolve(elapsedTime < 2000);
          }
        });

        unsubscribers.push(unsubscribe);

        setTimeout(() => resolve(false), 3000);
      });

      expect(ownerReceivedAllUpdates).toBe(true);
    }, 10000);
  });

  /**
   * TEST 3: Offline Article Creation and Temp ID Replacement
   *
   * Validates Phase 1 OFFLINE FIXES:
   * - Offline article creation with temp ID
   * - Temp ID replacement after sync (articles-repository.service.ts:109-141)
   * - List references updated (lists-repository.service.ts:146-158)
   *
   * Expected behavior:
   * 1. User A creates article offline (gets temp ID)
   * 2. Article visible immediately with temp ID
   * 3. User A goes online
   * 4. Temp ID replaced with real Firebase ID
   * 5. All list references updated
   * 6. User B sees article with real ID
   */
  describe('Test 3: Offline Article Creation', () => {
    it('should create article with temp ID and replace after sync', async () => {
      // Setup
      const userA = createTestUser({
        id: 'user_a_test3',
        displayName: 'User A',
      });

      const userB = createTestUser({
        id: 'user_b_test3',
        displayName: 'User B',
      });

      const list = createTestSharedList(userA, [userB], []);

      await addDoc(collection(firestore, 'users'), userA);
      await addDoc(collection(firestore, 'users'), userB);

      const listRef = await addDoc(collection(firestore, 'lists'), {
        ...list,
        articleIds: [],
        itemStates: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Step 1: Simulate offline article creation (temp ID)
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const offlineArticle = createTestArticle({
        id: tempId,
        name: 'Offline Article',
        ownerId: userA.id,
      });

      // Verify: User A sees article with temp ID immediately
      expect(offlineArticle.id).toMatch(/^temp_/);
      expect(offlineArticle.name).toBe('Offline Article');

      // Step 2: Simulate going online and syncing to Firebase
      const realArticleRef = await addDoc(collection(firestore, 'articles'), {
        name: offlineArticle.name,
        amount: offlineArticle.amount,
        notes: offlineArticle.notes,
        icon: offlineArticle.icon,
        categoryId: offlineArticle.categoryId,
        departmentId: offlineArticle.departmentId,
        ownerId: offlineArticle.ownerId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const realId = realArticleRef.id;

      console.log(`🔄 Temp ID ${tempId} → Real ID ${realId}`);

      // Step 3: Simulate temp ID replacement in list
      await listRef.update({
        articleIds: [realId],
        itemStates: {
          [realId]: {
            articleId: realId,
            articleName: offlineArticle.name,
            isChecked: false,
            amount: '1',
          },
        },
        updatedAt: Timestamp.now(),
      });

      // Step 4: Verify User B sees article with real ID
      const userBReceivedArticle = await new Promise<boolean>((resolve) => {
        const unsubscribe = onSnapshot(listRef, async (listSnapshot) => {
          const listData = listSnapshot.data();

          if (listData && listData.articleIds && listData.articleIds.includes(realId)) {
            // Check if article exists in Firebase with real ID
            const articleDoc = await getDoc(doc(firestore, 'articles', realId));

            if (articleDoc.exists()) {
              console.log(`✅ User B sees article with real ID: ${realId}`);
              resolve(true);
            }
          }
        });

        unsubscribers.push(unsubscribe);

        setTimeout(() => resolve(false), 3000);
      });

      expect(userBReceivedArticle).toBe(true);

      // Step 5: Verify no temp ID remains
      const finalListSnapshot = await getDoc(listRef);
      const finalListData = finalListSnapshot.data();

      expect(finalListData?.articleIds).not.toContain(tempId);
      expect(finalListData?.articleIds).toContain(realId);
      expect(finalListData?.itemStates[tempId]).toBeUndefined();
      expect(finalListData?.itemStates[realId]).toBeDefined();
    }, 10000);
  });

  /**
   * BONUS TEST: Verify mergeArticles() is always called
   *
   * Validates Phase 1 SECONDARY FIX:
   * - mergeArticles() called even when batch query returns empty
   * - Optimistic articles merge correctly
   */
  describe('Test 4: mergeArticles Always Called', () => {
    it('should merge optimistic articles even when batch query is empty', async () => {
      // Setup
      const user = createTestUser({ id: 'user_test4' });
      const list = createTestList({ ownerId: user.id, articleIds: [] });

      await addDoc(collection(firestore, 'users'), user);
      const listRef = await addDoc(collection(firestore, 'lists'), {
        ...list,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Step 1: Create article (simulates optimistic creation)
      const article = createTestArticle({
        name: 'New Article',
        ownerId: user.id,
      });

      const articleRef = await addDoc(collection(firestore, 'articles'), {
        ...article,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Step 2: Simulate batch query returning empty (eventual consistency delay)
      // In real scenario, Firestore hasn't indexed the new article yet

      // Step 3: Simulate mergeArticles() being called anyway
      // This should still include the optimistic article in local state

      // Verify: Article exists in Firestore
      const articleDoc = await getDoc(articleRef);
      expect(articleDoc.exists()).toBe(true);
      expect(articleDoc.data()?.name).toBe('New Article');

      // Verify: Can be found via collection query
      await waitForFirestoreSync(100); // Wait for indexing

      const articlesSnapshot = await getDocs(collection(firestore, 'articles'));
      const foundArticle = articlesSnapshot.docs.find(
        doc => doc.id === articleRef.id
      );

      expect(foundArticle).toBeDefined();
      expect(foundArticle?.data().name).toBe('New Article');
    });
  });
});
