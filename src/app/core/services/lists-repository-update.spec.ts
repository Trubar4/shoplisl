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

import { vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { ListsRepositoryService } from './lists-repository.service';
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
  let getCurrentListsFn: ReturnType<typeof vi.fn>;
  let updateLocalListsFn: ReturnType<typeof vi.fn>;
  let updateListInFirebaseFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const existingList = makeList();
    listsSubject = new BehaviorSubject<ShoppingList[]>([existingList]);

    getCurrentListsFn      = vi.fn().mockImplementation(() => listsSubject.value);
    updateLocalListsFn     = vi.fn().mockImplementation((lists: ShoppingList[]) => listsSubject.next(lists));
    updateListInFirebaseFn = vi.fn().mockResolvedValue(undefined);

    const firebaseSpy = {
      getCurrentLists:      getCurrentListsFn,
      updateLocalLists:     updateLocalListsFn,
      getLists:             vi.fn().mockImplementation(() => listsSubject.asObservable()),
      updateListInFirebase: updateListInFirebaseFn,
    };

    const connectionSpy = { isOnline: vi.fn().mockReturnValue(true) };
    const authSpy = {
      getCurrentUserId:    vi.fn().mockReturnValue('user-1'),
      getCurrentUserValue: vi.fn().mockReturnValue({ id: 'user-1', name: 'Tester' }),
    };
    const analyticsSpy = { trackEvent: vi.fn() };
    const loggerSpy    = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
    const historySpy   = { createUpdatedItemState: vi.fn() };
    const offlineSpy   = { queueOperation: vi.fn() };
    const articlesSpy  = {};
    const injectorSpy  = { get: vi.fn() };

    service = new ListsRepositoryService(
      firebaseSpy as any,
      offlineSpy as any,
      connectionSpy as any,
      loggerSpy as any,
      historySpy as any,
      authSpy as any,
      articlesSpy as any,
      injectorSpy as any,
      analyticsSpy as any,
    );
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
    updateListInFirebaseFn.mockImplementation(() => {
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
    getCurrentListsFn.mockReturnValue([]);

    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    expect(result).toBeUndefined();
  });

  it('returns undefined when the Firebase write fails', async () => {
    updateListInFirebaseFn.mockRejectedValue(new Error('Network error'));

    const result = await service
      .updateList('list-1', { articleIds: ['article-new'] })
      .toPromise();

    expect(result).toBeUndefined();
  });
});
