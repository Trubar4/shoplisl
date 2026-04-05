import { Injectable } from '@angular/core';

import { Article, ShoppingList } from '../models';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';
import { AuthService } from './auth.service';

/**
 * Context provided by FirebaseDataService so that FirebaseDataLoaderService can
 * access and update the facade's BehaviorSubjects and backing arrays without
 * holding direct references to them.
 */
export interface DataLoaderContext {
  /** Current value of articlesSubject. */
  getArticlesSnapshot(): Article[];
  /** Emit a new value on articlesSubject. */
  emitArticles(articles: Article[]): void;
  /** Current value of listsSubject. */
  getListsSnapshot(): ShoppingList[];
  /** Emit a new value on listsSubject. */
  emitLists(lists: ShoppingList[]): void;
  /** Live reference to the owned-articles backing array. */
  getOwnedArticles(): Article[];
  setOwnedArticles(articles: Article[]): void;
  /** Live reference to the shared-articles backing array. */
  getSharedArticles(): Article[];
  setSharedArticles(articles: Article[]): void;
  /** Delegate to FirebaseListenerService.setupRealtimeListeners(). */
  setupRealtimeListeners(): void;
  /**
   * Mark the initial data load as complete and record which user was loaded.
   * The facade uses this to skip duplicate loads triggered by the auth listener.
   */
  markInitialLoadDone(userId: string | null): void;
  /** Forward refresh status to the facade's refreshStatusSubject. */
  notifyRefreshStatus(status: { isRefreshing: boolean; message?: string }): void;
}

/**
 * FirebaseDataLoaderService
 *
 * Handles the initial data-loading lifecycle extracted from FirebaseDataService.
 *
 * Extracted methods:
 *   - initializeDataLoading
 *   - loadFreshData  (public — also called by facade on auth change)
 *   - loadCachedData (public — also called by facade from loadDataEmergency / refreshData)
 *
 * Owned state: none — all state lives in the facade and is accessed via context.
 */
@Injectable({
  providedIn: 'root'
})
export class FirebaseDataLoaderService {

  private ctx: DataLoaderContext | null = null;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService,
    private authService: AuthService
  ) {}

  setContext(ctx: DataLoaderContext): void {
    this.ctx = ctx;
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Called from the facade constructor.
   * Determines whether to show cached data or set up real-time listeners
   * based on the current connection status.
   */
  initializeDataLoading(): void {
    const currentStatus = this.connectionService.getCurrentStatus();

    if (currentStatus.isOnline) {
      this.logger.info('data', 'Initially online - loading fresh data');
      this.loadFreshData();
    } else {
      this.logger.info('data', 'Initially offline - loading cached data');
      this.loadCachedData();
    }

    this.connectionService.getConnectionStatus().subscribe(status => {
      const currentTime = Date.now();
      const statusChangeTime = status.lastOnlineAt?.getTime() || 0;

      if (Math.abs(currentTime - statusChangeTime) < 1000 && status.isOnline) {
        this.logger.info('data', 'Connection restored - refreshing data');
        this.loadFreshData();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // FRESH DATA (online path)
  // ---------------------------------------------------------------------------

  async loadFreshData(): Promise<void> {
    this.logger.debug('data', 'Loading fresh data from Firebase');

    try {
      // Show cached data immediately for instant UX
      this.loadCachedData();

      this.ctx!.notifyRefreshStatus({ isRefreshing: true, message: 'Aktualisiere Daten...' });

      // Set up real-time listeners for fresh data
      this.ctx!.setupRealtimeListeners();

      // Mark initial load as done so the auth listener skips the duplicate load
      this.ctx!.markInitialLoadDone(this.authService.getCurrentUserId());

      setTimeout(() => {
        this.ctx!.notifyRefreshStatus({ isRefreshing: false });
      }, 2000);
    } catch (error) {
      this.logger.error('data', 'Failed to load fresh data, falling back to cache', error);
      this.ctx!.notifyRefreshStatus({ isRefreshing: false });
      this.loadCachedData();
    }
  }

  // ---------------------------------------------------------------------------
  // CACHED DATA (offline / instant-UX path)
  // ---------------------------------------------------------------------------

  loadCachedData(): void {
    const isOffline = !this.connectionService.getCurrentStatus().isOnline;
    const currentArticles = this.ctx!.getArticlesSnapshot();
    const currentLists = this.ctx!.getListsSnapshot();

    this.logger.info('cache', `[loadCachedData] offline=${isOffline}, currentArticles=${currentArticles.length}, currentLists=${currentLists.length}`);

    // Load articles from cache if subject is empty OR if offline (safety net:
    // when offline the cache is the only data source, so always prefer it over
    // an accidentally-emptied subject).
    if (currentArticles.length === 0 || (isOffline && currentArticles.length === 0)) {
      const articlesCache = this.cacheService.getCachedArticles();
      this.logger.info('cache', `[loadCachedData] articlesCache: hasData=${!!articlesCache.data}, count=${articlesCache.data?.length ?? 0}, hasCache=${articlesCache.status.hasCache}, expired=${articlesCache.status.isExpired}`);
      if (articlesCache.data && articlesCache.data.length > 0) {
        this.logger.info('cache', `Loaded ${articlesCache.data.length} articles from cache (${this.cacheService.formatAge(articlesCache.status.age)})`);
        this.ctx!.emitArticles(articlesCache.data);
        // Populate ownedArticles/sharedArticles so mergeArticles() doesn't overwrite cached data
        const currentUserId = this.authService.getCurrentUserId();
        if (currentUserId) {
          this.ctx!.setOwnedArticles(articlesCache.data.filter(a => a.ownerId === currentUserId));
          this.ctx!.setSharedArticles(articlesCache.data.filter(a => a.ownerId !== currentUserId));
          this.logger.debug('cache', `Populated from cache: ${this.ctx!.getOwnedArticles().length} owned, ${this.ctx!.getSharedArticles().length} shared`);
        }
      } else {
        this.logger.warn('cache', `No articles in cache (data=${articlesCache.data === null ? 'null' : 'empty array'})`);
        this.ctx!.emitArticles([]);
      }
    } else {
      this.logger.info('cache', `[loadCachedData] Skipping articles - already have ${currentArticles.length} in subject`);
    }

    if (currentLists.length === 0) {
      const listsCache = this.cacheService.getCachedLists();
      this.logger.info('cache', `[loadCachedData] listsCache: hasData=${!!listsCache.data}, count=${listsCache.data?.length ?? 0}`);
      if (listsCache.data) {
        this.logger.info('cache', `Loaded ${listsCache.data.length} lists from cache (${this.cacheService.formatAge(listsCache.status.age)})`);
        this.ctx!.emitLists(listsCache.data);
      } else {
        this.logger.warn('cache', 'No lists in cache');
        this.ctx!.emitLists([]);
      }
    }
  }
}
