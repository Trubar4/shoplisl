/**
 * Shared List Article Loading E2E Tests
 *
 * Tests the Firestore data layer that the Angular service uses when loading
 * articles for shared lists. Specifically validates:
 *
 *   1. Cross-collection reads: can Bob read articles from Alice's collection?
 *   2. Can Alice read articles from Bob's collection? (batchLoadArticles pattern)
 *   3. The exact query pattern used by FirebaseArticleLoaderService.batchLoadArticles()
 *      returns the right articles across ALL participant collections.
 *   4. Missing articles scenario: what happens when an article ID is in the list
 *      but the article document doesn't exist in any collection?
 *
 * This tests the DATA LAYER only — the security rules and query results.
 * The Angular service merge logic is tested in firebase-merge.service.spec.ts.
 *
 * How to interpret results:
 *   PASS = Firestore queries are correct; if app still breaks, bug is in service logic
 *   FAIL = The Firestore layer itself has a problem (rules or data structure)
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
  seedArticle,
  readCollectionAsAdmin,
  debugLog,
  dumpDoc,
  dumpCollection,
  TEST_USERS,
} from './firestore-e2e.setup';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates the exact query that FirebaseArticleLoaderService.batchLoadArticles()
 * performs for one owner's collection. Returns article IDs that were found.
 *
 * The real service uses Angular's @angular/fire/firestore with documentId() IN queries.
 * We replicate the same query logic here using the test SDK's Firestore.
 */
async function simulateBatchLoadForOwner(
  db: ReturnType<ReturnType<typeof getAuthContext>['firestore']>,
  ownerId: string,
  articleIds: string[]
): Promise<{ id: string; name: string; ownerId: string }[]> {
  if (articleIds.length === 0) return [];

  const found: { id: string; name: string; ownerId: string }[] = [];
  const snap = await db
    .collection(`users-v2/${ownerId}/articles`)
    .where('__name__', 'in', articleIds)
    .get();

  snap.docs.forEach(doc => {
    found.push({
      id: doc.id,
      name: doc.data()['name'],
      ownerId: doc.data()['ownerId'] || ownerId,
    });
  });
  return found;
}

/**
 * Simulates the full batchLoadArticles() across all owner collections.
 * Returns all found articles and which IDs were NOT found in any collection.
 */
async function simulateFullBatchLoad(
  requestingUserDb: ReturnType<ReturnType<typeof getAuthContext>['firestore']>,
  articleIds: string[],
  ownerIds: string[]
): Promise<{
  found: { id: string; name: string; ownerId: string }[];
  notFound: string[];
  foundPerOwner: Record<string, string[]>;
}> {
  const allFound: { id: string; name: string; ownerId: string }[] = [];
  const foundIds = new Set<string>();
  const foundPerOwner: Record<string, string[]> = {};

  for (const ownerId of ownerIds) {
    const results = await simulateBatchLoadForOwner(requestingUserDb, ownerId, articleIds);
    foundPerOwner[ownerId] = results.map(r => r.id);
    for (const article of results) {
      if (!foundIds.has(article.id)) {
        allFound.push(article);
        foundIds.add(article.id);
      }
    }
  }

  const notFound = articleIds.filter(id => !foundIds.has(id));
  return { found: allFound, notFound, foundPerOwner };
}

function logLoadResult(
  scenario: string,
  articleIds: string[],
  ownerIds: string[],
  result: { found: any[]; notFound: string[]; foundPerOwner: Record<string, string[]> }
): void {
  console.log(`\n── ${scenario} ──`);
  console.log(`  requested (${articleIds.length}): [${articleIds.join(', ')}]`);
  console.log(`  searched in collections: [${ownerIds.join(', ')}]`);
  console.log(`  found (${result.found.length}): [${result.found.map(a => a.id).join(', ')}]`);
  if (result.notFound.length > 0) {
    console.log(`  ❌ NOT FOUND (${result.notFound.length}): [${result.notFound.join(', ')}]`);
  } else {
    console.log(`  ✅ all articles found`);
  }
  for (const [owner, ids] of Object.entries(result.foundPerOwner)) {
    if (ids.length > 0) {
      console.log(`    ${owner}: [${ids.join(', ')}]`);
    }
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Shared List Article Loading E2E', () => {
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
  // Cross-collection read permissions
  // ========================================

  describe('Cross-collection read permissions', () => {
    it('should allow authenticated user to read articles from any user collection', async () => {
      // Alice has an article in her collection
      await seedArticle(TEST_USERS.alice, 'alice-milk', { name: 'Vollmilch', ownerId: TEST_USERS.alice });
      // Bob has an article in his collection
      await seedArticle(TEST_USERS.bob, 'bob-bread', { name: 'Brot', ownerId: TEST_USERS.bob });

      // Bob can read from Alice's collection
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      const aliceArticle = await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/articles/alice-milk`).get()
      );
      expect(aliceArticle.exists).toBe(true);
      expect(aliceArticle.data()!['name']).toBe('Vollmilch');

      // Alice can read from Bob's collection
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const bobArticle = await assertSucceeds(
        aliceDb.doc(`users-v2/${TEST_USERS.bob}/articles/bob-bread`).get()
      );
      expect(bobArticle.exists).toBe(true);
      expect(bobArticle.data()!['name']).toBe('Brot');

      debugLog('perms', 'Cross-collection reads work as expected');
    });

    it('should allow collection queries with IN filter across user collections', async () => {
      // Alice has 3 articles
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Apple', ownerId: TEST_USERS.alice });
      await seedArticle(TEST_USERS.alice, 'a2', { name: 'Banana', ownerId: TEST_USERS.alice });
      await seedArticle(TEST_USERS.alice, 'a3', { name: 'Cherry', ownerId: TEST_USERS.alice });

      // Bob queries Alice's collection with an IN filter (batchLoadArticles pattern)
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      const snap = await assertSucceeds(
        bobDb
          .collection(`users-v2/${TEST_USERS.alice}/articles`)
          .where('__name__', 'in', ['a1', 'a2', 'a3'])
          .get()
      );

      const names = snap.docs.map(d => d.data()['name']).sort();
      debugLog('query', 'Alice articles found by Bob', names);

      expect(snap.docs.length).toBe(3);
      expect(names).toEqual(['Apple', 'Banana', 'Cherry']);
    });
  });

  // ========================================
  // batchLoadArticles query simulation
  // ========================================

  describe('batchLoadArticles query pattern (simulated)', () => {
    it('should find all articles when split between owner and participant collections', async () => {
      // CORE SCENARIO:
      // Alice owns the list. She created articles a1-a5 (in her collection).
      // Bob is a participant. He created articles b1-b5 (in his collection).
      // List has all 10 articles.
      // When Alice opens the list, she runs batchLoadArticles against BOTH collections.

      const aliceArticleIds = ['a1', 'a2', 'a3', 'a4', 'a5'];
      const bobArticleIds   = ['b1', 'b2', 'b3', 'b4', 'b5'];
      const allArticleIds   = [...aliceArticleIds, ...bobArticleIds];

      for (const id of aliceArticleIds) {
        await seedArticle(TEST_USERS.alice, id, { name: `Alice-${id}`, ownerId: TEST_USERS.alice });
      }
      for (const id of bobArticleIds) {
        await seedArticle(TEST_USERS.bob, id, { name: `Bob-${id}`, ownerId: TEST_USERS.bob });
      }

      // Alice searches both her collection AND Bob's collection
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const result = await simulateFullBatchLoad(
        aliceDb,
        allArticleIds,
        [TEST_USERS.alice, TEST_USERS.bob]
      );

      logLoadResult(
        'Alice loads 10 articles (5 hers + 5 Bob\'s)',
        allArticleIds,
        [TEST_USERS.alice, TEST_USERS.bob],
        result
      );

      expect(result.found.length).toBe(10);
      expect(result.notFound.length).toBe(0);
      expect(result.foundPerOwner[TEST_USERS.alice].length).toBe(5);
      expect(result.foundPerOwner[TEST_USERS.bob].length).toBe(5);
    });

    it('should find all 15 articles in the reported bug scenario', async () => {
      // REPRODUCES THE EXACT REPORTED BUG SETUP:
      // "Owner sees 10/15, Participant sees 4/15"
      //
      // We seed 15 articles: 10 in Alice's collection, 5 in Bob's.
      // Then verify both users can find all 15 via the batchLoadArticles query pattern.

      const aliceIds = Array.from({ length: 10 }, (_, i) => `alice-art-${i + 1}`);
      const bobIds   = Array.from({ length: 5 },  (_, i) => `bob-art-${i + 1}`);
      const allIds   = [...aliceIds, ...bobIds];

      for (const id of aliceIds) {
        await seedArticle(TEST_USERS.alice, id, { name: id, ownerId: TEST_USERS.alice });
      }
      for (const id of bobIds) {
        await seedArticle(TEST_USERS.bob, id, { name: id, ownerId: TEST_USERS.bob });
      }

      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const bobDb   = getAuthContext(TEST_USERS.bob).firestore();
      const ownerIds = [TEST_USERS.alice, TEST_USERS.bob];

      // Alice (owner) loads all 15
      const aliceResult = await simulateFullBatchLoad(aliceDb, allIds, ownerIds);
      logLoadResult('Alice (owner) loads 15 articles', allIds, ownerIds, aliceResult);

      // Bob (participant) loads all 15
      const bobResult = await simulateFullBatchLoad(bobDb, allIds, ownerIds);
      logLoadResult('Bob (participant) loads 15 articles', allIds, ownerIds, bobResult);

      expect(aliceResult.found.length).toBe(15);
      expect(aliceResult.notFound.length).toBe(0);

      expect(bobResult.found.length).toBe(15);
      expect(bobResult.notFound.length).toBe(0);

      if (aliceResult.found.length !== 15 || bobResult.found.length !== 15) {
        console.log('\n  FULL DUMP - Alice articles:');
        const aliceArticles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);
        dumpCollection('alice-articles', aliceArticles);
        console.log('\n  FULL DUMP - Bob articles:');
        const bobArticles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.bob}/articles`);
        dumpCollection('bob-articles', bobArticles);
      }
    });

    it('should handle missing articles gracefully (article ID in list but no doc)', async () => {
      // Edge case: an article ID is referenced in the list's articleIds,
      // but the article document has been deleted. The load should still
      // return the articles that DO exist, and report the missing ones.

      await seedArticle(TEST_USERS.alice, 'existing', { name: 'Exists', ownerId: TEST_USERS.alice });
      // 'ghost' article is NOT seeded — simulates deleted/orphaned reference

      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const result = await simulateFullBatchLoad(
        aliceDb,
        ['existing', 'ghost'],
        [TEST_USERS.alice]
      );

      logLoadResult(
        'missing article (ghost) scenario',
        ['existing', 'ghost'],
        [TEST_USERS.alice],
        result
      );

      expect(result.found.length).toBe(1);
      expect(result.found[0].id).toBe('existing');
      expect(result.notFound).toEqual(['ghost']);
    });
  });

  // ========================================
  // Real-time article addition scenario
  // ========================================

  describe('Real-time article addition (owner adds article, participant should see it)', () => {
    it('should find newly added article after list update', async () => {
      // Setup: shared list with 2 articles
      await seedList(TEST_USERS.alice, 'live-list', {
        name: 'Live List',
        sharedWith: [TEST_USERS.bob],
        articleIds: ['a1', 'a2'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Apple', isChecked: false },
          a2: { articleId: 'a2', articleName: 'Banana', isChecked: false },
        },
      });
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Apple', ownerId: TEST_USERS.alice });
      await seedArticle(TEST_USERS.alice, 'a2', { name: 'Banana', ownerId: TEST_USERS.alice });

      // Alice adds a new article to her collection AND updates the list
      await seedArticle(TEST_USERS.alice, 'a3', { name: 'Cherry', ownerId: TEST_USERS.alice });

      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      await aliceDb.doc(`users-v2/${TEST_USERS.alice}/lists/live-list`).update({
        articleIds: ['a1', 'a2', 'a3'],
        'itemStates.a3': { articleId: 'a3', articleName: 'Cherry', isChecked: false, addedAt: Timestamp.now() },
        ownerId: TEST_USERS.alice,
        sharedWith: [TEST_USERS.bob],
        updatedAt: Timestamp.now(),
      });

      // Bob (participant) tries to load all 3 articles
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      const result = await simulateFullBatchLoad(
        bobDb,
        ['a1', 'a2', 'a3'],
        [TEST_USERS.alice] // only Alice's collection because she owns all articles
      );

      logLoadResult(
        'Bob loads 3 articles after Alice added one',
        ['a1', 'a2', 'a3'],
        [TEST_USERS.alice],
        result
      );

      expect(result.found.length).toBe(3);
      expect(result.notFound.length).toBe(0);
    });

    it('should find articles when a participant adds their own article', async () => {
      // Bob adds an article to his OWN collection, then references it from Alice's list.
      // Alice must find it in Bob's collection, not her own.

      await seedList(TEST_USERS.alice, 'collab-list', {
        name: 'Collab List',
        sharedWith: [TEST_USERS.bob],
        articleIds: ['a1', 'b1'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Alice Article', isChecked: false },
          b1: { articleId: 'b1', articleName: 'Bob Article', isChecked: false },
        },
      });
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Alice Article', ownerId: TEST_USERS.alice });
      await seedArticle(TEST_USERS.bob, 'b1', { name: 'Bob Article', ownerId: TEST_USERS.bob });

      // Alice (owner) loads both articles — must find b1 in BOB's collection
      const aliceDb = getAuthContext(TEST_USERS.alice).firestore();
      const result = await simulateFullBatchLoad(
        aliceDb,
        ['a1', 'b1'],
        [TEST_USERS.alice, TEST_USERS.bob] // MUST include bob in ownerIds
      );

      logLoadResult(
        'Alice finds Bob\'s article (b1) in Bob\'s collection',
        ['a1', 'b1'],
        [TEST_USERS.alice, TEST_USERS.bob],
        result
      );

      expect(result.found.length).toBe(2);
      expect(result.notFound.length).toBe(0);
      expect(result.foundPerOwner[TEST_USERS.alice]).toContain('a1');
      expect(result.foundPerOwner[TEST_USERS.bob]).toContain('b1');

      // Verify: Alice searching ONLY her collection would MISS b1
      const aliceOnlyResult = await simulateFullBatchLoad(
        aliceDb,
        ['a1', 'b1'],
        [TEST_USERS.alice] // only Alice — will miss b1
      );

      logLoadResult(
        'Alice searches ONLY her collection (b1 should be missing)',
        ['a1', 'b1'],
        [TEST_USERS.alice],
        aliceOnlyResult
      );

      expect(aliceOnlyResult.found.length).toBe(1);
      expect(aliceOnlyResult.notFound).toContain('b1');
      console.log('\n  ℹ️  This confirms that ownerIds MUST include all sharedWith participants,');
      console.log('     otherwise participant-owned articles are invisible to the list owner.');
    });
  });

  // ========================================
  // sharedWith list completeness
  // ========================================

  describe('ownerIds completeness (service must include all sharedWith users)', () => {
    it('should demonstrate articles are ONLY findable when correct ownerIds are used', async () => {
      // Setup: 3 articles from 3 different users
      await seedArticle(TEST_USERS.alice,   'alice-art',   { name: 'Alice item',   ownerId: TEST_USERS.alice });
      await seedArticle(TEST_USERS.bob,     'bob-art',     { name: 'Bob item',     ownerId: TEST_USERS.bob });
      await seedArticle(TEST_USERS.charlie, 'charlie-art', { name: 'Charlie item', ownerId: TEST_USERS.charlie });

      const aliceDb  = getAuthContext(TEST_USERS.alice).firestore();
      const allIds   = ['alice-art', 'bob-art', 'charlie-art'];

      // If service uses only owner → misses 2 articles
      const ownerOnly = await simulateFullBatchLoad(aliceDb, allIds, [TEST_USERS.alice]);
      console.log('\n── ownerIds completeness: owner only ──');
      console.log(`  ownerIds: [${TEST_USERS.alice}]`);
      console.log(`  found: ${ownerOnly.found.length}/3 → notFound: [${ownerOnly.notFound.join(', ')}]`);
      expect(ownerOnly.found.length).toBe(1);

      // If service uses owner + bob → misses charlie
      const ownerAndBob = await simulateFullBatchLoad(aliceDb, allIds, [TEST_USERS.alice, TEST_USERS.bob]);
      console.log('\n── ownerIds completeness: owner + bob ──');
      console.log(`  ownerIds: [${TEST_USERS.alice}, ${TEST_USERS.bob}]`);
      console.log(`  found: ${ownerAndBob.found.length}/3 → notFound: [${ownerAndBob.notFound.join(', ')}]`);
      expect(ownerAndBob.found.length).toBe(2);

      // If service uses all 3 users → finds all
      const allOwners = await simulateFullBatchLoad(aliceDb, allIds, [TEST_USERS.alice, TEST_USERS.bob, TEST_USERS.charlie]);
      console.log('\n── ownerIds completeness: all 3 users ──');
      console.log(`  ownerIds: [${TEST_USERS.alice}, ${TEST_USERS.bob}, ${TEST_USERS.charlie}]`);
      console.log(`  found: ${allOwners.found.length}/3 → notFound: [${allOwners.notFound.join(', ')}]`);
      expect(allOwners.found.length).toBe(3);
      expect(allOwners.notFound.length).toBe(0);

      console.log('\n  ℹ️  KEY INSIGHT: The service must use [ownerId, ...sharedWith] as ownerIds.');
      console.log('     If any participant is missing from ownerIds, their articles are invisible.');
    });
  });
});
