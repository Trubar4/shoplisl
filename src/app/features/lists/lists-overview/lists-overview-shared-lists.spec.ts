import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ListsOverviewComponent } from './lists-overview';
import { ShoppingList, Article } from '../../../core/models';
import { selectAllLists } from '../../../state/lists/lists.selectors';
import { selectAllArticles } from '../../../state/articles/articles.selectors';
import { ConnectionService } from '../../../core/services/connection.service';
import { AuthService } from '../../../core/services/auth.service';
import { ListUtilsService } from '../../../core/services/list-utils.service';

/**
 * BUG 1: Article count not displayed for shared lists (non-owners)
 *
 * GHERKIN SCENARIO:
 * Given user "collaborator@example.com" is logged in
 * And they have a list "Groceries" shared with them
 * And the list contains 3 articles (2 unchecked, 1 checked)
 * When they navigate to the lists overview page
 * Then they should see the article count "2/3 Artikel" immediately
 * And they should NOT need to open the list first
 *
 * CURRENT BUG: Article count is not displayed until user opens the list and returns
 * ROOT CAUSE: list.articleIds is empty for shared lists on first load
 */

describe('Bug 1: Article count in shared lists (non-owners)', () => {
  let component: ListsOverviewComponent;
  let storeMock: any;
  let routerMock: any;
  let snackBarMock: any;
  let connectionServiceMock: any;
  let authServiceMock: any;
  let listUtilsMock: any;

  // Test users
  const OWNER_ID = 'owner-123';
  const COLLABORATOR_ID = 'collaborator-456';

  // Test data
  const createSharedList = (
    id: string,
    name: string,
    ownerId: string,
    sharedWith: string[],
    articleIds: string[]
  ): ShoppingList => ({
    id,
    name,
    ownerId,
    sharedWith,
    articleIds,
    itemStates: {
      'article1': { articleId: 'article1', isChecked: false },
      'article2': { articleId: 'article2', isChecked: false },
      'article3': { articleId: 'article3', isChecked: true },
    },
    departmentOrder: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-02'),
  });

  const testArticles: Article[] = [
    {
      id: 'article1',
      name: 'Milk',
      ownerId: OWNER_ID,
      departmentId: 'dairy-products',
      icon: '🥛',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'article2',
      name: 'Bread',
      ownerId: OWNER_ID,
      departmentId: 'bread',
      icon: '🍞',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'article3',
      name: 'Butter',
      ownerId: OWNER_ID,
      departmentId: 'dairy-products',
      icon: '🧈',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    // Create mocks
    storeMock = {
      select: vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return of([
            createSharedList('list-1', 'Groceries', OWNER_ID, [COLLABORATOR_ID], ['article1', 'article2', 'article3'])
          ]);
        }
        if (selector === selectAllArticles) {
          return of(testArticles);
        }
        return of([]);
      }),
      dispatch: vi.fn()
    };

    routerMock = {
      navigate: vi.fn(),
      url: '/lists'
    };

    snackBarMock = {
      open: vi.fn(() => ({
        onAction: () => of(null),
        afterDismissed: () => of({ dismissedByAction: false })
      }))
    };

    connectionServiceMock = {
      isOnline: vi.fn(() => true)
    };

    authServiceMock = {
      getCurrentUserId: vi.fn(() => COLLABORATOR_ID),
      getCurrentUser: vi.fn(() => of({ id: COLLABORATOR_ID, email: 'collaborator@example.com' }))
    };

    listUtilsMock = {
      updateThemeColors: vi.fn(),
      resetToDefaultTheme: vi.fn()
    };

    // Create component
    component = new ListsOverviewComponent(
      storeMock as Store<any>,
      routerMock as Router,
      snackBarMock as MatSnackBar,
      connectionServiceMock as ConnectionService,
      authServiceMock as AuthService,
      listUtilsMock as ListUtilsService
    );
  });

  describe('Scenario: Non-owner sees article count immediately on first load', () => {
    it('should display article count for shared list without needing to open it first', async () => {
      // GIVEN: User is a collaborator (non-owner)
      expect(component['currentUserId']).toBe(COLLABORATOR_ID);

      // WHEN: Loading lists overview
      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      expect(lists.length).toBe(1);
      const sharedList = lists[0];

      // THEN: Article count should be visible immediately
      const activeCount = component.getActiveItemCount(sharedList);
      expect(activeCount).toBe(2); // 2 unchecked articles

      const infoText = component.getListInfoText(sharedList);
      expect(infoText).toBe('2/3 Artikel');

      const shouldShow = component.shouldShowBadge(sharedList);
      expect(shouldShow).toBe(true);

      // Verify articleIds are populated
      expect(sharedList.articleIds).toHaveLength(3);
      expect(sharedList.articleIds).toContain('article1');
      expect(sharedList.articleIds).toContain('article2');
      expect(sharedList.articleIds).toContain('article3');
    });

    it('should show correct badge content for shared list', async () => {
      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const sharedList = lists[0];
      const badge = component.getBadgeContent(sharedList);

      expect(badge.text).toBe('2'); // 2 active items
      expect(badge.isCompleted).toBe(false);
    });

    it('should display shared indicator for non-owner', async () => {
      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const sharedList = lists[0];

      // User should NOT be the owner
      const isOwner = component.isListOwner(sharedList);
      expect(isOwner).toBe(false);

      // List should show as shared
      const sharingText = component.getSharingStatusText(sharedList);
      expect(sharingText).toBe('geteilt');

      const chipType = component.getSharingChipType(sharedList);
      expect(chipType).toBe('collaborator');
    });
  });

  describe('Scenario: Article count with empty articleIds (current bug behavior)', () => {
    it('should fail when articleIds is empty for shared list (demonstrates bug)', async () => {
      // SIMULATE THE BUG: Shared list arrives with empty articleIds
      const buggyList = createSharedList('list-1', 'Groceries', OWNER_ID, [COLLABORATOR_ID], []);

      storeMock.select = vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return of([buggyList]);
        }
        if (selector === selectAllArticles) {
          return of(testArticles);
        }
        return of([]);
      });

      component = new ListsOverviewComponent(
        storeMock as Store<any>,
        routerMock as Router,
        snackBarMock as MatSnackBar,
        connectionServiceMock as ConnectionService,
        authServiceMock as AuthService,
        listUtilsMock as ListUtilsService
      );

      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const sharedList = lists[0];

      // THIS IS THE BUG: Empty articleIds = no count displayed
      const activeCount = component.getActiveItemCount(sharedList);
      expect(activeCount).toBe(0); // BUG: Should be 2, but articleIds is empty

      const infoText = component.getListInfoText(sharedList);
      expect(infoText).toBe(''); // BUG: Should be "2/3 Artikel", but returns empty string

      const shouldShow = component.shouldShowBadge(sharedList);
      expect(shouldShow).toBe(false); // BUG: Should be true
    });
  });

  describe('Scenario: Multiple shared lists', () => {
    it('should display correct counts for multiple shared lists', async () => {
      const list1 = createSharedList('list-1', 'Groceries', OWNER_ID, [COLLABORATOR_ID], ['article1', 'article2', 'article3']);
      const list2 = createSharedList('list-2', 'Hardware', OWNER_ID, [COLLABORATOR_ID], ['article1', 'article2']);

      list2.itemStates = {
        'article1': { articleId: 'article1', isChecked: false },
        'article2': { articleId: 'article2', isChecked: true },
      };

      storeMock.select = vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return of([list1, list2]);
        }
        if (selector === selectAllArticles) {
          return of(testArticles);
        }
        return of([]);
      });

      component = new ListsOverviewComponent(
        storeMock as Store<any>,
        routerMock as Router,
        snackBarMock as MatSnackBar,
        connectionServiceMock as ConnectionService,
        authServiceMock as AuthService,
        listUtilsMock as ListUtilsService
      );

      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      expect(lists.length).toBe(2);

      // List 1: 3 articles, 2 active
      const info1 = component.getListInfoText(lists[0]);
      expect(info1).toBe('2/3 Artikel');

      // List 2: 2 articles, 1 active
      const info2 = component.getListInfoText(lists[1]);
      expect(info2).toBe('1/2 Artikel');
    });
  });

  describe('Scenario: Owner vs non-owner comparison', () => {
    it('should display count correctly for owner', async () => {
      // Change to owner user
      authServiceMock.getCurrentUserId = vi.fn(() => OWNER_ID);

      component = new ListsOverviewComponent(
        storeMock as Store<any>,
        routerMock as Router,
        snackBarMock as MatSnackBar,
        connectionServiceMock as ConnectionService,
        authServiceMock as AuthService,
        listUtilsMock as ListUtilsService
      );

      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const list = lists[0];

      // Owner should see correct count
      const infoText = component.getListInfoText(list);
      expect(infoText).toBe('2/3 Artikel');

      // Owner should see different sharing status
      const sharingText = component.getSharingStatusText(list);
      expect(sharingText).toBe('Geteilt mit 1'); // Shared with 1 person

      const chipType = component.getSharingChipType(list);
      expect(chipType).toBe('owner');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty list (no articles)', async () => {
      const emptyList = createSharedList('list-1', 'Empty List', OWNER_ID, [COLLABORATOR_ID], []);
      emptyList.itemStates = {};

      storeMock.select = vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return of([emptyList]);
        }
        if (selector === selectAllArticles) {
          return of(testArticles);
        }
        return of([]);
      });

      component = new ListsOverviewComponent(
        storeMock as Store<any>,
        routerMock as Router,
        snackBarMock as MatSnackBar,
        connectionServiceMock as ConnectionService,
        authServiceMock as AuthService,
        listUtilsMock as ListUtilsService
      );

      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const list = lists[0];

      const infoText = component.getListInfoText(list);
      expect(infoText).toBe('');

      const shouldShow = component.shouldShowBadge(list);
      expect(shouldShow).toBe(false);
    });

    it('should handle all articles checked', async () => {
      const completedList = createSharedList('list-1', 'Completed', OWNER_ID, [COLLABORATOR_ID], ['article1', 'article2']);
      completedList.itemStates = {
        'article1': { articleId: 'article1', isChecked: true },
        'article2': { articleId: 'article2', isChecked: true },
      };

      storeMock.select = vi.fn((selector: any) => {
        if (selector === selectAllLists) {
          return of([completedList]);
        }
        if (selector === selectAllArticles) {
          return of(testArticles);
        }
        return of([]);
      });

      component = new ListsOverviewComponent(
        storeMock as Store<any>,
        routerMock as Router,
        snackBarMock as MatSnackBar,
        connectionServiceMock as ConnectionService,
        authServiceMock as AuthService,
        listUtilsMock as ListUtilsService
      );

      component.ngOnInit();

      const lists = await new Promise<ShoppingList[]>((resolve) => {
        component.lists$.subscribe(lists => resolve(lists));
      });

      const list = lists[0];

      const badge = component.getBadgeContent(list);
      expect(badge.isCompleted).toBe(true);
      expect(badge.text).toBe('');

      const infoText = component.getListInfoText(list);
      expect(infoText).toBe('0/2 Artikel');
    });
  });
});
