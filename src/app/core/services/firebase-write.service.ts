import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  Timestamp
} from '@angular/fire/firestore';

import { LoggerService } from './logger.service';
import { FirebaseMergeService } from './firebase-merge.service';

/**
 * FirebaseWriteService
 *
 * Handles Firestore write operations extracted from FirebaseDataService.
 * Stateless — all inputs are passed as parameters, no side effects on instance state.
 *
 * Extracted methods:
 *   - writeMergedStateToFirestore
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseWriteService {

  constructor(
    private firestore: Firestore,
    private logger: LoggerService,
    private mergeService: FirebaseMergeService
  ) {}

  /**
   * Write the result of a merge operation back to Firestore.
   * Called after merge detects that the merged state differs from the server state,
   * to reconcile concurrent edits from multiple users.
   */
  async writeMergedStateToFirestore(
    listId: string,
    ownerId: string,
    mergedItemStates: { [articleId: string]: any },
    mergedArticleIds: string[]
  ): Promise<void> {
    try {
      const listPath = `users-v2/${ownerId}/lists/${listId}`;
      const firestoreItemStates = this.mergeService.convertItemStatesToFirestore(mergedItemStates);

      this.logger.info('data', `💾 Writing merged state to ${listPath} (${Object.keys(mergedItemStates).length} items, ${mergedArticleIds.length} articles)`);

      await updateDoc(doc(this.firestore, listPath), {
        itemStates: firestoreItemStates,
        articleIds: mergedArticleIds,
        updatedAt: Timestamp.now()
      });

      this.logger.info('data', `✅ Merged state written successfully`);
    } catch (error: any) {
      this.logger.error('data', `Failed to write merged state: ${error.message}`);
      throw error;
    }
  }
}
