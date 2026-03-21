/**
 * Unit tests for the delete-race-condition fix (Bug 2).
 *
 * ROOT CAUSE: deleteListSuccess uses removeOne, but loadListsSuccess uses setAll.
 * If a stale BehaviorSubject emission (from the 1-second debounced mergeLists)
 * fires AFTER deleteListSuccess, setAll re-adds the deleted list.
 *
 * FIX: Track deletingListIds in state. deleteList optimistically removes the list
 * and adds its id to deletingListIds. loadListsSuccess filters those ids out before
 * calling setAll. deleteListSuccess / deleteListFailure clean up the id.
 */

import { listsReducer, listsAdapter } from './lists.reducer';
import { ListsState, initialListsState } from './lists.state';
import * as ListsActions from './lists.actions';
import { ShoppingList } from '../../core/models';

const makeList = (id: string, name = 'Test'): ShoppingList => ({
  id,
  name,
  articleIds: [],
  itemStates: {},
  departmentOrder: [],
  ownerId: 'user-1',
  sharedWith: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-02'),
});

const stateWithLists = (...lists: ShoppingList[]): ListsState =>
  listsAdapter.setAll(lists, listsAdapter.getInitialState(initialListsState));

// ─────────────────────────────────────────────────────────────────────────────

describe('Lists Reducer – delete race condition (Bug 2)', () => {

  describe('deleteList action', () => {
    it('immediately removes the list from the store (optimistic)', () => {
      const list = makeList('list-1');
      const before = stateWithLists(list);

      const after = listsReducer(before, ListsActions.deleteList({ listId: 'list-1' }));

      const ids = after.ids as string[];
      expect(ids).not.toContain('list-1');
    });

    it('adds the listId to deletingListIds', () => {
      const list = makeList('list-1');
      const before = stateWithLists(list);

      const after = listsReducer(before, ListsActions.deleteList({ listId: 'list-1' }));

      expect(after.deletingListIds).toContain('list-1');
    });

    it('sets loading: true', () => {
      const before = stateWithLists(makeList('list-1'));
      const after = listsReducer(before, ListsActions.deleteList({ listId: 'list-1' }));

      expect(after.loading).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('loadListsSuccess after deleteList — the race-condition scenario', () => {
    it('does NOT re-add a list that is still being deleted', () => {
      const list = makeList('list-1');
      // Simulate: deleteList already fired and removed the list optimistically
      const afterDelete = listsReducer(
        stateWithLists(list),
        ListsActions.deleteList({ listId: 'list-1' })
      );

      // Simulate: stale BehaviorSubject emission from debounced mergeLists fires
      // with the list still present (Firebase delete not yet confirmed)
      const afterStaleLoad = listsReducer(
        afterDelete,
        ListsActions.loadListsSuccess({ lists: [list] })
      );

      const ids = afterStaleLoad.ids as string[];
      expect(ids).not.toContain('list-1');
    });

    it('still adds other (non-deleting) lists from loadListsSuccess', () => {
      const listToDelete = makeList('list-delete');
      const otherList    = makeList('list-keep', 'Other List');

      const afterDelete = listsReducer(
        stateWithLists(listToDelete, otherList),
        ListsActions.deleteList({ listId: 'list-delete' })
      );

      const afterLoad = listsReducer(
        afterDelete,
        ListsActions.loadListsSuccess({ lists: [listToDelete, otherList] })
      );

      const ids = afterLoad.ids as string[];
      expect(ids).not.toContain('list-delete');
      expect(ids).toContain('list-keep');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('deleteListSuccess', () => {
    it('keeps listId in deletingListIds (guard stays active until loadListsSuccess confirms)', () => {
      // deleteListSuccess intentionally does NOT clean deletingListIds.
      // The guard must survive until loadListsSuccess receives a Firebase payload
      // that no longer contains the deleted list, preventing a stale mergeLists()
      // debounce emission from re-adding the list via setAll.
      const list = makeList('list-1');
      const afterDelete = listsReducer(
        stateWithLists(list),
        ListsActions.deleteList({ listId: 'list-1' })
      );
      expect(afterDelete.deletingListIds).toContain('list-1');

      const afterSuccess = listsReducer(
        afterDelete,
        ListsActions.deleteListSuccess({ listId: 'list-1' })
      );
      // Guard must still be present
      expect(afterSuccess.deletingListIds).toContain('list-1');
    });

    it('sets loading: false', () => {
      const afterDelete = listsReducer(
        stateWithLists(makeList('list-1')),
        ListsActions.deleteList({ listId: 'list-1' })
      );
      const afterSuccess = listsReducer(
        afterDelete,
        ListsActions.deleteListSuccess({ listId: 'list-1' })
      );
      expect(afterSuccess.loading).toBe(false);
    });

    it('guard is removed once loadListsSuccess confirms Firebase no longer has the list', () => {
      const list = makeList('list-1');
      const afterDelete = listsReducer(stateWithLists(list), ListsActions.deleteList({ listId: 'list-1' }));
      const afterSuccess = listsReducer(afterDelete, ListsActions.deleteListSuccess({ listId: 'list-1' }));

      // Firebase now confirms the list is gone → loadListsSuccess without it
      const afterConfirmed = listsReducer(
        afterSuccess,
        ListsActions.loadListsSuccess({ lists: [] })
      );
      expect(afterConfirmed.deletingListIds).not.toContain('list-1');
    });

    it('stale loadListsSuccess (list still in Firebase) does not re-add the list', () => {
      const list = makeList('list-1');
      const afterDelete = listsReducer(stateWithLists(list), ListsActions.deleteList({ listId: 'list-1' }));
      const afterSuccess = listsReducer(afterDelete, ListsActions.deleteListSuccess({ listId: 'list-1' }));

      // Stale Firebase emission still includes the list
      const afterStale = listsReducer(
        afterSuccess,
        ListsActions.loadListsSuccess({ lists: [list] })
      );
      const ids = afterStale.ids as string[];
      expect(ids).not.toContain('list-1');
      // Guard still active because list is still present in Firebase payload
      expect(afterStale.deletingListIds).toContain('list-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('deleteListFailure', () => {
    it('removes the listId from deletingListIds so the next loadListsSuccess can restore it', () => {
      const list = makeList('list-1');
      const afterDelete = listsReducer(
        stateWithLists(list),
        ListsActions.deleteList({ listId: 'list-1' })
      );

      const afterFailure = listsReducer(
        afterDelete,
        ListsActions.deleteListFailure({ error: 'Network error', listId: 'list-1' })
      );
      expect(afterFailure.deletingListIds).not.toContain('list-1');

      // Confirm: after failure, the next stale loadListsSuccess CAN restore it
      const afterRestore = listsReducer(
        afterFailure,
        ListsActions.loadListsSuccess({ lists: [list] })
      );
      const ids = afterRestore.ids as string[];
      expect(ids).toContain('list-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('initialListsState', () => {
    it('starts with an empty deletingListIds array', () => {
      const state = listsReducer(undefined, { type: '@@INIT' } as any);
      expect(state.deletingListIds).toEqual([]);
    });
  });
});
