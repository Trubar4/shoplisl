import { ShoppingList } from '../../core/models';
import { ListsState } from './lists.state';
import { listsAdapter } from './lists.reducer';
import * as ListsSelectors from './lists.selectors';

describe('Lists Selectors', () => {
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
    articleIds: ['article3', 'article4', 'article5'],
    itemStates: {
      article3: { articleId: 'article3', isChecked: true },
      article4: { articleId: 'article4', isChecked: true },
      article5: { articleId: 'article5', isChecked: true },
    },
    departmentOrder: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockList3: ShoppingList = {
    id: 'list3',
    name: 'Empty List',
    articleIds: [],
    itemStates: {},
    departmentOrder: [],
    createdAt: new Date('2025-01-03'),
    updatedAt: new Date('2025-01-03'),
  };

  const listsState: ListsState = listsAdapter.addMany(
    [mockList1, mockList2, mockList3],
    listsAdapter.getInitialState({
      selectedListId: 'list1',
      loading: false,
      error: null,
      lastSync: new Date('2025-01-01T12:00:00Z'),
    })
  );

  const appState = {
    lists: listsState,
    articles: {} as any,
    auth: {} as any,
  };

  describe('Entity Collection Selectors', () => {
    it('should select all list IDs', () => {
      const result = ListsSelectors.selectAllListIds(appState);
      // Entity adapter sorts by updatedAt descending (most recent first)
      expect(result).toEqual(['list3', 'list1', 'list2']);
    });

    it('should select list entities as a dictionary', () => {
      const result = ListsSelectors.selectListEntities(appState);
      expect(result['list1']).toEqual(mockList1);
      expect(result['list2']).toEqual(mockList2);
      expect(result['list3']).toEqual(mockList3);
    });

    it('should select all lists as an array', () => {
      const result = ListsSelectors.selectAllLists(appState);
      // Entity adapter sorts by updatedAt descending (most recent first)
      expect(result).toEqual([mockList3, mockList1, mockList2]);
    });

    it('should select total number of lists', () => {
      const result = ListsSelectors.selectListsTotal(appState);
      expect(result).toBe(3);
    });
  });

  describe('Individual List Selectors', () => {
    it('should select a specific list by ID', () => {
      const selector = ListsSelectors.selectListById('list1');
      const result = selector(appState);
      expect(result).toEqual(mockList1);
    });

    it('should return null for non-existent list ID', () => {
      const selector = ListsSelectors.selectListById('non-existent');
      const result = selector(appState);
      expect(result).toBe(null);
    });

    it('should select the currently selected list ID', () => {
      const result = ListsSelectors.selectSelectedListId(appState);
      expect(result).toBe('list1');
    });

    it('should select the currently selected list', () => {
      const result = ListsSelectors.selectSelectedList(appState);
      expect(result).toEqual(mockList1);
    });

    it('should return null when no list is selected', () => {
      const stateNoSelection = {
        ...appState,
        lists: { ...listsState, selectedListId: null },
      };
      const result = ListsSelectors.selectSelectedList(stateNoSelection);
      expect(result).toBe(null);
    });
  });

  describe('Loading & Error Selectors', () => {
    it('should select loading state', () => {
      const result = ListsSelectors.selectListsLoading(appState);
      expect(result).toBe(false);
    });

    it('should select error message', () => {
      const result = ListsSelectors.selectListsError(appState);
      expect(result).toBe(null);
    });

    it('should select error when present', () => {
      const stateWithError = {
        ...appState,
        lists: { ...listsState, error: 'Test error' },
      };
      const result = ListsSelectors.selectListsError(stateWithError);
      expect(result).toBe('Test error');
    });

    it('should select last sync timestamp', () => {
      const result = ListsSelectors.selectListsLastSync(appState);
      expect(result).toEqual(new Date('2025-01-01T12:00:00Z'));
    });

    it('should check if lists are loading', () => {
      const result = ListsSelectors.selectHasLoadingLists(appState);
      expect(result).toBe(false);

      const loadingState = {
        ...appState,
        lists: { ...listsState, loading: true },
      };
      const loadingResult = ListsSelectors.selectHasLoadingLists(loadingState);
      expect(loadingResult).toBe(true);
    });

    it('should check if lists have been loaded', () => {
      const result = ListsSelectors.selectListsLoaded(appState);
      expect(result).toBe(true);

      const notLoadedState = {
        ...appState,
        lists: { ...listsState, lastSync: null },
      };
      const notLoadedResult =
        ListsSelectors.selectListsLoaded(notLoadedState);
      expect(notLoadedResult).toBe(false);
    });
  });

  describe('Computed Selectors', () => {
    it('should select lists sorted by name', () => {
      const result = ListsSelectors.selectListsSortedByName(appState);
      expect(result[0].name).toBe('Empty List');
      expect(result[1].name).toBe('Groceries');
      expect(result[2].name).toBe('Hardware');
    });

    it('should select lists sorted by update time (most recent first)', () => {
      const result = ListsSelectors.selectListsSortedByUpdate(appState);
      expect(result[0].id).toBe('list3'); // Most recently updated
      expect(result[1].id).toBe('list1');
      expect(result[2].id).toBe('list2');
    });

    it('should select lists with item counts', () => {
      const result = ListsSelectors.selectListsWithCounts(appState);

      // Sorted by updatedAt descending (most recent first)
      expect(result[0]).toMatchObject({
        id: 'list3',
        totalItems: 0,
        checkedItems: 0,
      });

      expect(result[1]).toMatchObject({
        id: 'list1',
        totalItems: 2,
        checkedItems: 1,
      });

      expect(result[2]).toMatchObject({
        id: 'list2',
        totalItems: 3,
        checkedItems: 3,
      });
    });

    it('should select incomplete lists', () => {
      const result = ListsSelectors.selectIncompleteLists(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('list1'); // Has unchecked items
    });

    it('should select completed lists', () => {
      const result = ListsSelectors.selectCompletedLists(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('list2'); // All items checked
    });

    it('should select empty lists', () => {
      const result = ListsSelectors.selectEmptyLists(appState);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('list3'); // No items
    });

    it('should select lists by shop ID', () => {
      const listWithShop: ShoppingList = {
        ...mockList1,
        id: 'list-shop1',
        shopId: 'shop1',
      };

      const stateWithShopList = {
        ...appState,
        lists: listsAdapter.addOne(listWithShop, listsState),
      };

      const selector = ListsSelectors.selectListsByShopId('shop1');
      const result = selector(stateWithShopList);

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('list-shop1');
    });

    it('should return empty array when no lists for shop ID', () => {
      const selector = ListsSelectors.selectListsByShopId('non-existent-shop');
      const result = selector(appState);
      expect(result).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state', () => {
      const emptyState = listsAdapter.getInitialState({
        selectedListId: null,
        loading: false,
        error: null,
        lastSync: null,
      });

      const emptyAppState = {
        lists: emptyState,
        articles: {} as any,
        auth: {} as any,
      };

      const allLists = ListsSelectors.selectAllLists(emptyAppState);
      expect(allLists).toEqual([]);

      const total = ListsSelectors.selectListsTotal(emptyAppState);
      expect(total).toBe(0);

      const selectedList = ListsSelectors.selectSelectedList(emptyAppState);
      expect(selectedList).toBe(null);
    });
  });
});
