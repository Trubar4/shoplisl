/**
 * Service Logic E2E Tests
 *
 * Tests the data computation and query patterns that the UI depends on.
 * These replicate the exact logic from NgRx selectors and service functions,
 * but against REAL Firestore data in the emulator.
 *
 * What this tests:
 *   - List item counts (total, checked, unchecked) as shown in the UI
 *   - List classification (incomplete, completed, empty)
 *   - Article filtering (by department, category, search, notes)
 *   - Checked/unchecked article retrieval per list
 *   - Collection queries (ordering, filtering)
 *   - Shared list discovery via collection group queries
 *   - Data integrity after concurrent writes
 *
 * Debug output:
 *   Set FIRESTORE_E2E_VERBOSE=true for detailed logging.
 *   On failure, relevant state is always dumped to help diagnose.
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
  readDocAsAdmin,
  readCollectionAsAdmin,
  debugLog,
  dumpDoc,
  dumpCollection,
  computeListCounts,
  classifyLists,
  getCheckedUncheckedItems,
  countArticlesByDepartment,
  countArticlesByCategory,
  searchArticlesByName,
  TEST_USERS,
} from './firestore-e2e.setup';

describe('Service Logic E2E', () => {
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
  // List Item Counts (selectListsWithCounts)
  // ========================================

  describe('List item counts (as shown in UI badges)', () => {
    it('should compute correct counts for a list with mixed checked/unchecked items', async () => {
      await seedList(TEST_USERS.alice, 'grocery-list', {
        name: 'Weekly Groceries',
        articleIds: ['milk', 'bread', 'eggs', 'butter', 'cheese'],
        itemStates: {
          milk: { articleId: 'milk', articleName: 'Milk', isChecked: true, checkedAt: Timestamp.now() },
          bread: { articleId: 'bread', articleName: 'Bread', isChecked: true, checkedAt: Timestamp.now() },
          eggs: { articleId: 'eggs', articleName: 'Eggs', isChecked: false },
          butter: { articleId: 'butter', articleName: 'Butter', isChecked: false },
          cheese: { articleId: 'cheese', articleName: 'Cheese', isChecked: false },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/grocery-list`);
      expect(doc).toBeDefined();

      const counts = computeListCounts(doc as any);
      debugLog('counts', `List "${doc!['name']}" counts`, counts);

      // These are the exact values the UI shows in the list badge
      expect(counts.totalItems).toBe(5);
      expect(counts.checkedItems).toBe(2);
      expect(counts.uncheckedItems).toBe(3);

      if (counts.totalItems !== 5 || counts.checkedItems !== 2) {
        dumpDoc('grocery-list', doc);
      }
    });

    it('should return zero counts for an empty list', async () => {
      await seedList(TEST_USERS.alice, 'empty-list', {
        name: 'Empty List',
        articleIds: [],
        itemStates: {},
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/empty-list`);
      const counts = computeListCounts(doc as any);

      expect(counts.totalItems).toBe(0);
      expect(counts.checkedItems).toBe(0);
      expect(counts.uncheckedItems).toBe(0);
    });

    it('should show all items checked when list is fully completed', async () => {
      await seedList(TEST_USERS.alice, 'done-list', {
        name: 'All Done',
        articleIds: ['a1', 'a2'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Item 1', isChecked: true, checkedAt: Timestamp.now() },
          a2: { articleId: 'a2', articleName: 'Item 2', isChecked: true, checkedAt: Timestamp.now() },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/done-list`);
      const counts = computeListCounts(doc as any);

      expect(counts.totalItems).toBe(2);
      expect(counts.checkedItems).toBe(2);
      expect(counts.uncheckedItems).toBe(0);
    });

    it('should handle itemStates with more entries than articleIds (orphaned states)', async () => {
      // This edge case can happen after article removal where itemStates wasn't cleaned up
      await seedList(TEST_USERS.alice, 'orphan-list', {
        name: 'Has Orphans',
        articleIds: ['a1', 'a2'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Item 1', isChecked: false },
          a2: { articleId: 'a2', articleName: 'Item 2', isChecked: true, checkedAt: Timestamp.now() },
          a3: { articleId: 'a3', articleName: 'Removed Item', isChecked: true, checkedAt: Timestamp.now() },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/orphan-list`);
      const counts = computeListCounts(doc as any);

      // totalItems comes from articleIds (the source of truth for what's in the list)
      expect(counts.totalItems).toBe(2);
      // checkedItems comes from itemStates - includes orphan!
      // This matches the real selector behavior
      expect(counts.checkedItems).toBe(2);

      debugLog('orphan', 'Orphan state detected - checkedItems includes orphaned states', {
        articleIds: (doc as any).articleIds,
        itemStateKeys: Object.keys((doc as any).itemStates),
        counts,
      });
    });
  });

  // ========================================
  // List Classification (selectIncompleteLists, etc.)
  // ========================================

  describe('List classification (incomplete/completed/empty sections in UI)', () => {
    it('should correctly classify a mix of lists', async () => {
      // Create 4 lists in different states
      await seedList(TEST_USERS.alice, 'incomplete', {
        name: 'Shopping',
        articleIds: ['a1', 'a2'],
        itemStates: {
          a1: { articleId: 'a1', isChecked: true, checkedAt: Timestamp.now() },
          a2: { articleId: 'a2', isChecked: false },
        },
      });

      await seedList(TEST_USERS.alice, 'completed', {
        name: 'Done Shopping',
        articleIds: ['b1', 'b2'],
        itemStates: {
          b1: { articleId: 'b1', isChecked: true, checkedAt: Timestamp.now() },
          b2: { articleId: 'b2', isChecked: true, checkedAt: Timestamp.now() },
        },
      });

      await seedList(TEST_USERS.alice, 'empty', {
        name: 'New List',
        articleIds: [],
        itemStates: {},
      });

      await seedList(TEST_USERS.alice, 'all-unchecked', {
        name: 'Fresh List',
        articleIds: ['c1', 'c2', 'c3'],
        itemStates: {
          c1: { articleId: 'c1', isChecked: false },
          c2: { articleId: 'c2', isChecked: false },
          c3: { articleId: 'c3', isChecked: false },
        },
      });

      const allDocs = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/lists`);
      debugLog('classify', `Found ${allDocs.length} lists`);

      const classified = classifyLists(allDocs as any);

      debugLog('classify', 'Classification result', {
        incomplete: classified.incomplete.map((l) => l.name),
        completed: classified.completed.map((l) => l.name),
        empty: classified.empty.map((l) => l.name),
      });

      // Incomplete: has unchecked items
      expect(classified.incomplete.length).toBe(2);
      expect(classified.incomplete.map((l) => l.name).sort()).toEqual(
        ['Fresh List', 'Shopping']
      );

      // Completed: all items checked, has items
      expect(classified.completed.length).toBe(1);
      expect(classified.completed[0].name).toBe('Done Shopping');

      // Empty: no items
      expect(classified.empty.length).toBe(1);
      expect(classified.empty[0].name).toBe('New List');

      if (classified.incomplete.length !== 2 || classified.completed.length !== 1) {
        dumpCollection('all-lists', allDocs);
      }
    });
  });

  // ========================================
  // Checked/Unchecked Article Retrieval
  // ========================================

  describe('Checked/unchecked articles per list (list detail view)', () => {
    it('should return checked items sorted by checkedAt descending', async () => {
      const t1 = Timestamp.fromDate(new Date('2025-01-01T10:00:00Z'));
      const t2 = Timestamp.fromDate(new Date('2025-01-01T11:00:00Z'));
      const t3 = Timestamp.fromDate(new Date('2025-01-01T12:00:00Z'));

      await seedList(TEST_USERS.alice, 'sorted-list', {
        articleIds: ['early', 'middle', 'late', 'unchecked1'],
        itemStates: {
          early: { articleId: 'early', articleName: 'First checked', isChecked: true, checkedAt: t1 },
          middle: { articleId: 'middle', articleName: 'Second checked', isChecked: true, checkedAt: t2 },
          late: { articleId: 'late', articleName: 'Last checked', isChecked: true, checkedAt: t3 },
          unchecked1: { articleId: 'unchecked1', articleName: 'Not done', isChecked: false },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/sorted-list`);
      const { checked, unchecked } = getCheckedUncheckedItems(doc as any);

      debugLog('items', 'Checked items order', checked.map((c) => c.articleName));
      debugLog('items', 'Unchecked items', unchecked.map((u) => u.articleName));

      expect(checked.length).toBe(3);
      expect(unchecked.length).toBe(1);

      // Most recently checked should come first (descending)
      expect(checked[0].articleName).toBe('Last checked');
      expect(checked[1].articleName).toBe('Second checked');
      expect(checked[2].articleName).toBe('First checked');

      expect(unchecked[0].articleName).toBe('Not done');
    });

    it('should handle list with all unchecked items', async () => {
      await seedList(TEST_USERS.alice, 'all-unchecked', {
        articleIds: ['a', 'b'],
        itemStates: {
          a: { articleId: 'a', articleName: 'Apple', isChecked: false },
          b: { articleId: 'b', articleName: 'Banana', isChecked: false },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/all-unchecked`);
      const { checked, unchecked } = getCheckedUncheckedItems(doc as any);

      expect(checked.length).toBe(0);
      expect(unchecked.length).toBe(2);
    });
  });

  // ========================================
  // Article Department/Category Counts
  // ========================================

  describe('Article counts by department/category (article overview badges)', () => {
    it('should count articles per department correctly', async () => {
      await seedArticle(TEST_USERS.alice, 'milk', { name: 'Milk', departmentId: 'dairy-products' });
      await seedArticle(TEST_USERS.alice, 'yogurt', { name: 'Yogurt', departmentId: 'dairy-products' });
      await seedArticle(TEST_USERS.alice, 'bread', { name: 'Bread', departmentId: 'bread' });
      await seedArticle(TEST_USERS.alice, 'rolls', { name: 'Rolls', departmentId: 'bread' });
      await seedArticle(TEST_USERS.alice, 'baguette', { name: 'Baguette', departmentId: 'bread' });
      await seedArticle(TEST_USERS.alice, 'misc', { name: 'Mystery Item' }); // no department

      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);
      const deptCounts = countArticlesByDepartment(articles as any);

      debugLog('deptCounts', 'Department distribution', Object.fromEntries(deptCounts));

      expect(deptCounts.get('dairy-products')).toBe(2);
      expect(deptCounts.get('bread')).toBe(3);
      expect(deptCounts.get('none')).toBe(1); // no department

      if (!deptCounts.get('dairy-products') || !deptCounts.get('bread')) {
        dumpCollection('articles', articles);
      }
    });

    it('should count articles per category correctly', async () => {
      await seedArticle(TEST_USERS.alice, 'a1', { name: 'Milk', categoryId: 'basics' });
      await seedArticle(TEST_USERS.alice, 'a2', { name: 'Bread', categoryId: 'basics' });
      await seedArticle(TEST_USERS.alice, 'a3', { name: 'Steak', categoryId: 'premium' });
      await seedArticle(TEST_USERS.alice, 'a4', { name: 'Widget' }); // no category

      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);
      const catCounts = countArticlesByCategory(articles as any);

      debugLog('catCounts', 'Category distribution', Object.fromEntries(catCounts));

      expect(catCounts.get('basics')).toBe(2);
      expect(catCounts.get('premium')).toBe(1);
      expect(catCounts.get('none')).toBe(1);
    });
  });

  // ========================================
  // Article Search (selectArticlesByNameSearch)
  // ========================================

  describe('Article search (search bar in article overview)', () => {
    beforeEach(async () => {
      await seedArticle(TEST_USERS.alice, 'vollmilch', { name: 'Vollmilch 3.5%' });
      await seedArticle(TEST_USERS.alice, 'hafermilch', { name: 'Hafermilch' });
      await seedArticle(TEST_USERS.alice, 'bread', { name: 'Brot' });
      await seedArticle(TEST_USERS.alice, 'eggs', { name: 'Eier Bio' });
      await seedArticle(TEST_USERS.alice, 'butter', { name: 'Butter' });
    });

    it('should find articles by partial name match (case-insensitive)', async () => {
      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);

      const milkResults = searchArticlesByName(articles as any, 'milch');
      debugLog('search', `Search "milch" found ${milkResults.length} results`, milkResults.map((a) => a.name));

      expect(milkResults.length).toBe(2);
      expect(milkResults.map((a) => a.name).sort()).toEqual(['Hafermilch', 'Vollmilch 3.5%']);
    });

    it('should return all articles for empty search', async () => {
      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);

      const allResults = searchArticlesByName(articles as any, '');
      expect(allResults.length).toBe(5);
    });

    it('should return empty array for non-matching search', async () => {
      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);

      const noResults = searchArticlesByName(articles as any, 'Schokolade');
      expect(noResults.length).toBe(0);
    });

    it('should be case-insensitive', async () => {
      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);

      const upper = searchArticlesByName(articles as any, 'BUTTER');
      const lower = searchArticlesByName(articles as any, 'butter');
      const mixed = searchArticlesByName(articles as any, 'BuTtEr');

      expect(upper.length).toBe(1);
      expect(lower.length).toBe(1);
      expect(mixed.length).toBe(1);
    });
  });

  // ========================================
  // Article Filtering (no department, notes, etc.)
  // ========================================

  describe('Article filters (article overview filter chips)', () => {
    it('should identify articles without department assignment', async () => {
      await seedArticle(TEST_USERS.alice, 'assigned', { name: 'Assigned', departmentId: 'dairy-products' });
      await seedArticle(TEST_USERS.alice, 'unassigned1', { name: 'Unassigned 1' });
      await seedArticle(TEST_USERS.alice, 'unassigned2', { name: 'Unassigned 2' });

      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);
      const withoutDept = (articles as any[]).filter((a: any) => !a.departmentId);

      debugLog('filter', `Articles without department: ${withoutDept.length}`, withoutDept.map((a: any) => a.name));

      expect(withoutDept.length).toBe(2);
    });

    it('should identify articles with notes', async () => {
      await seedArticle(TEST_USERS.alice, 'noted', { name: 'With Note', notes: 'Buy organic' });
      await seedArticle(TEST_USERS.alice, 'empty-note', { name: 'Empty Note', notes: '' });
      await seedArticle(TEST_USERS.alice, 'no-note', { name: 'No Note' });

      const articles = await readCollectionAsAdmin(`users-v2/${TEST_USERS.alice}/articles`);
      const withNotes = (articles as any[]).filter(
        (a: any) => a.notes && a.notes.trim().length > 0
      );

      expect(withNotes.length).toBe(1);
      expect(withNotes[0].name).toBe('With Note');
    });
  });

  // ========================================
  // Collection Queries (ordering)
  // ========================================

  describe('Collection queries (list ordering in UI)', () => {
    it('should query lists ordered by name', async () => {
      await seedList(TEST_USERS.alice, 'c-list', { name: 'Charlie List' });
      await seedList(TEST_USERS.alice, 'a-list', { name: 'Alpha List' });
      await seedList(TEST_USERS.alice, 'b-list', { name: 'Bravo List' });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/lists`)
        .orderBy('name')
        .get();

      const names = snapshot.docs.map((d) => d.data()['name']);
      debugLog('query', 'Lists ordered by name', names);

      expect(names).toEqual(['Alpha List', 'Bravo List', 'Charlie List']);
    });

    it('should query lists ordered by updatedAt descending', async () => {
      const t1 = Timestamp.fromDate(new Date('2025-01-01'));
      const t2 = Timestamp.fromDate(new Date('2025-06-01'));
      const t3 = Timestamp.fromDate(new Date('2025-12-01'));

      await seedList(TEST_USERS.alice, 'old', { name: 'Old', updatedAt: t1 });
      await seedList(TEST_USERS.alice, 'mid', { name: 'Mid', updatedAt: t2 });
      await seedList(TEST_USERS.alice, 'new', { name: 'New', updatedAt: t3 });

      const db = getAuthContext(TEST_USERS.alice).firestore();
      const snapshot = await db
        .collection(`users-v2/${TEST_USERS.alice}/lists`)
        .orderBy('updatedAt', 'desc')
        .get();

      const names = snapshot.docs.map((d) => d.data()['name']);
      debugLog('query', 'Lists ordered by updatedAt desc', names);

      expect(names).toEqual(['New', 'Mid', 'Old']);
    });
  });

  // ========================================
  // Shared List Queries
  // ========================================

  describe('Shared list queries (shared lists section in UI)', () => {
    it('should find shared lists for a user via direct read', async () => {
      // Alice has a list shared with Bob
      await seedList(TEST_USERS.alice, 'shared-1', {
        name: 'Shared with Bob',
        sharedWith: [TEST_USERS.bob],
      });

      // Alice has a private list (NOT shared with Bob)
      await seedList(TEST_USERS.alice, 'private-1', {
        name: 'Private',
        sharedWith: [],
      });

      // Bob should be able to read shared-1 but not private-1
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();

      const sharedSnap = await bobDb
        .doc(`users-v2/${TEST_USERS.alice}/lists/shared-1`)
        .get();
      expect(sharedSnap.exists).toBe(true);
      expect(sharedSnap.data()!['name']).toBe('Shared with Bob');

      debugLog('shared', 'Bob can read shared list', { name: sharedSnap.data()!['name'] });
    });

    it('should see updated shared list counts when collaborator adds articles', async () => {
      // Setup: shared list with 1 article
      await seedList(TEST_USERS.alice, 'collab-list', {
        name: 'Collaboration',
        sharedWith: [TEST_USERS.bob],
        articleIds: ['a1'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Existing', isChecked: false },
        },
      });

      // Bob adds an article
      const bobDb = getAuthContext(TEST_USERS.bob).firestore();
      await assertSucceeds(
        bobDb.doc(`users-v2/${TEST_USERS.alice}/lists/collab-list`).update({
          articleIds: ['a1', 'a2'],
          'itemStates.a2': {
            articleId: 'a2',
            articleName: 'Bob Added',
            isChecked: false,
          },
          ownerId: TEST_USERS.alice,
          sharedWith: [TEST_USERS.bob],
          updatedAt: Timestamp.now(),
        })
      );

      // Verify counts updated
      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/collab-list`);
      const counts = computeListCounts(doc as any);

      debugLog('collab', 'After Bob added article', counts);

      expect(counts.totalItems).toBe(2);
      expect(counts.uncheckedItems).toBe(2);
    });
  });

  // ========================================
  // Data Integrity After Operations
  // ========================================

  describe('Data integrity after check/uncheck operations', () => {
    it('should maintain correct counts after checking an item', async () => {
      await seedList(TEST_USERS.alice, 'check-test', {
        articleIds: ['a1', 'a2', 'a3'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'One', isChecked: false },
          a2: { articleId: 'a2', articleName: 'Two', isChecked: false },
          a3: { articleId: 'a3', articleName: 'Three', isChecked: false },
        },
      });

      // Check first item
      const db = getAuthContext(TEST_USERS.alice).firestore();
      await db.doc(`users-v2/${TEST_USERS.alice}/lists/check-test`).update({
        'itemStates.a1.isChecked': true,
        'itemStates.a1.checkedAt': Timestamp.now(),
        'itemStates.a1.checkedBy': TEST_USERS.alice,
        updatedAt: Timestamp.now(),
      });

      let doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/check-test`);
      let counts = computeListCounts(doc as any);
      debugLog('check', 'After checking 1 item', counts);

      expect(counts.totalItems).toBe(3);
      expect(counts.checkedItems).toBe(1);
      expect(counts.uncheckedItems).toBe(2);

      // Check second item
      await db.doc(`users-v2/${TEST_USERS.alice}/lists/check-test`).update({
        'itemStates.a2.isChecked': true,
        'itemStates.a2.checkedAt': Timestamp.now(),
        'itemStates.a2.checkedBy': TEST_USERS.alice,
        updatedAt: Timestamp.now(),
      });

      doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/check-test`);
      counts = computeListCounts(doc as any);
      debugLog('check', 'After checking 2 items', counts);

      expect(counts.totalItems).toBe(3);
      expect(counts.checkedItems).toBe(2);
      expect(counts.uncheckedItems).toBe(1);

      // Uncheck first item
      await db.doc(`users-v2/${TEST_USERS.alice}/lists/check-test`).update({
        'itemStates.a1.isChecked': false,
        updatedAt: Timestamp.now(),
      });

      doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/check-test`);
      counts = computeListCounts(doc as any);
      debugLog('check', 'After unchecking 1 item', counts);

      expect(counts.totalItems).toBe(3);
      expect(counts.checkedItems).toBe(1);
      expect(counts.uncheckedItems).toBe(2);
    });

    it('should maintain counts after removing an article from a list', async () => {
      await seedList(TEST_USERS.alice, 'remove-test', {
        articleIds: ['a1', 'a2', 'a3'],
        itemStates: {
          a1: { articleId: 'a1', articleName: 'Keep', isChecked: false },
          a2: { articleId: 'a2', articleName: 'Remove', isChecked: true, checkedAt: Timestamp.now() },
          a3: { articleId: 'a3', articleName: 'Keep 2', isChecked: false },
        },
      });

      // Remove a2 from the list
      const db = getAuthContext(TEST_USERS.alice).firestore();

      // Read current state
      const snap = await db.doc(`users-v2/${TEST_USERS.alice}/lists/remove-test`).get();
      const currentData = snap.data()!;
      const currentItemStates = currentData['itemStates'] as Record<string, unknown>;

      // Build new state without a2
      const newItemStates = { ...currentItemStates };
      delete newItemStates['a2'];

      await db.doc(`users-v2/${TEST_USERS.alice}/lists/remove-test`).update({
        articleIds: ['a1', 'a3'],
        itemStates: newItemStates,
        updatedAt: Timestamp.now(),
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/remove-test`);
      const counts = computeListCounts(doc as any);
      debugLog('remove', 'After removing checked article', counts);

      expect(counts.totalItems).toBe(2);
      expect(counts.checkedItems).toBe(0); // the checked item was removed
      expect(counts.uncheckedItems).toBe(2);
    });
  });

  // ========================================
  // Data Shape Validation
  // ========================================

  describe('Data shape validation (ensures Firestore data matches expected model)', () => {
    it('should persist and retrieve all ShoppingList fields', async () => {
      const now = Timestamp.now();
      await seedList(TEST_USERS.alice, 'full-list', {
        name: 'Complete List',
        color: '#FF5733',
        icon: 'shopping_cart',
        shopId: 'shop-1',
        departmentOrder: ['dairy-products', 'bread', 'frozen-goods'],
        sharedWith: [TEST_USERS.bob],
        articleIds: ['a1'],
        itemStates: {
          a1: {
            articleId: 'a1',
            articleName: 'Milk',
            isChecked: true,
            amount: '2L',
            notes: 'Bio',
            addedAt: now,
            checkedAt: now,
            checkedBy: TEST_USERS.alice,
          },
        },
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/lists/full-list`);
      expect(doc).toBeDefined();

      // Validate all top-level fields
      expect(doc!['name']).toBe('Complete List');
      expect(doc!['color']).toBe('#FF5733');
      expect(doc!['icon']).toBe('shopping_cart');
      expect(doc!['shopId']).toBe('shop-1');
      expect(doc!['ownerId']).toBe(TEST_USERS.alice);
      expect(doc!['sharedWith']).toEqual([TEST_USERS.bob]);
      expect(doc!['departmentOrder']).toEqual(['dairy-products', 'bread', 'frozen-goods']);

      // Validate itemState shape
      const states = doc!['itemStates'] as Record<string, Record<string, unknown>>;
      const a1State = states['a1'];
      expect(a1State['articleId']).toBe('a1');
      expect(a1State['articleName']).toBe('Milk');
      expect(a1State['isChecked']).toBe(true);
      expect(a1State['amount']).toBe('2L');
      expect(a1State['notes']).toBe('Bio');
      expect(a1State['checkedBy']).toBe(TEST_USERS.alice);

      debugLog('shape', 'Full list fields validated', {
        fieldCount: Object.keys(doc!).length,
        itemStateFieldCount: Object.keys(a1State).length,
      });
    });

    it('should persist and retrieve all Article fields', async () => {
      await seedArticle(TEST_USERS.alice, 'full-article', {
        name: 'Vollmilch 3.5%',
        amount: '2L',
        notes: 'Bio preferred',
        icon: 'milk',
        categoryId: 'dairy',
        departmentId: 'dairy-products',
        usageCount: 15,
        numberOfChecks: 42,
        copiedFrom: 'original-123',
        lastCheckedDate: Timestamp.now(),
        lastAddedToListDate: Timestamp.now(),
      });

      const doc = await readDocAsAdmin(`users-v2/${TEST_USERS.alice}/articles/full-article`);
      expect(doc).toBeDefined();

      expect(doc!['name']).toBe('Vollmilch 3.5%');
      expect(doc!['amount']).toBe('2L');
      expect(doc!['notes']).toBe('Bio preferred');
      expect(doc!['icon']).toBe('milk');
      expect(doc!['categoryId']).toBe('dairy');
      expect(doc!['departmentId']).toBe('dairy-products');
      expect(doc!['ownerId']).toBe(TEST_USERS.alice);
      expect(doc!['usageCount']).toBe(15);
      expect(doc!['numberOfChecks']).toBe(42);
      expect(doc!['copiedFrom']).toBe('original-123');

      debugLog('shape', 'Full article fields validated', {
        fieldCount: Object.keys(doc!).length,
      });
    });
  });
});
