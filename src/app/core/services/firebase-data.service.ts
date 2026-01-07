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
  documentId,
  runTransaction
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

  // REAL-TIME SYNC: Use onSnapshot for instant collaboration
  // Individual document listeners for both owned and shared lists
  private ownedListListeners = new Map<string, () => void>();
  private ownedListListenersActive = false; // Track if individual listeners are set up
  private sharedListListeners = new Map<string, () => void>();
  private lastSharedListUpdate = new Map<string, number>(); // listId -> timestamp

  // CRITICAL: Prevent infinite loop from write-back triggering listener
  private lastMergeWrite = new Map<string, number>(); // listId -> timestamp of last write
  private readonly MERGE_WRITE_COOLDOWN = 2000; // 2 seconds cooldown

  // LAZY LISTENERS: Track active list subscription for cleanup
  private activeListSubscription?: any;

  // QUOTA OPTIMIZATION: Track if collection listeners have been cleaned up
  private collectionListenersCleanedUp = false;

  // QUOTA OPTIMIZATION: Track if collection listeners are currently active
  private collectionListenersActive = false;

  constructor(
    private connectionService: ConnectionService,
    private cacheService: OfflineCacheService,
    private logger: LoggerService,
    private authService: AuthService,
    private firestore: Firestore,
    private quotaMonitor: QuotaMonitorService,
    private activeListService: ActiveListService,
    private historyService: HistoryService
  ) {
    this.logger.info('data', 'Firebase Data Service initialized');
    this.initializeDataLoading();
    this.setupAuthListener();
    this.setupActiveListListener();
  }

  /**
   * Listen for auth state changes and reload data when user changes
   */
  private setupAuthListener(): void {
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        this.logger.info('data', `User changed to ${user.email}, reloading data`);
        // CRITICAL FIX: Cleanup old user's listeners before loading new user's data
        // Without this, old listeners stay active and both users' data loads!
        this.cleanupListeners();
        this.loadFreshData();

        // CRITICAL FIX: Re-setup active list listener after cleanup
        // cleanupListeners() destroys the subscription, so we need to recreate it
        this.setupActiveListListener();
      } else {
        this.logger.info('data', 'User logged out, clearing data');
        this.cleanupListeners();
        this.articlesSubject.next([]);
        this.listsSubject.next([]);
      }
    });
  }

  /**
   * LAZY LISTENERS: Subscribe to active list changes
   * Only sets up real-time listener for the currently open list
   * This reduces quota from 2,393 reads to ~26 reads per session (98% reduction)
   */
  private setupActiveListListener(): void {
    this.activeListSubscription = this.activeListService.getActiveListId$().subscribe({
      next: (activeListId) => {
        if (activeListId) {
          this.logger.info('data', `🎯 Active list changed to ${activeListId}, setting up lazy listener`);
          this.setupLazyListenerForList(activeListId);
        } else {
          this.logger.debug('data', `Active list cleared, cleaning up lazy listeners`);
          this.cleanupLazyListeners();
        }
      },
      error: (err) => {
        this.logger.error('data', `Active list subscription ERROR:`, err);
      }
    });
  }

  /**
   * LAZY LISTENERS: Set up listener for ONE specific list
   * This is called when a list is opened in the detail view
   *
   * CRITICAL FIX: Wait for lists to load before setting up listener
   * This prevents race condition where setup runs before lists are loaded
   *
   * QUOTA OPTIMIZATION: Cleans up collection listeners after first lazy listener setup
   * This prevents 10k+ unnecessary reads from collection listeners still firing
   */
  private setupLazyListenerForList(listId: string): void {
    this.logger.info('data', `🔧 setupLazyListenerForList() called for listId: ${listId}`);
    this.logger.info('data', `📍 collectionListenersCleanedUp flag: ${this.collectionListenersCleanedUp}`);

    // Cleanup existing lazy listeners first
    this.cleanupLazyListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up lazy listener');
      return;
    }

    // QUOTA OPTIMIZATION: Clean up collection listeners after first lazy listener setup
    // Collection listeners were only needed for initial data load
    // Now that we have lazy listeners, we can stop the collection listeners to save quota
    if (!this.collectionListenersCleanedUp) {
      this.logger.info('data', '🚀 QUOTA OPTIMIZATION: Cleaning up collection listeners');
      this.logger.info('data', `📍 articlesUnsubscribe exists: ${!!this.articlesUnsubscribe}, listsUnsubscribe exists: ${!!this.listsUnsubscribe}`);

      // Clean up Articles collection listener
      if (this.articlesUnsubscribe) {
        this.articlesUnsubscribe();
        this.articlesUnsubscribe = undefined;
        this.logger.info('data', '✅ Articles collection listener unsubscribed (saves ~450 reads per change!)');
      } else {
        this.logger.warn('data', '⚠️ Articles collection listener was already undefined - may have been cleaned up elsewhere');
      }

      // Clean up Lists collection listener
      if (this.listsUnsubscribe) {
        this.listsUnsubscribe();
        this.listsUnsubscribe = undefined;
        this.logger.info('data', '✅ Lists collection listener unsubscribed (saves ~13 reads per change!)');
      } else {
        this.logger.warn('data', '⚠️ Lists collection listener was already undefined - may have been cleaned up elsewhere');
      }

      this.collectionListenersCleanedUp = true;
      this.logger.info('data', '✅ Collection listeners cleanup complete - quota usage should drop dramatically!');
    } else {
      this.logger.info('data', '⏭️  Skipping cleanup - collection listeners already cleaned up (flag is true)');
    }

    // CRITICAL FIX: Subscribe to listsSubject to wait for lists to load
    // This fixes race condition where component calls setActiveList() before lists are loaded
    const setupListener = (lists: ShoppingList[]) => {
      const list = lists.find(l => l.id === listId);

      if (!list) {
        this.logger.warn('data', `List ${listId} not found, cannot set up listener`);
        return;
      }

      // Check if this is an owned list or shared list
      const isOwnedList = list.ownerId === userId;

      if (isOwnedList) {
        this.setupSingleOwnedListListener(list);
      } else {
        this.setupSingleSharedListListener(list);
      }

      // LAZY ARTICLE LOADING: Load articles ONLY for this specific list
      this.loadArticlesForList(list);

      this.logger.info('data', `✅ Lazy listener active for ${isOwnedList ? 'owned' : 'shared'} list: ${list.name}`);
    };

    // Try immediate setup first (if lists already loaded)
    const currentLists = this.listsSubject.value;
    if (currentLists.length > 0) {
      setupListener(currentLists);
    } else {
      // Lists not loaded yet - wait for them
      this.logger.debug('data', `Waiting for lists to load before setting up listener for ${listId}`);
      const subscription = this.listsSubject.subscribe(lists => {
        if (lists.length > 0) {
          setupListener(lists);
          subscription.unsubscribe(); // Only run once
        }
      });
    }
  }

  /**
   * LAZY LISTENERS: Clean up all lazy listeners
   * Called when user navigates away from list detail
   */
  private cleanupLazyListeners(): void {
    this.logger.debug('data', `Cleaning up lazy listeners (${this.ownedListListeners.size} owned + ${this.sharedListListeners.size} shared)`);

    // Clean up owned list listeners
    this.ownedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.ownedListListeners.clear();
    this.ownedListListenersActive = false;

    // Clean up shared list listeners
    this.sharedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.sharedListListeners.clear();
  }

  /**
   * LAZY ARTICLE LOADING: Load articles ONLY for a specific list
   * This replaces batch loading ALL articles from ALL shared lists
   * Reduces quota from 7,248 reads to ~50 reads per session (99% reduction!)
   */
  private async loadArticlesForList(list: ShoppingList): Promise<void> {
    // Only load articles if this is a shared list OR an owned list that's shared with others
    const currentUserId = this.authService.getCurrentUserId();
    const isSharedList = list.ownerId !== currentUserId;
    const isSharedOwnedList = list.sharedWith && list.sharedWith.length > 0;

    // DEBUG: Log list loading attempt
    this.logger.info('data', `🔍 loadArticlesForList called for: ${list.name}`, {
      listId: list.id,
      currentUserId: currentUserId,
      ownerId: list.ownerId,
      sharedWith: list.sharedWith,
      isSharedList: isSharedList,
      isSharedOwnedList: isSharedOwnedList,
      articleIds: list.articleIds,
      articleCount: list.articleIds?.length || 0
    });

    if (!isSharedList && !isSharedOwnedList) {
      this.logger.warn('data', `⚠️ Skipping article load for private list: ${list.name} (ownerId=${list.ownerId}, sharedWith=${JSON.stringify(list.sharedWith)})`);
      return;
    }

    const articleIds = list.articleIds || [];
    if (articleIds.length === 0) {
      this.logger.debug('data', `No articles to load for list: ${list.name}`);
      return;
    }

    // Filter out articles we already have loaded
    const articlesToLoad = articleIds.filter(
      id => !this.loadedSharedArticleIds.has(id) && !this.failedArticleIds.has(id)
    );

    if (articlesToLoad.length === 0) {
      this.logger.debug('data', `All ${articleIds.length} articles already cached for ${list.name}`);
      return;
    }

    this.logger.info('data', `📦 Loading ${articlesToLoad.length} articles for list: ${list.name}`);

    // CRITICAL FIX: Load articles from ALL list participants, not just owner
    // When a participant creates an article, it's in their collection: users-v2/{participantId}/articles
    const ownerIds = [list.ownerId];

    // Add all shared participants as potential article owners
    if (list.sharedWith && list.sharedWith.length > 0) {
      list.sharedWith.forEach((userId: string) => {
        if (!ownerIds.includes(userId)) {
          ownerIds.push(userId);
        }
      });
    }

    // Also add current user if they're a participant (for their own articles)
    if (currentUserId && !ownerIds.includes(currentUserId)) {
      ownerIds.push(currentUserId);
    }

    this.logger.info('data', `🔍 Searching for articles in ${ownerIds.length} user collections (owner + ${list.sharedWith?.length || 0} participants)`);

    try {
      const newArticles = await this.batchLoadArticles(articlesToLoad, ownerIds, currentUserId);

      // Update cache
      newArticles.forEach(article => {
        this.loadedSharedArticleIds.add(article.id);
        if (article.ownerId) {
          this.articleOwnerCache.set(article.id, article.ownerId);
        }
      });

      // Merge with existing shared articles
      const existingArticleIds = new Set(this.sharedArticles.map(a => a.id));
      const articlesToAdd = newArticles.filter(a => !existingArticleIds.has(a.id));

      if (articlesToAdd.length > 0) {
        this.sharedArticles = [...this.sharedArticles, ...articlesToAdd];
        this.logger.info('data', `✅ Loaded ${articlesToAdd.length} new articles for ${list.name}`);
      }

      // CRITICAL FIX: Always call mergeArticles() even if no new articles were loaded
      // This ensures optimistically-added articles (already in ownedArticles) get merged and UI updates
      // Without this, newly created articles won't appear until Firestore indexes them (eventual consistency)
      this.mergeArticles();
    } catch (error) {
      this.logger.error('data', `Failed to load articles for ${list.name}:`, error);
    }
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
    this.logger.info('data', '🔧 setupRealtimeListeners() called - setting up collection listeners');

    // QUOTA OPTIMIZATION: Skip if collection listeners are already active
    // This prevents duplicate listener creation on connection restore events
    if (this.collectionListenersActive) {
      this.logger.info('data', '⏭️  Collection listeners already active - skipping recreation to save quota');
      return;
    }

    if (!this.firestore) {
      this.logger.error('data', 'Firestore not initialized');
      return;
    }

    this.cleanupListeners();

    try {
      const basePath = this.getUserBasePath();

      // QUOTA OPTIMIZATION: Load owned articles AFTER lists are loaded
      // This allows us to filter and only load articles that are on current lists
      // Saves ~441 reads per session (loading only needed articles, not all 463)
      this.logger.info('data', '📡 Creating Articles listener with quota optimization...');

      // FIX: Use flag to prevent multiple loads instead of unsubscribing inside callback
      let hasLoadedOwnedArticles = false;

      // Wait for lists to load first, then load only articles on those lists
      this.listsSubject.subscribe(lists => {
        if (lists.length > 0 && !hasLoadedOwnedArticles) {
          hasLoadedOwnedArticles = true; // Set flag immediately to prevent re-entry

          // Lists have loaded - now load only articles that are on these lists
          const ownedLists = lists.filter(l => l.ownerId === this.authService.getCurrentUserId());
          const articleIdsOnLists = new Set<string>();

          ownedLists.forEach(list => {
            (list.articleIds || []).forEach(id => articleIdsOnLists.add(id));
          });

          if (articleIdsOnLists.size > 0) {
            this.logger.info('data', `📦 QUOTA OPTIMIZATION: Loading only ${articleIdsOnLists.size} articles that are on current lists (instead of all articles)`);
            this.loadOwnedArticlesByIds(Array.from(articleIdsOnLists));
          } else {
            this.logger.info('data', '📦 No articles on current lists, skipping article load');
            this.ownedArticles = [];
            this.mergeArticles();
          }
        }
      });

      this.articlesUnsubscribe = undefined; // No collection listener

      // Lists listener
      this.logger.info('data', '📡 Creating Lists collection listener...');
      const listsRef = collection(this.firestore, `${basePath}/lists`);
      const listsQuery = query(listsRef, orderBy('name'));

      this.listsUnsubscribe = onSnapshot(listsQuery,
        (snapshot) => {
          this.quotaMonitor.trackRead('Lists Collection Listener', snapshot.size);
          this.logger.debug('data', `Fresh lists received: ${snapshot.size}`);

          // OPTIMIZATION: Once individual listeners are active, they handle all updates
          // Collection listener only needed for initial load
          if (this.ownedListListenersActive) {
            this.logger.debug('data', '⏭️ Skipping collection update - individual listeners active');
            return;
          }

          const lists: ShoppingList[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();

            // NOTE: No merge logic here - individual document listeners handle content updates
            // This collection listener is primarily for initial load
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

          // LAZY LISTENERS: Don't set up listeners for all lists anymore
          // Instead, listeners are set up ONLY for the active list (98% quota reduction!)
          // See setupActiveListListener() which subscribes to active list changes
          // this.setupOwnedListRealtimeListeners(lists); // DEPRECATED - using lazy listeners now
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
                // CRITICAL FIX: Validate ownerId before constructing path to prevent double-slash bug
                if (!ownerId) {
                  this.logger.error('data', `Skipping shared list ${listId}: missing ownerId from invitation`, {
                    listId: listId,
                    ownerId: ownerId
                  });
                  continue;
                }

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

            // LAZY LISTENERS: Don't set up listeners for all shared lists anymore
            // Instead, listeners are set up ONLY for the active list (98% quota reduction!)
            // See setupActiveListListener() which subscribes to active list changes
            // this.setupSharedListRealtimeListeners(sharedLists); // DEPRECATED - using lazy listeners now
          },
          (error: any) => {
            this.logger.error('data', 'Share invites listener error', error);
          }
        );
      } else {
        this.logger.warn('data', 'No user ID available, skipping shared lists listener');
      }

      // QUOTA OPTIMIZATION: Mark collection listeners as active
      // This prevents duplicate listener creation on subsequent calls
      this.collectionListenersActive = true;
      this.logger.info('data', '✅ Collection listeners created and marked as active');
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

    // LAZY LISTENERS + LAZY ARTICLE LOADING: DISABLED
    // Don't batch load articles for ALL shared lists anymore!
    // Articles are now loaded ONLY for the active list when it's opened.
    // This reduces quota from 7,248 reads to ~50 reads per session (99% reduction!)
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
   * LAZY LISTENERS: Set up listener for ONE owned list
   * Called when user opens a specific list in detail view
   */
  private setupSingleOwnedListListener(list: ShoppingList): void {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up owned list listener');
      return;
    }

    const listRef = doc(this.firestore, `users-v2/${userId}/lists/${list.id}`);

    const unsubscribe = onSnapshot(listRef,
      (snapshot) => {
        this.quotaMonitor.trackRead('Owned List Listener', 1, { listId: list.id, listName: list.name });
        this.logger.info('data', `🔔 Owned list listener FIRED for ${list.id} (${list.name})`);

        if (snapshot.exists()) {
          const data = snapshot.data();

          // Update the list in ownedLists array
          const index = this.ownedLists.findIndex(l => l.id === list.id);
          if (index !== -1) {
            // Read local state from listsSubject (has optimistic updates)
            const currentLists = this.listsSubject.value;
            const currentList = currentLists.find(l => l.id === list.id);

            // Merge itemStates and articleIds
            const localItemStates = currentList?.itemStates || this.ownedLists[index].itemStates || {};
            const serverItemStates = this.convertItemStatesFromFirestore(data['itemStates'] || {});
            const mergedItemStates = this.mergeItemStates(localItemStates, serverItemStates);

            const localArticleIds = currentList?.articleIds || this.ownedLists[index].articleIds || [];
            const serverArticleIds = data['articleIds'] || [];
            const mergedArticleIds = this.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

            // Prevent infinite loop - check if we just wrote to this list
            const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
            const timeSinceWrite = Date.now() - lastWriteTime;
            const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

            // Check if merge produced different result than server
            const itemStatesChanged = this.hasItemStatesChanged(mergedItemStates, serverItemStates);
            const articleIdsChanged = this.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
            const mergeChanged = itemStatesChanged || articleIdsChanged;

            // REAL-TIME SYNC FIX: Detect new article IDs to trigger article loading
            const previousArticleIds = this.ownedLists[index].articleIds || [];
            const newArticleIds = mergedArticleIds.filter((id: string) => !previousArticleIds.includes(id));

            this.ownedLists[index] = {
              ...this.ownedLists[index],
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              itemStates: mergedItemStates,
              articleIds: mergedArticleIds,
              departmentOrder: data['departmentOrder'],
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              sharedWith: data['sharedWith'] || []
            };

            // Only write back if merge changed AND it's not our own write
            if (mergeChanged && !isOurOwnWrite) {
              this.logger.info('data', `🔄 Merge produced different state, writing back for ${data['name']}`);
              this.lastMergeWrite.set(list.id, Date.now());
              this.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
                this.logger.error('data', `Failed to write merged state for ${list.id}:`, error);
              });
            }

            // REAL-TIME SYNC FIX: Load new articles when participants add them
            // This fixes Issue #1: Owner can't see participant articles in real-time
            if (newArticleIds.length > 0) {
              this.logger.info('data', `🆕 Detected ${newArticleIds.length} new articles in owned list "${data['name']}", loading them now...`);
              this.logger.debug('data', `New article IDs: ${newArticleIds.join(', ')}`);

              // Load articles for the updated list (will fetch from all participants)
              this.loadArticlesForList(this.ownedLists[index]).catch(error => {
                this.logger.error('data', `Failed to load new articles for ${list.id}:`, error);
              });
            }

            this.mergeLists();
          }
        } else {
          this.logger.warn('data', `Owned list ${list.id} was deleted`);
          this.removeOwnedList(list.id);
        }
      },
      (error: any) => {
        this.logger.error('data', `Error in owned list listener for ${list.id}:`, error);
      }
    );

    this.ownedListListeners.set(list.id, unsubscribe);
    this.ownedListListenersActive = true;
  }

  /**
   * LAZY LISTENERS: Set up listener for ONE shared list
   * Called when user opens a specific shared list in detail view
   */
  private setupSingleSharedListListener(list: ShoppingList): void {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up shared list listener');
      return;
    }

    // CRITICAL FIX: Validate ownerId before constructing path to prevent double-slash bug
    if (!list.ownerId) {
      this.logger.error('data', `Cannot set up shared list listener for ${list.name} (${list.id}): missing ownerId`, {
        listId: list.id,
        listName: list.name,
        ownerId: list.ownerId
      });
      return;
    }

    const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);

    const unsubscribe = onSnapshot(listRef,
      (snapshot) => {
        this.quotaMonitor.trackRead('Shared List Listener', 1, { listId: list.id, listName: list.name });
        this.logger.info('data', `🔔 Shared list listener FIRED for ${list.id} (${list.name})`);

        if (snapshot.exists()) {
          const data = snapshot.data();

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
            // CRITICAL FIX: Detect new articles BEFORE optimistic update check
            // Otherwise optimistic updates prevent detection of new articles
            const previousArticleIds = this.sharedLists[index].articleIds || [];
            const serverArticleIds = data['articleIds'] || [];
            const newArticleIds = serverArticleIds.filter((id: string) => !previousArticleIds.includes(id));

            // Check if this is OUR OWN write (collaborator's recent change)
            const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
            const timeSinceWrite = Date.now() - lastWriteTime;
            const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

            const serverItemStates = this.convertItemStatesFromFirestore(data['itemStates'] || {});

            let finalItemStates: { [articleId: string]: any };
            let finalArticleIds: string[];

            if (isOurOwnWrite) {
              // This is OUR write - preserve local optimistic updates
              const currentLists = this.listsSubject.value;
              const currentList = currentLists.find(l => l.id === list.id);

              finalItemStates = currentList?.itemStates || serverItemStates;
              finalArticleIds = currentList?.articleIds || serverArticleIds;

              this.logger.info('data', `⏭️ Preserving optimistic updates for shared list ${data['name']} (our write ${timeSinceWrite}ms ago)`);
            } else {
              // This is OWNER's write or old data - trust server completely
              finalItemStates = serverItemStates;
              finalArticleIds = serverArticleIds;

              this.logger.debug('data', `📥 Using server state for shared list ${data['name']} (owner's version)`);
            }

            this.sharedLists[index] = {
              ...this.sharedLists[index],
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              itemStates: finalItemStates,
              articleIds: finalArticleIds,
              departmentOrder: data['departmentOrder'],
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              sharedWith: sharedWith
            };

            // REAL-TIME SYNC FIX: Load new articles when owner adds them
            // This fixes Issue #2: Participant can't see owner articles in real-time
            if (newArticleIds.length > 0) {
              this.logger.info('data', `🆕 Detected ${newArticleIds.length} new articles in shared list "${data['name']}", loading them now...`);
              this.logger.debug('data', `New article IDs: ${newArticleIds.join(', ')}`);

              // Load articles for the updated list (will fetch from owner and all participants)
              this.loadArticlesForList(this.sharedLists[index]).catch(error => {
                this.logger.error('data', `Failed to load new articles for ${list.id}:`, error);
              });
            }

            this.mergeLists();
          }
        } else {
          this.logger.warn('data', `Shared list ${list.id} was deleted by owner`);
          this.removeSharedList(list.id);
        }
      },
      (error: any) => {
        this.logger.error('data', `Error in shared list listener for ${list.id}:`, error);
        this.removeSharedList(list.id);
      }
    );

    this.sharedListListeners.set(list.id, unsubscribe);
  }

  /**
   * REAL-TIME SYNC: Set up onSnapshot listeners for owned lists
   *
   * CRITICAL FIX: This solves two major issues:
   * 1. Prevents ALL lists from processing when only ONE list changes
   * 2. Preserves optimistic updates so User A's (owner) checks persist
   *
   * Benefits:
   * - Individual listeners fire ONLY for the changed list (not all lists)
   * - Merge logic prevents race conditions and data loss
   * - Optimistic updates preserved (checks/unchecks persist immediately)
   *
   * Quota Impact:
   * - Initial setup: 1 read per list (one-time cost)
   * - Updates: Only when specific list changes
   * - No more processing all 12 lists when checking one article!
   *
   * NOTE: This method is now DEPRECATED in favor of lazy listeners
   * It's kept for backward compatibility but will not be called in lazy mode
   */
  private setupOwnedListRealtimeListeners(ownedLists: ShoppingList[]): void {
    // Clean up existing listeners first
    this.cleanupOwnedListListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up owned list listeners');
      return;
    }

    this.logger.info('data', `⚡ Setting up real-time listeners for ${ownedLists.length} owned lists (instant sync with merge logic)`);

    // Set up a real-time listener for each owned list
    for (const list of ownedLists) {
      const listRef = doc(this.firestore, `users-v2/${userId}/lists/${list.id}`);

      const unsubscribe = onSnapshot(listRef,
        (snapshot) => {
          this.logger.info('data', `🔔 Owned list listener FIRED for ${list.id} (${list.name})`);

          if (snapshot.exists()) {
            const data = snapshot.data();

            // Update the list in ownedLists array
            const index = this.ownedLists.findIndex(l => l.id === list.id);
            if (index !== -1) {
              // CRITICAL FIX: Read local state from listsSubject (has optimistic updates)
              // NOT from ownedLists array (stale - doesn't have repository's optimistic updates!)
              const currentLists = this.listsSubject.value;
              const currentList = currentLists.find(l => l.id === list.id);

              if (currentList) {
                this.logger.debug('data', `📋 Found currentList with ${currentList.articleIds?.length || 0} articles (vs ownedLists: ${this.ownedLists[index].articleIds?.length || 0})`);
              } else {
                this.logger.warn('data', `⚠️ No currentList found in subject for ${list.id}, falling back to ownedLists array`);
              }

              // CRITICAL FIX: Merge itemStates instead of replacing to prevent race conditions
              // Use currentList (has optimistic updates) not ownedLists[index] (stale)
              const localItemStates = currentList?.itemStates || this.ownedLists[index].itemStates || {};
              const serverItemStates = this.convertItemStatesFromFirestore(data['itemStates'] || {});
              const mergedItemStates = this.mergeItemStates(localItemStates, serverItemStates);

              // CRITICAL FIX: Merge articleIds to prevent added articles from disappearing
              const localArticleIds = currentList?.articleIds || this.ownedLists[index].articleIds || [];
              const serverArticleIds = data['articleIds'] || [];
              const mergedArticleIds = this.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

              // CRITICAL: Prevent infinite loop - check if we just wrote to this list
              const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
              const timeSinceWrite = Date.now() - lastWriteTime;
              const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

              // Check if merge produced different result than server
              const itemStatesChanged = this.hasItemStatesChanged(mergedItemStates, serverItemStates);
              const articleIdsChanged = this.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
              const mergeChanged = itemStatesChanged || articleIdsChanged;

              this.ownedLists[index] = {
                ...this.ownedLists[index],
                name: data['name'],
                color: data['color'],
                icon: data['icon'],
                shopId: data['shopId'],
                itemStates: mergedItemStates, // Use merged version
                articleIds: mergedArticleIds, // Use merged version
                departmentOrder: data['departmentOrder'],
                updatedAt: data['updatedAt']?.toDate() || new Date(),
                sharedWith: data['sharedWith'] || []
              };

              this.logger.debug('data', `⚡ Real-time update for owned list: ${data['name']}`);

              // CRITICAL: Only write back if merge changed AND it's not our own write
              if (mergeChanged && !isOurOwnWrite) {
                this.logger.info('data', `🔄 Merge produced different state, writing back for ${data['name']}`);
                this.lastMergeWrite.set(list.id, Date.now()); // Mark write time
                this.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
                  this.logger.error('data', `Failed to write merged state for ${list.id}:`, error);
                });
              } else if (isOurOwnWrite) {
                this.logger.debug('data', `⏭️ Skipping write-back (our own write, ${timeSinceWrite}ms ago)`);
              }

              this.mergeLists(); // Trigger UI update
            }
          } else {
            // List was deleted
            this.logger.warn('data', `Owned list ${list.id} was deleted`);
            this.removeOwnedList(list.id);
          }
        },
        (error: any) => {
          this.logger.error('data', `Error in owned list listener for ${list.id}:`, error);
        }
      );

      // Store unsubscribe function for cleanup
      this.ownedListListeners.set(list.id, unsubscribe);
    }

    this.ownedListListenersActive = true; // Mark individual listeners as active
    this.logger.info('data', `✅ Real-time listeners active for ${this.ownedListListeners.size} owned lists`);
  }

  /**
   * Clean up all owned list real-time listeners
   */
  private cleanupOwnedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.ownedListListeners.size} owned list listeners`);
    this.ownedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.ownedListListeners.clear();
    this.ownedListListenersActive = false; // Mark individual listeners as inactive
  }

  /**
   * Remove an owned list from the local state
   */
  private removeOwnedList(listId: string): void {
    const index = this.ownedLists.findIndex(l => l.id === listId);
    if (index !== -1) {
      this.ownedLists.splice(index, 1);
      this.mergeLists();
    }

    // Clean up the listener
    const unsubscribe = this.ownedListListeners.get(listId);
    if (unsubscribe) {
      unsubscribe();
      this.ownedListListeners.delete(listId);
    }
  }

  /**
   * REAL-TIME SYNC: Set up onSnapshot listeners for shared lists
   *
   * Benefits over polling:
   * - Instant updates (< 1 second vs 1-5 minutes)
   * - Lower quota when collaborating (only reads on changes)
   * - Better UX (Google Docs-style)
   *
   * Quota Impact:
   * - Initial setup: 1 read per list
   * - Updates: Only when list actually changes
   * - 2 users editing for 1 hour: ~20 reads (vs 60 with polling)
   */
  private setupSharedListRealtimeListeners(sharedLists: ShoppingList[]): void {
    // Clean up existing listeners first
    this.cleanupSharedListListeners();

    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot set up shared list listeners');
      return;
    }

    this.logger.info('data', `⚡ Setting up real-time listeners for ${sharedLists.length} shared lists (instant sync)`);

    // Set up a real-time listener for each shared list
    for (const list of sharedLists) {
      // CRITICAL FIX: Validate ownerId before constructing path to prevent double-slash bug
      if (!list.ownerId) {
        this.logger.error('data', `Skipping shared list listener for ${list.name} (${list.id}): missing ownerId`, {
          listId: list.id,
          listName: list.name,
          ownerId: list.ownerId
        });
        continue;
      }

      const listRef = doc(this.firestore, `users-v2/${list.ownerId}/lists/${list.id}`);

      const unsubscribe = onSnapshot(listRef,
        (snapshot) => {
          this.logger.info('data', `🔔 Shared list listener FIRED for ${list.id} (${list.name})`);

          if (snapshot.exists()) {
            const data = snapshot.data();

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
              // CRITICAL FIX: Check if this is OUR OWN write (collaborator's recent change)
              // If yes, preserve optimistic updates; if no, trust server (owner's version)
              const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
              const timeSinceWrite = Date.now() - lastWriteTime;
              const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

              const serverItemStates = this.convertItemStatesFromFirestore(data['itemStates'] || {});
              const serverArticleIds = data['articleIds'] || [];

              let finalItemStates: { [articleId: string]: any };
              let finalArticleIds: string[];

              if (isOurOwnWrite) {
                // This is OUR write - preserve local optimistic updates
                const currentLists = this.listsSubject.value;
                const currentList = currentLists.find(l => l.id === list.id);

                finalItemStates = currentList?.itemStates || serverItemStates;
                finalArticleIds = currentList?.articleIds || serverArticleIds;

                this.logger.info('data', `⏭️ Preserving optimistic updates for shared list ${data['name']} (our write ${timeSinceWrite}ms ago)`);
              } else {
                // This is OWNER's write or old data - trust server completely
                finalItemStates = serverItemStates;
                finalArticleIds = serverArticleIds;

                this.logger.debug('data', `📥 Using server state for shared list ${data['name']} (owner's version)`);
              }

              this.logger.info('data', `📦 Updating sharedLists[${index}] with ${isOurOwnWrite ? 'local' : 'server'} data: ${Object.keys(finalItemStates).length} items, ${finalArticleIds.length} articles`);

              this.sharedLists[index] = {
                ...this.sharedLists[index],
                name: data['name'],
                color: data['color'],
                icon: data['icon'],
                shopId: data['shopId'],
                itemStates: finalItemStates,
                articleIds: finalArticleIds,
                departmentOrder: data['departmentOrder'],
                updatedAt: data['updatedAt']?.toDate() || new Date(),
                sharedWith: sharedWith
              };

              this.logger.debug('data', `⚡ Real-time update for shared list: ${data['name']} (${Object.keys(finalItemStates).length} items, ${finalArticleIds.length} articles)`);

              this.mergeLists(); // Trigger UI update
              this.logger.info('data', `✅ mergeLists() called, UI should update`);
            } else {
              this.logger.error('data', `❌ List ${list.id} not found in sharedLists array!`);
            }
          } else {
            // List was deleted
            this.logger.warn('data', `Shared list ${list.id} was deleted by owner`);
            this.removeSharedList(list.id);
          }
        },
        (error: any) => {
          // Permission error means list was deleted or user was removed
          this.logger.error('data', `❌ Shared list listener ERROR for ${list.id}:`, error);
          this.removeSharedList(list.id);
        }
      );

      // Store unsubscribe function for cleanup
      this.sharedListListeners.set(list.id, unsubscribe);
    }

    this.logger.info('data', `✅ Real-time listeners active for ${this.sharedListListeners.size} shared lists`);
  }

  /**
   * Clean up all shared list real-time listeners
   */
  private cleanupSharedListListeners(): void {
    this.logger.debug('data', `Cleaning up ${this.sharedListListeners.size} shared list listeners`);
    this.sharedListListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.sharedListListeners.clear();
  }

  /**
   * CRITICAL FIX: Write merged itemStates and articleIds back to Firestore
   * This ensures all collaborators see the merged state after conflict resolution
   */
  private async writeMergedStateToFirestore(
    listId: string,
    ownerId: string,
    mergedItemStates: { [articleId: string]: any },
    mergedArticleIds: string[]
  ): Promise<void> {
    try {
      // CRITICAL FIX: Validate ownerId before constructing path to prevent double-slash bug
      if (!ownerId) {
        this.logger.error('data', `Cannot write merged state for list ${listId}: missing ownerId`, {
          listId: listId,
          ownerId: ownerId
        });
        throw new Error(`Cannot write merged state: missing ownerId for list ${listId}`);
      }

      const listPath = `users-v2/${ownerId}/lists/${listId}`;
      const firestoreItemStates = this.convertItemStatesToFirestore(mergedItemStates);

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

  /**
   * CRITICAL FIX: Update a single list item using Firestore transaction
   * This prevents race conditions where concurrent writes overwrite each other
   *
   * Transaction flow:
   * 1. Read latest server state atomically
   * 2. Merge our change with server state (preserving other users' changes)
   * 3. Write back if changed
   *
   * This fixes the issue where User B's write would overwrite User A's changes
   * because B was using local cache (which didn't have A's changes yet)
   */
  async updateListItemWithTransaction(
    listId: string,
    articleId: string,
    action: 'checked' | 'unchecked',
    amount: string = '',
    userId?: string,
    userName?: string
  ): Promise<void> {
    try {
      const list = this.getCurrentLists().find(l => l.id === listId);
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

        if (!listDoc.exists()) {
          throw new Error(`List ${listId} not found in Firestore`);
        }

        const serverData = listDoc.data();
        const serverItemStates = this.convertItemStatesFromFirestore(serverData['itemStates'] || {});
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
        const firestoreItemStates = this.convertItemStatesToFirestore(mergedItemStates);

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
   * Remove a shared list from the local state
   * Cleans up real-time listener and cached data
   */
  private removeSharedList(listId: string): void {
    const index = this.sharedLists.findIndex(l => l.id === listId);
    if (index !== -1) {
      this.sharedLists.splice(index, 1);
      this.mergeLists();
    }

    // Clean up the real-time listener
    const unsubscribe = this.sharedListListeners.get(listId);
    if (unsubscribe) {
      unsubscribe();
      this.sharedListListeners.delete(listId);
    }

    // Clean up cached data
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
   * QUOTA OPTIMIZATION: Load only owned articles that are on current lists
   * This replaces the Articles collection listener that loads ALL articles (463+)
   * Now we only load articles that are actually needed (~22)
   * Saves ~441 unnecessary reads per session
   */
  private async loadOwnedArticlesByIds(articleIds: string[]): Promise<void> {
    const userId = this.authService.getCurrentUserId();
    if (!userId) {
      this.logger.warn('data', 'No user ID, cannot load owned articles');
      return;
    }

    if (articleIds.length === 0) {
      this.logger.debug('data', 'No article IDs to load');
      return;
    }

    const BATCH_SIZE = 30; // Firestore IN query limit
    const chunks = this.chunkArray(articleIds, BATCH_SIZE);
    const articles: Article[] = [];

    this.logger.info('data', `📦 Loading ${articleIds.length} owned articles in ${chunks.length} batch(es)`);

    // Load all chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      const articlesRef = collection(this.firestore, `users-v2/${userId}/articles`);
      const batchQuery = query(
        articlesRef,
        where(documentId(), 'in', chunk)
      );

      const snapshot = await getDocs(batchQuery);
      this.quotaMonitor.trackRead('Load Owned Articles (Quota Optimized)', snapshot.size, { userId, chunkSize: chunk.length });

      const chunkArticles: Article[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        chunkArticles.push({
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
          ownerId: data['ownerId'] || userId,
          copiedFrom: data['copiedFrom'] || undefined
        });
      });

      return chunkArticles;
    });

    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach(chunkArticles => {
      articles.push(...chunkArticles);
    });

    this.logger.info('data', `✅ Loaded ${articles.length} owned articles (saved ${463 - articles.length} unnecessary reads)`);

    // Store in ownedArticles and merge with shared articles
    this.ownedArticles = articles;
    this.mergeArticles();
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

                // CRITICAL FIX: Always add article if not already found
                // Previous bug: Filtered out owner's articles assuming they're in ownedArticles
                // But with lazy loading, new articles aren't in ownedArticles yet!
                // Solution: Check if already loaded instead of checking ownership
                const alreadyInOwned = this.ownedArticles.find(a => a.id === doc.id);
                const alreadyInShared = allArticles.find(a => a.id === doc.id);

                if (!alreadyInOwned && !alreadyInShared) {
                  // Article not loaded yet - add it
                  allArticles.push(article);
                  foundArticleIds.add(doc.id);

                  // If it's owned by current user, also add to ownedArticles
                  if (article.ownerId === currentUserId) {
                    this.ownedArticles.push(article);
                    this.logger.debug('data', `➕ Added new owned article to ownedArticles: ${article.name}`);
                  }
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
   * CRITICAL FIX: Smart merge of articleIds arrays to prevent race conditions
   * When users add/remove articles simultaneously, this ensures all changes persist correctly
   *
   * Strategy:
   * 1. Use itemStates as source of truth (it has timestamps for conflict resolution)
   * 2. Merge itemStates first (handles check/uncheck/add/remove conflicts)
   * 3. Build articleIds from merged itemStates
   * 4. Preserve original order where possible
   *
   * BUGFIX: Now respects deletions! If an article is removed from itemStates, it's removed from articleIds
   * Previous bug: Simple union meant deleted articles would reappear if server still had them
   */
  private mergeArticleIds(
    localIds: string[],
    serverIds: string[],
    mergedItemStates: { [articleId: string]: any }
  ): string[] {
    // Use merged itemStates as source of truth for which articles should exist
    const articlesFromItemStates = new Set(Object.keys(mergedItemStates));

    // Start with server order as base, but only include articles that are in merged itemStates
    const merged: string[] = [];
    for (const serverId of serverIds) {
      if (articlesFromItemStates.has(serverId)) {
        merged.push(serverId);
        articlesFromItemStates.delete(serverId); // Remove from set to track which ones we've added
      } else {
        this.logger.debug('data', `Merge: Removing ${serverId} (deleted from itemStates)`);
      }
    }

    // Add any remaining articles from local that aren't in server yet
    // (these are new articles added locally)
    for (const localId of localIds) {
      if (articlesFromItemStates.has(localId)) {
        merged.push(localId);
        articlesFromItemStates.delete(localId);
        this.logger.debug('data', `Merge: Adding local-only article ${localId}`);
      }
    }

    // Add any remaining articles from itemStates (shouldn't happen, but be safe)
    for (const remainingId of articlesFromItemStates) {
      merged.push(remainingId);
      this.logger.warn('data', `Merge: Adding orphaned article ${remainingId} from itemStates`);
    }

    this.logger.info('data', `✅ Merged articleIds: ${localIds.length} local + ${serverIds.length} server = ${merged.length} total`);
    return merged;
  }

  /**
   * CRITICAL FIX: Smart merge of itemStates to prevent race conditions
   * When two users check different articles simultaneously, this ensures both changes persist
   *
   * Strategy:
   * 1. For each article, compare timestamps of local vs server
   * 2. Use the history array's first event timestamp (most accurate "last modified" time)
   * 3. If no history, fall back to checkedAt/addedAt timestamps
   * 4. If timestamps equal, prefer server state (last write wins)
   * 5. Preserve all articles from both sources
   *
   * BUGFIX: Now uses history timestamp which is updated for BOTH check and uncheck
   * Previous bug: checkedAt wasn't updated on uncheck, causing uncheck operations to lose
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
      // CRITICAL FIX: Use history timestamp (updated for both check AND uncheck)
      const getTimestamp = (state: any) => {
        // First, try history array (most accurate - updated for both check and uncheck)
        if (state.history && Array.isArray(state.history) && state.history.length > 0) {
          const latestEvent = state.history[0]; // History is sorted newest first
          const timestamp = latestEvent.timestamp;

          if (timestamp instanceof Date) {
            return timestamp.getTime();
          } else if (timestamp?.toMillis) {
            return timestamp.toMillis();
          } else if (timestamp) {
            return new Date(timestamp).getTime();
          }
        }

        // Fallback to checkedAt/addedAt (for backwards compatibility)
        const checkedAt = state.checkedAt;
        const addedAt = state.addedAt;

        const checkedTime = checkedAt instanceof Date ? checkedAt.getTime() :
                           (checkedAt?.toMillis ? checkedAt.toMillis() : 0);
        const addedTime = addedAt instanceof Date ? addedAt.getTime() :
                         (addedAt?.toMillis ? addedAt.toMillis() : 0);

        return checkedTime || addedTime || 0;
      };

      const localTime = getTimestamp(localState);
      const serverTime = getTimestamp(serverState);

      // Use whichever has the most recent change
      if (serverTime > localTime) {
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (server newer: ${serverTime} > ${localTime})`);
      } else if (localTime > serverTime) {
        merged[articleId] = localState;
        this.logger.debug('data', `Merge: Using local state for ${articleId} (local newer: ${localTime} > ${serverTime})`);
      } else {
        // Times equal - prefer SERVER state (most recent write wins)
        // This ensures collaborator changes persist when timestamps are very close
        merged[articleId] = serverState;
        this.logger.debug('data', `Merge: Using server state for ${articleId} (timestamps equal, server wins)`);
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

  /**
   * CRITICAL: Detect if articleIds array has changed
   * Used to prevent infinite loop from write-back triggering listener
   */
  private hasArticleIdsChanged(
    articleIds1: string[],
    articleIds2: string[]
  ): boolean {
    // Different lengths = changed
    if (articleIds1.length !== articleIds2.length) {
      return true;
    }

    // Check if all IDs match (order-sensitive)
    for (let i = 0; i < articleIds1.length; i++) {
      if (articleIds1[i] !== articleIds2[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * CRITICAL FIX: Detect if itemStates have actually changed
   * Used to prevent infinite loop from write-back triggering listener
   *
   * BUGFIX: Only compares USER-FACING state (isChecked, amount, checkedBy)
   * Does NOT compare timestamps (checkedAt, addedAt) which are metadata
   *
   * Why: Merge creates slightly different timestamps even when state is identical
   * This was causing 5x listener fires and 2000 quota reads per session!
   */
  private hasItemStatesChanged(
    itemStates1: { [articleId: string]: any },
    itemStates2: { [articleId: string]: any }
  ): boolean {
    // Quick check: different number of articles
    const keys1 = Object.keys(itemStates1 || {});
    const keys2 = Object.keys(itemStates2 || {});

    if (keys1.length !== keys2.length) {
      this.logger.debug('data', `ItemStates changed: different number of articles (${keys1.length} vs ${keys2.length})`);
      return true;
    }

    // Check each article
    for (const articleId of keys1) {
      const state1 = itemStates1[articleId];
      const state2 = itemStates2[articleId];

      // Article missing in second object
      if (!state2) {
        this.logger.debug('data', `ItemStates changed: article ${articleId} missing in server state`);
        return true;
      }

      // CRITICAL: Only compare USER-FACING state, not timestamps!
      // Timestamps are metadata and differ after merge even when state is identical

      if (state1.isChecked !== state2.isChecked) {
        this.logger.debug('data', `ItemStates changed: ${articleId} isChecked (${state1.isChecked} vs ${state2.isChecked})`);
        return true;
      }

      if (state1.checkedBy !== state2.checkedBy) {
        this.logger.debug('data', `ItemStates changed: ${articleId} checkedBy (${state1.checkedBy} vs ${state2.checkedBy})`);
        return true;
      }

      if (state1.amount !== state2.amount) {
        this.logger.debug('data', `ItemStates changed: ${articleId} amount (${state1.amount} vs ${state2.amount})`);
        return true;
      }

      // REMOVED: Timestamp comparison - this was causing false positives!
      // The merge might produce slightly different timestamps even when state is identical
      // This caused owner to write back unnecessarily, triggering 5x listener fires
    }

    // No differences detected
    this.logger.debug('data', `ItemStates unchanged (no write-back needed)`);
    return false;
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

    // LAZY LISTENERS: Cleanup active list subscription
    if (this.activeListSubscription) {
      this.activeListSubscription.unsubscribe();
      this.activeListSubscription = undefined;
    }

    // REAL-TIME SYNC: Cleanup owned list listeners
    this.cleanupOwnedListListeners();

    // REAL-TIME SYNC: Cleanup shared list listeners
    this.cleanupSharedListListeners();

    // QUOTA OPTIMIZATION: Reset collection listener flags
    // This allows collection listeners to be set up again on next login
    this.logger.info('data', '🔄 cleanupListeners() resetting collection listener flags to FALSE');
    this.collectionListenersCleanedUp = false;
    this.collectionListenersActive = false;

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

    // CRITICAL FIX: Add article to ownedArticles immediately (optimistic update)
    // This prevents timing issues where listener fires before Firestore commits
    const currentUserId = this.authService.getCurrentUserId();
    this.logger.info('data', `🔍 Optimistic update check: currentUserId=${currentUserId}, ownedArticles.length=${this.ownedArticles.length}`);

    if (currentUserId) {
      const newArticle: Article = {
        id: docRef.id,
        name: articleData.name,
        amount: articleData.amount || '',
        notes: articleData.notes || '',
        icon: articleData.icon || '',
        categoryId: articleData.categoryId || '',
        departmentId: articleData.departmentId || '',
        createdAt: articleData.createdAt || new Date(),
        updatedAt: articleData.updatedAt || new Date(),
        availableInShops: articleData.availableInShops || [],
        usageCount: articleData.usageCount || 0,
        ownerId: currentUserId,
        copiedFrom: articleData.copiedFrom
      };

      // Add to ownedArticles if not already there
      const existingArticle = this.ownedArticles.find(a => a.id === docRef.id);
      this.logger.info('data', `🔍 Article already exists? ${!!existingArticle}`);

      if (!existingArticle) {
        this.ownedArticles.push(newArticle);
        this.logger.info('data', `➕ Optimistically added article to ownedArticles: ${newArticle.name} (total: ${this.ownedArticles.length})`);

        // Trigger merge to update UI immediately
        this.mergeArticles();
        this.logger.info('data', `✅ mergeArticles() called - UI should update now`);
      } else {
        this.logger.warn('data', `⚠️ Article ${docRef.id} already in ownedArticles, skipping optimistic update`);
      }
    } else {
      this.logger.error('data', `❌ No currentUserId - optimistic update SKIPPED!`);
    }

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

      // Mark this write so listener knows to preserve optimistic updates
      this.lastMergeWrite.set(id, Date.now());

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