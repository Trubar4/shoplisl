// src/app/core/services/firebase-merge.service.ts
import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

/**
 * FirebaseMergeService - Handles merge logic for collaborative data synchronization
 *
 * Extracted from FirebaseDataService (Phase 1 refactoring) to:
 * - Reduce firebase-data.service.ts from 2885 to ~2000 lines
 * - Isolate complex merge algorithms for easier testing
 * - Provide reusable merge utilities for list/article sync
 *
 * Key responsibilities:
 * - Merge item states with timestamp-based conflict resolution
 * - Merge article IDs while respecting deletions
 * - Detect meaningful changes to prevent infinite write-back loops
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseMergeService {

  constructor(private logger: LoggerService) {}

  /**
   * Smart merge of itemStates to prevent race conditions
   * When two users check different articles simultaneously, this ensures both changes persist
   *
   * Strategy:
   * 1. For each article, compare timestamps of local vs server
   * 2. Use the history array's first event timestamp (most accurate "last modified" time)
   * 3. If no history, fall back to checkedAt/addedAt timestamps
   * 4. If timestamps equal, prefer server state (last write wins)
   * 5. Preserve all articles from both sources
   */
  mergeItemStates(
    localStates: { [articleId: string]: any },
    serverStates: { [articleId: string]: any }
  ): { [articleId: string]: any } {
    const merged: { [articleId: string]: any } = {};

    // Collect all article IDs from both sources
    const allArticleIds = new Set([
      ...Object.keys(localStates),
      ...Object.keys(serverStates)
    ]);

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

      // Both exist - merge intelligently based on timestamps
      const localTime = this.getTimestamp(localState);
      const serverTime = this.getTimestamp(serverState);

      // Use whichever has the most recent change
      if (serverTime > localTime) {
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (server newer: ${serverTime} > ${localTime})`);
      } else if (localTime > serverTime) {
        merged[articleId] = localState;
        this.logger.debug('data', `Merge: Using local state for ${articleId} (local newer: ${localTime} > ${serverTime})`);
      } else {
        // Times equal - prefer SERVER state (most recent write wins)
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (timestamps equal, server wins)`);
      }
    }

    this.logger.info('data', `✅ Merged itemStates: ${Object.keys(localStates).length} local + ${Object.keys(serverStates).length} server = ${Object.keys(merged).length} total`);
    return merged;
  }

  /**
   * Smart merge of articleIds arrays to prevent race conditions
   * When users add/remove articles simultaneously, this ensures all changes persist correctly
   *
   * Strategy:
   * 1. Use itemStates as source of truth (it has timestamps for conflict resolution)
   * 2. Merge itemStates first (handles check/uncheck/add/remove conflicts)
   * 3. Build articleIds from merged itemStates
   * 4. Preserve original order where possible
   *
   * BUGFIX: Now respects deletions! If an article is removed from itemStates, it's removed from articleIds
   */
  mergeArticleIds(
    localIds: string[],
    serverIds: string[],
    mergedItemStates: { [articleId: string]: any }
  ): string[] {
    const itemStatesCount = Object.keys(mergedItemStates).length;
    const maxArticleIdsCount = Math.max(serverIds.length, localIds.length);

    // Detect migration/partial state
    // If articleIds significantly outnumber itemStates, we're in migration or partial state
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

      this.logger.warn('data', `⚠️ Migration state: Preserving ${merged.length} articleIds (${itemStatesCount} have states, ${merged.length - itemStatesCount} pending)`);
      return merged;
    }

    // Normal mode: Use itemStates as source of truth for which articles should exist
    const articlesFromItemStates = new Set(Object.keys(mergedItemStates));

    // Start with server order as base, but only include articles that are in merged itemStates
    const merged: string[] = [];
    for (const serverId of serverIds) {
      if (articlesFromItemStates.has(serverId)) {
        merged.push(serverId);
        articlesFromItemStates.delete(serverId);
      } else {
        this.logger.debug('data', `Merge: Removing ${serverId} (deleted from itemStates)`);
      }
    }

    // Add any remaining articles from local that aren't in server yet
    for (const localId of localIds) {
      if (articlesFromItemStates.has(localId)) {
        merged.push(localId);
        articlesFromItemStates.delete(localId);
        this.logger.debug('data', `Merge: Adding local-only article ${localId}`);
      }
    }

    // Add any remaining articles from itemStates (shouldn't happen, but be safe)
    for (const remainingId of articlesFromItemStates) {
      merged.push(remainingId);
      this.logger.warn('data', `Merge: Adding orphaned article ${remainingId} from itemStates`);
    }

    this.logger.info('data', `✅ Merged articleIds: ${localIds.length} local + ${serverIds.length} server = ${merged.length} total`);
    return merged;
  }

  /**
   * Detect if articleIds array has changed
   * Used to prevent infinite loop from write-back triggering listener
   */
  hasArticleIdsChanged(
    articleIds1: string[],
    articleIds2: string[]
  ): boolean {
    // Different lengths = changed
    if (articleIds1.length !== articleIds2.length) {
      return true;
    }

    // Check if all IDs match (order-sensitive)
    for (let i = 0; i < articleIds1.length; i++) {
      if (articleIds1[i] !== articleIds2[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect if itemStates have actually changed
   * Used to prevent infinite loop from write-back triggering listener
   *
   * IMPORTANT: Only compares USER-FACING state (isChecked, amount, checkedBy)
   * Does NOT compare timestamps (checkedAt, addedAt) which are metadata
   *
   * Why: Merge creates slightly different timestamps even when state is identical
   * This was causing 5x listener fires and 2000 quota reads per session!
   */
  hasItemStatesChanged(
    itemStates1: { [articleId: string]: any },
    itemStates2: { [articleId: string]: any }
  ): boolean {
    // Quick check: different number of articles
    const keys1 = Object.keys(itemStates1 || {});
    const keys2 = Object.keys(itemStates2 || {});

    if (keys1.length !== keys2.length) {
      this.logger.debug('data', `ItemStates changed: different number of articles (${keys1.length} vs ${keys2.length})`);
      return true;
    }

    // Check each article
    for (const articleId of keys1) {
      const state1 = itemStates1[articleId];
      const state2 = itemStates2[articleId];

      // Article missing in second object
      if (!state2) {
        this.logger.debug('data', `ItemStates changed: article ${articleId} missing in server state`);
        return true;
      }

      // Only compare USER-FACING state, not timestamps!
      if (state1.isChecked !== state2.isChecked) {
        this.logger.debug('data', `ItemStates changed: ${articleId} isChecked (${state1.isChecked} vs ${state2.isChecked})`);
        return true;
      }

      if (state1.checkedBy !== state2.checkedBy) {
        this.logger.debug('data', `ItemStates changed: ${articleId} checkedBy (${state1.checkedBy} vs ${state2.checkedBy})`);
        return true;
      }

      if (state1.amount !== state2.amount) {
        this.logger.debug('data', `ItemStates changed: ${articleId} amount (${state1.amount} vs ${state2.amount})`);
        return true;
      }
    }

    // No differences detected
    this.logger.debug('data', `ItemStates unchanged (no write-back needed)`);
    return false;
  }

  /**
   * Extract timestamp from item state for comparison
   * Uses history array (most accurate) or falls back to checkedAt/addedAt
   */
  private getTimestamp(state: any): number {
    // First, try history array (most accurate - updated for both check and uncheck)
    if (state.history && Array.isArray(state.history) && state.history.length > 0) {
      const latestEvent = state.history[0]; // History is sorted newest first
      const timestamp = latestEvent.timestamp;

      if (timestamp instanceof Date) {
        return timestamp.getTime();
      } else if (timestamp?.toMillis) {
        return timestamp.toMillis();
      } else if (timestamp) {
        return new Date(timestamp).getTime();
      }
    }

    // Fallback to checkedAt/addedAt (for backwards compatibility)
    const checkedAt = state.checkedAt;
    const addedAt = state.addedAt;

    const checkedTime = checkedAt instanceof Date ? checkedAt.getTime() :
                       (checkedAt?.toMillis ? checkedAt.toMillis() : 0);
    const addedTime = addedAt instanceof Date ? addedAt.getTime() :
                     (addedAt?.toMillis ? addedAt.toMillis() : 0);

    return checkedTime || addedTime || 0;
  }
}
