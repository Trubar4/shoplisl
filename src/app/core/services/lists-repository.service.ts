import { Injectable, Inject, forwardRef, Injector } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { Timestamp } from 'firebase/firestore';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ShoppingList, DEFAULT_DEPARTMENT_ORDER } from '../models';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';
import { HistoryService } from './history.service';
import { AuthService } from './auth.service';
import { ArticlesRepositoryService } from './articles-repository.service';
import { CopyArticleDialogComponent, CopyArticleDialogData, CopyArticleDialogResult } from '../../shared/components/copy-article-dialog/copy-article-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ListsRepositoryService {

  constructor(
    private firebaseData: FirebaseDataService,
    private offlineSync: OfflineSyncService,
    private connectionService: ConnectionService,
    private logger: LoggerService,
    private historyService: HistoryService,
    private authService: AuthService,
    @Inject(forwardRef(() => ArticlesRepositoryService)) private articlesRepository: ArticlesRepositoryService,
    private injector: Injector
  ) {}

  // === BASIC CRUD OPERATIONS ===

  // Phase 8: ownerId and sharedWith are added automatically by the service, so callers don't need to provide them
  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt' | 'ownerId' | 'sharedWith'>): Observable<ShoppingList> {
    // Phase 8: Get current user ID for ownership
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      throw new Error('User must be authenticated to create a list');
    }

    const listData = {
      ...list,
      ownerId: currentUserId,           // Phase 8: Set list owner
      sharedWith: [],                   // Phase 8: Initialize empty shared array
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: List creation will be synced when online');

      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tempList: ShoppingList = {
        id: tempId,
        ...list,
        ownerId: currentUserId,             // Phase 8: Include owner in temp list
        sharedWith: [],                     // Phase 8: Initialize empty shared array
        createdAt: new Date(),
        updatedAt: new Date()
      };
    
      // Update local state immediately
      const currentLists = this.firebaseData.getCurrentLists();
      const updatedLists = [...currentLists, tempList];
      this.firebaseData.updateLocalLists(updatedLists);
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.createListInFirebase(listData);
      }, `Create list: ${list.name}`);
    
      return of(tempList);
    }

    return from(this.firebaseData.createListInFirebase(listData)).pipe(
      map(docId => ({
        id: docId,
        ...list,
        ownerId: currentUserId,             // Phase 8: Include owner in returned list
        sharedWith: [],                     // Phase 8: Initialize empty shared array
        createdAt: new Date(),
        updatedAt: new Date()
      } as ShoppingList)),
      catchError(error => {
        this.logger.error('data', 'Error creating list', error);
        throw error;
      })
    );
  }

  updateList(id: string, updates: Partial<ShoppingList>): Observable<ShoppingList | undefined> {
    const updateData = {
      ...updates,
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: List update will be synced when online');
      
      // Update local state immediately
      const currentLists = this.firebaseData.getCurrentLists();
      const updatedLists = currentLists.map(list => 
        list.id === id ? { ...list, ...updates, updatedAt: new Date() } : list
      );
      this.firebaseData.updateLocalLists(updatedLists);
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.updateListInFirebase(id, updateData);
      }, `Update list: ${id}`);
    
      // Return updated list from local state
      return this.firebaseData.getLists().pipe(
        map(lists => lists.find(l => l.id === id))
      );
    }

    return from(this.firebaseData.updateListInFirebase(id, updateData)).pipe(
      map(() => {
        return this.firebaseData.getLists().pipe(
          map(lists => lists.find(l => l.id === id))
        );
      }),
      mergeMap(result => result),
      catchError(error => {
        this.logger.error('data', 'Error updating list', error);
        return of(undefined);
      })
    );
  }

  deleteList(id: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: List deletion will be synced when online');
      
      // Remove from local state immediately
      const currentLists = this.firebaseData.getCurrentLists();
      const updatedLists = currentLists.filter(l => l.id !== id);
      this.firebaseData.updateLocalLists(updatedLists);
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.deleteListInFirebase(id);
      }, `Delete list: ${id}`);
    
      return of(true);
    }

    return from(this.firebaseData.deleteListInFirebase(id)).pipe(
      map(() => true),
      catchError(error => {
        this.logger.error('data', 'Error deleting list', error);
        return of(false);
      })
    );
  }

  // === LIST ITEM OPERATIONS ===

  toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
    this.logger.debug('data', `TOGGLE-ITEM-CHECKED: ${listId}, ${articleId}`);
    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);

        const currentState = list.itemStates[articleId]?.isChecked || false;
        const newAction = currentState ? 'unchecked' : 'checked';
        const currentAmount = list.itemStates[articleId]?.amount || '';

        this.logger.debug('data', `TOGGLE: ${articleId} currently ${currentState ? 'CHECKED' : 'UNCHECKED'} -> ${newAction.toUpperCase()}`);

        // Phase 6: Use HistoryService to create updated state with history tracking
        const updatedItemState = this.historyService.createUpdatedItemState(
          list.itemStates[articleId],
          articleId,
          newAction,
          currentAmount
        );

        const newItemStates = {
          ...list.itemStates,
          [articleId]: updatedItemState
        };

        // Update local state immediately for optimistic UI
        this.logger.debug('data', 'TOGGLE: Updating local state');
        const currentLists = this.firebaseData.getCurrentLists();
        const updatedLists = currentLists.map(l =>
          l.id === listId ? {
            ...l,
            itemStates: newItemStates,
            updatedAt: new Date()
          } : l
        );

        const updatedList = updatedLists.find(l => l.id === listId);
        if (updatedList) {
          const newState = updatedList.itemStates[articleId]?.isChecked;
          this.logger.debug('data', `TOGGLE: Verified new state for ${articleId}: ${newState ? 'CHECKED' : 'UNCHECKED'}`);
        }

        this.firebaseData.updateLocalLists(updatedLists);

        if (!this.connectionService.isOnline()) {
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Toggle item ${articleId} in list ${listId}`);

          return of(true);
        }

        // Online - update Firebase directly and wait for completion
        this.logger.debug('data', 'TOGGLE: Online - updating Firebase');
        return from(this.firebaseData.updateListInFirebase(listId, {
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        })).pipe(
          map(() => {
            this.logger.debug('data', 'TOGGLE: Firebase update successful');
            return true;
          }),
          catchError(error => {
            this.logger.error('data', 'TOGGLE: Firebase update failed', error);
            return of(false);
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error toggling item', error);
        return of(false);
      })
    );
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    // Phase 8.2: Check if we need to create a local copy first
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.logger.error('data', 'User must be authenticated to add articles to list');
      return of(false);
    }

    this.logger.info('data', `📥 ADD ARTICLE: Starting to add article ${articleId} to list ${listId}`);

    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) {
          this.logger.error('data', `📥 ADD ARTICLE: List ${listId} not found`);
          return of(false);
        }

        this.logger.info('data', `📥 ADD ARTICLE: Found list "${list.name}" (owner: ${list.ownerId}, shared: ${list.sharedWith?.length || 0} users)`);

        // Get the article to check ownership
        const articles = this.firebaseData.getCurrentArticles();
        const article = articles.find(a => a.id === articleId);
        if (!article) {
          this.logger.error('data', `📥 ADD ARTICLE: Article ${articleId} not found`);
          return of(false);
        }

        this.logger.info('data', `📥 ADD ARTICLE: Found article "${article.name}" (owner: ${article.ownerId})`);

        // Phase 8.2: Check if we need to create a local copy
        // Copy is needed if:
        // 1. Article is NOT owned by current user, AND
        // 2. List is NOT shared (i.e., it's the user's own list)
        const isArticleOwnedByUser = article.ownerId === currentUserId;
        const isListShared = list.sharedWith && list.sharedWith.length > 0;
        const needsLocalCopy = !isArticleOwnedByUser && !isListShared;

        this.logger.info('data', `📥 ADD ARTICLE: Ownership check - Article owned by user: ${isArticleOwnedByUser}, List shared: ${isListShared}, Needs copy: ${needsLocalCopy}`);

        if (needsLocalCopy) {
          this.logger.info('data', `📥 ADD ARTICLE: Will create local copy of "${article.name}" (${articleId})`);
          // Phase 8.2: Show confirmation dialog before creating local copy
          return this.showCopyConfirmationDialog(article).pipe(
            mergeMap(confirmed => {
              if (!confirmed) {
                // User cancelled - don't add article
                this.logger.info('data', `📥 ADD ARTICLE: User cancelled creating local copy of "${article.name}"`);
                return of(false);
              }

              this.logger.info('data', `📥 ADD ARTICLE: Creating local copy of article "${article.name}" (${articleId})`);
              // Create local copy and use the copy's ID
              return this.articlesRepository.createLocalCopy(article).pipe(
                mergeMap(copiedArticle => {
                  this.logger.info('data', `📥 ADD ARTICLE: Local copy created with ID ${copiedArticle.id}, adding to list`);
                  // Add the copied article to the list instead of the original
                  return this.addArticleToListInternal(listId, copiedArticle.id, copiedArticle.name, list);
                })
              );
            })
          );
        } else {
          // Use original article (either user owns it, or list is shared)
          this.logger.info('data', `📥 ADD ARTICLE: Using original article "${article.name}" (${articleId})`);
          return this.addArticleToListInternal(listId, articleId, article.name, list);
        }
      }),
      catchError(error => {
        this.logger.error('data', '📥 ADD ARTICLE: Error adding article to list', error);
        return of(false);
      })
    );
  }

  /**
   * Internal method to add article to list (after copy decision is made)
   */
  private addArticleToListInternal(
    listId: string,
    articleId: string,
    articleName: string | undefined,
    list: ShoppingList
  ): Observable<boolean> {
    this.logger.info('data', `📝 ADD INTERNAL: Adding article ${articleId} ("${articleName}") to list ${listId}`);

    const isAlreadyInList = list.articleIds.includes(articleId);
    this.logger.info('data', `📝 ADD INTERNAL: Article already in list: ${isAlreadyInList}`);

    const newArticleIds = isAlreadyInList
      ? list.articleIds
      : [...list.articleIds, articleId];

    const newItemStates = {
      ...list.itemStates,
      [articleId]: {
        articleId,
        articleName,  // Store name for history display after deletion
        isChecked: false,
        amount: list.itemStates[articleId]?.amount || '',  // PRESERVE existing amount
        addedAt: list.itemStates[articleId]?.addedAt || new Date()  // Set addedAt only for new articles
      }
    };

    this.logger.info('data', `📝 ADD INTERNAL: New articleIds array length: ${newArticleIds.length}, contains ${articleId}: ${newArticleIds.includes(articleId)}`);

    // Update local state immediately for optimistic UI
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

    this.logger.info('data', `📝 ADD INTERNAL: Local state updated successfully`);

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', `📝 ADD INTERNAL: Offline - queueing Firebase update for article ${articleId}`);
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.updateListInFirebase(listId, {
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        });
      }, `Add article ${articleId} to list ${listId}`);

      return of(true);
    }

    // Online - update Firebase directly and wait for completion
    this.logger.info('data', `📝 ADD INTERNAL: Online - updating Firebase with articleIds: [${newArticleIds.join(', ')}]`);
    return from(this.firebaseData.updateListInFirebase(listId, {
      articleIds: newArticleIds,
      itemStates: newItemStates,
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => {
        this.logger.info('data', `📝 ADD INTERNAL: Firebase update successful for article ${articleId}`);
        return true;
      }),
      catchError(error => {
        this.logger.error('data', `📝 ADD INTERNAL: Error updating Firebase when adding article ${articleId}`, error);
        return of(false);
      })
    );
  }

  /**
   * Phase 8.2: Show confirmation dialog before creating local copy
   * Returns Observable<boolean> - true if user confirms, false if cancelled
   */
  private showCopyConfirmationDialog(article: any): Observable<boolean> {
    const dialog = this.injector.get(MatDialog);

    // Get owner email from auth service (or use ownerId as fallback)
    const ownerEmail = article.ownerId || 'einem anderen Benutzer';

    const dialogRef = dialog.open(CopyArticleDialogComponent, {
      width: '400px',
      data: {
        articleName: article.name,
        ownerEmail: ownerEmail
      } as CopyArticleDialogData
    });

    return from(firstValueFrom(dialogRef.afterClosed())).pipe(
      map((result: CopyArticleDialogResult | undefined) => {
        return result?.confirmed || false;
      })
    );
  }

  /**
   * Adds multiple articles to a list in a single batch operation
   * This avoids race conditions when adding multiple articles simultaneously
   * Phase 8.2: Now handles local copy creation for non-owned articles
   */
  addMultipleArticlesToList(listId: string, articleIds: string[]): Observable<boolean> {
    if (articleIds.length === 0) {
      return of(true);
    }

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.logger.error('data', 'User must be authenticated to add articles to list');
      return of(false);
    }

    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);

        // Get articles for ownership check and name lookup
        const articles = this.firebaseData.getCurrentArticles();
        const articlesMap = new Map(articles.map(a => [a.id, a]));

        // Phase 8.2: Check if list is shared
        const isListShared = list.sharedWith && list.sharedWith.length > 0;

        // Phase 8.2: Process each article to determine if we need copies
        const copyOperations: Observable<{originalId: string, finalId: string}>[] = [];

        articleIds.forEach(articleId => {
          const article = articlesMap.get(articleId);
          if (!article) {
            this.logger.warn('data', `Article ${articleId} not found, skipping`);
            copyOperations.push(of({originalId: articleId, finalId: articleId}));
            return;
          }

          const isArticleOwnedByUser = article.ownerId === currentUserId;
          const needsLocalCopy = !isArticleOwnedByUser && !isListShared;

          if (needsLocalCopy) {
            this.logger.info('data', `Creating local copy of article "${article.name}" for batch add`);
            copyOperations.push(
              this.articlesRepository.createLocalCopy(article).pipe(
                map(copiedArticle => ({originalId: articleId, finalId: copiedArticle.id}))
              )
            );
          } else {
            copyOperations.push(of({originalId: articleId, finalId: articleId}));
          }
        });

        // Execute all copy operations (or pass-through for owned articles)
        return from(copyOperations).pipe(
          mergeMap(obs => obs, 5), // Limit concurrent copy operations to 5
          toArray(),  // Wait for all to complete
          mergeMap(articleMappings => {
            // Get final article IDs (original or copied)
            const finalArticleIds = articleMappings.map(m => m.finalId);

            // Add all article IDs that aren't already in the list
            const existingIds = new Set(list.articleIds);
            const newIds = finalArticleIds.filter(id => !existingIds.has(id));
            const newArticleIds = [...list.articleIds, ...newIds];

            // Refresh articles map with newly created copies
            const updatedArticles = this.firebaseData.getCurrentArticles();
            const updatedArticlesMap = new Map(updatedArticles.map(a => [a.id, a]));

            // Create item states for all articles (using final IDs which may be copies)
            const newItemStates = { ...list.itemStates };
            finalArticleIds.forEach(articleId => {
              const article = updatedArticlesMap.get(articleId);
              const articleName = article?.name;

              if (!newItemStates[articleId]) {
                newItemStates[articleId] = {
                  articleId,
                  articleName,  // Store name for history display after deletion
                  isChecked: false,
                  amount: '',
                  addedAt: new Date()  // Set addedAt for new articles
                };
              } else {
                // If article already exists, reset to unchecked but preserve amount, name, and addedAt
                newItemStates[articleId] = {
                  ...newItemStates[articleId],
                  articleName: articleName || newItemStates[articleId].articleName,  // Update name if available
                  isChecked: false
                };
              }
            });

            // Update local state immediately for optimistic UI
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

            if (!this.connectionService.isOnline()) {
              // Queue for sync when online
              this.offlineSync.queueOperation(async () => {
                await this.firebaseData.updateListInFirebase(listId, {
                  articleIds: newArticleIds,
                  itemStates: newItemStates,
                  updatedAt: Timestamp.now()
                });
              }, `Add ${finalArticleIds.length} articles to list ${listId}`);

              return of(true);
            }

            // Online - update Firebase directly and wait for completion
            return from(this.firebaseData.updateListInFirebase(listId, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            })).pipe(
              map(() => true),
              catchError(error => {
                this.logger.error('data', `Error updating Firebase when adding ${finalArticleIds.length} articles`, error);
                return of(false);
              })
            );
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', `Error adding ${articleIds.length} articles to list`, error);
        return of(false);
      })
    );
  }

  /**
   * Marks multiple articles as checked in a single batch operation
   * This avoids race conditions when checking multiple articles simultaneously
   */
  markMultipleArticlesAsChecked(listId: string, articleIds: string[]): Observable<boolean> {
    if (articleIds.length === 0) {
      return of(true);
    }

    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);

        // Update item states for all articles with history tracking
        const newItemStates = { ...list.itemStates };

        articleIds.forEach(articleId => {
          const currentState = newItemStates[articleId]?.isChecked || false;
          // Only update if not already checked
          if (!currentState) {
            const currentAmount = newItemStates[articleId]?.amount || '';

            // Phase 6: Use HistoryService to create updated state with history tracking
            newItemStates[articleId] = this.historyService.createUpdatedItemState(
              newItemStates[articleId],
              articleId,
              'checked',
              currentAmount
            );
          }
        });

        // Update local state immediately for optimistic UI
        const currentLists = this.firebaseData.getCurrentLists();
        const updatedLists = currentLists.map(l =>
          l.id === listId ? {
            ...l,
            itemStates: newItemStates,
            updatedAt: new Date()
          } : l
        );
        this.firebaseData.updateLocalLists(updatedLists);

        if (!this.connectionService.isOnline()) {
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Mark ${articleIds.length} articles as checked in list ${listId}`);

          return of(true);
        }

        // Online - update Firebase directly and wait for completion
        return from(this.firebaseData.updateListInFirebase(listId, {
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        })).pipe(
          map(() => true),
          catchError(error => {
            this.logger.error('data', `Error updating Firebase when marking ${articleIds.length} articles as checked`, error);
            return of(false);
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', `Error marking ${articleIds.length} articles as checked`, error);
        return of(false);
      })
    );
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);
        
        const newArticleIds = list.articleIds.filter(id => id !== articleId);
        const newItemStates = { ...list.itemStates };
        delete newItemStates[articleId];

        // Update local state immediately for optimistic UI
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

        if (!this.connectionService.isOnline()) {
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Remove article ${articleId} from list ${listId}`);

          return of(true);
        }

        // Online - update Firebase directly and wait for completion
        return from(this.firebaseData.updateListInFirebase(listId, {
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        })).pipe(
          map(() => true),
          catchError(error => {
            this.logger.error('data', 'Error updating Firebase when removing article', error);
            return of(false);
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error removing article from list', error);
        return of(false);
      })
    );
  }

  /**
   * Removes multiple articles from a list in a single batch operation
   * This avoids race conditions when removing multiple articles simultaneously
   */
  removeMultipleArticlesFromList(listId: string, articleIds: string[]): Observable<boolean> {
    if (articleIds.length === 0) {
      return of(true);
    }

    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);

        // Remove all specified article IDs
        const idsToRemove = new Set(articleIds);
        const newArticleIds = list.articleIds.filter(id => !idsToRemove.has(id));

        // Remove item states for all deleted articles
        const newItemStates = { ...list.itemStates };
        articleIds.forEach(articleId => {
          delete newItemStates[articleId];
        });

        // Update local state immediately for optimistic UI
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

        if (!this.connectionService.isOnline()) {
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Remove ${articleIds.length} articles from list ${listId}`);

          return of(true);
        }

        // Online - update Firebase directly and wait for completion
        return from(this.firebaseData.updateListInFirebase(listId, {
          articleIds: newArticleIds,
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        })).pipe(
          map(() => true),
          catchError(error => {
            this.logger.error('data', `Error updating Firebase when removing ${articleIds.length} articles`, error);
            return of(false);
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', `Error removing ${articleIds.length} articles from list`, error);
        return of(false);
      })
    );
  }

  updateListItemAmount(listId: string, articleId: string, amount: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      mergeMap(list => {
        if (!list) return of(false);
        
        const newItemStates = {
          ...list.itemStates,
          [articleId]: {
            ...list.itemStates[articleId],
            articleId,
            amount: amount.trim()
          }
        };

        // Update local state immediately for optimistic UI
        const currentLists = this.firebaseData.getCurrentLists();
        const updatedLists = currentLists.map(l =>
          l.id === listId ? {
            ...l,
            itemStates: newItemStates,
            updatedAt: new Date()
          } : l
        );
        this.firebaseData.updateLocalLists(updatedLists);

        if (!this.connectionService.isOnline()) {
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Update amount for article ${articleId} in list ${listId}`);

          return of(true);
        }

        // Online - update Firebase directly and wait for completion
        return from(this.firebaseData.updateListInFirebase(listId, {
          itemStates: newItemStates,
          updatedAt: Timestamp.now()
        })).pipe(
          map(() => true),
          catchError(error => {
            this.logger.error('data', 'Error updating Firebase when updating item amount', error);
            return of(false);
          })
        );
      }),
      catchError(error => {
        this.logger.error('data', 'Error updating item amount', error);
        return of(false);
      })
    );
  }

  clearAllItemsFromList(listId: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      // Update local state immediately
      const currentLists = this.firebaseData.getCurrentLists();
      const updatedLists = currentLists.map(l => 
        l.id === listId ? { 
          ...l, 
          articleIds: [], 
          itemStates: {}, 
          updatedAt: new Date() 
        } : l
      );
      this.firebaseData.updateLocalLists(updatedLists);
    
      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.updateListInFirebase(listId, {
          articleIds: [],
          itemStates: {},
          updatedAt: Timestamp.now()
        });
      }, `Clear all items from list ${listId}`);
    
      return of(true);
    }

    return from(this.firebaseData.updateListInFirebase(listId, {
      articleIds: [],
      itemStates: {},
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => true),
      catchError(error => {
        this.logger.error('data', 'Error clearing list', error);
        return of(false);
      })
    );
  }

  // === DEPARTMENT ORDER OPERATIONS ===

  updateListDepartmentOrder(listId: string, departmentOrder: string[]): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      // Update local state immediately
      const currentLists = this.firebaseData.getCurrentLists();
      const updatedLists = currentLists.map(l => 
        l.id === listId ? { ...l, departmentOrder, updatedAt: new Date() } : l
      );
      this.firebaseData.updateLocalLists(updatedLists);

      // Queue for sync when online
      this.offlineSync.queueOperation(async () => {
        await this.firebaseData.updateListInFirebase(listId, {
          departmentOrder: departmentOrder,
          updatedAt: Timestamp.now()
        });
      }, `Update department order for list ${listId}`);

      return of(true);
    }

    return from(this.firebaseData.updateListInFirebase(listId, {
      departmentOrder: departmentOrder,
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => true),
      catchError(error => {
        this.logger.error('data', 'Error updating department order', error);
        return of(false);
      })
    );
  }

  getListDepartmentOrder(listId: string): Observable<string[]> {
    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return DEFAULT_DEPARTMENT_ORDER;
        return list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
      })
    );
  }

  // === UTILITY METHODS ===

  forceRefreshLists(): Observable<ShoppingList[]> {
    return from(this.firebaseData.getAllListsFromFirebase()).pipe(
      map(lists => {
        const sortedLists = lists.sort((a, b) => a.name.localeCompare(b.name));
        this.firebaseData.updateLocalLists(sortedLists);
        return sortedLists;
      }),
      catchError(error => {
        this.logger.error('data', 'Error force refreshing lists', error);
        return this.firebaseData.getLists();
      })
    );
  }

  getListsContainingArticle(articleId: string): Observable<ShoppingList[]> {
    return this.firebaseData.getLists().pipe(
      map(lists => lists.filter(list => list.articleIds.includes(articleId)))
    );
  }

  getListsWithActiveArticle(articleId: string): Observable<ShoppingList[]> {
    return this.firebaseData.getLists().pipe(
      map(lists => lists.filter(list => {
        const isInList = list.articleIds.includes(articleId);
        const itemState = list.itemStates[articleId];
        const isActive = isInList && (!itemState || !itemState.isChecked);
        return isActive;
      }))
    );
  }
}