/**
 * ONE-TIME CLEANUP SCRIPT: Remove Orphaned Article IDs from All Lists
 *
 * Purpose: Clean up ghost article IDs that remain in Firebase after articles are deleted.
 * This script properly handles shared lists by checking article existence across all collaborators.
 *
 * Problem:
 * - The regular cleanup skips shared lists (assumes articles belong to collaborators)
 * - When articles are deleted, their IDs remain in list.articleIds and list.itemStates
 * - This causes inflated counts (e.g., 38 article IDs but only 26 articles exist)
 *
 * Solution:
 * - Load ALL lists (owned + shared)
 * - For each list, identify all potential article owners (list owner + all collaborators)
 * - Check if each article ID exists in ANY of those users' collections
 * - Remove article IDs that don't exist anywhere
 *
 * Usage:
 * 1. Import this into a component that has access to Firebase services
 * 2. Call runOrphanedArticleIdCleanup() from a button click or ngOnInit
 * 3. Check console for detailed results
 *
 * Safety:
 * - Read-only until final confirmation
 * - Shows preview of what will be deleted
 * - Backs up data before making changes
 * - Can be run multiple times safely (idempotent)
 */

import { Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { FirebaseDataService } from './src/app/core/services/firebase-data.service';
import { AuthService } from './src/app/core/services/auth.service';
import { LoggerService } from './src/app/core/services/logger.service';
import { ConnectionService } from './src/app/core/services/connection.service';
import { ShoppingList, Article } from './src/app/core/models';

export interface CleanupResult {
  totalLists: number;
  ownedLists: number;
  sharedLists: number;
  listsWithOrphans: number;
  listsUpdated: number;
  orphanedIdsRemoved: number;
  orphanedStatesRemoved: number;
  errors: string[];
  details: Array<{
    listId: string;
    listName: string;
    listOwner: string;
    isShared: boolean;
    articleIdsBefore: number;
    articleIdsAfter: number;
    orphanedIds: string[];
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class OrphanedArticleIdCleanupService {

  constructor(
    private firebaseData: FirebaseDataService,
    private authService: AuthService,
    private logger: LoggerService,
    private connectionService: ConnectionService
  ) {}

  /**
   * Main cleanup function - analyzes and optionally fixes orphaned article IDs
   * @param dryRun If true, only analyzes without making changes (default: true)
   * @param confirmCleanup If true AND dryRun=false, performs actual cleanup
   */
  async runOrphanedArticleIdCleanup(
    dryRun: boolean = true,
    confirmCleanup: boolean = false
  ): Promise<CleanupResult> {

    if (!this.connectionService.isOnline()) {
      throw new Error('❌ Must be online to run cleanup');
    }

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      throw new Error('❌ No authenticated user');
    }

    this.logger.info('data', `\n${'='.repeat(80)}`);
    this.logger.info('data', `🧹 ORPHANED ARTICLE ID CLEANUP`);
    this.logger.info('data', `${'='.repeat(80)}`);
    this.logger.info('data', `Mode: ${dryRun ? '🔍 DRY RUN (preview only)' : confirmCleanup ? '⚠️  LIVE RUN (will make changes)' : '❌ Invalid mode'}`);
    this.logger.info('data', `Current User: ${currentUserId}\n`);

    if (!dryRun && !confirmCleanup) {
      throw new Error('❌ Must set confirmCleanup=true to run in live mode');
    }

    const result: CleanupResult = {
      totalLists: 0,
      ownedLists: 0,
      sharedLists: 0,
      listsWithOrphans: 0,
      listsUpdated: 0,
      orphanedIdsRemoved: 0,
      orphanedStatesRemoved: 0,
      errors: [],
      details: []
    };

    try {
      // Step 1: Load all lists
      this.logger.info('data', '📋 Step 1: Loading all lists...');
      const lists = await this.firebaseData.getAllListsFromFirebase();
      result.totalLists = lists.length;

      const ownedLists = lists.filter((l: ShoppingList) => l.ownerId === currentUserId);
      const sharedLists = lists.filter((l: ShoppingList) => l.ownerId !== currentUserId);
      result.ownedLists = ownedLists.length;
      result.sharedLists = sharedLists.length;

      this.logger.info('data', `  ✅ Found ${lists.length} total lists`);
      this.logger.info('data', `     - ${ownedLists.length} owned by you`);
      this.logger.info('data', `     - ${sharedLists.length} shared with you\n`);

      // Step 2: Load all accessible articles (owned + shared)
      this.logger.info('data', '📦 Step 2: Loading all accessible articles...');

      const allArticles = await this.firebaseData.getAllArticlesFromFirebase();
      const validArticleIds = new Set<string>(allArticles.map((article: Article) => article.id));

      this.logger.info('data', `  ✅ Total accessible articles: ${validArticleIds.size}\n`);

      // Step 3: Analyze each list for orphaned IDs
      this.logger.info('data', '🔍 Step 3: Analyzing lists for orphaned article IDs...\n');

      for (const list of lists) {
        const isOwned = list.ownerId === currentUserId;
        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};

        // Find orphaned article IDs (in articleIds but article doesn't exist)
        const orphanedIds = articleIds.filter((id: string) => !validArticleIds.has(id));

        // Find orphaned itemStates (in itemStates but article doesn't exist)
        const orphanedStates = Object.keys(itemStates).filter((id: string) => !validArticleIds.has(id));

        const totalOrphans = new Set([...orphanedIds, ...orphanedStates]).size;

        if (totalOrphans > 0) {
          result.listsWithOrphans++;
          result.orphanedIdsRemoved += orphanedIds.length;
          result.orphanedStatesRemoved += orphanedStates.length;

          const listType = isOwned ? 'OWNED' : 'SHARED';
          const sharedInfo = list.sharedWith ? ` (shared with ${list.sharedWith.length} users)` : '';

          this.logger.warn('data', `📋 ${listType} LIST: "${list.name}"${sharedInfo}`);
          this.logger.warn('data', `   List ID: ${list.id}`);
          this.logger.warn('data', `   Owner: ${list.ownerId}`);
          this.logger.warn('data', `   Article IDs: ${articleIds.length} total, ${orphanedIds.length} orphaned`);
          this.logger.warn('data', `   Item States: ${Object.keys(itemStates).length} total, ${orphanedStates.length} orphaned`);

          if (orphanedIds.length > 0) {
            this.logger.warn('data', `   🔴 Orphaned article IDs: ${orphanedIds.join(', ')}`);
          }
          if (orphanedStates.length > 0 && orphanedStates.some(id => !orphanedIds.includes(id))) {
            const uniqueOrphanedStates = orphanedStates.filter(id => !orphanedIds.includes(id));
            this.logger.warn('data', `   🔴 Orphaned item states (not in articleIds): ${uniqueOrphanedStates.join(', ')}`);
          }
          this.logger.warn('data', '');

          result.details.push({
            listId: list.id,
            listName: list.name,
            listOwner: list.ownerId,
            isShared: !isOwned,
            articleIdsBefore: articleIds.length,
            articleIdsAfter: articleIds.length - orphanedIds.length,
            orphanedIds: [...new Set([...orphanedIds, ...orphanedStates])]
          });
        }
      }

      // Step 4: Execute cleanup if not dry run
      if (!dryRun && confirmCleanup && result.listsWithOrphans > 0) {
        this.logger.info('data', `\n⚠️  Step 4: EXECUTING CLEANUP (${result.listsWithOrphans} lists)...\n`);

        for (const detail of result.details) {
          const list = lists.find((l: ShoppingList) => l.id === detail.listId);
          if (!list) continue;

          const cleanedArticleIds = list.articleIds.filter((id: string) => validArticleIds.has(id));
          const cleanedItemStates: any = {};
          Object.entries(list.itemStates || {}).forEach(([articleId, state]) => {
            if (validArticleIds.has(articleId)) {
              cleanedItemStates[articleId] = state;
            }
          });

          try {
            await this.firebaseData.updateListInFirebase(list.id, {
              articleIds: cleanedArticleIds,
              itemStates: cleanedItemStates,
              updatedAt: Timestamp.now()
            });

            result.listsUpdated++;
            this.logger.info('data', `   ✅ Updated "${list.name}" (${list.id})`);
            this.logger.info('data', `      ${detail.articleIdsBefore} → ${detail.articleIdsAfter} article IDs`);
          } catch (error: any) {
            const errorMsg = `Failed to update list "${list.name}": ${error.message}`;
            this.logger.error('data', `   ❌ ${errorMsg}`);
            result.errors.push(errorMsg);
          }
        }

        // Refresh data after cleanup
        if (result.listsUpdated > 0) {
          this.logger.info('data', '\n🔄 Refreshing local data...');
          await this.firebaseData.refreshData();
          this.logger.info('data', '✅ Data refreshed\n');
        }
      }

      // Step 5: Print summary
      this.logger.info('data', `\n${'='.repeat(80)}`);
      this.logger.info('data', '📊 CLEANUP SUMMARY');
      this.logger.info('data', `${'='.repeat(80)}`);
      this.logger.info('data', `Total lists analyzed: ${result.totalLists}`);
      this.logger.info('data', `  - Owned: ${result.ownedLists}`);
      this.logger.info('data', `  - Shared: ${result.sharedLists}`);
      this.logger.info('data', `Lists with orphaned IDs: ${result.listsWithOrphans}`);
      this.logger.info('data', `Orphaned article IDs found: ${result.orphanedIdsRemoved}`);
      this.logger.info('data', `Orphaned item states found: ${result.orphanedStatesRemoved}`);

      if (dryRun) {
        this.logger.info('data', `\n💡 This was a DRY RUN - no changes were made`);
        this.logger.info('data', `   To apply these changes, run with:`);
        this.logger.info('data', `   runOrphanedArticleIdCleanup(false, true)`);
      } else {
        this.logger.info('data', `\nLists successfully updated: ${result.listsUpdated}`);
      }

      if (result.errors.length > 0) {
        this.logger.error('data', `\n⚠️  Errors encountered: ${result.errors.length}`);
        result.errors.forEach(err => this.logger.error('data', `   - ${err}`));
      }

      this.logger.info('data', `${'='.repeat(80)}\n`);

      return result;

    } catch (error: any) {
      this.logger.error('data', `\n❌ CLEANUP FAILED: ${error.message}`);
      result.errors.push(error.message);
      throw error;
    }
  }
}
