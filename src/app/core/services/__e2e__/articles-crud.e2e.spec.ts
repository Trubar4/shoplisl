/**
 * Articles CRUD E2E Tests
 *
 * Tests real Firestore read/write/update/delete operations for articles
 * against the local emulator. Validates data integrity and ownership.
 *
 * Run: npm run test:firestore
 * Requires: firebase emulators:start --only auth,firestore
 */
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearFirestoreData,
  getAuthContext,
  seedArticle,
  readDocAsAdmin,
  TEST_USERS,
} from './firestore-e2e.setup';

describe('Articles CRUD Operations', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  afterEach(async () => {
    await clearFirestoreData();
  });

  // ========================================
  // Create
  // ========================================

  describe('Create', () => {
    it('should create an article with all fields', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const now = Timestamp.now();

      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).set({
          id: 'article-1',
          name: 'Vollmilch 3.5%',
          amount: '2L',
          notes: 'Bio preferred',
          icon: 'milk',
          categoryId: 'dairy',
          departmentId: 'dairy-products',
          ownerId: TEST_USERS.alice,
          usageCount: 0,
          numberOfChecks: 0,
          createdAt: now,
          updatedAt: now,
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-1`
      );
      expect(doc).toBeDefined();
      expect(doc!['name']).toBe('Vollmilch 3.5%');
      expect(doc!['amount']).toBe('2L');
      expect(doc!['notes']).toBe('Bio preferred');
      expect(doc!['departmentId']).toBe('dairy-products');
      expect(doc!['ownerId']).toBe(TEST_USERS.alice);
    });

    it('should create a minimal article', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-min`).set({
          id: 'article-min',
          name: 'Bread',
          ownerId: TEST_USERS.alice,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-min`
      );
      expect(doc).toBeDefined();
      expect(doc!['name']).toBe('Bread');
    });

    it('should create multiple articles for the same user', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const articles = ['Milk', 'Bread', 'Eggs', 'Butter', 'Cheese'];

      for (let i = 0; i < articles.length; i++) {
        await db
          .doc(`users-v2/${TEST_USERS.alice}/articles/article-${i}`)
          .set({
            id: `article-${i}`,
            name: articles[i],
            ownerId: TEST_USERS.alice,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
      }

      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/articles`)
        .get();
      expect(snapshot.docs.length).toBe(5);
    });

    it('should create articles with copiedFrom field (shared article copy)', async () => {
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.bob}/articles/article-copy`).set({
          id: 'article-copy',
          name: 'Shared Milk',
          ownerId: TEST_USERS.bob,
          copiedFrom: 'original-article-id',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.bob}/articles/article-copy`
      );
      expect(doc!['copiedFrom']).toBe('original-article-id');
    });
  });

  // ========================================
  // Read
  // ========================================

  describe('Read', () => {
    it('should read an article with all fields', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1', {
        name: 'Organic Eggs',
        amount: '10 Stk',
        departmentId: 'dairy-products',
        usageCount: 5,
        numberOfChecks: 12,
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snap = await db
        .doc(`users-v2/${TEST_USERS.alice}/articles/article-1`)
        .get();
      const data = snap.data();

      expect(data!['name']).toBe('Organic Eggs');
      expect(data!['amount']).toBe('10 Stk');
      expect(data!['usageCount']).toBe(5);
      expect(data!['numberOfChecks']).toBe(12);
    });

    it('should return empty for non-existent article', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snap = await db
        .doc(`users-v2/${TEST_USERS.alice}/articles/nope`)
        .get();
      expect(snap.exists).toBe(false);
    });

    it('should query all articles for a user', async () => {
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Milk' });
      await seedArticle(TEST_USERS.alice, 'a2', { name: 'Bread' });
      await seedArticle(TEST_USERS.alice, 'a3', { name: 'Eggs' });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/articles`)
        .get();
      expect(snapshot.docs.length).toBe(3);
    });

    it('should allow another authenticated user to read articles', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1', { name: 'Milk' });

      const db = getAuthContext(TEST_USERS.bob).firestore();
      const snap = await db
        .doc(`users-v2/${TEST_USERS.alice}/articles/article-1`)
        .get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!['name']).toBe('Milk');
    });
  });

  // ========================================
  // Update
  // ========================================

  describe('Update', () => {
    it('should update article name and preserve other fields', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1', {
        name: 'Old Milk',
        amount: '1L',
        departmentId: 'dairy-products',
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).update({
          name: 'Fresh Milk',
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-1`
      );
      expect(doc!['name']).toBe('Fresh Milk');
      expect(doc!['amount']).toBe('1L'); // unchanged
      expect(doc!['departmentId']).toBe('dairy-products'); // unchanged
    });

    it('should update usage statistics', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1', {
        usageCount: 5,
        numberOfChecks: 10,
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const now = Timestamp.now();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).update({
          usageCount: 6,
          numberOfChecks: 11,
          lastCheckedDate: now,
          lastAddedToListDate: now,
          ownerId: TEST_USERS.alice,
          updatedAt: now,
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-1`
      );
      expect(doc!['usageCount']).toBe(6);
      expect(doc!['numberOfChecks']).toBe(11);
    });

    it('should update department assignment', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1', {
        departmentId: 'dairy-products',
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).update({
          departmentId: 'frozen-goods',
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-1`
      );
      expect(doc!['departmentId']).toBe('frozen-goods');
    });
  });

  // ========================================
  // Delete
  // ========================================

  describe('Delete', () => {
    it('should delete an article and confirm it is gone', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).delete()
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/article-1`
      );
      expect(doc).toBeUndefined();
    });

    it('should only delete the target article, not others', async () => {
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Keep' });
      await seedArticle(TEST_USERS.alice, 'a2', { name: 'Delete' });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/a2`).delete()
      );

      const kept = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/a1`
      );
      const deleted = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/a2`
      );
      expect(kept).toBeDefined();
      expect(kept!['name']).toBe('Keep');
      expect(deleted).toBeUndefined();
    });
  });
});
