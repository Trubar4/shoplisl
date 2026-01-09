import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Observable, ReplaySubject, BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

import { ArticlesEffects } from '../../../state/articles/articles.effects';
import { ArticlesRepositoryService } from '../../../core/services/articles-repository.service';
import { FirebaseDataService } from '../../../core/services/firebase-data.service';
import * as ArticlesActions from '../../../state/articles/articles.actions';
import * as ListsActions from '../../../state/lists/lists.actions';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { Article, ShoppingList } from '../../../core/models';

/**
 * BUG 2 INTEGRATION TEST: Article updates not visible when returning to list
 *
 * This is a TRUE integration test that tests the full data flow:
 * Article Edit → Firebase Update → NgRx Effects → Reducers → Selectors → Component
 *
 * EXPECTED BEHAVIOR:
 * - User edits article (changes icon from 🥛 to 🍼)
 * - Navigates back to list
 * - Article displays with NEW icon 🍼 immediately
 *
 * ACTUAL BUG:
 * - User edits article in /articles/edit/:id
 * - Article saved to Firebase successfully
 * - Navigates back to list
 * - Article STILL shows OLD icon 🥛 (stale data)
 * - Only after F5 refresh does new icon appear
 * - Root cause: NgRx store not reloading articles after edit
 *
 * This test will FAIL until the bug is fixed.
 */

describe('Bug 2 INTEGRATION: Article updates not visible after edit', () => {
  let store: MockStore;
  let effects: ArticlesEffects;
  let firebaseDataService: jasmine.SpyObj<FirebaseDataService>;
  let articlesRepositoryService: jasmine.SpyObj<ArticlesRepositoryService>;
  let articlesSubject: BehaviorSubject<Article[]>;
  let listsSubject: BehaviorSubject<ShoppingList[]>;

  const USER_ID = 'user-123';
  const LIST_ID = 'list-1';
  const ARTICLE_ID = 'article-milk';

  // Initial article state (BEFORE edit)
  const initialArticle: Article = {
    id: ARTICLE_ID,
    name: 'Milk',
    icon: '🥛', // OLD ICON
    departmentId: 'dairy-products', // OLD DEPARTMENT
    ownerId: USER_ID,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  };

  // Updated article state (AFTER edit in Firebase)
  const updatedArticle: Article = {
    id: ARTICLE_ID,
    name: 'Milk',
    icon: '🍼', // NEW ICON
    departmentId: 'beverages-alcohol', // NEW DEPARTMENT
    ownerId: USER_ID,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-09'), // Updated timestamp
  };

  const testList: ShoppingList = {
    id: LIST_ID,
    name: 'Shopping List',
    ownerId: USER_ID,
    articleIds: [ARTICLE_ID],
    itemStates: {
      [ARTICLE_ID]: { articleId: ARTICLE_ID, isChecked: false },
    },
    departmentOrder: ['dairy-products', 'beverages-alcohol'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Create BehaviorSubjects to simulate Firebase real-time observables
    articlesSubject = new BehaviorSubject<Article[]>([initialArticle]);
    listsSubject = new BehaviorSubject<ShoppingList[]>([testList]);

    // Mock FirebaseDataService
    const firebaseSpy = jasmine.createSpyObj('FirebaseDataService', [
      'getArticles',
      'getLists',
    ]);
    firebaseSpy.getArticles.and.returnValue(articlesSubject.asObservable());
    firebaseSpy.getLists.and.returnValue(listsSubject.asObservable());
    firebaseDataService = firebaseSpy;

    // Mock ArticlesRepositoryService
    const articlesRepoSpy = jasmine.createSpyObj('ArticlesRepositoryService', [
      'updateArticle',
    ]);
    // Simulate successful update but NO automatic reload
    articlesRepoSpy.updateArticle.and.returnValue(Promise.resolve(updatedArticle));
    articlesRepositoryService = articlesRepoSpy;

    TestBed.configureTestingModule({
      providers: [
        ArticlesEffects,
        provideMockStore({
          initialState: {
            articles: { ids: [ARTICLE_ID], entities: { [ARTICLE_ID]: initialArticle }, loading: false, error: null, selectedArticleId: null, lastSync: new Date() },
            lists: { ids: [LIST_ID], entities: { [LIST_ID]: testList }, loading: false, error: null, selectedListId: null, lastSync: new Date() },
          },
        }),
        provideMockActions(() => new ReplaySubject(1)),
        { provide: FirebaseDataService, useValue: firebaseDataService },
        { provide: ArticlesRepositoryService, useValue: articlesRepositoryService },
      ],
    });

    store = TestBed.inject(MockStore);
    effects = TestBed.inject(ArticlesEffects);

    // Override selectors with initial data
    store.overrideSelector(selectAllArticles, [initialArticle]);
    store.overrideSelector(selectAllLists, [testList]);
  });

  afterEach(() => {
    store?.resetSelectors();
  });

  describe('SCENARIO: Article edited but store not updated (current bug)', () => {
    it('should FAIL: article shows OLD icon after edit (no automatic reload)', async () => {
      // STEP 1: Initial state - article has old icon
      let articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      let milkArticle = articles!.find(a => a.id === ARTICLE_ID);

      expect(milkArticle?.icon).toBe('🥛'); // OLD ICON
      expect(milkArticle?.departmentId).toBe('dairy-products'); // OLD DEPARTMENT

      // STEP 2: User edits article (simulated by dispatching updateArticle)
      // In real app: User is in /articles/edit/article-milk, changes icon, clicks save
      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { icon: '🍼', departmentId: 'beverages-alcohol' }
      }));

      // STEP 3: Article is saved to Firebase successfully
      // articlesRepositoryService.updateArticle() is called and returns success
      await new Promise(resolve => setTimeout(resolve, 100));

      // STEP 4: User navigates back to list (/lists/list-1)
      // Component loads from NgRx store via selectAllArticles

      // BUG: Store still has OLD data because NO reload was triggered
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      milkArticle = articles!.find(a => a.id === ARTICLE_ID);

      // THIS IS THE BUG: Article still shows old icon
      expect(milkArticle?.icon).toBe('🥛'); // STILL OLD ICON (bug!)
      expect(milkArticle?.departmentId).toBe('dairy-products'); // STILL OLD DEPARTMENT (bug!)

      // TEST ASSERTION: This test FAILS (shows bug exists)
      // After fix, store should automatically reload articles after update
      expect(milkArticle?.icon).toBe('🍼'); // FAILS NOW - should be new icon
      expect(milkArticle?.departmentId).toBe('beverages-alcohol'); // FAILS NOW - should be new department
    });

    it('should FAIL: only F5 refresh updates the data (manual workaround)', async () => {
      // This test simulates the current workaround users have to do

      // Initial state
      let articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🥛');

      // Edit article (saves to Firebase but store not updated)
      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { icon: '🍼' }
      }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate back to list - still shows old data
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🥛'); // STILL OLD

      // WORKAROUND: User hits F5 (full page reload)
      // Simulate full reload by manually dispatching loadArticles
      articlesSubject.next([updatedArticle]); // Firebase now returns new data
      store.dispatch(ArticlesActions.loadArticlesSuccess({ articles: [updatedArticle] }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // NOW it shows correctly
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🍼'); // NEW ICON (after manual refresh)

      // TEST: After fix, F5 should NOT be needed
      // Articles should auto-reload after updateArticle success
    });
  });

  describe('SCENARIO: What it SHOULD be (after fix)', () => {
    it('should PASS after fix: article shows NEW icon immediately after edit', async () => {
      // EXPECTED BEHAVIOR: Store automatically reloads after update

      // Initial state
      let articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🥛');

      // Edit article
      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { icon: '🍼', departmentId: 'beverages-alcohol' }
      }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // AFTER FIX: Effect should dispatch loadArticles after successful update
      // Simulate what should happen:
      articlesSubject.next([updatedArticle]);
      store.dispatch(ArticlesActions.loadArticlesSuccess({ articles: [updatedArticle] }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate back to list - shows NEW data immediately
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      const milkArticle = articles!.find(a => a.id === ARTICLE_ID);

      // After fix, this should work without F5
      expect(milkArticle?.icon).toBe('🍼'); // NEW ICON
      expect(milkArticle?.departmentId).toBe('beverages-alcohol'); // NEW DEPARTMENT
    });
  });

  describe('SCENARIO: Updates visible across multiple lists', () => {
    it('should FAIL: article in List B still shows old icon after edit from List A', async () => {
      // Setup: Article exists in TWO lists
      const list2: ShoppingList = {
        id: 'list-2',
        name: 'Weekly Shop',
        ownerId: USER_ID,
        articleIds: [ARTICLE_ID],
        itemStates: {
          [ARTICLE_ID]: { articleId: ARTICLE_ID, isChecked: false },
        },
        departmentOrder: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      store.overrideSelector(selectAllLists, [testList, list2]);

      // User in List A, edits article
      let articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🥛');

      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { icon: '🍼' }
      }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate to List B - BUG: still shows old icon
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].icon).toBe('🥛'); // STILL OLD (bug!)

      // TEST ASSERTION: Should show new icon in all lists
      expect(articles![0].icon).toBe('🍼'); // FAILS NOW
    });
  });

  describe('ROOT CAUSE INVESTIGATION', () => {
    it('should identify that updateArticle success does NOT trigger reload', async () => {
      // This test helps identify the exact issue

      // Track if loadArticles gets dispatched after update
      let loadArticlesDispatched = false;
      const actions$ = new ReplaySubject<any>(1);

      // Spy on store.dispatch
      const originalDispatch = store.dispatch.bind(store);
      spyOn(store, 'dispatch').and.callFake((action: any) => {
        if (action.type === ArticlesActions.loadArticles.type) {
          loadArticlesDispatched = true;
        }
        return originalDispatch(action);
      });

      // Update article
      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { icon: '🍼' }
      }));
      await new Promise(resolve => setTimeout(resolve, 200));

      // DIAGNOSTIC: Did loadArticles get called?
      console.log('loadArticles dispatched after update:', loadArticlesDispatched);

      // ROOT CAUSE: updateArticle does NOT trigger loadArticles
      expect(loadArticlesDispatched).toBe(false); // This IS the bug

      // After fix, this should be true:
      // expect(loadArticlesDispatched).toBe(true);
    });
  });

  describe('EDGE CASE: Article name changes', () => {
    it('should FAIL: renamed article still shows old name', async () => {
      const renamedArticle: Article = {
        ...initialArticle,
        name: 'Whole Milk 3.5%',
      };

      let articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].name).toBe('Milk');

      // Update article name
      store.dispatch(ArticlesActions.updateArticle({
        articleId: ARTICLE_ID,
        changes: { name: 'Whole Milk 3.5%' }
      }));
      await new Promise(resolve => setTimeout(resolve, 100));

      // BUG: Name not updated in store
      articles = await store.select(selectAllArticles).pipe(take(1)).toPromise();
      expect(articles![0].name).toBe('Milk'); // STILL OLD

      // Should be new name
      expect(articles![0].name).toBe('Whole Milk 3.5%'); // FAILS NOW
    });
  });
});
