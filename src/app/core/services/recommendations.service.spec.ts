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

/**
 * Builds a ListItemState with checked history.
 * checkedTimestamps should be in most-recent-first order (matching HistoryService behaviour).
 * Defaults to isChecked = true so articles pass the exclusion filter.
 */
function itemState(
  articleId: string,
  checkedTimestamps: Array<Date | object>,
  opts: { isChecked?: boolean; checkedAt?: Date; articleName?: string } = {}
): ListItemState {
  return {
    articleId,
    articleName: opts.articleName ?? articleId,
    isChecked: opts.isChecked ?? true,
    checkedAt: opts.checkedAt,
    history: checkedTimestamps.map(ts => checkedEvent(ts))
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
    });
    service = TestBed.inject(RecommendationsService);
  });

  // =========================================================================
  // getFrequentArticles — Rule A: ≥ 40% of shopping days
  // =========================================================================

  describe('getFrequentArticles', () => {

    it('returns empty array when list has no itemStates', () => {
      expect(service.getFrequentArticles(makeList([], {}), [])).toEqual([]);
    });

    it('returns empty array when no article has check history', () => {
      const list = makeList(['a1'], {
        'a1': { articleId: 'a1', isChecked: true, history: [addedEvent(daysAgo(1))] }
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toEqual([]);
    });

    it('includes article present on 100% of shopping days (1 of 1)', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      const result = service.getFrequentArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('includes article on ≥ 1/3 of shopping days (4 of 10 → 40% ≥ 33%)', () => {
      // a1 (helper) is checked on all 10 different days → creates 10 shopping days.
      // a2 (candidate) is checked on 4 of those 10 days → ratio 40% ≥ threshold (1/3) → included.
      const helperDays = Array.from({ length: 10 }, (_, i) => daysAgo(i + 1));
      const list = makeList(['a1', 'a2'], {
        'a1': itemState('a1', helperDays),
        'a2': itemState('a2', [daysAgo(1), daysAgo(2), daysAgo(3), daysAgo(4)])
      });
      const catalog = [makeArticle('a1'), makeArticle('a2')];
      const result = service.getFrequentArticles(list, catalog);
      expect(result.some(a => a.id === 'a2')).toBe(true);
    });

    it('includes article on exactly 1/3 of shopping days (2 of 6 → 33.3% ≥ threshold)', () => {
      // a1 (helper) creates 6 shopping days; a2 appears on 2 of 6 → ratio exactly 1/3 → included.
      const helperDays = Array.from({ length: 6 }, (_, i) => daysAgo(i + 1));
      const list = makeList(['a1', 'a2'], {
        'a1': itemState('a1', helperDays),
        'a2': itemState('a2', [daysAgo(1), daysAgo(2)])
      });
      const catalog = [makeArticle('a1'), makeArticle('a2')];
      const result = service.getFrequentArticles(list, catalog);
      expect(result.some(a => a.id === 'a2')).toBe(true);
    });

    it('excludes article below the 1/3 threshold (3 of 10 shopping days → 30% < 33%)', () => {
      // a2 appears on 3 of 10 days → ratio 30% < threshold (1/3 ≈ 33.3%) → excluded.
      const helperDays = Array.from({ length: 10 }, (_, i) => daysAgo(i + 1));
      const list = makeList(['a1', 'a2'], {
        'a1': itemState('a1', helperDays),
        'a2': itemState('a2', [daysAgo(1), daysAgo(2), daysAgo(3)])
      });
      const catalog = [makeArticle('a1'), makeArticle('a2')];
      const result = service.getFrequentArticles(list, catalog);
      expect(result.some(a => a.id === 'a2')).toBe(false);
    });

    it('includes article not on the list (removed from articleIds) — can be added back', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('excludes article that is on the list but not checked (isChecked = false)', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(5)], { isChecked: false })
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article that is not in the catalog', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(5)])
      });
      expect(service.getFrequentArticles(list, [])).toHaveLength(0);
    });

    it('handles { _seconds, _nanoseconds } timestamp format (NgRx-serialised Firestore Timestamp)', () => {
      const secondsAgo5Days = Math.floor(daysAgo(5).getTime() / 1000);
      const list = makeList(['a1'], {
        'a1': itemState('a1', [{ _seconds: secondsAgo5Days, _nanoseconds: 0 }])
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('handles { seconds, nanoseconds } timestamp format (alternate Firestore serialisation)', () => {
      const secondsAgo5Days = Math.floor(daysAgo(5).getTime() / 1000);
      const list = makeList(['a1'], {
        'a1': itemState('a1', [{ seconds: secondsAgo5Days, nanoseconds: 0 }])
      });
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('returns results sorted alphabetically by name', () => {
      // All three articles checked on the same day → 1 shopping day, ratio 1/1 = 100% ≥ 40%.
      const list = makeList(['a1', 'a2', 'a3'], {
        'a1': itemState('a1', [daysAgo(1)]),
        'a2': itemState('a2', [daysAgo(1)]),
        'a3': itemState('a3', [daysAgo(1)]),
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
      const day = daysAgo(3);
      const sameDay = new Date(day.getTime() + 3600_000); // +1h, still the same calendar day
      const list = makeList(['a1'], {
        'a1': itemState('a1', [sameDay, day]) // most-recent-first
      });
      // 1 shopping day, a1 on 1/1 days → 100% ≥ 40% → included
      expect(service.getFrequentArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

  });

  // =========================================================================
  // getLongNotBoughtArticles — Rule B: ≥ 3 checks, dynamic time window
  // =========================================================================

  describe('getLongNotBoughtArticles', () => {

    it('returns empty array when list has no itemStates', () => {
      expect(service.getLongNotBoughtArticles(makeList([], {}), [])).toEqual([]);
    });

    it('returns empty array when article has no history', () => {
      const list = makeList(['a1'], { 'a1': { articleId: 'a1', isChecked: true } });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('returns empty array when article has only "added" events (no checked)', () => {
      const list = makeList(['a1'], {
        'a1': { articleId: 'a1', isChecked: true, history: [addedEvent(daysAgo(10))] }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article with fewer than 2 check events (only 1 check)', () => {
      // 1 check → does not meet MIN_CHECKS_FOR_LONG_NOT_BOUGHT = 2
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(7)]) // only 1 check
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('includes article with exactly 2 check events whose days-since-last is in window', () => {
      // 2 checks: [daysAgo(7), daysAgo(14)]
      // avgInterval = (14 − 7) / 1 = 7 days
      // window = [7 × 0.8, 7 × 2] = [5.6, 14] → 7 days in window → included
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(7), daysAgo(14)])
      });
      const result = service.getLongNotBoughtArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('includes article with 3 checks whose days-since-last is in the dynamic window', () => {
      // most-recent-first: [9, 18, 27] days ago
      // avg_interval = (27 − 9) / 2 = 9 days
      // days_since_last = 9
      // window = [9 × 0.8, 9 × 2] = [7.2, 18] → 9 is in window
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)])
      });
      const result = service.getLongNotBoughtArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('excludes article when days-since-last is below the window minimum (checked too recently)', () => {
      // most-recent-first: [5, 15, 25] days ago
      // avg_interval = (25 − 5) / 2 = 10 days
      // days_since_last = 5 < 10 × 0.8 = 8 → below window → excluded
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(5), daysAgo(15), daysAgo(25)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article when days-since-last exceeds the window maximum (overdue by more than 2×)', () => {
      // most-recent-first: [25, 35, 45] days ago
      // avg_interval = (45 − 25) / 2 = 10 days
      // days_since_last = 25 > 10 × 2 = 20 → above window → excluded
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(25), daysAgo(35), daysAgo(45)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('skips article when all checks share the same timestamp (avg interval = 0)', () => {
      const sameDay = daysAgo(10);
      const list = makeList(['a1'], {
        'a1': itemState('a1', [sameDay, sameDay, sameDay]) // 3 checks, all identical
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('matches the spec example: avg 5 weeks → suggest between 4 and 10 weeks after last check', () => {
      // 3 checks spaced 5 weeks apart; last check exactly 5 weeks ago.
      // avg_interval = 35 days, days_since_last = 35
      // window = [35 × 0.8, 35 × 2] = [28, 70] → 35 is in window ✓
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(35), daysAgo(70), daysAgo(105)]) // most-recent-first
      });
      const result = service.getLongNotBoughtArticles(list, [makeArticle('a1')]);
      expect(result).toHaveLength(1);
    });

    it('correctly excludes when last check was only 3 weeks ago (below 4-week min for 5-week avg)', () => {
      // avg = 35 days, days_since = 21 < 28 → excluded
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(21), daysAgo(56), daysAgo(91)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('correctly excludes when last check was 11 weeks ago (above 10-week max for 5-week avg)', () => {
      // avg = 35 days, days_since = 77 > 70 → excluded
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(77), daysAgo(112), daysAgo(147)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('uses history[0] as last check and history[N-1] as first check for avg interval', () => {
      // history[0] = daysAgo(9) (most recent), history[2] = daysAgo(27) (oldest)
      // avg = (27 − 9) / 2 = 9 days, window = [7.2, 18] → 9 in window → included
      const list = makeList(['a1'], {
        'a1': {
          articleId: 'a1', isChecked: true,
          history: [
            checkedEvent(daysAgo(9)),   // index 0 = most recent
            checkedEvent(daysAgo(18)),
            checkedEvent(daysAgo(27))   // index 2 = oldest
          ]
        }
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('includes article not on the list (removed from articleIds) — can be added back', () => {
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('excludes article that is on the list but not checked (isChecked = false)', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)], { isChecked: false })
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(0);
    });

    it('excludes article not in catalog', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)])
      });
      expect(service.getLongNotBoughtArticles(list, [])).toHaveLength(0);
    });

    it('handles { _seconds, _nanoseconds } timestamp format', () => {
      const toSeconds = (d: Date) => Math.floor(d.getTime() / 1000);
      const list = makeList(['a1'], {
        'a1': itemState('a1', [
          { _seconds: toSeconds(daysAgo(9)),  _nanoseconds: 0 },
          { _seconds: toSeconds(daysAgo(18)), _nanoseconds: 0 },
          { _seconds: toSeconds(daysAgo(27)), _nanoseconds: 0 }
        ])
      });
      expect(service.getLongNotBoughtArticles(list, [makeArticle('a1')])).toHaveLength(1);
    });

    it('returns results sorted alphabetically', () => {
      // All three articles: avg = 9 days, days_since_last = 9 → in window [7.2, 18]
      const list = makeList(['a1', 'a2', 'a3'], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)]),
        'a2': itemState('a2', [daysAgo(9), daysAgo(18), daysAgo(27)]),
        'a3': itemState('a3', [daysAgo(9), daysAgo(18), daysAgo(27)]),
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
  // Shared edge cases
  // =========================================================================

  describe('shared edge cases', () => {

    it('article removed from list (not in articleIds) IS recommended if it has qualifying history', () => {
      // 3 checks on different days → qualifies for A (3/3 = 100% ≥ 33%) and B (avg 9d, window [7.2, 18])
      const list = makeList([], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)])
      });
      const catalog = [makeArticle('a1')];
      expect(service.getFrequentArticles(list, catalog)).toHaveLength(1);
      expect(service.getLongNotBoughtArticles(list, catalog)).toHaveLength(1);
    });

    it('article on list but unchecked is never recommended', () => {
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(9), daysAgo(18), daysAgo(27)], { isChecked: false })
      });
      const catalog = [makeArticle('a1')];
      expect(service.getFrequentArticles(list, catalog)).toHaveLength(0);
      expect(service.getLongNotBoughtArticles(list, catalog)).toHaveLength(0);
    });

  });

  // =========================================================================
  // getRecommendations — mutual exclusion
  // =========================================================================

  describe('getRecommendations', () => {

    it('article qualifying for both A and B appears only in frequentArticles', () => {
      // 5 checks on 5 different days → ratio 5/5 = 100% ≥ 33% → qualifies for A.
      // avg_interval = (80 − 16) / 4 = 16 days; days_since_last = 16
      // window = [16 × 0.8, 16 × 2] = [12.8, 32] → 16 is in window → qualifies for B.
      // getRecommendations must remove it from longNotBought.
      const list = makeList(['a1'], {
        'a1': itemState('a1', [daysAgo(16), daysAgo(20), daysAgo(40), daysAgo(60), daysAgo(80)])
      });
      const catalog = [makeArticle('a1')];

      const { frequentArticles, longNotBoughtArticles } = service.getRecommendations(list, catalog);

      expect(frequentArticles.some(a => a.id === 'a1')).toBe(true);
      expect(longNotBoughtArticles.some(a => a.id === 'a1')).toBe(false);
    });

    it('no article ever appears in both result arrays (invariant)', () => {
      // Mix of articles to exercise both algorithms simultaneously.
      const list = makeList(['a1', 'a2', 'a3'], {
        'a1': itemState('a1', [daysAgo(16), daysAgo(20), daysAgo(40), daysAgo(60), daysAgo(80)]),
        'a2': itemState('a2', [daysAgo(9), daysAgo(18), daysAgo(27)]),
        'a3': itemState('a3', [daysAgo(1)])
      });
      const catalog = [makeArticle('a1'), makeArticle('a2'), makeArticle('a3')];

      const { frequentArticles, longNotBoughtArticles } = service.getRecommendations(list, catalog);

      const frequentIds = new Set(frequentArticles.map(a => a.id));
      for (const a of longNotBoughtArticles) {
        expect(frequentIds.has(a.id)).toBe(false);
      }
    });

    it('returns empty arrays when articles have no check history', () => {
      // Without check history, neither rule A nor B can be satisfied — isChecked is irrelevant here.
      const list = makeList(['a1'], {
        'a1': { articleId: 'a1', isChecked: false }
      });
      const { frequentArticles, longNotBoughtArticles } =
        service.getRecommendations(list, [makeArticle('a1')]);
      expect(frequentArticles).toHaveLength(0);
      expect(longNotBoughtArticles).toHaveLength(0);
    });

  });

});
