/**
 * Firestore Security Rules E2E Tests
 *
 * Tests every rule in firestore.rules against the local emulator.
 * Each test makes a real Firestore operation and asserts it succeeds or fails
 * based on the security rules.
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
  getUnauthContext,
  seedUser,
  seedList,
  seedArticle,
  seedShareInvite,
  restSet,
  restGet,
  restDelete,
  restUpdate,
  TEST_USERS,
} from './firestore-e2e.setup';

// ============================================================
// Test Suite
// ============================================================

describe('Firestore Security Rules', () => {
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
  // User Profiles (users-v2/{userId})
  // ========================================

  describe('User Profiles (users-v2/{userId})', () => {
    it('should allow authenticated user to read any user profile', async () => {
      await seedUser(TEST_USERS.alice);
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(db.doc(`users-v2/${TEST_USERS.alice}`).get());
    });

    it('should deny unauthenticated user from reading a profile', async () => {
      await seedUser(TEST_USERS.alice);
      const db = getUnauthContext().firestore();
      await assertFails(db.doc(`users-v2/${TEST_USERS.alice}`).get());
    });

    it('should allow user to write their own profile', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}`).set({
          id: TEST_USERS.alice,
          name: 'Alice',
          email: 'alice@test.com',
          createdAt: Timestamp.now(),
        })
      );
    });

    it('should deny user from writing another user profile', async () => {
      await seedUser(TEST_USERS.bob);
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.bob}`).set({
          id: TEST_USERS.bob,
          name: 'Hacked Bob',
          email: 'hacked@test.com',
          createdAt: Timestamp.now(),
        })
      );
    });
  });

  // ========================================
  // Articles (users-v2/{userId}/articles/{articleId})
  // ========================================

  describe('Articles (users-v2/{userId}/articles/{articleId})', () => {
    it('should allow owner to create an article in their path', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).set({
          id: 'article-1',
          name: 'Milk',
          ownerId: TEST_USERS.alice,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny creating an article with wrong ownerId', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).set({
          id: 'article-1',
          name: 'Milk',
          ownerId: TEST_USERS.bob, // wrong owner
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny creating an article in another user path', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.bob}/articles/article-1`).set({
          id: 'article-1',
          name: 'Milk',
          ownerId: TEST_USERS.alice,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should allow any authenticated user to read articles', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).get()
      );
    });

    it('should deny unauthenticated user from reading articles', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getUnauthContext().firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).get()
      );
    });

    it('should allow owner to update their article', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).update({
          name: 'Updated Milk',
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny other user from updating an article', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).update({
          name: 'Hacked Milk',
          ownerId: TEST_USERS.alice,
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should allow owner to delete their article', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).delete()
      );
    });

    it('should deny other user from deleting an article', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).delete()
      );
    });

    it('should allow admin to read any article', async () => {
      await seedArticle(TEST_USERS.alice, 'article-1');
      const db = getAuthContext(TEST_USERS.admin).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/articles/article-1`).get()
      );
    });
  });

  // ========================================
  // Lists (users-v2/{userId}/lists/{listId})
  // ========================================

  describe('Lists (users-v2/{userId}/lists/{listId})', () => {
    // --- Create ---

    it('should allow owner to create a list in their path', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).set({
          id: 'list-1',
          name: 'Groceries',
          ownerId: TEST_USERS.alice,
          articleIds: [],
          itemStates: {},
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny creating a list with wrong ownerId', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).set({
          id: 'list-1',
          name: 'Groceries',
          ownerId: TEST_USERS.bob,
          articleIds: [],
          itemStates: {},
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny creating a list in another user path', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.bob}/lists/list-1`).set({
          id: 'list-1',
          name: 'Groceries',
          ownerId: TEST_USERS.alice,
          articleIds: [],
          itemStates: {},
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      );
    });

    // --- Read ---

    it('should allow owner to read their own list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).get()
      );
    });

    it('should allow shared user to read a shared list', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).get()
      );
    });

    it('should deny non-shared user from reading a list in another path', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.charlie).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).get()
      );
    });

    it('should deny unauthenticated user from reading a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getUnauthContext().firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).get()
      );
    });

    it('should allow admin to read any list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.admin).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).get()
      );
    });

    // --- Update (Owner) ---

    it('should allow owner to update their list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          name: 'Updated Groceries',
          updatedAt: Timestamp.now(),
        })
      );
    });

    // --- Update (Collaborator) ---

    it('should allow shared user to update list content', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          name: 'Bobs Groceries',
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny shared user from changing ownership', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          ownerId: TEST_USERS.bob,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should allow shared user to remove themselves from sharedWith', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.charlie], // bob removed himself
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('should deny shared user from removing another user from sharedWith', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob, TEST_USERS.charlie],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob], // bob tried to remove charlie
          updatedAt: Timestamp.now(),
        })
      );
    });

    // --- Update (Invite Acceptance) ---

    it('should allow user to add themselves to sharedWith (invite acceptance)', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );
    });

    // --- Update (Non-collaborator) ---

    it('should deny non-shared user from updating a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.charlie).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).update({
          name: 'Hacked',
          updatedAt: Timestamp.now(),
        })
      );
    });

    // --- Delete ---

    it('should allow owner to delete their list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).delete()
      );
    });

    it('should deny shared user from deleting a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1', {
        sharedWith: [TEST_USERS.bob],
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).delete()
      );
    });

    it('should deny non-shared user from deleting a list', async () => {
      await seedList(TEST_USERS.alice, 'list-1');
      const db = getAuthContext(TEST_USERS.charlie).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/lists/list-1`).delete()
      );
    });
  });

  // ========================================
  // Unshare Notifications
  // ========================================

  describe('Unshare Notifications (users-v2/{userId}/unshare-notifications/{id})', () => {
    it('should allow user to read their own notifications', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      // First create a notification (write)
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/unshare-notifications/notif-1`).set({
          id: 'notif-1',
          listId: 'list-1',
          listName: 'Groceries',
          ownerUserId: TEST_USERS.bob,
          ownerEmail: 'bob@test.com',
          removedUserId: TEST_USERS.alice,
          createdAt: Timestamp.now(),
          seen: false,
        })
      );
      // Then read it
      await assertSucceeds(
        db.doc(`users-v2/${TEST_USERS.alice}/unshare-notifications/notif-1`).get()
      );
    });

    it('should deny user from reading another user notifications', async () => {
      // Seed notification for alice
      await seedUser(TEST_USERS.alice);
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      await aliceDb.doc(`users-v2/${TEST_USERS.alice}/unshare-notifications/notif-1`).set({
        id: 'notif-1',
        listId: 'list-1',
        listName: 'Groceries',
        ownerUserId: TEST_USERS.bob,
        ownerEmail: 'bob@test.com',
        removedUserId: TEST_USERS.alice,
        createdAt: Timestamp.now(),
        seen: false,
      });

      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/unshare-notifications/notif-1`).get()
      );
    });

    it('should deny user from writing to another user notifications', async () => {
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(
        db.doc(`users-v2/${TEST_USERS.alice}/unshare-notifications/notif-1`).set({
          id: 'notif-1',
          listId: 'list-1',
          listName: 'Groceries',
          ownerUserId: TEST_USERS.bob,
          ownerEmail: 'bob@test.com',
          removedUserId: TEST_USERS.alice,
          createdAt: Timestamp.now(),
          seen: false,
        })
      );
    });
  });

  // ========================================
  // Share Invites (share-invites/{inviteId})
  // ========================================

  describe('Share Invites (share-invites/{inviteId})', () => {
    it('should allow authenticated user to read any invite', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(db.doc('share-invites/invite-1').get());
    });

    it('should deny unauthenticated user from reading invites', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
      });
      const db = getUnauthContext().firestore();
      await assertFails(db.doc('share-invites/invite-1').get());
    });

    it('should allow sender to create an invite', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc('share-invites/invite-1').set({
          id: 'invite-1',
          fromUserId: TEST_USERS.alice,
          fromUserEmail: 'alice@test.com',
          listId: 'list-1',
          listName: 'Groceries',
          inviteToken: 'token-abc',
          status: 'pending',
          createdAt: Timestamp.now(),
        })
      );
    });

    it('should deny creating an invite with wrong fromUserId', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(
        db.doc('share-invites/invite-1').set({
          id: 'invite-1',
          fromUserId: TEST_USERS.bob, // impersonation
          fromUserEmail: 'bob@test.com',
          listId: 'list-1',
          listName: 'Groceries',
          inviteToken: 'token-abc',
          status: 'pending',
          createdAt: Timestamp.now(),
        })
      );
    });

    it('should allow updating a pending invite (accept)', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
        status: 'pending',
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        db.doc('share-invites/invite-1').update({
          status: 'accepted',
          acceptedByUserId: TEST_USERS.bob,
          acceptedAt: Timestamp.now(),
        })
      );
    });

    it('should deny updating an already-accepted invite', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
        status: 'accepted',
        acceptedByUserId: TEST_USERS.bob,
      });
      const db = getAuthContext(TEST_USERS.charlie).firestore();
      await assertFails(
        db.doc('share-invites/invite-1').update({
          status: 'accepted',
          acceptedByUserId: TEST_USERS.charlie,
          acceptedAt: Timestamp.now(),
        })
      );
    });

    it('should allow sender to delete their invite', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
      });
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(db.doc('share-invites/invite-1').delete());
    });

    it('should deny non-sender from deleting an invite', async () => {
      await seedShareInvite('invite-1', {
        fromUserId: TEST_USERS.alice,
        fromUserEmail: 'alice@test.com',
        listId: 'list-1',
        listName: 'Groceries',
        inviteToken: 'token-abc',
      });
      const db = getAuthContext(TEST_USERS.bob).firestore();
      await assertFails(db.doc('share-invites/invite-1').delete());
    });
  });

  // ========================================
  // Analytics Collections
  // ========================================
  // Note: Paths like analytics/daily-aggregates/{date} have 3 segments.
  // Firestore SDK doc() requires even segments, so we use REST API
  // to test these rules directly against the emulator.

  describe('Analytics Collections', () => {
    // analytics/events/items/{eventId} = 4 segments (even) → SDK works
    it('should allow any authenticated user to write analytics events', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertSucceeds(
        db.doc('analytics/events/items/event-1').set({
          type: 'page_view',
          userId: TEST_USERS.alice,
          timestamp: Timestamp.now(),
        })
      );
    });

    it('should deny non-admin from reading analytics events', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(db.doc('analytics/events/items/event-1').get());
    });

    it('should allow admin to read analytics events', async () => {
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      await aliceDb.doc('analytics/events/items/event-1').set({
        type: 'page_view',
        userId: TEST_USERS.alice,
        timestamp: Timestamp.now(),
      });

      const db = getAuthContext(TEST_USERS.admin).firestore();
      await assertSucceeds(db.doc('analytics/events/items/event-1').get());
    });

    // 3-segment paths → REST API
    it('should deny non-admin from writing daily aggregates', async () => {
      const resp = await restSet(
        'analytics/daily-aggregates/2025-01-01',
        { totalUsers: 10 },
        TEST_USERS.alice
      );
      expect(resp.ok).toBe(false);
    });

    it('should allow admin to write daily aggregates', async () => {
      const resp = await restSet(
        'analytics/daily-aggregates/2025-01-01',
        { totalUsers: 10 },
        TEST_USERS.admin
      );
      expect(resp.ok).toBe(true);
    });

    it('should allow any authenticated user to write their own metrics', async () => {
      const resp = await restSet(
        `analytics/user-metrics/${TEST_USERS.alice}`,
        { listsCreated: 5 },
        TEST_USERS.alice
      );
      expect(resp.ok).toBe(true);
    });

    it('should allow any authenticated user to write AI insights', async () => {
      const resp = await restSet(
        'analytics/ai-insights/2025-01-01',
        { insight: 'Users prefer morning shopping' },
        TEST_USERS.alice
      );
      expect(resp.ok).toBe(true);
    });
  });

  // ========================================
  // Admin Collections
  // ========================================
  // All admin paths have 3 segments (admin/feature-flags/{flagId}, etc.)
  // which the Firestore SDK rejects. Using REST API for all admin tests.

  describe('Admin Collections', () => {
    describe('Feature Flags (admin/feature-flags/{flagId})', () => {
      it('should allow any authenticated user to read feature flags', async () => {
        // Seed via admin REST
        await restSet('admin/feature-flags/dark-mode', { enabled: true, name: 'Dark Mode' }, TEST_USERS.admin);
        // Read as regular user
        const resp = await restGet('admin/feature-flags/dark-mode', TEST_USERS.alice);
        expect(resp.ok).toBe(true);
      });

      it('should deny non-admin from writing feature flags', async () => {
        const resp = await restSet(
          'admin/feature-flags/dark-mode',
          { enabled: true, name: 'Dark Mode' },
          TEST_USERS.alice
        );
        expect(resp.ok).toBe(false);
      });

      it('should allow admin to write feature flags', async () => {
        const resp = await restSet(
          'admin/feature-flags/dark-mode',
          { enabled: true, name: 'Dark Mode' },
          TEST_USERS.admin
        );
        expect(resp.ok).toBe(true);
      });
    });

    describe('User Feedback (admin/user-feedback/{feedbackId})', () => {
      it('should allow authenticated user to create feedback with their userId', async () => {
        const resp = await restSet(
          'admin/user-feedback/feedback-1',
          { userId: TEST_USERS.alice, message: 'Great app!' },
          TEST_USERS.alice
        );
        expect(resp.ok).toBe(true);
      });

      it('should deny creating feedback with wrong userId', async () => {
        const resp = await restSet(
          'admin/user-feedback/feedback-1',
          { userId: TEST_USERS.bob, message: 'Impersonated!' },
          TEST_USERS.alice
        );
        expect(resp.ok).toBe(false);
      });

      it('should allow user to read their own feedback', async () => {
        await restSet('admin/user-feedback/feedback-1', { userId: TEST_USERS.alice, message: 'Great!' }, TEST_USERS.alice);
        const resp = await restGet('admin/user-feedback/feedback-1', TEST_USERS.alice);
        expect(resp.ok).toBe(true);
      });

      it('should deny user from reading another users feedback', async () => {
        await restSet('admin/user-feedback/feedback-1', { userId: TEST_USERS.alice, message: 'Great!' }, TEST_USERS.alice);
        const resp = await restGet('admin/user-feedback/feedback-1', TEST_USERS.bob);
        expect(resp.ok).toBe(false);
      });

      it('should allow admin to update feedback status', async () => {
        await restSet('admin/user-feedback/feedback-1', { userId: TEST_USERS.alice, message: 'Great!' }, TEST_USERS.alice);
        const resp = await restUpdate('admin/user-feedback/feedback-1', { status: 'reviewed' }, TEST_USERS.admin);
        expect(resp.ok).toBe(true);
      });

      it('should deny non-admin from updating feedback', async () => {
        await restSet('admin/user-feedback/feedback-1', { userId: TEST_USERS.alice, message: 'Great!' }, TEST_USERS.alice);
        const resp = await restUpdate('admin/user-feedback/feedback-1', { status: 'reviewed' }, TEST_USERS.alice);
        expect(resp.ok).toBe(false);
      });

      it('should allow admin to delete feedback', async () => {
        await restSet('admin/user-feedback/feedback-1', { userId: TEST_USERS.alice, message: 'Great!' }, TEST_USERS.alice);
        const resp = await restDelete('admin/user-feedback/feedback-1', TEST_USERS.admin);
        expect(resp.ok).toBe(true);
      });
    });

    describe('System Alerts (admin/system-alerts/{alertId})', () => {
      it('should deny non-admin from reading system alerts', async () => {
        const resp = await restGet('admin/system-alerts/alert-1', TEST_USERS.alice);
        expect(resp.ok).toBe(false);
      });

      it('should deny non-admin from writing system alerts', async () => {
        const resp = await restSet(
          'admin/system-alerts/alert-1',
          { title: 'Maintenance', message: 'Server update' },
          TEST_USERS.alice
        );
        expect(resp.ok).toBe(false);
      });

      it('should allow admin to read and write system alerts', async () => {
        const writeResp = await restSet(
          'admin/system-alerts/alert-1',
          { title: 'Maintenance', message: 'Server update' },
          TEST_USERS.admin
        );
        expect(writeResp.ok).toBe(true);

        const readResp = await restGet('admin/system-alerts/alert-1', TEST_USERS.admin);
        expect(readResp.ok).toBe(true);
      });
    });
  });

  // ========================================
  // Default Deny
  // ========================================

  describe('Default Deny', () => {
    it('should deny access to unknown collection paths', async () => {
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await assertFails(db.doc('random-collection/doc-1').get());
      await assertFails(
        db.doc('random-collection/doc-1').set({ data: 'test' })
      );
    });

    it('should deny unauthenticated access everywhere', async () => {
      const db = getUnauthContext().firestore();
      await assertFails(db.doc('users-v2/any-user').get());
      await assertFails(db.doc('share-invites/any-invite').get());
    });

    it('should deny unauthenticated access to admin paths', async () => {
      // 3-segment admin paths → REST API with no auth
      const resp = await restGet('admin/feature-flags/any-flag', null);
      expect(resp.ok).toBe(false);
    });
  });
});
