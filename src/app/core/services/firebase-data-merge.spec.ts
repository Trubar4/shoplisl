/**
 * Comprehensive tests for merge operations in FirebaseDataService
 *
 * These tests verify the critical data preservation logic that prevents data loss
 * during real-time synchronization and migration scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for mergeArticleIds logic
 *
 * This function is critical for preventing data loss during migration.
 * It must preserve articleIds when itemStates is empty or partially filled.
 */
describe('FirebaseDataService - mergeArticleIds', () => {

  /**
   * Helper function that simulates the mergeArticleIds logic
   * Extracted from firebase-data.service.ts for testing
   */
  function mergeArticleIds(
    localIds: string[],
    serverIds: string[],
    mergedItemStates: { [articleId: string]: any }
  ): string[] {
    const itemStatesCount = Object.keys(mergedItemStates).length;
    const maxArticleIdsCount = Math.max(serverIds.length, localIds.length);

    // CRITICAL FIX: Detect migration/partial state
    const isMigrationState = maxArticleIdsCount > itemStatesCount;

    if (isMigrationState) {
      // Migration mode: Preserve all articleIds via union
      const serverSet = new Set(serverIds);
      const merged = [...serverIds]; // Start with server order

      // Add local IDs that aren't in server yet
      for (const localId of localIds) {
        if (!serverSet.has(localId)) {
          merged.push(localId);
        }
      }

      return merged;
    }

    // Normal mode: Use itemStates as source of truth
    const articlesFromItemStates = new Set(Object.keys(mergedItemStates));
    const merged: string[] = [];

    for (const serverId of serverIds) {
      if (articlesFromItemStates.has(serverId)) {
        merged.push(serverId);
        articlesFromItemStates.delete(serverId);
      }
    }

    for (const localId of localIds) {
      if (articlesFromItemStates.has(localId)) {
        merged.push(localId);
        articlesFromItemStates.delete(localId);
      }
    }

    for (const remainingId of articlesFromItemStates) {
      merged.push(remainingId);
    }

    return merged;
  }

  describe('Migration State Detection', () => {
    it('should detect initial migration state (empty itemStates)', () => {
      const localIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const serverIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const mergedItemStates = {}; // Empty!

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should preserve all 6 articleIds
      expect(result).toHaveLength(6);
      expect(result).toEqual(serverIds);
    });

    it('should detect partial migration state (some itemStates)', () => {
      const localIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const serverIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const mergedItemStates = {
        'a1': { articleId: 'a1', isChecked: true }
      }; // Only 1 article has state

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should preserve all 6 articleIds, not just the 1 with state
      expect(result).toHaveLength(6);
      expect(result).toEqual(serverIds);
    });

    it('should detect partial migration with multiple articles checked', () => {
      const localIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const serverIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const mergedItemStates = {
        'a1': { articleId: 'a1', isChecked: true },
        'a2': { articleId: 'a2', isChecked: true },
        'a3': { articleId: 'a3', isChecked: false }
      }; // 3 articles have state, 3 don't

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should preserve all 6 articleIds
      expect(result).toHaveLength(6);
      expect(result).toEqual(serverIds);
    });
  });

  describe('Normal Operation Mode', () => {
    it('should use itemStates as source of truth when counts match', () => {
      const localIds = ['a1', 'a2', 'a3'];
      const serverIds = ['a1', 'a2', 'a3'];
      const mergedItemStates = {
        'a1': { articleId: 'a1', isChecked: false },
        'a2': { articleId: 'a2', isChecked: true },
        'a3': { articleId: 'a3', isChecked: false }
      }; // All articles have state

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      expect(result).toHaveLength(3);
      expect(result).toEqual(['a1', 'a2', 'a3']);
    });

    it('should remove deleted articles when counts match', () => {
      const localIds = ['a1', 'a2']; // Article a3 removed locally
      const serverIds = ['a1', 'a2', 'a3'];
      const mergedItemStates = {
        'a1': { articleId: 'a1', isChecked: false },
        'a2': { articleId: 'a2', isChecked: true }
        // a3 not in itemStates (deleted)
      };

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should only include articles with itemStates
      expect(result).toHaveLength(2);
      expect(result).toEqual(['a1', 'a2']);
      expect(result).not.toContain('a3');
    });
  });

  describe('Merge Order Preservation', () => {
    it('should preserve server order in migration mode', () => {
      const localIds = ['a3', 'a1', 'a2']; // Different order
      const serverIds = ['a1', 'a2', 'a3']; // Server order
      const mergedItemStates = {}; // Migration state

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should use server order
      expect(result).toEqual(['a1', 'a2', 'a3']);
    });

    it('should add local-only articles at the end', () => {
      const localIds = ['a1', 'a2', 'a3', 'a4']; // a4 is local-only
      const serverIds = ['a1', 'a2', 'a3'];
      const mergedItemStates = {}; // Migration state

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      expect(result).toHaveLength(4);
      expect(result).toEqual(['a1', 'a2', 'a3', 'a4']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays', () => {
      const localIds: string[] = [];
      const serverIds: string[] = [];
      const mergedItemStates = {};

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('should handle server-only articles in migration', () => {
      const localIds: string[] = [];
      const serverIds = ['a1', 'a2', 'a3'];
      const mergedItemStates = {};

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      expect(result).toHaveLength(3);
      expect(result).toEqual(serverIds);
    });

    it('should handle local-only articles in migration', () => {
      const localIds = ['a1', 'a2', 'a3'];
      const serverIds: string[] = [];
      const mergedItemStates = {};

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      expect(result).toHaveLength(3);
      expect(result).toEqual(localIds);
    });

    it('should handle orphaned itemStates (articles in itemStates but not in IDs)', () => {
      const localIds = ['a1', 'a2'];
      const serverIds = ['a1', 'a2'];
      const mergedItemStates = {
        'a1': { articleId: 'a1', isChecked: false },
        'a2': { articleId: 'a2', isChecked: true },
        'a3': { articleId: 'a3', isChecked: false } // Orphaned!
      };

      const result = mergeArticleIds(localIds, serverIds, mergedItemStates);

      // Should include orphaned article from itemStates
      expect(result).toHaveLength(3);
      expect(result).toContain('a1');
      expect(result).toContain('a2');
      expect(result).toContain('a3');
    });
  });

  describe('Real-World Scenario: The Bug We Fixed', () => {
    it('should NOT delete articles when user checks first article after migration', () => {
      // Initial state after migration: 6 articleIds, 0 itemStates
      const initialServerIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const initialLocalIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
      const initialItemStates = {};

      // First merge - should preserve all
      const firstMerge = mergeArticleIds(initialLocalIds, initialServerIds, initialItemStates);
      expect(firstMerge).toHaveLength(6);

      // User checks first article - now we have 1 itemState
      const afterCheckServerIds = firstMerge; // Server now has 6
      const afterCheckLocalIds = firstMerge; // Local has 6
      const afterCheckItemStates = {
        'a1': { articleId: 'a1', isChecked: true }
      };

      // Second merge - CRITICAL: should still preserve all 6!
      const secondMerge = mergeArticleIds(afterCheckLocalIds, afterCheckServerIds, afterCheckItemStates);

      // This is the bug we fixed - before fix, this would be 1
      expect(secondMerge).toHaveLength(6);
      expect(secondMerge).toEqual(afterCheckServerIds);
    });
  });
});

/**
 * Tests for mergeItemStates logic
 *
 * This function merges item states from local and server based on timestamps.
 * It must preserve all items from both sources and resolve conflicts correctly.
 */
describe('FirebaseDataService - mergeItemStates', () => {

  /**
   * Helper function that simulates the mergeItemStates logic
   */
  function mergeItemStates(
    localStates: { [articleId: string]: any },
    serverStates: { [articleId: string]: any }
  ): { [articleId: string]: any } {
    const merged: { [articleId: string]: any } = {};

    // Collect all article IDs from both sources
    const allArticleIds = new Set([
      ...Object.keys(localStates),
      ...Object.keys(serverStates)
    ]);

    const getTimestamp = (state: any): number => {
      if (state.history && Array.isArray(state.history) && state.history.length > 0) {
        const latestEvent = state.history[0];
        const timestamp = latestEvent.timestamp;

        if (timestamp instanceof Date) {
          return timestamp.getTime();
        } else if (typeof timestamp === 'number') {
          return timestamp;
        }
      }

      const checkedTime = state.checkedAt instanceof Date ? state.checkedAt.getTime() : 0;
      const addedTime = state.addedAt instanceof Date ? state.addedAt.getTime() : 0;

      return checkedTime || addedTime || 0;
    };

    for (const articleId of allArticleIds) {
      const localState = localStates[articleId];
      const serverState = serverStates[articleId];

      // If only in local, keep local
      if (localState && !serverState) {
        merged[articleId] = localState;
        continue;
      }

      // If only in server, use server
      if (serverState && !localState) {
        merged[articleId] = serverState;
        continue;
      }

      // Both exist - merge based on timestamps
      const localTime = getTimestamp(localState);
      const serverTime = getTimestamp(serverState);

      if (serverTime > localTime) {
        merged[articleId] = serverState;
      } else if (localTime > serverTime) {
        merged[articleId] = localState;
      } else {
        // Times equal - prefer server
        merged[articleId] = serverState;
      }
    }

    return merged;
  }

  describe('Union of Articles', () => {
    it('should preserve local-only articles', () => {
      const localStates = {
        'a1': { articleId: 'a1', isChecked: false, addedAt: new Date('2024-01-01') }
      };
      const serverStates = {};

      const result = mergeItemStates(localStates, serverStates);

      expect(result).toHaveProperty('a1');
      expect(result['a1']).toEqual(localStates['a1']);
    });

    it('should preserve server-only articles', () => {
      const localStates = {};
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: new Date('2024-01-01') }
      };

      const result = mergeItemStates(localStates, serverStates);

      expect(result).toHaveProperty('a1');
      expect(result['a1']).toEqual(serverStates['a1']);
    });

    it('should preserve all articles from both sources', () => {
      const localStates = {
        'a1': { articleId: 'a1', isChecked: false, addedAt: new Date('2024-01-01') },
        'a2': { articleId: 'a2', isChecked: true, checkedAt: new Date('2024-01-02') }
      };
      const serverStates = {
        'a3': { articleId: 'a3', isChecked: false, addedAt: new Date('2024-01-03') },
        'a4': { articleId: 'a4', isChecked: true, checkedAt: new Date('2024-01-04') }
      };

      const result = mergeItemStates(localStates, serverStates);

      expect(Object.keys(result)).toHaveLength(4);
      expect(result).toHaveProperty('a1');
      expect(result).toHaveProperty('a2');
      expect(result).toHaveProperty('a3');
      expect(result).toHaveProperty('a4');
    });
  });

  describe('Timestamp Conflict Resolution', () => {
    it('should prefer server when server is newer', () => {
      const olderDate = new Date('2024-01-01T10:00:00');
      const newerDate = new Date('2024-01-01T11:00:00');

      const localStates = {
        'a1': { articleId: 'a1', isChecked: false, checkedAt: olderDate }
      };
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: newerDate }
      };

      const result = mergeItemStates(localStates, serverStates);

      expect(result['a1'].isChecked).toBe(true);
      expect(result['a1']).toEqual(serverStates['a1']);
    });

    it('should prefer local when local is newer', () => {
      const olderDate = new Date('2024-01-01T10:00:00');
      const newerDate = new Date('2024-01-01T11:00:00');

      const localStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: newerDate }
      };
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: false, checkedAt: olderDate }
      };

      const result = mergeItemStates(localStates, serverStates);

      expect(result['a1'].isChecked).toBe(true);
      expect(result['a1']).toEqual(localStates['a1']);
    });

    it('should prefer server when timestamps are equal', () => {
      const sameDate = new Date('2024-01-01T10:00:00');

      const localStates = {
        'a1': { articleId: 'a1', isChecked: false, checkedAt: sameDate }
      };
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: sameDate }
      };

      const result = mergeItemStates(localStates, serverStates);

      // When equal, prefer server (last write wins)
      expect(result['a1'].isChecked).toBe(true);
      expect(result['a1']).toEqual(serverStates['a1']);
    });
  });

  describe('History-Based Timestamps', () => {
    it('should use history timestamp when available', () => {
      const olderHistoryDate = new Date('2024-01-01T10:00:00');
      const newerHistoryDate = new Date('2024-01-01T11:00:00');

      const localStates = {
        'a1': {
          articleId: 'a1',
          isChecked: false,
          history: [{ timestamp: olderHistoryDate, action: 'unchecked' }]
        }
      };
      const serverStates = {
        'a1': {
          articleId: 'a1',
          isChecked: true,
          history: [{ timestamp: newerHistoryDate, action: 'checked' }]
        }
      };

      const result = mergeItemStates(localStates, serverStates);

      // Server is newer based on history
      expect(result['a1'].isChecked).toBe(true);
    });

    it('should fallback to checkedAt/addedAt when no history', () => {
      const olderDate = new Date('2024-01-01T10:00:00');
      const newerDate = new Date('2024-01-01T11:00:00');

      const localStates = {
        'a1': { articleId: 'a1', isChecked: false, addedAt: olderDate }
      };
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: newerDate }
      };

      const result = mergeItemStates(localStates, serverStates);

      expect(result['a1'].isChecked).toBe(true);
    });
  });

  describe('Real-World Concurrent Update Scenario', () => {
    it('should preserve both changes when two users check different articles', () => {
      const time1 = new Date('2024-01-01T10:00:00');
      const time2 = new Date('2024-01-01T10:00:01');

      // User A's local state: checked a1
      const localStates = {
        'a1': { articleId: 'a1', isChecked: true, checkedAt: time1 },
        'a2': { articleId: 'a2', isChecked: false, addedAt: time1 }
      };

      // User B's change on server: checked a2
      const serverStates = {
        'a1': { articleId: 'a1', isChecked: false, addedAt: time1 },
        'a2': { articleId: 'a2', isChecked: true, checkedAt: time2 }
      };

      const result = mergeItemStates(localStates, serverStates);

      // Both changes should be preserved
      expect(result['a1'].isChecked).toBe(true); // User A's check
      expect(result['a2'].isChecked).toBe(true); // User B's check
    });
  });
});
