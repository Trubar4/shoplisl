import { Injectable } from '@angular/core';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, catchError, mergeMap } from 'rxjs/operators';
import { Timestamp } from 'firebase/firestore';

import { Article } from '../models';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { DataMigrationService } from './data-migration.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ArticlesRepositoryService {

  constructor(
    private firebaseData: FirebaseDataService,
    private offlineSync: OfflineSyncService,
    private connectionService: ConnectionService,
    private logger: LoggerService,
    private dataMigrationService: DataMigrationService,
    private authService: AuthService
  ) {}

  // === BASIC CRUD OPERATIONS ===

  /**
   * Phase 8.2: Create a local copy of an article
   * Used when adding a non-owned article to user's own (non-shared) list
   */
  createLocalCopy(originalArticle: Article): Observable<Article> {
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      throw new Error('User must be authenticated to create a local copy');
    }

    // Create copy with current user as owner
    const copyData: Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> = {
      name: originalArticle.name,
      amount: originalArticle.amount,
      notes: originalArticle.notes,
      icon: originalArticle.icon,
      categoryId: originalArticle.categoryId,
      departmentId: originalArticle.departmentId,
      availableInShops: originalArticle.availableInShops,
      usageCount: originalArticle.usageCount,
      copiedFrom: originalArticle.id  // Track original article
    };

    this.logger.info('data', `Creating local copy of article "${originalArticle.name}" (${originalArticle.id})`);
    return this.createArticle(copyData);
  }

  // Phase 8: ownerId is added automatically (creator owns the article)
  createArticle(
    article: Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>
  ): Observable<Article> {
    // Phase 8: Get current user ID for ownership
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      throw new Error('User must be authenticated to create an article');
    }

    const articleData: any = {
      name: article.name,
      amount: article.amount || '',
      notes: article.notes || '',
      icon: article.icon || '📦',
      categoryId: article.categoryId || '',
      departmentId: article.departmentId || '',
      availableInShops: article.availableInShops || [],
      usageCount: article.usageCount || 0,
      ownerId: currentUserId,  // Phase 8: Creator owns the article
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    // Phase 8.2: Include copiedFrom field if present (for local copies)
    if ('copiedFrom' in article && article.copiedFrom) {
      articleData.copiedFrom = article.copiedFrom;
    }

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: Article creation will be synced when online');

      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tempArticle: Article = {
        id: tempId,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        ownerId: currentUserId,  // Phase 8: Creator owns the article
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // CRITICAL FIX: Update local state immediately using synchronous method
      const currentArticles = this.firebaseData.getCurrentArticles();
      const updatedArticles = [...currentArticles, tempArticle];
      this.firebaseData.updateLocalArticles(updatedArticles);

      this.logger.info('data', `✅ Offline article created: ${tempArticle.name} (temp ID: ${tempId})`);

      // CRITICAL FIX: Queue operation that replaces temp ID with real ID after sync
      this.offlineSync.queueOperation(async () => {
        this.logger.info('data', `🔄 Syncing offline article: ${article.name} (temp ID: ${tempId})`);

        // Create article in Firebase and get real ID
        const realId = await this.firebaseData.createArticleInFirebase(articleData);
        this.logger.info('data', `✅ Article synced with real ID: ${realId}`);

        // CRITICAL: Replace temp ID with real ID in all local state and lists
        const currentArticles = this.firebaseData.getCurrentArticles();
        const updatedArticles = currentArticles.map(a =>
          a.id === tempId ? { ...a, id: realId } : a
        );
        this.firebaseData.updateLocalArticles(updatedArticles);

        // Update all lists that reference the temp ID
        const currentLists = this.firebaseData.getCurrentLists();
        const updatedLists = currentLists.map(list => {
          if (list.articleIds.includes(tempId)) {
            return {
              ...list,
              articleIds: list.articleIds.map(id => id === tempId ? realId : id),
              itemStates: Object.fromEntries(
                Object.entries(list.itemStates).map(([key, value]) =>
                  key === tempId ? [realId, { ...value, articleId: realId }] : [key, value]
                )
              )
            };
          }
          return list;
        });
        this.firebaseData.updateLocalLists(updatedLists);

        this.logger.info('data', `🔄 Replaced temp ID ${tempId} with real ID ${realId} in local state`);

        // CRITICAL: Update Firebase with cleaned list data (remove temp IDs)
        for (const list of updatedLists) {
          // Only process lists that were actually modified (had the temp ID)
          const originalList = currentLists.find(l => l.id === list.id);
          if (originalList && originalList.articleIds.includes(tempId)) {
            try {
              await this.firebaseData.updateListInFirebase(list.id, {
                articleIds: list.articleIds,
                itemStates: list.itemStates,
                updatedAt: Timestamp.now()
              });

              this.logger.info('data', `✅ Cleaned temp ID ${tempId} from list ${list.id} in Firebase`);
            } catch (error) {
              this.logger.error('data', `❌ Failed to clean list ${list.id} in Firebase:`, error);
              // Don't throw - local state is already updated, Firebase cleanup can be retried later
            }
          }
        }
      }, `Create article: ${article.name}`);

      return of(tempArticle);
    }

    return from(this.firebaseData.createArticleInFirebase(articleData)).pipe(
      map(docId => ({
        id: docId,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        ownerId: currentUserId,  // Phase 8: Creator owns the article
        createdAt: new Date(),
        updatedAt: new Date()
      } as Article)),
      catchError(error => {
        this.logger.error('data', 'Error creating article', error);
        throw error;
      })
    );
  }

  updateArticle(id: string, updates: Partial<Article>): Observable<Article | undefined> {
    const updateData: any = {
      updatedAt: Timestamp.now()
    };
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.amount !== undefined) updateData.amount = updates.amount || '';
    if (updates.notes !== undefined) updateData.notes = updates.notes || '';
    if (updates.icon !== undefined) updateData.icon = updates.icon || '📦';
    if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId || '';
    if (updates.departmentId !== undefined) updateData.departmentId = updates.departmentId || '';
    if (updates.availableInShops !== undefined) updateData.availableInShops = updates.availableInShops || [];
    if (updates.usageCount !== undefined) updateData.usageCount = updates.usageCount || 0;

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: Article update will be synced when online');
      
      // Update local state immediately
      const currentArticles = this.firebaseData.getCurrentArticles();
      const updatedArticles = currentArticles.map(article => 
        article.id === id ? { ...article, ...updates, updatedAt: new Date() } : article
      );
      this.firebaseData.updateLocalArticles(updatedArticles);
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.updateArticleInFirebase(id, updateData);
      }, `Update article: ${id}`);
    
      // Return updated article from local state
      return this.firebaseData.getArticles().pipe(
        map(articles => articles.find(a => a.id === id))
      );
    }

    // FIX BUG 2: Update local state immediately after Firebase write (optimistic update)
    // This ensures UI updates instantly without waiting for real-time listener
    // Matches offline behavior for consistency
    return from(this.firebaseData.updateArticleInFirebase(id, updateData)).pipe(
      map(() => {
        // Immediately update local state with new data
        const currentArticles = this.firebaseData.getCurrentArticles();
        const updatedArticles = currentArticles.map(article =>
          article.id === id ? { ...article, ...updates, updatedAt: new Date() } : article
        );
        this.firebaseData.updateLocalArticles(updatedArticles);

        // Return the updated article
        return updatedArticles.find(a => a.id === id);
      }),
      catchError(error => {
        this.logger.error('data', 'Error updating article', error);
        return of(undefined);
      })
    );
  }

  deleteArticle(id: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: Article deletion will be synced when online');

      // Remove from local state immediately
      const currentArticles = this.firebaseData.getCurrentArticles();
      const updatedArticles = currentArticles.filter(a => a.id !== id);
      this.firebaseData.updateLocalArticles(updatedArticles);

      // Queue for sync when online (including cleanup)
      this.offlineSync.queueOperation(async () => {
        await this.removeArticleFromAllLists(id);
        await this.firebaseData.deleteArticleInFirebase(id);
        // Auto-cleanup will run when back online
      }, `Delete article: ${id}`);

      return of(true);
    }

    return from(this.removeArticleFromAllLists(id)).pipe(
      mergeMap(() => {
        return from(this.firebaseData.deleteArticleInFirebase(id));
      }),
      mergeMap(() => {
        // Trigger immediate cleanup after successful deletion
        return from(this.dataMigrationService.quickCleanupOrphanedReferences());
      }),
      map(() => {
        // Update local state immediately for UI responsiveness
        const currentArticles = this.firebaseData.getCurrentArticles();
        const updatedArticles = currentArticles.filter(a => a.id !== id);
        this.firebaseData.updateLocalArticles(updatedArticles);
        return true;
      }),
      catchError(error => {
        this.logger.error('data', 'Error deleting article', error);
        return of(false);
      })
    );
  }

  // === VALIDATION METHODS ===

  checkArticleNameExists(name: string, excludeId?: string): Observable<boolean> {
    return this.firebaseData.getArticles().pipe(
      map(articles => {
        const trimmedName = name.trim().toLowerCase();
        return articles.some(article => 
          article.id !== excludeId && 
          article.name.trim().toLowerCase() === trimmedName
        );
      })
    );
  }

  // Phase 8: ownerId is added automatically by the service
  createArticleWithDuplicateCheck(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    // QUOTA OPTIMIZATION: Use local state for duplicate check (0 reads)
    // Before: called getAllArticlesFromFirebase() = 453 reads per article creation!
    // After: uses getArticles() observable (already loaded) = 0 reads
    return this.checkArticleNameExists(article.name).pipe(
      mergeMap(isDuplicate => {
        if (isDuplicate) {
          return of({ success: false, isDuplicate: true });
        }

        return this.createArticle(article).pipe(
          map(createdArticle => ({
            success: true,
            article: createdArticle
          })),
          catchError(error => {
            this.logger.error('data', 'Error creating article', error);
            return of({
              success: false,
              error: 'Fehler beim Erstellen des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error checking duplicates', error);
        return of({
          success: false,
          error: 'Fehler beim Prüfen auf Duplikate'
        });
      })
    );
  }

  updateArticleWithDuplicateCheck(
    id: string, 
    updates: Partial<Article>
  ): Observable<{
    success: boolean;
    article?: Article;
    isDuplicate?: boolean;
    error?: string;
  }> {
    if (!updates.name) {
      return this.updateArticle(id, updates).pipe(
        map(updatedArticle => ({
          success: !!updatedArticle,
          article: updatedArticle || undefined,
          error: updatedArticle ? undefined : 'Fehler beim Aktualisieren'
        }))
      );
    }

    // QUOTA OPTIMIZATION: Use local state for duplicate check (0 reads)
    // Before: called getAllArticlesFromFirebase() = 453 reads per article update!
    // After: uses getArticles() observable (already loaded) = 0 reads
    return this.checkArticleNameExists(updates.name, id).pipe(
      mergeMap(isDuplicate => {
        if (isDuplicate) {
          return of({ success: false, isDuplicate: true });
        }

        return this.updateArticle(id, updates).pipe(
          map(updatedArticle => ({
            success: !!updatedArticle,
            article: updatedArticle || undefined,
            error: updatedArticle ? undefined : 'Fehler beim Aktualisieren'
          })),
          catchError(error => {
            this.logger.error('data', 'Error updating article', error);
            return of({
              success: false,
              error: 'Fehler beim Aktualisieren des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error checking duplicates', error);
        return of({
          success: false,
          error: 'Fehler beim Prüfen auf Duplikate'
        });
      })
    );
  }

  // === UTILITY METHODS ===

  private async removeArticleFromAllLists(articleId: string): Promise<void> {
    const currentUserId = this.authService.getCurrentUserId();
    this.logger.info('data', `🗑️ Removing article ${articleId} from all lists (current user: ${currentUserId})`);

    try {
      // Phase 8.2: Use Observable-based getLists() to avoid injection context issues
      const lists = await firstValueFrom(this.firebaseData.getLists());

      this.logger.info('data', `Found ${lists.length} total lists to check`);

      // Log list ownership breakdown
      const ownedLists = lists.filter(l => l.ownerId === currentUserId);
      const sharedLists = lists.filter(l => l.ownerId !== currentUserId);
      this.logger.info('data', `  - Owned lists: ${ownedLists.length}`);
      this.logger.info('data', `  - Shared lists (participant): ${sharedLists.length}`);

      let listsToUpdate = 0;
      let successfulUpdates = 0;
      let failedUpdates = 0;

      for (const list of lists) {
        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};
        const isOwner = list.ownerId === currentUserId;
        const isShared = list.sharedWith && list.sharedWith.length > 0;

        if (articleIds.includes(articleId) || itemStates[articleId]) {
          listsToUpdate++;
          this.logger.info('data', `📋 Article found in ${isOwner ? 'OWNED' : 'SHARED'} list "${list.name}" (${list.id}), list owner: ${list.ownerId}${isShared ? `, shared with ${list.sharedWith?.length || 0} users` : ''}`);

          const newArticleIds = articleIds.filter(id => id !== articleId);
          const newItemStates = { ...itemStates };
          delete newItemStates[articleId];

          this.logger.debug('data', `  - Article IDs before: ${articleIds.length}, after: ${newArticleIds.length}`);
          this.logger.debug('data', `  - ItemStates before: ${Object.keys(itemStates).length}, after: ${Object.keys(newItemStates).length}`);

          try {
            await this.firebaseData.updateListInFirebase(list.id, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });

            successfulUpdates++;
            this.logger.info('data', `✅ Removed article from list "${list.name}"`);
          } catch (listError: any) {
            failedUpdates++;
            const errorMsg = listError?.message || String(listError);
            this.logger.error('data', `❌ Failed to remove article from list "${list.name}": ${errorMsg}`);

            // Log additional context for debugging
            this.logger.error('data', `  - List ID: ${list.id}`);
            this.logger.error('data', `  - List owner: ${list.ownerId}`);
            this.logger.error('data', `  - Current user: ${currentUserId}`);
            this.logger.error('data', `  - Is owner: ${isOwner}`);
            this.logger.error('data', `  - Is shared: ${isShared}`);
            this.logger.error('data', `  - Error type: ${listError?.code || 'unknown'}`);

            throw listError; // Re-throw to stop deletion
          }
        }
      }

      if (listsToUpdate === 0) {
        this.logger.info('data', `Article ${articleId} is not in any lists`);
      } else {
        this.logger.info('data', `✅ Article cleanup complete: ${successfulUpdates} successful, ${failedUpdates} failed out of ${listsToUpdate} lists`);
      }
    } catch (error) {
      this.logger.error('data', 'Error removing article from lists', error);
      throw error; // Re-throw the error so deletion fails properly
    }
  }

  deleteArticleAndCleanupLists(articleId: string): Observable<{
    success: boolean;
    activeInLists?: string[];
    error?: string;
  }> {
    // Phase 8.2: Directly remove from lists and delete article without NgRx actions
    // This avoids race conditions and duplicate operations from action dispatches
    this.logger.info('data', `Starting deletion process for article ${articleId}`);

    return from(this.removeArticleFromAllLists(articleId)).pipe(
      mergeMap(() => {
        // After removing from lists, delete the article document
        this.logger.info('data', 'Lists updated, now deleting article document');
        return from(this.firebaseData.deleteArticleInFirebase(articleId));
      }),
      mergeMap(() => {
        // Trigger immediate cleanup after successful deletion
        this.logger.info('data', 'Article deleted, running cleanup');
        return from(this.dataMigrationService.quickCleanupOrphanedReferences());
      }),
      map(() => {
        // Update local state immediately for UI responsiveness
        const currentArticles = this.firebaseData.getCurrentArticles();
        const updatedArticles = currentArticles.filter(a => a.id !== articleId);
        this.firebaseData.updateLocalArticles(updatedArticles);
        this.logger.info('data', '✅ Article deletion completed successfully');
        return { success: true };
      }),
      catchError(error => {
        this.logger.error('data', '❌ Article deletion failed', error);
        return of({
          success: false,
          error: error.message || 'Fehler beim Löschen des Artikels'
        });
      })
    );
  }

  getListsContainingArticle(articleId: string): Observable<any[]> {
    return this.firebaseData.getLists().pipe(
      map(lists => lists.filter(list => list.articleIds.includes(articleId)))
    );
  }

  getListsWithActiveArticle(articleId: string): Observable<any[]> {
    return this.firebaseData.getLists().pipe(
      map(lists => lists.filter(list => {
        const isInList = list.articleIds.includes(articleId);
        const itemState = list.itemStates[articleId];
        const isActive = isInList && (!itemState || !itemState.isChecked);
        return isActive;
      }))
    );
  }

  private removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.filter(id => id !== articleId);
        const newItemStates = { ...list.itemStates };
        delete newItemStates[articleId];

        if (!this.connectionService.isOnline()) {
          // Update local state
          const currentLists = this.firebaseData.getCurrentLists();
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { 
              ...l, 
              articleIds: newArticleIds, 
              itemStates: newItemStates, 
              updatedAt: new Date() 
            } : l
          );
          this.firebaseData.updateLocalLists(updatedLists);
        
          // Queue for sync
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Remove article ${articleId} from list ${listId}`);
        } else {
          this.firebaseData.updateListInFirebase(listId, {
            articleIds: newArticleIds,
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
      }),
      catchError(error => {
        this.logger.error('data', 'Error removing article from list', error);
        return of(false);
      })
    );
  }
}