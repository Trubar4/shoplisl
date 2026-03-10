/**
 * Unit tests for the updateList race-condition fix (Bug 1).
 *
 * ROOT CAUSE: The original updateList called getLists().find() AFTER awaiting the
 * Firebase write. If mergeLists() debounce fired during that window with stale
 * Firebase data, it overwrote the BehaviorSubject before the find() ran, returning
 * undefined or the old list — so addExistingArticleToList silently failed.
 *
 * FIX: Capture the locally-computed updated list BEFORE the async write and return
 * it directly. The BehaviorSubject state after the write is irrelevant for the
 * return value; NgRx is updated via updateListSuccess dispatched by the caller.
 */

import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { ListsRepositoryService } from './lists-repository.service';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { HistoryService } from './history.service';
import { AuthService } from './auth.service';
import { ArticlesRepositoryService } from './articles-repository.service';
import { AnalyticsService } from './analytics.service';
import { ShoppingList } from '../models';

const makeList = (overrides: Partial<ShoppingList> = {}): ShoppingList => ({
  id: 'list-1',
  name: 'My List',
  articleIds: [],
  itemStates: {},
  departmentOrder: [],
  ownerId: 'user-1',
  sharedWith: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ListsRepositoryService.updateList — race condition fix (Bug 1)', () => {
  let service: ListsRepositoryService;
  let listsSubject: BehaviorSubject<ShoppingList[]>;

  // Helpers
  let getCurrentListsFn: jasmine.Spy;
  let updateLocalListsFn: jasmine.Spy;
  let updateListInFirebaseFn: jasmine.Spy;

  beforeEach(() => {
    const existingList = makeList();
    listsSubject = new BehaviorSubject<ShoppingList[]>([existingList]);

    const firebaseSpy = jasmine.createSpyObj('FirebaseDataService', [
      'getCurrentLists',
      'updateLocalLists',
      'getLists',
      'updateListInFirebase',
    ]);
    firebaseSpy.getCurrentLists.and.callFake(() => listsSubject.value);
    firebaseSpy.getLists.and.callFake(() => listsSubject.asObservable());
    firebaseSpy.updateLocalLists.and.callFake((lists: ShoppingList[]) => listsSubject.next(lists));
    firebaseSpy.updateListInFirebase.and.returnValue(Promise.resolve());

    getCurrentListsFn      = firebaseSpy.getCurrentLists;
    updateLocalListsFn     = firebaseSpy.updateLocalLists;
    updateListInFirebaseFn = firebaseSpy.updateListInFirebase;

    const connectionSpy = jasmine.createSpyObj('ConnectionService', ['isOnline']);
    connectionSpy.isOnline.and.returnValue(true);

    const authSpy = jasmine.createSpyObj('AuthService', ['getCurrentUserId', 'getCurrentUserValue']);
    authSpy.getCurrentUserId.and.returnValue('user-1');
    authSpy.getCurrentUserValue.and.returnValue({ id: 'user-1', name: 'Tester' });

    const analyticsSpy = jasmine.createSpyObj('AnalyticsService', ['trackEvent']);
    const loggerSpy    = jasmine.createSpyObj('LoggerService', ['info', 'error', 'debug', 'warn']);
    const historySpy   = jasmine.createSpyObj('HistoryService', ['createUpdatedItemState']);
    const offlineSpy   = jasmine.createSpyObj('OfflineSyncService', ['queueOperation']);
    const articlesSpy  = jasmine.createSpyObj('ArticlesRepositoryService', []);
    const injectorSpy  = jasmine.createSpyObj('Injector', ['get']);

    TestBed.configureTestingModule({
      providers: [
        ListsRepositoryService,
        { provide: FirebaseDataService,       useValue: firebaseSpy },
        { provide: ConnectionService,         useValue: connectionSpy },
        { provide: AuthService,               useValue: authSpy },
        { provide: AnalyticsService,          useValue: analyticsSpy },
        { provide: LoggerService,             useValue: loggerSpy },
        { provide: HistoryService,            useValue: historySpy },
        { provide: OfflineSyncService,        useValue: offlineSpy },
        { provide: ArticlesRepositoryService, useValue: articlesSpy },
        { provide: 'Injector',                useValue: injectorSpy },
      ],
    });

    service = TestBed.inject(ListsRepositoryService);
  });

  it('returns the locally-computed updated list (not read from BehaviorSubject after write)', async () => {
    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    expect(result).toBeDefined();
    expect(result!.id).toBe('list-1');
    expect(result!.articleIds).toContain('article-new');
  });

  it('returns the updated list even when mergeLists() overwrites the BehaviorSubject mid-flight', async () => {
    // Simulate mergeLists() resetting the BehaviorSubject with stale data DURING the write:
    updateListInFirebaseFn.and.callFake(() => {
      // Overwrite BehaviorSubject with old list (simulates debounced mergeLists firing)
      listsSubject.next([makeList()]); // old list without the article
      return Promise.resolve();
    });

    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    // Fix: return value must still be the locally-computed updated list
    expect(result).toBeDefined();
    expect(result!.articleIds).toContain('article-new');
  });

  it('returns undefined when the list is not found in getCurrentLists()', async () => {
    // Simulate: BehaviorSubject doesn't have this list (edge case for very fast navigation)
    listsSubject.next([]); // empty — list not loaded yet
    // Force getCurrentLists to return empty
    getCurrentListsFn.and.returnValue([]);

    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    expect(result).toBeUndefined();
  });

  it('returns undefined when the Firebase write fails', async () => {
    updateListInFirebaseFn.and.returnValue(Promise.reject(new Error('Network error')));

    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    expect(result).toBeUndefined();
  });
});
