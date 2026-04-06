import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { BehaviorSubject, ReplaySubject, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { ListsEffects } from '../../../state/lists/lists.effects';
import { FirebaseDataService } from '../../../core/services/firebase-data.service';
import { ListsRepositoryService } from '../../../core/services/lists-repository.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoggerService } from '../../../core/services/logger.service';
import * as ListsActions from '../../../state/lists/lists.actions';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { ShoppingList } from '../../../core/models';

/**
 * OFFLINE DISPLAY TEST: Verifies that the NgRx loadLists effect correctly
 * receives cached data from FirebaseDataService when offline.
 *
 * BUG: When offline, lists-overview did NOT dispatch loadLists(),
 * so the effect never subscribed to getLists(), and the store stayed empty.
 *
 * FIX: Always dispatch loadLists() regardless of connection status.
 * This test validates that when the effect IS triggered, it receives
 * cached data from the listsSubject (populated by FirebaseDataLoaderService).
 */
describe('Offline Lists Display - Effect Integration', () => {
  let store: MockStore;
  let effects: ListsEffects;
  let listsSubject: BehaviorSubject<ShoppingList[]>;
  let actions$: ReplaySubject<any>;

  const cachedLists: ShoppingList[] = [
    {
      id: 'list-1',
      name: 'Wocheneinkauf',
      ownerId: 'user-1',
      articleIds: ['a1', 'a2'],
      itemStates: {
        'a1': { articleId: 'a1', isChecked: false, articleName: 'Milch', addedAt: new Date() },
        'a2': { articleId: 'a2', isChecked: true, articleName: 'Brot', addedAt: new Date() },
      },
      departmentOrder: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'list-2',
      name: 'Drogerie',
      ownerId: 'user-1',
      articleIds: ['a3'],
      itemStates: {
        'a3': { articleId: 'a3', isChecked: false, articleName: 'Seife', addedAt: new Date() },
      },
      departmentOrder: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    // Simulate: FirebaseDataLoaderService already loaded cached data into listsSubject
    listsSubject = new BehaviorSubject<ShoppingList[]>(cachedLists);
    actions$ = new ReplaySubject(1);

    const mockFirebaseData = {
      getLists: vi.fn().mockReturnValue(listsSubject.asObservable()),
      getList: vi.fn(),
      getArticles: vi.fn().mockReturnValue(of([])),
    };

    const mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ListsEffects,
        provideMockStore({
          initialState: {
            lists: { ids: [], entities: {}, loading: false, error: null, selectedListId: null, lastSync: null, deletingListIds: [] },
            articles: { ids: [], entities: {}, loading: false, error: null, selectedArticleId: null, lastSync: null },
          },
        }),
        provideMockActions(() => actions$),
        { provide: FirebaseDataService, useValue: mockFirebaseData },
        { provide: ListsRepositoryService, useValue: {} },
        { provide: AuthService, useValue: { getCurrentUserId: vi.fn().mockReturnValue('user-1') } },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    store = TestBed.inject(MockStore);
    effects = TestBed.inject(ListsEffects);
  });

  afterEach(() => {
    store?.resetSelectors();
  });

  it('should emit loadListsSuccess with cached lists when loadLists is dispatched (offline scenario)', async () => {
    // This is the key test: when loadLists action is dispatched,
    // the effect subscribes to getLists() and receives cached data
    // (previously, loadLists was never dispatched when offline)

    const result = new Promise<any>((resolve) => {
      effects.loadLists$.subscribe(action => {
        resolve(action);
      });
    });

    // Dispatch loadLists (this is what the fix enables when offline)
    actions$.next(ListsActions.loadLists());

    const action = await result;

    expect(action.type).toBe('[Lists] Load Lists Success');
    expect(action.lists).toHaveLength(2);
    expect(action.lists[0].name).toBe('Wocheneinkauf');
    expect(action.lists[1].name).toBe('Drogerie');
  });

  it('should handle empty cache gracefully', async () => {
    // Simulate no cached data
    listsSubject.next([]);

    const result = new Promise<any>((resolve) => {
      effects.loadLists$.subscribe(action => {
        resolve(action);
      });
    });

    actions$.next(ListsActions.loadLists());

    const action = await result;

    expect(action.type).toBe('[Lists] Load Lists Success');
    expect(action.lists).toHaveLength(0);
  });

  it('should preserve list data integrity from cache (articleIds, itemStates)', async () => {
    const result = new Promise<any>((resolve) => {
      effects.loadLists$.subscribe(action => {
        resolve(action);
      });
    });

    actions$.next(ListsActions.loadLists());

    const action = await result;
    const list = action.lists[0];

    // Verify cached list data is intact
    expect(list.articleIds).toEqual(['a1', 'a2']);
    expect(list.itemStates['a1'].isChecked).toBe(false);
    expect(list.itemStates['a2'].isChecked).toBe(true);
  });
});
