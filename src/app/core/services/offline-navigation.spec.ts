import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

import { Article, ShoppingList } from '../../../core/models';

/**
 * OFFLINE NAVIGATION TEST: Articles must persist across list navigations
 *
 * BUG: When offline, only the first opened list shows articles. All subsequent
 * lists show zero articles regardless of filter.
 *
 * ROOT CAUSE: loadCachedData() populates listsSubject and articlesSubject
 * (BehaviorSubjects) and the ownedArticles/sharedArticles backing arrays,
 * but does NOT populate the ownedLists/sharedLists backing arrays.
 * When mergeLists() is later triggered by a Firestore listener (even offline
 * via IndexedDB), it merges [...ownedLists, ...sharedLists]. If those arrays
 * are empty, it emits an empty array to listsSubject, which triggers
 * loadListsSuccess([]) in the effect, clearing the store.
 *
 * Similarly, if mergeArticles() is triggered while ownedArticles was cleared,
 * it would emit empty articles → loadArticlesSuccess([]) → store cleared.
 *
 * This test validates the data flow at the service level.
 */
describe('Offline Navigation - Articles persist across lists', () => {
  // Simulate the BehaviorSubjects from FirebaseDataService
  let listsSubject: BehaviorSubject<ShoppingList[]>;
  let articlesSubject: BehaviorSubject<Article[]>;
  let ownedLists: ShoppingList[];
  let sharedLists: ShoppingList[];
  let ownedArticles: Article[];
  let sharedArticles: Article[];

  const USER_ID = 'user-1';

  const testArticles: Article[] = [
    { id: 'a1', name: 'Milch', ownerId: USER_ID, departmentId: 'dairy', icon: '🥛', createdAt: new Date(), updatedAt: new Date() },
    { id: 'a2', name: 'Brot', ownerId: USER_ID, departmentId: 'bread', icon: '🍞', createdAt: new Date(), updatedAt: new Date() },
    { id: 'a3', name: 'Butter', ownerId: USER_ID, departmentId: 'dairy', icon: '🧈', createdAt: new Date(), updatedAt: new Date() },
    { id: 'a4', name: 'Seife', ownerId: USER_ID, departmentId: 'hygiene', icon: '🧼', createdAt: new Date(), updatedAt: new Date() },
  ];

  const testLists: ShoppingList[] = [
    {
      id: 'list-1', name: 'Wocheneinkauf', ownerId: USER_ID,
      articleIds: ['a1', 'a2'], departmentOrder: [],
      itemStates: {
        'a1': { articleId: 'a1', isChecked: false, articleName: 'Milch', addedAt: new Date() },
        'a2': { articleId: 'a2', isChecked: true, articleName: 'Brot', addedAt: new Date() },
      },
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: 'list-2', name: 'Drogerie', ownerId: USER_ID,
      articleIds: ['a3', 'a4'], departmentOrder: [],
      itemStates: {
        'a3': { articleId: 'a3', isChecked: false, articleName: 'Butter', addedAt: new Date() },
        'a4': { articleId: 'a4', isChecked: false, articleName: 'Seife', addedAt: new Date() },
      },
      createdAt: new Date(), updatedAt: new Date(),
    },
  ];

  /** Simulates executeMergeLists() in FirebaseDataService */
  function executeMergeLists() {
    const allLists = [...ownedLists, ...sharedLists];
    const uniqueLists = Array.from(new Map(allLists.map(l => [l.id, l])).values());
    listsSubject.next(uniqueLists);
  }

  /** Simulates mergeArticles() in FirebaseDataService */
  function executeMergeArticles() {
    const allArticles = [...ownedArticles, ...sharedArticles];
    const uniqueArticles = Array.from(new Map(allArticles.map(a => [a.id, a])).values());
    articlesSubject.next(uniqueArticles);
  }

  beforeEach(() => {
    listsSubject = new BehaviorSubject<ShoppingList[]>([]);
    articlesSubject = new BehaviorSubject<Article[]>([]);
    ownedLists = [];
    sharedLists = [];
    ownedArticles = [];
    sharedArticles = [];
  });

  describe('BUG REPRODUCTION: loadCachedData does not populate ownedLists', () => {

    it('should show that mergeLists emits empty when ownedLists not populated', () => {
      // Simulate loadCachedData(): populates subjects but NOT backing arrays
      listsSubject.next(testLists);    // listsSubject populated ✅
      articlesSubject.next(testArticles); // articlesSubject populated ✅
      // ownedLists = [] ← NOT populated by loadCachedData ❌
      // sharedLists = [] ← NOT populated by loadCachedData ❌
      ownedArticles = testArticles.filter(a => a.ownerId === USER_ID);

      // Verify subjects have data
      expect(listsSubject.value.length).toBe(2);
      expect(articlesSubject.value.length).toBe(4);

      // Simulate what happens when a Firestore listener calls mergeLists():
      // This is the BUG - ownedLists is empty, so merge produces empty array
      executeMergeLists();

      // BUG: listsSubject is now EMPTY because ownedLists was never populated
      expect(listsSubject.value.length).toBe(0); // This IS the bug
    });

    it('should show that mergeArticles emits empty when ownedArticles not populated', () => {
      articlesSubject.next(testArticles);
      // ownedArticles and sharedArticles are empty (not populated)

      expect(articlesSubject.value.length).toBe(4);

      // If mergeArticles() is triggered while backing arrays are empty:
      executeMergeArticles();

      // BUG: articlesSubject is now EMPTY
      expect(articlesSubject.value.length).toBe(0);
    });
  });

  describe('AFTER FIX: loadCachedData populates backing arrays', () => {

    it('should preserve lists after mergeLists when ownedLists is populated', () => {
      // FIXED loadCachedData: populates subjects AND backing arrays
      listsSubject.next(testLists);
      articlesSubject.next(testArticles);
      ownedLists = testLists.filter(l => l.ownerId === USER_ID);
      sharedLists = testLists.filter(l => l.ownerId !== USER_ID);
      ownedArticles = testArticles.filter(a => a.ownerId === USER_ID);
      sharedArticles = testArticles.filter(a => a.ownerId !== USER_ID);

      expect(listsSubject.value.length).toBe(2);

      // Now when mergeLists fires, it merges the populated arrays
      executeMergeLists();

      // FIXED: listsSubject still has all lists
      expect(listsSubject.value.length).toBe(2);
      expect(listsSubject.value.map(l => l.name)).toContain('Wocheneinkauf');
      expect(listsSubject.value.map(l => l.name)).toContain('Drogerie');
    });

    it('should preserve articles after mergeArticles when ownedArticles is populated', () => {
      articlesSubject.next(testArticles);
      ownedArticles = testArticles.filter(a => a.ownerId === USER_ID);
      sharedArticles = testArticles.filter(a => a.ownerId !== USER_ID);

      expect(articlesSubject.value.length).toBe(4);

      executeMergeArticles();

      // FIXED: articlesSubject still has all articles
      expect(articlesSubject.value.length).toBe(4);
    });

    it('should allow filtering articles for different lists after navigation', () => {
      // Simulate FIXED loadCachedData
      listsSubject.next(testLists);
      articlesSubject.next(testArticles);
      ownedLists = [...testLists];
      ownedArticles = [...testArticles];

      // Simulate opening list 1 - filter articles
      const list1 = listsSubject.value.find(l => l.id === 'list-1')!;
      const articlesForList1 = articlesSubject.value.filter(a => list1.articleIds.includes(a.id));
      expect(articlesForList1.length).toBe(2);
      expect(articlesForList1.map(a => a.name)).toContain('Milch');
      expect(articlesForList1.map(a => a.name)).toContain('Brot');

      // Simulate mergeLists being called (e.g., by lazy listener)
      executeMergeLists();

      // Simulate opening list 2 - filter articles
      const list2 = listsSubject.value.find(l => l.id === 'list-2')!;
      expect(list2).toBeDefined(); // List 2 still exists after merge

      const articlesForList2 = articlesSubject.value.filter(a => list2.articleIds.includes(a.id));
      expect(articlesForList2.length).toBe(2);
      expect(articlesForList2.map(a => a.name)).toContain('Butter');
      expect(articlesForList2.map(a => a.name)).toContain('Seife');
    });

    it('should handle mergeArticles called multiple times without data loss', () => {
      articlesSubject.next(testArticles);
      ownedArticles = [...testArticles];

      // Multiple mergeArticles calls (can happen from various listeners)
      executeMergeArticles();
      expect(articlesSubject.value.length).toBe(4);

      executeMergeArticles();
      expect(articlesSubject.value.length).toBe(4);

      executeMergeArticles();
      expect(articlesSubject.value.length).toBe(4);
    });
  });

  describe('Effect behavior with switchMap', () => {

    it('should emit articles for every loadArticles action via BehaviorSubject', async () => {
      articlesSubject.next(testArticles);

      // Simulate effect: subscribe to articlesSubject, get immediate value
      const articles1 = await articlesSubject.asObservable().pipe(take(1)).toPromise();
      expect(articles1!.length).toBe(4);

      // Simulate switchMap: unsubscribe and resubscribe (new loadArticles action)
      const articles2 = await articlesSubject.asObservable().pipe(take(1)).toPromise();
      expect(articles2!.length).toBe(4);

      // Third time (another navigation)
      const articles3 = await articlesSubject.asObservable().pipe(take(1)).toPromise();
      expect(articles3!.length).toBe(4);
    });

    it('should detect store wipe when subject emits empty after merge with empty backing arrays', async () => {
      // Initial: articles in subject
      articlesSubject.next(testArticles);

      // Effect subscribes and gets articles
      const initial = await articlesSubject.asObservable().pipe(take(1)).toPromise();
      expect(initial!.length).toBe(4);

      // BUG: mergeArticles with empty backing arrays
      // (ownedArticles and sharedArticles are both [])
      executeMergeArticles();

      // The subject now has empty articles - effect would dispatch loadArticlesSuccess([])
      const afterMerge = await articlesSubject.asObservable().pipe(take(1)).toPromise();
      expect(afterMerge!.length).toBe(0); // THIS CLEARS THE STORE
    });
  });
});
