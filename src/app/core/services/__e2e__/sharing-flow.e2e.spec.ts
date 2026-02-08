/**
 * Sharing Flow E2E Tests
 *
 * Tests the complete sharing lifecycle: creating invites, accepting them,
 * collaborative editing, unsharing, and cleanup - all against the real
 * Firestore emulator with security rules enforced.
 *
 * Run: npm run test:firestore
 * Requires: firebase emulators:start --only auth,firestore
 */
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearFirestoreData,
  getAuthContext,
  seedList,
  seedShareInvite,
  readDocAsAdmin,
  TEST_USERS,
} from './firestore-e2e.setup';

describe('Sharing Flow E2E', () => {
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
  // Full Sharing Lifecycle
  // ========================================

  describe('Complete sharing lifecycle', () => {
    it('should complete full flow: create invite → accept → collaborate → unshare', async () => {
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();

      // Step 1: Alice creates a list
      await assertSucceeds(
        aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).set({
          id: 'shared-list',
          name: 'Party Shopping',
          ownerId: TEST_USERS.alice,
          articleIds: ['chips'],
          itemStates: {
            chips: { articleId: 'chips', articleName: 'Chips', isChecked: false },
          },
          sharedWith: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );

      // Step 2: Alice creates a share invite
      await assertSucceeds(
        aliceDb.doc('share-invites/invite-party').set({
          id: 'invite-party',
          listId: 'shared-list',
          listName: 'Party Shopping',
          fromUserId: TEST_USERS.alice,
          fromUserEmail: 'alice@test.com',
          inviteToken: 'token-party-123',
          status: 'pending',
          createdAt: Timestamp.now(),
        })
      );

      // Step 3: Bob reads the invite
      const inviteSnap = await bobDb.doc('share-invites/invite-party').get();
      expect(inviteSnap.exists).toBe(true);
      expect(inviteSnap.data()!['status']).toBe('pending');

      // Step 4: Bob accepts the invite (updates invite status)
      await assertSucceeds(
        bobDb.doc('share-invites/invite-party').update({
          status: 'accepted',
          acceptedByUserId: TEST_USERS.bob,
          acceptedAt: Timestamp.now(),
        })
      );

      // Step 5: Bob adds himself to the list's sharedWith (invite acceptance)
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );

      // Step 6: Bob can now read the shared list
      const listSnap = await bobDb
        .doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`)
        .get();
      expect(listSnap.exists).toBe(true);
      expect(listSnap.data()!['name']).toBe('Party Shopping');

      // Step 7: Bob adds an article to the shared list
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
          articleIds: ['chips', 'salsa'],
          'itemStates.salsa': {
            articleId: 'salsa',
            articleName: 'Salsa Dip',
            isChecked: false,
            addedAt: Timestamp.now(),
          },
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );

      // Verify the article was added
      const updatedList = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/shared-list`
      );
      expect(updatedList!['articleIds']).toEqual(['chips', 'salsa']);

      // Step 8: Bob checks an article
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
          'itemStates.chips.isChecked': true,
          'itemStates.chips.checkedAt': Timestamp.now(),
          'itemStates.chips.checkedBy': TEST_USERS.bob,
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );

      // Verify check
      const checkedList = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/shared-list`
      );
      const states = checkedList!['itemStates'] as Record<string, Record<string, unknown>>;
      expect(states['chips']['isChecked']).toBe(true);
      expect(states['chips']['checkedBy']).toBe(TEST_USERS.bob);

      // Step 9: Alice removes Bob from shared list (unshare)
      await assertSucceeds(
        aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
          sharedWith: [],
          updatedAt: Timestamp.now(),
        })
      );

      // Step 10: Bob can no longer read the list
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).get()
      );

      // Step 11: Alice tries to create an unshare notification for Bob
      // This should FAIL - rules say only userId == request.auth.uid can write
      await assertFails(
        aliceDb
          .doc(`users-v2/${TEST_USERS.bob}/unshare-notifications/notif-party`)
          .set({
            id: 'notif-party',
            listId: 'shared-list',
            listName: 'Party Shopping',
            ownerUserId: TEST_USERS.alice,
            ownerEmail: 'alice@test.com',
            removedUserId: TEST_USERS.bob,
            createdAt: Timestamp.now(),
            seen: false,
          })
      );

      // Step 12: Bob creates his own unshare notification (this is how the app should work)
      await assertSucceeds(
        bobDb
          .doc(`users-v2/${TEST_USERS.bob}/unshare-notifications/notif-party`)
          .set({
            id: 'notif-party',
            listId: 'shared-list',
            listName: 'Party Shopping',
            ownerUserId: TEST_USERS.alice,
            ownerEmail: 'alice@test.com',
            removedUserId: TEST_USERS.bob,
            createdAt: Timestamp.now(),
            seen: false,
          })
      );
    });
  });

  // ========================================
  // Multi-user Sharing
  // ========================================

  describe('Multi-user sharing', () => {
    it('should allow multiple users to collaborate on the same list', async () => {
      // Alice creates a list shared with Bob and Charlie
      await seedList(TEST_USERS.alice, 'multi-share', {
        name: 'BBQ List',
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
        articleIds: [],
        itemStates: {},
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      const charlieDb = getAuthContext(TEST_USERS.charlie).firestore();

      // Bob can read it
      const bobSnap = await bobDb
        .doc(`users-v2/${TEST_USERS.alice}/lists/multi-share`)
        .get();
      expect(bobSnap.exists).toBe(true);

      // Charlie can read it
      const charlieSnap = await charlieDb
        .doc(`users-v2/${TEST_USERS.alice}/lists/multi-share`)
        .get();
      expect(charlieSnap.exists).toBe(true);

      // Bob adds an article
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/multi-share`).update({
          articleIds: ['burgers'],
          'itemStates.burgers': {
            articleId: 'burgers',
            articleName: 'Burgers',
            isChecked: false,
          },
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
          updatedAt: Timestamp.now(),
        })
      );

      // Charlie checks it
      await assertSucceeds(
        charlieDb
          .doc(`users-v2/${TEST_USERS.alice}/lists/multi-share`)
          .update({
            'itemStates.burgers.isChecked': true,
            'itemStates.burgers.checkedBy': TEST_USERS.charlie,
            ownerId: TEST_USERS.alice,
            sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
            updatedAt: Timestamp.now(),
          })
      );

      // Verify
      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/multi-share`
      );
      const states = doc!['itemStates'] as Record<string, Record<string, unknown>>;
      expect(states['burgers']['isChecked']).toBe(true);
      expect(states['burgers']['checkedBy']).toBe(TEST_USERS.charlie);
    });

    it('should allow one user to leave without affecting other collaborators', async () => {
      await seedList(TEST_USERS.alice, 'team-list', {
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
      });

      // Bob removes himself
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/team-list`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.charlie], // only charlie remains
          updatedAt: Timestamp.now(),
        })
      );

      // Charlie still has access
      const charlieDb = getAuthContext(TEST_USERS.charlie).firestore();
      const charlieSnap = await charlieDb
        .doc(`users-v2/${TEST_USERS.alice}/lists/team-list`)
        .get();
      expect(charlieSnap.exists).toBe(true);

      // Bob no longer has access
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/team-list`).get()
      );
    });
  });

  // ========================================
  // Share Invite Edge Cases
  // ========================================

  describe('Share invite edge cases', () => {
    it('should prevent non-sender from deleting an invite', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(bobDb.doc('share-invites/invite-1').delete());
    });

    it('should allow sender to clean up their invite after acceptance', async () => {
      await seedShareInvite('invite-cleanup', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-cleanup',
        status: 'accepted',
        acceptedByUserId: TEST_USERS.bob,
      });

      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        aliceDb.doc('share-invites/invite-cleanup').delete()
      );

      const doc = await readDocAsAdmin('share-invites/invite-cleanup');
      expect(doc).toBeUndefined();
    });
  });

  // ========================================
  // Security Boundary Tests
  // ========================================

  describe('Sharing security boundaries', () => {
    it('should prevent shared user from deleting the list', async () => {
      await seedList(TEST_USERS.alice, 'list-no-delete', {
        sharedWith: [TEST_USERS.bob],
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/list-no-delete`).delete()
      );
    });

    it('should prevent shared user from changing ownership', async () => {
      await seedList(TEST_USERS.alice, 'list-no-steal', {
        sharedWith: [TEST_USERS.bob],
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/list-no-steal`).update({
          ownerId: TEST_USERS.bob, // trying to steal ownership
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should prevent shared user from removing other collaborators', async () => {
      await seedList(TEST_USERS.alice, 'list-no-kick', {
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/list-no-kick`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob], // bob tried to remove charlie
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should allow owner to remove a collaborator', async () => {
      await seedList(TEST_USERS.alice, 'list-kick', {
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
      });

      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/list-kick`).update({
          sharedWith: [TEST_USERS.charlie], // owner removes bob
          updatedAt: Timestamp.now(),
        })
      );

      const doc = await readDocAsAdmin(
        `users-v2/${TEST_USERS.alice}/lists/list-kick`
      );
      expect(doc!['sharedWith']).toEqual([TEST_USERS.charlie]);
    });

    it('should prevent non-shared user from accessing a shared list', async () => {
      await seedList(TEST_USERS.alice, 'list-private', {
        sharedWith: [TEST_USERS.bob],
      });

      const charlieDb = getAuthContext(TEST_USERS.charlie).firestore();
      await assertFails(
        charlieDb
          .doc(`users-v2/${TEST_USERS.alice}/lists/list-private`)
          .get()
      );
    });
  });
});
