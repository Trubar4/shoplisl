import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { signal, ChangeDetectorRef } from '@angular/core';
import { ShoppingModeComponent } from './shopping-mode.component';
import { ArticleItemData } from '../../../../shared/components/article-item/article-item.component';
import { ShoppingList, Article, Department } from '../../../../core/models';
import { DepartmentGroup } from '../../../../shared/components/article-list/article-list.component';

/**
 * Shopping Mode Component Tests
 *
 * Tests shopping-specific functionality:
 * - Article toggle with undo
 * - Pending state management
 * - Celebration animation
 * - Completion monitoring
 */

describe('ShoppingModeComponent', () => {
  let component: ShoppingModeComponent;
  let cdrMock: any;

  const createTestArticle = (id: string, name: string, isChecked: boolean): ArticleItemData => ({
    id,
    name,
    amount: '',
    departmentId: 'dairy',
    icon: '🥛',
    isChecked,
    isInList: true,
    listAmount: '1kg',
    notes: ''
  });

  const createTestDepartmentGroup = (articles: ArticleItemData[]): DepartmentGroup => ({
    department: {
      id: 'dairy',
      nameGerman: 'Milchprodukte',
      nameEnglish: 'Dairy',
      icon: 'milk.png'
    },
    articles
  });

  beforeEach(() => {
    vi.useFakeTimers();

    cdrMock = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    component = new ShoppingModeComponent(cdrMock as ChangeDetectorRef);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =========================================
  // INITIALIZATION TESTS
  // =========================================

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.list).toBeNull();
      expect(component.departmentGroups).toEqual([]);
      expect(component.searchQuery).toBe('');
      expect(component.shoppingFilter).toBe('offen');
      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should setup completion monitoring on init', () => {
      const setupSpy = vi.spyOn(component as any, 'setupCompletionMonitoring');
      component.ngOnInit();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  // =========================================
  // ARTICLE TOGGLE TESTS
  // =========================================

  describe('Article Toggle', () => {
    it('should emit article toggle event', () => {
      const article = createTestArticle('article1', 'Milch', false);
      const emitSpy = vi.spyOn(component.articleToggle, 'emit');

      component.onArticleToggle(article);

      expect(emitSpy).toHaveBeenCalledWith(article);
    });

    it('should start pending hide timer when article is checked', () => {
      const article = createTestArticle('article1', 'Milch', false);
      const startPendingSpy = vi.spyOn(component as any, 'startPendingHide');

      component.onArticleToggle(article);
      vi.advanceTimersByTime(150); // Wait for setTimeout

      expect(startPendingSpy).toHaveBeenCalled();
    });

    it('should emit undo event when clicking checked article with pending timestamp', () => {
      const article = createTestArticle('article1', 'Milch', true);
      article.pendingHideTimestamp = Date.now() + 5000;

      const emitSpy = vi.spyOn(component.undoCompletion, 'emit');

      component.onArticleToggle(article);

      expect(emitSpy).toHaveBeenCalledWith(article);
    });

    it('should remove pending state when undoing', () => {
      const article = createTestArticle('article1', 'Milch', true);
      article.pendingHideTimestamp = Date.now() + 5000;

      const removeSpy = vi.spyOn(component as any, 'removePendingState');

      component.onArticleToggle(article);

      expect(removeSpy).toHaveBeenCalledWith(article.id);
    });
  });

  // =========================================
  // ARTICLE INFO TESTS
  // =========================================

  describe('Article Info', () => {
    it('should emit article info event', () => {
      const article = createTestArticle('article1', 'Milch', false);
      const emitSpy = vi.spyOn(component.articleInfo, 'emit');

      component.onArticleInfo(article);

      expect(emitSpy).toHaveBeenCalledWith(article);
    });
  });

  // =========================================
  // EDIT AMOUNT TESTS
  // =========================================

  describe('Edit Amount', () => {
    it('should emit edit amount event', () => {
      const article = createTestArticle('article1', 'Milch', false);
      const event = new Event('click');
      const data = { article, event };
      const emitSpy = vi.spyOn(component.editAmount, 'emit');

      component.onEditAmount(data);

      expect(emitSpy).toHaveBeenCalledWith(data);
    });
  });

  // =========================================
  // PENDING STATE TESTS
  // =========================================

  describe('Pending State Management', () => {
    it('should set pending hide timestamp', () => {
      const article = createTestArticle('article1', 'Milch', false);

      component['startPendingHide'](article);

      const pendingStates = component['pendingStates$'].value;
      expect(pendingStates[article.id]).toBeDefined();
      expect(pendingStates[article.id].showUndoHint).toBe(true);
      expect(pendingStates[article.id].pendingHideTimestamp).toBeGreaterThan(Date.now());
    });

    it('should remove pending state after timeout', () => {
      const article = createTestArticle('article1', 'Milch', false);

      component['startPendingHide'](article);
      expect(component['pendingStates$'].value[article.id]).toBeDefined();

      vi.advanceTimersByTime(5000);

      expect(component['pendingStates$'].value[article.id]).toBeUndefined();
    });

    it('should clear timeout when removing pending state', () => {
      const article = createTestArticle('article1', 'Milch', false);

      component['startPendingHide'](article);
      expect(component['undoHintTimeouts'].has(article.id)).toBe(true);

      component['removePendingState'](article.id);

      expect(component['undoHintTimeouts'].has(article.id)).toBe(false);
    });
  });

  // =========================================
  // SHOULD HIDE ARTICLE TESTS
  // =========================================

  describe('Should Hide Article', () => {
    it('should hide checked articles without pending timestamp in offen filter', () => {
      component.shoppingFilter = 'offen';
      const article = createTestArticle('article1', 'Milch', true);

      const result = component.shouldHideArticle(article);

      expect(result).toBe(true);
    });

    it('should NOT hide checked articles with pending timestamp', () => {
      component.shoppingFilter = 'offen';
      const article = createTestArticle('article1', 'Milch', true);
      article.pendingHideTimestamp = Date.now() + 5000;

      const result = component.shouldHideArticle(article);

      expect(result).toBe(false);
    });

    it('should NOT hide unchecked articles', () => {
      component.shoppingFilter = 'offen';
      const article = createTestArticle('article1', 'Milch', false);

      const result = component.shouldHideArticle(article);

      expect(result).toBe(false);
    });

    it('should NOT hide articles when filter is not offen', () => {
      component.shoppingFilter = 'alle';
      const article = createTestArticle('article1', 'Milch', true);

      const result = component.shouldHideArticle(article);

      expect(result).toBe(false);
    });
  });

  // =========================================
  // CELEBRATION ANIMATION TESTS
  // =========================================

  describe('Celebration Animation', () => {
    it('should trigger celebration when list becomes complete', () => {
      component.shoppingFilter = 'offen';
      component['wasIncompleteLastCheck'] = true;

      const articles = [
        createTestArticle('article1', 'Milch', true),
        createTestArticle('article2', 'Brot', true)
      ];

      component['checkForCompletion'](articles);

      expect(component.showCelebrationAnimation()).toBe(true);
    });

    it('should NOT trigger celebration if already complete', () => {
      component.shoppingFilter = 'offen';
      component['wasIncompleteLastCheck'] = false;

      const articles = [
        createTestArticle('article1', 'Milch', true),
        createTestArticle('article2', 'Brot', true)
      ];

      component['checkForCompletion'](articles);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should NOT trigger celebration if not in offen filter', () => {
      component.shoppingFilter = 'alle';
      component['wasIncompleteLastCheck'] = true;

      const articles = [
        createTestArticle('article1', 'Milch', true),
        createTestArticle('article2', 'Brot', true)
      ];

      component['checkForCompletion'](articles);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should auto-close celebration after 3 seconds', () => {
      component.shoppingFilter = 'offen';
      component['triggerCelebrationAnimation']();

      expect(component.showCelebrationAnimation()).toBe(true);

      vi.advanceTimersByTime(3000);

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should close celebration when clicked', () => {
      component.showCelebrationAnimation.set(true);

      component.closeCelebrationAnimation();

      expect(component.showCelebrationAnimation()).toBe(false);
    });

    it('should update wasIncompleteLastCheck flag', () => {
      component.shoppingFilter = 'offen';
      component['wasIncompleteLastCheck'] = false;

      const articles = [
        createTestArticle('article1', 'Milch', false),
        createTestArticle('article2', 'Brot', true)
      ];

      component['checkForCompletion'](articles);

      expect(component['wasIncompleteLastCheck']).toBe(true);
    });
  });

  // =========================================
  // GIF LOADING TESTS
  // =========================================

  describe('GIF Loading', () => {
    it('should handle GIF error by showing fallback', () => {
      const mockEvent = {
        target: {
          style: { display: '' },
          nextElementSibling: { style: { display: 'none' } }
        }
      };

      component.onGifError(mockEvent);

      expect(mockEvent.target.style.display).toBe('none');
      expect(mockEvent.target.nextElementSibling.style.display).toBe('flex');
    });

    it('should log on GIF load success', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockEvent = {};

      component.onGifLoad(mockEvent);

      expect(consoleSpy).toHaveBeenCalledWith('GIF loaded successfully');
    });
  });

  // =========================================
  // CLEANUP TESTS
  // =========================================

  describe('Cleanup', () => {
    it('should clear all timeouts on destroy', () => {
      const article1 = createTestArticle('article1', 'Milch', false);
      const article2 = createTestArticle('article2', 'Brot', false);

      component['startPendingHide'](article1);
      component['startPendingHide'](article2);

      expect(component['undoHintTimeouts'].size).toBe(2);

      component.ngOnDestroy();

      expect(component['undoHintTimeouts'].size).toBe(0);
    });

    it('should clear celebration timeout on destroy', () => {
      component['triggerCelebrationAnimation']();
      expect(component['celebrationTimeout']).toBeDefined();

      component.ngOnDestroy();

      expect(component['celebrationTimeout']).toBeUndefined();
    });

    it('should complete observables on destroy', () => {
      const completeSpy = vi.spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(completeSpy).toHaveBeenCalled();
    });
  });
});
