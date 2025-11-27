import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';
import { HistoryService } from './history.service';
import { CheckEvent, ListItemState, ShoppingList } from '../models';

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HistoryService,
        provideStore({})
      ]
    });

    service = TestBed.inject(HistoryService);
  });

  // =========================================
  // CREATE CHECK EVENT TESTS
  // =========================================

  describe('createCheckEvent', () => {
    it('should create check event with default user', () => {
      const event = service.createCheckEvent('checked', '2L');

      expect(event.action).toBe('checked');
      expect(event.amount).toBe('2L');
      expect(event.userId).toBe('shared-shoplisl-user');
      expect(event.userName).toBe('Du');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should create uncheck event', () => {
      const event = service.createCheckEvent('unchecked', '1kg');

      expect(event.action).toBe('unchecked');
      expect(event.amount).toBe('1kg');
    });

    it('should create event with custom user', () => {
      const event = service.createCheckEvent('checked', '3x', 'user-123', 'John');

      expect(event.userId).toBe('user-123');
      expect(event.userName).toBe('John');
    });

    it('should create event without amount', () => {
      const event = service.createCheckEvent('checked');

      expect(event.amount).toBeUndefined();
    });

    it('should set timestamp to current time', () => {
      const before = new Date();
      const event = service.createCheckEvent('checked');
      const after = new Date();

      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // =========================================
  // ADD EVENT TO HISTORY TESTS
  // =========================================

  describe('addEventToHistory', () => {
    it('should add event to empty history', () => {
      const event = service.createCheckEvent('checked', '2L');
      const history = service.addEventToHistory(undefined, event);

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(event);
    });

    it('should add event at the beginning (most recent first)', () => {
      const event1 = service.createCheckEvent('checked', '1L');
      const event2 = service.createCheckEvent('unchecked', '2L');

      let history = service.addEventToHistory(undefined, event1);
      history = service.addEventToHistory(history, event2);

      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(event2); // Most recent first
      expect(history[1]).toEqual(event1);
    });

    it('should cleanup old events when adding new event', () => {
      // Create an old event (400 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);
      const oldEvent: CheckEvent = {
        timestamp: oldDate,
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked',
        amount: '1L'
      };

      const newEvent = service.createCheckEvent('unchecked', '2L');
      const history = service.addEventToHistory([oldEvent], newEvent);

      // Old event should be removed (>365 days)
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(newEvent);
    });
  });

  // =========================================
  // CLEANUP OLD HISTORY TESTS
  // =========================================

  describe('cleanupOldHistory', () => {
    it('should remove events older than 365 days', () => {
      const recentDate = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);

      const recentEvent: CheckEvent = {
        timestamp: recentDate,
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      };

      const oldEvent: CheckEvent = {
        timestamp: oldDate,
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      };

      const history = [recentEvent, oldEvent];
      const cleaned = service.cleanupOldHistory(history);

      expect(cleaned).toHaveLength(1);
      expect(cleaned[0]).toEqual(recentEvent);
    });

    it('should keep all events within 365 days', () => {
      const dates = [100, 200, 300].map(daysAgo => {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        return date;
      });

      const history: CheckEvent[] = dates.map(date => ({
        timestamp: date,
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      }));

      const cleaned = service.cleanupOldHistory(history);

      expect(cleaned).toHaveLength(3); // All within 365 days
    });

    it('should handle empty history', () => {
      const cleaned = service.cleanupOldHistory([]);
      expect(cleaned).toHaveLength(0);
    });

    it('should handle date objects and timestamps', () => {
      const recentEvent: CheckEvent = {
        timestamp: new Date(),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      };

      const cleaned = service.cleanupOldHistory([recentEvent]);
      expect(cleaned).toHaveLength(1);
    });
  });

  // =========================================
  // GET COMPLETED ARTICLES TESTS
  // =========================================

  describe('getCompletedArticleIds', () => {
    it('should return checked article IDs', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: ['a1', 'a2', 'a3'],
        itemStates: {
          'a1': { articleId: 'a1', isChecked: true, amount: '1L' },
          'a2': { articleId: 'a2', isChecked: false, amount: '2L' },
          'a3': { articleId: 'a3', isChecked: true, amount: '3L' }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const completed = service.getCompletedArticleIds(list);

      expect(completed).toHaveLength(2);
      expect(completed).toContain('a1');
      expect(completed).toContain('a3');
      expect(completed).not.toContain('a2');
    });

    it('should handle empty itemStates', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: [],
        itemStates: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const completed = service.getCompletedArticleIds(list);
      expect(completed).toHaveLength(0);
    });
  });

  // =========================================
  // GET ARTICLE HISTORY TESTS
  // =========================================

  describe('getArticleHistory', () => {
    it('should return history for article', () => {
      const history: CheckEvent[] = [
        {
          timestamp: new Date(),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        }
      ];

      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: ['a1'],
        itemStates: {
          'a1': {
            articleId: 'a1',
            isChecked: true,
            amount: '1L',
            history
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const articleHistory = service.getArticleHistory(list, 'a1');

      expect(articleHistory).toEqual(history);
    });

    it('should return empty array if no history', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: ['a1'],
        itemStates: {
          'a1': { articleId: 'a1', isChecked: false, amount: '1L' }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const history = service.getArticleHistory(list, 'a1');
      expect(history).toEqual([]);
    });

    it('should return empty array for non-existent article', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: [],
        itemStates: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const history = service.getArticleHistory(list, 'nonexistent');
      expect(history).toEqual([]);
    });
  });

  // =========================================
  // GET LAST CHECK EVENT TESTS
  // =========================================

  describe('getLastCheckEvent', () => {
    it('should return most recent event', () => {
      const event1: CheckEvent = {
        timestamp: new Date('2025-01-01'),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      };

      const event2: CheckEvent = {
        timestamp: new Date('2025-01-02'),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'unchecked'
      };

      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: ['a1'],
        itemStates: {
          'a1': {
            articleId: 'a1',
            isChecked: false,
            amount: '1L',
            history: [event2, event1] // Most recent first
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const lastEvent = service.getLastCheckEvent(list, 'a1');

      expect(lastEvent).toEqual(event2);
    });

    it('should return undefined if no history', () => {
      const list: ShoppingList = {
        id: 'list1',
        name: 'Test List',
        articleIds: ['a1'],
        itemStates: {
          'a1': { articleId: 'a1', isChecked: false, amount: '1L' }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const lastEvent = service.getLastCheckEvent(list, 'a1');
      expect(lastEvent).toBeUndefined();
    });
  });

  // =========================================
  // COUNT CHECKS/UNCHECKS TESTS
  // =========================================

  describe('countChecks and countUnchecks', () => {
    const history: CheckEvent[] = [
      {
        timestamp: new Date(),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      },
      {
        timestamp: new Date(),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'unchecked'
      },
      {
        timestamp: new Date(),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      },
      {
        timestamp: new Date(),
        userId: 'shared-shoplisl-user',
        userName: 'Du',
        action: 'checked'
      }
    ];

    it('should count checks correctly', () => {
      const count = service.countChecks(history);
      expect(count).toBe(3);
    });

    it('should count unchecks correctly', () => {
      const count = service.countUnchecks(history);
      expect(count).toBe(1);
    });

    it('should handle empty history', () => {
      expect(service.countChecks([])).toBe(0);
      expect(service.countUnchecks([])).toBe(0);
    });
  });

  // =========================================
  // GET LAST CHECK DATE TESTS
  // =========================================

  describe('getLastCheckDate', () => {
    it('should return date of most recent check', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-01-02');

      const history: CheckEvent[] = [
        {
          timestamp: date2,
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        },
        {
          timestamp: date1,
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'unchecked'
        }
      ];

      const lastCheckDate = service.getLastCheckDate(history);

      expect(lastCheckDate).toEqual(date2);
    });

    it('should return undefined if no checks', () => {
      const history: CheckEvent[] = [
        {
          timestamp: new Date(),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'unchecked'
        }
      ];

      const lastCheckDate = service.getLastCheckDate(history);
      expect(lastCheckDate).toBeUndefined();
    });

    it('should return undefined for empty history', () => {
      const lastCheckDate = service.getLastCheckDate([]);
      expect(lastCheckDate).toBeUndefined();
    });
  });

  // =========================================
  // NEEDS CLEANUP TESTS
  // =========================================

  describe('needsCleanup', () => {
    it('should return true if history has old events', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);

      const history: CheckEvent[] = [
        {
          timestamp: oldDate,
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        }
      ];

      expect(service.needsCleanup(history)).toBe(true);
    });

    it('should return false if all events are recent', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 100);

      const history: CheckEvent[] = [
        {
          timestamp: recentDate,
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        }
      ];

      expect(service.needsCleanup(history)).toBe(false);
    });

    it('should return false for empty history', () => {
      expect(service.needsCleanup([])).toBe(false);
    });
  });

  // =========================================
  // CREATE UPDATED ITEM STATE TESTS
  // =========================================

  describe('createUpdatedItemState', () => {
    it('should create state for check action', () => {
      const state = service.createUpdatedItemState(
        undefined,
        'article1',
        'checked',
        '2L'
      );

      expect(state.articleId).toBe('article1');
      expect(state.isChecked).toBe(true);
      expect(state.amount).toBe('2L');
      expect(state.checkedBy).toBe('shared-shoplisl-user');
      expect(state.checkedAt).toBeInstanceOf(Date);
      expect(state.history).toHaveLength(1);
      expect(state.history?.[0].action).toBe('checked');
    });

    it('should create state for uncheck action', () => {
      const currentState: ListItemState = {
        articleId: 'article1',
        isChecked: true,
        amount: '1L',
        checkedAt: new Date('2025-01-01'),
        history: []
      };

      const state = service.createUpdatedItemState(
        currentState,
        'article1',
        'unchecked',
        '1L'
      );

      expect(state.isChecked).toBe(false);
      expect(state.checkedAt).toEqual(new Date('2025-01-01')); // Preserved
      expect(state.history).toHaveLength(1);
      expect(state.history?.[0].action).toBe('unchecked');
    });

    it('should append to existing history', () => {
      const currentState: ListItemState = {
        articleId: 'article1',
        isChecked: false,
        amount: '1L',
        history: [
          {
            timestamp: new Date('2025-01-01'),
            userId: 'shared-shoplisl-user',
            userName: 'Du',
            action: 'checked'
          }
        ]
      };

      const state = service.createUpdatedItemState(
        currentState,
        'article1',
        'checked',
        '2L'
      );

      expect(state.history).toHaveLength(2);
      expect(state.history?.[0].action).toBe('checked'); // New event first
      expect(state.history?.[1].action).toBe('checked'); // Old event
    });
  });

  // =========================================
  // CALCULATE STATISTICS TESTS
  // =========================================

  describe('calculateStatistics', () => {
    it('should calculate stats correctly', () => {
      const history: CheckEvent[] = [
        {
          timestamp: new Date('2025-01-03'),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'unchecked'
        },
        {
          timestamp: new Date('2025-01-02'),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        },
        {
          timestamp: new Date('2025-01-01'),
          userId: 'shared-shoplisl-user',
          userName: 'Du',
          action: 'checked'
        }
      ];

      const stats = service.calculateStatistics(history);

      expect(stats.totalChecks).toBe(2);
      expect(stats.totalUnchecks).toBe(1);
      expect(stats.lastCheckDate).toEqual(new Date('2025-01-02'));
      expect(stats.lastUncheckDate).toEqual(new Date('2025-01-03'));
    });

    it('should handle empty history', () => {
      const stats = service.calculateStatistics([]);

      expect(stats.totalChecks).toBe(0);
      expect(stats.totalUnchecks).toBe(0);
      expect(stats.lastCheckDate).toBeUndefined();
      expect(stats.lastUncheckDate).toBeUndefined();
    });
  });

  // =========================================
  // FORMAT DATE TESTS
  // =========================================

  describe('formatDate', () => {
    it('should format date as DD.MM.YYYY', () => {
      const date = new Date('2025-11-23');
      const formatted = service.formatDate(date);

      expect(formatted).toBe('23.11.2025');
    });

    it('should pad single digits', () => {
      const date = new Date('2025-01-05');
      const formatted = service.formatDate(date);

      expect(formatted).toBe('05.01.2025');
    });

    it('should return empty string for undefined', () => {
      const formatted = service.formatDate(undefined);
      expect(formatted).toBe('');
    });
  });

  describe('formatDateWithPrefix', () => {
    it('should format with prefix', () => {
      const date = new Date('2025-11-23');
      const formatted = service.formatDateWithPrefix(date, '-');

      expect(formatted).toBe('-23.11.2025');
    });

    it('should return empty string for undefined', () => {
      const formatted = service.formatDateWithPrefix(undefined, '+');
      expect(formatted).toBe('');
    });
  });
});
