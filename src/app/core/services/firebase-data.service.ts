import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of, Subject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where
} from '@angular/fire/firestore';

import { Article, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';
import { AuthService } from './auth.service';
import { QuotaMonitorService } from './quota-monitor.service';
import { ActiveListService } from './active-list.service';
import { HistoryService } from './history.service';
import { FirebaseMergeService } from './firebase-merge.service';
import { FirebaseWriteService } from './firebase-write.service';
import { FirebaseArticleLoaderService } from './firebase-article-loader.service';
import { FirebaseTransactionService } from './firebase-transaction.service';
import { FirebaseCrudService } from './firebase-crud.service';
import { FirebaseListenerService } from './firebase-listener.service';
import { FirebaseDataLoaderService } from './firebase-data-loader.service';

@Injectable({
  providedIn: 'root'
})
export class FirebaseDataService {
  private readonly SHARED_USER_ID = 'shared-shoplisl-user';

  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);

  // Phase 8: Separate tracking for owned and shared lists
  private ownedLists: ShoppingList[] = [];
  private sharedLists: ShoppingList[] = [];

  // Phase 8.2: Separate tracking for owned and shared articles
  private ownedArticles: Article[] = [];
  private sharedArticles: Article[] = [];

  // Performance: Background refresh status
  private refreshStatusSubject = new Subject<{ isRefreshing: boolean; message?: string }>();
  public refreshStatus$ = this.refreshStatusSubject.asObservable();

  // QUOTA OPTIMIZATION: Debounce mergeLists calls (1 s, was 200 ms)
  private mergeListsTimer: any = null;
  private readonly MERGE_LISTS_DEBOUNCE = 1000;

  // QUOTA FIX: Prevent double initialization
  private initialDataLoadDone = false;
  private currentLoadedUserId: string | null = null;

  // QUOTA OPTIMIZATION: Track if articles have been loaded from Firestore this session
  private articlesLoadedFromFirestore = false;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService,
    private authService: AuthService,
    private firestore: Firestore,
    private quotaMonitor: QuotaMonitorService,
    private activeListService: ActiveListService,
    private historyService: HistoryService,
    private mergeService: FirebaseMergeService,
    private writeService: FirebaseWriteService,
    private articleLoader: FirebaseArticleLoaderService,
    private transactionService: FirebaseTransactionService,
    private crudService: FirebaseCrudService,
    private listenerService: FirebaseListenerService,
    private dataLoader: FirebaseDataLoaderService
  ) {
    this.logger.info('data', 'Firebase Data Service initialized');

    // Wire article loader context
    this.articleLoader.setContext({
      getSharedLists: () => this.sharedLists,
      getOwnedLists: () => this.ownedLists,
      getSharedArticles: () => this.sharedArticles,
      setSharedArticles: (articles) => { this.sharedArticles = articles; },
      getOwnedArticles: () => this.ownedArticles,
      setOwnedArticles: (articles) => { this.ownedArticles = articles; },
      mergeArticles: () => this.mergeArticles()
    });

    // Wire transaction service context
    this.transactionService.setContext({
      getCurrentLists: () => this.getCurrentLists()
    });

    // Wire CRUD service context
    this.crudService.setContext({
      getCurrentLists: () => this.getCurrentLists(),
      pushOwnedArticle: (article) => { this.ownedArticles.push(article); },
      hasOwnedArticle: (id) => this.ownedArticles.some(a => a.id === id),
      mergeArticles: () => this.mergeArticles(),
      // Delegate to listener service which owns lastMergeWrite
      markMergeWrite: (listId) => this.listenerService.markMergeWrite(listId),
      pushOwnedList: (list) => { this.ownedLists.push(list); },
      mergeLists: () => this.mergeLists()
    });

    // Wire listener service context
    this.listenerService.setContext({
      getOwnedLists: () => this.ownedLists,
      setOwnedLists: (lists) => { this.ownedLists = lists; },
      getSharedLists: () => this.sharedLists,
      setSharedLists: (lists) => { this.sharedLists = lists; },
      getListsSnapshot: () => this.listsSubject.value,
      mergeLists: () => this.mergeLists(),
      loadCachedData: () => this.dataLoader.loadCachedData(),
      onListenersCleanedUp: () => {
        this.initialDataLoadDone = false;
        this.articlesLoadedFromFirestore = false;
        if (this.mergeListsTimer) {
          clearTimeout(this.mergeListsTimer);
          this.mergeListsTimer = null;
        }
      },
      pruneSharedArticles: (ids) => {
        const idSet = new Set(ids);
        const before = this.sharedArticles.length;
        this.sharedArticles = this.sharedArticles.filter(a => !idSet.has(a.id));
        const pruned = before - this.sharedArticles.length;
        if (pruned > 0) {
          this.logger.info('data',
            `🗑️ pruneSharedArticles: removed ${pruned} article(s) from sharedArticles backing array`);
        }
        this.articleLoader.evictFromCache(ids);
        this.mergeArticles();
      }
    });

    // Wire data loader context
    this.dataLoader.setContext({
      getArticlesSnapshot: () => this.articlesSubject.value,
      emitArticles: (articles) => this.articlesSubject.next(articles),
      getListsSnapshot: () => this.listsSubject.value,
      emitLists: (lists) => this.listsSubject.next(lists),
      getOwnedArticles: () => this.ownedArticles,
      setOwnedArticles: (articles) => { this.ownedArticles = articles; },
      getSharedArticles: () => this.sharedArticles,
      setSharedArticles: (articles) => { this.sharedArticles = articles; },
      setupRealtimeListeners: () => this.listenerService.setupRealtimeListeners(),
      markInitialLoadDone: (userId) => {
        this.initialDataLoadDone = true;
        this.currentLoadedUserId = userId;
      },
      notifyRefreshStatus: (status) => this.refreshStatusSubject.next(status)
    });

    this.dataLoader.initializeDataLoading();
    this.setupAuthListener();
    this.listenerService.setupActiveListListener();
  }

  // ---------------------------------------------------------------------------
  // AUTH LISTENER
  // ---------------------------------------------------------------------------

  /**
   * Listen for auth state changes and reload data when user changes.
   * QUOTA FIX: Skip reload if data was already loaded for the same user.
   */
  private setupAuthListener(): void {
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        const userId = user.id || user.email || null;
        if (this.initialDataLoadDone && this.currentLoadedUserId === userId) {
          this.logger.info('data', `Auth fired for same user ${user.email} - skipping duplicate load (saves ~500 reads)`);
          return;
        }

        this.logger.info('data', `User changed to ${user.email}, reloading data`);
        this.listenerService.cleanupListeners();
        this.dataLoader.loadFreshData();
        this.listenerService.setupActiveListListener();

        this.currentLoadedUserId = userId;
      } else {
        this.logger.info('data', 'User logged out, clearing data');
        this.listenerService.cleanupListeners();
        this.articlesSubject.next([]);
        this.listsSubject.next([]);
        this.currentLoadedUserId = null;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // USER-BASE PATH HELPER
  // ---------------------------------------------------------------------------

  private getUserBasePath(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No authenticated user, using shared user ID');
      return `users/${this.SHARED_USER_ID}`;
    }
    return `users-v2/${userId}`;
  }

  // ---------------------------------------------------------------------------
  // MERGE PIPELINE (owned state — must stay in facade)
  // ---------------------------------------------------------------------------

  /**
   * Phase 8: Merge owned and shared lists → listsSubject.
   * Called by listener service (via context) and by CRUD service (via context).
   * QUOTA OPTIMIZATION: Debounced to 1 s.
   */
  private mergeLists(): void {
    if (this.mergeListsTimer) {
      clearTimeout(this.mergeListsTimer);
    }
    this.mergeListsTimer = setTimeout(() => {
      this.executeMergeLists();
    }, this.MERGE_LISTS_DEBOUNCE);
  }

  private executeMergeLists(): void {
    const allLists = [...this.ownedLists, ...this.sharedLists];
    const uniqueLists = Array.from(
      new Map(allLists.map(list => [list.id, list])).values()
    );

    this.logger.debug('data', `Merged lists: ${this.ownedLists.length} owned + ${this.sharedLists.length} shared = ${uniqueLists.length} total`);

    this.listsSubject.next(uniqueLists);
    this.cacheService.cacheLists(uniqueLists);
  }

  /**
   * Phase 8.2: Merge owned and shared articles → articlesSubject.
   * Called by article loader (via context) and directly.
   */
  private mergeArticles(): void {
    // Prune shared articles that are no longer referenced by any shared list.
    // This handles the case where the owner deleted an article while the participant
    // was away (listener cleaned up), or when the article overview loads from cache
    // and the cache contains a now-deleted shared article.
    // Guard: only prune when shared lists have been loaded — otherwise sharedLists
    // is empty and every shared article would be incorrectly flagged as orphaned.
    if (this.sharedLists.length > 0) {
      const allListArticleIds = new Set(
        [...this.ownedLists, ...this.sharedLists].flatMap(l => l.articleIds || [])
      );
      const orphanedShared = this.sharedArticles.filter(a => !allListArticleIds.has(a.id));
      if (orphanedShared.length > 0) {
        this.logger.warn('data',
          `⚠️ mergeArticles: pruning ${orphanedShared.length} orphaned shared article(s) no longer on any list: ` +
          orphanedShared.map(a => `"${a.name}" (${a.id})`).join(', '));
        this.sharedArticles = this.sharedArticles.filter(a => allListArticleIds.has(a.id));
        this.articleLoader.evictFromCache(orphanedShared.map(a => a.id));
      }
    }

    const allArticles = [...this.ownedArticles, ...this.sharedArticles];
    const uniqueArticles = Array.from(
      new Map(allArticles.map(article => [article.id, article])).values()
    );

    this.logger.debug('data', `Merged articles: ${this.ownedArticles.length} owned + ${this.sharedArticles.length} shared = ${uniqueArticles.length} total`);

    this.articlesSubject.next(uniqueArticles);
    this.cacheService.cacheArticles(uniqueArticles);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — Observables
  // ---------------------------------------------------------------------------

  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    const localArticle = this.articlesSubject.value.find(a => a.id === id);

    if (localArticle) {
      this.logger.debug('data', `Found article "${localArticle.name}" in local state`);
      return of(localArticle);
    }

    if (this.connectionService.isOnline() && this.firestore) {
      const basePath = this.getUserBasePath();
      this.logger.debug('data', `Article ${id} not in local state, fetching from Firebase`);
      return from(getDoc(doc(this.firestore, `${basePath}/articles/${id}`))).pipe(
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
          this.logger.error('data', 'Error getting article from Firebase', error);
          return of(undefined);
        })
      );
    }

    this.logger.warn('data', `Article ${id} not found (offline)`);
    return of(undefined);
  }

  getList(id: string): Observable<ShoppingList | undefined> {
    const localList = this.listsSubject.value.find(l => l.id === id);

    if (localList) {
      this.logger.debug('data', `Found list "${localList.name}" in local state`);
      return of(localList);
    }

    if (this.connectionService.isOnline() && this.firestore) {
      const basePath = this.getUserBasePath();
      this.logger.debug('data', `List ${id} not in local state, fetching from Firebase`);
      return from(getDoc(doc(this.firestore, `${basePath}/lists/${id}`))).pipe(
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
              itemStates: this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {}),
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date()
            } as ShoppingList;
          }
          return undefined;
        }),
        catchError(error => {
          this.logger.error('data', 'Error getting list from Firebase', error);
          return of(undefined);
        })
      );
    }

    this.logger.warn('data', `List ${id} not found (offline)`);
    return of(undefined);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — FIREBASE CRUD DELEGATES
  // ---------------------------------------------------------------------------

  async createArticleInFirebase(articleData: any): Promise<string> {
    return this.crudService.createArticleInFirebase(articleData);
  }

  async updateArticleInFirebase(id: string, updateData: any): Promise<void> {
    return this.crudService.updateArticleInFirebase(id, updateData);
  }

  async deleteArticleInFirebase(id: string): Promise<void> {
    return this.crudService.deleteArticleInFirebase(id);
  }

  async createListInFirebase(listData: any): Promise<string> {
    return this.crudService.createListInFirebase(listData);
  }

  async updateListInFirebase(id: string, updateData: any): Promise<void> {
    return this.crudService.updateListInFirebase(id, updateData);
  }

  async deleteListInFirebase(id: string): Promise<void> {
    return this.crudService.deleteListInFirebase(id);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — TRANSACTION DELEGATES
  // ---------------------------------------------------------------------------

  /**
   * CRITICAL FIX: Update a single list item using a Firestore transaction.
   * Prevents race conditions where concurrent writes overwrite each other.
   */
  async updateListItemWithTransaction(
    listId: string,
    articleId: string,
    action: 'checked' | 'unchecked' | 'added',
    amount: string = '',
    userId?: string,
    userName?: string
  ): Promise<void> {
    return this.transactionService.updateListItemWithTransaction(
      listId, articleId, action, amount, userId, userName
    );
  }

  /**
   * SAFETY: Update itemStates only using a transaction.
   * Used for operations that don't modify articleIds.
   */
  async updateItemStatesWithTransaction(
    listId: string,
    itemStateUpdates: { [articleId: string]: any },
    operationDescription: string
  ): Promise<void> {
    return this.transactionService.updateItemStatesWithTransaction(
      listId, itemStateUpdates, operationDescription
    );
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — ARTICLE LOADING
  // ---------------------------------------------------------------------------

  /**
   * QUOTA OPTIMIZATION: Load all owned articles on demand.
   * Called by the article overview when it opens.
   * Skips if articles are already loaded this session.
   */
  loadAllOwnedArticles(): void {
    if (this.articlesLoadedFromFirestore) {
      this.logger.info('data', '⏭️ Articles already loaded from Firestore this session - skipping');
      return;
    }

    const lists = this.listsSubject.value;
    if (lists.length === 0) {
      this.logger.info('data', '⏳ No lists available yet - deferring article load');
      const sub = this.listsSubject.subscribe(loadedLists => {
        if (loadedLists.length > 0) {
          sub.unsubscribe();
          this.loadAllOwnedArticles();
        }
      });
      return;
    }

    const ownedLists = lists.filter(l => l.ownerId === this.authService.getCurrentUserId());
    const articleIdsOnLists = new Set<string>();
    ownedLists.forEach(list => {
      (list.articleIds || []).forEach(id => articleIdsOnLists.add(id));
    });

    if (articleIdsOnLists.size === 0) {
      this.logger.info('data', '📦 No articles on owned lists');
      this.articlesLoadedFromFirestore = true;
      return;
    }

    const articlesCache = this.cacheService.getCachedArticles();
    const existingArticles = this.articlesSubject.value;
    const existingArticleIds = new Set(existingArticles.map(a => a.id));
    const missingArticleIds = Array.from(articleIdsOnLists).filter(id => !existingArticleIds.has(id));

    if (!articlesCache.status.isExpired && missingArticleIds.length === 0) {
      this.articlesLoadedFromFirestore = true;
      const cacheAge = this.cacheService.formatAge(articlesCache.status.age);
      this.logger.info('data', `⏭️ Fresh cache has all ${articleIdsOnLists.size} articles (age: ${cacheAge}) - skipping Firestore`);
      this.ensureOwnedArticlesFromCache();
      // Run merge to prune any stale shared articles from cache
      // (e.g. deleted by owner since cache was written).
      this.mergeArticles();
      return;
    }

    this.articlesLoadedFromFirestore = true;
    this.ensureOwnedArticlesFromCache();

    if (missingArticleIds.length === 0) {
      this.logger.info('data', `⏭️ All ${articleIdsOnLists.size} articles already in cache - skipping Firestore load`);
      return;
    }

    const reason = articlesCache.status.isExpired ? 'cache expired' : 'missing articles';
    this.logger.info('data', `📦 Loading ${missingArticleIds.length} articles from Firestore (${reason})`);
    this.articleLoader.loadOwnedArticlesByIds(missingArticleIds);
  }

  /**
   * Ensure ownedArticles / sharedArticles are populated from articlesSubject.
   * Needed when cache loads before auth is ready.
   */
  private ensureOwnedArticlesFromCache(): void {
    if (this.ownedArticles.length > 0) return;

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) return;

    const allArticles = this.articlesSubject.value;
    this.ownedArticles = allArticles.filter(a => a.ownerId === currentUserId);
    this.sharedArticles = allArticles.filter(a => a.ownerId !== currentUserId);
    this.logger.debug('data', `📦 Populated from articlesSubject: ${this.ownedArticles.length} owned, ${this.sharedArticles.length} shared`);
  }

  async getArticlesForUser(userId: string): Promise<Article[]> {
    return this.crudService.getArticlesForUser(userId);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — BLOCKED EXPENSIVE METHODS
  // ---------------------------------------------------------------------------

  async getAllArticlesFromFirebase(): Promise<Article[]> {
    // 🚨 CRITICAL FIX: Blocked to prevent quota waste (~485 reads)
    this.logger.error('data', '🚨🚨🚨 getAllArticlesFromFirebase() CALLED - THIS IS EXPENSIVE! 🚨🚨🚨');
    this.logger.error('data', '📍 Stack trace:');
    console.trace();
    this.logger.error('data', '🚨 Returning empty array to prevent reads.');

    this.quotaMonitor.trackRead('getAllArticlesFromFirebase (BLOCKED)', 0, {
      blocked: true,
      message: 'This expensive method was blocked to prevent quota waste'
    });

    return [];
  }

  async getAllListsFromFirebase(): Promise<ShoppingList[]> {
    // 🚨 CRITICAL FIX: Blocked to prevent quota waste
    this.logger.error('data', '🚨🚨🚨 getAllListsFromFirebase() CALLED - THIS IS EXPENSIVE! 🚨🚨🚨');
    this.logger.error('data', '📍 Stack trace:');
    console.trace();
    this.logger.error('data', '🚨 Returning empty array to prevent reads.');

    this.quotaMonitor.trackRead('getAllListsFromFirebase (BLOCKED)', 0, {
      blocked: true,
      message: 'This expensive method was blocked to prevent quota waste'
    });

    return [];
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — EMERGENCY & UTILITY
  // ---------------------------------------------------------------------------

  async loadDataEmergency(): Promise<void> {
    this.logger.warn('data', 'Emergency data loading triggered');

    this.dataLoader.loadCachedData();

    const cachedArticles = this.articlesSubject.value;
    const cachedLists = this.listsSubject.value;

    if (cachedArticles.length > 0 || cachedLists.length > 0) {
      this.logger.info('data', `Loaded from cache: ${cachedArticles.length} articles, ${cachedLists.length} lists`);
      return;
    }

    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.info('data', 'Cache empty - setting up listeners to load fresh data');
      this.listenerService.setupRealtimeListeners();
    }
  }

  async refreshData(): Promise<void> {
    this.logger.info('data', 'Manually refreshing user data');

    if (!this.connectionService.isOnline()) {
      this.logger.warn('data', 'Offline: Cannot refresh, using cached data');
      this.dataLoader.loadCachedData();
      return;
    }

    try {
      this.listenerService.setupRealtimeListeners();
      this.logger.info('data', `Refresh triggered - listeners will load fresh data`);
    } catch (error) {
      this.logger.error('data', 'Error refreshing data', error);
      this.dataLoader.loadCachedData();
    }
  }

  getCurrentArticles(): Article[] {
    return this.articlesSubject.value;
  }

  getCurrentLists(): ShoppingList[] {
    return this.listsSubject.value;
  }

  /**
   * Synchronous local-state update after a Firestore write.
   * Prunes both backing arrays so that a subsequent mergeArticles() call
   * (triggered by any list listener) cannot restore deleted articles.
   */
  updateLocalArticles(articles: Article[]): void {
    const currentUserId = this.authService.getCurrentUserId();
    if (currentUserId) {
      const articleSet = new Set(articles.map(a => a.id));
      this.ownedArticles = this.ownedArticles.filter(a => articleSet.has(a.id));
      this.sharedArticles = this.sharedArticles.filter(a => articleSet.has(a.id));
    }
    this.articlesSubject.next(articles);
    this.cacheService.cacheArticles(articles);
  }

  updateLocalLists(lists: ShoppingList[]): void {
    this.listsSubject.next(lists);
    this.cacheService.cacheLists(lists);
  }

  getSharedUserId(): string {
    return this.SHARED_USER_ID;
  }

  isFirestoreReady(): boolean {
    return !!this.firestore;
  }

  ngOnDestroy(): void {
    this.listenerService.cleanupListeners();
  }
}
