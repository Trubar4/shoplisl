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
  seedLegacyArticle,
  seedList,
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

    it('should deny another user from deleting an article they do not own', async () => {
      await seedArticle(TEST_USERS.alice, 'alice-article-1');

      const { assertFails } = await import('@firebase/rules-unit-testing');
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/alice-article-1`).delete()
      );

      // Article must still exist
      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/alice-article-1`
      );
      expect(doc).toBeDefined();
    });
  });

  // ============================================================
  // Delete – legacy articles without ownerId (pre-Phase-8 data)
  // ============================================================
  // These tests reproduce the exact scenario where the user picks an old
  // article (created before Phase 8, no ownerId field in Firestore) from the
  // autocomplete and tries to delete it.  Two independent fixes are tested:
  //
  //   Fix A – Firestore rules: resource.data.get('ownerId', request.auth.uid)
  //            defaults to the caller's uid when the field is absent, so the
  //            DELETE rule passes without requiring any app-level change.
  //
  //   Fix B – App code: repairArticleOwnerId() writes {ownerId: uid} before
  //            deleteArticleInFirebase() so even the *old* strict rule passes.
  //
  // Both fixes are exercised here; the emulator loads the current
  // firestore.rules from disk so Fix A tests the deployed rule change.

  describe('Delete - legacy articles without ownerId (pre-Phase-8)', () => {
    it('[Fix A] deletes own legacy article that has NO ownerId via updated Firestore rule', async () => {
      // Seed without ownerId — simulates pre-Phase-8 data
      await seedLegacyArticle(TEST_USERS.alice, 'legacy-aa3');

      // Verify there is genuinely no ownerId field in Firestore
      const before = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/legacy-aa3`);
      expect(before).toBeDefined();
      expect(before!['ownerId']).toBeUndefined();

      // The updated rule uses resource.data.get('ownerId', request.auth.uid)
      // so deletion must succeed even without the ownerId field.
      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/legacy-aa3`).delete()
      );

      const after = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/legacy-aa3`);
      expect(after).toBeUndefined(); // document is gone
    });

    it('[Fix A] another user still cannot delete a legacy article (no ownerId) from someone else\'s path', async () => {
      await seedLegacyArticle(TEST_USERS.alice, 'legacy-protected');

      const { assertFails } = await import('@firebase/rules-unit-testing');
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/legacy-protected`).delete()
      );

      // Article must still exist
      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/legacy-protected`);
      expect(doc).toBeDefined();
    });

    it('[Fix B] repair then delete: write ownerId first, then delete succeeds (repairArticleOwnerId pattern)', async () => {
      // Seed without ownerId
      await seedLegacyArticle(TEST_USERS.alice, 'legacy-repair');

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');

      // Step 1: repairArticleOwnerId — write ownerId to satisfy even the old strict rule
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/legacy-repair`).update({
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      // Verify ownerId is now stored
      const repaired = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/legacy-repair`);
      expect(repaired!['ownerId']).toBe(TEST_USERS.alice);

      // Step 2: deleteArticleInFirebase — now succeeds under both old and new rule
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/legacy-repair`).delete()
      );

      const after = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/legacy-repair`);
      expect(after).toBeUndefined();
    });

    it('[Fix B] repair is idempotent: writing ownerId on modern article (already has it) still allows delete', async () => {
      // Modern article already has ownerId — repair must not break anything
      await seedArticle(TEST_USERS.alice, 'modern-article');

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');

      // Repair (no-op for modern articles)
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/modern-article`).update({
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      // Delete must still succeed
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/modern-article`).delete()
      );

      const after = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/modern-article`);
      expect(after).toBeUndefined();
    });
  });

  // ============================================================
  // Full delete workflow (Firestore-level end-to-end)
  // ============================================================
  // Mirrors the exact sequence of Firestore writes that
  // deleteArticleAndCleanupLists() performs in the app:
  //   1. removeArticleFromAllLists  → update list
  //   2. repairArticleOwnerId       → update article.ownerId
  //   3. deleteArticleInFirebase    → delete article document

  describe('Full delete workflow', () => {
    it('full workflow with legacy article: list cleaned, article deleted, both clean in Firestore', async () => {
      // Seed: legacy article (no ownerId) in a list
      await seedLegacyArticle(TEST_USERS.alice, 'wf-legacy', { name: 'AA3' });
      await seedList(TEST_USERS.alice, 'wf-list', {
        articleIds: ['wf-legacy'],
        itemStates: { 'wf-legacy': { articleId: 'wf-legacy', isChecked: false } },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');

      // Step 1: removeArticleFromAllLists
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/wf-list`).update({
          articleIds: [],
          itemStates: {},
          updatedAt: Timestamp.now(),
        })
      );

      // Step 2: repairArticleOwnerId
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/wf-legacy`).update({
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      // Step 3: deleteArticleInFirebase
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/wf-legacy`).delete()
      );

      // List: no article references remain
      const listDoc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/wf-list`);
      expect(listDoc!['articleIds']).toEqual([]);
      expect(listDoc!['itemStates']).toEqual({});

      // Article: document is gone
      const artDoc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/wf-legacy`);
      expect(artDoc).toBeUndefined();
    });

    it('full workflow with modern article: same sequence works unchanged', async () => {
      // Seed: modern article (has ownerId) in a list — the common case
      await seedArticle(TEST_USERS.alice, 'wf-modern', { name: 'Modern AA3' });
      await seedList(TEST_USERS.alice, 'wf-list-modern', {
        articleIds: ['wf-modern'],
        itemStates: { 'wf-modern': { articleId: 'wf-modern', isChecked: false } },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');

      // Step 1
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/wf-list-modern`).update({
          articleIds: [],
          itemStates: {},
          updatedAt: Timestamp.now(),
        })
      );

      // Step 2 (repair is a no-op for modern articles but must still succeed)
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/wf-modern`).update({
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      // Step 3
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/wf-modern`).delete()
      );

      const listDoc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/wf-list-modern`);
      expect(listDoc!['articleIds']).toEqual([]);
      const artDoc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/wf-modern`);
      expect(artDoc).toBeUndefined();
    });

    it('surviving article remains in list after deleting one of two articles', async () => {
      await seedArticle(TEST_USERS.alice, 'keep', { name: 'Surviving' });
      await seedLegacyArticle(TEST_USERS.alice, 'gone', { name: 'ToDelete' });
      await seedList(TEST_USERS.alice, 'mixed-list', {
        articleIds: ['keep', 'gone'],
        itemStates: {
          keep: { articleId: 'keep', isChecked: false },
          gone: { articleId: 'gone', isChecked: false },
        },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const { assertSucceeds } = await import('@firebase/rules-unit-testing');

      // Step 1: remove only the deleted article from list
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/mixed-list`).update({
          articleIds: ['keep'],
          itemStates: { keep: { articleId: 'keep', isChecked: false } },
          updatedAt: Timestamp.now(),
        })
      );

      // Step 2: repair ownerId on the article to be deleted
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/gone`).update({
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );

      // Step 3: delete the article
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/gone`).delete()
      );

      const listDoc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/mixed-list`);
      expect(listDoc!['articleIds']).toEqual(['keep']);
      expect(listDoc!['itemStates']).toHaveProperty('keep');
      expect(listDoc!['itemStates']).not.toHaveProperty('gone');

      const keptArt = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/keep`);
      expect(keptArt).toBeDefined();

      const goneArt = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/gone`);
      expect(goneArt).toBeUndefined();
    });
  });

  // ============================================================
  // List cleanup after article deletion (resurrection bug guard)
  // ============================================================

  describe('List cleanup after article deletion', () => {
    it('after removing article from list in Firestore, list state should be clean', async () => {
      // Seed: article + list that contains the article (with itemState)
      await seedArticle(TEST_USERS.alice, 'art-surviving', { name: 'Surviving' });
      await seedArticle(TEST_USERS.alice, 'art-deleted',   { name: 'ToDelete' });
      await seedList(TEST_USERS.alice, 'list-cleanup-test', {
        articleIds: ['art-surviving', 'art-deleted'],
        itemStates: {
          'art-surviving': { articleId: 'art-surviving', isChecked: false },
          'art-deleted':   { articleId: 'art-deleted',   isChecked: false },
        },
      });

      // Simulate removeArticleFromAllLists: update list to remove the deleted article
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-cleanup-test`).update({
          articleIds: ['art-surviving'],
          itemStates: { 'art-surviving': { articleId: 'art-surviving', isChecked: false } },
        })
      );

      // Simulate deleteArticleInFirebase: delete the article document
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/art-deleted`).delete()
      );

      // Verify: list no longer references the deleted article
      const listDoc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-cleanup-test`
      );
      expect(listDoc).toBeDefined();
      expect(listDoc!['articleIds']).toEqual(['art-surviving']);
      expect(listDoc!['itemStates']).not.toHaveProperty('art-deleted');

      // Verify: surviving article still in list
      expect((listDoc!['articleIds'] as string[])).toContain('art-surviving');
      expect(listDoc!['itemStates']).toHaveProperty('art-surviving');

      // Verify: deleted article document is gone
      const artDoc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/articles/art-deleted`
      );
      expect(artDoc).toBeUndefined();
    });

    it('an empty list after deleting the last article has clean Firestore state', async () => {
      // Seed: list with exactly one article (will be deleted → list becomes empty)
      await seedArticle(TEST_USERS.alice, 'art-only', { name: 'OnlyArticle' });
      await seedList(TEST_USERS.alice, 'list-single-article', {
        articleIds: ['art-only'],
        itemStates: { 'art-only': { articleId: 'art-only', isChecked: false } },
      });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      // Remove article from list
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-single-article`).update({
          articleIds: [],
          itemStates: {},
        })
      );
      // Delete article document
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/art-only`).delete()
      );

      const listDoc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-single-article`
      );
      expect(listDoc).toBeDefined();
      expect(listDoc!['articleIds']).toEqual([]);
      expect(listDoc!['itemStates']).toEqual({});
    });
  });
});
