import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, of, Subject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  Firestore,
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
  where,
  collectionGroup,
  Timestamp,
  documentId
} from '@angular/fire/firestore';

import { Article, ShoppingList } from '../models';
import { environment } from '../../../environments/environment';
import { ConnectionService } from './connection.service';
import { OfflineCacheService } from './offline-cache.service';
import { LoggerService } from './logger.service';
import { AuthService } from './auth.service';
import { QuotaMonitorService } from './quota-monitor.service';

@Injectable({
  providedIn: 'root'
})
export class FirebaseDataService {
  private readonly SHARED_USER_ID = 'shared-shoplisl-user'; // Fallback for unauthenticated users

  private articlesSubject = new BehaviorSubject<Article[]>([]);
  private listsSubject = new BehaviorSubject<ShoppingList[]>([]);

  // Phase 8: Separate tracking for owned and shared lists
  private ownedLists: ShoppingList[] = [];
  private sharedLists: ShoppingList[] = [];

  // Phase 8.2: Separate tracking for owned and shared articles (fixes disappearing articles bug)
  private ownedArticles: Article[] = [];
  private sharedArticles: Article[] = [];

  // Performance: Background refresh status
  private refreshStatusSubject = new Subject<{ isRefreshing: boolean; message?: string }>();
  public refreshStatus$ = this.refreshStatusSubject.asObservable();

  // QUOTA OPTIMIZATION: Increased debounce from 200ms to 1000ms to reduce batch load frequency
  private mergeListsTimer: any = null;
  private readonly MERGE_LISTS_DEBOUNCE = 1000; // 1 second (was 200ms)

  // Performance: Prevent concurrent batch loads
  private isBatchLoading = false;

  // Performance: Cache loaded article IDs to prevent redundant queries
  private loadedSharedArticleIds = new Set<string>();

  // Performance: Track article IDs that failed to load (don't retry)
  private failedArticleIds = new Set<string>();

  // QUOTA OPTIMIZATION: Cache article owner mapping to prevent redundant queries
  // Maps articleId -> ownerId to avoid querying multiple collections
  private articleOwnerCache = new Map<string, string>();

  // QUOTA OPTIMIZATION: Track previous shared article IDs to avoid redundant batch loads
  private previousSharedArticleIds = new Set<string>();

  private articlesUnsubscribe?: () => void;
  private listsUnsubscribe?: () => void;
  private sharedListsUnsubscribe?: () => void;

  // QUOTA OPTIMIZATION: Smart polling - only when user is active
  // Massively reduces quota usage while maintaining reasonable sync
  private sharedListPollingTimer?: any;
  private readonly SHARED_LIST_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly ACTIVE_POLL_INTERVAL = 60000; // 1 minute when actively editing
  private lastSharedListUpdate = new Map<string, number>(); // listId -> timestamp
  private isPollingActive = false; // Prevent multiple timers
  private lastUserActivity = Date.now(); // Track user activity

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService,
    private authService: AuthService,
    private firestore: Firestore,
    private quotaMonitor: QuotaMonitorService
  ) {
    this.logger.info('data', 'Firebase Data Service initialized');
    this.initializeDataLoading();
    this.setupAuthListener();
  }

  /**
   * Listen for auth state changes and reload data when user changes
   */
  private setupAuthListener(): void {
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.logger.info('data', `User changed to ${user.email}, reloading data`);
        this.loadFreshData();
      } else {
        this.logger.info('data', 'User logged out, clearing data');
        this.cleanupListeners();
        this.articlesSubject.next([]);
        this.listsSubject.next([]);
      }
    });
  }

  /**
   * Get the user-specific base path for Firestore collections
   */
  private getUserBasePath(): string {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No authenticated user, using shared user ID');
      return `users/${this.SHARED_USER_ID}`;
    }
    return `users-v2/${userId}`;
  }


  private initializeDataLoading(): void {
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

  private async loadFreshData(): Promise<void> {
    this.logger.debug('data', 'Loading fresh data from Firebase');

    try {
      // Performance: Show cached data immediately for instant UX
      this.loadCachedData();

      // Performance: Notify that background refresh is starting
      this.refreshStatusSubject.next({ isRefreshing: true, message: 'Aktualisiere Daten...' });

      // Then set up real-time listeners for fresh data
      this.setupRealtimeListeners();

      // Performance: Notify that background refresh is complete (after a short delay to ensure data is loaded)
      setTimeout(() => {
        this.refreshStatusSubject.next({ isRefreshing: false });
      }, 2000);
    } catch (error) {
      this.logger.error('data', 'Failed to load fresh data, falling back to cache', error);
      this.refreshStatusSubject.next({ isRefreshing: false });
      this.loadCachedData();
    }
  }

  private loadCachedData(): void {
    this.logger.debug('cache', 'Loading data from cache');
    
    const currentArticles = this.articlesSubject.value;
    const currentLists = this.listsSubject.value;
    
    if (currentArticles.length === 0) {
      const articlesCache = this.cacheService.getCachedArticles();
      if (articlesCache.data) {
        this.logger.info('cache', `Loaded ${articlesCache.data.length} articles from cache (${this.cacheService.formatAge(articlesCache.status.age)})`);
        this.articlesSubject.next(articlesCache.data);
      } else {
        this.logger.warn('cache', 'No articles in cache');
        this.articlesSubject.next([]);
      }
    }
  
    if (currentLists.length === 0) {
      const listsCache = this.cacheService.getCachedLists();
      if (listsCache.data) {
        this.logger.info('cache', `Loaded ${listsCache.data.length} lists from cache (${this.cacheService.formatAge(listsCache.status.age)})`);
        this.listsSubject.next(listsCache.data);
      } else {
        this.logger.warn('cache', 'No lists in cache');
        this.listsSubject.next([]);
      }
    }
  }

  private setupRealtimeListeners(): void {
    if (!this.firestore) {
      this.logger.error('data', 'Firestore not initialized');
      return;
    }

    this.cleanupListeners();

    try {
      const basePath = this.getUserBasePath();

      // Articles listener
      const articlesRef = collection(this.firestore, `${basePath}/articles`);
      const articlesQuery = query(articlesRef, orderBy('name'));

      this.articlesUnsubscribe = onSnapshot(articlesQuery,
        (snapshot) => {
          this.logger.debug('data', `Fresh articles received: ${snapshot.size}`);
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
              usageCount: data['usageCount'] || 0,
              // Phase 8: Include ownership field
              ownerId: data['ownerId'] || '',
              // Phase 8.2: Include copiedFrom field
              copiedFrom: data['copiedFrom'] || undefined
            });
          });

          // Phase 8.2: Store owned articles separately and merge
          this.ownedArticles = articles;
          this.mergeArticles();
        },
        (error) => {
          this.logger.error('data', 'Articles listener error', error);
          this.loadCachedData();
        }
      );

      // Lists listener
      const listsRef = collection(this.firestore, `${basePath}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));

      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          this.logger.debug('data', `Fresh lists received: ${snapshot.size}`);
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
              itemStates: this.convertItemStatesFromFirestore(data['itemStates'] || {}),
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              // Phase 8: Include ownership and sharing fields
              ownerId: data['ownerId'] || '',
              sharedWith: data['sharedWith'] || []
            });
          });

          // Phase 8: Store owned lists separately
          this.ownedLists = lists;
          this.mergeLists();
        },
        (error) => {
          this.logger.error('data', 'Lists listener error', error);
          this.loadCachedData();
        }
      );

      // Phase 8: Shared lists listener
      // WORKAROUND: Collection group queries have auth token issues in Angular Fire.
      // Instead, we query share-invites to find which users have shared lists,
      // then load each list directly with proper authentication.
      const userId = this.authService.getCurrentUserId();
      if (userId) {
        this.logger.info('data', `Setting up shared lists listener for user ${userId}`);

        // Query share-invites to find accepted invites for this user
        const invitesRef = collection(this.firestore, 'share-invites');
        const acceptedInvitesQuery = query(
          invitesRef,
          where('acceptedByUserId', '==', userId),
          where('status', '==', 'accepted')
        );

        this.sharedListsUnsubscribe = onSnapshot(acceptedInvitesQuery,
          async (inviteSnapshot) => {
            this.logger.info('data', `Found ${inviteSnapshot.size} accepted share invites`);

            // Extract list info from invites
            const listIds = new Map<string, string>(); // listId -> ownerId

            inviteSnapshot.forEach((doc) => {
              const data = doc.data();
              const listId = data['listId'];
              const fromUserId = data['fromUserId'];
              if (listId && fromUserId) {
                listIds.set(listId, fromUserId);
              }
            });

            this.logger.info('data', `Loading ${listIds.size} shared lists`);

            // Load each shared list directly (avoids collection group query)
            const sharedLists: ShoppingList[] = [];

            for (const [listId, ownerId] of listIds.entries()) {
              try {
                const listRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);
                const listDoc = await getDoc(listRef);

                if (listDoc.exists()) {
                  const data = listDoc.data();

                  // Verify user is still in sharedWith array
                  const sharedWith = data['sharedWith'] || [];
                  if (sharedWith.includes(userId)) {
                    sharedLists.push({
                      id: listDoc.id,
                      name: data['name'],
                      color: data['color'],
                      icon: data['icon'],
                      shopId: data['shopId'],
                      articleIds: data['articleIds'] || [],
                      itemStates: this.convertItemStatesFromFirestore(data['itemStates'] || {}),
                      departmentOrder: data['departmentOrder'],
                      createdAt: data['createdAt']?.toDate() || new Date(),
                      updatedAt: data['updatedAt']?.toDate() || new Date(),
                      ownerId: data['ownerId'] || ownerId,
                      sharedWith: sharedWith
                    });
                    this.logger.debug('data', `Loaded shared list: ${data['name']}`);
                  } else {
                    this.logger.warn('data', `List ${listId} no longer shared with user`);
                  }
                } else {
                  this.logger.warn('data', `Shared list ${listId} not found (deleted?)`);
                }
              } catch (error: any) {
                this.logger.error('data', `Failed to load shared list ${listId}:`, error);
              }
            }

            // Store shared lists
            this.sharedLists = sharedLists;
            this.logger.info('data', `Loaded ${sharedLists.length} shared lists successfully`);
            this.mergeLists();

            // QUOTA OPTIMIZATION: Start 20s polling instead of per-list real-time listeners
            // Reduces Firestore reads by 70-90% while maintaining acceptable sync speed
            this.startSharedListPolling();
          },
          (error: any) => {
            this.logger.error('data', 'Share invites listener error', error);
          }
        );
      } else {
        this.logger.warn('data', 'No user ID available, skipping shared lists listener');
      }
    } catch (error) {
      this.logger.error('data', 'Error setting up listeners', error);
      this.loadCachedData();
    }
  }

  /**
   * Phase 8: Merge owned and shared lists and update the listsSubject
   * This is called whenever owned or shared lists update
   * QUOTA OPTIMIZATION: Increased debounce from 200ms to 1000ms
   */
  private mergeLists(): void {
    // QUOTA OPTIMIZATION: Debounce multiple mergeLists calls to prevent excessive batch loads
    // If multiple listeners fire within 1 second, only run once
    if (this.mergeListsTimer) {
      clearTimeout(this.mergeListsTimer);
    }

    this.mergeListsTimer = setTimeout(() => {
      this.executeMergeLists();
    }, this.MERGE_LISTS_DEBOUNCE); // 1 second debounce (reduced from 200ms)
  }

  private executeMergeLists(): void {
    // Combine owned and shared lists
    const allLists = [...this.ownedLists, ...this.sharedLists];

    // Remove duplicates (in case a list is both owned and shared - shouldn't happen but be safe)
    const uniqueLists = Array.from(
      new Map(allLists.map(list => [list.id, list])).values()
    );

    this.logger.debug('data', `Merged lists: ${this.ownedLists.length} owned + ${this.sharedLists.length} shared = ${uniqueLists.length} total`);

    this.listsSubject.next(uniqueLists);
    this.cacheService.cacheLists(uniqueLists);

    // QUOTA OPTIMIZATION: Only reload articles if the article IDs actually changed
    // Collect all article IDs from shared lists
    const listsToProcess = [
      ...this.sharedLists,
      ...this.ownedLists.filter(list => list.sharedWith && list.sharedWith.length > 0)
    ];

    const currentSharedArticleIds = new Set<string>();
    listsToProcess.forEach(list => {
      list.articleIds.forEach(articleId => currentSharedArticleIds.add(articleId));
    });

    // Compare with previous state
    const hasChanged =
      currentSharedArticleIds.size !== this.previousSharedArticleIds.size ||
      Array.from(currentSharedArticleIds).some(id => !this.previousSharedArticleIds.has(id));

    if (hasChanged) {
      this.logger.debug('data', `Article IDs changed (${this.previousSharedArticleIds.size} → ${currentSharedArticleIds.size}), triggering batch load`);
      this.previousSharedArticleIds = currentSharedArticleIds;
      this.loadArticlesFromSharedListOwners();
    } else {
      this.logger.debug('data', `Article IDs unchanged (${currentSharedArticleIds.size}), skipping batch load`);
    }
  }

  /**
   * Phase 8.2: Merge owned and shared articles and update the articlesSubject
   * This is called whenever owned or shared articles update
   * Fixes bug where editing a local copy would remove all shared articles
   */
  private mergeArticles(): void {
    // Combine owned and shared articles
    const allArticles = [...this.ownedArticles, ...this.sharedArticles];

    // Remove duplicates (in case an article is both owned and shared - shouldn't happen but be safe)
    const uniqueArticles = Array.from(
      new Map(allArticles.map(article => [article.id, article])).values()
    );

    this.logger.debug('data', `Merged articles: ${this.ownedArticles.length} owned + ${this.sharedArticles.length} shared = ${uniqueArticles.length} total`);

    this.articlesSubject.next(uniqueArticles);
    this.cacheService.cacheArticles(uniqueArticles);
  }

  /**
   * QUOTA OPTIMIZATION: Smart polling - 5 minutes normally, 1 minute when actively editing
   * Replaces N real-time listeners (one per shared list) with smart polling
   *
   * Benefits:
   * - Drastically reduces reads (no continuous listeners)
   * - Polls more frequently only when user is actively editing
   * - Background tabs get minimal polling
   */
  private startSharedListPolling(): void {
    // Prevent multiple polling timers
    if (this.isPollingActive) {
      this.logger.debug('data', 'Polling already active, skipping');
      return;
    }

    // Clear any existing polling timer
    this.stopSharedListPolling();

    if (this.sharedLists.length === 0) {
      this.logger.debug('data', 'No shared lists, skipping polling setup');
      return;
    }

    this.isPollingActive = true;
    const interval = this.getSmartPollInterval();
    this.logger.info('data', `🔄 Starting smart polling for ${this.sharedLists.length} shared lists (${interval/1000}s interval)`);

    // Poll immediately once
    this.pollSharedListUpdates();

    // Then poll with smart interval
    this.sharedListPollingTimer = setInterval(() => {
      // Skip polling if tab is not visible (saves quota!)
      if (document.hidden) {
        this.logger.debug('data', 'Tab hidden, skipping poll');
        return;
      }

      this.pollSharedListUpdates();
    }, interval);
  }

  /**
   * QUOTA OPTIMIZATION: Determine poll interval based on user activity
   * Active editing: 1 minute, Inactive: 5 minutes
   */
  private getSmartPollInterval(): number {
    const timeSinceActivity = Date.now() - this.lastUserActivity;
    const ACTIVE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

    return timeSinceActivity < ACTIVE_THRESHOLD
      ? this.ACTIVE_POLL_INTERVAL  // 1 minute when active
      : this.SHARED_LIST_POLL_INTERVAL; // 5 minutes when idle
  }

  /**
   * QUOTA OPTIMIZATION: Track user activity to adjust poll frequency
   * Call this when user interacts with lists (check, add, remove items)
   */
  public markUserActivity(): void {
    this.lastUserActivity = Date.now();
  }

  /**
   * Manual sync for shared lists
   * Allows users to manually trigger a sync without waiting for polling interval
   * Useful when collaborating in real-time
   */
  public async syncSharedListsNow(): Promise<void> {
    this.logger.info('data', '🔄 Manual sync requested');
    if (this.sharedLists.length === 0) {
      this.logger.info('data', 'No shared lists to sync');
      return;
    }

    // Trigger immediate poll
    await this.pollSharedListUpdates();
    this.logger.info('data', '✅ Manual sync complete');
  }

  /**
   * QUOTA OPTIMIZATION: Poll shared lists for updates
   * Only fetches lists that have likely changed (based on server timestamps)
   */
  private async pollSharedListUpdates(): Promise<void> {
    if (this.sharedLists.length === 0) {
      return;
    }

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      return;
    }

    this.logger.debug('data', `🔄 Polling ${this.sharedLists.length} shared lists for updates...`);

    try {
      let updatedCount = 0;
      const updatePromises: Promise<void>[] = [];

      for (const list of this.sharedLists) {
        const updatePromise = (async () => {
          try {
            const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);
            const snapshot = await getDoc(listRef);
            this.quotaMonitor.trackRead('Shared List Poll', 1, { listId: list.id });

            if (snapshot.exists()) {
              const data = snapshot.data();
              const serverUpdatedAt = data['updatedAt']?.toDate()?.getTime() || 0;
              const localUpdatedAt = list.updatedAt?.getTime() || 0;

              // Only update if server version is newer
              if (serverUpdatedAt > localUpdatedAt) {
                // Verify user still has access
                const sharedWith = data['sharedWith'] || [];
                if (!sharedWith.includes(userId)) {
                  this.logger.warn('data', `Lost access to list ${list.id}, removing`);
                  this.removeSharedList(list.id);
                  return;
                }

                // Update the list in sharedLists array
                const index = this.sharedLists.findIndex(l => l.id === list.id);
                if (index !== -1) {
                  // CRITICAL FIX: Merge itemStates instead of replacing to prevent race conditions
                  // This ensures User A's checks don't get lost when User B checks something
                  const localItemStates = this.sharedLists[index].itemStates || {};
                  const serverItemStates = this.convertItemStatesFromFirestore(data['itemStates'] || {});
                  const mergedItemStates = this.mergeItemStates(localItemStates, serverItemStates);

                  this.sharedLists[index] = {
                    ...this.sharedLists[index],
                    name: data['name'],
                    color: data['color'],
                    icon: data['icon'],
                    shopId: data['shopId'],
                    itemStates: mergedItemStates, // Use merged version instead of server version
                    articleIds: data['articleIds'] || [],
                    departmentOrder: data['departmentOrder'],
                    updatedAt: data['updatedAt']?.toDate() || new Date(),
                    sharedWith: sharedWith
                  };

                  updatedCount++;
                  this.logger.debug('data', `📥 Updated shared list: ${data['name']} (itemStates merged)`);
                }
              }
            } else {
              // List was deleted
              this.logger.warn('data', `Shared list ${list.id} deleted by owner`);
              this.removeSharedList(list.id);
            }
          } catch (error: any) {
            // Permission error means list was deleted or user was removed
            if (error.code === 'permission-denied') {
              this.logger.warn('data', `Lost access to list ${list.id}, removing`);
              this.removeSharedList(list.id);
            } else {
              this.logger.debug('data', `Poll error for list ${list.id}: ${error.message}`);
            }
          }
        })();

        updatePromises.push(updatePromise);
      }

      // Wait for all polls to complete
      await Promise.all(updatePromises);

      if (updatedCount > 0) {
        this.logger.info('data', `✅ Polled updates: ${updatedCount} lists changed`);
        this.mergeLists(); // Trigger UI update only if something changed
      } else {
        this.logger.debug('data', `✅ Polled: No changes detected`);
      }
    } catch (error) {
      this.logger.error('data', 'Error polling shared list updates:', error);
    }
  }

  /**
   * QUOTA OPTIMIZATION: Stop polling timer
   */
  private stopSharedListPolling(): void {
    if (this.sharedListPollingTimer) {
      clearInterval(this.sharedListPollingTimer);
      this.sharedListPollingTimer = undefined;
      this.isPollingActive = false;
      this.logger.debug('data', 'Stopped shared list polling');
    }
  }

  /**
   * Phase 8: Remove a shared list from the local state
   * QUOTA OPTIMIZATION: No longer needs to clean up individual listeners (using polling instead)
   */
  private removeSharedList(listId: string): void {
    const index = this.sharedLists.findIndex(l => l.id === listId);
    if (index !== -1) {
      this.sharedLists.splice(index, 1);
      this.mergeLists();
    }

    // Clean up cached data for this list
    this.lastSharedListUpdate.delete(listId);
  }

  /**
   * Phase 8: Load articles from the owners of shared lists
   * IMPORTANT: Only load articles that are actually ON the shared lists (not all owner's articles)
   * This preserves privacy - collaborators only see articles on shared lists
   *
   * PERFORMANCE OPTIMIZED: Uses batch loading with IN queries (10-20x faster than sequential)
   */
  private async loadArticlesFromSharedListOwners(): Promise<void> {
    // Performance: Prevent concurrent batch loads
    if (this.isBatchLoading) {
      this.logger.debug('data', '⏭️ Skipping batch load - already in progress');
      return;
    }

    this.isBatchLoading = true;
    const startTime = Date.now();

    try {
      // Phase 8: Include both lists shared WITH us and lists we OWN that are shared with others
      const listsToProcess = [
        ...this.sharedLists,
        ...this.ownedLists.filter(list => list.sharedWith && list.sharedWith.length > 0)
      ];

      if (listsToProcess.length === 0) {
        this.logger.debug('data', 'No shared lists, skipping article loading');
        // Clear cache when no shared lists
        this.loadedSharedArticleIds.clear();
        this.failedArticleIds.clear();
        return;
      }

      // Collect all unique article IDs from all shared lists
      const sharedArticleIds = new Set<string>();
      listsToProcess.forEach(list => {
        list.articleIds.forEach(articleId => sharedArticleIds.add(articleId));
      });

      if (sharedArticleIds.size === 0) {
        this.logger.debug('data', 'No articles on shared lists');
        return;
      }

      // Performance: Only load articles we haven't loaded yet
      const articlesToLoad = Array.from(sharedArticleIds).filter(
        id => !this.loadedSharedArticleIds.has(id) && !this.failedArticleIds.has(id)
      );

      if (articlesToLoad.length === 0) {
        this.logger.info('data', `📊 All ${sharedArticleIds.size} shared articles already cached, skipping batch load`);
        return;
      }

      this.logger.info('data', `Found ${articlesToLoad.length} NEW articles to load (${sharedArticleIds.size} total, ${this.loadedSharedArticleIds.size} cached)`);

      // QUOTA OPTIMIZATION: Build smart owner list based on cache + list owners
      // Instead of querying ALL possible owners (list owner + collaborators),
      // prioritize list owners first (most likely to have the articles)
      const priorityOwners = new Set<string>();
      const fallbackOwners = new Set<string>();

      // First priority: List owners (articles are usually in the list owner's collection)
      listsToProcess.forEach(list => {
        if (list.ownerId) {
          priorityOwners.add(list.ownerId);
        }
      });

      // Second priority: Owners from cache (we know they have articles)
      articlesToLoad.forEach(articleId => {
        const cachedOwner = this.articleOwnerCache.get(articleId);
        if (cachedOwner) {
          priorityOwners.add(cachedOwner);
        }
      });

      // Fallback: Collaborators (only if needed)
      listsToProcess.forEach(list => {
        if (list.sharedWith) {
          list.sharedWith.forEach(userId => fallbackOwners.add(userId));
        }
      });

      const currentUserId = this.authService.getCurrentUserId();

      // QUOTA OPTIMIZATION: Start with priority owners only
      this.logger.info('data', `🚀 QUOTA OPTIMIZED: Batch loading ${articlesToLoad.length} articles from ${priorityOwners.size} priority owners (${fallbackOwners.size} fallback)`);

      // PERFORMANCE: Load articles in parallel batches using IN queries
      let newlyLoadedArticles = await this.batchLoadArticles(
        articlesToLoad,
        Array.from(priorityOwners),
        currentUserId
      );

      // QUOTA OPTIMIZATION: Only query fallback owners if we still have missing articles
      const stillMissing = articlesToLoad.filter(id =>
        !newlyLoadedArticles.find(a => a.id === id)
      );

      if (stillMissing.length > 0 && fallbackOwners.size > 0) {
        this.logger.info('data', `⚠️ ${stillMissing.length} articles not found in priority owners, trying ${fallbackOwners.size} fallback owners...`);
        const fallbackArticles = await this.batchLoadArticles(
          stillMissing,
          Array.from(fallbackOwners).filter(id => !priorityOwners.has(id)), // Exclude already-queried owners
          currentUserId
        );
        newlyLoadedArticles = [...newlyLoadedArticles, ...fallbackArticles];
      }

      // Performance: Update cache with successfully loaded article IDs
      newlyLoadedArticles.forEach(article => {
        this.loadedSharedArticleIds.add(article.id);
        // QUOTA OPTIMIZATION: Cache article owner to avoid redundant queries next time
        if (article.ownerId) {
          this.articleOwnerCache.set(article.id, article.ownerId);
        }
      });

      // Performance: Track articles that failed to load
      const loadedIds = new Set(newlyLoadedArticles.map(a => a.id));
      articlesToLoad.forEach(id => {
        if (!loadedIds.has(id)) {
          this.failedArticleIds.add(id);
        }
      });

      // Phase 8.2: Merge newly loaded articles with previously cached articles
      // Keep all previously loaded articles that are still on shared lists
      const previouslyLoadedArticles = this.sharedArticles.filter(article =>
        sharedArticleIds.has(article.id)
      );

      // Performance: Remove articles from cache if they're no longer on shared lists
      this.sharedArticles.forEach(article => {
        if (!sharedArticleIds.has(article.id)) {
          this.loadedSharedArticleIds.delete(article.id);
          this.failedArticleIds.delete(article.id);
        }
      });

      // Performance: Clear failed status if article is being retried (was added back to a list)
      articlesToLoad.forEach(id => {
        if (this.failedArticleIds.has(id)) {
          this.failedArticleIds.delete(id);
        }
      });

      this.sharedArticles = [...previouslyLoadedArticles, ...newlyLoadedArticles];

      const elapsedTime = Date.now() - startTime;
      this.logger.info('data', `✅ Loaded ${newlyLoadedArticles.length} NEW articles in ${elapsedTime}ms (${this.sharedArticles.length} total shared articles)`);
      this.mergeArticles();
    } finally {
      this.isBatchLoading = false;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Batch load articles using Firestore IN queries
   * This is 10-20x faster than sequential loading
   *
   * Strategy:
   * 1. For each owner, batch articles into groups of 30 (Firestore IN query limit)
   * 2. Run all batches in parallel
   * 3. Filter out articles owned by current user (already in ownedArticles)
   */
  private async batchLoadArticles(
    articleIds: string[],
    ownerIds: string[],
    currentUserId: string | null
  ): Promise<Article[]> {
    const BATCH_SIZE = 30; // Firestore IN query limit
    const allArticles: Article[] = [];
    const foundArticleIds = new Set<string>();

    // Create parallel batch loading tasks for all owners
    const batchTasks: Promise<void>[] = [];

    for (const ownerId of ownerIds) {
      // Split article IDs into chunks of 30 for this owner
      const articleChunks = this.chunkArray(articleIds, BATCH_SIZE);

      for (const chunk of articleChunks) {
        // Create a batch query task
        const task = (async () => {
          try {
            const articlesRef = collection(this.firestore, `users-v2/${ownerId}/articles`);
            const batchQuery = query(
              articlesRef,
              where(documentId(), 'in', chunk)
            );

            const snapshot = await getDocs(batchQuery);
            this.quotaMonitor.trackRead('Batch Load Articles', snapshot.size, { ownerId, chunkSize: chunk.length });

            snapshot.forEach((doc) => {
              // Only add if we haven't found this article yet
              if (!foundArticleIds.has(doc.id)) {
                const data = doc.data();
                const article: Article = {
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
                  usageCount: data['usageCount'] || 0,
                  ownerId: data['ownerId'] || ownerId,
                  copiedFrom: data['copiedFrom'] || undefined
                };

                // Only add if NOT owned by current user (those are already in ownedArticles)
                if (article.ownerId !== currentUserId) {
                  allArticles.push(article);
                  foundArticleIds.add(doc.id);
                }
              }
            });

            this.logger.debug('data', `📦 Batch loaded ${snapshot.size} articles from ${ownerId}`);
          } catch (error: any) {
            // It's normal for some batches to fail (articles not in this owner's collection)
            this.logger.debug('data', `Batch query for ${ownerId} returned no results`);
          }
        })();

        batchTasks.push(task);
      }
    }

    // Wait for all batch tasks to complete in parallel
    this.logger.info('data', `⚡ Running ${batchTasks.length} parallel batch queries...`);
    await Promise.all(batchTasks);

    // Check for missing articles
    const missingCount = articleIds.length - foundArticleIds.size;
    if (missingCount > 0) {
      this.logger.warn('data', `⚠️ ${missingCount} articles not found in any owner's collection`);
    }

    return allArticles;
  }

  /**
   * Utility: Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * CRITICAL FIX: Smart merge of itemStates to prevent race conditions
   * When two users check different articles simultaneously, this ensures both changes persist
   *
   * Strategy:
   * 1. For each article, compare timestamps of local vs server
   * 2. Use the version with the most recent change (checkedAt timestamp)
   * 3. If timestamps equal, prefer checked state over unchecked
   * 4. Preserve all articles from both sources
   */
  private mergeItemStates(
    localStates: { [articleId: string]: any },
    serverStates: { [articleId: string]: any }
  ): { [articleId: string]: any } {
    const merged: { [articleId: string]: any } = {};

    // Collect all article IDs from both sources
    const allArticleIds = new Set([
      ...Object.keys(localStates),
      ...Object.keys(serverStates)
    ]);

    for (const articleId of allArticleIds) {
      const localState = localStates[articleId];
      const serverState = serverStates[articleId];

      // If only in local, keep local
      if (localState && !serverState) {
        merged[articleId] = localState;
        continue;
      }

      // If only in server, use server
      if (serverState && !localState) {
        merged[articleId] = serverState;
        continue;
      }

      // Both exist - merge intelligently based on timestamps
      const localTime = localState.checkedAt?.getTime() || localState.addedAt?.getTime() || 0;
      const serverTime = serverState.checkedAt?.getTime() || serverState.addedAt?.getTime() || 0;

      // Use whichever has the most recent change
      if (serverTime > localTime) {
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (server newer: ${serverTime} > ${localTime})`);
      } else if (localTime > serverTime) {
        merged[articleId] = localState;
        this.logger.debug('data', `Merge: Using local state for ${articleId} (local newer: ${localTime} > ${serverTime})`);
      } else {
        // Times equal - prefer checked state over unchecked
        if (serverState.isChecked && !localState.isChecked) {
          merged[articleId] = serverState;
          this.logger.debug('data', `Merge: Using server state for ${articleId} (server checked)`);
        } else {
          merged[articleId] = localState;
          this.logger.debug('data', `Merge: Using local state for ${articleId} (same time or local checked)`);
        }
      }
    }

    this.logger.info('data', `✅ Merged itemStates: ${Object.keys(localStates).length} local + ${Object.keys(serverStates).length} server = ${Object.keys(merged).length} total`);
    return merged;
  }

  /**
   * Convert itemStates from Firestore format to application format
   * Converts Firestore Timestamps to JavaScript Dates in checkedAt and history events
   */
  private convertItemStatesFromFirestore(firestoreItemStates: any): { [articleId: string]: any } {
    const itemStates: any = {};

    for (const [articleId, state] of Object.entries(firestoreItemStates || {})) {
      const itemState = state as any;

      itemStates[articleId] = {
        ...itemState,
        addedAt: itemState.addedAt?.toDate ? itemState.addedAt.toDate() : itemState.addedAt,
        checkedAt: itemState.checkedAt?.toDate ? itemState.checkedAt.toDate() : itemState.checkedAt,
        history: (itemState.history || []).map((event: any) => ({
          ...event,
          timestamp: event.timestamp?.toDate ? event.timestamp.toDate() : event.timestamp
        }))
      };
    }

    return itemStates;
  }

  /**
   * Convert itemStates from application format to Firestore format
   * Converts JavaScript Dates to Firestore Timestamps in checkedAt, addedAt, and history events
   * This is CRITICAL for persistence - Firestore needs Timestamp objects, not Date objects
   * Also removes undefined values as Firestore doesn't support them
   */
  private convertItemStatesToFirestore(appItemStates: any): { [articleId: string]: any } {
    const itemStates: any = {};

    for (const [articleId, state] of Object.entries(appItemStates || {})) {
      const itemState = state as any;

      // Build cleanedState by only adding defined values
      const cleanedState: any = {};

      // Add each property only if it's defined
      if (itemState.articleId !== undefined) cleanedState.articleId = itemState.articleId;
      if (itemState.articleName !== undefined) cleanedState.articleName = itemState.articleName;
      if (itemState.isChecked !== undefined) cleanedState.isChecked = itemState.isChecked;
      if (itemState.amount !== undefined) cleanedState.amount = itemState.amount;
      if (itemState.checkedBy !== undefined) cleanedState.checkedBy = itemState.checkedBy;

      // Convert and add addedAt only if defined
      if (itemState.addedAt !== undefined) {
        cleanedState.addedAt = itemState.addedAt instanceof Date
          ? Timestamp.fromDate(itemState.addedAt)
          : itemState.addedAt;
      }

      // Convert and add checkedAt only if defined
      if (itemState.checkedAt !== undefined) {
        cleanedState.checkedAt = itemState.checkedAt instanceof Date
          ? Timestamp.fromDate(itemState.checkedAt)
          : itemState.checkedAt;
      }

      // Convert timestamps in history events (only if history exists)
      if (itemState.history !== undefined) {
        cleanedState.history = itemState.history.map((event: any) => ({
          ...event,
          timestamp: event.timestamp instanceof Date
            ? Timestamp.fromDate(event.timestamp)
            : event.timestamp
        }));
      }

      itemStates[articleId] = cleanedState;
    }

    return itemStates;
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
    // Phase 8: Cleanup shared lists listener
    if (this.sharedListsUnsubscribe) {
      this.sharedListsUnsubscribe();
      this.sharedListsUnsubscribe = undefined;
    }

    // QUOTA OPTIMIZATION: Stop polling timer instead of cleaning up per-list listeners
    this.stopSharedListPolling();

    // Performance: Clear caches on cleanup
    this.loadedSharedArticleIds.clear();
    this.failedArticleIds.clear();
    this.lastSharedListUpdate.clear();
    this.articleOwnerCache.clear();
    this.previousSharedArticleIds.clear();
    if (this.mergeListsTimer) {
      clearTimeout(this.mergeListsTimer);
      this.mergeListsTimer = null;
    }
  }

  // === PUBLIC API ===

  getArticles(): Observable<Article[]> {
    return this.articlesSubject.asObservable();
  }

  getLists(): Observable<ShoppingList[]> {
    return this.listsSubject.asObservable();
  }

  getArticle(id: string): Observable<Article | undefined> {
    const currentArticles = this.articlesSubject.value;
    const localArticle = currentArticles.find(a => a.id === id);
    
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
    const currentLists = this.listsSubject.value;
    const localList = currentLists.find(l => l.id === id);

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
              itemStates: this.convertItemStatesFromFirestore(data['itemStates'] || {}),
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

  // === FIREBASE OPERATIONS ===

  async createArticleInFirebase(articleData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    // Phase 8: Articles are always created in the creator's collection
    const basePath = this.getUserBasePath();
    this.logger.info('data', `Creating article in creator's path: ${basePath}/articles`);

    const docRef = await addDoc(collection(this.firestore, `${basePath}/articles`), articleData);
    this.logger.info('data', `✅ Article created with ID: ${docRef.id}`);
    return docRef.id;
  }

  async updateArticleInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    await updateDoc(doc(this.firestore, `${basePath}/articles/${id}`), updateData);
  }

  async deleteArticleInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    await deleteDoc(doc(this.firestore, `${basePath}/articles/${id}`));
  }

  async createListInFirebase(listData: any): Promise<string> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    // Convert itemStates from application format (Date objects) to Firestore format (Timestamps)
    const firestoreData = { ...listData };
    if (firestoreData.itemStates) {
      firestoreData.itemStates = this.convertItemStatesToFirestore(firestoreData.itemStates);
    }

    const basePath = this.getUserBasePath();
    const docRef = await addDoc(collection(this.firestore, `${basePath}/lists`), firestoreData);
    return docRef.id;
  }

  async updateListInFirebase(id: string, updateData: any): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');

    try {
      // Convert itemStates from application format (Date objects) to Firestore format (Timestamps)
      // This is CRITICAL for persistence of history data
      const firestoreData = { ...updateData };
      if (firestoreData.itemStates) {
        this.logger.debug('data', `Converting ${Object.keys(firestoreData.itemStates).length} itemStates for Firebase write`);
        firestoreData.itemStates = this.convertItemStatesToFirestore(firestoreData.itemStates);
      }

      // Phase 8: Use owner's path for shared lists
      // Find the list to get its ownerId
      const currentLists = this.listsSubject.value;
      const list = currentLists.find(l => l.id === id);

      let listPath: string;
      if (list && list.ownerId) {
        // Use the owner's path (works for both owned and shared lists)
        listPath = `users-v2/${list.ownerId}/lists/${id}`;
      } else {
        // Fallback to current user's path
        const basePath = this.getUserBasePath();
        listPath = `${basePath}/lists/${id}`;
      }

      this.logger.info('data', `Writing to Firebase: ${listPath}`);
      if (firestoreData.articleIds) {
        this.logger.info('data', `📝 articleIds being written: [${firestoreData.articleIds.join(', ')}] (${firestoreData.articleIds.length} total)`);
      }
      await updateDoc(doc(this.firestore, listPath), firestoreData);
      this.logger.info('data', `✅ Firebase write SUCCESS for list ${id}`);
    } catch (error: any) {
      this.logger.error('data', `❌ Firebase write FAILED for list ${id}`, error);
      this.logger.error('data', `Error code: ${error.code}, message: ${error.message}`);
      throw error; // Re-throw so caller can handle
    }
  }

  async deleteListInFirebase(id: string): Promise<void> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    await deleteDoc(doc(this.firestore, `${basePath}/lists/${id}`));
  }

  async getAllArticlesFromFirebase(): Promise<Article[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    const snapshot = await getDocs(collection(this.firestore, `${basePath}/articles`));
    this.quotaMonitor.trackRead('Get All Articles', snapshot.size);
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
        usageCount: data['usageCount'] || 0,
        ownerId: data['ownerId'] || '',  // Phase 8: Include ownerId
        copiedFrom: data['copiedFrom'] || undefined  // Phase 8.2: Include copiedFrom
      });
    });
    return articles;
  }

  async getAllListsFromFirebase(): Promise<ShoppingList[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    const snapshot = await getDocs(collection(this.firestore, `${basePath}/lists`));
    this.quotaMonitor.trackRead('Get All Lists', snapshot.size);
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
        updatedAt: data['updatedAt']?.toDate() || new Date(),
        ownerId: data['ownerId'] || '',  // Phase 8: Include ownerId
        sharedWith: data['sharedWith'] || []  // Phase 8: Include sharedWith
      });
    });
    return lists;
  }

  // === EMERGENCY & UTILITY ===

  async loadDataEmergency(): Promise<void> {
    this.logger.warn('data', 'Emergency data loading triggered');
    
    this.logger.debug('data', 'Trying cached data first');
    this.loadCachedData();
    
    const cachedArticles = this.articlesSubject.value;
    const cachedLists = this.listsSubject.value;
    
    if (cachedArticles.length > 0 || cachedLists.length > 0) {
      this.logger.info('data', `Loaded from cache: ${cachedArticles.length} articles, ${cachedLists.length} lists`);
      return;
    }
    
    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.debug('data', 'Trying direct Firebase fetch');
      
      try {
        const articles = await this.getAllArticlesFromFirebase();
        const lists = await this.getAllListsFromFirebase();
        
        this.logger.info('data', `Direct Firebase fetch: ${articles.length} articles, ${lists.length} lists`);
        
        this.articlesSubject.next(articles);
        this.listsSubject.next(lists);
        
        this.cacheService.cacheArticles(articles);
        this.cacheService.cacheLists(lists);
        
        this.setupRealtimeListeners();
        
      } catch (error) {
        this.logger.error('data', 'Direct Firebase fetch failed', error);
      }
    }
  }

  async refreshData(): Promise<void> {
    this.logger.info('data', 'Manually refreshing user data');

    if (!this.connectionService.isOnline()) {
      this.logger.warn('data', 'Offline: Cannot refresh, using cached data');
      this.loadCachedData();
      return;
    }

    try {
      this.setupRealtimeListeners();

      const basePath = this.getUserBasePath();
      const articlesSnapshot = await getDocs(collection(this.firestore, `${basePath}/articles`));
      const listsSnapshot = await getDocs(collection(this.firestore, `${basePath}/lists`));
      this.logger.info('data', `Current user data: ${articlesSnapshot.size} articles, ${listsSnapshot.size} lists`);
    } catch (error) {
      this.logger.error('data', 'Error refreshing data', error);
      this.loadCachedData();
    }
  }

  getCurrentArticles(): Article[] {
    return this.articlesSubject.value;
  }

  getCurrentLists(): ShoppingList[] {
    return this.listsSubject.value;
  }

  updateLocalArticles(articles: Article[]): void {
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
    this.cleanupListeners();
  }
}