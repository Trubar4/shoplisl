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
import { FirebaseMergeService } from './firebase-merge.service';
import { FirebaseWriteService } from './firebase-write.service';

// DEBUG FLAG - Set to true to enable detailed console logging for debugging Firebase queries and responses
const DEBUG_FIREBASE_DATA = false;

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

  // QUOTA OPTIMIZATION: Rate limit share-invites reloads to prevent excessive reads
  private lastShareInvitesReload = 0;
  private readonly SHARE_INVITES_RELOAD_THROTTLE = 5000; // 5 seconds

  // LAZY LISTENERS: Track active list subscription for cleanup
  private activeListSubscription?: any;

  // QUOTA OPTIMIZATION: Track if collection listeners have been cleaned up
  private collectionListenersCleanedUp = false;

  // QUOTA FIX: Prevent double initialization from constructor + auth listener
  private initialDataLoadDone = false;
  private currentLoadedUserId: string | null = null;

  // QUOTA OPTIMIZATION: Track if collection listeners are currently active
  private collectionListenersActive = false;

  // QUOTA OPTIMIZATION: Prevent concurrent setupRealtimeListeners() calls
  private isSettingUpListeners = false;

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
    private writeService: FirebaseWriteService
  ) {
    this.logger.info('data', 'Firebase Data Service initialized');
    this.initializeDataLoading();
    this.setupAuthListener();
    this.setupActiveListListener();
  }

  /**
   * Listen for auth state changes and reload data when user changes
   * QUOTA FIX: Skip reload if data was already loaded for the same user
   * (prevents double load from constructor's initializeDataLoading + auth listener)
   */
  private setupAuthListener(): void {
    this.authService.getCurrentUser().subscribe(user => {
      if (user) {
        const userId = user.id || user.email || null;
        // QUOTA FIX: Skip if data already loaded for this same user (initial load)
        if (this.initialDataLoadDone && this.currentLoadedUserId === userId) {
          this.logger.info('data', `Auth fired for same user ${user.email} - skipping duplicate load (saves ~500 reads)`);
          return;
        }

        this.logger.info('data', `User changed to ${user.email}, reloading data`);
        // CRITICAL FIX: Cleanup old user's listeners before loading new user's data
        // Without this, old listeners stay active and both users' data loads!
        this.cleanupListeners();
        this.loadFreshData();

        // CRITICAL FIX: Re-setup active list listener after cleanup
        // cleanupListeners() destroys the subscription, so we need to recreate it
        this.setupActiveListListener();

        this.currentLoadedUserId = userId;
      } else {
        this.logger.info('data', 'User logged out, clearing data');
        this.cleanupListeners();
        this.articlesSubject.next([]);
        this.listsSubject.next([]);
        this.currentLoadedUserId = null;
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
      this.logger.info('data', `📍 articlesUnsubscribe exists: ${!!this.articlesUnsubscribe}, listsUnsubscribe exists: ${!!this.listsUnsubscribe}, sharedListsUnsubscribe exists: ${!!this.sharedListsUnsubscribe}`);

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

      // CRITICAL FIX: Clean up Share-Invites listener
      // This listener was causing 200-400 reads per session by continuously firing
      if (this.sharedListsUnsubscribe) {
        this.sharedListsUnsubscribe();
        this.sharedListsUnsubscribe = undefined;
        this.logger.info('data', '✅ Share-invites listener unsubscribed (saves 200-400 reads per session!)');
      } else {
        this.logger.warn('data', '⚠️ Share-invites listener was already undefined - may have been cleaned up elsewhere');
      }

      this.collectionListenersCleanedUp = true;
      this.logger.info('data', '✅ All collection listeners cleanup complete - quota usage should drop by ~80%!');
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
    const isSharedList = list.ownerId !== this.authService.getCurrentUserId();
    const isSharedOwnedList = list.sharedWith && list.sharedWith.length > 0;

    if (!isSharedList && !isSharedOwnedList) {
      this.logger.debug('data', `Skipping article load for private list: ${list.name}`);
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
    const currentUserId = this.authService.getCurrentUserId();
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

      // QUOTA FIX: Mark initial load as done and track current user
      this.initialDataLoadDone = true;
      this.currentLoadedUserId = this.authService.getCurrentUserId();

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
        // Also populate ownedArticles so mergeArticles() doesn't overwrite cached data
        // Filter to only include articles owned by current user
        const currentUserId = this.authService.getCurrentUserId();
        if (currentUserId) {
          this.ownedArticles = articlesCache.data.filter(a => a.ownerId === currentUserId);
          this.sharedArticles = articlesCache.data.filter(a => a.ownerId !== currentUserId);
          this.logger.debug('cache', `Populated from cache: ${this.ownedArticles.length} owned, ${this.sharedArticles.length} shared`);
        }
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

    // QUOTA OPTIMIZATION: Prevent concurrent setup calls (race condition fix)
    // This MUST be checked FIRST, before any other guards
    if (this.isSettingUpListeners) {
      this.logger.info('data', '⏭️  setupRealtimeListeners() already in progress - skipping duplicate call');
      return;
    }

    // QUOTA OPTIMIZATION: Skip if collection listeners are already active
    // This prevents duplicate listener creation on connection restore events
    if (this.collectionListenersActive) {
      this.logger.info('data', '⏭️  Collection listeners already active - skipping recreation to save quota');
      return;
    }

    // Set flag IMMEDIATELY to prevent concurrent calls
    this.isSettingUpListeners = true;

    if (!this.firestore) {
      this.logger.error('data', 'Firestore not initialized');
      this.isSettingUpListeners = false;
      return;
    }

    this.cleanupListeners();

    try {
      const basePath = this.getUserBasePath();

      // QUOTA OPTIMIZATION: Don't load articles at startup anymore.
      // Articles are loaded lazily:
      // - Article overview calls loadAllOwnedArticles() when opened
      // - List detail view uses loadArticlesForList() for per-list loading
      // This saves ~500-1000 reads per session when user doesn't visit article overview.
      this.logger.info('data', '📡 Articles loading deferred (lazy) - will load when article overview is opened');
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
            // BUG 1 FIX: Populate articleIds from itemStates if empty
            // Firebase may return empty articleIds for shared lists, but itemStates is populated
            let articleIds = data['articleIds'] || [];
            const itemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

            if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
              articleIds = Object.keys(itemStates);
              this.logger.debug('data', `Bug 1 Fix: Populated articleIds from itemStates for list ${doc.id} (${articleIds.length} articles)`);
            }

            const sharedWith = data['sharedWith'] || [];
            const list = {
              id: doc.id,
              name: data['name'],
              color: data['color'],
              icon: data['icon'],
              shopId: data['shopId'],
              articleIds: articleIds,
              itemStates: itemStates,
              departmentOrder: data['departmentOrder'],
              createdAt: data['createdAt']?.toDate() || new Date(),
              updatedAt: data['updatedAt']?.toDate() || new Date(),
              // Phase 8: Include ownership and sharing fields
              ownerId: data['ownerId'] || '',
              sharedWith: sharedWith
            };

            // DEBUG: Log shared lists that the owner owns
            if (DEBUG_FIREBASE_DATA && sharedWith.length > 0) {
              this.logger.debug('data', `\n📥 RAW Firebase data for OWNED shared list ${doc.id}`);
              this.logger.debug('data', `   - List name: "${data['name']}"`);
              this.logger.debug('data', `   - Raw articleIds from Firebase: [${(data['articleIds'] || []).join(', ')}]`);
              this.logger.debug('data', `   - Raw articleIds length: ${(data['articleIds'] || []).length}`);
              this.logger.debug('data', `   - Raw itemStates keys: [${Object.keys(data['itemStates'] || {}).join(', ')}]`);
              this.logger.debug('data', `   - Raw itemStates length: ${Object.keys(data['itemStates'] || {}).length}`);
              this.logger.debug('data', `   - Shared with: ${sharedWith.length} users`);
            }

            lists.push(list);
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
        // SAFEGUARD: Prevent duplicate listener setup
        if (this.sharedListsUnsubscribe) {
          this.logger.warn('data', '⚠️ Share-invites listener already active, skipping setup (prevents duplicates)');
        } else {
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
            // CRITICAL MONITORING: Track share-invites listener reads
            // This listener was causing 200-400 reads per session
            this.quotaMonitor.trackRead('Share-Invites Listener', inviteSnapshot.size);
            this.logger.info('data', `🔔 Share-invites listener FIRED: ${inviteSnapshot.size} accepted invites`);
            this.logger.info('data', `📊 This listener should be cleaned up when first list detail is opened`);

            // QUOTA OPTIMIZATION: Throttle rapid-fire reloads
            const now = Date.now();
            if (now - this.lastShareInvitesReload < this.SHARE_INVITES_RELOAD_THROTTLE) {
              this.logger.info('data', `⏭️ Share-invites reload throttled (too soon - ${now - this.lastShareInvitesReload}ms since last reload)`);
              return;
            }
            this.lastShareInvitesReload = now;

            if (DEBUG_FIREBASE_DATA) {
              this.logger.debug('data', '\n🔥 [FIREBASE DEBUG] ========================================');
              this.logger.debug('data', '📡 SHARE INVITES Query Response from Firebase');
              this.logger.debug('data', `   - Query: share-invites where acceptedByUserId == ${userId} AND status == 'accepted'`);
              this.logger.debug('data', `   - Number of accepted invites: ${inviteSnapshot.size}`);
            }

            // Extract list info from invites
            const listIds = new Map<string, string>(); // listId -> ownerId

            inviteSnapshot.forEach((doc) => {
              const data = doc.data();
              const listId = data['listId'];
              const fromUserId = data['fromUserId'];
              if (listId && fromUserId) {
                listIds.set(listId, fromUserId);
                if (DEBUG_FIREBASE_DATA) {
                  this.logger.debug('data', `   - Found invite for list ID: ${listId} (owner: ${fromUserId})`);
                }
              }
            });

            this.logger.info('data', `Loading ${listIds.size} shared lists`);
            if (DEBUG_FIREBASE_DATA) {
              this.logger.debug('data', `\n📥 Loading ${listIds.size} shared lists from Firebase...`);
            }

            // BUG 1 FIX: Use onSnapshot instead of getDoc to avoid permission errors
            // getDoc was failing with "Missing or insufficient permissions" for shared lists
            // onSnapshot works reliably (same as when visiting the list)
            // We unsubscribe immediately after first event to maintain quota optimization
            const sharedLists: ShoppingList[] = [];
            let remainingLists = listIds.size;

            // Handle case where no lists to load
            if (remainingLists === 0) {
              this.sharedLists = [];
              this.logger.info('data', 'No shared lists to load');
              this.mergeLists();
              return;
            }

            for (const [listId, ownerId] of listIds.entries()) {
              const listRef = doc(this.firestore, `users-v2/${ownerId}/lists/${listId}`);

              // Use onSnapshot for initial load (fixes permission error)
              const unsubscribe = onSnapshot(
                listRef,
                (snapshot) => {
                  // Unsubscribe immediately after first event (quota optimization)
                  unsubscribe();

                  // MONITORING: Track shared list initial load
                  this.quotaMonitor.trackRead('Shared List Initial Load', 1, {
                    listId: listId,
                    ownerId: ownerId
                  });

                  if (DEBUG_FIREBASE_DATA) {
                    this.logger.debug('data', `\n📥 Loading shared list ${listId} from Firebase...`);
                    this.logger.debug('data', `   - Query: users-v2/${ownerId}/lists/${listId}`);
                    this.logger.debug('data', `   - Document exists: ${snapshot.exists()}`);
                  }

                  if (snapshot.exists()) {
                    const data = snapshot.data();

                    if (DEBUG_FIREBASE_DATA) {
                      this.logger.debug('data', `\n📥 RAW Firebase data for shared list ${listId}`);
                      this.logger.debug('data', `   - List name: "${data['name']}"`);
                      this.logger.debug('data', `   - Raw articleIds from Firebase: [${(data['articleIds'] || []).join(', ')}]`);
                      this.logger.debug('data', `   - Raw articleIds length: ${(data['articleIds'] || []).length}`);
                      this.logger.debug('data', `   - Raw itemStates keys: [${Object.keys(data['itemStates'] || {}).join(', ')}]`);
                      this.logger.debug('data', `   - Raw itemStates length: ${Object.keys(data['itemStates'] || {}).length}`);
                    }

                    // Verify user is still in sharedWith array
                    const sharedWith = data['sharedWith'] || [];
                    if (sharedWith.includes(userId)) {
                      // BUG 1 FIX: Populate articleIds from itemStates if empty
                      // Firebase may return empty articleIds for shared lists, but itemStates is populated
                      let articleIds = data['articleIds'] || [];
                      const itemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

                      if (DEBUG_FIREBASE_DATA) {
                        this.logger.debug('data', `   - Raw articleIds from Firebase: [${articleIds.join(', ')}]`);
                        this.logger.debug('data', `   - ItemStates keys from Firebase: [${Object.keys(itemStates).join(', ')}]`);
                      }

                      if (articleIds.length === 0 && Object.keys(itemStates).length > 0) {
                        articleIds = Object.keys(itemStates);
                        this.logger.debug('data', `Bug 1 Fix: Populated articleIds from itemStates for shared list ${snapshot.id} (${articleIds.length} articles)`);
                        if (DEBUG_FIREBASE_DATA) {
                          this.logger.debug('data', `🔧 Bug 1 Fix: Populated articleIds from itemStates (${articleIds.length} articles)`);
                        }
                      }

                      const list = {
                        id: snapshot.id,
                        name: data['name'],
                        color: data['color'],
                        icon: data['icon'],
                        shopId: data['shopId'],
                        articleIds: articleIds,
                        itemStates: itemStates,
                        departmentOrder: data['departmentOrder'],
                        createdAt: data['createdAt']?.toDate() || new Date(),
                        updatedAt: data['updatedAt']?.toDate() || new Date(),
                        ownerId: data['ownerId'] || ownerId,
                        sharedWith: sharedWith
                      };

                      if (DEBUG_FIREBASE_DATA) {
                        this.logger.debug('data', `\n📋 Shared List: "${list.name}"`);
                        this.logger.debug('data', `   - List ID: ${list.id}`);
                        this.logger.debug('data', `   - Owner ID: ${list.ownerId}`);
                        this.logger.debug('data', `   - Shared With: ${list.sharedWith?.length || 0} users`);
                        this.logger.debug('data', `   - Article IDs (final): [${list.articleIds.join(', ')}]`);
                        this.logger.debug('data', `   - Total Articles: ${list.articleIds.length}`);
                        this.logger.debug('data', `   - ItemStates keys (final): [${Object.keys(list.itemStates || {}).join(', ')}]`);
                      }

                      sharedLists.push(list);
                      this.logger.debug('data', `Loaded shared list: ${data['name']}`);
                    } else {
                      this.logger.warn('data', `List ${listId} no longer shared with user`);
                      if (DEBUG_FIREBASE_DATA) {
                        this.logger.debug('data', `⚠️  List ${listId} no longer shared with user`);
                      }
                    }
                  } else {
                    this.logger.warn('data', `Shared list ${listId} not found (deleted?)`);
                    if (DEBUG_FIREBASE_DATA) {
                      this.logger.debug('data', `⚠️  Shared list ${listId} not found (deleted?)`);
                    }
                  }

                  // Check if all lists have been processed
                  remainingLists--;
                  if (remainingLists === 0) {
                    // All lists loaded, update store
                    this.sharedLists = sharedLists;
                    this.logger.info('data', `Loaded ${sharedLists.length} shared lists successfully`);
                    if (DEBUG_FIREBASE_DATA) {
                      this.logger.debug('data', `\n✅ All shared lists loaded successfully: ${sharedLists.length} total`);
                      this.logger.debug('data', '🔄 Calling mergeLists() to combine owned and shared lists...');
                    }
                    this.mergeLists();
                  }
                },
                (error: any) => {
                  // Handle error and unsubscribe
                  unsubscribe();
                  this.logger.error('data', `Failed to load shared list ${listId}:`, error);

                  // Continue even if one list fails
                  remainingLists--;
                  if (remainingLists === 0) {
                    this.sharedLists = sharedLists;
                    this.logger.info('data', `Loaded ${sharedLists.length} shared lists successfully`);
                    this.mergeLists();
                  }
                }
              );
            }

            // LAZY LISTENERS: Don't set up listeners for all shared lists anymore
            // Instead, listeners are set up ONLY for the active list (98% quota reduction!)
            // See setupActiveListListener() which subscribes to active list changes
            // this.setupSharedListRealtimeListeners(sharedLists); // DEPRECATED - using lazy listeners now
          },
          (error: any) => {
            this.logger.error('data', 'Share invites listener error', error);
          }
        );
        } // End of else block for duplicate listener check
      } else {
        this.logger.warn('data', 'No user ID available, skipping shared lists listener');
      }

      // QUOTA OPTIMIZATION: Mark collection listeners as active
      // This prevents duplicate listener creation on subsequent calls
      this.collectionListenersActive = true;
      this.isSettingUpListeners = false; // Reset flag - setup complete
      this.logger.info('data', '✅ Collection listeners created and marked as active');
    } catch (error) {
      this.logger.error('data', 'Error setting up listeners', error);
      this.isSettingUpListeners = false; // Reset flag on error too
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

    if (DEBUG_FIREBASE_DATA) {
      this.logger.debug('data', `\n✅ executeMergeLists: ${this.ownedLists.length} owned + ${this.sharedLists.length} shared = ${uniqueLists.length} total → publishing to store`);
    }

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
            const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
            const mergedItemStates = this.mergeService.mergeItemStates(localItemStates, serverItemStates);

            const localArticleIds = currentList?.articleIds || this.ownedLists[index].articleIds || [];
            const serverArticleIds = data['articleIds'] || [];
            const mergedArticleIds = this.mergeService.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

            // Prevent infinite loop - check if we just wrote to this list
            const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
            const timeSinceWrite = Date.now() - lastWriteTime;
            const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

            // Check if merge produced different result than server
            const itemStatesChanged = this.mergeService.hasItemStatesChanged(mergedItemStates, serverItemStates);
            const articleIdsChanged = this.mergeService.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
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
              this.writeService.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
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

            const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});

            let finalItemStates: { [articleId: string]: any };
            let finalArticleIds: string[];

            if (isOurOwnWrite) {
              // This is OUR write - preserve local optimistic updates
              const currentLists = this.listsSubject.value;
              const currentList = currentLists.find(l => l.id === list.id);

              finalItemStates = currentList?.itemStates || serverItemStates;
              finalArticleIds = currentList?.articleIds || serverArticleIds;

              // BUG FIX: Apply Bug 1 Fix even for optimistic updates
              // Populate articleIds from itemStates if empty
              if (finalArticleIds.length === 0 && Object.keys(finalItemStates).length > 0) {
                finalArticleIds = Object.keys(finalItemStates);
                this.logger.debug('data', `Bug 1 Fix (optimistic): Populated articleIds from itemStates for shared list ${data['name']} (${finalArticleIds.length} articles)`);
              }

              this.logger.info('data', `⏭️ Preserving optimistic updates for shared list ${data['name']} (our write ${timeSinceWrite}ms ago)`);
            } else {
              // This is OWNER's write or old data - trust server completely
              finalItemStates = serverItemStates;
              finalArticleIds = serverArticleIds;

              // BUG FIX: Apply Bug 1 Fix to shared list listener
              // Firebase may return empty articleIds for shared lists, but itemStates is populated
              // This ensures participants see correct counts even when articleIds is empty on server
              if (finalArticleIds.length === 0 && Object.keys(finalItemStates).length > 0) {
                finalArticleIds = Object.keys(finalItemStates);
                this.logger.debug('data', `Bug 1 Fix (server): Populated articleIds from itemStates for shared list ${data['name']} (${finalArticleIds.length} articles)`);
              }

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
              const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
              const mergedItemStates = this.mergeService.mergeItemStates(localItemStates, serverItemStates);

              // CRITICAL FIX: Merge articleIds to prevent added articles from disappearing
              const localArticleIds = currentList?.articleIds || this.ownedLists[index].articleIds || [];
              const serverArticleIds = data['articleIds'] || [];
              const mergedArticleIds = this.mergeService.mergeArticleIds(localArticleIds, serverArticleIds, mergedItemStates);

              // CRITICAL: Prevent infinite loop - check if we just wrote to this list
              const lastWriteTime = this.lastMergeWrite.get(list.id) || 0;
              const timeSinceWrite = Date.now() - lastWriteTime;
              const isOurOwnWrite = timeSinceWrite < this.MERGE_WRITE_COOLDOWN;

              // Check if merge produced different result than server
              const itemStatesChanged = this.mergeService.hasItemStatesChanged(mergedItemStates, serverItemStates);
              const articleIdsChanged = this.mergeService.hasArticleIdsChanged(mergedArticleIds, serverArticleIds);
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
                this.writeService.writeMergedStateToFirestore(list.id, userId, mergedItemStates, mergedArticleIds).catch(error => {
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

              const serverItemStates = this.mergeService.convertItemStatesFromFirestore(data['itemStates'] || {});
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
    action: 'checked' | 'unchecked' | 'added',
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

        // CRITICAL: Track transaction read (transactions ALWAYS do a read)
        this.quotaMonitor.trackRead('Transaction Read (Toggle Item)', 1, {
          listId,
          articleId,
          action
        });

        if (!listDoc.exists()) {
          throw new Error(`List ${listId} not found in Firestore`);
        }

        const serverData = listDoc.data();
        const serverItemStates = this.mergeService.convertItemStatesFromFirestore(serverData['itemStates'] || {});
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
        const firestoreItemStates = this.mergeService.convertItemStatesToFirestore(mergedItemStates);

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
   * SAFETY: Update itemStates only using transaction
   * Used for operations that don't modify articleIds (check, uncheck, amount update)
   * Prevents race conditions when multiple users/devices update simultaneously
   */
  async updateItemStatesWithTransaction(
    listId: string,
    itemStateUpdates: { [articleId: string]: any },
    operationDescription: string
  ): Promise<void> {
    try {
      const list = this.getCurrentLists().find(l => l.id === listId);
      if (!list) {
        throw new Error(`List ${listId} not found`);
      }

      const ownerId = list.ownerId;
      if (!ownerId) {
        throw new Error('Cannot determine list owner');
      }

      const listPath = `users-v2/${ownerId}/lists/${listId}`;
      const listRef = doc(this.firestore, listPath);

      this.logger.info('data', `🔒 Starting transaction for ${operationDescription} in ${listPath}`);

      await runTransaction(this.firestore, async (transaction) => {
        // Step 1: Read latest server state
        const listDoc = await transaction.get(listRef);

        // CRITICAL: Track transaction read (transactions ALWAYS do a read)
        this.quotaMonitor.trackRead('Transaction Read (Batch Update)', 1, {
          listId,
          updateCount: Object.keys(itemStateUpdates).length
        });

        if (!listDoc.exists()) {
          throw new Error(`List ${listId} not found in Firestore`);
        }

        const serverData = listDoc.data();
        const serverItemStates = this.mergeService.convertItemStatesFromFirestore(serverData['itemStates'] || {});

        this.logger.debug('data', `📖 Transaction read: ${Object.keys(serverItemStates).length} items on server`);

        // Step 2: Merge our updates with server state
        const mergedItemStates = {
          ...serverItemStates,  // Keep ALL server items
          ...itemStateUpdates   // Apply our updates
        };

        // Step 3: Write merged state back
        const firestoreItemStates = this.mergeService.convertItemStatesToFirestore(mergedItemStates);

        this.logger.info('data', `💾 Transaction writing: ${Object.keys(mergedItemStates).length} items (updated ${Object.keys(itemStateUpdates).length})`);

        transaction.update(listRef, {
          itemStates: firestoreItemStates,
          updatedAt: Timestamp.now()
        });
      });

      this.logger.info('data', `✅ Transaction committed successfully for ${operationDescription}`);
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

    this.logger.info('data', `✅ Loaded ${articles.length} owned articles from Firestore`);

    // Merge newly loaded articles with existing ownedArticles (preserves cached articles)
    const existingIds = new Set(this.ownedArticles.map(a => a.id));
    const newArticles = articles.filter(a => !existingIds.has(a.id));

    if (newArticles.length > 0) {
      this.ownedArticles = [...this.ownedArticles, ...newArticles];
      this.logger.info('data', `📦 Merged ${newArticles.length} new articles with ${existingIds.size} cached → ${this.ownedArticles.length} total owned`);
    }

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
    this.isSettingUpListeners = false;

    // QUOTA FIX: Reset initialization tracking (allows reload after user switch)
    this.initialDataLoadDone = false;
    this.articlesLoadedFromFirestore = false;

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

  /**
   * QUOTA OPTIMIZATION: Load all owned articles on demand.
   * Called by article overview when it opens, instead of loading at startup.
   * Uses loadOwnedArticlesByIds with IDs from current lists.
   * Skips if articles are already loaded from a previous call this session.
   */
  private articlesLoadedFromFirestore = false;

  loadAllOwnedArticles(): void {
    // Skip if already loaded this session (prevents re-loading on navigation)
    if (this.articlesLoadedFromFirestore) {
      this.logger.info('data', '⏭️ Articles already loaded from Firestore this session - skipping');
      return;
    }

    const lists = this.listsSubject.value;
    if (lists.length === 0) {
      this.logger.info('data', '⏳ No lists available yet - deferring article load');
      // Wait for lists to load, then load articles
      const sub = this.listsSubject.subscribe(loadedLists => {
        if (loadedLists.length > 0) {
          sub.unsubscribe();
          this.loadAllOwnedArticles(); // Retry
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

    // QUOTA OPTIMIZATION: Check if cache is fresh and complete
    // If cache has all needed articles and isn't expired, skip Firestore entirely
    const articlesCache = this.cacheService.getCachedArticles();
    const existingArticles = this.articlesSubject.value;
    const existingArticleIds = new Set(existingArticles.map(a => a.id));
    const missingArticleIds = Array.from(articleIdsOnLists).filter(id => !existingArticleIds.has(id));

    // If cache is fresh (not expired) and has all articles, skip Firestore
    if (!articlesCache.status.isExpired && missingArticleIds.length === 0) {
      this.articlesLoadedFromFirestore = true;
      const cacheAge = this.cacheService.formatAge(articlesCache.status.age);
      this.logger.info('data', `⏭️ Fresh cache has all ${articleIdsOnLists.size} articles (age: ${cacheAge}) - skipping Firestore (saves ${articleIdsOnLists.size} reads)`);
      // Ensure ownedArticles is populated from cache for mergeArticles() to work
      this.ensureOwnedArticlesFromCache();
      return;
    }

    this.articlesLoadedFromFirestore = true;

    // CRITICAL: Always ensure ownedArticles/sharedArticles are populated from cache
    // This prevents mergeArticles() from overwriting cached articles with empty arrays
    this.ensureOwnedArticlesFromCache();

    if (missingArticleIds.length === 0) {
      this.logger.info('data', `⏭️ All ${articleIdsOnLists.size} articles already in cache - skipping Firestore load`);
      return;
    }

    // Cache is expired or incomplete - load missing articles from Firestore
    const reason = articlesCache.status.isExpired ? 'cache expired' : 'missing articles';
    this.logger.info('data', `📦 Loading ${missingArticleIds.length} articles from Firestore (${reason}, ${existingArticleIds.size} cached, ${articleIdsOnLists.size} total needed)`);
    this.loadOwnedArticlesByIds(missingArticleIds);
  }

  /**
   * Ensure ownedArticles array is populated from articlesSubject
   * This is needed when cache loads before auth is ready
   */
  private ensureOwnedArticlesFromCache(): void {
    if (this.ownedArticles.length > 0) return; // Already populated

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) return;

    const allArticles = this.articlesSubject.value;
    this.ownedArticles = allArticles.filter(a => a.ownerId === currentUserId);
    this.sharedArticles = allArticles.filter(a => a.ownerId !== currentUserId);
    this.logger.debug('data', `📦 Populated from articlesSubject: ${this.ownedArticles.length} owned, ${this.sharedArticles.length} shared`);
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
      firestoreData.itemStates = this.mergeService.convertItemStatesToFirestore(firestoreData.itemStates);
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
        firestoreData.itemStates = this.mergeService.convertItemStatesToFirestore(firestoreData.itemStates);
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
    // 🚨 CRITICAL FIX: This method loads ALL articles (485 reads) and should NEVER run in normal usage
    // It's being called from loadDataEmergency() which shouldn't be needed with realtime listeners
    this.logger.error('data', '🚨🚨🚨 getAllArticlesFromFirebase() CALLED - THIS IS EXPENSIVE! 🚨🚨🚨');
    this.logger.error('data', '📍 Stack trace:');
    console.trace();
    this.logger.error('data', '🚨 This method loads ALL 485 articles and wastes quota!');
    this.logger.error('data', '🚨 Returning empty array to prevent reads.');
    this.logger.error('data', '🚨 If something breaks, check the stack trace above to see what needs fixing.');

    // Track that this was called (for debugging)
    this.quotaMonitor.trackRead('getAllArticlesFromFirebase (BLOCKED)', 0, {
      blocked: true,
      message: 'This expensive method was blocked to prevent quota waste'
    });

    // Return empty array instead of reading from Firestore
    return [];

    /* ORIGINAL CODE DISABLED TO PREVENT QUOTA WASTE:
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
    */
  }

  /**
   * Load all articles for a specific user
   * Used by cleanup scripts to load collaborator articles
   */
  async getArticlesForUser(userId: string): Promise<Article[]> {
    if (!this.firestore) throw new Error('Firestore not initialized');
    const snapshot = await getDocs(collection(this.firestore, `users-v2/${userId}/articles`));
    this.quotaMonitor.trackRead('Get Articles For User', snapshot.size, { userId });
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
        ownerId: data['ownerId'] || userId,
        copiedFrom: data['copiedFrom'] || undefined
      });
    });
    return articles;
  }

  async getAllListsFromFirebase(): Promise<ShoppingList[]> {
    // 🚨 CRITICAL FIX: This method loads ALL lists and should NEVER run in normal usage
    this.logger.error('data', '🚨🚨🚨 getAllListsFromFirebase() CALLED - THIS IS EXPENSIVE! 🚨🚨🚨');
    this.logger.error('data', '📍 Stack trace:');
    console.trace();
    this.logger.error('data', '🚨 This method loads ALL lists and wastes quota!');
    this.logger.error('data', '🚨 Returning empty array to prevent reads.');

    this.quotaMonitor.trackRead('getAllListsFromFirebase (BLOCKED)', 0, {
      blocked: true,
      message: 'This expensive method was blocked to prevent quota waste'
    });

    return [];

    /* ORIGINAL CODE DISABLED:
    if (!this.firestore) throw new Error('Firestore not initialized');
    const basePath = this.getUserBasePath();
    const snapshot = await getDocs(collection(this.firestore, `${basePath}/lists`));
    this.quotaMonitor.trackRead('Get All Lists', snapshot.size);
    const currentUserId = this.authService.getCurrentUserId();
    const lists: ShoppingList[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();

      // BUG FIX: Apply Bug 1 Fix during initial load for shared lists
      // Firebase may return empty articleIds for shared lists, but itemStates is populated
      // This ensures participants see correct counts even when articleIds is empty on server
      let articleIds = data['articleIds'] || [];
      const itemStates = data['itemStates'] || {};
      const ownerId = data['ownerId'] || '';
      const isSharedList = currentUserId && ownerId !== currentUserId;

      if (isSharedList && articleIds.length === 0 && Object.keys(itemStates).length > 0) {
        articleIds = Object.keys(itemStates);
        this.logger.debug('data', `Bug 1 Fix (initial load): Populated articleIds from itemStates for shared list "${data['name']}" (${articleIds.length} articles)`);
      }

      lists.push({
        id: doc.id,
        name: data['name'],
        color: data['color'],
        icon: data['icon'],
        shopId: data['shopId'],
        articleIds,
        itemStates,
        departmentOrder: data['departmentOrder'],
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date(),
        ownerId,
        sharedWith: data['sharedWith'] || []  // Phase 8: Include sharedWith
      });
    });
    return lists;
    */
  }

  // === EMERGENCY & UTILITY ===

  async loadDataEmergency(): Promise<void> {
    this.logger.warn('data', 'Emergency data loading triggered');

    // QUOTA FIX: Try cached data first - this is the primary path
    this.logger.debug('data', 'Trying cached data first');
    this.loadCachedData();

    const cachedArticles = this.articlesSubject.value;
    const cachedLists = this.listsSubject.value;

    if (cachedArticles.length > 0 || cachedLists.length > 0) {
      this.logger.info('data', `Loaded from cache: ${cachedArticles.length} articles, ${cachedLists.length} lists`);
      return;
    }

    // QUOTA FIX: If cache is empty and we're online, use setupRealtimeListeners()
    // which will load data through the optimized quota-saving flow
    // (Don't call getAllArticlesFromFirebase() which is expensive and now blocked)
    if (this.connectionService.isOnline() && this.firestore) {
      this.logger.info('data', 'Cache empty - setting up listeners to load fresh data');
      this.setupRealtimeListeners();
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
      // QUOTA FIX: setupRealtimeListeners() already loads data through its listeners
      // No need for additional getDocs() calls - that was reading articles TWICE!
      this.setupRealtimeListeners();
      this.logger.info('data', `Refresh triggered - listeners will load fresh data`);
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