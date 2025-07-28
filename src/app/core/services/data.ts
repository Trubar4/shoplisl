import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of, combineLatest } from 'rxjs';
import { map, catchError, mergeMap, take, tap, switchMap } from 'rxjs/operators';
// Direct Firebase imports (more reliable in StackBlitz)
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';

import { Article, ArticleCategory, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';
import { DEFAULT_DEPARTMENT_ORDER } from '../models';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private firestore: any;
  // Fixed shared user ID - all devices use the same one
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';
  
  // Reactive subjects for real-time updates
  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);
  
  // Loading states
  private articlesLoadingSubject = new BehaviorSubject<boolean>(false);
  private listsLoadingSubject = new BehaviorSubject<boolean>(false);
  
  // Unsubscribe functions for real-time listeners
  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService
  ) {
    console.log('🔥 Initializing DataService with connection-first strategy...');
    
    // Initialize Firebase directly (bypasses AngularFire issues in StackBlitz)
    try {
      const app = initializeApp(environment.firebase);
      this.firestore = getFirestore(app);
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      return;
    }
    
    console.log('👥 Using shared user ID:', this.SHARED_USER_ID);
    
    // Initialize data loading based on connection status
    this.initializeDataLoading();
  }

  private initializeDataLoading(): void {
    // Monitor connection status and load data accordingly
    this.connectionService.getConnectionStatus().subscribe(status => {
      if (status.isOnline) {
        console.log('🌐 Connection available - loading fresh data');
        this.loadFreshData();
      } else {
        console.log('📱 Offline - attempting to load cached data');
        this.loadCachedData();
      }
    });
  }

  private async loadFreshData(): Promise<void> {
    console.log('🔄 Loading fresh data from Firebase...');
    
    try {
      // Set up real-time listeners for fresh data
      this.setupRealtimeListeners();
      
      // Also run migrations if needed
      this.handleDepartmentOrderMigration();
      this.handleDataMigration();
      
    } catch (error) {
      console.error('❌ Failed to load fresh data, falling back to cache:', error);
      this.loadCachedData();
    }
  }

  private loadCachedData(): void {
    console.log('💾 Loading data from cache...');
    
    // Load articles from cache
    const articlesCache = this.cacheService.getCachedArticles();
    if (articlesCache.data) {
      console.log(`📦 Loaded ${articlesCache.data.length} articles from cache (${this.cacheService.formatAge(articlesCache.status.age)})`);
      this.articlesSubject.next(articlesCache.data);
    } else {
      console.log('❌ No articles in cache');
      this.articlesSubject.next([]);
    }

    // Load lists from cache  
    const listsCache = this.cacheService.getCachedLists();
    if (listsCache.data) {
      console.log(`📋 Loaded ${listsCache.data.length} lists from cache (${this.cacheService.formatAge(listsCache.status.age)})`);
      this.listsSubject.next(listsCache.data);
    } else {
      console.log('❌ No lists in cache');
      this.listsSubject.next([]);
    }
  }

  private setupRealtimeListeners(): void {
    if (!this.firestore) {
      console.error('Firestore not initialized');
      return;
    }

    // Clean up existing listeners
    this.cleanupListeners();

    try {
      // Articles real-time listener - now using shared user
      const articlesRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`);
      const articlesQuery = query(articlesRef, orderBy('name'));
      
      this.articlesUnsubscribe = onSnapshot(articlesQuery, 
        (snapshot) => {
          console.log('📱 Fresh articles received:', snapshot.size);
          const articles: Article[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            articles.push({
              id: doc.id,
              name: data['name'],
              amount: data['amount'],
              notes: data['notes'],
              icon: data['icon'],
              categoryId: data['categoryId'],
              departmentId: data['departmentId'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              availableInShops: data['availableInShops'] || [],
              usageCount: data['usageCount'] || 0
            });
          });
          
          // Update subjects with fresh data
          this.articlesSubject.next(articles);
          
          // Cache the fresh data
          this.cacheService.cacheArticles(articles);
        },
        (error) => {
          console.error('Articles listener error:', error);
          // On error, fall back to cached data
          this.loadCachedData();
        }
      );

      // Lists real-time listener - now using shared user
      const listsRef = collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));
      
      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          console.log('📋 Fresh lists received:', snapshot.size);
          const lists: ShoppingList[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            lists.push({
              id: doc.id,
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              articleIds: data['articleIds'] || [],
              itemStates: data['itemStates'] || {},
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            });
          });
          
          // Update subjects with fresh data
          this.listsSubject.next(lists);
          
          // Cache the fresh data
          this.cacheService.cacheLists(lists);
        },
        (error) => {
          console.error('Lists listener error:', error);
          // On error, fall back to cached data
          this.loadCachedData();
        }
      );
    } catch (error) {
      console.error('Error setting up listeners:', error);
      this.loadCachedData();
    }
  }

  private cleanupListeners(): void {
    if (this.articlesUnsubscribe) {
      this.articlesUnsubscribe();
      this.articlesUnsubscribe = undefined;
    }
    if (this.listsUnsubscribe) {
      this.listsUnsubscribe();
      this.listsUnsubscribe = undefined;
    }
  }

  // === CONNECTION-AWARE METHODS ===

  /**
   * Execute Firebase operation with offline fallback
   */
  private executeWithOfflineFallback<T>(
    operation: () => Promise<T>,
    fallbackValue: T,
    operationName: string
  ): Observable<T> {
    // If offline, return fallback immediately
    if (!this.connectionService.isOnline()) {
      console.log(`📱 Offline: ${operationName} skipped, using fallback`);
      return of(fallbackValue);
    }

    // If online, try the operation
    return from(operation()).pipe(
      catchError(error => {
        console.error(`❌ ${operationName} failed:`, error);
        return of(fallbackValue);
      })
    );
  }

  /**
   * Queue operations for when connection is restored
   */
  private queuedOperations: Array<() => Promise<any>> = [];

  private queueOperation(operation: () => Promise<any>): void {
    this.queuedOperations.push(operation);
    console.log(`📝 Queued operation (${this.queuedOperations.length} pending)`);

    // Process queue when connection is restored
    this.connectionService.getConnectionStatus().pipe(
      take(1)
    ).subscribe(status => {
      if (status.isOnline) {
        this.processQueuedOperations();
      }
    });
  }

  private async processQueuedOperations(): Promise<void> {
    if (this.queuedOperations.length === 0) return;

    console.log(`🔄 Processing ${this.queuedOperations.length} queued operations...`);
    
    const operations = [...this.queuedOperations];
    this.queuedOperations = [];

    for (const operation of operations) {
      try {
        await operation();
        console.log('✅ Queued operation completed');
      } catch (error) {
        console.error('❌ Queued operation failed:', error);
        // Re-queue failed operations
        this.queuedOperations.push(operation);
      }
    }

    if (this.queuedOperations.length > 0) {
      console.log(`⚠️ ${this.queuedOperations.length} operations still pending`);
    }
  }

  // === PUBLIC METHODS (Enhanced with offline support) ===
  
  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getArticlesLoading(): Observable<boolean> {
    return this.articlesLoadingSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    // First try to get from current state (might be cached)
    const currentArticles = this.articlesSubject.value;
    const cachedArticle = currentArticles.find(a => a.id === id);
    
    if (cachedArticle) {
      return of(cachedArticle);
    }

    // If not in current state and online, fetch from Firebase
    if (this.connectionService.isOnline()) {
      return from(getDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`))).pipe(
        map(docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data['name'],
              amount: data['amount'],
              notes: data['notes'],
              icon: data['icon'],
              categoryId: data['categoryId'],
              departmentId: data['departmentId'], 
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              availableInShops: data['availableInShops'] || [],
              usageCount: data['usageCount'] || 0
            } as Article;
          }
          return undefined;
        }),
        catchError(error => {
          console.error('Error getting article:', error);
          return of(undefined);
        })
      );
    }

    // Offline and not in cache
    return of(undefined);
  }

  createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<Article> {
    const articleData = {
      name: article.name,
      amount: article.amount || '',
      notes: article.notes || '',
      icon: article.icon || '📦',
      categoryId: article.categoryId || '',
      departmentId: article.departmentId || '',
      availableInShops: article.availableInShops || [],
      usageCount: article.usageCount || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: Article creation will be synced when online');
      // Generate temporary ID for offline creation
      const tempId = 'temp_' + Date.now();
      const tempArticle: Article = {
        id: tempId,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add to local state immediately
      const currentArticles = this.articlesSubject.value;
      this.articlesSubject.next([...currentArticles, tempArticle]);

      // Queue for sync when online
      this.queueOperation(async () => {
        const docRef = await addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`), articleData);
        // Real-time listener will handle the update
        return docRef;
      });

      return of(tempArticle);
    }

    return from(addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`), articleData)).pipe(
      map(docRef => ({
        id: docRef.id,
        ...article,
        amount: article.amount || '',
        notes: article.notes || '',
        icon: article.icon || '📦',
        createdAt: new Date(),
        updatedAt: new Date()
      } as Article)),
      catchError(error => {
        console.error('Error creating article:', error);
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
      console.log('📱 Offline: Article update will be synced when online');
      
      // Update local state immediately
      const currentArticles = this.articlesSubject.value;
      const updatedArticles = currentArticles.map(article => 
        article.id === id ? { ...article, ...updates, updatedAt: new Date() } : article
      );
      this.articlesSubject.next(updatedArticles);

      // Queue for sync when online
      this.queueOperation(async () => {
        return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`), updateData);
      });

      const updatedArticle = updatedArticles.find(a => a.id === id);
      return of(updatedArticle);
    }

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`), updateData)).pipe(
      map(() => {
        const currentArticles = this.articlesSubject.value;
        const article = currentArticles.find(a => a.id === id);
        return article ? { ...article, ...updates, updatedAt: new Date() } : undefined;
      }),
      catchError(error => {
        console.error('Error updating article:', error);
        return of(undefined);
      })
    );
  }

  deleteArticle(id: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: Article deletion will be synced when online');
      
      // Remove from local state immediately
      const currentArticles = this.articlesSubject.value;
      this.articlesSubject.next(currentArticles.filter(a => a.id !== id));

      // Queue for sync when online
      this.queueOperation(async () => {
        await this.removeArticleFromAllLists(id);
        return deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`));
      });

      return of(true);
    }

    return from(this.removeArticleFromAllLists(id)).pipe(
      mergeMap(() => {
        return from(deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/articles/${id}`)));
      }),
      map(() => true),
      catchError(error => {
        console.error('Error deleting article:', error);
        return of(false);
      })
    );
  }

  /**
   * Remove article from all lists before deletion (prevents orphaned references)
   */
  private async removeArticleFromAllLists(articleId: string): Promise<void> {
    try {
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      
      for (const listDoc of listsSnapshot.docs) {
        const data = listDoc.data();
        const articleIds = data['articleIds'] || [];
        const itemStates = data['itemStates'] || {};
        
        if (articleIds.includes(articleId) || itemStates[articleId]) {
          // Remove article from this list
          const newArticleIds = articleIds.filter((id: string) => id !== articleId);
          const newItemStates = { ...itemStates };
          delete newItemStates[articleId];
          
          await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listDoc.id}`), {
            articleIds: newArticleIds,
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
          
          console.log(`🧹 Removed article from list "${data['name']}"`);
        }
      }
    } catch (error) {
      console.error('Error removing article from lists:', error);
    }
  }

  // === LISTS METHODS (Enhanced with offline support) ===

  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getListsLoading(): Observable<boolean> {
    return this.listsLoadingSubject.asObservable();
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    // First try to get from current state (might be cached)
    const currentLists = this.listsSubject.value;
    const cachedList = currentLists.find(l => l.id === id);
    
    if (cachedList) {
      return of(cachedList);
    }

    // If not in current state and online, fetch from Firebase
    if (this.connectionService.isOnline()) {
      return from(getDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`))).pipe(
        map(docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              articleIds: data['articleIds'] || [],
              itemStates: data['itemStates'] || {},
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            } as ShoppingList;
          }
          return undefined;
        }),
        catchError(error => {
          console.error('Error getting list:', error);
          return of(undefined);
        })
      );
    }

    // Offline and not in cache
    return of(undefined);
  }

  createList(list: Omit<ShoppingList, 'id' | 'createdAt' | 'updatedAt'>): Observable<ShoppingList> {
    const listData = {
      ...list,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: List creation will be synced when online');
      
      const tempId = 'temp_' + Date.now();
      const tempList: ShoppingList = {
        id: tempId,
        ...list,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add to local state immediately
      const currentLists = this.listsSubject.value;
      this.listsSubject.next([...currentLists, tempList]);

      // Queue for sync when online
      this.queueOperation(async () => {
        const docRef = await addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`), listData);
        return docRef;
      });

      return of(tempList);
    }

    return from(addDoc(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`), listData)).pipe(
      map(docRef => ({
        id: docRef.id,
        ...list,
        createdAt: new Date(),
        updatedAt: new Date()
      } as ShoppingList)),
      catchError(error => {
        console.error('Error creating list:', error);
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
      console.log('📱 Offline: List update will be synced when online');
      
      // Update local state immediately
      const currentLists = this.listsSubject.value;
      const updatedLists = currentLists.map(list => 
        list.id === id ? { ...list, ...updates, updatedAt: new Date() } : list
      );
      this.listsSubject.next(updatedLists);

      // Queue for sync when online
      this.queueOperation(async () => {
        return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`), updateData);
      });

      const updatedList = updatedLists.find(l => l.id === id);
      return of(updatedList);
    }

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`), updateData)).pipe(
      map(() => {
        const currentLists = this.listsSubject.value;
        const list = currentLists.find(l => l.id === id);
        return list ? { ...list, ...updates, updatedAt: new Date() } : undefined;
      }),
      catchError(error => {
        console.error('Error updating list:', error);
        return of(undefined);
      })
    );
  }

  deleteList(id: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: List deletion will be synced when online');
      
      // Remove from local state immediately
      const currentLists = this.listsSubject.value;
      this.listsSubject.next(currentLists.filter(l => l.id !== id));

      // Queue for sync when online
      this.queueOperation(async () => {
        return deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`));
      });

      return of(true);
    }

    return from(deleteDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${id}`))).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error deleting list:', error);
        return of(false);
      })
    );
  }

  // === LIST ITEM METHODS (Enhanced with offline support) ===

  toggleItemChecked(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const currentState = list.itemStates[articleId]?.isChecked || false;
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
          // Update local state immediately
          const currentLists = this.listsSubject.value;
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { ...l, itemStates: newItemStates, updatedAt: new Date() } : l
          );
          this.listsSubject.next(updatedLists);

          // Queue for sync when online
          this.queueOperation(async () => {
            return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          });
        } else {
          updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
      }),
      catchError(error => {
        console.error('Error toggling item:', error);
        return of(false);
      })
    );
  }

  addArticleToList(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.includes(articleId) 
          ? list.articleIds 
          : [...list.articleIds, articleId];
          
        const newItemStates = {
          ...list.itemStates,
          [articleId]: { articleId, isChecked: false }
        };

        if (!this.connectionService.isOnline()) {
          // Update local state immediately
          const currentLists = this.listsSubject.value;
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { 
              ...l, 
              articleIds: newArticleIds, 
              itemStates: newItemStates, 
              updatedAt: new Date() 
            } : l
          );
          this.listsSubject.next(updatedLists);

          // Queue for sync when online
          this.queueOperation(async () => {
            return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          });
        } else {
          updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
            articleIds: newArticleIds,
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
      }),
      catchError(error => {
        console.error('Error adding article to list:', error);
        return of(false);
      })
    );
  }

  removeArticleFromList(listId: string, articleId: string): Observable<boolean> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return false;
        
        const newArticleIds = list.articleIds.filter(id => id !== articleId);
        const newItemStates = { ...list.itemStates };
        delete newItemStates[articleId];

        if (!this.connectionService.isOnline()) {
          // Update local state immediately
          const currentLists = this.listsSubject.value;
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { 
              ...l, 
              articleIds: newArticleIds, 
              itemStates: newItemStates, 
              updatedAt: new Date() 
            } : l
          );
          this.listsSubject.next(updatedLists);

          // Queue for sync when online
          this.queueOperation(async () => {
            return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
              articleIds: newArticleIds,
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          });
        } else {
          updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
            articleIds: newArticleIds,
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
      }),
      catchError(error => {
        console.error('Error removing article from list:', error);
        return of(false);
      })
    );
  }

  updateListItemAmount(listId: string, articleId: string, amount: string): Observable<boolean> {
    return this.getList(listId).pipe(
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
          const currentLists = this.listsSubject.value;
          const updatedLists = currentLists.map(l => 
            l.id === listId ? { ...l, itemStates: newItemStates, updatedAt: new Date() } : l
          );
          this.listsSubject.next(updatedLists);

          // Queue for sync when online
          this.queueOperation(async () => {
            return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
              itemStates: newItemStates,
              updatedAt: Timestamp.now()
            });
          });
        } else {
          updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
            itemStates: newItemStates,
            updatedAt: Timestamp.now()
          });
        }

        return true;
      }),
      catchError(error => {
        console.error('Error updating item amount:', error);
        return of(false);
      })
    );
  }

  clearAllItemsFromList(listId: string): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      // Update local state immediately
      const currentLists = this.listsSubject.value;
      const updatedLists = currentLists.map(l => 
        l.id === listId ? { 
          ...l, 
          articleIds: [], 
          itemStates: {}, 
          updatedAt: new Date() 
        } : l
      );
      this.listsSubject.next(updatedLists);

      // Queue for sync when online
      this.queueOperation(async () => {
        return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
          articleIds: [],
          itemStates: {},
          updatedAt: Timestamp.now()
        });
      });

      return of(true);
    }

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
      articleIds: [],
      itemStates: {},
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error clearing list:', error);
        return of(false);
      })
    );
  }

  // === UTILITY METHODS ===
  
  /**
   * Get the current shared user ID (useful for debugging)
   */
  getSharedUserId(): string {
    return this.SHARED_USER_ID;
  }

  /**
   * Force refresh data from server (useful for manual sync)
   */
  async refreshData(): Promise<void> {
    console.log('🔄 Manually refreshing shared data...');
    
    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: Cannot refresh, using cached data');
      this.loadCachedData();
      return;
    }

    try {
      // Process any queued operations first
      await this.processQueuedOperations();
      
      // Force refresh real-time listeners
      this.setupRealtimeListeners();
      
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      console.log(`📊 Current shared data: ${articlesSnapshot.size} articles, ${listsSnapshot.size} lists`);
    } catch (error) {
      console.error('Error refreshing data:', error);
      this.loadCachedData();
    }
  }

  /**
   * Get connection and cache status for debugging
   */
  getStatus(): {
    isOnline: boolean;
    queuedOperations: number;
    cacheStatus: any;
  } {
    return {
      isOnline: this.connectionService.isOnline(),
      queuedOperations: this.queuedOperations.length,
      cacheStatus: this.cacheService.getCacheStatus()
    };
  }

  // === EXISTING METHODS (keeping for backward compatibility) ===

  private async handleDataMigration(): Promise<void> {
    // ... existing migration code ...
  }

  private async migrateUserData(oldUserId: string): Promise<void> {
    // ... existing migration code ...
  }

  checkArticleNameExists(name: string, excludeId?: string): Observable<boolean> {
    return this.getArticles().pipe(
      map(articles => {
        const trimmedName = name.trim().toLowerCase();
        return articles.some(article => 
          article.id !== excludeId && 
          article.name.trim().toLowerCase() === trimmedName
        );
      })
    );
  }

  getListsContainingArticle(articleId: string): Observable<ShoppingList[]> {
    return this.getLists().pipe(
      map(lists => lists.filter(list => list.articleIds.includes(articleId)))
    );
  }

  getListsWithActiveArticle(articleId: string): Observable<ShoppingList[]> {
    return this.getLists().pipe(
      map(lists => lists.filter(list => {
        const isInList = list.articleIds.includes(articleId);
        const itemState = list.itemStates[articleId];
        const isActive = isInList && (!itemState || !itemState.isChecked);
        return isActive;
      }))
    );
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
        console.error('Error in deleteArticleAndCleanupLists:', error);
        return of({
          success: false,
          error: 'Unerwarteter Fehler beim Löschen'
        });
      })
    );
  }

  createArticleWithDuplicateCheck(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>): Observable<{
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

    return from(getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`))).pipe(
      mergeMap(snapshot => {
        const trimmedName = article.name.trim().toLowerCase();
        const duplicate = snapshot.docs.some(doc => {
          const data = doc.data();
          return data['name'].trim().toLowerCase() === trimmedName;
        });

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
            console.error('Error creating article:', error);
            return of({
              success: false,
              error: 'Fehler beim Erstellen des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        console.error('Error checking duplicates:', error);
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

    return from(getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`))).pipe(
      mergeMap(snapshot => {
        const trimmedName = updates.name!.trim().toLowerCase();
        const duplicate = snapshot.docs.some(doc => {
          const data = doc.data();
          return doc.id !== id && data['name'].trim().toLowerCase() === trimmedName;
        });

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
            console.error('Error updating article:', error);
            return of({
              success: false,
              error: 'Fehler beim Aktualisieren des Artikels'
            });
          })
        );
      }),
      catchError(error => {
        console.error('Error checking duplicates:', error);
        return of({
          success: false,
          error: 'Fehler beim Prüfen auf Duplikate'
        });
      })
    );
  }

  updateListDepartmentOrder(listId: string, departmentOrder: string[]): Observable<boolean> {
    if (!this.connectionService.isOnline()) {
      // Update local state immediately
      const currentLists = this.listsSubject.value;
      const updatedLists = currentLists.map(l => 
        l.id === listId ? { ...l, departmentOrder, updatedAt: new Date() } : l
      );
      this.listsSubject.next(updatedLists);

      // Queue for sync when online
      this.queueOperation(async () => {
        return updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
          departmentOrder: departmentOrder,
          updatedAt: Timestamp.now()
        });
      });

      return of(true);
    }

    return from(updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listId}`), {
      departmentOrder: departmentOrder,
      updatedAt: Timestamp.now()
    })).pipe(
      map(() => true),
      catchError(error => {
        console.error('Error updating department order:', error);
        return of(false);
      })
    );
  }

  getListDepartmentOrder(listId: string): Observable<string[]> {
    return this.getList(listId).pipe(
      map(list => {
        if (!list) return DEFAULT_DEPARTMENT_ORDER;
        return list.departmentOrder || DEFAULT_DEPARTMENT_ORDER;
      })
    );
  }

  async migrateDepartmentOrderToExistingLists(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      console.log('📱 Offline: Department order migration postponed');
      return;
    }

    console.log('🔄 Starting department order migration...');
    
    try {
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      
      let updatedCount = 0;
      let skippedCount = 0;
      
      for (const listDoc of listsSnapshot.docs) {
        const listData = listDoc.data();
        
        if (!listData['departmentOrder']) {
          await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listDoc.id}`), {
            departmentOrder: DEFAULT_DEPARTMENT_ORDER,
            updatedAt: Timestamp.now()
          });
          
          updatedCount++;
          console.log(`✅ Updated list "${listData['name']}" with default department order`);
        } else {
          skippedCount++;
          console.log(`⏭️ Skipped list "${listData['name']}" (already has department order)`);
        }
      }
      
      console.log(`🎉 Migration completed! Updated: ${updatedCount}, Skipped: ${skippedCount}`);
      await this.refreshData();
      
    } catch (error) {
      console.error('❌ Error during department order migration:', error);
    }
  }

  async checkIfDepartmentOrderMigrationNeeded(): Promise<boolean> {
    if (!this.connectionService.isOnline()) {
      return false;
    }

    try {
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      return listsSnapshot.docs.some(doc => {
        const data = doc.data();
        return !data['departmentOrder'];
      });
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  private async handleDepartmentOrderMigration(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      return;
    }

    try {
      const needsMigration = await this.checkIfDepartmentOrderMigrationNeeded();
      
      if (needsMigration) {
        console.log('🔄 Department order migration needed, starting...');
        await this.migrateDepartmentOrderToExistingLists();
      } else {
        console.log('✅ Department order migration not needed');
      }
    } catch (error) {
      console.error('Error checking migration status:', error);
    }
  }

  private async hasOrphanedReferences(): Promise<boolean> {
    if (!this.connectionService.isOnline()) {
      return false;
    }

    try {
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      
      const validArticleIds = new Set(articlesSnapshot.docs.map(doc => doc.id));
      
      for (const listDoc of listsSnapshot.docs) {
        const data = listDoc.data();
        const articleIds = data['articleIds'] || [];
        const itemStates = data['itemStates'] || {};
        
        const hasOrphanedArticleIds = articleIds.some((id: string) => !validArticleIds.has(id));
        const hasOrphanedItemStates = Object.keys(itemStates).some(id => !validArticleIds.has(id));
        
        if (hasOrphanedArticleIds || hasOrphanedItemStates) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for orphaned references:', error);
      return false;
    }
  }

  private async autoCleanupOrphanedReferences(): Promise<void> {
    if (!this.connectionService.isOnline()) {
      return;
    }

    try {
      const listsSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`));
      const articlesSnapshot = await getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/articles`));
      
      const validArticleIds = new Set(articlesSnapshot.docs.map(doc => doc.id));
      let cleanedCount = 0;
      
      for (const listDoc of listsSnapshot.docs) {
        const data = listDoc.data();
        const articleIds = data['articleIds'] || [];
        const itemStates = data['itemStates'] || {};
        
        const cleanedArticleIds = articleIds.filter((id: string) => validArticleIds.has(id));
        
        const cleanedItemStates: any = {};
        Object.entries(itemStates).forEach(([articleId, state]) => {
          if (validArticleIds.has(articleId)) {
            cleanedItemStates[articleId] = state;
          }
        });
        
        const articleIdsChanged = articleIds.length !== cleanedArticleIds.length;
        const itemStatesChanged = Object.keys(itemStates).length !== Object.keys(cleanedItemStates).length;
        
        if (articleIdsChanged || itemStatesChanged) {
          await updateDoc(doc(this.firestore, `users/${this.SHARED_USER_ID}/lists/${listDoc.id}`), {
            articleIds: cleanedArticleIds,
            itemStates: cleanedItemStates,
            updatedAt: Timestamp.now()
          });
          
          cleanedCount++;
          console.log(`🧹 Auto-cleaned "${data['name']}": ${articleIds.length}→${cleanedArticleIds.length} articles`);
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`✅ Auto-cleanup completed: ${cleanedCount} lists cleaned`);
      }
      
    } catch (error) {
      console.error('❌ Error during auto-cleanup:', error);
    }
  }

  forceRefreshLists(): Observable<ShoppingList[]> {
    return from(this.checkAndCleanupData()).pipe(
      mergeMap(() => {
        return from(getDocs(collection(this.firestore, `users/${this.SHARED_USER_ID}/lists`)));
      }),
      map(snapshot => {
        const lists: ShoppingList[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          lists.push({
            id: doc.id,
            name: data['name'],
            color: data['color'],
            icon: data['icon'],
            shopId: data['shopId'],
            articleIds: data['articleIds'] || [],
            itemStates: data['itemStates'] || {},
            departmentOrder: data['departmentOrder'],
            createdAt: data['createdAt']?.toDate() || new Date(),
            updatedAt: data['updatedAt']?.toDate() || new Date()
          });
        });
        this.listsSubject.next(lists.sort((a, b) => a.name.localeCompare(b.name)));
        return lists;
      })
    );
  }

  private async checkAndCleanupData(): Promise<void> {
    const hasOrphans = await this.hasOrphanedReferences();
    if (hasOrphans) {
      console.log('🔍 Orphaned references detected, auto-cleaning...');
      await this.autoCleanupOrphanedReferences();
    }
  }

  // === CLEANUP ===
  
  ngOnDestroy(): void {
    this.cleanupListeners();
  }
}