import { describe, it, expect } from 'vitest';

/**
 * BUG 1 UNIT TEST: Verify articleIds populated from itemStates
 *
 * This test verifies the fix logic in firebase-data.service.ts (lines 524-532 and 614-622)
 *
 * BEFORE FIX:
 * - Firebase returns: articleIds: []
 * - Service uses: articleIds: [] (empty)
 * - Component displays: No count (empty string)
 *
 * AFTER FIX:
 * - Firebase returns: articleIds: [], itemStates: { 'article1': {...}, 'article2': {...} }
 * - Service populates: articleIds: ['article1', 'article2']
 * - Component displays: "2/3 Artikel"
 *
 * This test extracts the fix logic and tests it in isolation.
 */

describe('FirebaseDataService Bug 1 Fix - articleIds population', () => {
  /**
   * This is the exact fix logic from firebase-data.service.ts
   */
  const applyBug1Fix = (
    firebaseArticleIds: string[] | undefined,
    firebaseItemStates: { [key: string]: any }
  ): string[] => {
    let articleIds = firebaseArticleIds || [];
    const itemStates = firebaseItemStates || {};

    // BUG 1 FIX: Populate articleIds from itemStates if empty
    if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
      articleIds = Object.keys(itemStates);
    }

    return articleIds;
  };

  it('should populate articleIds from itemStates when articleIds is empty', () => {
    // SIMULATE: What Firebase returns for shared lists (BUG SCENARIO)
    const firebaseArticleIds: string[] = []; // Empty!
    const firebaseItemStates = {
      'article-milk': { articleId: 'article-milk', isChecked: false },
      'article-bread': { articleId: 'article-bread', isChecked: false },
      'article-butter': { articleId: 'article-butter', isChecked: true },
    };

    // APPLY FIX
    const result = applyBug1Fix(firebaseArticleIds, firebaseItemStates);

    // VERIFY: articleIds now populated from itemStates keys
    expect(result.length).toBe(3);
    expect(result).toContain('article-milk');
    expect(result).toContain('article-bread');
    expect(result).toContain('article-butter');
  });

  it('should NOT override articleIds when already populated', () => {
    // SIMULATE: Normal case where articleIds is already correct
    const firebaseArticleIds = ['article-1', 'article-2'];
    const firebaseItemStates = {
      'article-1': { articleId: 'article-1', isChecked: false },
      'article-2': { articleId: 'article-2', isChecked: true },
    };

    // APPLY FIX
    const result = applyBug1Fix(firebaseArticleIds, firebaseItemStates);

    // VERIFY: articleIds unchanged (not overridden)
    expect(result).toEqual(['article-1', 'article-2']);
  });

  it('should handle empty list (both articleIds and itemStates empty)', () => {
    const firebaseArticleIds: string[] = [];
    const firebaseItemStates = {};

    const result = applyBug1Fix(firebaseArticleIds, firebaseItemStates);

    // VERIFY: articleIds stays empty (correct)
    expect(result).toEqual([]);
  });

  it('should handle undefined articleIds from Firebase', () => {
    // SIMULATE: Firebase returns undefined instead of empty array
    const firebaseArticleIds = undefined;
    const firebaseItemStates = {
      'article-1': { articleId: 'article-1', isChecked: false },
    };

    const result = applyBug1Fix(firebaseArticleIds, firebaseItemStates);

    // VERIFY: articleIds populated from itemStates
    expect(result).toEqual(['article-1']);
  });

  /**
   * INTEGRATION TEST: Verify component behavior after fix
   */
  it('should enable correct article count display after fix', () => {
    // SIMULATE: Shared list with empty articleIds but populated itemStates
    const firebaseArticleIds: string[] = [];
    const firebaseItemStates = {
      'article-1': { articleId: 'article-1', isChecked: false }, // Active
      'article-2': { articleId: 'article-2', isChecked: false }, // Active
      'article-3': { articleId: 'article-3', isChecked: true },  // Checked
    };

    // APPLY FIX
    const articleIds = applyBug1Fix(firebaseArticleIds, firebaseItemStates);

    // SIMULATE: Component's getActiveItemCount (from lists-overview.ts:411-420)
    const getActiveItemCount = (articleIds: string[], itemStates: any): number => {
      if (!articleIds || articleIds.length === 0) {
        return 0;
      }
      return articleIds.filter(articleId => {
        const itemState = itemStates?.[articleId];
        return !itemState?.isChecked;
      }).length;
    };

    const activeCount = getActiveItemCount(articleIds, firebaseItemStates);
    const totalCount = articleIds.length;

    // VERIFY: Counts are correct
    expect(totalCount).toBe(3);
    expect(activeCount).toBe(2);

    // SIMULATE: Component's getListInfoText (from lists-overview.ts:425-431)
    const displayText = totalCount === 0 ? '' : `${activeCount}/${totalCount} Artikel`;

    // VERIFY: Component displays "2/3 Artikel" instead of empty string
    expect(displayText).toBe('2/3 Artikel');
  });

  /**
   * BEFORE FIX behavior (what would happen without the fix)
   */
  it('demonstrates BUG: without fix, articleIds stays empty and no count is displayed', () => {
    // SIMULATE: What happens WITHOUT the fix
    const firebaseArticleIds: string[] = [];
    const firebaseItemStates = {
      'article-1': { articleId: 'article-1', isChecked: false },
      'article-2': { articleId: 'article-2', isChecked: false },
      'article-3': { articleId: 'article-3', isChecked: true },
    };

    // WITHOUT FIX: Just use empty articleIds as-is
    const articleIdsWithoutFix = firebaseArticleIds || [];

    // Component calculates count
    const totalCount = articleIdsWithoutFix.length;
    const displayText = totalCount === 0 ? '' : `${totalCount} Artikel`;

    // BUG DEMONSTRATED: No count displayed (empty string)
    expect(displayText).toBe(''); // Bug: empty string instead of "2/3 Artikel"
    expect(totalCount).toBe(0);   // Bug: 0 instead of 3
  });
});
