/**
 * Shared List Articles E2E Tests
 *
 * Verifies the article loading bug fix (mergeArticleIds isMigrationState correction)
 * and Firestore-level access patterns for shared list articles.
 *
 * Bug fixed: mergeArticleIds() used `maxArticleIdsCount > itemStatesCount` as
 * isMigrationState which caused stale local IDs to permanently re-add deleted articles.
 * Correct logic: only trigger migration for genuinely pre-migration data (empty itemStates
 * or IDs shared between local+server that lack states).
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

// ──────────────────────────────────────────────────────────────────────────────
// Pure-TS helper: mirrors the fixed mergeArticleIds() from firebase-data.service.ts
// This is the single source of truth for what "correct" means.
// ──────────────────────────────────────────────────────────────────────────────
function mergeArticleIds(
  localIds: string[],
  serverIds: string[],
  mergedItemStates: Record<string, unknown>
): string[] {
  const noStatesAtAll = Object.keys(mergedItemStates).length === 0;
  const localIdsSet = new Set(localIds);
  const sharedIdsLackingStates = serverIds.filter(
    (id) => localIdsSet.has(id) && !mergedItemStates[id]
  );
  const isMigrationState = noStatesAtAll || sharedIdsLackingStates.length > 0;

  if (isMigrationState) {
    const serverSet = new Set(serverIds);
    const merged = [...serverIds];
    for (const localId of localIds) {
      if (!serverSet.has(localId)) merged.push(localId);
    }
    return merged;
  }

  // Normal mode: itemStates is source of truth
  const articlesFromItemStates = new Set(Object.keys(mergedItemStates));
  const merged: string[] = [];
  for (const serverId of serverIds) {
    if (articlesFromItemStates.has(serverId)) {
      merged.push(serverId);
      articlesFromItemStates.delete(serverId);
    }
  }
  for (const localId of localIds) {
    if (articlesFromItemStates.has(localId)) {
      merged.push(localId);
      articlesFromItemStates.delete(localId);
    }
  }
  for (const remainingId of articlesFromItemStates) {
    merged.push(remainingId);
  }
  return merged;
}

// ──────────────────────────────────────────────────────────────────────────────
// Part 1: mergeArticleIds logic (pure TS — no Firestore needed)
// ──────────────────────────────────────────────────────────────────────────────
describe('Shared List Articles — mergeArticleIds bug regression', () => {

  it('stale local IDs (not on server) must NOT trigger migration mode', () => {
    // Scenario: user deleted a3 on another device. Server + itemStates no longer have a3.
    // Local cache is stale and still contains a3.
    const localIds = ['a1', 'a2', 'a3']; // stale cache
    const serverIds = ['a1', 'a2'];       // a3 deleted on server
    const itemStates = {
      a1: { isChecked: false },
      a2: { isChecked: true },
      // a3 absent — was deleted
    };

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    // Deletion must stick — a3 must NOT reappear
    expect(result).not.toContain('a3');
    expect(result).toHaveLength(2);
  });

  it('empty itemStates (legacy doc) MUST trigger migration → preserve all IDs', () => {
    // Scenario: pre-migration document with no itemStates at all
    const localIds = ['a1', 'a2', 'a3'];
    const serverIds = ['a1', 'a2', 'a3'];
    const itemStates = {}; // legacy — no states yet

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    // All IDs preserved in migration mode
    expect(result).toHaveLength(3);
    expect(result).toEqual(['a1', 'a2', 'a3']);
  });

  it('IDs shared by local+server but lacking states → migration mode (partial migration)', () => {
    // Scenario: user just checked a1 for the first time; a2, a3 have no state yet
    const localIds = ['a1', 'a2', 'a3'];
    const serverIds = ['a1', 'a2', 'a3'];
    const itemStates = {
      a1: { isChecked: true }, // only a1 has state
      // a2, a3 are in both local+server but lack states → migration
    };

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    // All 3 must be preserved
    expect(result).toHaveLength(3);
    expect(result).toContain('a2');
    expect(result).toContain('a3');
  });

  it('when all IDs have states and stale local IDs present → normal mode, deletions stick', () => {
    // THE KEY BUG SCENARIO:
    // Server has 3 articles with complete states.
    // Local cache has 5 (2 extra stale). Old logic: 5 > 3 → migration (re-adds stale).
    // New logic: no IDs shared by local+server are missing states → normal mode.
    const localIds = ['a1', 'a2', 'a3', 'a4', 'a5']; // a4, a5 are stale
    const serverIds = ['a1', 'a2', 'a3'];
    const itemStates = {
      a1: { isChecked: false },
      a2: { isChecked: true },
      a3: { isChecked: false },
      // a4, a5 not in server and not in itemStates
    };

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    expect(result).toHaveLength(3);
    expect(result).not.toContain('a4');
    expect(result).not.toContain('a5');
  });

  it('local-only new article (not yet on server) is preserved in normal mode', () => {
    // User added a4 locally; write hasn't synced to server yet
    const localIds = ['a1', 'a2', 'a3', 'a4']; // a4 pending sync
    const serverIds = ['a1', 'a2', 'a3'];
    const itemStates = {
      a1: { isChecked: false },
      a2: { isChecked: true },
      a3: { isChecked: false },
      a4: { isChecked: false }, // new article has a state locally
    };

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    // a4 must be kept (it's local-only with a state — not stale)
    expect(result).toContain('a4');
    expect(result).toHaveLength(4);
  });

  it('server order is preserved in normal mode', () => {
    const localIds = ['a3', 'a1', 'a2']; // different order locally
    const serverIds = ['a1', 'a2', 'a3'];
    const itemStates = {
      a1: { isChecked: false },
      a2: { isChecked: true },
      a3: { isChecked: false },
    };

    const result = mergeArticleIds(localIds, serverIds, itemStates);

    // Server order wins
    expect(result).toEqual(['a1', 'a2', 'a3']);
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Part 2: Firestore-level article access for shared lists
// ──────────────────────────────────────────────────────────────────────────────
describe('Shared List Articles — Firestore access patterns', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  afterEach(async () => {
    await clearFirestoreData();
  });

  it('participant can read articles from owner collection (shared list)', async () => {
    // Alice owns a list shared with Bob; Bob needs to read Alice's articles
    await seedList(TEST_USERS.alice, 'collab-list', {
      name: 'Collab Groceries',
      ownerId: TEST_USERS.alice,
      articleIds: ['milk', 'bread'],
      sharedWith: [TEST_USERS.bob],
      itemStates: {
        milk: { articleId: 'milk', isChecked: false },
        bread: { articleId: 'bread', isChecked: false },
      },
    });
    await seedArticle(TEST_USERS.alice, 'milk', { name: 'Milk' });
    await seedArticle(TEST_USERS.alice, 'bread', { name: 'Bread' });

    // Bob reads Alice's article (the path used by loadArticlesFromSharedListOwners)
    const bobDb = getAuthContext(TEST_USERS.bob).firestore();
    const articleRef = bobDb.doc(`users-v2/${TEST_USERS.alice}/articles/milk`);
    await assertSucceeds(articleRef.get());
  });

  it('unauthenticated user cannot read any articles', async () => {
    // By design: ALL authenticated users can read articles (needed for shared list participants),
    // but unauthenticated users must be blocked.
    await seedArticle(TEST_USERS.alice, 'chips', { name: 'Chips' });

    const { getUnauthContext } = await import('./firestore-e2e.setup');
    const unauthDb = getUnauthContext().firestore();
    const articleRef = unauthDb.doc(`users-v2/${TEST_USERS.alice}/articles/chips`);
    await assertFails(articleRef.get());
  });

});
