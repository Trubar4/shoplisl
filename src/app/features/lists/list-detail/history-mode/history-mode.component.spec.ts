import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { HistoryModeComponent } from './history-mode.component';
import { ShoppingList, Article, ListItemState } from '../../../../core/models';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { UserProfile } from '../../../../core/services/user-profile.service';

describe('HistoryModeComponent', () => {
  let component: HistoryModeComponent;
  let storeMock: any;
  let historyServiceMock: any;
  let cdrMock: any;
  let userProfileServiceMock: any;

  const mockArticles: Article[] = [
    {
      id: 'article1',
      name: 'Milch',
      icon: '🥛',
      departmentId: 'dairy',
      categoryId: 'beverages',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'article2',
      name: 'Brot',
      icon: '🍞',
      departmentId: 'bakery',
      categoryId: 'bread',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const mockList: ShoppingList = {
    id: 'list1',
    name: 'Test List',
    articleIds: ['article1', 'article2'],
    itemStates: {
      'article1': {
        articleId: 'article1',
        isChecked: true,
        amount: '2L',
        checkedAt: new Date('2025-11-22T10:30:00'),
        checkedBy: 'shared-shoplisl-user',
        history: [{
          timestamp: new Date('2025-11-22T10:30:00'),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked',
          amount: '2L'
        }]
      },
      'article2': {
        articleId: 'article2',
        isChecked: true,
        amount: '1 Stück',
        checkedAt: new Date('2025-11-21T14:20:00'),
        checkedBy: 'shared-shoplisl-user',
        history: [{
          timestamp: new Date('2025-11-21T14:20:00'),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked',
          amount: '1 Stück'
        }]
      }
    },
    departmentOrder: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockCompletedStates = [
    {
      articleId: 'article1',
      isChecked: true,
      amount: '2L',
      checkedAt: new Date('2025-11-22T10:30:00'),
      checkedBy: 'shared-shoplisl-user',
      history: [{
        timestamp: new Date('2025-11-22T10:30:00'),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked',
        amount: '2L'
      }]
    },
    {
      articleId: 'article2',
      isChecked: true,
      amount: '1 Stück',
      checkedAt: new Date('2025-11-21T14:20:00'),
      checkedBy: 'shared-shoplisl-user',
      history: [{
        timestamp: new Date('2025-11-21T14:20:00'),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked',
        amount: '1 Stück'
      }]
    }
  ];

  beforeEach(() => {
    storeMock = {
      select: vi.fn((selector: any) => {
        const selectorStr = selector.toString();
        if (selectorStr.includes('selectAllArticles')) {
          return of(mockArticles);
        }
        // For selectCompletedArticlesFromList
        return of(mockCompletedStates);
      })
    };

    historyServiceMock = {
      formatDate: vi.fn((date: Date) => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
      })
    };

    const authServiceMock = {
      getCurrentUserId: vi.fn(() => 'shared-shoplisl-user')
    };

    userProfileServiceMock = {
      getUserProfiles: vi.fn(() => of(new Map()))
    };

    cdrMock = {
      markForCheck: vi.fn()
    };

    component = new HistoryModeComponent(storeMock, historyServiceMock, authServiceMock as any, userProfileServiceMock as any, cdrMock as any);
    component.list = mockList;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have initial completed count of 0', () => {
    expect(component.completedCount()).toBe(0);
  });

  it('should setup observables on init', () => {
    component.ngOnInit();
    expect(storeMock.select).toHaveBeenCalled();
  });

  it('should emit articleRestore event on click', () => {
    const emitSpy = vi.spyOn(component.articleRestore, 'emit');
    const mockArticle: ArticleItemData = {
      id: 'article1',
      name: 'Milch',
      icon: '🥛',
      departmentId: 'dairy',
      amount: '2L',
      isChecked: true,
      checkedAt: new Date(),
      history: []
    };

    component.onArticleClick(mockArticle);
    expect(emitSpy).toHaveBeenCalledWith(mockArticle);
  });

  it('should emit articleInfo event', () => {
    const emitSpy = vi.spyOn(component.articleInfo, 'emit');
    const mockArticle: ArticleItemData = {
      id: 'article1',
      name: 'Milch',
      icon: '🥛',
      departmentId: 'dairy',
      amount: '2L',
      isChecked: true,
      checkedAt: new Date(),
      history: []
    };

    component.onArticleInfo(mockArticle);
    expect(emitSpy).toHaveBeenCalledWith(mockArticle);
  });

  it('should format date correctly', () => {
    const date = new Date('2025-11-22T10:30:00');
    const formatted = component.formatDate(date);
    expect(formatted).toBe('22.11.2025');
    expect(historyServiceMock.formatDate).toHaveBeenCalledWith(date);
  });

  it('should format time correctly', () => {
    const date = new Date('2025-11-22T10:30:00');
    const formatted = component.formatTime(date);
    expect(formatted).toBe('10:30');
  });

  it('should return empty string for undefined date', () => {
    expect(component.formatDate(undefined)).toBe('');
    expect(component.formatTime(undefined)).toBe('');
  });

  it('should return correct user display name', () => {
    expect(component.getUserDisplayName('shared-shoplisl-user')).toBe('Du');
    expect(component.getUserDisplayName(undefined)).toBe('Du');
  });

  it('should clean up on destroy', () => {
    const destroySpy = vi.spyOn(component['destroy$'], 'next');
    const completeSpy = vi.spyOn(component['destroy$'], 'complete');
    component.ngOnDestroy();
    expect(destroySpy).toHaveBeenCalled();
    expect(completeSpy).toHaveBeenCalled();
  });

  describe('Bug 1: user display names in completed items (OnPush + Lädt...)', () => {
    it('should return "Lädt..." for unknown user before profile loads', () => {
      // Before any profile is fetched, unknown userId should show "Lädt..."
      expect(component.getUserDisplayName('other-user-id')).toBe('Lädt...');
    });

    it('should call markForCheck after user profiles are loaded', () => {
      const profileMap = new Map<string, UserProfile>([
        ['other-user-id', { id: 'other-user-id', name: 'Maria' }]
      ]);
      userProfileServiceMock.getUserProfiles = vi.fn(() => of(profileMap));

      // Trigger preload via private method
      (component as any).preloadUserNames(['other-user-id']);

      // ChangeDetectorRef.markForCheck must be called so OnPush re-renders
      expect(cdrMock.markForCheck).toHaveBeenCalled();
    });

    it('should return loaded name after preloadUserNames resolves', () => {
      const profileMap = new Map<string, UserProfile>([
        ['other-user-id', { id: 'other-user-id', name: 'Maria' }]
      ]);
      userProfileServiceMock.getUserProfiles = vi.fn(() => of(profileMap));

      (component as any).preloadUserNames(['other-user-id']);

      expect(component.getUserDisplayName('other-user-id')).toBe('Maria');
    });

    it('should not call markForCheck when all users are already cached or current user', () => {
      // All usersToFetch would be filtered out (only current user) → no fetch → no markForCheck
      (component as any).preloadUserNames(['shared-shoplisl-user']);
      expect(cdrMock.markForCheck).not.toHaveBeenCalled();
    });
  });
});
