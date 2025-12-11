import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
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

  // Phase 8: ownerId is added automatically by the service, so callers don't need to provide it
  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>): Observable<Article> {
    // Phase 8: Get current user ID for ownership
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      throw new Error('User must be authenticated to create an article');
    }

    const articleData = {
      name: article.name,
      amount: article.amount || '',
      notes: article.notes || '',
      icon: article.icon || '📦',
      categoryId: article.categoryId || '',
      departmentId: article.departmentId || '',
      availableInShops: article.availableInShops || [],
      usageCount: article.usageCount || 0,
      ownerId: currentUserId,  // Phase 8: Set article owner
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: Article creation will be synced when online');
      
      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tempArticle: Article = {
        id: tempId,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        ownerId: currentUserId,  // Phase 8: Include owner in temp article
        createdAt: new Date(),
        updatedAt: new Date()
      };
    
      // Update local state immediately
      const currentArticles = this.firebaseData.getArticles().pipe(map(articles => articles)).subscribe().unsubscribe;
      this.firebaseData.getArticles().subscribe(currentArticles => {
        const updatedArticles = [...currentArticles, tempArticle];
        this.firebaseData.updateLocalArticles(updatedArticles);
      }).unsubscribe();
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.createArticleInFirebase(articleData);
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
        ownerId: currentUserId,  // Phase 8: Include owner in returned article
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

    return from(this.firebaseData.updateArticleInFirebase(id, updateData)).pipe(
      map(() => {
        // Get updated article from local state
        return this.firebaseData.getArticles().pipe(
          map(articles => articles.find(a => a.id === id))
        );
      }),
      mergeMap(result => result),
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
      map(() => true),
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
    if (!this.connectionService.isOnline()) {
      // For offline, just check current state
      return this.checkArticleNameExists(article.name).pipe(
        mergeMap(isDuplicate => {
          if (isDuplicate) {
            return of({ success: false, isDuplicate: true });
          }
          
          return this.createArticle(article).pipe(
            map(createdArticle => ({
              success: true,
              article: createdArticle
            }))
          );
        })
      );
    }

    return from(this.firebaseData.getAllArticlesFromFirebase()).pipe(
      mergeMap(articles => {
        const trimmedName = article.name.trim().toLowerCase();
        const duplicate = articles.some(existingArticle => 
          existingArticle.name.trim().toLowerCase() === trimmedName
        );

        if (duplicate) {
          return of({
            success: false,
            isDuplicate: true
          });
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

    if (!this.connectionService.isOnline()) {
      // For offline, just check current state
      return this.checkArticleNameExists(updates.name, id).pipe(
        mergeMap(isDuplicate => {
          if (isDuplicate) {
            return of({ success: false, isDuplicate: true });
          }
          
          return this.updateArticle(id, updates).pipe(
            map(updatedArticle => ({
              success: !!updatedArticle,
              article: updatedArticle || undefined
            }))
          );
        })
      );
    }

    return from(this.firebaseData.getAllArticlesFromFirebase()).pipe(
      mergeMap(articles => {
        const trimmedName = updates.name!.trim().toLowerCase();
        const duplicate = articles.some(article => 
          article.id !== id && article.name.trim().toLowerCase() === trimmedName
        );

        if (duplicate) {
          return of({
            success: false,
            isDuplicate: true
          });
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
    try {
      const lists = await this.firebaseData.getAllListsFromFirebase();
      
      for (const list of lists) {
        const articleIds = list.articleIds || [];
        const itemStates = list.itemStates || {};
        
        if (articleIds.includes(articleId) || itemStates[articleId]) {
          const newArticleIds = articleIds.filter(id => id !== articleId);
          const newItemStates = { ...itemStates };
          delete newItemStates[articleId];
          
          await this.firebaseData.updateListInFirebase(list.id, {
            articleIds: newArticleIds,
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
          
          this.logger.debug('data', `Removed article from list "${list.name}"`);
        }
      }
    } catch (error) {
      this.logger.error('data', 'Error removing article from lists', error);
    }
  }

  deleteArticleAndCleanupLists(articleId: string): Observable<{
    success: boolean;
    activeInLists?: string[];
    error?: string;
  }> {
    return this.getListsWithActiveArticle(articleId).pipe(
      mergeMap(activeInLists => {
        if (activeInLists.length > 0) {
          return of({
            success: false,
            activeInLists: activeInLists.map(list => list.name)
          });
        }

        return this.getListsContainingArticle(articleId).pipe(
          mergeMap(allLists => {
            // Remove from all lists first, then delete article
            const removePromises = allLists.map(list => 
              this.removeArticleFromList(list.id, articleId).toPromise()
            );

            return from(Promise.all(removePromises)).pipe(
              mergeMap(() => {
                return this.deleteArticle(articleId).pipe(
                  map(deleteSuccess => ({
                    success: deleteSuccess,
                    error: deleteSuccess ? undefined : 'Fehler beim Löschen des Artikels'
                  }))
                );
              })
            );
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error in deleteArticleAndCleanupLists', error);
        return of({
          success: false,
          error: 'Unerwarteter Fehler beim Löschen'
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