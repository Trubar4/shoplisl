import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  runTransaction,
  Timestamp
} from '@angular/fire/firestore';

import { ShoppingList } from '../models';
import { LoggerService } from './logger.service';
import { QuotaMonitorService } from './quota-monitor.service';
import { HistoryService } from './history.service';
import { FirebaseMergeService } from './firebase-merge.service';

/**
 * Context provided by FirebaseDataService so that FirebaseTransactionService
 * can look up the current list state without holding a direct reference to
 * FirebaseDataService.
 */
export interface TransactionServiceContext {
  getCurrentLists(): ShoppingList[];
}

/**
 * FirebaseTransactionService
 *
 * Handles atomic Firestore transactions for list item state updates,
 * extracted from FirebaseDataService.
 *
 * Extracted methods:
 *   - updateListItemWithTransaction  (toggle / add a single item in a list)
 *   - updateItemStatesWithTransaction (batch-update multiple itemStates)
 *
 * Owned state: none — both methods are stateless; they read list metadata
 * via the TransactionServiceContext provided by FirebaseDataService.
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseTransactionService {

  private context!: TransactionServiceContext;

  constructor(
    private firestore: Firestore,
    private logger: LoggerService,
    private mergeService: FirebaseMergeService,
    private quotaMonitor: QuotaMonitorService,
    private historyService: HistoryService
  ) {}

  /** Called once by FirebaseDataService in its constructor. */
  setContext(ctx: TransactionServiceContext): void {
    this.context = ctx;
  }

  /**
   * Atomically toggle / add a single article in a shopping list.
   *
   * Strategy:
   *   1. Read latest server state inside the transaction
   *   2. Merge our change with server state (preserving other users' changes)
   *   3. Write back if changed
   *
   * This fixes the issue where User B's write would overwrite User A's changes
   * because B was using local cache (which didn't have A's changes yet).
   */
  async updateListItemWithTransaction(
    listId: string,
    articleId: string,
    action: 'checked' | 'unchecked' | 'added',
    amount: string = '',
    userId?: string,
    userName?: string
  ): Promise<void> {
    try {
      const list = this.context.getCurrentLists().find(l => l.id === listId);
      if (!list) {
        throw new Error(`List ${listId} not found`);
      }

      const ownerId = list.ownerId || userId;
      if (!ownerId) {
        throw new Error('Cannot determine list owner');
      }

      const listPath = `users-v2/${ownerId}/lists/${listId}`;
      const listRef = doc(this.firestore, listPath);

      this.logger.info('data', `🔒 Starting transaction for ${action} on ${articleId} in ${listPath}`);

      await runTransaction(this.firestore, async (transaction) => {
        // Step 1: Read latest server state
        const listDoc = await transaction.get(listRef);

        // CRITICAL: Track transaction read (transactions ALWAYS do a read)
        this.quotaMonitor.trackRead('Transaction Read (Toggle Item)', 1, {
          listId,
          articleId,
          action
        });

        if (!listDoc.exists()) {
          throw new Error(`List ${listId} not found in Firestore`);
        }

        const serverData = listDoc.data();
        const serverItemStates = this.mergeService.convertItemStatesFromFirestore(serverData['itemStates'] || {});
        const serverArticleIds = serverData['articleIds'] || [];

        this.logger.debug('data', `📖 Transaction read: ${Object.keys(serverItemStates).length} items on server`);

        // Step 2: Create updated item state for our change
        const updatedItemState = this.historyService.createUpdatedItemState(
          serverItemStates[articleId],  // Use SERVER state, not local!
          articleId,
          action,
          amount,
          userId,
          userName
        );

        // Step 3: Merge our change with server state
        const mergedItemStates = {
          ...serverItemStates,  // Keep ALL server items (including other users' changes!)
          [articleId]: updatedItemState  // Add/update our item
        };

        // Step 4: Update articleIds if needed (add article if not present)
        let mergedArticleIds = [...serverArticleIds];
        if (!mergedArticleIds.includes(articleId)) {
          mergedArticleIds.push(articleId);
          this.logger.debug('data', `➕ Adding ${articleId} to articleIds`);
        }

        // Step 5: Write merged state back
        const firestoreItemStates = this.mergeService.convertItemStatesToFirestore(mergedItemStates);

        this.logger.info('data', `💾 Transaction writing: ${Object.keys(mergedItemStates).length} items (preserved ${Object.keys(serverItemStates).length - 1} other items)`);

        transaction.update(listRef, {
          itemStates: firestoreItemStates,
          articleIds: mergedArticleIds,
          updatedAt: Timestamp.now()
        });
      });

      this.logger.info('data', `✅ Transaction committed successfully for ${action} on ${articleId}`);
    } catch (error: any) {
      this.logger.error('data', `❌ Transaction failed: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Atomically update multiple itemStates for a list.
   * Used for operations that don't modify articleIds (check, uncheck, amount update).
   * Prevents race conditions when multiple users/devices update simultaneously.
   */
  async updateItemStatesWithTransaction(
    listId: string,
    itemStateUpdates: { [articleId: string]: any },
    operationDescription: string
  ): Promise<void> {
    try {
      const list = this.context.getCurrentLists().find(l => l.id === listId);
      if (!list) {
        throw new Error(`List ${listId} not found`);
      }

      const ownerId = list.ownerId;
      if (!ownerId) {
        throw new Error('Cannot determine list owner');
      }

      const listPath = `users-v2/${ownerId}/lists/${listId}`;
      const listRef = doc(this.firestore, listPath);

      this.logger.info('data', `🔒 Starting transaction for ${operationDescription} in ${listPath}`);

      await runTransaction(this.firestore, async (transaction) => {
        // Step 1: Read latest server state
        const listDoc = await transaction.get(listRef);

        // CRITICAL: Track transaction read (transactions ALWAYS do a read)
        this.quotaMonitor.trackRead('Transaction Read (Batch Update)', 1, {
          listId,
          updateCount: Object.keys(itemStateUpdates).length
        });

        if (!listDoc.exists()) {
          throw new Error(`List ${listId} not found in Firestore`);
        }

        const serverData = listDoc.data();
        const serverItemStates = this.mergeService.convertItemStatesFromFirestore(serverData['itemStates'] || {});

        this.logger.debug('data', `📖 Transaction read: ${Object.keys(serverItemStates).length} items on server`);

        // Step 2: Merge our updates with server state
        const mergedItemStates = {
          ...serverItemStates,  // Keep ALL server items
          ...itemStateUpdates   // Apply our updates
        };

        // Step 3: Write merged state back
        const firestoreItemStates = this.mergeService.convertItemStatesToFirestore(mergedItemStates);

        this.logger.info('data', `💾 Transaction writing: ${Object.keys(mergedItemStates).length} items (updated ${Object.keys(itemStateUpdates).length})`);

        transaction.update(listRef, {
          itemStates: firestoreItemStates,
          updatedAt: Timestamp.now()
        });
      });

      this.logger.info('data', `✅ Transaction committed successfully for ${operationDescription}`);
    } catch (error: any) {
      this.logger.error('data', `❌ Transaction failed: ${error.message}`, error);
      throw error;
    }
  }
}
