import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError, mergeMap } from 'rxjs/operators';
import { Timestamp } from 'firebase/firestore';

import { ShoppingList, DEFAULT_DEPARTMENT_ORDER } from '../models';
import { FirebaseDataService } from './firebase-data.service';
import { OfflineSyncService } from './offline-sync.service';
import { ConnectionService } from './connection.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class ListsRepositoryService {

  constructor(
    private firebaseData: FirebaseDataService,
    private offlineSync: OfflineSyncService,
    private connectionService: ConnectionService,
    private logger: LoggerService
  ) {}

  // === BASIC CRUD OPERATIONS ===

  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt'>): Observable<ShoppingList> {
    const listData = {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      this.logger.info('data', 'Offline: List creation will be synced when online');
      
      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tempList: ShoppingList = {
        id: tempId,
        ...list,
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
      map(list => {
        if (!list) return false;
        
        const currentState = list.itemStates[articleId]?.isChecked || false;
        this.logger.debug('data', `TOGGLE: ${articleId} currently ${currentState ? 'CHECKED' : 'UNCHECKED'}`);
        
        const newItemStates = {
          ...list.itemStates,
          [articleId]: {
            ...list.itemStates[articleId],
            articleId,
            isChecked: !currentState,
            checkedAt: new Date()
          }
        };
  
        if (!this.connectionService.isOnline()) {
          this.logger.debug('data', 'TOGGLE: Offline - updating local state');
          
          // Update local state immediately
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
  
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Toggle item ${articleId} in list ${listId}`);
  
          return true;
        } else {
          // Online - update Firebase directly
          this.firebaseData.updateListInFirebase(listId, {
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }
  
        return true;
      }),
      catchError(error => {
        this.logger.error('data', 'Error toggling item', error);
        return of(false);
      })
    );
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.includes(articleId) 
          ? list.articleIds 
          : [...list.articleIds, articleId];
          
        const newItemStates = {
          ...list.itemStates,
          [articleId]: { 
            articleId, 
            isChecked: false,
            amount: list.itemStates[articleId]?.amount || ''  // PRESERVE existing amount
          }
        };

        if (!this.connectionService.isOnline()) {
          // Update local state immediately
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
        
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Add article ${articleId} to list ${listId}`);
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
        this.logger.error('data', 'Error adding article to list', error);
        return of(false);
      })
    );
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.filter(id => id !== articleId);
        const newItemStates = { ...list.itemStates };
        delete newItemStates[articleId];

        if (!this.connectionService.isOnline()) {
          // Update local state immediately
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
        
          // Queue for sync when online
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

  updateListItemAmount(listId: string, articleId: string, amount: string): Observable<boolean> {
    return this.firebaseData.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newItemStates = {
          ...list.itemStates,
          [articleId]: {
            ...list.itemStates[articleId],
            articleId,
            amount: amount.trim()
          }
        };

        if (!this.connectionService.isOnline()) {
          // Update local state immediately
          const currentLists = this.firebaseData.getCurrentLists();
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { 
              ...l, 
              itemStates: newItemStates, 
              updatedAt: new Date() 
            } : l
          );
          this.firebaseData.updateLocalLists(updatedLists);
        
          // Queue for sync when online
          this.offlineSync.queueOperation(async () => {
            await this.firebaseData.updateListInFirebase(listId, {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          }, `Update amount for article ${articleId} in list ${listId}`);
        } else {
          this.firebaseData.updateListInFirebase(listId, {
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
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