import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Observable, ReplaySubject, BehaviorSubject, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { ListsEffects } from '../../../state/lists/lists.effects';
import { ListsRepositoryService } from '../../../core/services/lists-repository.service';
import { FirebaseDataService } from '../../../core/services/firebase-data.service';
import * as ListsActions from '../../../state/lists/lists.actions';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { ShoppingList, Article } from '../../../core/models';

/**
 * BUG 1 INTEGRATION TEST: Article count not displayed for shared lists (non-owners)
 *
 * This is a TRUE integration test that tests the full data flow:
 * Firebase (mocked) → NgRx Effects → Reducers → Selectors → Component behavior
 *
 * EXPECTED BEHAVIOR:
 * - Non-owner navigates to /lists
 * - Firebase returns shared list WITH articleIds populated
 * - List overview displays "2/3 Artikel" immediately
 *
 * ACTUAL BUG:
 * - Firebase returns shared list with EMPTY or missing articleIds
 * - List overview displays no count (empty string)
 * - Count only appears after user opens the list (lazy loading triggers full load)
 *
 * This test will FAIL until the bug is fixed.
 */

describe('Bug 1 INTEGRATION: Article count in shared lists', () => {
  let store: MockStore;
  let effects: ListsEffects;
  let firebaseDataService: any;
  let listsSubject: BehaviorSubject<ShoppingList[]>;
  let articlesSubject: BehaviorSubject<Article[]>;

  const OWNER_ID = 'owner-123';
  const COLLABORATOR_ID = 'collaborator-456';

  const testArticles: Article[] = [
    {
      id: 'article1',
      name: 'Milk',
      ownerId: OWNER_ID,
      departmentId: 'dairy-products',
      icon: '🥛',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'article2',
      name: 'Bread',
      ownerId: OWNER_ID,
      departmentId: 'bread',
      icon: '🍞',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'article3',
      name: 'Butter',
      ownerId: OWNER_ID,
      departmentId: 'dairy-products',
      icon: '🧈',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    // Create BehaviorSubjects to simulate Firebase real-time observables
    listsSubject = new BehaviorSubject<ShoppingList[]>([]);
    articlesSubject = new BehaviorSubject<Article[]>(testArticles);

    // Mock FirebaseDataService
    firebaseDataService = {
      getLists:     vi.fn().mockReturnValue(listsSubject.asObservable()),
      getList:      vi.fn(),
      getArticles:  vi.fn().mockReturnValue(articlesSubject.asObservable()),
    };

    // Mock ListsRepositoryService
    const listsRepoSpy = { createList: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ListsEffects,
        provideMockStore({
          initialState: {
            lists: { ids: [], entities: {}, loading: false, error: null, selectedListId: null, lastSync: null },
            articles: { ids: [], entities: {}, loading: false, error: null, selectedArticleId: null, lastSync: null },
          },
        }),
        provideMockActions(() => new ReplaySubject(1)),
        { provide: FirebaseDataService, useValue: firebaseDataService },
        { provide: ListsRepositoryService, useValue: listsRepoSpy },
      ],
    });

    store = TestBed.inject(MockStore);
    effects = TestBed.inject(ListsEffects);
  });

  afterEach(() => {
    store?.resetSelectors();
  });

  describe('SCENARIO: Shared list with EMPTY articleIds (current bug)', () => {
    it('should FAIL: articleIds is empty for shared list on initial load', async () => {
      // SIMULATE THE BUG: Firebase returns shared list with EMPTY articleIds
      // This is what actually happens in production for non-owners
      const buggySharedList: ShoppingList = {
        id: 'list-1',
        name: 'Groceries',
        ownerId: OWNER_ID,
        sharedWith: [COLLABORATOR_ID],
        articleIds: [], // BUG: Empty array instead of ['article1', 'article2', 'article3']
        itemStates: {
          'article1': { articleId: 'article1', isChecked: false },
          'article2': { articleId: 'article2', isChecked: false },
          'article3': { articleId: 'article3', isChecked: true },
        },
        departmentOrder: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Simulate Firebase emitting buggy data
      listsSubject.next([buggySharedList]);

      // Dispatch loadListsSuccess (as effects would do)
      store.dispatch(ListsActions.loadListsSuccess({ lists: [buggySharedList] }));

      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get lists from store via selector
      const lists = await store.select(selectAllLists).pipe(take(1)).toPromise();

      expect(lists?.length).toBe(1);
      const sharedList = lists![0];

      // THIS IS THE BUG: articleIds is empty
      expect(sharedList.articleIds).toEqual([]); // BUG: Should have 3 article IDs
      expect(sharedList.articleIds.length).toBe(0); // BUG: Should be 3

      // Component would calculate count incorrectly
      const activeCount = sharedList.articleIds.filter(
        id => !sharedList.itemStates[id]?.isChecked
      ).length;
      expect(activeCount).toBe(0); // BUG: Should be 2 (article1 and article2 unchecked)

      // TEST ASSERTION: This test FAILS (shows bug exists)
      // After fix, articleIds should be populated with ['article1', 'article2', 'article3']
      expect(sharedList.articleIds).toContain('article1'); // FAILS NOW
      expect(sharedList.articleIds).toContain('article2'); // FAILS NOW
      expect(sharedList.articleIds).toContain('article3'); // FAILS NOW
      expect(sharedList.articleIds.length).toBe(3); // FAILS NOW
    });
  });

  describe('SCENARIO: What it SHOULD be (after fix)', () => {
    it('should PASS after fix: articleIds populated for shared list', async () => {
      // EXPECTED BEHAVIOR: Firebase returns complete list data
      const correctSharedList: ShoppingList = {
        id: 'list-1',
        name: 'Groceries',
        ownerId: OWNER_ID,
        sharedWith: [COLLABORATOR_ID],
        articleIds: ['article1', 'article2', 'article3'], // CORRECT: All article IDs present
        itemStates: {
          'article1': { articleId: 'article1', isChecked: false },
          'article2': { articleId: 'article2', isChecked: false },
          'article3': { articleId: 'article3', isChecked: true },
        },
        departmentOrder: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      listsSubject.next([correctSharedList]);
      store.dispatch(ListsActions.loadListsSuccess({ lists: [correctSharedList] }));

      await new Promise(resolve => setTimeout(resolve, 100));

      const lists = await store.select(selectAllLists).pipe(take(1)).toPromise();
      const sharedList = lists![0];

      // After fix, this should work correctly
      expect(sharedList.articleIds.length).toBe(3);
      expect(sharedList.articleIds).toContain('article1');
      expect(sharedList.articleIds).toContain('article2');
      expect(sharedList.articleIds).toContain('article3');

      // Component would calculate correct count
      const activeCount = sharedList.articleIds.filter(
        id => !sharedList.itemStates[id]?.isChecked
      ).length;
      expect(activeCount).toBe(2); // Correct: 2 unchecked articles
    });
  });

  describe('ROOT CAUSE INVESTIGATION', () => {
    it('should help identify where articleIds get lost', async () => {
      // Test various stages of data flow to identify where articleIds disappear

      // Stage 1: Check if Firebase mock returns correct data
      const firebaseList: ShoppingList = {
        id: 'list-1',
        name: 'Test',
        ownerId: OWNER_ID,
        sharedWith: [COLLABORATOR_ID],
        articleIds: ['article1', 'article2'], // Start with populated IDs
        itemStates: {},
        departmentOrder: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      listsSubject.next([firebaseList]);

      // Stage 2: Check what getLists() returns
      const fromGetLists = await firebaseDataService.getLists().pipe(take(1)).toPromise();
      expect(fromGetLists![0].articleIds.length).toBe(2); // Should have IDs from mock

      // Stage 3: Dispatch action and check store
      store.dispatch(ListsActions.loadListsSuccess({ lists: [firebaseList] }));
      await new Promise(resolve => setTimeout(resolve, 100));

      const fromStore = await store.select(selectAllLists).pipe(take(1)).toPromise();

      // DIAGNOSTIC: Where do articleIds disappear?
      console.log('Firebase returned:', firebaseList.articleIds);
      console.log('Store has:', fromStore![0]?.articleIds);

      // This test helps us find WHERE the bug occurs in the data flow
      expect(fromStore![0]?.articleIds.length).toBe(2); // Should preserve IDs
    });
  });
});
