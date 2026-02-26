import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RecommendationsService } from './recommendations.service';
import { Article, ShoppingList, ListItemState, CheckEvent } from '../models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a Date that is `days` days in the past. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Returns a Date that is `minutes` minutes in the past. */
function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

/** Builds a minimal CheckEvent. */
function checkedEvent(timestamp: Date | object): CheckEvent {
  return { action: 'checked', timestamp: timestamp as Date, userId: 'u1', userName: 'Test' };
}

function addedEvent(timestamp: Date): CheckEvent {
  return { action: 'added', timestamp, userId: 'u1', userName: 'Test' };
}

/** Builds a minimal Article. */
function makeArticle(id: string, name = id): Article {
  return {
    id, name,
    createdAt: new Date(), updatedAt: new Date(),
    ownerId: 'u1'
  };
}

/** Builds a ListItemState with checked history. */
function itemState(
  articleId: string,
  checkedTimestamps: Array<Date | object>,
  opts: { isChecked?: boolean; checkedAt?: Date; articleName?: string } = {}
): ListItemState {
  return {
    articleId,
    articleName: opts.articleName ?? articleId,
    isChecked: opts.isChecked ?? false,
    checkedAt: opts.checkedAt,
    // history is most-recent-first (matching HistoryService behaviour)
    history: checkedTimestamps.map(ts => checkedEvent(ts)).reverse().reverse()
  };
}

/** Builds a minimal ShoppingList. */
function makeList(
  articleIds: string[],
  states: Record<string, ListItemState>
): ShoppingList {
  return {
    id: 'list1', name: 'Test List', color: '#fff',
    articleIds,
    itemStates: states,
    createdAt: new Date(), updatedAt: new Date(),
    ownerId: 'u1'
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RecommendationsService]
      // LoggerService is providedIn: 'root' — auto-provided, no mock needed
    });
    service = TestBed.inject(RecommendationsService);
  });

  // =========================================================================
  // getFrequentArticles
  // =========================================================================

  describe('getFrequentArticles', () => {

    it('returns empty array when list has no itemStates', () => {
      const list = makeList([], {});
      expect(service.getFrequentArticles(list, [])).toEqual([]);
    });

    it('returns empty array when no article has check history', () => {
      const list = makeList(['a1'], {
        'a1': { articleId: 'a1', isChecked: false, history: [addedEvent(daysAgo(1))] }
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toEqual([]);
    });

    it('returns article that passes frequency ratio (present on 1 of 1 shopping day)', () => {
      // 1 shopping day (test threshold: ≥1 article/day). "a1" was on that day.
      // ratio = 1/1 = 100% ≥ 10% threshold → should appear.
      const list = makeList([], {   // a1 not in articleIds (was removed from list)
        'a1': itemState('a1', [daysAgo(5)])
      });
      const result = service.getFrequentArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('excludes article that is currently on the list (in articleIds)', () => {
      const list = makeList(['a1'], {  // a1 IS on the list
        'a1': itemState('a1', [daysAgo(5)])
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article that is not in the catalog', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      // Pass an empty catalog — a1 not present
      expect(service.getFrequentArticles(list, [])).toHaveLength(0);
    });

    it('excludes article checked within the last 60 minutes', () => {
      const recentCheck = minutesAgo(30);
      const list = makeList([], {
        'a1': {
          articleId: 'a1', isChecked: true,
          checkedAt: recentCheck,
          history: [checkedEvent(recentCheck)]
        }
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('includes article checked more than 60 minutes ago even if isChecked=true', () => {
      const oldCheck = minutesAgo(90);
      const list = makeList([], {
        'a1': {
          articleId: 'a1', isChecked: true,
          checkedAt: oldCheck,
          history: [checkedEvent(oldCheck)]
        }
      });
      const result = service.getFrequentArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
    });

    it('handles { _seconds, _nanoseconds } timestamp format (NgRx-serialised Firestore Timestamp)', () => {
      const secondsAgo5Days = Math.floor(daysAgo(5).getTime() / 1000);
      const firestoreTimestamp = { _seconds: secondsAgo5Days, _nanoseconds: 0 };

      const list = makeList([], {
        'a1': itemState('a1', [firestoreTimestamp])
      });
      // Should not throw and should produce a valid result
      const result = service.getFrequentArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
    });

    it('handles { seconds, nanoseconds } timestamp format (alternate Firestore serialisation)', () => {
      const secondsAgo5Days = Math.floor(daysAgo(5).getTime() / 1000);
      const firestoreTimestamp = { seconds: secondsAgo5Days, nanoseconds: 0 };

      const list = makeList([], {
        'a1': itemState('a1', [firestoreTimestamp])
      });
      const result = service.getFrequentArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
    });

    it('returns results sorted alphabetically by name', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(1)]),
        'a2': itemState('a2', [daysAgo(2)]),
        'a3': itemState('a3', [daysAgo(3)]),
      });
      const catalog = [
        makeArticle('a1', 'Zwiebeln'),
        makeArticle('a2', 'Apfel'),
        makeArticle('a3', 'Milch'),
      ];
      const result = service.getFrequentArticles(list, catalog);
      expect(result.map(a => a.name)).toEqual(['Apfel', 'Milch', 'Zwiebeln']);
    });

    it('counts multiple checks on the same calendar day as one shopping day', () => {
      // Two checks on the same day for a1 → still only 1 shopping day for a1
      const day = daysAgo(3);
      const daySlightlyLater = new Date(day.getTime() + 3600_000); // +1h, same day
      const list = makeList([], {
        'a1': itemState('a1', [day, daySlightlyLater])
      });
      // 1 shopping day, a1 present on 1/1 days → included
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

  });

  // =========================================================================
  // getLongNotBoughtArticles
  // =========================================================================

  describe('getLongNotBoughtArticles', () => {

    it('returns empty array when list has no itemStates', () => {
      expect(service.getLongNotBoughtArticles(makeList([], {}), [])).toEqual([]);
    });

    it('returns empty array when article has no history', () => {
      const list = makeList([], {
        'a1': { articleId: 'a1', isChecked: false }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('returns empty array when article has only "added" events (no checked)', () => {
      const list = makeList([], {
        'a1': { articleId: 'a1', isChecked: false, history: [addedEvent(daysAgo(10))] }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('includes article with 1 check last bought within the 0–365 day window (test thresholds)', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(30)])
      });
      const result = service.getLongNotBoughtArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('excludes article last bought more than 365 days ago (outside test window)', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(400)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article that is currently on the list', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(20)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article not in catalog', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(20)])
      });
      expect(service.getLongNotBoughtArticles(list, [])).toHaveLength(0);
    });

    it('excludes article checked within the last 60 minutes', () => {
      const recentCheck = minutesAgo(10);
      const list = makeList([], {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: recentCheck,
                history: [checkedEvent(recentCheck)] }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('handles { _seconds, _nanoseconds } timestamp format', () => {
      const secondsAgo20Days = Math.floor(daysAgo(20).getTime() / 1000);
      const list = makeList([], {
        'a1': itemState('a1', [{ _seconds: secondsAgo20Days, _nanoseconds: 0 }])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('uses the most recent checked event (history[0]) for day calculation', () => {
      // Two checks: 400 days ago and 20 days ago.
      // Most recent (index 0 in history) is 20 days ago → within 0–365 window → included.
      // history is stored most-recent-first per HistoryService convention.
      const list = makeList([], {
        'a1': {
          articleId: 'a1', isChecked: false,
          history: [
            checkedEvent(daysAgo(20)),  // index 0 = most recent
            checkedEvent(daysAgo(400))  // index 1 = older
          ]
        }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('returns results sorted alphabetically', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(10)]),
        'a2': itemState('a2', [daysAgo(20)]),
        'a3': itemState('a3', [daysAgo(30)]),
      });
      const catalog = [
        makeArticle('a1', 'Zucker'),
        makeArticle('a2', 'Banane'),
        makeArticle('a3', 'Milch'),
      ];
      const result = service.getLongNotBoughtArticles(list, catalog);
      expect(result.map(a => a.name)).toEqual(['Banane', 'Milch', 'Zucker']);
    });

  });

  // =========================================================================
  // Edge cases shared between both algorithms
  // =========================================================================

  describe('shared edge cases', () => {

    it('article in itemStates but not in articleIds is eligible (was removed from list)', () => {
      // Simulates: article added → checked → removed from list.
      // articleIds is empty, itemStates still has the entry with history.
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      const catalog = [makeArticle('a1')];

      // Both algorithms should find it eligible
      expect(service.getFrequentArticles(list, catalog)).toHaveLength(1);
      expect(service.getLongNotBoughtArticles(list, catalog)).toHaveLength(1);
    });

    it('article appearing in both algorithms does not cause duplicates in either result', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      const catalog = [makeArticle('a1')];

      const freq = service.getFrequentArticles(list, catalog);
      const long = service.getLongNotBoughtArticles(list, catalog);

      // Each list has exactly 1 entry — deduplication within a list is implicit
      // (set-based candidate collection prevents duplicates)
      expect(freq).toHaveLength(1);
      expect(long).toHaveLength(1);
    });

  });

});
