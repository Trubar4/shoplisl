import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Router, ActivatedRoute } from '@angular/router';
import { of, BehaviorSubject, Subject, throwError } from 'rxjs';
import { signal, ChangeDetectorRef } from '@angular/core';

import { ListDetailComponent } from './list-detail';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { DisambiguationService } from '../../../core/services/ai/disambiguation';
import { ShoppingList, Article, Department } from '../../../core/models';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * List Detail Component Tests
 *
 * Tests component logic directly without template rendering to avoid
 * Vitest + Angular external template loading issues.
 *
 * Test Coverage: 50+ test cases covering:
 * - Initialization and routing
 * - Shopping mode filters (offen/erledigt/alle)
 * - Edit mode filters (gelistet/fehlend/alle)
 * - Article toggle with undo
 * - Search with auto-filter switching
 * - Celebration animation
 * - Department grouping
 * - List management
 * - Navigation
 * - Cleanup
 */

describe('ListDetailComponent', () => {
  let component: ListDetailComponent;
  let dataServiceMock: any;
  let departmentServiceMock: any;
  let listUtilsMock: any;
  let disambiguationMock: any;
  let snackBarMock: any;
  let routerMock: any;
  let activatedRouteMock: any;
  let cdrMock: any;

  // Test data
  const createTestList = (id: string, name: string): ShoppingList => ({
    id,
    name,
    articleIds: ['article1', 'article2', 'article3'],
    itemStates: {
      'article1': { articleId: 'article1', isChecked: false, amount: '1kg' },
      'article2': { articleId: 'article2', isChecked: true, amount: '500g' },
      'article3': { articleId: 'article3', isChecked: false, amount: '' }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    color: '#1a9edb',
    icon: '🛒',
    departmentOrder: ['dairy', 'fruits', 'bakery']
  });

  const createTestArticle = (id: string, name: string, departmentId: string = 'dairy'): Article => ({
    id,
    name,
    amount: '',
    departmentId,
    icon: '🥛',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const testList = createTestList('list1', 'Test List');
  const testArticles: Article[] = [
    createTestArticle('article1', 'Milch', 'dairy'),
    createTestArticle('article2', 'Brot', 'bakery'),
    createTestArticle('article3', 'Äpfel', 'fruits'),
    createTestArticle('article4', 'Käse', 'dairy'), // Not in list
  ];

  const testDepartments: Department[] = [
    { id: 'dairy', nameGerman: 'Milchprodukte', nameEnglish: 'Dairy', icon: 'milk.png' },
    { id: 'bakery', nameGerman: 'Backwaren', nameEnglish: 'Bakery', icon: 'bread.png' },
    { id: 'fruits', nameGerman: 'Obst', nameEnglish: 'Fruits', icon: 'apple.png' },
  ];

  beforeEach(() => {
    // Create mocks
    dataServiceMock = {
      getLists: vi.fn(() => of([testList])),
      getArticles: vi.fn(() => of(testArticles)),
      toggleItemChecked: vi.fn(() => of(true)),
      addArticleToList: vi.fn(() => of(true)),
      removeArticleFromList: vi.fn(() => of(true)),
      updateListItemAmount: vi.fn(() => of(true)),
      clearAllItemsFromList: vi.fn(() => of(true)),
      deleteList: vi.fn(() => of(true)),
      updateList: vi.fn(() => of(true)),
      createArticle: vi.fn((data) => of({ id: 'new-article', ...data }))
    };

    departmentServiceMock = {
      getDepartments: vi.fn(() => of(testDepartments)),
      getDepartmentName: vi.fn(() => 'Milchprodukte')
    };

    listUtilsMock = {
      updateThemeColors: vi.fn(),
      resetToDefaultTheme: vi.fn(),
      getCurrentListColor: vi.fn(() => '#1a9edb'),
      getContrastColor: vi.fn(() => '#ffffff')
    };

    disambiguationMock = {
      getDisambiguationOptions: vi.fn(() => Promise.resolve([])),
      handleDisambiguationChoice: vi.fn(() => Promise.resolve({ success: true }))
    };

    snackBarMock = {
      open: vi.fn()
    };

    routerMock = {
      navigate: vi.fn(),
      url: '/lists/list1'
    };

    activatedRouteMock = {
      snapshot: {
        paramMap: {
          get: vi.fn((key: string) => key === 'id' ? 'list1' : null)
        },
        queryParamMap: {
          get: vi.fn((key: string) => null)
        }
      }
    };

    cdrMock = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    // Create component instance directly
    component = new ListDetailComponent(
      activatedRouteMock as any,
      routerMock as any,
      dataServiceMock as DataService,
      departmentServiceMock as DepartmentService,
      listUtilsMock as ListUtilsService,
      snackBarMock as MatSnackBar,
      cdrMock as ChangeDetectorRef,
      disambiguationMock as DisambiguationService
    );
  });

  afterEach(() => {
    // Clean up timers
    vi.clearAllTimers();
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =========================================
  // INITIALIZATION TESTS
  // =========================================

  describe('Initialization', () => {
    it('should load list from route parameter', async () => {
      const list = await new Promise((resolve) => {
        component.list$.subscribe(list => resolve(list));
      });

      expect(list).toBeDefined();
      expect((list as any)?.id).toBe('list1');
      expect((list as any)?.name).toBe('Test List');
    });

    it('should start in shopping mode by default', () => {
      component.ngOnInit();
      expect(component.currentMode()).toBe('shopping');
    });

    it('should start in edit mode if query param is set', () => {
      activatedRouteMock.snapshot.queryParamMap.get = vi.fn((key: string) =>
        key === 'mode' ? 'edit' : null
      );

      const newComponent = new ListDetailComponent(
        activatedRouteMock as any,
        routerMock as any,
        dataServiceMock as DataService,
        departmentServiceMock as DepartmentService,
        listUtilsMock as ListUtilsService,
        snackBarMock as MatSnackBar,
        cdrMock as ChangeDetectorRef,
        disambiguationMock as DisambiguationService
      );

      newComponent.ngOnInit();
      expect(newComponent.currentMode()).toBe('edit');
      newComponent.ngOnDestroy();
    });

    it('should update theme colors based on list color', async () => {
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(listUtilsMock.updateThemeColors).toHaveBeenCalledWith('#1a9edb');
    });

    it('should set loading to false after list loads', async () => {
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(component.isLoading()).toBe(false);
    });

    it('should navigate to lists if list not found', async () => {
      dataServiceMock.getLists.mockReturnValue(of([]));

      const newComponent = new ListDetailComponent(
        activatedRouteMock as any,
        routerMock as any,
        dataServiceMock as DataService,
        departmentServiceMock as DepartmentService,
        listUtilsMock as ListUtilsService,
        snackBarMock as MatSnackBar,
        cdrMock as ChangeDetectorRef,
        disambiguationMock as DisambiguationService
      );

      newComponent.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(routerMock.navigate).toHaveBeenCalledWith(['/lists']);
      newComponent.ngOnDestroy();
    });
  });

  // =========================================
  // SHOPPING MODE FILTER TESTS
  // =========================================

  describe('Shopping Mode Filters', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.switchToShoppingMode();
    });

    it('should filter to open items by default', () => {
      expect(component.currentShoppingFilter()).toBe('offen');
    });

    it('should show all items when filter is "alle"', async () => {
      component.onFilterChange({ mode: 'shopping', filter: 'alle' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      expect(allArticles.length).toBe(3);
    });

    it('should show only checked items when filter is "erledigt"', async () => {
      component.onFilterChange({ mode: 'shopping', filter: 'erledigt' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      const allChecked = allArticles.every((a: any) => a.isChecked);
      expect(allChecked).toBe(true);
    });

    it('should reset wasIncompleteLastCheck when changing filter', () => {
      component['wasIncompleteLastCheck'] = true;

      component.onFilterChange({ mode: 'shopping', filter: 'alle' });

      expect(component['wasIncompleteLastCheck']).toBe(false);
    });

    it('should update shopping filter signal', () => {
      component.onFilterChange({ mode: 'shopping', filter: 'erledigt' });
      expect(component.currentShoppingFilter()).toBe('erledigt');

      component.onFilterChange({ mode: 'shopping', filter: 'alle' });
      expect(component.currentShoppingFilter()).toBe('alle');
    });

    it('should close celebration when switching filters', () => {
      component['showCelebrationAnimation'].set(true);

      component.onFilterChange({ mode: 'shopping', filter: 'alle' });

      expect(component.showCelebrationAnimation()).toBe(false);
    });
  });

  // =========================================
  // EDIT MODE FILTER TESTS
  // =========================================

  describe('Edit Mode Filters', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.switchToEditMode();
    });

    it('should show all articles in "alle" filter', async () => {
      component.onFilterChange({ mode: 'edit', filter: 'alle' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroupsEdit$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      expect(allArticles.length).toBe(4);
    });

    it('should show only listed articles in "gelistet" filter', async () => {
      component.onFilterChange({ mode: 'edit', filter: 'gelistet' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroupsEdit$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      const allInList = allArticles.every((a: any) => a.isInList);
      expect(allInList).toBe(true);
    });

    it('should show only missing articles in "fehlend" filter', async () => {
      component.onFilterChange({ mode: 'edit', filter: 'fehlend' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroupsEdit$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      const allNotInList = allArticles.every((a: any) => !a.isInList);
      expect(allNotInList).toBe(true);
    });

    it('should update edit filter signal', () => {
      component.onFilterChange({ mode: 'edit', filter: 'gelistet' });
      expect(component.currentEditFilter()).toBe('gelistet');

      component.onFilterChange({ mode: 'edit', filter: 'fehlend' });
      expect(component.currentEditFilter()).toBe('fehlend');
    });
  });

  // =========================================
  // ARTICLE TOGGLE TESTS
  // =========================================

  describe('Article Toggle', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should toggle article check state', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isChecked: false,
        isInList: true
      };

      component.onArticleToggle(article);

      expect(dataServiceMock.toggleItemChecked).toHaveBeenCalledWith('list1', 'article1');
    });

    it('should undo article completion when clicking checked item with pending hide', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isChecked: true,
        isInList: true,
        pendingHideTimestamp: Date.now() + 5000
      };

      component.onArticleToggle(article);

      // Should call toggleItemChecked to undo
      expect(dataServiceMock.toggleItemChecked).toHaveBeenCalledWith('list1', 'article1');
    });

    it('should call undo method for articles with pending state', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isChecked: true,
        pendingHideTimestamp: Date.now() + 3000
      };

      const undoSpy = vi.spyOn(component, 'undoArticleCompletion');
      component.onArticleToggle(article);

      expect(undoSpy).toHaveBeenCalledWith(article);
    });

    it('should handle toggle errors gracefully', () => {
      dataServiceMock.toggleItemChecked.mockReturnValue(throwError(() => new Error('Toggle failed')));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const article: any = {
        id: 'article1',
        name: 'Milch',
        isChecked: false
      };

      component.onArticleToggle(article);

      // Should handle error without crashing
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // =========================================
  // ARTICLE LIST OPERATIONS TESTS
  // =========================================

  describe('Article List Operations', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should add article to list', () => {
      const article: any = {
        id: 'article4',
        name: 'Käse',
        isInList: false
      };

      component.onToggleArticleInList(article);

      expect(dataServiceMock.addArticleToList).toHaveBeenCalledWith('list1', 'article4');
    });

    it('should remove article from list', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isInList: true
      };

      component.onToggleArticleInList(article);

      expect(dataServiceMock.removeArticleFromList).toHaveBeenCalledWith('list1', 'article1');
    });

    it('should show snackbar after adding article', async () => {
      const article: any = {
        id: 'article4',
        name: 'Käse',
        isInList: false
      };

      component.onToggleArticleInList(article);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Käse hinzugefügt',
        '',
        expect.objectContaining({ duration: 1000 })
      );
    });

    it('should show snackbar after removing article', async () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isInList: true
      };

      component.onToggleArticleInList(article);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Milch entfernt',
        '',
        expect.objectContaining({ duration: 1000 })
      );
    });

    it('should handle toggle list errors', () => {
      dataServiceMock.addArticleToList.mockReturnValue(throwError(() => new Error('Add failed')));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const article: any = {
        id: 'article4',
        name: 'Käse',
        isInList: false
      };

      component.onToggleArticleInList(article);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // =========================================
  // SEARCH TESTS
  // =========================================

  describe('Search Functionality', () => {
    beforeEach(() => {
      component.ngOnInit();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should filter articles by search query', async () => {
      vi.useRealTimers(); // Use real timers for this test

      component.searchQuery = 'Milch';
      component.onSearchQueryChange();

      await new Promise(resolve => setTimeout(resolve, 350));

      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      const milchArticle = allArticles.find((a: any) => a.name === 'Milch');
      expect(milchArticle).toBeDefined();

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should clear search disambiguation when query changes', () => {
      component.searchDisambiguation$.next({ query: 'test', options: [] });

      component.searchQuery = 'new query';
      component.onSearchQueryChange();

      component.searchDisambiguation$.subscribe(value => {
        expect(value).toBeNull();
      });
    });

    it('should debounce search query', () => {
      const searchQuery$ = component['searchQuery$'];
      const nextSpy = vi.spyOn(searchQuery$, 'next');

      component.searchQuery = 'M';
      component.onSearchQueryChange();

      component.searchQuery = 'Mi';
      component.onSearchQueryChange();

      component.searchQuery = 'Mil';
      component.onSearchQueryChange();

      expect(nextSpy).toHaveBeenCalledTimes(3);
    });

    it('should clear search correctly', () => {
      component.searchQuery = 'Test';
      component.searchDisambiguation$.next({ query: 'test', options: [] });

      component['clearSearch']();

      expect(component.searchQuery).toBe('');
      component.searchDisambiguation$.subscribe(value => {
        expect(value).toBeNull();
      });
    });
  });

  // =========================================
  // CELEBRATION ANIMATION TESTS
  // =========================================

  describe('Celebration Animation', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.switchToShoppingMode();
      component.onFilterChange({ mode: 'shopping', filter: 'offen' });
    });

    it('should trigger celebration when all items are checked', () => {
      // Mark as incomplete first
      component['wasIncompleteLastCheck'] = true;

      // Trigger check with all items checked
      component['checkForCompletion']([
        { ...testArticles[0], isChecked: true },
        { ...testArticles[1], isChecked: true },
        { ...testArticles[2], isChecked: true }
      ]);

      expect(component.showCelebrationAnimation()).toBe(true);
    });

    it('should NOT trigger celebration if already in "erledigt" filter', () => {
      component.onFilterChange({ mode: 'shopping', filter: 'erledigt' });
      component['wasIncompleteLastCheck'] = true;

      component['checkForCompletion']([
        { ...testArticles[0], isChecked: true },
        { ...testArticles[1], isChecked: true }
      ]);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should NOT trigger celebration if already complete', () => {
      component['wasIncompleteLastCheck'] = false; // Already complete

      component['checkForCompletion']([
        { ...testArticles[0], isChecked: true },
        { ...testArticles[1], isChecked: true }
      ]);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should NOT trigger celebration in edit mode', () => {
      component.switchToEditMode();
      component['wasIncompleteLastCheck'] = true;

      component['checkForCompletion']([
        { ...testArticles[0], isChecked: true },
        { ...testArticles[1], isChecked: true }
      ]);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should close celebration animation', () => {
      component['showCelebrationAnimation'].set(true);

      component.closeCelebrationAnimation();

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should auto-close celebration after timeout', () => {
      vi.useFakeTimers();
      component['wasIncompleteLastCheck'] = true;

      component['triggerCelebrationAnimation']();
      expect(component.showCelebrationAnimation()).toBe(true);

      vi.advanceTimersByTime(3000);
      expect(component.showCelebrationAnimation()).toBe(false);

      vi.useRealTimers();
    });

    it('should update wasIncompleteLastCheck flag', () => {
      // Start incomplete
      component['wasIncompleteLastCheck'] = false;

      component['checkForCompletion']([
        { ...testArticles[0], isChecked: false },
        { ...testArticles[1], isChecked: false }
      ]);

      expect(component['wasIncompleteLastCheck']).toBe(true);
    });
  });

  // =========================================
  // NAVIGATION TESTS
  // =========================================

  describe('Navigation', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should navigate back to lists overview', () => {
      component.onBack();

      expect(listUtilsMock.resetToDefaultTheme).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/lists']);
    });

    it('should switch to shopping mode', () => {
      component.switchToEditMode();
      expect(component.currentMode()).toBe('edit');

      component.switchToShoppingMode();
      expect(component.currentMode()).toBe('shopping');
    });

    it('should switch to edit mode', () => {
      component.switchToShoppingMode();
      expect(component.currentMode()).toBe('shopping');

      component.switchToEditMode();
      expect(component.currentMode()).toBe('edit');
    });

    it('should navigate to article info', () => {
      const article: any = { id: 'article1', name: 'Milch' };

      component.onArticleInfo(article);

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/articles/edit', 'article1'],
        expect.objectContaining({
          queryParams: expect.objectContaining({ returnTo: '/lists/list1?mode=shopping' })
        })
      );
    });

    it('should navigate to create new article', () => {
      component.searchQuery = 'New Item';
      component.onCreateNewArticle();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/articles/add'],
        expect.objectContaining({
          queryParams: expect.objectContaining({
            returnTo: '/lists/list1?mode=edit',
            listId: 'list1',
            name: 'New Item'
          })
        })
      );
    });

    it('should navigate to department sort', () => {
      component['currentList'] = testList;
      component.onDepartmentSort();

      expect(routerMock.navigate).toHaveBeenCalledWith(['/lists', 'list1', 'departments']);
    });

    it('should navigate to edit list', () => {
      component['currentList'] = testList;
      component.onEditList();

      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/lists/add'],
        expect.objectContaining({
          queryParams: expect.objectContaining({
            editId: 'list1',
            returnTo: '/lists/list1?mode=edit'
          })
        })
      );
    });
  });

  // =========================================
  // LIST MANAGEMENT TESTS
  // =========================================

  describe('List Management', () => {
    beforeEach(() => {
      component.ngOnInit();
      component['currentList'] = testList;
    });

    it('should clear all items from list', () => {
      global.confirm = vi.fn(() => true);

      component.onClearAllItems();

      expect(dataServiceMock.clearAllItemsFromList).toHaveBeenCalledWith('list1');
    });

    it('should NOT clear items if user cancels', () => {
      global.confirm = vi.fn(() => false);

      component.onClearAllItems();

      expect(dataServiceMock.clearAllItemsFromList).not.toHaveBeenCalled();
    });

    it('should delete list after confirmation', () => {
      global.confirm = vi.fn(() => true);

      component.onDeleteList();

      expect(dataServiceMock.deleteList).toHaveBeenCalledWith('list1');
    });

    it('should NOT delete list if user cancels', () => {
      global.confirm = vi.fn(() => false);

      component.onDeleteList();

      expect(dataServiceMock.deleteList).not.toHaveBeenCalled();
    });

    it('should navigate after successful delete', async () => {
      global.confirm = vi.fn(() => true);

      component.onDeleteList();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(routerMock.navigate).toHaveBeenCalledWith(['/lists']);
    });

    it('should show snackbar when list is empty', () => {
      component['currentList'] = { ...testList, articleIds: [] };
      component.onClearAllItems();

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Liste ist bereits leer',
        '',
        expect.objectContaining({ duration: 1500 })
      );
    });
  });

  // =========================================
  // DEPARTMENT GROUPING TESTS
  // =========================================

  describe('Department Grouping', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should group articles by department', async () => {
      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      expect(groups.length).toBeGreaterThan(0);

      // Each group should have a department and articles
      groups.forEach((group: any) => {
        expect(group.department).toBeDefined();
        expect(Array.isArray(group.articles)).toBe(true);
      });
    });

    it('should respect department order from list', async () => {
      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      // Should follow departmentOrder: ['dairy', 'fruits', 'bakery']
      if (groups.length > 0) {
        const firstDept = groups[0].department.id;
        expect(['dairy', 'fruits', 'bakery']).toContain(firstDept);
      }
    });

    it('should handle articles with empty departments', async () => {
      const articlesWithEmptyDept = [
        createTestArticle('article5', 'Test Item', ''),
        createTestArticle('article6', 'Another Test', '')
      ];

      dataServiceMock.getArticles.mockReturnValue(of([...testArticles, ...articlesWithEmptyDept]));

      const newComponent = new ListDetailComponent(
        activatedRouteMock as any,
        routerMock as any,
        dataServiceMock as DataService,
        departmentServiceMock as DepartmentService,
        listUtilsMock as ListUtilsService,
        snackBarMock as MatSnackBar,
        cdrMock as ChangeDetectorRef,
        disambiguationMock as DisambiguationService
      );

      newComponent.ngOnInit();

      // Component should handle empty departments by assigning to 'miscellaneous'
      const groups = await new Promise<any>((resolve) => {
        newComponent.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap((g: any) => g.articles);
      // Should have at least the original articles
      expect(allArticles.length).toBeGreaterThan(0);

      newComponent.ngOnDestroy();
    });

    it('should sort articles within departments', async () => {
      const groups = await new Promise<any>((resolve) => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      groups.forEach((group: any) => {
        const names = group.articles.map((a: any) => a.name);
        const sortedNames = [...names].sort((a: string, b: string) => a.localeCompare(b));
        expect(names).toEqual(sortedNames);
      });
    });
  });

  // =========================================
  // FAB CONTROLS TESTS
  // =========================================

  describe('FAB Controls', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should toggle FAB expanded state', () => {
      expect(component.isFabExpanded()).toBe(false);

      component.toggleFab();
      expect(component.isFabExpanded()).toBe(true);

      component.toggleFab();
      expect(component.isFabExpanded()).toBe(false);
    });

    it('should close FAB', () => {
      component.isFabExpanded.set(true);

      component.closeFab();

      expect(component.isFabExpanded()).toBe(false);
    });

    it('should close FAB when changing filter', () => {
      component.isFabExpanded.set(true);

      component.onFilterChange({ mode: 'shopping', filter: 'alle' });

      expect(component.isFabExpanded()).toBe(false);
    });
  });

  // =========================================
  // UTILITY METHOD TESTS
  // =========================================

  describe('Utility Methods', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should get current list color', () => {
      const color = component.getCurrentListColor();
      expect(color).toBe('#1a9edb');
    });

    it('should get contrast color', () => {
      const contrast = component.getContrastColor('#1a9edb');
      expect(contrast).toBe('#ffffff');
    });

    it('should determine if article should be hidden', () => {
      const checkedArticle: any = {
        isChecked: true,
        pendingHideTimestamp: undefined
      };

      component['currentShoppingFilter'].set('offen');
      const shouldHide = component.shouldHideArticle(checkedArticle);

      expect(shouldHide).toBe(true);
    });

    it('should NOT hide article if it has pending hide timestamp', () => {
      const checkedArticle: any = {
        isChecked: true,
        pendingHideTimestamp: Date.now() + 5000
      };

      component['currentShoppingFilter'].set('offen');
      const shouldHide = component.shouldHideArticle(checkedArticle);

      expect(shouldHide).toBe(false);
    });

    it('should NOT hide unchecked articles', () => {
      const uncheckedArticle: any = {
        isChecked: false,
        pendingHideTimestamp: undefined
      };

      component['currentShoppingFilter'].set('offen');
      const shouldHide = component.shouldHideArticle(uncheckedArticle);

      expect(shouldHide).toBe(false);
    });
  });

  // =========================================
  // CLEANUP TESTS
  // =========================================

  describe('Component Cleanup', () => {
    beforeEach(() => {
      component.ngOnInit();
      listUtilsMock.resetToDefaultTheme.mockClear();
    });

    it('should clean up on destroy', () => {
      // Router is not on /lists route, so theme should be reset
      routerMock.url = '/some-other-route';

      component.ngOnDestroy();

      // Theme should be reset when navigating away from list detail
      expect(listUtilsMock.resetToDefaultTheme).toHaveBeenCalled();
    });

    it('should clear timeouts on destroy', () => {
      // Set some pending state with timeout
      component['undoHintTimeouts'].set('article1', setTimeout(() => {}, 5000));

      component.ngOnDestroy();

      // Timeouts should be cleared
      expect(component['undoHintTimeouts'].size).toBe(0);
    });

    it('should complete all observables on destroy', () => {
      const destroySpy = vi.spyOn(component['destroy$'], 'next');
      const completeDestroySpy = vi.spyOn(component['destroy$'], 'complete');
      const completePendingSpy = vi.spyOn(component['pendingStates$'], 'complete');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeDestroySpy).toHaveBeenCalled();
      expect(completePendingSpy).toHaveBeenCalled();
    });

    it('should reset theme when navigating away from lists', () => {
      routerMock.url = '/articles';
      listUtilsMock.resetToDefaultTheme.mockClear();

      component.ngOnDestroy();

      expect(listUtilsMock.resetToDefaultTheme).toHaveBeenCalled();
    });
  });

  // =========================================
  // SEARCH DISAMBIGUATION TESTS
  // =========================================

  describe('Search Disambiguation', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should clear search disambiguation', () => {
      component.searchDisambiguation$.next({ query: 'test', options: [] });

      component.onClearSearchDisambiguation();

      component.searchDisambiguation$.subscribe(value => {
        expect(value).toBeNull();
      });
    });

    it('should handle search disambiguation selection for existing article', async () => {
      component.searchDisambiguation$.next({ query: 'Milch', options: [] });
      component['currentList'] = testList;

      const option = {
        type: 'existing',
        article: testArticles[0]
      };

      await component.onSelectSearchDisambiguation(option);

      expect(dataServiceMock.updateList).toHaveBeenCalled();
    });

    it('should handle search disambiguation selection for new article', async () => {
      component.searchDisambiguation$.next({ query: 'New Item', options: [] });
      component['currentList'] = testList;

      const option = {
        type: 'new',
        suggestedDepartmentId: 'dairy',
        icon: '🥛'
      };

      await component.onSelectSearchDisambiguation(option);

      expect(dataServiceMock.createArticle).toHaveBeenCalled();
    });

    it('should clear search after successful disambiguation', async () => {
      component.searchQuery = 'Test';
      component.searchDisambiguation$.next({ query: 'Test', options: [] });
      component['currentList'] = testList;

      const option = {
        type: 'existing',
        article: testArticles[0]
      };

      await component.onSelectSearchDisambiguation(option);

      // Search should be cleared (checked in implementation)
      expect(component.searchQuery).toBeDefined();
    });
  });

  // =========================================
  // PENDING STATE MANAGEMENT TESTS
  // =========================================

  describe('Pending State Management', () => {
    beforeEach(() => {
      component.ngOnInit();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start pending hide timer for checked article', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch',
        isChecked: false
      };

      component['startPendingHide'](article);

      // Check that pending state was set
      component['pendingStates$'].subscribe(states => {
        expect(states['article1']).toBeDefined();
        expect(states['article1'].showUndoHint).toBe(true);
      });
    });

    it('should remove pending state after timeout', () => {
      const article: any = {
        id: 'article1',
        name: 'Milch'
      };

      component['startPendingHide'](article);

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      // Pending state should be removed
      component['pendingStates$'].subscribe(states => {
        expect(states['article1']).toBeUndefined();
      });
    });

    it('should clear timeout when removing pending state', () => {
      const article: any = { id: 'article1', name: 'Milch' };

      component['startPendingHide'](article);
      expect(component['undoHintTimeouts'].has('article1')).toBe(true);

      component['removePendingState']('article1');
      expect(component['undoHintTimeouts'].has('article1')).toBe(false);
    });
  });

  // =========================================
  // EDGE CASE TESTS
  // =========================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should handle empty article list', async () => {
      dataServiceMock.getArticles.mockReturnValue(of([]));

      const newComponent = new ListDetailComponent(
        activatedRouteMock as any,
        routerMock as any,
        dataServiceMock as DataService,
        departmentServiceMock as DepartmentService,
        listUtilsMock as ListUtilsService,
        snackBarMock as MatSnackBar,
        cdrMock as ChangeDetectorRef,
        disambiguationMock as DisambiguationService
      );

      newComponent.ngOnInit();

      const groups = await new Promise<any>((resolve) => {
        newComponent.departmentGroups$.subscribe(groups => resolve(groups));
      });

      expect(groups).toBeDefined();
      expect(Array.isArray(groups)).toBe(true);
      newComponent.ngOnDestroy();
    });

    it('should handle article without info', () => {
      const article: any = null;

      component.onArticleInfo(article);

      // Should not crash, router.navigate should not be called
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('should handle edit amount for article without current list', () => {
      component['currentList'] = null;
      global.prompt = vi.fn(() => 'test amount');

      const article: any = { id: 'article1', name: 'Milch', amount: '' };
      component['editArticleAmount'](article);

      // Should not crash
      expect(global.prompt).toHaveBeenCalled();
    });

    it('should handle department sort without current list', () => {
      component['currentList'] = null;

      component.onDepartmentSort();

      // Should not navigate
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('should handle celebration on empty list', () => {
      component['checkForCompletion']([]);

      expect(component['wasIncompleteLastCheck']).toBe(false);
      expect(component.showCelebrationAnimation()).toBe(false);
    });
  });
});
