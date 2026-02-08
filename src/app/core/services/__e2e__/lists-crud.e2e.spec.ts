/**
 * Lists CRUD E2E Tests
 *
 * Tests real Firestore read/write/update/delete operations for shopping lists
 * against the local emulator. Validates data integrity, timestamps, and queries.
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
  seedList,
  readDocAsAdmin,
  TEST_USERS,
} from './firestore-e2e.setup';

describe('Lists CRUD Operations', () => {
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
    it('should create a list and persist all fields', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const now = Timestamp.now();

      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).set({
          id: 'list-1',
          name: 'Weekly Groceries',
          color: '#FF5733',
          icon: 'shopping_cart',
          ownerId: TEST_USERS.alice,
          articleIds: ['article-1', 'article-2'],
          itemStates: {
            'article-1': {
              articleId: 'article-1',
              articleName: 'Milk',
              isChecked: false,
              amount: '2L',
            },
            'article-2': {
              articleId: 'article-2',
              articleName: 'Bread',
              isChecked: true,
              checkedAt: now,
            },
          },
          departmentOrder: ['dairy-products', 'bread'],
          createdAt: now,
          updatedAt: now,
        })
      );

      // Verify persisted data
      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc).toBeDefined();
      expect(doc!['name']).toBe('Weekly Groceries');
      expect(doc!['color']).toBe('#FF5733');
      expect(doc!['icon']).toBe('shopping_cart');
      expect(doc!['ownerId']).toBe(TEST_USERS.alice);
      expect(doc!['articleIds']).toEqual(['article-1', 'article-2']);
      expect(
        (doc!['itemStates'] as Record<string, unknown>)['article-1']
      ).toEqual(
        expect.objectContaining({
          articleId: 'article-1',
          articleName: 'Milk',
          isChecked: false,
          amount: '2L',
        })
      );
    });

    it('should create a minimal list with only required fields', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-minimal`).set({
          id: 'list-minimal',
          name: 'Quick List',
          ownerId: TEST_USERS.alice,
          articleIds: [],
          itemStates: {},
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-minimal`
      );
      expect(doc).toBeDefined();
      expect(doc!['articleIds']).toEqual([]);
      expect(doc!['itemStates']).toEqual({});
    });

    it('should create multiple lists for the same user', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const makeList = (id: string, name: string) => ({
        id,
        name,
        ownerId: TEST_USERS.alice,
        articleIds: [],
        itemStates: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-a`).set(makeList('list-a', 'List A'))
      );
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-b`).set(makeList('list-b', 'List B'))
      );
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-c`).set(makeList('list-c', 'List C'))
      );

      // Query all lists
      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/lists`)
        .get();
      expect(snapshot.docs.length).toBe(3);
    });
  });

  // ========================================
  // Read
  // ========================================

  describe('Read', () => {
    it('should read a single list with all fields intact', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        name: 'Groceries',
        color: '#123456',
        articleIds: ['a1', 'a2'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Eggs', isChecked: false },
        },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snap = await db
        .doc(`users-v2/${TEST_USERS.alice}/lists/list-1`)
        .get();
      const data = snap.data();

      expect(data).toBeDefined();
      expect(data!['name']).toBe('Groceries');
      expect(data!['color']).toBe('#123456');
      expect(data!['articleIds']).toEqual(['a1', 'a2']);
    });

    it('should return empty snapshot for non-existent list', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snap = await db
        .doc(`users-v2/${TEST_USERS.alice}/lists/doesnt-exist`)
        .get();
      expect(snap.exists).toBe(false);
    });

    it('should query lists collection for a user', async () => {
      await seedList(TEST_USERS.alice, 'list-1', { name: 'First' });
      await seedList(TEST_USERS.alice, 'list-2', { name: 'Second' });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/lists`)
        .get();
      expect(snapshot.docs.length).toBe(2);
      const names = snapshot.docs.map((d) => d.data()['name']).sort();
      expect(names).toEqual(['First', 'Second']);
    });
  });

  // ========================================
  // Update
  // ========================================

  describe('Update', () => {
    it('should update list name and preserve other fields', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        name: 'Old Name',
        color: '#FF0000',
        articleIds: ['a1'],
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          name: 'New Name',
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc!['name']).toBe('New Name');
      expect(doc!['color']).toBe('#FF0000'); // unchanged
      expect(doc!['articleIds']).toEqual(['a1']); // unchanged
    });

    it('should add articles to a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        articleIds: ['a1'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Milk', isChecked: false },
        },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          articleIds: ['a1', 'a2'],
          'itemStates.a2': {
            articleId: 'a2',
            articleName: 'Bread',
            isChecked: false,
            addedAt: Timestamp.now(),
          },
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc!['articleIds']).toEqual(['a1', 'a2']);
      const states = doc!['itemStates'] as Record<string, Record<string, unknown>>;
      expect(states['a2']['articleName']).toBe('Bread');
    });

    it('should check/uncheck an article in a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        articleIds: ['a1'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Milk', isChecked: false },
        },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const checkedAt = Timestamp.now();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          'itemStates.a1.isChecked': true,
          'itemStates.a1.checkedAt': checkedAt,
          'itemStates.a1.checkedBy': TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      const states = doc!['itemStates'] as Record<string, Record<string, unknown>>;
      expect(states['a1']['isChecked']).toBe(true);
      expect(states['a1']['checkedBy']).toBe(TEST_USERS.alice);
    });

    it('should update sharedWith to add a collaborator', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [],
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc!['sharedWith']).toEqual([TEST_USERS.bob]);
    });

    it('should update department order', async () => {
      await seedList(TEST_USERS.alice, 'list-1');

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const newOrder = ['frozen-goods', 'dairy-products', 'bread'];
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          departmentOrder: newOrder,
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc!['departmentOrder']).toEqual(newOrder);
    });
  });

  // ========================================
  // Delete
  // ========================================

  describe('Delete', () => {
    it('should delete a list and confirm it no longer exists', async () => {
      await seedList(TEST_USERS.alice, 'list-1');

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).delete()
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      expect(doc).toBeUndefined();
    });

    it('should only delete the target list, not others', async () => {
      await seedList(TEST_USERS.alice, 'list-1', { name: 'Keep Me' });
      await seedList(TEST_USERS.alice, 'list-2', { name: 'Delete Me' });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-2`).delete()
      );

      const kept = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-1`
      );
      const deleted = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-2`
      );
      expect(kept).toBeDefined();
      expect(kept!['name']).toBe('Keep Me');
      expect(deleted).toBeUndefined();
    });
  });
});
