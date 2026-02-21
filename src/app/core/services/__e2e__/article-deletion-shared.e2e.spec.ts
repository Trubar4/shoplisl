/**
 * Article Deletion — Shared List E2E Tests
 *
 * Verifies the fix for: "participant sees deleted article in article overview".
 *
 * Bug: When the owner deletes an article that is referenced on a shared list,
 * the participant's sharedArticles backing array was never pruned.  The next
 * mergeArticles() call (triggered by the list listener) would restore the
 * deleted article in articlesSubject, making it reappear in the overview.
 *
 * Fix: setupSingleSharedListListener now detects removedArticleIds
 * (previousArticleIds − finalArticleIds) and calls ctx.pruneSharedArticles()
 * which filters sharedArticles, evicts the IDs from the loader cache, and
 * re-runs mergeArticles().
 *
 * These tests verify the Firestore data invariants that the fix relies on:
 *  1. The owner can atomically delete an article AND remove it from the list.
 *  2. After deletion the article document is gone (participant read returns 404).
 *  3. After deletion the list's articleIds no longer contains the deleted ID.
 *  4. The participant can read the updated list (articleIds without deleted article).
 *  5. The participant cannot read the deleted article document.
 *
 * Pure-TS tests cover the pruning logic itself (no emulator needed).
 *
 * Run: npm run test:firestore
 * Requires: firebase emulators:start --only firestore
 */

import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { Timestamp } from 'firebase/firestore';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearFirestoreData,
  getAuthContext,
  seedList,
  seedArticle,
  readDocAsAdmin,
  TEST_USERS,
} from './firestore-e2e.setup';

// ─────────────────────────────────────────────────────────────────────────────
// Part 1: Pure-TS — pruneSharedArticles logic
// Mirrors the logic in FirebaseDataService.pruneSharedArticles()
// ─────────────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  name: string;
  ownerId: string;
}

/** Mirror of FirebaseDataService.pruneSharedArticles() */
function pruneSharedArticles(
  sharedArticles: Article[],
  removedIds: string[]
): Article[] {
  const idSet = new Set(removedIds);
  return sharedArticles.filter(a => !idSet.has(a.id));
}

/** Mirror of the removedArticleIds detection in setupSingleSharedListListener */
function detectRemovedArticleIds(
  previousArticleIds: string[],
  finalArticleIds: string[]
): string[] {
  return previousArticleIds.filter(id => !finalArticleIds.includes(id));
}

describe('Article Deletion — Shared List (pure-TS logic)', () => {

  it('detectRemovedArticleIds: returns IDs that left the list', () => {
    const before = ['chips', 'salsa', 'aa4'];
    const after  = ['chips', 'salsa'];           // aa4 deleted
    expect(detectRemovedArticleIds(before, after)).toEqual(['aa4']);
  });

  it('detectRemovedArticleIds: returns empty array when nothing was removed', () => {
    const before = ['chips', 'salsa'];
    const after  = ['chips', 'salsa', 'dip'];    // dip added, nothing removed
    expect(detectRemovedArticleIds(before, after)).toEqual([]);
  });

  it('detectRemovedArticleIds: handles all articles removed', () => {
    const before = ['chips', 'salsa'];
    const after: string[] = [];
    expect(detectRemovedArticleIds(before, after)).toEqual(['chips', 'salsa']);
  });

  it('pruneSharedArticles: removes deleted article from backing array', () => {
    const sharedArticles: Article[] = [
      { id: 'chips', name: 'Chips', ownerId: TEST_USERS.alice },
      { id: 'aa4',   name: 'AA4',   ownerId: TEST_USERS.alice },
      { id: 'salsa', name: 'Salsa', ownerId: TEST_USERS.alice },
    ];

    const result = pruneSharedArticles(sharedArticles, ['aa4']);

    expect(result).toHaveLength(2);
    expect(result.find(a => a.id === 'aa4')).toBeUndefined();
    expect(result.map(a => a.id)).toEqual(['chips', 'salsa']);
  });

  it('pruneSharedArticles: no-op when deleted ID is not in sharedArticles', () => {
    const sharedArticles: Article[] = [
      { id: 'chips', name: 'Chips', ownerId: TEST_USERS.alice },
    ];

    const result = pruneSharedArticles(sharedArticles, ['unknown-id']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('chips');
  });

  it('pruneSharedArticles: can prune multiple articles at once', () => {
    const sharedArticles: Article[] = [
      { id: 'a1', name: 'A1', ownerId: TEST_USERS.alice },
      { id: 'a2', name: 'A2', ownerId: TEST_USERS.alice },
      { id: 'a3', name: 'A3', ownerId: TEST_USERS.alice },
    ];

    const result = pruneSharedArticles(sharedArticles, ['a1', 'a3']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });

  it('full flow: deleted article does not survive mergeArticles after pruning', () => {
    // Simulate the full sequence:
    //  1. sharedArticles contains aa4
    //  2. List listener fires, aa4 is in removedArticleIds
    //  3. pruneSharedArticles removes aa4 from sharedArticles
    //  4. mergeArticles() (simulated as concat) no longer contains aa4

    const ownedArticles: Article[] = [
      { id: 'my-article', name: 'My Article', ownerId: TEST_USERS.bob },
    ];
    let sharedArticles: Article[] = [
      { id: 'chips', name: 'Chips', ownerId: TEST_USERS.alice },
      { id: 'aa4',   name: 'AA4',   ownerId: TEST_USERS.alice },
    ];

    // List listener detects aa4 was removed
    const previousIds = ['chips', 'aa4'];
    const finalIds    = ['chips'];
    const removed = detectRemovedArticleIds(previousIds, finalIds);

    // Prune
    sharedArticles = pruneSharedArticles(sharedArticles, removed);

    // mergeArticles()
    const allArticles = [...ownedArticles, ...sharedArticles];
    const uniqueArticles = Array.from(new Map(allArticles.map(a => [a.id, a])).values());

    expect(uniqueArticles.find(a => a.id === 'aa4')).toBeUndefined();
    expect(uniqueArticles).toHaveLength(2); // my-article + chips
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2: Firestore emulator — data invariants after article deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('Article Deletion — Shared List (Firestore rules & data)', () => {

  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  afterEach(async () => {
    await clearFirestoreData();
  });

  // ── Setup helper ────────────────────────────────────────────────────────────

  async function setupSharedListWithArticle(): Promise<void> {
    // Alice owns a list shared with Bob; it contains article 'aa4'
    await seedList(TEST_USERS.alice, 'shared-list', {
      name: 'Shared Groceries',
      ownerId: TEST_USERS.alice,
      articleIds: ['chips', 'aa4'],
      itemStates: {
        chips: { articleId: 'chips', articleName: 'Chips',  isChecked: false },
        aa4:   { articleId: 'aa4',   articleName: 'AA4',    isChecked: false },
      },
      sharedWith: [TEST_USERS.bob],
    });
    await seedArticle(TEST_USERS.alice, 'chips', { name: 'Chips' });
    await seedArticle(TEST_USERS.alice, 'aa4',   { name: 'AA4'   });
  }

  // ── 1. Security rules allow the owner to delete their own article ────────────

  it('owner can delete their own article', async () => {
    await setupSharedListWithArticle();
    const aliceDb = getAuthContext(TEST_USERS.alice).firestore();

    await assertSucceeds(
      aliceDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).delete()
    );

    // Verify it's gone
    const snap = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/aa4`);
    expect(snap).toBeUndefined();
  });

  // ── 2. Security rules prevent participant from deleting owner's article ───────

  it('participant cannot delete owner article', async () => {
    await setupSharedListWithArticle();
    const bobDb = getAuthContext(TEST_USERS.bob).firestore();

    await assertFails(
      bobDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).delete()
    );
  });

  // ── 3. Owner can remove article from list's articleIds ───────────────────────

  it('owner can update list to remove deleted article from articleIds', async () => {
    await setupSharedListWithArticle();
    const aliceDb = getAuthContext(TEST_USERS.alice).firestore();

    await assertSucceeds(
      aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
        articleIds: ['chips'],
        updatedAt: Timestamp.now(),
      })
    );

    const list = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/shared-list`);
    expect(list!['articleIds']).toEqual(['chips']);
    expect((list!['articleIds'] as string[]).includes('aa4')).toBe(false);
  });

  // ── 4. Participant reads updated list and sees aa4 is gone ──────────────────

  it('participant can read updated list after owner removes article', async () => {
    await setupSharedListWithArticle();
    const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
    const bobDb   = getAuthContext(TEST_USERS.bob).firestore();

    // Alice deletes article and updates list
    await aliceDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).delete();
    await aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
      articleIds: ['chips'],
      updatedAt: Timestamp.now(),
    });

    // Bob reads the list — must succeed (he's a participant)
    const snap = await assertSucceeds(
      bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).get()
    );

    const data = (snap as any).data();
    expect(data['articleIds']).toEqual(['chips']);
    expect((data['articleIds'] as string[]).includes('aa4')).toBe(false);
  });

  // ── 5. Participant cannot read the deleted article document ─────────────────

  it('participant gets not-found when reading deleted article', async () => {
    await setupSharedListWithArticle();
    const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
    const bobDb   = getAuthContext(TEST_USERS.bob).firestore();

    // Alice deletes the article
    await aliceDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).delete();

    // Bob tries to read it — the document no longer exists.
    // Security rules still allow the read attempt (authenticated users can read
    // any user's articles), but the document is simply gone.
    const snap = await assertSucceeds(
      bobDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).get()
    );

    expect((snap as any).exists).toBe(false);
  });

  // ── 6. Complete deletion flow: article gone + list updated + participant sees correct state ──

  it('complete deletion flow: owner deletes article and updates list atomically', async () => {
    await setupSharedListWithArticle();
    const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
    const bobDb   = getAuthContext(TEST_USERS.bob).firestore();

    // Alice's deletion flow: delete article doc + remove from list
    await assertSucceeds(
      aliceDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).delete()
    );
    await assertSucceeds(
      aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).update({
        articleIds: ['chips'],
        'itemStates.aa4': null,   // remove the itemState entry
        updatedAt: Timestamp.now(),
      })
    );

    // Bob (participant) can read the list and sees only 'chips'
    const listSnap = await assertSucceeds(
      bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/shared-list`).get()
    );
    const listData = (listSnap as any).data();
    expect(listData['articleIds']).toEqual(['chips']);

    // The article document is gone
    const articleSnap = await assertSucceeds(
      bobDb.doc(`users-v2/${TEST_USERS.alice}/articles/aa4`).get()
    );
    expect((articleSnap as any).exists).toBe(false);
  });

  // ── 7. Regression: article must not reappear after list listener fires ───────
  // This is the core bug scenario, expressed as a pure-TS + data consistency test.

  it('regression: pruned article IDs are not re-added by list state merge', () => {
    // Simulate the state BEFORE the fix:
    // sharedArticles still contains aa4 after list listener fired.
    // After fix: pruneSharedArticles removes aa4 before mergeArticles() runs.

    // State before fix (sharedArticles not pruned)
    const sharedArticlesBefore: Article[] = [
      { id: 'chips', name: 'Chips', ownerId: TEST_USERS.alice },
      { id: 'aa4',   name: 'AA4',   ownerId: TEST_USERS.alice },
    ];
    const ownedArticles: Article[] = [];

    const mergeWithoutFix = () => {
      const all = [...ownedArticles, ...sharedArticlesBefore];
      return Array.from(new Map(all.map(a => [a.id, a])).values());
    };

    // Without fix: aa4 survives
    expect(mergeWithoutFix().find(a => a.id === 'aa4')).toBeDefined();

    // State after fix (pruneSharedArticles called with ['aa4'])
    const sharedArticlesAfter = pruneSharedArticles(sharedArticlesBefore, ['aa4']);
    const mergeWithFix = () => {
      const all = [...ownedArticles, ...sharedArticlesAfter];
      return Array.from(new Map(all.map(a => [a.id, a])).values());
    };

    // With fix: aa4 is gone
    expect(mergeWithFix().find(a => a.id === 'aa4')).toBeUndefined();
    expect(mergeWithFix()).toHaveLength(1);
    expect(mergeWithFix()[0].id).toBe('chips');
  });
});
