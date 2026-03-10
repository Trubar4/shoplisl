import { createReducer, on } from '@ngrx/store';
import { EntityAdapter, createEntityAdapter } from '@ngrx/entity';
import { ShoppingList } from '../../core/models';
import { ListsState, initialListsState } from './lists.state';
import * as ListsActions from './lists.actions';

/**
 * Entity adapter for shopping lists
 * Provides standardized methods for managing list collection
 */
export const listsAdapter: EntityAdapter<ShoppingList> = createEntityAdapter<ShoppingList>({
  selectId: (list: ShoppingList) => list.id,
  sortComparer: (a: ShoppingList, b: ShoppingList) =>
    b.updatedAt.getTime() - a.updatedAt.getTime(), // Most recently updated first
});

/**
 * Initial state using entity adapter
 */
const initialState: ListsState = listsAdapter.getInitialState(initialListsState);

/**
 * Lists reducer
 * Handles all list-related state changes
 */
export const listsReducer = createReducer(
  initialState,

  // ========================================
  // Load Lists
  // ========================================

  on(ListsActions.loadLists, (state): ListsState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ListsActions.loadListsSuccess, (state, { lists }): ListsState => {
    // Filter out any list whose deletion is still in-flight so that a stale
    // BehaviorSubject emission from the 1-second debounced mergeLists() cannot
    // re-add it to the store after deleteListSuccess already removed it.
    //
    // Also auto-clean deletingListIds: if a pending-delete id is no longer
    // present in the Firebase payload, the deletion has been confirmed by
    // Firestore and the guard is no longer needed.
    const incomingIds = new Set(lists.map(l => l.id));
    const stillPendingDelete = state.deletingListIds.filter(id => incomingIds.has(id));
    return listsAdapter.setAll(
      lists.filter(l => !state.deletingListIds.includes(l.id)),
      {
        ...state,
        loading: false,
        error: null,
        lastSync: new Date(),
        deletingListIds: stillPendingDelete,
      }
    );
  }),

  on(ListsActions.loadListsFailure, (state, { error }): ListsState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Load Single List
  // ========================================

  on(ListsActions.loadList, (state): ListsState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ListsActions.loadListSuccess, (state, { list }): ListsState =>
    listsAdapter.upsertOne(list, {
      ...state,
      loading: false,
      error: null,
    })
  ),

  on(ListsActions.loadListFailure, (state, { error }): ListsState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Create List
  // ========================================

  on(ListsActions.createList, (state): ListsState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ListsActions.createListSuccess, (state, { list }): ListsState =>
    listsAdapter.addOne(list, {
      ...state,
      loading: false,
      error: null,
      selectedListId: list.id, // Auto-select newly created list
    })
  ),

  on(ListsActions.createListFailure, (state, { error }): ListsState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Update List
  // ========================================

  on(ListsActions.updateList, (state): ListsState => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ListsActions.updateListSuccess, (state, { list }): ListsState =>
    listsAdapter.upsertOne(list, {
      ...state,
      loading: false,
      error: null,
    })
  ),

  on(ListsActions.updateListFailure, (state, { error }): ListsState => ({
    ...state,
    loading: false,
    error,
  })),

  // ========================================
  // Delete List
  // ========================================

  on(ListsActions.deleteList, (state, { listId }): ListsState =>
    // Optimistically remove the list immediately and track its ID so that
    // subsequent loadListsSuccess (setAll) emissions from the debounced
    // mergeLists() cannot bring it back before Firebase confirms the delete.
    listsAdapter.removeOne(listId, {
      ...state,
      loading: true,
      error: null,
      selectedListId: state.selectedListId === listId ? null : state.selectedListId,
      deletingListIds: [...state.deletingListIds, listId],
    })
  ),

  on(ListsActions.deleteListSuccess, (state, { listId }): ListsState => ({
    // List already removed optimistically in deleteList.
    // Do NOT remove listId from deletingListIds here — keep the guard active
    // until the next loadListsSuccess confirms that Firebase no longer emits
    // this list.  Without this guard a stale mergeLists() debounce emission
    // arriving after navigation would re-add the list via setAll.
    ...state,
    loading: false,
    error: null,
  })),

  on(ListsActions.deleteListFailure, (state, { error, listId }): ListsState => ({
    // Delete failed — remove from guard so the next loadListsSuccess can
    // restore the list (the BehaviorSubject still has it on the Firebase side).
    ...state,
    loading: false,
    error,
    deletingListIds: state.deletingListIds.filter(id => id !== listId),
  })),

  // ========================================
  // Article Operations - Success Only
  // These operations are optimistic updates
  // ========================================

  on(
    ListsActions.addArticleToListSuccess,
    ListsActions.removeArticleFromListSuccess,
    ListsActions.toggleArticleCheckedSuccess,
    ListsActions.updateArticleAmountSuccess,
    ListsActions.updateDepartmentOrderSuccess,
    (state, { list }): ListsState =>
      listsAdapter.upsertOne(list, {
        ...state,
        loading: false,
        error: null,
      })
  ),

  on(
    ListsActions.addArticleToListFailure,
    ListsActions.removeArticleFromListFailure,
    ListsActions.toggleArticleCheckedFailure,
    ListsActions.updateArticleAmountFailure,
    ListsActions.updateDepartmentOrderFailure,
    (state, { error }): ListsState => ({
      ...state,
      loading: false,
      error,
    })
  ),

  // ========================================
  // UI State
  // ========================================

  on(ListsActions.selectList, (state, { listId }): ListsState => ({
    ...state,
    selectedListId: listId,
  })),

  on(ListsActions.clearError, (state): ListsState => ({
    ...state,
    error: null,
  }))
);

// Export state type
export type { ListsState };
