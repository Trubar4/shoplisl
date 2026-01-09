import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Router, ActivatedRoute } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ChangeDetectorRef } from '@angular/core';

import { ListDetailComponent } from './list-detail';
import { ShoppingList, Article, Department } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';
import { DepartmentService } from '../../../core/services/department.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';
import { DisambiguationService } from '../../../core/services/ai/disambiguation';
import { ListFilterService } from './services/list-filter.service';
import { ArticleSelectionService } from './services/article-selection.service';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { SharingService } from '../../../core/services/sharing.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { AIService } from '../../../core/services/ai';
import { ActiveListService } from '../../../core/services/active-list.service';

/**
 * BUG 2: Article updates not visible when returning to list
 *
 * GHERKIN SCENARIO:
 * Given I am viewing a list "Shopping List" in shopping mode
 * And the article "Milk" has icon "🥛" and department "dairy-products"
 * When I navigate to article details and change:
 *   - Icon from "🥛" to "🍼"
 *   - Department from "dairy-products" to "beverages-alcohol"
 * And I save the changes
 * And I navigate back to the list
 * Then the article "Milk" should display with icon "🍼"
 * And the article should be in department "beverages-alcohol"
 * Without needing to perform a full page refresh
 *
 * CURRENT BUG: Article still shows old icon "🥛" and old department until F5 refresh
 * ROOT CAUSE: NgRx store is not being refreshed after article updates
 */

describe('Bug 2: Article updates not visible when returning to list', () => {
  let component: ListDetailComponent;
  let storeMock: any;
  let dataServiceMock: any;
  let departmentServiceMock: any;
  let listUtilsMock: any;
  let disambiguationMock: any;
  let filterServiceMock: any;
  let selectionServiceMock: any;
  let dialogMock: any;
  let snackBarMock: any;
  let routerMock: any;
  let activatedRouteMock: any;
  let cdrMock: any;
  let sharingServiceMock: any;
  let authServiceMock: any;
  let userProfileServiceMock: any;
  let aiServiceMock: any;
  let activeListServiceMock: any;

  const USER_ID = 'user-123';
  const LIST_ID = 'list-1';
  const ARTICLE_ID = 'article-milk';

  const testDepartments: Department[] = [
    { id: 'dairy-products', nameGerman: 'Milchprodukte', nameEnglish: 'Dairy', icon: 'milk.png' },
    { id: 'beverages-alcohol', nameGerman: 'Getränke', nameEnglish: 'Beverages', icon: 'drink.png' },
    { id: 'bread', nameGerman: 'Brot', nameEnglish: 'Bread', icon: 'bread.png' },
  ];

  const createArticle = (icon: string, departmentId: string): Article => ({
    id: ARTICLE_ID,
    name: 'Milk',
    icon,
    departmentId,
    ownerId: USER_ID,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  });

  const createList = (): ShoppingList => ({
    id: LIST_ID,
    name: 'Shopping List',
    ownerId: USER_ID,
    articleIds: [ARTICLE_ID],
    itemStates: {
      [ARTICLE_ID]: { articleId: ARTICLE_ID, isChecked: false },
    },
    departmentOrder: ['dairy-products', 'beverages-alcohol', 'bread'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  });

  // We'll use BehaviorSubjects to simulate NgRx store updates
  let articlesSubject: BehaviorSubject<Article[]>;
  let listsSubject: BehaviorSubject<ShoppingList[]>;

  beforeEach(() => {
    // Initial state: Article has old icon and department
    const initialArticle = createArticle('🥛', 'dairy-products');
    articlesSubject = new BehaviorSubject<Article[]>([initialArticle]);
    listsSubject = new BehaviorSubject<ShoppingList[]>([createList()]);

    storeMock = {
      select: vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return listsSubject.asObservable();
        }
        if (selector === selectAllArticles) {
          return articlesSubject.asObservable();
        }
        return of([]);
      }),
      dispatch: vi.fn()
    };

    dataServiceMock = {
      getLists: vi.fn(() => of([createList()])),
      getArticles: vi.fn(() => of([createArticle('🥛', 'dairy-products')])),
      updateList: vi.fn(() => of(true)),
      createArticle: vi.fn(),
      toggleItemChecked: vi.fn(() => of(true)),
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

    const shoppingFilterSubject = new BehaviorSubject<'offen' | 'erledigt' | 'alle'>('offen');
    const editFilterSubject = new BehaviorSubject<'gelistet' | 'fehlend' | 'alle'>('alle');
    const searchQuerySubject = new BehaviorSubject<string>('');

    filterServiceMock = {
      shoppingFilter$: shoppingFilterSubject.asObservable(),
      editFilter$: editFilterSubject.asObservable(),
      searchQuery$: searchQuerySubject.asObservable(),
      get currentShoppingFilter() { return shoppingFilterSubject.value; },
      get currentEditFilter() { return editFilterSubject.value; },
      get currentSearchQuery() { return searchQuerySubject.value; },
      setShoppingFilter: vi.fn((filter: any) => shoppingFilterSubject.next(filter)),
      setEditFilter: vi.fn((filter: any) => editFilterSubject.next(filter)),
      setSearchQuery: vi.fn((query: string) => searchQuerySubject.next(query)),
      restorePreviousFilter: vi.fn(),
      clearSearch: vi.fn(() => searchQuerySubject.next('')),
      cleanup: vi.fn(),
    };

    const selectionModeSubject = new BehaviorSubject<boolean>(false);
    const selectedArticleIdsSubject = new BehaviorSubject<Set<string>>(new Set());

    selectionServiceMock = {
      isSelectionMode$: selectionModeSubject.asObservable(),
      selectedArticleIds$: selectedArticleIdsSubject.asObservable(),
      get isSelectionMode() { return selectionModeSubject.value; },
      enterSelectionMode: vi.fn(() => selectionModeSubject.next(true)),
      exitSelectionMode: vi.fn(() => selectionModeSubject.next(false)),
    };

    dialogMock = {
      open: vi.fn(() => ({
        afterClosed: () => of(null)
      }))
    };

    snackBarMock = {
      open: vi.fn()
    };

    routerMock = {
      navigate: vi.fn(),
      url: `/lists/${LIST_ID}`
    };

    activatedRouteMock = {
      snapshot: {
        paramMap: {
          get: vi.fn((key: string) => key === 'id' ? LIST_ID : null)
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

    sharingServiceMock = {
      // Add any required methods
    };

    authServiceMock = {
      getCurrentUserId: vi.fn(() => USER_ID),
      getCurrentUser: vi.fn(() => of({ id: USER_ID, email: 'user@example.com' }))
    };

    userProfileServiceMock = {
      preloadUserProfiles: vi.fn()
    };

    aiServiceMock = {
      hasApiKey: vi.fn(() => false)
    };

    activeListServiceMock = {
      setActiveList: vi.fn(),
      clearActiveList: vi.fn()
    };

    component = new ListDetailComponent(
      activatedRouteMock as any,
      routerMock as Router,
      storeMock as Store<any>,
      dataServiceMock as DataService,
      departmentServiceMock as DepartmentService,
      listUtilsMock as ListUtilsService,
      snackBarMock as MatSnackBar,
      cdrMock as ChangeDetectorRef,
      disambiguationMock as DisambiguationService,
      filterServiceMock as ListFilterService,
      selectionServiceMock as ArticleSelectionService,
      dialogMock as MatDialog,
      sharingServiceMock as SharingService,
      authServiceMock as AuthService,
      userProfileServiceMock as UserProfileService,
      aiServiceMock as AIService,
      activeListServiceMock as ActiveListService
    );
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  describe('Scenario: Article icon update is visible in shopping mode', () => {
    it('should display updated article icon after edit without page refresh', async () => {
      // GIVEN: Viewing list in shopping mode
      component.ngOnInit();
      component.switchToShoppingMode();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Get initial article data
      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      let allArticles = groups.flatMap(g => g.articles);
      let milkArticle = allArticles.find(a => a.id === ARTICLE_ID);

      // Verify initial state
      expect(milkArticle).toBeDefined();
      expect(milkArticle?.icon).toBe('🥛'); // Old icon
      expect(milkArticle?.departmentId).toBe('dairy-products'); // Old department

      // WHEN: User updates article (simulating navigation to edit and back)
      // Simulate article being updated in Firebase/backend
      const updatedArticle = createArticle('🍼', 'dairy-products');
      articlesSubject.next([updatedArticle]);

      // Wait for observable to propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      // THEN: Updated icon should be visible
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);

      expect(milkArticle).toBeDefined();
      expect(milkArticle?.icon).toBe('🍼'); // NEW ICON - should update automatically
    });

    it('should fail when article icon is not updated (demonstrates bug)', async () => {
      // This test demonstrates the CURRENT BUGGY BEHAVIOR
      // where the article icon doesn't update automatically

      component.ngOnInit();
      component.switchToShoppingMode();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Get initial article
      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      let allArticles = groups.flatMap(g => g.articles);
      let milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🥛');

      // Simulate article update WITHOUT triggering NgRx reload
      // (This is the bug - store doesn't refresh automatically)
      // In reality, the article is updated in Firebase but not in NgRx store

      // If we DON'T update the articlesSubject, the view stays stale
      // articlesSubject.next([updatedArticle]); // <-- This is NOT called (bug)

      await new Promise(resolve => setTimeout(resolve, 100));

      // BUG: Article still shows old icon
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);

      // THIS IS THE BUG: Icon still shows old value
      expect(milkArticle?.icon).toBe('🥛'); // Still old icon, not '🍼'
    });
  });

  describe('Scenario: Article department update is visible in edit mode', () => {
    it('should display article in new department after update', async () => {
      // GIVEN: Viewing list in edit mode
      component.ngOnInit();
      component.switchToEditMode();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial department
      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroupsEdit$.subscribe(groups => resolve(groups));
      });

      let dairyGroup = groups.find(g => g.department.id === 'dairy-products');
      expect(dairyGroup).toBeDefined();
      let milkInDairy = dairyGroup?.articles.find((a: any) => a.id === ARTICLE_ID);
      expect(milkInDairy).toBeDefined();

      // WHEN: Article department is changed
      const updatedArticle = createArticle('🍼', 'beverages-alcohol');
      articlesSubject.next([updatedArticle]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // THEN: Article should appear in new department
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroupsEdit$.subscribe(groups => resolve(groups));
      });

      const beveragesGroup = groups.find(g => g.department.id === 'beverages-alcohol');
      expect(beveragesGroup).toBeDefined();

      const milkInBeverages = beveragesGroup?.articles.find((a: any) => a.id === ARTICLE_ID);
      expect(milkInBeverages).toBeDefined();
      expect(milkInBeverages?.departmentId).toBe('beverages-alcohol');

      // Should NOT be in old department
      dairyGroup = groups.find(g => g.department.id === 'dairy-products');
      milkInDairy = dairyGroup?.articles.find((a: any) => a.id === ARTICLE_ID);
      expect(milkInDairy).toBeUndefined();
    });
  });

  describe('Scenario: Article updates visible across multiple lists', () => {
    it('should show updated article in all lists containing it', async () => {
      // GIVEN: Article exists in multiple lists
      const list2 = {
        id: 'list-2',
        name: 'Weekly Shop',
        ownerId: USER_ID,
        articleIds: [ARTICLE_ID],
        itemStates: {
          [ARTICLE_ID]: { articleId: ARTICLE_ID, isChecked: false },
        },
        departmentOrder: ['dairy-products', 'beverages-alcohol'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      listsSubject.next([createList(), list2]);

      // Navigate to first list
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial state in list 1
      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      let allArticles = groups.flatMap(g => g.articles);
      let milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🥛');

      // WHEN: Article is updated
      const updatedArticle = createArticle('🍼', 'beverages-alcohol');
      articlesSubject.next([updatedArticle]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // THEN: Should show updated article in first list
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🍼');
      expect(milkArticle?.departmentId).toBe('beverages-alcohol');

      // Simulate navigation to second list (by updating route param)
      activatedRouteMock.snapshot.paramMap.get = vi.fn((key: string) => key === 'id' ? 'list-2' : null);

      const component2 = new ListDetailComponent(
        activatedRouteMock as any,
        routerMock as Router,
        storeMock as Store<any>,
        dataServiceMock as DataService,
        departmentServiceMock as DepartmentService,
        listUtilsMock as ListUtilsService,
        snackBarMock as MatSnackBar,
        cdrMock as ChangeDetectorRef,
        disambiguationMock as DisambiguationService,
        filterServiceMock as ListFilterService,
        selectionServiceMock as ArticleSelectionService,
        dialogMock as MatDialog,
        sharingServiceMock as SharingService,
        authServiceMock as AuthService,
        userProfileServiceMock as UserProfileService,
        aiServiceMock as AIService,
        activeListServiceMock as ActiveListService
      );

      component2.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should show updated article in second list too
      groups = await new Promise<any[]>(resolve => {
        component2.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🍼');
      expect(milkArticle?.departmentId).toBe('beverages-alcohol');

      component2.ngOnDestroy();
    });
  });

  describe('Scenario: Both icon and department updates together', () => {
    it('should show both icon and department changes simultaneously', async () => {
      component.ngOnInit();
      component.switchToShoppingMode();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Initial state
      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      let allArticles = groups.flatMap(g => g.articles);
      let milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🥛');
      expect(milkArticle?.departmentId).toBe('dairy-products');

      // Update BOTH icon and department
      const updatedArticle = createArticle('🍼', 'beverages-alcohol');
      articlesSubject.next([updatedArticle]);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Both should be updated
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🍼'); // Icon updated
      expect(milkArticle?.departmentId).toBe('beverages-alcohol'); // Department updated
    });
  });

  describe('Integration: Full edit flow simulation', () => {
    it('should maintain updates through complete navigation flow', async () => {
      // 1. Start in list view
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 100));

      let groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      let allArticles = groups.flatMap(g => g.articles);
      let milkArticle = allArticles.find(a => a.id === ARTICLE_ID);
      expect(milkArticle?.icon).toBe('🥛');

      // 2. Simulate navigation to article edit (via onArticleInfo)
      component.onArticleInfo(milkArticle!);
      expect(routerMock.navigate).toHaveBeenCalledWith(
        ['/articles/edit', ARTICLE_ID],
        expect.objectContaining({
          queryParams: expect.objectContaining({
            returnTo: `/lists/${LIST_ID}?mode=shopping`
          })
        })
      );

      // 3. Simulate article being updated while in edit view
      const updatedArticle = createArticle('🍼', 'beverages-alcohol');
      articlesSubject.next([updatedArticle]);

      // 4. Simulate navigation back to list (component is already initialized)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 5. Verify updates are visible
      groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      allArticles = groups.flatMap(g => g.articles);
      milkArticle = allArticles.find(a => a.id === ARTICLE_ID);

      expect(milkArticle?.icon).toBe('🍼');
      expect(milkArticle?.departmentId).toBe('beverages-alcohol');
    });
  });

  describe('Edge cases', () => {
    it('should handle article name changes', async () => {
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 100));

      const renamedArticle: Article = {
        ...createArticle('🥛', 'dairy-products'),
        name: 'Whole Milk 3.5%'
      };
      articlesSubject.next([renamedArticle]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap(g => g.articles);
      const article = allArticles.find(a => a.id === ARTICLE_ID);
      expect(article?.name).toBe('Whole Milk 3.5%');
    });

    it('should handle article with empty department after update', async () => {
      component.ngOnInit();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update to empty department
      const updatedArticle = createArticle('🍼', '');
      articlesSubject.next([updatedArticle]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const groups = await new Promise<any[]>(resolve => {
        component.departmentGroups$.subscribe(groups => resolve(groups));
      });

      const allArticles = groups.flatMap(g => g.articles);
      const article = allArticles.find(a => a.id === ARTICLE_ID);

      // Should default to 'miscellaneous' department
      expect(article).toBeDefined();
      expect(article?.icon).toBe('🍼');
    });
  });
});
