import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ListsState } from './lists.state';
import { listsAdapter } from './lists.reducer';

/**
 * Feature selector for lists state
 */
export const selectListsState = createFeatureSelector<ListsState>('lists');

/**
 * Entity adapter selectors
 * Provides standardized selectors for entity collection
 */
const {
  selectIds,
  selectEntities,
  selectAll,
  selectTotal,
} = listsAdapter.getSelectors(selectListsState);

// ========================================
// Entity Collection Selectors
// ========================================

/** Select all list IDs as an array */
export const selectAllListIds = selectIds;

/** Select lists as a dictionary (id -> list) */
export const selectListEntities = selectEntities;

/** Select all lists as an array */
export const selectAllLists = selectAll;

/** Select total number of lists */
export const selectListsTotal = selectTotal;

// ========================================
// Individual List Selectors
// ========================================

/** Select a specific list by ID */
export const selectListById = (listId: string) =>
  createSelector(selectListEntities, (entities) => entities[listId] || null);

/** Select the currently selected list ID */
export const selectSelectedListId = createSelector(
  selectListsState,
  (state) => state.selectedListId
);

/** Select the currently selected list */
export const selectSelectedList = createSelector(
  selectListEntities,
  selectSelectedListId,
  (entities, selectedId) => (selectedId ? entities[selectedId] || null : null)
);

// ========================================
// Loading & Error Selectors
// ========================================

/** Select loading state */
export const selectListsLoading = createSelector(
  selectListsState,
  (state) => state.loading
);

/** Select error message */
export const selectListsError = createSelector(
  selectListsState,
  (state) => state.error
);

/** Select last sync timestamp */
export const selectListsLastSync = createSelector(
  selectListsState,
  (state) => state.lastSync
);

// ========================================
// Computed Selectors
// ========================================

/** Select lists sorted by name */
export const selectListsSortedByName = createSelector(
  selectAllLists,
  (lists) => [...lists].sort((a, b) => a.name.localeCompare(b.name))
);

/** Select lists sorted by update time (most recent first) */
export const selectListsSortedByUpdate = createSelector(
  selectAllLists,
  (lists) =>
    [...lists].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
);

/** Select lists with item counts */
export const selectListsWithCounts = createSelector(
  selectAllLists,
  (lists) =>
    lists.map((list) => ({
      ...list,
      totalItems: list.articleIds.length,
      checkedItems: Object.values(list.itemStates).filter(
        (state) => state.isChecked
      ).length,
    }))
);

/** Select incomplete lists (has unchecked items) */
export const selectIncompleteLists = createSelector(
  selectListsWithCounts,
  (lists) => lists.filter((list) => list.checkedItems < list.totalItems)
);

/** Select completed lists (all items checked) */
export const selectCompletedLists = createSelector(
  selectListsWithCounts,
  (lists) =>
    lists.filter(
      (list) => list.totalItems > 0 && list.checkedItems === list.totalItems
    )
);

/** Select empty lists (no items) */
export const selectEmptyLists = createSelector(
  selectListsWithCounts,
  (lists) => lists.filter((list) => list.totalItems === 0)
);

/** Check if any lists are loading */
export const selectHasLoadingLists = createSelector(
  selectListsLoading,
  (loading) => loading
);

/** Check if lists have been loaded */
export const selectListsLoaded = createSelector(
  selectListsLastSync,
  (lastSync) => lastSync !== null
);

/** Select lists for a specific shop */
export const selectListsByShopId = (shopId: string) =>
  createSelector(selectAllLists, (lists) =>
    lists.filter((list) => list.shopId === shopId)
  );
