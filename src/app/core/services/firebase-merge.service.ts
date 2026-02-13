import { Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { LoggerService } from './logger.service';

/**
 * FirebaseMergeService
 *
 * Pure utility functions extracted from FirebaseDataService for merging
 * and converting Firestore data. All methods are stateless — they take
 * inputs and return outputs without side effects on instance state.
 *
 * Extracted methods:
 *   - mergeArticleIds       (isMigrationState bug fixed in this extraction)
 *   - mergeItemStates
 *   - convertItemStatesFromFirestore
 *   - convertItemStatesToFirestore
 *   - hasArticleIdsChanged
 *   - hasItemStatesChanged
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseMergeService {

  constructor(private logger: LoggerService) {}

  /**
   * Merge two articleIds arrays using itemStates as source of truth.
   *
   * Migration mode (union of all IDs) is only triggered for genuinely
   * pre-migration data:
   *   A) No itemStates at all (legacy document)
   *   B) IDs present in BOTH local AND server but lacking states (partial migration)
   *
   * Stale IDs (in local only, NOT in server) do NOT trigger migration,
   * so deletions stick correctly.
   *
   * Order:
   *   1. Migration mode: server order, then local-only additions
   *   2. Normal mode: server order (filtered by itemStates), then local-only with states,
   *      then orphaned itemState entries
   */
  mergeArticleIds(
    localIds: string[],
    serverIds: string[],
    mergedItemStates: { [articleId: string]: any }
  ): string[] {
    // CORRECT migration detection - only true for genuinely pre-migration data:
    // A) No itemStates at all AND server still has articles (legacy document, genuinely pre-migration)
    //    NOTE: if serverIds is empty the list was genuinely cleared — do NOT union local IDs back
    // B) IDs present in BOTH local AND server but lacking states (partial migration)
    // Stale IDs (in local only, NOT in server) do NOT trigger migration → deletions stick
    const noStatesAtAll = Object.keys(mergedItemStates).length === 0;
    const localIdsSet = new Set(localIds);
    const sharedIdsLackingStates = serverIds.filter(id => localIdsSet.has(id) && !mergedItemStates[id]);
    const isMigrationState = (noStatesAtAll && serverIds.length > 0) || sharedIdsLackingStates.length > 0;

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

      this.logger.warn('data', `⚠️ Migration state: Preserving ${merged.length} articleIds (noStatesAtAll=${noStatesAtAll}, sharedIdsLackingStates=${sharedIdsLackingStates.length})`);
      return merged;
    }

    // Normal mode: Use itemStates as source of truth for which articles should exist
    const articlesFromItemStates = new Set(Object.keys(mergedItemStates));

    // Start with server order as base, but only include articles that are in merged itemStates
    const merged: string[] = [];
    for (const serverId of serverIds) {
      if (articlesFromItemStates.has(serverId)) {
        merged.push(serverId);
        articlesFromItemStates.delete(serverId); // Remove from set to track which ones we've added
      } else {
        this.logger.debug('data', `Merge: Removing ${serverId} (deleted from itemStates)`);
      }
    }

    // Add any remaining articles from local that aren't in server yet
    // (these are new articles added locally)
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
   * Smart merge of itemStates to prevent race conditions.
   * When two users check different articles simultaneously, this ensures both changes persist.
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
      // CRITICAL FIX: Use history timestamp (updated for both check AND uncheck)
      const getTimestamp = (state: any) => {
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
      };

      const localTime = getTimestamp(localState);
      const serverTime = getTimestamp(serverState);

      // Use whichever has the most recent change
      if (serverTime > localTime) {
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (server newer: ${serverTime} > ${localTime})`);
      } else if (localTime > serverTime) {
        merged[articleId] = localState;
        this.logger.debug('data', `Merge: Using local state for ${articleId} (local newer: ${localTime} > ${serverTime})`);
      } else {
        // Equal timestamps - prefer server (last write wins)
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (timestamps equal, server wins)`);
      }
    }

    this.logger.info('data', `✅ Merged itemStates: ${Object.keys(localStates).length} local + ${Object.keys(serverStates).length} server = ${Object.keys(merged).length} total`);
    return merged;
  }

  /**
   * Convert itemStates from Firestore format to application format.
   * Converts Firestore Timestamps to JavaScript Dates in checkedAt and history events.
   */
  convertItemStatesFromFirestore(firestoreItemStates: any): { [articleId: string]: any } {
    const itemStates: any = {};

    for (const [articleId, state] of Object.entries(firestoreItemStates || {})) {
      const itemState = state as any;

      itemStates[articleId] = {
        ...itemState,
        addedAt: itemState.addedAt?.toDate ? itemState.addedAt.toDate() : itemState.addedAt,
        checkedAt: itemState.checkedAt?.toDate ? itemState.checkedAt.toDate() : itemState.checkedAt,
        history: (itemState.history || []).map((event: any) => ({
          ...event,
          timestamp: event.timestamp?.toDate ? event.timestamp.toDate() : event.timestamp
        }))
      };
    }

    return itemStates;
  }

  /**
   * Convert itemStates from application format to Firestore format.
   * Converts JavaScript Dates to Firestore Timestamps in checkedAt, addedAt, and history events.
   * This is CRITICAL for persistence - Firestore needs Timestamp objects, not Date objects.
   * Also removes undefined values as Firestore doesn't support them.
   */
  convertItemStatesToFirestore(appItemStates: any): { [articleId: string]: any } {
    const itemStates: any = {};

    for (const [articleId, state] of Object.entries(appItemStates || {})) {
      const itemState = state as any;

      // Build cleanedState by only adding defined values
      const cleanedState: any = {};

      // Add each property only if it's defined
      if (itemState.articleId !== undefined) cleanedState.articleId = itemState.articleId;
      if (itemState.articleName !== undefined) cleanedState.articleName = itemState.articleName;
      if (itemState.isChecked !== undefined) cleanedState.isChecked = itemState.isChecked;
      if (itemState.amount !== undefined) cleanedState.amount = itemState.amount;
      if (itemState.checkedBy !== undefined) cleanedState.checkedBy = itemState.checkedBy;

      // Convert and add addedAt only if defined
      if (itemState.addedAt !== undefined) {
        cleanedState.addedAt = itemState.addedAt instanceof Date
          ? Timestamp.fromDate(itemState.addedAt)
          : itemState.addedAt;
      }

      // Convert and add checkedAt only if defined
      if (itemState.checkedAt !== undefined) {
        cleanedState.checkedAt = itemState.checkedAt instanceof Date
          ? Timestamp.fromDate(itemState.checkedAt)
          : itemState.checkedAt;
      }

      // Convert timestamps in history events (only if history exists)
      if (itemState.history !== undefined) {
        cleanedState.history = itemState.history.map((event: any) => ({
          ...event,
          timestamp: event.timestamp instanceof Date
            ? Timestamp.fromDate(event.timestamp)
            : event.timestamp
        }));
      }

      itemStates[articleId] = cleanedState;
    }

    return itemStates;
  }

  /**
   * Detect if articleIds array has changed.
   * Used to prevent infinite loop from write-back triggering listener.
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
   * Detect if itemStates have actually changed.
   * Used to prevent infinite loop from write-back triggering listener.
   *
   * Only compares USER-FACING state (isChecked, amount, checkedBy).
   * Does NOT compare timestamps (checkedAt, addedAt) which are metadata —
   * merge produces slightly different timestamps even when state is identical,
   * which would cause unnecessary write-backs and quota waste.
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

      // CRITICAL: Only compare USER-FACING state, not timestamps!
      // Timestamps are metadata and differ after merge even when state is identical

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
}
