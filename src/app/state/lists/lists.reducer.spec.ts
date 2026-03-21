import { listsReducer, listsAdapter } from './lists.reducer';
import { ListsState } from './lists.state';
import * as ListsActions from './lists.actions';
import { ShoppingList } from '../../core/models';

describe('Lists Reducer', () => {
  const mockList1: ShoppingList = {
    id: 'list1',
    name: 'Groceries',
    articleIds: ['article1', 'article2'],
    itemStates: {
      article1: { articleId: 'article1', isChecked: false },
      article2: { articleId: 'article2', isChecked: true },
    },
    departmentOrder: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  };

  const mockList2: ShoppingList = {
    id: 'list2',
    name: 'Hardware',
    articleIds: ['article3'],
    itemStates: {
      article3: { articleId: 'article3', isChecked: false },
    },
    departmentOrder: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const initialState: ListsState = listsAdapter.getInitialState({
    selectedListId: null,
    loading: false,
    error: null,
    lastSync: null,
    deletingListIds: [],
  });

  describe('Initial State', () => {
    it('should return the initial state', () => {
      const action = { type: 'UNKNOWN' };
      const state = listsReducer(undefined, action as any);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.selectedListId).toBe(null);
      expect(state.lastSync).toBe(null);
    });
  });

  describe('Load Lists Actions', () => {
    it('should set loading to true on loadLists', () => {
      const action = ListsActions.loadLists();
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should load lists successfully', () => {
      const lists = [mockList1, mockList2];
      const action = ListsActions.loadListsSuccess({ lists });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.ids.length).toBe(2);
      expect(state.entities['list1']).toEqual(mockList1);
      expect(state.entities['list2']).toEqual(mockList2);
      expect(state.lastSync).toBeTruthy();
    });

    it('should handle loadLists failure', () => {
      const error = 'Failed to load lists';
      const action = ListsActions.loadListsFailure({ error });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Load Single List Actions', () => {
    it('should set loading to true on loadList', () => {
      const action = ListsActions.loadList({ listId: 'list1' });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should load single list successfully', () => {
      const action = ListsActions.loadListSuccess({ list: mockList1 });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['list1']).toEqual(mockList1);
    });

    it('should handle loadList failure', () => {
      const error = 'List not found';
      const action = ListsActions.loadListFailure({ error });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Create List Actions', () => {
    it('should set loading to true on createList', () => {
      const action = ListsActions.createList({ name: 'New List' });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should create list successfully and auto-select it', () => {
      const action = ListsActions.createListSuccess({ list: mockList1 });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['list1']).toEqual(mockList1);
      expect(state.selectedListId).toBe('list1');
    });

    it('should handle createList failure', () => {
      const error = 'Failed to create list';
      const action = ListsActions.createListFailure({ error });
      const state = listsReducer(initialState, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Update List Actions', () => {
    let stateWithList: ListsState;

    beforeEach(() => {
      stateWithList = listsAdapter.addOne(mockList1, initialState);
    });

    it('should set loading to true on updateList', () => {
      const action = ListsActions.updateList({
        listId: 'list1',
        changes: { name: 'Updated Name' },
      });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should update list successfully', () => {
      const updatedList = { ...mockList1, name: 'Updated Groceries' };
      const action = ListsActions.updateListSuccess({ list: updatedList });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['list1']?.name).toBe('Updated Groceries');
    });

    it('should handle updateList failure', () => {
      const error = 'Failed to update list';
      const action = ListsActions.updateListFailure({ error });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Delete List Actions', () => {
    let stateWithList: ListsState;

    beforeEach(() => {
      stateWithList = listsAdapter.addOne(mockList1, {
        ...initialState,
        selectedListId: 'list1',
      });
    });

    it('should set loading to true on deleteList', () => {
      const action = ListsActions.deleteList({ listId: 'list1' });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBe(null);
    });

    it('should delete list successfully', () => {
      // deleteList removes the list optimistically, deleteListSuccess only clears loading
      const stateAfterDelete = listsReducer(stateWithList, ListsActions.deleteList({ listId: 'list1' }));
      const action = ListsActions.deleteListSuccess({ listId: 'list1' });
      const state = listsReducer(stateAfterDelete, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['list1']).toBeUndefined();
      expect(state.selectedListId).toBe(null); // Should clear selection
    });

    it('should preserve selectedListId if deleting a different list', () => {
      const stateWithTwoLists = listsAdapter.addOne(mockList2, stateWithList);
      const action = ListsActions.deleteListSuccess({ listId: 'list2' });
      const state = listsReducer(stateWithTwoLists, action);

      expect(state.selectedListId).toBe('list1'); // Should keep list1 selected
    });

    it('should handle deleteList failure', () => {
      const error = 'Failed to delete list';
      const action = ListsActions.deleteListFailure({ error, listId: 'list1' });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(error);
    });
  });

  describe('Article Operations', () => {
    let stateWithList: ListsState;

    beforeEach(() => {
      stateWithList = listsAdapter.addOne(mockList1, initialState);
    });

    it('should handle addArticleToListSuccess', () => {
      const updatedList = {
        ...mockList1,
        articleIds: [...mockList1.articleIds, 'article3'],
      };
      const action = ListsActions.addArticleToListSuccess({ list: updatedList });
      const state = listsReducer(stateWithList, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.entities['list1']?.articleIds.length).toBe(3);
    });

    it('should handle removeArticleFromListSuccess', () => {
      const updatedList = {
        ...mockList1,
        articleIds: ['article1'],
      };
      const action = ListsActions.removeArticleFromListSuccess({
        list: updatedList,
      });
      const state = listsReducer(stateWithList, action);

      expect(state.entities['list1']?.articleIds.length).toBe(1);
    });

    it('should handle toggleArticleCheckedSuccess', () => {
      const updatedList = {
        ...mockList1,
        itemStates: {
          ...mockList1.itemStates,
          article1: { articleId: 'article1', isChecked: true },
        },
      };
      const action = ListsActions.toggleArticleCheckedSuccess({
        list: updatedList,
      });
      const state = listsReducer(stateWithList, action);

      expect(state.entities['list1']?.itemStates['article1'].isChecked).toBe(
        true
      );
    });

    it('should handle updateArticleAmountSuccess', () => {
      const updatedList = {
        ...mockList1,
        itemStates: {
          ...mockList1.itemStates,
          article1: { articleId: 'article1', isChecked: false, amount: '2x' },
        },
      };
      const action = ListsActions.updateArticleAmountSuccess({
        list: updatedList,
      });
      const state = listsReducer(stateWithList, action);

      expect(state.entities['list1']?.itemStates['article1'].amount).toBe('2x');
    });

    it('should handle updateDepartmentOrderSuccess', () => {
      const updatedList = {
        ...mockList1,
        departmentOrder: ['bread', 'dairy'],
      };
      const action = ListsActions.updateDepartmentOrderSuccess({
        list: updatedList,
      });
      const state = listsReducer(stateWithList, action);

      expect(state.entities['list1']?.departmentOrder?.length).toBe(2);
    });

    it('should handle article operation failures', () => {
      const error = 'Operation failed';
      const actions = [
        ListsActions.addArticleToListFailure({ error }),
        ListsActions.removeArticleFromListFailure({ error }),
        ListsActions.toggleArticleCheckedFailure({ error }),
        ListsActions.updateArticleAmountFailure({ error }),
        ListsActions.updateDepartmentOrderFailure({ error }),
      ];

      actions.forEach((action) => {
        const state = listsReducer(stateWithList, action);
        expect(state.error).toBe(error);
        expect(state.loading).toBe(false);
      });
    });
  });

  describe('UI State Actions', () => {
    it('should select a list', () => {
      const action = ListsActions.selectList({ listId: 'list1' });
      const state = listsReducer(initialState, action);

      expect(state.selectedListId).toBe('list1');
    });

    it('should clear list selection', () => {
      const stateWithSelection = { ...initialState, selectedListId: 'list1' };
      const action = ListsActions.selectList({ listId: null });
      const state = listsReducer(stateWithSelection as ListsState, action);

      expect(state.selectedListId).toBe(null);
    });

    it('should clear error', () => {
      const stateWithError = { ...initialState, error: 'Some error' };
      const action = ListsActions.clearError();
      const state = listsReducer(stateWithError as ListsState, action);

      expect(state.error).toBe(null);
    });
  });
});
